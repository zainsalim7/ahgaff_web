"""
خدمة مركز الصلاحيات المتقدم (Advanced Access Control Service) — SHADOW MODE
مستقلة تمامًا عن routes/deps.py::has_permission/require_permission القديمة؛ لا تُستدعى من أي كود قديم،
ولا تستدعي أي دالة كتابة في النظام القديم. قراءة فقط من users/faculties/departments/org_units.
"""
import json
import os
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from bson import ObjectId

GEN_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools", "generated")

SUB_PERMISSIONS = ["view", "context_switch", "manage_roles", "manage_assignments", "manage_permissions", "run_tests", "view_audit", "view_pilot", "manage_rollback", "manage_role_review"]


def _now():
    return datetime.now(timezone.utc)


def _uid(user: dict) -> str:
    return str(user.get("id") or user.get("_id"))


# ══════════════ سجل الصلاحيات (Seeding) ══════════════

async def seed_permission_registry(db) -> Dict[str, Any]:
    """تحميل سجل الصلاحيات المُولَّد من tools/build_advanced_permission_registry.py إلى المجموعات الجديدة.
    عملية idempotent بالكامل (upsert بالمفتاح key) — لا تحذف صلاحيات موجودة لم تعد في المصدر، بل تُعلّمها غير نشطة.
    """
    with open(os.path.join(GEN_DIR, "advanced_permissions.json"), "r", encoding="utf-8") as f:
        permissions = json.load(f)
    with open(os.path.join(GEN_DIR, "advanced_permission_groups.json"), "r", encoding="utf-8") as f:
        groups = json.load(f)

    seen_keys = set()
    upserts = 0
    for p in permissions:
        seen_keys.add(p["key"])
        doc = {**p, "updated_at": _now()}
        res = await db.advanced_permissions.update_one(
            {"key": p["key"]}, {"$set": doc, "$setOnInsert": {"created_at": _now()}}, upsert=True
        )
        if res.upserted_id or res.modified_count:
            upserts += 1

    await db.advanced_permissions.update_many(
        {"key": {"$nin": list(seen_keys)}}, {"$set": {"is_active": False, "updated_at": _now()}}
    )

    group_keys = set()
    for g in groups:
        group_keys.add(g["key"])
        await db.advanced_permission_groups.update_one(
            {"key": g["key"]}, {"$set": {**g, "updated_at": _now()}, "$setOnInsert": {"created_at": _now()}}, upsert=True
        )

    total = await db.advanced_permissions.count_documents({"is_active": True})
    total_groups = await db.advanced_permission_groups.count_documents({"key": {"$in": list(group_keys)}})
    return {"permissions_seeded": len(permissions), "permissions_active_total": total, "groups_seeded": len(groups), "groups_total": total_groups, "touched": upserts}


async def create_advanced_access_indexes(db):
    """فهارس المجموعات الجديدة فقط — لا تمس فهارس النظام القديم."""
    await db.advanced_permissions.create_index("key", unique=True)
    await db.advanced_permissions.create_index("group_key")
    await db.advanced_permission_groups.create_index("key", unique=True)
    await db.advanced_roles.create_index("key")
    await db.advanced_user_assignments.create_index("user_id")
    await db.advanced_user_assignments.create_index("status")
    await db.advanced_access_testers.create_index("user_id", unique=True)
    await db.advanced_permission_audit_logs.create_index([("timestamp", -1)])


# ══════════════ استيراد نسخة مرجعية من الأدوار القديمة (للاختبار فقط) ══════════════

async def _legacy_to_advanced_map(db) -> Dict[str, List[str]]:
    """خريطة عكسية: صلاحية قديمة ← مفاتيح الصلاحيات المتقدمة التي اكتُشف ارتباطها بها كودياً"""
    mapping: Dict[str, List[str]] = {}
    async for p in db.advanced_permissions.find({"is_active": True}, {"key": 1, "legacy_permissions_detected": 1}):
        for legacy_key in p.get("legacy_permissions_detected") or []:
            mapping.setdefault(legacy_key, []).append(p["key"])
    return mapping


