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
C_STATUS = {"draft": "مسودة", "sent": "بانتظار موافقة المدرس", "returned": "أعاده المدرس للتعديل", "teacher_accepted": "وافق المدرس — بانتظار التعميد",
            "issued": "معمّد / ساري وملزم", "completed": "منتهٍ", "terminated": "ملغى"}
TEACHER_VISIBLE = ("sent", "teacher_accepted", "issued", "completed", "terminated")
PAY_STATUS = {"pending": "بانتظار تأكيد المدرس", "received": "مستلم (سند)", "disputed": "اعترض المدرس"}
MONEY_KEYS = ("items", "payments", "total_amount")
BASE_STATUS = {"requested": "طلب حجز", "confirmed": "حجز مؤكد", "rejected": "مرفوض", "cancelled": "ملغى"}
DEFAULT_STEPS = [
    {"key": "filmed", "name": "تم التصوير", "is_filming": True, "requires_link": False, "link_label": "", "notify": True},
    {"key": "editing", "name": "قيد المونتاج", "is_filming": False, "requires_link": False, "link_label": "", "notify": False},
    {"key": "cloud", "name": "مرفوع للسحابة", "is_filming": False, "requires_link": True, "link_label": "رابط الملف على السحابة", "notify": False},
    {"key": "published", "name": "منشور على المنصة", "is_filming": False, "requires_link": True, "link_label": "رابط المحاضرة على منصة التعليم", "notify": True},
]


class Flow:
    """مراحل الإنتاج الديناميكية (من الإعدادات) بعد «حجز مؤكد» — مرحلة التصوير تحدد بداية الاحتساب للمعلم"""
    def __init__(self, steps: List[dict]):
        self.steps = steps
        self.keys = [x["key"] for x in steps]
        fi = next((i for i, x in enumerate(steps) if x.get("is_filming")), 0)
        self.done = set(self.keys[fi:])
        self.last = self.keys[-1]
        self.seq = ["confirmed"] + self.keys
        self.names = {**BASE_STATUS, **{x["key"]: x["name"] for x in steps}}
        self.busy = {"confirmed", *self.keys}

    def pct(self, status: str) -> float:
        return round(100 * (self.keys.index(status) + 1) / len(self.keys), 1) if status in self.keys else 0.0

    def step(self, key: str) -> dict:
        return next((x for x in self.steps if x["key"] == key), {})
