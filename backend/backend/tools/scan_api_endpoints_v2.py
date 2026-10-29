"""
🔎 ماسح واجهات API - الإصدار 2 (المرحلة 7-د)
يحل محدودية الإصدار 1 (مطابقة نصية/regex فقط): يستخدم AST + تتبّع مراجع (constant propagation) عبر
الملفات لاكتشاف فحوصات الصلاحيات التي تمر عبر متغيرات اختصار محلية (مثل P_ATTEND في routes/hr_common.py)،
قوائم/قواميس (مثل SECTION_PERMS)، واستيراد هذه المتغيرات بين الملفات.
لا يُعدِّل أي كود قديم - قراءة فقط. الإصدار 1 (scan_api_endpoints.py) محفوظ كما هو دون مساس.
يُنتج tools/generated/api_endpoints_scan_v2.json بنفس بنية الإصدار 1 + حقول إضافية:
  legacy_permissions_detected : كل المفاتيح المكتشفة (مباشر + غير مباشر محلول) - يحل محل حقل الإصدار 1
  resolution_detail           : تفاصيل كل اكتشاف (الثقة + دليل الإنفاذ الأمني الفعلي)
  unresolved_dynamic_refs     : مراجع تعذّر حلّها (تحتاج مراجعة يدوية - لم تُخمَّن قيمتها إطلاقًا)
"""
import ast
import json
import os

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTES_DIR = os.path.join(BACKEND_DIR, "routes")
MODELS_DIR = os.path.join(BACKEND_DIR, "models")
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "generated")
os.makedirs(OUT_DIR, exist_ok=True)

HTTP_METHODS = {"get", "post", "put", "delete", "patch"}
GATE_FUNC_NAMES = {
    "require_permission", "has_permission", "has_any_permission", "_guard", "_guard_any",
    "assert_in_scope", "check_permission", "_can", "_can_view", "_can_manage",
}


# ══════════════ 1) خريطة Permission.ATTR -> "قيمة" من models/permissions.py ══════════════

def build_permission_enum_map():
    path = os.path.join(MODELS_DIR, "permissions.py")
    with open(path, "r", encoding="utf-8") as f:
        source = f.read()
    tree = ast.parse(source, filename=path)
    enum_map = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "Permission":
            for stmt in node.body:
                if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name):
                    if isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, str):
                        enum_map[stmt.targets[0].id] = stmt.value.value
    return enum_map


PERMISSION_ENUM_MAP = build_permission_enum_map()


# ══════════════ 2) محلّل التعبيرات: يحول أي تعبير AST إلى (قيمة مُحلولة أو "غير قابل للحل") ══════════════

class Unresolved:
    def __init__(self, reason):
        self.reason = reason

    def __repr__(self):
        return f"Unresolved({self.reason})"


def resolve_expr(node, symtab):
    """يرجع: str واحد | list[str] | Unresolved. لا يُخمِّن أبدًا - أي غموض يُصنَّف Unresolved صراحةً."""
    if node is None:
        return Unresolved("empty")
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id == "Permission":
        return PERMISSION_ENUM_MAP.get(node.attr, Unresolved(f"Permission.{node.attr}_unknown_attr"))
    if isinstance(node, ast.Name):
        if node.id in symtab:
            return symtab[node.id]
        return Unresolved(f"name_{node.id}_not_in_symtab")
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        out = []
        for elt in node.elts:
            r = resolve_expr(elt, symtab)
            if isinstance(r, Unresolved):
                out.append(r)
            elif isinstance(r, list):
                out.extend(r)
            else:
                out.append(r)
        return out
    if isinstance(node, ast.Dict):
        out = []
        for v in node.values:
            r = resolve_expr(v, symtab)
            if isinstance(r, list):
                out.extend(r)
            elif not isinstance(r, Unresolved):
                out.append(r)
        return out if out else Unresolved("dict_values_unresolved")
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left = resolve_expr(node.left, symtab)
        right = resolve_expr(node.right, symtab)
        if isinstance(left, str) and isinstance(right, str):
            return left + right
        return Unresolved("binop_add_not_both_str")
    if isinstance(node, ast.Call):
        return Unresolved("call_expr_dynamic")
    if isinstance(node, ast.JoinedStr):
        return Unresolved("fstring_dynamic")
    if isinstance(node, ast.Subscript):
        return Unresolved("subscript_dynamic")
    return Unresolved(f"unsupported_node_{type(node).__name__}")


