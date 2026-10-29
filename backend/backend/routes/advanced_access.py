"""
مركز الصلاحيات المتقدم — Advanced Access Control (SHADOW MODE)
مسار مستقل تمامًا: /api/advanced-access/* — لا يُستخدم في أي قرار وصول حقيقي بالنظام القديم.
الوصول محصور بالأدمن أو مستخدمين مصرَّح لهم صراحة عبر advanced_access_testers (انظر has_sub_permission).
"""
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId

from .deps import get_db, get_current_user
from models.advanced_access import (
    AdvancedRoleCreate, AdvancedRoleUpdate, AssignmentCreate, TesterGrant, CheckPermissionRequest,
)
from services.advanced_access_service import (
    seed_permission_registry, create_advanced_access_indexes, import_legacy_roles_reference,
    has_sub_permission, compute_effective_permissions, check_permission,
    list_user_work_contexts, write_audit_log, SUB_PERMISSIONS,
)

router = APIRouter(prefix="/advanced-access", tags=["مركز الصلاحيات المتقدم (تجريبي)"])


def require_adv_access(sub_permission: Optional[str] = None):
    async def _dep(current_user: dict = Depends(get_current_user)):
        db = get_db()
        if not await has_sub_permission(db, current_user, sub_permission):
            raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى مركز الصلاحيات المتقدم (تجريبي)")
        return current_user
    return _dep


def _oid(v: str, what: str = "المعرّف"):
    if not v or not ObjectId.is_valid(v):
        raise HTTPException(status_code=400, detail=f"{what} غير صحيح")
    return ObjectId(v)


def _ser(d: dict) -> dict:
    d = dict(d)
    d["id"] = str(d.pop("_id"))
    return d


# ══════════════ سجل الصلاحيات والمجموعات ══════════════

@router.get("/permissions")
async def list_permissions(group_key: Optional[str] = None, current_user: dict = Depends(require_adv_access("view"))):
    db = get_db()
    q = {"is_active": True}
    if group_key:
        q["group_key"] = group_key
    return await db.advanced_permissions.find(q, {"_id": 0}).to_list(2000)


@router.get("/permission-groups")
async def list_permission_groups(current_user: dict = Depends(require_adv_access("view"))):
    db = get_db()
    return await db.advanced_permission_groups.find({}, {"_id": 0}).to_list(200)


@router.post("/seed-registry")
async def seed_registry(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="للأدمن فقط")
    db = get_db()
    await create_advanced_access_indexes(db)
    result = await seed_permission_registry(db)
    await write_audit_log(db, current_user, "permission_registry_seeded", after=result)
    return result


@router.post("/import-legacy-roles")
async def import_legacy_roles(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="للأدمن فقط")
    db = get_db()
    result = await import_legacy_roles_reference(db)
    await write_audit_log(db, current_user, "legacy_roles_imported", after=result)
    return result


# ══════════════ الأدوار المتقدمة (تجريبية) ══════════════

@router.get("/roles")
async def list_advanced_roles(current_user: dict = Depends(require_adv_access("view"))):
    db = get_db()
    return [_ser(r) async for r in db.advanced_roles.find({})]


@router.get("/roles/{role_id}")
async def get_advanced_role(role_id: str, current_user: dict = Depends(require_adv_access("view"))):
    db = get_db()
    role = await db.advanced_roles.find_one({"_id": _oid(role_id, "الدور")})
    if not role:
        raise HTTPException(status_code=404, detail="الدور غير موجود")
    return _ser(role)


@router.post("/roles")
async def create_advanced_role(data: AdvancedRoleCreate, current_user: dict = Depends(require_adv_access("manage_roles"))):
    db = get_db()
    valid_keys = {p["key"] for p in await db.advanced_permissions.find({"is_active": True}, {"key": 1}).to_list(2000)}
    invalid = [k for k in data.permission_keys if k not in valid_keys]
    if invalid:
        raise HTTPException(status_code=400, detail=f"صلاحيات غير معروفة: {invalid[:5]}")
    doc = {
        "key": None, "name_ar": data.name_ar, "description": data.description or "",
        "permission_keys": data.permission_keys, "status": "draft", "is_system": False,
        "imported_from_legacy_role_id": None,
        "created_at": datetime.now(timezone.utc), "created_by": current_user["id"],
        "updated_at": datetime.now(timezone.utc),
    }
    res = await db.advanced_roles.insert_one(doc)
    await db.advanced_roles.update_one({"_id": res.inserted_id}, {"$set": {"key": f"custom_{res.inserted_id}"}})
    await write_audit_log(db, current_user, "advanced_role_created", after={"role_id": str(res.inserted_id), **data.dict()})
    return {"id": str(res.inserted_id)}


