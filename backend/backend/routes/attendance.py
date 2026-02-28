"""
Attendance Routes - مسارات الحضور
"""
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import List

from models.attendance import AttendanceRecord, AttendanceResponse
from .deps import security

router = APIRouter(tags=["الحضور"])
db = None
def set_db(database):
    global db
    db = database

# ==================== Attendance Routes ====================

@router.post("/attendance/session")
async def record_attendance_session(
    session: AttendanceSessionCreate,
    current_user: dict = Depends(get_current_user)
):
    """تسجيل حضور جماعي لمحاضرة"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.TEACHER]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Verify lecture exists
    lecture = await db.lectures.find_one({"_id": ObjectId(session.lecture_id)})
    if not lecture:
        raise HTTPException(status_code=404, detail="المحاضرة غير موجودة")
    
    course = await db.courses.find_one({"_id": ObjectId(lecture["course_id"])})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    # Check if teacher owns this course
    if current_user["role"] == UserRole.TEACHER and course["teacher_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك بتسجيل حضور هذا المقرر")
    
    # === التحقق من قواعد التحضير ===
    now = datetime.utcnow()
    lecture_date = datetime.strptime(lecture["date"], "%Y-%m-%d")
    lecture_start = datetime.strptime(f"{lecture['date']} {lecture['start_time']}", "%Y-%m-%d %H:%M")
    lecture_end = datetime.strptime(f"{lecture['date']} {lecture['end_time']}", "%Y-%m-%d %H:%M")
    
    # حساب مدة المحاضرة
    lecture_duration = (lecture_end - lecture_start).total_seconds() / 60  # بالدقائق
    
    # الوقت المسموح به للتحضير = وقت نهاية المحاضرة + مدة المحاضرة
    allowed_end_time = lecture_end + timedelta(minutes=lecture_duration)
    
    # التحقق: لا يُسمح بالتحضير قبل وقت بداية المحاضرة
    if now < lecture_start:
        raise HTTPException(
            status_code=400, 
            detail=f"لا يمكن التحضير قبل وقت بداية المحاضرة ({lecture['start_time']})"
        )
    
    # التحقق: لا يُسمح بالتحضير بعد انتهاء الوقت المسموح
    if now > allowed_end_time:
        raise HTTPException(
            status_code=400, 
            detail=f"انتهى وقت التحضير المسموح به. كان يمكن التحضير حتى {allowed_end_time.strftime('%H:%M')}"
        )
    
    # التحقق: إذا تم التحضير مسبقاً (المحاضرة مكتملة)، لا يُسمح بالتعديل
    existing_attendance = await db.attendance.count_documents({"lecture_id": session.lecture_id})
    if existing_attendance > 0 and lecture.get("status") == LectureStatus.COMPLETED:
        raise HTTPException(
            status_code=400, 
            detail="تم تسجيل الحضور لهذه المحاضرة مسبقاً ولا يمكن التعديل عليه"
        )
    # === نهاية التحقق من القواعد ===
    
    # Delete existing attendance for this lecture (فقط إذا لم تكن مكتملة)
    await db.attendance.delete_many({"lecture_id": session.lecture_id})
    
    attendance_records = []
    for record in session.records:
        att_record = {
            "lecture_id": session.lecture_id,
            "course_id": lecture["course_id"],
            "student_id": record.student_id,
            "status": record.status,
            "date": datetime.utcnow(),
            "recorded_by": current_user["id"],
            "method": "manual",
            "notes": session.notes,
            "created_at": datetime.utcnow()
        }
        attendance_records.append(att_record)
    
    if attendance_records:
        await db.attendance.insert_many(attendance_records)
        
        # التحقق من نسب الغياب وإنشاء إشعارات للطلاب الغائبين
        for record in session.records:
            if record.status == AttendanceStatus.ABSENT:
                await check_and_create_absence_notifications(record.student_id, lecture["course_id"])
    
    # Update lecture status to completed
    await db.lectures.update_one(
        {"_id": ObjectId(session.lecture_id)},
        {"$set": {"status": LectureStatus.COMPLETED}}
    )
    
    return {"message": f"تم تسجيل حضور {len(attendance_records)} طالب بنجاح"}

@router.post("/attendance/single")
async def record_single_attendance(
    data: SingleAttendanceCreate,
    current_user: dict = Depends(get_current_user)
):
    """تسجيل حضور طالب واحد (QR)"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.TEACHER]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Verify lecture exists
    lecture = await db.lectures.find_one({"_id": ObjectId(data.lecture_id)})
    if not lecture:
        raise HTTPException(status_code=404, detail="المحاضرة غير موجودة")
    
    # Verify student exists
    student = await db.students.find_one({"_id": ObjectId(data.student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Check if already recorded for this lecture
    existing = await db.attendance.find_one({
        "lecture_id": data.lecture_id,
        "student_id": data.student_id
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="تم تسجيل حضور هذا الطالب مسبقاً")
    
    att_record = {
        "lecture_id": data.lecture_id,
        "course_id": lecture["course_id"],
        "student_id": data.student_id,
        "status": data.status,
        "date": datetime.utcnow(),
        "recorded_by": current_user["id"],
        "method": data.method,
        "notes": data.notes,
        "created_at": datetime.utcnow()
    }
    
    await db.attendance.insert_one(att_record)
    
    return {"message": "تم تسجيل الحضور بنجاح", "student_name": student["full_name"]}

@router.get("/attendance/course/{course_id}")
async def get_course_attendance(
    course_id: str,
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"course_id": course_id}
    
    if date:
        date_obj = datetime.fromisoformat(date)
        query["date"] = {
            "$gte": date_obj.replace(hour=0, minute=0, second=0),
            "$lt": date_obj.replace(hour=23, minute=59, second=59)
        }
    
    records = await db.attendance.find(query).sort("date", -1).to_list(1000)
    
    # Get student details
    result = []
    for r in records:
        student = await db.students.find_one({"_id": ObjectId(r["student_id"])})
        result.append({
            "id": str(r["_id"]),
            "course_id": r["course_id"],
            "student_id": r["student_id"],
            "student_name": student["full_name"] if student else "غير معروف",
            "student_number": student["student_id"] if student else "",
            "status": r["status"],
            "date": r["date"].isoformat(),
            "method": r["method"],
            "notes": r.get("notes")
        })
    
    return result

@router.get("/attendance/student/{student_id}")
async def get_student_attendance(
    student_id: str,
    course_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"student_id": student_id}
    if course_id:
        query["course_id"] = course_id
    
    records = await db.attendance.find(query).sort("date", -1).to_list(1000)
    
    result = []
    for r in records:
        course = await db.courses.find_one({"_id": ObjectId(r["course_id"])})
        result.append({
            "id": str(r["_id"]),
            "course_id": r["course_id"],
            "course_name": course["name"] if course else "غير معروف",
            "status": r["status"],
            "date": r["date"].isoformat(),
            "method": r["method"]
        })
    
    return result

@router.get("/attendance/stats/student/{student_id}", response_model=AttendanceStats)
async def get_student_stats(
    student_id: str,
    course_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"student_id": student_id}
    if course_id:
        query["course_id"] = course_id
    
    records = await db.attendance.find(query).to_list(1000)
    
    # فلترة السجلات لاستبعاد المحاضرات الملغاة
    records = await filter_attendance_by_active_lectures(records, course_id)
    
    total = len(records)
    present = sum(1 for r in records if r["status"] == AttendanceStatus.PRESENT)
    absent = sum(1 for r in records if r["status"] == AttendanceStatus.ABSENT)
    late = sum(1 for r in records if r["status"] == AttendanceStatus.LATE)
    excused = sum(1 for r in records if r["status"] == AttendanceStatus.EXCUSED)
    
    rate = (present + late * 0.5) / total * 100 if total > 0 else 0
    
    return {
        "total_sessions": total,
        "present_count": present,
        "absent_count": absent,
        "late_count": late,
        "excused_count": excused,
        "attendance_rate": round(rate, 2)
    }

@router.get("/attendance/stats/course/{course_id}")
async def get_course_stats(course_id: str, current_user: dict = Depends(get_current_user)):
    # Get all attendance records for this course
    records = await db.attendance.find({"course_id": course_id}).to_list(10000)
    
    # فلترة السجلات لاستبعاد المحاضرات الملغاة
    records = await filter_attendance_by_active_lectures(records, course_id)
    
    # Group by date to get unique sessions (only from active lectures)
    sessions = set()
    for r in records:
        sessions.add(r["date"].strftime("%Y-%m-%d"))
    
    # Get course details
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    # Get students in this course's level and section
    students = await db.students.find({
        "department_id": course["department_id"],
        "level": course["level"],
        "section": course["section"]
    }).to_list(500)
    
    # Calculate stats per student (only from active lectures)
    student_stats = []
    for student in students:
        student_records = [r for r in records if r["student_id"] == str(student["_id"])]
        total = len(student_records)
        present = sum(1 for r in student_records if r["status"] == AttendanceStatus.PRESENT)
        absent = sum(1 for r in student_records if r["status"] == AttendanceStatus.ABSENT)
        late = sum(1 for r in student_records if r["status"] == AttendanceStatus.LATE)
        
        rate = (present + late * 0.5) / total * 100 if total > 0 else 0
        
        student_stats.append({
            "student_id": str(student["_id"]),
            "student_number": student["student_id"],
            "student_name": student["full_name"],
            "total_sessions": total,
            "present_count": present,
            "absent_count": absent,
            "late_count": late,
            "attendance_rate": round(rate, 2)
        })
    
    return {
        "course_id": course_id,
        "course_name": course["name"],
        "total_sessions": len(sessions),
        "total_students": len(students),
        "student_stats": student_stats
    }

# ==================== Offline Sync Routes ====================

@router.post("/sync/attendance")
async def sync_offline_attendance(
    data: OfflineSyncData,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.TEACHER]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    synced = 0
    errors = []
    
    for record in data.attendance_records:
        try:
            # Check if already synced (using local_id if provided)
            if record.get("local_id"):
                existing = await db.attendance.find_one({"local_id": record["local_id"]})
                if existing:
                    continue
            
            att_record = {
                "course_id": record["course_id"],
                "student_id": record["student_id"],
                "status": record.get("status", AttendanceStatus.PRESENT),
                "date": datetime.fromisoformat(record["date"]) if record.get("date") else datetime.utcnow(),
                "recorded_by": current_user["id"],
                "method": record.get("method", "manual"),
                "notes": record.get("notes"),
                "local_id": record.get("local_id"),
                "created_at": datetime.utcnow(),
                "synced_at": datetime.utcnow()
            }
            
            await db.attendance.insert_one(att_record)
            synced += 1
        except Exception as e:
            errors.append(str(e))
    
    return {
        "synced": synced,
        "errors": errors,
        "message": f"تمت مزامنة {synced} سجل بنجاح"
    }

