"""
Enrollments Routes - مسارات التسجيل
"""
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import List

from models.enrollments import EnrollmentCreate, EnrollmentResponse
from .deps import security

router = APIRouter(tags=["التسجيل"])
db = None
def set_db(database):
    global db
    db = database

# ==================== Enrollment Routes (تسجيل الطلاب في المقررات) ====================

@router.get("/enrollments/{course_id}")
async def get_course_enrollments(course_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على قائمة الطلاب المسجلين في مقرر"""
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    enrollments = await db.enrollments.find({"course_id": course_id}).to_list(10000)
    
    # Get student details
    student_ids = [ObjectId(e["student_id"]) for e in enrollments]
    students = await db.students.find({"_id": {"$in": student_ids}}).to_list(10000)
    students_map = {str(s["_id"]): s for s in students}
    
    result = []
    for enrollment in enrollments:
        student = students_map.get(enrollment["student_id"])
        if student:
            result.append({
                "enrollment_id": str(enrollment["_id"]),
                "student_id": str(student["_id"]),
                "student_number": student["student_id"],
                "full_name": student["full_name"],
                "level": student["level"],
                "section": student["section"],
                "enrolled_at": enrollment["enrolled_at"]
            })
    
    return result

@router.post("/enrollments/{course_id}")
async def enroll_students(
    course_id: str, 
    data: EnrollmentCreate, 
    current_user: dict = Depends(get_current_user)
):
    """تسجيل طلاب في مقرر"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    enrolled_count = 0
    already_enrolled = 0
    not_found = 0
    
    for student_id in data.student_ids:
        # Find student by ObjectId or student_id number
        student = None
        try:
            student = await db.students.find_one({"_id": ObjectId(student_id)})
        except:
            student = await db.students.find_one({"student_id": student_id})
        
        if not student:
            not_found += 1
            continue
        
        # Check if already enrolled
        existing = await db.enrollments.find_one({
            "course_id": course_id,
            "student_id": str(student["_id"])
        })
        
        if existing:
            already_enrolled += 1
            continue
        
        # Create enrollment
        enrollment = {
            "course_id": course_id,
            "student_id": str(student["_id"]),
            "enrolled_at": datetime.utcnow(),
            "enrolled_by": current_user["id"]
        }
        await db.enrollments.insert_one(enrollment)
        enrolled_count += 1
    
    return {
        "message": f"تم تسجيل {enrolled_count} طالب",
        "enrolled": enrolled_count,
        "already_enrolled": already_enrolled,
        "not_found": not_found
    }

@router.delete("/enrollments/{course_id}/{student_id}")
async def unenroll_student(
    course_id: str, 
    student_id: str, 
    current_user: dict = Depends(get_current_user)
):
    """إلغاء تسجيل طالب من مقرر"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    result = await db.enrollments.delete_one({
        "course_id": course_id,
        "student_id": student_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="التسجيل غير موجود")
    
    return {"message": "تم إلغاء التسجيل بنجاح"}

@router.post("/enrollments/{course_id}/import")
async def import_enrollments_excel(
    course_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """استيراد طلاب إلى مقرر من ملف Excel"""
    logger.info(f"Import enrollments called: course_id={course_id}, filename={file.filename}, content_type={file.content_type}")
    
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    try:
        contents = await file.read()
        logger.info(f"File read successfully, size: {len(contents)} bytes")
        
        df = pd.read_excel(BytesIO(contents))
        logger.info(f"Excel parsed, columns: {list(df.columns)}, rows: {len(df)}")
        
        # Try to find student_id column
        student_id_col = None
        possible_names = ['student_id', 'رقم_الطالب', 'رقم الطالب', 'الرقم', 'id', 'ID']
        for col in df.columns:
            if col in possible_names or 'رقم' in str(col) or 'طالب' in str(col):
                student_id_col = col
                break
        
        if student_id_col is None:
            student_id_col = df.columns[0]  # Use first column
        
        enrolled_count = 0
        already_enrolled = 0
        not_found = 0
        errors = []
        
        for idx, row in df.iterrows():
            student_id_value = str(row[student_id_col]).strip()
            
            if not student_id_value or student_id_value == 'nan':
                continue
            
            # Find student
            student = await db.students.find_one({"student_id": student_id_value})
            
            if not student:
                not_found += 1
                errors.append(f"الطالب رقم {student_id_value} غير موجود")
                continue
            
            # Check if already enrolled
            existing = await db.enrollments.find_one({
                "course_id": course_id,
                "student_id": str(student["_id"])
            })
            
            if existing:
                already_enrolled += 1
                continue
            
            # Create enrollment
            enrollment = {
                "course_id": course_id,
                "student_id": str(student["_id"]),
                "enrolled_at": datetime.utcnow(),
                "enrolled_by": current_user["id"]
            }
            await db.enrollments.insert_one(enrollment)
            enrolled_count += 1
        
        return {
            "message": f"تم تسجيل {enrolled_count} طالب في المقرر",
            "enrolled": enrolled_count,
            "already_enrolled": already_enrolled,
            "not_found": not_found,
            "errors": errors[:10]  # Return first 10 errors
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"خطأ في قراءة الملف: {str(e)}")

@router.get("/enrollments/{course_id}/students")
async def get_enrolled_students_for_attendance(course_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على الطلاب المسجلين للحضور"""
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    # Get enrollments
    enrollments = await db.enrollments.find({"course_id": course_id}).to_list(10000)
    
    if not enrollments:
        # If no enrollments, return empty (or could fall back to old behavior)
        return []
    
    # Get student details
    student_ids = [ObjectId(e["student_id"]) for e in enrollments]
    students = await db.students.find({
        "_id": {"$in": student_ids},
        "is_active": True
    }).to_list(10000)
    
    result = []
    for student in students:
        result.append({
            "id": str(student["_id"]),
            "student_id": student["student_id"],
            "full_name": student["full_name"],
            "department_id": student["department_id"],
            "level": student["level"],
            "section": student["section"],
            "qr_code": student.get("qr_code", "")
        })
    
    return result

class CourseUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    department_id: Optional[str] = None
    teacher_id: Optional[str] = None
    level: Optional[int] = None
    section: Optional[str] = None
    semester: Optional[str] = None
    academic_year: Optional[str] = None

@router.put("/courses/{course_id}", response_model=CourseResponse)
async def update_course(course_id: str, data: CourseUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    
    if update_data:
        await db.courses.update_one(
            {"_id": ObjectId(course_id)},
            {"$set": update_data}
        )
    
    updated = await db.courses.find_one({"_id": ObjectId(course_id)})
    return {
        "id": str(updated["_id"]),
        "name": updated["name"],
        "code": updated["code"],
        "department_id": updated["department_id"],
        "teacher_id": updated["teacher_id"],
        "level": updated["level"],
        "section": updated["section"],
        "semester": updated["semester"],
        "academic_year": updated["academic_year"],
        "created_at": updated["created_at"],
        "is_active": updated.get("is_active", True)
    }

