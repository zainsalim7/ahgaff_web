"""
Course Migration Routes - ترحيل المقررات لفصل جديد
"""
from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel

from .deps import get_db, get_current_user, get_scope_filter, has_permission, log_activity
from models.permissions import Permission

router = APIRouter(tags=["ترحيل المقررات"])


def can_migrate(user: dict) -> bool:
    if user.get("role") == "admin":
        return True
    return has_permission(user, Permission.MIGRATE_COURSES)


def dup_key(c: dict):
    return (
        (c.get("code") or "").strip(),
        (c.get("section") or "").strip(),
        str(c.get("department_id") or ""),
    )


@router.get("/course-migration/preview")
async def migration_preview(
    source_semester_id: str,
    target_semester_id: str,
    department_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """معاينة المقررات القابلة للترحيل من فصل لآخر (ضمن نطاق المستخدم)"""
    if not can_migrate(current_user):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية ترحيل المقررات")
    if source_semester_id == target_semester_id:
        raise HTTPException(status_code=400, detail="الفصل المصدر والهدف متطابقان")
    db = get_db()

    scope = await get_scope_filter(current_user, "courses")

    query = {**scope, "semester_id": source_semester_id, "is_active": True}
    if department_id:
        query["department_id"] = department_id
    courses = await db.courses.find(query).sort("name", 1).to_list(1000)

    # مفاتيح المقررات الموجودة في الفصل الهدف لكشف التكرار
    target_courses = await db.courses.find(
        {"semester_id": target_semester_id, "is_active": True},
        {"code": 1, "section": 1, "department_id": 1},
    ).to_list(2000)
    target_keys = {dup_key(c) for c in target_courses}

    # أسماء الأقسام والمعلمين دفعة واحدة
    dept_ids = {str(c.get("department_id")) for c in courses if c.get("department_id")}
    dept_map = {}
    if dept_ids:
        oids = [ObjectId(x) for x in dept_ids if ObjectId.is_valid(x)]
        async for d in db.departments.find({"_id": {"$in": oids}}, {"name": 1}):
            dept_map[str(d["_id"])] = (d.get("name") or "").strip()
    teacher_ids = {str(c.get("teacher_id")) for c in courses if c.get("teacher_id")}
    teacher_map = {}
    if teacher_ids:
        toids = [ObjectId(x) for x in teacher_ids if ObjectId.is_valid(x)]
        async for t in db.teachers.find({"_id": {"$in": toids}}, {"full_name": 1}):
            teacher_map[str(t["_id"])] = t.get("full_name", "")

    result = []
    for c in courses:
        cid = str(c["_id"])
        result.append({
            "id": cid,
            "name": c.get("name", ""),
            "code": c.get("code", ""),
            "section": c.get("section", ""),
            "level": c.get("level"),
            "department_id": str(c.get("department_id") or ""),
            "department_name": dept_map.get(str(c.get("department_id") or ""), ""),
            "teacher_id": str(c.get("teacher_id") or "") or None,
            "teacher_name": teacher_map.get(str(c.get("teacher_id") or ""), ""),
            "students_count": await db.enrollments.count_documents({"course_id": cid}),
            "exists_in_target": dup_key(c) in target_keys,
        })
    return {
        "courses": result,
        "total": len(result),
        "duplicates": sum(1 for r in result if r["exists_in_target"]),
    }


class MigrationExecute(BaseModel):
    source_semester_id: str
    target_semester_id: str
    course_ids: List[str]
    copy_teacher: bool = True
    copy_students: bool = False


@router.post("/course-migration/execute")
async def migration_execute(
    data: MigrationExecute,
    current_user: dict = Depends(get_current_user),
):
    """تنفيذ الترحيل: نسخ المقررات المحددة إلى الفصل الهدف (آمن للإعادة — يتخطى المكرر)"""
    if not can_migrate(current_user):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية ترحيل المقررات")
    if data.source_semester_id == data.target_semester_id:
        raise HTTPException(status_code=400, detail="الفصل المصدر والهدف متطابقان")
    if not data.course_ids:
        raise HTTPException(status_code=400, detail="لم يتم تحديد أي مقررات للترحيل")
    db = get_db()

    if not ObjectId.is_valid(data.target_semester_id):
        raise HTTPException(status_code=400, detail="معرف الفصل الهدف غير صالح")
    target_sem = await db.semesters.find_one({"_id": ObjectId(data.target_semester_id)})
    if not target_sem:
        raise HTTPException(status_code=404, detail="الفصل الهدف غير موجود — أنشئه أولاً من إدارة الفصول")

    scope = await get_scope_filter(current_user, "courses")

    valid_oids = [ObjectId(cid) for cid in data.course_ids if ObjectId.is_valid(cid)]
    courses = await db.courses.find({
        **scope,
        "_id": {"$in": valid_oids},
        "semester_id": data.source_semester_id,
        "is_active": True,
    }).to_list(1000)

    target_courses = await db.courses.find(
        {"semester_id": data.target_semester_id, "is_active": True},
        {"code": 1, "section": 1, "department_id": 1},
    ).to_list(2000)
    target_keys = {dup_key(c) for c in target_courses}

    now = datetime.now(timezone.utc)
    migrated, skipped = [], []
    teacher_assignments = 0
    enrollments_copied = 0

    for c in courses:
        if dup_key(c) in target_keys:
            skipped.append(c.get("name", ""))
            continue
        old_id = str(c["_id"])
        new_course = {k: v for k, v in c.items() if k not in ("_id", "created_at", "teacher_id")}
        new_course.update({
            "semester_id": data.target_semester_id,
            "semester_name": target_sem.get("name", ""),
            "academic_year": target_sem.get("academic_year", c.get("academic_year", "")),
            "teacher_id": str(c.get("teacher_id")) if (data.copy_teacher and c.get("teacher_id")) else None,
            "is_active": True,
            "created_at": now,
            "created_by": str(current_user.get("id") or current_user.get("_id") or ""),
            "migrated_from_course_id": old_id,
            "migrated_from_semester_id": data.source_semester_id,
        })
        ins = await db.courses.insert_one(new_course)
        new_id = str(ins.inserted_id)
        target_keys.add(dup_key(c))
        migrated.append(c.get("name", ""))

        # نسخ العبء التدريسي مع الإسناد
        if data.copy_teacher and c.get("teacher_id"):
            teacher_assignments += 1
            tl = await db.teaching_loads.find_one({"course_id": old_id, "teacher_id": str(c["teacher_id"])})
            await db.teaching_loads.insert_one({
                "teacher_id": str(c["teacher_id"]),
                "course_id": new_id,
                "weekly_hours": (tl or {}).get("weekly_hours", 0),
                "notes": (tl or {}).get("notes", ""),
                "semester_id": data.target_semester_id,
                "auto_synced": True,
                "created_at": now,
                "updated_at": now,
            })

        # نسخ الطلاب المسجلين (اختياري)
        if data.copy_students:
            enrollments = await db.enrollments.find({"course_id": old_id}).to_list(2000)
            if enrollments:
                await db.enrollments.insert_many([
                    {
                        "course_id": new_id,
                        "student_id": e["student_id"],
                        "enrolled_at": now,
                        "enrolled_by": str(current_user.get("id") or current_user.get("_id") or ""),
                    }
                    for e in enrollments
                ])
                enrollments_copied += len(enrollments)

    await log_activity(
        user=current_user,
        action="migrate_courses",
        entity_type="semester",
        entity_id=data.target_semester_id,
        entity_name=target_sem.get("name", ""),
        details={
            "migrated": len(migrated),
            "skipped": len(skipped),
            "teacher_assignments": teacher_assignments,
            "enrollments_copied": enrollments_copied,
        },
    )

    return {
        "migrated": len(migrated),
        "migrated_names": migrated,
        "skipped": len(skipped),
        "skipped_names": skipped,
        "teacher_assignments": teacher_assignments,
        "enrollments_copied": enrollments_copied,
        "target_semester_name": target_sem.get("name", ""),
    }
