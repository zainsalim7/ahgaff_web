"""
Departments Routes - مسارات إدارة الأقسام
"""
import asyncio
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

from .deps import get_db, get_current_user
from cache import cache, TTL_DEPARTMENTS

router = APIRouter(tags=["الأقسام"])


class DepartmentCreate(BaseModel):
    name: str
    code: Optional[str] = None
    faculty_id: Optional[str] = None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    faculty_id: Optional[str] = None


@router.get("/departments")
async def get_departments(faculty_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """الحصول على جميع الأقسام"""
    db = get_db()

    # Cache key includes the optional filter so scoped and unscoped results
    # are stored independently.
    cache_key = f"departments:{faculty_id or 'all'}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    query = {}
    if faculty_id:
        query["faculty_id"] = faculty_id

    departments = await db.departments.find(query).to_list(100)
    if not departments:
        cache.set(cache_key, [], ttl=TTL_DEPARTMENTS)
        return []

    dept_id_strs = [str(d["_id"]) for d in departments]

    # Collect unique faculty IDs for a single bulk lookup
    faculty_ids = list({d["faculty_id"] for d in departments if d.get("faculty_id")})

    # Run all three aggregations concurrently
    async def fetch_student_counts():
        counts = {cid: 0 for cid in dept_id_strs}
        async for bucket in db.students.aggregate([
            {"$match": {"department_id": {"$in": dept_id_strs}}},
            {"$group": {"_id": "$department_id", "count": {"$sum": 1}}}
        ]):
            counts[bucket["_id"]] = bucket["count"]
        return counts

    async def fetch_teacher_counts():
        counts = {cid: 0 for cid in dept_id_strs}
        async for bucket in db.teachers.aggregate([
            {"$match": {"department_id": {"$in": dept_id_strs}}},
            {"$group": {"_id": "$department_id", "count": {"$sum": 1}}}
        ]):
            counts[bucket["_id"]] = bucket["count"]
        return counts

    async def fetch_faculties():
        if not faculty_ids:
            return {}
        fmap = {}
        try:
            async for f in db.faculties.find(
                {"_id": {"$in": [ObjectId(fid) for fid in faculty_ids]}},
                {"_id": 1, "name": 1}
            ):
                fmap[str(f["_id"])] = f.get("name")
        except Exception:
            pass
        return fmap

    student_counts, teacher_counts, faculties_map = await asyncio.gather(
        fetch_student_counts(),
        fetch_teacher_counts(),
        fetch_faculties(),
    )

    result = []
    for dept in departments:
        dept_id_str = str(dept["_id"])
        result.append({
            "id": dept_id_str,
            "name": dept["name"],
            "code": dept.get("code", ""),
            "faculty_id": dept.get("faculty_id"),
            "faculty_name": faculties_map.get(dept.get("faculty_id", "")) if dept.get("faculty_id") else None,
            "students_count": student_counts.get(dept_id_str, 0),
            "teachers_count": teacher_counts.get(dept_id_str, 0),
            "created_at": dept.get("created_at", datetime.utcnow())
        })

    cache.set(cache_key, result, ttl=TTL_DEPARTMENTS)
    return result


@router.post("/departments")
async def create_department(dept: DepartmentCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء قسم جديد"""
    db = get_db()
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    existing = await db.departments.find_one({"name": dept.name})
    if existing:
        raise HTTPException(status_code=400, detail="يوجد قسم بهذا الاسم")
    
    dept_doc = {
        "name": dept.name,
        "code": dept.code or "",
        "faculty_id": dept.faculty_id,
        "created_at": datetime.utcnow()
    }
    
    result = await db.departments.insert_one(dept_doc)

    # Invalidate cached department lists so next read is fresh
    cache.invalidate_prefix("departments:")

    return {
        "id": str(result.inserted_id),
        "name": dept.name,
        "code": dept.code or "",
        "faculty_id": dept.faculty_id,
        "message": "تم إنشاء القسم بنجاح"
    }


@router.get("/departments/{dept_id}")
async def get_department(dept_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على تفاصيل قسم"""
    db = get_db()
    dept = await db.departments.find_one({"_id": ObjectId(dept_id)})
    if not dept:
        raise HTTPException(status_code=404, detail="القسم غير موجود")
    
    students_count = await db.students.count_documents({"department_id": dept_id})
    
    return {
        "id": str(dept["_id"]),
        "name": dept["name"],
        "code": dept.get("code", ""),
        "faculty_id": dept.get("faculty_id"),
        "students_count": students_count,
        "created_at": dept.get("created_at", datetime.utcnow())
    }


@router.put("/departments/{dept_id}")
async def update_department(dept_id: str, data: DepartmentUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث قسم"""
    db = get_db()
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    dept = await db.departments.find_one({"_id": ObjectId(dept_id)})
    if not dept:
        raise HTTPException(status_code=404, detail="القسم غير موجود")
    
    update_data = {}
    if data.name:
        update_data["name"] = data.name
    if data.code is not None:
        update_data["code"] = data.code
    if data.faculty_id is not None:
        update_data["faculty_id"] = data.faculty_id
    
    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        await db.departments.update_one({"_id": ObjectId(dept_id)}, {"$set": update_data})

    cache.invalidate_prefix("departments:")
    return {"message": "تم تحديث القسم بنجاح"}


@router.delete("/departments/{dept_id}")
async def delete_department(dept_id: str, current_user: dict = Depends(get_current_user)):
    """حذف قسم"""
    db = get_db()
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    dept = await db.departments.find_one({"_id": ObjectId(dept_id)})
    if not dept:
        raise HTTPException(status_code=404, detail="القسم غير موجود")
    
    students_count = await db.students.count_documents({"department_id": dept_id})
    if students_count > 0:
        raise HTTPException(status_code=400, detail=f"لا يمكن حذف القسم، يوجد {students_count} طالب مسجل فيه")
    
    await db.departments.delete_one({"_id": ObjectId(dept_id)})

    cache.invalidate_prefix("departments:")
    return {"message": "تم حذف القسم بنجاح"}
