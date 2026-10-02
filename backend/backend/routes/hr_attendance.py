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
                        is_work_day, holiday_name, find_my_employee, enrich_employee_refs, employee_shifts, pick_shift, shift_late)
from .hr_locations import GeoIn, evaluate_geo

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
                row = {**_ser(r), "recorded": True}
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
            "status": status, "check_in": ci, "check_out": co, "late_minutes": late, "note": (en.note or "").strip(), "source": "manual", "shift_id": sh["id"], "shift_name": sh["name"],
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
                         late_only: bool, auto_only: bool, out_of_range_only: bool, search: Optional[str]):
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
    return q


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
                    "source": r.get("source"), "note": r.get("note") or "", "check_in_geo": gi, "check_out_geo": go, "by_name": r.get("by_name", "")})
    return out


@router.get("/details")
async def attendance_details(date_from: Optional[str] = None, date_to: Optional[str] = None, employee_ids: Optional[str] = None, org_unit_id: Optional[str] = None,
                             status: Optional[str] = None, late_only: bool = False, auto_only: bool = False, out_of_range_only: bool = False, search: Optional[str] = None,
                             page: int = 1, per_page: int = 50, current_user: dict = Depends(get_current_user)):
    """📋 سجلات الحضور التفصيلية لفترة — فردية أو مشتركة — مع التأخير والانصراف التلقائي والموقع/المسافة"""
    if not _can_view(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_db()
    t = _today()
    date_from, date_to = date_from or t[:8] + "01", date_to or t
    q = await _details_query(db, date_from, date_to, employee_ids, org_unit_id, status, late_only, auto_only, out_of_range_only, search)
    if q is None:
        return {"items": [], "total": 0, "page": 1, "per_page": per_page, "summary": {}, "from": date_from, "to": date_to}
    per_page = max(5, min(per_page, 500))
    total = await db.hr_attendance.count_documents(q)
    items = await _details_rows(db, q, (page - 1) * per_page, per_page)
    pipeline = [{"$match": q}, {"$group": {"_id": None, "late": {"$sum": {"$cond": [{"$gt": ["$late_minutes", 0]}, 1, 0]}}, "late_minutes": {"$sum": {"$ifNull": ["$late_minutes", 0]}},
                                             "auto": {"$sum": {"$cond": [{"$eq": ["$auto_checkout", True]}, 1, 0]}}, "out": {"$sum": {"$cond": [{"$eq": ["$check_in_geo.status", "out_of_range"]}, 1, 0]}},
                                             "employees": {"$addToSet": "$employee_id"}}}]
    agg = await db.hr_attendance.aggregate(pipeline).to_list(1)
    a = agg[0] if agg else {}
    return {"items": items, "total": total, "page": page, "per_page": per_page, "from": date_from, "to": date_to,
            "summary": {"records": total, "employees": len(a.get("employees") or []), "late": a.get("late", 0), "late_minutes": a.get("late_minutes", 0), "auto": a.get("auto", 0), "out_of_range": a.get("out", 0)}}


@router.get("/details/export")
async def attendance_details_export(date_from: Optional[str] = None, date_to: Optional[str] = None, employee_ids: Optional[str] = None, org_unit_id: Optional[str] = None,
                                    status: Optional[str] = None, late_only: bool = False, auto_only: bool = False, out_of_range_only: bool = False, search: Optional[str] = None,
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
        q = await _details_query(db, date_from, date_to, employee_ids, org_unit_id, status, late_only, auto_only, out_of_range_only, search)
    rows = await _details_rows(db, q) if q is not None else []
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter
    wb = Workbook(); ws = wb.active; ws.title = "التفصيلي"; ws.sheet_view.rightToLeft = True
    heads = ["التاريخ", "الرقم الوظيفي", "الاسم", "الوحدة", "المسمى", "الفترة", "الحالة", "حضور", "انصراف", "دقائق التأخير", "انصراف تلقائي", "موقع الحضور", "المسافة (م)", "داخل النطاق", "إحداثيات الحضور", "موقع الانصراف", "مسافة الانصراف (م)", "إحداثيات الانصراف", "المصدر", "ملاحظة"]
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
                   "نعم" if r["auto_checkout"] else "", gi["location_name"] or gi["status_label"], gi["distance_m"] if gi["distance_m"] is not None else "", "" if gi["in_range"] is None else ("نعم" if gi["in_range"] else "لا"), coord(gi),
                   go["location_name"] or go["status_label"], go["distance_m"] if go["distance_m"] is not None else "", coord(go), src.get(r["source"] or "", r["source"] or ""), r["note"]])
    for ci in range(1, len(heads) + 1):
        ws.column_dimensions[get_column_letter(ci)].width = 14
    ws.column_dimensions["C"].width = 28; ws.column_dimensions["T"].width = 50; ws.column_dimensions["L"].width = 22; ws.column_dimensions["O"].width = 22; ws.column_dimensions["R"].width = 22
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=export_headers(export_filename("الحضور التفصيلي", f"{date_from}_{date_to}", ext="xlsx")))


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
            "geofence": {"required": bool(settings.get("geofence_required", True)), "exempt": bool(emp.get("geofence_exempt")), "locations_count": await db.hr_locations.count_documents({"is_active": True})},
            "correction": {k: v for k, v in _correction_state(settings, today_recs).items() if not k.startswith("_")},
            "month": m, "records": recs, "counts": counts, "late_minutes": sum(int(r.get("late_minutes") or 0) for r in recs)}


