"""🔒 حارس الإنفاذ الفعلي الشامل (Phase 7-Final — الدفعة الكبيرة)
يتحقق من وجود الصلاحية المتقدمة المطابقة لكل (مسار × طريقة) — فقط لمستخدمي
advanced_access_real_enforcement=True، وفقط للمسارات المُدرَجة صراحةً في الجدول (عمليات الكتابة على
الوحدات النشطة + عمليات القراءة على الوحدات الحساسة الجديدة). صفر أثر على أي مستخدم قديم.
"""
import json
import logging
import os

from bson import ObjectId
from jose import jwt, JWTError
from starlette.types import ASGIApp, Receive, Scope, Send

from .deps import SECRET_KEY, ALGORITHM

# مجموعات الوحدات النشطة (مُفعَّل عليها إنفاذ قراءة فعلي مسبقًا) — تُضاف لها عمليات الكتابة كاملة
ACTIVE_WRITE_GROUPS = {
    "teachers", "courses", "enrollments", "attendance", "alumni", "teaching_load",
    "schedule", "councils", "curriculum", "certificates", "students", "academic_structure",
}
# مجموعات حساسة جديدة لم يُفعَّل عليها إنفاذ من قبل — تُضاف لها عمليات القراءة فقط في هذه الدفعة
NEW_SENSITIVE_READ_GROUPS = {"finance", "cards", "system_users", "grades", "calendar", "hr_attendance"}


def build_real_enforcement_table(app):
    """يبني جدول (طريقة، نمط مسار مُصرَّف، مفتاح صلاحية متقدم) من مسارات التطبيق المسجَّلة فعليًا + سجل الصلاحيات"""
    gen_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools", "generated")
    manifest_path = os.path.join(gen_dir, "advanced_permissions.json")
    try:
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
    except Exception as e:
        logging.warning(f"RealEnforcement: تعذّر تحميل سجل الصلاحيات {manifest_path}: {e}")
        return []

    perm_lookup = {}
    for p in manifest:
        method = p.get("linked_api_method")
        group = p.get("group_key")
        if method in ("POST", "PUT", "DELETE", "PATCH") and group in ACTIVE_WRITE_GROUPS:
            pass
        elif method == "GET" and group in NEW_SENSITIVE_READ_GROUPS:
            pass
        else:
            continue
        src = p.get("source_file") or ""
        mod = src[:-3].replace("/", ".") if src.endswith(".py") else src
        perm_lookup[(method, mod, p.get("source_function"))] = p.get("key")

    table = []
    for route in getattr(app, "routes", []):
        endpoint = getattr(route, "endpoint", None)
        path_regex = getattr(route, "path_regex", None)
        methods = getattr(route, "methods", None)
        if endpoint is None or path_regex is None or not methods:
            continue
        mod = getattr(endpoint, "__module__", None)
        # 🔒 ملاحظة حرجة: server.py يُحمَّل عبر shim بـ importlib كوحدة باسم "_actual_server" وليس "server"
        if mod == "_actual_server":
            mod = "server"
        name = getattr(endpoint, "__name__", None)
        for m in methods:
            key = perm_lookup.get((m, mod, name))
            if key:
                table.append((m, path_regex, key))
    logging.info(f"RealEnforcement guard: تم ربط {len(table)} نقطة نهاية بصلاحيات متقدمة")
    return table


class RealEnforcementRouteGuardMiddleware:
    """حارس عام ASGI: يتحقق من الصلاحية المتقدمة قبل تنفيذ أي مسار مُدرَج في الجدول — فقط لمستخدمي الإنفاذ الفعلي"""

    def __init__(self, app: ASGIApp, route_table=None, db_getter=None):
        self.app = app
        self.route_table = route_table or []
        self.db_getter = db_getter

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http" or not self.route_table:
            await self.app(scope, receive, send)
            return
        method = scope.get("method", "GET")
        path = scope.get("path", "")
        if not path.startswith("/api/"):
            await self.app(scope, receive, send)
            return

        matched_key = None
        for m, rx, key in self.route_table:
            if m == method and rx.match(path):
                matched_key = key
                break
        if not matched_key:
            await self.app(scope, receive, send)
            return

        auth = None
        for k, v in scope.get("headers", []):
            if k == b"authorization":
                auth = v.decode("latin-1")
                break
        if not auth or not auth.lower().startswith("bearer "):
            await self.app(scope, receive, send)
            return

        try:
            payload = jwt.decode(auth[7:].strip(), SECRET_KEY, algorithms=[ALGORITHM])
            uid = payload.get("sub")
        except JWTError:
            await self.app(scope, receive, send)
            return
        if not uid or not ObjectId.is_valid(uid):
            await self.app(scope, receive, send)
            return

        db = self.db_getter()
        user = await db.users.find_one({"_id": ObjectId(uid)})
        if not user or not user.get("advanced_access_real_enforcement"):
            await self.app(scope, receive, send)
            return

        from services.advanced_access_service import real_enforce_check
        allowed = await real_enforce_check(db, user, matched_key)
        if not allowed:
            logging.info(f"RealEnforcement guard blocked {method} {path} key={matched_key} user={uid}")
            body = json.dumps({"detail": "غير مصرح لك بهذا الإجراء"}, ensure_ascii=False).encode("utf-8")
            await send({"type": "http.response.start", "status": 403,
                        "headers": [(b"content-type", b"application/json; charset=utf-8"), (b"content-length", str(len(body)).encode())]})
            await send({"type": "http.response.body", "body": body})
            return

        await self.app(scope, receive, send)
