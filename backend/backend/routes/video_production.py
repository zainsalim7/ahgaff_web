"""🎬 عقود الإنتاج المرئي: عقد المعلم وبنوده ومستحقاته + حجز الأستوديوهات ومسيرة تسجيل كل جزء (تصوير ← مونتاج ← سحابة ← منصة)
مستقل تماماً عن المحاضرات/النصاب/الحضور — يأخذ بيانات المعلم فقط. العزل حسب الكلية/القسم."""
import re
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from .deps import get_current_user, get_db, has_permission, log_activity
from .hr_common import notify_users
from .lecture_swaps import _teacher_user_ids
from .student_excuses import _in_scope, _user_department_ids, _user_faculty_ids
from models.permissions import Permission, UserRole

router = APIRouter(prefix="/video-production", tags=["video-production"])
TZ = timezone(timedelta(hours=3))
C_STATUS = {"draft": "مسودة", "issued": "معتمد / ساري", "completed": "منتهٍ", "terminated": "ملغى"}
S_STATUS = {"requested": "طلب حجز", "confirmed": "حجز مؤكد", "filmed": "تم التصوير", "editing": "قيد المونتاج",
            "cloud": "مرفوع للسحابة", "published": "منشور على المنصة", "rejected": "مرفوض", "cancelled": "ملغى"}
PIPE = ["requested", "confirmed", "filmed", "editing", "cloud", "published"]
DONE = {"filmed", "editing", "cloud", "published"}
BUSY = {"confirmed", "filmed", "editing", "cloud", "published"}
ITEM_STATUS = {"pending": "لم يُسلَّم", "delivered": "مُسلَّم — بانتظار القبول", "accepted": "مقبول"}
DEFAULT_ITEMS = [
    {"key": "spec", "name": "توصيف المادة العلمية", "amount": 50000, "kind": "fixed"},
    {"key": "content", "name": "إعداد المحتوى العلمي وشرائح العرض", "amount": 100000, "kind": "fixed"},
    {"key": "recording", "name": "التسجيل المرئي للمحاضرات", "amount": 250000, "kind": "recording"},
    {"key": "qbank", "name": "إعداد بنك الأسئلة (250 سؤالاً على الأقل)", "amount": 50000, "kind": "fixed"},
]
DEFAULT_SETTINGS = {"studios": [], "min_notice_hours": 2, "max_part_minutes": 30, "stall_days": 3,
                    "first_party_org": "كلية التعليم عن بعد جامعة الأحقاف", "first_party_name": "", "first_party_title": "القائم بأعمال العميد",
                    "default_duration_days": 60, "currency": "ريال يمني", "default_items": DEFAULT_ITEMS}


def _now():
    return datetime.now(TZ)


def _oid(v: str) -> ObjectId:
    if not ObjectId.is_valid(v or ""):
        raise HTTPException(status_code=404, detail="غير موجود")
    return ObjectId(v)


def _p(u, perm) -> bool:
    return has_permission(u, perm)


def _staff(u) -> bool:
    return any(_p(u, x) for x in (Permission.VP_VIEW, Permission.VP_MANAGE_CONTRACTS, Permission.VP_STUDIO, Permission.VP_PAYMENTS))


def _need(u, *perms):
    if not any(_p(u, x) for x in perms):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لهذا الإجراء")


def _scope_q(u) -> dict:
    if u["role"] == UserRole.ADMIN:
        return {}
    if u["role"] == UserRole.DEPARTMENT_HEAD:
        return {"department_id": {"$in": _user_department_ids(u)}}
    fids = _user_faculty_ids(u)
    return {"faculty_id": {"$in": fids}} if fids else {}


async def _settings(db) -> dict:
    s = await db.vp_settings.find_one({"_id": "main"}) or {}
    out = {**DEFAULT_SETTINGS, **{k: v for k, v in s.items() if k != "_id"}}
    out["default_items"] = out.get("default_items") or DEFAULT_ITEMS
    return out


async def _my_tids(db, u) -> List[str]:
    d = await db.users.find_one({"_id": ObjectId(u["id"])}, {"teacher_record_id": 1}) if ObjectId.is_valid(u["id"]) else None
    return [x for x in {u["id"], (d or {}).get("teacher_record_id")} if x]


async def _contract(db, cid: str, u, staff_only=False) -> dict:
    c = await db.vp_contracts.find_one({"_id": _oid(cid)})
    if not c:
        raise HTTPException(status_code=404, detail="العقد غير موجود")
    if _staff(u) and _in_scope(u, c):
        return c
    if not staff_only and c["teacher_id"] in await _my_tids(db, u) and c["status"] != "draft":
        return c
    raise HTTPException(status_code=403, detail="غير مصرح بالوصول إلى هذا العقد")


def _hist(action: str, u: dict, note: str = "", **extra) -> dict:
    return {"action": action, "by": u.get("full_name") or u.get("username"), "by_id": u["id"], "at": _now().isoformat(), "note": note, **extra}