async def import_legacy_roles_reference(db) -> Dict[str, Any]:
    """نسخة مرجعية (قراءة فقط من db.roles القديمة) — لا تُعدِّل أي دور قديم، ولا تُفعِّل شيئًا تلقائيًا (status=draft)"""
    from models.permissions import FULL_PERMISSION_MAPPING
    legacy_map = await _legacy_to_advanced_map(db)
    imported, skipped = 0, 0
    async for role in db.roles.find({}):
        legacy_id = str(role["_id"])
        exists = await db.advanced_roles.find_one({"imported_from_legacy_role_id": legacy_id})
        if exists:
            skipped += 1
            continue
        legacy_perms = set(role.get("permissions", []))
        expanded = set(legacy_perms)
        for full_perm, subs in FULL_PERMISSION_MAPPING.items():
            if full_perm in legacy_perms:
                expanded.update(subs)
        candidate_keys = set()
        for lp in expanded:
            candidate_keys.update(legacy_map.get(lp, []))
        await db.advanced_roles.insert_one({
            "key": f"legacy_{legacy_id}",
            "name_ar": f"[مستورد] {role.get('name', '')}",
            "description": f"نسخة مرجعية للاختبار من الدور القديم «{role.get('name', '')}» — مُشتقة تلقائيًا من مطابقة كودية، تحتاج مراجعة قبل الاعتماد",
            "permission_keys": sorted(candidate_keys),
            "legacy_permission_keys": sorted(legacy_perms),
            "status": "draft",
            "is_system": False,
            "imported_from_legacy_role_id": legacy_id,
            "created_at": _now(),
            "updated_at": _now(),
        })
        imported += 1
    return {"imported": imported, "skipped_existing": skipped}


# ══════════════ الوصول للمركز الجديد (Testers Gate) ══════════════

async def get_tester_record(db, user_id: str) -> Optional[dict]:
    return await db.advanced_access_testers.find_one({"user_id": user_id, "is_active": True})


async def has_advanced_access(db, user: dict) -> bool:
    if user.get("role") == "admin":
        return True
    return bool(await get_tester_record(db, _uid(user)))


async def has_sub_permission(db, user: dict, sub_permission: Optional[str]) -> bool:
    if user.get("role") == "admin":
        return True
    if sub_permission is None:
        return await has_advanced_access(db, user)
    tester = await get_tester_record(db, _uid(user))
    if not tester:
        return False
    return sub_permission in (tester.get("sub_permissions") or [])


# ══════════════ محرك حساب الصلاحية الفعّالة وعزل النطاق ══════════════

def _active_direct_permissions(assignment: dict) -> List[str]:
    now = _now()
    out = []
    for dp in assignment.get("direct_permissions") or []:
        exp = dp.get("expires_at")
        if exp and _as_dt(exp) < now:
            continue
        out.append(dp["permission_key"])
    return out


def _as_dt(v):
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    return v


def _is_assignment_active(assignment: dict) -> bool:
    if assignment.get("status") != "active":
        return False
    now = _now()
    started = assignment.get("started_at")
    ended = assignment.get("ended_at")
    if started and _as_dt(started) > now:
        return False
    if ended and _as_dt(ended) <= now:
        return False
    return True


async def compute_effective_permissions(db, assignment: dict) -> set:
    """صلاحيات الدور المرتبط بهذا التكليف فقط + الصلاحيات المباشرة لنفس التكليف فقط (لا تُدمَج تكليفات أخرى)"""
    role_perms = set()
    role = await db.advanced_roles.find_one({"_id": ObjectId(assignment["advanced_role_id"])}) if ObjectId.is_valid(assignment.get("advanced_role_id", "")) else None
    if role:
        role_perms = set(role.get("permission_keys") or [])
    return role_perms | set(_active_direct_permissions(assignment))


def scope_allows(assignment_scope: dict, target_scope_type: Optional[str], target_ref_id: Optional[str]) -> bool:
    """عزل صارم: نطاق تكليف واحد لا يمتد لتكليف آخر أبدًا — هذه الدالة تُقيَّم على تكليف واحد فقط في كل مرة"""
    if not target_scope_type:
        return True
    stype = assignment_scope.get("scope_type")
    if stype == "university":
        return True
    if stype != target_scope_type:
        return False
    if not target_ref_id:
        return True
    return target_ref_id in (assignment_scope.get("scope_ref_ids") or [])


async def check_permission(db, user_id: str, assignment_id: str, permission_key: str,
                            target_scope_type: Optional[str] = None, target_ref_id: Optional[str] = None) -> Dict[str, Any]:
    """التحقق الفعلي (يُعاد حسابه من قاعدة البيانات في كل مرة — لا يُعتمد على اختيار الواجهة)"""
    if not ObjectId.is_valid(assignment_id):
        return {"allowed": False, "reason": "معرّف تكليف غير صالح"}
    assignment = await db.advanced_user_assignments.find_one({"_id": ObjectId(assignment_id)})
    if not assignment:
        return {"allowed": False, "reason": "التكليف غير موجود"}
    if assignment.get("user_id") != user_id:
        return {"allowed": False, "reason": "هذا التكليف لا يخص هذا المستخدم — لا يمكن انتحال تكليف مستخدم آخر"}
    if not _is_assignment_active(assignment):
        return {"allowed": False, "reason": "التكليف غير نشط (منتهٍ أو موقوف أو لم يبدأ بعد)"}
    effective = await compute_effective_permissions(db, assignment)
    if permission_key not in effective:
        return {"allowed": False, "reason": "الصلاحية غير ممنوحة ضمن هذا التكليف تحديدًا", "effective_permissions_count": len(effective)}
    if not scope_allows(assignment.get("scope") or {}, target_scope_type, target_ref_id):
        return {"allowed": False, "reason": "خارج النطاق المصرَّح به لهذا التكليف تحديدًا"}
    return {"allowed": True, "reason": "مسموح", "effective_permissions_count": len(effective)}


