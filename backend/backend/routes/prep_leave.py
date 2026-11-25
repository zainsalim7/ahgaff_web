"""🎓 إجازة التحضير — إعفاء غياب الطلاب خلال أيام تحضيرية قبيل الاختبارات النهائية (قرار يدوي من الإدارة)"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .deps import get_current_user, get_db, log_activity, has_permission, get_own_department_ids
from models.permissions import UserRole

router = APIRouter(prefix="/prep-leave-periods", tags=["إجازة التحضير"])
YEMEN_TZ = timezone(timedelta(hours=3))

SCOPE_LABELS = {"all": "الجامعة بالكامل", "faculty": "كلية", "department": "قسم", "course": "مقرر"}


def _now() -> datetime:
    return datetime.now(YEMEN_TZ)


def _can_manage(user: dict) -> bool:
    """🔒 لا صلاحيات افتراضية بالدور — إجازة التحضير تتطلّب صراحةً manage_prep_leave"""
    return user.get("role") == UserRole.ADMIN or has_permission(user, "manage_prep_leave")


async def _user_scope(db, user: dict):
    """None = غير مقيَّد · وإلا {deps, full_facs} (الكليات التي يملك كل أقسامها)"""
    deps = await get_own_department_ids(user)
    if deps is None:
        return None
    deps = set(deps)
    oids = [ObjectId(d) for d in deps if ObjectId.is_valid(d)]
    facs = {d.get("faculty_id") async for d in db.departments.find({"_id": {"$in": oids}}, {"faculty_id": 1}) if d.get("faculty_id")}
    full = set()
    for f in facs:
        all_d = {str(x["_id"]) async for x in db.departments.find({"faculty_id": f}, {"_id": 1})}
        if all_d and all_d <= deps:
            full.add(f)
    return {"deps": deps, "facs": facs, "full_facs": full}


async def _target_in_scope(db, sc, scope: str, scope_id) -> bool:
    if sc is None:
        return True
    if scope == "all":
        return False
    if scope == "faculty":
        return scope_id in sc["full_facs"]
    if scope == "department":
        return scope_id in sc["deps"]
    if scope == "course":
        c = await db.courses.find_one({"_id": ObjectId(scope_id)}, {"department_id": 1}) if ObjectId.is_valid(scope_id or "") else None
        return bool(c) and c.get("department_id") in sc["deps"]
    return False


class PrepPeriodCreate(BaseModel):
    date_from: str
    date_to: str
    scope: str = "all"  # all | faculty | department | course
    scope_id: Optional[str] = None
    scope_name: Optional[str] = ""
    mode: str = "exclude"  # exclude: استبعاد من حساب الطالب · present: احتساب حضور لكل الطلاب
    reason: Optional[str] = ""


def _serialize(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]), "date_from": doc.get("date_from"), "date_to": doc.get("date_to"),
        "mode": doc.get("mode", "exclude"),
        "scope": doc.get("scope", "all"), "scope_id": doc.get("scope_id"), "scope_name": doc.get("scope_name") or "",
        "scope_label": SCOPE_LABELS.get(doc.get("scope", "all"), doc.get("scope", "all")),
        "reason": doc.get("reason", ""), "created_at": doc.get("created_at"),
        "created_by_name": doc.get("created_by_name", ""),
    }


def _period_matches(period: dict, course: dict, fac_id) -> bool:
    sc, sid = period.get("scope", "all"), period.get("scope_id")
    return (sc == "all" or (sc == "course" and sid == str(course["_id"]))
            or (sc == "department" and sid == course.get("department_id")) or (sc == "faculty" and sid and sid == fac_id))


async def apply_present_period(db, period: dict) -> int:
    """🟢 وضع «حضور»: يُسجَّل فعلياً حضور كل طلاب المحاضرات الواقعة في الفترة (كامل الفترة فور الحفظ) — قابل للتكرار بأمان."""
    if period.get("mode") != "present":
        return 0
    pid = str(period["_id"])
    until = period["date_to"]
    lecs = await db.lectures.find({
        "date": {"$gte": period["date_from"], "$lte": until},
        "is_cancelled": {"$ne": True}, "status": {"$ne": "cancelled"},
    }).to_list(20000)
    courses, facs, applied = {}, {}, 0
    for lec in lecs:
        cid = lec.get("course_id")
        if cid not in courses:
            courses[cid] = await db.courses.find_one({"_id": ObjectId(cid)}) if ObjectId.is_valid(cid or "") else None
        course = courses[cid]
        if not course:
            continue
        dep_id = course.get("department_id")
        fac_id = course.get("faculty_id")
        if not fac_id and dep_id:
            if dep_id not in facs:
                dep = await db.departments.find_one({"_id": ObjectId(dep_id)}, {"faculty_id": 1}) if ObjectId.is_valid(dep_id) else None
                facs[dep_id] = (dep or {}).get("faculty_id")
            fac_id = facs[dep_id]
        if not _period_matches(period, course, fac_id):
            continue
        lid = str(lec["_id"])
        if lec.get("status") != "completed":
            await db.lectures.update_one({"_id": lec["_id"]}, {"$set": {
                "status": "completed", "prep_present_period_id": pid, "prep_prev_status": lec.get("status")}})
        try:
            lec_dt = datetime.strptime(f"{str(lec['date'])[:10]} {lec.get('start_time') or '00:00'}", "%Y-%m-%d %H:%M")
        except Exception:
            lec_dt = datetime.strptime(str(lec["date"])[:10], "%Y-%m-%d")
        q = {"course_id": cid, **({"group": lec["group"]} if lec.get("group") else {})}
        sids = [e["student_id"] async for e in db.enrollments.find(q, {"student_id": 1}) if e.get("student_id")]
        existing = {r["student_id"]: r async for r in db.attendance.find({"lecture_id": lid, "student_id": {"$in": sids}})}
        for sid in sids:
            r = existing.get(sid)
            if r is None:
                await db.attendance.insert_one({
                    "lecture_id": lid, "course_id": cid, "student_id": sid, "status": "present", "date": lec_dt,
                    "recorded_by": period.get("created_by"), "method": "prep_leave", "notes": "حضور معتمد — إجازة تحضير",
                    "created_at": _now(), "prep_present_period_id": pid,
                })
                applied += 1
            elif r.get("status") != "present" and not r.get("prep_present_period_id"):
                await db.attendance.update_one({"_id": r["_id"]}, {"$set": {
                    "status": "present", "prep_present_period_id": pid, "prep_prev_status": r.get("status")}})
                applied += 1
    return applied


async def revert_present_period(db, pid: str) -> None:
    await db.attendance.delete_many({"prep_present_period_id": pid, "method": "prep_leave"})
    async for r in db.attendance.find({"prep_present_period_id": pid}):
        await db.attendance.update_one({"_id": r["_id"]}, {"$set": {"status": r.get("prep_prev_status") or "absent"},
                                                             "$unset": {"prep_present_period_id": "", "prep_prev_status": ""}})
    async for l in db.lectures.find({"prep_present_period_id": pid}):
        await db.lectures.update_one({"_id": l["_id"]}, {"$set": {"status": l.get("prep_prev_status") or "scheduled"},
                                                          "$unset": {"prep_present_period_id": "", "prep_prev_status": ""}})


async def sync_present_periods(db) -> int:
    n = 0
    async for p in db.prep_leave_periods.find({"mode": "present"}):
        n += await apply_present_period(db, p)
    return n


@router.get("")
async def list_prep_periods(current_user: dict = Depends(get_current_user)):
    db = get_db()
    await sync_present_periods(db)
    sc = await _user_scope(db, current_user)
    items = []
    async for d in db.prep_leave_periods.find({}).sort("date_from", -1):
        if sc is None or d.get("scope", "all") == "all" or (d.get("scope") == "faculty" and d.get("scope_id") in sc["facs"]) or await _target_in_scope(db, sc, d.get("scope"), d.get("scope_id")):
            item = _serialize(d)
            item["can_delete"] = await _target_in_scope(db, sc, d.get("scope", "all"), d.get("scope_id"))
            items.append(item)
    return {"items": items}


@router.post("")
async def create_prep_period(data: PrepPeriodCreate, current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك بتحديد أيام تحضيرية")
    if data.mode not in ("exclude", "present"):
        raise HTTPException(status_code=400, detail="الوضع غير صحيح")
    if data.scope not in ("all", "faculty", "department", "course"):
        raise HTTPException(status_code=400, detail="نطاق غير صالح")
    if data.scope != "all" and not data.scope_id:
        raise HTTPException(status_code=400, detail="حدد الكلية/القسم/المقرر المستهدف")
    try:
        d1 = datetime.strptime(data.date_from, "%Y-%m-%d")
        d2 = datetime.strptime(data.date_to, "%Y-%m-%d")
    except Exception:
        raise HTTPException(status_code=400, detail="صيغة التاريخ غير صحيحة (YYYY-MM-DD)")
    if d2 < d1:
        raise HTTPException(status_code=400, detail="تاريخ النهاية قبل تاريخ البداية")

    db = get_db()
    if not await _target_in_scope(db, await _user_scope(db, current_user), data.scope, data.scope_id):
        raise HTTPException(status_code=403, detail="لا يمكنك تحديد فترة خارج نطاقك (الجامعة بالكامل أو كلية/قسم/مقرر لا تتبعك)")
    doc = {
        "date_from": data.date_from, "date_to": data.date_to, "scope": data.scope, "mode": data.mode,
        "scope_id": data.scope_id if data.scope != "all" else None,
        "scope_name": (data.scope_name or "").strip(), "reason": (data.reason or "").strip(),
        "created_at": _now(), "created_by": current_user.get("id"), "created_by_name": current_user.get("full_name", ""),
    }
    res = await db.prep_leave_periods.insert_one(doc)
    await log_activity(
        current_user, "create_prep_leave_period", "prep_leave_period", str(res.inserted_id),
        f"{data.date_from} → {data.date_to} ({SCOPE_LABELS.get(data.scope, data.scope)})",
    )
    doc["_id"] = res.inserted_id
    applied = await apply_present_period(db, doc)
    return {**_serialize(doc), "applied_records": applied}


@router.delete("/{period_id}")
async def delete_prep_period(period_id: str, current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    try:
        oid = ObjectId(period_id)
    except Exception:
        raise HTTPException(status_code=404, detail="الفترة غير موجودة")
    db = get_db()
    doc = await db.prep_leave_periods.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="الفترة غير موجودة")
    if not await _target_in_scope(db, await _user_scope(db, current_user), doc.get("scope", "all"), doc.get("scope_id")):
        raise HTTPException(status_code=403, detail="لا يمكنك حذف فترة خارج نطاقك")
    await db.prep_leave_periods.delete_one({"_id": oid})
    if doc.get("mode") == "present":
        await revert_present_period(db, period_id)
    await log_activity(current_user, "delete_prep_leave_period", "prep_leave_period", period_id, f"{doc.get('date_from')} → {doc.get('date_to')}")
    return {"message": "تم حذف الفترة التحضيرية"}
