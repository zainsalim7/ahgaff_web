"""
تنبيه الأستاذ الغائب: زر يدوي + إرسال تلقائي بعد 12 ساعة (مستقل — absence_reminders.py)
"""
import os
import hmac
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Request
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

YEMEN_TIMEZONE = timezone(timedelta(hours=3))
JUSTIFY_WINDOW_HOURS = int(os.environ.get("ABSENCE_JUSTIFY_WINDOW_HOURS", "72"))
REMINDER_DELAY_HOURS = 12
STATUS_SCHEDULED = "scheduled"
STATUS_ABSENT = "absent"
ACTIVE_JUSTIFY_STATUSES = ["pending", "approved"]
NOTIF_TITLE = "تنبيه غياب عن محاضرة"


def build_router(db, get_current_user, has_permission, send_push_many=None) -> APIRouter:
    router = APIRouter(tags=["absence-reminders"])

    def now():
        return datetime.now(YEMEN_TIMEZONE)

    def lecture_end_dt(lec: dict) -> Optional[datetime]:
        try:
            return datetime.strptime(f"{lec['date']} {lec['end_time']}", "%Y-%m-%d %H:%M").replace(tzinfo=YEMEN_TIMEZONE)
        except Exception:
            return None

    def lecture_start_dt(lec: dict) -> Optional[datetime]:
        try:
            return datetime.strptime(f"{lec['date']} {lec['start_time']}", "%Y-%m-%d %H:%M").replace(tzinfo=YEMEN_TIMEZONE)
        except Exception:
            return None

    def build_message(course_name: str, lec: dict) -> str:
        end = lecture_end_dt(lec)
        deadline = end + timedelta(hours=JUSTIFY_WINDOW_HOURS) if end else None
        deadline_str = deadline.strftime("%Y-%m-%d %H:%M") if deadline else ""
        return (f"لاحظنا غيابكم في محاضرة {course_name} بتاريخ {lec['date']} "
                f"({lec['start_time']} - {lec['end_time']}). نرجو تقديم عذركم قبل {deadline_str}. مع تحيات الإدارة")

    async def has_active_justification(lecture_id: str) -> bool:
        doc = await db.absence_justifications.find_one({
            "lecture_ids": lecture_id, "status": {"$in": ACTIVE_JUSTIFY_STATUSES},
        })
        return bool(doc)

    async def resolve_user_id(teacher_record_id: Optional[str]) -> Optional[str]:
        if not teacher_record_id or not ObjectId.is_valid(teacher_record_id):
            return None
        t = await db.teachers.find_one({"_id": ObjectId(teacher_record_id)}, {"user_id": 1})
        return (t or {}).get("user_id")

    async def send_reminder(lec: dict, course: dict, kind: str, sent_by: Optional[str] = None) -> Optional[dict]:
        teacher_record_id = lec.get("teacher_id") or course.get("teacher_id")
        user_id = await resolve_user_id(teacher_record_id)
        if not user_id:
            return None  # لا يوجد حساب مستخدم مرتبط بالأستاذ — لن نسجّل تنبيهاً وهمياً
        ts = now().isoformat()
        message = build_message(course.get("name", ""), lec)
        data = {"type": "absence_reminder", "lecture_id": str(lec["_id"])}
        await db.notifications.insert_one({
            "user_id": user_id, "title": NOTIF_TITLE, "message": message, "type": "absence_reminder",
            "lecture_id": str(lec["_id"]), "course_id": lec.get("course_id"), "course_name": course.get("name", ""),
            "is_read": False, "created_at": ts,
        })
        if send_push_many:
            try:
                docs = await db.fcm_tokens.find({"user_id": user_id}).to_list(50)
                tokens = [d["token"] for d in docs if d.get("token")]
                if tokens:
                    await send_push_many(tokens, NOTIF_TITLE, message, data)
            except Exception as e:
                logging.warning(f"absence_reminder push failed: {e}")
        reminder_doc = {
            "lecture_id": str(lec["_id"]), "teacher_id": teacher_record_id, "kind": kind,
            "sent_by": sent_by, "sent_at": ts,
        }
        try:
            await db.absence_reminders.insert_one(reminder_doc)
        except DuplicateKeyError:
            return None  # تنبيه آخر سبقه لنفس المحاضرة (طلب متزامن) — لا نُرسل إشعاراً مكرراً
        return reminder_doc

    @router.post("/lectures/{lecture_id}/absence-reminder")
    async def send_manual_reminder(lecture_id: str, current_user: dict = Depends(get_current_user)):
        if not has_permission(current_user, "send_notifications"):
            raise HTTPException(status_code=403, detail="غير مصرح لك بإرسال تنبيهات الغياب")
        if not ObjectId.is_valid(lecture_id):
            raise HTTPException(status_code=404, detail="المحاضرة غير موجودة")
        lec = await db.lectures.find_one({"_id": ObjectId(lecture_id)})
        if not lec:
            raise HTTPException(status_code=404, detail="المحاضرة غير موجودة")
        if lec.get("status") != STATUS_ABSENT:
            raise HTTPException(status_code=409, detail="المحاضرة ليست بحالة غياب الأستاذ")
        if await has_active_justification(lecture_id):
            raise HTTPException(status_code=409, detail="يوجد عذر معلّق أو مقبول لهذه المحاضرة — لا يمكن إرسال التنبيه")
        existing = await db.absence_reminders.find_one({"lecture_id": lecture_id})
        if existing:
            raise HTTPException(status_code=409, detail=f"سبق إرسال تنبيه لهذه المحاضرة بتاريخ {existing.get('sent_at')}")
        course = await db.courses.find_one({"_id": ObjectId(lec["course_id"])}) if ObjectId.is_valid(lec.get("course_id") or "") else None
        rem = await send_reminder(lec, course or {}, kind="manual", sent_by=current_user["id"])
        if not rem:
            raise HTTPException(status_code=422, detail="لا يوجد حساب مستخدم مرتبط بهذا الأستاذ لإرسال التنبيه إليه")
        return {"ok": True, "sent_at": rem["sent_at"], "kind": "manual"}

    @router.get("/lectures/{lecture_id}/absence-reminder")
    async def get_reminder_status(lecture_id: str, current_user: dict = Depends(get_current_user)):
        existing = await db.absence_reminders.find_one({"lecture_id": lecture_id})
        if existing:
            return {"sent": True, "sent_at": existing.get("sent_at"), "kind": existing.get("kind")}
        preview = None
        if ObjectId.is_valid(lecture_id):
            lec = await db.lectures.find_one({"_id": ObjectId(lecture_id)})
            if lec:
                course = await db.courses.find_one({"_id": ObjectId(lec["course_id"])}) if ObjectId.is_valid(lec.get("course_id") or "") else None
                preview = build_message(course.get("name", "") if course else "", lec)
        return {"sent": False, "preview": preview}

    @router.post("/absence-reminders/run")
    async def run_absence_reminders(request: Request):
        # Cron endpoints should ack quickly; هذا الفحص خفيف ومحدود النطاق (محاضرات absent فقط ضمن نافذة
        # 72 ساعة) فتنفيذه مباشرة هنا آمن زمنياً، ونُرجع النتيجة الفعلية (checked/sent) للمستدعي مباشرة.
        secret = os.environ.get("WEBHOOK_CRON_SECRET")
        auth = request.headers.get("authorization", "")
        token = auth[7:] if auth.lower().startswith("bearer ") else None
        if not secret or not token or not hmac.compare_digest(token, secret):
            raise HTTPException(status_code=401, detail="غير مصرح")

        now_ts = now()

        # 1) ترقية المحاضرات "scheduled" التي تجاوزت وقتها المسموح إلى "absent" (نفس قاعدة التحديد الكسول
        #    المستخدمة عند جلب قوائم المحاضرات) حتى لا تُفوَّت محاضرات لم يفتحها أحد بعد
        scheduled = await db.lectures.find({"status": STATUS_SCHEDULED, "status_override": {"$ne": True}}).to_list(5000)
        for lec in scheduled:
            start, end = lecture_start_dt(lec), lecture_end_dt(lec)
            if not start or not end:
                continue
            duration_minutes = (end - start).total_seconds() / 60
            if now_ts > end + timedelta(minutes=duration_minutes):
                await db.lectures.update_one({"_id": lec["_id"]}, {"$set": {"status": STATUS_ABSENT}})

        # 2) فحص محاضرات absent المؤهلة للتنبيه التلقائي
        candidates = await db.lectures.find({"status": STATUS_ABSENT}).to_list(5000)
        course_ids = list({l["course_id"] for l in candidates if l.get("course_id")})
        courses = {}
        oids = [ObjectId(c) for c in course_ids if ObjectId.is_valid(c)]
        if oids:
            async for c in db.courses.find({"_id": {"$in": oids}}):
                courses[str(c["_id"])] = c

        checked = 0
        sent_ids: List[str] = []
        for lec in candidates:
            end = lecture_end_dt(lec)
            if not end:
                continue
            checked += 1
            hours_since_end = (now_ts - end).total_seconds() / 3600
            if hours_since_end < REMINDER_DELAY_HOURS:
                continue
            deadline = end + timedelta(hours=JUSTIFY_WINDOW_HOURS)
            if now_ts > deadline:
                continue
            lid = str(lec["_id"])
            if await db.absence_reminders.find_one({"lecture_id": lid}):
                continue
            if await has_active_justification(lid):
                continue
            course = courses.get(lec.get("course_id"), {})
            rem = await send_reminder(lec, course, kind="auto")
            if rem:
                sent_ids.append(lid)

        return {"checked": checked, "sent": len(sent_ids), "lecture_ids": sent_ids}

    return router
