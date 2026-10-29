"""
خدمة مراجعة الأدوار الـ28 والصلاحيات الحساسة الـ116 — Phase 7-B
«المراجعة الشاملة للأدوار والصلاحيات الحساسة»

مستقلة تمامًا عن النظام القديم (routes/deps.py) وعن منظومة التراجع (Phase 6B) — لا تمنح ولا تسحب
أي صلاحية فعلية، ولا تعدّل أي دور/تكليف قديم. كل الحقول "المقترحة" (suggested_*) هي اقتراحات للعرض
فقط؛ الحقول "المؤكَّدة" (confirmed_*) لا تُضبط إلا يدويًا من مراجع بشري عبر الواجهة، ولا تُملأ تلقائيًا.
لا يوجد أي اعتماد تلقائي: الاعتماد يتطلب فعلاً صريحًا من مراجع (أو اثنين عند الحاجة لموافقة مزدوجة)،
ويُمنع اعتماد المراجع لدوره/صلاحيته الخاصة.
"""
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId

CATEGORIES = {
    "users_roles_permissions": "إدارة المستخدمين والأدوار والصلاحيات",
    "grades_results": "تعديل درجات الطلاب واعتماد النتائج",
    "delete_student_staff_data": "حذف بيانات الطلاب والموظفين",
    "finance": "إدارة الرسوم والمعاملات المالية",
    "official_correspondence": "إدارة المراسلات الرسمية واعتمادها",
    "passports_residency": "إدارة بيانات الجوازات والإقامات",
    "academic_records_attendance": "تعديل السجلات الأكاديمية والحضور",
    "system_settings_integrations": "إدارة إعدادات النظام ومفاتيح التكامل",
    "other": "أخرى / متنوعة",
}

ROLE_CATEGORIES = {
    "administrative": "إدارية",
    "academic": "أكاديمية",
    "educational": "تعليمية",
    "financial": "مالية",
    "student_affairs": "شؤون طلاب",
    "technical": "تقنية",
    "mixed": "مشتركة",
}

SCOPE_OPTIONS = {
    "university": "الجامعة",
    "faculty": "الكلية",
    "department": "القسم",
    "program": "البرنامج",
    "course": "المقرر",
    "unit": "الوحدة الإدارية",
}

LEGACY_SCOPE_MAP = {"university": "university", "faculty": "faculty", "department": "department", "assigned_courses": "course"}

STATUSES = ["not_reviewed", "in_review", "needs_changes", "ready_for_approval"]
DELETE_SENSITIVE_GROUPS = ("students", "hr_core", "hr_attendance", "hr_leaves", "hr_tasks")


def _now():
    return datetime.now(timezone.utc)


def categorize_permission(p: dict) -> str:
    group = p.get("group_key")
    op = p.get("operation_type")
    if op == "delete" and group in DELETE_SENSITIVE_GROUPS:
        return "delete_student_staff_data"
    if group == "system_users":
        return "users_roles_permissions"
    if group == "grades":
        return "grades_results"
    if group == "finance":
        return "finance"
    if group in ("letters", "correspondence"):
        return "official_correspondence"
    if group in ("attendance", "academic_structure"):
        return "academic_records_attendance"
    if group == "system_tools":
        return "system_settings_integrations"
    return "other"


def suggest_role_category(name: str) -> str:
    name = name or ""
    if "مالي" in name:
        return "financial"
    if any(k in name for k in ["تسجيل", "قبول", "طلاب"]):
        return "student_affairs"
    if any(k in name for k in ["نظام", "تقني", "مهندس", "استيراد"]):
        return "technical"
    if any(k in name for k in ["مدرس", "تدريس"]):
        return "educational"
    if any(k in name for k in ["مشرف قسم", "مشرف مقرر"]):
        return "academic"
    if any(k in name for k in ["موظف", "مدير", "عميد", "رئيس", "مسؤول", "سكرتير", "أخصائي", "مراقب", "مدقق"]):
        return "administrative"
    return "mixed"


async def _build_legacy_coverage_raw(db):
    covered = []
    async for p in db.advanced_permissions.find({}, {"legacy_permissions_detected": 1}):
        covered.extend(p.get("legacy_permissions_detected") or [])
    return covered


async def _resolve_role_linked_users(db, legacy_role_id: str, system_key: Optional[str]):
    or_clauses = [{"role_id": legacy_role_id}]
    if system_key:
        or_clauses.append({"role_id": {"$in": [None, ""]}, "role": system_key})
    users = await db.users.find({"$or": or_clauses}, {"username": 1, "full_name": 1, "role": 1}).to_list(500)
    return [{"id": str(u["_id"]), "username": u.get("username"), "full_name": u.get("full_name")} for u in users]


