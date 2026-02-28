"""
Notifications Routes - مسارات الإشعارات
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import logging

from .deps import get_db, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["الإشعارات"])

YEMEN_TIMEZONE = timezone(timedelta(hours=3))

def get_yemen_time():
    return datetime.now(YEMEN_TIMEZONE)


def check_notification_permission(user: dict):
    """التحقق من صلاحية الإشعارات"""
    permissions = user.get("permissions") or []
    role = user.get("role", "")
    if role == "admin" or "send_notifications" in permissions or "manage_notifications" in permissions:
        return True
    return False


class RegisterTokenRequest(BaseModel):
    token: str
    device_type: str = "web"


class SendNotificationRequest(BaseModel):
    title: str
    body: str
    target_type: str = "all"  # all, role, student, course, teacher
    target_role: Optional[str] = None
    user_ids: Optional[List[str]] = None
    student_user_id: Optional[str] = None
    student_name: Optional[str] = None
    course_id: Optional[str] = None
    teacher_user_id: Optional[str] = None


@router.post("/notifications/register-token")
async def register_device_token(
    request: RegisterTokenRequest,
    current_user: dict = Depends(get_current_user)
):
    """Register FCM token for push notifications"""
    db = get_db()
    user_id = str(current_user["_id"])

    existing = await db.fcm_tokens.find_one({
        "token": request.token,
        "user_id": user_id
    })

    if not existing:
        await db.fcm_tokens.insert_one({
            "user_id": user_id,
            "token": request.token,
            "device_type": request.device_type,
            "created_at": get_yemen_time().isoformat(),
            "updated_at": get_yemen_time().isoformat(),
        })
    else:
        await db.fcm_tokens.update_one(
            {"_id": existing["_id"]},
            {"$set": {"updated_at": get_yemen_time().isoformat()}}
        )

    return {"message": "تم تسجيل الجهاز بنجاح"}


@router.delete("/notifications/unregister-token")
async def unregister_device_token(
    request: RegisterTokenRequest,
    current_user: dict = Depends(get_current_user)
):
    """Remove FCM token"""
    db = get_db()
    user_id = str(current_user["_id"])
    await db.fcm_tokens.delete_many({
        "token": request.token,
        "user_id": user_id
    })
    return {"message": "تم إلغاء تسجيل الجهاز"}


@router.post("/notifications/send")
async def send_notification_api(
    request: SendNotificationRequest,
    current_user: dict = Depends(get_current_user)
):
    """Send notification - requires send_notifications permission"""
    from services.firebase_service import send_notification_to_many

    db = get_db()

    if not check_notification_permission(current_user):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية إرسال الإشعارات")

    query = {}
    target_desc = "الكل"

    if request.target_type == "student" and request.student_user_id:
        query["user_id"] = request.student_user_id
        target_desc = f"طالب: {request.student_name or request.student_user_id}"
    elif request.target_type == "teacher" and request.teacher_user_id:
        query["user_id"] = request.teacher_user_id
        # جلب اسم المعلم
        teacher_user = await db.users.find_one({"_id": __import__('bson').ObjectId(request.teacher_user_id)})
        teacher_name = teacher_user.get("full_name", "") if teacher_user else ""
        target_desc = f"معلم: {teacher_name}"
    elif request.target_type == "course" and request.course_id:
        # إرسال لجميع طلاب المقرر
        enrollments = await db.enrollments.find({"course_id": request.course_id}).to_list(5000)
        student_ids = [e["student_id"] for e in enrollments]
        students = await db.students.find({"_id": {"$in": [__import__('bson').ObjectId(sid) for sid in student_ids]}}).to_list(5000)
        user_ids = [s["user_id"] for s in students if s.get("user_id")]
        query["user_id"] = {"$in": user_ids} if user_ids else {"$in": []}
        course = await db.courses.find_one({"_id": __import__('bson').ObjectId(request.course_id)})
        course_name = course.get("name", "") if course else ""
        target_desc = f"طلاب مقرر: {course_name} ({len(user_ids)} طالب)"
    elif request.target_type == "role" and request.target_role:
        users = await db.users.find({"role": request.target_role}, {"_id": 1}).to_list(10000)
        user_ids = [str(u["_id"]) for u in users]
        query["user_id"] = {"$in": user_ids}
        role_labels = {"admin": "المديرين", "teacher": "المعلمين", "student": "الطلاب", "employee": "الموظفين"}
        target_desc = role_labels.get(request.target_role, request.target_role)
    elif request.target_type == "users" and request.user_ids:
        query["user_id"] = {"$in": request.user_ids}
        target_desc = f"{len(request.user_ids)} مستخدم"

    tokens_docs = await db.fcm_tokens.find(query).to_list(10000)
    tokens = list(set(doc["token"] for doc in tokens_docs))

    if not tokens:
        # Save to history even if no devices
        await db.notification_history.insert_one({
            "title": request.title,
            "body": request.body,
            "sent_by": str(current_user["_id"]),
            "sent_by_name": current_user.get("full_name", current_user.get("username", "")),
            "target_type": request.target_type,
            "target_role": request.target_role,
            "target_desc": target_desc,
            "devices_count": 0,
            "success": 0,
            "failure": 0,
            "created_at": get_yemen_time().isoformat(),
        })
        return {"message": "لا توجد أجهزة مسجلة", "sent": 0, "devices": 0}

    result = await send_notification_to_many(tokens, request.title, request.body)

    await db.notification_history.insert_one({
        "title": request.title,
        "body": request.body,
        "sent_by": str(current_user["_id"]),
        "sent_by_name": current_user.get("full_name", current_user.get("username", "")),
        "target_type": request.target_type,
        "target_role": request.target_role,
        "target_desc": target_desc,
        "devices_count": len(tokens),
        "success": result.get("success", 0),
        "failure": result.get("failure", 0),
        "created_at": get_yemen_time().isoformat(),
    })

    return {
        "message": f"تم إرسال الإشعار إلى {target_desc}",
        "devices": len(tokens),
        **result
    }


@router.get("/notifications/history")
async def get_notification_history(
    current_user: dict = Depends(get_current_user)
):
    """Get notification history"""
    db = get_db()

    if not check_notification_permission(current_user):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية عرض الإشعارات")

    notifications = await db.notification_history.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)

    return notifications


@router.get("/notifications/search-students")
async def search_students_for_notification(
    q: str = "",
    current_user: dict = Depends(get_current_user)
):
    """البحث عن طلاب لإرسال إشعار"""
    db = get_db()

    if not check_notification_permission(current_user):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية")

    query = {}
    if q:
        query["$or"] = [
            {"full_name": {"$regex": q, "$options": "i"}},
            {"student_id": {"$regex": q, "$options": "i"}},
        ]

    students = await db.students.find(query, {
        "_id": 0,
        "user_id": 1,
        "student_id": 1,
        "full_name": 1,
    }).to_list(50)

    return students


@router.get("/notifications/stats")
async def get_notification_stats(
    current_user: dict = Depends(get_current_user)
):
    """Get notification statistics"""
    db = get_db()

    if not check_notification_permission(current_user):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية")

    total_sent = await db.notification_history.count_documents({})
    registered_devices = await db.fcm_tokens.count_documents({})

    # Count by role
    role_counts = {}
    for role in ["admin", "teacher", "student", "employee"]:
        users = await db.users.find({"role": role}, {"_id": 1}).to_list(10000)
        user_ids = [str(u["_id"]) for u in users]
        count = await db.fcm_tokens.count_documents({"user_id": {"$in": user_ids}})
        role_counts[role] = count

    return {
        "total_sent": total_sent,
        "registered_devices": registered_devices,
        "devices_by_role": role_counts,
    }
