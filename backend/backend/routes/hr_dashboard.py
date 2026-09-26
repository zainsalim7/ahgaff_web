"""قسم شؤون الموظفين في لوحة القيادة: الأعداد الثابتة + إحصاءات الفترة + مخطط الدوام الإداري"""
import logging
from collections import defaultdict
from datetime import date, timedelta

from .hr_common import get_hr_settings, is_work_day, _today, enrich_employee_refs

ACTIVE_Q = {"status": {"$nin": ["ended", "suspended"]}}
PRESENT_STATUSES = ("present", "late", "half_day", "mission")
CATEGORY_LABELS = {"academic": "أكاديمي", "administrative": "إداري", "technical": "فني", "service": "خدمات"}
CONTRACT_LABELS = {"permanent": "دائم", "contract": "متعاقد", "part_time": "جزئي", "hourly": "بالساعة", "visiting": "متعاون"}
STATUS_LABELS = {"probation": "تحت التجربة", "active": "على رأس العمل", "leave": "في إجازة", "suspended": "موقوف", "ended": "منتهية خدمته"}
UNIT_TYPE_LABELS = {"presidency": "رئاسة", "faculty": "كلية", "department": "قسم", "administration": "إدارة", "office": "مكتب"}
AR_SHORT = {5: "سبت", 6: "أحد", 0: "اثنين", 1: "ثلاثاء", 2: "أربعاء", 3: "خميس", 4: "جمعة"}


def _rate(ok: int, bad: int):
    t = ok + bad
    return round(ok / t * 100, 1) if t else None


def _cat_bucket():
    return {"total": 0, "academic": 0, "administrative": 0, "other": 0}


def _add_cat(b: dict, cat: str):
    b["total"] += 1
    b["academic" if cat == "academic" else "administrative" if cat == "administrative" else "other"] += 1


async def _headcount(db, emps: list) -> dict:
    """الأرقام الثابتة: الإجمالي حسب الفئة/العقد/الحالة، وموظفو كل وحدة رئيسية (مع وحداتها الفرعية) مقسّمين أكاديمي/إداري/غيرهم"""
    units = {str(u["_id"]): u for u in await db.org_units.find({}, {"name": 1, "type": 1, "parent_id": 1}).to_list(2000)}
    roots = {uid for uid, u in units.items() if not u.get("parent_id") or u["parent_id"] not in units}
    children = defaultdict(list)
    for uid, u in units.items():
        if uid not in roots:
            children[u["parent_id"]].append(uid)

    def top_of(uid):  # أول وحدة تحت الجذر (الكلية/الإدارة) — أو الجذر نفسه إن كان الموظف فيه مباشرة
        seen = set()
        while uid in units and uid not in seen:
            seen.add(uid)
            p = units[uid].get("parent_id")
            if uid in roots or not p or p not in units or p in roots:
                return uid
            uid = p
        return None

    by_cat = defaultdict(int); by_contract = defaultdict(int); by_status = defaultdict(int)
    per_unit = defaultdict(_cat_bucket); own_unit = defaultdict(_cat_bucket); unlinked = _cat_bucket()
    all_emps = await db.employees.find({}, {"status": 1}).to_list(20000)
    for e in all_emps:
        by_status[e.get("status") or "active"] += 1
    for e in emps:
        cat = e.get("category") or "administrative"
        by_cat[cat] += 1
        by_contract[e.get("contract_type") or "permanent"] += 1
        uid = e.get("org_unit_id")
        if not uid or uid not in units:
            _add_cat(unlinked, cat); continue
        _add_cat(own_unit[uid], cat)
        top = top_of(uid)
        if top:
            _add_cat(per_unit[top], cat)

    def unit_row(uid, b):
        u = units[uid]
        subs = children.get(uid, [])
        return {"id": uid, "name": u.get("name", ""), "type": u.get("type"), "type_label": UNIT_TYPE_LABELS.get(u.get("type"), u.get("type") or ""),
                "sub_units": len(subs), **b}
    rows = sorted((unit_row(uid, b) for uid, b in per_unit.items()), key=lambda r: (-r["total"], r["name"]))
    if unlinked["total"]:
        rows.append({"id": None, "name": "غير مرتبطين بوحدة", "type": None, "type_label": "", "sub_units": 0, **unlinked})
    by_unit_type = defaultdict(_cat_bucket)
    for uid, b in own_unit.items():
        t = units[uid].get("type") or "office"
        for k in ("total", "academic", "administrative", "other"):
            by_unit_type[t][k] += b[k]
    return {
        "total_active": len(emps), "total_all": len(all_emps),
        "by_category": [{"key": k, "label": CATEGORY_LABELS.get(k, k), "count": by_cat.get(k, 0)} for k in ("academic", "administrative", "technical", "service")],
        "by_contract": [{"key": k, "label": CONTRACT_LABELS.get(k, k), "count": v} for k, v in sorted(by_contract.items(), key=lambda x: -x[1])],
        "by_status": [{"key": k, "label": STATUS_LABELS.get(k, k), "count": by_status.get(k, 0)} for k in ("active", "probation", "leave", "suspended", "ended") if by_status.get(k)],
        "by_unit": rows,
        "by_unit_type": [{"key": k, "label": UNIT_TYPE_LABELS.get(k, k), **b} for k, b in sorted(by_unit_type.items(), key=lambda x: -x[1]["total"])],
        "units_count": len(units), "units_with_staff": len(own_unit),
    }


