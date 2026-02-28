"""
نماذج التسجيل - Enrollments Models
"""
from pydantic import BaseModel
from typing import List
from datetime import datetime

class EnrollmentCreate(BaseModel):
    course_id: str
    student_ids: List[str]

class EnrollmentResponse(BaseModel):
    id: str
    course_id: str
    student_id: str
    enrolled_at: datetime
    enrolled_by: str
