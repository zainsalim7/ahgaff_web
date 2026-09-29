"""⏰ شؤون الموظفين — إعدادات الدوام المستقلة: فترات الدوام (صباحي/مسائي…) وتكليف الموظفين بها
صلاحية مستقلة: hr_manage_work_settings
"""
import re
from typing import Optional, List

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .deps import get_db, get_current_user, log_activity, has_permission
from .hr_common import P_WORK_SETTINGS, P_ATTEND, AR_DAYS, _now, _oid, _guard, parse_date, get_hr_settings, normalize_shifts, enrich_employee_refs, _hm_min

router = APIRouter(prefix="/hr/work-settings", tags=["شؤون الموظفين - إعدادات الدوام"])


class GeneralIn(BaseModel):
    work_days: List[str]
    holidays: List[dict] = []
    allow_self_checkin: bool = True
    geofence_required: bool = True
    annual_leave_days: int = 30
    correction_enabled: bool = True
    correction_window_minutes: int = 10


class ShiftIn(BaseModel):
    name: str
    work_start: str
    work_end: str
    late_grace_minutes: int = 15
    early_leave_grace_minutes: int = 0
    is_active: bool = True


class IdsIn(BaseModel):
    employee_ids: List[str]


class ShiftIdsIn(BaseModel):
    shift_ids: List[str]


def _hm(s: str, what: str) -> int:
    if not re.fullmatch(r"\d{2}:\d{2}", s or ""):
        raise HTTPException(status_code=400, detail=f"{what} بصيغة HH:MM")
    return _hm_min(s)


def _validate_shift(data: ShiftIn):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="اسم الفترة مطلوب")
    if _hm(data.work_start, "بداية الفترة") >= _hm(data.work_end, "نهاية الفترة"):
        raise HTTPException(status_code=400, detail="نهاية الفترة يجب أن تكون بعد بدايتها")
    if not (0 <= data.late_grace_minutes <= 180) or not (0 <= data.early_leave_grace_minutes <= 180):
        raise HTTPException(status_code=400, detail="السماحية بين 0 و180 دقيقة")


async def _save_shifts(db, shifts: list):
    await db.hr_settings.update_one({"_id": "global"}, {"$set": {**{k: v for k, v in normalize_shifts({"shifts": shifts}).items() if k in ("shifts", "work_start", "work_end", "late_grace_minutes", "early_leave_grace_minutes")}, "updated_at": _now()}}, upsert=True)


async def _full(db) -> dict:
    s = await get_hr_settings(db)
    main_id = s["shifts"][0]["id"]
    emps = await db.employees.find({"status": {"$nin": ["ended"]}}, {"shift_ids": 1}).to_list(10000)
    by_shift: dict = {sh["id"]: [] for sh in s["shifts"]}
    for e in emps:
        ids = [i for i in (e.get("shift_ids") or []) if i in by_shift] or [main_id]
        for i in ids:
            by_shift[i].append({"employee_id": str(e["_id"]), "explicit": bool(e.get("shift_ids"))})
    for sh in s["shifts"]:
        rows = by_shift[sh["id"]]
        await enrich_employee_refs(db, rows)
        sh["employees"] = sorted(rows, key=lambda r: r.get("employee_name") or "")
        sh["employees_count"] = len(rows)
        sh["is_main"] = sh["id"] == main_id
    s["days"] = list(AR_DAYS.values())
    return s


def _can_read(u: dict) -> bool:
    return has_permission(u, P_WORK_SETTINGS) or has_permission(u, P_ATTEND)


@router.get("")
async def read(current_user: dict = Depends(get_current_user)):
    if not _can_read(current_user):
        raise HTTPException(status_code=403, detail="ليست لديك صلاحية على إعدادات الدوام")
    s = await _full(get_db())
    s["can_edit"] = has_permission(current_user, P_WORK_SETTINGS)
    return s


@router.put("/general")
async def put_general(data: GeneralIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_WORK_SETTINGS)
    db = get_db()
    if not data.work_days or any(d not in AR_DAYS.values() for d in data.work_days):
        raise HTTPException(status_code=400, detail="أيام العمل غير صحيحة")
    if not (0 <= data.annual_leave_days <= 120):
        raise HTTPException(status_code=400, detail="أيام الإجازة السنوية بين 0 و120")
    if not (1 <= data.correction_window_minutes <= 120):
        raise HTTPException(status_code=400, detail="فترة التصحيح بين 1 و120 دقيقة")
    hol = []
    for h in data.holidays:
        if not h.get("date"):
            continue
        parse_date(h["date"], "تاريخ العطلة")
        hol.append({"date": h["date"][:10], "name": (h.get("name") or "عطلة رسمية").strip()})
    doc = {**data.dict(), "holidays": sorted(hol, key=lambda x: x["date"]), "updated_by_name": current_user.get("full_name", ""), "updated_at": _now()}
    await db.hr_settings.update_one({"_id": "global"}, {"$set": doc}, upsert=True)
    await log_activity(current_user, "hr_work_settings", "hr_settings", "global", "إعدادات الدوام العامة")
    return {"message": "تم حفظ إعدادات الدوام", "settings": await _full(db)}


