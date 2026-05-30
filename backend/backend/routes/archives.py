"""
Archives Routes - مسارات الأرشيف الدراسي
- يقرأ من collection `semester_archives` فقط (لا يكتب)
- يفلتر حسب صلاحية VIEW_ARCHIVE / SEARCH_ARCHIVE
"""
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from .deps import get_current_user, get_db
from models.permissions import Permission

router = APIRouter(tags=["الأرشيف الدراسي"])


def _has_archive_perm(user: dict, perm: str = Permission.VIEW_ARCHIVE) -> bool:
    if user.get("role") == "admin":
        return True
    perms = set(user.get("permissions") or [])
    return perm in perms


def _require_view(user: dict):
    if not _has_archive_perm(user, Permission.VIEW_ARCHIVE):
        raise HTTPException(status_code=403, detail="ليست لديك صلاحية الوصول للأرشيف")


def _require_search(user: dict):
    if not _has_archive_perm(user, Permission.SEARCH_ARCHIVE):
        raise HTTPException(status_code=403, detail="ليست لديك صلاحية البحث في الأرشيف")


def _norm_ar(text: str) -> str:
    if not text:
        return ""
    s = str(text)
    s = re.sub(r"[\u064B-\u0652\u0670\u0640]", "", s)
    s = re.sub(r"[إأآا]", "ا", s)
    s = s.replace("ة", "ه").replace("ى", "ي")
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


@router.get("/archives")
async def list_archives(current_user: dict = Depends(get_current_user)):
    """قائمة الفصول المؤرشفة (ملخصات فقط)."""
    _require_view(current_user)
    db = get_db()
    items = []
    cursor = db.semester_archives.find(
        {},
        {"semester_id": 1, "semester_name": 1, "academic_year": 1,
         "semester_start": 1, "semester_end": 1,
         "archived_at": 1, "archived_by_name": 1, "summary": 1}
    ).sort("archived_at", -1)
    async for a in cursor:
        items.append({
            "archive_id": str(a["_id"]),
            "semester_id": a.get("semester_id"),
            "semester_name": a.get("semester_name"),
            "academic_year": a.get("academic_year"),
            "semester_start": a.get("semester_start"),
            "semester_end": a.get("semester_end"),
            "archived_at": a.get("archived_at"),
            "archived_by_name": a.get("archived_by_name"),
            "summary": a.get("summary", {}),
        })
    return {"items": items, "total": len(items)}


async def _load_archive(db, semester_id: str) -> dict:
    a = await db.semester_archives.find_one({"semester_id": semester_id})
    if not a:
        raise HTTPException(status_code=404, detail="الفصل غير مؤرشف أو غير موجود")
    a["archive_id"] = str(a.pop("_id"))
    return a


@router.get("/archives/search")
async def search_archives(
    q: str = Query(..., min_length=2, description="نص البحث"),
    type: Optional[str] = Query(None, description="students|teachers|courses|all"),
    semester_id: Optional[str] = Query(None, description="فلترة فصل معين"),
    current_user: dict = Depends(get_current_user),
):
    """البحث في الأرشيف: طلاب، معلمين، مقررات عبر كل الفصول المؤرشفة (أو فصل محدد).
    ملاحظة: هذا المسار يجب أن يأتي قبل /archives/{semester_id} لتجنب التضارب.
    """
    _require_search(current_user)
    db = get_db()

    norm_q = _norm_ar(q)
    types = [type] if type and type != "all" else ["students", "teachers", "courses"]

    filter_q = {}
    if semester_id:
        filter_q["semester_id"] = semester_id

    results = {"students": [], "teachers": [], "courses": []}

    async for a in db.semester_archives.find(filter_q):
        sem_label = f"{a.get('semester_name', '')} ({a.get('academic_year', '')})"
        sid = a.get("semester_id")

        if "students" in types:
            for s in a.get("students_snapshot", []):
                hay = " ".join([str(s.get("full_name") or ""),
                                str(s.get("student_id") or ""),
                                str(s.get("reference_number") or "")])
                if norm_q in _norm_ar(hay):
                    results["students"].append({
                        **s, "semester_id": sid, "semester_label": sem_label,
                        "route": f"/archive-details?semesterId={sid}",
                    })
        if "teachers" in types:
            for t in a.get("teachers_snapshot", []):
                hay = " ".join([str(t.get("full_name") or ""), str(t.get("teacher_id") or "")])
                if norm_q in _norm_ar(hay):
                    results["teachers"].append({
                        **t, "semester_id": sid, "semester_label": sem_label,
                        "route": f"/archive-details?semesterId={sid}",
                    })
        if "courses" in types:
            for c in a.get("courses", []):
                hay = " ".join([str(c.get("name") or ""), str(c.get("code") or "")])
                if norm_q in _norm_ar(hay):
                    results["courses"].append({
                        "id": c.get("id"), "name": c.get("name"), "code": c.get("code"),
                        "teacher_name": c.get("teacher_name"),
                        "department_name": c.get("department_name"),
                        "students_count": c.get("students_count"),
                        "semester_id": sid, "semester_label": sem_label,
                        "route": f"/archive-details?semesterId={sid}&tab=courses",
                    })

    total = sum(len(v) for v in results.values())
    return {"query": q, "results": results, "total": total}


