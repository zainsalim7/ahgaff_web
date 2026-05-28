"""
Global Search Route - بحث عام موحَّد
- يبحث في: الطلاب، المعلمين، المقررات، الأقسام، الكليات، المحاضرات
- يحترم صلاحيات المستخدم (RBAC)
- سريع: limit صغير لكل نوع + اختصار الحقول
"""
import re
from typing import Optional, List

from bson import ObjectId
from fastapi import APIRouter, Depends, Query

from .deps import get_current_user, get_db
from models.permissions import UserRole

router = APIRouter(tags=["البحث الشامل"])


def _esc(text: str) -> str:
    """تجهيز regex آمن (هروب الأحرف الخاصة)."""
    return re.escape(text or "")


@router.get("/search")
async def global_search(
    q: str = Query(..., min_length=1, description="نص البحث"),
    types: Optional[str] = Query(
        None,
        description="أنواع البحث مفصولة بفواصل: students,teachers,courses,departments,faculties,lectures",
    ),
    limit_per_type: int = Query(8, ge=1, le=20),
    current_user: dict = Depends(get_current_user),
):
    """بحث شامل في النظام مع احترام صلاحيات المستخدم.

    أمثلة:
        /api/search?q=أحمد                        → كل الأنواع
        /api/search?q=ABC&types=courses,students  → اختياري
    """
    db = get_db()
    q_clean = (q or "").strip()
    if not q_clean:
        return {"query": q, "results": {}, "total": 0}

    requested_types = {
        t.strip().lower()
        for t in (types or "students,teachers,courses,departments,faculties,lectures").split(",")
        if t.strip()
    }

    role = current_user.get("role")
    is_admin = role == UserRole.ADMIN
    is_teacher = role == UserRole.TEACHER
    is_student = role == UserRole.STUDENT

    regex = {"$regex": _esc(q_clean), "$options": "i"}
    results: dict = {}
    total = 0

    # =========================================
    # 1) الطلاب
    # =========================================
    if "students" in requested_types:
        student_query: dict = {
            "is_active": True,
            "$or": [
                {"full_name": regex},
                {"student_id": regex},
                {"reference_number": regex},
            ],
        }
        # المعلم لا يرى الطلاب من خلال البحث العام (يستخدم صفحات المقرر)
        if is_student:
            student_query = None  # type: ignore
        if student_query is not None and (is_admin or is_teacher):
            cursor = db.students.find(student_query).limit(limit_per_type)
            items: List[dict] = []
            async for s in cursor:
                items.append({
                    "id": str(s["_id"]),
                    "title": s.get("full_name", ""),
                    "subtitle": f"رقم القيد: {s.get('student_id', '')}"
                                + (f" - م{s.get('level', '')}" if s.get("level") else "")
                                + (f" - شعبة {s.get('section', '')}" if s.get("section") else ""),
                    "route": f"/student-details?id={str(s['_id'])}",
                    "type": "student",
                    "icon": "person",
                })
            if items:
                results["students"] = items
                total += len(items)

    # =========================================
    # 2) المعلمون
    # =========================================
    if "teachers" in requested_types:
        if is_admin or is_teacher:
            tq = {
                "$or": [
                    {"full_name": regex},
                    {"teacher_id": regex},
                    {"email": regex},
                ],
            }
            cursor = db.teachers.find(tq).limit(limit_per_type)
            items = []
            async for t in cursor:
                title = t.get("academic_title") or ""
                items.append({
                    "id": str(t["_id"]),
                    "title": t.get("full_name", ""),
                    "subtitle": f"رقم المعلم: {t.get('teacher_id', '')}"
                                + (f" - {title}" if title else ""),
                    "route": f"/teacher-details?id={str(t['_id'])}",
                    "type": "teacher",
                    "icon": "school",
                })
            if items:
                results["teachers"] = items
                total += len(items)

    # =========================================
    # 3) المقررات
    # =========================================
    if "courses" in requested_types:
        cq = {
            "is_active": True,
            "$or": [
                {"name": regex},
                {"code": regex},
            ],
        }
        # المعلم يرى مقرراته فقط
        if is_teacher:
            user_doc = await db.users.find_one({"_id": ObjectId(current_user["id"])})
            teacher_rec_id = (user_doc or {}).get("teacher_record_id") or current_user["id"]
            cq["teacher_id"] = str(teacher_rec_id)
        elif is_student:
            # الطالب يرى مقرراته المسجل بها فقط
            student = await db.students.find_one({"user_id": current_user["id"]})
            if student:
                enrolls = await db.enrollments.find(
                    {"student_id": str(student["_id"])}, {"course_id": 1}
                ).to_list(500)
                course_ids = [e["course_id"] for e in enrolls]
                if course_ids:
                    cq["_id"] = {"$in": [ObjectId(cid) for cid in course_ids if cid]}
                else:
                    cq = None  # type: ignore
            else:
                cq = None  # type: ignore

        if cq is not None:
            cursor = db.courses.find(cq).limit(limit_per_type)
            items = []
            async for c in cursor:
                lvl = c.get("level")
                sec = c.get("section")
                subtitle_parts = [f"كود: {c.get('code', '')}"]
                if lvl:
                    subtitle_parts.append(f"م{lvl}")
                if sec:
                    subtitle_parts.append(f"شعبة {sec}")
                items.append({
                    "id": str(c["_id"]),
                    "title": c.get("name", ""),
                    "subtitle": " - ".join(subtitle_parts),
                    "route": f"/course-details?id={str(c['_id'])}",
                    "type": "course",
                    "icon": "book",
                })
            if items:
                results["courses"] = items
                total += len(items)

    # =========================================
    # 4) الأقسام
    # =========================================
    if "departments" in requested_types and (is_admin or is_teacher):
        dq = {"$or": [{"name": regex}, {"code": regex}]}
        cursor = db.departments.find(dq).limit(limit_per_type)
        items = []
        async for d in cursor:
            items.append({
                "id": str(d["_id"]),
                "title": d.get("name", ""),
                "subtitle": f"كود: {d.get('code', '')}",
                "route": f"/department-details?id={str(d['_id'])}",
                "type": "department",
                "icon": "grid",
            })
        if items:
            results["departments"] = items
            total += len(items)

    # =========================================
    # 5) الكليات
    # =========================================
    if "faculties" in requested_types and (is_admin or is_teacher):
        fq = {"$or": [{"name": regex}, {"code": regex}]}
        cursor = db.faculties.find(fq).limit(limit_per_type)
        items = []
        async for f in cursor:
            items.append({
                "id": str(f["_id"]),
                "title": f.get("name", ""),
                "subtitle": f"كود: {f.get('code', '')}",
                "route": f"/faculty-details?id={str(f['_id'])}",
                "type": "faculty",
                "icon": "business",
            })
        if items:
            results["faculties"] = items
            total += len(items)

    # =========================================
    # 6) المحاضرات (بحث بالتاريخ أو اسم المقرر)
    # =========================================
    if "lectures" in requested_types:
        # تحقّق إن كان النص تاريخ
        lq: dict = {}
        if re.match(r"^\d{4}-\d{2}-\d{2}$", q_clean):
            lq["date"] = q_clean
        else:
            # اربط بالمقررات التي تطابق
            course_match_cursor = db.courses.find(
                {"$or": [{"name": regex}, {"code": regex}]}, {"_id": 1}
            ).limit(20)
            matching_course_ids = []
            async for c in course_match_cursor:
                matching_course_ids.append(str(c["_id"]))
            if not matching_course_ids:
                lq = None  # type: ignore
            else:
                lq["course_id"] = {"$in": matching_course_ids}

        if lq is not None:
            # احترام صلاحية المعلم/الطالب
            if is_teacher:
                user_doc = await db.users.find_one({"_id": ObjectId(current_user["id"])})
                teacher_rec_id = (user_doc or {}).get("teacher_record_id") or current_user["id"]
                # اقصر على مقررات هذا المعلم
                tc = await db.courses.find(
                    {"teacher_id": str(teacher_rec_id)}, {"_id": 1}
                ).to_list(500)
                allowed = [str(c["_id"]) for c in tc]
                existing = lq.get("course_id")
                if isinstance(existing, dict) and "$in" in existing:
                    existing["$in"] = [c for c in existing["$in"] if c in allowed]
                    if not existing["$in"]:
                        lq = None  # type: ignore
                else:
                    lq["course_id"] = {"$in": allowed}
            elif is_student:
                student = await db.students.find_one({"user_id": current_user["id"]})
                if student:
                    enr = await db.enrollments.find(
                        {"student_id": str(student["_id"])}, {"course_id": 1}
                    ).to_list(500)
                    allowed = [e["course_id"] for e in enr]
                    existing = lq.get("course_id") if lq else None
                    if isinstance(existing, dict) and "$in" in existing:
                        existing["$in"] = [c for c in existing["$in"] if c in allowed]
                        if not existing["$in"]:
                            lq = None  # type: ignore
                    elif lq is not None:
                        lq["course_id"] = {"$in": allowed}
                else:
                    lq = None  # type: ignore

        if lq is not None:
            cursor = db.lectures.find(lq).sort("date", -1).limit(limit_per_type)
            items = []
            # خريطة المقررات لاسم سريع
            lecs = await cursor.to_list(limit_per_type)
            cids = list({l.get("course_id") for l in lecs if l.get("course_id")})
            course_map: dict = {}
            if cids:
                try:
                    async for c in db.courses.find(
                        {"_id": {"$in": [ObjectId(cid) for cid in cids]}}, {"name": 1, "code": 1}
                    ):
                        course_map[str(c["_id"])] = c
                except Exception:
                    pass
            for l in lecs:
                cinfo = course_map.get(l.get("course_id"), {})
                items.append({
                    "id": str(l["_id"]),
                    "title": f"{cinfo.get('name', 'محاضرة')} - {l.get('date', '')}",
                    "subtitle": f"{l.get('start_time', '')} → {l.get('end_time', '')}"
                                + (f" | {l.get('room', '')}" if l.get('room') else ""),
                    "route": f"/lecture-details?id={str(l['_id'])}",
                    "type": "lecture",
                    "icon": "calendar",
                })
            if items:
                results["lectures"] = items
                total += len(items)

    return {"query": q_clean, "results": results, "total": total}
