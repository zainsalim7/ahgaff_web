"""
نماذج المقررات - Courses Models
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CourseBase(BaseModel):
    name: str
    code: str
    department_id: str
    teacher_id: Optional[str] = None
    level: int
    section: Optional[str] = ""
    semester_id: Optional[str] = None
    academic_year: Optional[str] = ""

class CourseCreate(CourseBase):
    pass

class CourseResponse(CourseBase):
    id: str
    teacher_name: Optional[str] = None
    department_name: Optional[str] = None
    semester_name: Optional[str] = None
    created_at: Optional[datetime] = None
    is_active: bool = True

class AttendanceStatus:
    PRESENT = "present"
    ABSENT = "absent"
    LATE = "late"
    EXCUSED = "excused"
