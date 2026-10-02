"""🏖️ إعدادات الإجازات — أنواع الإجازات، الخصم من الرصيد، والأرصدة حسب الفئة (صلاحية مستقلة: hr_manage_leave_settings)"""
import re
from typing import Optional, Dict

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from .deps import get_db, get_current_user
from .hr_common import _can_view, _guard, _now, get_hr_settings, P_LEAVE_SETTINGS
from .deps import log_activity

router = APIRouter(prefix="/hr/leave-types", tags=["شؤون الموظفين - إعدادات الإجازات"])

CATEGORIES = {"academic": "أكاديمي", "administrative": "إداري", "technical": "فني", "service": "خدمات مساندة"}
# النظام القديم: السنوية وحدها تُخصم؛ تُنقل كما هي عند أول تشغيل
LEGACY = [
    ("annual", "سنوية", "#1565c0", True, "annual"), ("sick", "مرضية", "#dc2626", True, 30), ("emergency", "اضطرارية", "#f97316", True, 7),
    ("unpaid", "بدون راتب", "#64748b", False, None), ("maternity", "وضع / أمومة", "#db2777", False, None), ("hajj", "حج", "#0f766e", False, None),
    ("study", "دراسية", "#7c3aed", False, None), ("mission", "مهمة رسمية / انتداب", "#0284c7", False, None), ("other", "أخرى", "#94a3b8", False, None),
]


class LeaveTypeIn(BaseModel):
    key: Optional[str] = None
    name: str
    color: str = "#1565c0"
    deducts_balance: bool = True
    entitlements: Dict[str, Optional[int]] = {}
    requires_attachment: bool = False
    paid: bool = True
    is_active: bool = True
    order: int = 0
    note: Optional[str] = ""
    carry_over_enabled: bool = False
    carry_over_max_days: Optional[int] = None


def _ser(t: dict) -> dict:
    t = dict(t)
    t.pop("_id", None)
    t["entitlements"] = {c: (t.get("entitlements") or {}).get(c) for c in CATEGORIES}
    t["has_balance"] = bool(t.get("deducts_balance")) and any(v is not None for v in t["entitlements"].values())
    return t


async def get_leave_types(db, active_only: bool = False) -> list:
    """يعيد الأنواع مرتبة — ويزرع الأنواع القديمة تلقائياً إن كانت المجموعة فارغة"""
    if await db.hr_leave_types.count_documents({}) == 0:
        settings = await get_hr_settings(db)
        annual = int(settings.get("annual_leave_days", 30))
        docs = []
        for i, (key, name, color, deducts, ent) in enumerate(LEGACY):
            e = annual if ent == "annual" else ent
            docs.append({"key": key, "name": name, "color": color, "deducts_balance": deducts, "entitlements": {c: (e if deducts else None) for c in CATEGORIES},
                         "requires_attachment": key == "sick", "paid": key != "unpaid", "is_active": True, "order": i, "note": "", "created_at": _now(), "system": key == "annual"})
        await db.hr_leave_types.insert_many(docs)
    q = {"is_active": True} if active_only else {}
    return [_ser(t) for t in await db.hr_leave_types.find(q).sort([("order", 1), ("name", 1)]).to_list(200)]


async def leave_types_map(db, active_only: bool = False) -> dict:
    return {t["key"]: t for t in await get_leave_types(db, active_only)}


def entitlement_for(t: dict, emp: dict) -> Optional[int]:
    """استحقاق الموظف من هذا النوع حسب فئته — None = بلا رصيد محدد (غير محدود/لا يُخصم)"""
    if not t or not t.get("deducts_balance"):
        return None
    ents = t.get("entitlements") or {}
    cat = emp.get("category") or "administrative"
    v = ents.get(cat)
    if v is None and cat not in ents:
        v = ents.get("administrative")
    return None if v is None else int(v)


