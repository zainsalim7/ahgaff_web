"""
🔎 تصنيف عمليات API إلى 6 فئات (المرحلة 7-ه، البند أولًا) - قراءة فقط، لا تعديل على أي كود/بيانات.
يُعيد استخدام بنية الوحدات (modules) من scan_api_endpoints_v2.py، ويضيف فحص أنماط "الملكية/النطاق
الذاتي" (current_user مقارَنًا بقيمة ديناميكية، أو فلتر MongoDB يحوي current_user) لتمييز الفئة B.
"""
import ast
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scan_api_endpoints_v2 import (  # noqa: E402
    build_module_tables, resolve_module_symtabs, _router_prefix, _decorator_info,
    _auth_kind, HTTP_METHODS, ROUTES_DIR, BACKEND_DIR, OUT_DIR, GATE_FUNC_NAMES,
)


def _contains_current_user_ref(node) -> bool:
    for n in ast.walk(node):
        if isinstance(n, ast.Name) and n.id in ("current_user", "user", "ctx_user", "ctx"):
            return True
    return False


def _has_ownership_pattern(func_node) -> list:
    """يبحث عن: (أ) مقارنة current_user[...] بقيمة ديناميكية غير ثابتة، (ب) فلتر MongoDB يحوي current_user
    كقيمة (مثل {"user_id": current_user["id"]})، (ج) اسم/مسار يوحي بذاتية العملية (/me, my_, profile)."""
    evidence = []
    for node in ast.walk(func_node):
        if isinstance(node, ast.Compare):
            left_has_cu = _contains_current_user_ref(node.left) and isinstance(node.left, (ast.Subscript, ast.Call, ast.Attribute))
            right_is_dynamic = not (len(node.comparators) == 1 and isinstance(node.comparators[0], ast.Constant))
            right_has_cu = any(_contains_current_user_ref(c) for c in node.comparators)
            if (left_has_cu and right_is_dynamic) or right_has_cu:
                # استبعاد فحص الأدمن الثابت (role != "admin") الذي يُصنَّف بالفعل admin_only
                dumped = ast.dump(node)
                if '"admin"' not in dumped and "'admin'" not in dumped:
                    evidence.append("ownership_compare")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in (
            "find", "find_one", "update_one", "update_many", "delete_one", "delete_many", "count_documents",
        ):
            for arg in node.args:
                if isinstance(arg, ast.Dict):
                    for v in arg.values:
                        if _contains_current_user_ref(v):
                            evidence.append("mongo_filter_by_current_user")
    return sorted(set(evidence))


def _self_path_or_name_hint(path, func_name) -> bool:
    return "/me" in path or func_name.startswith("my_") or "_me_" in f"_{func_name}_" or "profile" in func_name.lower()


def _depends_factory_gate(func_node) -> list:
    """يكتشف نمط Depends(factory_func(...)) في القيم الافتراضية لمعاملات الدالة (فحص تفويض خاص بالنظام
    الجديد نفسه لإدارة أدواته - مثل require_adv_access/_require_admin) - تحقَّق أن الدالة المصنعية تُنتج
    حارسًا يرفع HTTPException فعليًا عند الرفض، وليس مجرد اسم بلا إنفاذ."""
    found = []
    for default in func_node.args.defaults + func_node.args.kw_defaults:
        if default is None:
            continue
        if isinstance(default, ast.Call) and isinstance(default.func, ast.Name) and default.func.id == "Depends":
            if default.args and isinstance(default.args[0], ast.Call) and isinstance(default.args[0].func, ast.Name):
                found.append(default.args[0].func.id)
    return found


KNOWN_SELF_GATE_FACTORIES = {"require_adv_access", "_require_admin"}


def _build_enum_map(class_name):
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models", "permissions.py")
    with open(path, "r", encoding="utf-8") as f:
        tree = ast.parse(f.read(), filename=path)
    enum_map = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            for stmt in node.body:
                if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name):
                    if isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, str):
                        enum_map[stmt.targets[0].id] = stmt.value.value
    return enum_map


USER_ROLE_ENUM_MAP = _build_enum_map("UserRole")


