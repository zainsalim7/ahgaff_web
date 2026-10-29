"""
نماذج مراجعة الأدوار والصلاحيات الحساسة — Phase 7-B
"""
from typing import Optional, List
from pydantic import BaseModel


class RoleReviewUpdate(BaseModel):
    confirmed_category: Optional[str] = None
    confirmed_scope: Optional[str] = None
    status: Optional[str] = None


class ReviewNote(BaseModel):
    text: str


class ApprovalRequest(BaseModel):
    reason: str


class SensitivePermissionReviewUpdate(BaseModel):
    allowed_role_keys: Optional[List[str]] = None
    recommended_scope: Optional[str] = None
    requires_dual_approval: Optional[bool] = None
    requires_audit_log: Optional[bool] = None
    status: Optional[str] = None
