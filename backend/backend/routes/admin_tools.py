"""
Admin Tools Routes - أدوات إدارية لإصلاح بيانات قاعدة البيانات
- Backfill semester_id للمحاضرات القديمة
- (مستقبلاً) أدوات تنظيف وإصلاح أخرى
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from .deps import get_current_user, get_db, has_permission
from models.permissions import UserRole

router = APIRouter(tags=["أدوات الأدمن"])


def _normalize_semester_date(d):
    """نسخة محلية من normalize_semester_date لتجنب الاستيراد الدائري."""
    if not d or not isinstance(d, str):
        return None
    s = d.strip()
    if len(s) == 10 and s[4] == '-' and s[7] == '-':
        return s
    parts = s.split('-')
    if len(parts) == 3:
        try:
            day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
            return f"{year:04d}-{month:02d}-{day:02d}"
        except Exception:
            return None
    return None


async def _build_semesters_index(db_inst):
    """يجلب كل الفصول مع تواريخ مُحوَّلة لمقارنة سريعة."""
    sems = await db_inst.semesters.find({}).to_list(100)
    indexed = []
    for s in sems:
        sd = _normalize_semester_date(s.get("start_date"))
        ed = _normalize_semester_date(s.get("end_date"))
        if sd and ed:
            indexed.append({
                "id": str(s["_id"]),
                "name": s.get("name", ""),
                "start_date": sd,
                "end_date": ed,
            })
    return indexed


def _ensure_admin(current_user: dict):
    if (
        current_user["role"] != UserRole.ADMIN
        and not has_permission(current_user, "manage_semesters")
        and not has_permission(current_user, "manage_courses")
    ):
        raise HTTPException(status_code=403, detail="غير مصرح لك")


@router.get("/admin/backfill-lecture-semesters/preview")
async def preview_backfill(current_user: dict = Depends(get_current_user)):
    """معاينة عدد المحاضرات التي ستُحدَّث وتوزيعها على الفصول.
    لا يُعدّل أي بيانات.
    """
    _ensure_admin(current_user)
    db = get_db()

    semesters = await _build_semesters_index(db)
    if not semesters:
        return {
            "total_lectures": await db.lectures.count_documents({}),
            "without_semester": 0,
            "matched_by_semester": [],
            "unmatched": 0,
            "warning": "لا توجد فصول دراسية بتواريخ صالحة في النظام",
        }

    total = await db.lectures.count_documents({})
    without_query = {"$or": [
        {"semester_id": {"$exists": False}},
        {"semester_id": None},
        {"semester_id": ""},
    ]}
    without_count = await db.lectures.count_documents(without_query)

    # لكل فصل: عدد المحاضرات التي تواريخها داخل نطاقه ولا تحوي semester_id
    matched = []
    matched_total = 0
    for sem in semesters:
        cnt = await db.lectures.count_documents({
            **without_query,
            "date": {"$gte": sem["start_date"], "$lte": sem["end_date"]},
        })
        matched.append({
            "id": sem["id"],
            "name": sem["name"],
            "start_date": sem["start_date"],
            "end_date": sem["end_date"],
            "lectures_to_update": cnt,
        })
        matched_total += cnt

    unmatched = without_count - matched_total
    if unmatched < 0:
        unmatched = 0

    return {
        "total_lectures": total,
        "without_semester": without_count,
        "matched_by_semester": matched,
        "matched_total": matched_total,
        "unmatched": unmatched,
    }


@router.post("/admin/backfill-lecture-semesters/execute")
async def execute_backfill(
    dry_run: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """تنفيذ تحديث المحاضرات القديمة بإسناد semester_id لها بناءً على نطاق التاريخ."""
    _ensure_admin(current_user)
    db = get_db()

    semesters = await _build_semesters_index(db)
    if not semesters:
        raise HTTPException(status_code=400, detail="لا توجد فصول بتواريخ صالحة")

    without_query = {"$or": [
        {"semester_id": {"$exists": False}},
        {"semester_id": None},
        {"semester_id": ""},
    ]}

    updates_per_semester = []
    grand_total = 0
    for sem in semesters:
        match_query = {
            **without_query,
            "date": {"$gte": sem["start_date"], "$lte": sem["end_date"]},
        }
        if dry_run:
            cnt = await db.lectures.count_documents(match_query)
        else:
            res = await db.lectures.update_many(
                match_query,
                {"$set": {"semester_id": sem["id"], "semester_name": sem["name"]}},
            )
            cnt = res.modified_count
        updates_per_semester.append({
            "semester_id": sem["id"],
            "semester_name": sem["name"],
            "updated": cnt,
        })
        grand_total += cnt

    return {
        "dry_run": dry_run,
        "total_updated": grand_total,
        "details": updates_per_semester,
        "message": (
            "محاكاة فقط - لم يتم التعديل"
            if dry_run
            else f"تم تحديث {grand_total} محاضرة"
        ),
    }
