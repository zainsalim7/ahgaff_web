"""🕐 شؤون الموظفين — الحضور الإداري: إعدادات الدوام، الكشف اليومي، تسجيل ذاتي، التقرير الشهري"""
import io
from datetime import datetime, timedelta, date
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from bson import ObjectId

from .deps import get_db, get_current_user, log_activity, export_headers, export_filename
from .hr_common import (P_ATTEND, P_WORK_SETTINGS, YEMEN_TZ, AR_DAYS, DEFAULT_SETTINGS, _now, _today, _oid, _ser, _can_view, _guard, parse_date, get_hr_settings,
                        is_work_day, holiday_name, find_my_employee, enrich_employee_refs, employee_shifts, pick_shift, shift_late, employee_user_ids, notify_users, hr_manager_user_ids)
from .hr_locations import GeoIn, evaluate_geo, geo_exempt_active

router = APIRouter(prefix="/hr/attendance", tags=["شؤون الموظفين - الحضور الإداري"])

ATT_STATUS = {"present": "حاضر", "late": "متأخر", "half_day": "نصف يوم", "absent": "غائب", "excused": "غياب بعذر", "leave": "إجازة", "mission": "مهمة رسمية", "holiday": "عطلة"}
MANUAL = ("present", "late", "half_day", "absent", "excused", "mission")
COUNTED_PRESENT = ("present", "late", "half_day", "mission")


class SettingsIn(BaseModel):
    work_days: List[str]
    work_start: str
    work_end: str
    late_grace_minutes: int = 15
    early_leave_grace_minutes: int = 0
    allow_self_checkin: bool = True
    annual_leave_days: int = 30
    holidays: List[dict] = []
    geofence_required: bool = True


class Entry(BaseModel):
    employee_id: str
    status: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    note: Optional[str] = ""
    shift_id: Optional[str] = None


class MarkIn(BaseModel):
    date: str
    entries: List[Entry]


class DateIn(BaseModel):
    date: str


def _hm(s: str, what: str = "الوقت") -> int:
    try:
        h, m = s.split(":")[:2]
        return int(h) * 60 + int(m)
    except Exception:
        raise HTTPException(status_code=400, detail=f"{what} غير صحيح (HH:MM)")


def _late(check_in: Optional[str], settings: dict) -> int:
    if not check_in:
        return 0
    return max(0, _hm(check_in) - _hm(settings["work_start"]) - int(settings.get("late_grace_minutes", 0)))


async def _leave_map(db, d: str) -> dict:
    """employee_id -> نوع الإجازة المعتمدة في هذا اليوم"""
    from .hr_leaves import LEAVE_TYPES
    return {l["employee_id"]: LEAVE_TYPES.get(l.get("type"), "إجازة") async for l in db.leave_requests.find({"status": "approved", "start_date": {"$lte": d}, "end_date": {"$gte": d}}, {"employee_id": 1, "type": 1})}


@router.get("/meta")
async def attendance_meta(current_user: dict = Depends(get_current_user)):
    return {"statuses": ATT_STATUS, "manual": list(MANUAL), "days": list(AR_DAYS.values())}


@router.get("/settings")
async def get_settings(current_user: dict = Depends(get_current_user)):
    return await get_hr_settings(get_db())


@router.put("/settings")
async def put_settings(data: SettingsIn, current_user: dict = Depends(get_current_user)):
    """(قديم) يحدّث الإعدادات العامة وأوقات الفترة الأساسية — الإدارة الكاملة للفترات في /hr/work-settings"""
    _guard(current_user, P_WORK_SETTINGS)
    db = get_db()
    if _hm(data.work_start, "بداية الدوام") >= _hm(data.work_end, "نهاية الدوام"):
        raise HTTPException(status_code=400, detail="نهاية الدوام يجب أن تكون بعد بدايته")
    bad = [d for d in data.work_days if d not in AR_DAYS.values()]
    if bad or not data.work_days:
        raise HTTPException(status_code=400, detail="أيام العمل غير صحيحة")
    hol = []
    for h in data.holidays:
        if not h.get("date"):
            continue
        parse_date(h["date"], "تاريخ العطلة")
        hol.append({"date": h["date"][:10], "name": (h.get("name") or "عطلة رسمية").strip()})
    cur = await get_hr_settings(db)
    main = {**cur["shifts"][0], "work_start": data.work_start, "work_end": data.work_end, "late_grace_minutes": data.late_grace_minutes, "early_leave_grace_minutes": data.early_leave_grace_minutes}
    doc = {**data.dict(), "shifts": [main] + cur["shifts"][1:], "holidays": sorted(hol, key=lambda x: x["date"]), "updated_by_name": current_user.get("full_name", ""), "updated_at": _now()}
    await db.hr_settings.update_one({"_id": "global"}, {"$set": doc}, upsert=True)
    await log_activity(current_user, "hr_attendance_settings", "hr_settings", "global", "إعدادات الدوام")
    return {"message": "تم حفظ إعدادات الدوام", "settings": await get_hr_settings(db)}



def _minutes_since(hm: Optional[str]) -> Optional[int]:
    if not hm:
        return None
    now = datetime.now(YEMEN_TZ)
    return (now.hour * 60 + now.minute) - _hm(hm, "الوقت")


def _correction_state(settings: dict, recs: list) -> dict:
    """هل يمكن للموظف تصحيح آخر حضور/انصراف الآن؟ (ضمن فترة السماح من الإعدادات)"""
    enabled = bool(settings.get("correction_enabled", True))
    win = int(settings.get("correction_window_minutes", 10))
    self_recs = [r for r in recs if r.get("source") == "self"]
    open_rec = next((r for r in self_recs if not r.get("check_out")), None)
    last_out = max((r for r in self_recs if r.get("check_out")), key=lambda r: r["check_out"], default=None)
    m_in = _minutes_since(open_rec["check_in"]) if open_rec else None
    m_out = _minutes_since(last_out["check_out"]) if last_out else None
    can_in = enabled and m_in is not None and 0 <= m_in < win
    can_out = enabled and m_out is not None and 0 <= m_out < win and not open_rec
    return {"enabled": enabled, "window_minutes": win, "can_correct_check_in": can_in, "can_correct_check_out": can_out,
            "check_in_seconds_left": max(0, (win - m_in) * 60) if can_in else 0, "check_out_seconds_left": max(0, (win - m_out) * 60) if can_out else 0,
            "_open": open_rec, "_last_out": last_out}


def _require_correction(settings: dict, minutes: Optional[int]):
    if not settings.get("correction_enabled", True):
        raise HTTPException(status_code=400, detail="خاصية التصحيح غير مفعّلة")
    win = int(settings.get("correction_window_minutes", 10))
    if minutes is None or minutes < 0 or minutes >= win:
        raise HTTPException(status_code=400, detail=f"انتهت فترة التصحيح ({win} دقائق)")


def _rec_shift(r: dict, shifts: list) -> str:
    """فترة السجل؛ السجلات القديمة بلا shift_id تُنسب للفترة الأولى للموظف"""
    return r.get("shift_id") or shifts[0]["id"]


def _warnings(r: dict) -> List[str]:
    """⚠️ علامات تحذيرية تظهر في تقارير الإدارة"""
    w = []
    if r.get("auto_absent"):
        w.append("غياب تلقائي — لم يحضر")
    if r.get("was_auto_absent"):
        w.append("حضر بعد تسجيله غائباً تلقائياً")
    if (r.get("check_in_geo") or {}).get("status") == "out_of_range":
        w.append("حضور خارج نطاق العمل")
    if (r.get("check_out_geo") or {}).get("status") == "out_of_range":
        w.append("انصراف خارج نطاق العمل")
    if r.get("auto_checkout"):
        w.append("انصراف تلقائي — لم يسجّل الانصراف")
    return w


