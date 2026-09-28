"""🔔 شؤون الموظفين — الإشعار العشوائي لتأكيد التواجد (GPS + بصمة)
- الإدارة تفعّل الفحص لموظفين محددين (أو الكل) بعدد فحوصات يومي وفاصل أدنى ومهلة استجابة
- حلقة خلفية كل دقيقة: تخطيط أوقات اليوم عشوائياً داخل الدوام، إرسال الفحوصات المستحقة (FCM + إشعار داخلي)، وإنهاء المنتهية
- الموظف يؤكد من التطبيق بإحداثياته + نتيجة البصمة → داخل النطاق = confirmed
"""
import asyncio
import logging
import random
from datetime import datetime, timedelta
from typing import Optional, List, Union

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .deps import get_db, get_current_user, log_activity
from .hr_common import (P_ATTEND, YEMEN_TZ, _now, _today, _oid, _ser, _guard, get_hr_settings, is_work_day, parse_date, find_my_employee,
                        employee_user_ids, enrich_employee_refs)
from .hr_locations import GeoIn, active_locations, rank_locations
from .internal_push import _check_key

router = APIRouter(prefix="/hr/presence-check", tags=["شؤون الموظفين - تأكيد التواجد"])
logger = logging.getLogger(__name__)

DEFAULTS = {"enabled": False, "checks_per_day": 1, "min_interval_minutes": 60, "response_timeout_minutes": 5, "employee_ids": "all", "only_checked_in": True}
STATUS = {"pending": "بانتظار التأكيد", "confirmed": "مؤكَّد", "expired": "لم يؤكد", "out_of_range": "خارج النطاق", "failed_biometric": "فشل التحقق من الهوية"}
FINAL = ("confirmed", "expired", "out_of_range", "failed_biometric")


class SettingsIn(BaseModel):
    enabled: bool = False
    checks_per_day: int = 1
    min_interval_minutes: int = 60
    response_timeout_minutes: int = 5
    employee_ids: Union[str, List[str]] = "all"
    only_checked_in: bool = True


class SendNowIn(BaseModel):
    employee_ids: List[str]
    timeout_minutes: Optional[int] = None


class ConfirmIn(GeoIn):
    biometric_verified: bool = False


async def get_settings(db) -> dict:
    doc = await db.hr_presence_settings.find_one({"_id": "global"}) or {}
    return {**DEFAULTS, **{k: v for k, v in doc.items() if k != "_id"}}


def _hm(s: str) -> int:
    h, m = s.split(":")[:2]
    return int(h) * 60 + int(m)


def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat()


async def _target_employees(db, settings: dict, d: str) -> List[dict]:
    q: dict = {"status": {"$nin": ["ended", "suspended"]}}
    ids = settings.get("employee_ids")
    if isinstance(ids, list):
        q["_id"] = {"$in": [ObjectId(i) for i in ids if ObjectId.is_valid(i)]}
    emps = await db.employees.find(q, {"full_name": 1}).to_list(5000)
    from .hr_attendance import _leave_map
    on_leave = await _leave_map(db, d)
    emps = [e for e in emps if str(e["_id"]) not in on_leave]
    if settings.get("only_checked_in", True):
        present = {r["employee_id"] for r in await db.hr_attendance.find({"date": d, "check_in": {"$nin": [None, ""]}, "check_out": None}, {"employee_id": 1}).to_list(10000)}
        emps = [e for e in emps if str(e["_id"]) in present]
    return emps


def _random_times(work_start: int, work_end: int, n: int, gap: int, timeout: int, not_before: int) -> List[int]:
    """أوقات عشوائية (بالدقائق) داخل الدوام، بفاصل أدنى، لا قبل الآن"""
    lo, hi = max(work_start, not_before), work_end - timeout
    if hi <= lo:
        return []
    out: List[int] = []
    for _ in range(n * 25):
        if len(out) >= n:
            break
        t = random.randint(lo, hi)
        if all(abs(t - x) >= gap for x in out):
            out.append(t)
    return sorted(out)


