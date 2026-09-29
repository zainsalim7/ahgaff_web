"""📱 إدارة إصدارات التطبيقات (الطالب/الأستاذ): الحد الأدنى، آخر إصدار، روابط المتاجر، رسالة مخصصة — أدمن فقط"""
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .deps import get_db, get_current_user, log_activity

router = APIRouter(tags=["إصدارات التطبيقات"])
OFFLINE_SYNC_MAX_HOURS = 12  # مطابق لقيمة server.py
APPS = {"student": "تطبيق الطالب", "teacher": "تطبيق الأستاذ"}
DEFAULTS = {
    "student": {"min_supported_version": "1.0.0", "latest_version": "1.0.0"},
    "teacher": {"min_supported_version": "1.0.0", "latest_version": "2.0.0"},
}
_VER = re.compile(r"^\d+(\.\d+){0,3}$")


class VersionIn(BaseModel):
    min_supported_version: str
    latest_version: Optional[str] = ""
    ios_url: Optional[str] = ""
    android_url: Optional[str] = ""
    message: Optional[str] = ""
    force_enabled: bool = True


def _tuple(v: str):
    return tuple(int(x) for x in (v or "0").strip().split("."))


def _norm(v: str) -> str:
    return (v or "").strip().lstrip("vV")


async def get_app_version_doc(db, app: str) -> dict:
    doc = await db.app_versions.find_one({"_id": app}) or {}
    return {**DEFAULTS[app], "ios_url": "", "android_url": "", "message": "", "force_enabled": True, **{k: v for k, v in doc.items() if k != "_id"}}


def compute_update(info: dict, current: Optional[str]) -> dict:
    cur = _norm(current or "")
    out = {"force_update": False, "update_available": False, "current_version": cur or None}
    if cur and _VER.match(cur):
        try:
            c = _tuple(cur)
            out["force_update"] = bool(info.get("force_enabled", True)) and c < _tuple(info["min_supported_version"])
            out["update_available"] = bool(info.get("latest_version")) and c < _tuple(info["latest_version"])
        except ValueError:
            pass
    return out


@router.get("/app-version/{app_name}")
async def get_app_version(app_name: str, current: Optional[str] = None):
    """عام (بلا توكن): يقرأه التطبيق عند الإقلاع — أرسل ?current=1.2.0 لتحصل على force_update/update_available"""
    if app_name not in APPS:
        raise HTTPException(status_code=404, detail="تطبيق غير معروف")
    info = await get_app_version_doc(get_db(), app_name)
    return {
        "app": app_name, "app_label": APPS[app_name],
        "min_supported_version": info["min_supported_version"], "latest_version": info.get("latest_version") or info["min_supported_version"],
        "ios_url": info.get("ios_url") or "", "android_url": info.get("android_url") or "",
        "message": info.get("message") or "يتوفر إصدار جديد من التطبيق، يرجى التحديث للمتابعة.", "force_enabled": bool(info.get("force_enabled", True)),
        **compute_update(info, current),
        "security": {"offline_window_hours": OFFLINE_SYNC_MAX_HOURS, "lecture_window_check": True, "patch": "attendance-time-guard-v1"},
        "server_time": datetime.now(timezone(timedelta(hours=3))).replace(microsecond=0).isoformat(),
        "updated_at": info.get("updated_at"),
    }


def _admin(u: dict):
    if u.get("role") != "admin":
        raise HTTPException(status_code=403, detail="إدارة إصدارات التطبيقات لمدير النظام فقط")


@router.get("/admin/app-versions")
async def list_app_versions(current_user: dict = Depends(get_current_user)):
    _admin(current_user)
    db = get_db()
    return {"apps": [{"app": a, "label": APPS[a], **await get_app_version_doc(db, a)} for a in APPS]}


@router.put("/admin/app-versions/{app_name}")
async def save_app_version(app_name: str, data: VersionIn, current_user: dict = Depends(get_current_user)):
    _admin(current_user)
    if app_name not in APPS:
        raise HTTPException(status_code=404, detail="تطبيق غير معروف")
    mn, lt = _norm(data.min_supported_version), _norm(data.latest_version or "")
    if not _VER.match(mn):
        raise HTTPException(status_code=400, detail="الحد الأدنى للإصدار بصيغة مثل 1.2.0")
    if lt and not _VER.match(lt):
        raise HTTPException(status_code=400, detail="آخر إصدار بصيغة مثل 1.2.0")
    if lt and _tuple(lt) < _tuple(mn):
        raise HTTPException(status_code=400, detail="آخر إصدار لا يمكن أن يكون أقل من الحد الأدنى")
    for k, v in (("ios_url", data.ios_url), ("android_url", data.android_url)):
        if v and not re.match(r"^https?://", v.strip()):
            raise HTTPException(status_code=400, detail="روابط المتاجر يجب أن تبدأ بـ http(s)://")
    doc = {"min_supported_version": mn, "latest_version": lt or mn, "ios_url": (data.ios_url or "").strip(), "android_url": (data.android_url or "").strip(),
           "message": (data.message or "").strip(), "force_enabled": data.force_enabled,
           "updated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(), "updated_by_name": current_user.get("full_name", "")}
    await get_db().app_versions.update_one({"_id": app_name}, {"$set": doc}, upsert=True)
    await log_activity(current_user, "app_version_update", "app_version", app_name, f"{APPS[app_name]}: min {mn} / latest {lt or mn}")
    return {"message": f"تم حفظ إعدادات {APPS[app_name]}", "app": app_name, **doc}
