"""📨 شؤون الموظفين — المراسلات: واردة / صادرة / مذكرات داخلية / تعاميم، بأرقام مرجعية وسجل حالات وإقرار استلام"""
import io
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from bson import ObjectId

from .deps import get_db, get_current_user, has_permission, log_activity
from .hr_common import (P_CORR, YEMEN_TZ, _now, _today, _oid, _ser, _can_view, _guard, parse_date, user_id_of, find_my_employee, employee_user_ids, notify_users)

router = APIRouter(prefix="/hr/correspondence", tags=["شؤون الموظفين - المراسلات"])

DIRECTIONS = {"incoming": "واردة", "outgoing": "صادرة", "internal": "مذكرة داخلية", "circular": "تعميم", "employee": "وارد من موظف"}
PREFIX = {"incoming": "IN", "outgoing": "OUT", "internal": "INT", "circular": "CIR", "employee": "EMP"}
PRIORITIES = {"normal": "عادية", "urgent": "عاجلة", "confidential": "سرية"}
STATUSES = {"draft": "مسودة", "registered": "مسجّلة", "in_progress": "قيد المعالجة", "replied": "تم الرد", "closed": "مُنجزة", "archived": "مؤرشفة"}
CATEGORIES = {"request": "طلب", "complaint": "شكوى", "inquiry": "استفسار", "suggestion": "اقتراح"}
EMP_STATUS = {"registered": "جديدة", "in_progress": "قيد المعالجة", "replied": "تم الرد", "closed": "مغلقة", "archived": "مؤرشفة"}
ATTACH_ALLOWED = {"application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
                  "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"}
ATTACH_MAX_MB = 8


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


class ReplyIn(BaseModel):
    body: str
    close: bool = False