ITEM_STATUS = {"pending": "لم يُسلَّم", "delivered": "مُسلَّم — بانتظار القبول", "partial": "مقبول جزئياً", "accepted": "مقبول"}
DEFAULT_ITEMS = [
    {"key": "spec", "name": "توصيف المادة العلمية", "amount": 50000, "kind": "fixed"},
    {"key": "content", "name": "إعداد المحتوى العلمي وشرائح العرض", "amount": 100000, "kind": "fixed"},
    {"key": "recording", "name": "التسجيل المرئي للمحاضرات", "amount": 250000, "kind": "recording"},
    {"key": "qbank", "name": "إعداد بنك الأسئلة (250 سؤالاً على الأقل)", "amount": 50000, "kind": "fixed"},
]
DEFAULT_SETTINGS = {"studios": [], "semester_weeks": 16, "letterhead_id": "", "min_notice_hours": 2, "max_part_minutes": 60, "stall_days": 3, "pipeline_steps": DEFAULT_STEPS,
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


def _fin(u) -> bool:
    return any(_p(u, x) for x in (Permission.VP_VIEW, Permission.VP_MANAGE_CONTRACTS, Permission.VP_PAYMENTS))


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
    out["pipeline_steps"] = out.get("pipeline_steps") or DEFAULT_STEPS
    return out


async def _flow(db) -> Flow:
    return Flow((await _settings(db))["pipeline_steps"])


async def _my_tids(db, u) -> List[str]:
    d = await db.users.find_one({"_id": ObjectId(u["id"])}, {"teacher_record_id": 1}) if ObjectId.is_valid(u["id"]) else None
    return [x for x in {u["id"], (d or {}).get("teacher_record_id")} if x]


async def _app_visible(db, teacher_id: str) -> bool:
    f = await db.vp_teacher_flags.find_one({"_id": teacher_id})
    return (f or {}).get("app_visible", True)


async def _contract(db, cid: str, u, staff_only=False) -> dict:
    c = await db.vp_contracts.find_one({"_id": _oid(cid)})
    if not c:
        raise HTTPException(status_code=404, detail="العقد غير موجود")
    if _staff(u) and _in_scope(u, c):
        return c
    if not staff_only and c["teacher_id"] in await _my_tids(db, u) and c["status"] in TEACHER_VISIBLE and await _app_visible(db, c["teacher_id"]):
        return c
    raise HTTPException(status_code=403, detail="غير مصرح بالوصول إلى هذا العقد")


def _hist(action: str, u: dict, note: str = "", **extra) -> dict:
    return {"action": action, "by": u.get("full_name") or u.get("username"), "by_id": u["id"], "at": _now().isoformat(), "note": note, **extra}


def _progress(c: dict, sessions: List[dict], fl: Flow) -> dict:
    DONE = fl.done
    done_parts = [s for s in sessions if s["status"] in DONE and s.get("materials_delivered")]
    by_lec = {}
    for s in sessions:
        if s["status"] in ("rejected", "cancelled"):
            continue
        L = by_lec.setdefault(s["lecture_no"], {"lecture_no": s["lecture_no"], "title": s["lecture_title"], "parts_count": s["parts_count"], "parts": []})
        L["parts_count"] = max(L["parts_count"], s["parts_count"])
        L["parts"].append({"id": s["id"], "part_no": s["part_no"], "status": s["status"], "status_ar": fl.names.get(s["status"], s["status"]), "pct": fl.pct(s["status"]),
                           "materials_delivered": bool(s.get("materials_delivered")), "stalled": s.get("stalled")})
    completed = 0
    for L in by_lec.values():
        ok = {p["part_no"] for p in L["parts"] if p["status"] in DONE and p["materials_delivered"]}
        L["completed"] = len(ok) >= L["parts_count"]
        L["published"] = all(p["status"] == fl.last for p in L["parts"]) and len(L["parts"]) >= L["parts_count"]
        L["pct"] = round(sum(p["pct"] for p in L["parts"]) / max(L["parts_count"], 1), 1)
        completed += L["completed"]
    req_min = max(float(c.get("required_hours") or 0) * 60, 1)
    live = [s for s in sessions if s["status"] not in ("rejected", "cancelled")]
    rec_min = sum((s.get("actual_minutes") or s.get("est_minutes") or 0) for s in live if s["status"] in DONE)
    prod_min = sum((s.get("actual_minutes") or s.get("est_minutes") or 0) * fl.pct(s["status"]) / 100 for s in live)
    accrued, total = 0.0, 0.0
    for it in c.get("items", []):
        total += it["amount"]
        st_ = it.get("status")
        it["accrued"] = it["amount"] if st_ == "accepted" else (min(float(it.get("accepted_amount") or 0), it["amount"]) if st_ == "partial" else 0)
        accrued += it["accrued"]
    pays = c.get("payments", [])
    paid = sum(p["amount"] for p in pays if p.get("status", "received") == "received")
    pending = sum(p["amount"] for p in pays if p.get("status") in ("pending", "disputed"))
    end = c.get("end_date")
    days_left = (datetime.fromisoformat(end).date() - _now().date()).days if end else None
    stalled = [s for s in live if s.get("stalled")]
    return {"required_hours": round(req_min / 60, 2) if c.get("required_hours") else 0, "recorded_hours": round(rec_min / 60, 2),
            "lectures_completed": completed, "lectures_count": len(by_lec),
            "lectures_published": sum(1 for L in by_lec.values() if L["published"]), "parts_done": len(done_parts),
            "percent": round(min(100, 100 * rec_min / req_min), 1), "production_percent": round(min(100, 100 * prod_min / req_min), 1),
            "lectures": sorted(by_lec.values(), key=lambda x: x["lecture_no"]),
            "total": total, "accrued": round(accrued, 2), "paid": paid, "pending": pending, "balance": round(accrued - paid - pending, 2),
            "days_left": days_left, "stalled": len(stalled), "items_accepted": sum(1 for i in c.get("items", []) if i.get("status") == "accepted")}


def _strip_money(o: dict) -> dict:
    for k in MONEY_KEYS:
        o.pop(k, None)
    if "history" in o:
        o["history"] = [h for h in o["history"] if "دفع" not in h.get("action", "") and "استلام" not in h.get("action", "")]
    pr = o.get("progress") or {}
    for k in ("total", "accrued", "paid", "pending", "balance"):
        pr.pop(k, None)
    return o


def _sess_out(s: dict, fl: Flow) -> dict:
    if "_id" in s:
        s = {**{k: v for k, v in s.items() if k != "_id"}, "id": str(s["_id"])}
    s["status_ar"] = fl.names.get(s["status"], s["status"])
    s["pct"] = fl.pct(s["status"])
    return s


async def _sessions(db, q: dict, fl: Optional[Flow] = None) -> List[dict]:
    fl = fl or await _flow(db)
    return [_sess_out(s, fl) for s in await db.vp_sessions.find(q).sort([("date", -1), ("start", -1)]).to_list(3000)]


def _c_out(c: dict, sessions: List[dict], fl: Flow, full=False) -> dict:
    out = {k: v for k, v in c.items() if k != "_id"}
    out["id"] = str(c["_id"])
    out["status_ar"] = C_STATUS.get(c["status"], c["status"])
    for it in out.get("items", []):
        it["status_ar"] = ITEM_STATUS.get(it.get("status", "pending"))
    for p_ in out.get("payments", []):
        p_.setdefault("status", "received")
        p_["status_ar"] = PAY_STATUS.get(p_["status"])
    out["progress"] = _progress(out, sessions, fl)
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


class StepIn(BaseModel):
    key: Optional[str] = None
    name: str
    is_filming: bool = False
    requires_link: bool = False
    link_label: str = ""
    notify: bool = False


class SettingsIn(BaseModel):
    studios: List[StudioIn] = []
    min_notice_hours: float = 2
    max_part_minutes: int = 60
    pipeline_steps: List[StepIn] = []
    stall_days: int = 3
    first_party_org: str = ""
    first_party_name: str = ""
    first_party_title: str = ""
    default_duration_days: int = 60
    currency: str = "ريال يمني"
    default_items: List[ItemIn] = []
    semester_weeks: int = 16
    letterhead_id: str = ""


@router.get("/letterheads")
async def vp_letterheads(u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_MANAGE_CONTRACTS, Permission.VP_STUDIO)
    return [{"id": str(x["_id"]), "name": x.get("name", ""), "is_default": bool(x.get("is_default"))}
            for x in await get_db().letterheads.find({"is_active": {"$ne": False}}, {"name": 1, "is_default": 1}).to_list(200)]


@router.get("/settings")
async def get_settings(u: dict = Depends(get_current_user)):
    if not _staff(u):
        raise HTTPException(status_code=403, detail="غير مصرح")
    st = await _settings(get_db())
    if not _fin(u):
        st.pop("default_items", None)
    return st


@router.put("/settings")
async def put_settings(body: SettingsIn, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_STUDIO, Permission.VP_MANAGE_CONTRACTS)
    data = body.dict()
    if not _fin(u):
        data["default_items"] = (await _settings(get_db()))["default_items"]
    for s in data["studios"]:
        s["id"] = s.get("id") or str(ObjectId())
    for i, it in enumerate(data["default_items"]):
        it["key"] = it.get("key") or f"i{i}_{ObjectId()}"[:12]
        if it["kind"] not in ("fixed", "recording"):
            it["kind"] = "fixed"
    if sum(1 for it in data["default_items"] if it["kind"] == "recording") > 1:
        raise HTTPException(status_code=400, detail="يُسمح ببند تسجيل مرئي واحد فقط")
    data["max_part_minutes"] = max(5, min(int(data["max_part_minutes"]), 240))
    data["semester_weeks"] = max(1, min(int(data["semester_weeks"]), 52))
    steps = data["pipeline_steps"] or (await _settings(get_db()))["pipeline_steps"]
    seen = set()
    for x in steps:
        x["name"] = x["name"].strip()
        if not x["name"]:
            raise HTTPException(status_code=400, detail="اسم المرحلة مطلوب")
        x["key"] = x.get("key") or "st_" + str(ObjectId())[-8:]
        if x["key"] in BASE_STATUS or x["key"] in seen:
            raise HTTPException(status_code=400, detail="مفتاح مرحلة مكرر")
        seen.add(x["key"])
        if x["requires_link"] and not x["link_label"].strip():
            x["link_label"] = f"رابط {x['name']}"
    if sum(1 for x in steps if x["is_filming"]) != 1:
        raise HTTPException(status_code=400, detail="حدّد مرحلة واحدة هي «التصوير» (منها تُحتسب المحاضرة للمعلم)")
    in_use = await get_db().vp_sessions.distinct("status", {"status": {"$nin": list(BASE_STATUS) + list(seen)}})
    if in_use:
        old = {x["key"]: x["name"] for x in (await _settings(get_db()))["pipeline_steps"]}
        raise HTTPException(status_code=400, detail="لا يمكن حذف مرحلة عليها تسجيلات حالياً: " + "، ".join(old.get(k, k) for k in in_use))
    old_steps = (await _settings(get_db()))["pipeline_steps"]
    old_keys = [x["key"] for x in old_steps]
    kept = [x["key"] for x in steps if x["key"] in old_keys]
    old_film = next((x["key"] for x in old_steps if x.get("is_filming")), None)
    new_film = next((x["key"] for x in steps if x.get("is_filming")), None)
    if (kept != [k for k in old_keys if k in kept] or old_film != new_film) and await get_db().vp_sessions.find_one({"status": {"$in": old_keys}}, {"_id": 1}):
        raise HTTPException(status_code=400, detail="توجد تسجيلات داخل مراحل الإنتاج: لا يمكن تغيير مرحلة «التصوير» أو ترتيب المراحل القائمة (يمكن تعديل الأسماء وإضافة مراحل جديدة)")
    data["pipeline_steps"] = steps
    await get_db().vp_settings.update_one({"_id": "main"}, {"$set": data}, upsert=True)
    out = await _settings(get_db())
    if not _fin(u):
        out.pop("default_items", None)
    return out


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
    semester_weeks: Optional[int] = None
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
    if d["weekly_hours"] <= 0:
        raise HTTPException(status_code=400, detail="الساعات الأسبوعية للمادة مطلوبة")
    d["semester_weeks"] = int(d["semester_weeks"] or (await _settings(db))["semester_weeks"])
    d["course_hours"] = round(d["weekly_hours"] * d["semester_weeks"], 2)
    d["required_hours"] = round(d["course_hours"] * 2 / 3, 2)
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
    fl = await _flow(db)
    allS = await _sessions(db, {"contract_id": {"$in": ids}}, fl)
    items = [_c_out(c, [s for s in allS if s["contract_id"] == str(c["_id"])], fl) for c in cs]
    fin = _fin(u)
    st = await _settings(db)
    lim = (_now() - timedelta(days=st["stall_days"])).isoformat()
    live = [c for c in items if c["status"] in ("issued", "completed")]
    kpis = {"active": sum(1 for c in items if c["status"] == "issued"), "late": sum(1 for c in items if c["status"] == "issued" and (c["progress"]["days_left"] or 0) < 0),
            "stalled": sum(1 for s in allS if (s.get("stalled") and s["status"] not in ("rejected", "cancelled")) or (s["status"] in fl.busy and s["status"] != fl.last and s.get("updated_at", "") < lim)),
            "accrued": sum(c["progress"]["accrued"] for c in live), "paid": sum(c["progress"]["paid"] for c in live),
            "pending_teacher": sum(1 for c in items if c["status"] in ("sent", "returned", "teacher_accepted"))}
    if not fin:
        items = [_strip_money(c) for c in items]
        kpis.pop("accrued"); kpis.pop("paid")
    return {"items": items, "kpis": kpis, "can_finance": fin}


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
    fl = await _flow(db)
    out = _c_out(c, await _sessions(db, {"contract_id": cid}, fl), fl, full=True)
    if _staff(u) and not _fin(u) and c["teacher_id"] not in await _my_tids(db, u):
        out = _strip_money(out)
    out["app_visible"] = await _app_visible(db, c["teacher_id"])
    return out


@router.put("/contracts/{cid}")
async def update_contract(cid: str, body: ContractIn, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_MANAGE_CONTRACTS)
    db = get_db()
    c = await _contract(db, cid, u, staff_only=True)
    if c["status"] in ("completed", "terminated", "sent", "teacher_accepted"):
        raise HTTPException(status_code=400, detail="لا يمكن التعديل والعقد بانتظار المدرس/التعميد أو منتهٍ — استرجعه أولاً")
    d = await _norm_contract(db, body)
    _guard_scope(u, d)
    old = {it["key"]: it for it in c.get("items", [])}
    for it in d["items"]:
        if it["key"] in old:
            it.update({k: old[it["key"]][k] for k in ("status", "delivered_at", "accepted_at", "note", "accepted_amount") if k in old[it["key"]]})
    note = "ملحق تعديل على عقد ساري" if c["status"] == "issued" else "تعديل بيانات العقد"
    if c["status"] == "returned":
        d["status"] = "draft"
    sig = lambda x: ([(i["key"], i["name"], float(i["amount"])) for i in x.get("items", [])], x.get("required_hours"), x.get("start_date"), x.get("end_date"), x.get("course_name"))
    reapprove = c["status"] == "issued" and sig(d) != sig(c)
    if reapprove:
        fl = await _flow(db)
        pr = _progress({**c, "items": [dict(i) for i in d["items"]]}, await _sessions(db, {"contract_id": cid}, fl), fl)
        if pr["balance"] < -0.01:
            raise HTTPException(status_code=400, detail="التعديل يجعل المستحق أقل من المصروف للمدرس")
        d.update({"status": "sent", "teacher_accepted_at": None})
        note += " — أُعيد للمدرس للموافقة ثم التعميد"
    await db.vp_contracts.update_one({"_id": c["_id"]}, {"$set": d, "$push": {"history": _hist(note, u)}})
    if reapprove:
        await notify_users(db, await _teacher_user_ids(db, c["teacher_id"]), "🎬 ملحق تعديل على عقدك", f"عُدّل عقد {c['course_name']} ({c['ref_no']}) — راجعه ووافق عليه من التطبيق",
                           "video_production", {"type": "video_contract", "id": cid, "route": "/video-production"})
    return {"ok": True, "status": d.get("status", c["status"])}


class ActIn(BaseModel):
    action: str
    note: str = ""


@router.post("/contracts/{cid}/status")
async def contract_status(cid: str, body: ActIn, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_MANAGE_CONTRACTS)
    db = get_db()
    c = await _contract(db, cid, u, staff_only=True)
    flow = {"send": ({"draft", "returned"}, "sent", "إرسال العقد للمدرس للموافقة"), "recall": ({"sent", "teacher_accepted"}, "draft", "استرجاع العقد للتعديل"),
            "issue": ({"teacher_accepted"}, "issued", "تعميد العقد — أصبح ساري وملزم"), "complete": ({"issued"}, "completed", "إنهاء العقد (مكتمل)"),
            "terminate": ({"draft", "sent", "returned", "teacher_accepted", "issued"}, "terminated", "إلغاء العقد"), "reopen": ({"completed"}, "issued", "إعادة فتح العقد"),
            "restore": ({"terminated"}, "draft", "استعادة العقد الملغى كمسودة (يتطلب إرساله للمدرس وتعميده من جديد)")}
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
    if body.action in ("send", "recall"):
        sets["teacher_accepted_at"] = None
    await db.vp_contracts.update_one({"_id": c["_id"]}, {"$set": sets, "$push": {"history": _hist(label, u, body.note)}})
    if body.action in ("send", "issue", "terminate"):
        await notify_users(db, await _teacher_user_ids(db, c["teacher_id"]), "🎬 عقد الإنتاج المرئي",
                           f"{label}: {c['course_name']} ({c['ref_no']})", "video_production", {"type": "video_contract", "id": cid, "route": "/video-production"})
    return {"ok": True, "status": to}


class ItemAct(BaseModel):
    status: str
    note: str = ""
    accepted_amount: Optional[float] = None


@router.put("/contracts/{cid}/items/{key}")
async def item_status(cid: str, key: str, body: ItemAct, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_MANAGE_CONTRACTS)
    db = get_db()
    c = await _contract(db, cid, u, staff_only=True)
    if c["status"] != "issued":
        raise HTTPException(status_code=400, detail="تعديل البنود متاح للعقود السارية فقط")
    it = next((i for i in c.get("items", []) if i["key"] == key), None)
    if not it:
        raise HTTPException(status_code=404, detail="البند غير موجود")
    if body.status not in ITEM_STATUS:
        raise HTTPException(status_code=400, detail="حالة غير صالحة")
    if body.status == "partial" and not (0 < (body.accepted_amount or 0) < it["amount"]):
        raise HTTPException(status_code=400, detail=f"أدخل المبلغ المقبول جزئياً (أقل من {it['amount']:,.0f})")
    fl = await _flow(db)
    new_items = [{**i, "status": body.status, "accepted_amount": body.accepted_amount} if i["key"] == key else dict(i) for i in c["items"]]
    if _progress({**c, "items": new_items}, await _sessions(db, {"contract_id": cid}, fl), fl)["balance"] < -0.01:
        raise HTTPException(status_code=400, detail="لا يمكن: سيصبح المستحق أقل مما صُرف للمدرس")
    now = _now().isoformat()
    upd = {"items.$.status": body.status, "items.$.note": body.note, "items.$.accepted_amount": body.accepted_amount if body.status == "partial" else None}
    if body.status == "delivered":
        upd["items.$.delivered_at"] = now
    if body.status in ("accepted", "partial"):
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
    if c["status"] not in ("issued", "completed", "terminated"):
        raise HTTPException(status_code=400, detail="لا يُصرف على عقد غير معمّد")
    if c["status"] == "terminated" and not body.note.strip():
        raise HTTPException(status_code=400, detail="العقد ملغى — الصرف للتسوية فقط مع ذكر ملاحظة التسوية")
    fl = await _flow(db)
    pr = _progress({k: v for k, v in c.items()}, await _sessions(db, {"contract_id": cid}, fl), fl)
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="المبلغ غير صالح")
    if body.amount > pr["balance"] + 0.01:
        raise HTTPException(status_code=400, detail=f"المبلغ يتجاوز المستحق غير المصروف ({pr['balance']:,.0f})")
    p = {"id": str(ObjectId()), "status": "pending", "amount": body.amount, "date": body.date or _now().date().isoformat(), "stage": body.stage, "note": body.note,
         "by": u.get("full_name") or u.get("username"), "at": _now().isoformat()}
    await db.vp_contracts.update_one({"_id": c["_id"]}, {"$push": {"payments": p, "history": _hist(f"صرف دفعة {body.amount:,.0f}", u, body.stage or body.note)}})
    await notify_users(db, await _teacher_user_ids(db, c["teacher_id"]), "💰 دفعة بانتظار تأكيد استلامك",
                       f"صُرف لك {body.amount:,.0f} من مستحقات عقد {c['course_name']} — أكّد الاستلام من التطبيق", "video_production",
                       {"type": "video_payment", "id": cid, "payment_id": p["id"], "route": "/video-production"})
    return p