async def _daily_rows(db, d: str, org_unit_id: Optional[str], category: Optional[str], settings: dict) -> List[dict]:
    q: dict = {"status": {"$nin": ["ended", "suspended"]}}
    if org_unit_id:
        q["org_unit_id"] = org_unit_id
    if category:
        q["category"] = category
    emps = await db.employees.find(q, {"full_name": 1, "employee_no": 1, "org_unit_id": 1, "job_title": 1, "category": 1, "shift_ids": 1}).sort("full_name", 1).to_list(5000)
    recs: dict = {}
    for r in await db.hr_attendance.find({"date": d}).to_list(10000):
        recs.setdefault(r["employee_id"], []).append(r)
    leaves = await _leave_map(db, d)
    day = parse_date(d)
    workday, hol = is_work_day(day, settings), holiday_name(day, settings)
    multi = len(settings["shifts"]) > 1
    rows = []
    for e in emps:
        eid = str(e["_id"])
        shifts = employee_shifts(e, settings)
        mine = recs.get(eid, [])
        for sh in shifts:
            r = next((x for x in mine if _rec_shift(x, shifts) == sh["id"]), None)
            if r:
                row = {**_ser(r), "recorded": True, "warnings": _warnings(r)}
            elif eid in leaves:
                row = {"employee_id": eid, "status": "leave", "note": leaves[eid], "recorded": False}
            elif not workday:
                row = {"employee_id": eid, "status": "holiday", "note": hol or "خارج أيام العمل", "recorded": False}
            else:
                row = {"employee_id": eid, "status": None, "recorded": False}
            row.update({"status_label": ATT_STATUS.get(row.get("status") or "", "لم يُسجَّل"), "category": e.get("category"), "shift_id": sh["id"], "shift_name": sh["name"] if multi else "",
                        "shift_start": sh["work_start"], "shift_end": sh["work_end"], "row_key": f"{eid}:{sh['id']}", "shifts_count": len(shifts)})
            rows.append(row)
    await enrich_employee_refs(db, rows)
    return rows


