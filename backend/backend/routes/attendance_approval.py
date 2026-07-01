"""
Attendance Change Approval Routes
مسارات اعتماد تعديلات الحضور خارج المهلة
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from bson import ObjectId

from .deps import get_db, get_current_user, has_permission, log_activity
from models.permissions import Permission, UserRole

router = APIRouter()


# ─────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────

class ChangeItem(BaseModel):
    student_id: str
    old_status: Optional[str] = None
    new_status: str
    reason: Optional[str] = None


class BulkChangeRequest(BaseModel):
    lecture_id: str
    changes: List[ChangeItem]
    reason: Optional[str] = None


class RejectPayload(BaseModel):
    review_notes: Optional[str] = None


class BatchActionPayload(BaseModel):
    request_ids: List[str]
    review_notes: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Internal Helper — يُستدعى من endpoint تسجيل الحضور
# ─────────────────────────────────────────────────────────────

async def create_change_requests_for_diff(
    lecture: dict,
    course: dict,
    new_records: list,
    current_user: dict,
    reason: Optional[str] = None,
) -> dict:
    """
    ينشئ طلبات اعتماد لكل تغيير في حالة طالب في محاضرة.
    يُقارن الحالات القديمة (من db.attendance) بالحالات الجديدة (new_records).

    Args:
        lecture: وثيقة المحاضرة
        course: وثيقة المقرر
        new_records: قائمة سجلات جديدة [{student_id, status}]
        current_user: المستخدم مقدّم الطلب
        reason: سبب اختياري لطلبات هذه الجلسة

    Returns:
        dict {created, skipped, request_ids}
    """
    db = get_db()
    lecture_id = str(lecture["_id"])
    course_id = str(course["_id"])
    faculty_id = course.get("faculty_id") or ""
    department_id = course.get("department_id") or ""

    # جلب الحالات الحالية للطلاب في هذه المحاضرة
    existing = await db.attendance.find({"lecture_id": lecture_id}).to_list(5000)
    current_status_by_student = {r["student_id"]: r.get("status") for r in existing}
    attendance_id_by_student = {r["student_id"]: str(r["_id"]) for r in existing}

    created = 0
    skipped = 0
    request_ids: List[str] = []

    now = datetime.now(timezone.utc)

    for record in new_records:
        sid = record.student_id if hasattr(record, "student_id") else record.get("student_id")
        new_st = record.status if hasattr(record, "status") else record.get("status")
        old_st = current_status_by_student.get(sid)

        # لا فرق فعلي → تخطَّ
        if old_st == new_st:
            skipped += 1
            continue

        # ألغِ أي طلب pending سابق لنفس (lecture, student) — يُستبدل بالجديد
        await db.attendance_change_requests.update_many(
            {
                "lecture_id": lecture_id,
                "student_id": sid,
                "status": "pending",
            },
            {"$set": {
                "status": "cancelled",
                "reviewed_at": now,
                "review_notes": "استُبدل بطلب جديد",
            }}
        )

        # جلب اسم الطالب
        try:
            student = await db.students.find_one({"_id": ObjectId(sid)})
        except Exception:
            student = None
        student_name = (student.get("full_name") if student else "") or ""

        doc = {
            "attendance_id": attendance_id_by_student.get(sid),
            "lecture_id": lecture_id,
            "course_id": course_id,
            "course_name": course.get("name", ""),
            "course_code": course.get("code", ""),
            "lecture_date": lecture.get("date", ""),
            "lecture_start_time": lecture.get("start_time", ""),
            "student_id": sid,
            "student_name": student_name,
            "faculty_id": faculty_id,
            "department_id": department_id,
            "old_status": old_st,
            "new_status": new_st,
            "reason": reason,
            "requested_by": current_user["id"],
            "requested_by_name": current_user.get("full_name", ""),
            "requested_by_role": current_user.get("role", ""),
            "requested_at": now,
            "status": "pending",
            "reviewed_by": None,
            "reviewed_by_name": None,
            "reviewed_at": None,
            "review_notes": None,
        }
        result = await db.attendance_change_requests.insert_one(doc)
        created += 1
        request_ids.append(str(result.inserted_id))

    if created > 0:
        await log_activity(
            current_user, "request_attendance_changes", "attendance_change_request",
            None,
            f"طلب اعتماد {created} تعديل حضور في محاضرة {course.get('name', '')}",
            {"lecture_id": lecture_id, "created": created, "skipped": skipped}
        )

    return {"created": created, "skipped": skipped, "request_ids": request_ids}


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _serialize_request(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "attendance_id": doc.get("attendance_id"),
        "lecture_id": doc.get("lecture_id"),
        "course_id": doc.get("course_id"),
        "course_name": doc.get("course_name", ""),
        "course_code": doc.get("course_code", ""),
        "lecture_date": doc.get("lecture_date", ""),
        "lecture_start_time": doc.get("lecture_start_time", ""),
        "student_id": doc.get("student_id"),
        "student_name": doc.get("student_name", ""),
        "faculty_id": doc.get("faculty_id"),
        "department_id": doc.get("department_id"),
        "old_status": doc.get("old_status"),
        "new_status": doc.get("new_status"),
        "reason": doc.get("reason"),
        "requested_by": doc.get("requested_by"),
        "requested_by_name": doc.get("requested_by_name", ""),
        "requested_by_role": doc.get("requested_by_role", ""),
        "requested_at": doc.get("requested_at").isoformat() if doc.get("requested_at") else None,
        "status": doc.get("status"),
        "reviewed_by": doc.get("reviewed_by"),
        "reviewed_by_name": doc.get("reviewed_by_name", ""),
        "reviewed_at": doc.get("reviewed_at").isoformat() if doc.get("reviewed_at") else None,
        "review_notes": doc.get("review_notes"),
    }


def _can_approve(user: dict) -> bool:
    """المدير أو من يملك APPROVE_ATTENDANCE_CHANGES."""
    if user["role"] == UserRole.ADMIN:
        return True
    return has_permission(user, Permission.APPROVE_ATTENDANCE_CHANGES)


async def _apply_change_to_attendance(request_doc: dict, current_user: dict):
    """يطبّق التغيير المعتَمد على جدول attendance."""
    db = get_db()
    lecture_id = request_doc["lecture_id"]
    student_id = request_doc["student_id"]
    new_status = request_doc["new_status"]

    # ابحث عن السجل الأصلي (قد يكون attendance_id قديم أو أُعيد إنشاؤه)
    existing = await db.attendance.find_one({
        "lecture_id": lecture_id,
        "student_id": student_id,
    })
    now = datetime.now(timezone.utc)
    if existing:
        await db.attendance.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "status": new_status,
                "updated_at": now,
                "updated_by": current_user["id"],
                "last_change_approved_by": current_user["id"],
                "last_change_request_id": str(request_doc["_id"]),
            }}
        )
    else:
        # إن لم يوجد سجل حالي، أنشئه
        await db.attendance.insert_one({
            "lecture_id": lecture_id,
            "course_id": request_doc.get("course_id"),
            "student_id": student_id,
            "status": new_status,
            "date": now,
            "recorded_by": request_doc.get("requested_by"),
            "method": "approval_change",
            "created_at": now,
            "last_change_approved_by": current_user["id"],
            "last_change_request_id": str(request_doc["_id"]),
        })


# ─────────────────────────────────────────────────────────────
# GET Endpoints
# ─────────────────────────────────────────────────────────────

@router.get("/attendance-changes")
async def list_change_requests(
    status: Optional[str] = "pending",
    lecture_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    قائمة طلبات اعتماد التعديل.
    - المدير: يرى الكل.
    - العميد (أو من يملك APPROVE_ATTENDANCE_CHANGES): يرى طلبات كليته فقط.
    - غير ذلك: 403.
    """
    if not _can_approve(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك بعرض طلبات الاعتماد")

    db = get_db()
    query: dict = {}
    if status and status != "all":
        query["status"] = status
    if lecture_id:
        query["lecture_id"] = lecture_id

    # نطاق العميد → كليته فقط
    if current_user["role"] != UserRole.ADMIN and current_user.get("faculty_id"):
        query["faculty_id"] = current_user["faculty_id"]

    docs = await db.attendance_change_requests.find(query).sort("requested_at", -1).to_list(2000)
    return {"items": [_serialize_request(d) for d in docs], "total": len(docs)}


@router.get("/attendance-changes/pending-count")
async def pending_count(current_user: dict = Depends(get_current_user)):
    """عدد الطلبات المعلّقة — للـ Badge على أيقونة الإشعارات."""
    if not _can_approve(current_user):
        return {"count": 0}
    db = get_db()
    query: dict = {"status": "pending"}
    if current_user["role"] != UserRole.ADMIN and current_user.get("faculty_id"):
        query["faculty_id"] = current_user["faculty_id"]
    count = await db.attendance_change_requests.count_documents(query)
    return {"count": count}


@router.get("/attendance-changes/mine")
async def my_change_requests(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """تاريخ طلبات المستخدم الحالي."""
    db = get_db()
    query: dict = {"requested_by": current_user["id"]}
    if status and status != "all":
        query["status"] = status
    docs = await db.attendance_change_requests.find(query).sort("requested_at", -1).to_list(2000)
    return {"items": [_serialize_request(d) for d in docs], "total": len(docs)}


@router.get("/attendance-changes/lecture/{lecture_id}/pending")
async def pending_for_lecture(
    lecture_id: str,
    current_user: dict = Depends(get_current_user),
):
    """طلبات معلّقة لمحاضرة محددة — لعرض شارات ⏳ على الواجهة."""
    db = get_db()
    docs = await db.attendance_change_requests.find({
        "lecture_id": lecture_id,
        "status": "pending",
    }).to_list(2000)
    return {"items": [_serialize_request(d) for d in docs], "total": len(docs)}


# ─────────────────────────────────────────────────────────────
# Approve / Reject / Cancel
# ─────────────────────────────────────────────────────────────

@router.post("/attendance-changes/batch/approve")
async def batch_approve(
    payload: BatchActionPayload,
    current_user: dict = Depends(get_current_user),
):
    """اعتماد جماعي لعدة طلبات."""
    if not _can_approve(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك بالاعتماد")
    db = get_db()
    approved = 0
    errors: List[dict] = []
    for req_id in payload.request_ids:
        try:
            doc = await db.attendance_change_requests.find_one({"_id": ObjectId(req_id)})
            if not doc or doc.get("status") != "pending":
                errors.append({"id": req_id, "reason": "غير موجود أو ليس معلّقاً"})
                continue
            if current_user["role"] != UserRole.ADMIN and current_user.get("faculty_id"):
                if doc.get("faculty_id") and doc["faculty_id"] != current_user["faculty_id"]:
                    errors.append({"id": req_id, "reason": "خارج نطاقك"})
                    continue
            await _apply_change_to_attendance(doc, current_user)
            await db.attendance_change_requests.update_one(
                {"_id": doc["_id"]},
                {"$set": {
                    "status": "approved",
                    "reviewed_by": current_user["id"],
                    "reviewed_by_name": current_user.get("full_name", ""),
                    "reviewed_at": datetime.now(timezone.utc),
                }}
            )
            approved += 1
        except Exception as e:
            errors.append({"id": req_id, "reason": str(e)})
    await log_activity(
        current_user, "batch_approve_attendance_changes", "attendance_change_request",
        None, f"اعتماد جماعي: {approved} من {len(payload.request_ids)}"
    )
    return {"success": True, "approved": approved, "errors": errors}


@router.post("/attendance-changes/batch/reject")
async def batch_reject(
    payload: BatchActionPayload,
    current_user: dict = Depends(get_current_user),
):
    """رفض جماعي لعدة طلبات."""
    if not _can_approve(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك بالرفض")
    db = get_db()
    rejected = 0
    errors: List[dict] = []
    for req_id in payload.request_ids:
        try:
            doc = await db.attendance_change_requests.find_one({"_id": ObjectId(req_id)})
            if not doc or doc.get("status") != "pending":
                errors.append({"id": req_id, "reason": "غير موجود أو ليس معلّقاً"})
                continue
            if current_user["role"] != UserRole.ADMIN and current_user.get("faculty_id"):
                if doc.get("faculty_id") and doc["faculty_id"] != current_user["faculty_id"]:
                    errors.append({"id": req_id, "reason": "خارج نطاقك"})
                    continue
            await db.attendance_change_requests.update_one(
                {"_id": doc["_id"]},
                {"$set": {
                    "status": "rejected",
                    "reviewed_by": current_user["id"],
                    "reviewed_by_name": current_user.get("full_name", ""),
                    "reviewed_at": datetime.now(timezone.utc),
                    "review_notes": payload.review_notes or "",
                }}
            )
            rejected += 1
        except Exception as e:
            errors.append({"id": req_id, "reason": str(e)})
    return {"success": True, "rejected": rejected, "errors": errors}


@router.post("/attendance-changes/{req_id}/approve")
async def approve_change(
    req_id: str,
    current_user: dict = Depends(get_current_user),
):
    """اعتماد طلب تعديل حضور."""
    if not _can_approve(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك بالاعتماد")

    db = get_db()
    doc = await db.attendance_change_requests.find_one({"_id": ObjectId(req_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if doc.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"الطلب ليس معلّقاً (الحالة: {doc.get('status')})")

    # نطاق العميد: كليته فقط
    if current_user["role"] != UserRole.ADMIN and current_user.get("faculty_id"):
        if doc.get("faculty_id") and doc["faculty_id"] != current_user["faculty_id"]:
            raise HTTPException(status_code=403, detail="خارج نطاق كليتك")

    # طبّق التغيير على attendance
    await _apply_change_to_attendance(doc, current_user)

    # حدّث حالة الطلب
    await db.attendance_change_requests.update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "status": "approved",
            "reviewed_by": current_user["id"],
            "reviewed_by_name": current_user.get("full_name", ""),
            "reviewed_at": datetime.now(timezone.utc),
        }}
    )
    await log_activity(
        current_user, "approve_attendance_change", "attendance_change_request",
        req_id,
        f"اعتماد تعديل حضور الطالب {doc.get('student_name', '')} → {doc.get('new_status')}"
    )
    return {"success": True, "message": "تم اعتماد الطلب وتطبيق التغيير"}


@router.post("/attendance-changes/{req_id}/reject")
async def reject_change(
    req_id: str,
    payload: RejectPayload,
    current_user: dict = Depends(get_current_user),
):
    """رفض طلب تعديل حضور."""
    if not _can_approve(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك بالرفض")

    db = get_db()
    doc = await db.attendance_change_requests.find_one({"_id": ObjectId(req_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if doc.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"الطلب ليس معلّقاً (الحالة: {doc.get('status')})")
    if current_user["role"] != UserRole.ADMIN and current_user.get("faculty_id"):
        if doc.get("faculty_id") and doc["faculty_id"] != current_user["faculty_id"]:
            raise HTTPException(status_code=403, detail="خارج نطاق كليتك")

    await db.attendance_change_requests.update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "status": "rejected",
            "reviewed_by": current_user["id"],
            "reviewed_by_name": current_user.get("full_name", ""),
            "reviewed_at": datetime.now(timezone.utc),
            "review_notes": payload.review_notes or "",
        }}
    )
    await log_activity(
        current_user, "reject_attendance_change", "attendance_change_request",
        req_id,
        f"رفض تعديل حضور {doc.get('student_name', '')}: {payload.review_notes or ''}"
    )
    return {"success": True, "message": "تم رفض الطلب"}


@router.delete("/attendance-changes/{req_id}")
async def cancel_request(
    req_id: str,
    current_user: dict = Depends(get_current_user),
):
    """إلغاء ذاتي — مقدّم الطلب فقط، وهو معلّق."""
    db = get_db()
    doc = await db.attendance_change_requests.find_one({"_id": ObjectId(req_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if doc.get("status") != "pending":
        raise HTTPException(status_code=400, detail="لا يمكن إلغاء طلب غير معلّق")
    if doc.get("requested_by") != current_user["id"]:
        raise HTTPException(status_code=403, detail="لا يمكنك إلغاء طلب غيرك")

    await db.attendance_change_requests.update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "status": "cancelled",
            "reviewed_at": datetime.now(timezone.utc),
            "review_notes": "أُلغِي بواسطة المقدّم",
        }}
    )
    return {"success": True, "message": "تم إلغاء الطلب"}