@router.delete("/contracts/{cid}/payments/{pid}")
async def del_payment(cid: str, pid: str, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_PAYMENTS)
    db = get_db()
    c = await _contract(db, cid, u, staff_only=True)
    pay = next((p for p in c.get("payments", []) if p["id"] == pid), None)
    if not pay:
        raise HTTPException(status_code=404, detail="الدفعة غير موجودة")
    if pay.get("status", "received") == "received":
        raise HTTPException(status_code=400, detail="لا يمكن حذف دفعة أكّد المدرس استلامها (سند استلام)")
    await db.vp_contracts.update_one({"_id": c["_id"]}, {"$pull": {"payments": {"id": pid}}, "$push": {"history": _hist("حذف دفعة", u)}})
    return {"ok": True}


@router.get("/contracts/{cid}/pdf")
async def contract_pdf(cid: str, u: dict = Depends(get_current_user)):
    from services.vp_pdf import contract_pdf as build
    db = get_db()
    c = await _contract(db, cid, u)
    if _staff(u) and not _fin(u) and c["teacher_id"] not in await _my_tids(db, u):
        raise HTTPException(status_code=403, detail="العقد يتضمن بيانات مالية — غير مصرح")
    st = await _settings(db)
    pdf = build(c, st, await _letterhead(db, st))
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{c["ref_no"]}.pdf"'})


