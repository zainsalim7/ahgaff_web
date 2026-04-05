"""
Courses Routes - مسارات إدارة المقررات
"""
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

from .deps import get_db, get_current_user

router = APIRouter(tags=["المقررات"])


class CourseCreate(BaseModel):
    name: str
    code: str
    department_id: str
    teacher_id: Optional[str] = None
    credit_hours: Optional[int] = 3
    description: Optional[str] = None


@router.get("/courses")
async def get_courses(
    department_id: Optional[str] = None,
    teacher_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """الحصول على جميع المقررات"""
    db = get_db()
    query = {}

    if department_id:
        query["department_id"] = department_id
    if teacher_id:
        query["teacher_id"] = teacher_id

    courses = await db.courses.find(query).to_list(100)

    if not courses:
        return []

    # --- Bulk-fetch teachers ---
    teacher_ids = list({
        ObjectId(c["teacher_id"])
        for c in courses
        if c.get("teacher_id")
    })
    teachers_map: dict = {}
    if teacher_ids:
        async for t in db.users.find(
            {"_id": {"$in": teacher_ids}},
            {"_id": 1, "full_name": 1}
        ):
            teachers_map[str(t["_id"])] = t.get("full_name")

    # --- Bulk-fetch departments ---
    dept_ids = list({
        ObjectId(c["department_id"])
        for c in courses
        if c.get("department_id")
    })
    depts_map: dict = {}
    if dept_ids:
        async for d in db.departments.find(
            {"_id": {"$in": dept_ids}},
            {"_id": 1, "name": 1}
        ):
            depts_map[str(d["_id"])] = d.get("name")

    # --- Bulk-count enrollments via aggregation ---
    course_ids = [str(c["_id"]) for c in courses]
    enrollment_counts: dict = {cid: 0 for cid in course_ids}
    async for bucket in db.enrollments.aggregate([
        {"$match": {"course_id": {"$in": course_ids}}},
        {"$group": {"_id": "$course_id", "count": {"$sum": 1}}}
    ]):
        enrollment_counts[bucket["_id"]] = bucket["count"]

    # --- Build response in a single pass ---
    result = []
    for c in courses:
        cid = str(c["_id"])
        result.append({
            "id": cid,
            "name": c["name"],
            "code": c.get("code", ""),
            "department_id": c.get("department_id"),
            "department_name": depts_map.get(c.get("department_id", "")),
            "teacher_id": c.get("teacher_id"),
            "teacher_name": teachers_map.get(c.get("teacher_id", "")),
            "credit_hours": c.get("credit_hours", 3),
            "description": c.get("description"),
            "students_count": enrollment_counts.get(cid, 0),
            "is_active": c.get("is_active", True),
            "created_at": c.get("created_at", datetime.utcnow())
        })

    return result


@router.post("/courses")
async def create_course(course: CourseCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء مقرر جديد"""
    db = get_db()
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    existing = await db.courses.find_one({"code": course.code})
    if existing:
        raise HTTPException(status_code=400, detail="كود المقرر موجود مسبقاً")
    
    course_doc = {
        "name": course.name,
        "code": course.code,
        "department_id": course.department_id,
        "teacher_id": course.teacher_id,
        "credit_hours": course.credit_hours or 3,
        "description": course.description,
        "is_active": True,
        "created_at": datetime.utcnow()
    }
    
    result = await db.courses.insert_one(course_doc)
    
    return {
        "id": str(result.inserted_id),
        "message": "تم إنشاء المقرر بنجاح"
    }


@router.get("/courses/{course_id}")
async def get_course(course_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على تفاصيل مقرر"""
    import asyncio
    db = get_db()
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")

    # Build coroutines for teacher, department, and enrollment count, then
    # run all three concurrently instead of sequentially.
    async def fetch_teacher():
        if course.get("teacher_id"):
            try:
                t = await db.users.find_one(
                    {"_id": ObjectId(course["teacher_id"])},
                    {"_id": 0, "full_name": 1}
                )
                return t.get("full_name") if t else None
            except Exception:
                pass
        return None

    async def fetch_department():
        if course.get("department_id"):
            try:
                d = await db.departments.find_one(
                    {"_id": ObjectId(course["department_id"])},
                    {"_id": 0, "name": 1}
                )
                return d.get("name") if d else None
            except Exception:
                pass
        return None

    async def fetch_enrollment_count():
        return await db.enrollments.count_documents({"course_id": course_id})

    teacher_name, dept_name, students_count = await asyncio.gather(
        fetch_teacher(),
        fetch_department(),
        fetch_enrollment_count()
    )

    return {
        "id": str(course["_id"]),
        "name": course["name"],
        "code": course.get("code"),
        "department_id": course.get("department_id"),
        "department_name": dept_name,
        "teacher_id": course.get("teacher_id"),
        "teacher_name": teacher_name,
        "credit_hours": course.get("credit_hours", 3),
        "description": course.get("description"),
        "students_count": students_count,
        "is_active": course.get("is_active", True)
    }


@router.delete("/courses/{course_id}")
async def delete_course(course_id: str, current_user: dict = Depends(get_current_user)):
    """حذف مقرر"""
    db = get_db()
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    await db.courses.delete_one({"_id": ObjectId(course_id)})
    await db.enrollments.delete_many({"course_id": course_id})
    await db.lectures.delete_many({"course_id": course_id})
    
    return {"message": "تم حذف المقرر بنجاح"}