def _validate(data: LeaveTypeIn):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="اسم النوع مطلوب")
    for c, v in (data.entitlements or {}).items():
        if c not in CATEGORIES:
            raise HTTPException(status_code=400, detail=f"فئة غير معروفة: {c}")
        if v is not None and not (0 <= int(v) <= 365):
            raise HTTPException(status_code=400, detail="الاستحقاق بين 0 و365 يوماً")
    if data.carry_over_max_days is not None and not (0 <= data.carry_over_max_days <= 365):
        raise HTTPException(status_code=400, detail="حد الترحيل بين 0 و365 يوماً")
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", data.color or ""):
        data.color = "#1565c0"


@router.get("")
async def list_types(current_user: dict = Depends(get_current_user)):
    if not _can_view(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_db()
    types = await get_leave_types(db)
    usage = {u["_id"]: u["n"] async for u in db.leave_requests.aggregate([{"$group": {"_id": "$type", "n": {"$sum": 1}}}])}
    for t in types:
        t["usage"] = usage.get(t["key"], 0)
    return {"items": types, "categories": CATEGORIES, "can_edit": current_user.get("role") == "admin" or P_LEAVE_SETTINGS in (current_user.get("permissions") or [])}


@router.post("")
async def create_type(data: LeaveTypeIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_LEAVE_SETTINGS)
    db = get_db()
    _validate(data)
    await get_leave_types(db)
    key = re.sub(r"[^a-z0-9_]", "", (data.key or "").strip().lower()) or f"type_{int(__import__('time').time())}"
    if await db.hr_leave_types.find_one({"key": key}):
        raise HTTPException(status_code=400, detail="المعرّف مستخدم مسبقاً")
    doc = {**data.model_dump(), "key": key, "name": data.name.strip(), "entitlements": {c: (data.entitlements or {}).get(c) for c in CATEGORIES}, "created_at": _now(), "system": False}
    await db.hr_leave_types.insert_one(doc)
    await log_activity(current_user, "hr_leave_type_create", "leave_type", key, doc["name"])
    return {"message": f"تمت إضافة نوع الإجازة «{doc['name']}»", "item": _ser(doc)}


@router.put("/{key}")
async def update_type(key: str, data: LeaveTypeIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_LEAVE_SETTINGS)
    db = get_db()
    _validate(data)
    old = await db.hr_leave_types.find_one({"key": key})
    if not old:
        raise HTTPException(status_code=404, detail="النوع غير موجود")
    if old.get("system") and not data.is_active:
        raise HTTPException(status_code=400, detail="لا يمكن تعطيل الإجازة السنوية")
    upd = {k: v for k, v in data.model_dump().items() if k != "key"}
    upd["name"] = data.name.strip()
    upd["entitlements"] = {c: (data.entitlements or {}).get(c) for c in CATEGORIES}
    upd["updated_at"] = _now()
    await db.hr_leave_types.update_one({"key": key}, {"$set": upd})
    await log_activity(current_user, "hr_leave_type_update", "leave_type", key, upd["name"], {"deducts_balance": data.deducts_balance, "entitlements": upd["entitlements"]})
    return {"message": "تم حفظ نوع الإجازة", "item": _ser({**old, **upd})}


@router.delete("/{key}")
async def delete_type(key: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_LEAVE_SETTINGS)
    db = get_db()
    old = await db.hr_leave_types.find_one({"key": key})
    if not old:
        raise HTTPException(status_code=404, detail="النوع غير موجود")
    if old.get("system"):
        raise HTTPException(status_code=400, detail="لا يمكن حذف الإجازة السنوية")
    used = await db.leave_requests.count_documents({"type": key})
    if used:
        await db.hr_leave_types.update_one({"key": key}, {"$set": {"is_active": False, "updated_at": _now()}})
        return {"message": f"النوع مستخدم في {used} طلباً — تم تعطيله بدل حذفه", "deactivated": True}
    await db.hr_leave_types.delete_one({"key": key})
    await log_activity(current_user, "hr_leave_type_delete", "leave_type", key, old.get("name", ""))
    return {"message": "تم حذف نوع الإجازة", "deactivated": False}
