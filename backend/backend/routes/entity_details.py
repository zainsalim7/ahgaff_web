"""
Details Routes - endpoints جديدة لصفحات التفاصيل في الـ admin web.
لا تؤثر على أي endpoint موجود (تطبيقات المعلم والطالب آمنة).
"""
from typing import Optional
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from .deps import get_current_user, get_db
from ._active_semester import (
    get_active_semester,
    apply_lecture_active_sem,
    get_teacher_active_course_ids,
    get_courses_lecture_counts,
)

router = APIRouter(tags=["تفاصيل الكيانات"])


@router.get("/teachers/{teacher_id}/full-profile")
async def get_teacher_full_profile(
    teacher_id: str,
    semester_id: Optional[str] = None,
    all_semesters: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """ملف كامل للمعلم: بيانات + مقررات + إحصائيات.

    🔧 يفلتر بالفصل النشط افتراضياً (اتساقاً مع /teachers/{id}/courses).
    - semester_id: لجلب فصل محدد.
    - all_semesters=true: لعرض كل المقررات تاريخياً.
    """
    db = get_db()
    try:
        teacher = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="معرف غير صالح")
    if not teacher:
        raise HTTPException(status_code=404, detail="المعلم غير موجود")

    # أسماء الأقسام
    dept_ids = teacher.get("department_ids") or ([teacher.get("department_id")] if teacher.get("department_id") else [])
    departments = []
    if dept_ids:
        try:
            obj_ids = [ObjectId(d) for d in dept_ids if d]
            async for d in db.departments.find({"_id": {"$in": obj_ids}}):
                departments.append({"id": str(d["_id"]), "name": d.get("name", "")})
        except Exception:
            pass

    # 🔧 تحديد الفصل المستهدف بنفس منطق باقي endpoints
    target_sem = None
    if not all_semesters:
        if semester_id:
            try:
                _s = await db.semesters.find_one({"_id": ObjectId(semester_id)})
                if _s:
                    target_sem = {
                        "id": str(_s["_id"]),
                        "name": _s.get("name", ""),
                        "start_date": _s.get("start_date"),
                        "end_date": _s.get("end_date"),
                    }
            except Exception:
                pass
        else:
            target_sem = await get_active_semester(db)

    # 🔧 جمع معرّفات المقررات من UNION (courses.teacher_id ∪ teaching_loads)
    if target_sem:
        course_ids_set = await get_teacher_active_course_ids(db, teacher_id, target_sem)
        # تحميل المقررات الفعلية
        try:
            obj_ids = [ObjectId(cid) for cid in course_ids_set]
        except Exception:
            obj_ids = []
        courses_cursor = db.courses.find({"_id": {"$in": obj_ids}, "is_active": True}) if obj_ids else None
    else:
        # all_semesters: نعرض كل المقررات بناءً على teacher_id فقط (السلوك القديم)
        courses_cursor = db.courses.find({"teacher_id": teacher_id, "is_active": True})

    courses = []
    total_students = 0
    total_credit_hours = 0
    course_list_for_counts = []
    if courses_cursor is not None:
        async for c in courses_cursor:
            cid = str(c["_id"])
            course_list_for_counts.append(cid)
            student_count = await db.enrollments.count_documents({"course_id": cid})
            ch = c.get("credit_hours", 3) or 3
            total_credit_hours += ch
            total_students += student_count
            courses.append({
                "id": cid,
                "name": c.get("name", ""),
                "code": c.get("code", ""),
                "level": c.get("level"),
                "section": c.get("section", ""),
                "credit_hours": ch,
                "room": c.get("room", ""),
                "students_count": student_count,
                # سيتم تعبئة lectures_total/completed أدناه دفعةً واحدة
                "lectures_total": 0,
                "lectures_completed": 0,
                "completion_pct": 0.0,
            })

    # 🔧 حساب عدد المحاضرات (إجمالي + مكتملة) دفعةً واحدة باستخدام نفس فلتر الفصل
    if course_list_for_counts:
        total_counts = await get_courses_lecture_counts(db, course_list_for_counts, target_sem)
        completed_match: dict = {"course_id": {"$in": course_list_for_counts}, "status": "completed"}
        apply_lecture_active_sem(completed_match, target_sem)
        completed_counts: dict = {}
        async for row in db.lectures.aggregate([
            {"$match": completed_match},
            {"$group": {"_id": "$course_id", "count": {"$sum": 1}}},
        ]):
            completed_counts[row["_id"]] = int(row.get("count") or 0)
        for c in courses:
            total = total_counts.get(c["id"], 0)
            completed = completed_counts.get(c["id"], 0)
            c["lectures_total"] = total
            c["lectures_completed"] = completed
            c["completion_pct"] = round((completed / total * 100) if total else 0, 1)

    return {
        "id": str(teacher["_id"]),
        "teacher_id": teacher.get("teacher_id", ""),
        "full_name": teacher.get("full_name", ""),
        "email": teacher.get("email"),
        "phone": teacher.get("phone"),
        "specialization": teacher.get("specialization"),
        "academic_title": teacher.get("academic_title"),
        "weekly_hours": teacher.get("weekly_hours", 12),
        "departments": departments,
        "courses": courses,
        "semester_id": target_sem["id"] if target_sem else None,
        "semester_name": target_sem["name"] if target_sem else ("كل الفصول" if all_semesters else None),
        "stats": {
            "courses_count": len(courses),
            "total_students": total_students,
            "total_credit_hours": total_credit_hours,
        },
    }


