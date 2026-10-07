"""📄 مكتبة الكليشات و🔢 سلاسل الترقيم للخطابات الرسمية — مستقلة عن الإفادات.
المالك (أو الأدمن) يعدّل/يحذف؛ الرؤية: private | unit (كليات/وحدات المالك) | roles | all"""
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .deps import get_db, get_current_user, log_activity, has_permission, has_any_permission
from .hr_common import find_my_employee, user_id_of

router = APIRouter(tags=["كليشات الخطابات"])
DEFAULT_REF = "{seq}/خ/{yy}"
P_ISSUE, HR_PERMS = "issue_letters", ["hr_manage_correspondence", "hr_manage_employees"]


def _guard(user: dict):
    if user.get("role") in ("teacher", "student") or not (has_permission(user, P_ISSUE) or has_any_permission(user, HR_PERMS)):
        raise HTTPException(status_code=403, detail="ليست لديك صلاحية إصدار الخطابات الرسمية")


def _ser(d: dict, user: dict) -> dict:
    d = dict(d)
    d["id"] = str(d.pop("_id"))
    d["can_edit"] = user.get("role") == "admin" or d.get("owner_id") == user_id_of(user)
    return d


class Visibility(BaseModel):
    type: str = "private"           # private | unit | roles | all
    roles: list = []


async def _user_units(db, user: dict) -> tuple:
    fids = {str(f) for f in (user.get("faculty_ids") or []) if f}
    if user.get("faculty_id"):
        fids.add(str(user["faculty_id"]))
    emp = await find_my_employee(db, user)
    units = {str(emp["org_unit_id"])} if emp and emp.get("org_unit_id") else set()
    return sorted(fids), sorted(units)


async def visible_filter(db, user: dict) -> dict:
    if user.get("role") == "admin":
        return {"is_active": {"$ne": False}}
    fids, units = await _user_units(db, user)
    ors = [{"owner_id": user_id_of(user)}, {"visibility.type": "all"}, {"visibility.type": "roles", "visibility.roles": user.get("role")}]
    if fids:
        ors.append({"visibility.type": "unit", "unit_faculty_ids": {"$in": fids}})
    if units:
        ors.append({"visibility.type": "unit", "unit_org_unit_ids": {"$in": units}})
    return {"is_active": {"$ne": False}, "$or": ors}


async def _owned_or_admin(db, coll, oid: str, user: dict) -> dict:
    doc = await db[coll].find_one({"_id": ObjectId(oid)}) if ObjectId.is_valid(oid) else None
    if not doc:
        raise HTTPException(status_code=404, detail="غير موجود")
    if user.get("role") != "admin" and doc.get("owner_id") != user_id_of(user):
        raise HTTPException(status_code=403, detail="يمكن للمالك أو الأدمن فقط التعديل")
    return doc


async def _owner_fields(db, user: dict, vis: Visibility) -> dict:
    fids, units = await _user_units(db, user)
    return {"visibility": vis.dict(), "unit_faculty_ids": fids if vis.type == "unit" else [], "unit_org_unit_ids": units if vis.type == "unit" else [],
            "updated_at": datetime.now(timezone.utc).isoformat()}


@router.get("/letterheads/meta/roles")
async def roles_meta(current_user: dict = Depends(get_current_user)):
    """الأدوار المتاحة لتحديد رؤية الكليشة/السلسلة (لكل مصرّح له)"""
    _guard(current_user)
    rows = await get_db().roles.find({}, {"name": 1, "system_key": 1, "key": 1}).sort("name", 1).to_list(200)
    return [{"key": r.get("system_key") or r.get("key") or str(r["_id"]), "name": r.get("name", "")} for r in rows if r.get("system_key") not in ("student", "teacher")]


# ───────── الكليشات ─────────
class LetterheadIn(BaseModel):
    name: str
    description: Optional[str] = ""
    org_name: Optional[str] = "جامعة الأحقاف"
    org_name_en: Optional[str] = "AL-AHGAFF UNIVERSITY"
    office_name: Optional[str] = ""
    office_name_en: Optional[str] = ""
    logo_base64: Optional[str] = ""
    signature_base64: Optional[str] = ""
    default_signatory_name: Optional[str] = ""
    default_signatory_title: Optional[str] = ""
    default_signatory_position_id: Optional[str] = ""
    phones: Optional[str] = ""
    fax: Optional[str] = ""
    address: Optional[str] = ""
    po_box: Optional[str] = ""
    website: Optional[str] = ""
    closing: Optional[str] = "وتفضلوا بقبول فائق الاحترام والتقدير،"
    layout: Optional[dict] = None
    header_image_base64: Optional[str] = ""
    footer_image_base64: Optional[str] = ""
    visibility: Visibility = Visibility()


