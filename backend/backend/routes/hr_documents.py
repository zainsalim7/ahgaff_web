"""📁 شؤون الموظفين — مستندات الموظف (عقود، هويات، شهادات…) على التخزين الكائني مع تذكير بالانتهاء"""
import io
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from bson import ObjectId

from .deps import get_db, get_current_user, has_permission, log_activity
from .hr_common import P_MANAGE, YEMEN_TZ, _now, _today, _oid, _ser, _can_view, _guard, parse_date, find_my_employee, enrich_employee_refs

router = APIRouter(prefix="/hr/documents", tags=["شؤون الموظفين - المستندات"])

DOC_TYPES = {"contract": "عقد عمل", "national_id": "بطاقة شخصية", "passport": "جواز سفر", "residency": "إقامة / تصريح عمل", "certificate": "شهادة علمية", "cv": "السيرة الذاتية",
             "medical": "تقرير طبي / لياقة", "decision": "قرار إداري", "other": "أخرى"}
ALLOWED = {"application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
           "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", "application/msword": "doc"}
MAX_MB = 10


class DocMetaIn(BaseModel):
    type: str
    title: Optional[str] = ""
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    notes: Optional[str] = ""


def _view(d: dict) -> dict:
    d = _ser(d)
    d["type_label"] = DOC_TYPES.get(d.get("type"), d.get("type"))
    if d.get("expiry_date"):
        days = (parse_date(d["expiry_date"]) - datetime.now(YEMEN_TZ).date()).days
        d["days_to_expiry"] = days
        d["expiry_state"] = "expired" if days < 0 else "soon" if days <= 60 else "ok"
    else:
        d["days_to_expiry"], d["expiry_state"] = None, None
    d.pop("storage_path", None)
    return d


async def _can_read(db, user: dict, employee_id: str) -> bool:
    if _can_view(user):
        return True
    me = await find_my_employee(db, user)
    return bool(me) and str(me["_id"]) == employee_id


@router.get("/meta")
async def docs_meta(current_user: dict = Depends(get_current_user)):
    return {"types": DOC_TYPES, "max_mb": MAX_MB, "allowed": list(ALLOWED.keys())}


