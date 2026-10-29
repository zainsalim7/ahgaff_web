"""
🏗️ بناء سجل الصلاحيات المتقدم من نتائج الفحص — المرحلة 2
يقرأ tools/generated/api_endpoints_scan.json (ناتج scan_api_endpoints.py) ويولّد:
- tools/generated/advanced_permission_groups.json
- tools/generated/advanced_permissions.json
قاعدة العمل: كل Endpoint يتطلب مصادقة مستخدم بشري (auth_kind == user_auth) = عملية حقيقية واحدة = صلاحية
مستقلة واحدة بالضبط (علاقة 1:1 قابلة للتحقق برمجيًا). الاستثناءات (public / service_key) تُوثَّق كمستبعدة
بسبب موضَّح، ولا تُمنح صلاحية.
لا يُعدِّل أي كود قديم — قراءة فقط وإنتاج ملفات جديدة.
"""
import json
import os
import re

GEN_DIR = os.path.dirname(os.path.abspath(__file__)) + "/generated"
SCAN_PATH = GEN_DIR + "/api_endpoints_scan.json"

# خريطة الملف ← (مفتاح المجموعة، الاسم العربي)
FILE_GROUP_MAP = {
    "routes/students.py": ("students", "إدارة الطلاب"),
    "routes/student_status.py": ("students", "إدارة الطلاب"),
    "routes/student_transfer.py": ("students", "إدارة الطلاب"),
    "routes/student_excuses.py": ("attendance", "إدارة الحضور والغياب"),
    "routes/absence_excuses.py": ("attendance", "إدارة الحضور والغياب"),
    "routes/attendance_approval.py": ("attendance", "إدارة الحضور والغياب"),
    "routes/geofence_attendance.py": ("attendance", "إدارة الحضور والغياب"),
    "routes/absence_justifications.py": ("attendance", "إدارة الحضور والغياب"),
    "routes/absence_reminders.py": ("attendance", "إدارة الحضور والغياب"),
    "routes/teachers.py": ("teachers", "إدارة أعضاء هيئة التدريس"),
    "routes/teacher_overtime.py": ("teaching_load", "إدارة العبء التدريسي"),
    "routes/overtime_letter.py": ("teaching_load", "إدارة العبء التدريسي"),
    "routes/teaching_load.py": ("teaching_load", "إدارة العبء التدريسي"),
    "routes/courses.py": ("courses", "إدارة المقررات والشعب"),
    "routes/course_groups.py": ("courses", "إدارة المقررات والشعب"),
    "routes/course_groups_tools.py": ("courses", "إدارة المقررات والشعب"),
    "routes/course_history.py": ("courses", "إدارة المقررات والشعب"),
    "routes/course_migration.py": ("courses", "إدارة المقررات والشعب"),
    "routes/curriculum.py": ("curriculum", "إدارة الخطط الدراسية"),
    "routes/study_plans.py": ("curriculum", "إدارة الخطط الدراسية"),
    "routes/departments.py": ("academic_structure", "إدارة الهيكل الأكاديمي (الكليات والأقسام)"),
    "routes/weekly_schedule.py": ("schedule", "إدارة الجداول والمحاضرات"),
    "routes/day_shift.py": ("schedule", "إدارة الجداول والمحاضرات"),
    "routes/schedule_import.py": ("schedule", "إدارة الجداول والمحاضرات"),
    "routes/schedule_integrity.py": ("schedule", "إدارة الجداول والمحاضرات"),
    "routes/schedule_resolver.py": ("schedule", "إدارة الجداول والمحاضرات"),
    "routes/schedule_notify.py": ("schedule", "إدارة الجداول والمحاضرات"),
    "routes/lecture_swaps.py": ("schedule", "إدارة الجداول والمحاضرات"),
    "routes/lecture_repairs.py": ("schedule", "إدارة الجداول والمحاضرات"),
    "routes/lectures_purge.py": ("schedule", "إدارة الجداول والمحاضرات"),
    "routes/_schedule_repair.py": ("schedule", "إدارة الجداول والمحاضرات"),
    "routes/grades.py": ("grades", "إدارة الدرجات والنتائج"),
    "routes/fee_receipts.py": ("finance", "إدارة العمليات المالية"),
    "routes/fee_alerts.py": ("finance", "إدارة العمليات المالية"),
    "routes/certificates.py": ("certificates", "إدارة الشهادات والإفادات"),
    "routes/statements.py": ("certificates", "إدارة الشهادات والإفادات"),
    "routes/student_cards.py": ("cards", "إدارة البطاقات"),
    "routes/hr_cards.py": ("cards", "إدارة البطاقات"),
    "routes/hr_card_print.py": ("cards", "إدارة البطاقات"),
    "routes/correspondence.py": ("correspondence", "إدارة المراسلات الرسمية"),
    "routes/correspondence_content.py": ("correspondence", "إدارة المراسلات الرسمية"),
    "routes/correspondence_pdf.py": ("correspondence", "إدارة المراسلات الرسمية"),
    "routes/correspondence_positions.py": ("correspondence", "إدارة المراسلات الرسمية"),
    "routes/correspondence_signature.py": ("correspondence", "إدارة المراسلات الرسمية"),
    "routes/letters.py": ("letters", "إدارة الخطابات الرسمية"),
    "routes/letterheads.py": ("letters", "إدارة الخطابات الرسمية"),
    "routes/hr_letters.py": ("letters", "إدارة الخطابات الرسمية"),
    "routes/hr_letter_pdf.py": ("letters", "إدارة الخطابات الرسمية"),
    "routes/hr_correspondence.py": ("letters", "إدارة الخطابات الرسمية"),
    "routes/hr.py": ("hr_core", "شؤون الموظفين — السجل والهيكل التنظيمي"),
    "routes/hr_common.py": ("hr_core", "شؤون الموظفين — السجل والهيكل التنظيمي"),
    "routes/hr_dashboard.py": ("hr_core", "شؤون الموظفين — السجل والهيكل التنظيمي"),
    "routes/hr_home.py": ("hr_core", "شؤون الموظفين — السجل والهيكل التنظيمي"),
    "routes/hr_documents.py": ("hr_core", "شؤون الموظفين — السجل والهيكل التنظيمي"),
    "routes/hr_profile_requests.py": ("hr_core", "شؤون الموظفين — السجل والهيكل التنظيمي"),
    "routes/hr_leaves.py": ("hr_leaves", "شؤون الموظفين — الإجازات"),
    "routes/hr_leave_types.py": ("hr_leaves", "شؤون الموظفين — الإجازات"),
    "routes/hr_attendance.py": ("hr_attendance", "شؤون الموظفين — الحضور الإداري"),
    "routes/hr_locations.py": ("hr_attendance", "شؤون الموظفين — الحضور الإداري"),
    "routes/hr_presence.py": ("hr_attendance", "شؤون الموظفين — الحضور الإداري"),
    "routes/hr_shifts.py": ("hr_attendance", "شؤون الموظفين — الحضور الإداري"),
    "routes/hr_tasks.py": ("hr_tasks", "شؤون الموظفين — المهام والتقييم"),
    "routes/hr_appraisals.py": ("hr_tasks", "شؤون الموظفين — المهام والتقييم"),
    "routes/hr_reports.py": ("hr_core", "شؤون الموظفين — السجل والهيكل التنظيمي"),
    "routes/hr_alerts.py": ("hr_core", "شؤون الموظفين — السجل والهيكل التنظيمي"),
    "routes/staff_identity.py": ("hr_core", "شؤون الموظفين — السجل والهيكل التنظيمي"),
    "routes/prep_leave.py": ("calendar", "إدارة التقويم والإجازات الأكاديمية"),
    "routes/calendar_events.py": ("calendar", "إدارة التقويم والإجازات الأكاديمية"),
    "routes/archives.py": ("archive", "إدارة الأرشفة"),
    "routes/archive_pdf.py": ("archive", "إدارة الأرشفة"),
    "routes/faculty_board.py": ("councils", "إدارة اللجان والمجالس"),
    "routes/alumni.py": ("alumni", "إدارة شؤون الخريجين"),
    "routes/roles.py": ("system_users", "إدارة المستخدمين والأدوار والصلاحيات (النظام القديم)"),
    "routes/users.py": ("system_users", "إدارة المستخدمين والأدوار والصلاحيات (النظام القديم)"),
    "routes/auth.py": ("system_users", "إدارة المستخدمين والأدوار والصلاحيات (النظام القديم)"),
    "routes/notifications.py": ("notifications", "إدارة الإشعارات"),
    "routes/weekly_digest.py": ("notifications", "إدارة الإشعارات"),
    "routes/internal_push.py": ("notifications", "إدارة الإشعارات"),
    "routes/admin_tools.py": ("system_tools", "إدارة النظام والإعدادات والتكاملات"),
    "routes/app_versions.py": ("system_tools", "إدارة النظام والإعدادات والتكاملات"),
    "routes/default_credentials.py": ("system_tools", "إدارة النظام والإعدادات والتكاملات"),
    "routes/integration_api.py": ("system_tools", "إدارة النظام والإعدادات والتكاملات"),
    "routes/handoffs.py": ("system_tools", "إدارة النظام والإعدادات والتكاملات"),
    "routes/readonly_guard.py": ("system_tools", "إدارة النظام والإعدادات والتكاملات"),
    "routes/assistant.py": ("assistant", "إدارة المساعد الذكي (مرشد الأحقاف)"),
    "routes/assistant_tools.py": ("assistant", "إدارة المساعد الذكي (مرشد الأحقاف)"),
    "routes/assistant_knowledge.py": ("assistant", "إدارة المساعد الذكي (مرشد الأحقاف)"),
    "routes/dashboard.py": ("dashboard", "لوحة القيادة والتقارير الإدارية"),
    "routes/management_dashboard.py": ("dashboard", "لوحة القيادة والتقارير الإدارية"),
    "routes/student_report.py": ("reports", "إدارة التقارير والإحصائيات"),
    "routes/report_pdf.py": ("reports", "إدارة التقارير والإحصائيات"),
    "routes/teacher_workload_pdf.py": ("reports", "إدارة التقارير والإحصائيات"),
    "routes/excuse_form_pdf.py": ("reports", "إدارة التقارير والإحصائيات"),
    "routes/global_search.py": ("general_tools", "أدوات عامة (بحث وتفاصيل الكيانات)"),
    "routes/entity_details.py": ("general_tools", "أدوات عامة (بحث وتفاصيل الكيانات)"),
}
DEFAULT_GROUP = ("misc", "عمليات أخرى غير مصنَّفة")

