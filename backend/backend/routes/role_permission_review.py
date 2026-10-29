"""
مراجعة الأدوار الـ28 والصلاحيات الحساسة الـ116 — Phase 7-B
مسار مستقل تحت /api/advanced-access/review/* — لا يُغيّر أي دور/تكليف/صلاحية في النظام القديم،
ولا يُفعِّل أي وصول فعلي. الاعتماد يدوي صراحةً دائمًا (لا اعتماد تلقائي لأي دور أو صلاحية).
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from .deps import get_db
from .advanced_access import require_adv_access
from models.role_review import RoleReviewUpdate, ReviewNote, ApprovalRequest, SensitivePermissionReviewUpdate, PermissionDecisionUpdate
from services.role_permission_review_service import (
    seed_role_reviews, seed_sensitive_permission_reviews, write_review_audit_log,
    resolve_current_user_advanced_role_key, set_permission_decision, role_required_approvals,
    permission_required_approvals, CATEGORIES, ROLE_CATEGORIES, SCOPE_OPTIONS, STATUSES, DECISIONS,
)

router = APIRouter(prefix="/advanced-access/review", tags=["مراجعة الأدوار والصلاحيات (Phase 7-B)"])


def _now():
    return datetime.now(timezone.utc)


def _ser(d: dict, required: int = None) -> dict:
    d = dict(d)
    d["key"] = d.pop("_id")
    if required is not None:
        d["needs_second_approval"] = required > 1 and len(d.get("approvals") or []) == 1 and not d.get("approved")
    return d


@router.get("/meta")
async def review_meta(current_user: dict = Depends(require_adv_access("view"))):
    return {"permission_categories": CATEGORIES, "role_categories": ROLE_CATEGORIES, "scope_options": SCOPE_OPTIONS, "statuses": STATUSES}


@router.get("/summary")
async def review_summary(current_user: dict = Depends(require_adv_access("view"))):
    db = get_db()
    await seed_role_reviews(db)
    await seed_sensitive_permission_reviews(db)
    roles = await db.advanced_role_reviews.find({}).to_list(200)
    perms = await db.advanced_sensitive_permission_reviews.find({}).to_list(200)

    def by_status(items):
        c = {s: 0 for s in STATUSES}
        for it in items:
            c[it.get("status", "not_reviewed")] = c.get(it.get("status", "not_reviewed"), 0) + 1
        return c

    return {
        "roles_total": len(roles),
        "roles_by_status": by_status(roles),
        "roles_approved": sum(1 for r in roles if r.get("approved")),
        "roles_needing_admin_decision": sum(1 for r in roles if not r.get("approved")),
        "roles_reviewed_by_human": sum(1 for r in roles if r.get("status") != "not_reviewed"),
        "roles_pending_review": sum(1 for r in roles if r.get("status") == "not_reviewed"),
        "roles_completion_avg": round(sum(r.get("completion_percentage", 0) for r in roles) / len(roles)) if roles else 0,
        "roles_needing_second_approval": sum(1 for r in roles if role_required_approvals(r) > 1 and len(r.get("approvals") or []) == 1 and not r.get("approved")),
        "roles_with_excess_flags": sum(1 for r in roles if r.get("excess_flags_count", 0) > 0),
        "roles_with_missing_coverage": sum(1 for r in roles if r.get("missing_coverage_count", 0) > 0),
        "roles_unused_pending_review": sum(1 for r in roles if r.get("usage_status") == "unused_pending_review"),
        "roles_with_zero_mapped_permissions": sum(1 for r in roles if r.get("has_zero_mapped_permissions")),
        "sensitive_total": len(perms),
        "sensitive_by_status": by_status(perms),
        "sensitive_approved": sum(1 for p in perms if p.get("approved")),
        "sensitive_reviewed_by_human": sum(1 for p in perms if p.get("status") != "not_reviewed"),
        "sensitive_pending_review": sum(1 for p in perms if p.get("status") == "not_reviewed"),
        "sensitive_completion_avg": round(sum(p.get("completion_percentage", 0) for p in perms) / len(perms)) if perms else 0,
        "sensitive_needing_second_approval": sum(1 for p in perms if permission_required_approvals(p) > 1 and len(p.get("approvals") or []) == 1 and not p.get("approved")),
        "sensitive_without_allowed_roles": sum(1 for p in perms if not p.get("allowed_role_keys")),
        "grades_results_sensitive_count": sum(1 for p in perms if p.get("category") == "grades_results"),
    }


@router.get("/roles")
async def list_role_reviews(current_user: dict = Depends(require_adv_access("view"))):
    db = get_db()
    await seed_role_reviews(db)
    docs = await db.advanced_role_reviews.find({}).sort("legacy_role_name", 1).to_list(200)
    return [_ser(d, role_required_approvals(d)) for d in docs]


@router.get("/roles/{role_key}")
async def get_role_review(role_key: str, current_user: dict = Depends(require_adv_access("view"))):
    db = get_db()
    d = await db.advanced_role_reviews.find_one({"_id": role_key})
    if not d:
        raise HTTPException(404, "الدور غير موجود")
    return _ser(d, role_required_approvals(d))


@router.put("/roles/{role_key}")
async def update_role_review(role_key: str, data: RoleReviewUpdate, current_user: dict = Depends(require_adv_access("manage_role_review"))):
    db = get_db()
    before = await db.advanced_role_reviews.find_one({"_id": role_key})
    if not before:
        raise HTTPException(404, "الدور غير موجود")
    update = {"reviewed_by": current_user.get("username"), "reviewed_at": _now()}
    if data.confirmed_category is not None:
        if data.confirmed_category not in ROLE_CATEGORIES:
            raise HTTPException(400, "تصنيف غير صالح")
        update["confirmed_category"] = data.confirmed_category
    if data.confirmed_scope is not None:
        if data.confirmed_scope not in SCOPE_OPTIONS:
            raise HTTPException(400, "نطاق غير صالح")
        update["confirmed_scope"] = data.confirmed_scope
    if data.status is not None:
        if data.status not in STATUSES:
            raise HTTPException(400, "حالة غير صالحة")
        update["status"] = data.status
    await db.advanced_role_reviews.update_one({"_id": role_key}, {"$set": update})
    await write_review_audit_log(db, current_user, "role_review_updated", "role", role_key,
                                  before={k: before.get(k) for k in update if k in before}, after=update)
    d = await db.advanced_role_reviews.find_one({"_id": role_key})
    return _ser(d, role_required_approvals(d))


@router.post("/roles/{role_key}/permissions/{perm_key}/decision")
async def decide_role_permission(role_key: str, perm_key: str, data: PermissionDecisionUpdate,
                                  current_user: dict = Depends(require_adv_access("manage_role_review"))):
    if data.decision not in DECISIONS:
        raise HTTPException(400, "قرار غير صالح")
    db = get_db()
    role = await db.advanced_role_reviews.find_one({"_id": role_key})
    if not role:
        raise HTTPException(404, "الدور غير موجود")
    if perm_key not in (role.get("permission_decisions") or {}):
        raise HTTPException(404, "هذه الصلاحية ليست ضمن صلاحيات هذا الدور")
    d = await set_permission_decision(db, role_key, perm_key, data.decision, data.note, current_user.get("username"))
    await write_review_audit_log(db, current_user, f"role_permission_decision_{data.decision}", "role_permission", f"{role_key}:{perm_key}", reason=data.note)
    return _ser(d, role_required_approvals(d))


@router.post("/roles/{role_key}/notes")
async def add_role_note(role_key: str, data: ReviewNote, current_user: dict = Depends(require_adv_access("manage_role_review"))):
    if not data.text or not data.text.strip():
        raise HTTPException(400, "نص الملاحظة إلزامي")
    db = get_db()
    note = {"by_id": current_user["id"], "by_username": current_user.get("username"), "text": data.text.strip(), "created_at": _now()}
    res = await db.advanced_role_reviews.update_one({"_id": role_key}, {"$push": {"notes": note}})
    if res.matched_count == 0:
        raise HTTPException(404, "الدور غير موجود")
    await write_review_audit_log(db, current_user, "role_review_note_added", "role", role_key, reason=data.text)
    d = await db.advanced_role_reviews.find_one({"_id": role_key})
    return _ser(d, role_required_approvals(d))


@router.post("/roles/{role_key}/approve")
async def approve_role_review(role_key: str, data: ApprovalRequest, current_user: dict = Depends(require_adv_access("manage_role_review"))):
    if not data.reason or not data.reason.strip():
        raise HTTPException(400, "سبب الاعتماد إلزامي")
    db = get_db()
    doc = await db.advanced_role_reviews.find_one({"_id": role_key})
    if not doc:
        raise HTTPException(404, "الدور غير موجود")
    if doc.get("status") != "ready_for_approval":
        raise HTTPException(400, "يجب أن تكون حالة المراجعة 'جاهز للاعتماد' أولاً قبل الاعتماد")
    linked_ids = {u["id"] for u in (doc.get("linked_users") or [])}
    if current_user["id"] in linked_ids:
        await write_review_audit_log(db, current_user, "role_review_approval_blocked_self", "role", role_key, reason=data.reason)
        raise HTTPException(403, "لا يمكن للمستخدم اعتماد مراجعة دوره الخاص")
    approvals = list(doc.get("approvals") or [])
    if any(a["by_id"] == current_user["id"] for a in approvals):
        raise HTTPException(400, "لقد اعتمدتَ هذه المراجعة مسبقًا — مطلوب موافقة شخص آخر إن كانت موافقة مزدوجة")
    approvals.append({"by_id": current_user["id"], "by_username": current_user.get("username"), "reason": data.reason.strip(), "at": _now()})
    required = role_required_approvals(doc)
    approved = len(approvals) >= required
    await db.advanced_role_reviews.update_one({"_id": role_key}, {"$set": {"approvals": approvals, "approved": approved}})
    await write_review_audit_log(db, current_user, "role_review_approved" if approved else "role_review_partial_approval",
                                  "role", role_key, reason=data.reason, after={"approvals_count": len(approvals), "required": required})
    d = await db.advanced_role_reviews.find_one({"_id": role_key})
    return _ser(d, role_required_approvals(d))


@router.get("/sensitive-permissions")
async def list_sensitive_permission_reviews(current_user: dict = Depends(require_adv_access("view"))):
    db = get_db()
    await seed_sensitive_permission_reviews(db)
    docs = await db.advanced_sensitive_permission_reviews.find({}).sort("permission_key", 1).to_list(200)
    return [_ser(d, permission_required_approvals(d)) for d in docs]


@router.put("/sensitive-permissions/{perm_key}")
async def update_sensitive_permission_review(perm_key: str, data: SensitivePermissionReviewUpdate,
                                               current_user: dict = Depends(require_adv_access("manage_role_review"))):
    db = get_db()
    before = await db.advanced_sensitive_permission_reviews.find_one({"_id": perm_key})
    if not before:
        raise HTTPException(404, "الصلاحية غير موجودة")
    update = {"reviewed_by": current_user.get("username"), "reviewed_at": _now()}
    if data.allowed_role_keys is not None:
        valid_keys = {r["key"] async for r in db.advanced_roles.find({}, {"key": 1})}
        invalid = [k for k in data.allowed_role_keys if k not in valid_keys]
        if invalid:
            raise HTTPException(400, f"أدوار غير معروفة: {invalid}")
        update["allowed_role_keys"] = data.allowed_role_keys
    if data.recommended_scope is not None:
        if data.recommended_scope not in SCOPE_OPTIONS:
            raise HTTPException(400, "نطاق غير صالح")
        update["recommended_scope"] = data.recommended_scope
    if data.requires_dual_approval is not None:
        update["requires_dual_approval"] = data.requires_dual_approval
    if data.requires_audit_log is not None:
        update["requires_audit_log"] = data.requires_audit_log
    if data.status is not None:
        if data.status not in STATUSES:
            raise HTTPException(400, "حالة غير صالحة")
        update["status"] = data.status
    await db.advanced_sensitive_permission_reviews.update_one({"_id": perm_key}, {"$set": update})
    await write_review_audit_log(db, current_user, "sensitive_review_updated", "sensitive_permission", perm_key,
                                  before={k: before.get(k) for k in update if k in before}, after=update)
    d = await db.advanced_sensitive_permission_reviews.find_one({"_id": perm_key})
    return _ser(d, permission_required_approvals(d))


@router.post("/sensitive-permissions/{perm_key}/notes")
async def add_sensitive_permission_note(perm_key: str, data: ReviewNote, current_user: dict = Depends(require_adv_access("manage_role_review"))):
    if not data.text or not data.text.strip():
        raise HTTPException(400, "نص الملاحظة إلزامي")
    db = get_db()
    note = {"by_id": current_user["id"], "by_username": current_user.get("username"), "text": data.text.strip(), "created_at": _now()}
    res = await db.advanced_sensitive_permission_reviews.update_one({"_id": perm_key}, {"$push": {"notes": note}})
    if res.matched_count == 0:
        raise HTTPException(404, "الصلاحية غير موجودة")
    await write_review_audit_log(db, current_user, "sensitive_review_note_added", "sensitive_permission", perm_key, reason=data.text)
    d = await db.advanced_sensitive_permission_reviews.find_one({"_id": perm_key})
    return _ser(d, permission_required_approvals(d))


@router.post("/sensitive-permissions/{perm_key}/approve")
async def approve_sensitive_permission_review(perm_key: str, data: ApprovalRequest, current_user: dict = Depends(require_adv_access("manage_role_review"))):
    if not data.reason or not data.reason.strip():
        raise HTTPException(400, "سبب الاعتماد إلزامي")
    db = get_db()
    doc = await db.advanced_sensitive_permission_reviews.find_one({"_id": perm_key})
    if not doc:
        raise HTTPException(404, "الصلاحية غير موجودة")
    if doc.get("status") != "ready_for_approval":
        raise HTTPException(400, "يجب أن تكون حالة المراجعة 'جاهز للاعتماد' أولاً قبل الاعتماد")
    my_role_key = await resolve_current_user_advanced_role_key(db, current_user)
    if my_role_key and my_role_key in (doc.get("allowed_role_keys") or []):
        await write_review_audit_log(db, current_user, "sensitive_review_approval_blocked_self", "sensitive_permission", perm_key, reason=data.reason)
        raise HTTPException(403, "لا يمكن للمستخدم اعتماد مراجعة صلاحية حساسة هو من ضمن الأدوار المسموح لها بها")
    approvals = list(doc.get("approvals") or [])
    if any(a["by_id"] == current_user["id"] for a in approvals):
        raise HTTPException(400, "لقد اعتمدتَ هذه المراجعة مسبقًا")
    approvals.append({"by_id": current_user["id"], "by_username": current_user.get("username"), "reason": data.reason.strip(), "at": _now()})
    required = permission_required_approvals(doc)
    approved = len(approvals) >= required
    await db.advanced_sensitive_permission_reviews.update_one({"_id": perm_key}, {"$set": {"approvals": approvals, "approved": approved}})
    await write_review_audit_log(db, current_user, "sensitive_review_approved" if approved else "sensitive_review_partial_approval",
                                  "sensitive_permission", perm_key, reason=data.reason, after={"approvals_count": len(approvals), "required": required})
    d = await db.advanced_sensitive_permission_reviews.find_one({"_id": perm_key})
    return _ser(d, permission_required_approvals(d))


@router.get("/audit")
async def review_audit(limit: int = 200, current_user: dict = Depends(require_adv_access("view_audit"))):
    db = get_db()
    logs = await db.advanced_role_review_audit_logs.find({}).sort("timestamp", -1).limit(min(limit, 500)).to_list(500)
    out = []
    for l in logs:
        l = dict(l)
        l["id"] = str(l.pop("_id"))
        out.append(l)
    return out