def flatten_resolved(value):
    """يحوّل نتيجة resolve_expr إلى (قائمة مفاتيح محلولة فعلًا، قائمة أسباب عدم الحل)"""
    resolved, unresolved_reasons = [], []
    if isinstance(value, Unresolved):
        unresolved_reasons.append(value.reason)
    elif isinstance(value, str):
        resolved.append(value)
    elif isinstance(value, list):
        for v in value:
            if isinstance(v, Unresolved):
                unresolved_reasons.append(v.reason)
            elif isinstance(v, str):
                resolved.append(v)
    return resolved, unresolved_reasons


# ══════════════ 3) بناء جداول الرموز على مستوى الوحدة (module-level) لكل ملف + خريطة الاستيراد ══════════════

def _targets_names(target):
    if isinstance(target, ast.Name):
        return [target.id]
    if isinstance(target, (ast.Tuple, ast.List)):
        names = []
        for e in target.elts:
            names.extend(_targets_names(e))
        return names
    return []


def build_module_tables(all_files):
    """يرجع: {module_label: {"tree":..., "symtab": {name: resolved_value_placeholder}, "imports": {alias: (module_label, orig_name)}}}"""
    modules = {}
    for label, path in all_files.items():
        with open(path, "r", encoding="utf-8") as f:
            source = f.read()
        try:
            tree = ast.parse(source, filename=path)
        except SyntaxError:
            continue
        symtab_raw = {}  # name -> ast node (RHS) لاحقًا نحلّه
        imports = {}  # alias -> (source_label_or_None, orig_name)
        for node in tree.body:
            if isinstance(node, ast.Assign):
                names = _targets_names(node.targets[0])
                if len(names) == 1:
                    symtab_raw[names[0]] = node.value
                elif len(names) > 1 and isinstance(node.value, (ast.Tuple, ast.List)) and len(node.value.elts) == len(names):
                    for n, v in zip(names, node.value.elts):
                        symtab_raw[n] = v
            elif isinstance(node, ast.ImportFrom) and node.module is not None and (node.level or 0) >= 1:
                # استيراد نسبي داخل حزمة routes، مثل: from .hr_common import P_ATTEND, _guard
                target_label = f"routes/{node.module}.py"
                for alias in node.names:
                    local_name = alias.asname or alias.name
                    imports[local_name] = (target_label, alias.name)
            elif isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("routes."):
                target_label = f"routes/{node.module.split('.')[-1]}.py"
                for alias in node.names:
                    local_name = alias.asname or alias.name
                    imports[local_name] = (target_label, alias.name)
        modules[label] = {"tree": tree, "symtab_raw": symtab_raw, "imports": imports, "resolved": {}, "source": source}
    return modules


def resolve_module_symtabs(modules, max_passes=6):
    """حل تدريجي (fixed-point) لكل الرموز على مستوى الوحدة عبر كل الملفات، بما فيها السلاسل بين الملفات."""
    for _ in range(max_passes):
        changed = False
        for label, mod in modules.items():
            local_symtab = dict(mod["resolved"])
            for alias, (src_label, orig_name) in mod["imports"].items():
                src_mod = modules.get(src_label)
                if src_mod and orig_name in src_mod["resolved"]:
                    if local_symtab.get(alias) != src_mod["resolved"][orig_name]:
                        local_symtab[alias] = src_mod["resolved"][orig_name]
                        changed = True
            for name, rhs_node in mod["symtab_raw"].items():
                val = resolve_expr(rhs_node, local_symtab)
                if not isinstance(val, Unresolved) or name not in local_symtab:
                    if local_symtab.get(name) != val:
                        local_symtab[name] = val
                        changed = True
            mod["resolved"] = local_symtab
        if not changed:
            break
    return modules


# ══════════════ 4) تصنيف دليل الإنفاذ الأمني الفعلي (ليس فقط اكتشاف الاسم) ══════════════

def _function_body_raises(func_node) -> bool:
    for n in ast.walk(func_node):
        if isinstance(n, ast.Raise):
            return True
    return False


def _find_local_def(tree, name):
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    return None


