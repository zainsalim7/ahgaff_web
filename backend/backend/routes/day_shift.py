"""⏰ إزاحة اليوم الدراسي: تأخير بداية اليوم (يوم أو مدى) بإزاحة أفقية موحّدة لكل المحاضرات مع تراجع وإشعارات"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from bson import ObjectId

from .deps import get_db, get_current_user, has_permission, log_activity, build_course_student_query
from .schedule_notify import _dispatch, _user_ids_for_teachers

router = APIRouter(tags=["إزاحة اليوم الدراسي"])
PERM = "shift_day"
YEMEN_TZ = timezone(timedelta(hours=3))
SKIP_STATUSES = ("completed", "cancelled", "absent")


class DayShiftRequest(BaseModel):
    date_from: str
    date_to: Optional[str] = None
    faculty_id: Optional[str] = None
    new_start_time: Optional[str] = None  # "10:00" — تُحسب الإزاحة من أول محاضرة في كل يوم
    offset_minutes: Optional[int] = None  # بديل: إزاحة ثابتة بالدقائق
    reason: str = ""
    notify: bool = True


def _t2m(t: str) -> Optional[int]:
    try:
        h, m = t.split(":")[:2]
        return int(h) * 60 + int(m)
    except Exception:
        return None


def _m2t(m: int) -> str:
    return f"{(m // 60) % 24:02d}:{m % 60:02d}"


def _dates(a: str, b: Optional[str]) -> list:
    try:
        d1 = datetime.strptime(a, "%Y-%m-%d").date()
        d2 = datetime.strptime(b or a, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="صيغة التاريخ غير صحيحة (YYYY-MM-DD)")
    if d2 < d1:
        raise HTTPException(status_code=400, detail="تاريخ النهاية قبل تاريخ البداية")
    if (d2 - d1).days > 60:
        raise HTTPException(status_code=400, detail="الحد الأقصى للمدى 60 يوماً")
    return [(d1 + timedelta(days=i)).isoformat() for i in range((d2 - d1).days + 1)]


async def _course_map(db, faculty_id: Optional[str]) -> dict:
    q: dict = {}
    if faculty_id:
        depts = [str(d["_id"]) for d in await db.departments.find({"faculty_id": faculty_id}, {"_id": 1}).to_list(500)]
        q["department_id"] = {"$in": depts}
    return {str(c["_id"]): c for c in await db.courses.find(q, {"name": 1, "teacher_id": 1, "department_id": 1, "level": 1, "section": 1, "shared_links": 1}).to_list(20000)}


def _is_movable(lec: dict) -> bool:
    return lec.get("status", "scheduled") not in SKIP_STATUSES and not lec.get("attendance_started_at")


async def _compute(db, data: DayShiftRequest):
    """يعيد (الأيام المحسوبة، المحاضرات القابلة للإزاحة مع أوقاتها الجديدة، المستثناة)"""
    if not data.new_start_time and data.offset_minutes is None:
        raise HTTPException(status_code=400, detail="حدد وقت البداية الجديد أو مقدار الإزاحة")
    if data.new_start_time and _t2m(data.new_start_time) is None:
        raise HTTPException(status_code=400, detail="صيغة وقت البداية غير صحيحة (HH:MM)")
    dates = _dates(data.date_from, data.date_to)
    courses = await _course_map(db, data.faculty_id)
    lecs = await db.lectures.find({"date": {"$in": dates}, "course_id": {"$in": list(courses.keys())}}).to_list(50000)

    days, moves, skipped = [], [], []
    for d in dates:
        day_lecs = [l for l in lecs if l.get("date") == d]
        if not day_lecs:
            continue
        movable = [l for l in day_lecs if _is_movable(l) and _t2m(l.get("start_time", "")) is not None]
        skipped += [l for l in day_lecs if l not in movable]
        if not movable:
            days.append({"date": d, "lectures": 0, "skipped": len(day_lecs), "offset_minutes": 0})
            continue
        first = min(_t2m(l["start_time"]) for l in movable)
        offset = data.offset_minutes if data.offset_minutes is not None else _t2m(data.new_start_time) - first
        if offset == 0:
            days.append({"date": d, "lectures": 0, "skipped": len(day_lecs), "offset_minutes": 0, "note": "اليوم يبدأ أصلاً بهذا الوقت"})
            continue
        new_last_end = 0
        for l in movable:
            st, en = _t2m(l["start_time"]), _t2m(l.get("end_time", "")) or (_t2m(l["start_time"]) + 90)
            n_st, n_en = st + offset, en + offset
            if n_st < 0 or n_en >= 24 * 60:
                raise HTTPException(status_code=400, detail=f"الإزاحة تُخرج محاضرة يوم {d} خارج حدود اليوم ({_m2t(st)} → {_m2t(n_st)})")
            new_last_end = max(new_last_end, n_en)
            moves.append({"lec": l, "course": courses.get(l["course_id"], {}), "date": d, "old_st": l["start_time"], "old_en": l.get("end_time", ""), "new_st": _m2t(n_st), "new_en": _m2t(n_en)})
        days.append({
            "date": d, "lectures": len(movable), "skipped": len(day_lecs) - len(movable), "offset_minutes": offset,
            "old_first": _m2t(first), "new_first": _m2t(first + offset),
            "old_last_end": _m2t(new_last_end - offset), "new_last_end": _m2t(new_last_end),
        })
    return days, moves, skipped


def _fmt_offset(m: int) -> str:
    sign = "تأخير" if m > 0 else "تقديم"
    m = abs(m)
    h, r = divmod(m, 60)
    parts = ([f"{h} ساعة" if h == 1 else f"{h} ساعات" if h <= 10 else f"{h} ساعة"] if h else []) + ([f"{r} دقيقة"] if r else [])
    return f"{sign} " + " و".join(parts)


def _guard(user: dict):
    if not has_permission(user, PERM):
        raise HTTPException(status_code=403, detail="ليست لديك صلاحية «إزاحة اليوم الدراسي»")


@router.post("/day-shift/preview")
async def preview_day_shift(data: DayShiftRequest, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    days, moves, skipped = await _compute(db, data)
    fac = None
    if data.faculty_id and ObjectId.is_valid(data.faculty_id):
        fac = await db.faculties.find_one({"_id": ObjectId(data.faculty_id)}, {"name": 1})
    sample = sorted(moves, key=lambda m: (m["date"], m["old_st"]))[:8]
    return {
        "days": days,
        "total_lectures": len(moves),
        "total_skipped": len(skipped),
        "skipped_reasons": {
            "completed": sum(1 for l in skipped if l.get("status") == "completed"),
            "cancelled": sum(1 for l in skipped if l.get("status") in ("cancelled", "absent")),
            "attendance_started": sum(1 for l in skipped if l.get("attendance_started_at") and l.get("status") not in SKIP_STATUSES),
        },
        "teachers_affected": len({m["course"].get("teacher_id") for m in moves if m["course"].get("teacher_id")}),
        "faculty_name": (fac or {}).get("name") if fac else "جميع الكليات",
        "sample": [{"date": m["date"], "course": m["course"].get("name", ""), "from": f"{m['old_st']} - {m['old_en']}", "to": f"{m['new_st']} - {m['new_en']}"} for m in sample],
    }


@router.post("/day-shift/apply")
async def apply_day_shift(data: DayShiftRequest, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    days, moves, skipped = await _compute(db, data)
    if not moves:
        raise HTTPException(status_code=400, detail="لا توجد محاضرات قابلة للإزاحة في هذا النطاق")
    now = datetime.now(YEMEN_TZ)
    shift_id = ObjectId()
    changes = []
    for m in moves:
        lec = m["lec"]
        try:
            await db.lectures.update_one({"_id": lec["_id"]}, {"$set": {
                "start_time": m["new_st"], "end_time": m["new_en"],
                "time_locked": True, "time_locked_at": now, "time_locked_by_name": current_user.get("full_name", ""),
                "day_shift_id": str(shift_id), "day_shift_offset": _t2m(m["new_st"]) - _t2m(m["old_st"]),
            }})
            changes.append({"lecture_id": str(lec["_id"]), "course_id": lec["course_id"], "date": m["date"], "old_start": m["old_st"], "old_end": m["old_en"], "new_start": m["new_st"], "new_end": m["new_en"], "was_locked": bool(lec.get("time_locked"))})
        except Exception:
            continue
    doc = {
        "_id": shift_id, "date_from": data.date_from, "date_to": data.date_to or data.date_from,
        "faculty_id": data.faculty_id, "new_start_time": data.new_start_time, "offset_minutes": data.offset_minutes,
        "reason": data.reason.strip(), "days": days, "changes": changes, "skipped": len(skipped),
        "created_at": now.isoformat(), "created_by": current_user.get("id") or str(current_user.get("_id", "")), "created_by_name": current_user.get("full_name", ""),
        "status": "active", "notified": 0,
    }
    await db.day_shifts.insert_one(doc)
    await log_activity(current_user, "day_shift_apply", "day_shift", str(shift_id), f"{data.date_from} → {data.date_to or data.date_from}", {"lectures": len(changes), "reason": data.reason})

    notified = 0
    if data.notify:
        notified = await _notify(db, moves, days, data.reason)
        await db.day_shifts.update_one({"_id": shift_id}, {"$set": {"notified": notified}})
    day_desc = data.date_from if not data.date_to or data.date_to == data.date_from else f"من {data.date_from} إلى {data.date_to}"
    return {"id": str(shift_id), "updated": len(changes), "skipped": len(skipped), "notified": notified, "days": days,
            "message": f"تمت إزاحة {len(changes)} محاضرة ({day_desc})" + (f" — استُثنيت {len(skipped)} محاضرة منعقدة/ملغاة/مفتوحة التحضير" if skipped else "")}


async def _notify(db, moves: list, days: list, reason: str) -> int:
    """إشعار داخل التطبيق + Push لكل أستاذ وطالب متأثر (رسالة واحدة لكل شخص لكل يوم)"""
    offsets = {d["date"]: d for d in days}
    teacher_ids = {m["course"].get("teacher_id") for m in moves if m["course"].get("teacher_id")}
    t_users = await _user_ids_for_teachers(db, teacher_ids)
    events, per_user_day = [], {}

    def add(uid: str, m: dict):
        key = (uid, m["date"])
        per_user_day.setdefault(key, []).append(m)

    student_cache: dict = {}
    for m in moves:
        tid = m["course"].get("teacher_id")
        if tid and t_users.get(tid):
            add(t_users[tid], m)
        cid = m["lec"]["course_id"]
        if cid not in student_cache:
            uids = []
            if m["course"]:
                async for s in db.students.find(build_course_student_query(m["course"]), {"user_id": 1}):
                    if s.get("user_id"):
                        uids.append(s["user_id"])
            student_cache[cid] = uids
        for uid in student_cache[cid]:
            add(uid, m)

    for (uid, date), ms in per_user_day.items():
        d = offsets.get(date, {})
        ms.sort(key=lambda x: x["new_st"])
        lines = "، ".join(f"{x['course'].get('name', '')} {x['new_st']}" for x in ms[:4]) + (" …" if len(ms) > 4 else "")
        msg = f"{_fmt_offset(d.get('offset_minutes', 0))} لبداية اليوم الدراسي يوم {date} إلى {d.get('new_first', '')}" + (f" ({reason})" if reason else "") + f". محاضراتك: {lines}"
        events.append({"user_id": uid, "title": "⏰ تغيير مواعيد اليوم الدراسي", "message": msg, "course_id": ms[0]["lec"]["course_id"], "course_name": ms[0]["course"].get("name", "")})
    await _dispatch(db, events)
    return len(events)


@router.get("/day-shift")
async def list_day_shifts(date: Optional[str] = None, status: Optional[str] = "active", limit: int = 50, current_user: dict = Depends(get_current_user)):
    db = get_db()
    q: dict = {}
    if status:
        q["status"] = status
    if date:
        q["date_from"] = {"$lte": date}
        q["date_to"] = {"$gte": date}
    out = []
    async for s in db.day_shifts.find(q, {"changes": 0}).sort("created_at", -1).limit(limit):
        s["id"] = str(s.pop("_id"))
        out.append(s)
    return out


@router.get("/day-shift/my-today")
async def my_day_shift(date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """📱 للطالب/المعلم: هل يومه مُزاح؟ (شعار في التطبيقات) — يُعيد الإزاحة ومحاضراته الجديدة فقط إن كانت محاضراته هو متأثرة"""
    db = get_db()
    day = date or datetime.now(YEMEN_TZ).strftime("%Y-%m-%d")
    shifts = await db.day_shifts.find({"status": "active", "date_from": {"$lte": day}, "date_to": {"$gte": day}}, {"changes": 0}).to_list(50)
    if not shifts:
        return {"shifted": False, "date": day}
    shift_ids = [str(s["_id"]) for s in shifts]
    lecs = await db.lectures.find({"date": day, "day_shift_id": {"$in": shift_ids}, "status": {"$nin": ["cancelled"]}}).sort("start_time", 1).to_list(2000)
    if not lecs:
        return {"shifted": False, "date": day}
    courses = {str(c["_id"]): c for c in await db.courses.find({"_id": {"$in": [ObjectId(l["course_id"]) for l in lecs if ObjectId.is_valid(l["course_id"])]}}).to_list(2000)}

    role = current_user.get("role")
    mine: list = []
    if role == "teacher":
        u = await db.users.find_one({"_id": ObjectId(current_user["id"])}, {"teacher_record_id": 1})
        tids = {current_user["id"], (u or {}).get("teacher_record_id")}
        mine = [l for l in lecs if courses.get(l["course_id"], {}).get("teacher_id") in tids]
    elif role == "student":
        st = await db.students.find_one({"user_id": current_user["id"]}, {"_id": 1})
        if st:
            ok_courses: dict = {}
            for l in lecs:
                cid = l["course_id"]
                if cid not in ok_courses:
                    c = courses.get(cid)
                    ok_courses[cid] = bool(c) and await db.students.find_one({**build_course_student_query(c), "_id": st["_id"]}, {"_id": 1}) is not None
                if ok_courses[cid]:
                    mine.append(l)
    else:
        mine = lecs
    if not mine:
        return {"shifted": False, "date": day}

    sh = next((s for s in shifts if str(s["_id"]) == mine[0].get("day_shift_id")), shifts[0])
    d = next((x for x in sh.get("days", []) if x.get("date") == day), {})
    offset = mine[0].get("day_shift_offset") or d.get("offset_minutes") or 0
    return {
        "shifted": True, "date": day, "offset_minutes": offset, "offset_label": _fmt_offset(offset),
        "old_first": d.get("old_first"), "new_first": d.get("new_first"), "new_last_end": d.get("new_last_end"),
        "reason": sh.get("reason", ""), "shift_id": str(sh["_id"]),
        "my_lectures": [{
            "id": str(l["_id"]), "course_id": l["course_id"], "course_name": courses.get(l["course_id"], {}).get("name", ""),
            "start_time": l.get("start_time"), "end_time": l.get("end_time"),
            "original_start_time": _m2t(_t2m(l["start_time"]) - (l.get("day_shift_offset") or offset)) if _t2m(l.get("start_time", "")) is not None else None,
            "room": l.get("room", ""),
        } for l in mine],
    }


@router.post("/day-shift/{shift_id}/revert")
async def revert_day_shift(shift_id: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    if not ObjectId.is_valid(shift_id):
        raise HTTPException(status_code=400, detail="معرّف غير صحيح")
    s = await db.day_shifts.find_one({"_id": ObjectId(shift_id)})
    if not s:
        raise HTTPException(status_code=404, detail="سجل الإزاحة غير موجود")
    if s.get("status") != "active":
        raise HTTPException(status_code=400, detail="تم التراجع عن هذه الإزاحة مسبقاً")
    reverted, kept = 0, 0
    for ch in s.get("changes", []):
        lec = await db.lectures.find_one({"_id": ObjectId(ch["lecture_id"])})
        if not lec or lec.get("day_shift_id") != shift_id or lec.get("start_time") != ch["new_start"]:
            kept += 1
            continue
        if lec.get("attendance_started_at") or lec.get("status") in SKIP_STATUSES:
            kept += 1
            continue
        upd: dict = {"$set": {"start_time": ch["old_start"], "end_time": ch["old_end"]}, "$unset": {"day_shift_id": "", "day_shift_offset": ""}}
        if not ch.get("was_locked"):
            upd["$unset"].update({"time_locked": "", "time_locked_at": "", "time_locked_by_name": ""})
        try:
            await db.lectures.update_one({"_id": lec["_id"]}, upd)
            reverted += 1
        except Exception:
            kept += 1
    await db.day_shifts.update_one({"_id": ObjectId(shift_id)}, {"$set": {"status": "reverted", "reverted_at": datetime.now(YEMEN_TZ).isoformat(), "reverted_by_name": current_user.get("full_name", ""), "reverted_count": reverted}})
    await log_activity(current_user, "day_shift_revert", "day_shift", shift_id, s.get("date_from", ""), {"reverted": reverted, "kept": kept})
    return {"reverted": reverted, "kept": kept, "message": f"تم التراجع: أُعيدت {reverted} محاضرة إلى أوقاتها الأصلية" + (f" (بقيت {kept} لأنها انعقدت أو عُدّلت لاحقاً)" if kept else "")}
