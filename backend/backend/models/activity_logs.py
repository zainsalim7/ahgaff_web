"""
نماذج سجل الأنشطة - Activity Logs Models
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ActivityLogType:
    LOGIN = "login"
    LOGOUT = "logout"
    PASSWORD_CHANGE = "password_change"
    VIEW_PAGE = "view_page"
    VIEW_REPORT = "view_report"
    CREATE_USER = "create_user"
    CREATE_STUDENT = "create_student"
    CREATE_COURSE = "create_course"
    CREATE_DEPARTMENT = "create_department"
    CREATE_FACULTY = "create_faculty"
    CREATE_LECTURE = "create_lecture"
    UPDATE_USER = "update_user"
    UPDATE_STUDENT = "update_student"
    UPDATE_COURSE = "update_course"
    UPDATE_DEPARTMENT = "update_department"
    UPDATE_FACULTY = "update_faculty"
    UPDATE_LECTURE = "update_lecture"
    DELETE_USER = "delete_user"
    DELETE_STUDENT = "delete_student"
    DELETE_COURSE = "delete_course"
    DELETE_DEPARTMENT = "delete_department"
    DELETE_FACULTY = "delete_faculty"
    DELETE_LECTURE = "delete_lecture"
    RECORD_ATTENDANCE = "record_attendance"
    UPDATE_ATTENDANCE = "update_attendance"
    EXPORT_DATA = "export_data"
    IMPORT_DATA = "import_data"

class ActivityLog(BaseModel):
    user_id: str
    username: str
    user_role: str
    action: str
    action_ar: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    details: Optional[dict] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    faculty_id: Optional[str] = None
    department_id: Optional[str] = None
    timestamp: datetime = None

class ActivityLogResponse(BaseModel):
    id: str
    user_id: str
    username: str
    user_role: str
    action: str
    action_ar: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    details: Optional[dict] = None
    ip_address: Optional[str] = None
    faculty_id: Optional[str] = None
    department_id: Optional[str] = None
    timestamp: datetime
