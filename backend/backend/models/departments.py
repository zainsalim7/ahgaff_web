"""
نماذج الأقسام - Departments Models
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class DepartmentBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    faculty_id: Optional[str] = None
    default_program_code: Optional[str] = None  # B/M/D/E/P

class DepartmentCreate(DepartmentBase):
    pass

class DepartmentResponse(DepartmentBase):
    id: str
    faculty_name: Optional[str] = None
    created_at: datetime
