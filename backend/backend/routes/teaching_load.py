"""
Teaching Load Routes - مسارات إدارة العبء التدريسي
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from fastapi.responses import StreamingResponse
from bson import ObjectId
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel

from .deps import get_db, get_current_user, has_permission, log_activity
from models.permissions import Permission

router = APIRouter(tags=["العبء التدريسي"])


class TeachingLoadCreate(BaseModel):
    teacher_id: str
    course_id: str
    weekly_hours: float
    semester_id: Optional[str] = None
    notes: Optional[str] = None


class TeachingLoadUpdate(BaseModel):
    weekly_hours: Optional[float] = None
    notes: Optional[str] = None


@router.get("/teaching-load")
async def get_teaching_loads(
    department_id: Optional[str] = None,
    teacher_id: Optional[str] = None,
    semester_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """جلب جدول العبء التدريسي مع تفاصيل المعلم والمقرر"""
    if not has_permission(current_user, Permission.VIEW_TEACHING_LOAD) and not has_permission(current_user, Permission.MANAGE_TEACHING_LOAD):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    db = get_db()
    query = {}
    if teacher_id:
        query["teacher_id"] = teacher_id
    if semester_id:
        query["semester_id"] = semester_id

    # If department filter, get teacher ids in that department first
    teacher_ids_in_dept = None
    if department_id:
        dept_teachers = await db.teachers.find(
            {"department_id": department_id, "is_active": {"$ne": False}},
            {"_id": 1}
        ).to_list(500)
        teacher_ids_in_dept = [str(t["_id"]) for t in dept_teachers]
        if teacher_id:
            if teacher_id not in teacher_ids_in_dept:
                return {"items": [], "summary": {}}
        else:
            query["teacher_id"] = {"$in": teacher_ids_in_dept}

    loads = await db.teaching_loads.find(query).to_list(500)

    # Collect unique ids for batch lookup
    t_ids = list({l["teacher_id"] for l in loads})
    c_ids = list({l["course_id"] for l in loads})

    # Batch fetch teachers and courses
    teachers_map = {}
    if t_ids:
        obj_ids = []
        for tid in t_ids:
            try:
                obj_ids.append(ObjectId(tid))
            except Exception:
                pass
        teachers_docs = await db.teachers.find({"_id": {"$in": obj_ids}}).to_list(500)
        for t in teachers_docs:
            teachers_map[str(t["_id"])] = t

    courses_map = {}
    if c_ids:
        obj_ids = []
        for cid in c_ids:
            try:
                obj_ids.append(ObjectId(cid))
            except Exception:
                pass
        courses_docs = await db.courses.find({"_id": {"$in": obj_ids}}).to_list(500)
        for c in courses_docs:
            courses_map[str(c["_id"])] = c

    items = []
    teacher_summary = {}  # teacher_id -> total hours

    for load in loads:
        tid = load["teacher_id"]
        cid = load["course_id"]
        teacher = teachers_map.get(tid, {})
        course = courses_map.get(cid, {})

        wh = load.get("weekly_hours", 0)
        if tid not in teacher_summary:
            teacher_summary[tid] = {
                "teacher_name": teacher.get("full_name", ""),
                "total_hours": 0,
                "courses_count": 0,
            }
        teacher_summary[tid]["total_hours"] += wh
        teacher_summary[tid]["courses_count"] += 1

        items.append({
            "id": str(load["_id"]),
            "teacher_id": tid,
            "teacher_name": teacher.get("full_name", ""),
            "teacher_employee_id": teacher.get("teacher_id", ""),
            "department_id": teacher.get("department_id", ""),
            "course_id": cid,
            "course_name": course.get("name", ""),
            "course_code": course.get("code", ""),
            "course_section": course.get("section", ""),
            "weekly_hours": wh,
            "semester_id": load.get("semester_id"),
            "notes": load.get("notes", ""),
            "created_at": load.get("created_at"),
            "updated_at": load.get("updated_at"),
        })

    return {
        "items": items,
        "summary": teacher_summary,
    }


@router.post("/teaching-load")
async def create_teaching_load(
    data: TeachingLoadCreate,
    current_user: dict = Depends(get_current_user),
):
    """إضافة عبء تدريسي (معلم + مقرر + ساعات أسبوعية)"""
    if not has_permission(current_user, Permission.MANAGE_TEACHING_LOAD):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    db = get_db()

    # Validate teacher exists
    teacher = await db.teachers.find_one({"_id": ObjectId(data.teacher_id)})
    if not teacher:
        raise HTTPException(status_code=404, detail="المعلم غير موجود")

    # Validate course exists
    course = await db.courses.find_one({"_id": ObjectId(data.course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")

    # Check if already exists
    existing = await db.teaching_loads.find_one({
        "teacher_id": data.teacher_id,
        "course_id": data.course_id,
    })
    if existing:
        # Update existing
        await db.teaching_loads.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "weekly_hours": data.weekly_hours,
                "notes": data.notes,
                "semester_id": data.semester_id,
                "updated_at": datetime.now(timezone.utc),
                "updated_by": current_user["id"],
            }}
        )
        await log_activity(
            current_user, "update_teaching_load", "teaching_load",
            str(existing["_id"]),
            f"{teacher.get('full_name', '')} - {course.get('name', '')}",
            {"weekly_hours": data.weekly_hours}
        )
        return {"id": str(existing["_id"]), "message": "تم تحديث العبء التدريسي بنجاح", "updated": True}

    doc = {
        "teacher_id": data.teacher_id,
        "course_id": data.course_id,
        "weekly_hours": data.weekly_hours,
        "semester_id": data.semester_id,
        "notes": data.notes,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.teaching_loads.insert_one(doc)

    await log_activity(
        current_user, "create_teaching_load", "teaching_load",
        str(result.inserted_id),
        f"{teacher.get('full_name', '')} - {course.get('name', '')}",
        {"weekly_hours": data.weekly_hours}
    )

    return {"id": str(result.inserted_id), "message": "تم إضافة العبء التدريسي بنجاح", "updated": False}


@router.put("/teaching-load/{load_id}")
async def update_teaching_load(
    load_id: str,
    data: TeachingLoadUpdate,
    current_user: dict = Depends(get_current_user),
):
    """تعديل عبء تدريسي"""
    if not has_permission(current_user, Permission.MANAGE_TEACHING_LOAD):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    db = get_db()
    existing = await db.teaching_loads.find_one({"_id": ObjectId(load_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="السجل غير موجود")

    update_fields = {"updated_at": datetime.now(timezone.utc), "updated_by": current_user["id"]}
    if data.weekly_hours is not None:
        update_fields["weekly_hours"] = data.weekly_hours
    if data.notes is not None:
        update_fields["notes"] = data.notes

    await db.teaching_loads.update_one({"_id": ObjectId(load_id)}, {"$set": update_fields})

    await log_activity(
        current_user, "update_teaching_load", "teaching_load",
        load_id, None, {"weekly_hours": data.weekly_hours}
    )

    return {"message": "تم التحديث بنجاح"}


@router.delete("/teaching-load/{load_id}")
async def delete_teaching_load(
    load_id: str,
    current_user: dict = Depends(get_current_user),
):
    """حذف عبء تدريسي"""
    if not has_permission(current_user, Permission.MANAGE_TEACHING_LOAD):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    db = get_db()
    existing = await db.teaching_loads.find_one({"_id": ObjectId(load_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="السجل غير موجود")

    await db.teaching_loads.delete_one({"_id": ObjectId(load_id)})

    await log_activity(
        current_user, "delete_teaching_load", "teaching_load",
        load_id, None, None
    )

    return {"message": "تم الحذف بنجاح"}


@router.get("/teaching-load/teacher/{teacher_id}/courses")
async def get_teacher_courses_for_load(
    teacher_id: str,
    department_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """جلب جميع المقررات المتاحة لتعيين العبء للمعلم"""
    if not has_permission(current_user, Permission.VIEW_TEACHING_LOAD) and not has_permission(current_user, Permission.MANAGE_TEACHING_LOAD):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    db = get_db()
    
    # جلب بيانات المعلم لمعرفة قسمه
    teacher = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
    
    # جلب جميع المقررات النشطة (حسب القسم إذا محدد)
    course_query = {"is_active": True}
    if department_id:
        course_query["department_id"] = department_id
    elif teacher and teacher.get("department_id"):
        course_query["department_id"] = teacher["department_id"]
    
    courses = await db.courses.find(course_query).to_list(500)

    # Get existing loads for this teacher
    existing_loads = await db.teaching_loads.find({"teacher_id": teacher_id}).to_list(100)
    loads_map = {l["course_id"]: l for l in existing_loads}

    result = []
    for c in courses:
        cid = str(c["_id"])
        load = loads_map.get(cid)
        dept_name = ""
        if c.get("department_id"):
            try:
                dept = await db.departments.find_one({"_id": ObjectId(c["department_id"])})
                if dept:
                    dept_name = dept.get("name", "")
            except Exception:
                pass

        # اسم المعلم المسند حالياً للمقرر
        current_teacher_name = ""
        if c.get("teacher_id") and c["teacher_id"] != teacher_id:
            try:
                ct = await db.teachers.find_one({"_id": ObjectId(c["teacher_id"])})
                if ct:
                    current_teacher_name = ct.get("full_name", "")
            except Exception:
                pass

        result.append({
            "course_id": cid,
            "course_name": c.get("name", ""),
            "course_code": c.get("code", ""),
            "section": c.get("section", ""),
            "level": c.get("level", 1),
            "department_name": dept_name,
            "credit_hours": c.get("credit_hours", 3),
            "current_teacher_name": current_teacher_name,
            "existing_load_id": str(load["_id"]) if load else None,
            "existing_weekly_hours": load.get("weekly_hours") if load else None,
            "existing_notes": load.get("notes", "") if load else "",
        })

@router.get("/teaching-load/search-courses")
async def search_courses_for_load(
    q: str = "",
    department_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """بحث في المقررات لإسناد العبء التدريسي"""
    if not has_permission(current_user, Permission.VIEW_TEACHING_LOAD) and not has_permission(current_user, Permission.MANAGE_TEACHING_LOAD):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    db = get_db()
    query = {"is_active": True}
    if department_id:
        query["department_id"] = department_id
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"code": {"$regex": q, "$options": "i"}},
        ]

    courses = await db.courses.find(query).limit(20).to_list(20)
    result = []
    for c in courses:
        teacher_name = ""
        if c.get("teacher_id"):
            try:
                t = await db.teachers.find_one({"_id": ObjectId(c["teacher_id"])})
                if t:
                    teacher_name = t.get("full_name", "")
            except Exception:
                pass
        result.append({
            "course_id": str(c["_id"]),
            "course_name": c.get("name", ""),
            "course_code": c.get("code", ""),
            "section": c.get("section", ""),
            "level": c.get("level", 1),
            "credit_hours": c.get("credit_hours", 3),
            "current_teacher_name": teacher_name,
        })
    return result


    return result


@router.post("/teaching-load/bulk")
async def bulk_save_teaching_load(
    items: list[TeachingLoadCreate],
    current_user: dict = Depends(get_current_user),
):
    """حفظ مجموعة من سجلات العبء التدريسي دفعة واحدة"""
    if not has_permission(current_user, Permission.MANAGE_TEACHING_LOAD):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    db = get_db()
    created = 0
    updated = 0

    for item in items:
        existing = await db.teaching_loads.find_one({
            "teacher_id": item.teacher_id,
            "course_id": item.course_id,
        })
        if existing:
            await db.teaching_loads.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "weekly_hours": item.weekly_hours,
                    "notes": item.notes,
                    "semester_id": item.semester_id,
                    "updated_at": datetime.now(timezone.utc),
                    "updated_by": current_user["id"],
                }}
            )
            updated += 1
        else:
            await db.teaching_loads.insert_one({
                "teacher_id": item.teacher_id,
                "course_id": item.course_id,
                "weekly_hours": item.weekly_hours,
                "semester_id": item.semester_id,
                "notes": item.notes,
                "created_by": current_user["id"],
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            })
            created += 1

    await log_activity(
        current_user, "bulk_teaching_load", "teaching_load",
        None, None, {"created": created, "updated": updated}
    )

    return {
        "message": f"تم الحفظ بنجاح: {created} جديد، {updated} محدث",
        "created": created,
        "updated": updated,
    }


async def _get_export_data(db, department_id: str = None, start_date: str = None, end_date: str = None):
    """تجميع بيانات التصدير مع حساب إجمالي الساعات للفترة"""
    from math import ceil

    query = {}
    teacher_ids_in_dept = None
    if department_id:
        dept_teachers = await db.teachers.find(
            {"department_id": department_id, "is_active": {"$ne": False}}, {"_id": 1}
        ).to_list(500)
        teacher_ids_in_dept = [str(t["_id"]) for t in dept_teachers]
        query["teacher_id"] = {"$in": teacher_ids_in_dept}

    loads = await db.teaching_loads.find(query).to_list(1000)
    if not loads:
        return [], 0, "", ""

    # Calculate weeks in period
    weeks = 16  # default semester
    period_label = "فصل دراسي (16 أسبوع)"
    if start_date and end_date:
        try:
            sd = datetime.fromisoformat(start_date)
            ed = datetime.fromisoformat(end_date)
            days = (ed - sd).days + 1
            weeks = max(1, ceil(days / 7))
            period_label = f"من {start_date} إلى {end_date} ({weeks} أسبوع)"
        except Exception:
            pass

    # Batch fetch teachers and courses
    t_ids = list({l["teacher_id"] for l in loads})
    c_ids = list({l["course_id"] for l in loads})

    teachers_map = {}
    if t_ids:
        docs = await db.teachers.find({"_id": {"$in": [ObjectId(x) for x in t_ids]}}).to_list(500)
        for t in docs:
            teachers_map[str(t["_id"])] = t

    courses_map = {}
    if c_ids:
        docs = await db.courses.find({"_id": {"$in": [ObjectId(x) for x in c_ids]}}).to_list(500)
        for c in docs:
            courses_map[str(c["_id"])] = c

    # Group by teacher
    grouped = {}
    for load in loads:
        tid = load["teacher_id"]
        teacher = teachers_map.get(tid, {})
        course = courses_map.get(load["course_id"], {})
        wh = load.get("weekly_hours", 0)

        if tid not in grouped:
            grouped[tid] = {
                "teacher_name": teacher.get("full_name", ""),
                "employee_id": teacher.get("teacher_id", ""),
                "rows": [],
                "total_weekly": 0,
            }
        grouped[tid]["rows"].append({
            "course_name": course.get("name", ""),
            "course_code": course.get("code", ""),
            "section": course.get("section", ""),
            "weekly_hours": wh,
            "total_hours": round(wh * weeks, 2),
        })
        grouped[tid]["total_weekly"] += wh

    # Flatten for export
    rows = []
    for tid, g in grouped.items():
        for r in g["rows"]:
            rows.append({
                "teacher_name": g["teacher_name"],
                "employee_id": g["employee_id"],
                "course_name": r["course_name"],
                "course_code": r["course_code"],
                "section": r["section"],
                "weekly_hours": r["weekly_hours"],
                "total_hours": r["total_hours"],
            })
        # Summary row
        total_period = round(g["total_weekly"] * weeks, 2)
        rows.append({
            "teacher_name": g["teacher_name"],
            "employee_id": g["employee_id"],
            "course_name": "*** الإجمالي ***",
            "course_code": "",
            "section": "",
            "weekly_hours": round(g["total_weekly"], 2),
            "total_hours": total_period,
        })

    return rows, weeks, period_label, ""


@router.get("/export/teaching-load/excel")
async def export_teaching_load_excel(
    department_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """تصدير جدول العبء التدريسي إلى Excel"""
    if not has_permission(current_user, Permission.VIEW_TEACHING_LOAD) and not has_permission(current_user, Permission.MANAGE_TEACHING_LOAD):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    import openpyxl
    from openpyxl.styles import Font, Alignment, PatternFill
    from io import BytesIO

    db = get_db()
    rows, weeks, period_label, _ = await _get_export_data(db, department_id, start_date, end_date)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "العبء التدريسي"
    ws.sheet_view.rightToLeft = True

    # Title
    ws.merge_cells('A1:G1')
    ws['A1'] = 'جدول العبء التدريسي'
    ws['A1'].font = Font(bold=True, size=14)
    ws['A1'].alignment = Alignment(horizontal='center')

    # Period info
    ws.merge_cells('A2:G2')
    ws['A2'] = period_label
    ws['A2'].font = Font(size=11, color='666666')
    ws['A2'].alignment = Alignment(horizontal='center')

    # Department name
    dept_name = ""
    if department_id:
        dept = await db.departments.find_one({"_id": ObjectId(department_id)})
        if dept:
            dept_name = dept.get("name", "")
    if dept_name:
        ws.merge_cells('A3:G3')
        ws['A3'] = f'القسم: {dept_name}'
        ws['A3'].font = Font(size=11)
        ws['A3'].alignment = Alignment(horizontal='center')

    # Headers
    headers = ['اسم المعلم', 'الرقم الوظيفي', 'المقرر', 'الرمز', 'الشعبة', 'ساعات أسبوعية', f'إجمالي الساعات ({weeks} أسبوع)']
    header_fill = PatternFill(start_color='1565C0', end_color='1565C0', fill_type='solid')
    header_font = Font(bold=True, color='FFFFFF')

    start_row = 5
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=start_row, column=col, value=h)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center')

    # Data
    summary_fill = PatternFill(start_color='E3F2FD', end_color='E3F2FD', fill_type='solid')
    for i, row in enumerate(rows):
        r = start_row + 1 + i
        ws.cell(row=r, column=1, value=row["teacher_name"])
        ws.cell(row=r, column=2, value=row["employee_id"])
        ws.cell(row=r, column=3, value=row["course_name"])
        ws.cell(row=r, column=4, value=row["course_code"])
        ws.cell(row=r, column=5, value=row["section"])
        ws.cell(row=r, column=6, value=row["weekly_hours"])
        ws.cell(row=r, column=7, value=row["total_hours"])

        if "الإجمالي" in row["course_name"]:
            for col in range(1, 8):
                ws.cell(row=r, column=col).fill = summary_fill
                ws.cell(row=r, column=col).font = Font(bold=True)

    # Column widths
    widths = [22, 16, 24, 12, 10, 16, 20]
    for col, w in enumerate(widths, 1):
        ws.column_dimensions[chr(64 + col)].width = w

    if not rows:
        ws.cell(row=start_row + 1, column=1, value="لا توجد بيانات")

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=teaching_load.xlsx"}
    )


@router.get("/export/teaching-load/pdf")
async def export_teaching_load_pdf(
    department_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """تصدير جدول العبء التدريسي إلى PDF"""
    if not has_permission(current_user, Permission.VIEW_TEACHING_LOAD) and not has_permission(current_user, Permission.MANAGE_TEACHING_LOAD):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import arabic_reshaper
    from bidi.algorithm import get_display
    from io import BytesIO
    from pathlib import Path

    db = get_db()
    rows, weeks, period_label, _ = await _get_export_data(db, department_id, start_date, end_date)

    # Register Arabic font
    font_path = Path(__file__).parent.parent / "fonts" / "Amiri-Regular.ttf"
    if font_path.exists():
        try:
            pdfmetrics.registerFont(TTFont('Amiri', str(font_path)))
        except Exception:
            pass
        arabic_font = 'Amiri'
    else:
        arabic_font = 'Helvetica'

    def ar(text):
        reshaped = arabic_reshaper.reshape(str(text))
        return get_display(reshaped)

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), rightMargin=20, leftMargin=20, topMargin=30, bottomMargin=30)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('ArabicTitle', parent=styles['Title'], fontName=arabic_font, fontSize=16, alignment=TA_CENTER)
    subtitle_style = ParagraphStyle('ArabicSubtitle', parent=styles['Normal'], fontName=arabic_font, fontSize=11, alignment=TA_CENTER, textColor=colors.grey)

    elements = []
    elements.append(Paragraph(ar("جدول العبء التدريسي"), title_style))
    elements.append(Spacer(1, 4 * mm))
    elements.append(Paragraph(ar(period_label), subtitle_style))

    # Department name
    if department_id:
        dept = await db.departments.find_one({"_id": ObjectId(department_id)})
        if dept:
            elements.append(Paragraph(ar(f"القسم: {dept.get('name', '')}"), subtitle_style))

    elements.append(Spacer(1, 8 * mm))

    # Table
    header = [ar(h) for h in [f'إجمالي ({weeks} أسبوع)', 'ساعات أسبوعية', 'الشعبة', 'الرمز', 'المقرر', 'الرقم الوظيفي', 'اسم المعلم']]
    table_data = [header]

    for row in rows:
        is_summary = "الإجمالي" in row["course_name"]
        table_data.append([
            str(row["total_hours"]),
            str(row["weekly_hours"]),
            ar(row["section"] or "-"),
            ar(row["course_code"]),
            ar(row["course_name"]),
            ar(row["employee_id"]),
            ar(row["teacher_name"]),
        ])

    if not rows:
        table_data.append([ar("لا توجد بيانات"), "", "", "", "", "", ""])

    col_widths = [80, 80, 60, 70, 150, 90, 140]
    t = Table(table_data, colWidths=col_widths, repeatRows=1)

    # Style
    style_commands = [
        ('FONTNAME', (0, 0), (-1, -1), arabic_font),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1565c0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]

    # Highlight summary rows
    for i, row in enumerate(rows):
        if "الإجمالي" in row["course_name"]:
            style_commands.append(('BACKGROUND', (0, i + 1), (-1, i + 1), colors.HexColor('#e3f2fd')))
            style_commands.append(('FONTSIZE', (0, i + 1), (-1, i + 1), 10))

    t.setStyle(TableStyle(style_commands))
    elements.append(t)

    doc.build(elements)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=teaching_load.pdf"}
    )
