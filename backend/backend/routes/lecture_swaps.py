"""🔁 تبادل/إنابة محاضرة لمرة واحدة بين أستاذين — عملية إدارية (التسجيل/رئيس القسم/العميد/الأدمن) تُطبَّق فوراً بلا موافقات"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .deps import get_db, get_current_user, log_activity
from .hr_common import notify_users
from models.permissions import UserRole

router = APIRouter(prefix="/lecture-swaps", tags=["تبادل المحاضرات"])
DEFAULTS = {"enabled": True, "allow_cover": True, "notify_students": True}
OPERATOR_ROLES = {UserRole.ADMIN, UserRole.DEAN, UserRole.DEPARTMENT_HEAD, UserRole.REGISTRAR, UserRole.REGISTRATION_MANAGER}


def _now():
    return datetime.now(timezone.utc)


def _oid(x):
    return ObjectId(x) if x and ObjectId.is_valid(x) else None


def _lec_dt(lec: dict) -> datetime:
    return datetime.strptime(f"{lec['date']} {lec.get('start_time') or '00:00'}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone(timedelta(hours=3)))


def _week_range(date_str: str):
    d = datetime.strptime(date_str, "%Y-%m-%d")
    start = d - timedelta(days=(d.weekday() + 2) % 7)  # السبت بداية الأسبوع
    return start.strftime("%Y-%m-%d"), (start + timedelta(days=6)).strftime("%Y-%m-%d")


async def get_settings(db) -> dict:
    doc = await db.settings.find_one({"type": "lecture_swaps"}) or {}
    return {**DEFAULTS, **{k: doc[k] for k in DEFAULTS if k in doc}}


def _require_operator(user: dict):
    if user["role"] not in OPERATOR_ROLES:
        raise HTTPException(status_code=403, detail="تبادل/إنابة المحاضرات عملية إدارية (التسجيل / رئيس القسم / العميد)")


def _scope_query(user: dict, fac_key="faculty_id", dep_key="department_id") -> dict:
    """نطاق المشغّل: رئيس القسم → قسمه، العميد/التسجيل بكلية → كليته، الأدمن → الكل"""
    if user["role"] == UserRole.ADMIN:
        return {}
    if user["role"] == UserRole.DEPARTMENT_HEAD and user.get("department_id"):
        return {dep_key: user["department_id"]}
    if user.get("faculty_id"):
        return {fac_key: user["faculty_id"]}
    return {}


def _in_scope(user: dict, course: dict) -> bool:
    if user["role"] == UserRole.ADMIN:
        return True
    if user["role"] == UserRole.DEPARTMENT_HEAD and user.get("department_id"):
        return course.get("department_id") == user["department_id"]
    if user.get("faculty_id"):
        return course.get("faculty_id") == user["faculty_id"]
    return True


async def _teacher_user_ids(db, teacher_id: str) -> List[str]:
    ids = [str(u["_id"]) for u in await db.users.find({"$or": [{"teacher_record_id": teacher_id}, {"_id": _oid(teacher_id)}]}, {"_id": 1}).to_list(5)]
    t = await db.teachers.find_one({"_id": _oid(teacher_id)}, {"user_id": 1}) if _oid(teacher_id) else None
    if t and t.get("user_id"):
        ids.append(t["user_id"])
    return list(set(ids))


async def _teacher_name(db, teacher_id: str) -> str:
    t = await db.teachers.find_one({"_id": _oid(teacher_id)}, {"full_name": 1}) if _oid(teacher_id) else None
    if t:
        return t.get("full_name", "")
    u = await db.users.find_one({"_id": _oid(teacher_id)}, {"full_name": 1}) if _oid(teacher_id) else None
    return (u or {}).get("full_name", "")


async def _busy(db, teacher_id: str, date: str, start: str, end: str, exclude_ids: List[str]) -> Optional[str]:
    """هل الأستاذ مشغول بمحاضرة أخرى تتقاطع زمنياً في هذا التاريخ؟ (الإجازات المعتمدة أيضاً)"""
    q = {"teacher_id": teacher_id, "date": date, "status": {"$nin": ["cancelled", "deleted"]}, "_id": {"$nin": [_oid(x) for x in exclude_ids if _oid(x)]}}
    async for l in db.lectures.find(q, {"start_time": 1, "end_time": 1, "course_name": 1}):
        if (l.get("start_time") or "00:00") < (end or "23:59") and (l.get("end_time") or "23:59") > (start or "00:00"):
            return f"لديه محاضرة «{l.get('course_name', '')}» {l.get('start_time')}–{l.get('end_time')}"
    uids = await _teacher_user_ids(db, teacher_id)
    emp = await db.employees.find_one({"user_id": {"$in": uids}}, {"_id": 1}) if uids else None
    if emp:
        lv = await db.leave_requests.find_one({"employee_id": str(emp["_id"]), "status": "approved", "start_date": {"$lte": date}, "end_date": {"$gte": date}}, {"_id": 1})
        if lv:
            return "لديه إجازة معتمدة في هذا اليوم"
    return None


def _lec_view(l: dict) -> dict:
    return {"id": str(l["_id"]), "course_id": l.get("course_id"), "course_name": l.get("course_name"), "date": l.get("date"), "start_time": l.get("start_time"), "end_time": l.get("end_time"),
            "room": l.get("room"), "group": l.get("group"), "group_name": l.get("group_name"), "teacher_id": l.get("teacher_id"), "teacher_name": l.get("teacher_name"),
            "original_teacher_name": l.get("original_teacher_name"), "swap_type": l.get("swap_type"), "status": l.get("status")}


def _swap_view(s: dict) -> dict:
    out = {k: v for k, v in s.items() if k != "_id"}
    out["id"] = str(s["_id"])
    return out


async def _enrich_lectures(db, lecs: List[dict]) -> List[dict]:
    cids = {l.get("course_id") for l in lecs if l.get("course_id") and not l.get("course_name")}
    names = {str(c["_id"]): c.get("name") for c in await db.courses.find({"_id": {"$in": [o for o in (_oid(c) for c in cids) if o]}}, {"name": 1}).to_list(500)} if cids else {}
    for l in lecs:
        l.setdefault("course_name", names.get(l.get("course_id"), ""))
    return lecs


# ---------------- الإعدادات ----------------
class SettingsIn(BaseModel):
    enabled: Optional[bool] = None
    allow_cover: Optional[bool] = None
    notify_students: Optional[bool] = None


@router.get("/settings")
async def read_settings(current_user: dict = Depends(get_current_user)):
    _require_operator(current_user)
    return await get_settings(get_db())


@router.put("/settings")
async def update_settings(data: SettingsIn, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="للأدمن فقط")
    upd = {k: v for k, v in data.model_dump().items() if v is not None}
    await get_db().settings.update_one({"type": "lecture_swaps"}, {"$set": {**upd, "type": "lecture_swaps"}}, upsert=True)
    await log_activity(current_user, "lecture_swaps_settings", "settings", "lecture_swaps", "إعدادات تبادل المحاضرات", upd)
    return await get_settings(get_db())


# ---------------- الأساتذة ومحاضراتهم + المرشحون ----------------
@router.get("/teachers")
async def teachers_in_scope(current_user: dict = Depends(get_current_user)):
    """أساتذة نطاق المشغّل (لاختيار الأستاذ الأصلي)"""
    _require_operator(current_user)
    db = get_db()
    q = {"is_active": {"$ne": False}, **_scope_query(current_user)}
    rows = await db.teachers.find(q, {"full_name": 1, "department_id": 1, "faculty_id": 1}).sort("full_name", 1).to_list(2000)
    return {"teachers": [{"teacher_id": str(t["_id"]), "full_name": t.get("full_name"), "department_id": t.get("department_id")} for t in rows]}


@router.get("/teacher-lectures")
async def teacher_lectures(teacher_id: str, current_user: dict = Depends(get_current_user)):
    """محاضرات الأستاذ المجدولة القادمة (30 يوماً) القابلة للتبادل/الإنابة"""
    _require_operator(current_user)
    db = get_db()
    today = (_now() + timedelta(hours=3)).strftime("%Y-%m-%d")
    until = (_now() + timedelta(days=30)).strftime("%Y-%m-%d")
    lecs = await db.lectures.find({"teacher_id": teacher_id, "status": "scheduled", "date": {"$gte": today, "$lte": until}}).sort([("date", 1), ("start_time", 1)]).to_list(300)
    await _enrich_lectures(db, lecs)
    out = []
    for l in lecs:
        past = _lec_dt(l) <= _now()
        out.append({**_lec_view(l), "eligible": not past and not l.get("swap_id"), "reason": "سبق تبادلها" if l.get("swap_id") else ("انقضى موعدها" if past else "")})
    return {"lectures": out, "settings": await get_settings(db)}


@router.get("/candidates")
async def candidates(lecture_id: str, type: str = "swap", current_user: dict = Depends(get_current_user)):
    """الزملاء المتاحون وقت المحاضرة (نفس الكلية)، ولكل زميل محاضراته في الأسبوع نفسه التي يستطيع الأستاذ الأصلي تنفيذها"""
    _require_operator(current_user)
    db = get_db()
    lec = await db.lectures.find_one({"_id": _oid(lecture_id)}) if _oid(lecture_id) else None
    if not lec:
        raise HTTPException(status_code=404, detail="المحاضرة غير موجودة")
    course = await db.courses.find_one({"_id": _oid(lec["course_id"])}) or {}
    if not _in_scope(current_user, course):
        raise HTTPException(status_code=403, detail="المحاضرة خارج نطاقك")
    fac = course.get("faculty_id")
    tq = {"is_active": {"$ne": False}}
    if fac:
        tq["faculty_id"] = fac
    teachers = await db.teachers.find(tq, {"full_name": 1, "department_id": 1}).to_list(1000)
    ws, we = _week_range(lec["date"])
    a_tid = lec.get("teacher_id")
    out = []
    for t in teachers:
        tid = str(t["_id"])
        if tid == a_tid:
            continue
        busy = await _busy(db, tid, lec["date"], lec.get("start_time"), lec.get("end_time"), [lecture_id])
        item = {"teacher_id": tid, "full_name": t.get("full_name"), "department_id": t.get("department_id"), "available": not busy, "busy_reason": busy, "swappable": []}
        if type == "swap" and not busy:
            theirs = await db.lectures.find({"teacher_id": tid, "status": "scheduled", "date": {"$gte": ws, "$lte": we}, "swap_id": {"$exists": False}}).sort([("date", 1), ("start_time", 1)]).to_list(60)
            await _enrich_lectures(db, theirs)
            for l in theirs:
                if _lec_dt(l) <= _now():
                    continue
                conflict = await _busy(db, a_tid, l["date"], l.get("start_time"), l.get("end_time"), [str(l["_id"])])
                item["swappable"].append({**_lec_view(l), "ok": not conflict, "conflict": conflict})
        out.append(item)
    out.sort(key=lambda x: (not x["available"], x["full_name"] or ""))
    return {"lecture": _lec_view(lec), "week": [ws, we], "teachers": out}


# ---------------- التنفيذ ----------------
class SwapIn(BaseModel):
    type: str = "swap"  # swap | cover
    lecture_a_id: str
    counterpart_teacher_id: str
    lecture_b_id: Optional[str] = None
    reason: str = ""


async def _apply(db, swap: dict):
    """تطبيق التبادل على المحاضرتين: المنفّذ الفعلي يصبح teacher_id مع حفظ الأصل"""
    a, b = swap["lecture_a"], swap.get("lecture_b")
    sid = str(swap["_id"])
    pairs = [(a, swap["teacher_b_id"], swap["teacher_b_name"])] + ([(b, swap["teacher_a_id"], swap["teacher_a_name"])] if b else [])
    for lec, new_tid, new_name in pairs:
        await db.lectures.update_one({"_id": _oid(lec["id"]), "status": "scheduled"}, {"$set": {
            "original_teacher_id": lec["teacher_id"], "original_teacher_name": lec.get("teacher_name"), "teacher_id": new_tid, "teacher_name": new_name,
            "swap_id": sid, "swap_type": swap["type"], "swapped_at": _now().isoformat()}})


async def _revert(db, swap: dict):
    for lec in [swap["lecture_a"]] + ([swap["lecture_b"]] if swap.get("lecture_b") else []):
        await db.lectures.update_one({"_id": _oid(lec["id"]), "swap_id": str(swap["_id"]), "status": "scheduled"},
                                     {"$set": {"teacher_id": lec["teacher_id"], "teacher_name": lec.get("teacher_name")}, "$unset": {"original_teacher_id": "", "original_teacher_name": "", "swap_id": "", "swap_type": "", "swapped_at": ""}})


async def _notify_students(db, swap: dict):
    for lec, new_name in [(swap["lecture_a"], swap["teacher_b_name"])] + ([(swap["lecture_b"], swap["teacher_a_name"])] if swap.get("lecture_b") else []):
        q = {"course_id": lec["course_id"]}
        if lec.get("group"):
            q["group"] = lec["group"]
        sids = [e["student_id"] for e in await db.enrollments.find(q, {"student_id": 1}).to_list(500)]
        uids = [s["user_id"] for s in await db.students.find({"_id": {"$in": [o for o in (_oid(s) for s in sids) if o]}, "user_id": {"$exists": True}}, {"user_id": 1}).to_list(500)]
        await notify_users(db, uids, "تغيير أستاذ المحاضرة 🔁", f"محاضرة «{lec.get('course_name')}» يوم {lec['date']} {lec.get('start_time')} سينفّذها أ. {new_name} بدلاً من أ. {lec.get('teacher_name')}", "lecture_swap", {"lecture_id": lec["id"]})


@router.post("")
async def create_swap(data: SwapIn, current_user: dict = Depends(get_current_user)):
    """ينشئ التبادل/الإنابة ويطبّقه فوراً على المحاضرتين (عملية إدارية)"""
    _require_operator(current_user)
    db = get_db()
    st = await get_settings(db)
    if not st["enabled"]:
        raise HTTPException(status_code=400, detail="ميزة تبادل المحاضرات معطّلة")
    if data.type not in ("swap", "cover") or (data.type == "cover" and not st["allow_cover"]):
        raise HTTPException(status_code=400, detail="نوع العملية غير مسموح")
    lec_a = await db.lectures.find_one({"_id": _oid(data.lecture_a_id)}) if _oid(data.lecture_a_id) else None
    if not lec_a or not lec_a.get("teacher_id"):
        raise HTTPException(status_code=404, detail="المحاضرة غير موجودة أو بلا أستاذ مسند")
    course_a = await db.courses.find_one({"_id": _oid(lec_a["course_id"])}) or {}
    if not _in_scope(current_user, course_a):
        raise HTTPException(status_code=403, detail="المحاضرة خارج نطاقك")
    if lec_a.get("status") != "scheduled":
        raise HTTPException(status_code=400, detail="المحاضرة ليست بحالة «مجدولة»")
    if lec_a.get("swap_id"):
        raise HTTPException(status_code=400, detail="هذه المحاضرة سبق تبادلها — التبادل مرة واحدة فقط")
    if await db.lecture_swaps.find_one({"status": "approved", "$or": [{"lecture_a.id": data.lecture_a_id}, {"lecture_b.id": data.lecture_a_id}]}):
        raise HTTPException(status_code=400, detail="يوجد تبادل قائم على هذه المحاضرة بالفعل")
    if _lec_dt(lec_a) <= _now():
        raise HTTPException(status_code=400, detail="انقضى موعد المحاضرة")
    a_tid = lec_a["teacher_id"]
    cp = data.counterpart_teacher_id
    if cp == a_tid:
        raise HTTPException(status_code=400, detail="لا يمكن التبادل مع الأستاذ نفسه")
    if not await db.teachers.find_one({"_id": _oid(cp)}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="الأستاذ البديل غير موجود")
    busy = await _busy(db, cp, lec_a["date"], lec_a.get("start_time"), lec_a.get("end_time"), [data.lecture_a_id])
    if busy:
        raise HTTPException(status_code=400, detail=f"الأستاذ البديل غير متاح وقت المحاضرة: {busy}")
    lec_b = None
    if data.type == "swap":
        lec_b = await db.lectures.find_one({"_id": _oid(data.lecture_b_id)}) if _oid(data.lecture_b_id) else None
        if not lec_b or lec_b.get("teacher_id") != cp or lec_b.get("status") != "scheduled":
            raise HTTPException(status_code=400, detail="محاضرة الأستاذ البديل غير صالحة للتبادل")
        if lec_b.get("swap_id"):
            raise HTTPException(status_code=400, detail="محاضرة الأستاذ البديل سبق تبادلها")
        if await db.lecture_swaps.find_one({"status": "approved", "$or": [{"lecture_a.id": data.lecture_b_id}, {"lecture_b.id": data.lecture_b_id}]}):
            raise HTTPException(status_code=400, detail="يوجد تبادل قائم على محاضرة الأستاذ البديل بالفعل")
        ws, we = _week_range(lec_a["date"])
        if not (ws <= lec_b["date"] <= we):
            raise HTTPException(status_code=400, detail="التبادل يكون داخل الأسبوع نفسه فقط")
        if _lec_dt(lec_b) <= _now():
            raise HTTPException(status_code=400, detail="انقضى موعد محاضرة الأستاذ البديل")
        a_busy = await _busy(db, a_tid, lec_b["date"], lec_b.get("start_time"), lec_b.get("end_time"), [data.lecture_b_id])
        if a_busy:
            raise HTTPException(status_code=400, detail=f"الأستاذ الأصلي غير متاح وقت محاضرة البديل: {a_busy}")
    course_b = (await db.courses.find_one({"_id": _oid(lec_b["course_id"])}) or {}) if lec_b else {}
    await _enrich_lectures(db, [lec_a] + ([lec_b] if lec_b else []))
    now = _now().isoformat()
    doc = {
        "type": data.type, "status": "approved", "reason": (data.reason or "").strip()[:500],
        "teacher_a_id": a_tid, "teacher_a_name": await _teacher_name(db, a_tid),
        "teacher_b_id": cp, "teacher_b_name": await _teacher_name(db, cp),
        "lecture_a": _lec_view(lec_a), "lecture_b": _lec_view(lec_b) if lec_b else None,
        "department_id": course_a.get("department_id"), "faculty_id": course_a.get("faculty_id"),
        "department_id_b": course_b.get("department_id"), "faculty_id_b": course_b.get("faculty_id"),
        "cross_department": bool(course_b) and course_b.get("department_id") != course_a.get("department_id"),
        "month": lec_a["date"][:7],
        "created_by": current_user["id"], "created_by_name": current_user.get("full_name"), "created_by_role": current_user["role"],
        "history": [{"step": "apply", "by": current_user["id"], "name": current_user.get("full_name"), "role": current_user["role"], "at": now}],
        "created_at": now, "updated_at": now,
    }
    res = await db.lecture_swaps.insert_one(doc)
    doc["_id"] = res.inserted_id
    sid = str(res.inserted_id)
    await _apply(db, doc)
    kind = "تبادل" if data.type == "swap" else "إنابة"
    body = f"قررت الإدارة ({current_user.get('full_name')}) {kind} محاضرة «{lec_a.get('course_name')}» {lec_a['date']} {lec_a.get('start_time')}: ينفّذها أ. {doc['teacher_b_name']}"
    if lec_b:
        body += f"، ومحاضرة «{lec_b.get('course_name')}» {lec_b['date']} {lec_b.get('start_time')} ينفّذها أ. {doc['teacher_a_name']}"
    if data.reason:
        body += f" — السبب: {data.reason.strip()[:200]}"
    both = list(set(await _teacher_user_ids(db, a_tid) + await _teacher_user_ids(db, cp)))
    await notify_users(db, both, f"{kind} محاضرة 🔁", body, "lecture_swap", {"swap_id": sid})
    if st["notify_students"]:
        await _notify_students(db, doc)
    await log_activity(current_user, "lecture_swap_apply", "lecture_swap", sid, f"{kind} محاضرة (إداري)", {"lecture_a": data.lecture_a_id, "lecture_b": data.lecture_b_id, "teacher_a": a_tid, "teacher_b": cp})
    return _swap_view(await db.lecture_swaps.find_one({"_id": res.inserted_id}))


# ---------------- القوائم ----------------
@router.get("")
async def list_swaps(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    _require_operator(current_user)
    db = get_db()
    q: dict = {}
    if current_user["role"] == UserRole.DEPARTMENT_HEAD and current_user.get("department_id"):
        q["$or"] = [{"department_id": current_user["department_id"]}, {"department_id_b": current_user["department_id"]}]
    elif current_user["role"] != UserRole.ADMIN and current_user.get("faculty_id"):
        q["$or"] = [{"faculty_id": current_user["faculty_id"]}, {"faculty_id_b": current_user["faculty_id"]}]
    if status:
        q["status"] = {"$in": status.split(",")}
    rows = await db.lecture_swaps.find(q).sort("created_at", -1).limit(300).to_list(300)
    now = _now()
    out = []
    for s in rows:
        if s["status"] == "approved" and _lec_dt(s["lecture_a"]) <= now and (not s.get("lecture_b") or _lec_dt(s["lecture_b"]) <= now):
            await db.lecture_swaps.update_one({"_id": s["_id"]}, {"$set": {"status": "executed", "updated_at": now.isoformat()}})
            s["status"] = "executed"
        v = _swap_view(s)
        v["can_cancel"] = s["status"] == "approved" and _lec_dt(s["lecture_a"]) > now and (not s.get("lecture_b") or _lec_dt(s["lecture_b"]) > now)
        out.append(v)
    return {"items": out, "active": sum(1 for v in out if v["status"] == "approved")}


class CancelIn(BaseModel):
    note: str = ""


@router.post("/{swap_id}/cancel")
async def cancel(swap_id: str, data: CancelIn, current_user: dict = Depends(get_current_user)):
    """إلغاء قبل التنفيذ: تعود المحاضرتان لأصحابهما"""
    _require_operator(current_user)
    db = get_db()
    s = await db.lecture_swaps.find_one({"_id": _oid(swap_id)}) if _oid(swap_id) else None
    if not s or s["status"] != "approved":
        raise HTTPException(status_code=404, detail="العملية غير موجودة أو لا يمكن إلغاؤها")
    if _lec_dt(s["lecture_a"]) <= _now() or (s.get("lecture_b") and _lec_dt(s["lecture_b"]) <= _now()):
        raise HTTPException(status_code=400, detail="لا يمكن الإلغاء بعد حلول موعد إحدى المحاضرتين")
    await _revert(db, s)
    await db.lecture_swaps.update_one({"_id": s["_id"]}, {"$set": {"status": "cancelled", "updated_at": _now().isoformat()}, "$push": {"history": {"step": "cancel", "by": current_user["id"], "name": current_user.get("full_name"), "role": current_user["role"], "note": data.note[:300], "at": _now().isoformat()}}})
    both = list(set(await _teacher_user_ids(db, s["teacher_a_id"]) + await _teacher_user_ids(db, s["teacher_b_id"])))
    await notify_users(db, both, "إلغاء تبادل محاضرة ↩️", f"{current_user.get('full_name')} ألغى تبادل «{s['lecture_a'].get('course_name')}» {s['lecture_a']['date']} — عادت المحاضرات لأصحابها" + (f": {data.note}" if data.note else ""), "lecture_swap", {"swap_id": swap_id})
    await log_activity(current_user, "lecture_swap_cancel", "lecture_swap", swap_id, "إلغاء تبادل محاضرة", {})
    return {"ok": True, "status": "cancelled"}


@router.get("/report")
async def report(month: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """ملخص شهري: عدد التبادلات/الإنابات لكل أستاذ"""
    _require_operator(current_user)
    db = get_db()
    q: dict = {"status": {"$in": ["approved", "executed"]}}
    if month:
        q["month"] = month
    if current_user["role"] == UserRole.DEPARTMENT_HEAD and current_user.get("department_id"):
        q["$or"] = [{"department_id": current_user["department_id"]}, {"department_id_b": current_user["department_id"]}]
    elif current_user["role"] != UserRole.ADMIN and current_user.get("faculty_id"):
        q["$or"] = [{"faculty_id": current_user["faculty_id"]}, {"faculty_id_b": current_user["faculty_id"]}]
    rows = await db.lecture_swaps.find(q).to_list(2000)
    per: dict = {}
    for s in rows:
        for tid, name in ((s["teacher_a_id"], s["teacher_a_name"]), (s["teacher_b_id"], s["teacher_b_name"])):
            p = per.setdefault(tid, {"teacher_id": tid, "name": name, "swaps": 0, "covers": 0})
            p["swaps" if s["type"] == "swap" else "covers"] += 1
    return {"month": month, "total": len(rows), "swaps": sum(1 for s in rows if s["type"] == "swap"), "covers": sum(1 for s in rows if s["type"] == "cover"), "per_teacher": sorted(per.values(), key=lambda x: -(x["swaps"] + x["covers"]))}