# تصنيف واجهات server.py (لا تتبع ملف routes مستقل) حسب أول مقطع في المسار بعد /api
SERVER_PATH_SEGMENT_MAP = {
    "students": ("students", "إدارة الطلاب"),
    "teachers": ("teachers", "إدارة أعضاء هيئة التدريس"),
    "courses": ("courses", "إدارة المقررات والشعب"),
    "lectures": ("schedule", "إدارة الجداول والمحاضرات"),
    "schedule": ("schedule", "إدارة الجداول والمحاضرات"),
    "departments": ("academic_structure", "إدارة الهيكل الأكاديمي (الكليات والأقسام)"),
    "faculties": ("academic_structure", "إدارة الهيكل الأكاديمي (الكليات والأقسام)"),
    "semesters": ("academic_structure", "إدارة الهيكل الأكاديمي (الكليات والأقسام)"),
    "university": ("academic_structure", "إدارة الهيكل الأكاديمي (الكليات والأقسام)"),
    "my-institution": ("academic_structure", "إدارة الهيكل الأكاديمي (الكليات والأقسام)"),
    "attendance": ("attendance", "إدارة الحضور والغياب"),
    "enrollments": ("enrollments", "إدارة القبول والتسجيل"),
    "reports": ("reports", "إدارة التقارير والإحصائيات"),
    "export": ("reports", "إدارة التقارير والإحصائيات"),
    "template": ("general_tools", "أدوات عامة (بحث وتفاصيل الكيانات)"),
    "import": ("general_tools", "أدوات عامة (بحث وتفاصيل الكيانات)"),
    "upload": ("general_tools", "أدوات عامة (بحث وتفاصيل الكيانات)"),
    "users": ("system_users", "إدارة المستخدمين والأدوار والصلاحيات (النظام القديم)"),
    "roles": ("system_users", "إدارة المستخدمين والأدوار والصلاحيات (النظام القديم)"),
    "permissions": ("system_users", "إدارة المستخدمين والأدوار والصلاحيات (النظام القديم)"),
    "auth": ("system_users", "إدارة المستخدمين والأدوار والصلاحيات (النظام القديم)"),
    "my-scope": ("system_users", "إدارة المستخدمين والأدوار والصلاحيات (النظام القديم)"),
    "admin": ("system_tools", "إدارة النظام والإعدادات والتكاملات"),
    "settings": ("system_tools", "إدارة النظام والإعدادات والتكاملات"),
    "sync": ("system_tools", "إدارة النظام والإعدادات والتكاملات"),
    "activity-logs": ("system_tools", "إدارة النظام والإعدادات والتكاملات"),
    "trash": ("system_tools", "إدارة النظام والإعدادات والتكاملات"),
    "notifications": ("notifications", "إدارة الإشعارات"),
    "fcm": ("notifications", "إدارة الإشعارات"),
}


