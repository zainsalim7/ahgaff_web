"""🏢 شؤون الموظفين — أدوات مشتركة (صلاحيات، إعدادات العمل، أيام العمل، الإشعارات)"""
import logging
from datetime import datetime, timedelta, timezone, date
from typing import Optional, List, Iterable

from fastapi import HTTPException
from bson import ObjectId

from .deps import has_permission

YEMEN_TZ = timezone(timedelta(hours=3))
P_VIEW, P_MANAGE, P_ORG = "hr_view_employees", "hr_manage_employees", "hr_manage_org"
P_LEAVES, P_ATTEND, P_CORR = "hr_manage_leaves", "hr_manage_attendance", "hr_manage_correspondence"

AR_DAYS = {5: "السبت", 6: "الأحد", 0: "الاثنين", 1: "الثلاثاء", 2: "الأربعاء", 3: "الخميس", 4: "الجمعة"}
DEFAULT_SETTINGS = {
    "work_days": ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"],
    "work_start": "08:00", "work_end": "14:00", "late_grace_minutes": 15, "early_leave_grace_minutes": 0,
    "allow_self_checkin": True, "annual_leave_days": 30, "holidays": [],
}


def _now() -> str:
    return datetime.now(YEMEN_TZ).isoformat()


def _today() -> str:
    return datetime.now(YEMEN_TZ).strftime("%Y-%m-%d")


def _oid(v: str, what: str = "المعرّف") -> ObjectId:
    if not v or not ObjectId.is_valid(v):
        raise HTTPException(status_code=400, detail=f"{what} غير صحيح")
    return ObjectId(v)


def _ser(d: dict) -> dict:
    d = dict(d)
    d["id"] = str(d.pop("_id"))
    return d


def _can_view(u: dict) -> bool:
    return has_permission(u, P_VIEW) or has_permission(u, P_MANAGE)


def _guard(u: dict, perm: str):
    if not has_permission(u, perm):
        raise HTTPException(status_code=403, detail="ليست لديك صلاحية على شؤون الموظفين")


def parse_date(s: Optional[str], what: str = "التاريخ") -> date:
    try:
        return datetime.strptime((s or "")[:10], "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{what} غير صحيح (YYYY-MM-DD)")


def user_id_of(u: dict) -> str:
    return str(u.get("id") or u.get("_id") or "")


async def get_hr_settings(db) -> dict:
    doc = await db.hr_settings.find_one({"_id": "global"}) or {}
    return {**DEFAULT_SETTINGS, **{k: v for k, v in doc.items() if k != "_id"}}


def is_work_day(d: date, settings: dict) -> bool:
    if d.strftime("%Y-%m-%d") in {h.get("date") for h in settings.get("holidays", [])}:
        return False
    return AR_DAYS[d.weekday()] in settings.get("work_days", [])


def holiday_name(d: date, settings: dict) -> str:
    for h in settings.get("holidays", []):
        if h.get("date") == d.strftime("%Y-%m-%d"):
            return h.get("name") or "عطلة رسمية"
    return ""


def work_days_between(start: date, end: date, settings: dict) -> int:
    n, cur = 0, start
    while cur <= end:
        if is_work_day(cur, settings):
            n += 1
        cur += timedelta(days=1)
    return n


async def find_my_employee(db, current_user: dict) -> Optional[dict]:
    """ملف الموظف المرتبط بالمستخدم الحالي (إداري عبر user_id أو معلم عبر teacher_id)"""
    uid = user_id_of(current_user)
    e = await db.employees.find_one({"user_id": uid})
    if not e and ObjectId.is_valid(uid):
        u = await db.users.find_one({"_id": ObjectId(uid)}, {"teacher_record_id": 1, "username": 1, "employee_record_id": 1})
        if (u or {}).get("employee_record_id") and ObjectId.is_valid(u["employee_record_id"]):
            e = await db.employees.find_one({"_id": ObjectId(u["employee_record_id"])})
        if e:
            return e
        tid = (u or {}).get("teacher_record_id")
        if not tid:
            t = await db.teachers.find_one({"$or": [{"user_id": uid}, {"teacher_id": (u or {}).get("username", "")}]}, {"_id": 1})
            tid = str(t["_id"]) if t else None
        if tid:
            e = await db.employees.find_one({"teacher_id": tid})
    return e


