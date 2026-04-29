"""
Admin Tools Routes - أدوات إدارية لإصلاح بيانات قاعدة البيانات
- Backfill semester_id للمحاضرات القديمة
- توليد الأرقام المرجعية للطلاب
- (مستقبلاً) أدوات تنظيف وإصلاح أخرى
"""
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from .deps import get_current_user, get_db, has_permission
from models.permissions import UserRole

router = APIRouter(tags=["أدوات الأدمن"])


# ==================== Lecture Semester Backfill ====================
def _normalize_semester_date(d):
    """نسخة محلية من normalize_semester_date لتجنب الاستيراد الدائري."""
    if not d or not isinstance(d, str):
        return None
    s = d.strip()
    if len(s) == 10 and s[4] == '-' and s[7] == '-':
        return s
    parts = s.split('-')
    if len(parts) == 3:
        try:
            day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
            return f"{year:04d}-{month:02d}-{day:02d}"
        except Exception:
            return None
    return None


async def _build_semesters_index(db_inst):
    """يجلب كل الفصول مع تواريخ مُحوَّلة لمقارنة سريعة."""
    sems = await db_inst.semesters.find({}).to_list(100)
    indexed = []
    for s in sems:
        sd = _normalize_semester_date(s.get("start_date"))
        ed = _normalize_semester_date(s.get("end_date"))
        if sd and ed:
            indexed.append({
                "id": str(s["_id"]),
                "name": s.get("name", ""),
                "start_date": sd,
                "end_date": ed,
            })
    return indexed


def _ensure_admin(current_user: dict):
    if (
        current_user["role"] != UserRole.ADMIN
        and not has_permission(current_user, "manage_semesters")
        and not has_permission(current_user, "manage_courses")
    ):
        raise HTTPException(status_code=403, detail="غير مصرح لك")


@router.get("/admin/backfill-lecture-semesters/preview")
async def preview_backfill(current_user: dict = Depends(get_current_user)):
    """معاينة عدد المحاضرات التي ستُحدَّث وتوزيعها على الفصول.
    لا يُعدّل أي بيانات.
    """
    _ensure_admin(current_user)
    db = get_db()

    semesters = await _build_semesters_index(db)
    if not semesters:
        return {
            "total_lectures": await db.lectures.count_documents({}),
            "without_semester": 0,
            "matched_by_semester": [],
            "unmatched": 0,
            "warning": "لا توجد فصول دراسية بتواريخ صالحة في النظام",
        }

    total = await db.lectures.count_documents({})
    without_query = {"$or": [
        {"semester_id": {"$exists": False}},
        {"semester_id": None},
        {"semester_id": ""},
    ]}
    without_count = await db.lectures.count_documents(without_query)

    # لكل فصل: عدد المحاضرات التي تواريخها داخل نطاقه ولا تحوي semester_id
    matched = []
    matched_total = 0
    for sem in semesters:
        cnt = await db.lectures.count_documents({
            **without_query,
            "date": {"$gte": sem["start_date"], "$lte": sem["end_date"]},
        })
        matched.append({
            "id": sem["id"],
            "name": sem["name"],
            "start_date": sem["start_date"],
            "end_date": sem["end_date"],
            "lectures_to_update": cnt,
        })
        matched_total += cnt

    unmatched = without_count - matched_total
    if unmatched < 0:
        unmatched = 0

    return {
        "total_lectures": total,
        "without_semester": without_count,
        "matched_by_semester": matched,
        "matched_total": matched_total,
        "unmatched": unmatched,
    }


