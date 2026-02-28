"""
نماذج المصادقة - Auth Models
"""
from pydantic import BaseModel

class ActivateStudentAccount(BaseModel):
    student_id: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class ForceChangePasswordRequest(BaseModel):
    new_password: str