@router.get("/courses/{course_id}/full-details")
async def get_course_full_details(
    course_id: str,
    current_user: dict = Depends(get_current_user),
):
    """تفاصيل كاملة للمقرر: بيانات + معلم + طلاب + إحصائيات محاضرات."""
    db = get_db()
    try:
        course = await db.courses.find_one({"_id": ObjectId(course_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="معرف غير صالح")
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")

    # المعلم
    teacher_name = None
    teacher_id = course.get("teacher_id")
    if teacher_id:
        try:
            t = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
            if t:
                teacher_name = t.get("full_name")
            else:
                u = await db.users.find_one({"_id": ObjectId(teacher_id)})
                if u:
                    teacher_name = u.get("full_name", u.get("username"))
        except Exception:
            pass

    # القسم والكلية والفصل
    department_name = None
    if course.get("department_id"):
        try:
            d = await db.departments.find_one({"_id": ObjectId(course["department_id"])})
            if d:
                department_name = d.get("name")
        except Exception:
            pass

    semester_name = None
    if course.get("semester_id"):
        try:
            s = await db.semesters.find_one({"_id": ObjectId(course["semester_id"])})
            if s:
                semester_name = s.get("name")
        except Exception:
            pass

    # الطلاب (مع نسب حضور)
    students = []
    enrollments = await db.enrollments.find({"course_id": course_id}).to_list(2000)
    if enrollments:
        student_ids = [ObjectId(e["student_id"]) for e in enrollments if e.get("student_id")]
        student_docs = {}
        async for s in db.students.find({"_id": {"$in": student_ids}, "is_active": True}):
            student_docs[str(s["_id"])] = s

        # عدد المحاضرات المكتملة في الفصل النشط — نفس فلتر بقية الـ endpoints
        _completed_match: dict = {"course_id": course_id, "status": "completed"}
        try:
            _act = await get_active_semester(db)
            apply_lecture_active_sem(_completed_match, _act)
        except Exception:
            pass
        total_lectures = await db.lectures.count_documents(_completed_match)
        for sid, s in student_docs.items():
            present = await db.attendance.count_documents({"course_id": course_id, "student_id": sid, "status": "present"})
            absent = await db.attendance.count_documents({"course_id": course_id, "student_id": sid, "status": "absent"})
            pct = round((present / total_lectures * 100) if total_lectures else 0, 1)
            students.append({
                "id": sid,
                "student_id": s.get("student_id"),
                "full_name": s.get("full_name"),
                "attendance_pct": pct,
                "present_count": present,
                "absent_count": absent,
            })
        students.sort(key=lambda x: x.get("full_name") or "")

    # 🔧 إحصائيات المحاضرات — نفلتر بالفصل الذي ينتمي إليه المقرر نفسه
    # (وليس الفصل النشط) كي تتطابق الأرقام مع توقع المستخدم:
    # عند فتح مقرر من فصل مؤرشف، يجب أن يعرض محاضرات ذلك الفصل.
    lec_stats = {"total": 0, "completed": 0, "scheduled": 0, "cancelled": 0, "absent": 0}
    lec_match: dict = {"course_id": course_id}
    try:
        course_sem_id = course.get("semester_id")
        if course_sem_id:
            _course_sem = await db.semesters.find_one({"_id": ObjectId(course_sem_id)})
            if _course_sem:
                apply_lecture_active_sem(lec_match, {
                    "id": str(_course_sem["_id"]),
                    "name": _course_sem.get("name", ""),
                    "start_date": _course_sem.get("start_date"),
                    "end_date": _course_sem.get("end_date"),
                })
        else:
            # المقرر بلا فصل: نعتمد على الفصل النشط
            _act = await get_active_semester(db)
            apply_lecture_active_sem(lec_match, _act)
    except Exception:
        pass

    async for row in db.lectures.aggregate([
        {"$match": lec_match},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]):
        st = row.get("_id") or "scheduled"
        c = int(row.get("count") or 0)
        lec_stats["total"] += c
        if st in lec_stats:
            lec_stats[st] = c

    # الخطة الدراسية
    plan = await db.study_plans.find_one({"course_id": course_id})
    plan_summary = None
    if plan:
        topics = plan.get("topics", []) or []
        confirmed = sum(1 for t in topics if t.get("confirmed"))
        plan_summary = {
            "total_topics": len(topics),
            "confirmed_topics": confirmed,
            "completion_pct": round((confirmed / len(topics) * 100) if topics else 0, 1),
        }

    return {
        "id": str(course["_id"]),
        "name": course.get("name", ""),
        "code": course.get("code", ""),
        "level": course.get("level"),
        "section": course.get("section", ""),
        "credit_hours": course.get("credit_hours", 3),
        "room": course.get("room", ""),
        "teacher_id": teacher_id,
        "teacher_name": teacher_name,
        "department_id": course.get("department_id"),
        "department_name": department_name,
        "semester_id": course.get("semester_id"),
        "semester_name": semester_name,
        "academic_year": course.get("academic_year"),
        "students": students,
        "students_count": len(students),
        "lecture_stats": lec_stats,
        "study_plan": plan_summary,
    }


@router.get("/departments/{dept_id}/summary")
async def get_department_summary(
    dept_id: str,
    current_user: dict = Depends(get_current_user),
):
    """ملخص قسم: بيانات + كلية + إحصائيات + معلمين + مقررات."""
    db = get_db()
    try:
        dept = await db.departments.find_one({"_id": ObjectId(dept_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="معرف غير صالح")
    if not dept:
        raise HTTPException(status_code=404, detail="القسم غير موجود")

    # الكلية
    faculty_name = None
    if dept.get("faculty_id"):
        try:
            f = await db.faculties.find_one({"_id": ObjectId(dept["faculty_id"])})
            if f:
                faculty_name = f.get("name")
        except Exception:
            pass

    # رئيس القسم
    head_name = None
    if dept.get("head_id"):
        try:
            u = await db.users.find_one({"_id": ObjectId(dept["head_id"])})
            if u:
                head_name = u.get("full_name", u.get("username"))
        except Exception:
            pass

    # إحصائيات
    students_count = await db.students.count_documents({"department_id": dept_id, "is_active": True})
    courses_count = await db.courses.count_documents({"department_id": dept_id, "is_active": True})
    teachers_count = await db.teachers.count_documents({
        "$or": [
            {"department_id": dept_id},
            {"department_ids": dept_id},
        ]
    })

    # أسماء المعلمين
    teachers = []
    async for t in db.teachers.find({
        "$or": [{"department_id": dept_id}, {"department_ids": dept_id}]
    }).limit(50):
        teachers.append({
            "id": str(t["_id"]),
            "full_name": t.get("full_name", ""),
            "teacher_id": t.get("teacher_id", ""),
            "academic_title": t.get("academic_title"),
        })

    # المقررات
    courses = []
    async for c in db.courses.find({"department_id": dept_id, "is_active": True}).limit(100):
        courses.append({
            "id": str(c["_id"]),
            "name": c.get("name", ""),
            "code": c.get("code", ""),
            "level": c.get("level"),
            "section": c.get("section", ""),
        })

    return {
        "id": str(dept["_id"]),
        "name": dept.get("name", ""),
        "code": dept.get("code", ""),
        "faculty_id": dept.get("faculty_id"),
        "faculty_name": faculty_name,
        "head_id": dept.get("head_id"),
        "head_name": head_name,
        "stats": {
            "students_count": students_count,
            "courses_count": courses_count,
            "teachers_count": teachers_count,
        },
        "teachers": teachers,
        "courses": courses,
    }


@router.get("/faculties/{faculty_id}/summary")
async def get_faculty_summary(
    faculty_id: str,
    current_user: dict = Depends(get_current_user),
):
    """ملخص كلية: بيانات + عميد + أقسام + إحصائيات."""
    db = get_db()
    try:
        faculty = await db.faculties.find_one({"_id": ObjectId(faculty_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="معرف غير صالح")
    if not faculty:
        raise HTTPException(status_code=404, detail="الكلية غير موجودة")

    # العميد
    dean_name = None
    if faculty.get("dean_id"):
        try:
            u = await db.users.find_one({"_id": ObjectId(faculty["dean_id"])})
            if u:
                dean_name = u.get("full_name", u.get("username"))
        except Exception:
            pass

    # الأقسام
    departments = []
    async for d in db.departments.find({"faculty_id": faculty_id}):
        did = str(d["_id"])
        sc = await db.students.count_documents({"department_id": did, "is_active": True})
        cc = await db.courses.count_documents({"department_id": did, "is_active": True})
        departments.append({
            "id": did,
            "name": d.get("name", ""),
            "code": d.get("code", ""),
            "students_count": sc,
            "courses_count": cc,
        })

    total_students = sum(d["students_count"] for d in departments)
    total_courses = sum(d["courses_count"] for d in departments)

    return {
        "id": str(faculty["_id"]),
        "name": faculty.get("name", ""),
        "code": faculty.get("code", ""),
        "dean_id": faculty.get("dean_id"),
        "dean_name": dean_name,
        "departments": departments,
        "stats": {
            "departments_count": len(departments),
            "students_count": total_students,
            "courses_count": total_courses,
        },
    }
