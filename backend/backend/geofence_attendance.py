"""
النطاق الجغرافي لتحضير المحاضرات — Campus geofence for teacher attendance
- GET  /geofence/campus              : حدود الكلية (يخزّنها التطبيق محلياً ليقيّم الموقع حتى أوفلاين)
- PUT  /geofence/campus              : (admin) ضبط المواقع المعتمدة
- GET  /reports/attendance-locations : (admin/dean/department_head) المحاضرات المُحضَّرة خارج النطاق / بدون موقع
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from bson import ObjectId

YEMEN_TIMEZONE = timezone(timedelta(hours=3))
REVIEWER_ROLES = {"admin", "dean", "department_head"}
SETTINGS_KEY = "campus_geofence"


def build_router(db, get_current_user) -> APIRouter:
    router = APIRouter(tags=["geofence"])

    async def load_settings() -> dict:
        doc = await db.app_settings.find_one({"key": SETTINGS_KEY}) or {}
        return {"enabled": doc.get("enabled", True), "locations": doc.get("locations", []), "updated_at": doc.get("updated_at")}

    @router.get("/geofence/campus")
    async def get_campus(current_user: dict = Depends(get_current_user)):
        """حدود الكلية = مواقع HR المعتمدة (hr_locations النشطة — المصدر الأساسي) + أي مواقع إضافية في إعدادات geofence"""
        s = await load_settings()
        locs = []
        hr_docs = await db.hr_locations.find({"is_active": True}).sort("name", 1).to_list(200)
        latest = s["updated_at"] or ""
        for h in hr_docs:
            lat, lng = h.get("latitude"), h.get("longitude")
            if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
                locs.append({"id": str(h["_id"]), "name": h.get("name", ""), "lat": lat, "lng": lng, "radius_m": h.get("radius_meters") or 200, "source": "hr"})
                latest = max(latest, str(h.get("updated_at") or h.get("created_at") or ""))
        locs += [{"id": str(l.get("id") or i), "name": l.get("name", ""), "lat": l["lat"], "lng": l["lng"], "radius_m": l.get("radius_m", 200), "source": "geofence"}
                 for i, l in enumerate(s["locations"]) if "lat" in l and "lng" in l]
        return {"enabled": s["enabled"], "locations": locs, "updated_at": latest or None}

    @router.put("/geofence/campus")
    async def set_campus(request: Request, current_user: dict = Depends(get_current_user)):
        if current_user["role"] != "admin":
            raise HTTPException(status_code=403, detail="غير مصرح لك")
        body = await request.json()
        locations = body.get("locations", [])
        for l in locations:
            if not isinstance(l.get("lat"), (int, float)) or not isinstance(l.get("lng"), (int, float)):
                raise HTTPException(status_code=400, detail="كل موقع يحتاج lat و lng رقميين")
            l.setdefault("radius_m", 200)
            l.setdefault("id", str(ObjectId()))
        await db.app_settings.update_one(
            {"key": SETTINGS_KEY},
            {"$set": {"enabled": body.get("enabled", True), "locations": locations, "updated_at": datetime.now(YEMEN_TIMEZONE).isoformat()}},
            upsert=True,
        )
        return {"message": "تم حفظ حدود الكلية", "count": len(locations)}

    @router.post("/geofence/reevaluate")
    async def reevaluate(start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        """🔁 (admin) إعادة تقييم المحاضرات المسجَّلة بإحداثيات مقابل الحدود الحالية (HR + geofence) — لتصحيح ما قُيّم على الهاتف بحدود قديمة"""
        if current_user["role"] != "admin":
            raise HTTPException(status_code=403, detail="غير مصرح لك")
        campus = await get_campus(current_user)
        locs = campus["locations"]
        if not locs:
            raise HTTPException(status_code=400, detail="لا توجد مواقع معتمدة")
        import math

        def haversine(lat1, lng1, lat2, lng2):
            r = 6371000.0
            p1, p2 = math.radians(lat1), math.radians(lat2)
            dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
            a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
            return 2 * r * math.asin(math.sqrt(a))

        q = {"attendance_location.status": "ok", "attendance_location.lat": {"$type": "number"}, "attendance_location.lng": {"$type": "number"}}
        if start_date:
            q.setdefault("date", {})["$gte"] = start_date
        if end_date:
            q.setdefault("date", {})["$lte"] = end_date
        changed = scanned = 0
        async for lec in db.lectures.find(q, {"attendance_location": 1, "attendance_outside_campus": 1}):
            scanned += 1
            loc = lec["attendance_location"]
            best = min(locs, key=lambda l: haversine(loc["lat"], loc["lng"], l["lat"], l["lng"]))
            d = haversine(loc["lat"], loc["lng"], best["lat"], best["lng"])
            inside = d <= float(best.get("radius_m") or 200) + float(loc.get("accuracy") or 0)
            new_loc = {**loc, "inside_campus": inside, "nearest_location_id": best["id"], "nearest_location_name": best["name"], "distance_m": round(d)}
            if new_loc != loc or lec.get("attendance_outside_campus") != (not inside):
                changed += 1
                await db.lectures.update_one({"_id": lec["_id"]}, {"$set": {"attendance_location": new_loc, "attendance_outside_campus": not inside}})
        return {"message": f"أُعيد تقييم {scanned} محاضرة — تغيّر تصنيف {changed}", "scanned": scanned, "changed": changed, "locations": len(locs)}

    @router.get("/reports/attendance-locations")
    async def attendance_locations_report(
        start_date: Optional[str] = None, end_date: Optional[str] = None,
        department_id: Optional[str] = None, only_flagged: bool = True,
        current_user: dict = Depends(get_current_user),
    ):
        """المحاضرات التي حُضّرت خارج الكلية أو بدون موقع — للإدارة فقط"""
        if current_user["role"] not in REVIEWER_ROLES:
            raise HTTPException(status_code=403, detail="غير مصرح لك")

        course_q = {}
        u = await db.users.find_one({"_id": ObjectId(current_user["id"])}) or {}
        if current_user["role"] == "department_head":
            dept_ids = u.get("department_ids") or ([u["department_id"]] if u.get("department_id") else [])
            course_q["department_id"] = {"$in": dept_ids}
        elif current_user["role"] == "dean" and u.get("faculty_id"):
            depts = await db.departments.find({"faculty_id": u["faculty_id"]}, {"_id": 1}).to_list(200)
            course_q["department_id"] = {"$in": [str(d["_id"]) for d in depts]}
        if department_id:
            course_q["department_id"] = department_id
        courses = await db.courses.find(course_q).to_list(2000)
        course_map = {str(c["_id"]): c for c in courses}

        q = {"course_id": {"$in": list(course_map.keys())}, "attendance_location": {"$exists": True}}
        if start_date:
            q.setdefault("date", {})["$gte"] = start_date
        if end_date:
            q.setdefault("date", {})["$lte"] = end_date
        if only_flagged:
            q["$or"] = [{"attendance_outside_campus": True}, {"attendance_location.status": {"$ne": "ok"}}]
        lectures = await db.lectures.find(q).sort([("date", -1), ("start_time", -1)]).to_list(5000)

        teacher_ids = {course_map[l["course_id"]].get("teacher_id") for l in lectures if course_map[l["course_id"]].get("teacher_id")}
        teachers = await db.teachers.find({"_id": {"$in": [ObjectId(t) for t in teacher_ids if ObjectId.is_valid(t)]}}).to_list(2000)
        teacher_map = {str(t["_id"]): t.get("full_name", "") for t in teachers}

        items, summary = [], {"outside": 0, "no_location": 0, "inside": 0}
        for l in lectures:
            c = course_map[l["course_id"]]
            loc = l.get("attendance_location") or {}
            if l.get("attendance_outside_campus"):
                flag = "outside"
            elif loc.get("status") != "ok":
                flag = "no_location"
            else:
                flag = "inside"
            summary[flag] += 1
            items.append({
                "lecture_id": str(l["_id"]), "date": l["date"], "start_time": l["start_time"], "end_time": l["end_time"],
                "course_id": l["course_id"], "course_name": c.get("name", ""), "department_id": c.get("department_id"),
                "teacher_id": c.get("teacher_id"), "teacher_name": teacher_map.get(c.get("teacher_id"), ""),
                "flag": flag, "location": loc,
            })
        return {"items": items, "summary": summary}

    return router
