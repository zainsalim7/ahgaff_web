"""
نماذج الجامعة والكليات - University & Faculty Models
"""
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class UniversityBase(BaseModel):
    """نموذج الجامعة"""
    name: str
    code: str
    short_code: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None

class UniversityCreate(UniversityBase):
    pass

class UniversityUpdate(BaseModel):
    name: Optional[str] = None
    short_code: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None

class UniversityResponse(UniversityBase):
    id: str
    faculties_count: int = 0
    created_at: datetime

class FacultyBase(BaseModel):
    """نموذج الكلية"""
    name: str
    code: str
    numeric_code: Optional[str] = None
    description: Optional[str] = None
    dean_id: Optional[str] = None
    levels_count: Optional[int] = 5
    sections: Optional[List[str]] = None
    attendance_late_minutes: Optional[int] = 15
    max_absence_percent: Optional[float] = 25

class FacultyCreate(FacultyBase):
    pass

class FacultyUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    numeric_code: Optional[str] = None
    description: Optional[str] = None
    dean_id: Optional[str] = None
    levels_count: Optional[int] = None
    sections: Optional[List[str]] = None
    attendance_late_minutes: Optional[int] = None
    max_absence_percent: Optional[float] = None

class FacultyResponse(FacultyBase):
    id: str
    dean_name: Optional[str] = None
    departments_count: int = 0
    created_at: datetime
