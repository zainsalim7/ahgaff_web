"""📝 طلبات/نماذج الطلاب: أنواع قابلة للتعديل من الإعدادات (حقول + مرفقات + الكليات)، تصل كلها أولاً إلى مسجل الكلية — مع العزل حسب الكلية/القسم"""
import base64
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from .deps import get_current_user, get_db, has_permission, log_activity
from .hr_common import notify_users
from .student_excuses import _in_scope, _user_department_ids, _user_faculty_ids, _student_for
from models.permissions import Permission, UserRole
from services import storage_service

router = APIRouter(prefix="/student-requests", tags=["student-requests"])
FIELD_TYPES = {"text", "textarea", "number", "date", "select"}
STATUS_AR = {"pending": "قيد المراجعة", "needs_info": "مطلوب استكمال", "approved": "مقبول", "rejected": "مرفوض",
             "completed": "منجز / جاهز للاستلام", "cancelled": "ملغى"}
ACTIONS = {"approve": "approved", "reject": "rejected", "needs_info": "needs_info", "complete": "completed"}
MAX_FILES, MAX_SIZE = 3, 5 * 1024 * 1024
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
_MAGIC = {b"\xff\xd8\xff": "image/jpeg", b"\x89PNG": "image/png", b"RIFF": "image/webp", b"%PDF": "application/pdf"}
# نموذج مدمج: تبرير الغياب يبقى بمساره الحالي (/absence-excuses) ويظهر في «طلباتي»
ABSENCE_TYPE = {"id": "absence_excuse", "kind": "absence_excuse", "name": "تبرير غياب", "builtin": True, "is_active": True,
                "description": "اختر غياباتك داخل مهلة التبرير وأرفق العذر", "fields": [], "require_attachment": True, "faculty_ids": []}


def _now():
    return datetime.now(timezone(timedelta(hours=3))).isoformat()


def _oid(v: str) -> ObjectId:
    if not ObjectId.is_valid(v or ""):
        raise HTTPException(status_code=404, detail="غير موجود")
    return ObjectId(v)


def _can_manage(u: dict) -> bool:
    return has_permission(u, Permission.MANAGE_STUDENT_REQUESTS)


def _can_types(u: dict) -> bool:
    return has_permission(u, Permission.MANAGE_REQUEST_TYPES)


class FieldIn(BaseModel):
    key: Optional[str] = None
    label: str
    type: str = "text"
    required: bool = False
    options: List[str] = []


class TypeIn(BaseModel):
    name: str
    description: str = ""
    fields: List[FieldIn] = []
    require_attachment: bool = False
    attachment_label: str = ""
    faculty_ids: List[str] = []
    is_active: bool = True
    order: int = 0


class FileIn(BaseModel):
    name: str
    data_base64: str


class RequestIn(BaseModel):
    type_id: str
    values: Dict[str, Any] = {}
    notes: str = ""
    attachments: List[FileIn] = []


class ReplyIn(BaseModel):
    values: Dict[str, Any] = {}
    notes: str = ""
    attachments: List[FileIn] = []


class DecideIn(BaseModel):
    action: str
    note: str = ""


def _type_out(t: dict) -> dict:
    return {"id": str(t["_id"]), "name": t.get("name", ""), "description": t.get("description", ""), "fields": t.get("fields", []),
            "require_attachment": bool(t.get("require_attachment")), "attachment_label": t.get("attachment_label", ""),
            "faculty_ids": t.get("faculty_ids", []), "is_active": t.get("is_active", True), "order": t.get("order", 0), "kind": "form"}


def _clean_fields(fields: List[FieldIn]) -> list:
    out, seen = [], set()
    for i, f in enumerate(fields):
        if not f.label.strip():
            raise HTTPException(status_code=400, detail="كل حقل يحتاج اسماً")
        if f.type not in FIELD_TYPES:
            raise HTTPException(status_code=400, detail=f"نوع الحقل غير معروف: {f.type}")
        key = re.sub(r"\W+", "_", (f.key or f"f{i + 1}").strip()) or f"f{i + 1}"
        while key in seen:
            key += "_"
        seen.add(key)
        opts = [o.strip() for o in f.options if o.strip()]
        if f.type == "select" and not opts:
            raise HTTPException(status_code=400, detail=f"الحقل «{f.label}» يحتاج خيارات")
        out.append({"key": key, "label": f.label.strip(), "type": f.type, "required": f.required, "options": opts})
    return out