def _progress(c: dict, sessions: List[dict]) -> dict:
    done_parts = [s for s in sessions if s["status"] in DONE and s.get("materials_delivered")]
    by_lec = {}
    for s in sessions:
        if s["status"] in ("rejected", "cancelled"):
            continue
        L = by_lec.setdefault(s["lecture_no"], {"lecture_no": s["lecture_no"], "title": s["lecture_title"], "parts_count": s["parts_count"], "parts": []})
        L["parts_count"] = max(L["parts_count"], s["parts_count"])
        L["parts"].append({"id": s["id"], "part_no": s["part_no"], "status": s["status"], "status_ar": S_STATUS[s["status"]],
                           "materials_delivered": bool(s.get("materials_delivered")), "stalled": s.get("stalled")})
    completed = 0
    for L in by_lec.values():
        ok = {p["part_no"] for p in L["parts"] if p["status"] in DONE and p["materials_delivered"]}
        L["completed"] = len(ok) >= L["parts_count"]
        L["published"] = all(p["status"] == "published" for p in L["parts"]) and len(L["parts"]) >= L["parts_count"]
        completed += L["completed"]
    req = max(int(c.get("lectures_required") or 0), 1)
    accrued, total = 0.0, 0.0
    for it in c.get("items", []):
        total += it["amount"]
        if it["kind"] == "recording":
            it["accrued"] = round(it["amount"] * min(completed, req) / req, 2)
        else:
            it["accrued"] = it["amount"] if it.get("status") == "accepted" else 0
        accrued += it["accrued"]
    paid = sum(p["amount"] for p in c.get("payments", []))
    end = c.get("end_date")
    days_left = (datetime.fromisoformat(end).date() - _now().date()).days if end else None
    stalled = [s for s in sessions if s.get("stalled") and s["status"] not in ("rejected", "cancelled")]
    return {"lectures_required": c.get("lectures_required") or 0, "lectures_completed": completed,
            "lectures_published": sum(1 for L in by_lec.values() if L["published"]), "parts_done": len(done_parts),
            "percent": round(100 * min(completed, req) / req, 1), "lectures": sorted(by_lec.values(), key=lambda x: x["lecture_no"]),
            "total": total, "accrued": round(accrued, 2), "paid": paid, "balance": round(accrued - paid, 2),
            "days_left": days_left, "stalled": len(stalled), "items_accepted": sum(1 for i in c.get("items", []) if i.get("status") == "accepted")}


def _sess_out(s: dict) -> dict:
    if "_id" in s:
        s = {**{k: v for k, v in s.items() if k != "_id"}, "id": str(s["_id"])}
    s["status_ar"] = S_STATUS.get(s["status"], s["status"])
    return s


async def _sessions(db, q: dict) -> List[dict]:
    return [_sess_out(s) for s in await db.vp_sessions.find(q).sort([("date", -1), ("start", -1)]).to_list(3000)]


def _c_out(c: dict, sessions: List[dict], full=False) -> dict:
    out = {k: v for k, v in c.items() if k != "_id"}
    out["id"] = str(c["_id"])
    out["status_ar"] = C_STATUS.get(c["status"], c["status"])
    for it in out.get("items", []):
        it["status_ar"] = ITEM_STATUS.get(it.get("status", "pending"))
    out["progress"] = _progress(out, sessions)
    if not full:
        out.pop("history", None)
        out["progress"].pop("lectures", None)
    return out


# ---------------- الإعدادات ----------------
class StudioIn(BaseModel):
    id: Optional[str] = None
    name: str
    location: str = ""
    is_active: bool = True


class ItemIn(BaseModel):
    key: Optional[str] = None
    name: str
    amount: float
    kind: str = "fixed"


class SettingsIn(BaseModel):
    studios: List[StudioIn] = []
    min_notice_hours: float = 2
    max_part_minutes: int = 30
    stall_days: int = 3
    first_party_org: str = ""
    first_party_name: str = ""
    first_party_title: str = ""
    default_duration_days: int = 60
    currency: str = "ريال يمني"
    default_items: List[ItemIn] = []


@router.get("/settings")
async def get_settings(u: dict = Depends(get_current_user)):
    if not _staff(u):
        raise HTTPException(status_code=403, detail="غير مصرح")
    return await _settings(get_db())


@router.put("/settings")
async def put_settings(body: SettingsIn, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_STUDIO, Permission.VP_MANAGE_CONTRACTS)
    data = body.dict()
    for s in data["studios"]:
        s["id"] = s.get("id") or str(ObjectId())
    for i, it in enumerate(data["default_items"]):
        it["key"] = it.get("key") or f"i{i}_{ObjectId()}"[:12]
        if it["kind"] not in ("fixed", "recording"):
            it["kind"] = "fixed"
    if sum(1 for it in data["default_items"] if it["kind"] == "recording") > 1:
        raise HTTPException(status_code=400, detail="يُسمح ببند تسجيل مرئي واحد فقط")
    data["max_part_minutes"] = max(5, min(int(data["max_part_minutes"]), 240))
    await get_db().vp_settings.update_one({"_id": "main"}, {"$set": data}, upsert=True)
    return await _settings(get_db())


