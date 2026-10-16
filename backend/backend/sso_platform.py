"""
الدخول الموحّد (SSO) من تطبيق الأستاذ إلى منصة الأحقاف (المكتبة الرقمية)
GET /api/sso/platform-token → JWT قصير العمر موقّع بسر مشترك + رابط جاهز للفتح
"""
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Depends
from jose import jwt
from bson import ObjectId

SSO_ALG = "HS256"
SSO_TTL_SECONDS = 180
SSO_ISSUER = "api.ahgaff.net"
SSO_AUDIENCE = "platform.ahgaff.net"
ALLOWED_REDIRECT_PREFIXES = ("/admin/repository", "/repository", "/")
SSO_DENIED_ROLES = {"student"}  # الطلاب لا يدخلون المنصة الإدارية عبر SSO


def build_router(db, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/sso", tags=["sso"])

    @router.get("/platform-token")
    async def platform_token(redirect: Optional[str] = "/admin/repository", current_user: dict = Depends(get_current_user)):
        secret = os.environ.get("SSO_SHARED_SECRET")
        platform_url = os.environ.get("PLATFORM_URL", "https://platform.ahgaff.net").rstrip("/")
        if not secret:
            raise HTTPException(status_code=503, detail="الدخول الموحّد غير مهيأ على الخادم")
        if not redirect or not redirect.startswith("/") or redirect.startswith("//") or not redirect.startswith(ALLOWED_REDIRECT_PREFIXES):
            redirect = "/admin/repository"

        user = await db.users.find_one({"_id": ObjectId(current_user["id"])}) or {}
        if user.get("role") in SSO_DENIED_ROLES or not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="الدخول الموحّد غير متاح لهذا الحساب")
        now = datetime.now(timezone.utc)
        claims = {
            "iss": SSO_ISSUER,
            "aud": SSO_AUDIENCE,
            "sub": user.get("username"),
            "jti": uuid.uuid4().hex,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(seconds=SSO_TTL_SECONDS)).timestamp()),
            "name": user.get("full_name", ""),
            "role": user.get("role"),
            "email": user.get("email"),
            "phone": user.get("phone"),
            "teacher_record_id": user.get("teacher_record_id"),
            "department_id": user.get("department_id"),
            "faculty_id": user.get("faculty_id"),
            "redirect": redirect,
        }
        token = jwt.encode(claims, secret, algorithm=SSO_ALG)
        return {
            "token": token,
            "expires_in": SSO_TTL_SECONDS,
            "sso_url": f"{platform_url}/sso?token={quote(token)}&redirect={quote(redirect)}",
        }

    return router