@router.post("/check-in")
async def check_in(geo: Optional[GeoIn] = None, current_user: dict = Depends(get_current_user)):
    db = get_db()
    emp = await find_my_employee(db, current_user)
    if not emp:
        raise HTTPException(status_code=404, detail="لا يوجد ملف إداري مرتبط بحسابك")
    settings = await get_hr_settings(db)
    if not settings.get("allow_self_checkin", True):
        raise HTTPException(status_code=400, detail="التسجيل الذاتي غير مفعّل — يُسجَّل الحضور من شؤون الموظفين")
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
    if any(not r.get("check_out") for r in today_recs):
        raise HTTPException(status_code=400, detail="لديك حضور مفتوح — سجّل الانصراف أولاً")
    done_ids = {_rec_shift(r, shifts) for r in today_recs}
    remaining = [sh for sh in shifts if sh["id"] not in done_ids]
    if not remaining:
        raise HTTPException(status_code=400, detail="تم تسجيل حضورك اليوم بالفعل" if len(shifts) == 1 else "تم تسجيل حضورك لكل فتراتك اليوم")
    now_hm = datetime.now(YEMEN_TZ).strftime("%H:%M")
    sh = pick_shift(remaining, now_hm)
    geo_rec = await evaluate_geo(db, emp, geo, settings)
    late = shift_late(now_hm, sh)
    doc = {"employee_id": eid, "date": t, "status": "late" if late else "present", "check_in": now_hm, "check_out": None, "late_minutes": late, "note": "", "source": "self", "by_name": current_user.get("full_name", ""),
           "shift_id": sh["id"], "shift_name": sh["name"], "check_in_geo": geo_rec, "created_at": _now(), "updated_at": _now()}
    await db.hr_attendance.insert_one(doc)
    loc = f" — {geo_rec['location_name']}" if geo_rec.get("in_range") else (" — بدون موقع" if geo_rec["status"] == "no_location" else "")
    shift_txt = f" ({sh['name']})" if len(settings["shifts"]) > 1 else ""
    return {"check_in": now_hm, "status": doc["status"], "late_minutes": late, "shift": sh, "location": geo_rec, "message": f"تم تسجيل الحضور {now_hm}{shift_txt}" + (f" — متأخر {late} دقيقة" if late else "") + loc}