# ---------------- العقود ----------------
class ContractIn(BaseModel):
    teacher_id: str
    teacher_name: str = ""
    qualification: str = ""
    specialization: str = ""
    academic_degree: str = ""
    phone: str = ""
    faculty_id: str = ""
    department_id: str = ""
    department_name: str = ""
    course_name: str
    weekly_hours: float = 3
    lectures_required: int
    contract_date: str = ""
    start_date: str
    duration_days: int = 60
    first_party_name: str = ""
    first_party_title: str = ""
    items: List[ItemIn] = []
    notes: str = ""


async def _norm_contract(db, body: ContractIn) -> dict:
    d = body.dict()
    t = await db.teachers.find_one({"_id": ObjectId(d["teacher_id"])}) if ObjectId.is_valid(d["teacher_id"]) else None
    if not t:
        raise HTTPException(status_code=400, detail="اختر المعلم من القائمة")
    if not d["course_name"].strip():
        raise HTTPException(status_code=400, detail="اسم المقرر مطلوب")
    if d["lectures_required"] < 1:
        raise HTTPException(status_code=400, detail="عدد المحاضرات المرئية المطلوبة يجب أن يكون 1 على الأقل")
    try:
        start = datetime.fromisoformat(d["start_date"]).date()
    except Exception:
        raise HTTPException(status_code=400, detail="تاريخ البداية غير صالح")
    d["teacher_name"] = d["teacher_name"].strip() or t.get("full_name", "")
    d["end_date"] = (start + timedelta(days=max(1, d["duration_days"]))).isoformat()
    d["department_name"] = d["department_name"] or ((await db.departments.find_one({"_id": ObjectId(d["department_id"])}, {"name": 1}) or {}).get("name", "") if ObjectId.is_valid(d["department_id"]) else "")
    if not d["faculty_id"] and ObjectId.is_valid(d["department_id"]):
        d["faculty_id"] = (await db.departments.find_one({"_id": ObjectId(d["department_id"])}, {"faculty_id": 1}) or {}).get("faculty_id", "")
    items = d["items"] or (await _settings(db))["default_items"]
    if sum(1 for it in items if it["kind"] == "recording") > 1:
        raise HTTPException(status_code=400, detail="يُسمح ببند تسجيل مرئي واحد فقط")
    d["items"] = [{"key": it.get("key") or f"i{n}", "name": it["name"], "amount": float(it["amount"]),
                   "kind": it["kind"] if it["kind"] in ("fixed", "recording") else "fixed", "status": "pending"} for n, it in enumerate(items)]
    d["total_amount"] = sum(it["amount"] for it in d["items"])
    return d


def _guard_scope(u, d):
    if not _in_scope(u, d):
        raise HTTPException(status_code=403, detail="الكلية/القسم خارج نطاقك")


@router.get("/contracts")
async def list_contracts(status: str = "", faculty_id: str = "", department_id: str = "", q: str = "", u: dict = Depends(get_current_user)):
    db = get_db()
    if not _staff(u):
        raise HTTPException(status_code=403, detail="غير مصرح")
    query = _scope_q(u)
    for k, v in (("status", status), ("faculty_id", faculty_id), ("department_id", department_id)):
        if v:
            query[k] = v if k not in query else {"$in": [v] if v in query[k]["$in"] else []}
    if q.strip():
        rx = re.escape(q.strip())
        query["$or"] = [{"teacher_name": {"$regex": rx, "$options": "i"}}, {"course_name": {"$regex": rx, "$options": "i"}}, {"ref_no": {"$regex": rx}}]
    cs = await db.vp_contracts.find(query).sort("created_at", -1).to_list(1000)
    ids = [str(c["_id"]) for c in cs]
    allS = await _sessions(db, {"contract_id": {"$in": ids}})
    items = [_c_out(c, [s for s in allS if s["contract_id"] == str(c["_id"])]) for c in cs]
    st = await _settings(db)
    lim = (_now() - timedelta(days=st["stall_days"])).isoformat()
    live = [c for c in items if c["status"] in ("issued", "completed")]
    kpis = {"active": sum(1 for c in items if c["status"] == "issued"), "late": sum(1 for c in items if c["status"] == "issued" and (c["progress"]["days_left"] or 0) < 0),
            "stalled": sum(1 for s in allS if (s.get("stalled") and s["status"] not in ("rejected", "cancelled")) or (s["status"] in ("filmed", "editing", "cloud") and s.get("updated_at", "") < lim)),
            "accrued": sum(c["progress"]["accrued"] for c in live), "paid": sum(c["progress"]["paid"] for c in live)}
    return {"items": items, "kpis": kpis}


@router.post("/contracts")
async def create_contract(body: ContractIn, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_MANAGE_CONTRACTS)
    db = get_db()
    d = await _norm_contract(db, body)
    _guard_scope(u, d)
    d.update({"ref_no": await _next_ref(db, "VC", 4), "status": "draft", "payments": [], "created_at": _now().isoformat(),
              "created_by": u["id"], "history": [_hist("إنشاء العقد", u)]})
    r = await db.vp_contracts.insert_one(d)
    await log_activity(u, "vp_contract_create", f"عقد إنتاج مرئي {d['ref_no']} — {d['teacher_name']}")
    return {"id": str(r.inserted_id), "ref_no": d["ref_no"]}


