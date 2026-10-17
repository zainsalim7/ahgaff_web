"""🪪 هوية الكادر: تفرّد الرقم الوظيفي والجوال عبر جدولَي المعلمين والموظفين + ملف إداري تلقائي لكل أكاديمي"""
import re
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException


def norm_phone(p: Optional[str]) -> str:
    return re.sub(r"[\s\-()]", "", str(p or "")).strip()


async def assert_staff_unique(db, *, employee_no: Optional[str] = None, phone: Optional[str] = None,
                              exclude_teacher_id: Optional[str] = None, exclude_employee_id: Optional[str] = None):
    """يرفض الرقم الوظيفي/الجوال إن كان مستخدماً لمعلم أو موظف آخر (الملف الإداري المرتبط بالمعلم نفسه مستثنى)"""
    no = (employee_no or "").strip()
    ph = norm_phone(phone)
    # الكيانات المستثناة: المعلم نفسه + ملفه الإداري، أو الموظف نفسه + معلمه المرتبط
    ex_t, ex_e = set(), set()
    if exclude_teacher_id:
        ex_t.add(exclude_teacher_id)
        async for e in db.employees.find({"teacher_id": exclude_teacher_id}, {"_id": 1}):
            ex_e.add(str(e["_id"]))
    if exclude_employee_id:
        ex_e.add(exclude_employee_id)
        e = await db.employees.find_one({"_id": ObjectId(exclude_employee_id)}, {"teacher_id": 1}) if ObjectId.is_valid(exclude_employee_id) else None
        if e and e.get("teacher_id"):
            ex_t.add(e["teacher_id"])
    t_ex = {"_id": {"$nin": [ObjectId(x) for x in ex_t if ObjectId.is_valid(x)]}}
    e_ex = {"_id": {"$nin": [ObjectId(x) for x in ex_e if ObjectId.is_valid(x)]}}

    if no:
        t = await db.teachers.find_one({"teacher_id": no, **t_ex}, {"full_name": 1})
        if t:
            raise HTTPException(status_code=400, detail=f"الرقم الوظيفي {no} مستخدم بالفعل للمعلم: {t.get('full_name', '')}")
        e = await db.employees.find_one({"employee_no": no, **e_ex}, {"full_name": 1})
        if e:
            raise HTTPException(status_code=400, detail=f"الرقم الوظيفي {no} مستخدم بالفعل للموظف: {e.get('full_name', '')}")
    if ph and len(ph) >= 7:
        pq = {"$regex": "^" + r"[\s\-()]*".join(re.escape(c) for c in ph) + "$"}
        t = await db.teachers.find_one({"phone": pq, **t_ex}, {"full_name": 1})
        if t:
            raise HTTPException(status_code=400, detail=f"رقم الجوال {ph} مسجّل بالفعل للمعلم: {t.get('full_name', '')}")
        e = await db.employees.find_one({"phone": pq, **e_ex}, {"full_name": 1})
        if e:
            raise HTTPException(status_code=400, detail=f"رقم الجوال {ph} مسجّل بالفعل للموظف: {e.get('full_name', '')}")


async def ensure_employee_file(db, teacher: dict, created_by: str = "تلقائي") -> Optional[str]:
    """لكل أكاديمي ملف إداري: ينشئه إن لم يوجد ويعيد معرّفه (idempotent)"""
    tid = str(teacher["_id"])
    ex = await db.employees.find_one({"teacher_id": tid}, {"_id": 1})
    if ex:
        return str(ex["_id"])
    unit = await db.org_units.find_one({"type": "department", "department_id": str(teacher.get("department_id") or "")}, {"_id": 1})
    emp_no = (teacher.get("teacher_id") or f"T-{tid[-6:]}").strip()
    if await db.employees.find_one({"employee_no": emp_no}):
        emp_no = f"{emp_no}-T"
    now = datetime.now(timezone.utc).isoformat()
    r = await db.employees.insert_one({
        "employee_no": emp_no, "full_name": teacher.get("full_name", ""), "category": "academic", "job_title": teacher.get("academic_title") or "عضو هيئة تدريس",
        "grade": "", "org_unit_id": str(unit["_id"]) if unit else None, "manager_employee_id": None, "contract_type": "permanent",
        "hire_date": None, "contract_end_date": None, "status": "active" if teacher.get("is_active", True) else "ended",
        "gender": teacher.get("gender", ""), "nationality": "", "national_id": "", "id_expiry_date": None, "birth_date": None,
        "phone": teacher.get("phone", ""), "email": teacher.get("email", ""), "address": "", "emergency_contact": "", "qualification": teacher.get("qualification", ""),
        "specialization": teacher.get("specialization", ""), "notes": "", "teacher_id": tid, "user_id": teacher.get("user_id"),
        "created_at": now, "created_by_name": created_by,
    })
    return str(r.inserted_id)


async def sync_employee_from_teacher(db, teacher_id: str, upd: dict):
    """مزامنة الاسم/الجوال/البريد/الرقم الوظيفي/الحالة من سجل المعلم إلى ملفه الإداري"""
    m = {"full_name": "full_name", "phone": "phone", "email": "email", "teacher_id": "employee_no", "academic_title": "job_title"}
    s = {m[k]: v for k, v in upd.items() if k in m and v is not None}
    if "is_active" in upd:
        s["status"] = "active" if upd["is_active"] else "ended"
    if s:
        s["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.employees.update_one({"teacher_id": teacher_id}, {"$set": s})
