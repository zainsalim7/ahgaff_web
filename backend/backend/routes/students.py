"""
Students Routes - مسارات إدارة الطلاب
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from bson import ObjectId
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

from .deps import get_db, get_current_user, get_password_hash

router = APIRouter(tags=["الطلاب"])


class StudentCreate(BaseModel):
    name: str
    student_id: str
    department_id: str
    level: Optional[int] = 1
    section: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    department_id: Optional[str] = None
    level: Optional[int] = None
    section: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/students")
async def get_students(
    department_id: Optional[str] = None,
    level: Optional[int] = None,
    section: Optional[str] = None,
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: dict = Depends(get_current_user)
):
    """الحصول على جميع الطلاب"""
    db = get_db()
    query = {}
    
    if department_id:
        query["department_id"] = department_id
    if level:
        query["level"] = level
    if section:
        query["section"] = section
    if is_active is not None:
        query["is_active"] = is_active
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"student_id": {"$regex": search, "$options": "i"}}
        ]
    
    students = await db.students.find(query).to_list(1000)

    if not students:
        return []

    # Bulk-fetch all referenced departments in a single query
    dept_ids = list({ObjectId(s["department_id"]) for s in students if s.get("department_id")})
    depts_map: dict = {}
    if dept_ids:
        async for d in db.departments.find(
            {"_id": {"$in": dept_ids}},
            {"_id": 1, "name": 1}
        ):
            depts_map[str(d["_id"])] = d.get("name")

    result = []
    for s in students:
        dept_name = depts_map.get(s.get("department_id", "")) if s.get("department_id") else None
        result.append({
            "id": str(s["_id"]),
            "name": s.get("name", "غير محدد"),
            "student_id": s.get("student_id", ""),
            "department_id": s.get("department_id"),
            "department_name": dept_name,
            "level": s.get("level", 1),
            "section": s.get("section"),
            "phone": s.get("phone"),
            "email": s.get("email"),
            "is_active": s.get("is_active", True),
            "created_at": s.get("created_at", datetime.utcnow())
        })

    return result


@router.post("/students")
async def create_student(student: StudentCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء طالب جديد"""
    db = get_db()
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    existing = await db.students.find_one({"student_id": student.student_id})
    if existing:
        raise HTTPException(status_code=400, detail="رقم القيد موجود مسبقاً")
    
    student_doc = {
        "name": student.name,
        "student_id": student.student_id,
        "department_id": student.department_id,
        "level": student.level or 1,
        "section": student.section,
        "phone": student.phone,
        "email": student.email,
        "is_active": True,
        "created_at": datetime.utcnow(),
        "created_by": current_user["id"]
    }
    
    result = await db.students.insert_one(student_doc)
    
    # إنشاء حساب مستخدم للطالب
    user_doc = {
        "username": student.student_id,
        "password": get_password_hash(student.student_id),
        "full_name": student.name,
        "role": "student",
        "student_id": str(result.inserted_id),
        "department_id": student.department_id,
        "is_active": True,
        "created_at": datetime.utcnow()
    }
    await db.users.insert_one(user_doc)
    
    return {
        "id": str(result.inserted_id),
        "message": "تم إنشاء الطالب بنجاح"
    }


@router.get("/students/{student_id}")
async def get_student(student_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على تفاصيل طالب"""
    db = get_db()
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    dept_name = None
    if student.get("department_id"):
        try:
            dept = await db.departments.find_one({"_id": ObjectId(student["department_id"])})
            if dept:
                dept_name = dept.get("name")
        except:
            pass
    
    return {
        "id": str(student["_id"]),
        "name": student["name"],
        "student_id": student["student_id"],
        "department_id": student.get("department_id"),
        "department_name": dept_name,
        "level": student.get("level", 1),
        "section": student.get("section"),
        "phone": student.get("phone"),
        "email": student.get("email"),
        "is_active": student.get("is_active", True),
        "created_at": student.get("created_at", datetime.utcnow())
    }


@router.put("/students/{student_id}")
async def update_student(student_id: str, data: StudentUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث بيانات طالب"""
    db = get_db()
    if current_user["role"] not in ["admin", "employee"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    update_data = {}
    if data.name:
        update_data["name"] = data.name
    if data.department_id:
        update_data["department_id"] = data.department_id
    if data.level is not None:
        update_data["level"] = data.level
    if data.section is not None:
        update_data["section"] = data.section
    if data.phone is not None:
        update_data["phone"] = data.phone
    if data.email is not None:
        update_data["email"] = data.email
    if data.is_active is not None:
        update_data["is_active"] = data.is_active
    
    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        await db.students.update_one({"_id": ObjectId(student_id)}, {"$set": update_data})
        
        # تحديث حساب المستخدم المرتبط
        user_update = {}
        if data.name:
            user_update["full_name"] = data.name
        if data.department_id:
            user_update["department_id"] = data.department_id
        if data.is_active is not None:
            user_update["is_active"] = data.is_active
        
        if user_update:
            await db.users.update_one(
                {"student_id": student_id},
                {"$set": user_update}
            )
    
    return {"message": "تم تحديث بيانات الطالب بنجاح"}


@router.delete("/students/{student_id}")
async def delete_student(student_id: str, current_user: dict = Depends(get_current_user)):
    """حذف طالب"""
    db = get_db()
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # حذف الطالب
    await db.students.delete_one({"_id": ObjectId(student_id)})
    
    # حذف حساب المستخدم المرتبط
    await db.users.delete_one({"student_id": student_id})
    
    # حذف سجلات الحضور
    await db.attendance.delete_many({"student_id": student_id})
    
    # حذف التسجيلات
    await db.enrollments.delete_many({"student_id": student_id})
    
    return {"message": "تم حذف الطالب بنجاح"}