# ---------------- الأنواع (النماذج) ----------------
@router.get("/types")
async def list_types(all: bool = False, current_user: dict = Depends(get_current_user)):
    db = get_db()
    if all and _can_types(current_user):
        return {"items": [_type_out(t) async for t in db.request_types.find({}).sort([("order", 1), ("name", 1)])], "field_types": sorted(FIELD_TYPES)}
    q: dict = {"is_active": {"$ne": False}}
    if current_user["role"] == UserRole.STUDENT:
        st = await _student_for(db, current_user, None)
        q["$or"] = [{"faculty_ids": {"$size": 0}}, {"faculty_ids": {"$exists": False}}, {"faculty_ids": str(st.get("faculty_id") or "")}]
    items = [_type_out(t) async for t in db.request_types.find(q).sort([("order", 1), ("name", 1)])]
    return {"items": [ABSENCE_TYPE] + items if current_user["role"] == UserRole.STUDENT else items}


@router.post("/types")
async def create_type(data: TypeIn, current_user: dict = Depends(get_current_user)):
    if not _can_types(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="اسم النموذج مطلوب")
    doc = {**data.dict(), "name": data.name.strip(), "fields": _clean_fields(data.fields), "created_at": _now(), "created_by": current_user["id"]}
    tid = str((await get_db().request_types.insert_one(doc)).inserted_id)
    await log_activity(current_user, "create_request_type", "request_types", tid, doc["name"])
    return {"id": tid, "message": "تم إنشاء النموذج"}


@router.put("/types/{type_id}")
async def update_type(type_id: str, data: TypeIn, current_user: dict = Depends(get_current_user)):
    if not _can_types(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    upd = {**data.dict(), "name": data.name.strip(), "fields": _clean_fields(data.fields), "updated_at": _now()}
    r = await get_db().request_types.update_one({"_id": _oid(type_id)}, {"$set": upd})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="النموذج غير موجود")
    await log_activity(current_user, "update_request_type", "request_types", type_id, upd["name"])
    return {"message": "تم حفظ النموذج"}


@router.delete("/types/{type_id}")
async def delete_type(type_id: str, current_user: dict = Depends(get_current_user)):
    if not _can_types(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    used = await db.student_requests.count_documents({"type_id": type_id})
    if used:
        await db.request_types.update_one({"_id": _oid(type_id)}, {"$set": {"is_active": False}})
        return {"message": f"النموذج مستخدم في {used} طلب — تم إيقافه بدل حذفه"}
    await db.request_types.delete_one({"_id": _oid(type_id)})
    return {"message": "تم حذف النموذج"}


# ---------------- الطالب ----------------
def _validate_values(fields: list, values: dict) -> dict:
    out = {}
    for f in fields:
        v = values.get(f["key"])
        v = "" if v is None else str(v).strip()
        if f["required"] and not v:
            raise HTTPException(status_code=400, detail=f"الحقل «{f['label']}» مطلوب")
        if v and f["type"] == "select" and v not in f["options"]:
            raise HTTPException(status_code=400, detail=f"قيمة غير صحيحة في «{f['label']}»")
        if v and f["type"] == "number":
            try:
                float(v)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"«{f['label']}» يجب أن يكون رقماً")
        out[f["key"]] = v
    return out


def _upload(files: List[FileIn], ref: str) -> list:
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"الحد الأقصى {MAX_FILES} مرفقات")
    out = []
    for f in files:
        try:
            raw = base64.b64decode(f.data_base64.split(",", 1)[-1], validate=False)
        except Exception:
            raise HTTPException(status_code=400, detail=f"ملف غير صالح: {f.name}")
        if len(raw) > MAX_SIZE:
            raise HTTPException(status_code=400, detail=f"حجم الملف {f.name} يتجاوز 5 ميجابايت")
        mime = next((m for sig, m in _MAGIC.items() if raw.startswith(sig)), "")
        if mime not in ALLOWED_MIME:
            raise HTTPException(status_code=400, detail="نوع الملف غير مسموح (صور أو PDF فقط)")
        res = storage_service.upload_file(raw, f.name or f"{ref}.bin", mime, folder="student_requests")
        out.append({"path": res["storage_path"], "name": f.name, "size": res["size"], "mime": mime, "at": _now()})
    return out


def _serialize(d: dict, staff: bool = False) -> dict:
    out = {"id": str(d["_id"]), "ref_no": d.get("ref_no", ""), "type_id": d["type_id"], "type_name": d.get("type_name", ""),
           "fields": d.get("fields", []), "values": d.get("values", {}), "notes": d.get("notes", ""), "status": d["status"],
           "status_ar": STATUS_AR.get(d["status"], d["status"]), "last_note": d.get("last_note", ""),
           "attachments": [{"idx": i, "name": a.get("name"), "mime": a.get("mime"), "size": a.get("size")} for i, a in enumerate(d.get("attachments", []))],
           "created_at": d.get("created_at"), "updated_at": d.get("updated_at"), "history": d.get("history", [])}
    if staff:
        out.update({k: d.get(k, "") for k in ("student_db_id", "student_name", "student_no", "faculty_id", "faculty_name", "department_id",
                                                "department_name", "level", "section")})
    return out


