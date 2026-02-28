"""
نماذج الفصول الدراسية - Semesters Models
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class SemesterStatus:
    ACTIVE = "active"
    UPCOMING = "upcoming"
    CLOSED = "closed"
    ARCHIVED = "archived"

class SemesterCreate(BaseModel):
    name: str
    academic_year: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str = SemesterStatus.UPCOMING

class SemesterUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None

class SemesterResponse(BaseModel):
    id: str
    name: str
    academic_year: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str
    courses_count: int = 0
    students_count: int = 0
    attendance_records: int = 0
    created_at: datetime
    closed_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
