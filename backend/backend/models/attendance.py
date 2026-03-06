"""
نماذج الحضور - Attendance Models
"""
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from models.courses import AttendanceStatus

class AttendanceRecord(BaseModel):
    student_id: str
    status: str = AttendanceStatus.PRESENT

class AttendanceSessionCreate(BaseModel):
    lecture_id: str
    notes: Optional[str] = None
    records: List[AttendanceRecord]
    offline_recorded_at: Optional[str] = None  # وقت التسجيل الأوفلاين (ISO format)
    lesson_title: Optional[str] = None  # عنوان الدرس
    plan_topic_id: Optional[str] = None  # ربط بموضوع من الخطة الدراسية

class AttendanceResponse(BaseModel):
    id: str
    lecture_id: str
    course_id: str
    student_id: str
    status: str
    date: datetime
    recorded_by: str
    method: str
    notes: Optional[str] = None

class AttendanceStats(BaseModel):
    total_sessions: int
    present_count: int
    absent_count: int
    late_count: int
    excused_count: int
    attendance_rate: float

class SingleAttendanceCreate(BaseModel):
    lecture_id: str
    student_id: str
    status: str = AttendanceStatus.PRESENT
    method: str = "qr"
    notes: Optional[str] = None

class OfflineSyncData(BaseModel):
    attendance_records: List[dict]
