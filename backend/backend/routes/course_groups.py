"""👥 المجموعات الدراسية داخل المقرر — توزيع طلاب المقرر إلى مجموعات (عملي/مختبر) بمدرّس اختياري لكل مجموعة"""
import random
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from bson import ObjectId

from .deps import get_db, get_current_user, has_permission, log_activity

router = APIRouter(tags=["course-groups"])

P_ANY = ("manage_enrollments", "add_enrollment", "manage_courses")


def _can(user: dict) -> bool:
    return user.get("role") == "admin" or any(has_permission(user, p) for p in P_ANY)


def _oid(v: str) -> ObjectId:
    try:
        return ObjectId(v)
    except Exception:
        raise HTTPException(status_code=400, detail="معرّف غير صحيح")


class GroupIn(BaseModel):
    key: str
    name: Optional[str] = ""
    teacher_id: Optional[str] = None


class GroupsPut(BaseModel):
    groups: List[GroupIn]


class AssignIn(BaseModel):
    student_ids: List[str]
    group: Optional[str] = None  # None/"" = إزالة من المجموعة


class AutoIn(BaseModel):
    count: int = 2
    method: str = "name"  # name | number | random
    only_unassigned: bool = False


async def _course(db, course_id: str) -> dict:
    c = await db.courses.find_one({"_id": _oid(course_id)})
    if not c:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    return c


async def _teacher_names(db, ids: List[str]) -> dict:
    oids = []
    for t in ids:
        try:
            oids.append(ObjectId(t))
        except Exception:
            pass
    if not oids:
        return {}
    return {str(t["_id"]): t.get("full_name", "") for t in await db.teachers.find({"_id": {"$in": oids}}, {"full_name": 1}).to_list(500)}


async def _view(db, course: dict) -> dict:
    cid = str(course["_id"])
    groups = course.get("groups") or []
    enrollments = await db.enrollments.find({"course_id": cid}).to_list(10000)
    sids = []
    for e in enrollments:
        try:
            sids.append(ObjectId(e["student_id"]))
        except Exception:
            pass
    students = {str(s["_id"]): s for s in await db.students.find({"_id": {"$in": sids}}, {"student_id": 1, "full_name": 1}).to_list(10000)}
    tnames = await _teacher_names(db, [g.get("teacher_id") for g in groups if g.get("teacher_id")])
    by_group: dict = {g["key"]: [] for g in groups}
    unassigned = []
    for e in sorted(enrollments, key=lambda x: students.get(x["student_id"], {}).get("full_name", "")):
        s = students.get(e["student_id"])
        if not s:
            continue
        row = {"student_id": e["student_id"], "student_number": s.get("student_id", ""), "full_name": s.get("full_name", "")}
        g = e.get("group") or ""
        if g and g in by_group:
            by_group[g].append(row)
        else:
            unassigned.append(row)
    return {
        "course_id": cid,
        "course_name": course.get("name", ""),
        "course_teacher_id": course.get("teacher_id"),
        "groups": [{
            "key": g["key"], "name": g.get("name") or f"مجموعة {g['key']}",
            "teacher_id": g.get("teacher_id"), "teacher_name": tnames.get(g.get("teacher_id") or "", ""),
            "count": len(by_group.get(g["key"], [])), "students": by_group.get(g["key"], []),
        } for g in groups],
        "unassigned": unassigned,
        "total": len(enrollments),
    }