@router.get("/contracts/{cid}")
async def get_contract(cid: str, u: dict = Depends(get_current_user)):
    db = get_db()
    c = await _contract(db, cid, u)
    return _c_out(c, await _sessions(db, {"contract_id": cid}), full=True)


@router.put("/contracts/{cid}")
async def update_contract(cid: str, body: ContractIn, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_MANAGE_CONTRACTS)
    db = get_db()
    c = await _contract(db, cid, u, staff_only=True)
    if c["status"] in ("completed", "terminated"):
        raise HTTPException(status_code=400, detail="لا يمكن تعديل عقد منتهٍ أو ملغى")
    d = await _norm_contract(db, body)
    _guard_scope(u, d)
    old = {it["key"]: it for it in c.get("items", [])}
    for it in d["items"]:
        if it["key"] in old:
            it.update({k: old[it["key"]][k] for k in ("status", "delivered_at", "accepted_at", "note") if k in old[it["key"]]})
    note = "تعديل بيانات العقد" if c["status"] == "draft" else "ملحق تعديل على عقد ساري"
    await db.vp_contracts.update_one({"_id": c["_id"]}, {"$set": d, "$push": {"history": _hist(note, u)}})
    return {"ok": True}


class ActIn(BaseModel):
    action: str
    note: str = ""


@router.post("/contracts/{cid}/status")
async def contract_status(cid: str, body: ActIn, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_MANAGE_CONTRACTS)
    db = get_db()
    c = await _contract(db, cid, u, staff_only=True)
    flow = {"issue": ({"draft"}, "issued", "اعتماد وإصدار العقد"), "complete": ({"issued"}, "completed", "إنهاء العقد (مكتمل)"),
            "terminate": ({"draft", "issued"}, "terminated", "إلغاء العقد"), "reopen": ({"completed", "terminated"}, "issued", "إعادة فتح العقد")}
    if body.action not in flow:
        raise HTTPException(status_code=400, detail="إجراء غير معروف")
    frm, to, label = flow[body.action]
    if c["status"] not in frm:
        raise HTTPException(status_code=400, detail=f"لا يمكن «{label}» والعقد في حالة «{C_STATUS[c['status']]}»")
    if body.action == "terminate" and not body.note.strip():
        raise HTTPException(status_code=400, detail="اكتب سبب الإلغاء")
    sets = {"status": to}
    if body.action == "issue":
        sets["issued_at"] = _now().isoformat()
    await db.vp_contracts.update_one({"_id": c["_id"]}, {"$set": sets, "$push": {"history": _hist(label, u, body.note)}})
    if body.action in ("issue", "terminate"):
        await notify_users(db, await _teacher_user_ids(db, c["teacher_id"]), "🎬 عقد الإنتاج المرئي",
                           f"{label}: {c['course_name']} ({c['ref_no']})", "video_production", {"type": "video_contract", "id": cid, "route": "/video-production"})
    return {"ok": True, "status": to}


class ItemAct(BaseModel):
    status: str
    note: str = ""


@router.put("/contracts/{cid}/items/{key}")
async def item_status(cid: str, key: str, body: ItemAct, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_MANAGE_CONTRACTS)
    db = get_db()
    c = await _contract(db, cid, u, staff_only=True)
    if c["status"] != "issued":
        raise HTTPException(status_code=400, detail="تعديل البنود متاح للعقود السارية فقط")
    it = next((i for i in c.get("items", []) if i["key"] == key), None)
    if not it or it["kind"] == "recording":
        raise HTTPException(status_code=400, detail="بند التسجيل المرئي يُحتسب تلقائياً من المحاضرات المكتملة")
    if body.status not in ITEM_STATUS:
        raise HTTPException(status_code=400, detail="حالة غير صالحة")
    now = _now().isoformat()
    upd = {"items.$.status": body.status, "items.$.note": body.note}
    if body.status == "delivered":
        upd["items.$.delivered_at"] = now
    if body.status == "accepted":
        upd["items.$.accepted_at"] = now
    await db.vp_contracts.update_one({"_id": c["_id"], "items.key": key},
                                     {"$set": upd, "$push": {"history": _hist(f"{it['name']}: {ITEM_STATUS[body.status]}", u, body.note)}})
    return {"ok": True}


class PayIn(BaseModel):
    amount: float
    date: str = ""
    stage: str = ""
    note: str = ""


