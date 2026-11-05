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

# مجموعات مُدارة فعلاً عبر الجسر القديم (has_permission + legacy bridge) — لا حاجة لتكرارها هنا (الدفعة 3)
LEGACY_BRIDGE_GROUPS = {"hr_core", "hr_leaves", "hr_tasks", "letters", "dashboard"}
# مسارات "بياناتي الخاصة" (self-service) — يجب أن تبقى متاحة دائمًا لصاحبها بغض النظر عن الصلاحيات المتقدمة
SELF_SERVICE_EXCLUDE_KEYS = {
    "system_users_auth_get_me", "system_users_ser_get_my_scope",
    "finance_fee_receipts_my_fee_status", "grades_grades_get_my_results",
    "hr_attendance_hr_attendance_my_device", "hr_attendance_hr_attendance_my_attendance",
    "cards_hr_cards_my_card", "cards_hr_cards_my_card_download", "cards_hr_cards_upload_my_photo",
    "hr_attendance_hr_presence_my_checks", "cards_student_cards_get_my_card", "cards_student_cards_upload_my_photo",
    "correspondence_correspondence_my_access", "correspondence_correspondence_signature_my_signature",
    "correspondence_correspondence_signature_upload_signature", "correspondence_correspondence_signature_delete_signature",
    "schedule_day_shift_my_day_shift", "notifications_notifications_get_my_notifications",
    "curriculum_study_plans_get_my_course_study_plan", "curriculum_study_plans_get_my_study_plan",
    "students_ser_get_my_student_record", "students_ser_get_my_courses", "teachers_ser_get_my_teacher_profile",
    "academic_structure_ser_get_my_institution",
    # 🆕 أُضيفت بعد اكتشافها عبر testing_agent (ظل تظليل مسار + صلاحيات شخصية ناقصة)
    "system_users_ser_change_password", "system_users_ser_force_change_password",
    "notifications_ser_get_notifications", "notifications_ser_get_unread_notifications_count",
    "notifications_ser_mark_notification_as_read", "notifications_ser_mark_all_notifications_as_read",
    "notifications_notifications_mark_notification_read", "notifications_notifications_mark_all_notifications_read",
    "notifications_notifications_register_device_token", "notifications_notifications_unregister_device_token",
    "notifications_ser_register_fcm_token", "notifications_ser_unregister_fcm_token",
    "misc_advanced_access_my_access", "misc_advanced_access_my_contexts",
    "attendance_absence_excuses_my", "attendance_student_excuses_my_excuses", "attendance_attendance_approval_my_change_requests",
    "students_ser_my_absence_profile", "assistant_assistant_my_sessions", "hr_attendance_hr_attendance_request_device_change",
    # 🆕 قوائم مرجعية (أسماء كليات/أقسام) للاستخدام في فلاتر الواجهة — ليست بيانات حساسة بذاتها،
    # والنتيجة المُرجَعة تبقى محصورة بنطاق المستخدم فعلياً عبر منطق الدالة نفسها (get_user_scope_filter/allowed_faculty_ids)
    "academic_structure_ser_get_faculties", "academic_structure_ser_get_departments",
}


def build_real_enforcement_table(app):
    """يبني جدول (طريقة، نمط مسار مُصرَّف، مفتاح صلاحية متقدم) من مسارات التطبيق المسجَّلة فعليًا + سجل الصلاحيات
    🆕 الدفعة 3 (تفعيل الباقي): كل الصلاحيات الـ1026 مُفعَّلة الآن لمستخدمي الإنفاذ الفعلي، باستثناء
    المجموعات المُدارة أصلاً عبر الجسر القديم (LEGACY_BRIDGE_GROUPS) ومسارات "بياناتي الخاصة" """
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
        key = p.get("key")
        if method not in ("GET", "POST", "PUT", "DELETE", "PATCH"):
            continue
        # 🔒 إصلاح ظل التظليل: المسارات المستثناة (بياناتي الخاصة/الجسر القديم) تُدرَج كـ"تمرير" (None)
        # في نفس موضعها الصحيح في الجدول، بدل حذفها بالكامل — وإلا يطابقها لاحقًا مسار أعمّ بالخطأ (مثل /students/{id})
        if key in SELF_SERVICE_EXCLUDE_KEYS or group in LEGACY_BRIDGE_GROUPS:
            key = None
        src = p.get("source_file") or ""
        mod = src[:-3].replace("/", ".") if src.endswith(".py") else src
        perm_lookup[(method, mod, p.get("source_function"))] = key

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
            lookup_key = (m, mod, name)
            if lookup_key in perm_lookup:
                table.append((m, path_regex, perm_lookup[lookup_key]))
    gated = sum(1 for _, _, k in table if k)
    logging.info(f"RealEnforcement guard: تم ربط {gated} نقطة نهاية بصلاحيات متقدمة ({len(table) - gated} مسار تمرير محمي من ظل التظليل)")
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
