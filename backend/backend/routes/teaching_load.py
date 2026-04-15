"""
Teaching Load Routes - مسارات إدارة العبء التدريسي
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from bson import ObjectId
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel

from .deps import get_db, get_current_user, has_permission, log_activity
from models.permissions import Permission

router = APIRouter(tags=["العبء التدريسي"])


class TeachingLoadCreate(BaseModel):
    teacher_id: str
    course_id: str
    weekly_hours: float
    semester_id: Optional[str] = None
    notes: Optional[str] = None


class TeachingLoadUpdate(BaseModel):
    weekly_hours: Optional[float] = None
    notes: Optional[str] = None


@router.get("/teaching-load")
async def get_teaching_loads(
    department_id: Optional[str] = None,
    teacher_id: Optional[str] = None,
    semester_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """جلب جدول العبء التدريسي مع تفاصيل المعلم والمقرر"""
    if not has_permission(current_user, Permission.VIEW_TEACHING_LOAD) and not has_permission(current_user, Permission.MANAGE_TEACHING_LOAD):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    db = get_db()
    query = {}
    if teacher_id:
        query["teacher_id"] = teacher_id
    if semester_id:
        query["semester_id"] = semester_id

    # If department filter, get teacher ids in that department first
    teacher_ids_in_dept = None
    if department_id:
        dept_teachers = await db.teachers.find(
            {"department_id": department_id, "is_active": {"$ne": False}},
            {"_id": 1}
        ).to_list(500)
        teacher_ids_in_dept = [str(t["_id"]) for t in dept_teachers]
        if teacher_id:
            if teacher_id not in teacher_ids_in_dept:
                return {"items": [], "summary": {}}
        else:
            query["teacher_id"] = {"$in": teacher_ids_in_dept}

    loads = await db.teaching_loads.find(query).to_list(500)

    # Collect unique ids for batch lookup
    t_ids = list({l["teacher_id"] for l in loads})
    c_ids = list({l["course_id"] for l in loads})

    # Batch fetch teachers and courses
    teachers_map = {}
    if t_ids:
        obj_ids = []
        for tid in t_ids:
            try:
                obj_ids.append(ObjectId(tid))
            except Exception:
                pass
        teachers_docs = await db.teachers.find({"_id": {"$in": obj_ids}}).to_list(500)
        for t in teachers_docs:
            teachers_map[str(t["_id"])] = t

    courses_map = {}
    if c_ids:
        obj_ids = []
        for cid in c_ids:
            try:
                obj_ids.append(ObjectId(cid))
            except Exception:
                pass
        courses_docs = await db.courses.find({"_id": {"$in": obj_ids}}).to_list(500)
        for c in courses_docs:
            courses_map[str(c["_id"])] = c

    items = []
    teacher_summary = {}  # teacher_id -> total hours

    for load in loads:
        tid = load["teacher_id"]
        cid = load["course_id"]
        teacher = teachers_map.get(tid, {})
        course = courses_map.get(cid, {})

        wh = load.get("weekly_hours", 0)
        if tid not in teacher_summary:
            teacher_summary[tid] = {
                "teacher_name": teacher.get("full_name", ""),
                "total_hours": 0,
                "courses_count": 0,
            }
        teacher_summary[tid]["total_hours"] += wh
        teacher_summary[tid]["courses_count"] += 1

        items.append({
            "id": str(load["_id"]),
            "teacher_id": tid,
            "teacher_name": teacher.get("full_name", ""),
            "teacher_employee_id": teacher.get("teacher_id", ""),
            "department_id": teacher.get("department_id", ""),
            "course_id": cid,
            "course_name": course.get("name", ""),
            "course_code": course.get("code", ""),
            "course_section": course.get("section", ""),
            "weekly_hours": wh,
            "semester_id": load.get("semester_id"),
            "notes": load.get("notes", ""),
            "created_at": load.get("created_at"),
            "updated_at": load.get("updated_at"),
        })

    return {
        "items": items,
        "summary": teacher_summary,
    }


@router.post("/teaching-load")
async def create_teaching_load(
    data: TeachingLoadCreate,
    current_user: dict = Depends(get_current_user),
):
    """إضافة عبء تدريسي (معلم + مقرر + ساعات أسبوعية)"""
    if not has_permission(current_user, Permission.MANAGE_TEACHING_LOAD):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    db = get_db()

    # Validate teacher exists
    teacher = await db.teachers.find_one({"_id": ObjectId(data.teacher_id)})
    if not teacher:
        raise HTTPException(status_code=404, detail="المعلم غير موجود")

    # Validate course exists
    course = await db.courses.find_one({"_id": ObjectId(data.course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")

    # Check if already exists
    existing = await db.teaching_loads.find_one({
        "teacher_id": data.teacher_id,
        "course_id": data.course_id,
    })
    if existing:
        # Update existing
        await db.teaching_loads.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "weekly_hours": data.weekly_hours,
                "notes": data.notes,
                "semester_id": data.semester_id,
                "updated_at": datetime.now(timezone.utc),
                "updated_by": current_user["id"],
            }}
        )
        await log_activity(
            current_user, "update_teaching_load", "teaching_load",
            str(existing["_id"]),
            f"{teacher.get('full_name', '')} - {course.get('name', '')}",
            {"weekly_hours": data.weekly_hours}
        )
        return {"id": str(existing["_id"]), "message": "تم تحديث العبء التدريسي بنجاح", "updated": True}

    doc = {
        "teacher_id": data.teacher_id,
        "course_id": data.course_id,
        "weekly_hours": data.weekly_hours,
        "semester_id": data.semester_id,
        "notes": data.notes,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.teaching_loads.insert_one(doc)

    await log_activity(
        current_user, "create_teaching_load", "teaching_load",
        str(result.inserted_id),
        f"{teacher.get('full_name', '')} - {course.get('name', '')}",
        {"weekly_hours": data.weekly_hours}
    )

    return {"id": str(result.inserted_id), "message": "تم إضافة العبء التدريسي بنجاح", "updated": False}


@router.put("/teaching-load/{load_id}")
async def update_teaching_load(
    load_id: str,
    data: TeachingLoadUpdate,
    current_user: dict = Depends(get_current_user),
):
    """تعديل عبء تدريسي"""
    if not has_permission(current_user, Permission.MANAGE_TEACHING_LOAD):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    db = get_db()
    existing = await db.teaching_loads.find_one({"_id": ObjectId(load_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="السجل غير موجود")

    update_fields = {"updated_at": datetime.now(timezone.utc), "updated_by": current_user["id"]}
    if data.weekly_hours is not None:
        update_fields["weekly_hours"] = data.weekly_hours
    if data.notes is not None:
        update_fields["notes"] = data.notes

    await db.teaching_loads.update_one({"_id": ObjectId(load_id)}, {"$set": update_fields})

    await log_activity(
        current_user, "update_teaching_load", "teaching_load",
        load_id, None, {"weekly_hours": data.weekly_hours}
    )

    return {"message": "تم التحديث بنجاح"}


@router.delete("/teaching-load/{load_id}")
async def delete_teaching_load(
    load_id: str,
    current_user: dict = Depends(get_current_user),
):
    """حذف عبء تدريسي"""
    if not has_permission(current_user, Permission.MANAGE_TEACHING_LOAD):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    db = get_db()
    existing = await db.teaching_loads.find_one({"_id": ObjectId(load_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="السجل غير موجود")

    await db.teaching_loads.delete_one({"_id": ObjectId(load_id)})

    await log_activity(
        current_user, "delete_teaching_load", "teaching_load",
        load_id, None, None
    )

    return {"message": "تم الحذف بنجاح"}


@router.get("/teaching-load/teacher/{teacher_id}/courses")
async def get_teacher_courses_for_load(
    teacher_id: str,
    current_user: dict = Depends(get_current_user),
):
    """جلب مقررات المعلم لتعيين العبء"""
    if not has_permission(current_user, Permission.VIEW_TEACHING_LOAD) and not has_permission(current_user, Permission.MANAGE_TEACHING_LOAD):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    db = get_db()
    courses = await db.courses.find({"teacher_id": teacher_id, "is_active": True}).to_list(100)

    # Get existing loads for this teacher
    existing_loads = await db.teaching_loads.find({"teacher_id": teacher_id}).to_list(100)
    loads_map = {l["course_id"]: l for l in existing_loads}

    result = []
    for c in courses:
        cid = str(c["_id"])
        load = loads_map.get(cid)
        dept_name = ""
        if c.get("department_id"):
            try:
                dept = await db.departments.find_one({"_id": ObjectId(c["department_id"])})
                if dept:
                    dept_name = dept.get("name", "")
            except Exception:
                pass

        result.append({
            "course_id": cid,
            "course_name": c.get("name", ""),
            "course_code": c.get("code", ""),
            "section": c.get("section", ""),
            "department_name": dept_name,
            "credit_hours": c.get("credit_hours", 3),
            "existing_load_id": str(load["_id"]) if load else None,
            "existing_weekly_hours": load.get("weekly_hours") if load else None,
            "existing_notes": load.get("notes", "") if load else "",
        })

    return result


@router.post("/teaching-load/bulk")
async def bulk_save_teaching_load(
    items: list[TeachingLoadCreate],
    current_user: dict = Depends(get_current_user),
):
    """حفظ مجموعة من سجلات العبء التدريسي دفعة واحدة"""
    if not has_permission(current_user, Permission.MANAGE_TEACHING_LOAD):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    db = get_db()
    created = 0
    updated = 0

    for item in items:
        existing = await db.teaching_loads.find_one({
            "teacher_id": item.teacher_id,
            "course_id": item.course_id,
        })
        if existing:
            await db.teaching_loads.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "weekly_hours": item.weekly_hours,
                    "notes": item.notes,
                    "semester_id": item.semester_id,
                    "updated_at": datetime.now(timezone.utc),
                    "updated_by": current_user["id"],
                }}
            )
            updated += 1
        else:
            await db.teaching_loads.insert_one({
                "teacher_id": item.teacher_id,
                "course_id": item.course_id,
                "weekly_hours": item.weekly_hours,
                "semester_id": item.semester_id,
                "notes": item.notes,
                "created_by": current_user["id"],
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            })
            created += 1

    await log_activity(
        current_user, "bulk_teaching_load", "teaching_load",
        None, None, {"created": created, "updated": updated}
    )

    return {
        "message": f"تم الحفظ بنجاح: {created} جديد، {updated} محدث",
        "created": created,
        "updated": updated,
    }
