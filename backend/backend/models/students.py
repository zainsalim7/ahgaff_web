"""
نماذج الطلاب - Students Models
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class StudentBase(BaseModel):
    student_id: str
    full_name: str
    department_id: str
    faculty_id: Optional[str] = None
    level: int
    section: str
    phone: Optional[str] = None
    email: Optional[str] = None

class StudentCreate(StudentBase):
    password: Optional[str] = None

class StudentResponse(StudentBase):
    id: str
    user_id: Optional[str] = None
    qr_code: str
    created_at: datetime
    is_active: bool = True