@router.post("/admin/backfill-lecture-semesters/execute")
async def execute_backfill(
    dry_run: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """تنفيذ تحديث المحاضرات القديمة بإسناد semester_id لها بناءً على نطاق التاريخ."""
    _ensure_admin(current_user)
    db = get_db()

    semesters = await _build_semesters_index(db)
    if not semesters:
        raise HTTPException(status_code=400, detail="لا توجد فصول بتواريخ صالحة")

    without_query = {"$or": [
        {"semester_id": {"$exists": False}},
        {"semester_id": None},
        {"semester_id": ""},
    ]}

    updates_per_semester = []
    grand_total = 0
    for sem in semesters:
        match_query = {
            **without_query,
            "date": {"$gte": sem["start_date"], "$lte": sem["end_date"]},
        }
        if dry_run:
            cnt = await db.lectures.count_documents(match_query)
        else:
            res = await db.lectures.update_many(
                match_query,
                {"$set": {"semester_id": sem["id"], "semester_name": sem["name"]}},
            )
            cnt = res.modified_count
        updates_per_semester.append({
            "semester_id": sem["id"],
            "semester_name": sem["name"],
            "updated": cnt,
        })
        grand_total += cnt

    return {
        "dry_run": dry_run,
        "total_updated": grand_total,
        "details": updates_per_semester,
        "message": (
            "محاكاة فقط - لم يتم التعديل"
            if dry_run
            else f"تم تحديث {grand_total} محاضرة"
        ),
    }


# ==================== Student Reference Number Generator ====================
VALID_PROGRAM_CODES = {"B", "M", "D", "E", "P"}
PROGRAM_LABELS = {
    "B": "بكالوريوس",
    "M": "ماجستير",
    "D": "دكتوراه",
    "E": "عن بُعد",
    "P": "دبلوم",
}


def _format_year(year_val) -> Optional[str]:
    """تحويل سنة (مثل 2025 أو '25' أو '2025') إلى رمز خانتين '25'."""
    if year_val is None:
        return None
    s = str(year_val).strip()
    if not s:
        return None
    # 2025 → 25
    if len(s) == 4 and s.isdigit():
        return s[-2:]
    if len(s) == 2 and s.isdigit():
        return s
    return None


def _format_faculty_code(code) -> Optional[str]:
    """تحويل رمز الكلية لخانتين (مثل '1' → '01')."""
    if code is None:
        return None
    s = str(code).strip()
    if not s:
        return None
    if s.isdigit():
        return s.zfill(2)[:2]
    return s[:2].upper()


async def _build_student_reference(
    db_inst,
    student: dict,
    university_short_code: str,
    faculties_by_id: dict,
    next_seq_per_key: dict,
) -> Optional[str]:
    """يولّد الرقم المرجعي لطالب واحد. يستخدم next_seq_per_key لتسلسل بالـ key.
    Key = (faculty_code, year_code, program_code)
    """
    program = (student.get("program_code") or "").strip().upper()
    year = _format_year(student.get("enrollment_year"))
    faculty_id = student.get("faculty_id")
    faculty = faculties_by_id.get(faculty_id) if faculty_id else None
    fac_code = _format_faculty_code((faculty or {}).get("numeric_code"))

    if program not in VALID_PROGRAM_CODES or not year or not fac_code or not university_short_code:
        return None

    key = f"{fac_code}|{year}|{program}"
    seq = next_seq_per_key.get(key, 1)
    next_seq_per_key[key] = seq + 1
    return f"{university_short_code}{program}{year}{fac_code}{seq:03d}"


async def generate_reference_for_new_student(db_inst, student_doc: dict) -> Optional[str]:
    """يولّد الرقم المرجعي عند إنشاء طالب جديد (يأخذ بالاعتبار آخر تسلسل في DB)."""
    program = (student_doc.get("program_code") or "").strip().upper()
    year = _format_year(student_doc.get("enrollment_year"))
    faculty_id = student_doc.get("faculty_id")
    if program not in VALID_PROGRAM_CODES or not year or not faculty_id:
        return None

    uni = await db_inst.university.find_one({})
    uni_short = (uni or {}).get("short_code") or "AU"
    fac = await db_inst.faculties.find_one({"_id": ObjectId(faculty_id)})
    fac_code = _format_faculty_code((fac or {}).get("numeric_code"))
    if not fac_code:
        return None

    prefix = f"{uni_short}{program}{year}{fac_code}"
    # ابحث عن أعلى تسلسل سابق
    cursor = db_inst.students.find(
        {"reference_number": {"$regex": f"^{prefix}\\d{{3}}$"}},
        {"reference_number": 1},
    )
    max_seq = 0
    async for s in cursor:
        ref = s.get("reference_number") or ""
        try:
            seq = int(ref[-3:])
            if seq > max_seq:
                max_seq = seq
        except Exception:
            pass
    return f"{prefix}{max_seq + 1:03d}"


@router.get("/admin/student-references/preview")
async def preview_student_refs(current_user: dict = Depends(get_current_user)):
    """معاينة عدد الطلاب الذين يمكن توليد الرقم المرجعي لهم."""
    _ensure_admin(current_user)
    db = get_db()

    uni = await db.university.find_one({})
    uni_short = (uni or {}).get("short_code")
    if not uni_short:
        return {
            "ready_count": 0,
            "missing_university_code": True,
            "warning": "يجب تعيين short_code للجامعة (مثلاً 'AU') في إعدادات الجامعة",
        }

    faculties = await db.faculties.find({}).to_list(100)
    faculties_by_id = {str(f["_id"]): f for f in faculties}
    faculties_with_code = [f for f in faculties if _format_faculty_code(f.get("numeric_code"))]

    total_students = await db.students.count_documents({})
    have_ref = await db.students.count_documents({"reference_number": {"$nin": [None, ""]}})
    without_ref = total_students - have_ref

    # كم طالب لديه كل الحقول المطلوبة؟
    students = await db.students.find({}, {
        "program_code": 1,
        "enrollment_year": 1,
        "faculty_id": 1,
        "reference_number": 1,
    }).to_list(10000)

    ready = 0
    missing_program = 0
    missing_year = 0
    missing_faculty_code = 0
    for s in students:
        if s.get("reference_number"):
            continue
        prog = (s.get("program_code") or "").strip().upper()
        year = _format_year(s.get("enrollment_year"))
        fac = faculties_by_id.get(s.get("faculty_id"))
        fac_code = _format_faculty_code((fac or {}).get("numeric_code"))
        if prog in VALID_PROGRAM_CODES and year and fac_code:
            ready += 1
        else:
            if prog not in VALID_PROGRAM_CODES:
                missing_program += 1
            elif not year:
                missing_year += 1
            elif not fac_code:
                missing_faculty_code += 1

    return {
        "university_short_code": uni_short,
        "faculties_with_code": len(faculties_with_code),
        "faculties_total": len(faculties),
        "total_students": total_students,
        "students_with_ref": have_ref,
        "students_without_ref": without_ref,
        "ready_to_generate": ready,
        "missing_program_code": missing_program,
        "missing_enrollment_year": missing_year,
        "missing_faculty_code": missing_faculty_code,
    }


@router.post("/admin/student-references/execute")
async def execute_student_refs(current_user: dict = Depends(get_current_user)):
    """توليد الأرقام المرجعية للطلاب الذين يستوفون الشروط ولا يملكون رقماً سابقاً."""
    _ensure_admin(current_user)
    db = get_db()

    uni = await db.university.find_one({})
    uni_short = (uni or {}).get("short_code")
    if not uni_short:
        raise HTTPException(status_code=400, detail="يجب تعيين short_code للجامعة في إعدادات الجامعة")

    faculties = await db.faculties.find({}).to_list(100)
    faculties_by_id = {str(f["_id"]): f for f in faculties}

    # جلب أعلى تسلسل لكل بريفكس موجود حالياً
    next_seq_per_key: dict = {}
    cursor = db.students.find(
        {"reference_number": {"$nin": [None, ""]}},
        {"reference_number": 1},
    )
    async for s in cursor:
        ref = s.get("reference_number", "")
        # نحاول استخراج (fac, year, program, seq) من الرقم
        if len(ref) < 10 or not ref.startswith(uni_short):
            continue
        try:
            program = ref[len(uni_short)]
            year = ref[len(uni_short) + 1:len(uni_short) + 3]
            fac = ref[len(uni_short) + 3:len(uni_short) + 5]
            seq = int(ref[-3:])
            key = f"{fac}|{year}|{program}"
            if next_seq_per_key.get(key, 0) < seq + 1:
                next_seq_per_key[key] = seq + 1
        except Exception:
            continue

    # اقرأ الطلاب بدون رقم
    students = await db.students.find({
        "$or": [
            {"reference_number": {"$exists": False}},
            {"reference_number": None},
            {"reference_number": ""},
        ]
    }).to_list(10000)

    updated = 0
    skipped_missing_data = 0
    details = []
    for s in students:
        ref = await _build_student_reference(
            db, s, uni_short, faculties_by_id, next_seq_per_key
        )
        if ref:
            await db.students.update_one(
                {"_id": s["_id"]},
                {"$set": {"reference_number": ref}},
            )
            updated += 1
            details.append({"student_id": s.get("student_id"), "name": s.get("full_name"), "ref": ref})
        else:
            skipped_missing_data += 1

    return {
        "updated": updated,
        "skipped_missing_data": skipped_missing_data,
        "message": f"تم توليد {updated} رقم مرجعي",
        "sample_details": details[:10],
    }