@router.post("/contracts/{cid}/payments")
async def add_payment(cid: str, body: PayIn, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_PAYMENTS)
    db = get_db()
    c = await _contract(db, cid, u, staff_only=True)
    if c["status"] == "draft":
        raise HTTPException(status_code=400, detail="لا يُصرف على عقد غير معتمد")
    if c["status"] == "terminated" and not body.note.strip():
        raise HTTPException(status_code=400, detail="العقد ملغى — الصرف للتسوية فقط مع ذكر ملاحظة التسوية")
    pr = _progress({k: v for k, v in c.items()}, await _sessions(db, {"contract_id": cid}))
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="المبلغ غير صالح")
    if body.amount > pr["balance"] + 0.01:
        raise HTTPException(status_code=400, detail=f"المبلغ يتجاوز المستحق غير المصروف ({pr['balance']:,.0f})")
    p = {"id": str(ObjectId()), "amount": body.amount, "date": body.date or _now().date().isoformat(), "stage": body.stage, "note": body.note,
         "by": u.get("full_name") or u.get("username"), "at": _now().isoformat()}
    await db.vp_contracts.update_one({"_id": c["_id"]}, {"$push": {"payments": p, "history": _hist(f"صرف دفعة {body.amount:,.0f}", u, body.stage or body.note)}})
    await notify_users(db, await _teacher_user_ids(db, c["teacher_id"]), "💰 صرف دفعة", f"تم صرف {body.amount:,.0f} من مستحقات عقد {c['course_name']}",
                       "video_production", {"type": "video_contract", "id": cid, "route": "/video-production"})
    return p


@router.delete("/contracts/{cid}/payments/{pid}")
async def del_payment(cid: str, pid: str, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_PAYMENTS)
    db = get_db()
    c = await _contract(db, cid, u, staff_only=True)
    if not any(p["id"] == pid for p in c.get("payments", [])):
        raise HTTPException(status_code=404, detail="الدفعة غير موجودة")
    await db.vp_contracts.update_one({"_id": c["_id"]}, {"$pull": {"payments": {"id": pid}}, "$push": {"history": _hist("حذف دفعة", u)}})
    return {"ok": True}


@router.get("/contracts/{cid}/pdf")
async def contract_pdf(cid: str, u: dict = Depends(get_current_user)):
    from services.vp_pdf import contract_pdf as build
    db = get_db()
    c = await _contract(db, cid, u)
    pdf = build(c, await _settings(db))
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{c["ref_no"]}.pdf"'})


# ---------------- جلسات التسجيل (نموذج تسجيل محاضرة) ----------------
class SessionIn(BaseModel):
    contract_id: str
    lecture_no: int
    lecture_title: str
    topic: str = ""
    parts_count: int = 1
    part_no: int = 1
    est_minutes: int = 30
    summary: str = ""
    attachment_note: str = ""
    teacher_notes: str = ""
    studio_id: str = ""
    date: str
    start: str


def _mins(t: str) -> int:
    m = re.fullmatch(r"([01]?\d|2[0-3]):([0-5]\d)(:\d\d)?", (t or "").strip())
    if not m:
        raise HTTPException(status_code=400, detail="الوقت غير صالح (HH:MM)")
    return int(m.group(1)) * 60 + int(m.group(2))


def _end(start: str, minutes: int) -> str:
    e = _mins(start) + minutes
    if e > 24 * 60 - 1:
        raise HTTPException(status_code=400, detail="الجلسة يجب أن تنتهي قبل منتصف الليل")
    return _hhmm(e)


_IDX = {"done": False}


async def _next_ref(db, prefix: str, width: int) -> str:
    if not _IDX["done"]:
        await db.vp_contracts.create_index("ref_no", unique=True)
        await db.vp_sessions.create_index("ref_no", unique=True)
        _IDX["done"] = True
    year = _now().year
    r = await db.vp_counters.find_one_and_update({"_id": f"{prefix}-{year}"}, {"$inc": {"n": 1}}, upsert=True, return_document=True)
    return f"{prefix}-{year}-{r['n']:0{width}d}"


def _hhmm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


async def _conflict(db, studio_id: str, date: str, start: str, end: str, skip: str = "") -> Optional[dict]:
    q = {"studio_id": studio_id, "date": date, "status": {"$in": list(BUSY)}, "start": {"$lt": end}, "end": {"$gt": start}}
    if skip:
        q["_id"] = {"$ne": ObjectId(skip)}
    return await db.vp_sessions.find_one(q)


async def _free_studios(db, st: dict, date: str, start: str, end: str, skip: str = "") -> List[dict]:
    out = []
    for s in st["studios"]:
        if s.get("is_active", True) and not await _conflict(db, s["id"], date, start, end, skip):
            out.append(s)
    return out


@router.get("/availability")
async def availability(date: str, start: str, minutes: int = 30, u: dict = Depends(get_current_user)):
    db = get_db()
    st = await _settings(db)
    if not (_staff(u) or await db.vp_contracts.find_one({"teacher_id": {"$in": await _my_tids(db, u)}, "status": "issued"}, {"_id": 1})):
        raise HTTPException(status_code=403, detail="غير مصرح")
    end = _end(start, minutes)
    return {"studios": await _free_studios(db, st, date, start, end), "end": end}