async def _notify(db, doc: dict, title: str, msg: str):
    st = await db.students.find_one({"_id": ObjectId(doc["student_db_id"])}, {"user_id": 1})
    if st and st.get("user_id"):
        await notify_users(db, [st["user_id"]], title, msg, "student_request",
                           {"data": {"type": "student_request", "id": str(doc["_id"]), "route": "/student-requests", "status": doc["status"]}})


@router.post("")
async def create_request(data: RequestIn, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="تقديم الطلبات متاح للطلاب من التطبيق")
    db = get_db()
    st = await _student_for(db, current_user, None)
    t = await db.request_types.find_one({"_id": _oid(data.type_id), "is_active": {"$ne": False}})
    fac = str(st.get("faculty_id") or "")
    if not t or (t.get("faculty_ids") and fac not in t["faculty_ids"]):
        raise HTTPException(status_code=404, detail="النموذج غير متاح")
    values = _validate_values(t.get("fields", []), data.values)
    if t.get("require_attachment") and not data.attachments:
        raise HTTPException(status_code=400, detail=f"المرفق مطلوب{': ' + t['attachment_label'] if t.get('attachment_label') else ''}")
    n = await db.student_requests.count_documents({}) + 1
    ref = f"SR-{datetime.now().year}-{n:05d}"
    dep = await db.departments.find_one({"_id": ObjectId(st["department_id"])}, {"name": 1}) if ObjectId.is_valid(str(st.get("department_id") or "")) else None
    fdoc = await db.faculties.find_one({"_id": ObjectId(fac)}, {"name": 1}) if ObjectId.is_valid(fac) else None
    now = _now()
    doc = {"ref_no": ref, "type_id": data.type_id, "type_name": t["name"], "fields": t.get("fields", []), "values": values,
           "notes": data.notes.strip(), "attachments": _upload(data.attachments, ref), "status": "pending",
           "student_db_id": str(st["_id"]), "student_user_id": current_user["id"], "student_name": st.get("full_name", ""),
           "student_no": str(st.get("student_id") or ""), "faculty_id": fac, "faculty_name": (fdoc or {}).get("name", ""),
           "department_id": str(st.get("department_id") or ""), "department_name": (dep or {}).get("name", ""),
           "level": st.get("level"), "section": st.get("section", ""), "route": "registration",
           "created_at": now, "updated_at": now, "history": [{"action": "submit", "by_name": st.get("full_name", ""), "at": now}]}
    rid = str((await db.student_requests.insert_one(doc)).inserted_id)
    return {"id": rid, "ref_no": ref, "status": "pending", "message": "تم إرسال الطلب إلى مسجل الكلية"}


@router.get("/my")
async def my_requests(current_user: dict = Depends(get_current_user)):
    db = get_db()
    st = await _student_for(db, current_user, None)
    return {"items": [_serialize(d) async for d in db.student_requests.find({"student_db_id": str(st["_id"])}).sort("created_at", -1).limit(200)]}


async def _own(db, user: dict, rid: str) -> dict:
    doc = await db.student_requests.find_one({"_id": _oid(rid)})
    st = await _student_for(db, user, None)
    if not doc or doc["student_db_id"] != str(st["_id"]):
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    return doc