async def _letterhead(db, st: dict) -> dict:
    lid = st.get("letterhead_id")
    d = await db.letterheads.find_one({"_id": ObjectId(lid)}) if lid and ObjectId.is_valid(lid) else None
    return d or await db.letterheads.find_one({"is_default": True}) or {}


@router.get("/contracts/{cid}/statement")
async def statement_pdf(cid: str, u: dict = Depends(get_current_user)):
    from services.vp_pdf import statement_pdf as build
    db = get_db()
    c = await _contract(db, cid, u)
    if not (_fin(u) or c["teacher_id"] in await _my_tids(db, u)):
        raise HTTPException(status_code=403, detail="غير مصرح")
    fl = await _flow(db)
    out = _c_out(c, await _sessions(db, {"contract_id": cid}, fl), fl, full=True)
    st = await _settings(db)
    pdf = build(out, st, await _letterhead(db, st))
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="statement-{c["ref_no"]}.pdf"'})


class FlagIn(BaseModel):
    app_visible: bool


@router.get("/teachers/{tid}/flags")
async def get_flags(tid: str, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_MANAGE_CONTRACTS)
    return {"app_visible": await _app_visible(get_db(), tid)}


@router.put("/teachers/{tid}/flags")
async def put_flags(tid: str, body: FlagIn, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_MANAGE_CONTRACTS)
    db = get_db()
    await db.vp_teacher_flags.update_one({"_id": tid}, {"$set": {"app_visible": body.app_visible, "by": u["id"], "at": _now().isoformat()}}, upsert=True)
    await db.vp_contracts.update_many({"teacher_id": tid}, {"$push": {"history": _hist("إظهار التبويب في تطبيق المدرس" if body.app_visible else "إخفاء التبويب من تطبيق المدرس", u)}})
    return {"ok": True}


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
    q = {"studio_id": studio_id, "date": date, "status": {"$in": list((await _flow(db)).busy)}, "start": {"$lt": end}, "end": {"$gt": start}}
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
    if not (_staff(u) or await db.vp_contracts.find_one({"teacher_id": {"$in": await _visible_tids(db, u)}, "status": "issued"}, {"_id": 1})):
        raise HTTPException(status_code=403, detail="غير مصرح")
    end = _end(start, minutes)
    return {"studios": await _free_studios(db, st, date, start, end), "end": end}