@router.post("/check-out")
async def check_out(geo: Optional[GeoIn] = None, current_user: dict = Depends(get_current_user)):
    db = get_db()
    emp = await find_my_employee(db, current_user)
    if not emp:
        raise HTTPException(status_code=404, detail="لا يوجد ملف إداري مرتبط بحسابك")
    t = _today()
    settings = await get_hr_settings(db)
    if geo is not None and geo.correction:
        recs = await db.hr_attendance.find({"employee_id": str(emp["_id"]), "date": t}).to_list(10)
        st = _correction_state(settings, recs)
        last = st["_last_out"]
        if st["_open"] or not last:
            raise HTTPException(status_code=400, detail="لا يوجد انصراف حديث لتصحيحه")
        _require_correction(settings, _minutes_since(last["check_out"]))
        await db.hr_attendance.update_one({"_id": last["_id"]}, {"$set": {"check_out": None, "check_out_geo": None, "updated_at": _now()}})
        await log_activity(current_user, "hr_att_correct_checkout", "hr_attendance", str(last["_id"]), f"إلغاء انصراف {last['check_out']} لتصحيحه")
    rec = await db.hr_attendance.find_one({"employee_id": str(emp["_id"]), "date": t, "check_out": None}, sort=[("check_in", -1)])
    if not rec:
        if await db.hr_attendance.find_one({"employee_id": str(emp["_id"]), "date": t}):
            raise HTTPException(status_code=400, detail="تم تسجيل الانصراف بالفعل")
        raise HTTPException(status_code=400, detail="لم يُسجَّل حضورك اليوم")
    geo_rec = await evaluate_geo(db, emp, geo, settings)
    now_hm = datetime.now(YEMEN_TZ).strftime("%H:%M")
    await db.hr_attendance.update_one({"_id": rec["_id"]}, {"$set": {"check_out": now_hm, "check_out_geo": geo_rec, "updated_at": _now()}})
    loc = f" — {geo_rec['location_name']}" if geo_rec.get("in_range") else ""
    shift_txt = f" ({rec['shift_name']})" if rec.get("shift_name") else ""
    return {"check_out": now_hm, "location": geo_rec, "shift_id": rec.get("shift_id"), "message": f"تم تسجيل الانصراف {now_hm}{shift_txt}{loc}"}


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
        note = f"انصراف تلقائي بواسطة النظام في {stamp} (لم يُسجَّل انصراف خلال {after} د بعد نهاية الفترة {sh['work_end']}) — آخر موقع معروف عند الحضور: {_geo_text(geo_in)}"
        prev = (r.get("note") or "").strip()
        out_hm = sh["work_end"] if (r.get("check_in") or "") <= sh["work_end"] else r["check_in"]
        await db.hr_attendance.update_one({"_id": r["_id"], "check_out": None}, {"$set": {
            "check_out": out_hm, "check_out_source": "auto", "auto_checkout": True, "auto_checkout_at": stamp,
            "check_out_geo": {"status": "auto", "status_label": "انصراف تلقائي", "in_range": False, "location_name": (geo_in or {}).get("location_name", ""),
                              "latitude": (geo_in or {}).get("latitude"), "longitude": (geo_in or {}).get("longitude")},
            "note": f"{prev} | {note}" if prev else note, "updated_at": _now()}})
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
        except Exception as e:
            logging.error(f"auto checkout loop error: {e}")
        await asyncio.sleep(300)


@router.post("/auto-checkout/run")
async def run_auto_checkout(current_user: dict = Depends(get_current_user)):
    """تشغيل فوري للانصراف التلقائي (للمشرف)"""
    _guard(current_user, P_ATTEND)
    n = await auto_checkout_tick(get_db())
    return {"count": n, "message": f"تم الانصراف التلقائي لـ {n} سجل" if n else "لا توجد سجلات مستحقة للانصراف التلقائي"}
