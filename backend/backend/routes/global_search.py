"""
Global Search Route - بحث عام موحَّد
- يبحث في: الطلاب، المعلمين، المقررات، الأقسام، الكليات، المحاضرات
- يحترم صلاحيات المستخدم (RBAC) ونطاق الكلية/القسم
- سريع: limit صغير لكل نوع + اختصار الحقول
"""
import re
from typing import Optional, List
from urllib.parse import quote

from bson import ObjectId
from fastapi import APIRouter, Depends, Query

from .deps import get_current_user, get_db, has_any_permission, get_scope_filter
from models.permissions import UserRole, Permission

router = APIRouter(tags=["البحث الشامل"])


async def _scope_filter(current_user: dict, scope_type: str) -> dict:
    """فلتر النطاق حسب كلية/قسم المستخدم - يستخدم الدالة المسجَّلة في deps."""
    return await get_scope_filter(current_user, scope_type)


def _normalize_arabic(text: str) -> str:
    """تطبيع النص العربي للبحث الذكي:
    - توحيد الألف (أ، إ، آ → ا)
    - توحيد التاء المربوطة (ة → ه)
    - توحيد الياء (ى → ي)
    - إزالة التشكيل والمسافات الزائدة
    """
    if not text:
        return ""
    s = str(text)
    # إزالة التشكيل
    s = re.sub(r"[\u064B-\u0652\u0670\u0640]", "", s)
    # توحيد الألف
    s = re.sub(r"[إأآا]", "ا", s)
    # توحيد التاء المربوطة والهاء
    s = s.replace("ة", "ه")
    # توحيد الياء والألف المقصورة
    s = s.replace("ى", "ي").replace("ي", "ي")
    # تنظيف المسافات
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _build_smart_regex(text: str) -> dict:
    """بناء regex ذكي للبحث العربي.
    يبني pattern يطابق الكلمة سواء كُتبت بهمزة أو بدونها.
    """
    if not text:
        return {"$regex": "", "$options": "i"}
    s = _normalize_arabic(text)
    # هروب الأحرف الخاصة
    s = re.escape(s)
    # اجعل كل ألف يطابق أي شكل من أشكالها
    s = s.replace("ا", "[إأآا]")
    # اجعل التاء المربوطة تطابق الهاء أيضاً
    s = s.replace("ه", "[هة]")
    # اجعل الياء تطابق الألف المقصورة أيضاً
    s = s.replace("ي", "[يى]")
    return {"$regex": s, "$options": "i"}


def _esc(text: str) -> str:
    """تجهيز regex آمن (هروب الأحرف الخاصة)."""
    return re.escape(text or "")