def classify_enforcement(call_node, parent_stack, callee_name, mod_tree):
    """يرجع أحد: confirmed_raises | confirmed_conditional_raise | informational_only_not_a_gate | ambiguous_needs_manual_review"""
    bare_stmt = len(parent_stack) >= 1 and isinstance(parent_stack[-1], ast.Expr)
    if bare_stmt:
        callee_def = _find_local_def(mod_tree, callee_name)
        if callee_def is not None:
            return "confirmed_raises" if _function_body_raises(callee_def) else "ambiguous_needs_manual_review"
        return "assumed_raises_unverified_external_def"

    for anc in reversed(parent_stack):
        if isinstance(anc, ast.If):
            if any(isinstance(n, ast.Raise) for n in ast.walk(anc)):
                return "confirmed_conditional_raise"

    for anc in reversed(parent_stack):
        if isinstance(anc, (ast.Dict,)):
            return "informational_only_not_a_gate"
        if isinstance(anc, ast.keyword):
            return "informational_only_not_a_gate"

    callee_def = _find_local_def(mod_tree, callee_name)
    if callee_def is not None and _function_body_raises(callee_def):
        return "confirmed_raises"
    return "ambiguous_needs_manual_review"


# ══════════════ 5) فحص دالة واحدة (جسم Endpoint) لاكتشاف كل استخدامات الصلاحيات ══════════════

def _call_func_name(call_node):
    f = call_node.func
    if isinstance(f, ast.Name):
        return f.id
    if isinstance(f, ast.Attribute):
        return f.attr
    return None


PERMISSION_HINT_TOKENS = ("has_permission", "has_any_permission", "require_permission", "Permission", "_guard", "assert_in_scope", "P_VIEW", "P_MANAGE", "P_ORG", "P_ATTEND", "P_CORR", "P_LEAVES", "P_ISSUE")


def _resolve_callee_def(callee_name, caller_module_label, modules, func_defs):
    mod = modules.get(caller_module_label)
    target_label, target_name = caller_module_label, callee_name
    if mod and callee_name in mod["imports"]:
        target_label, target_name = mod["imports"][callee_name]
    return func_defs.get(target_label, {}).get(target_name), target_label, target_name


def _is_permission_related_callee(callee_name, caller_module_label, modules, func_defs):
    """مرشِّح أداء رخيص فقط (لا يُستخدم لاستخراج القيمة نهائيًا - الاستخراج الفعلي AST بالكامل لاحقًا):
    هل يستحق الأمر فتح الدالة المستدعاة ومتابعة التحليل التكراري داخلها؟"""
    if not callee_name or callee_name in ("__init__",):
        return False
    func_node, _, _ = _resolve_callee_def(callee_name, caller_module_label, modules, func_defs)
    if func_node is None:
        return False
    try:
        src = ast.dump(func_node)
    except Exception:
        return False
    return any(tok in src for tok in PERMISSION_HINT_TOKENS)


def _detect_admin_only(func_node) -> bool:
    """يكتشف نمط current_user["role"] != "admin" عبر AST دقيق (وليس نصًا حرفيًا على ast.dump الذي لا
    يحتوي أبدًا نص المصدر الحرفي) — يطابق أيضًا role_user["role"]!="admin" وأشكال is_admin المكافئة."""
    for node in ast.walk(func_node):
        if not isinstance(node, ast.Compare) or len(node.ops) != 1 or not isinstance(node.ops[0], ast.NotEq):
            continue
        left = node.left
        if not (isinstance(left, ast.Subscript)):
            continue
        slice_node = left.slice
        if isinstance(slice_node, ast.Index):
            slice_node = slice_node.value
        if not (isinstance(slice_node, ast.Constant) and slice_node.value == "role"):
            continue
        comparator = node.comparators[0]
        if isinstance(comparator, ast.Constant) and comparator.value == "admin":
            return True
    return False


def resolve_zero_arg_helper(callee_name, caller_module_label, modules, func_defs, visited, depth=0):
    """نمط `_guard(current_user)` بلا وسيط صلاحية: الصلاحية مُضمَّنة داخل جسم الدالة المستدعاة (أو داخل
    دالة أخرى تستدعيها هي بدورها). نبحث عن تعريف الدالة في نفس الوحدة أو عبر خريطة الاستيراد، ثم نفحص
    جسمها بنفس الآلية (تكراريًا، بحد أقصى 4 مستويات ومنع الحلقات عبر visited) دون أي تخمين."""
    if depth > 4:
        return [], [], [{"gate_function": callee_name, "reason": "max_recursion_depth_exceeded"}]
    mod = modules.get(caller_module_label)
    target_label, target_name = caller_module_label, callee_name
    if mod and callee_name in mod["imports"]:
        target_label, target_name = mod["imports"][callee_name]
    if (target_label, target_name) in visited:
        return [], [], [{"gate_function": callee_name, "reason": "recursive_cycle_detected"}]
    func_node = func_defs.get(target_label, {}).get(target_name)
    if func_node is None:
        return [], [], [{"gate_function": callee_name, "reason": f"callee_def_not_found:{target_label}:{target_name}"}]
    target_mod = modules.get(target_label)
    legacy_keys, detections, unresolved_refs, _ = scan_function_body(
        func_node, target_mod["resolved"], target_mod["tree"], target_label, modules, func_defs,
        visited | {(target_label, target_name)}, depth=depth + 1,
    )
    out = [(d["permission_key"], d["gate_function"], d["enforcement"]) for d in detections]
    return legacy_keys, out, unresolved_refs


