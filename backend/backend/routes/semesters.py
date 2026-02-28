"""
Semesters Routes - مسارات الفصول
"""
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import List

from models.semesters import SemesterCreate, SemesterUpdate, SemesterResponse
from .deps import security

router = APIRouter(tags=["الفصول"])
db = None
def set_db(database):
    global db
    db = database

# ==================== Semesters Routes (إدارة الفصول الدراسية) ====================

@router.get("/semesters")
async def get_all_semesters(
    academic_year: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """الحصول على جميع الفصول الدراسية"""
    query = {}
    if academic_year:
        query["academic_year"] = academic_year
    if status:
        query["status"] = status
    
    semesters = await db.semesters.find(query).sort("created_at", -1).to_list(100)
    
    result = []
    for sem in semesters:
        # حساب الإحصائيات
        courses_count = await db.courses.count_documents({"semester_id": str(sem["_id"])})
        
        result.append({
            "id": str(sem["_id"]),
            "name": sem["name"],
            "academic_year": sem["academic_year"],
            "start_date": sem.get("start_date"),
            "end_date": sem.get("end_date"),
            "status": sem.get("status", SemesterStatus.UPCOMING),
            "courses_count": courses_count,
            "created_at": sem.get("created_at", datetime.utcnow()),
            "closed_at": sem.get("closed_at"),
            "archived_at": sem.get("archived_at"),
        })
    
    return result

@router.post("/semesters")
async def create_semester(data: SemesterCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء فصل دراسي جديد"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # التحقق من عدم وجود فصل بنفس الاسم في نفس السنة
    existing = await db.semesters.find_one({
        "name": data.name,
        "academic_year": data.academic_year
    })
    if existing:
        raise HTTPException(status_code=400, detail="يوجد فصل بهذا الاسم في هذه السنة")
    
    semester_dict = data.dict()
    semester_dict["created_at"] = datetime.utcnow()
    semester_dict["created_by"] = current_user["id"]
    
    result = await db.semesters.insert_one(semester_dict)
    
    return {
        "id": str(result.inserted_id),
        "message": "تم إنشاء الفصل الدراسي بنجاح"
    }

@router.get("/semesters/current")
async def get_current_semester(current_user: dict = Depends(get_current_user)):
    """الحصول على الفصل الدراسي الحالي (النشط)"""
    semester = await db.semesters.find_one({"status": SemesterStatus.ACTIVE})
    
    if not semester:
        # إذا لم يوجد فصل نشط، نحاول الحصول عليه من الإعدادات
        settings = await db.settings.find_one({"_id": "system_settings"})
        if settings and settings.get("current_semester_id"):
            semester = await db.semesters.find_one({"_id": ObjectId(settings["current_semester_id"])})
    
    if not semester:
        return None
    
    return {
        "id": str(semester["_id"]),
        "name": semester["name"],
        "academic_year": semester["academic_year"],
        "start_date": semester.get("start_date"),
        "end_date": semester.get("end_date"),
        "status": semester.get("status"),
    }

@router.put("/semesters/{semester_id}")
async def update_semester(semester_id: str, data: SemesterUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث فصل دراسي"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    semester = await db.semesters.find_one({"_id": ObjectId(semester_id)})
    if not semester:
        raise HTTPException(status_code=404, detail="الفصل غير موجود")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        await db.semesters.update_one({"_id": ObjectId(semester_id)}, {"$set": update_data})
        
        # إذا كان الفصل نشطاً، قم بتحديث الإعدادات أيضاً
        if semester.get("status") == SemesterStatus.ACTIVE:
            settings_update = {"updated_at": datetime.utcnow()}
            
            if data.name:
                settings_update["current_semester"] = data.name
            if data.academic_year:
                settings_update["academic_year"] = data.academic_year
            if data.start_date:
                settings_update["semester_start_date"] = data.start_date
            if data.end_date:
                settings_update["semester_end_date"] = data.end_date
            
            if len(settings_update) > 1:  # أكثر من updated_at فقط
                await db.settings.update_one(
                    {"_id": "system_settings"},
                    {"$set": settings_update}
                )
    
    return {"message": "تم تحديث الفصل الدراسي بنجاح"}

@router.post("/semesters/{semester_id}/activate")
async def activate_semester(semester_id: str, current_user: dict = Depends(get_current_user)):
    """تفعيل فصل دراسي (جعله الفصل الحالي)"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    semester = await db.semesters.find_one({"_id": ObjectId(semester_id)})
    if not semester:
        raise HTTPException(status_code=404, detail="الفصل غير موجود")
    
    if semester.get("status") == SemesterStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="لا يمكن تفعيل فصل مؤرشف")
    
    # إلغاء تفعيل الفصل الحالي
    await db.semesters.update_many(
        {"status": SemesterStatus.ACTIVE},
        {"$set": {"status": SemesterStatus.CLOSED, "closed_at": datetime.utcnow()}}
    )
    
    # تفعيل الفصل الجديد
    await db.semesters.update_one(
        {"_id": ObjectId(semester_id)},
        {"$set": {"status": SemesterStatus.ACTIVE}}
    )
    
    # تحديث الإعدادات - تضمين تواريخ الفصل الدراسي
    settings_update = {
        "current_semester_id": semester_id,
        "current_semester": semester["name"],
        "academic_year": semester["academic_year"],
        "updated_at": datetime.utcnow()
    }
    
    # إضافة تواريخ الفصل إذا كانت موجودة
    if semester.get("start_date"):
        settings_update["semester_start_date"] = semester["start_date"]
    if semester.get("end_date"):
        settings_update["semester_end_date"] = semester["end_date"]
    
    await db.settings.update_one(
        {"_id": "system_settings"},
        {"$set": settings_update},
        upsert=True
    )
    
    return {"message": f"تم تفعيل الفصل '{semester['name']}' بنجاح"}

@router.post("/semesters/{semester_id}/close")
async def close_semester(semester_id: str, current_user: dict = Depends(get_current_user)):
    """إغلاق فصل دراسي"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    semester = await db.semesters.find_one({"_id": ObjectId(semester_id)})
    if not semester:
        raise HTTPException(status_code=404, detail="الفصل غير موجود")
    
    if semester.get("status") == SemesterStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="الفصل مؤرشف مسبقاً")
    
    await db.semesters.update_one(
        {"_id": ObjectId(semester_id)},
        {"$set": {"status": SemesterStatus.CLOSED, "closed_at": datetime.utcnow()}}
    )
    
    return {"message": "تم إغلاق الفصل الدراسي بنجاح"}

@router.post("/semesters/{semester_id}/archive")
async def archive_semester(semester_id: str, current_user: dict = Depends(get_current_user)):
    """أرشفة فصل دراسي (نسخ جميع البيانات للأرشيف)"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    semester = await db.semesters.find_one({"_id": ObjectId(semester_id)})
    if not semester:
        raise HTTPException(status_code=404, detail="الفصل غير موجود")
    
    if semester.get("status") == SemesterStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="لا يمكن أرشفة فصل نشط. يرجى إغلاقه أولاً")
    
    if semester.get("status") == SemesterStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="الفصل مؤرشف مسبقاً")
    
    # جمع إحصائيات الفصل قبل الأرشفة
    courses = await db.courses.find({"semester_id": semester_id}).to_list(1000)
    course_ids = [str(c["_id"]) for c in courses]
    
    # جمع سجلات الحضور للمقررات
    attendance_records = await db.attendance.find({"course_id": {"$in": course_ids}}).to_list(100000)
    
    # إنشاء سجل الأرشيف
    archive_record = {
        "semester_id": semester_id,
        "semester_name": semester["name"],
        "academic_year": semester["academic_year"],
        "courses": courses,
        "attendance_records": attendance_records,
        "courses_count": len(courses),
        "attendance_count": len(attendance_records),
        "archived_at": datetime.utcnow(),
        "archived_by": current_user["id"]
    }
    
    await db.semester_archives.insert_one(archive_record)
    
    # تحديث حالة الفصل
    await db.semesters.update_one(
        {"_id": ObjectId(semester_id)},
        {"$set": {
            "status": SemesterStatus.ARCHIVED,
            "archived_at": datetime.utcnow(),
            "archive_stats": {
                "courses_count": len(courses),
                "attendance_count": len(attendance_records)
            }
        }}
    )
    
    return {
        "message": "تم أرشفة الفصل الدراسي بنجاح",
        "archived_courses": len(courses),
        "archived_attendance": len(attendance_records)
    }

@router.get("/semesters/{semester_id}/stats")
async def get_semester_stats(semester_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على إحصائيات فصل دراسي"""
    semester = await db.semesters.find_one({"_id": ObjectId(semester_id)})
    if not semester:
        raise HTTPException(status_code=404, detail="الفصل غير موجود")
    
    # جمع الإحصائيات
    courses = await db.courses.find({"semester_id": semester_id}).to_list(1000)
    course_ids = [str(c["_id"]) for c in courses]
    
    attendance_count = await db.attendance.count_documents({"course_id": {"$in": course_ids}})
    lectures_count = await db.lectures.count_documents({"course_id": {"$in": course_ids}})
    
    # جمع الطلاب المسجلين
    enrollments = await db.enrollments.find({"course_id": {"$in": course_ids}}).to_list(10000)
    unique_students = set([e["student_id"] for e in enrollments])
    
    return {
        "semester_id": semester_id,
        "semester_name": semester["name"],
        "academic_year": semester["academic_year"],
        "status": semester.get("status"),
        "courses_count": len(courses),
        "students_count": len(unique_students),
        "lectures_count": lectures_count,
        "attendance_records": attendance_count,
    }

@router.delete("/semesters/{semester_id}")
async def delete_semester(semester_id: str, current_user: dict = Depends(get_current_user)):
    """حذف فصل دراسي (فقط إذا لم يكن له مقررات)"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    semester = await db.semesters.find_one({"_id": ObjectId(semester_id)})
    if not semester:
        raise HTTPException(status_code=404, detail="الفصل غير موجود")
    
    # التحقق من عدم وجود مقررات مرتبطة
    courses_count = await db.courses.count_documents({"semester_id": semester_id})
    if courses_count > 0:
        raise HTTPException(status_code=400, detail=f"لا يمكن حذف الفصل، يوجد {courses_count} مقرر مرتبط به")
    
    await db.semesters.delete_one({"_id": ObjectId(semester_id)})
    
    return {"message": "تم حذف الفصل الدراسي بنجاح"}