def _merge_query(base: dict, scope: dict) -> dict:
    """دمج فلتر النطاق مع query البحث.
    - إذا كان scope يحتوي على department_id/faculty_id/_id فإنه يُدمج بـ AND منطقي.
    - يحافظ على $or البحث النصي.
    """
    if not scope:
        return base
    merged = dict(base)
    for k, v in scope.items():
        merged[k] = v
    return merged


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
    """بحث شامل في النظام مع احترام صلاحيات المستخدم ونطاقه (كلية/قسم).

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

    # فحص الصلاحيات الدقيقة لكل نوع
    # ملاحظة: المستخدمون المرتبطون بكلية/قسم يمكنهم رؤيتها في البحث
    # حتى لو لم يكن لديهم صلاحية MANAGE_FACULTIES صراحةً
    has_scope = bool(current_user.get("faculty_id") or current_user.get("department_id"))

    can_search_students = is_admin or is_teacher or has_any_permission(
        current_user, [Permission.VIEW_STUDENTS, Permission.MANAGE_STUDENTS]
    )
    can_search_teachers = is_admin or is_teacher or has_scope or has_any_permission(
        current_user, [Permission.VIEW_TEACHERS, Permission.MANAGE_TEACHERS,
                       Permission.VIEW_TEACHING_LOAD, Permission.MANAGE_TEACHING_LOAD,
                       # المسجِّلون ومن يديرون التسجيل/الإحصاءات يحتاجون
                       # رؤية معلمي كليتهم في البحث (مقيَّدون بالـ scope)
                       Permission.MANAGE_ENROLLMENTS, Permission.VIEW_ENROLLMENTS,
                       Permission.VIEW_REPORTS, Permission.VIEW_STATISTICS]
    )
    can_search_courses = is_admin or is_teacher or is_student or has_any_permission(
        current_user, [Permission.VIEW_COURSES, Permission.MANAGE_COURSES]
    )
    can_search_departments = is_admin or is_teacher or has_scope or has_any_permission(
        current_user, [Permission.VIEW_DEPARTMENTS, Permission.MANAGE_DEPARTMENTS]
    )
    can_search_faculties = is_admin or is_teacher or has_scope or has_any_permission(
        current_user, [Permission.VIEW_FACULTIES, Permission.MANAGE_FACULTIES]
    )
    can_search_lectures = is_admin or is_teacher or is_student or has_any_permission(
        current_user, [Permission.VIEW_LECTURES, Permission.MANAGE_LECTURES,
                       Permission.VIEW_COURSES, Permission.MANAGE_COURSES]
    )

    regex = _build_smart_regex(q_clean)
    code_regex = {"$regex": _esc(q_clean), "$options": "i"}  # للأكواد (لا تطبيع)
    results: dict = {}
    total = 0

    # 🆕 جلب الفصل النشط مرة واحدة لاستخدامه في فلترة المقررات والمحاضرات
    # ملاحظة مهمة: الـ semester_id في DB قد يكون string أو ObjectId (بسبب بيانات قديمة)،
    # لذلك نُجهّز قيمتين للمطابقة، ونستثني أيضاً أي مقرر بدون semester_id (قوالب قديمة).
    active_semester_id: Optional[str] = None
    active_semester_oid = None
    try:
        active_sem = await db.semesters.find_one({"status": "active"})
        if active_sem:
            active_semester_id = str(active_sem["_id"])
            active_semester_oid = active_sem["_id"]
    except Exception:
        active_semester_id = None

    def _active_sem_filter() -> dict:
        """فلتر يطابق semester_id == active_semester_id سواء كان string أو ObjectId."""
        if not active_semester_id:
            return {}
        return {"semester_id": {"$in": [active_semester_id, active_semester_oid]}}

    # خرائط مرجعية تُجلب عند الحاجة لإثراء العناوين الفرعية بأسماء الأقسام/الكليات
    async def _resolve_names(dept_ids: set, faculty_ids: set):
        depts_map, facs_map = {}, {}
        if dept_ids:
            try:
                async for d in db.departments.find(
                    {"_id": {"$in": [ObjectId(x) for x in dept_ids if x]}}, {"name": 1, "faculty_id": 1}
                ):
                    depts_map[str(d["_id"])] = d
                    if d.get("faculty_id"):
                        faculty_ids.add(str(d["faculty_id"]))
            except Exception:
                pass
        if faculty_ids:
            try:
                async for f in db.faculties.find(
                    {"_id": {"$in": [ObjectId(x) for x in faculty_ids if x]}}, {"name": 1}
                ):
                    facs_map[str(f["_id"])] = f.get("name", "")
            except Exception:
                pass
        return depts_map, facs_map

    # ترجمة حالة الطالب لنص عربي مختصر
    status_label = {
        "active": "نشط",
        "graduated": "متخرّج",
        "repeat": "إعادة",
        "expelled": "مفصول",
        "frozen": "مجمَّد",
        "inactive": "غير نشط",
    }

    # =========================================
    # 1) الطلاب
    # =========================================
    if "students" in requested_types and can_search_students and not is_student:
        student_query: dict = {
            "is_active": True,
            "$or": [
                {"full_name": regex},
                {"student_id": code_regex},
                {"reference_number": code_regex},
            ],
        }
        # تطبيق نطاق الكلية/القسم للأدوار غير الإدارية
        scope = await _scope_filter(current_user, "students")
        student_query = _merge_query(student_query, scope)

        cursor = db.students.find(student_query).limit(limit_per_type)
        students_list = await cursor.to_list(limit_per_type)
        dept_ids = {str(s.get("department_id", "")) for s in students_list if s.get("department_id")}
        fac_ids = {str(s.get("faculty_id", "")) for s in students_list if s.get("faculty_id")}
        depts_map, facs_map = await _resolve_names(dept_ids, fac_ids)
        items: List[dict] = []
        for s in students_list:
            parts = [f"رقم القيد: {s.get('student_id', '')}"]
            dept_doc = depts_map.get(str(s.get("department_id", "")))
            if dept_doc:
                parts.append(f"قسم: {(dept_doc.get('name', '') or '').strip()}")
                fac_id_from_dept = str(dept_doc.get("faculty_id", "") or "")
                fac_name = facs_map.get(fac_id_from_dept) or facs_map.get(str(s.get("faculty_id", "")))
                if fac_name:
                    parts.append(f"كلية: {(fac_name or '').strip()}")
            if s.get("level"):
                parts.append(f"م{s.get('level')}")
            if s.get("section"):
                parts.append(f"شعبة {s.get('section')}")
            st = s.get("status") or ("active" if s.get("is_active", True) else "inactive")
            parts.append(f"الحالة: {status_label.get(st, st)}")
            items.append({
                "id": str(s["_id"]),
                "title": s.get("full_name", ""),
                "subtitle": " · ".join(parts),
                "route": f"/student-details?studentId={str(s['_id'])}",
                "type": "student",
                "icon": "person",
            })
        if items:
            results["students"] = items
            total += len(items)

    # =========================================
    # 2) المعلمون
    # =========================================
    if "teachers" in requested_types and can_search_teachers:
        tq = {
            "$or": [
                {"full_name": regex},
                {"teacher_id": code_regex},
                {"email": code_regex},
            ],
        }
        # تطبيق نطاق الكلية/القسم
        scope = await _scope_filter(current_user, "teachers")
        tq = _merge_query(tq, scope)

        cursor = db.teachers.find(tq).limit(limit_per_type)
        teachers_list = await cursor.to_list(limit_per_type)
        dept_ids = {str(t.get("department_id", "")) for t in teachers_list if t.get("department_id")}
        fac_ids = {str(t.get("faculty_id", "")) for t in teachers_list if t.get("faculty_id")}
        depts_map, facs_map = await _resolve_names(dept_ids, fac_ids)
        items = []
        for t in teachers_list:
            title = t.get("academic_title") or ""
            parts = [f"رقم المعلم: {t.get('teacher_id', '')}"]
            if title:
                parts.append(title)
            dept_doc = depts_map.get(str(t.get("department_id", "")))
            if dept_doc:
                parts.append(f"قسم: {(dept_doc.get('name', '') or '').strip()}")
            fac_name = facs_map.get(str(t.get("faculty_id", ""))) or (
                facs_map.get(str(dept_doc.get("faculty_id", ""))) if dept_doc else None
            )
            if fac_name:
                parts.append(f"كلية: {(fac_name or '').strip()}")
            # تشفير اسم المعلم لاستخدامه كرابط URL آمن
            teacher_name_enc = quote(t.get("full_name", ""))
            items.append({
                "id": str(t["_id"]),
                "title": t.get("full_name", ""),
                "subtitle": " · ".join(parts),
                "route": f"/teacher-courses?teacherId={str(t['_id'])}&teacherName={teacher_name_enc}",
                "type": "teacher",
                "icon": "school",
            })
        if items:
            results["teachers"] = items
            total += len(items)

    # =========================================
    # 3) المقررات (تقتصر على الفصل النشط فقط)
    # =========================================
    if "courses" in requested_types and can_search_courses:
        cq: Optional[dict] = {
            "is_active": True,
            "$or": [
                {"name": regex},
                {"code": code_regex},
            ],
        }
        # 🆕 فلتر الفصل النشط - يقبل string + ObjectId
        # ويستثني المقررات بدون semester_id (قوالب الخطة القديمة)
        if active_semester_id:
            cq["semester_id"] = {"$in": [active_semester_id, active_semester_oid]}
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
        else:
            # أي دور آخر يستخدم scope filter
            scope = await _scope_filter(current_user, "courses")
            cq = _merge_query(cq, scope)

        if cq is not None:
            cursor = db.courses.find(cq).limit(limit_per_type)
            courses_list = await cursor.to_list(limit_per_type)
            dept_ids = {str(c.get("department_id", "")) for c in courses_list if c.get("department_id")}
            depts_map, facs_map = await _resolve_names(dept_ids, set())
            items = []
            for c in courses_list:
                lvl = c.get("level")
                sec = c.get("section")
                subtitle_parts = [f"كود: {c.get('code', '')}"]
                dept_doc = depts_map.get(str(c.get("department_id", "")))
                if dept_doc:
                    subtitle_parts.append(f"قسم: {(dept_doc.get('name', '') or '').strip()}")
                    fac_name = facs_map.get(str(dept_doc.get("faculty_id", "")))
                    if fac_name:
                        subtitle_parts.append(f"كلية: {(fac_name or '').strip()}")
                if lvl:
                    subtitle_parts.append(f"م{lvl}")
                if sec:
                    subtitle_parts.append(f"شعبة {sec}")
                items.append({
                    "id": str(c["_id"]),
                    "title": c.get("name", ""),
                    "subtitle": " · ".join(subtitle_parts),
                    "route": f"/course-lectures?courseId={str(c['_id'])}&courseName={c.get('name', '')}",
                    "type": "course",
                    "icon": "book",
                })
            if items:
                results["courses"] = items
                total += len(items)

    # =========================================
    # 4) الأقسام
    # =========================================
    if "departments" in requested_types and can_search_departments:
        dq = {"$or": [{"name": regex}, {"code": code_regex}]}
        scope = await _scope_filter(current_user, "departments")
        dq = _merge_query(dq, scope)
        cursor = db.departments.find(dq).limit(limit_per_type)
        depts_list = await cursor.to_list(limit_per_type)
        # إثراء العناوين الفرعية بأسماء الكليات الأم
        fac_ids = {str(d.get("faculty_id", "")) for d in depts_list if d.get("faculty_id")}
        _, facs_map = await _resolve_names(set(), fac_ids)
        items = []
        for d in depts_list:
            sub_parts = [f"كود: {d.get('code', '')}"]
            fac_name = facs_map.get(str(d.get("faculty_id", "") or ""))
            if fac_name:
                sub_parts.append(f"كلية: {(fac_name or '').strip()}")
            items.append({
                "id": str(d["_id"]),
                "title": (d.get("name", "") or "").strip(),
                "subtitle": " · ".join(sub_parts),
                "route": f"/department-details?departmentId={str(d['_id'])}",
                "type": "department",
                "icon": "grid",
            })
        if items:
            results["departments"] = items
            total += len(items)

    # =========================================
    # 5) الكليات
    # =========================================
    if "faculties" in requested_types and can_search_faculties:
        fq = {"$or": [{"name": regex}, {"code": code_regex}]}
        # قصر النتائج على كلية المستخدم لغير الإدمن
        if not is_admin and not is_teacher:
            user_faculty_id = current_user.get("faculty_id")
            user_dept_id = current_user.get("department_id")
            # اقرأ من DB لجلب faculty_id وdepartment_id الكاملة
            try:
                udoc = await db.users.find_one({"_id": ObjectId(current_user["id"])})
                if udoc:
                    user_faculty_id = udoc.get("faculty_id") or user_faculty_id
                    user_dept_id = udoc.get("department_id") or user_dept_id
                    # إن لم يوجد faculty_id لكن يوجد department_id، استنتج من القسم
                    if not user_faculty_id and user_dept_id:
                        try:
                            dept_doc = await db.departments.find_one({"_id": ObjectId(user_dept_id)})
                            if dept_doc and dept_doc.get("faculty_id"):
                                user_faculty_id = dept_doc.get("faculty_id")
                        except Exception:
                            pass
            except Exception:
                pass
            if user_faculty_id:
                try:
                    fq["_id"] = ObjectId(user_faculty_id)
                except Exception:
                    fq["_id"] = ObjectId("000000000000000000000000")
            else:
                # Fail-safe: لا نعرض شيئاً إذا لم نتمكن من تحديد كلية المستخدم
                fq["_id"] = ObjectId("000000000000000000000000")
        cursor = db.faculties.find(fq).limit(limit_per_type)
        items = []
        async for f in cursor:
            items.append({
                "id": str(f["_id"]),
                "title": (f.get("name", "") or "").strip(),
                "subtitle": f"كود: {f.get('code', '')}",
                "route": f"/faculty-details?facultyId={str(f['_id'])}",
                "type": "faculty",
                "icon": "business",
            })
        if items:
            results["faculties"] = items
            total += len(items)

    # =========================================
    # 6) المحاضرات (بحث بالتاريخ أو اسم المقرر)
    # =========================================
    if "lectures" in requested_types and can_search_lectures:
        # تحقّق إن كان النص تاريخ
        lq: Optional[dict] = {}
        if re.match(r"^\d{4}-\d{2}-\d{2}$", q_clean):
            lq["date"] = q_clean
        else:
            # اربط بالمقررات التي تطابق (مع تطبيق scope على المقررات)
            course_match_query: dict = {"$or": [{"name": regex}, {"code": code_regex}]}
            # 🆕 فلتر الفصل النشط للمحاضرات أيضاً (يقبل string + ObjectId)
            if active_semester_id:
                course_match_query["semester_id"] = {"$in": [active_semester_id, active_semester_oid]}
            if not is_admin and not is_teacher and not is_student:
                course_scope = await _scope_filter(current_user, "courses")
                course_match_query = _merge_query(course_match_query, course_scope)
            course_match_cursor = db.courses.find(course_match_query, {"_id": 1}).limit(20)
            matching_course_ids = []
            async for c in course_match_cursor:
                matching_course_ids.append(str(c["_id"]))
            if not matching_course_ids:
                lq = None
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
                        lq = None
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
                            lq = None
                    elif lq is not None:
                        lq["course_id"] = {"$in": allowed}
                else:
                    lq = None

        if lq is not None:
            cursor = db.lectures.find(lq).sort("date", -1).limit(limit_per_type)
            items = []
            # خريطة المقررات لاسم سريع
            lecs = await cursor.to_list(limit_per_type)
            cids = list({lec.get("course_id") for lec in lecs if lec.get("course_id")})
            course_map: dict = {}
            if cids:
                try:
                    async for c in db.courses.find(
                        {"_id": {"$in": [ObjectId(cid) for cid in cids]}},
                        {"name": 1, "code": 1, "level": 1, "section": 1, "department_id": 1, "faculty_id": 1},
                    ):
                        course_map[str(c["_id"])] = c
                except Exception:
                    pass
            # إثراء بأسماء الأقسام/الكليات للمحاضرات
            lec_dept_ids = {str(c.get("department_id", "")) for c in course_map.values() if c.get("department_id")}
            lec_fac_ids = {str(c.get("faculty_id", "")) for c in course_map.values() if c.get("faculty_id")}
            lec_depts_map, lec_facs_map = await _resolve_names(lec_dept_ids, lec_fac_ids)
            for lec in lecs:
                cinfo = course_map.get(lec.get("course_id"), {})
                lvl = cinfo.get("level")
                sec = cinfo.get("section")
                code = cinfo.get("code", "")
                subtitle_parts = []
                if code:
                    subtitle_parts.append(f"كود: {code}")
                dept_doc = lec_depts_map.get(str(cinfo.get("department_id", "")))
                if dept_doc:
                    subtitle_parts.append(f"قسم: {(dept_doc.get('name', '') or '').strip()}")
                    fac_name = lec_facs_map.get(str(dept_doc.get("faculty_id", "")))
                    if fac_name:
                        subtitle_parts.append(f"كلية: {(fac_name or '').strip()}")
                if lvl:
                    subtitle_parts.append(f"م{lvl}")
                if sec:
                    subtitle_parts.append(f"شعبة {sec}")
                time_part = f"{lec.get('start_time', '')} → {lec.get('end_time', '')}"
                if time_part.strip() != "→":
                    subtitle_parts.append(time_part)
                if lec.get('room'):
                    subtitle_parts.append(lec.get('room'))
                items.append({
                    "id": str(lec["_id"]),
                    "title": f"{cinfo.get('name', 'محاضرة')} - {lec.get('date', '')}",
                    "subtitle": " · ".join(subtitle_parts),
                    "route": f"/course-lectures?courseId={lec.get('course_id', '')}",
                    "type": "lecture",
                    "icon": "calendar",
                })
            if items:
                results["lectures"] = items
                total += len(items)

    return {"query": q_clean, "results": results, "total": total}