async def employee_user_ids(db, employee_ids: Iterable[str]) -> dict:
    """employee_id -> user_id (للإداريين مباشرة، وللمعلمين عبر جدول المعلمين)"""
    ids = [ObjectId(i) for i in set(employee_ids) if i and ObjectId.is_valid(i)]
    if not ids:
        return {}
    out, teacher_map = {}, {}
    async for e in db.employees.find({"_id": {"$in": ids}}, {"user_id": 1, "teacher_id": 1}):
        if e.get("user_id"):
            out[str(e["_id"])] = e["user_id"]
        elif e.get("teacher_id") and ObjectId.is_valid(e["teacher_id"]):
            teacher_map[e["teacher_id"]] = str(e["_id"])
    if teacher_map:
        async for t in db.teachers.find({"_id": {"$in": [ObjectId(i) for i in teacher_map]}}, {"user_id": 1}):
            if t.get("user_id"):
                out[teacher_map[str(t["_id"])]] = t["user_id"]
    return out


async def notify_users(db, user_ids: Iterable[str], title: str, message: str, ntype: str = "hr", extra: dict = None):
    """إشعار داخل التطبيق + FCM لمجموعة مستخدمين"""
    uids = [u for u in set(user_ids) if u]
    if not uids:
        return
    try:
        await db.notifications.insert_many([{"user_id": u, "title": title, "message": message, "type": ntype, "is_read": False, "created_at": _now(), **(extra or {})} for u in uids])
        from services.firebase_service import send_notification_to_many
        tokens = [d["token"] for d in await db.fcm_tokens.find({"user_id": {"$in": uids}}).to_list(2000) if d.get("token")]
        if tokens:
            await send_notification_to_many(tokens, title, message)
    except Exception as e:
        logging.error(f"HR notify error: {e}")


async def hr_manager_user_ids(db, perm: str) -> List[str]:
    """مستخدمو الإدارة الذين يملكون صلاحية معيّنة (أو admin)"""
    out = []
    async for u in db.users.find({"is_active": {"$ne": False}, "$or": [{"role": "admin"}, {"permissions": perm}, {"custom_permissions": perm}]}, {"_id": 1}):
        out.append(str(u["_id"]))
    return out


async def enrich_employee_refs(db, docs: List[dict], key: str = "employee_id") -> List[dict]:
    """إضافة اسم الموظف ورقمه ووحدته لأي مستندات تحمل employee_id"""
    ids = {d.get(key) for d in docs if d.get(key) and ObjectId.is_valid(d[key])}
    emps = {str(e["_id"]): e for e in await db.employees.find({"_id": {"$in": [ObjectId(i) for i in ids]}}, {"full_name": 1, "employee_no": 1, "org_unit_id": 1, "job_title": 1}).to_list(5000)} if ids else {}
    unit_ids = {e.get("org_unit_id") for e in emps.values() if e.get("org_unit_id") and ObjectId.is_valid(e["org_unit_id"])}
    units = {str(u["_id"]): u.get("name", "") for u in await db.org_units.find({"_id": {"$in": [ObjectId(i) for i in unit_ids]}}, {"name": 1}).to_list(2000)} if unit_ids else {}
    for d in docs:
        e = emps.get(d.get(key) or "", {})
        d["employee_name"] = e.get("full_name", "")
        d["employee_no"] = e.get("employee_no", "")
        d["job_title"] = e.get("job_title", "")
        d["org_unit_name"] = units.get(e.get("org_unit_id") or "", "")
    return docs