def scan_function_body(func_node, module_symtab, mod_tree, module_label=None, modules=None, func_defs=None, visited=None, depth=0):
    """يبني جدول رموز محلي (function-level) إضافة إلى رموز الوحدة، ثم يفحص كل استدعاءات الصلاحيات."""
    modules = modules or {}
    func_defs = func_defs or {}
    visited = visited or set()
    local_symtab = dict(module_symtab)
    for node in ast.walk(func_node):
        if isinstance(node, ast.Assign):
            names = _targets_names(node.targets[0])
            if len(names) == 1:
                val = resolve_expr(node.value, local_symtab)
                if not isinstance(val, Unresolved):
                    local_symtab[names[0]] = val

    parent_map = {}
    for parent in ast.walk(func_node):
        for child in ast.iter_child_nodes(parent):
            parent_map[child] = parent

    def get_parent_stack(n):
        stack = []
        cur = n
        while cur in parent_map:
            cur = parent_map[cur]
            stack.append(cur)
        return list(reversed(stack))

    detections = []
    unresolved_refs = []
    comprehension_iter_cache = {}

    for node in ast.walk(func_node):
        if isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
            for gen in node.generators:
                it_val = resolve_expr(gen.iter, local_symtab)
                if isinstance(gen.iter, ast.Call) and isinstance(gen.iter.func, ast.Attribute) and gen.iter.func.attr in ("values", "items"):
                    base_val = resolve_expr(gen.iter.func.value, local_symtab)
                    it_val = base_val
                if isinstance(gen.target, ast.Name):
                    comprehension_iter_cache[gen.target.id] = it_val
                elif isinstance(gen.target, ast.Tuple) and len(gen.target.elts) == 2 and isinstance(gen.iter, ast.Call) and isinstance(gen.iter.func, ast.Attribute) and gen.iter.func.attr == "items":
                    # نمط `for k, p in SECTION_PERMS.items()` — p (العنصر الثاني) يأخذ قيم القاموس المحلولة
                    k_name, v_name = gen.target.elts
                    if isinstance(v_name, ast.Name):
                        comprehension_iter_cache[v_name.id] = it_val

    # نمط `any(x in <متغيّر_ديناميكي> for x in [Permission.A, Permission.B, ...])` — فحص عضوية بلا أي استدعاء
    # دالة حارس مسمّاة، لكن قابل للحل بثقة لأن القائمة المُكرَّر عليها حرفية/محلولة بالكامل.
    for node in ast.walk(func_node):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in ("any", "all")):
            continue
        if not node.args or not isinstance(node.args[0], ast.GeneratorExp):
            continue
        gen_exp = node.args[0]
        if not isinstance(gen_exp.elt, ast.Compare) or not any(isinstance(op, (ast.In, ast.NotIn)) for op in gen_exp.elt.ops):
            continue
        for gen in gen_exp.generators:
            if not isinstance(gen.target, ast.Name):
                continue
            iter_val = resolve_expr(gen.iter, local_symtab)
            resolved_keys, reasons = flatten_resolved(iter_val)
            if resolved_keys:
                parent_stack = get_parent_stack(node)
                enforcement = classify_enforcement(node, parent_stack, "any_membership_check", mod_tree)
                for k in resolved_keys:
                    detections.append({
                        "permission_key": k, "confidence": "indirect_resolved_membership_comprehension",
                        "gate_function": f"{node.func.id}(...)", "enforcement": enforcement,
                    })
            for r in reasons:
                unresolved_refs.append({"gate_function": f"{node.func.id}(...)", "reason": r})

    for node in ast.walk(func_node):
        if not isinstance(node, ast.Call):
            continue
        name = _call_func_name(node)
        if name not in GATE_FUNC_NAMES:
            if _is_permission_related_callee(name, module_label, modules, func_defs):
                permission_args = node.args[1:] + [kw.value for kw in node.keywords if kw.arg not in ("user", "current_user")]
                if not permission_args:
                    helper_keys, helper_dets, helper_unresolved = resolve_zero_arg_helper(name, module_label, modules, func_defs, visited | {(module_label, func_node.name)}, depth=depth)
                    parent_stack = get_parent_stack(node)
                    site_enforcement = classify_enforcement(node, parent_stack, name, mod_tree)
                    for hk, hconf, henf in helper_dets:
                        enforcement = site_enforcement if site_enforcement != "ambiguous_needs_manual_review" else henf
                        detections.append({
                            "permission_key": hk, "confidence": "indirect_resolved_via_helper",
                            "gate_function": f"{name}->{hconf}", "enforcement": enforcement,
                        })
                    unresolved_refs.extend(helper_unresolved)
            continue
        permission_args = node.args[1:] + [kw.value for kw in node.keywords if kw.arg != "user" and kw.arg != "current_user"]
        if not permission_args:
            # نمط «استدعاء بلا وسيط صلاحية» (مثل _guard(current_user)) — الصلاحية مُضمَّنة داخل جسم الدالة
            # نفسها (أو داخل دالة أخرى تستدعيها هي)؛ نحلّها عبر التتبّع التكراري عبر الوحدات.
            helper_keys, helper_dets, helper_unresolved = resolve_zero_arg_helper(name, module_label, modules, func_defs, visited | {(module_label, func_node.name)}, depth=depth)
            parent_stack = get_parent_stack(node)
            site_enforcement = classify_enforcement(node, parent_stack, name, mod_tree)
            for hk, hconf, henf in helper_dets:
                enforcement = site_enforcement if site_enforcement != "ambiguous_needs_manual_review" else henf
                detections.append({
                    "permission_key": hk, "confidence": "indirect_resolved_via_helper",
                    "gate_function": f"{name}->{hconf}", "enforcement": enforcement,
                })
            unresolved_refs.extend(helper_unresolved)
            continue
        for arg in permission_args:
            effective_symtab = dict(local_symtab)
            effective_symtab.update({k: v for k, v in comprehension_iter_cache.items()})
            val = resolve_expr(arg, effective_symtab)
            resolved_keys, reasons = flatten_resolved(val)
            if isinstance(val, Unresolved) and isinstance(arg, ast.Name) and arg.id in comprehension_iter_cache:
                comp_val = comprehension_iter_cache[arg.id]
                resolved_keys2, reasons2 = flatten_resolved(comp_val)
                resolved_keys.extend(resolved_keys2)
                reasons = [r for r in reasons if "not_in_symtab" not in r] + reasons2
            if resolved_keys:
                is_direct = isinstance(arg, (ast.Constant, ast.Attribute))
                parent_stack = get_parent_stack(node)
                enforcement = classify_enforcement(node, parent_stack, name, mod_tree)
                for k in resolved_keys:
                    detections.append({
                        "permission_key": k,
                        "confidence": "direct" if is_direct else "indirect_resolved",
                        "gate_function": name,
                        "enforcement": enforcement,
                    })
            if reasons:
                for r in reasons:
                    unresolved_refs.append({"gate_function": name, "reason": r})

    admin_only = _detect_admin_only(func_node)
    seen = set()
    dedup_detections = []
    for d in detections:
        key = (d["permission_key"], d["gate_function"], d["enforcement"])
        if key in seen:
            continue
        seen.add(key)
        dedup_detections.append(d)
    legacy_keys = sorted({d["permission_key"] for d in dedup_detections})
    return legacy_keys, dedup_detections, unresolved_refs, admin_only