async def _create_session(db, body: SessionIn, u: dict, c: dict, by_teacher: bool) -> dict:
    st = await _settings(db)
    if c["status"] != "issued":
        raise HTTPException(status_code=400, detail="الحجز متاح فقط للعقود المعتمدة السارية")
    if not (1 <= body.lecture_no <= 500):
        raise HTTPException(status_code=400, detail="رقم المحاضرة غير صالح")
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
         "photographer_notes": "", "links": {}, "stalled": None, "created_at": _now().isoformat(),
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
    db = get_db()
    return _sess_out(await _session(db, sid, u, staff_only=False), await _flow(db))


class SessAct(BaseModel):
    action: str
    note: str = ""
    studio_id: str = ""
    date: str = ""
    start: str = ""
    link: str = ""
    actual_minutes: Optional[int] = None


@router.post("/sessions/{sid}/action")
async def session_action(sid: str, body: SessAct, u: dict = Depends(get_current_user)):
    _need(u, Permission.VP_STUDIO)
    db = get_db()
    s = await _session(db, sid, u)
    a, st = body.action, s["status"]
    fl = await _flow(db)
    sets, label, notify = {}, "", a in ("confirm", "reschedule", "reject", "cancel", "stall")
    if a in ("confirm", "reschedule"):
        if st not in ("requested", "confirmed"):
            raise HTTPException(status_code=400, detail="لا يمكن تأكيد/نقل الحجز بعد بدء مراحل الإنتاج")
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
            raise HTTPException(status_code=400, detail="لا يمكن الإلغاء بعد بدء مراحل الإنتاج")
        sets, label = {"status": "cancelled"}, "إلغاء الحجز"
    elif a == "advance":
        if st not in fl.seq or st == fl.last:
            raise HTTPException(status_code=400, detail="لا توجد مرحلة تالية" if st == fl.last else "أكّد الحجز أولاً")
        nxt = fl.seq[fl.seq.index(st) + 1]
        step = fl.step(nxt)
        if step.get("requires_link") and not body.link.strip():
            raise HTTPException(status_code=400, detail=f"أدخل {step.get('link_label') or 'الرابط'}")
        sets, label = {"status": nxt, "stalled": None}, step["name"]
        notify = bool(step.get("notify")) and nxt not in (s.get("notified_steps") or [])
        if notify:
            sets["notified_steps"] = [*(s.get("notified_steps") or []), nxt]
        if body.link.strip():
            sets[f"links.{nxt}"] = body.link.strip()
        if step.get("is_filming") and body.actual_minutes:
            sets["actual_minutes"] = body.actual_minutes
    elif a == "back":
        if st not in fl.keys:
            raise HTTPException(status_code=400, detail="لا يمكن الرجوع من هذه المرحلة")
        prev = fl.seq[fl.seq.index(st) - 1]
        sets, label = {"status": prev}, f"إرجاع إلى «{fl.names[prev]}»"
    elif a == "stall":
        if st in ("requested", "rejected", "cancelled", fl.last):
            raise HTTPException(status_code=400, detail="لا يمكن تسجيل توقف لهذه الحالة")
        if not body.note.strip():
            raise HTTPException(status_code=400, detail="اكتب سبب التوقف")
        sets, label = {"stalled": {"reason": body.note.strip(), "at": _now().isoformat(), "stage": st}}, "توقف"
    elif a == "unstall":
        if not s.get("stalled"):
            raise HTTPException(status_code=400, detail="الجزء غير متوقف")
        sets, label = {"stalled": None}, "استئناف"
    else:
        raise HTTPException(status_code=400, detail="إجراء غير معروف")
    sets["updated_at"] = _now().isoformat()
    await db.vp_sessions.update_one({"_id": s["_id"]}, {"$set": sets, "$push": {"history": _hist(label, u, body.note)}})
    if notify:
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
    pdf = build(s, next((x["name"] for x in st["studios"] if x["id"] == s.get("studio_id")), ""), st["max_part_minutes"], await _letterhead(db, st))
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{s["ref_no"]}.pdf"'})