@router.get("/courses/{course_id}/groups")
async def get_course_groups(course_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    return await _view(db, await _course(db, course_id))


@router.put("/courses/{course_id}/groups")
async def put_course_groups(course_id: str, data: GroupsPut, current_user: dict = Depends(get_current_user)):
    if not _can(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    course = await _course(db, course_id)
    keys = []
    groups = []
    for g in data.groups:
        k = (g.key or "").strip()
        if not k or len(k) > 10:
            raise HTTPException(status_code=400, detail="رمز المجموعة مطلوب (حتى 10 أحرف)")
        if k in keys:
            raise HTTPException(status_code=400, detail=f"رمز المجموعة «{k}» مكرر")
        keys.append(k)
        groups.append({"key": k, "name": (g.name or "").strip() or f"مجموعة {k}", "teacher_id": (g.teacher_id or "").strip() or None})
    removed = [g["key"] for g in (course.get("groups") or []) if g["key"] not in keys]
    if removed:
        await db.enrollments.update_many({"course_id": course_id, "group": {"$in": removed}}, {"$unset": {"group": ""}})
    await db.courses.update_one({"_id": course["_id"]}, {"$set": {"groups": groups}})
    await log_activity(current_user, "update_course_groups", "course", course_id, course.get("name", ""),
                       {"summary": f"تحديث مجموعات المقرر «{course.get('name', '')}» ({len(groups)} مجموعة)", "removed": removed})
    course["groups"] = groups
    return await _view(db, course)


@router.post("/courses/{course_id}/groups/assign")
async def assign_group(course_id: str, data: AssignIn, current_user: dict = Depends(get_current_user)):
    if not _can(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    course = await _course(db, course_id)
    g = (data.group or "").strip()
    if g and g not in [x["key"] for x in (course.get("groups") or [])]:
        raise HTTPException(status_code=400, detail="المجموعة غير معرّفة في هذا المقرر")
    if not data.student_ids:
        raise HTTPException(status_code=400, detail="اختر طالباً واحداً على الأقل")
    q = {"course_id": course_id, "student_id": {"$in": data.student_ids}}
    r = await db.enrollments.update_many(q, {"$set": {"group": g}} if g else {"$unset": {"group": ""}})
    await log_activity(current_user, "assign_course_group", "course", course_id, course.get("name", ""),
                       {"summary": f"{'تعيين' if g else 'إزالة'} مجموعة {g or ''} لـ {r.modified_count} طالب في «{course.get('name', '')}»"})
    return {"updated": r.modified_count, "message": f"تم تحديث {r.modified_count} طالب"}


@router.post("/courses/{course_id}/groups/auto-distribute")
async def auto_distribute(course_id: str, data: AutoIn, current_user: dict = Depends(get_current_user)):
    if not _can(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    if data.count < 2 or data.count > 20:
        raise HTTPException(status_code=400, detail="عدد المجموعات بين 2 و20")
    db = get_db()
    course = await _course(db, course_id)
    groups = list(course.get("groups") or [])
    existing = [g["key"] for g in groups]
    for i in range(1, data.count + 1):
        if str(i) not in existing:
            groups.append({"key": str(i), "name": f"مجموعة {i}", "teacher_id": None})
    target_keys = [str(i) for i in range(1, data.count + 1)]

    q = {"course_id": course_id}
    if data.only_unassigned:
        q["$or"] = [{"group": {"$exists": False}}, {"group": None}, {"group": ""}]
    enrollments = await db.enrollments.find(q).to_list(10000)
    sids = [ObjectId(e["student_id"]) for e in enrollments if ObjectId.is_valid(e["student_id"])]
    students = {str(s["_id"]): s for s in await db.students.find({"_id": {"$in": sids}}, {"student_id": 1, "full_name": 1}).to_list(10000)}
    rows = [e for e in enrollments if e["student_id"] in students]
    if data.method == "number":
        rows.sort(key=lambda e: students[e["student_id"]].get("student_id", ""))
    elif data.method == "random":
        random.shuffle(rows)
    else:
        rows.sort(key=lambda e: students[e["student_id"]].get("full_name", ""))

    # عند التوزيع فوق مجموعات موجودة: نبدأ بالمجموعة الأقل عدداً لتحقيق التوازن
    counts = {k: 0 for k in target_keys}
    if data.only_unassigned:
        async for row in db.enrollments.aggregate([{"$match": {"course_id": course_id, "group": {"$in": target_keys}}}, {"$group": {"_id": "$group", "n": {"$sum": 1}}}]):
            counts[row["_id"]] = row["n"]
    from pymongo import UpdateOne
    ops = []
    for e in rows:
        k = min(target_keys, key=lambda x: counts[x])
        counts[k] += 1
        ops.append(UpdateOne({"_id": e["_id"]}, {"$set": {"group": k}}))
    if ops:
        await db.enrollments.bulk_write(ops)
    await db.courses.update_one({"_id": course["_id"]}, {"$set": {"groups": groups}})
    await log_activity(current_user, "auto_distribute_groups", "course", course_id, course.get("name", ""),
                       {"summary": f"توزيع تلقائي لـ {len(ops)} طالب على {data.count} مجموعات في «{course.get('name', '')}»", "method": data.method})
    course["groups"] = groups
    out = await _view(db, course)
    out["message"] = f"تم توزيع {len(ops)} طالب على {data.count} مجموعات"
    return out


@router.get("/students/{student_id}/groups")
async def student_groups(student_id: str, current_user: dict = Depends(get_current_user)):
    """مجموعات الطالب في كل مقرراته (لعرضها في تفاصيل الطالب/التطبيق)"""
    db = get_db()
    out = []
    enrollments = await db.enrollments.find({"student_id": student_id, "group": {"$nin": [None, ""]}}).to_list(500)
    cids = [ObjectId(e["course_id"]) for e in enrollments if ObjectId.is_valid(e["course_id"])]
    courses = {str(c["_id"]): c for c in await db.courses.find({"_id": {"$in": cids}}).to_list(500)}
    for e in enrollments:
        c = courses.get(e["course_id"])
        if not c:
            continue
        g = next((x for x in (c.get("groups") or []) if x["key"] == e["group"]), None)
        out.append({"course_id": e["course_id"], "course_name": c.get("name", ""), "course_code": c.get("code", ""),
                    "group": e["group"], "group_name": (g or {}).get("name") or f"مجموعة {e['group']}"})
    return out