def _server_group(path: str):
    parts = path.strip("/").split("/")
    seg = parts[1] if len(parts) > 1 else (parts[0] if parts else "")
    return SERVER_PATH_SEGMENT_MAP.get(seg, DEFAULT_GROUP)

ACTION_KEYWORDS = [
    ("export", ["export", "excel", "/pdf", "download"]),
    ("import", ["import"]),
    ("print", ["print"]),
    ("approve", ["approve", "accept", "reject"]),
    ("publish", ["publish", "send"]),
    ("restore", ["restore"]),
    ("bulk", ["bulk"]),
    ("clone", ["duplicate", "clone", "copy"]),
    ("reset", ["reset"]),
    ("sync", ["sync", "migrate", "migration"]),
    ("verify", ["verify"]),
    ("generate", ["generate"]),
]

CRITICAL_HINTS = ["delete", "purge", "reset-password", "reset_password", "system-tools", "manage-users", "init-admin", "reset-admin"]
HIGH_HINTS = ["fee", "payment", "finance", "grade", "result", "approve", "publish", "bulk", "permission", "role"]


def _operation_type(method: str, path: str) -> str:
    p = path.lower()
    for op, kws in ACTION_KEYWORDS:
        if any(kw in p for kw in kws):
            return op
    if method == "DELETE":
        return "delete"
    if method in ("PUT", "PATCH"):
        return "edit"
    if method == "POST":
        return "add"
    if method == "GET":
        return "view_detail" if "{" in path else "view_list"
    return "other"