# ---------------- واجهة المعلم (تطبيق المدرس) ----------------
async def _visible_tids(db, u) -> List[str]:
    return [t for t in await _my_tids(db, u) if await _app_visible(db, t)]


@router.get("/my/contracts")
async def my_contracts(u: dict = Depends(get_current_user)):
    """التبويب يظهر في تطبيق المدرس فقط إذا أعاد عنصراً واحداً على الأقل (عقد مُرسل له + الإظهار مفعّل لهذا المدرس)"""
    db = get_db()
    tids = await _visible_tids(db, u)
    cs = await db.vp_contracts.find({"teacher_id": {"$in": tids}, "status": {"$in": list(TEACHER_VISIBLE)}}).sort("created_at", -1).to_list(100) if tids else []
    fl = await _flow(db)
    out = []
    for c in cs:
        o = _c_out(c, await _sessions(db, {"contract_id": str(c["_id"])}, fl), fl, full=True)
        o.pop("history", None)
        out.append(o)
    st = await _settings(db)
    return {"items": out, "settings": {"min_notice_hours": st["min_notice_hours"], "max_part_minutes": st["max_part_minutes"],
                                        "steps": [{k: x[k] for k in ("key", "name", "is_filming")} for x in st["pipeline_steps"]],
                                        "studios": [s for s in st["studios"] if s.get("is_active", True)], "currency": st["currency"]}}


