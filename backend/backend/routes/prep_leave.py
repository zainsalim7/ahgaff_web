"""🎓 إجازة التحضير — إعفاء غياب الطلاب خلال أيام تحضيرية قبيل الاختبارات النهائية (قرار يدوي من الإدارة)"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .deps import get_current_user, get_db, log_activity
from models.permissions import UserRole

router = APIRouter(prefix="/prep-leave-periods", tags=["إجازة التحضير"])
YEMEN_TZ = timezone(timedelta(hours=3))

SCOPE_LABELS = {"all": "الجامعة بالكامل", "faculty": "كلية", "department": "قسم", "course": "مقرر"}


def _now() -> datetime:
    return datetime.now(YEMEN_TZ)


def _can_manage(user: dict) -> bool:
    return user.get("role") in (UserRole.ADMIN, UserRole.DEAN, UserRole.DEPARTMENT_HEAD)


class PrepPeriodCreate(BaseModel):
    date_from: str
    date_to: str
    scope: str = "all"  # all | faculty | department | course
    scope_id: Optional[str] = None
    scope_name: Optional[str] = ""
    reason: Optional[str] = ""


def _serialize(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]), "date_from": doc.get("date_from"), "date_to": doc.get("date_to"),
        "scope": doc.get("scope", "all"), "scope_id": doc.get("scope_id"), "scope_name": doc.get("scope_name") or "",
        "scope_label": SCOPE_LABELS.get(doc.get("scope", "all"), doc.get("scope", "all")),
        "reason": doc.get("reason", ""), "created_at": doc.get("created_at"),
        "created_by_name": doc.get("created_by_name", ""),
    }


@router.get("")
async def list_prep_periods(current_user: dict = Depends(get_current_user)):
    db = get_db()
    items = [_serialize(d) async for d in db.prep_leave_periods.find({}).sort("date_from", -1)]
    return {"items": items}


@router.post("")
async def create_prep_period(data: PrepPeriodCreate, current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك بتحديد أيام تحضيرية")
    if data.scope not in ("all", "faculty", "department", "course"):
        raise HTTPException(status_code=400, detail="نطاق غير صالح")
    if data.scope != "all" and not data.scope_id:
        raise HTTPException(status_code=400, detail="حدد الكلية/القسم/المقرر المستهدف")
    try:
        d1 = datetime.strptime(data.date_from, "%Y-%m-%d")
        d2 = datetime.strptime(data.date_to, "%Y-%m-%d")
    except Exception:
        raise HTTPException(status_code=400, detail="صيغة التاريخ غير صحيحة (YYYY-MM-DD)")
    if d2 < d1:
        raise HTTPException(status_code=400, detail="تاريخ النهاية قبل تاريخ البداية")

    db = get_db()
    doc = {
        "date_from": data.date_from, "date_to": data.date_to, "scope": data.scope,
        "scope_id": data.scope_id if data.scope != "all" else None,
        "scope_name": (data.scope_name or "").strip(), "reason": (data.reason or "").strip(),
        "created_at": _now(), "created_by": current_user.get("id"), "created_by_name": current_user.get("full_name", ""),
    }
    res = await db.prep_leave_periods.insert_one(doc)
    await log_activity(
        current_user, "create_prep_leave_period", "prep_leave_period", str(res.inserted_id),
        f"{data.date_from} → {data.date_to} ({SCOPE_LABELS.get(data.scope, data.scope)})",
    )
    doc["_id"] = res.inserted_id
    return _serialize(doc)


@router.delete("/{period_id}")
async def delete_prep_period(period_id: str, current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    try:
        oid = ObjectId(period_id)
    except Exception:
        raise HTTPException(status_code=404, detail="الفترة غير موجودة")
    db = get_db()
    doc = await db.prep_leave_periods.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="الفترة غير موجودة")
    await db.prep_leave_periods.delete_one({"_id": oid})
    await log_activity(current_user, "delete_prep_leave_period", "prep_leave_period", period_id, f"{doc.get('date_from')} → {doc.get('date_to')}")
    return {"message": "تم حذف الفترة التحضيرية"}