# ══════════════ 6) اكتشاف الـ Endpoints (مطابق للإصدار 1) + تجميع كل شيء ══════════════

def _router_prefix(source: str) -> str:
    import re
    m = re.search(r'APIRouter\(\s*prefix\s*=\s*["\']([^"\']*)["\']', source)
    return m.group(1) if m else ""


def _decorator_info(dec: ast.AST):
    if not isinstance(dec, ast.Call):
        return None
    func = dec.func
    if not isinstance(func, ast.Attribute) or func.attr not in HTTP_METHODS:
        return None
    router_var = func.value.id if isinstance(func.value, ast.Name) else None
    path = None
    if dec.args and isinstance(dec.args[0], ast.Constant) and isinstance(dec.args[0].value, str):
        path = dec.args[0].value
    return router_var, func.attr, path


USER_AUTH_MARKERS = ("get_current_user", "ctx_dep", "current_user")
SERVICE_KEY_MARKERS = ("require_service_key", "_check_key", "x_internal_key", "x_api_key")


def _auth_kind(func_node) -> str:
    src = ast.dump(func_node.args)
    if any(m in src for m in USER_AUTH_MARKERS):
        return "user_auth"
    if any(m in src for m in SERVICE_KEY_MARKERS):
        return "service_key_auth"
    return "public"