def _sensitivity(method: str, path: str, op: str) -> str:
    p = path.lower()
    if op == "delete" or any(h in p for h in CRITICAL_HINTS):
        return "critical" if method == "DELETE" or "system" in p else "high"
    if op in ("approve", "publish", "bulk", "reset") or any(h in p for h in HIGH_HINTS):
        return "high" if op in ("approve", "publish") else "medium"
    if op in ("view_list", "view_detail", "export"):
        return "low"
    return "medium"


def _label_ar(function_name: str, op: str, path: str) -> str:
    OP_LABELS = {
        "view_list": "عرض قائمة", "view_detail": "عرض تفاصيل", "add": "إضافة",
        "edit": "تعديل", "delete": "حذف", "export": "تصدير", "import": "استيراد",
        "print": "طباعة", "approve": "اعتماد/مراجعة", "publish": "نشر/إرسال",
        "restore": "استعادة", "bulk": "عملية جماعية", "clone": "نسخ", "reset": "إعادة تعيين",
        "sync": "مزامنة/ترحيل", "verify": "تحقق", "generate": "توليد", "other": "عملية",
    }
    resource = path.strip("/").split("/")[0].replace("-", " ").replace("_", " ") or function_name
    return f"{OP_LABELS.get(op, 'عملية')} — {resource}"


