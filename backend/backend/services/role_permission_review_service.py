"""
خدمة مراجعة الأدوار الـ28 والصلاحيات الحساسة — Phase 7-B
«المراجعة الشاملة للأدوار والصلاحيات الحساسة»

مستقلة تمامًا عن النظام القديم (routes/deps.py) وعن منظومة التراجع (Phase 6B) — لا تمنح ولا تسحب
أي صلاحية فعلية، ولا تعدّل أي دور/تكليف قديم. كل الحقول "المقترحة"/"المرشَّحة" (suggested_*, candidate_*)
هي اقتراحات للعرض فقط؛ الحقول "المؤكَّدة" (confirmed_*, allowed_role_keys) لا تُضبط إلا يدويًا من مراجع
بشري عبر الواجهة، ولا تُملأ تلقائيًا بناءً على تشابه الأسماء. لا يوجد أي اعتماد تلقائي: الاعتماد يتطلب
فعلاً صريحًا من مراجع (أو اثنين عند الحاجة لموافقة مزدوجة)، ويُمنع اعتماد المراجع لدوره/صلاحيته الخاصة.
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
DECISIONS = ["pending", "approved", "rejected"]
DELETE_SENSITIVE_GROUPS = ("students", "hr_core", "hr_attendance", "hr_leaves", "hr_tasks")
# عمليات نشر/اعتماد النتائج النهائية موجودة فعليًا في مجموعات courses/academic_structure/general_tools
# (وليس ضمن مجموعة grades نفسها) — أُلحقت هنا صراحةً بتصنيف «الدرجات والنتائج» حسب طلب المستخدم (قرار 29 أكتوبر 2026)
GRADES_RESULTS_EXTRA_KEYS = {
    "courses_ser_send_final_results_json",
    "courses_ser_send_final_results_upload",
    "academic_structure_ser_send_department_final_results_upload",
    "general_tools_ser_get_department_final_results_template",
    "general_tools_ser_get_final_results_template",
}

RISK_LABELS = {"critical": "عالية جدًا", "high": "عالية", "medium": "متوسطة", "low": "منخفضة"}


def _now():
    return datetime.now(timezone.utc)


def categorize_permission(p: dict) -> str:
    key = p.get("key")
    group = p.get("group_key")
    op = p.get("operation_type")
    if key in GRADES_RESULTS_EXTRA_KEYS or group == "grades":
        return "grades_results"
    if op == "delete" and group in DELETE_SENSITIVE_GROUPS:
        return "delete_student_staff_data"
    if group == "system_users":
        return "users_roles_permissions"
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


def role_required_approvals(doc: dict) -> int:
    return 2 if (doc.get("sensitive_linked_count") or 0) > 0 else 1


def permission_required_approvals(doc: dict) -> int:
    return 2 if doc.get("requires_dual_approval") else 1


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


def _excess_reason_and_risk(perm_doc: dict) -> dict:
    sens = (perm_doc or {}).get("sensitivity", "medium")
    return {
        "label_ar": (perm_doc or {}).get("label_ar"),
        "operation_type": (perm_doc or {}).get("operation_type"),
        "sensitivity": sens,
        "risk": RISK_LABELS.get(sens, "متوسطة"),
        "recommendation": "يوصى بمراجعة الحاجة الفعلية لهذه الصلاحية ضمن مسؤوليات الدور، مع تضييق نطاقها (بدل سحبها بالكامل) إن تبيّن أنها تتجاوز صلاحيات الدور القديم المرجعي.",
    }


async def seed_role_reviews(db) -> int:
    sensitive_keys = {p["key"] async for p in db.advanced_permissions.find({"sensitivity": {"$in": ["critical", "high"]}}, {"key": 1})}
    admin_only_docs = {p["key"]: p async for p in db.advanced_permissions.find({"admin_only_detected": True})}
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
            {"key": k, "reason": "مكتشف أنه حصري للأدمن في الكود القديم (admin_only_detected)", **_excess_reason_and_risk(admin_only_docs.get(k)), "role_current_scope": LEGACY_SCOPE_MAP.get(legacy_role.get("scope"))}
            for k in perm_keys if k in admin_only_docs and system_key != "admin"
        ]
        missing_coverage = [lk for lk in legacy_keys if not any(lk in raw for raw in covered_raw)]

        old = await db.advanced_role_reviews.find_one({"_id": role["key"]}) or {}
        old_decisions = old.get("permission_decisions") or {}
        permission_decisions = {k: old_decisions.get(k) or {"decision": "pending", "note": None, "by_username": None, "at": None} for k in perm_keys}
        decided_count = sum(1 for v in permission_decisions.values() if v["decision"] != "pending")
        completion_percentage = round(decided_count / len(permission_decisions) * 100) if permission_decisions else 0

        usage_status = "active_in_use" if linked_users else "unused_pending_review"
        usage_note = (
            f"مستخدَم حاليًا من {len(linked_users)} مستخدم(ين)" if linked_users
            else "لا يوجد مستخدم مرتبط حاليًا بهذا الدور. لا تتوفر بيانات استخدام تاريخي موثوقة (لا يوجد سجل بتغييرات تكليف الأدوار عبر الزمن) — القرار بالإبقاء أو الدمج أو الإلغاء متروك لمدير النظام."
        )

        doc = {
            "legacy_role_id": legacy_role_id,
            "legacy_role_name": legacy_role.get("name"),
            "legacy_role_system_key": system_key,
            "advanced_role_key": role["key"],
            "linked_users_count": len(linked_users),
            "linked_users": linked_users,
            "permission_keys_count": len(perm_keys),
            "legacy_permission_keys_count": len(legacy_keys),
            "legacy_permission_keys": legacy_keys,
            "sensitive_linked": sensitive_linked,
            "sensitive_linked_count": len(sensitive_linked),
            "excess_flags": excess_flags,
            "excess_flags_count": len(excess_flags),
            "missing_coverage": missing_coverage,
            "missing_coverage_count": len(missing_coverage),
            "suggested_category": suggest_role_category(legacy_role.get("name") or ""),
            "suggested_scope": LEGACY_SCOPE_MAP.get(legacy_role.get("scope")),
            "usage_status": usage_status,
            "usage_note": usage_note,
            "has_zero_mapped_permissions": len(perm_keys) == 0,
            "role_definition_created_at": legacy_role.get("created_at"),
            "role_definition_updated_at": legacy_role.get("updated_at"),
            "permission_decisions": permission_decisions,
            "completion_percentage": completion_percentage,
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
    role_perm_map: dict = {}
    role_name_map: dict = {}
    legacy_ids = []
    roles_cache = []
    async for role in db.advanced_roles.find({"imported_from_legacy_role_id": {"$ne": None}}):
        roles_cache.append(role)
        legacy_ids.append(role["imported_from_legacy_role_id"])
        for k in (role.get("permission_keys") or []):
            role_perm_map.setdefault(k, []).append(role["key"])
    legacy_roles = {}
    try:
        async for lr in db.roles.find({"_id": {"$in": [ObjectId(i) for i in legacy_ids]}}, {"name": 1}):
            legacy_roles[str(lr["_id"])] = lr.get("name")
    except Exception:
        pass
    for role in roles_cache:
        role_name_map[role["key"]] = legacy_roles.get(role["imported_from_legacy_role_id"], role.get("name_ar"))

    count = 0
    async for p in db.advanced_permissions.find({"sensitivity": {"$in": ["critical", "high"]}}):
        category = categorize_permission(p)
        default_dual = p.get("sensitivity") == "critical"
        candidate_role_keys = sorted(set(role_perm_map.get(p["key"], [])))
        candidate_role_names = [role_name_map.get(k, k) for k in candidate_role_keys]

        old = await db.advanced_sensitive_permission_reviews.find_one({"_id": p["key"]}) or {}
        allowed = old.get("allowed_role_keys") or []
        recommended_scope = old.get("recommended_scope")
        status = old.get("status", "not_reviewed")
        completion_percentage = round(sum([bool(allowed), bool(recommended_scope), status != "not_reviewed"]) / 3 * 100)

        doc = {
            "permission_key": p["key"], "label_ar": p.get("label_ar"), "group_key": p.get("group_key"),
            "sensitivity": p.get("sensitivity"), "admin_only_detected": p.get("admin_only_detected", False),
            "category": category, "candidate_role_keys": candidate_role_keys, "candidate_role_names": candidate_role_names,
            "completion_percentage": completion_percentage, "computed_at": _now(),
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


async def set_permission_decision(db, role_key: str, perm_key: str, decision: str, note: Optional[str], by_username: str):
    entry = {"decision": decision, "note": note, "by_username": by_username, "at": _now()}
    await db.advanced_role_reviews.update_one({"_id": role_key}, {"$set": {f"permission_decisions.{perm_key}": entry}})
    doc = await db.advanced_role_reviews.find_one({"_id": role_key})
    decisions = doc.get("permission_decisions") or {}
    decided_count = sum(1 for v in decisions.values() if v.get("decision") != "pending")
    completion_percentage = round(decided_count / len(decisions) * 100) if decisions else 0
    await db.advanced_role_reviews.update_one({"_id": role_key}, {"$set": {"completion_percentage": completion_percentage}})
    return await db.advanced_role_reviews.find_one({"_id": role_key})


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
