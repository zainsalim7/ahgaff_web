"""📱 تبرير غياب الطلاب من التطبيق — طبقة مبسطة فوق مسار أعذار الطلاب (student_excuses): غيابات محددة خلال مهلة + صورة عذر base64"""
import base64
import re
from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .deps import get_current_user, get_db, log_activity
from .hr_common import notify_users
from .student_excuses import (EXCUSE_TYPES, ROUTES, STATUS, _now, _reviewer_ids, _student_for, route_for, serialize)
from models.permissions import UserRole
from services import storage_service

router = APIRouter(prefix="/absence-excuses", tags=["absence-excuses"])
DEFAULT_WINDOW_DAYS = 3
MAX_IMAGE_BYTES = 2 * 1024 * 1024
_MAGIC = {b"\xff\xd8\xff": ("image/jpeg", "jpg"), b"\x89PNG": ("image/png", "png"), b"RIFF": ("image/webp", "webp"), b"%PDF": ("application/pdf", "pdf")}


class ExcuseIn(BaseModel):
    message: str
    image_base64: str
    record_ids: List[str]
    excuse_type: Optional[str] = "sick"


def _decode_image(b64: str) -> tuple:
    raw = (b64 or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="إرفاق صورة العذر إجباري")
    raw = re.sub(r"^data:[^;]+;base64,", "", raw)
    try:
        data = base64.b64decode(raw, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="صورة العذر غير صالحة")
    if len(data) < 100:
        raise HTTPException(status_code=400, detail="إرفاق صورة العذر إجباري")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="حجم صورة العذر يتجاوز 2 ميجابايت")
    for magic, (mime, ext) in _MAGIC.items():
        if data.startswith(magic):
            return data, mime, ext
    raise HTTPException(status_code=400, detail="نوع الصورة غير مدعوم (JPG/PNG/WebP/PDF)")


async def window_days(db, student: dict) -> int:
    dept = await db.departments.find_one({"_id": ObjectId(student["department_id"])}, {"faculty_id": 1}) if ObjectId.is_valid(student.get("department_id") or "") else None
    fac = await db.faculties.find_one({"_id": ObjectId(dept["faculty_id"])}, {"excuse_window_days": 1}) if dept and ObjectId.is_valid(dept.get("faculty_id") or "") else None
    try:
        return int((fac or {}).get("excuse_window_days") or DEFAULT_WINDOW_DAYS)
    except (TypeError, ValueError):
        return DEFAULT_WINDOW_DAYS


async def _student(db, user: dict) -> dict:
    if user["role"] != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="هذه الخدمة للطلاب")
    return await _student_for(db, user, None)


def _item(rec: dict, lec: dict, cname: str) -> dict:
    return {"record_id": str(rec["_id"]), "lecture_id": rec.get("lecture_id"), "course_id": rec.get("course_id"), "course_name": cname, "date": lec.get("date", ""), "start_time": lec.get("start_time")}


async def _absent_records(db, sid: str, days: int):
    """سجلات غياب الطالب مع المحاضرة واسم المقرر وعلم القابلية للتبرير"""
    today = _now().date()
    recs = await db.attendance.find({"student_id": sid, "status": "absent"}).to_list(2000)
    lecs = {str(l["_id"]): l for l in await db.lectures.find({"_id": {"$in": [ObjectId(r["lecture_id"]) for r in recs if ObjectId.is_valid(r.get("lecture_id") or "")]}}, {"date": 1, "start_time": 1, "course_id": 1}).to_list(2000)}
    cids = {r.get("course_id") for r in recs if ObjectId.is_valid(r.get("course_id") or "")}
    names = {str(c["_id"]): c.get("name", "") for c in await db.courses.find({"_id": {"$in": [ObjectId(c) for c in cids]}}, {"name": 1}).to_list(500)} if cids else {}
    used = {}
    async for d in db.student_excuses.find({"student_db_id": sid, "status": {"$in": ["pending", "approved", "needs_info"]}, "items.record_id": {"$exists": True}}, {"items.record_id": 1, "ref_no": 1, "status": 1}):
        for it in d.get("items", []):
            used[it["record_id"]] = d
    out = []
    for r in recs:
        lec = lecs.get(r.get("lecture_id") or "")
        if not lec or not lec.get("date"):
            continue
        it = _item(r, lec, names.get(r.get("course_id"), ""))
        try:
            age = (today - datetime.strptime(lec["date"], "%Y-%m-%d").date()).days
        except ValueError:
            continue
        prev = used.get(it["record_id"])
        it.update({"age_days": age, "in_window": age <= days,
                   "existing_request": {"ref_no": prev.get("ref_no"), "status": prev["status"]} if prev else None,
                   "can_excuse": age <= days and not prev})
        out.append(it)
    out.sort(key=lambda x: (x["date"], x.get("start_time") or ""), reverse=True)
    return out


def _my_row(d: dict) -> dict:
    return {"id": str(d["_id"]), "ref_no": d.get("ref_no"), "message": d.get("description", ""), "status": d["status"], "status_label": STATUS.get(d["status"], d["status"]),
            "route_label": ROUTES.get(d.get("route"), ""), "reject_reason": d.get("decision_note") if d["status"] == "rejected" else None,
            "decision_note": d.get("decision_note") or None, "created_at": d.get("created_at"), "reviewed_at": d.get("decided_at"), "reviewed_by": d.get("decided_by_name"),
            "items": [{"record_id": i["record_id"], "course_id": i.get("course_id"), "course_name": i.get("course_name"), "date": i.get("date")} for i in d.get("items", [])]}


