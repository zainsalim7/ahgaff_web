"""✅ شؤون الموظفين — المهام: إسناد (المدير المباشر لفريقه / HR لأي موظف)، متابعة التقدم، إشعارات"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from bson import ObjectId

from .deps import get_db, get_current_user, has_permission, log_activity
from .hr_common import (P_TASKS, YEMEN_TZ, _now, _today, _oid, _ser, _can_view, parse_date, user_id_of, find_my_employee, employee_user_ids,
                        notify_users, enrich_employee_refs, team_of, can_act_on)

router = APIRouter(prefix="/hr/tasks", tags=["شؤون الموظفين - المهام"])

PRIORITIES = {"low": "منخفضة", "normal": "عادية", "high": "مرتفعة", "urgent": "عاجلة"}
STATUSES = {"open": "جديدة", "in_progress": "قيد التنفيذ", "done": "مُنجزة", "cancelled": "ملغاة"}
OPEN = ("open", "in_progress")


class TaskIn(BaseModel):
    title: str
    description: Optional[str] = ""
    assignee_employee_id: str
    priority: str = "normal"
    due_date: Optional[str] = None
    start_date: Optional[str] = None


class ProgressIn(BaseModel):
    status: Optional[str] = None
    progress: Optional[int] = None
    note: Optional[str] = ""


def _view(t: dict) -> dict:
    d = _ser(t)
    d["priority_label"] = PRIORITIES.get(d.get("priority"), d.get("priority"))
    d["status_label"] = STATUSES.get(d.get("status"), d.get("status"))
    d["overdue"] = bool(d.get("due_date")) and d["status"] in OPEN and d["due_date"] < _today()
    return d


async def _load(db, task_id: str) -> dict:
    t = await db.hr_tasks.find_one({"_id": _oid(task_id)})
    if not t:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    return t


async def _is_party(db, user: dict, t: dict, me: Optional[dict]) -> dict:
    uid = user_id_of(user)
    my_id = str(me["_id"]) if me else ""
    return {"assignee": my_id == t["assignee_employee_id"], "assigner": t.get("assigner_user_id") == uid,
            "manager": await can_act_on(db, user, t["assignee_employee_id"], P_TASKS), "hr": has_permission(user, P_TASKS)}


@router.get("/meta")
async def tasks_meta(current_user: dict = Depends(get_current_user)):
    return {"priorities": PRIORITIES, "statuses": STATUSES}


@router.get("/assignable")
async def assignable(current_user: dict = Depends(get_current_user)):
    """من يمكنني إسناد مهام له: HR → الجميع، مدير → فريقه"""
    db = get_db()
    me = await find_my_employee(db, current_user)
    if has_permission(current_user, P_TASKS):
        emps = [_ser(e) for e in await db.employees.find({"status": {"$nin": ["ended", "suspended"]}}, {"full_name": 1, "employee_no": 1, "job_title": 1}).sort("full_name", 1).to_list(2000)]
        scope = "all"
    else:
        emps, scope = await team_of(db, me), "team"
    return {"scope": scope, "employees": [{"id": e["id"], "full_name": e.get("full_name", ""), "employee_no": e.get("employee_no", ""), "job_title": e.get("job_title", "")} for e in emps]}


@router.get("")
async def list_tasks(view: str = "mine", status: Optional[str] = None, priority: Optional[str] = None, assignee_employee_id: Optional[str] = None,
                     search: Optional[str] = None, page: int = 1, per_page: int = 40, current_user: dict = Depends(get_current_user)):
    """view: mine (المسندة إليّ) | team (فريقي) | assigned (التي أسندتها) | all (HR)"""
    db = get_db()
    me = await find_my_employee(db, current_user)
    my_id = str(me["_id"]) if me else None
    q: dict = {}
    if view == "mine":
        q["assignee_employee_id"] = my_id or "__none__"
    elif view == "team":
        q["assignee_employee_id"] = {"$in": [e["id"] for e in await team_of(db, me)]}
    elif view == "assigned":
        q["assigner_user_id"] = user_id_of(current_user)
    elif view == "all":
        if not (_can_view(current_user) or has_permission(current_user, P_TASKS)):
            raise HTTPException(status_code=403, detail="غير مصرح")
    else:
        raise HTTPException(status_code=400, detail="view غير صحيح")
    if status:
        q["status"] = {"$in": status.split(",")}
    if priority:
        q["priority"] = priority
    if assignee_employee_id and view in ("all", "team"):
        q["assignee_employee_id"] = assignee_employee_id
    if search:
        import re
        q["title"] = {"$regex": re.escape(search.strip()), "$options": "i"}
    total = await db.hr_tasks.count_documents(q)
    per_page = max(1, min(per_page, 200))
    items = [_view(t) for t in await db.hr_tasks.find(q).sort([("status", 1), ("due_date", 1), ("created_at", -1)]).skip((page - 1) * per_page).limit(per_page).to_list(per_page)]
    await enrich_employee_refs(db, items, "assignee_employee_id")
    base = {k: v for k, v in q.items() if k not in ("status", "priority", "title")}
    t = _today()
    from datetime import timedelta
    week = (datetime.now(YEMEN_TZ).date() + timedelta(days=7)).strftime("%Y-%m-%d")
    stats = {"open": await db.hr_tasks.count_documents({**base, "status": {"$in": list(OPEN)}}),
             "overdue": await db.hr_tasks.count_documents({**base, "status": {"$in": list(OPEN)}, "due_date": {"$lt": t, "$ne": None}}),
             "done": await db.hr_tasks.count_documents({**base, "status": "done"}),
             "due_week": await db.hr_tasks.count_documents({**base, "status": {"$in": list(OPEN)}, "due_date": {"$gte": t, "$lte": week}})}
    return {"items": items, "total": total, "page": page, "per_page": per_page, "stats": stats, "has_profile": bool(me), "team_size": len(await team_of(db, me)) if me else 0}


@router.post("")
async def create_task(data: TaskIn, current_user: dict = Depends(get_current_user)):
    db = get_db()
    if not data.title.strip():
        raise HTTPException(status_code=400, detail="عنوان المهمة مطلوب")
    if data.priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail="الأولوية غير صحيحة")
    if data.due_date:
        parse_date(data.due_date, "تاريخ الاستحقاق")
    if data.start_date:
        parse_date(data.start_date, "تاريخ البدء")
    target = await db.employees.find_one({"_id": _oid(data.assignee_employee_id, "الموظف")})
    if not target:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    if not await can_act_on(db, current_user, data.assignee_employee_id, P_TASKS):
        raise HTTPException(status_code=403, detail="يمكنك إسناد المهام لأعضاء فريقك فقط")
    me = await find_my_employee(db, current_user)
    doc = {**data.dict(), "title": data.title.strip(), "status": "open", "progress": 0, "assigner_user_id": user_id_of(current_user), "assigner_name": current_user.get("full_name", ""),
           "assigner_employee_id": str(me["_id"]) if me else None, "updates": [{"action": "created", "by_name": current_user.get("full_name", ""), "at": _now(), "note": ""}],
           "created_at": _now(), "completed_at": None}
    r = await db.hr_tasks.insert_one(doc)
    tid = str(r.inserted_id)
    uid = (await employee_user_ids(db, [data.assignee_employee_id])).get(data.assignee_employee_id)
    if uid:
        await notify_users(db, [uid], "مهمة جديدة مسندة إليك", f"{doc['title']}" + (f" — تستحق {data.due_date}" if data.due_date else "") + f" · من {doc['assigner_name']}", "hr_task", {"task_id": tid})
    await log_activity(current_user, "hr_task_create", "task", tid, doc["title"], {"assignee": target.get("full_name", "")})
    return {"id": tid, "message": "تم إسناد المهمة"}


@router.get("/{task_id}")
async def get_task(task_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    t = await _load(db, task_id)
    me = await find_my_employee(db, current_user)
    p = await _is_party(db, current_user, t, me)
    if not any(p.values()) and not _can_view(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    d = _view(t)
    await enrich_employee_refs(db, [d], "assignee_employee_id")
    d["can_edit"] = p["assigner"] or p["hr"] or p["manager"]
    d["can_progress"] = p["assignee"] or d["can_edit"]
    return d


@router.put("/{task_id}")
async def update_task(task_id: str, data: TaskIn, current_user: dict = Depends(get_current_user)):
    db = get_db()
    t = await _load(db, task_id)
    p = await _is_party(db, current_user, t, await find_my_employee(db, current_user))
    if not (p["assigner"] or p["hr"] or p["manager"]):
        raise HTTPException(status_code=403, detail="غير مصرح بتعديل هذه المهمة")
    if data.assignee_employee_id != t["assignee_employee_id"] and not await can_act_on(db, current_user, data.assignee_employee_id, P_TASKS):
        raise HTTPException(status_code=403, detail="لا يمكنك إعادة الإسناد لهذا الموظف")
    if data.due_date:
        parse_date(data.due_date, "تاريخ الاستحقاق")
    upd = {**data.dict(), "title": data.title.strip(), "updated_at": _now()}
    await db.hr_tasks.update_one({"_id": t["_id"]}, {"$set": upd, "$push": {"updates": {"action": "updated", "by_name": current_user.get("full_name", ""), "at": _now(), "note": ""}}})
    if data.assignee_employee_id != t["assignee_employee_id"]:
        uid = (await employee_user_ids(db, [data.assignee_employee_id])).get(data.assignee_employee_id)
        if uid:
            await notify_users(db, [uid], "مهمة جديدة مسندة إليك", upd["title"], "hr_task", {"task_id": task_id})
    return {"message": "تم تحديث المهمة"}


@router.post("/{task_id}/progress")
async def task_progress(task_id: str, data: ProgressIn, current_user: dict = Depends(get_current_user)):
    db = get_db()
    t = await _load(db, task_id)
    p = await _is_party(db, current_user, t, await find_my_employee(db, current_user))
    if not any(p.values()):
        raise HTTPException(status_code=403, detail="غير مصرح")
    if t["status"] in ("done", "cancelled") and not (p["assigner"] or p["hr"]):
        raise HTTPException(status_code=400, detail="المهمة مغلقة")
    status = data.status or t["status"]
    if status not in STATUSES:
        raise HTTPException(status_code=400, detail="الحالة غير صحيحة")
    if status == "cancelled" and not (p["assigner"] or p["hr"] or p["manager"]):
        raise HTTPException(status_code=403, detail="إلغاء المهمة من صلاحية من أسندها")
    progress = t.get("progress", 0) if data.progress is None else max(0, min(100, int(data.progress)))
    if status == "done":
        progress = 100
    elif status == "open" and data.progress is None:
        progress = 0
    elif progress > 0 and status == "open":
        status = "in_progress"
    upd = {"status": status, "progress": progress, "updated_at": _now(), "completed_at": _now() if status == "done" else None,
           "completed_on_time": (t.get("due_date") is None or _today() <= t["due_date"]) if status == "done" else None}
    await db.hr_tasks.update_one({"_id": t["_id"]}, {"$set": upd, "$push": {"updates": {"action": status, "progress": progress, "by_name": current_user.get("full_name", ""), "at": _now(), "note": (data.note or "").strip()}}})
    if status == "done" and t.get("assigner_user_id") and t["assigner_user_id"] != user_id_of(current_user):
        await notify_users(db, [t["assigner_user_id"]], "تم إنجاز مهمة ✅", f"{t['title']} — أنجزها {current_user.get('full_name', '')}", "hr_task", {"task_id": task_id})
    elif status != t["status"] and (p["assigner"] or p["hr"] or p["manager"]) and not p["assignee"]:
        uid = (await employee_user_ids(db, [t["assignee_employee_id"]])).get(t["assignee_employee_id"])
        if uid:
            await notify_users(db, [uid], f"تحديث على مهمتك: {STATUSES[status]}", t["title"], "hr_task", {"task_id": task_id})
    return {"status": status, "progress": progress, "message": f"تم التحديث — {STATUSES[status]} ({progress}%)"}


@router.delete("/{task_id}")
async def delete_task(task_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    t = await _load(db, task_id)
    p = await _is_party(db, current_user, t, await find_my_employee(db, current_user))
    if not (p["assigner"] or p["hr"]):
        raise HTTPException(status_code=403, detail="غير مصرح")
    if t["status"] != "open" or t.get("progress"):
        raise HTTPException(status_code=400, detail="تُحذف المهام الجديدة فقط — استخدم «إلغاء» للمهام التي بدأت")
    await db.hr_tasks.delete_one({"_id": t["_id"]})
    return {"message": "تم حذف المهمة"}