async def seed_role_reviews(db) -> int:
    sensitive_keys = {p["key"] async for p in db.advanced_permissions.find({"sensitivity": {"$in": ["critical", "high"]}}, {"key": 1})}
    admin_only_keys = {p["key"] async for p in db.advanced_permissions.find({"admin_only_detected": True}, {"key": 1})}
    covered_raw = await _build_legacy_coverage_raw(db)

    count = 0
    async for role in db.advanced_roles.find({"imported_from_legacy_role_id": {"$ne": None}}):
        legacy_role_id = role["imported_from_legacy_role_id"]
        try:
            legacy_role = await db.roles.find_one({"_id": ObjectId(legacy_role_id)})
        except Exception:
            legacy_role = None
        if not legacy_role:
            continue
        system_key = legacy_role.get("system_key")
        linked_users = await _resolve_role_linked_users(db, legacy_role_id, system_key)
        perm_keys = role.get("permission_keys") or []
        legacy_keys = role.get("legacy_permission_keys") or []
        sensitive_linked = sorted(set(perm_keys) & sensitive_keys)
        excess_flags = [
            {"key": k, "reason": "مكتشف أنه حصري للأدمن في الكود القديم (admin_only_detected)"}
            for k in perm_keys if k in admin_only_keys and system_key != "admin"
        ]
        missing_coverage = [lk for lk in legacy_keys if not any(lk in raw for raw in covered_raw)]
        doc = {
            "legacy_role_id": legacy_role_id,
            "legacy_role_name": legacy_role.get("name"),
            "legacy_role_system_key": system_key,
            "advanced_role_key": role["key"],
            "linked_users_count": len(linked_users),
            "linked_users": linked_users,
            "permission_keys_count": len(perm_keys),
            "legacy_permission_keys_count": len(legacy_keys),
            "sensitive_linked": sensitive_linked,
            "sensitive_linked_count": len(sensitive_linked),
            "excess_flags": excess_flags,
            "excess_flags_count": len(excess_flags),
            "missing_coverage": missing_coverage,
            "missing_coverage_count": len(missing_coverage),
            "suggested_category": suggest_role_category(legacy_role.get("name") or ""),
            "suggested_scope": LEGACY_SCOPE_MAP.get(legacy_role.get("scope")),
            "computed_at": _now(),
        }
        await db.advanced_role_reviews.update_one(
            {"_id": role["key"]},
            {
                "$set": doc,
                "$setOnInsert": {
                    "_id": role["key"], "confirmed_category": None, "confirmed_scope": None,
                    "status": "not_reviewed", "notes": [], "approvals": [], "approved": False,
                    "reviewed_by": None, "reviewed_at": None, "created_at": _now(),
                },
            },
            upsert=True,
        )
        count += 1
    return count


async def seed_sensitive_permission_reviews(db) -> int:
    count = 0
    async for p in db.advanced_permissions.find({"sensitivity": {"$in": ["critical", "high"]}}):
        category = categorize_permission(p)
        default_dual = p.get("sensitivity") == "critical"
        doc = {
            "permission_key": p["key"], "label_ar": p.get("label_ar"), "group_key": p.get("group_key"),
            "sensitivity": p.get("sensitivity"), "admin_only_detected": p.get("admin_only_detected", False),
            "category": category, "computed_at": _now(),
        }
        await db.advanced_sensitive_permission_reviews.update_one(
            {"_id": p["key"]},
            {
                "$set": doc,
                "$setOnInsert": {
                    "_id": p["key"], "allowed_role_keys": [], "recommended_scope": None,
                    "requires_dual_approval": default_dual, "requires_audit_log": True, "status": "not_reviewed",
                    "notes": [], "approvals": [], "approved": False, "reviewed_by": None, "reviewed_at": None,
                    "created_at": _now(),
                },
            },
            upsert=True,
        )
        count += 1
    return count


async def resolve_current_user_advanced_role_key(db, current_user: dict) -> Optional[str]:
    if current_user.get("role_id"):
        return f"legacy_{current_user['role_id']}"
    role_doc = await db.roles.find_one({"system_key": current_user.get("role")})
    if role_doc:
        return f"legacy_{role_doc['_id']}"
    return None


async def write_review_audit_log(db, actor: dict, action: str, target_type: str, target_id: str,
                                  reason: Optional[str] = None, before=None, after=None):
    await db.advanced_role_review_audit_logs.insert_one({
        "actor_user_id": str(actor.get("id") or actor.get("_id")),
        "actor_username": actor.get("username"),
        "action": action, "target_type": target_type, "target_id": target_id,
        "reason": reason, "before": before, "after": after, "timestamp": _now(),
    })


async def ensure_review_indexes(db):
    await db.advanced_role_review_audit_logs.create_index([("timestamp", -1)])