async def _my_contract(db, cid: str, u) -> dict:
    c = await db.vp_contracts.find_one({"_id": _oid(cid)})
    if not c or c["teacher_id"] not in await _visible_tids(db, u) or c["status"] not in TEACHER_VISIBLE:
        raise HTTPException(status_code=404, detail="العقد غير موجود")
    return c


async def _notify_admin(db, c: dict, title: str, msg: str):
    ids = [c.get("created_by")] + [h.get("by_id") for h in c.get("history", []) if h.get("action", "").startswith(("إرسال", "تعميد"))]
    await notify_users(db, list({x for x in ids if x}), title, msg, "video_production", {"type": "video_contract", "id": str(c["_id"]), "route": "/video-production"})


@router.post("/my/contracts/{cid}/accept")
async def my_accept(cid: str, u: dict = Depends(get_current_user)):
    db = get_db()
    c = await _my_contract(db, cid, u)
    if c["status"] != "sent":
        raise HTTPException(status_code=400, detail="العقد ليس بانتظار موافقتك")
    await db.vp_contracts.update_one({"_id": c["_id"]}, {"$set": {"status": "teacher_accepted", "teacher_accepted_at": _now().isoformat()},
                                                        "$push": {"history": _hist("موافقة المدرس على العقد وبنوده", u)}})
    await _notify_admin(db, c, "🎬 وافق المدرس على العقد", f"{c['teacher_name']} وافق على عقد {c['course_name']} ({c['ref_no']}) — بانتظار التعميد")
    return {"ok": True}


