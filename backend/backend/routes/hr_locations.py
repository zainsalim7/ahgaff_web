"""📍 شؤون الموظفين — مواقع العمل المعتمدة والتحقق الجغرافي (Geofencing) لحضور الموظفين"""
import math
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from .deps import get_db, get_current_user, log_activity
from .hr_common import P_ATTEND, _now, _oid, _ser, _guard, find_my_employee, get_hr_settings, enrich_employee_refs

router = APIRouter(prefix="/hr/locations", tags=["شؤون الموظفين - مواقع العمل"])

ACCURACY_TOLERANCE_M = 25  # أقصى تسامح يُضاف لنصف القطر بحسب دقة GPS
GEO_STATUS = {"in_range": "داخل النطاق", "out_of_range": "خارج النطاق", "no_location": "بدون موقع", "exempt": "مستثنى", "no_locations": "لا مواقع معرّفة", "disabled": "التحقق معطّل"}


class LocationIn(BaseModel):
    name: str
    latitude: float
    longitude: float
    radius_meters: int = 200
    is_active: bool = True
    description: Optional[str] = ""


class GeoIn(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    location_id: Optional[str] = None
    correction: bool = False


class ExemptIn(BaseModel):
    exempt: bool
    reason: Optional[str] = ""


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _validate(data: LocationIn):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="اسم الموقع مطلوب")
    if not (-90 <= data.latitude <= 90) or not (-180 <= data.longitude <= 180):
        raise HTTPException(status_code=400, detail="الإحداثيات غير صحيحة")
    if not (20 <= data.radius_meters <= 5000):
        raise HTTPException(status_code=400, detail="نصف القطر يجب أن يكون بين 20 و5000 متر")


async def active_locations(db) -> List[dict]:
    return [_ser(l) for l in await db.hr_locations.find({"is_active": True}).sort("name", 1).to_list(200)]


def rank_locations(locs: List[dict], lat: float, lng: float, accuracy: Optional[float]) -> List[dict]:
    tol = min(float(accuracy or 0), ACCURACY_TOLERANCE_M)
    out = []
    for l in locs:
        d = haversine_m(lat, lng, float(l["latitude"]), float(l["longitude"]))
        out.append({**l, "distance_m": round(d), "in_range": d <= float(l["radius_meters"]) + tol})
    return sorted(out, key=lambda x: x["distance_m"])


async def evaluate_geo(db, emp: dict, geo: Optional[GeoIn], settings: dict) -> dict:
    """يرجع سجل الموقع للحفظ مع الحضور، ويرفع 403 إن كان الموظف خارج النطاق والتحقق إلزامياً"""
    required = bool(settings.get("geofence_required", True))
    exempt = bool(emp.get("geofence_exempt"))
    rec = {"latitude": None, "longitude": None, "accuracy": None, "location_id": None, "location_name": "", "distance_m": None, "in_range": None, "status": "no_location", "required": required}
    has = geo is not None and geo.latitude is not None and geo.longitude is not None
    if has:
        rec.update({"latitude": geo.latitude, "longitude": geo.longitude, "accuracy": geo.accuracy})
        locs = await active_locations(db)
        if not locs:
            rec["status"] = "no_locations"
        else:
            ranked = rank_locations(locs, geo.latitude, geo.longitude, geo.accuracy)
            chosen = next((l for l in ranked if l["in_range"]), None)
            if geo.location_id:
                sel = next((l for l in ranked if l["id"] == geo.location_id), None)
                if sel and sel["in_range"]:
                    chosen = sel
            near = chosen or ranked[0]
            rec.update({"location_id": near["id"], "location_name": near["name"], "distance_m": near["distance_m"], "radius_meters": near["radius_meters"], "in_range": bool(chosen), "status": "in_range" if chosen else "out_of_range"})
    if exempt:
        rec["status"] = "exempt" if not has else rec["status"]
        rec["exempt"] = True
    elif not required:
        rec["status_note"] = "disabled"
    elif rec["status"] == "out_of_range":
        raise HTTPException(status_code=403, detail=f"أنت خارج نطاق العمل — أقرب موقع: {rec['location_name']} (يبعد {rec['distance_m']} م، والمسموح {rec['radius_meters']} م)")
    rec["status_label"] = GEO_STATUS.get(rec["status"], rec["status"])
    return rec


# ══════════════ للموظف ══════════════

@router.get("/active")
async def list_active(lat: Optional[float] = Query(None), lng: Optional[float] = Query(None), accuracy: Optional[float] = Query(None), current_user: dict = Depends(get_current_user)):
    db = get_db()
    settings = await get_hr_settings(db)
    emp = await find_my_employee(db, current_user)
    locs = await active_locations(db)
    items = rank_locations(locs, lat, lng, accuracy) if lat is not None and lng is not None else locs
    nearest = items[0] if items and lat is not None else None
    return {"locations": [{k: l.get(k) for k in ("id", "name", "latitude", "longitude", "radius_meters", "description", "distance_m", "in_range")} for l in items],
            "nearest_id": nearest["id"] if nearest else None, "in_any_range": any(l.get("in_range") for l in items),
            "geofence_required": bool(settings.get("geofence_required", True)), "is_exempt": bool((emp or {}).get("geofence_exempt")),
            "accuracy_tolerance_m": ACCURACY_TOLERANCE_M}