@router.post("/shifts")
async def add_shift(data: ShiftIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_WORK_SETTINGS)
    _validate_shift(data)
    db = get_db()
    s = await get_hr_settings(db)
    if len(s["shifts"]) >= 6:
        raise HTTPException(status_code=400, detail="الحد الأقصى 6 فترات")
    sid = f"sh{str(ObjectId())[-6:]}"
    shifts = s["shifts"] + [{**data.dict(), "name": data.name.strip(), "id": sid}]
    await _save_shifts(db, shifts)
    await log_activity(current_user, "hr_shift_add", "hr_shift", sid, data.name)
    return {"message": f"أُضيفت فترة «{data.name.strip()}»", "shift_id": sid, "settings": await _full(db)}


@router.put("/shifts/{shift_id}")
async def update_shift(shift_id: str, data: ShiftIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_WORK_SETTINGS)
    _validate_shift(data)
    db = get_db()
    s = await get_hr_settings(db)
    if not any(sh["id"] == shift_id for sh in s["shifts"]):
        raise HTTPException(status_code=404, detail="الفترة غير موجودة")
    shifts = [{**sh, **data.dict(), "name": data.name.strip()} if sh["id"] == shift_id else sh for sh in s["shifts"]]
    if shift_id == s["shifts"][0]["id"] and not data.is_active:
        raise HTTPException(status_code=400, detail="لا يمكن تعطيل الفترة الأساسية")
    await _save_shifts(db, shifts)
    await log_activity(current_user, "hr_shift_update", "hr_shift", shift_id, data.name)
    return {"message": "تم تعديل الفترة", "settings": await _full(db)}


@router.delete("/shifts/{shift_id}")
async def delete_shift(shift_id: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_WORK_SETTINGS)
    db = get_db()
    s = await get_hr_settings(db)
    if len(s["shifts"]) <= 1 or shift_id == s["shifts"][0]["id"]:
        raise HTTPException(status_code=400, detail="لا يمكن حذف الفترة الأساسية")
    if not any(sh["id"] == shift_id for sh in s["shifts"]):
        raise HTTPException(status_code=404, detail="الفترة غير موجودة")
    await _save_shifts(db, [sh for sh in s["shifts"] if sh["id"] != shift_id])
    r = await db.employees.update_many({"shift_ids": shift_id}, {"$pull": {"shift_ids": shift_id}})
    await log_activity(current_user, "hr_shift_delete", "hr_shift", shift_id, "", {"unassigned": r.modified_count})
    return {"message": f"حُذفت الفترة وأُزيل تكليف {r.modified_count} موظف (يعودون للفترة الأساسية إن لم تبق لهم فترة)", "settings": await _full(db)}


@router.put("/shifts/{shift_id}/employees")
async def set_shift_employees(shift_id: str, data: IdsIn, current_user: dict = Depends(get_current_user)):
    """استبدال قائمة موظفي الفترة (يُضاف/يُزال التكليف دون المسّ بفتراتهم الأخرى)"""
    _guard(current_user, P_WORK_SETTINGS)
    db = get_db()
    s = await get_hr_settings(db)
    if not any(sh["id"] == shift_id for sh in s["shifts"]):
        raise HTTPException(status_code=404, detail="الفترة غير موجودة")
    oids = [ObjectId(i) for i in data.employee_ids if ObjectId.is_valid(i)]
    main_id = s["shifts"][0]["id"]
    # من كان ضمنياً على الأساسية (بلا تكليف) ويُزال منها → نثبّت له تكليفاً صريحاً فارغاً لا معنى له؛ لذا نتعامل مع الأساسية بإدراجها صريحاً
    async for e in db.employees.find({"status": {"$nin": ["ended"]}}, {"shift_ids": 1}):
        cur = list(e.get("shift_ids") or ([main_id] if shift_id == main_id else []))
        want = e["_id"] in oids
        new = [i for i in cur if i != shift_id] + ([shift_id] if want else [])
        if new != cur:
            await db.employees.update_one({"_id": e["_id"]}, {"$set": {"shift_ids": new}})
    await log_activity(current_user, "hr_shift_assign", "hr_shift", shift_id, f"{len(oids)} موظف")
    return {"message": "تم تحديث موظفي الفترة", "settings": await _full(db)}


@router.put("/employees/{employee_id}/shifts")
async def set_employee_shifts(employee_id: str, data: ShiftIdsIn, current_user: dict = Depends(get_current_user)):
    if not (has_permission(current_user, P_WORK_SETTINGS) or has_permission(current_user, "hr_manage_employees")):
        raise HTTPException(status_code=403, detail="ليست لديك صلاحية تكليف الفترات")
    db = get_db()
    s = await get_hr_settings(db)
    valid = {sh["id"] for sh in s["shifts"]}
    bad = [i for i in data.shift_ids if i not in valid]
    if bad:
        raise HTTPException(status_code=400, detail="فترة غير موجودة")
    oid = _oid(employee_id, "معرّف الموظف")
    if not await db.employees.find_one({"_id": oid}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    await db.employees.update_one({"_id": oid}, {"$set": {"shift_ids": list(dict.fromkeys(data.shift_ids))}})
    names = [sh["name"] for sh in s["shifts"] if sh["id"] in data.shift_ids] or [s["shifts"][0]["name"]]
    await log_activity(current_user, "hr_employee_shifts", "employee", employee_id, "، ".join(names))
    return {"message": f"فترات الموظف: {'، '.join(names)}", "shift_ids": data.shift_ids}
