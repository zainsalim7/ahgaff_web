"""📨 شؤون الموظفين — المراسلات: واردة / صادرة / مذكرات داخلية / تعاميم، بأرقام مرجعية وسجل حالات وإقرار استلام"""
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from bson import ObjectId

from .deps import get_db, get_current_user, has_permission, log_activity
from .hr_common import (P_CORR, YEMEN_TZ, _now, _today, _oid, _ser, _can_view, _guard, parse_date, user_id_of, find_my_employee, employee_user_ids, notify_users)

router = APIRouter(prefix="/hr/correspondence", tags=["شؤون الموظفين - المراسلات"])

DIRECTIONS = {"incoming": "واردة", "outgoing": "صادرة", "internal": "مذكرة داخلية", "circular": "تعميم"}
PREFIX = {"incoming": "IN", "outgoing": "OUT", "internal": "INT", "circular": "CIR"}
PRIORITIES = {"normal": "عادية", "urgent": "عاجلة", "confidential": "سرية"}
STATUSES = {"draft": "مسودة", "registered": "مسجّلة", "in_progress": "قيد المعالجة", "closed": "مُنجزة", "archived": "مؤرشفة"}


class CorrIn(BaseModel):
    direction: str = "internal"
    subject: str
    body: Optional[str] = ""
    date: Optional[str] = None
    priority: str = "normal"
    status: str = "registered"
    from_party: Optional[str] = ""
    to_party: Optional[str] = ""
    to_unit_id: Optional[str] = None
    to_employee_ids: List[str] = []
    to_all_employees: bool = False
    related_employee_id: Optional[str] = None
    external_ref: Optional[str] = ""
    due_date: Optional[str] = None
    tags: List[str] = []
    attachment_url: Optional[str] = ""


class StatusIn(BaseModel):
    status: str
    note: Optional[str] = ""


