"""
التحكم والتراجع الآمن لمركز الصلاحيات المتقدم — Phase 6B (Feature Flags + Emergency Kill Switch)
مسار مستقل تمامًا تحت /api/advanced-access/rollback/* — لا يُستدعى من أي مسار قديم، ولا يُغيّر سلوك
أي API قديم. التفعيل الفعلي مقفل برمجيًا (ACTIVATION_LOCKED_PHASE6B) حتى موافقة منفصلة لاحقة.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from .deps import get_db
from .advanced_access import require_adv_access
from models.feature_flags import MasterFlagUpdate, ScopeActivationRequest, SimulateRollbackRequest
from services.feature_flag_service import (
    get_flags_doc, kill_switch_engaged, ACTIVATION_LOCKED_PHASE6B,
    evaluate_rollback_decision, write_rollback_audit_log,
)

router = APIRouter(prefix="/advanced-access/rollback", tags=["التحكم والتراجع الآمن (Phase 6B)"])


def _ser(d: dict) -> dict:
    d = dict(d)
    d["id"] = str(d.pop("_id"))
    return d


@router.get("/status")
async def rollback_status(current_user: dict = Depends(require_adv_access("view"))):
    db = get_db()
    flags = await get_flags_doc(db)
    return {
        "emergency_kill_switch_engaged": kill_switch_engaged(),
        "activation_locked": ACTIVATION_LOCKED_PHASE6B,
        "master_enabled": flags.get("master_enabled", False),
        "scoped_activations": flags.get("scoped_activations", []),
        "updated_by_username": flags.get("updated_by_username"),
        "updated_at": flags.get("updated_at"),
        "last_reason": flags.get("last_reason"),
        "effective_decision_source": "legacy",
        "note": "النظام القديم هو المصدر الوحيد الفعلي لقرارات الصلاحيات حاليًا بصرف النظر عن أي قيمة أعلاه، بسبب القفل البرمجي (activation_locked).",
    }


@router.put("/master")
async def update_master_flag(data: MasterFlagUpdate, current_user: dict = Depends(require_adv_access("manage_rollback"))):
    if not data.reason or not data.reason.strip():
        raise HTTPException(status_code=400, detail="سبب التغيير إلزامي")
    db = get_db()
    before = await get_flags_doc(db)
    now = datetime.now(timezone.utc)
    await db.advanced_access_feature_flags.update_one(
        {"_id": "singleton"},
        {"$set": {
            "master_enabled": data.enabled,
            "updated_by": current_user["id"],
            "updated_by_username": current_user.get("username"),
            "updated_at": now,
            "last_reason": data.reason,
        }},
        upsert=True,
    )
    await write_rollback_audit_log(
        db, current_user, "master_flag_updated", reason=data.reason,
        before=before.get("master_enabled"), after=data.enabled,
    )
    return {
        "message": "تم تحديث المفتاح المركزي في قاعدة البيانات.",
        "activation_locked": True,
        "note": "هذا التغيير لا يُفعِّل أي وصول فعلي — التفعيل يبقى مقفلاً برمجيًا (activation_locked=true) حتى صدور موافقة منفصلة لاحقة وتعديل الكود صراحةً.",
    }


@router.post("/scope-activation")
async def attempt_scope_activation(data: ScopeActivationRequest, current_user: dict = Depends(require_adv_access("manage_rollback"))):
    """محاولة تفعيل نطاق (مستخدم/قسم/كلية/وحدة) — مرفوضة دائمًا في هذه المرحلة. تُسجَّل المحاولة دائمًا."""
    db = get_db()
    await write_rollback_audit_log(
        db, current_user, "scope_activation_attempt_rejected", reason=data.reason,
        after={"scope_type": data.scope_type, "ref_id": data.ref_id},
    )
    raise HTTPException(
        status_code=423,
        detail="التفعيل الفعلي مقفل برمجيًا في هذه المرحلة (Phase 6B) — لن يُفعَّل أي مستخدم أو وحدة تنظيمية إلا بعد موافقة صريحة منفصلة وتعديل الكود.",
    )


@router.get("/audit")
async def rollback_audit(limit: int = 100, current_user: dict = Depends(require_adv_access("view_audit"))):
    db = get_db()
    logs = await db.advanced_rollback_audit_logs.find({}).sort("timestamp", -1).limit(min(limit, 500)).to_list(500)
    return [_ser(logv) for logv in logs]


@router.post("/simulate")
async def simulate_decision(data: SimulateRollbackRequest, current_user: dict = Depends(require_adv_access("run_tests"))):
    """محاكاة قرار مصدر الصلاحية لمستخدم/نطاق افتراضي — للعرض والتحقق فقط، لا تؤثر على أي شيء حقيقي."""
    db = get_db()
    return await evaluate_rollback_decision(
        db, user_id=data.user_id, department_id=data.department_id,
        faculty_id=data.faculty_id, unit_id=data.unit_id,
    )