@router.get("/meta")
async def meta(current_user: dict = Depends(get_current_user)):
    db = get_db()
    st = await _student(db, current_user)
    return {"window_days": await window_days(db, st), "max_image_bytes": MAX_IMAGE_BYTES, "excuse_types": [{"key": k, "label": v} for k, v in EXCUSE_TYPES.items()]}


@router.get("/eligible")
async def eligible(current_user: dict = Depends(get_current_user)):
    """غيابات الطالب القابلة للتبرير (داخل المهلة وبلا طلب سابق) مع غير القابلة وسببها"""
    db = get_db()
    st = await _student(db, current_user)
    days = await window_days(db, st)
    items = await _absent_records(db, str(st["_id"]), days)
    return {"window_days": days, "items": items, "eligible_count": sum(1 for i in items if i["can_excuse"])}


@router.post("")
async def create(data: ExcuseIn, current_user: dict = Depends(get_current_user)):
    db = get_db()
    st = await _student(db, current_user)
    sid = str(st["_id"])
    message = (data.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="اكتب سبب الغياب")
    excuse_type = data.excuse_type or "sick"
    if excuse_type not in EXCUSE_TYPES:
        raise HTTPException(status_code=400, detail="نوع العذر غير صالح")
    ids = list(dict.fromkeys((data.record_ids or [])))
    if not ids:
        raise HTTPException(status_code=400, detail="اختر غياباً واحداً على الأقل")
    img, mime, ext = _decode_image(data.image_base64)
    days = await window_days(db, st)
    all_items = {i["record_id"]: i for i in await _absent_records(db, sid, days)}
    items = []
    for rid in ids:
        it = all_items.get(rid)
        if not it:
            raise HTTPException(status_code=400, detail="أحد سجلات الغياب غير موجود أو لا يخصك أو ليس غياباً")
        if it["existing_request"]:
            raise HTTPException(status_code=400, detail=f"يوجد طلب سابق لهذا الغياب ({it['course_name']} — {it['date']}، رقم {it['existing_request']['ref_no']})")
        if not it["in_window"]:
            raise HTTPException(status_code=400, detail=f"انتهت مهلة التبرير ({days} أيام) لغياب {it['course_name']} بتاريخ {it['date']}")
        items.append({k: it[k] for k in ("record_id", "lecture_id", "course_id", "course_name", "date", "start_time")})
    res_up = storage_service.upload_file(img, f"excuse.{ext}", mime, folder="student_excuses")
    attachments = [{"path": res_up["storage_path"], "name": f"صورة العذر.{ext}", "size": res_up["size"], "mime": mime}]
    dates = sorted(i["date"] for i in items)
    from_date, to_date = dates[0], dates[-1]
    span = (datetime.strptime(to_date, "%Y-%m-%d") - datetime.strptime(from_date, "%Y-%m-%d")).days + 1
    dept = await db.departments.find_one({"_id": ObjectId(st["department_id"])}) if ObjectId.is_valid(st.get("department_id") or "") else None
    fac = await db.faculties.find_one({"_id": ObjectId(dept["faculty_id"])}, {"name": 1}) if dept and ObjectId.is_valid(dept.get("faculty_id") or "") else None
    now = _now()
    seq = await db.student_excuses.count_documents({}) + 1
    route = route_for(excuse_type, span)
    course_ids = {i["course_id"] for i in items}
    doc = {
        "ref_no": f"SE-{now.year}-{seq:04d}", "source": "app", "student_db_id": sid, "student_no": st.get("student_id"), "student_name": st.get("full_name"),
        "level": st.get("level"), "section": st.get("section"), "department_id": st.get("department_id"), "department_name": (dept or {}).get("name"),
        "faculty_id": (dept or {}).get("faculty_id"), "faculty_name": (fac or {}).get("name"),
        "excuse_type": excuse_type, "from_date": from_date, "to_date": to_date, "days": span,
        "course_id": items[0]["course_id"] if len(course_ids) == 1 else None, "course_name": items[0]["course_name"] if len(course_ids) == 1 else None,
        "description": message, "attachments": attachments, "items": items,
        "route": route, "status": "pending", "submitted_by": current_user["id"], "submitted_by_name": current_user.get("full_name"), "submitted_by_role": "student",
        "history": [{"at": now.isoformat(), "by_name": current_user.get("full_name"), "action": "submitted", "note": f"من التطبيق — {len(items)} غياب — وُجّه إلى {ROUTES[route]}"}],
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
    }
    res = await db.student_excuses.insert_one(doc)
    doc["_id"] = res.inserted_id
    names = "، ".join(sorted({i["course_name"] for i in items if i["course_name"]}))
    await notify_users(db, await _reviewer_ids(db, doc), "طلب تبرير غياب جديد (من التطبيق)",
                       f"{st.get('full_name')} — {len(items)} غياب ({names}) — موجَّه إلى {ROUTES[route]}",
                       "student_excuse", {"data": {"type": "student_excuse", "id": str(res.inserted_id)}})
    await log_activity(current_user, "student_excuse_create", "student_excuse", str(res.inserted_id), doc["ref_no"], {"route": route, "source": "app", "items": len(items)})
    return {"message": f"تم إرسال طلب التبرير ({len(items)} غياب) إلى {ROUTES[route]}", "id": str(res.inserted_id), "ref_no": doc["ref_no"], "request": _my_row(doc), "full": serialize(doc)}


@router.get("/my")
async def my(current_user: dict = Depends(get_current_user)):
    db = get_db()
    st = await _student(db, current_user)
    docs = await db.student_excuses.find({"student_db_id": str(st["_id"]), "source": "app"}).sort("created_at", -1).to_list(300)
    return [_my_row(d) for d in docs]