async def list_user_work_contexts(db, user_id: str, active_only: bool = True) -> List[dict]:
    q = {"user_id": user_id}
    if active_only:
        q["status"] = "active"
    out = []
    async for a in db.advanced_user_assignments.find(q):
        a["id"] = str(a.pop("_id"))
        if active_only and not _is_assignment_active({**a, "_id": None}):
            continue
        out.append(a)
    return out


async def write_audit_log(db, actor: dict, action: str, target_user_id: Optional[str] = None,
                           assignment_id: Optional[str] = None, before: Any = None, after: Any = None):
    await db.advanced_permission_audit_logs.insert_one({
        "actor_user_id": _uid(actor),
        "actor_username": actor.get("username"),
        "action": action,
        "target_user_id": target_user_id,
        "assignment_id": assignment_id,
        "before": before,
        "after": after,
        "timestamp": _now(),
    })


# ══════════════ مقارنة النظام القديم بالجديد (قراءة فقط — لا تُعدِّل أي قرار قديم) ══════════════

async def compare_decision(db, user_id: str, assignment_id: str, permission_key: str) -> Dict[str, Any]:
    from routes.deps import build_user_context, has_permission as legacy_has_permission

    new_result = await check_permission(db, user_id, assignment_id, permission_key)
    perm_doc = await db.advanced_permissions.find_one({"key": permission_key})
    legacy_keys = (perm_doc or {}).get("legacy_permissions_detected") or []

    if not ObjectId.is_valid(user_id):
        return {"category": "error", "reason": "معرّف مستخدم غير صالح"}
    user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user_doc:
        return {"category": "error", "reason": "المستخدم غير موجود"}

    new_decision = new_result["allowed"]
    if not legacy_keys:
        return {
            "old_decision": None, "new_decision": new_decision, "category": "no_legacy_equivalent",
            "reason": "لا يوجد ربط مكتشف كوديًا بصلاحية قديمة مكافئة لهذه الصلاحية الجديدة",
            "new_reason": new_result.get("reason"),
        }

    built = await build_user_context(db, user_doc)
    old_decision = any(legacy_has_permission(built, lk) for lk in legacy_keys)

    if old_decision and new_decision:
        category = "both_allow"
    elif not old_decision and not new_decision:
        category = "both_deny"
    elif old_decision and not new_decision:
        category = "old_allow_new_deny"
    else:
        category = "new_allow_old_deny"

    return {
        "old_decision": old_decision, "new_decision": new_decision, "category": category,
        "legacy_permissions_checked": legacy_keys, "new_reason": new_result.get("reason"),
    }


async def compare_summary_for_assignment(db, user_id: str, assignment_id: str) -> Dict[str, Any]:
    if not ObjectId.is_valid(assignment_id):
        return {"error": "معرّف تكليف غير صالح"}
    assignment = await db.advanced_user_assignments.find_one({"_id": ObjectId(assignment_id)})
    if not assignment:
        return {"error": "التكليف غير موجود"}
    effective = await compute_effective_permissions(db, assignment)
    comparable_docs = await db.advanced_permissions.find(
        {"key": {"$in": list(effective)}, "legacy_permissions_detected": {"$ne": []}}
    ).to_list(2000)
    comparable_keys = [d["key"] for d in comparable_docs]
    not_comparable_count = len(effective) - len(comparable_keys)

    results = []
    counts = {"both_allow": 0, "both_deny": 0, "old_allow_new_deny": 0, "new_allow_old_deny": 0}
    for key in comparable_keys:
        r = await compare_decision(db, user_id, assignment_id, key)
        results.append({"permission_key": key, **r})
        if r.get("category") in counts:
            counts[r["category"]] += 1

    return {
        "assignment_id": assignment_id,
        "effective_permissions_total": len(effective),
        "comparable_count": len(comparable_keys),
        "not_comparable_count": not_comparable_count,
        "counts": counts,
        "details": results,
    }
