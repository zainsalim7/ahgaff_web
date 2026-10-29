"""
نماذج منظومة التحكم والتراجع الآمن (Feature Flags + Emergency Kill Switch) — Phase 6B
مستقلة تمامًا عن models/advanced_access.py و models/permissions.py القديم.
"""
from typing import Optional
from pydantic import BaseModel


class MasterFlagUpdate(BaseModel):
    enabled: bool
    reason: str


class ScopeActivationRequest(BaseModel):
    scope_type: str  # user | department | faculty | unit
    ref_id: str
    reason: str


class SimulateRollbackRequest(BaseModel):
    user_id: Optional[str] = None
    department_id: Optional[str] = None
    faculty_id: Optional[str] = None
    unit_id: Optional[str] = None
