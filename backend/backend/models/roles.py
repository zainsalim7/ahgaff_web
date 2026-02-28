"""
نماذج الأدوار - Roles Models
"""
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class RoleCreate(BaseModel):
    """نموذج إنشاء دور جديد"""
    name: str
    description: Optional[str] = ""
    permissions: List[str]
    is_system: bool = False

class RoleUpdate(BaseModel):
    """نموذج تحديث دور"""
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[str]] = None

class RoleResponse(BaseModel):
    """نموذج استجابة الدور"""
    id: str
    name: str
    description: str
    permissions: List[str]
    is_system: bool
    users_count: int = 0
    created_at: datetime
