"""
نماذج مركز الصلاحيات المتقدم (Advanced Access Control) — مستقل تمامًا عن models/permissions.py القديم
SHADOW MODE: لا تُستخدم هذه النماذج في أي تحقق وصول حقيقي بالنظام القديم
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class AdvancedRoleCreate(BaseModel):
    name_ar: str
    description: Optional[str] = ""
    permission_keys: List[str] = Field(default_factory=list)


class AdvancedRoleUpdate(BaseModel):
    name_ar: Optional[str] = None
    description: Optional[str] = None
    permission_keys: Optional[List[str]] = None
    status: Optional[str] = None  # draft | shadow | ready_for_review


class AssignmentScope(BaseModel):
    scope_type: str  # university | faculty | multi_faculty | department | multi_department |
                      # program | level | section | course | multi_course | assigned_courses |
                      # my_students | own_data | unit | multi_unit | committee | council
    scope_ref_ids: List[str] = Field(default_factory=list)


class DirectPermissionGrant(BaseModel):
    permission_key: str
    reason: Optional[str] = ""
    expires_at: Optional[datetime] = None


class AssignmentCreate(BaseModel):
    user_id: str
    assignment_type: str  # academic | administrative
    advanced_role_id: str
    context_label_ar: str
    scope: AssignmentScope
    direct_permissions: List[DirectPermissionGrant] = Field(default_factory=list)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class TesterGrant(BaseModel):
    user_id: str
    sub_permissions: List[str] = Field(default_factory=list)
    # القيم الممكنة: view, context_switch, manage_roles, manage_assignments,
    # manage_permissions, run_tests, view_audit


class CheckPermissionRequest(BaseModel):
    user_id: str
    assignment_id: str
    permission_key: str
    target_scope_type: Optional[str] = None
    target_ref_id: Optional[str] = None
