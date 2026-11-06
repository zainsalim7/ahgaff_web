"""
تقرير مزامنة الحضور الأوفلاين — Offline attendance sync report
- GET /reports/offline-sync : (admin فقط) من يُزامن متأخراً، مدة التأخر، ونجاح/فشل كل محاولة
- POST /reports/offline-sync/{log_id}/override : (admin فقط) قبول يدوي لمحاولة فاشلة (خارج نافذة المحاضرة) بعد التحقق اليدوي
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
from pydantic import BaseModel


class OverrideRequest(BaseModel):
    reason: str


def build_router(db, get_current_user) -> APIRouter:
    router = APIRouter(tags=["offline-sync-report"])

    @router.get("/reports/offline-sync")
    async def offline_sync_report(
        start_date: Optional[str] = None, end_date: Optional[str] = None,
        teacher_id: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        """سجل محاولات مزامنة الحضور الأوفلاين (نجاح/فشل) مع مدة التأخر عن نهاية المحاضرة — للمدير فقط"""
        if current_user["role"] != "admin":
            raise HTTPException(status_code=403, detail="غير مصرح لك")

        q = {}
        if start_date:
            q.setdefault("lecture_date", {})["$gte"] = start_date
        if end_date:
            q.setdefault("lecture_date", {})["$lte"] = end_date
        if teacher_id:
            q["teacher_id"] = teacher_id

        logs = await db.offline_sync_log.find(q).sort("synced_at", -1).to_list(5000)

        items = []
        summary = {"success": 0, "failed": 0, "overridden": 0, "max_delay_minutes": 0, "avg_delay_minutes": 0}
        delay_sum = 0
        delay_count = 0
        for l in logs:
            delay_minutes = round((l.get("delay_seconds") or 0) / 60)
            items.append({
                "id": str(l["_id"]),
                "teacher_id": l.get("teacher_id"), "teacher_name": l.get("teacher_name", ""),
                "course_id": l.get("course_id"), "course_name": l.get("course_name", ""),
                "lecture_id": l.get("lecture_id"), "lecture_date": l.get("lecture_date"),
                "lecture_end_time": l.get("lecture_end_time"),
                "offline_recorded_at": l.get("offline_recorded_at"),
                "synced_at": l.get("synced_at"),
                "delay_minutes": delay_minutes,
                "status": l.get("status"),
                "reason": l.get("reason"),
                "diagnosis": l.get("diagnosis"),
                "can_override": l.get("status") == "failed" and bool(l.get("pending_payload")),
                "overridden_by_name": l.get("overridden_by_name"),
                "override_reason": l.get("override_reason"),
                "records_count": l.get("records_count", 0),
            })
            summary[l.get("status") if l.get("status") in ("success", "failed", "overridden") else "failed"] += 1
            if delay_minutes > 0:
                delay_sum += delay_minutes
                delay_count += 1
                summary["max_delay_minutes"] = max(summary["max_delay_minutes"], delay_minutes)

        if delay_count:
            summary["avg_delay_minutes"] = round(delay_sum / delay_count)

        return {"items": items, "summary": summary}

    @router.post("/reports/offline-sync/{log_id}/override")
    async def override_offline_sync(
        log_id: str, data: OverrideRequest, current_user: dict = Depends(get_current_user),
    ):
        """قبول يدوي لمحاولة مزامنة فاشلة (خارج نافذة المحاضرة) — يسجّل الحضور فعلياً بعد تحقق الأدمن يدوياً من صحته"""
        if current_user["role"] != "admin":
            raise HTTPException(status_code=403, detail="غير مصرح لك")
        if not data.reason or not data.reason.strip():
            raise HTTPException(status_code=400, detail="سبب القبول اليدوي إلزامي")
        if not ObjectId.is_valid(log_id):
            raise HTTPException(status_code=404, detail="السجل غير موجود")

        # 🔒 تثبيت ذرّي: يمنع تجاوز نفس السجل مرتين بطلبين متزامنين (TOCTOU)
        log = await db.offline_sync_log.find_one_and_update(
            {"_id": ObjectId(log_id), "status": "failed"}, {"$set": {"status": "overriding"}}
        )
        if not log:
            existing = await db.offline_sync_log.find_one({"_id": ObjectId(log_id)})
            if not existing:
                raise HTTPException(status_code=404, detail="السجل غير موجود")
            raise HTTPException(status_code=400, detail="هذا السجل ليس محاولة فاشلة (ربما جرى التعامل معه للتو)")

        try:
            payload = log.get("pending_payload")
            if not payload or not ObjectId.is_valid(log.get("lecture_id", "")):
                raise HTTPException(status_code=400, detail="تعذّر التجاوز — بيانات المحاولة الأصلية غير محفوظة لهذا السجل")

            lecture = await db.lectures.find_one({"_id": ObjectId(log["lecture_id"])})
            if not lecture:
                raise HTTPException(status_code=404, detail="المحاضرة غير موجودة")

            # محاضرة سُجِّل حضورها فعلاً (مثلاً من محاولة override أخرى لنفس المحاضرة) — لا نكتب فوقها
            existing_attendance = await db.attendance.count_documents({"lecture_id": log["lecture_id"]})
            if existing_attendance > 0:
                now = datetime.now(timezone.utc)
                await db.offline_sync_log.update_one({"_id": ObjectId(log_id)}, {"$set": {
                    "status": "overridden", "overridden_by": current_user["id"],
                    "overridden_by_name": current_user.get("full_name", ""),
                    "override_reason": f"{data.reason.strip()} (تم تجاهل الكتابة — الحضور مسجَّل مسبقاً لهذه المحاضرة من محاولة أخرى)",
                    "overridden_at": now.isoformat(),
                }})
                return {"status": "overridden", "records_count": 0, "note": "الحضور كان مسجَّلاً مسبقاً لهذه المحاضرة"}

            now = datetime.now(timezone.utc)
            attendance_records = []
            for r in payload.get("records", []):
                attendance_records.append({
                    "lecture_id": log["lecture_id"], "course_id": lecture["course_id"],
                    "student_id": r["student_id"], "status": r["status"],
                    "date": now, "recorded_by": current_user["id"], "method": "manual_override",
                    "notes": payload.get("notes"), "created_at": now,
                })

            if attendance_records:
                await db.attendance.insert_many(attendance_records)

            lecture_update = {"status": "completed"}
            if payload.get("lesson_title"):
                lecture_update["lesson_title"] = payload["lesson_title"]
            if payload.get("plan_topic_id"):
                lecture_update["plan_topic_id"] = payload["plan_topic_id"]
            await db.lectures.update_one({"_id": ObjectId(log["lecture_id"])}, {"$set": lecture_update})

            await db.attendance_operations.insert_one({
                "lecture_id": log["lecture_id"], "course_id": lecture["course_id"],
                "user_id": log.get("teacher_id"), "user_name": log.get("teacher_name", ""),
                "records_count": len(attendance_records), "offline_recorded_at": log.get("offline_recorded_at"),
                "recorded_at": now.isoformat(),
                "manual_override_by": current_user["id"], "manual_override_by_name": current_user.get("full_name", ""),
                "manual_override_reason": data.reason.strip(),
            })

            await db.offline_sync_log.update_one({"_id": ObjectId(log_id)}, {"$set": {
                "status": "overridden", "overridden_by": current_user["id"],
                "overridden_by_name": current_user.get("full_name", ""),
                "override_reason": data.reason.strip(), "overridden_at": now.isoformat(),
            }})

            return {"status": "overridden", "records_count": len(attendance_records)}
        except HTTPException:
            # فشل بعد التثبيت الذرّي — أعد السجل إلى "فشلت" حتى لا يبقى عالقاً في "overriding"
            await db.offline_sync_log.update_one({"_id": ObjectId(log_id), "status": "overriding"}, {"$set": {"status": "failed"}})
            raise

    return router
