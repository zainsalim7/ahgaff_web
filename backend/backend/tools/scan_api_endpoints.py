"""
🔎 ماسح واجهات API — المرحلة 2 من مشروع مركز الصلاحيات المتقدم
يفحص كل ملفات routes/*.py + server.py عبر AST (وليس تخمينًا) ليستخرج:
كل Endpoint فعلي، مساره الكامل، نوع الطلب، هل يتطلب مصادقة (current_user)،
وأي فحص صلاحية قديم مكتشَف داخل جسم الدالة (لأغراض التوثيق فقط).
لا يُعدِّل أي كود — قراءة فقط. يُنتج JSON في tools/generated/.
"""
import ast
import json
import os
import re

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTES_DIR = os.path.join(BACKEND_DIR, "routes")
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "generated")
os.makedirs(OUT_DIR, exist_ok=True)

HTTP_METHODS = {"get", "post", "put", "delete", "patch"}
PERM_PATTERNS = [
    re.compile(r'require_permission\(\s*["\']([a-zA-Z0-9_\.]+)["\']\s*\)'),
    re.compile(r'has_permission\(\s*\w+\s*,\s*["\']([a-zA-Z0-9_\.]+)["\']\s*\)'),
    re.compile(r'has_permission\(\s*\w+\s*,\s*Permission\.([A-Z_]+)\s*\)'),
    re.compile(r'has_any_permission\(\s*\w+\s*,\s*\[([^\]]+)\]'),
    re.compile(r'_guard\(\s*\w+\s*,\s*["\']([a-zA-Z0-9_\.]+)["\']\s*\)'),
]
ADMIN_ONLY_RE = re.compile(r'current_user\[["\']role["\']\]\s*!=\s*["\']admin["\']')


def _router_prefix(source: str) -> str:
    m = re.search(r'APIRouter\(\s*prefix\s*=\s*["\']([^"\']*)["\']', source)
    return m.group(1) if m else ""


def _decorator_info(dec: ast.AST):
    """يرجع (router_var, method, path_literal_or_None) لديكوريتر مثل router.get('/x')"""
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


def _auth_kind(func_node: ast.AsyncFunctionDef) -> str:
    src = ast.dump(func_node.args)
    if any(m in src for m in USER_AUTH_MARKERS):
        return "user_auth"
    if any(m in src for m in SERVICE_KEY_MARKERS):
        return "service_key_auth"
    return "public"


def _detect_legacy_perms(body_src: str):
    found = []
    for pat in PERM_PATTERNS:
        for m in pat.finditer(body_src):
            found.append(m.group(1))
    is_admin_only = bool(ADMIN_ONLY_RE.search(body_src))
    return sorted(set(found)), is_admin_only


def scan_file(path: str, module_label: str):
    with open(path, "r", encoding="utf-8") as f:
        source = f.read()
    prefix = _router_prefix(source) if module_label != "server" else "/api"
    try:
        tree = ast.parse(source, filename=path)
    except SyntaxError as e:
        return [], f"SYNTAX_ERROR: {e}"

    lines = source.splitlines()
    results = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
            continue
        for dec in node.decorator_list:
            info = _decorator_info(dec)
            if not info:
                continue
            router_var, method, path_literal = info
            if module_label == "server" and router_var not in ("api_router", "app"):
                continue
            if path_literal is None:
                path_literal = f"<dynamic:{node.name}>"
            full_path = (prefix.rstrip("/") + "/" + path_literal.lstrip("/")) if path_literal.startswith("/") else path_literal
            full_path = "/" + full_path.strip("/") if not full_path.startswith("<dynamic") else full_path
            start = node.lineno - 1
            end = getattr(node, "end_lineno", start + 30)
            body_src = "\n".join(lines[start:end])
            auth_kind = _auth_kind(node)
            legacy_perms, admin_only = _detect_legacy_perms(body_src)
            results.append({
                "file": module_label,
                "function": node.name,
                "method": method.upper(),
                "path": full_path,
                "line": node.lineno,
                "auth_kind": auth_kind,
                "requires_auth": auth_kind == "user_auth",
                "legacy_permissions_detected": legacy_perms,
                "admin_only_detected": admin_only,
            })
    return results, None


def main():
    all_endpoints = []
    errors = []
    for fname in sorted(os.listdir(ROUTES_DIR)):
        if not fname.endswith(".py") or fname.startswith("__"):
            continue
        module_label = f"routes/{fname}"
        res, err = scan_file(os.path.join(ROUTES_DIR, fname), module_label)
        all_endpoints.extend(res)
        if err:
            errors.append({"file": module_label, "error": err})

    server_path = os.path.join(BACKEND_DIR, "server.py")
    res, err = scan_file(server_path, "server")
    all_endpoints.extend(res)
    if err:
        errors.append({"file": "server.py", "error": err})

    # إزالة التكرار الدقيق (نفس method+path+file+function)
    seen = set()
    deduped = []
    for e in all_endpoints:
        key = (e["file"], e["function"], e["method"], e["path"], e["line"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(e)

    out_path = os.path.join(OUT_DIR, "api_endpoints_scan.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(deduped, f, ensure_ascii=False, indent=2)

    authed = [e for e in deduped if e["auth_kind"] == "user_auth"]
    service_key = [e for e in deduped if e["auth_kind"] == "service_key_auth"]
    public = [e for e in deduped if e["auth_kind"] == "public"]

    print(f"TOTAL_ENDPOINTS={len(deduped)}")
    print(f"USER_AUTH_ENDPOINTS={len(authed)}")
    print(f"SERVICE_KEY_ENDPOINTS={len(service_key)}")
    print(f"PUBLIC_NO_AUTH_ENDPOINTS={len(public)}")
    print(f"FILES_SCANNED={len(set(e['file'] for e in deduped))}")
    print(f"PARSE_ERRORS={len(errors)}")
    if errors:
        for er in errors:
            print("  ERROR:", er)
    by_method = {}
    for e in deduped:
        by_method[e["method"]] = by_method.get(e["method"], 0) + 1
    print("BY_METHOD=", by_method)
    print(f"OUTPUT={out_path}")


if __name__ == "__main__":
    main()