async def _create_session(db, body: SessionIn, u: dict, c: dict, by_teacher: bool) -> dict:
    st = await _settings(db)
    if c["status"] != "issued":
        raise HTTPException(status_code=400, detail="الحجز متاح فقط للعقود المعتمدة السارية")
    if not (1 <= body.lecture_no <= int(c.get("lectures_required") or 0)):
        raise HTTPException(status_code=400, detail=f"رقم المحاضرة يجب أن يكون بين 1 و{c.get('lectures_required')}")
    if not body.lecture_title.strip():
        raise HTTPException(status_code=400, detail="عنوان المحاضرة مطلوب")
    if not (1 <= body.part_no <= max(1, body.parts_count)):
        raise HTTPException(status_code=400, detail="رقم الجزء يجب أن يكون بين 1 وعدد الأجزاء")
    if not (1 <= body.est_minutes <= st["max_part_minutes"]):
        raise HTTPException(status_code=400, detail=f"مدة الجزء لا تتعدى {st['max_part_minutes']} دقيقة")
    try:
        when = datetime.fromisoformat(f"{body.date}T{body.start}").replace(tzinfo=TZ)
    except Exception:
        raise HTTPException(status_code=400, detail="التاريخ أو الوقت غير صالح")
    if by_teacher and when < _now() + timedelta(hours=st["min_notice_hours"]):
        raise HTTPException(status_code=400, detail=f"يجب تقديم طلب الحجز قبل الموعد بـ {st['min_notice_hours']:g} ساعة على الأقل")
    dup = await db.vp_sessions.find_one({"contract_id": body.contract_id, "lecture_no": body.lecture_no, "part_no": body.part_no,
                                         "status": {"$nin": ["rejected", "cancelled"]}})
    if dup:
        raise HTTPException(status_code=400, detail=f"الجزء {body.part_no} من المحاضرة {body.lecture_no} محجوز/مسجل مسبقاً")
    end = _end(body.start, body.est_minutes)
    start = _hhmm(_mins(body.start))
    if body.studio_id and not any(s["id"] == body.studio_id for s in st["studios"]):
        raise HTTPException(status_code=400, detail="الأستوديو غير موجود")
    if body.studio_id and await _conflict(db, body.studio_id, body.date, start, end):
        raise HTTPException(status_code=400, detail="الأستوديو محجوز في هذا الوقت — اختر وقتاً أو أستوديو آخر")
    d = {**body.dict(), "start": start, "end": end, "ref_no": await _next_ref(db, "VS", 5), "teacher_id": c["teacher_id"], "teacher_name": c["teacher_name"],
         "course_name": c["course_name"], "faculty_id": c.get("faculty_id", ""), "department_id": c.get("department_id", ""),
         "department_name": c.get("department_name", ""), "status": "requested", "materials_delivered": False, "materials_note": "",
         "photographer_notes": "", "cloud_url": "", "platform_url": "", "stalled": None, "created_at": _now().isoformat(),
         "updated_at": _now().isoformat(), "history": [_hist("طلب حجز من المعلم" if by_teacher else "إنشاء حجز من الأستوديو", u)]}
    r = await db.vp_sessions.insert_one(d)
    return {"id": str(r.inserted_id), "ref_no": d["ref_no"], "message": "تم إرسال طلب الحجز إلى الأستوديو"}


@router.get("/sessions")
async def list_sessions(date_from: str = "", date_to: str = "", studio_id: str = "", status: str = "", contract_id: str = "", q: str = "",
                        u: dict = Depends(get_current_user)):
    if not _staff(u):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_db()
    query = _scope_q(u)
    if date_from or date_to:
        query["date"] = {k: v for k, v in (("$gte", date_from), ("$lte", date_to)) if v}
    for k, v in (("studio_id", studio_id), ("contract_id", contract_id)):
        if v:
            query[k] = v
    if status == "stalled":
        query["stalled"] = {"$ne": None}
    elif status:
        query["status"] = status
    if q.strip():
        rx = re.escape(q.strip())
        query["$or"] = [{"teacher_name": {"$regex": rx, "$options": "i"}}, {"course_name": {"$regex": rx, "$options": "i"}},
                        {"lecture_title": {"$regex": rx, "$options": "i"}}, {"ref_no": {"$regex": rx}}]
    items = await _sessions(db, query)
    counts = {}
    for s in items:
        counts[s["status"]] = counts.get(s["status"], 0) + 1
    counts["stalled"] = sum(1 for s in items if s.get("stalled"))
    return {"items": items, "counts": counts}


@router.post("/sessions")
async def staff_create_session(body: SessionIn, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_STUDIO)
    db = get_db()
    c = await _contract(db, body.contract_id, u, staff_only=True)
    return await _create_session(db, body, u, c, by_teacher=False)


async def _session(db, sid: str, u: dict, staff_only=True) -> dict:
    s = await db.vp_sessions.find_one({"_id": _oid(sid)})
    if not s:
        raise HTTPException(status_code=404, detail="الحجز غير موجود")
    if _staff(u) and _in_scope(u, s):
        return s
    if not staff_only and s["teacher_id"] in await _my_tids(db, u):
        return s
    raise HTTPException(status_code=403, detail="غير مصرح")


@router.get("/sessions/{sid}")
async def get_session(sid: str, u: dict = Depends(get_current_user)):
    return _sess_out(await _session(get_db(), sid, u, staff_only=False))


