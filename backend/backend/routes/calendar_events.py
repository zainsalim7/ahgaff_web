"""
Calendar Routes - مسارات التقويم الجامعي
- إضافة/تعديل/حذف الأحداث
- استيراد من Excel
- تحويل ميلادي → هجري تلقائياً
- عرض عام (للمعلمين والطلاب)
"""
from datetime import datetime, timedelta, timezone, date
from io import BytesIO
from typing import Optional, List

import pandas as pd
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from hijridate import Gregorian, Hijri

from .deps import get_current_user, get_db
from models.permissions import UserRole

router = APIRouter(tags=["التقويم الجامعي"])

YEMEN_TIMEZONE = timezone(timedelta(hours=3))


def _now() -> datetime:
    return datetime.now(YEMEN_TIMEZONE)


# أسماء أيام الأسبوع بالعربي
ARABIC_WEEKDAYS = [
    "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"
]

# أسماء الأشهر الهجرية
HIJRI_MONTHS_AR = [
    "محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة",
    "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
]


def _gregorian_to_hijri(date_str: str) -> dict:
    """يحول تاريخاً ميلادياً (YYYY-MM-DD) إلى هجري ويُرجع التفاصيل."""
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail=f"تاريخ غير صالح: {date_str}")
    g = Gregorian(d.year, d.month, d.day)
    h = g.to_hijri()
    weekday_idx = d.weekday()  # 0=Mon
    return {
        "gregorian_date": d.strftime("%Y-%m-%d"),
        "hijri_date": f"{h.year}-{h.month:02d}-{h.day:02d}",
        "hijri_year": h.year,
        "hijri_month": h.month,
        "hijri_day": h.day,
        "hijri_month_name": HIJRI_MONTHS_AR[h.month - 1],
        "hijri_formatted": f"{h.day} {HIJRI_MONTHS_AR[h.month - 1]} {h.year}هـ",
        "weekday_ar": ARABIC_WEEKDAYS[weekday_idx],
    }


class CalendarEventCreate(BaseModel):
    gregorian_date: str  # YYYY-MM-DD
    event_name: str
    event_type: Optional[str] = "general"  # general, holiday, exam, semester_start, semester_end
    notes: Optional[str] = ""


class CalendarEventUpdate(BaseModel):
    gregorian_date: Optional[str] = None
    event_name: Optional[str] = None
    event_type: Optional[str] = None
    notes: Optional[str] = None


@router.get("/calendar/convert")
async def convert_date(date_str: str, current_user: dict = Depends(get_current_user)):
    """تحويل سريع لتاريخ ميلادي إلى هجري (للاستخدام في الواجهة قبل الحفظ)."""
    return _gregorian_to_hijri(date_str)


@router.get("/calendar/events")
async def list_calendar_events(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    """عرض كل أحداث التقويم (متاح لكل المستخدمين المسجلين).

    يدعم فلتر اختياري بسنة وشهر ميلاديين.
    """
    db = get_db()
    query: dict = {}
    if year is not None and month is not None:
        # نطاق الشهر
        start = f"{year:04d}-{month:02d}-01"
        if month == 12:
            end = f"{year + 1:04d}-01-01"
        else:
            end = f"{year:04d}-{month + 1:02d}-01"
        query["gregorian_date"] = {"$gte": start, "$lt": end}
    elif year is not None:
        query["gregorian_date"] = {"$gte": f"{year:04d}-01-01", "$lt": f"{year + 1:04d}-01-01"}

    cursor = db.calendar_events.find(query).sort("gregorian_date", 1)
    events: List[dict] = []
    async for ev in cursor:
        ev["id"] = str(ev["_id"])
        ev.pop("_id", None)
        events.append(ev)
    return events


@router.post("/calendar/events")
async def create_calendar_event(
    data: CalendarEventCreate,
    current_user: dict = Depends(get_current_user),
):
    """إضافة حدث جديد للتقويم (للأدمن فقط)."""
    if current_user.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="هذه العملية لمدير النظام فقط")

    name = (data.event_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="اسم الحدث مطلوب")

    converted = _gregorian_to_hijri(data.gregorian_date)

    doc = {
        "event_name": name,
        "event_type": data.event_type or "general",
        "notes": (data.notes or "").strip(),
        **converted,
        "created_at": _now(),
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("full_name") or current_user.get("username", ""),
    }
    db = get_db()
    res = await db.calendar_events.insert_one(doc)
    doc.pop("_id", None)
    return {"id": str(res.inserted_id), **doc}


@router.put("/calendar/events/{event_id}")
async def update_calendar_event(
    event_id: str,
    data: CalendarEventUpdate,
    current_user: dict = Depends(get_current_user),
):
    """تعديل حدث (للأدمن فقط)."""
    if current_user.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="هذه العملية لمدير النظام فقط")
    try:
        oid = ObjectId(event_id)
    except Exception:
        raise HTTPException(status_code=400, detail="معرف الحدث غير صالح")

    db = get_db()
    existing = await db.calendar_events.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="الحدث غير موجود")

    updates: dict = {}
    if data.event_name is not None:
        name = data.event_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="اسم الحدث مطلوب")
        updates["event_name"] = name
    if data.event_type is not None:
        updates["event_type"] = data.event_type
    if data.notes is not None:
        updates["notes"] = data.notes.strip()
    if data.gregorian_date is not None:
        converted = _gregorian_to_hijri(data.gregorian_date)
        updates.update(converted)

    if updates:
        updates["updated_at"] = _now()
        updates["updated_by"] = current_user.get("id")
        await db.calendar_events.update_one({"_id": oid}, {"$set": updates})

    return {"message": "تم تحديث الحدث بنجاح"}