@router.post("/{rid}/cancel")
async def cancel_request(rid: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    doc = await _own(db, current_user, rid)
    if doc["status"] not in ("pending", "needs_info"):
        raise HTTPException(status_code=400, detail="لا يمكن إلغاء طلب تم البت فيه")
    await db.student_requests.update_one({"_id": doc["_id"]}, {"$set": {"status": "cancelled", "updated_at": _now()},
                                                               "$push": {"history": {"action": "cancel", "by_name": doc["student_name"], "at": _now()}}})
    return {"message": "تم إلغاء الطلب"}


@router.post("/{rid}/reply")
async def reply_request(rid: str, data: ReplyIn, current_user: dict = Depends(get_current_user)):
    """استكمال الطالب لطلب «مطلوب استكمال» — يعود إلى قيد المراجعة"""
    db = get_db()
    doc = await _own(db, current_user, rid)
    if doc["status"] != "needs_info":
        raise HTTPException(status_code=400, detail="الطلب لا يحتاج استكمالاً")
    values = {**doc.get("values", {}), **_validate_values(doc.get("fields", []), {**doc.get("values", {}), **data.values})}
    files = _upload(data.attachments, doc["ref_no"])
    if len(doc.get("attachments", [])) + len(files) > MAX_FILES + 3:
        raise HTTPException(status_code=400, detail="تجاوزت الحد الأقصى للمرفقات")
    now = _now()
    await db.student_requests.update_one({"_id": doc["_id"]}, {"$set": {"values": values, "status": "pending", "updated_at": now},
                                                               "$push": {"attachments": {"$each": files},
                                                                         "history": {"action": "reply", "by_name": doc["student_name"], "at": now, "note": data.notes.strip()}}})
    return {"message": "تم إرسال الاستكمال"}


# ---------------- المسجل / الإدارة ----------------
def _scope_filter(u: dict) -> dict:
    if u["role"] == UserRole.ADMIN:
        return {}
    if u["role"] == UserRole.DEPARTMENT_HEAD:
        return {"department_id": {"$in": _user_department_ids(u)}}
    fids = _user_faculty_ids(u)
    return {"faculty_id": {"$in": fids}} if fids else {}


@router.get("")
async def list_requests(status: Optional[str] = None, type_id: Optional[str] = None, faculty_id: Optional[str] = None,
                        department_id: Optional[str] = None, level: Optional[int] = None, q: Optional[str] = None,
                        current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    scope = _scope_filter(current_user)
    f: dict = {"status": {"$ne": "cancelled"}}
    if status:
        f["status"] = {"$in": status.split(",")}
    for k, v in (("type_id", type_id), ("faculty_id", faculty_id), ("department_id", department_id), ("level", level)):
        if v not in (None, ""):
            f[k] = v
    if q:
        rq = re.escape(q.strip())
        f["$or"] = [{"student_name": {"$regex": rq, "$options": "i"}}, {"student_no": {"$regex": rq}}, {"ref_no": {"$regex": rq, "$options": "i"}}]
    match = {"$and": [f, scope]} if scope else f
    docs = await db.student_requests.find(match, {"attachments.path": 0}).sort("created_at", -1).to_list(1000)
    counts = {}
    async for r in db.student_requests.aggregate([{"$match": scope or {}}, {"$group": {"_id": "$status", "n": {"$sum": 1}}}]):
        counts[r["_id"]] = r["n"]
    return {"items": [_serialize(d, staff=True) for d in docs], "counts": counts}


async def _staff_doc(db, u: dict, rid: str) -> dict:
    if not _can_manage(u):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    doc = await db.student_requests.find_one({"_id": _oid(rid)})
    if not doc or not _in_scope(u, doc):
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    return doc


@router.get("/{rid}")
async def get_request(rid: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    if current_user["role"] == UserRole.STUDENT:
        return _serialize(await _own(db, current_user, rid))
    return _serialize(await _staff_doc(db, current_user, rid), staff=True)


@router.post("/{rid}/decide")
async def decide_request(rid: str, data: DecideIn, current_user: dict = Depends(get_current_user)):
    db = get_db()
    doc = await _staff_doc(db, current_user, rid)
    if data.action not in ACTIONS:
        raise HTTPException(status_code=400, detail="إجراء غير معروف")
    if doc["status"] in ("cancelled", "rejected", "completed"):
        raise HTTPException(status_code=400, detail="تم إغلاق هذا الطلب")
    if data.action in ("reject", "needs_info") and not data.note.strip():
        raise HTTPException(status_code=400, detail="اكتب السبب أو المطلوب استكماله")
    new = ACTIONS[data.action]
    now = _now()
    await db.student_requests.update_one({"_id": doc["_id"]}, {"$set": {"status": new, "last_note": data.note.strip(), "updated_at": now,
                                                                        "decided_by": current_user["id"], "decided_by_name": current_user.get("full_name", "")},
                                                               "$push": {"history": {"action": data.action, "by_name": current_user.get("full_name", ""), "at": now, "note": data.note.strip()}}})
    doc["status"] = new
    msg = {"approved": f"تم قبول طلبك «{doc['type_name']}» ({doc['ref_no']})", "rejected": f"تم رفض طلبك «{doc['type_name']}»: {data.note.strip()}",
           "needs_info": f"طلبك «{doc['type_name']}» يحتاج استكمالاً: {data.note.strip()}", "completed": f"طلبك «{doc['type_name']}» منجز وجاهز"}[new]
    await _notify(db, doc, "📝 تحديث على طلبك", msg)
    await log_activity(current_user, f"student_request_{data.action}", "student_requests", rid, doc["ref_no"])
    return {"message": "تم الحفظ", "status": new, "status_ar": STATUS_AR[new]}


@router.get("/{rid}/attachments/{idx}")
async def get_attachment(rid: str, idx: int, current_user: dict = Depends(get_current_user)):
    db = get_db()
    doc = await (_own(db, current_user, rid) if current_user["role"] == UserRole.STUDENT else _staff_doc(db, current_user, rid))
    atts = doc.get("attachments", [])
    if not 0 <= idx < len(atts):
        raise HTTPException(status_code=404, detail="المرفق غير موجود")
    content, ctype = storage_service.get_object(atts[idx]["path"])
    return Response(content=content, media_type=atts[idx].get("mime") or ctype)