def build():
    with open(SCAN_PATH, "r", encoding="utf-8") as f:
        endpoints = json.load(f)

    authed = [e for e in endpoints if e["auth_kind"] == "user_auth"]
    excluded_public = [e for e in endpoints if e["auth_kind"] == "public"]
    excluded_service = [e for e in endpoints if e["auth_kind"] == "service_key_auth"]

    groups_seen = {}
    permissions = []
    key_counts = {}
    for e in authed:
        if e["file"] == "server":
            group_key, group_name = _server_group(e["path"])
        else:
            group_key, group_name = FILE_GROUP_MAP.get(e["file"], DEFAULT_GROUP)
        groups_seen[group_key] = group_name
        op = _operation_type(e["method"], e["path"])
        sensitivity = _sensitivity(e["method"], e["path"], op)
        label = _label_ar(e["function"], op, e["path"])
        raw_key = re.sub(r"[^a-z0-9_]", "_", f"{group_key}.{e['file'].split('/')[-1][:-3]}.{e['function']}".lower())
        n = key_counts.get(raw_key, 0)
        key_counts[raw_key] = n + 1
        final_key = raw_key if n == 0 else f"{raw_key}_{n+1}"
        permissions.append({
            "key": final_key,
            "label_ar": label,
            "group_key": group_key,
            "operation_type": op,
            "sensitivity": sensitivity,
            "linked_api": f"{e['method']} {e['path']}",
            "linked_api_method": e["method"],
            "linked_api_path": e["path"],
            "source_file": e["file"],
            "source_function": e["function"],
            "legacy_permissions_detected": e["legacy_permissions_detected"],
            "admin_only_detected": e["admin_only_detected"],
            "is_active": True,
        })

    groups = [{"key": k, "name_ar": v, "count": sum(1 for p in permissions if p["group_key"] == k)} for k, v in sorted(groups_seen.items())]

    with open(GEN_DIR + "/advanced_permissions.json", "w", encoding="utf-8") as f:
        json.dump(permissions, f, ensure_ascii=False, indent=2)
    with open(GEN_DIR + "/advanced_permission_groups.json", "w", encoding="utf-8") as f:
        json.dump(groups, f, ensure_ascii=False, indent=2)
    with open(GEN_DIR + "/excluded_endpoints.json", "w", encoding="utf-8") as f:
        json.dump({
            "public_no_auth": [{"method": e["method"], "path": e["path"], "file": e["file"], "reason": "عام بلا تسجيل دخول بالتصميم (تحقق/تسجيل دخول/صحة النظام)"} for e in excluded_public],
            "service_key_auth": [{"method": e["method"], "path": e["path"], "file": e["file"], "reason": "مصادقة خادم-لخادم بمفتاح خدمة، ليست صلاحية مستخدم بشري"} for e in excluded_service],
        }, f, ensure_ascii=False, indent=2)

    print(f"TOTAL_ENDPOINTS_SCANNED={len(endpoints)}")
    print(f"PERMISSIONS_CREATED={len(permissions)}")
    print(f"GROUPS_CREATED={len(groups)}")
    print(f"EXCLUDED_PUBLIC={len(excluded_public)}")
    print(f"EXCLUDED_SERVICE_KEY={len(excluded_service)}")
    coverage = len(permissions) / len(endpoints) * 100
    print(f"COVERAGE_PCT={coverage:.1f}")
    by_sensitivity = {}
    for p in permissions:
        by_sensitivity[p["sensitivity"]] = by_sensitivity.get(p["sensitivity"], 0) + 1
    print("BY_SENSITIVITY=", by_sensitivity)
    by_op = {}
    for p in permissions:
        by_op[p["operation_type"]] = by_op.get(p["operation_type"], 0) + 1
    print("BY_OPERATION_TYPE=", by_op)
    with_legacy_link = sum(1 for p in permissions if p["legacy_permissions_detected"] or p["admin_only_detected"])
    print(f"WITH_LEGACY_PERMISSION_TRACE={with_legacy_link}")


if __name__ == "__main__":
    build()