@router.get("/archives/{semester_id}")
async def get_archive_summary(semester_id: str, current_user: dict = Depends(get_current_user)):
    """ملخص فصل مؤرشف مع الإحصائيات والـ snapshots المختصرة."""
    _require_view(current_user)
    db = get_db()
    a = await _load_archive(db, semester_id)
    return {
        "archive_id": a["archive_id"],
        "semester_id": a.get("semester_id"),
        "semester_name": a.get("semester_name"),
        "academic_year": a.get("academic_year"),
        "semester_start": a.get("semester_start"),
        "semester_end": a.get("semester_end"),
        "archived_at": a.get("archived_at"),
        "archived_by_name": a.get("archived_by_name"),
        "summary": a.get("summary", {}),
        "departments": a.get("departments_snapshot", []),
        "faculties": a.get("faculties_snapshot", []),
    }


@router.get("/archives/{semester_id}/courses")
async def get_archive_courses(semester_id: str, current_user: dict = Depends(get_current_user)):
    """قائمة المقررات في فصل مؤرشف (مع المعلم والقسم والإحصائيات)."""
    _require_view(current_user)
    db = get_db()
    a = await _load_archive(db, semester_id)
    return {
        "semester_id": semester_id,
        "semester_name": a.get("semester_name"),
        "courses": a.get("courses", []),
        "total": len(a.get("courses", [])),
    }


@router.get("/archives/{semester_id}/courses/{course_id}")
async def get_archive_course_details(
    semester_id: str, course_id: str,
    current_user: dict = Depends(get_current_user),
):
    """تفاصيل مقرر مؤرشف: بياناته + طلابه (مع نسب حضور) + محاضراته."""
    _require_view(current_user)
    db = get_db()
    a = await _load_archive(db, semester_id)

    course = next((c for c in a.get("courses", []) if c.get("id") == course_id), None)
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود في الأرشيف")

    # محاضرات المقرر
    lectures = [l for l in a.get("lectures", []) if str(l.get("course_id")) == course_id]
    # تسجيلات المقرر
    enrollments = [e for e in a.get("enrollments", []) if str(e.get("course_id")) == course_id]
    enrolled_student_ids = {str(e.get("student_id")) for e in enrollments if e.get("student_id")}

    # حضور المقرر (مفهرس بالطالب)
    attendance = [att for att in a.get("attendance", []) if str(att.get("course_id")) == course_id]
    students_map = {s["id"]: s for s in a.get("students_snapshot", [])}

    students_list = []
    completed_total = course.get("lectures_completed", 0)
    for sid in enrolled_student_ids:
        s_info = students_map.get(sid, {"id": sid, "full_name": "(محذوف)", "student_id": ""})
        s_att = [a2 for a2 in attendance if str(a2.get("student_id")) == sid]
        present = sum(1 for x in s_att if x.get("status") == "present")
        absent = sum(1 for x in s_att if x.get("status") == "absent")
        late = sum(1 for x in s_att if x.get("status") == "late")
        excused = sum(1 for x in s_att if x.get("status") == "excused")
        total = present + absent + late + excused
        rate = round(((present + late) / total * 100) if total else 0, 1)
        students_list.append({
            **s_info, "present": present, "absent": absent,
            "late": late, "excused": excused, "total": total, "attendance_pct": rate,
        })
    students_list.sort(key=lambda x: x.get("full_name") or "")

    return {
        "course": course,
        "students": students_list,
        "students_count": len(students_list),
        "lectures": lectures,
        "lectures_count": len(lectures),
        "completed_lectures": completed_total,
    }