@router.delete("/calendar/events/{event_id}")
async def delete_calendar_event(
    event_id: str,
    current_user: dict = Depends(get_current_user),
):
    """حذف حدث (للأدمن فقط)."""
    if current_user.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="هذه العملية لمدير النظام فقط")
    try:
        oid = ObjectId(event_id)
    except Exception:
        raise HTTPException(status_code=400, detail="معرف الحدث غير صالح")
    db = get_db()
    res = await db.calendar_events.delete_one({"_id": oid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الحدث غير موجود")
    return {"message": "تم حذف الحدث"}


@router.delete("/calendar/events")
async def clear_all_events(current_user: dict = Depends(get_current_user)):
    """حذف جميع أحداث التقويم (للأدمن فقط) - يستخدم قبل استيراد جديد."""
    if current_user.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="هذه العملية لمدير النظام فقط")
    db = get_db()
    res = await db.calendar_events.delete_many({})
    return {"message": f"تم حذف {res.deleted_count} حدث", "deleted_count": res.deleted_count}


@router.post("/calendar/import-excel")
async def import_calendar_from_excel(
    file: UploadFile = File(...),
    replace_all: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """استيراد أحداث التقويم من ملف Excel.

    الأعمدة المتوقعة (مرنة):
    - "التاريخ" أو "date" أو "gregorian_date" → التاريخ الميلادي (YYYY-MM-DD أو DD/MM/YYYY)
    - "الحدث" أو "event" أو "event_name" → اسم الحدث
    - "النوع" أو "type" (اختياري) → نوع الحدث
    - "ملاحظات" أو "notes" (اختياري)
    """
    if current_user.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="هذه العملية لمدير النظام فقط")

    if not (file.filename or "").lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="يجب أن يكون الملف من نوع Excel (.xlsx)")

    content = await file.read()
    try:
        df = pd.read_excel(BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"فشل قراءة الملف: {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="الملف فارغ")

    # تطبيع أسماء الأعمدة
    df.columns = [str(c).strip().lower() for c in df.columns]

    date_col = next(
        (c for c in df.columns if c in ("التاريخ", "date", "gregorian_date", "تاريخ", "تاريخ ميلادي")),
        None,
    )
    name_col = next(
        (c for c in df.columns if c in ("الحدث", "event", "event_name", "المناسبة", "البيان")),
        None,
    )
    type_col = next((c for c in df.columns if c in ("النوع", "type", "event_type", "نوع")), None)
    notes_col = next((c for c in df.columns if c in ("ملاحظات", "notes", "ملاحظة")), None)

    if not date_col or not name_col:
        raise HTTPException(
            status_code=400,
            detail="الملف يجب أن يحتوي على عمودين على الأقل: التاريخ والحدث",
        )

    db = get_db()
    if replace_all:
        await db.calendar_events.delete_many({})

    success = 0
    failed: List[dict] = []
    now = _now()

    for idx, row in df.iterrows():
        raw_date = row.get(date_col)
        raw_name = row.get(name_col)
        if pd.isna(raw_date) or pd.isna(raw_name):
            continue

        # تحويل التاريخ
        try:
            if isinstance(raw_date, datetime):
                d = raw_date.date()
            elif isinstance(raw_date, date):
                d = raw_date
            else:
                s = str(raw_date).strip()
                # دعم تنسيقات شائعة
                for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%m/%d/%Y"):
                    try:
                        d = datetime.strptime(s, fmt).date()
                        break
                    except ValueError:
                        continue
                else:
                    raise ValueError(f"صيغة تاريخ غير معروفة: {s}")
            date_str = d.strftime("%Y-%m-%d")
            converted = _gregorian_to_hijri(date_str)
        except Exception as e:
            failed.append({"row": int(idx) + 2, "reason": str(e)})
            continue

        name = str(raw_name).strip()
        if not name:
            continue

        event_type = "general"
        if type_col and not pd.isna(row.get(type_col)):
            event_type = str(row.get(type_col)).strip() or "general"

        notes = ""
        if notes_col and not pd.isna(row.get(notes_col)):
            notes = str(row.get(notes_col)).strip()

        doc = {
            "event_name": name,
            "event_type": event_type,
            "notes": notes,
            **converted,
            "created_at": now,
            "created_by": current_user.get("id"),
            "created_by_name": current_user.get("full_name") or current_user.get("username", ""),
        }
        await db.calendar_events.insert_one(doc)
        success += 1

    return {
        "message": f"تم استيراد {success} حدث",
        "imported": success,
        "failed_count": len(failed),
        "failed_rows": failed[:50],
    }
