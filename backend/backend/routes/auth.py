"""
Auth Routes - مسارات المصادقة
"""
from fastapi import APIRouter, HTTPException, status, Depends, Request
from bson import ObjectId
from datetime import datetime

from models.users import UserLogin, UserResponse
from models.permissions import DEFAULT_PERMISSIONS
from .deps import (
    get_db, get_current_user, verify_password, create_access_token,
    log_activity, security, check_rate_limit, record_login_attempt
)

router = APIRouter(tags=["المصادقة"])


@router.post("/auth/login")
async def login(user_data: UserLogin, request: Request):
    """تسجيل الدخول مع حماية Rate Limiting"""
    db = get_db()
    
    # Rate Limiting - فحص عدد المحاولات
    client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "unknown")
    
    if not check_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail="تم تجاوز الحد الأقصى لمحاولات تسجيل الدخول. يرجى المحاولة بعد 5 دقائق"
        )
    
    user = await db.users.find_one({"username": user_data.username})
    password_field = user.get("hashed_password") or user.get("password") if user else None
    
    if not user or not password_field:
        record_login_attempt(client_ip, False)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="اسم المستخدم أو كلمة المرور غير صحيحة"
        )
    
    try:
        is_valid = verify_password(user_data.password, password_field)
    except Exception:
        is_valid = False
    
    if not is_valid:
        record_login_attempt(client_ip, False)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="اسم المستخدم أو كلمة المرور غير صحيحة"
        )
    
    if not user.get("is_active", True):
        record_login_attempt(client_ip, False)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="الحساب غير مفعل"
        )
    
    # تسجيل محاولة ناجحة
    record_login_attempt(client_ip, True)
    
    access_token = create_access_token(data={"sub": str(user["_id"])})
    
    # جلب صلاحيات الدور
    user_permissions = []
    
    if user.get("role_id"):
        try:
            role_doc = await db.roles.find_one({"_id": ObjectId(user["role_id"])})
            if role_doc:
                user_permissions = list(role_doc.get("permissions", []))
        except:
            pass
    
    if not user_permissions:
        user_role = user.get("role", "employee")
        role_doc = await db.roles.find_one({"system_key": user_role})
        if role_doc:
            user_permissions = list(role_doc.get("permissions", []))
        else:
            user_permissions = list(DEFAULT_PERMISSIONS.get(user_role, []))
    
    custom_permissions = user.get("custom_permissions", [])
    if custom_permissions:
        for perm in custom_permissions:
            if perm not in user_permissions:
                user_permissions.append(perm)
    
    # تسجيل نشاط الدخول
    await log_activity(
        user=user,
        action="login",
        entity_type="user",
        entity_id=str(user["_id"]),
        entity_name=user["username"]
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user["_id"]),
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
            "email": user.get("email"),
            "phone": user.get("phone"),
            "created_at": user["created_at"],
            "is_active": user.get("is_active", True),
            "permissions": user_permissions,
            "must_change_password": user.get("must_change_password", False),
            "student_id": user.get("student_id"),
            "faculty_id": user.get("faculty_id"),
            "department_id": user.get("department_id")
        }
    }


@router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """الحصول على بيانات المستخدم الحالي"""
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
    
    user_permissions = []
    
    if user.get("role_id"):
        try:
            role_doc = await db.roles.find_one({"_id": ObjectId(user["role_id"])})
            if role_doc:
                user_permissions = list(role_doc.get("permissions", []))
        except:
            pass
    
    if not user_permissions:
        user_role = user.get("role", "employee")
        role_doc = await db.roles.find_one({"system_key": user_role})
        if role_doc:
            user_permissions = list(role_doc.get("permissions", []))
        else:
            user_permissions = list(DEFAULT_PERMISSIONS.get(user_role, []))
    
    custom_permissions = user.get("custom_permissions", [])
    if custom_permissions:
        for perm in custom_permissions:
            if perm not in user_permissions:
                user_permissions.append(perm)
    
    return {
        "id": str(user["_id"]),
        "username": user["username"],
        "full_name": user["full_name"],
        "role": user["role"],
        "email": user.get("email"),
        "phone": user.get("phone"),
        "created_at": user["created_at"],
        "is_active": user.get("is_active", True),
        "permissions": user_permissions
    }
