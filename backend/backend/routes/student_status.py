"""
إدارة حالات الطلاب - تخرج / إعادة / فصل / تجميد / مستمر
- POST /api/students/bulk-change-status - تغيير جماعي للحالة
- GET /api/students/{id}/status-history - تاريخ الحالات
- POST /api/students/{id}/change-status - تغيير فردي
"""
from datetime import datetime, timezone
from typing import Optional, List

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .deps import get_current_user, get_db


router = APIRouter(tags=["حالات الطلاب"])


# ==================== Constants ====================

VALID_STATUSES = {"active", "repeat", "graduated", "expelled", "frozen"}

STATUS_LABELS = {
    "active": "مستمر",
    "repeat": "إعادة",
    "graduated": "متخرج",
    "expelled": "مفصول",
    "frozen": "مجمَّد",
}

# الحالات التي تجعل is_active=False
INACTIVE_STATUSES = {"graduated", "expelled", "frozen"}


# ==================== Models ====================

class BulkChangeStatusRequest(BaseModel):
    student_ids: List[str] = Field(..., min_length=1)
    new_status: str
    new_level: Optional[int] = None  # اختياري - للنقل مع تغيير الحالة
    reason: Optional[str] = ""
    effective_date: Optional[str] = None  # ISO date - افتراضي: الآن


class SingleChangeStatusRequest(BaseModel):
    new_status: str
    new_level: Optional[int] = None
    reason: Optional[str] = ""
    effective_date: Optional[str] = None


# ==================== Helpers ====================

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_status(status: str) -> str:
    if status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"حالة غير صحيحة: '{status}'. القيم المقبولة: {', '.join(VALID_STATUSES)}"
        )
    return status


async def _apply_status_change(
    db,
    student_id: str,
    new_status: str,
    new_level: Optional[int],
    reason: str,
    effective_date: str,
    user_id: str,
    username: str,
) -> dict:
    """تطبيق تغيير الحالة على طالب واحد + تسجيل التاريخ."""
    try:
        oid = ObjectId(student_id)
    except Exception:
        return {"id": student_id, "ok": False, "error": "معرف غير صحيح"}

    student = await db.students.find_one({"_id": oid})
    if not student:
        return {"id": student_id, "ok": False, "error": "الطالب غير موجود"}

    old_status = student.get("status") or ("active" if student.get("is_active", True) else "inactive")
    old_level = student.get("level")

    update_data = {
        "status": new_status,
        "status_changed_at": effective_date,
        "status_changed_by": user_id,
    }
    if reason:
        update_data["status_reason"] = reason

    # ضبط is_active حسب الحالة
    update_data["is_active"] = new_status not in INACTIVE_STATUSES

    # تحديث المستوى لو طُلب
    if new_level is not None:
        update_data["level"] = int(new_level)

    # حقول خاصة بالحالة
    if new_status == "graduated":
        update_data["graduation_date"] = effective_date
        update_data["graduated_from_level"] = new_level if new_level is not None else old_level
    elif new_status == "expelled":
        update_data["expulsion_date"] = effective_date
    elif new_status == "frozen":
        update_data["frozen_at"] = effective_date

    await db.students.update_one({"_id": oid}, {"$set": update_data})

    # تسجيل التاريخ
    history_doc = {
        "student_id": student_id,
        "student_db_id": student_id,
        "student_full_name": student.get("full_name", ""),
        "student_ref_number": student.get("student_id", ""),
        "old_status": old_status,
        "new_status": new_status,
        "old_level": old_level,
        "new_level": new_level if new_level is not None else old_level,
        "reason": reason,
        "effective_date": effective_date,
        "changed_by_user_id": user_id,
        "changed_by_username": username,
        "created_at": _now_iso(),
    }
    await db.student_status_history.insert_one(history_doc)

    return {
        "id": student_id,
        "ok": True,
        "student_name": student.get("full_name", ""),
        "old_status": old_status,
        "new_status": new_status,
    }


# ==================== Bulk Change Status ====================