async def plan_day(db, force: bool = False) -> dict:
    """تخطيط فحوصات اليوم لكل موظف مستهدف — مرة واحدة يومياً (أو عند إعادة التخطيط)"""
    s = await get_settings(db)
    d = _today()
    if not s.get("enabled"):
        return {"planned": 0, "reason": "disabled"}
    hr = await get_hr_settings(db)
    if not is_work_day(parse_date(d), hr):
        return {"planned": 0, "reason": "not_work_day"}
    now = datetime.now(YEMEN_TZ)
    now_m = now.hour * 60 + now.minute
    planned = 0
    for e in await _target_employees(db, s, d):
        eid = str(e["_id"])
        have = await db.hr_presence_checks.count_documents({"employee_id": eid, "date": d, "manual": {"$ne": True}})
        need = int(s["checks_per_day"]) - have
        if need <= 0 and not force:
            continue
        last = [c async for c in db.hr_presence_checks.find({"employee_id": eid, "date": d}, {"scheduled_at": 1})]
        taken = [_hm(c["scheduled_at"][11:16]) for c in last if c.get("scheduled_at")]
        times = [t for t in _random_times(_hm(hr["work_start"]), _hm(hr["work_end"]), need, int(s["min_interval_minutes"]), int(s["response_timeout_minutes"]), now_m + 2)
                 if all(abs(t - x) >= int(s["min_interval_minutes"]) for x in taken)]
        for t in times:
            at = now.replace(hour=t // 60, minute=t % 60, second=0, microsecond=0)
            await db.hr_presence_checks.insert_one({"employee_id": eid, "date": d, "scheduled_at": _iso(at), "sent_at": None, "expires_at": None, "status": "pending", "manual": False,
                                                    "timeout_minutes": int(s["response_timeout_minutes"]), "attempts": [], "created_at": _now()})
            planned += 1
    await db.hr_presence_state.update_one({"_id": f"plan_{d}"}, {"$set": {"at": _now(), "planned": planned}}, upsert=True)
    return {"planned": planned}


async def _push(db, check: dict, emp_name: str):
    uid = (await employee_user_ids(db, [check["employee_id"]])).get(check["employee_id"])
    if not uid:
        return 0
    title, body = "تأكيد التواجد 📍", f"يرجى تأكيد تواجدك خلال {check['timeout_minutes']} دقائق (بصمة + الموقع)"
    data = {"type": "presence_check", "check_id": str(check["_id"]), "expires_at": check["expires_at"], "route": "/presence-check", "timeout_minutes": str(check["timeout_minutes"])}
    await db.notifications.insert_one({"user_id": uid, "title": title, "message": body, "type": "presence_check", "is_read": False, "created_at": _now(), "data": data})
    try:
        from services.firebase_service import send_notification_to_many
        tokens = [t["token"] for t in await db.fcm_tokens.find({"user_id": uid}).to_list(50) if t.get("token")]
        if tokens:
            r = await send_notification_to_many(tokens, title, body, data)
            return int((r or {}).get("success", 0))
    except Exception as e:
        logger.error(f"presence push error: {e}")
    return 0


async def dispatch_due(db) -> dict:
    """إرسال الفحوصات المستحقة + إنهاء المنتهية"""
    now = datetime.now(YEMEN_TZ)
    sent = expired = 0
    async for c in db.hr_presence_checks.find({"status": "pending", "sent_at": None, "scheduled_at": {"$lte": _iso(now)}}):
        exp = _iso(now + timedelta(minutes=int(c.get("timeout_minutes") or 5)))
        c["expires_at"] = exp
        emp = await db.employees.find_one({"_id": ObjectId(c["employee_id"])}, {"full_name": 1}) or {}
        pushed = await _push(db, c, emp.get("full_name", ""))
        await db.hr_presence_checks.update_one({"_id": c["_id"]}, {"$set": {"sent_at": _iso(now), "expires_at": exp, "push_sent": pushed}})
        sent += 1
    async for c in db.hr_presence_checks.find({"status": "pending", "sent_at": {"$ne": None}, "expires_at": {"$lt": _iso(now)}}):
        last = (c.get("attempts") or [{}])[-1]
        final = "out_of_range" if last.get("reason") == "out_of_range" else "failed_biometric" if last.get("reason") == "failed_biometric" else "expired"
        await db.hr_presence_checks.update_one({"_id": c["_id"]}, {"$set": {"status": final, "closed_at": _iso(now)}})
        expired += 1
    return {"sent": sent, "expired": expired}


async def presence_tick(db) -> dict:
    d = _today()
    if not await db.hr_presence_state.find_one({"_id": f"plan_{d}"}):
        await plan_day(db)
    return await dispatch_due(db)


async def presence_check_loop():
    await asyncio.sleep(45)
    while True:
        try:
            await presence_tick(get_db())
        except Exception as e:
            logger.error(f"presence check loop error: {e}")
        await asyncio.sleep(60)


# ══════════════ الإدارة ══════════════

@router.get("/settings")
async def read_settings(current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_ATTEND)
    db = get_db()
    s = await get_settings(db)
    if isinstance(s.get("employee_ids"), list):
        rows = [{"employee_id": i} for i in s["employee_ids"]]
        await enrich_employee_refs(db, rows)
        s["employees"] = rows
    s["statuses"] = STATUS
    return s


async def _save_settings(data: SettingsIn, current_user: dict):
    _guard(current_user, P_ATTEND)
    if not (1 <= data.checks_per_day <= 10):
        raise HTTPException(status_code=400, detail="عدد الفحوصات اليومية بين 1 و10")
    if not (1 <= data.response_timeout_minutes <= 60):
        raise HTTPException(status_code=400, detail="مهلة الاستجابة بين 1 و60 دقيقة")
    if not (5 <= data.min_interval_minutes <= 600):
        raise HTTPException(status_code=400, detail="الفاصل الأدنى بين 5 و600 دقيقة")
    if isinstance(data.employee_ids, str) and data.employee_ids != "all":
        raise HTTPException(status_code=400, detail="employee_ids يجب أن تكون قائمة معرّفات أو 'all'")
    if isinstance(data.employee_ids, list) and not data.employee_ids:
        raise HTTPException(status_code=400, detail="اختر موظفاً واحداً على الأقل أو 'all'")
    db = get_db()
    doc = {**data.dict(), "updated_by_name": current_user.get("full_name", ""), "updated_at": _now()}
    await db.hr_presence_settings.update_one({"_id": "global"}, {"$set": doc}, upsert=True)
    # إعادة التخطيط لبقية اليوم بالإعدادات الجديدة (تُلغى المخططة غير المرسلة)
    await db.hr_presence_checks.delete_many({"date": _today(), "status": "pending", "sent_at": None, "manual": {"$ne": True}})
    await db.hr_presence_state.delete_one({"_id": f"plan_{_today()}"})
    await log_activity(current_user, "hr_presence_settings", "hr_presence_settings", "global", f"enabled={data.enabled} n={data.checks_per_day}")
    return {"message": "تم حفظ إعدادات تأكيد التواجد", "settings": await get_settings(db)}


@router.put("/settings")
async def put_settings(data: SettingsIn, current_user: dict = Depends(get_current_user)):
    return await _save_settings(data, current_user)


@router.post("/settings")
async def post_settings(data: SettingsIn, current_user: dict = Depends(get_current_user)):
    return await _save_settings(data, current_user)


@router.post("/send-now")
async def send_now(data: SendNowIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_ATTEND)
    db = get_db()
    s = await get_settings(db)
    timeout = int(data.timeout_minutes or s["response_timeout_minutes"])
    if not (1 <= timeout <= 60):
        raise HTTPException(status_code=400, detail="المهلة بين 1 و60 دقيقة")
    now = datetime.now(YEMEN_TZ)
    created, skipped = [], []
    for eid in dict.fromkeys(data.employee_ids):
        if not ObjectId.is_valid(eid) or not await db.employees.find_one({"_id": ObjectId(eid)}, {"_id": 1}):
            skipped.append({"employee_id": eid, "reason": "موظف غير موجود"})
            continue
        if await db.hr_presence_checks.find_one({"employee_id": eid, "status": "pending", "sent_at": {"$ne": None}}):
            skipped.append({"employee_id": eid, "reason": "لديه فحص مفتوح بالفعل"})
            continue
        r = await db.hr_presence_checks.insert_one({"employee_id": eid, "date": _today(), "scheduled_at": _iso(now), "sent_at": None, "expires_at": None, "status": "pending", "manual": True,
                                                    "by_name": current_user.get("full_name", ""), "timeout_minutes": timeout, "attempts": [], "created_at": _now()})
        created.append(str(r.inserted_id))
    res = await dispatch_due(db)
    await log_activity(current_user, "hr_presence_send_now", "hr_presence_check", ",".join(created), f"{len(created)} فحص فوري")
    return {"message": f"أُرسل {len(created)} فحص فوري" + (f" · تُخُطّي {len(skipped)}" if skipped else ""), "created": created, "skipped": skipped, "dispatched": res}


@router.get("/report")
async def report(date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_ATTEND)
    db = get_db()
    d = (date or _today())[:10]
    rows = [_ser(c) for c in await db.hr_presence_checks.find({"date": d}).sort("scheduled_at", 1).to_list(5000)]
    for r in rows:
        r["status_label"] = STATUS.get(r["status"], r["status"])
    await enrich_employee_refs(db, rows)
    summary = {k: sum(1 for r in rows if r["status"] == k) for k in STATUS}
    summary["total"] = len(rows)
    summary["planned_unsent"] = sum(1 for r in rows if r["status"] == "pending" and not r.get("sent_at"))
    return {"date": d, "summary": summary, "rows": rows, "statuses": STATUS, "settings": await get_settings(db)}


@router.post("/run")
async def run_internal(_k: None = Depends(_check_key)):
    """تشغيل خارجي (Cloud Scheduler) بهيدر X-Internal-Key — بديل عند عدم بقاء الخدمة حيّة"""
    return await presence_tick(get_db())


@router.post("/run-now")
async def run_now(current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_ATTEND)
    db = get_db()
    p = await plan_day(db, force=False)
    return {"plan": p, "dispatch": await dispatch_due(db)}


# ══════════════ الموظف ══════════════

def _public(c: dict) -> dict:
    return {"id": c["id"], "status": c["status"], "status_label": STATUS.get(c["status"], c["status"]), "sent_at": c.get("sent_at"), "expires_at": c.get("expires_at"),
            "timeout_minutes": c.get("timeout_minutes"), "manual": bool(c.get("manual")), "response": c.get("response"), "remaining_seconds": max(0, int((datetime.fromisoformat(c["expires_at"]) - datetime.now(YEMEN_TZ)).total_seconds())) if c.get("expires_at") and c["status"] == "pending" else 0}


@router.get("/my")
async def my_checks(current_user: dict = Depends(get_current_user)):
    db = get_db()
    emp = await find_my_employee(db, current_user)
    if not emp:
        return {"pending": None, "today": []}
    eid = str(emp["_id"])
    await dispatch_due(db)
    rows = [_ser(c) for c in await db.hr_presence_checks.find({"employee_id": eid, "date": _today(), "sent_at": {"$ne": None}}).sort("sent_at", 1).to_list(50)]
    pend = next((c for c in rows if c["status"] == "pending"), None)
    return {"pending": _public(pend) if pend else None, "today": [_public(c) for c in rows]}


@router.post("/{check_id}/confirm")
async def confirm(check_id: str, data: ConfirmIn, current_user: dict = Depends(get_current_user)):
    db = get_db()
    emp = await find_my_employee(db, current_user)
    if not emp:
        raise HTTPException(status_code=404, detail="لا يوجد ملف إداري مرتبط بحسابك")
    c = await db.hr_presence_checks.find_one({"_id": _oid(check_id, "معرّف الفحص"), "employee_id": str(emp["_id"])})
    if not c:
        raise HTTPException(status_code=404, detail="الفحص غير موجود")
    if c["status"] != "pending" or not c.get("sent_at"):
        raise HTTPException(status_code=400, detail="هذا الفحص مُغلق" if c["status"] != "pending" else "لم يُرسل الفحص بعد")
    now = datetime.now(YEMEN_TZ)
    if datetime.fromisoformat(c["expires_at"]) < now:
        await db.hr_presence_checks.update_one({"_id": c["_id"]}, {"$set": {"status": "expired", "closed_at": _iso(now)}})
        raise HTTPException(status_code=400, detail="انتهت مهلة التأكيد")
    attempt = {"at": _iso(now), "latitude": data.latitude, "longitude": data.longitude, "accuracy": data.accuracy, "biometric_verified": bool(data.biometric_verified)}
    if not data.biometric_verified:
        attempt["reason"] = "failed_biometric"
        await db.hr_presence_checks.update_one({"_id": c["_id"]}, {"$push": {"attempts": attempt}})
        raise HTTPException(status_code=403, detail="لم يتم التعرف على هويتك — أعد المحاولة بالبصمة أو Face ID")
    if data.latitude is None or data.longitude is None:
        attempt["reason"] = "no_location"
        await db.hr_presence_checks.update_one({"_id": c["_id"]}, {"$push": {"attempts": attempt}})
        raise HTTPException(status_code=400, detail="يلزم تفعيل الموقع لتأكيد التواجد")
    locs = await active_locations(db)
    ranked = rank_locations(locs, data.latitude, data.longitude, data.accuracy) if locs else []
    near = next((l for l in ranked if l["in_range"]), None) or (ranked[0] if ranked else None)
    in_range = bool(near and near["in_range"]) or not locs
    attempt.update({"in_range": in_range, "location_id": near["id"] if near else None, "location_name": near["name"] if near else "", "distance_m": near["distance_m"] if near else None})
    if not in_range:
        attempt["reason"] = "out_of_range"
        await db.hr_presence_checks.update_one({"_id": c["_id"]}, {"$push": {"attempts": attempt}})
        raise HTTPException(status_code=403, detail=f"أنت خارج نطاق العمل — أقرب موقع: {near['name']} (يبعد {near['distance_m']} م، والمسموح {near['radius_meters']} م)")
    await db.hr_presence_checks.update_one({"_id": c["_id"]}, {"$set": {"status": "confirmed", "response": attempt, "closed_at": _iso(now)}, "$push": {"attempts": attempt}})
    return {"message": "تم تأكيد التواجد ✅", "status": "confirmed", "in_range": True, "location_name": attempt["location_name"], "distance_m": attempt["distance_m"], "confirmed_at": _iso(now)}