# ══════════════ الإدارة ══════════════

@router.get("")
async def list_locations(current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_ATTEND)
    db = get_db()
    settings = await get_hr_settings(db)
    return {"locations": [_ser(l) for l in await db.hr_locations.find({}).sort("name", 1).to_list(200)], "geofence_required": bool(settings.get("geofence_required", True))}


@router.post("")
async def create_location(data: LocationIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_ATTEND)
    _validate(data)
    db = get_db()
    doc = {**data.dict(), "name": data.name.strip(), "created_by_name": current_user.get("full_name", ""), "created_at": _now(), "updated_at": _now()}
    r = await db.hr_locations.insert_one(doc)
    await log_activity(current_user, "hr_location_create", "hr_location", str(r.inserted_id), doc["name"])
    return {"message": "تمت إضافة الموقع", "location": _ser({**doc, "_id": r.inserted_id})}


@router.put("/{loc_id}")
async def update_location(loc_id: str, data: LocationIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_ATTEND)
    _validate(data)
    db = get_db()
    oid = _oid(loc_id)
    if not await db.hr_locations.find_one({"_id": oid}):
        raise HTTPException(status_code=404, detail="الموقع غير موجود")
    await db.hr_locations.update_one({"_id": oid}, {"$set": {**data.dict(), "name": data.name.strip(), "updated_at": _now()}})
    await log_activity(current_user, "hr_location_update", "hr_location", loc_id, data.name)
    return {"message": "تم تعديل الموقع", "location": _ser(await db.hr_locations.find_one({"_id": oid}))}


@router.delete("/{loc_id}")
async def delete_location(loc_id: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_ATTEND)
    db = get_db()
    r = await db.hr_locations.delete_one({"_id": _oid(loc_id)})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="الموقع غير موجود")
    await log_activity(current_user, "hr_location_delete", "hr_location", loc_id, "")
    return {"message": "تم حذف الموقع"}


# ══════════════ الاستثناءات (أدمن فقط) ══════════════

def _admin(u: dict):
    if u.get("role") != "admin":
        raise HTTPException(status_code=403, detail="استثناء الموظفين من شرط الموقع متاح لمدير النظام فقط")


@router.get("/exemptions")
async def list_exemptions(current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_ATTEND)
    db = get_db()
    rows = [{"employee_id": str(e["_id"]), "reason": e.get("geofence_exempt_reason", ""), "since": e.get("geofence_exempt_at", "")} async for e in db.employees.find({"geofence_exempt": True}, {"geofence_exempt_reason": 1, "geofence_exempt_at": 1})]
    await enrich_employee_refs(db, rows)
    return {"items": rows, "can_manage": current_user.get("role") == "admin"}


@router.put("/exemptions/{employee_id}")
async def set_exemption(employee_id: str, data: ExemptIn, current_user: dict = Depends(get_current_user)):
    _admin(current_user)
    db = get_db()
    oid = _oid(employee_id, "معرّف الموظف")
    emp = await db.employees.find_one({"_id": oid}, {"full_name": 1})
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    if data.exempt:
        upd = {"$set": {"geofence_exempt": True, "geofence_exempt_reason": (data.reason or "").strip(), "geofence_exempt_at": _now(), "geofence_exempt_by_name": current_user.get("full_name", "")}}
    else:
        upd = {"$unset": {"geofence_exempt": "", "geofence_exempt_reason": "", "geofence_exempt_at": "", "geofence_exempt_by_name": ""}}
    await db.employees.update_one({"_id": oid}, upd)
    await log_activity(current_user, "hr_geofence_exempt" if data.exempt else "hr_geofence_unexempt", "employee", employee_id, emp.get("full_name", ""), {"reason": data.reason})
    return {"message": f"{'تم استثناء' if data.exempt else 'أُلغي استثناء'} {emp.get('full_name', '')} من شرط الموقع"}


# ══════════════ تقرير مواقع التسجيل ══════════════

@router.get("/report")
async def locations_report(date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_ATTEND)
    db = get_db()
    from .hr_common import _today
    d = (date or _today())[:10]
    recs = [_ser(r) for r in await db.hr_attendance.find({"date": d}).to_list(10000)]
    rows = []
    summary = {"in_range": 0, "out_of_range": 0, "no_location": 0, "exempt": 0, "manual": 0}
    for r in recs:
        g_in, g_out = r.get("check_in_geo") or {}, r.get("check_out_geo") or {}
        if r.get("source") != "self":
            summary["manual"] += 1
        st = g_in.get("status") or ("no_location" if r.get("source") == "self" else None)
        if st in summary:
            summary[st] += 1
        elif st == "no_locations":
            summary["no_location"] += 1
        rows.append({"employee_id": r["employee_id"], "status": r.get("status"), "check_in": r.get("check_in"), "check_out": r.get("check_out"), "source": r.get("source"),
                     "in": g_in or None, "out": g_out or None})
    await enrich_employee_refs(db, rows)
    return {"date": d, "summary": summary, "rows": rows, "locations": await active_locations(db), "status_labels": GEO_STATUS}