@router.get("/letterheads")
async def list_letterheads(current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    rows = await db.letterheads.find(await visible_filter(db, current_user), {"logo_base64": 0, "signature_base64": 0, "header_image_base64": 0, "footer_image_base64": 0}).sort([("is_default", -1), ("name", 1)]).to_list(200)
    return [_ser(r, current_user) for r in rows]


@router.get("/letterheads/{lid}")
async def get_letterhead(lid: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    doc = await db.letterheads.find_one({"_id": ObjectId(lid), **(await visible_filter(db, current_user))}) if ObjectId.is_valid(lid) else None
    if not doc:
        raise HTTPException(status_code=404, detail="الكليشة غير موجودة أو خارج نطاقك")
    return _ser(doc, current_user)


@router.post("/letterheads")
async def create_letterhead(data: LetterheadIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    doc = {**data.dict(exclude={"visibility"}), **(await _owner_fields(db, current_user, data.visibility)), "owner_id": user_id_of(current_user),
           "owner_name": current_user.get("full_name", ""), "is_default": False, "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()}
    r = await db.letterheads.insert_one(doc)
    await log_activity(current_user, "create_letterhead", "letterhead", str(r.inserted_id), data.name)
    return {"id": str(r.inserted_id)}


@router.put("/letterheads/{lid}")
async def update_letterhead(lid: str, data: LetterheadIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    await _owned_or_admin(db, "letterheads", lid, current_user)
    await db.letterheads.update_one({"_id": ObjectId(lid)}, {"$set": {**data.dict(exclude={"visibility"}), **(await _owner_fields(db, current_user, data.visibility))}})
    return {"ok": True}


@router.delete("/letterheads/{lid}")
async def delete_letterhead(lid: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    doc = await _owned_or_admin(db, "letterheads", lid, current_user)
    if doc.get("is_default"):
        raise HTTPException(status_code=400, detail="لا يمكن حذف الكليشة الافتراضية العامة — عيّن كليشة أخرى افتراضية أولاً")
    await db.letterheads.update_one({"_id": ObjectId(lid)}, {"$set": {"is_active": False}})
    return {"ok": True}


@router.post("/letterheads/{lid}/set-default")
async def set_default_letterhead(lid: str, current_user: dict = Depends(get_current_user)):
    """الافتراضية العامة (الأدمن) — يجب أن تكون مرئية للجميع"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="الأدمن فقط")
    db = get_db()
    doc = await db.letterheads.find_one({"_id": ObjectId(lid)}) if ObjectId.is_valid(lid) else None
    if not doc:
        raise HTTPException(status_code=404, detail="غير موجودة")
    await db.letterheads.update_many({}, {"$set": {"is_default": False}})
    await db.letterheads.update_one({"_id": doc["_id"]}, {"$set": {"is_default": True, "visibility": {"type": "all", "roles": []}}})
    return {"ok": True}


# ───────── سلاسل الترقيم ─────────
class SeriesIn(BaseModel):
    name: str
    description: Optional[str] = ""
    format: str = DEFAULT_REF          # {seq} {year} {yy}
    reset_yearly: bool = True
    start_at: int = 1                   # أول رقم يُمنح
    visibility: Visibility = Visibility()


def format_number(fmt: str, seq: int, year: int) -> str:
    fmt = (fmt or "").strip() or DEFAULT_REF
    return fmt.replace("{seq}", str(seq)).replace("{year}", str(year)).replace("{yy}", str(year % 100))


def _series_view(s: dict, year: int) -> dict:
    cur = (s.get("counters") or {}).get(str(year), 0) if s.get("reset_yearly", True) else s.get("seq", 0)
    nxt = max(cur + 1, int(s.get("start_at") or 1))
    return {"current": cur, "next_number": format_number(s.get("format"), nxt, year)}


async def next_serial(db, series: dict) -> tuple:
    """يحجز الرقم التالي ذرياً ويرجع (seq, year, number_display)"""
    year = datetime.now(timezone.utc).year
    field = f"counters.{year}" if series.get("reset_yearly", True) else "seq"
    start = int(series.get("start_at") or 1)
    upd = await db.letter_series.find_one_and_update({"_id": series["_id"]}, {"$inc": {field: 1}}, return_document=True)
    seq = (upd.get("counters") or {}).get(str(year), 0) if series.get("reset_yearly", True) else upd.get("seq", 0)
    if seq < start:
        await db.letter_series.update_one({"_id": series["_id"]}, {"$set": {field: start}})
        seq = start
    return seq, year, format_number(series.get("format"), seq, year)


@router.get("/letter-series")
async def list_series(current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    year = datetime.now(timezone.utc).year
    rows = await db.letter_series.find(await visible_filter(db, current_user)).sort([("is_default", -1), ("name", 1)]).to_list(200)
    return [{**_ser(r, current_user), **_series_view(r, year)} for r in rows]


@router.post("/letter-series")
async def create_series(data: SeriesIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    if "{seq}" not in data.format:
        raise HTTPException(status_code=400, detail="الصيغة يجب أن تحوي {seq}")
    doc = {**data.dict(exclude={"visibility"}), **(await _owner_fields(db, current_user, data.visibility)), "owner_id": user_id_of(current_user),
           "owner_name": current_user.get("full_name", ""), "counters": {}, "seq": 0, "is_default": False, "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()}
    r = await db.letter_series.insert_one(doc)
    await log_activity(current_user, "create_letter_series", "letter_series", str(r.inserted_id), data.name)
    return {"id": str(r.inserted_id)}


@router.put("/letter-series/{sid}")
async def update_series(sid: str, data: SeriesIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    await _owned_or_admin(db, "letter_series", sid, current_user)
    if "{seq}" not in data.format:
        raise HTTPException(status_code=400, detail="الصيغة يجب أن تحوي {seq}")
    await db.letter_series.update_one({"_id": ObjectId(sid)}, {"$set": {**data.dict(exclude={"visibility"}), **(await _owner_fields(db, current_user, data.visibility))}})
    return {"ok": True}


@router.delete("/letter-series/{sid}")
async def delete_series(sid: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    doc = await _owned_or_admin(db, "letter_series", sid, current_user)
    if doc.get("is_default"):
        raise HTTPException(status_code=400, detail="لا يمكن حذف سلسلة الترقيم الافتراضية العامة")
    await db.letter_series.update_one({"_id": ObjectId(sid)}, {"$set": {"is_active": False}})
    return {"ok": True}


@router.post("/letter-series/{sid}/set-default")
async def set_default_series(sid: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="الأدمن فقط")
    db = get_db()
    doc = await db.letter_series.find_one({"_id": ObjectId(sid)}) if ObjectId.is_valid(sid) else None
    if not doc:
        raise HTTPException(status_code=404, detail="غير موجودة")
    await db.letter_series.update_many({}, {"$set": {"is_default": False}})
    await db.letter_series.update_one({"_id": doc["_id"]}, {"$set": {"is_default": True, "visibility": {"type": "all", "roles": []}}})
    return {"ok": True}


# ───────── الحل عند الإصدار ─────────
async def resolve_letterhead(db, user: dict, lid: Optional[str]) -> dict:
    """الكليشة المختارة إن كانت مرئية للمستخدم، وإلا الافتراضية العامة"""
    vis = await visible_filter(db, user)
    if lid and ObjectId.is_valid(lid):
        doc = await db.letterheads.find_one({"_id": ObjectId(lid), **vis})
        if doc:
            return doc
        raise HTTPException(status_code=403, detail="الكليشة المختارة غير متاحة لك")
    return await db.letterheads.find_one({"is_default": True}) or await db.letterheads.find_one(vis) or {}


async def resolve_series(db, user: dict, sid: Optional[str]) -> dict:
    vis = await visible_filter(db, user)
    if sid and ObjectId.is_valid(sid):
        doc = await db.letter_series.find_one({"_id": ObjectId(sid), **vis})
        if doc:
            return doc
        raise HTTPException(status_code=403, detail="سلسلة الترقيم المختارة غير متاحة لك")
    doc = await db.letter_series.find_one({"is_default": True}) or await db.letter_series.find_one(vis)
    if not doc:
        raise HTTPException(status_code=400, detail="لا توجد سلسلة ترقيم متاحة — أنشئ واحدة أولاً")
    return doc


async def migrate_letterheads(db):
    """ترحيل مرة واحدة: letter_settings → «الكليشة العامة»، letter_counters → «الترقيم العام» (يستمر من الرقم الحالي)، وربط الخطابات القديمة"""
    now = datetime.now(timezone.utc).isoformat()
    if not await db.letterheads.find_one({}):
        s = await db.letter_settings.find_one({"_id": "default"}) or {}
        s.pop("_id", None); s.pop("updated_at", None)
        base = LetterheadIn(name="الكليشة العامة", **{k: v for k, v in s.items() if k in LetterheadIn.model_fields and k != "name"}).dict(exclude={"visibility"})
        await db.letterheads.insert_one({**base, "description": "الكليشة الأصلية للخطابات الرسمية", "visibility": {"type": "all", "roles": []}, "unit_faculty_ids": [], "unit_org_unit_ids": [],
                                         "owner_id": "", "owner_name": "النظام", "is_default": True, "is_active": True, "system_key": "general", "created_at": now, "updated_at": now})
    if not await db.letter_series.find_one({}):
        s = await db.letter_settings.find_one({"_id": "default"}) or {}
        counters = {c["_id"]: int(c.get("seq", 0)) async for c in db.letter_counters.find({"_id": {"$ne": "draft"}})}
        await db.letter_series.insert_one({"name": "الترقيم العام", "description": "التسلسل الأصلي للخطابات الرسمية", "format": s.get("reference_format") or DEFAULT_REF, "reset_yearly": True, "start_at": 1,
                                           "counters": counters, "seq": 0, "visibility": {"type": "all", "roles": []}, "unit_faculty_ids": [], "unit_org_unit_ids": [],
                                           "owner_id": "", "owner_name": "النظام", "is_default": True, "is_active": True, "system_key": "general", "created_at": now, "updated_at": now})
    lh = await db.letterheads.find_one({"system_key": "general"}) or await db.letterheads.find_one({"is_default": True})
    sr = await db.letter_series.find_one({"system_key": "general"}) or await db.letter_series.find_one({"is_default": True})
    if lh and sr:
        await db.letters.update_many({"letterhead_id": {"$exists": False}}, {"$set": {"letterhead_id": str(lh["_id"]), "letterhead_name": lh["name"], "series_id": str(sr["_id"]), "series_name": sr["name"]}})