class SessAct(BaseModel):
    action: str
    note: str = ""
    studio_id: str = ""
    date: str = ""
    start: str = ""
    cloud_url: str = ""
    platform_url: str = ""
    actual_minutes: Optional[int] = None


@router.post("/sessions/{sid}/action")
async def session_action(sid: str, body: SessAct, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_STUDIO)
    db = get_db()
    s = await _session(db, sid, u)
    a, st = body.action, s["status"]
    sets, label = {}, ""
    if a in ("confirm", "reschedule"):
        if st not in ("requested", "confirmed"):
            raise HTTPException(status_code=400, detail="لا يمكن تأكيد/نقل حجز بعد التصوير")
        studio, date = body.studio_id or s.get("studio_id"), body.date or s["date"]
        start = _hhmm(_mins(body.start or s["start"]))
        if not studio:
            raise HTTPException(status_code=400, detail="اختر الأستوديو")
        end = _end(start, s["est_minutes"])
        if await _conflict(db, studio, date, start, end, skip=sid):
            raise HTTPException(status_code=400, detail="الأستوديو محجوز في هذا الوقت")
        moved = (studio, date, start) != (s.get("studio_id"), s["date"], s["start"])
        sets = {"status": "confirmed", "studio_id": studio, "date": date, "start": start, "end": end}
        label = "تأكيد الحجز" + (" مع تعديل الموعد/الأستوديو" if moved else "")
    elif a == "reject":
        if st != "requested" or not body.note.strip():
            raise HTTPException(status_code=400, detail="الرفض متاح لطلب الحجز فقط مع ذكر السبب أو موعد بديل")
        sets, label = {"status": "rejected"}, "اعتذار عن الحجز"
    elif a == "cancel":
        if st not in ("requested", "confirmed"):
            raise HTTPException(status_code=400, detail="لا يمكن الإلغاء بعد التصوير")
        sets, label = {"status": "cancelled"}, "إلغاء الحجز"
    elif a in ("filmed", "editing", "cloud", "published"):
        if PIPE.index(a) != PIPE.index(st) + 1 if st in PIPE else True:
            raise HTTPException(status_code=400, detail=f"الانتقال إلى «{S_STATUS[a]}» يلي «{S_STATUS[PIPE[PIPE.index(a) - 1]]}»")
        if a == "cloud" and not body.cloud_url.strip():
            raise HTTPException(status_code=400, detail="أدخل رابط الملف على السحابة")
        if a == "published" and not body.platform_url.strip():
            raise HTTPException(status_code=400, detail="أدخل رابط المحاضرة على منصة التعليم")
        sets, label = {"status": a, "stalled": None}, S_STATUS[a]
        if a == "filmed" and body.actual_minutes:
            sets["actual_minutes"] = body.actual_minutes
        if body.cloud_url:
            sets["cloud_url"] = body.cloud_url.strip()
        if body.platform_url:
            sets["platform_url"] = body.platform_url.strip()
    elif a == "back":
        if st not in PIPE or PIPE.index(st) < 3:
            raise HTTPException(status_code=400, detail="لا يمكن الرجوع من هذه المرحلة")
        sets, label = {"status": PIPE[PIPE.index(st) - 1]}, f"إرجاع إلى «{S_STATUS[PIPE[PIPE.index(st) - 1]]}»"
    elif a == "stall":
        if st in ("rejected", "cancelled", "published"):
            raise HTTPException(status_code=400, detail="لا يمكن تسجيل توقف لهذه الحالة")
        if not body.note.strip():
            raise HTTPException(status_code=400, detail="اكتب سبب التوقف")
        sets, label = {"stalled": {"reason": body.note.strip(), "at": _now().isoformat(), "stage": st}}, "توقف"
    elif a == "unstall":
        sets, label = {"stalled": None}, "استئناف"
    else:
        raise HTTPException(status_code=400, detail="إجراء غير معروف")
    sets["updated_at"] = _now().isoformat()
    await db.vp_sessions.update_one({"_id": s["_id"]}, {"$set": sets, "$push": {"history": _hist(label, u, body.note)}})
    if a in ("confirm", "reschedule", "reject", "cancel", "filmed", "published", "stall"):
        st_name = next((x["name"] for x in (await _settings(db))["studios"] if x["id"] == sets.get("studio_id", s.get("studio_id"))), "")
        msg = f"{label}: {s['lecture_title']} (ج{s['part_no']})"
        if a in ("confirm", "reschedule"):
            msg += f" — {st_name} {sets['date']} {sets['start']}"
        if body.note:
            msg += f" — {body.note}"
        await notify_users(db, await _teacher_user_ids(db, s["teacher_id"]), "🎬 الأستوديو التعليمي", msg, "video_production",
                           {"type": "video_session", "id": sid, "route": "/video-production", "status": sets.get("status", st)})
    return {"ok": True}


class SessEdit(BaseModel):
    photographer_notes: Optional[str] = None
    materials_delivered: Optional[bool] = None
    materials_note: Optional[str] = None