async def _period_stats(db, emps: list, d_from: date, d_to: date, settings: dict, period: str) -> dict:
    s_from, s_to = d_from.isoformat(), d_to.isoformat()
    today = _today()
    emp_map = {str(e["_id"]): e for e in emps}
    unit_names = {str(u["_id"]): u.get("name", "") for u in await db.org_units.find({}, {"name": 1}).to_list(2000)}
    recs = await db.hr_attendance.find({"date": {"$gte": s_from, "$lte": s_to}}, {"employee_id": 1, "date": 1, "status": 1, "late_minutes": 1}).to_list(100000)

    work_days = [d_from + timedelta(days=i) for i in range((d_to - d_from).days + 1)]
    work_days = [d for d in work_days if is_work_day(d, settings) and d.isoformat() <= today]

    counts = defaultdict(int); late_minutes = 0
    per_emp = defaultdict(lambda: {"present": 0, "late": 0, "absent": 0, "late_minutes": 0})
    per_unit = defaultdict(lambda: {"present": 0, "late": 0, "absent": 0, "late_minutes": 0})
    by_day = defaultdict(lambda: {"present": 0, "late": 0, "absent": 0})
    for r in recs:
        st = r.get("status"); lm = int(r.get("late_minutes") or 0)
        counts[st] += 1; late_minutes += lm
        eid = r.get("employee_id"); e = emp_map.get(eid)
        uid = (e or {}).get("org_unit_id") or ""
        if st in PRESENT_STATUSES:
            k = "late" if st == "late" else "present"
            by_day[r["date"]][k] += 1
            if e:
                per_emp[eid][k] += 1; per_emp[eid]["late_minutes"] += lm
                per_unit[uid][k] += 1; per_unit[uid]["late_minutes"] += lm
        elif st == "absent":
            by_day[r["date"]]["absent"] += 1
            if e:
                per_emp[eid]["absent"] += 1; per_unit[uid]["absent"] += 1

    attended = sum(counts.get(s, 0) for s in PRESENT_STATUSES)
    absent = counts.get("absent", 0)
    expected = len(emps) * len(work_days)
    unmarked = max(0, expected - attended - absent - counts.get("excused", 0) - counts.get("leave", 0) - counts.get("holiday", 0))

    if period == "day":
        points = [{"label": unit_names.get(uid, "غير مرتبط") if uid else "غير مرتبط", "present": b["present"], "late": b["late"], "absent": b["absent"],
                   "rate": _rate(b["present"] + b["late"], b["absent"])} for uid, b in per_unit.items()]
        points.sort(key=lambda p: -(p["present"] + p["late"] + p["absent"]))
        points = points[:12]; group_by = "unit"
    else:
        points = [{"label": AR_SHORT[d.weekday()] + (f" {d.day}" if period == "month" else ""), "date": d.isoformat(), **by_day[d.isoformat()],
                   "rate": _rate(by_day[d.isoformat()]["present"] + by_day[d.isoformat()]["late"], by_day[d.isoformat()]["absent"])} for d in work_days]
        group_by = "date"
    for p in points:
        p["lectures"] = p["completed"] = p["present"] + p["late"] + p["absent"]

    def emp_row(eid, b):
        e = emp_map[eid]
        return {"employee_id": eid, "name": e.get("full_name", ""), "unit": unit_names.get(e.get("org_unit_id") or "", ""), "category": CATEGORY_LABELS.get(e.get("category"), ""),
                **b, "rate": _rate(b["present"] + b["late"], b["absent"])}
    min_recs = {"day": 1, "week": 2}.get(period, 3)
    ranked = [emp_row(eid, b) for eid, b in per_emp.items() if b["present"] + b["late"] + b["absent"] >= min_recs]
    ranked.sort(key=lambda r: (-(r["rate"] or 0), r["late"], r["late_minutes"]))
    top = ranked[:5]
    bottom = sorted([r for r in ranked if r["absent"] or r["late"]], key=lambda r: ((r["rate"] or 0), -r["absent"], -r["late_minutes"]))[:5]
    units_rows = sorted([{"unit": unit_names.get(uid, "غير مرتبط") if uid else "غير مرتبط", **b, "rate": _rate(b["present"] + b["late"], b["absent"])}
                         for uid, b in per_unit.items()], key=lambda r: (-r["absent"], -r["late_minutes"]))[:8]

    leaves = await db.leave_requests.find({"status": "approved", "start_date": {"$lte": s_to}, "end_date": {"$gte": s_from}}, {"days": 1, "type": 1, "employee_id": 1}).to_list(5000)
    from .hr_leaves import LEAVE_TYPES
    leave_types = defaultdict(int)
    for l in leaves:
        leave_types[LEAVE_TYPES.get(l.get("type"), l.get("type") or "")] += 1
    dt_from, dt_to = s_from, (d_to + timedelta(days=1)).isoformat()
    tasks_done = await db.hr_tasks.count_documents({"status": "done", "completed_at": {"$gte": dt_from, "$lt": dt_to}})
    tasks_created = await db.hr_tasks.count_documents({"created_at": {"$gte": dt_from, "$lt": dt_to}})
    return {
        "work_days": len(work_days), "expected": expected, "attended": attended, "present": counts.get("present", 0), "late": counts.get("late", 0),
        "half_day": counts.get("half_day", 0), "mission": counts.get("mission", 0), "absent": absent, "excused": counts.get("excused", 0), "unmarked": unmarked,
        "late_minutes": late_minutes, "late_hours": round(late_minutes / 60, 1), "commitment_rate": _rate(attended, absent),
        "leaves_approved": len(leaves), "leave_days": sum(int(l.get("days") or 0) for l in leaves),
        "leave_types": [{"label": k, "count": v} for k, v in sorted(leave_types.items(), key=lambda x: -x[1])],
        "tasks_done": tasks_done, "tasks_created": tasks_created,
        "chart": {"group_by": group_by, "points": points}, "top_employees": top, "bottom_employees": bottom, "units_attendance": units_rows,
    }


async def hr_dashboard_section(db, period: str, d_from: date, d_to: date) -> dict:
    """القسم الكامل: ملخص اليوم (الحالي) + الأعداد + الفترة"""
    from .hr_alerts import hr_dashboard_summary
    settings = await get_hr_settings(db)
    emps = await db.employees.find(ACTIVE_Q, {"full_name": 1, "employee_no": 1, "category": 1, "contract_type": 1, "org_unit_id": 1, "status": 1}).to_list(20000)
    today = await hr_dashboard_summary(db)
    try:
        headcount = await _headcount(db, emps)
    except Exception as e:
        logging.warning(f"hr headcount failed: {e}"); headcount = None
    try:
        stats = await _period_stats(db, emps, d_from, d_to, settings, period)
    except Exception as e:
        logging.warning(f"hr period stats failed: {e}"); stats = None
    return {**today, "headcount": headcount, "period": stats}