@router.put("/roles/{role_id}")
async def update_advanced_role(role_id: str, data: AdvancedRoleUpdate, current_user: dict = Depends(require_adv_access("manage_roles"))):
    db = get_db()
    role = await db.advanced_roles.find_one({"_id": _oid(role_id, "الدور")})
    if not role:
        raise HTTPException(status_code=404, detail="الدور غير موجود")
    update = {k: v for k, v in data.dict(exclude_unset=True).items()}
    if "status" in update and update["status"] not in ("draft", "shadow", "ready_for_review"):
        raise HTTPException(status_code=400, detail="حالة غير صالحة (draft/shadow/ready_for_review فقط — لا حالة إنتاج ضمن هذا المشروع)")
    update["updated_at"] = datetime.now(timezone.utc)
    await db.advanced_roles.update_one({"_id": role["_id"]}, {"$set": update})
    await write_audit_log(db, current_user, "advanced_role_updated", before=role.get("permission_keys"), after=update)
    return {"message": "تم التحديث"}


# ══════════════ نطاقات متاحة (تُقرأ مباشرة — تدعم وحدات مستقبلية تلقائيًا) ══════════════

@router.get("/scope-options/{scope_type}")
async def scope_options(scope_type: str, current_user: dict = Depends(require_adv_access("view"))):
    db = get_db()
    if scope_type in ("faculty", "multi_faculty"):
        items = await db.faculties.find({}, {"name": 1}).to_list(500)
    elif scope_type in ("department", "multi_department"):
        items = await db.departments.find({}, {"name": 1, "faculty_id": 1}).to_list(1000)
    elif scope_type in ("unit", "multi_unit"):
        items = await db.org_units.find({"is_active": {"$ne": False}}, {"name": 1, "type": 1}).to_list(2000)
    elif scope_type == "course":
        items = await db.courses.find({}, {"name": 1}).to_list(5000)
    else:
        return []
    return [{"id": str(i["_id"]), "name": i.get("name", "")} for i in items]


# ══════════════ التكليفات المتعددة (الجوهر الفعلي لتعدد المناصب) ══════════════

@router.get("/users/{user_id}/assignments")
async def get_user_assignments(user_id: str, current_user: dict = Depends(require_adv_access("view"))):
    db = get_db()
    return await list_user_work_contexts(db, user_id, active_only=False)


@router.get("/users/{user_id}/contexts")
async def get_user_active_contexts(user_id: str, current_user: dict = Depends(require_adv_access("context_switch"))):
    """سياقات العمل المتاحة فعليًا للتبديل بينها (التكليفات النشطة فقط)"""
    db = get_db()
    return await list_user_work_contexts(db, user_id, active_only=True)


@router.post("/assignments")
async def create_assignment(data: AssignmentCreate, current_user: dict = Depends(require_adv_access("manage_assignments"))):
    db = get_db()
    if not await db.users.find_one({"_id": _oid(data.user_id, "المستخدم")}):
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    if not await db.advanced_roles.find_one({"_id": _oid(data.advanced_role_id, "الدور")}):
        raise HTTPException(status_code=404, detail="الدور المتقدم غير موجود")
    doc = {
        "user_id": data.user_id,
        "assignment_type": data.assignment_type,
        "advanced_role_id": data.advanced_role_id,
        "context_label_ar": data.context_label_ar,
        "scope": data.scope.dict(),
        "direct_permissions": [dp.dict() for dp in data.direct_permissions],
        "status": "active",
        "started_at": data.started_at or datetime.now(timezone.utc),
        "ended_at": data.ended_at,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc),
    }
    res = await db.advanced_user_assignments.insert_one(doc)
    audit_doc = {k: v for k, v in doc.items() if k != "_id"}
    await write_audit_log(db, current_user, "assignment_created", target_user_id=data.user_id, assignment_id=str(res.inserted_id), after=audit_doc)
    return {"id": str(res.inserted_id)}