@router.put("/sessions/{sid}")
async def session_edit(sid: str, body: SessEdit, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_STUDIO)
    db = get_db()
    s = await _session(db, sid, u)
    if s["status"] in ("rejected", "cancelled"):
        raise HTTPException(status_code=400, detail="الحجز مرفوض/ملغى")
    sets = {k: v for k, v in body.dict().items() if v is not None}
    if not sets:
        return {"ok": True}
    sets["updated_at"] = _now().isoformat()
    h = "استلام الملحقات (النص والمصادر)" if body.materials_delivered else ("إلغاء استلام الملحقات" if body.materials_delivered is False else "تحديث الملاحظات")
    await db.vp_sessions.update_one({"_id": s["_id"]}, {"$set": sets, "$push": {"history": _hist(h, u, body.materials_note or "")}})
    return {"ok": True}


@router.get("/sessions/{sid}/pdf")
async def session_pdf(sid: str, u: dict = Depends(get_current_user)):
    from services.vp_pdf import session_pdf as build
    db = get_db()
    s = await _session(db, sid, u, staff_only=False)
    st = await _settings(db)
    pdf = build(s, next((x["name"] for x in st["studios"] if x["id"] == s.get("studio_id")), ""))
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{s["ref_no"]}.pdf"'})


# ---------------- واجهة المعلم (تطبيق المدرس) ----------------
@router.get("/my/contracts")
async def my_contracts(u: dict = Depends(get_current_user)):
    db = get_db()
    tids = await _my_tids(db, u)
    cs = await db.vp_contracts.find({"teacher_id": {"$in": tids}, "status": {"$ne": "draft"}}).sort("created_at", -1).to_list(100)
    out = []
    for c in cs:
        o = _c_out(c, await _sessions(db, {"contract_id": str(c["_id"])}), full=True)
        o.pop("history", None)
        out.append(o)
    st = await _settings(db)
    return {"items": out, "settings": {"min_notice_hours": st["min_notice_hours"], "max_part_minutes": st["max_part_minutes"],
                                        "studios": [s for s in st["studios"] if s.get("is_active", True)], "currency": st["currency"]}}


@router.post("/my/contracts/{cid}/accept")
async def my_accept(cid: str, u: dict = Depends(get_current_user)):
    db = get_db()
    c = await _contract(db, cid, u)
    if c["teacher_id"] not in await _my_tids(db, u):
        raise HTTPException(status_code=403, detail="غير مصرح")
    if c["status"] != "issued":
        raise HTTPException(status_code=400, detail="العقد غير ساري")
    if not c.get("teacher_accepted_at"):
        await db.vp_contracts.update_one({"_id": c["_id"]}, {"$set": {"teacher_accepted_at": _now().isoformat()}, "$push": {"history": _hist("موافقة المعلم على البنود", u)}})
    return {"ok": True}


@router.get("/my/sessions")
async def my_sessions(u: dict = Depends(get_current_user)):
    db = get_db()
    return {"items": await _sessions(db, {"teacher_id": {"$in": await _my_tids(db, u)}})}


@router.post("/my/sessions")
async def my_create_session(body: SessionIn, u: dict = Depends(get_current_user)):
    db = get_db()
    c = await _contract(db, body.contract_id, u)
    if c["teacher_id"] not in await _my_tids(db, u):
        raise HTTPException(status_code=403, detail="غير مصرح")
    return await _create_session(db, body, u, c, by_teacher=True)


class MyCancel(BaseModel):
    note: str = ""


@router.post("/my/sessions/{sid}/cancel")
async def my_cancel(sid: str, body: MyCancel, u: dict = Depends(get_current_user)):
    db = get_db()
    s = await db.vp_sessions.find_one({"_id": _oid(sid), "teacher_id": {"$in": await _my_tids(db, u)}})
    if not s:
        raise HTTPException(status_code=404, detail="الحجز غير موجود")
    if s["status"] not in ("requested", "confirmed"):
        raise HTTPException(status_code=400, detail="لا يمكن الإلغاء بعد التصوير")
    await db.vp_sessions.update_one({"_id": s["_id"]}, {"$set": {"status": "cancelled", "updated_at": _now().isoformat()},
                                                        "$push": {"history": _hist("إلغاء من المعلم", u, body.note)}})
    return {"ok": True}


class MyMaterials(BaseModel):
    materials_note: str = ""
    teacher_notes: Optional[str] = None


@router.put("/my/sessions/{sid}")
async def my_session_edit(sid: str, body: MyMaterials, u: dict = Depends(get_current_user)):
    db = get_db()
    s = await db.vp_sessions.find_one({"_id": _oid(sid), "teacher_id": {"$in": await _my_tids(db, u)}})
    if not s:
        raise HTTPException(status_code=404, detail="الحجز غير موجود")
    sets = {"materials_note": body.materials_note, "updated_at": _now().isoformat()}
    if body.teacher_notes is not None:
        sets["teacher_notes"] = body.teacher_notes
    await db.vp_sessions.update_one({"_id": s["_id"]}, {"$set": sets, "$push": {"history": _hist("تحديث المعلم للملحقات/الملاحظات", u, body.materials_note)}})
    return {"ok": True}