@router.get("/archives/{semester_id}/students")
async def get_archive_students(semester_id: str, current_user: dict = Depends(get_current_user)):
    """قائمة الطلاب في فصل مؤرشف مع نسب حضورهم الإجمالية."""
    _require_view(current_user)
    db = get_db()
    a = await _load_archive(db, semester_id)

    students_map = {s["id"]: s for s in a.get("students_snapshot", [])}
    attendance = a.get("attendance", [])
    enrollments = a.get("enrollments", [])

    # تجميع حضور كل طالب
    per_student = {}
    for x in attendance:
        sid = str(x.get("student_id") or "")
        if not sid:
            continue
        d = per_student.setdefault(sid, {"present": 0, "absent": 0, "late": 0, "excused": 0})
        st = x.get("status")
        if st in d:
            d[st] += 1

    # عدد المقررات لكل طالب
    courses_per_student = {}
    for e in enrollments:
        sid = str(e.get("student_id") or "")
        if sid:
            courses_per_student[sid] = courses_per_student.get(sid, 0) + 1

    result = []
    for sid, info in students_map.items():
        st = per_student.get(sid, {"present": 0, "absent": 0, "late": 0, "excused": 0})
        total = st["present"] + st["absent"] + st["late"] + st["excused"]
        rate = round(((st["present"] + st["late"]) / total * 100) if total else 0, 1)
        result.append({
            **info,
            "courses_count": courses_per_student.get(sid, 0),
            **st, "total": total, "attendance_pct": rate,
        })
    result.sort(key=lambda x: -x.get("attendance_pct", 0))
    return {"semester_id": semester_id, "students": result, "total": len(result)}


@router.get("/archives/{semester_id}/teachers")
async def get_archive_teachers(semester_id: str, current_user: dict = Depends(get_current_user)):
    """عبء المعلمين في فصل مؤرشف."""
    _require_view(current_user)
    db = get_db()
    a = await _load_archive(db, semester_id)

    teachers_map = {t["id"]: t for t in a.get("teachers_snapshot", [])}
    courses = a.get("courses", [])

    workload = {}
    for c in courses:
        tid = str(c.get("teacher_id") or "")
        if not tid:
            continue
        d = workload.setdefault(tid, {"courses_count": 0, "students_total": 0,
                                       "lectures_total": 0, "lectures_completed": 0,
                                       "credit_hours": 0})
        d["courses_count"] += 1
        d["students_total"] += int(c.get("students_count") or 0)
        d["lectures_total"] += int(c.get("lectures_total") or 0)
        d["lectures_completed"] += int(c.get("lectures_completed") or 0)
        d["credit_hours"] += int(c.get("credit_hours") or 0)

    result = []
    for tid, info in teachers_map.items():
        w = workload.get(tid, {"courses_count": 0, "students_total": 0,
                                "lectures_total": 0, "lectures_completed": 0, "credit_hours": 0})
        completion = round((w["lectures_completed"] / w["lectures_total"] * 100)
                           if w["lectures_total"] else 0, 1)
        result.append({**info, **w, "completion_pct": completion})
    result.sort(key=lambda x: -x.get("courses_count", 0))
    return {"semester_id": semester_id, "teachers": result, "total": len(result)}
