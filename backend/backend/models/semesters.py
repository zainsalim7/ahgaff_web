"""
نماذج الفصول الدراسية - Semesters Models
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class SemesterStatus:
    ACTIVE = "active"
    UPCOMING = "upcoming"
    CLOSED = "closed"
    ARCHIVED = "archived"


# قيم term: 1=الفصل الأول، 2=الفصل الثاني، 3=الفصل الصيفي
# تُستخدم لربط الفصل الأكاديمي بمقررات الخطة الدراسية أثناء التوليد


class SemesterCreate(BaseModel):
    name: str
    academic_year: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str = SemesterStatus.UPCOMING
    term: Optional[int] = Field(None, ge=1, le=3, description="1=أول، 2=ثاني، 3=صيفي")


class SemesterUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None
    term: Optional[int] = Field(None, ge=1, le=3)


class SemesterResponse(BaseModel):
    id: str
    name: str
    academic_year: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str
    term: Optional[int] = None
    courses_count: int = 0
    students_count: int = 0
    attendance_records: int = 0
    created_at: datetime
    closed_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