async def _next_ref(db, direction: str) -> str:
    y = datetime.now(YEMEN_TZ).year
    key = f"hr_corr_{PREFIX[direction]}_{y}"
    c = await db.counters.find_one_and_update({"_id": key}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    return f"HR-{PREFIX[direction]}-{y}-{c['seq']:04d}"


def _validate(data: CorrIn):
    if data.direction not in DIRECTIONS:
        raise HTTPException(status_code=400, detail="نوع المراسلة غير صحيح")
    if data.direction == "employee":
        raise HTTPException(status_code=400, detail="مراسلات الموظفين تُسجَّل من بوابة الموظف فقط")
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
        for k in ("related_employee_id", "sender_employee_id"):
            if d.get(k):
                emp_ids.add(d[k])
    emp_ids = {i for i in emp_ids if ObjectId.is_valid(i)}
    emps = {str(e["_id"]): e.get("full_name", "") for e in await db.employees.find({"_id": {"$in": [ObjectId(i) for i in emp_ids]}}, {"full_name": 1}).to_list(5000)} if emp_ids else {}
    for d in docs:
        d["direction_label"] = DIRECTIONS.get(d.get("direction"), d.get("direction"))
        d["priority_label"] = PRIORITIES.get(d.get("priority"), d.get("priority"))
        d["status_label"] = STATUSES.get(d.get("status"), d.get("status"))
        d["to_unit_name"] = units.get(d.get("to_unit_id") or "", "")
        d["to_employee_names"] = [emps.get(i, "") for i in (d.get("to_employee_ids") or []) if emps.get(i)]
        d["related_employee_name"] = emps.get(d.get("related_employee_id") or "", "")
        d["sender_employee_name"] = emps.get(d.get("sender_employee_id") or "", "") or d.get("sender_name", "")
        d["category_label"] = CATEGORIES.get(d.get("category") or "", "")
        d["employee_status_label"] = EMP_STATUS.get(d.get("status"), d.get("status_label"))
        d["replies_count"] = len(d.get("replies") or [])
        d["has_attachment"] = bool(d.get("attachment_path"))
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
    return {"directions": DIRECTIONS, "priorities": PRIORITIES, "statuses": STATUSES, "categories": CATEGORIES, "employee_statuses": EMP_STATUS}


def _my_view(c: dict) -> dict:
    c.pop("acknowledgements", None)
    c.pop("history", None)
    return c


@router.get("/my/sent")
async def my_sent(current_user: dict = Depends(get_current_user)):
    """👤 مراسلاتي إلى الإدارة (طلبات/شكاوى/استفسارات/اقتراحات) مع الردود والحالة"""
    db = get_db()
    emp = await find_my_employee(db, current_user)
    if not emp:
        return {"profile": None, "items": [], "categories": CATEGORIES, "stats": {}}
    eid = str(emp["_id"])
    items = [_my_view(_ser(c)) for c in await db.hr_correspondence.find({"direction": "employee", "sender_employee_id": eid}).sort("created_at", -1).limit(200).to_list(200)]
    items = await _enrich(db, items)
    stats = {"total": len(items), "open": sum(1 for c in items if c["status"] in ("registered", "in_progress")),
             "replied": sum(1 for c in items if c["status"] == "replied"), "closed": sum(1 for c in items if c["status"] in ("closed", "archived"))}
    return {"profile": {"id": eid, "full_name": emp.get("full_name", "")}, "items": items, "categories": CATEGORIES, "stats": stats}


@router.post("/my/send")
async def my_send(subject: str = Form(...), category: str = Form("request"), body: str = Form(""), priority: str = Form("normal"),
                  file: Optional[UploadFile] = File(None), current_user: dict = Depends(get_current_user)):
    """👤 الموظف يرسل مراسلة إلى شؤون الموظفين (مع مرفق اختياري)"""
    db = get_db()
    emp = await find_my_employee(db, current_user)
    if not emp:
        raise HTTPException(status_code=404, detail="لا يوجد ملف إداري مرتبط بحسابك")
    if not subject.strip():
        raise HTTPException(status_code=400, detail="موضوع المراسلة مطلوب")
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="نوع المراسلة غير صحيح")
    if priority not in ("normal", "urgent"):
        raise HTTPException(status_code=400, detail="الأولوية غير صحيحة")
    attach = {}
    if file is not None and file.filename:
        if file.content_type not in ATTACH_ALLOWED:
            raise HTTPException(status_code=400, detail="صيغة المرفق غير مدعومة (PDF / صورة / Word)")
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="المرفق فارغ")
        if len(data) > ATTACH_MAX_MB * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"حجم المرفق يتجاوز {ATTACH_MAX_MB}MB")
        from services.storage_service import upload_file
        stored = upload_file(data, file.filename, file.content_type, f"hr_correspondence/{emp['_id']}")
        attach = {"attachment_path": stored["storage_path"], "attachment_name": stored["original_filename"], "attachment_type": file.content_type, "attachment_size": stored["size"]}
    eid = str(emp["_id"])
    now = _now()
    doc = {"direction": "employee", "subject": subject.strip(), "body": (body or "").strip(), "category": category, "priority": priority, "status": "registered", "date": _today(),
           "ref_no": await _next_ref(db, "employee"), "sender_employee_id": eid, "sender_name": emp.get("full_name", ""), "sender_user_id": user_id_of(current_user),
           "from_party": emp.get("full_name", ""), "to_party": "شؤون الموظفين", "related_employee_id": eid, "to_employee_ids": [], "to_all_employees": False, "tags": [], "replies": [],
           "acknowledgements": [], "created_by_user_id": user_id_of(current_user), "created_by_name": current_user.get("full_name", ""), "created_at": now,
           "history": [{"action": "created", "status": "registered", "by_name": emp.get("full_name", ""), "at": now, "note": ""}], **attach}
    r = await db.hr_correspondence.insert_one(doc)
    cid = str(r.inserted_id)
    from .hr_common import hr_manager_user_ids
    await notify_users(db, await hr_manager_user_ids(db, P_CORR), f"مراسلة جديدة من موظف ({CATEGORIES[category]})", f"{doc['ref_no']} — {emp.get('full_name', '')}: {doc['subject']}", "hr_correspondence", {"correspondence_id": cid})
    await log_activity(current_user, "hr_corr_employee_send", "correspondence", cid, doc["ref_no"], {"subject": doc["subject"], "category": category})
    return {"id": cid, "ref_no": doc["ref_no"], "message": f"تم إرسال مراسلتك برقم {doc['ref_no']}"}


