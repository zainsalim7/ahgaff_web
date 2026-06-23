"""
Alumni (الخريجون) Routes
- POST /api/students/{id}/graduate → تخريج طالب
- GET /api/alumni → قائمة الخريجين مع فلاتر (سنة، كلية، قسم، بحث)
- GET /api/alumni/{id} → تفاصيل خريج
- PUT /api/alumni/{id}/restore → استرجاع خريج إلى قائمة الطلاب

ملاحظة معمارية: الخريجون يبقون في نفس collection `students` مع `is_alumni=true`
- يحافظ على الـ student_id، user_id، وكل السجلات السابقة (enrollments, attendance...)
- يُستثنون تلقائياً من GET /students الافتراضي
"""
from typing import Optional
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .deps import get_current_user, get_db, has_any_permission, get_scope_filter
from models.permissions import Permission

router = APIRouter(tags=["الخريجون"])


# ============================
# Models
# ============================
class GraduateRequest(BaseModel):
    graduation_year: int = Field(..., description="سنة التخرج (الحقل الإلزامي للربط)")
    graduation_date: Optional[str] = Field(None, description="تاريخ التخرج YYYY-MM-DD")
    graduation_semester: Optional[str] = Field(None, description="الفصل: first/second/summer")
    final_gpa: Optional[float] = Field(None, ge=0, le=4.0, description="المعدل التراكمي النهائي")
    total_credit_hours: Optional[int] = Field(None, ge=0)
    certificate_number: Optional[str] = None
    honors: Optional[str] = Field(None, description="مرتبة الشرف / تقدير")
    notes: Optional[str] = None


def _now():
    return datetime.now(timezone.utc).isoformat()


def _ensure_can_manage_students(current_user: dict):
    if current_user.get("role") == "admin":
        return
    if has_any_permission(current_user, [Permission.MANAGE_STUDENTS]):
        return
    raise HTTPException(status_code=403, detail="ليس لديك صلاحية لإدارة الطلاب")


async def _ensure_student_in_user_scope(db, current_user: dict, student: dict):
    """يتأكد أن الطالب ضمن نطاق كلية/قسم المستخدم."""
    if current_user.get("role") == "admin":
        return
    user_dept_id = current_user.get("department_id")
    user_faculty_id = current_user.get("faculty_id")
    s_dept = str(student.get("department_id") or "")
    s_fac = str(student.get("faculty_id") or "")
    if not s_fac and s_dept:
        try:
            d = await db.departments.find_one({"_id": ObjectId(s_dept)})
            if d and d.get("faculty_id"):
                s_fac = str(d.get("faculty_id"))
        except Exception:
            pass
    if user_dept_id and s_dept != str(user_dept_id):
        raise HTTPException(status_code=403, detail="هذا الطالب ليس من قسمك")
    if user_faculty_id and not user_dept_id and s_fac != str(user_faculty_id):
        raise HTTPException(status_code=403, detail="هذا الطالب ليس من كليتك")


