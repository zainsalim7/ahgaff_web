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
    target_type: str = "all"  # all, role, student, course, teacher, faculty, department, level, section
    target_role: Optional[str] = None
    user_ids: Optional[List[str]] = None
    student_user_id: Optional[str] = None
    student_name: Optional[str] = None
    course_id: Optional[str] = None
    teacher_user_id: Optional[str] = None
    # Cascading filters
    faculty_id: Optional[str] = None
    department_id: Optional[str] = None
    level: Optional[int] = None
    section: Optional[str] = None
    audience: Optional[str] = None  # كلية/قسم: all | students | teachers



@router.get("/notifications/my")
async def get_my_notifications(
    page: int = 1,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """جلب إشعارات المستخدم الحالي"""
    db = get_db()
    user_id = current_user["id"]
    
    skip = (page - 1) * limit
    total = await db.notifications.count_documents({"user_id": user_id})
    unread = await db.notifications.count_documents({"user_id": user_id, "is_read": False})
    
    notifications = await db.notifications.find(
        {"user_id": user_id}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    result = []
    for n in notifications:
        result.append({
            "id": str(n["_id"]),
            "title": n.get("title", ""),
            "message": n.get("message", ""),
            "type": n.get("type", "info"),
            "data": n.get("data") or {},
            "is_read": n.get("is_read", False),
            "course_name": n.get("course_name", ""),
            "created_at": n.get("created_at", ""),
        })
    
    return {
        "notifications": result,
        "total": total,
        "unread_count": unread,
        "page": page,
    }


@router.post("/notifications/mark-read/{notification_id}")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """تعليم إشعار كمقروء"""
    db = get_db()
    from bson import ObjectId
    await db.notifications.update_one(
        {"_id": ObjectId(notification_id), "user_id": current_user["id"]},
        {"$set": {"is_read": True}}
    )
    return {"message": "تم"}


@router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(
    current_user: dict = Depends(get_current_user)
):
    """تعليم جميع الإشعارات كمقروءة"""
    db = get_db()
    await db.notifications.update_many(
        {"user_id": current_user["id"], "is_read": False},
        {"$set": {"is_read": True}}
    )
    return {"message": "تم تعليم جميع الإشعارات كمقروءة"}



@router.post("/notifications/register-token")
async def register_device_token(
    request: RegisterTokenRequest,
    current_user: dict = Depends(get_current_user)
):
    """Register FCM token for push notifications"""
    db = get_db()
    user_id = str(current_user["_id"])

    # 🔒 الجهاز الواحد (التوكن) يجب أن ينتمي لمستخدم واحد فقط — وإلا يتسرّب إشعار مستخدم لآخر
    # عند تبديل الحسابات على نفس الجهاز (مثل جهاز مشترك بين أستاذين)
    await db.fcm_tokens.delete_many({"token": request.token, "user_id": {"$ne": user_id}})

    await db.fcm_tokens.update_one(
        {"token": request.token},
        {"$set": {
            "user_id": user_id,
            "device_type": request.device_type,
            "updated_at": get_yemen_time().isoformat(),
        }, "$setOnInsert": {"created_at": get_yemen_time().isoformat()}},
        upsert=True
    )

    return {"message": "تم تسجيل الجهاز بنجاح"}


class DebugSendRequest(BaseModel):
    token: Optional[str] = None  # توكن FCM محدد (اختياري)
    user_id: Optional[str] = None  # أو ID مستخدم (يجلب توكناته من DB)
    title: str = "اختبار من السيرفر"
    body: str = "هذا إشعار تجريبي للتأكد من عمل Push Notifications"


@router.post("/notifications/debug-send")
async def debug_send_notification(
    request: DebugSendRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    endpoint تشخيصي: يُرسل إشعار اختباري ويُرجع رد FCM المفصّل (success_id أو error).
    يحتاج صلاحية admin أو send_notifications.
    """
    if not check_notification_permission(current_user):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية إرسال إشعارات")
    
    from services.firebase_service import send_notification_to_many
    db = get_db()
    
    tokens = []
    if request.token:
        tokens = [request.token]
        source = "token مرسل مباشرة"
    elif request.user_id:
        docs = await db.fcm_tokens.find({"user_id": request.user_id}).to_list(50)
        tokens = [d["token"] for d in docs if d.get("token")]
        source = f"{len(tokens)} توكن للمستخدم {request.user_id}"
    else:
        raise HTTPException(status_code=400, detail="يجب تمرير token أو user_id")
    
    if not tokens:
        return {
            "status": "no_tokens",
            "message": "لا يوجد توكنات للإرسال",
            "source": source,
        }
    
    # عرض أول 30 حرف من كل توكن للتحقق
    tokens_preview = [t[:30] + "..." for t in tokens]
    
    result = await send_notification_to_many(
        tokens=tokens,
        title=request.title,
        body=request.body,
        data={"type": "debug_test", "timestamp": get_yemen_time().isoformat()}
    )
    
    return {
        "status": "completed",
        "source": source,
        "tokens_count": len(tokens),
        "tokens_preview": tokens_preview,
        "firebase_result": result,
    }


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


def _pref(word: str, name: str) -> str:
    name = (name or "").strip()
    return name if name.startswith(word) else f"{word} {name}"


async def _resolve_student_users(db, *, faculty_id=None, department_id=None, level=None, section=None) -> tuple[list, str]:
    """يبني فلتراً للطلاب حسب (كلية/قسم/مستوى/شعبة) ويرجع (user_ids, وصف)"""
    from bson import ObjectId
    s_query = {"is_active": True}
    parts = []
    if faculty_id:
        if not department_id:
            depts = [str(x["_id"]) async for x in db.departments.find({"faculty_id": faculty_id}, {"_id": 1})]
            s_query["$or"] = [{"faculty_id": faculty_id}, {"department_id": {"$in": depts}}]
        f = await db.faculties.find_one({"_id": ObjectId(faculty_id)}) if ObjectId.is_valid(faculty_id) else None
        if f: parts.append(_pref("كلية", f.get('name', '')))
    if department_id:
        s_query["department_id"] = department_id
        d = await db.departments.find_one({"_id": ObjectId(department_id)}) if ObjectId.is_valid(department_id) else None
        if d: parts.append(_pref("قسم", d.get('name', '')))
    if level is not None:
        s_query["level"] = int(level)
        parts.append(f"المستوى {level}")
    if section:
        s_query["section"] = section
        parts.append(f"الشعبة {section}")
    students = await db.students.find(s_query, {"user_id": 1}).to_list(20000)
    user_ids = [s.get("user_id") for s in students if s.get("user_id")]
    desc = " - ".join(parts) if parts else "طلاب"
    return user_ids, f"{desc} ({len(user_ids)} طالب)"


ROLE_LABELS = {"admin": "المديرين", "teacher": "المعلمين", "student": "الطلاب", "employee": "الموظفين",
               "department_head": "رؤساء الأقسام", "dean": "العمداء"}


async def _scope_names(db, faculty_id=None, department_id=None) -> tuple[list, str]:
    """يرجع (أقسام النطاق, وصف النطاق)"""
    from bson import ObjectId
    if department_id:
        d = await db.departments.find_one({"_id": ObjectId(department_id)}) if ObjectId.is_valid(department_id) else None
        return [department_id], _pref("قسم", (d or {}).get('name', ''))
    if faculty_id:
        f = await db.faculties.find_one({"_id": ObjectId(faculty_id)}) if ObjectId.is_valid(faculty_id) else None
        depts = [str(x["_id"]) async for x in db.departments.find({"faculty_id": faculty_id}, {"_id": 1})]
        return depts, _pref("كلية", (f or {}).get('name', ''))
    return [], ""


async def _teacher_users(db, faculty_id=None, department_id=None) -> list:
    depts, _ = await _scope_names(db, faculty_id, department_id)
    ors = [{"department_id": {"$in": depts}}, {"department_ids": {"$in": depts}}]
    if faculty_id and not department_id:
        ors.append({"faculty_id": faculty_id})
    ids = set()
    async for t in db.teachers.find({"$or": ors, "is_active": {"$ne": False}}, {"user_id": 1}):
        if t.get("user_id"):
            ids.add(str(t["user_id"]))
    async for u in db.users.find({"role": "teacher", "$or": [{"department_id": {"$in": depts}}, {"faculty_id": faculty_id or "__none__"}]}, {"_id": 1}):
        ids.add(str(u["_id"]))
    return list(ids)


async def _resolve_targets(db, request) -> tuple[list, str]:
    """🎯 مصدر موحّد لتحديد المستلمين (user_ids, وصف) — يُستخدم للإرسال والمعاينة"""
    from bson import ObjectId
    t = request.target_type
    if t == "student" and request.student_user_id:
        return [request.student_user_id], f"طالب: {request.student_name or request.student_user_id}"
    if t == "teacher" and request.teacher_user_id:
        u = await db.users.find_one({"_id": ObjectId(request.teacher_user_id)}) if ObjectId.is_valid(request.teacher_user_id) else None
        return [request.teacher_user_id], f"معلم: {(u or {}).get('full_name', '')}"
    if t == "course" and request.course_id:
        sids = [e["student_id"] async for e in db.enrollments.find({"course_id": request.course_id}, {"student_id": 1})]
        uids = [s["user_id"] async for s in db.students.find({"_id": {"$in": [ObjectId(x) for x in sids if ObjectId.is_valid(x)]}}, {"user_id": 1}) if s.get("user_id")]
        c = await db.courses.find_one({"_id": ObjectId(request.course_id)}) if ObjectId.is_valid(request.course_id) else None
        return uids, f"طلاب مقرر: {(c or {}).get('name', '')} ({len(uids)} طالب)"
    if t == "role" and request.target_role:
        role = request.target_role
        label = ROLE_LABELS.get(role, role)
        if not (request.faculty_id or request.department_id):
            uids = [str(u["_id"]) async for u in db.users.find({"role": role}, {"_id": 1})]
            return uids, f"{label} (كل الجامعة)"
        depts, scope = await _scope_names(db, request.faculty_id, request.department_id)
        if role == "student":
            uids, _ = await _resolve_student_users(db, faculty_id=request.faculty_id, department_id=request.department_id)
        elif role == "teacher":
            uids = await _teacher_users(db, request.faculty_id, request.department_id)
        else:
            ors = [{"department_id": {"$in": depts}}]
            if request.faculty_id and not request.department_id:
                ors.append({"faculty_id": request.faculty_id})
            uids = [str(u["_id"]) async for u in db.users.find({"role": role, "$or": ors}, {"_id": 1})]
        return uids, f"{label} - {scope}"
    if t == "users" and request.user_ids:
        return list(request.user_ids), f"{len(request.user_ids)} مستخدم"
    if t in ("faculty", "department"):
        aud = request.audience or "all"
        uids, parts = [], []
        if aud in ("all", "students"):
            s_ids, _ = await _resolve_student_users(db, faculty_id=request.faculty_id if t == "faculty" else None, department_id=request.department_id)
            uids += s_ids
            parts.append(f"{len(s_ids)} طالب")
        if aud in ("all", "teachers"):
            t_ids = await _teacher_users(db, request.faculty_id if t == "faculty" else None, request.department_id)
            uids += t_ids
            parts.append(f"{len(t_ids)} معلم")
        _, scope = await _scope_names(db, request.faculty_id if t == "faculty" else None, request.department_id)
        return list(dict.fromkeys(uids)), f"{scope} ({' + '.join(parts)})"
    if t in ("level", "section"):
        return await _resolve_student_users(db, faculty_id=request.faculty_id, department_id=request.department_id, level=request.level, section=request.section)
    uids = [str(u["_id"]) async for u in db.users.find({}, {"_id": 1})]
    return uids, "الكل"


@router.post("/notifications/preview")
async def preview_notification_targets(request: SendNotificationRequest, current_user: dict = Depends(get_current_user)):
    if not check_notification_permission(current_user):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية إرسال الإشعارات")
    uids, desc = await _resolve_targets(get_db(), request)
    return {"users": len(uids), "target_desc": desc}


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

    target_user_ids, target_desc = await _resolve_targets(db, request)
    query = {"user_id": {"$in": target_user_ids}}

    # حفظ الإشعار داخل التطبيق لكل مستخدم مستهدف
    in_app_notifications = []
    for uid in target_user_ids:
        in_app_notifications.append({
            "user_id": uid,
            "title": request.title,
            "message": request.body,
            "type": "info",
            "is_read": False,
            "created_at": get_yemen_time().isoformat(),
        })
    if in_app_notifications:
        await db.notifications.insert_many(in_app_notifications)

    # إرسال push notifications عبر FCM
    tokens_docs = await db.fcm_tokens.find(query).to_list(10000)
    tokens = list(set(doc["token"] for doc in tokens_docs))

    result = {"success": 0, "failure": 0}
    if tokens:
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
        "users_count": len(target_user_ids),
        "success": result.get("success", 0),
        "failure": result.get("failure", 0),
        "created_at": get_yemen_time().isoformat(),
    })

    return {
        "message": f"تم إرسال الإشعار إلى {target_desc}",
        "devices": len(tokens),
        "users": len(target_user_ids),
        **result
    }


@router.delete("/notifications/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """حذف إشعار"""
    db = get_db()
    from bson import ObjectId
    result = await db.notifications.delete_one(
        {"_id": ObjectId(notification_id), "user_id": current_user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الإشعار غير موجود")
    return {"message": "تم حذف الإشعار"}


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

    if not q or len(q) < 2:
        return []

    # بحث دقيق: أولاً المطابقة من البداية، ثم المطابقة الجزئية
    exact_query = {"$or": [
        {"student_id": q},
        {"full_name": q},
    ]}
    starts_with_query = {"$or": [
        {"full_name": {"$regex": f"^{q}", "$options": "i"}},
        {"student_id": {"$regex": f"^{q}", "$options": "i"}},
    ]}
    contains_query = {"$or": [
        {"full_name": {"$regex": q, "$options": "i"}},
        {"student_id": {"$regex": q, "$options": "i"}},
    ]}

    projection = {"_id": 0, "user_id": 1, "student_id": 1, "full_name": 1}

    # نتائج مطابقة تماماً أولاً
    exact = await db.students.find(exact_query, projection).to_list(5)
    exact_ids = {s.get("student_id") for s in exact}

    # نتائج تبدأ بالبحث
    starts = await db.students.find(starts_with_query, projection).to_list(10)
    starts = [s for s in starts if s.get("student_id") not in exact_ids]
    starts_ids = exact_ids | {s.get("student_id") for s in starts}

    # نتائج تحتوي على البحث
    contains = await db.students.find(contains_query, projection).to_list(15)
    contains = [s for s in contains if s.get("student_id") not in starts_ids]

    return exact + starts + contains


@router.get("/notifications/search-teachers")
async def search_teachers_for_notification(
    q: str = "",
    current_user: dict = Depends(get_current_user)
):
    """البحث عن معلمين لإرسال إشعار"""
    db = get_db()

    if not check_notification_permission(current_user):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية")

    if not q or len(q) < 2:
        return []

    projection = {"_id": 0, "user_id": 1, "teacher_id": 1, "full_name": 1}

    exact = await db.teachers.find({"$or": [
        {"teacher_id": q}, {"full_name": q}
    ]}, projection).to_list(5)
    exact_ids = {t.get("teacher_id") for t in exact}

    starts = await db.teachers.find({"$or": [
        {"full_name": {"$regex": f"^{q}", "$options": "i"}},
        {"teacher_id": {"$regex": f"^{q}", "$options": "i"}},
    ]}, projection).to_list(10)
    starts = [t for t in starts if t.get("teacher_id") not in exact_ids]
    all_ids = exact_ids | {t.get("teacher_id") for t in starts}

    contains = await db.teachers.find({"$or": [
        {"full_name": {"$regex": q, "$options": "i"}},
        {"teacher_id": {"$regex": q, "$options": "i"}},
    ]}, projection).to_list(15)
    contains = [t for t in contains if t.get("teacher_id") not in all_ids]

    return exact + starts + contains


@router.get("/notifications/courses")
async def get_courses_for_notification(
    current_user: dict = Depends(get_current_user)
):
    """جلب المقررات لإرسال إشعار لطلابها"""
    db = get_db()

    if not check_notification_permission(current_user):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية")

    courses = await db.courses.find({"is_active": True}).to_list(200)
    result = []
    for c in courses:
        enrollments_count = await db.enrollments.count_documents({"course_id": str(c["_id"])})
        result.append({
            "id": str(c["_id"]),
            "name": c.get("name", ""),
            "code": c.get("code", ""),
            "students_count": enrollments_count,
        })
    return result


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