@router.get("/daily")
async def daily_sheet(date: Optional[str] = None, org_unit_id: Optional[str] = None, category: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if not _can_view(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_db()
    d = date or _today()
    day = parse_date(d)
    settings = await get_hr_settings(db)
    rows = await _daily_rows(db, d, org_unit_id, category, settings)
    summary = {k: 0 for k in [*ATT_STATUS, "unmarked"]}
    for r in rows:
        summary[r["status"] or "unmarked"] += 1
    return {"date": d, "day_name": AR_DAYS[day.weekday()], "is_work_day": is_work_day(day, settings), "holiday": holiday_name(day, settings), "settings": settings, "rows": rows, "summary": summary, "total": len(rows)}


@router.post("/mark")
async def mark_attendance(data: MarkIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_ATTEND)
    db = get_db()
    parse_date(data.date)
    if data.date > _today():
        raise HTTPException(status_code=400, detail="لا يمكن تسجيل حضور لتاريخ مستقبلي")
    settings = await get_hr_settings(db)
    saved = 0
    for en in data.entries:
        if en.status not in MANUAL:
            raise HTTPException(status_code=400, detail=f"حالة غير مسموحة: {en.status}")
        emp = await db.employees.find_one({"_id": _oid(en.employee_id, "الموظف")}, {"shift_ids": 1})
        if not emp:
            raise HTTPException(status_code=404, detail="الموظف غير موجود")
        shifts = employee_shifts(emp, settings)
        sh = next((x for x in shifts if x["id"] == en.shift_id), shifts[0])
        ci = en.check_in or (sh["work_start"] if en.status in ("present", "late", "half_day", "mission") else None)
        co = en.check_out or None
        if ci: _hm(ci, "وقت الحضور")
        if co: _hm(co, "وقت الانصراف")
        late = shift_late(ci, sh) if en.status in ("present", "late") else 0
        status = "late" if (en.status == "present" and late > 0) else en.status
        flt = {"employee_id": en.employee_id, "date": data.date}
        flt.update({"$or": [{"shift_id": sh["id"]}, {"shift_id": {"$exists": False}}]} if sh["id"] == shifts[0]["id"] else {"shift_id": sh["id"]})
        await db.hr_attendance.update_one(flt, {"$set": {
            "status": status, "check_in": ci, "check_out": co, "late_minutes": late, "note": (en.note or "").strip(), "source": "manual", "shift_id": sh["id"], "shift_name": sh["name"], "auto_absent": False,
            "by_name": current_user.get("full_name", ""), "updated_at": _now()}, "$setOnInsert": {"created_at": _now()}}, upsert=True)
        saved += 1
    await log_activity(current_user, "hr_attendance_mark", "hr_attendance", data.date, "تسجيل حضور إداري", {"count": saved})
    return {"saved": saved, "message": f"تم حفظ {saved} سجلاً"}


@router.post("/mark-all-present")
async def mark_all_present(data: DateIn, org_unit_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """✅ تحديد كل من لم يُسجَّل (وليس في إجازة) حاضراً في وقت الدوام الرسمي"""
    _guard(current_user, P_ATTEND)
    db = get_db()
    if data.date > _today():
        raise HTTPException(status_code=400, detail="لا يمكن تسجيل حضور لتاريخ مستقبلي")
    settings = await get_hr_settings(db)
    if not is_work_day(parse_date(data.date), settings):
        raise HTTPException(status_code=400, detail="هذا اليوم ليس يوم عمل")
    rows = await _daily_rows(db, data.date, org_unit_id, None, settings)
    n = 0
    for r in rows:
        if r["status"] is None:
            await db.hr_attendance.insert_one({"employee_id": r["employee_id"], "date": data.date, "status": "present", "check_in": r["shift_start"], "check_out": r["shift_end"], "late_minutes": 0, "note": "", "source": "bulk",
                                               "shift_id": r["shift_id"], "shift_name": r.get("shift_name") or "", "by_name": current_user.get("full_name", ""), "created_at": _now(), "updated_at": _now()})
            n += 1
    await log_activity(current_user, "hr_attendance_bulk", "hr_attendance", data.date, "تحديد الكل حاضر", {"count": n})
    return {"marked": n, "message": f"تم تحديد {n} موظفاً حاضراً"}


@router.delete("/record/{employee_id}/{d}")
async def delete_record(employee_id: str, d: str, shift_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_ATTEND)
    db = get_db()
    q: dict = {"employee_id": employee_id, "date": d}
    if shift_id:
        settings = await get_hr_settings(db)
        q = {**q, "$or": [{"shift_id": shift_id}, {"shift_id": {"$exists": False}}]} if shift_id == settings["shifts"][0]["id"] else {**q, "shift_id": shift_id}
    r = await db.hr_attendance.delete_one(q)
    return {"deleted": r.deleted_count, "message": "تم حذف السجل"}


async def _monthly(db, month: str, org_unit_id: Optional[str], category: Optional[str]) -> dict:
    try:
        y, m = int(month[:4]), int(month[5:7])
        first = date(y, m, 1)
    except Exception:
        raise HTTPException(status_code=400, detail="الشهر غير صحيح (YYYY-MM)")
    last = (date(y + (m == 12), (m % 12) + 1, 1) - timedelta(days=1))
    today = datetime.now(YEMEN_TZ).date()
    end = min(last, today)
    settings = await get_hr_settings(db)
    work_dates = [(first + timedelta(days=i)).strftime("%Y-%m-%d") for i in range((end - first).days + 1) if is_work_day(first + timedelta(days=i), settings)] if end >= first else []
    q: dict = {"status": {"$nin": ["ended"]}}
    if org_unit_id:
        q["org_unit_id"] = org_unit_id
    if category:
        q["category"] = category
    emps = await db.employees.find(q, {"full_name": 1, "employee_no": 1, "org_unit_id": 1, "job_title": 1, "hire_date": 1, "shift_ids": 1}).sort("full_name", 1).to_list(5000)
    recs: dict = {}
    async for r in db.hr_attendance.find({"date": {"$gte": first.strftime("%Y-%m-%d"), "$lte": end.strftime("%Y-%m-%d")}}):
        recs.setdefault(r["employee_id"], {}).setdefault(r["date"], []).append(r)
    leaves: dict = {}
    async for l in db.leave_requests.find({"status": "approved", "start_date": {"$lte": end.strftime("%Y-%m-%d")}, "end_date": {"$gte": first.strftime("%Y-%m-%d")}}, {"employee_id": 1, "start_date": 1, "end_date": 1}):
        leaves.setdefault(l["employee_id"], []).append((l["start_date"], l["end_date"]))
    items = []
    for e in emps:
        eid = str(e["_id"])
        n_shifts = len(employee_shifts(e, settings))
        c = {k: 0 for k in ATT_STATUS}
        c["unmarked"] = 0
        late_min = 0
        for d in work_dates:
            if e.get("hire_date") and d < e["hire_date"]:
                continue
            day_recs = recs.get(eid, {}).get(d, [])
            for r in day_recs:
                c[r["status"]] = c.get(r["status"], 0) + 1
                late_min += int(r.get("late_minutes") or 0)
            missing = n_shifts - len(day_recs)
            if missing > 0:
                if any(s <= d <= en for s, en in leaves.get(eid, [])):
                    c["leave"] += missing
                else:
                    c["unmarked"] += missing
        # سجلات في أيام غير عمل (مهمات مثلاً) تُحسب حضوراً إضافياً
        extra = sum(1 for d, rs in recs.get(eid, {}).items() if d not in work_dates for r in rs if r["status"] in COUNTED_PRESENT)
        present_total = sum(c[k] for k in COUNTED_PRESENT)
        due = max(0, len(work_dates) * n_shifts - c["leave"] - c["excused"])
        items.append({"employee_id": eid, "counts": c, "present_total": present_total, "extra_days": extra, "late_minutes": late_min, "due_days": due, "shifts_count": n_shifts,
                      "rate": round(present_total / due * 100, 1) if due else None})
    await enrich_employee_refs(db, items)
    return {"month": month, "work_days": len(work_dates), "from": first.strftime("%Y-%m-%d"), "to": end.strftime("%Y-%m-%d"), "items": items,
            "totals": {"present": sum(i["present_total"] for i in items), "absent": sum(i["counts"]["absent"] for i in items), "late": sum(i["counts"]["late"] for i in items), "leave": sum(i["counts"]["leave"] for i in items)}}


@router.get("/monthly")
async def monthly_report(month: Optional[str] = None, org_unit_id: Optional[str] = None, category: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if not _can_view(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    return await _monthly(get_db(), month or _today()[:7], org_unit_id, category)


@router.get("/monthly/export")
async def monthly_export(month: Optional[str] = None, org_unit_id: Optional[str] = None, category: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if not _can_view(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    rep = await _monthly(get_db(), month or _today()[:7], org_unit_id, category)
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    wb = Workbook(); ws = wb.active; ws.title = "الحضور الإداري"; ws.sheet_view.rightToLeft = True
    ws.append([f"تقرير الحضور الإداري — {rep['month']} (أيام العمل: {rep['work_days']})"]); ws.merge_cells("A1:L1")
    ws["A1"].font = Font(bold=True, size=13); ws["A1"].alignment = Alignment(horizontal="center")
    heads = ["الرقم الوظيفي", "الاسم", "الوحدة", "المسمى", "حاضر", "متأخر", "نصف يوم", "مهمة", "غائب", "بعذر", "إجازة", "لم يُسجَّل", "دقائق التأخير", "نسبة الحضور %"]
    ws.append(heads)
    for c in ws[2]:
        c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="0F2440"); c.alignment = Alignment(horizontal="center")
    for i in rep["items"]:
        c = i["counts"]
        ws.append([i["employee_no"], i["employee_name"], i["org_unit_name"], i["job_title"], c["present"], c["late"], c["half_day"], c["mission"], c["absent"], c["excused"], c["leave"], c["unmarked"], i["late_minutes"], i["rate"] if i["rate"] is not None else "—"])
    from openpyxl.utils import get_column_letter
    for ci in range(1, len(heads) + 1):
        ws.column_dimensions[get_column_letter(ci)].width = 16
    ws.column_dimensions["B"].width = 30
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=export_headers(export_filename("الحضور الإداري", rep["month"], ext="xlsx")))


@router.get("/employee/{employee_id}")
async def employee_records(employee_id: str, month: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if not _can_view(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_db()
    m = month or _today()[:7]
    recs = [_ser(r) for r in await db.hr_attendance.find({"employee_id": employee_id, "date": {"$regex": f"^{m}"}}).sort("date", -1).to_list(100)]
    for r in recs:
        r["status_label"] = ATT_STATUS.get(r["status"], r["status"])
    return {"month": m, "records": recs}


# ══════════════ 📋 التقرير التفصيلي (سجلات فردية/مشتركة مع الموقع) ══════════════

def _geo_cols(g: Optional[dict]) -> dict:
    g = g or {}
    return {"status": g.get("status"), "status_label": g.get("status_label") or "", "location_name": g.get("location_name") or "", "distance_m": g.get("distance_m"),
            "in_range": g.get("in_range"), "latitude": g.get("latitude"), "longitude": g.get("longitude"), "accuracy": g.get("accuracy")}


async def _details_query(db, date_from: str, date_to: str, employee_ids: Optional[str], org_unit_id: Optional[str], status: Optional[str],
                         late_only: bool, auto_only: bool, out_of_range_only: bool, search: Optional[str], warnings_only: bool = False):
    q: dict = {"date": {"$gte": date_from, "$lte": date_to}}
    emp_q: dict = {}
    if org_unit_id:
        emp_q["org_unit_id"] = org_unit_id
    if search:
        import re
        rx = {"$regex": re.escape(search.strip()), "$options": "i"}
        emp_q["$or"] = [{"full_name": rx}, {"employee_no": rx}]
    ids = [i for i in (employee_ids or "").split(",") if i]
    if emp_q:
        scoped = [str(e["_id"]) for e in await db.employees.find(emp_q, {"_id": 1}).to_list(5000)]
        ids = [i for i in ids if i in scoped] if ids else scoped
        if not ids:
            return None
    if ids:
        q["employee_id"] = {"$in": ids}
    if status:
        q["status"] = {"$in": [x for x in status.split(",") if x]}
    if late_only:
        q["$or"] = [{"status": "late"}, {"late_minutes": {"$gt": 0}}]
    if auto_only:
        q["auto_checkout"] = True
    if out_of_range_only:
        q["$or"] = [{"check_in_geo.status": "out_of_range"}, {"check_out_geo.status": "out_of_range"}, {"check_in_geo.in_range": False, "check_in_geo.status": {"$nin": ["auto", "exempt", None]}}]
    if warnings_only:
        q["$or"] = WARN_OR
    return q


WARN_OR = [{"auto_checkout": True}, {"auto_absent": True}, {"was_auto_absent": True}, {"check_in_geo.status": "out_of_range"}, {"check_out_geo.status": "out_of_range"}]


async def _details_rows(db, q: dict, skip: int = 0, limit: int = 0) -> List[dict]:
    cur = db.hr_attendance.find(q).sort([("date", -1), ("check_in", -1)]).skip(skip)
    if limit:
        cur = cur.limit(limit)
    recs = await cur.to_list(limit or 20000)
    emp_ids = {r["employee_id"] for r in recs if ObjectId.is_valid(r.get("employee_id", ""))}
    emps = {str(e["_id"]): e for e in await db.employees.find({"_id": {"$in": [ObjectId(i) for i in emp_ids]}}, {"full_name": 1, "employee_no": 1, "job_title": 1, "org_unit_id": 1}).to_list(5000)} if emp_ids else {}
    units = {str(u["_id"]): u.get("name", "") for u in await db.org_units.find({}, {"name": 1}).to_list(2000)}
    out = []
    for r in recs:
        e = emps.get(r["employee_id"], {})
        gi, go = _geo_cols(r.get("check_in_geo")), _geo_cols(r.get("check_out_geo"))
        out.append({"id": str(r["_id"]), "employee_id": r["employee_id"], "employee_name": e.get("full_name", ""), "employee_no": e.get("employee_no", ""), "job_title": e.get("job_title", ""),
                    "org_unit_name": units.get(e.get("org_unit_id") or "", ""), "date": r["date"], "shift_name": r.get("shift_name") or "", "status": r.get("status"), "status_label": ATT_STATUS.get(r.get("status") or "", r.get("status") or ""),
                    "check_in": r.get("check_in"), "check_out": r.get("check_out"), "late_minutes": r.get("late_minutes") or 0, "auto_checkout": bool(r.get("auto_checkout")), "auto_checkout_at": r.get("auto_checkout_at"),
                    "auto_absent": bool(r.get("auto_absent")), "was_auto_absent": bool(r.get("was_auto_absent")), "warnings": _warnings(r),
                    "source": r.get("source"), "note": r.get("note") or "", "check_in_geo": gi, "check_out_geo": go, "by_name": r.get("by_name", "")})
    return out


@router.get("/details")
async def attendance_details(date_from: Optional[str] = None, date_to: Optional[str] = None, employee_ids: Optional[str] = None, org_unit_id: Optional[str] = None,
                             status: Optional[str] = None, late_only: bool = False, auto_only: bool = False, out_of_range_only: bool = False, search: Optional[str] = None, warnings_only: bool = False,
                             page: int = 1, per_page: int = 50, current_user: dict = Depends(get_current_user)):
    """📋 سجلات الحضور التفصيلية لفترة — فردية أو مشتركة — مع التأخير والانصراف التلقائي والموقع/المسافة"""
    if not _can_view(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_db()
    t = _today()
    date_from, date_to = date_from or t[:8] + "01", date_to or t
    q = await _details_query(db, date_from, date_to, employee_ids, org_unit_id, status, late_only, auto_only, out_of_range_only, search, warnings_only)
    if q is None:
        return {"items": [], "total": 0, "page": 1, "per_page": per_page, "summary": {}, "from": date_from, "to": date_to}
    per_page = max(5, min(per_page, 500))
    total = await db.hr_attendance.count_documents(q)
    items = await _details_rows(db, q, (page - 1) * per_page, per_page)
    pipeline = [{"$match": q}, {"$group": {"_id": None, "late": {"$sum": {"$cond": [{"$gt": ["$late_minutes", 0]}, 1, 0]}}, "late_minutes": {"$sum": {"$ifNull": ["$late_minutes", 0]}},
                                             "auto": {"$sum": {"$cond": [{"$eq": ["$auto_checkout", True]}, 1, 0]}}, "out": {"$sum": {"$cond": [{"$or": [{"$eq": ["$check_in_geo.status", "out_of_range"]}, {"$eq": ["$check_out_geo.status", "out_of_range"]}]}, 1, 0]}},
                                             "auto_absent": {"$sum": {"$cond": [{"$eq": ["$auto_absent", True]}, 1, 0]}},
                                             "employees": {"$addToSet": "$employee_id"}}}]
    agg = await db.hr_attendance.aggregate(pipeline).to_list(1)
    a = agg[0] if agg else {}
    return {"items": items, "total": total, "page": page, "per_page": per_page, "from": date_from, "to": date_to,
            "summary": {"records": total, "employees": len(a.get("employees") or []), "late": a.get("late", 0), "late_minutes": a.get("late_minutes", 0), "auto": a.get("auto", 0), "out_of_range": a.get("out", 0), "auto_absent": a.get("auto_absent", 0)}}


@router.get("/details/export")
async def attendance_details_export(date_from: Optional[str] = None, date_to: Optional[str] = None, employee_ids: Optional[str] = None, org_unit_id: Optional[str] = None,
                                    status: Optional[str] = None, late_only: bool = False, auto_only: bool = False, out_of_range_only: bool = False, search: Optional[str] = None, warnings_only: bool = False,
                                    record_ids: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """📥 تصدير Excel للتقرير التفصيلي — كل النتائج المطابقة أو سجلات مختارة (record_ids)"""
    if not _can_view(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_db()
    t = _today()
    date_from, date_to = date_from or t[:8] + "01", date_to or t
    if record_ids:
        q: Optional[dict] = {"_id": {"$in": [ObjectId(i) for i in record_ids.split(",") if ObjectId.is_valid(i)]}}
    else:
        q = await _details_query(db, date_from, date_to, employee_ids, org_unit_id, status, late_only, auto_only, out_of_range_only, search, warnings_only)
    rows = await _details_rows(db, q) if q is not None else []
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter
    wb = Workbook(); ws = wb.active; ws.title = "التفصيلي"; ws.sheet_view.rightToLeft = True
    heads = ["التاريخ", "الرقم الوظيفي", "الاسم", "الوحدة", "المسمى", "الفترة", "الحالة", "حضور", "انصراف", "دقائق التأخير", "انصراف تلقائي", "تحذيرات", "موقع الحضور", "المسافة (م)", "داخل النطاق", "إحداثيات الحضور", "موقع الانصراف", "مسافة الانصراف (م)", "إحداثيات الانصراف", "المصدر", "ملاحظة"]
    ws.append([f"التقرير التفصيلي للحضور الإداري — من {date_from} إلى {date_to} ({len(rows)} سجل)"]); ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(heads))
    ws["A1"].font = Font(bold=True, size=13); ws["A1"].alignment = Alignment(horizontal="center")
    ws.append(heads)
    for c in ws[2]:
        c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="0F2440"); c.alignment = Alignment(horizontal="center")
    src = {"self": "ذاتي", "manual": "يدوي", "bulk": "جماعي"}
    coord = lambda g: f"{g['latitude']:.5f}, {g['longitude']:.5f}" if g.get("latitude") is not None and g.get("longitude") is not None else ""
    for r in rows:
        gi, go = r["check_in_geo"], r["check_out_geo"]
        ws.append([r["date"], r["employee_no"], r["employee_name"], r["org_unit_name"], r["job_title"], r["shift_name"], r["status_label"], r["check_in"] or "", r["check_out"] or "", r["late_minutes"],
                   "نعم" if r["auto_checkout"] else "", " | ".join(r["warnings"]), gi["location_name"] or gi["status_label"], gi["distance_m"] if gi["distance_m"] is not None else "", "" if gi["in_range"] is None else ("نعم" if gi["in_range"] else "لا"), coord(gi),
                   go["location_name"] or go["status_label"], go["distance_m"] if go["distance_m"] is not None else "", coord(go), src.get(r["source"] or "", r["source"] or ""), r["note"]])
    for ci in range(1, len(heads) + 1):
        ws.column_dimensions[get_column_letter(ci)].width = 14
    ws.column_dimensions["C"].width = 28; ws.column_dimensions["U"].width = 50; ws.column_dimensions["L"].width = 30; ws.column_dimensions["M"].width = 22; ws.column_dimensions["P"].width = 22; ws.column_dimensions["S"].width = 22
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=export_headers(export_filename("الحضور التفصيلي", f"{date_from}_{date_to}", ext="xlsx")))


# ══════════════ 📱 إدارة أجهزة التحضير ══════════════

@router.get("/devices")
async def list_devices(search: Optional[str] = None, only_registered: bool = False, current_user: dict = Depends(get_current_user)):
    """📱 الجهاز المسجّل لكل موظف + محاولات مرفوضة"""
    if not _can_view(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_db()
    q: dict = {"status": {"$nin": ["ended"]}}
    if search:
        import re
        rx = {"$regex": re.escape(search.strip()), "$options": "i"}
        q["$or"] = [{"full_name": rx}, {"employee_no": rx}, {"device_id": rx}]
    if only_registered:
        q["device_id"] = {"$exists": True, "$nin": [None, ""]}
    items = [{"id": str(e["_id"]), "full_name": e.get("full_name", ""), "employee_no": e.get("employee_no", ""), "job_title": e.get("job_title", ""), "org_unit_id": e.get("org_unit_id"),
              "device_id": e.get("device_id"), "device_name": e.get("device_name", ""), "device_registered_at": e.get("device_registered_at"), "device_last_seen_at": e.get("device_last_seen_at"),
              "device_rejections": e.get("device_rejections", 0), "device_last_rejection": e.get("device_last_rejection")}
             for e in await db.employees.find(q, {"full_name": 1, "employee_no": 1, "job_title": 1, "org_unit_id": 1, "device_id": 1, "device_name": 1, "device_registered_at": 1, "device_last_seen_at": 1, "device_rejections": 1, "device_last_rejection": 1}).sort("full_name", 1).to_list(5000)]
    units = {str(u["_id"]): u.get("name", "") for u in await db.org_units.find({}, {"name": 1}).to_list(2000)}
    for i in items:
        i["org_unit_name"] = units.get(i.pop("org_unit_id") or "", "")
    settings = await get_hr_settings(db)
    return {"items": items, "device_binding_enabled": settings.get("device_binding_enabled", True), "pending_requests": await db.hr_device_requests.count_documents({"status": "pending"}),
            "stats": {"total": len(items), "registered": sum(1 for i in items if i["device_id"]), "with_rejections": sum(1 for i in items if i["device_rejections"])}}


@router.post("/devices/{emp_id}/reset")
async def reset_device(emp_id: str, current_user: dict = Depends(get_current_user)):
    """🔄 إعادة تعيين الجهاز — يُسمح للموظف بتسجيل جهاز جديد عند أول تحضير"""
    _guard(current_user, P_ATTEND)
    db = get_db()
    emp = await db.employees.find_one({"_id": _oid(emp_id)})
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    old = emp.get("device_id")
    await db.employees.update_one({"_id": emp["_id"]}, {"$set": {"device_id": None, "device_name": "", "device_registered_at": None, "device_rejections": 0, "device_last_rejection": None, "device_reset_at": _now(), "device_reset_by": current_user.get("full_name", "")},
                                                        "$push": {"device_history": {"device_id": old, "registered_at": emp.get("device_registered_at"), "reset_at": _now(), "by_name": current_user.get("full_name", "")}}})
    await log_activity(current_user, "hr_device_reset", "employee", emp_id, emp.get("full_name", ""), {"old_device_id": old})
    uid = (await employee_user_ids(db, [emp_id])).get(emp_id)
    if uid:
        await notify_users(db, [uid], "تمت إعادة تعيين جهاز التحضير", "سيُسجَّل جهازك الجديد تلقائياً عند أول تسجيل حضور", "hr")
    return {"message": f"تمت إعادة تعيين جهاز {emp.get('full_name', '')} — سيُسجَّل الجهاز الجديد عند أول تحضير"}


# ══════════════ 📱 طلبات تغيير الجهاز ══════════════

class DeviceChangeIn(BaseModel):
    device_id: str
    device_name: Optional[str] = ""
    reason: Optional[str] = ""


class RejectIn(BaseModel):
    reason: Optional[str] = ""


def _req_view(r: dict) -> dict:
    d = _ser(r)
    d["status_label"] = {"pending": "بانتظار الموافقة", "approved": "مقبول", "rejected": "مرفوض"}.get(r.get("status"), r.get("status"))
    return d


@router.get("/devices/my")
async def my_device(current_user: dict = Depends(get_current_user)):
    """📱 جهازي المسجّل + طلب التغيير المعلّق إن وُجد"""
    db = get_db()
    emp = await find_my_employee(db, current_user)
    if not emp:
        raise HTTPException(status_code=404, detail="لا يوجد ملف إداري مرتبط بحسابك")
    settings = await get_hr_settings(db)
    pending = await db.hr_device_requests.find_one({"employee_id": str(emp["_id"]), "status": "pending"})
    last = await db.hr_device_requests.find_one({"employee_id": str(emp["_id"]), "status": {"$ne": "pending"}}, sort=[("created_at", -1)])
    return {"device_binding_enabled": settings.get("device_binding_enabled", True), "device_id": emp.get("device_id"), "device_name": emp.get("device_name", ""),
            "device_registered_at": emp.get("device_registered_at"), "pending_request": _req_view(pending) if pending else None, "last_request": _req_view(last) if last else None,
            "can_request": bool(emp.get("device_id")) and not pending}


@router.post("/devices/my/change-request")
async def request_device_change(data: DeviceChangeIn, current_user: dict = Depends(get_current_user)):
    """📱 الموظف يطلب تغيير جهاز التحضير (من جهازه الجديد) → شؤون الموظفين توافق بنقرة"""
    db = get_db()
    emp = await find_my_employee(db, current_user)
    if not emp:
        raise HTTPException(status_code=404, detail="لا يوجد ملف إداري مرتبط بحسابك")
    did = (data.device_id or "").strip() or None  # فارغ (من الويب) = «أي جهاز جديد — يُسجَّل عند أول تحضير بعد الموافقة»
    if not emp.get("device_id"):
        raise HTTPException(status_code=400, detail="لا يوجد جهاز مسجّل لحسابك — سيُسجَّل جهازك تلقائياً عند أول تحضير")
    if did and emp.get("device_id") == did:
        raise HTTPException(status_code=400, detail="هذا هو جهازك المسجّل حالياً")
    eid = str(emp["_id"])
    if await db.hr_device_requests.find_one({"employee_id": eid, "status": "pending"}):
        raise HTTPException(status_code=400, detail="لديك طلب تغيير جهاز بانتظار الموافقة")
    doc = {"employee_id": eid, "employee_name": emp.get("full_name", ""), "employee_no": emp.get("employee_no", ""), "old_device_id": emp.get("device_id"), "old_device_name": emp.get("device_name", ""),
           "new_device_id": did, "new_device_name": (data.device_name or "").strip()[:80], "reason": (data.reason or "").strip()[:500], "status": "pending", "created_at": _now()}
    r = await db.hr_device_requests.insert_one(doc)
    await log_activity(current_user, "hr_device_change_request", "employee", eid, emp.get("full_name", ""), {"new_device_id": did})
    await notify_users(db, await hr_manager_user_ids(db, P_ATTEND), "📱 طلب تغيير جهاز التحضير",
                       f"{emp.get('full_name', '')} ({emp.get('employee_no', '')}) يطلب تغيير جهازه إلى {doc['new_device_name'] or (did[:12] if did else 'جهاز جديد (يُسجَّل عند أول تحضير)')}" + (f" — السبب: {doc['reason']}" if doc["reason"] else ""),
                       "hr_device", {"request_id": str(r.inserted_id), "route": "/hr-attendance?tab=devices", "data": {"route": "/hr-attendance?tab=devices", "kind": "device_change_request"}})
    return {"message": "أُرسل طلب تغيير الجهاز إلى شؤون الموظفين — سيُفعَّل جهازك الجديد فور الموافقة", "request": _req_view({**doc, "_id": r.inserted_id})}


@router.get("/devices/requests")
async def list_device_requests(status: Optional[str] = "pending", current_user: dict = Depends(get_current_user)):
    if not _can_view(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_db()
    q = {"status": status} if status else {}
    items = [_req_view(r) for r in await db.hr_device_requests.find(q).sort("created_at", -1).to_list(500)]
    return {"items": items, "pending": await db.hr_device_requests.count_documents({"status": "pending"})}


async def _decide_device_request(db, req_id: str, current_user: dict) -> dict:
    _guard(current_user, P_ATTEND)
    r = await db.hr_device_requests.find_one({"_id": _oid(req_id, "الطلب")})
    if not r:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if r.get("status") != "pending":
        raise HTTPException(status_code=400, detail="تم البت في هذا الطلب مسبقاً")
    return r


@router.post("/devices/requests/{req_id}/approve")
async def approve_device_request(req_id: str, current_user: dict = Depends(get_current_user)):
    """✅ الموافقة بنقرة: يُستبدل جهاز الموظف بالجهاز الجديد فوراً"""
    db = get_db()
    r = await _decide_device_request(db, req_id, current_user)
    emp = await db.employees.find_one({"_id": _oid(r["employee_id"])})
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    now = _now()
    new_id = r.get("new_device_id") or None
    await db.employees.update_one({"_id": emp["_id"]}, {"$set": {"device_id": new_id, "device_name": r.get("new_device_name", "") if new_id else "", "device_registered_at": now if new_id else None, "device_last_seen_at": None, "device_rejections": 0, "device_last_rejection": None},
                                                        "$push": {"device_history": {"device_id": emp.get("device_id"), "registered_at": emp.get("device_registered_at"), "reset_at": now, "by_name": current_user.get("full_name", ""), "via": "change_request"}}})
    await db.hr_device_requests.update_one({"_id": r["_id"]}, {"$set": {"status": "approved", "reviewed_at": now, "reviewed_by_name": current_user.get("full_name", "")}})
    await log_activity(current_user, "hr_device_change_approve", "employee", r["employee_id"], emp.get("full_name", ""), {"new_device_id": r["new_device_id"]})
    uid = (await employee_user_ids(db, [r["employee_id"]])).get(r["employee_id"])
    if uid:
        await notify_users(db, [uid], "✅ تمت الموافقة على تغيير جهازك", "يمكنك الآن تسجيل الحضور من جهازك الجديد" if new_id else "سيُسجَّل جهازك الجديد تلقائياً عند أول تسجيل حضور", "hr")
    return {"message": f"تمت الموافقة — جهاز {emp.get('full_name', '')} الجديد مفعّل الآن" if new_id else f"تمت الموافقة — سيُسجَّل جهاز {emp.get('full_name', '')} الجديد عند أول تحضير"}


@router.post("/devices/requests/{req_id}/reject")
async def reject_device_request(req_id: str, data: RejectIn = None, current_user: dict = Depends(get_current_user)):
    db = get_db()
    r = await _decide_device_request(db, req_id, current_user)
    reason = ((data.reason if data else "") or "").strip()
    await db.hr_device_requests.update_one({"_id": r["_id"]}, {"$set": {"status": "rejected", "reject_reason": reason, "reviewed_at": _now(), "reviewed_by_name": current_user.get("full_name", "")}})
    await log_activity(current_user, "hr_device_change_reject", "employee", r["employee_id"], r.get("employee_name", ""), {"reason": reason})
    uid = (await employee_user_ids(db, [r["employee_id"]])).get(r["employee_id"])
    if uid:
        await notify_users(db, [uid], "❌ رُفض طلب تغيير جهازك", reason or "راجع شؤون الموظفين", "hr")
    return {"message": "تم رفض الطلب"}


# ══════════════ الخدمة الذاتية ══════════════

@router.get("/my")
async def my_attendance(month: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    db = get_db()
    emp = await find_my_employee(db, current_user)
    if not emp:
        return {"profile": None}
    settings = await get_hr_settings(db)
    t = _today()
    m = month or t[:7]
    eid = str(emp["_id"])
    shifts = employee_shifts(emp, settings)
    today_recs = await db.hr_attendance.find({"employee_id": eid, "date": t}).sort("check_in", 1).to_list(10)
    open_rec = next((r for r in today_recs if r.get("source") in ("self", "manual", "bulk") and not r.get("check_out")), None)
    today_rec = open_rec or (today_recs[-1] if today_recs else None)
    done_ids = {_rec_shift(r, shifts) for r in today_recs}
    remaining = [sh for sh in shifts if sh["id"] not in done_ids]
    now_hm = datetime.now(YEMEN_TZ).strftime("%H:%M")
    next_shift = pick_shift(remaining, now_hm) if remaining else None
    leaves = await _leave_map(db, t)
    day = parse_date(t)
    recs = [_ser(r) for r in await db.hr_attendance.find({"employee_id": eid, "date": {"$regex": f"^{m}"}}).sort("date", -1).to_list(60)]
    for r in recs:
        r["status_label"] = ATT_STATUS.get(r["status"], r["status"])
    on_leave = eid in leaves
    can_in = settings.get("allow_self_checkin", True) and is_work_day(day, settings) and not on_leave and bool(remaining) and not open_rec
    can_out = settings.get("allow_self_checkin", True) and bool(open_rec)
    counts = {k: 0 for k in ATT_STATUS}
    for r in recs:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    shift_rows = [{"shift": sh, "record": next(({**_ser(r), "status_label": ATT_STATUS.get(r["status"], "")} for r in today_recs if _rec_shift(r, shifts) == sh["id"]), None)} for sh in shifts]
    return {"profile": {"id": eid, "full_name": emp.get("full_name", "")}, "date": t, "day_name": AR_DAYS[day.weekday()], "now": now_hm, "is_work_day": is_work_day(day, settings),
            "holiday": holiday_name(day, settings), "on_leave": leaves.get(eid), "today": ({**_ser(today_rec), "status_label": ATT_STATUS.get(today_rec["status"], "")} if today_rec else None),
            "shifts": shifts, "today_shifts": shift_rows, "next_shift": next_shift, "multi_shift": len(settings["shifts"]) > 1,
            "can_check_in": can_in, "can_check_out": can_out, "settings": {k: settings[k] for k in ("work_start", "work_end", "late_grace_minutes", "allow_self_checkin")},
            "geofence": {"required": bool(settings.get("geofence_required", True)), "exempt": geo_exempt_active(emp), "locations_count": await db.hr_locations.count_documents({"is_active": True})},
            "correction": {k: v for k, v in _correction_state(settings, today_recs).items() if not k.startswith("_")},
            "month": m, "records": recs, "counts": counts, "late_minutes": sum(int(r.get("late_minutes") or 0) for r in recs)}


DEVICE_REJECT_MSG = "هذا الجهاز غير مسجّل لحسابك. أرسل طلب تغيير الجهاز من التطبيق أو راجع شؤون الموظفين"
DEVICE_ALERT_THROTTLE_MIN = 10


async def _alert_hr_device_rejection(db, emp: dict, did: str, dname: str, action: str, now: str):
    """🔔 تنبيه فوري لشؤون الموظفين عند رفض تحضير من جهاز غير مسجّل (بحد أقصى تنبيه كل 10 د لكل موظف)"""
    last = emp.get("device_last_alert_at")
    if last:
        try:
            if (datetime.fromisoformat(now) - datetime.fromisoformat(last)).total_seconds() < DEVICE_ALERT_THROTTLE_MIN * 60:
                return
        except Exception:
            pass
    await db.employees.update_one({"_id": emp["_id"]}, {"$set": {"device_last_alert_at": now}})
    act = "تسجيل الحضور" if action == "check_in" else "تسجيل الانصراف"
    dev = f"{dname} ({did[:12]}…)" if dname else did
    await notify_users(db, await hr_manager_user_ids(db, P_ATTEND), "⚠️ محاولة تحضير من جهاز غير مسجّل",
                       f"{emp.get('full_name', '')} ({emp.get('employee_no', '')}) حاول {act} الساعة {now[11:16]} من جهاز غير مسجّل: {dev} — راجع «أجهزة التحضير»",
                       "hr_device", {"employee_id": str(emp["_id"]), "route": "/hr-attendance?tab=devices", "data": {"route": "/hr-attendance?tab=devices", "kind": "device_rejection"}})


async def _device_check(db, emp: dict, geo: Optional[GeoIn], settings: dict, action: str) -> Optional[str]:
    """📱 ربط التحضير بجهاز واحد: أول device_id يُحفظ؛ بعده يُقبل المطابق فقط. null → يُقبل (توافق مع الإصدارات القديمة)"""
    if not settings.get("device_binding_enabled", True):
        return (geo.device_id if geo else None)
    did = (geo.device_id or "").strip() if geo and geo.device_id else ""
    if not did:
        return None
    saved = (emp.get("device_id") or "").strip()
    now = _now()
    if not saved:
        await db.employees.update_one({"_id": emp["_id"]}, {"$set": {"device_id": did, "device_name": (geo.device_name or "")[:80], "device_registered_at": now, "device_last_seen_at": now}})
        emp["device_id"] = did
        return did
    if saved != did:
        await db.employees.update_one({"_id": emp["_id"]}, {"$inc": {"device_rejections": 1}, "$set": {"device_last_rejection": {"device_id": did, "device_name": (geo.device_name or "")[:80], "at": now, "action": action}}})
        await _alert_hr_device_rejection(db, emp, did, (geo.device_name or "")[:80], action, now)
        raise HTTPException(status_code=403, detail=DEVICE_REJECT_MSG)
    await db.employees.update_one({"_id": emp["_id"]}, {"$set": {"device_last_seen_at": now}})
    return did


@router.post("/check-in")
async def check_in(geo: Optional[GeoIn] = None, current_user: dict = Depends(get_current_user)):
    db = get_db()
    emp = await find_my_employee(db, current_user)
    if not emp:
        raise HTTPException(status_code=404, detail="لا يوجد ملف إداري مرتبط بحسابك")
    settings = await get_hr_settings(db)
    if not settings.get("allow_self_checkin", True):
        raise HTTPException(status_code=400, detail="التسجيل الذاتي غير مفعّل — يُسجَّل الحضور من شؤون الموظفين")
    device_id = await _device_check(db, emp, geo, settings, "check_in")
    t = _today()
    if not is_work_day(parse_date(t), settings):
        raise HTTPException(status_code=400, detail="اليوم ليس يوم عمل")
    eid = str(emp["_id"])
    if eid in await _leave_map(db, t):
        raise HTTPException(status_code=400, detail="أنت في إجازة معتمدة اليوم")
    shifts = employee_shifts(emp, settings)
    today_recs = await db.hr_attendance.find({"employee_id": eid, "date": t}).to_list(10)
    if geo is not None and geo.correction:
        st = _correction_state(settings, today_recs)
        open_rec = st["_open"]
        if not open_rec:
            raise HTTPException(status_code=400, detail="لا يوجد حضور حديث لتصحيحه")
        _require_correction(settings, _minutes_since(open_rec["check_in"]))
        await db.hr_attendance.delete_one({"_id": open_rec["_id"]})
        await log_activity(current_user, "hr_att_correct_checkin", "hr_attendance", str(open_rec["_id"]), f"حذف حضور {open_rec['check_in']} لتصحيحه")
        today_recs = [r for r in today_recs if r["_id"] != open_rec["_id"]]
    if any(not r.get("check_out") and not r.get("auto_absent") for r in today_recs):
        raise HTTPException(status_code=400, detail="لديك حضور مفتوح — سجّل الانصراف أولاً")
    done_ids = {_rec_shift(r, shifts) for r in today_recs if not r.get("auto_absent")}
    remaining = [sh for sh in shifts if sh["id"] not in done_ids]
    if not remaining:
        raise HTTPException(status_code=400, detail="تم تسجيل حضورك اليوم بالفعل" if len(shifts) == 1 else "تم تسجيل حضورك لكل فتراتك اليوم")
    now_hm = datetime.now(YEMEN_TZ).strftime("%H:%M")
    sh = pick_shift(remaining, now_hm)
    geo_rec = await evaluate_geo(db, emp, geo, settings)
    late = shift_late(now_hm, sh)
    doc = {"employee_id": eid, "date": t, "device_id": device_id, "status": "late" if late else "present", "check_in": now_hm, "check_out": None, "late_minutes": late, "note": "", "source": "self", "by_name": current_user.get("full_name", ""),
           "shift_id": sh["id"], "shift_name": sh["name"], "check_in_geo": geo_rec, "created_at": _now(), "updated_at": _now()}
    absent_rec = next((r for r in today_recs if r.get("auto_absent") and _rec_shift(r, shifts) == sh["id"]), None)
    converted = ""
    if absent_rec:
        # 🔁 سُجّل غائباً تلقائياً ثم حضر → يتحول السجل إلى «متأخر» مع ملاحظة
        doc.update({"status": "late", "late_minutes": max(late, 1), "auto_absent": False, "was_auto_absent": True, "created_at": absent_rec.get("created_at") or _now(),
                    "note": f"حضر متأخراً الساعة {now_hm} بعد تسجيله غائباً تلقائياً (لم يحضر خلال فترة السماح من بداية الدوام {sh['work_start']})"})
        await db.hr_attendance.update_one({"_id": absent_rec["_id"]}, {"$set": doc})
        converted = " — كان مسجَّلاً غائباً تلقائياً وتحوّل إلى متأخر"
    else:
        await db.hr_attendance.insert_one(doc)
    loc = f" — {geo_rec['location_name']}" if geo_rec.get("in_range") else (" — بدون موقع" if geo_rec["status"] == "no_location" else "")
    shift_txt = f" ({sh['name']})" if len(settings["shifts"]) > 1 else ""
    return {"check_in": now_hm, "status": doc["status"], "late_minutes": doc["late_minutes"], "shift": sh, "location": geo_rec, "was_auto_absent": bool(absent_rec),
            "message": f"تم تسجيل الحضور {now_hm}{shift_txt}" + (f" — متأخر {doc['late_minutes']} دقيقة" if doc["late_minutes"] else "") + loc + converted}


@router.post("/check-out")
async def check_out(geo: Optional[GeoIn] = None, current_user: dict = Depends(get_current_user)):
    db = get_db()
    emp = await find_my_employee(db, current_user)
    if not emp:
        raise HTTPException(status_code=404, detail="لا يوجد ملف إداري مرتبط بحسابك")
    t = _today()
    settings = await get_hr_settings(db)
    device_id = await _device_check(db, emp, geo, settings, "check_out")
    if geo is not None and geo.correction:
        recs = await db.hr_attendance.find({"employee_id": str(emp["_id"]), "date": t}).to_list(10)
        st = _correction_state(settings, recs)
        last = st["_last_out"]
        if st["_open"] or not last:
            raise HTTPException(status_code=400, detail="لا يوجد انصراف حديث لتصحيحه")
        _require_correction(settings, _minutes_since(last["check_out"]))
        await db.hr_attendance.update_one({"_id": last["_id"]}, {"$set": {"check_out": None, "check_out_geo": None, "updated_at": _now()}})
        await log_activity(current_user, "hr_att_correct_checkout", "hr_attendance", str(last["_id"]), f"إلغاء انصراف {last['check_out']} لتصحيحه")
    rec = await db.hr_attendance.find_one({"employee_id": str(emp["_id"]), "date": t, "check_out": None, "check_in": {"$ne": None}}, sort=[("check_in", -1)])
    if not rec:
        if await db.hr_attendance.find_one({"employee_id": str(emp["_id"]), "date": t, "check_in": {"$ne": None}}):
            raise HTTPException(status_code=400, detail="تم تسجيل الانصراف بالفعل")
        raise HTTPException(status_code=400, detail="لم يُسجَّل حضورك اليوم")
    # 📍 الانصراف خارج النطاق يُقبل لكن يُدوَّن تحذيراً في الملاحظة ويظهر في تقارير الإدارة
    geo_rec = await evaluate_geo(db, emp, geo, settings, enforce=False)
    now_hm = datetime.now(YEMEN_TZ).strftime("%H:%M")
    upd = {"check_out": now_hm, "check_out_geo": geo_rec, "check_out_device_id": device_id, "updated_at": _now()}
    warn = ""
    if geo_rec.get("status") == "out_of_range":
        warn = f"انصراف خارج نطاق العمل — أقرب موقع: {geo_rec['location_name']} (يبعد {geo_rec['distance_m']} م، والمسموح {geo_rec.get('radius_meters')} م)"
        prev = (rec.get("note") or "").strip()
        upd.update({"note": f"{prev} | {warn}" if prev else warn, "check_out_out_of_range": True})
    await db.hr_attendance.update_one({"_id": rec["_id"]}, {"$set": upd})
    loc = f" — {geo_rec['location_name']}" if geo_rec.get("in_range") else ""
    shift_txt = f" ({rec['shift_name']})" if rec.get("shift_name") else ""
    return {"check_out": now_hm, "location": geo_rec, "shift_id": rec.get("shift_id"), "out_of_range": bool(warn), "warning": warn or None,
            "message": f"تم تسجيل الانصراف {now_hm}{shift_txt}{loc}" + (f" ⚠️ {warn}" if warn else "")}


# ══════════════ 🤖 الانصراف التلقائي ══════════════

def _geo_text(g: Optional[dict]) -> str:
    if not g:
        return "لا يوجد موقع مسجَّل"
    parts = [g.get("location_name") or g.get("status_label") or ""]
    if g.get("latitude") is not None and g.get("longitude") is not None:
        parts.append(f"({g['latitude']:.5f}, {g['longitude']:.5f})")
    return " ".join(p for p in parts if p).strip() or "غير معروف"


async def auto_checkout_tick(db) -> int:
    """يُصرِّف تلقائياً كل سجل حضور مفتوح تجاوزت مهلته نهاية فترته + المهلة المحددة في الإعدادات"""
    settings = await get_hr_settings(db)
    if not settings.get("auto_checkout_enabled"):
        return 0
    after = int(settings.get("auto_checkout_after_minutes") or 60)
    now = datetime.now(YEMEN_TZ)
    shifts = {sh["id"]: sh for sh in settings["shifts"]}
    main = settings["shifts"][0]
    done = 0
    async for r in db.hr_attendance.find({"check_in": {"$ne": None}, "check_out": None, "date": {"$lte": now.strftime("%Y-%m-%d")}}):
        sh = shifts.get(r.get("shift_id")) or main
        try:
            end_dt = datetime.strptime(f"{r['date']} {sh['work_end']}", "%Y-%m-%d %H:%M").replace(tzinfo=YEMEN_TZ)
        except Exception:
            continue
        if now < end_dt + timedelta(minutes=after):
            continue
        stamp = now.strftime("%Y-%m-%d %H:%M")
        geo_in = r.get("check_in_geo")
        note = f"انصراف تلقائي — لم يسجّل الموظف انصرافه (صُرِّف بواسطة النظام في {stamp} بعد {after} د من نهاية الفترة {sh['work_end']}) — آخر موقع معروف عند الحضور: {_geo_text(geo_in)}"
        prev = (r.get("note") or "").strip()
        out_hm = sh["work_end"] if (r.get("check_in") or "") <= sh["work_end"] else r["check_in"]
        await db.hr_attendance.update_one({"_id": r["_id"], "check_out": None}, {"$set": {
            "check_out": out_hm, "check_out_source": "auto", "auto_checkout": True, "auto_checkout_at": stamp,
            "check_out_geo": {"status": "auto", "status_label": "انصراف تلقائي", "in_range": False, "location_name": (geo_in or {}).get("location_name", ""),
                              "latitude": (geo_in or {}).get("latitude"), "longitude": (geo_in or {}).get("longitude")},
            "note": f"{prev} | {note}" if prev else note, "updated_at": _now()}})
        done += 1
    return done


async def auto_absent_tick(db) -> int:
    """🚫 الغياب التلقائي: من لم يسجّل حضوره بعد انقضاء مهلة التأخير من بداية فترته (يوم عمل، ليس في إجازة) يُسجَّل «غائب» تلقائياً"""
    settings = await get_hr_settings(db)
    if not settings.get("auto_absent_enabled"):
        return 0
    now = datetime.now(YEMEN_TZ)
    t = now.strftime("%Y-%m-%d")
    if not is_work_day(parse_date(t), settings):
        return 0
    now_min = now.hour * 60 + now.minute
    leaves = await _leave_map(db, t)
    recs: dict = {}
    for r in await db.hr_attendance.find({"date": t}, {"employee_id": 1, "shift_id": 1}).to_list(10000):
        recs.setdefault(r["employee_id"], []).append(r)
    stamp = now.strftime("%Y-%m-%d %H:%M")
    done = 0
    async for e in db.employees.find({"status": {"$nin": ["ended", "suspended"]}}, {"shift_ids": 1}):
        eid = str(e["_id"])
        if eid in leaves:
            continue
        shifts = employee_shifts(e, settings)
        mine = recs.get(eid, [])
        for sh in shifts:
            grace = int(sh.get("late_grace_minutes") or 0)
            if now_min <= _hm(sh["work_start"]) + grace:
                continue
            if any(_rec_shift(r, shifts) == sh["id"] for r in mine):
                continue
            flt = {"employee_id": eid, "date": t, "shift_id": sh["id"]}
            res = await db.hr_attendance.update_one(flt, {"$setOnInsert": {
                **flt, "status": "absent", "check_in": None, "check_out": None, "late_minutes": 0, "source": "auto", "auto_absent": True, "auto_absent_at": stamp, "shift_name": sh["name"], "by_name": "النظام",
                "note": f"لم يحضر / غائب تلقائياً — لم يُسجَّل حضور خلال فترة السماح ({grace} د) من بداية الدوام {sh['work_start']}", "created_at": _now(), "updated_at": _now()}}, upsert=True)
            if res.upserted_id:
                done += 1
    return done


async def auto_checkout_loop():
    import asyncio, logging
    await asyncio.sleep(60)
    while True:
        try:
            n = await auto_checkout_tick(get_db())
            if n:
                logging.info(f"HR auto check-out: {n} record(s)")
            a = await auto_absent_tick(get_db())
            if a:
                logging.info(f"HR auto absent: {a} record(s)")
        except Exception as e:
            logging.error(f"auto checkout loop error: {e}")
        await asyncio.sleep(300)


@router.post("/auto-checkout/run")
async def run_auto_checkout(current_user: dict = Depends(get_current_user)):
    """تشغيل فوري للانصراف التلقائي (للمشرف)"""
    _guard(current_user, P_ATTEND)
    n = await auto_checkout_tick(get_db())
    return {"count": n, "message": f"تم الانصراف التلقائي لـ {n} سجل" if n else "لا توجد سجلات مستحقة للانصراف التلقائي"}


@router.post("/auto-absent/run")
async def run_auto_absent(current_user: dict = Depends(get_current_user)):
    """تشغيل فوري للغياب التلقائي (للمشرف)"""
    _guard(current_user, P_ATTEND)
    n = await auto_absent_tick(get_db())
    return {"count": n, "message": f"تم تسجيل {n} موظفاً غائباً تلقائياً" if n else "لا يوجد موظفون مستحقون للغياب التلقائي الآن"}