async def _next_ref(db, direction: str) -> str:
    y = datetime.now(YEMEN_TZ).year
    key = f"hr_corr_{PREFIX[direction]}_{y}"
    c = await db.counters.find_one_and_update({"_id": key}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    return f"HR-{PREFIX[direction]}-{y}-{c['seq']:04d}"


def _validate(data: CorrIn):
    if data.direction not in DIRECTIONS:
        raise HTTPException(status_code=400, detail="نوع المراسلة غير صحيح")
    if data.priority not in PRIORITIES or data.status not in STATUSES:
        raise HTTPException(status_code=400, detail="الأولوية أو الحالة غير صحيحة")
    if not data.subject.strip():
        raise HTTPException(status_code=400, detail="موضوع المراسلة مطلوب")
    if data.date:
        parse_date(data.date, "تاريخ المراسلة")
    if data.due_date:
        parse_date(data.due_date, "تاريخ الاستحقاق")
    for i in [*data.to_employee_ids, data.to_unit_id, data.related_employee_id]:
        if i and not ObjectId.is_valid(i):
            raise HTTPException(status_code=400, detail="معرّف موظف/وحدة غير صحيح")


async def _recipients(db, doc: dict) -> List[str]:
    """معرّفات الموظفين المستهدفين (لتعميم/مذكرة داخلية)"""
    if doc.get("to_all_employees"):
        return [str(e["_id"]) for e in await db.employees.find({"status": {"$nin": ["ended"]}}, {"_id": 1}).to_list(10000)]
    ids = set(doc.get("to_employee_ids") or [])
    if doc.get("to_unit_id"):
        frontier, seen = [doc["to_unit_id"]], {doc["to_unit_id"]}
        while frontier:
            kids = [str(u["_id"]) for u in await db.org_units.find({"parent_id": {"$in": frontier}}, {"_id": 1}).to_list(2000)]
            frontier = [k for k in kids if k not in seen]
            seen |= set(kids)
        ids |= {str(e["_id"]) for e in await db.employees.find({"org_unit_id": {"$in": list(seen)}, "status": {"$nin": ["ended"]}}, {"_id": 1}).to_list(10000)}
    if doc.get("related_employee_id"):
        ids.add(doc["related_employee_id"])
    return list(ids)


async def _enrich(db, docs: List[dict]) -> List[dict]:
    unit_ids = {d.get("to_unit_id") for d in docs if d.get("to_unit_id") and ObjectId.is_valid(d["to_unit_id"])}
    units = {str(u["_id"]): u.get("name", "") for u in await db.org_units.find({"_id": {"$in": [ObjectId(i) for i in unit_ids]}}, {"name": 1}).to_list(2000)} if unit_ids else {}
    emp_ids = set()
    for d in docs:
        emp_ids |= set(d.get("to_employee_ids") or [])
        if d.get("related_employee_id"):
            emp_ids.add(d["related_employee_id"])
    emp_ids = {i for i in emp_ids if ObjectId.is_valid(i)}
    emps = {str(e["_id"]): e.get("full_name", "") for e in await db.employees.find({"_id": {"$in": [ObjectId(i) for i in emp_ids]}}, {"full_name": 1}).to_list(5000)} if emp_ids else {}
    for d in docs:
        d["direction_label"] = DIRECTIONS.get(d.get("direction"), d.get("direction"))
        d["priority_label"] = PRIORITIES.get(d.get("priority"), d.get("priority"))
        d["status_label"] = STATUSES.get(d.get("status"), d.get("status"))
        d["to_unit_name"] = units.get(d.get("to_unit_id") or "", "")
        d["to_employee_names"] = [emps.get(i, "") for i in (d.get("to_employee_ids") or []) if emps.get(i)]
        d["related_employee_name"] = emps.get(d.get("related_employee_id") or "", "")
        d["ack_count"] = len(d.get("acknowledgements") or [])
        d["overdue"] = bool(d.get("due_date")) and d["status"] not in ("closed", "archived") and d["due_date"] < _today()
    return docs


async def _dispatch(db, doc: dict, cid: str):
    """إشعار المستهدفين بالتعميم/المذكرة عند تسجيلها"""
    if doc.get("direction") not in ("internal", "circular") or doc.get("status") == "draft":
        return
    recips = await _recipients(db, doc)
    uids = list((await employee_user_ids(db, recips)).values())
    title = "تعميم جديد 📢" if doc["direction"] == "circular" else "مذكرة داخلية جديدة"
    await notify_users(db, uids, title, f"{doc['ref_no']} — {doc['subject']}", "hr_correspondence", {"correspondence_id": cid})
    await db.hr_correspondence.update_one({"_id": ObjectId(cid)}, {"$set": {"notified_at": _now(), "recipients_count": len(recips)}})


@router.get("/meta")
async def corr_meta(current_user: dict = Depends(get_current_user)):
    return {"directions": DIRECTIONS, "priorities": PRIORITIES, "statuses": STATUSES}


@router.get("/my")
async def my_correspondence(current_user: dict = Depends(get_current_user)):
    """👤 المراسلات الموجهة إليّ (تعاميم عامة، أو لوحدتي، أو إليّ باسمي)"""
    db = get_db()
    emp = await find_my_employee(db, current_user)
    if not emp:
        return {"items": []}
    eid = str(emp["_id"])
    unit_ids = set()
    cur = emp.get("org_unit_id")
    for _ in range(20):
        if not cur or not ObjectId.is_valid(cur):
            break
        unit_ids.add(cur)
        p = await db.org_units.find_one({"_id": ObjectId(cur)}, {"parent_id": 1})
        cur = (p or {}).get("parent_id")
    q = {"status": {"$nin": ["draft", "archived"]}, "direction": {"$in": ["internal", "circular"]},
         "$or": [{"to_all_employees": True}, {"to_employee_ids": eid}, {"related_employee_id": eid}, *([{"to_unit_id": {"$in": list(unit_ids)}}] if unit_ids else [])]}
    items = [_ser(c) for c in await db.hr_correspondence.find(q).sort("date", -1).limit(100).to_list(100)]
    for c in items:
        c["acknowledged"] = any(a.get("employee_id") == eid for a in c.get("acknowledgements") or [])
        c.pop("acknowledgements", None)
    return {"items": await _enrich(db, items)}


@router.post("/{corr_id}/ack")
async def acknowledge(corr_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    emp = await find_my_employee(db, current_user)
    if not emp:
        raise HTTPException(status_code=404, detail="لا يوجد ملف إداري مرتبط بحسابك")
    eid = str(emp["_id"])
    c = await db.hr_correspondence.find_one({"_id": _oid(corr_id)})
    if not c:
        raise HTTPException(status_code=404, detail="المراسلة غير موجودة")
    if any(a.get("employee_id") == eid for a in c.get("acknowledgements") or []):
        return {"message": "تم الإقرار بالاستلام سابقاً"}
    await db.hr_correspondence.update_one({"_id": c["_id"]}, {"$push": {"acknowledgements": {"employee_id": eid, "name": emp.get("full_name", ""), "at": _now()}}})
    return {"message": "تم تأكيد الاستلام"}


@router.get("")
async def list_corr(direction: Optional[str] = None, status: Optional[str] = None, priority: Optional[str] = None, search: Optional[str] = None,
                    year: Optional[int] = None, page: int = 1, per_page: int = 40, current_user: dict = Depends(get_current_user)):
    if not _can_view(current_user) and not has_permission(current_user, P_CORR):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_db()
    q: dict = {}
    if direction: q["direction"] = direction
    if status: q["status"] = {"$in": status.split(",")}
    if priority: q["priority"] = priority
    if year: q["date"] = {"$regex": f"^{year}"}
    if search:
        import re
        rx = {"$regex": re.escape(search.strip()), "$options": "i"}
        q["$or"] = [{"subject": rx}, {"ref_no": rx}, {"from_party": rx}, {"to_party": rx}, {"external_ref": rx}, {"body": rx}]
    total = await db.hr_correspondence.count_documents(q)
    per_page = max(1, min(per_page, 200))
    items = [_ser(c) for c in await db.hr_correspondence.find(q, {"body": 0, "acknowledgements": 0, "history": 0}).sort([("date", -1), ("created_at", -1)]).skip((page - 1) * per_page).limit(per_page).to_list(per_page)]
    y = str(datetime.now(YEMEN_TZ).year)
    stats = {"incoming": await db.hr_correspondence.count_documents({"direction": "incoming", "date": {"$regex": f"^{y}"}}),
             "outgoing": await db.hr_correspondence.count_documents({"direction": "outgoing", "date": {"$regex": f"^{y}"}}),
             "internal": await db.hr_correspondence.count_documents({"direction": {"$in": ["internal", "circular"]}, "date": {"$regex": f"^{y}"}}),
             "open": await db.hr_correspondence.count_documents({"status": {"$in": ["registered", "in_progress"]}}),
             "overdue": await db.hr_correspondence.count_documents({"status": {"$in": ["registered", "in_progress"]}, "due_date": {"$lt": _today(), "$ne": None}})}
    return {"items": await _enrich(db, items), "total": total, "page": page, "per_page": per_page, "stats": stats}


@router.post("")
async def create_corr(data: CorrIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_CORR)
    db = get_db()
    _validate(data)
    doc = {**data.dict(), "subject": data.subject.strip(), "date": data.date or _today(), "ref_no": await _next_ref(db, data.direction), "acknowledgements": [],
           "created_by_user_id": user_id_of(current_user), "created_by_name": current_user.get("full_name", ""), "created_at": _now(),
           "history": [{"action": "created", "status": data.status, "by_name": current_user.get("full_name", ""), "at": _now(), "note": ""}]}
    r = await db.hr_correspondence.insert_one(doc)
    cid = str(r.inserted_id)
    await _dispatch(db, doc, cid)
    await log_activity(current_user, "hr_corr_create", "correspondence", cid, doc["ref_no"], {"subject": doc["subject"]})
    return {"id": cid, "ref_no": doc["ref_no"], "message": f"تم تسجيل المراسلة برقم {doc['ref_no']}"}


@router.get("/{corr_id}")
async def get_corr(corr_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    c = await db.hr_correspondence.find_one({"_id": _oid(corr_id)})
    if not c:
        raise HTTPException(status_code=404, detail="المراسلة غير موجودة")
    if not (_can_view(current_user) or has_permission(current_user, P_CORR)):
        emp = await find_my_employee(db, current_user)
        eid = str(emp["_id"]) if emp else ""
        if not (c.get("to_all_employees") or eid in (c.get("to_employee_ids") or []) or c.get("related_employee_id") == eid):
            raise HTTPException(status_code=403, detail="غير مصرح")
    d = (await _enrich(db, [_ser(c)]))[0]
    return d


@router.put("/{corr_id}")
async def update_corr(corr_id: str, data: CorrIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_CORR)
    db = get_db()
    old = await db.hr_correspondence.find_one({"_id": _oid(corr_id)})
    if not old:
        raise HTTPException(status_code=404, detail="المراسلة غير موجودة")
    _validate(data)
    upd = {**data.dict(), "subject": data.subject.strip(), "date": data.date or old.get("date"), "direction": old["direction"], "updated_at": _now()}
    hist = {"action": "updated", "status": data.status, "by_name": current_user.get("full_name", ""), "at": _now(), "note": ""}
    await db.hr_correspondence.update_one({"_id": old["_id"]}, {"$set": upd, "$push": {"history": hist}})
    if old.get("status") == "draft" and data.status != "draft":
        await _dispatch(db, {**old, **upd}, corr_id)
    await log_activity(current_user, "hr_corr_update", "correspondence", corr_id, old.get("ref_no", ""))
    return {"message": "تم تحديث المراسلة"}


@router.post("/{corr_id}/status")
async def set_status(corr_id: str, data: StatusIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_CORR)
    db = get_db()
    if data.status not in STATUSES:
        raise HTTPException(status_code=400, detail="الحالة غير صحيحة")
    old = await db.hr_correspondence.find_one({"_id": _oid(corr_id)})
    if not old:
        raise HTTPException(status_code=404, detail="المراسلة غير موجودة")
    await db.hr_correspondence.update_one({"_id": old["_id"]}, {"$set": {"status": data.status, "updated_at": _now()}, "$push": {"history": {"action": "status", "status": data.status, "by_name": current_user.get("full_name", ""), "at": _now(), "note": (data.note or "").strip()}}})
    if old.get("status") == "draft" and data.status != "draft":
        await _dispatch(db, {**old, "status": data.status}, corr_id)
    return {"message": f"الحالة الآن: {STATUSES[data.status]}"}


@router.delete("/{corr_id}")
async def delete_corr(corr_id: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_CORR)
    db = get_db()
    c = await db.hr_correspondence.find_one({"_id": _oid(corr_id)})
    if not c:
        raise HTTPException(status_code=404, detail="المراسلة غير موجودة")
    if c.get("status") != "draft":
        raise HTTPException(status_code=400, detail="تُحذف المسودات فقط — أرشف المراسلة المسجّلة بدلاً من حذفها")
    await db.hr_correspondence.delete_one({"_id": c["_id"]})
    return {"message": "تم حذف المسودة"}
