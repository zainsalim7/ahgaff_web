"""
Weekly Schedule Routes - مسارات الجدول الأسبوعي
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from bson import ObjectId
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel

from .deps import get_db, get_current_user, has_permission, log_activity
from models.permissions import Permission

router = APIRouter(tags=["الجدول الأسبوعي"])

SCHEDULE_ROLES = {"admin", "dean", "department_head", "registrar"}

def can_manage_schedule(user: dict) -> bool:
    if user.get("role") in SCHEDULE_ROLES:
        return True
    if has_permission(user, Permission.MANAGE_SETTINGS):
        return True
    if has_permission(user, Permission.MANAGE_COURSES):
        return True
    return False


# ===== Models =====

class RoomCreate(BaseModel):
    name: str
    faculty_id: str
    capacity: int = 30
    building: str = ""
    floor: str = ""
    room_type: str = "lecture"  # lecture, lab, seminar
    is_active: bool = True


class RoomUpdate(BaseModel):
    name: Optional[str] = None
    faculty_id: Optional[str] = None
    capacity: Optional[int] = None
    building: Optional[str] = None
    floor: Optional[str] = None
    room_type: Optional[str] = None
    is_active: Optional[bool] = None


class TimeSlotCreate(BaseModel):
    slot_number: int
    name: str  # المحاضرة الأولى
    start_time: str  # "08:00"
    end_time: str  # "09:30"


class TeacherPreferenceUpdate(BaseModel):
    unavailable_days: List[str] = []  # ["الثلاثاء", "الأربعاء"]
    unavailable_slots: List[int] = []  # [1, 5] = الأولى والأخيرة
    max_daily_lectures: int = 5


class ScheduleSlotCreate(BaseModel):
    faculty_id: str
    department_id: str
    level: int
    section: str = ""
    day: str  # السبت, الأحد, ...
    slot_number: int  # 1, 2, 3, 4, 5
    course_id: str
    teacher_id: str
    room_id: str


class ScheduleSlotUpdate(BaseModel):
    course_id: Optional[str] = None
    teacher_id: Optional[str] = None
    room_id: Optional[str] = None


# ===== القاعات =====

@router.get("/rooms")
async def get_rooms(
    faculty_id: Optional[str] = None,
    building: Optional[str] = None,
    is_active: Optional[bool] = True,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    query = {}
    if is_active is not None:
        query["is_active"] = is_active
    if faculty_id:
        query["faculty_id"] = faculty_id
    if building:
        query["building"] = building
    rooms = await db.rooms.find(query).sort("name", 1).to_list(500)
    return [{
        "id": str(r["_id"]),
        "name": r.get("name", ""),
        "faculty_id": r.get("faculty_id", ""),
        "capacity": r.get("capacity", 30),
        "building": r.get("building", ""),
        "floor": r.get("floor", ""),
        "room_type": r.get("room_type", "lecture"),
        "is_active": r.get("is_active", True),
    } for r in rooms]


@router.post("/rooms")
async def create_room(data: RoomCreate, current_user: dict = Depends(get_current_user)):
    if not can_manage_schedule(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    existing = await db.rooms.find_one({"name": data.name, "faculty_id": data.faculty_id})
    if existing:
        raise HTTPException(status_code=409, detail=f"القاعة '{data.name}' موجودة مسبقاً")
    doc = data.dict()
    doc["created_at"] = datetime.now(timezone.utc)
    result = await db.rooms.insert_one(doc)
    return {"id": str(result.inserted_id), "message": "تم إضافة القاعة بنجاح"}


@router.get("/rooms/template/excel")
async def download_rooms_template(current_user: dict = Depends(get_current_user)):
    """تحميل قالب Excel لاستيراد القاعات"""
    import openpyxl
    from openpyxl.styles import Font, Alignment, PatternFill
    from io import BytesIO

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "القاعات"
    ws.sheet_view.rightToLeft = True

    headers = ['اسم القاعة', 'السعة', 'المبنى', 'الطابق']
    hfill = PatternFill(start_color='1565C0', end_color='1565C0', fill_type='solid')
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.fill = hfill
        cell.font = Font(bold=True, color='FFFFFF')
        cell.alignment = Alignment(horizontal='center')

    # أمثلة
    examples = [
        ['ق101', 50, 'المبنى الرئيسي', 'الأول'],
        ['ق202', 40, 'المبنى الرئيسي', 'الثاني'],
        ['معمل حاسوب 1', 30, 'مبنى المعامل', 'الأول'],
    ]
    for i, row in enumerate(examples, 2):
        for col, val in enumerate(row, 1):
            ws.cell(row=i, column=col, value=val)

    for col, w in enumerate([18, 10, 22, 12], 1):
        ws.column_dimensions[chr(64 + col)].width = w

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=rooms_template.xlsx"})


@router.post("/rooms/import")
async def import_rooms(
    faculty_id: str,
    file: bytes = Depends(lambda: None),
    current_user: dict = Depends(get_current_user),
):
    """استيراد قاعات من ملف Excel"""
    if not can_manage_schedule(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    from fastapi import UploadFile, File as FastAPIFile
    raise HTTPException(status_code=400, detail="استخدم /api/rooms/import/upload")


from fastapi import UploadFile, File as FastAPIFile

@router.post("/rooms/import/upload")
async def import_rooms_upload(
    faculty_id: str,
    file: UploadFile = FastAPIFile(...),
    current_user: dict = Depends(get_current_user),
):
    """استيراد قاعات من ملف Excel"""
    if not can_manage_schedule(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    import openpyxl
    from io import BytesIO

    db = get_db()
    content = await file.read()
    filename = file.filename or ""

    rows_data = []
    if filename.endswith('.csv'):
        import csv
        import io
        text = content.decode('utf-8-sig')
        reader = csv.reader(io.StringIO(text))
        for row in reader:
            rows_data.append(row)
        rows_data = rows_data[1:]  # skip header
    elif filename.endswith('.xls'):
        import xlrd
        book = xlrd.open_workbook(file_contents=content)
        sheet = book.sheet_by_index(0)
        for i in range(1, sheet.nrows):
            rows_data.append([sheet.cell_value(i, j) for j in range(sheet.ncols)])
    else:
        wb = openpyxl.load_workbook(BytesIO(content))
        ws = wb.active
        for row in ws.iter_rows(min_row=2, values_only=True):
            rows_data.append(list(row))

    created = 0
    skipped = 0
    errors = []

    for row_num, row in enumerate(rows_data, 2):
        if not row or not row[0]:
            continue
        name = str(row[0]).strip()
        capacity = int(row[1]) if row[1] else 30
        building = str(row[2]).strip() if row[2] else ""
        floor = str(row[3]).strip() if row[3] else ""

        if not name:
            errors.append(f"سطر {row_num}: اسم القاعة فارغ")
            continue

        existing = await db.rooms.find_one({"name": name, "faculty_id": faculty_id})
        if existing:
            skipped += 1
            continue

        await db.rooms.insert_one({
            "name": name,
            "faculty_id": faculty_id,
            "capacity": capacity,
            "building": building,
            "floor": floor,
            "room_type": "lecture",
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
        })
        created += 1

    return {
        "message": f"تم إضافة {created} قاعة جديدة، {skipped} موجودة مسبقاً",
        "created": created,
        "skipped": skipped,
        "errors": errors,
    }



@router.put("/rooms/{room_id}")
async def update_room(room_id: str, data: RoomUpdate, current_user: dict = Depends(get_current_user)):
    if not can_manage_schedule(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    update = {k: v for k, v in data.dict().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="لا توجد بيانات للتحديث")
    await db.rooms.update_one({"_id": ObjectId(room_id)}, {"$set": update})
    return {"message": "تم تحديث القاعة"}


@router.delete("/rooms/{room_id}")
async def delete_room(room_id: str, current_user: dict = Depends(get_current_user)):
    if not can_manage_schedule(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    await db.rooms.delete_one({"_id": ObjectId(room_id)})
    return {"message": "تم حذف القاعة"}


# ===== الفترات الزمنية =====

@router.get("/schedule-settings")
async def get_schedule_settings(
    faculty_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    settings_id = f"faculty_{faculty_id}" if faculty_id else "global"
    settings = await db.schedule_settings.find_one({"_id": settings_id})
    if not settings:
        # جلب الإعدادات العامة كقيمة افتراضية
        global_settings = await db.schedule_settings.find_one({"_id": "global"})
        default_slots = [
            {"slot_number": 1, "name": "المحاضرة الأولى", "start_time": "08:00", "end_time": "09:30"},
            {"slot_number": 2, "name": "المحاضرة الثانية", "start_time": "09:45", "end_time": "11:15"},
            {"slot_number": 3, "name": "المحاضرة الثالثة", "start_time": "11:30", "end_time": "13:00"},
            {"slot_number": 4, "name": "المحاضرة الرابعة", "start_time": "13:15", "end_time": "14:45"},
            {"slot_number": 5, "name": "المحاضرة الخامسة", "start_time": "15:00", "end_time": "16:30"},
        ]
        default_days = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"]
        if global_settings:
            default_slots = global_settings.get("time_slots", default_slots)
            default_days = global_settings.get("working_days", default_days)
        settings = {
            "time_slots": default_slots,
            "working_days": default_days,
        }
    return {
        "time_slots": settings.get("time_slots", []),
        "working_days": settings.get("working_days", []),
    }


@router.put("/schedule-settings")
async def update_schedule_settings(
    time_slots: Optional[List[dict]] = None,
    working_days: Optional[List[str]] = None,
    current_user: dict = Depends(get_current_user),
):
    if not can_manage_schedule(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    update = {}
    if time_slots is not None:
        update["time_slots"] = time_slots
    if working_days is not None:
        update["working_days"] = working_days
    if update:
        await db.schedule_settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)
    return {"message": "تم تحديث الإعدادات"}


@router.post("/schedule-settings/time-slots")
async def save_time_slots(
    slots: List[TimeSlotCreate],
    faculty_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if not can_manage_schedule(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    settings_id = f"faculty_{faculty_id}" if faculty_id else "global"
    slots_data = [s.dict() for s in slots]
    await db.schedule_settings.update_one(
        {"_id": settings_id},
        {"$set": {"time_slots": slots_data}},
        upsert=True
    )
    return {"message": "تم حفظ الفترات الزمنية"}


# ===== تفضيلات المعلمين =====

@router.get("/teacher-preferences/{teacher_id}")
async def get_teacher_preferences(teacher_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    pref = await db.teacher_preferences.find_one({"teacher_id": teacher_id})
    if not pref:
        return {"teacher_id": teacher_id, "unavailable_days": [], "unavailable_slots": [], "max_daily_lectures": 5}
    return {
        "teacher_id": teacher_id,
        "unavailable_days": pref.get("unavailable_days", []),
        "unavailable_slots": pref.get("unavailable_slots", []),
        "max_daily_lectures": pref.get("max_daily_lectures", 5),
    }


@router.put("/teacher-preferences/{teacher_id}")
async def update_teacher_preferences(
    teacher_id: str,
    data: TeacherPreferenceUpdate,
    current_user: dict = Depends(get_current_user),
):
    if not can_manage_schedule(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    await db.teacher_preferences.update_one(
        {"teacher_id": teacher_id},
        {"$set": {
            "teacher_id": teacher_id,
            "unavailable_days": data.unavailable_days,
            "unavailable_slots": data.unavailable_slots,
            "max_daily_lectures": data.max_daily_lectures,
            "updated_at": datetime.now(timezone.utc),
        }},
        upsert=True
    )
    return {"message": "تم حفظ تفضيلات المعلم"}


# ===== خانات الجدول =====

@router.get("/weekly-schedule")
async def get_weekly_schedule(
    faculty_id: Optional[str] = None,
    department_id: Optional[str] = None,
    level: Optional[int] = None,
    section: Optional[str] = None,
    teacher_id: Optional[str] = None,
    room_id: Optional[str] = None,
    semester_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    query = {}
    if semester_id:
        query["semester_id"] = semester_id
    if faculty_id:
        query["faculty_id"] = faculty_id
    if department_id:
        query["department_id"] = department_id
    if level:
        query["level"] = level
    if section:
        query["section"] = section
    if teacher_id:
        query["teacher_id"] = teacher_id
    if room_id:
        query["room_id"] = room_id

    slots = await db.weekly_schedule.find(query).to_list(2000)

    # Batch lookup
    course_ids = list({s["course_id"] for s in slots if s.get("course_id")})
    teacher_ids = list({s["teacher_id"] for s in slots if s.get("teacher_id")})
    room_ids = list({s["room_id"] for s in slots if s.get("room_id")})
    dept_ids = list({s["department_id"] for s in slots if s.get("department_id")})

    courses_map = {}
    if course_ids:
        docs = await db.courses.find({"_id": {"$in": [ObjectId(x) for x in course_ids]}}).to_list(500)
        for d in docs:
            courses_map[str(d["_id"])] = d

    teachers_map = {}
    if teacher_ids:
        docs = await db.teachers.find({"_id": {"$in": [ObjectId(x) for x in teacher_ids]}}).to_list(500)
        for d in docs:
            teachers_map[str(d["_id"])] = d

    rooms_map = {}
    if room_ids:
        docs = await db.rooms.find({"_id": {"$in": [ObjectId(x) for x in room_ids]}}).to_list(500)
        for d in docs:
            rooms_map[str(d["_id"])] = d

    depts_map = {}
    if dept_ids:
        docs = await db.departments.find({"_id": {"$in": [ObjectId(x) for x in dept_ids]}}).to_list(100)
        for d in docs:
            depts_map[str(d["_id"])] = d

    result = []
    for s in slots:
        course = courses_map.get(s.get("course_id", ""), {})
        teacher = teachers_map.get(s.get("teacher_id", ""), {})
        room = rooms_map.get(s.get("room_id", ""), {})
        dept = depts_map.get(s.get("department_id", ""), {})
        result.append({
            "id": str(s["_id"]),
            "faculty_id": s.get("faculty_id", ""),
            "department_id": s.get("department_id", ""),
            "department_name": dept.get("name", ""),
            "level": s.get("level"),
            "section": s.get("section", ""),
            "day": s.get("day", ""),
            "slot_number": s.get("slot_number"),
            "course_id": s.get("course_id", ""),
            "course_name": course.get("name", ""),
            "course_code": course.get("code", ""),
            "teacher_id": s.get("teacher_id", ""),
            "teacher_name": teacher.get("full_name", ""),
            "room_id": s.get("room_id", ""),
            "room_name": room.get("name", ""),
        })
    return result


@router.post("/weekly-schedule")
async def create_schedule_slot(
    data: ScheduleSlotCreate,
    current_user: dict = Depends(get_current_user),
):
    if not can_manage_schedule(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()

    # === كشف التعارضات ===
    conflicts = []

    # 1. تعارض الشعبة (نفس القسم+المستوى+الشعبة+اليوم+الفترة)
    existing_section = await db.weekly_schedule.find_one({
        "department_id": data.department_id,
        "level": data.level,
        "section": data.section,
        "day": data.day,
        "slot_number": data.slot_number,
    })
    if existing_section:
        c = await db.courses.find_one({"_id": ObjectId(existing_section["course_id"])})
        conflicts.append(f"تعارض شعبة: يوجد مقرر '{c.get('name', '')}' لنفس الشعبة في هذه الفترة")

    # 2. تعارض المعلم
    teacher_busy = await db.weekly_schedule.find_one({
        "teacher_id": data.teacher_id,
        "day": data.day,
        "slot_number": data.slot_number,
    })
    if teacher_busy:
        t = await db.teachers.find_one({"_id": ObjectId(data.teacher_id)})
        c = await db.courses.find_one({"_id": ObjectId(teacher_busy["course_id"])})
        conflicts.append(f"تعارض معلم: '{t.get('full_name', '')}' لديه مقرر '{c.get('name', '')}' في نفس الفترة")

    # 3. تعارض القاعة
    room_busy = await db.weekly_schedule.find_one({
        "room_id": data.room_id,
        "day": data.day,
        "slot_number": data.slot_number,
    })
    if room_busy:
        r = await db.rooms.find_one({"_id": ObjectId(data.room_id)})
        c = await db.courses.find_one({"_id": ObjectId(room_busy["course_id"])})
        conflicts.append(f"تعارض قاعة: '{r.get('name', '')}' مشغولة بمقرر '{c.get('name', '')}' في نفس الفترة")

    # 4. تعارض تفضيلات المعلم
    pref = await db.teacher_preferences.find_one({"teacher_id": data.teacher_id})
    if pref:
        if data.day in pref.get("unavailable_days", []):
            t = await db.teachers.find_one({"_id": ObjectId(data.teacher_id)})
            conflicts.append(f"تعارض تفضيلات: '{t.get('full_name', '')}' لا يعمل يوم {data.day}")
        if data.slot_number in pref.get("unavailable_slots", []):
            t = await db.teachers.find_one({"_id": ObjectId(data.teacher_id)})
            conflicts.append(f"تعارض تفضيلات: '{t.get('full_name', '')}' لا يعمل في الفترة {data.slot_number}")
        # Check max daily
        daily_count = await db.weekly_schedule.count_documents({
            "teacher_id": data.teacher_id, "day": data.day
        })
        max_daily = pref.get("max_daily_lectures", 5)
        if daily_count >= max_daily:
            conflicts.append(f"تعارض تفضيلات: المعلم وصل الحد الأقصى ({max_daily} محاضرات) ليوم {data.day}")

    if conflicts:
        raise HTTPException(status_code=409, detail={"message": "يوجد تعارضات", "conflicts": conflicts})

    doc = data.dict()
    doc["created_at"] = datetime.now(timezone.utc)
    doc["created_by"] = current_user["id"]
    result = await db.weekly_schedule.insert_one(doc)
    return {"id": str(result.inserted_id), "message": "تم إضافة المحاضرة في الجدول"}


@router.put("/weekly-schedule/{slot_id}")
async def update_schedule_slot(
    slot_id: str,
    data: ScheduleSlotUpdate,
    current_user: dict = Depends(get_current_user),
):
    if not can_manage_schedule(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    existing = await db.weekly_schedule.find_one({"_id": ObjectId(slot_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="غير موجود")

    update = {k: v for k, v in data.dict().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="لا توجد بيانات")

    # Check conflicts for new values
    check_day = existing["day"]
    check_slot = existing["slot_number"]

    if "teacher_id" in update:
        teacher_busy = await db.weekly_schedule.find_one({
            "_id": {"$ne": ObjectId(slot_id)},
            "teacher_id": update["teacher_id"],
            "day": check_day,
            "slot_number": check_slot,
        })
        if teacher_busy:
            raise HTTPException(status_code=409, detail="تعارض: المعلم لديه محاضرة أخرى في نفس الفترة")

    if "room_id" in update:
        room_busy = await db.weekly_schedule.find_one({
            "_id": {"$ne": ObjectId(slot_id)},
            "room_id": update["room_id"],
            "day": check_day,
            "slot_number": check_slot,
        })
        if room_busy:
            raise HTTPException(status_code=409, detail="تعارض: القاعة مشغولة في نفس الفترة")

    await db.weekly_schedule.update_one({"_id": ObjectId(slot_id)}, {"$set": update})
    return {"message": "تم التحديث"}


@router.delete("/weekly-schedule/{slot_id}")
async def delete_schedule_slot(
    slot_id: str,
    current_user: dict = Depends(get_current_user),
):
    if not can_manage_schedule(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    await db.weekly_schedule.delete_one({"_id": ObjectId(slot_id)})
    return {"message": "تم الحذف"}


@router.delete("/weekly-schedule/clear/all")
async def clear_schedule(
    faculty_id: Optional[str] = None,
    department_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """مسح كامل الجدول أو جدول كلية/قسم"""
    if not can_manage_schedule(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    query = {}
    if faculty_id:
        query["faculty_id"] = faculty_id
    if department_id:
        query["department_id"] = department_id
    result = await db.weekly_schedule.delete_many(query)
    return {"message": f"تم حذف {result.deleted_count} خانة"}


# ===== التوليد شبه التلقائي =====

@router.post("/weekly-schedule/auto-generate")
async def auto_generate_schedule(
    faculty_id: str,
    department_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """توليد جدول تلقائي مع مراعاة التعارضات والتفضيلات"""
    if not can_manage_schedule(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    db = get_db()

    # Get settings (faculty-specific or global)
    settings = await db.schedule_settings.find_one({"_id": f"faculty_{faculty_id}"})
    if not settings:
        settings = await db.schedule_settings.find_one({"_id": "global"})
    if not settings:
        raise HTTPException(status_code=400, detail="يرجى إعداد الفترات الزمنية أولاً")

    time_slots = settings.get("time_slots", [])
    working_days = settings.get("working_days", [])
    if not time_slots or not working_days:
        raise HTTPException(status_code=400, detail="يرجى إعداد الفترات الزمنية وأيام العمل")

    slot_numbers = sorted([s["slot_number"] for s in time_slots])

    # Get departments
    dept_query = {"faculty_id": faculty_id, "is_active": {"$ne": False}}
    if department_id:
        dept_query["_id"] = ObjectId(department_id)
    departments = await db.departments.find(dept_query).to_list(100)

    # Get rooms for this faculty only
    rooms = await db.rooms.find({"is_active": True, "faculty_id": faculty_id}).to_list(200)
    if not rooms:
        raise HTTPException(status_code=400, detail="لا توجد قاعات مسجلة لهذه الكلية. أضف قاعات أولاً من تبويب 'القاعات'")

    # Get teacher preferences
    all_prefs = await db.teacher_preferences.find().to_list(500)
    prefs_map = {p["teacher_id"]: p for p in all_prefs}

    # Track occupancy: (day, slot) -> set of teacher_ids, room_ids
    teacher_occupied = {}  # (day, slot) -> set of teacher_ids
    room_occupied = {}     # (day, slot) -> set of room_ids
    section_occupied = {}  # (dept_id, level, section, day, slot) -> True
    teacher_daily_count = {}  # (teacher_id, day) -> count

    # Load existing schedule to avoid conflicts
    existing = await db.weekly_schedule.find({"faculty_id": faculty_id}).to_list(5000)
    for e in existing:
        key = (e["day"], e["slot_number"])
        teacher_occupied.setdefault(key, set()).add(e["teacher_id"])
        room_occupied.setdefault(key, set()).add(e["room_id"])
        sk = (e["department_id"], e["level"], e.get("section", ""), e["day"], e["slot_number"])
        section_occupied[sk] = True
        dk = (e["teacher_id"], e["day"])
        teacher_daily_count[dk] = teacher_daily_count.get(dk, 0) + 1

    created = 0
    skipped = 0
    errors = []

    for dept in departments:
        dept_id = str(dept["_id"])

        # Get courses for this department
        courses = await db.courses.find({
            "department_id": dept_id, "is_active": True, "teacher_id": {"$ne": None}
        }).to_list(500)

        # Group by (level, section)
        groups = {}
        for c in courses:
            key = (c.get("level", 1), c.get("section", ""))
            groups.setdefault(key, []).append(c)

        for (level, section), group_courses in groups.items():
            for course in group_courses:
                cid = str(course["_id"])
                tid = course.get("teacher_id", "")
                credit = course.get("credit_hours", 3)

                # عدد المحاضرات المطلوبة
                if credit <= 2:
                    needed = 1
                elif credit <= 3:
                    needed = 2
                else:
                    needed = 3

                # Check if already scheduled
                existing_count = await db.weekly_schedule.count_documents({
                    "course_id": cid, "department_id": dept_id,
                    "level": level, "section": section,
                })
                needed -= existing_count
                if needed <= 0:
                    continue

                pref = prefs_map.get(tid, {})
                unavail_days = pref.get("unavailable_days", [])
                unavail_slots = pref.get("unavailable_slots", [])
                max_daily = pref.get("max_daily_lectures", 5)

                placed = 0
                for day in working_days:
                    if placed >= needed:
                        break
                    if day in unavail_days:
                        continue

                    for sn in slot_numbers:
                        if placed >= needed:
                            break
                        if sn in unavail_slots:
                            continue

                        key_ts = (day, sn)
                        sk = (dept_id, level, section, day, sn)

                        # Check section free
                        if sk in section_occupied:
                            continue
                        # Check teacher free
                        if tid in teacher_occupied.get(key_ts, set()):
                            continue
                        # Check teacher daily limit
                        dk = (tid, day)
                        if teacher_daily_count.get(dk, 0) >= max_daily:
                            continue

                        # Find free room
                        busy_rooms = room_occupied.get(key_ts, set())
                        free_room = None
                        for room in rooms:
                            if str(room["_id"]) not in busy_rooms:
                                free_room = room
                                break
                        if not free_room:
                            continue

                        rid = str(free_room["_id"])

                        # Place it!
                        doc = {
                            "faculty_id": faculty_id,
                            "department_id": dept_id,
                            "level": level,
                            "section": section,
                            "day": day,
                            "slot_number": sn,
                            "course_id": cid,
                            "teacher_id": tid,
                            "room_id": rid,
                            "created_at": datetime.now(timezone.utc),
                            "created_by": current_user["id"],
                            "auto_generated": True,
                        }
                        await db.weekly_schedule.insert_one(doc)

                        # Update tracking
                        teacher_occupied.setdefault(key_ts, set()).add(tid)
                        room_occupied.setdefault(key_ts, set()).add(rid)
                        section_occupied[sk] = True
                        teacher_daily_count[dk] = teacher_daily_count.get(dk, 0) + 1

                        created += 1
                        placed += 1

                if placed < needed:
                    remaining = needed - placed
                    errors.append(f"{course.get('name', '')} ({course.get('code', '')}): لم يتم جدولة {remaining} محاضرة")

    return {
        "message": f"تم إنشاء {created} محاضرة في الجدول",
        "created": created,
        "errors": errors,
    }
