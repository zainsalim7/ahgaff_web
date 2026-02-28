"""
نماذج المحاضرات - Lectures Models
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class LectureStatus:
    SCHEDULED = "scheduled"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ABSENT = "absent"

ACTIVE_LECTURE_STATUSES = [LectureStatus.SCHEDULED, LectureStatus.COMPLETED, LectureStatus.ABSENT]

class LectureCreate(BaseModel):
    course_id: str
    date: str
    start_time: str
    end_time: str
    room: Optional[str] = ""
    notes: Optional[str] = ""

class LectureUpdate(BaseModel):
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    room: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class LectureResponse(BaseModel):
    id: str
    course_id: str
    date: str
    start_time: str
    end_time: str
    room: str
    status: str
    notes: str
    created_at: datetime

class GenerateLecturesRequest(BaseModel):
    course_id: str
    start_date: str
    end_date: str
    day_of_week: int
    start_time: str
    end_time: str
    room: Optional[str] = ""
