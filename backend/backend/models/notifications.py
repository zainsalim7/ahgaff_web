"""
نماذج الإشعارات - Notifications Models
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum

class NotificationType(str, Enum):
    WARNING = "warning"
    DEPRIVATION = "deprivation"
    INFO = "info"
    REMINDER = "reminder"

class NotificationBase(BaseModel):
    title: str
    message: str
    type: NotificationType = NotificationType.INFO
    course_id: Optional[str] = None
    course_name: Optional[str] = None
    absence_rate: Optional[float] = None
    remaining_allowed: Optional[int] = None

class NotificationCreate(NotificationBase):
    student_id: str
    user_id: Optional[str] = None

class NotificationResponse(NotificationBase):
    id: str
    student_id: str
    is_read: bool = False
    created_at: datetime
