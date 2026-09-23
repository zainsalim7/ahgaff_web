"""🔔 شؤون الموظفين — التنبيهات التلقائية + ملخص لوحة القيادة
- يومياً 08:00 (اليمن): تذكير الموظف (ومديره) بإجازة تبدأ غداً · تذكير بالمهام المستحقة غداً والمتأخرة
- أسبوعياً (السبت 08:00): تذكير HR بالعقود/الهويات المنتهية خلال 60 يوماً + التقييمات المعلّقة
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from .deps import get_db, get_current_user, has_permission
from .hr_common import (P_MANAGE, P_LEAVES, P_APPRAISE, YEMEN_TZ, _now, _today, _can_view, employee_user_ids, notify_users, hr_manager_user_ids, enrich_employee_refs,
                        get_hr_settings, is_work_day, parse_date)

router = APIRouter(prefix="/hr/alerts", tags=["شؤون الموظفين - التنبيهات"])
logger = logging.getLogger(__name__)
RUN_HOUR, WEEKLY_WEEKDAY = 8, 5  # السبت


async def _once(db, key: str) -> bool:
    """يمنع تكرار نفس التنبيه في نفس اليوم"""
    r = await db.hr_alert_state.update_one({"_id": key}, {"$setOnInsert": {"at": _now()}}, upsert=True)
    return r.upserted_id is not None


async def run_daily_alerts(db, force: bool = False) -> dict:
    t = datetime.now(YEMEN_TZ).date()
    tomorrow = (t + timedelta(days=1)).strftime("%Y-%m-%d")
    out = {"leave_tomorrow": 0, "leave_ending": 0, "tasks_due_tomorrow": 0, "tasks_overdue": 0}
    if not force and not await _once(db, f"daily_{t}"):
        return {**out, "skipped": True}
    from .hr_leaves import LEAVE_TYPES
    # إجازات تبدأ غداً → الموظف + مديره
    leaves = await db.leave_requests.find({"status": "approved", "start_date": tomorrow}).to_list(1000)
    uids = await employee_user_ids(db, [l["employee_id"] for l in leaves])
    for l in leaves:
        emp = await db.employees.find_one({"_id": ObjectId(l["employee_id"])}, {"full_name": 1, "manager_employee_id": 1})
        label = LEAVE_TYPES.get(l["type"], "إجازة")
        if uids.get(l["employee_id"]):
            await notify_users(db, [uids[l["employee_id"]]], "تذكير: إجازتك تبدأ غداً 🏖️", f"إجازة {label} من {l['start_date']} إلى {l['end_date']} ({l['days']} يوم عمل)", "hr_leave", {"leave_id": str(l["_id"])})
            out["leave_tomorrow"] += 1
        mid = (emp or {}).get("manager_employee_id")
        if mid:
            muid = (await employee_user_ids(db, [mid])).get(mid)
            if muid:
                await notify_users(db, [muid], "غداً يبدأ أحد فريقك إجازته", f"{(emp or {}).get('full_name', '')} — إجازة {label} حتى {l['end_date']}", "hr_leave", {"leave_id": str(l["_id"])})
    # إجازات تنتهي اليوم → تذكير بالعودة غداً
    ending = await db.leave_requests.find({"status": "approved", "end_date": t.strftime("%Y-%m-%d")}).to_list(1000)
    euids = await employee_user_ids(db, [l["employee_id"] for l in ending])
    for l in ending:
        if euids.get(l["employee_id"]):
            await notify_users(db, [euids[l["employee_id"]]], "تنتهي إجازتك اليوم", "نتمنى لك عودة موفقة — دوامك يبدأ من يوم العمل التالي", "hr_leave", {"leave_id": str(l["_id"])})
            out["leave_ending"] += 1
    # مهام تستحق غداً / متأخرة
    tasks = await db.hr_tasks.find({"status": {"$in": ["open", "in_progress"]}, "due_date": {"$in": [tomorrow]}}).to_list(2000)
    tuids = await employee_user_ids(db, [x["assignee_employee_id"] for x in tasks])
    for x in tasks:
        if tuids.get(x["assignee_employee_id"]):
            await notify_users(db, [tuids[x["assignee_employee_id"]]], "مهمة تستحق غداً ⏰", x["title"], "hr_task", {"task_id": str(x["_id"])})
            out["tasks_due_tomorrow"] += 1
    overdue = await db.hr_tasks.find({"status": {"$in": ["open", "in_progress"]}, "due_date": {"$lt": t.strftime("%Y-%m-%d"), "$ne": None}}).to_list(2000)
    ouids = await employee_user_ids(db, [x["assignee_employee_id"] for x in overdue])
    by_user: dict = {}
    for x in overdue:
        u = ouids.get(x["assignee_employee_id"])
        if u:
            by_user.setdefault(u, []).append(x["title"])
    for u, titles in by_user.items():
        await notify_users(db, [u], f"لديك {len(titles)} مهمة متأخرة", " · ".join(titles[:3]) + (" …" if len(titles) > 3 else ""), "hr_task")
        out["tasks_overdue"] += 1
    return out


async def run_weekly_alerts(db, force: bool = False) -> dict:
    t = datetime.now(YEMEN_TZ).date()
    out = {"expiring_contracts": 0, "expiring_ids": 0, "pending_appraisals": 0, "pending_leaves": 0, "notified_hr": 0}
    if not force and not await _once(db, f"weekly_{t.isocalendar()[0]}_{t.isocalendar()[1]}"):
        return {**out, "skipped": True}
    limit = (t + timedelta(days=60)).strftime("%Y-%m-%d")
    today = t.strftime("%Y-%m-%d")
    contracts = await db.employees.find({"status": {"$ne": "ended"}, "contract_end_date": {"$ne": None, "$lte": limit}}, {"full_name": 1, "contract_end_date": 1}).to_list(1000)
    ids = await db.employees.find({"status": {"$ne": "ended"}, "id_expiry_date": {"$ne": None, "$lte": limit}}, {"full_name": 1, "id_expiry_date": 1}).to_list(1000)
    out["expiring_contracts"], out["expiring_ids"] = len(contracts), len(ids)
    out["pending_appraisals"] = await db.hr_appraisals.count_documents({"status": "submitted"})
    out["pending_leaves"] = await db.leave_requests.count_documents({"status": {"$in": ["pending", "hr_pending"]}})
    lines = []
    if contracts:
        lines.append(f"عقود تنتهي خلال 60 يوماً: {len(contracts)} (" + "، ".join(f"{c['full_name']} {c['contract_end_date']}" for c in contracts[:3]) + (" …" if len(contracts) > 3 else "") + ")")
    if ids:
        lines.append(f"هويات/إقامات تنتهي: {len(ids)}")
    if out["pending_leaves"]:
        lines.append(f"طلبات إجازة معلّقة: {out['pending_leaves']}")
    if out["pending_appraisals"]:
        lines.append(f"تقييمات بانتظار الاعتماد: {out['pending_appraisals']}")
    if lines:
        hr_users = set(await hr_manager_user_ids(db, P_MANAGE)) | set(await hr_manager_user_ids(db, P_LEAVES))
        await notify_users(db, hr_users, "الملخص الأسبوعي لشؤون الموظفين 📋", " · ".join(lines), "hr_digest")
        out["notified_hr"] = len(hr_users)
    return out


async def hr_alerts_loop():
    await asyncio.sleep(30)
    while True:
        try:
            now = datetime.now(YEMEN_TZ)
            if now.hour == RUN_HOUR:
                db = get_db()
                await run_daily_alerts(db)
                if now.weekday() == WEEKLY_WEEKDAY:
                    await run_weekly_alerts(db)
        except Exception as e:
            logger.error(f"hr alerts loop error: {e}")
        await asyncio.sleep(60)


async def hr_dashboard_summary(db) -> dict:
    """ملخص شؤون الموظفين للوحة القيادة: غياب اليوم، في إجازة، طلبات معلّقة، مهام متأخرة، عقود تنتهي"""
    t = _today()
    settings = await get_hr_settings(db)
    from .hr_leaves import LEAVE_TYPES
    on_leave = [{"employee_id": l["employee_id"], "type": LEAVE_TYPES.get(l["type"], ""), "end_date": l["end_date"]} for l in await db.leave_requests.find({"status": "approved", "start_date": {"$lte": t}, "end_date": {"$gte": t}}, {"employee_id": 1, "type": 1, "end_date": 1}).to_list(500)]
    absent = [{"employee_id": r["employee_id"], "note": r.get("note", "")} for r in await db.hr_attendance.find({"date": t, "status": "absent"}, {"employee_id": 1, "note": 1}).to_list(500)]
    late = await db.hr_attendance.count_documents({"date": t, "status": "late"})
    present = await db.hr_attendance.count_documents({"date": t, "status": {"$in": ["present", "late", "half_day", "mission"]}})
    active = await db.employees.count_documents({"status": {"$nin": ["ended", "suspended"]}})
    pending = [{"employee_id": l["employee_id"], "type": LEAVE_TYPES.get(l["type"], ""), "start_date": l["start_date"], "days": l["days"], "status": l["status"]} for l in await db.leave_requests.find({"status": {"$in": ["pending", "hr_pending"]}}, {"employee_id": 1, "type": 1, "start_date": 1, "days": 1, "status": 1}).sort("created_at", 1).limit(20).to_list(20)]
    limit = (datetime.now(YEMEN_TZ).date() + timedelta(days=60)).strftime("%Y-%m-%d")
    expiring = [{"employee_id": str(e["_id"]), "contract_end_date": e["contract_end_date"]} for e in await db.employees.find({"status": {"$ne": "ended"}, "contract_end_date": {"$ne": None, "$lte": limit}}, {"contract_end_date": 1}).sort("contract_end_date", 1).limit(20).to_list(20)]
    for lst in (on_leave, absent, pending, expiring):
        await enrich_employee_refs(db, lst)
    is_wd = is_work_day(parse_date(t), settings)
    return {"date": t, "is_work_day": is_wd, "employees_active": active, "present_today": present, "late_today": late, "absent_today": absent, "on_leave_today": on_leave,
            "unmarked_today": max(0, active - present - len(absent) - len(on_leave) - await db.hr_attendance.count_documents({"date": t, "status": {"$in": ["excused"]}})) if is_wd else 0,
            "pending_leaves": pending, "pending_leaves_count": await db.leave_requests.count_documents({"status": {"$in": ["pending", "hr_pending"]}}),
            "overdue_tasks": await db.hr_tasks.count_documents({"status": {"$in": ["open", "in_progress"]}, "due_date": {"$lt": t, "$ne": None}}),
            "pending_appraisals": await db.hr_appraisals.count_documents({"status": "submitted"}), "expiring_contracts": expiring}


@router.get("/summary")
async def summary(current_user: dict = Depends(get_current_user)):
    if not _can_view(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    return await hr_dashboard_summary(get_db())


@router.post("/run-now")
async def run_now(kind: str = "daily", current_user: dict = Depends(get_current_user)):
    """تشغيل فوري للتنبيهات (للاختبار / الإرسال اليدوي)"""
    if not has_permission(current_user, P_MANAGE):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_db()
    res = await (run_weekly_alerts(db, force=True) if kind == "weekly" else run_daily_alerts(db, force=True))
    return {"kind": kind, **res, "message": "تم تشغيل التنبيهات"}