@router.get("/{corr_id}/attachment")
async def corr_attachment(corr_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    c = await db.hr_correspondence.find_one({"_id": _oid(corr_id)})
    if not c or not c.get("attachment_path"):
        raise HTTPException(status_code=404, detail="لا يوجد مرفق")
    if not (_can_view(current_user) or has_permission(current_user, P_CORR)):
        emp = await find_my_employee(db, current_user)
        if not emp or c.get("sender_employee_id") != str(emp["_id"]):
            raise HTTPException(status_code=403, detail="غير مصرح")
    from services.storage_service import get_object
    try:
        data, ct = get_object(c["attachment_path"])
    except Exception:
        raise HTTPException(status_code=404, detail="تعذّر جلب المرفق من التخزين")
    from urllib.parse import quote
    return StreamingResponse(io.BytesIO(data), media_type=c.get("attachment_type") or ct, headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(c.get('attachment_name') or 'attachment')}"})


@router.post("/{corr_id}/reply")
async def reply_corr(corr_id: str, data: ReplyIn, current_user: dict = Depends(get_current_user)):
    """📨 ردّ شؤون الموظفين على مراسلة موظف — يُشعَر الموظف ويراه في بوابته"""
    _guard(current_user, P_CORR)
    db = get_db()
    c = await db.hr_correspondence.find_one({"_id": _oid(corr_id)})
    if not c:
        raise HTTPException(status_code=404, detail="المراسلة غير موجودة")
    if c.get("direction") != "employee":
        raise HTTPException(status_code=400, detail="الردّ متاح على مراسلات الموظفين فقط")
    body = (data.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="نص الرد مطلوب")
    now = _now()
    status = "closed" if data.close else "replied"
    reply = {"body": body, "by_name": current_user.get("full_name", ""), "by_user_id": user_id_of(current_user), "at": now}
    await db.hr_correspondence.update_one({"_id": c["_id"]}, {"$set": {"status": status, "updated_at": now}, "$push": {"replies": reply, "history": {"action": "reply", "status": status, "by_name": reply["by_name"], "at": now, "note": body[:120]}}})
    uid = c.get("sender_user_id") or (await employee_user_ids(db, [c.get("sender_employee_id") or ""])).get(c.get("sender_employee_id") or "")
    if uid:
        await notify_users(db, [uid], "ردّ من شؤون الموظفين 📨", f"{c['ref_no']} — {c['subject']}: {body[:100]}", "hr_correspondence", {"correspondence_id": corr_id})
    await log_activity(current_user, "hr_corr_reply", "correspondence", corr_id, c.get("ref_no", ""))
    return {"message": "تم إرسال الرد للموظف" + (" وإغلاق المراسلة" if data.close else "")}


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
                    year: Optional[int] = None, overdue: bool = False, page: int = 1, per_page: int = 40, current_user: dict = Depends(get_current_user)):
    if not _can_view(current_user) and not has_permission(current_user, P_CORR):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_db()
    q: dict = {}
    if direction: q["direction"] = direction
    if status: q["status"] = {"$in": status.split(",")}
    if priority: q["priority"] = priority
    if year: q["date"] = {"$regex": f"^{year}"}
    if overdue:
        q["status"] = {"$in": ["registered", "in_progress"]}
        q["due_date"] = {"$lt": _today(), "$ne": None}
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
             "employee": await db.hr_correspondence.count_documents({"direction": "employee", "date": {"$regex": f"^{y}"}}),
             "employee_open": await db.hr_correspondence.count_documents({"direction": "employee", "status": {"$in": ["registered", "in_progress"]}}),
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
        if not (c.get("to_all_employees") or eid in (c.get("to_employee_ids") or []) or c.get("related_employee_id") == eid or c.get("sender_employee_id") == eid):
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
    if old.get("direction") == "employee" and old.get("sender_user_id") and data.status != old.get("status"):
        await notify_users(db, [old["sender_user_id"]], "تحديث حالة مراسلتك", f"{old['ref_no']} — {old['subject']}: {EMP_STATUS.get(data.status, STATUSES[data.status])}", "hr_correspondence", {"correspondence_id": corr_id})
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