def main():
    all_files = {}
    for fname in sorted(os.listdir(ROUTES_DIR)):
        if fname.endswith(".py") and not fname.startswith("__"):
            all_files[f"routes/{fname}"] = os.path.join(ROUTES_DIR, fname)
    server_path = os.path.join(BACKEND_DIR, "server.py")
    all_files["server"] = server_path

    modules = build_module_tables(all_files)
    modules = resolve_module_symtabs(modules)

    func_defs = {}
    for label, mod in modules.items():
        func_defs[label] = {}
        for node in mod["tree"].body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                func_defs[label][node.name] = node

    all_endpoints = []
    total_unresolved = 0
    for label, mod in modules.items():
        tree = mod["tree"]
        source = mod["source"]
        prefix = _router_prefix(source) if label != "server" else "/api"
        lines = source.splitlines()
        for node in ast.walk(tree):
            if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
                continue
            for dec in node.decorator_list:
                info = _decorator_info(dec)
                if not info:
                    continue
                router_var, method, path_literal = info
                if label == "server" and router_var not in ("api_router", "app"):
                    continue
                if path_literal is None:
                    path_literal = f"<dynamic:{node.name}>"
                full_path = (prefix.rstrip("/") + "/" + path_literal.lstrip("/")) if path_literal.startswith("/") else path_literal
                full_path = "/" + full_path.strip("/") if not full_path.startswith("<dynamic") else full_path
                auth_kind = _auth_kind(node)
                legacy_keys, detections, unresolved_refs, admin_only = scan_function_body(
                    node, mod["resolved"], tree, label, modules, func_defs, {(label, node.name)},
                )
                total_unresolved += len(unresolved_refs)
                all_endpoints.append({
                    "file": label, "function": node.name, "method": method.upper(), "path": full_path,
                    "line": node.lineno, "auth_kind": auth_kind, "requires_auth": auth_kind == "user_auth",
                    "legacy_permissions_detected": legacy_keys,
                    "resolution_detail": detections,
                    "unresolved_dynamic_refs": unresolved_refs,
                    "admin_only_detected": admin_only,
                })

    seen = set()
    deduped = []
    for e in all_endpoints:
        key = (e["file"], e["function"], e["method"], e["path"], e["line"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(e)

    out_path = os.path.join(OUT_DIR, "api_endpoints_scan_v2.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(deduped, f, ensure_ascii=False, indent=2)

    authed = [e for e in deduped if e["auth_kind"] == "user_auth"]
    with_legacy = [e for e in authed if e["legacy_permissions_detected"]]
    direct_count = sum(1 for e in authed for d in e["resolution_detail"] if d["confidence"] == "direct")
    indirect_count = sum(1 for e in authed for d in e["resolution_detail"] if d["confidence"] == "indirect_resolved")
    confirmed_raises = sum(1 for e in authed for d in e["resolution_detail"] if d["enforcement"] == "confirmed_raises")
    informational_only = sum(1 for e in authed for d in e["resolution_detail"] if d["enforcement"] == "informational_only_not_a_gate")
    ambiguous = sum(1 for e in authed for d in e["resolution_detail"] if d["enforcement"] == "ambiguous_needs_manual_review")

    print(f"TOTAL_ENDPOINTS={len(deduped)}")
    print(f"USER_AUTH_ENDPOINTS={len(authed)}")
    print(f"ENDPOINTS_WITH_LEGACY_PERMISSION_DETECTED={len(with_legacy)}")
    print(f"DIRECT_DETECTIONS={direct_count}  INDIRECT_RESOLVED_DETECTIONS={indirect_count}")
    print(f"ENFORCEMENT_CONFIRMED_RAISES={confirmed_raises}  INFORMATIONAL_ONLY={informational_only}  AMBIGUOUS={ambiguous}")
    print(f"TOTAL_UNRESOLVED_DYNAMIC_REFS={total_unresolved}")
    print(f"OUTPUT={out_path}")


if __name__ == "__main__":
    main()