@router.get("/expiring")
async def expiring(days: int = 60, current_user: dict = Depends(get_current_user)):
    if not _can_view(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_db()
    limit = (datetime.now(YEMEN_TZ).date() + timedelta(days=days)).strftime("%Y-%m-%d")
    items = [_view(d) for d in await db.hr_documents.find({"expiry_date": {"$ne": None, "$lte": limit}}).sort("expiry_date", 1).to_list(500)]
    return {"items": await enrich_employee_refs(db, items), "days": days}


@router.get("/my")
async def my_docs(current_user: dict = Depends(get_current_user)):
    db = get_db()
    me = await find_my_employee(db, current_user)
    if not me:
        return {"items": []}
    return {"items": [_view(d) for d in await db.hr_documents.find({"employee_id": str(me["_id"])}).sort("created_at", -1).to_list(200)]}


@router.get("/file/{doc_id}")
async def download(doc_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    d = await db.hr_documents.find_one({"_id": _oid(doc_id)})
    if not d:
        raise HTTPException(status_code=404, detail="المستند غير موجود")
    if not await _can_read(db, current_user, d["employee_id"]):
        raise HTTPException(status_code=403, detail="غير مصرح")
    from services.storage_service import get_object
    try:
        data, ct = get_object(d["storage_path"])
    except Exception:
        raise HTTPException(status_code=404, detail="تعذّر جلب الملف من التخزين")
    from urllib.parse import quote
    fname = d.get("original_filename") or f"document.{ALLOWED.get(d.get('content_type'), 'bin')}"
    return StreamingResponse(io.BytesIO(data), media_type=d.get("content_type") or ct, headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(fname)}"})


@router.get("/{employee_id}")
async def list_docs(employee_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    _oid(employee_id, "الموظف")
    if not await _can_read(db, current_user, employee_id):
        raise HTTPException(status_code=403, detail="غير مصرح")
    items = [_view(d) for d in await db.hr_documents.find({"employee_id": employee_id}).sort("created_at", -1).to_list(200)]
    return {"items": items, "types": DOC_TYPES}


@router.post("/{employee_id}")
async def upload_doc(employee_id: str, file: UploadFile = File(...), type: str = Form("other"), title: str = Form(""), issue_date: str = Form(""),
                     expiry_date: str = Form(""), notes: str = Form(""), current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_MANAGE)
    db = get_db()
    emp = await db.employees.find_one({"_id": _oid(employee_id, "الموظف")}, {"full_name": 1})
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    if type not in DOC_TYPES:
        raise HTTPException(status_code=400, detail="نوع المستند غير صحيح")
    if file.content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="صيغة الملف غير مدعومة (PDF / صورة / Word)")
    data = await file.read()
    if len(data) > MAX_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"حجم الملف يتجاوز {MAX_MB}MB")
    if not data:
        raise HTTPException(status_code=400, detail="الملف فارغ")
    for f, label in ((issue_date, "تاريخ الإصدار"), (expiry_date, "تاريخ الانتهاء")):
        if f:
            parse_date(f, label)
    from services.storage_service import upload_file
    stored = upload_file(data, file.filename or f"doc.{ALLOWED[file.content_type]}", file.content_type, f"hr_documents/{employee_id}")
    doc = {"employee_id": employee_id, "type": type, "title": (title or DOC_TYPES[type]).strip(), "storage_path": stored["storage_path"], "original_filename": stored["original_filename"],
           "content_type": file.content_type, "size": stored["size"], "issue_date": issue_date or None, "expiry_date": expiry_date or None, "notes": (notes or "").strip(),
           "uploaded_by_name": current_user.get("full_name", ""), "created_at": _now()}
    r = await db.hr_documents.insert_one(doc)
    await log_activity(current_user, "hr_doc_upload", "employee", employee_id, emp.get("full_name", ""), {"type": type, "title": doc["title"]})
    doc["_id"] = r.inserted_id
    return {"id": str(r.inserted_id), "document": _view(doc), "message": "تم رفع المستند"}


@router.put("/{doc_id}")
async def update_doc(doc_id: str, data: DocMetaIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_MANAGE)
    db = get_db()
    d = await db.hr_documents.find_one({"_id": _oid(doc_id)})
    if not d:
        raise HTTPException(status_code=404, detail="المستند غير موجود")
    if data.type not in DOC_TYPES:
        raise HTTPException(status_code=400, detail="نوع المستند غير صحيح")
    for f, label in ((data.issue_date, "تاريخ الإصدار"), (data.expiry_date, "تاريخ الانتهاء")):
        if f:
            parse_date(f, label)
    await db.hr_documents.update_one({"_id": d["_id"]}, {"$set": {"type": data.type, "title": (data.title or DOC_TYPES[data.type]).strip(), "issue_date": data.issue_date or None, "expiry_date": data.expiry_date or None, "notes": (data.notes or "").strip(), "updated_at": _now()}})
    return {"message": "تم تحديث بيانات المستند"}


@router.delete("/{doc_id}")
async def delete_doc(doc_id: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_MANAGE)
    db = get_db()
    d = await db.hr_documents.find_one({"_id": _oid(doc_id)})
    if not d:
        raise HTTPException(status_code=404, detail="المستند غير موجود")
    await db.hr_documents.delete_one({"_id": d["_id"]})
    await log_activity(current_user, "hr_doc_delete", "employee", d["employee_id"], "", {"title": d.get("title")})
    return {"message": "تم حذف المستند"}


async def documents_expiring_alerts(db, notify_users, employee_user_ids) -> int:
    """تذكير الموظف (ومرة واحدة شهرياً لكل مستند) بمستند ينتهي خلال 30 يوماً أو انتهى"""
    limit = (datetime.now(YEMEN_TZ).date() + timedelta(days=30)).strftime("%Y-%m-%d")
    month = _today()[:7]
    docs = await db.hr_documents.find({"expiry_date": {"$ne": None, "$lte": limit}}).to_list(1000)
    uids = await employee_user_ids(db, [d["employee_id"] for d in docs])
    n = 0
    for d in docs:
        key = f"doc_exp_{d['_id']}_{month}"
        if (await db.hr_alert_state.update_one({"_id": key}, {"$setOnInsert": {"at": _now()}}, upsert=True)).upserted_id is None:
            continue
        u = uids.get(d["employee_id"])
        if u:
            expired = d["expiry_date"] < _today()
            await notify_users(db, [u], "مستند منتهٍ ⚠️" if expired else "مستند يقترب من الانتهاء", f"{DOC_TYPES.get(d['type'], '')} — {d.get('title', '')} ({'انتهى' if expired else 'ينتهي'} {d['expiry_date']}) — يرجى تجديده وتسليمه لشؤون الموظفين", "hr_document", {"document_id": str(d["_id"])})
            n += 1
    return n