@router.post("/student-status/bulk-change")
async def bulk_change_status(
    payload: BulkChangeStatusRequest,
    current_user: dict = Depends(get_current_user),
):
    """تغيير حالة مجموعة طلاب دفعة واحدة.
    - new_status: active / repeat / graduated / expelled / frozen
    - new_level: اختياري (للإعادة لمستوى أقل، أو النقل مع تغيير الحالة)
    - reason: ملاحظة اختيارية
    - effective_date: تاريخ التطبيق (افتراضي: الآن)
    """
    from models.permissions import Permission
    perms = set(current_user.get("permissions") or [])
    if current_user.get("role") != "admin" and Permission.MANAGE_STUDENTS not in perms:
        raise HTTPException(status_code=403, detail="غير مصرح لك بإدارة حالات الطلاب")

    _validate_status(payload.new_status)
    db = get_db()
    eff_date = payload.effective_date or _now_iso()

    results = []
    for sid in payload.student_ids:
        r = await _apply_status_change(
            db, sid, payload.new_status, payload.new_level,
            payload.reason or "", eff_date,
            current_user.get("id"), current_user.get("username", ""),
        )
        results.append(r)

    success_count = sum(1 for r in results if r["ok"])
    failed_count = len(results) - success_count

    # سجل النشاط العام
    try:
        await db.activity_logs.insert_one({
            "user_id": current_user.get("id"),
            "username": current_user.get("username"),
            "action": "bulk_change_student_status",
            "target_type": "students",
            "details": f"تغيير {success_count} طالب إلى حالة '{STATUS_LABELS.get(payload.new_status)}'",
            "timestamp": _now_iso(),
        })
    except Exception:
        pass

    return {
        "message": f"تم تغيير حالة {success_count} طالب إلى '{STATUS_LABELS.get(payload.new_status)}'",
        "success_count": success_count,
        "failed_count": failed_count,
        "new_status": payload.new_status,
        "new_status_label": STATUS_LABELS.get(payload.new_status),
        "results": results,
    }


# ==================== Single Change ====================

@router.post("/student-status/{student_id}/change")
async def change_student_status(
    student_id: str,
    payload: SingleChangeStatusRequest,
    current_user: dict = Depends(get_current_user),
):
    """تغيير حالة طالب فردي."""
    from models.permissions import Permission
    perms = set(current_user.get("permissions") or [])
    if current_user.get("role") != "admin" and Permission.MANAGE_STUDENTS not in perms:
        raise HTTPException(status_code=403, detail="غير مصرح")

    _validate_status(payload.new_status)
    db = get_db()
    eff_date = payload.effective_date or _now_iso()

    r = await _apply_status_change(
        db, student_id, payload.new_status, payload.new_level,
        payload.reason or "", eff_date,
        current_user.get("id"), current_user.get("username", ""),
    )
    if not r["ok"]:
        raise HTTPException(status_code=400, detail=r.get("error", "فشل التحديث"))
    return {
        "message": f"تم تغيير حالة الطالب إلى '{STATUS_LABELS.get(payload.new_status)}'",
        **r,
    }


# ==================== Status History ====================

@router.get("/student-status/{student_id}/history")
async def get_student_status_history(
    student_id: str,
    current_user: dict = Depends(get_current_user),
):
    """تاريخ تغييرات الحالة لطالب معين."""
    from models.permissions import Permission
    perms = set(current_user.get("permissions") or [])
    is_admin = current_user.get("role") == "admin"
    if not is_admin and Permission.MANAGE_STUDENTS not in perms and Permission.VIEW_STUDENTS not in perms:
        raise HTTPException(status_code=403, detail="غير مصرح")

    db = get_db()
    items = []
    async for h in db.student_status_history.find(
        {"student_db_id": student_id}
    ).sort("created_at", -1):
        h["id"] = str(h.pop("_id"))
        items.append(h)
    return {"items": items, "total": len(items), "student_id": student_id}


# ==================== Status Statistics ====================

@router.get("/student-status/stats")
async def get_status_stats(
    department_id: Optional[str] = None,
    faculty_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """إحصائيات حالات الطلاب (مع فلاتر اختيارية)."""
    from models.permissions import Permission
    perms = set(current_user.get("permissions") or [])
    is_admin = current_user.get("role") == "admin"
    if not is_admin and Permission.MANAGE_STUDENTS not in perms and Permission.VIEW_STUDENTS not in perms:
        raise HTTPException(status_code=403, detail="غير مصرح")

    db = get_db()
    match = {}
    if department_id:
        match["department_id"] = department_id
    if faculty_id:
        match["faculty_id"] = faculty_id

    stats = {s: 0 for s in VALID_STATUSES}
    stats["unset"] = 0  # طلاب بدون حقل status (قديمون)
    total = 0

    async for s in db.students.find(match, {"status": 1, "is_active": 1}):
        total += 1
        st = s.get("status")
        if st in VALID_STATUSES:
            stats[st] += 1
        else:
            # طلاب قدامى بدون status صريح
            if s.get("is_active", True):
                stats["active"] += 1
            else:
                stats["unset"] += 1

    return {
        "total": total,
        "stats": stats,
        "labels": STATUS_LABELS,
        "filters": {"department_id": department_id, "faculty_id": faculty_id},
    }