def _const_role_value(node):
    """يحلّ عنصرًا إلى اسم دور نصّي: إمّا Constant حرفي أو UserRole.ATTR."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id == "UserRole":
        return USER_ROLE_ENUM_MAP.get(node.attr)
    return None


ROLE_NAMES = {
    "admin", "university_president", "dean", "department_head", "teacher", "student",
    "employee", "registrar", "hr_manager", "finance_manager", "secretary", "registration_manager",
}


def _is_role_compare(node) -> bool:
    """يطابق أنماط X.get('role')==/!='admin' أو X['role'] in (...) أو X.get('role') in [UserRole.DEAN,...]."""
    if not isinstance(node, ast.Compare):
        return False
    left = node.left
    left_is_role_access = (
        (isinstance(left, ast.Subscript) and isinstance(left.slice, (ast.Constant, ast.Index)) and
         getattr(left.slice, "value", getattr(getattr(left.slice, "value", None), "value", None)) == "role") or
        (isinstance(left, ast.Call) and isinstance(left.func, ast.Attribute) and left.func.attr == "get" and
         left.args and isinstance(left.args[0], ast.Constant) and left.args[0].value == "role")
    )
    if not left_is_role_access:
        return False
    for op, comp in zip(node.ops, node.comparators):
        if isinstance(op, (ast.Eq, ast.NotEq)):
            v = _const_role_value(comp)
            if v in ROLE_NAMES:
                return True
        if isinstance(op, (ast.In, ast.NotIn)) and isinstance(comp, (ast.Tuple, ast.List, ast.Set)):
            vals = [_const_role_value(e) for e in comp.elts]
            if vals and all(v in ROLE_NAMES for v in vals):
                return True
    return False


def _function_has_role_check(func_node) -> bool:
    return any(_is_role_compare(n) for n in ast.walk(func_node))


def _detect_role_based_helper(func_node, module_label, modules, func_defs, visited=None, depth=0) -> list:
    """يكتشف فحوصات الأدوار المباشرة (current_user['role']=='admin') أو عبر دوال مساعدة محلية (مثل
    is_admin(user) في fee_receipts.py) - بحث تكراري محدود العمق (4) يمنع الحلقات."""
    visited = visited or set()
    if depth > 4:
        return []
    found = []
    if _function_has_role_check(func_node):
        found.append("inline_role_compare")
    for node in ast.walk(func_node):
        if isinstance(node, ast.Call):
            name = None
            if isinstance(node.func, ast.Name):
                name = node.func.id
            elif isinstance(node.func, ast.Attribute):
                name = node.func.attr
            if not name or name in GATE_FUNC_NAMES or name in ("Depends", "get_current_user"):
                continue
            mod = modules.get(module_label)
            target_label, target_name = module_label, name
            if mod and name in mod["imports"]:
                target_label, target_name = mod["imports"][name]
            if (target_label, target_name) in visited:
                continue
            callee = func_defs.get(target_label, {}).get(target_name)
            if callee is None:
                continue
            sub = _detect_role_based_helper(callee, target_label, modules, func_defs, visited | {(target_label, target_name)}, depth + 1)
            if sub:
                found.append(f"via_helper:{name}")
    return sorted(set(found))


CONTEXT_PERM_METHODS = {"can", "has_perm_anywhere", "has_perm", "is_allowed", "check_access", "can_view", "can_manage"}


def _function_has_custom_ctx_gate(func_node) -> list:
    evidence = []
    for node in ast.walk(func_node):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in CONTEXT_PERM_METHODS:
            if isinstance(node.func.value, ast.Name):
                evidence.append(f"{node.func.value.id}.{node.func.attr}()")
        if isinstance(node, ast.Attribute) and node.attr in ("is_super", "is_admin") and isinstance(node.value, ast.Name):
            evidence.append(f"{node.value.id}.{node.attr}")
    return sorted(set(evidence))


def _detect_custom_context_gate(func_node, module_label=None, modules=None, func_defs=None, visited=None, depth=0) -> list:
    """يكتشف أنظمة تفويض مخصَّصة بالوحدة (مثل CorrContext.can()/has_perm_anywhere() في وحدة المراسلات) -
    نمط عام: Attribute Call على كائن سياق (ctx.X(...)) ضمن شرط يرفع HTTPException، أو خاصية is_super/is_admin
    على كائن السياق نفسه. يتتبّع أيضًا دوال مساعدة محلية تستدعيها الدالة (مثل _editable(db, ctx, ...))
    التي تُمرَّر إليها نفس كائن السياق وتحتوي الفحص الفعلي داخلها."""
    visited = visited or set()
    modules = modules or {}
    func_defs = func_defs or {}
    found = _function_has_custom_ctx_gate(func_node)
    if depth > 4 or module_label is None:
        return found
    for node in ast.walk(func_node):
        if not isinstance(node, ast.Call):
            continue
        name = None
        if isinstance(node.func, ast.Name):
            name = node.func.id
        elif isinstance(node.func, ast.Attribute):
            name = node.func.attr
        if not name:
            continue
        calls_with_ctx = any(isinstance(a, ast.Name) and a.id in ("ctx", "ctx_user") for a in node.args)
        if not calls_with_ctx:
            continue
        mod = modules.get(module_label)
        target_label, target_name = module_label, name
        if mod and name in mod["imports"]:
            target_label, target_name = mod["imports"][name]
        if (target_label, target_name) in visited:
            continue
        callee = func_defs.get(target_label, {}).get(target_name)
        if callee is None:
            continue
        sub = _detect_custom_context_gate(callee, target_label, modules, func_defs, visited | {(target_label, target_name)}, depth + 1)
        if sub:
            found.append(f"via_helper:{name}")
    return sorted(set(found))


def _detect_generic_403_gate(func_node) -> bool:
    """خط دفاع أخير عام: أي شرط ينفي نتيجة استدعاء دالة (`if not helper(...): raise HTTPException(403,...)`)
    يُعتبر بنية تحقق تفويض حقيقية حتى لو كان اسم الدالة غير معروف مسبقًا (الكود يستخدم عشرات الأسماء
    المختلفة لنفس الفكرة: is_admin, _can_decide, check_notification_permission...). لا يحدّد *ماذا* تتحقق
    هذه الدالة فعليًا - فقط يثبت أن بنية 403 الشرطية موجودة، ويبقى يستحق تسمية الدالة وتدقيقها يدويًا لاحقًا."""
    for node in ast.walk(func_node):
        if not isinstance(node, ast.If):
            continue
        test = node.test
        has_not_call = (
            (isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not) and isinstance(test.operand, ast.Call)) or
            (isinstance(test, ast.Call))
        )
        if not has_not_call:
            continue
        body_src = ast.dump(ast.Module(body=node.body, type_ignores=[]))
        if "HTTPException" in body_src and ("403" in body_src or "401" in body_src):
            return True
    return False


def main():
    all_files = {}
    for fname in sorted(os.listdir(ROUTES_DIR)):
        if fname.endswith(".py") and not fname.startswith("__"):
            all_files[f"routes/{fname}"] = os.path.join(ROUTES_DIR, fname)
    all_files["server"] = os.path.join(BACKEND_DIR, "server.py")

    modules = build_module_tables(all_files)
    modules = resolve_module_symtabs(modules)

    func_defs = {}
    for label, mod in modules.items():
        func_defs[label] = {}
        for node in mod["tree"].body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                func_defs[label][node.name] = node

    with open(os.path.join(OUT_DIR, "api_endpoints_scan_v2.json"), "r", encoding="utf-8") as f:
        scan = json.load(f)
    scan_index = {(e["file"], e["function"], e["line"]): e for e in scan}

    categories = {"A": [], "B": [], "C": [], "D": [], "E": [], "F": []}

    for label, mod in modules.items():
        tree = mod["tree"]
        for node in ast.walk(tree):
            if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
                continue
            is_endpoint = False
            for dec in node.decorator_list:
                info = _decorator_info(dec)
                if info:
                    is_endpoint = True
                    break
            if not is_endpoint:
                continue
            key = (label, node.name, node.lineno)
            scan_entry = scan_index.get(key)
            if scan_entry is None:
                continue
            auth_kind = scan_entry["auth_kind"]
            path = scan_entry["path"]
            method = scan_entry["method"]
            evidence = {"file": label, "function": node.name, "method": method, "path": path, "line": node.lineno}

            if auth_kind == "service_key_auth":
                evidence["reason"] = "مصادقة خادم-لخادم بمفتاح خدمة (service key)، ليست عملية مستخدم بشري"
                categories["D"].append(evidence)
                continue
            if auth_kind == "public":
                evidence["reason"] = "لا يتطلب تسجيل دخول إطلاقًا (عام بالتصميم)"
                categories["C"].append(evidence)
                continue

            legacy_detected = bool(scan_entry["legacy_permissions_detected"])
            if legacy_detected:
                evidence["reason"] = f"صلاحية قديمة مكتشفة ومطابقة: {scan_entry['legacy_permissions_detected']}"
                evidence["legacy_keys"] = scan_entry["legacy_permissions_detected"]
                categories["A"].append(evidence)
                continue

            if scan_entry["admin_only_detected"]:
                evidence["reason"] = 'فحص هوية مباشر: current_user["role"] != "admin"'
                categories["B"].append(evidence)
                continue

            role_check_evidence = _detect_role_based_helper(node, label, modules, func_defs)
            if role_check_evidence:
                evidence["reason"] = f"فحص دور مباشر أو عبر دالة مساعدة محلية (مثل is_admin/FULL_TYPES_ROLES): {role_check_evidence}"
                categories["B"].append(evidence)
                continue

            custom_ctx_evidence = _detect_custom_context_gate(node, label, modules, func_defs)
            if custom_ctx_evidence:
                evidence["reason"] = f"نظام تفويض مخصَّص بالوحدة (سياق can()/has_perm_anywhere()): {custom_ctx_evidence}"
                categories["B"].append(evidence)
                continue

            depends_factories = _depends_factory_gate(node)
            self_gate = [f for f in depends_factories if f in KNOWN_SELF_GATE_FACTORIES]
            if self_gate:
                evidence["reason"] = f"محمي بآلية تفويض خاصة بالنظام الجديد نفسه (Depends({self_gate[0]}(...)) — دالة مُصنِّعة تُثبِت أنها ترفع HTTPException فعليًا عند الرفض، تحقَّق يدويًا من الكود): {self_gate}"
                categories["B"].append(evidence)
                continue

            has_scope_check = any(
                u["gate_function"] == "assert_in_scope" for u in scan_entry.get("unresolved_dynamic_refs", [])
            ) or any(d["gate_function"] == "assert_in_scope" for d in scan_entry.get("resolution_detail", []))
            if has_scope_check:
                evidence["reason"] = "فحص نطاق إداري/أكاديمي ديناميكي (assert_in_scope) على معرّف حقيقي وقت التشغيل"
                categories["B"].append(evidence)
                continue

            ownership_evidence = _has_ownership_pattern(node)
            if ownership_evidence:
                evidence["reason"] = f"فحص ملكية/نطاق ذاتي مكتشَف: {ownership_evidence}"
                evidence["evidence_types"] = ownership_evidence
                categories["B"].append(evidence)
                continue

            if _detect_generic_403_gate(node):
                evidence["reason"] = "بنية تحقق تفويض شرطية مؤكَّدة (if not <دالة غير مسمّاة مسبقًا>: raise HTTPException 403/401) — يرفع 403 فعليًا بناءً على نتيجة دالة؛ اسم الدالة ومنطقها الداخلي يستحقان تسمية وتدقيقًا يدويًا لاحقًا، لكنها ليست غيابًا للتحقق"
                categories["B"].append(evidence)
                continue

            if _self_path_or_name_hint(path, node.name) and method == "GET":
                evidence["reason"] = "نمط مسار/اسم ذاتي (/me أو my_*) بلا أي فحص ملكية صريح مكتشَف بالكود — يحتاج تأكيدًا يدويًا"
                categories["E"].append(evidence)
                continue

            if scan_entry.get("unresolved_dynamic_refs"):
                evidence["reason"] = f"محاولة تحقق ديناميكية تعذّر حلّها: {scan_entry['unresolved_dynamic_refs']}"
                categories["E"].append(evidence)
                continue

            evidence["reason"] = "لا صلاحية قديمة، لا فحص أدمن، لا فحص نطاق، لا نمط ملكية مكتشَف — تسجيل دخول فقط"
            categories["F"].append(evidence)

    print("=" * 60)
    for k, label in [
        ("A", "محمية بصلاحية قديمة مكتشفة ومطابقة"),
        ("B", "محمية بآلية أخرى (هوية/ملكية/نطاق)"),
        ("C", "عملية عامة لا تتطلب صلاحية خاصة"),
        ("D", "عملية داخلية بين الأنظمة (مفتاح خدمة)"),
        ("E", "عملية تعذّر تحليلها آليًا"),
        ("F", "عملية تفتقر إلى تحقق أمني مناسب"),
    ]:
        print(f"{k} - {label}: {len(categories[k])}")
    print("TOTAL:", sum(len(v) for v in categories.values()))

    with open(os.path.join(OUT_DIR, "phase7e_classification.json"), "w", encoding="utf-8") as f:
        json.dump(categories, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
