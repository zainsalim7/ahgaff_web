"""
تقرير مزامنة الحضور الأوفلاين — Offline attendance sync report
- GET /reports/offline-sync : (admin فقط) من يُزامن متأخراً، مدة التأخر، ونجاح/فشل كل محاولة
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId


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
        summary = {"success": 0, "failed": 0, "max_delay_minutes": 0, "avg_delay_minutes": 0}
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
                "records_count": l.get("records_count", 0),
            })
            summary[l.get("status") if l.get("status") in ("success", "failed") else "failed"] += 1
            if delay_minutes > 0:
                delay_sum += delay_minutes
                delay_count += 1
                summary["max_delay_minutes"] = max(summary["max_delay_minutes"], delay_minutes)

        if delay_count:
            summary["avg_delay_minutes"] = round(delay_sum / delay_count)

        return {"items": items, "summary": summary}

    return router