@router.post("/assignments/{assignment_id}/end")
async def end_assignment(assignment_id: str, current_user: dict = Depends(require_adv_access("manage_assignments"))):
    db = get_db()
    assignment = await db.advanced_user_assignments.find_one({"_id": _oid(assignment_id, "التكليف")})
    if not assignment:
        raise HTTPException(status_code=404, detail="التكليف غير موجود")
    now = datetime.now(timezone.utc)
    await db.advanced_user_assignments.update_one({"_id": assignment["_id"]}, {"$set": {"status": "ended", "ended_at": now}})
    await write_audit_log(db, current_user, "assignment_ended", target_user_id=assignment["user_id"], assignment_id=assignment_id, before=assignment.get("status"), after="ended")
    return {"message": "تم إنهاء التكليف — بقية تكليفات المستخدم لم تتأثر"}


@router.get("/assignments/{assignment_id}/context")
async def get_assignment_context(assignment_id: str, current_user: dict = Depends(require_adv_access("context_switch"))):
    """تفاصيل سياق العمل عند اختيار هذا التكليف — للعرض فقط، لا يغيّر أي توكن حقيقي"""
    db = get_db()
    assignment = await db.advanced_user_assignments.find_one({"_id": _oid(assignment_id, "التكليف")})
    if not assignment:
        raise HTTPException(status_code=404, detail="التكليف غير موجود")
    role = await db.advanced_roles.find_one({"_id": ObjectId(assignment["advanced_role_id"])}) if ObjectId.is_valid(assignment["advanced_role_id"]) else None
    effective = await compute_effective_permissions(db, assignment)
    await write_audit_log(db, current_user, "context_switched", target_user_id=assignment["user_id"], assignment_id=assignment_id)
    return {
        "assignment_id": assignment_id,
        "context_label_ar": assignment.get("context_label_ar"),
        "assignment_type": assignment.get("assignment_type"),
        "role_name_ar": (role or {}).get("name_ar"),
        "scope": assignment.get("scope"),
        "effective_permissions": sorted(effective),
        "status": assignment.get("status"),
    }


# ══════════════ محاكي التحقق (بدائي — للاختبار الخلفي فقط، لا UI بعد) ══════════════

@router.post("/check")
async def run_check(data: CheckPermissionRequest, current_user: dict = Depends(require_adv_access("run_tests"))):
    db = get_db()
    return await check_permission(db, data.user_id, data.assignment_id, data.permission_key, data.target_scope_type, data.target_ref_id)


# ══════════════ المختبرون (الوصول للمركز نفسه) ══════════════

@router.get("/testers")
async def list_testers(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="للأدمن فقط")
    db = get_db()
    return [_ser(t) async for t in db.advanced_access_testers.find({})]


@router.post("/testers")
async def grant_tester(data: TesterGrant, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="للأدمن فقط")
    db = get_db()
    if not await db.users.find_one({"_id": _oid(data.user_id, "المستخدم")}):
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    invalid = [s for s in data.sub_permissions if s not in SUB_PERMISSIONS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"صلاحيات فرعية غير معروفة: {invalid}")
    now = datetime.now(timezone.utc)
    await db.advanced_access_testers.update_one(
        {"user_id": data.user_id},
        {"$set": {"sub_permissions": data.sub_permissions, "is_active": True, "granted_by": current_user["id"], "granted_at": now, "revoked_at": None}},
        upsert=True,
    )
    await write_audit_log(db, current_user, "tester_access_granted", target_user_id=data.user_id, after=data.sub_permissions)
    return {"message": "تم منح الوصول التجريبي"}


@router.delete("/testers/{user_id}")
async def revoke_tester(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="للأدمن فقط")
    db = get_db()
    await db.advanced_access_testers.update_one({"user_id": user_id}, {"$set": {"is_active": False, "revoked_at": datetime.now(timezone.utc)}})
    await write_audit_log(db, current_user, "tester_access_revoked", target_user_id=user_id)
    return {"message": "تم سحب الوصول التجريبي"}


# ══════════════ سجل التدقيق ══════════════

@router.get("/audit-logs")
async def list_audit_logs(limit: int = 100, current_user: dict = Depends(require_adv_access("view_audit"))):
    db = get_db()
    logs = await db.advanced_permission_audit_logs.find({}).sort("timestamp", -1).limit(min(limit, 500)).to_list(500)
    return [_ser(logv) for logv in logs]