class NoteIn(BaseModel):
    note: str = ""


@router.post("/my/contracts/{cid}/return")
async def my_return(cid: str, body: NoteIn, u: dict = Depends(get_current_user)):
    db = get_db()
    c = await _my_contract(db, cid, u)
    if c["status"] != "sent":
        raise HTTPException(status_code=400, detail="العقد ليس بانتظار موافقتك")
    if not body.note.strip():
        raise HTTPException(status_code=400, detail="اكتب ملاحظتك على العقد")
    await db.vp_contracts.update_one({"_id": c["_id"]}, {"$set": {"status": "returned", "teacher_note": body.note.strip()},
                                                        "$push": {"history": _hist("أعاد المدرس العقد بملاحظة", u, body.note.strip())}})
    await _notify_admin(db, c, "🎬 ملاحظة المدرس على العقد", f"{c['teacher_name']} أعاد عقد {c['ref_no']}: {body.note.strip()}")
    return {"ok": True}


class PayAnswer(BaseModel):
    action: str
    note: str = ""


@router.post("/my/contracts/{cid}/payments/{pid}")
async def my_payment_answer(cid: str, pid: str, body: PayAnswer, u: dict = Depends(get_current_user)):
    """تأكيد المدرس لاستلام الدفعة = سند استلام (يدخل كشف الحساب)، أو الاعتراض بملاحظة"""
    db = get_db()
    c = await _my_contract(db, cid, u)
    pay = next((p for p in c.get("payments", []) if p["id"] == pid), None)
    if not pay or pay.get("status") not in ("pending", "disputed"):
        raise HTTPException(status_code=400, detail="الدفعة غير موجودة أو مؤكدة مسبقاً")
    if body.action == "confirm":
        rno = await _next_ref(db, "VR", 5)
        sets = {"payments.$.status": "received", "payments.$.receipt_no": rno, "payments.$.received_at": _now().isoformat(), "payments.$.teacher_note": body.note}
        label, msg = f"تأكيد استلام دفعة {pay['amount']:,.0f} — سند {rno}", f"أكّد {c['teacher_name']} استلام {pay['amount']:,.0f} (سند {rno})"
    elif body.action == "dispute":
        if not body.note.strip():
            raise HTTPException(status_code=400, detail="اكتب سبب الاعتراض")
        sets = {"payments.$.status": "disputed", "payments.$.teacher_note": body.note.strip()}
        label, msg = f"اعتراض على دفعة {pay['amount']:,.0f}", f"{c['teacher_name']} اعترض على دفعة {pay['amount']:,.0f}: {body.note.strip()}"
    else:
        raise HTTPException(status_code=400, detail="إجراء غير معروف")
    await db.vp_contracts.update_one({"_id": c["_id"], "payments.id": pid}, {"$set": sets, "$push": {"history": _hist(label, u, body.note)}})
    await _notify_admin(db, c, "💰 الدفعات — الإنتاج المرئي", msg)
    return {"ok": True, **({"receipt_no": sets.get("payments.$.receipt_no")} if body.action == "confirm" else {})}


@router.get("/my/sessions")
async def my_sessions(u: dict = Depends(get_current_user)):
    db = get_db()
    return {"items": await _sessions(db, {"teacher_id": {"$in": await _visible_tids(db, u)}})}


@router.post("/my/sessions")
async def my_create_session(body: SessionIn, u: dict = Depends(get_current_user)):
    db = get_db()
    c = await _my_contract(db, body.contract_id, u)
    return await _create_session(db, body, u, c, by_teacher=True)


class MyCancel(BaseModel):
    note: str = ""


@router.post("/my/sessions/{sid}/cancel")
async def my_cancel(sid: str, body: MyCancel, u: dict = Depends(get_current_user)):
    db = get_db()
    s = await db.vp_sessions.find_one({"_id": _oid(sid), "teacher_id": {"$in": await _visible_tids(db, u)}})
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
    s = await db.vp_sessions.find_one({"_id": _oid(sid), "teacher_id": {"$in": await _visible_tids(db, u)}})
    if not s:
        raise HTTPException(status_code=404, detail="الحجز غير موجود")
    sets = {"materials_note": body.materials_note, "updated_at": _now().isoformat()}
    if body.teacher_notes is not None:
        sets["teacher_notes"] = body.teacher_notes
    await db.vp_sessions.update_one({"_id": s["_id"]}, {"$set": sets, "$push": {"history": _hist("تحديث المعلم للملحقات/الملاحظات", u, body.materials_note)}})
    return {"ok": True}