# ============================
# 1) Graduate Student
# ============================
@router.post("/students/{student_id}/graduate")
async def graduate_student(
    student_id: str,
    body: GraduateRequest,
    current_user: dict = Depends(get_current_user),
):
    """تخريج طالب: ينقله إلى قائمة الخريجين مع بيانات التخرج المرتبطة بالسنة."""
    _ensure_can_manage_students(current_user)
    db = get_db()

    try:
        student = await db.students.find_one({"_id": ObjectId(student_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="معرف الطالب غير صحيح")
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    if student.get("is_alumni") is True:
        raise HTTPException(status_code=400, detail="الطالب متخرج بالفعل")

    await _ensure_student_in_user_scope(db, current_user, student)

    graduation_data = {
        "year": body.graduation_year,
        "date": body.graduation_date,
        "semester": body.graduation_semester,
        "final_gpa": body.final_gpa,
        "total_credit_hours": body.total_credit_hours,
        "certificate_number": body.certificate_number,
        "honors": body.honors,
        "notes": body.notes,
        "graduated_at": _now(),
        "graduated_by_user_id": current_user.get("id"),
        "graduated_by_username": current_user.get("username"),
    }

    await db.students.update_one(
        {"_id": ObjectId(student_id)},
        {
            "$set": {
                "is_alumni": True,
                "status": "graduated",
                "graduation_date": body.graduation_date,
                "graduated_from_level": student.get("level"),
                "graduation_data": graduation_data,
                "status_changed_at": _now(),
            }
        },
    )

    # سجل النشاط
    try:
        await db.activity_logs.insert_one({
            "user_id": current_user.get("id"),
            "username": current_user.get("username"),
            "action": "graduate_student",
            "target_type": "student",
            "target_id": student_id,
            "details": f"تخريج الطالب {student.get('full_name', '')} - سنة {body.graduation_year}",
            "timestamp": _now(),
        })
    except Exception:
        pass

    return {
        "message": f"تم تخريج الطالب '{student.get('full_name')}' بنجاح",
        "student_id": student_id,
        "graduation_year": body.graduation_year,
    }


# ============================
# 2) List Alumni
# ============================
@router.get("/alumni")
async def list_alumni(
    year: Optional[int] = Query(None, description="فلتر بسنة التخرج"),
    faculty_id: Optional[str] = None,
    department_id: Optional[str] = None,
    q: Optional[str] = Query(None, description="بحث بالاسم أو رقم القيد"),
    current_user: dict = Depends(get_current_user),
):
    """قائمة الخريجين مع فلاتر."""
    db = get_db()
    if not (current_user.get("role") == "admin" or has_any_permission(
        current_user, [Permission.VIEW_STUDENTS, Permission.MANAGE_STUDENTS]
    )):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية لعرض الخريجين")

    query: dict = {"is_alumni": True}
    # تطبيق نطاق المستخدم
    scope = await get_scope_filter(current_user, "students")
    for k, v in scope.items():
        query[k] = v

    if year is not None:
        query["graduation_data.year"] = year
    if faculty_id:
        query["faculty_id"] = faculty_id
    if department_id:
        query["department_id"] = department_id
    if q:
        import re as _re
        rx = {"$regex": _re.escape(q), "$options": "i"}
        query["$or"] = [{"full_name": rx}, {"student_id": rx}, {"reference_number": rx}]

    cursor = db.students.find(query).sort([("graduation_data.year", -1), ("full_name", 1)])
    alumni = await cursor.to_list(5000)

    # إثراء بأسماء الأقسام والكليات
    dept_ids = list({str(s.get("department_id", "")) for s in alumni if s.get("department_id")})
    dept_map: dict = {}
    fac_ids_set: set = set()
    if dept_ids:
        try:
            obj_ids = [ObjectId(x) for x in dept_ids if x]
            async for d in db.departments.find({"_id": {"$in": obj_ids}}, {"name": 1, "faculty_id": 1}):
                dept_map[str(d["_id"])] = d
                if d.get("faculty_id"):
                    fac_ids_set.add(str(d["faculty_id"]))
        except Exception:
            pass
    fac_map: dict = {}
    if fac_ids_set:
        try:
            obj_ids = [ObjectId(x) for x in fac_ids_set if x]
            async for f in db.faculties.find({"_id": {"$in": obj_ids}}, {"name": 1}):
                fac_map[str(f["_id"])] = f.get("name", "")
        except Exception:
            pass

    result = []
    for s in alumni:
        gd = s.get("graduation_data") or {}
        dept_id = str(s.get("department_id", "") or "")
        dept_doc = dept_map.get(dept_id) if dept_id else None
        fac_name = ""
        if dept_doc and dept_doc.get("faculty_id"):
            fac_name = fac_map.get(str(dept_doc["faculty_id"]), "")
        result.append({
            "id": str(s["_id"]),
            "student_id": s.get("student_id"),
            "reference_number": s.get("reference_number"),
            "full_name": s.get("full_name"),
            "phone": s.get("phone"),
            "email": s.get("email"),
            "department_id": dept_id,
            "department_name": (dept_doc or {}).get("name", "") if dept_doc else "",
            "faculty_id": (dept_doc or {}).get("faculty_id", "") if dept_doc else s.get("faculty_id", ""),
            "faculty_name": fac_name,
            "level_graduated": s.get("graduated_from_level") or s.get("level"),
            "graduation_year": gd.get("year"),
            "graduation_date": gd.get("date") or s.get("graduation_date"),
            "graduation_semester": gd.get("semester"),
            "final_gpa": gd.get("final_gpa"),
            "total_credit_hours": gd.get("total_credit_hours"),
            "certificate_number": gd.get("certificate_number"),
            "honors": gd.get("honors"),
            "notes": gd.get("notes"),
            "qr_code": s.get("qr_code"),
            "created_at": s.get("created_at"),
        })

    # إحصاءات مختصرة لتسهيل العرض
    years_count: dict = {}
    for r in result:
        y = r.get("graduation_year")
        if y is not None:
            years_count[str(y)] = years_count.get(str(y), 0) + 1

    return {
        "items": result,
        "total": len(result),
        "by_year": years_count,
    }


# ============================
# 3) Get Alumni Detail
# ============================
@router.get("/alumni/{alumni_id}")
async def get_alumni(
    alumni_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    if not (current_user.get("role") == "admin" or has_any_permission(
        current_user, [Permission.VIEW_STUDENTS, Permission.MANAGE_STUDENTS]
    )):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية")

    try:
        s = await db.students.find_one({"_id": ObjectId(alumni_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="معرف غير صحيح")
    if not s or not s.get("is_alumni"):
        raise HTTPException(status_code=404, detail="الخريج غير موجود")

    await _ensure_student_in_user_scope(db, current_user, s)

    gd = s.get("graduation_data") or {}
    return {
        "id": str(s["_id"]),
        "student_id": s.get("student_id"),
        "full_name": s.get("full_name"),
        "phone": s.get("phone"),
        "email": s.get("email"),
        "department_id": s.get("department_id"),
        "faculty_id": s.get("faculty_id"),
        "level_graduated": s.get("graduated_from_level") or s.get("level"),
        "graduation_data": gd,
        "qr_code": s.get("qr_code"),
    }


# ============================
# 4) Restore Alumni → Student
# ============================
@router.put("/alumni/{alumni_id}/restore")
async def restore_alumni_to_student(
    alumni_id: str,
    current_user: dict = Depends(get_current_user),
):
    """استرجاع خريج إلى قائمة الطلاب (في حال خطأ في التخرج)."""
    _ensure_can_manage_students(current_user)
    db = get_db()

    try:
        s = await db.students.find_one({"_id": ObjectId(alumni_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="معرف غير صحيح")
    if not s:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    if not s.get("is_alumni"):
        raise HTTPException(status_code=400, detail="هذا الطالب ليس خريجاً")

    await _ensure_student_in_user_scope(db, current_user, s)

    await db.students.update_one(
        {"_id": ObjectId(alumni_id)},
        {
            "$set": {
                "is_alumni": False,
                "status": "active",
                "status_changed_at": _now(),
                "status_reason": "استرجاع من قائمة الخريجين",
            },
            "$unset": {"graduation_data": "", "graduation_date": "", "graduated_from_level": ""},
        },
    )

    try:
        await db.activity_logs.insert_one({
            "user_id": current_user.get("id"),
            "username": current_user.get("username"),
            "action": "restore_alumni",
            "target_type": "student",
            "target_id": alumni_id,
            "details": f"استرجاع الخريج {s.get('full_name', '')} إلى قائمة الطلاب",
            "timestamp": _now(),
        })
    except Exception:
        pass

    return {"message": f"تم استرجاع '{s.get('full_name')}' إلى قائمة الطلاب", "student_id": alumni_id}
