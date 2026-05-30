"""
Archive PDF Reports - تصدير تقارير الأرشيف كملفات PDF
- يستخدم reportlab + arabic_reshaper + bidi
- يقرأ نفس البيانات التي تقرأها endpoints الـ JSON
"""
import io
import os
from typing import Optional

from bidi.algorithm import get_display
import arabic_reshaper
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak,
)
from reportlab.lib.enums import TA_CENTER, TA_RIGHT

from .deps import get_current_user, get_db
from models.permissions import Permission

router = APIRouter(tags=["تقارير الأرشيف PDF"])

# تسجيل خط Amiri العربي (مرة واحدة فقط)
_FONT_NAME = "Amiri"
_FONT_REGISTERED = False


def _register_font():
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    font_path = os.path.join(here, "fonts", "Amiri-Regular.ttf")
    if os.path.exists(font_path):
        try:
            pdfmetrics.registerFont(TTFont(_FONT_NAME, font_path))
            _FONT_REGISTERED = True
        except Exception:
            pass


def ar(text) -> str:
    """يعيد تشكيل النص العربي + يحوّله إلى RTL."""
    if text is None:
        return ""
    s = str(text)
    if not s:
        return ""
    try:
        reshaped = arabic_reshaper.reshape(s)
        return get_display(reshaped)
    except Exception:
        return s


def _has_perm(user: dict, perm: str = Permission.VIEW_ARCHIVE) -> bool:
    if user.get("role") == "admin":
        return True
    return perm in set(user.get("permissions") or [])


def _require(user: dict):
    if not _has_perm(user, Permission.VIEW_ARCHIVE):
        raise HTTPException(status_code=403, detail="غير مصرح")


async def _load_archive(db, semester_id: str) -> dict:
    a = await db.semester_archives.find_one({"semester_id": semester_id})
    if not a:
        raise HTTPException(status_code=404, detail="الفصل غير مؤرشف")
    return a


def _att_stats(att_list):
    p = sum(1 for x in att_list if x.get("status") == "present")
    ab = sum(1 for x in att_list if x.get("status") == "absent")
    la = sum(1 for x in att_list if x.get("status") == "late")
    ex = sum(1 for x in att_list if x.get("status") == "excused")
    tot = p + ab + la + ex
    rate = round(((p + la) / tot * 100) if tot else 0, 1)
    return {"present": p, "absent": ab, "late": la, "excused": ex, "total": tot, "pct": rate}


# ---------- مكونات PDF عامة ----------

def _styles():
    _register_font()
    title = ParagraphStyle(
        "Title", fontName=_FONT_NAME, fontSize=18, alignment=TA_CENTER,
        textColor=colors.HexColor("#6a1b9a"), spaceAfter=10,
    )
    sub = ParagraphStyle(
        "Sub", fontName=_FONT_NAME, fontSize=11, alignment=TA_CENTER,
        textColor=colors.HexColor("#555"), spaceAfter=6,
    )
    sec = ParagraphStyle(
        "Sec", fontName=_FONT_NAME, fontSize=13, alignment=TA_RIGHT,
        textColor=colors.HexColor("#222"), spaceAfter=8, spaceBefore=12,
    )
    norm = ParagraphStyle(
        "Norm", fontName=_FONT_NAME, fontSize=10, alignment=TA_RIGHT,
        textColor=colors.HexColor("#333"), leading=14,
    )
    return title, sub, sec, norm


def _header_section(elements, title_text: str, semester_name: str, academic_year: str):
    title, sub, _, _ = _styles()
    elements.append(Paragraph(ar(title_text), title))
    elements.append(Paragraph(ar(f"{semester_name} - {academic_year}"), sub))
    elements.append(Paragraph(ar("جامعة الأحقاف - من الأرشيف الدراسي"), sub))
    elements.append(Spacer(1, 8 * mm))


def _build_pdf(elements) -> io.BytesIO:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=15 * mm, bottomMargin=15 * mm,
    )
    doc.build(elements)
    buf.seek(0)
    return buf


def _pdf_response(buf: io.BytesIO, filename: str) -> StreamingResponse:
    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ==================== Endpoints ====================

@router.get("/archives/{semester_id}/students/{student_id}/pdf")
async def archive_student_report_pdf(
    semester_id: str, student_id: str,
    current_user: dict = Depends(get_current_user),
):
    """PDF تقرير حضور طالب في فصل مؤرشف."""
    _require(current_user)
    db = get_db()
    a = await _load_archive(db, semester_id)

    students_map = {s["id"]: s for s in a.get("students_snapshot", [])}
    student = students_map.get(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود في الأرشيف")

    enrollments = [e for e in a.get("enrollments", []) if str(e.get("student_id")) == student_id]
    course_ids = {str(e.get("course_id")) for e in enrollments if e.get("course_id")}
    courses_map = {c["id"]: c for c in a.get("courses", [])}
    attendance = [att for att in a.get("attendance", []) if str(att.get("student_id")) == student_id]
    overall = _att_stats(attendance)

    elements = []
    title, _, sec, norm = _styles()
    _header_section(elements, "تقرير حضور طالب", a.get("semester_name", ""), a.get("academic_year", ""))

    # بيانات الطالب
    elements.append(Paragraph(ar("بيانات الطالب"), sec))
    info_data = [
        [ar(student.get("full_name", "")), ar("الاسم:")],
        [ar(student.get("student_id", "-")), ar("الرقم الجامعي:")],
        [ar(student.get("reference_number", "-")), ar("الرقم المرجعي:")],
        [ar(str(student.get("level", "-"))), ar("المستوى:")],
        [ar(student.get("section", "-")), ar("الشعبة:")],
    ]
    t = Table(info_data, colWidths=[110 * mm, 50 * mm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), _FONT_NAME), ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (1, 0), (1, -1), colors.HexColor("#f5f5f5")),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#ddd")),
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(t)

    # ملخص الحضور العام
    elements.append(Paragraph(ar("ملخص الحضور العام"), sec))
    sum_data = [[
        ar("معذور"), ar("متأخر"), ar("غائب"), ar("حاضر"),
        ar("الإجمالي"), ar("نسبة الحضور"),
    ], [
        str(overall["excused"]), str(overall["late"]), str(overall["absent"]),
        str(overall["present"]), str(overall["total"]), f"{overall['pct']}%",
    ]]
    t = Table(sum_data, colWidths=[27 * mm] * 6)
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), _FONT_NAME), ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#6a1b9a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#ddd")),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(t)

    # جدول المقررات
    elements.append(Paragraph(ar(f"تفاصيل الحضور لكل مقرر ({len(course_ids)})"), sec))
    rows = [[
        ar("النسبة"), ar("معذور"), ar("متأخر"), ar("غائب"), ar("حاضر"),
        ar("المعلم"), ar("المقرر"),
    ]]
    for cid in course_ids:
        c = courses_map.get(cid)
        if not c:
            continue
        c_att = [x for x in attendance if str(x.get("course_id")) == cid]
        st = _att_stats(c_att)
        rows.append([
            f"{st['pct']}%", str(st["excused"]), str(st["late"]),
            str(st["absent"]), str(st["present"]),
            ar(c.get("teacher_name", "-") or "-"),
            ar(f"{c.get('name', '')} ({c.get('code', '')})"),
        ])
    if len(rows) > 1:
        t = Table(rows, colWidths=[18 * mm, 18 * mm, 18 * mm, 18 * mm, 18 * mm, 35 * mm, 45 * mm])
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), _FONT_NAME), ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1565c0")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#ddd")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(t)
    else:
        elements.append(Paragraph(ar("لم يُسجل الطالب في أي مقرر بهذا الفصل."), norm))

    buf = _build_pdf(elements)
    fname = f"student-report-{student.get('student_id') or student_id}.pdf"
    return _pdf_response(buf, fname)


@router.get("/archives/{semester_id}/teachers/{teacher_id}/pdf")
async def archive_teacher_report_pdf(
    semester_id: str, teacher_id: str,
    current_user: dict = Depends(get_current_user),
):
    """PDF تقرير نصاب معلم في فصل مؤرشف."""
    _require(current_user)
    db = get_db()
    a = await _load_archive(db, semester_id)

    teachers_map = {t["id"]: t for t in a.get("teachers_snapshot", [])}
    teacher = teachers_map.get(teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="المعلم غير موجود في الأرشيف")

    courses = [c for c in a.get("courses", []) if str(c.get("teacher_id")) == teacher_id]
    total_credit = sum(int(c.get("credit_hours") or 0) for c in courses)
    total_students = sum(int(c.get("students_count") or 0) for c in courses)
    total_lec = sum(int(c.get("lectures_total") or 0) for c in courses)
    completed_lec = sum(int(c.get("lectures_completed") or 0) for c in courses)
    completion = round((completed_lec / total_lec * 100) if total_lec else 0, 1)

    elements = []
    _, _, sec, norm = _styles()
    _header_section(elements, "تقرير نصاب معلم", a.get("semester_name", ""), a.get("academic_year", ""))

    # بيانات المعلم
    elements.append(Paragraph(ar("بيانات المعلم"), sec))
    info = [
        [ar(teacher.get("full_name", "")), ar("الاسم:")],
        [ar(teacher.get("teacher_id", "-")), ar("الرقم الوظيفي:")],
        [ar(teacher.get("academic_title", "-") or "-"), ar("اللقب العلمي:")],
        [ar(teacher.get("specialization", "-") or "-"), ar("التخصص:")],
    ]
    t = Table(info, colWidths=[110 * mm, 50 * mm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), _FONT_NAME), ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (1, 0), (1, -1), colors.HexColor("#f5f5f5")),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#ddd")),
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(t)

    # الإجمالي
    elements.append(Paragraph(ar("ملخص النصاب"), sec))
    sum_data = [[
        ar("نسبة الإنجاز"), ar("مكتملة"), ar("محاضرات"), ar("ساعات"),
        ar("طلاب"), ar("مقررات"),
    ], [
        f"{completion}%", str(completed_lec), str(total_lec), str(total_credit),
        str(total_students), str(len(courses)),
    ]]
    t = Table(sum_data, colWidths=[27 * mm] * 6)
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), _FONT_NAME), ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ef6c00")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#ddd")),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(t)

    # المقررات
    elements.append(Paragraph(ar(f"المقررات المدرّسة ({len(courses)})"), sec))
    rows = [[
        ar("النسبة"), ar("مكتملة"), ar("محاضرات"), ar("طلاب"),
        ar("ساعات"), ar("شعبة"), ar("الكود"), ar("المقرر"),
    ]]
    for c in courses:
        rows.append([
            f"{c.get('completion_pct', 0)}%",
            str(c.get("lectures_completed", 0)),
            str(c.get("lectures_total", 0)),
            str(c.get("students_count", 0)),
            str(c.get("credit_hours", 0)),
            ar(c.get("section", "-") or "-"),
            ar(c.get("code", "-")),
            ar(c.get("name", "")),
        ])
    if len(rows) > 1:
        t = Table(rows, colWidths=[16 * mm, 16 * mm, 17 * mm, 14 * mm, 14 * mm,
                                    14 * mm, 22 * mm, 57 * mm])
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), _FONT_NAME), ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ef6c00")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#ddd")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(t)
    else:
        elements.append(Paragraph(ar("لم يُدرّس المعلم أي مقرر بهذا الفصل."), norm))

    buf = _build_pdf(elements)
    fname = f"teacher-report-{teacher.get('teacher_id') or teacher_id}.pdf"
    return _pdf_response(buf, fname)


@router.get("/archives/students/{student_id}/history/pdf")
async def archive_student_history_pdf(
    student_id: str,
    current_user: dict = Depends(get_current_user),
):
    """PDF السجل الأكاديمي الكامل للطالب."""
    _require(current_user)
    db = get_db()
    history = []
    first_snap = None
    async for a in db.semester_archives.find({}).sort("archived_at", -1):
        students_map = {s["id"]: s for s in a.get("students_snapshot", [])}
        student = students_map.get(student_id)
        if not student:
            continue
        if not first_snap:
            first_snap = student
        att = [x for x in a.get("attendance", []) if str(x.get("student_id")) == student_id]
        enr = [e for e in a.get("enrollments", []) if str(e.get("student_id")) == student_id]
        st = _att_stats(att)
        history.append({
            "semester_name": a.get("semester_name"),
            "academic_year": a.get("academic_year"),
            "courses_count": len({str(e.get("course_id")) for e in enr}),
            **st,
        })

    elements = []
    _, _, sec, norm = _styles()
    elements.append(Paragraph(ar("السجل الأكاديمي الكامل للطالب"), _styles()[0]))
    elements.append(Spacer(1, 6 * mm))
    if first_snap:
        elements.append(Paragraph(
            ar(f"الاسم: {first_snap.get('full_name', '-')}    "
               f"الرقم: {first_snap.get('student_id', '-')}    "
               f"المرجعي: {first_snap.get('reference_number', '-')}"), norm,
        ))
        elements.append(Spacer(1, 6 * mm))

    if not history:
        elements.append(Paragraph(ar("لا توجد فصول مؤرشفة لهذا الطالب."), norm))
    else:
        rows = [[
            ar("النسبة"), ar("معذور"), ar("متأخر"), ar("غائب"), ar("حاضر"),
            ar("مقررات"), ar("الفصل"),
        ]]
        for h in history:
            rows.append([
                f"{h['pct']}%", str(h["excused"]), str(h["late"]),
                str(h["absent"]), str(h["present"]), str(h["courses_count"]),
                ar(f"{h['semester_name']} ({h['academic_year']})"),
            ])
        t = Table(rows, colWidths=[18, 18, 18, 18, 18, 18, 60], hAlign="CENTER")
        t._argW = [x * mm for x in [18, 18, 18, 18, 18, 18, 60]]
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), _FONT_NAME), ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1565c0")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#ddd")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
            ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)

    buf = _build_pdf(elements)
    sid = (first_snap or {}).get("student_id") or student_id
    return _pdf_response(buf, f"student-history-{sid}.pdf")


@router.get("/archives/teachers/{teacher_id}/history/pdf")
async def archive_teacher_history_pdf(
    teacher_id: str,
    current_user: dict = Depends(get_current_user),
):
    """PDF السجل التدريسي الكامل للمعلم."""
    _require(current_user)
    db = get_db()
    history = []
    first_snap = None
    grand = {"courses": 0, "students": 0, "credit": 0, "lec": 0, "completed": 0}
    async for a in db.semester_archives.find({}).sort("archived_at", -1):
        teachers_map = {t["id"]: t for t in a.get("teachers_snapshot", [])}
        teacher = teachers_map.get(teacher_id)
        if not teacher:
            continue
        if not first_snap:
            first_snap = teacher
        courses = [c for c in a.get("courses", []) if str(c.get("teacher_id")) == teacher_id]
        tc = sum(int(c.get("credit_hours") or 0) for c in courses)
        ts = sum(int(c.get("students_count") or 0) for c in courses)
        tl = sum(int(c.get("lectures_total") or 0) for c in courses)
        cl = sum(int(c.get("lectures_completed") or 0) for c in courses)
        cp = round((cl / tl * 100) if tl else 0, 1)
        grand["courses"] += len(courses); grand["students"] += ts
        grand["credit"] += tc; grand["lec"] += tl; grand["completed"] += cl
        history.append({
            "semester": f"{a.get('semester_name')} ({a.get('academic_year')})",
            "courses_count": len(courses), "students": ts,
            "credit": tc, "lectures": tl, "completed": cl, "pct": cp,
        })
    grand_pct = round((grand["completed"] / grand["lec"] * 100) if grand["lec"] else 0, 1)

    elements = []
    title, _, sec, norm = _styles()
    elements.append(Paragraph(ar("السجل التدريسي الكامل للمعلم"), title))
    elements.append(Spacer(1, 4 * mm))
    if first_snap:
        elements.append(Paragraph(
            ar(f"الاسم: {first_snap.get('full_name', '-')}    "
               f"الرقم الوظيفي: {first_snap.get('teacher_id', '-')}    "
               f"اللقب: {first_snap.get('academic_title', '-') or '-'}"), norm,
        ))
        elements.append(Spacer(1, 6 * mm))

    if not history:
        elements.append(Paragraph(ar("لا توجد فصول مؤرشفة لهذا المعلم."), norm))
    else:
        # الإجمالي العام
        elements.append(Paragraph(ar("الإجمالي عبر كل الفصول"), sec))
        gt = [[
            ar("نسبة الإنجاز"), ar("مكتملة"), ar("محاضرات"), ar("ساعات"),
            ar("طلاب"), ar("مقررات"),
        ], [
            f"{grand_pct}%", str(grand["completed"]), str(grand["lec"]),
            str(grand["credit"]), str(grand["students"]), str(grand["courses"]),
        ]]
        t = Table(gt, colWidths=[27 * mm] * 6)
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), _FONT_NAME), ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ef6c00")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#ddd")),
            ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)

        elements.append(Paragraph(ar(f"تفصيل الفصول ({len(history)})"), sec))
        rows = [[
            ar("النسبة"), ar("مكتملة"), ar("محاضرات"), ar("ساعات"),
            ar("طلاب"), ar("مقررات"), ar("الفصل"),
        ]]
        for h in history:
            rows.append([
                f"{h['pct']}%", str(h["completed"]), str(h["lectures"]),
                str(h["credit"]), str(h["students"]), str(h["courses_count"]),
                ar(h["semester"]),
            ])
        t = Table(rows, colWidths=[18 * mm, 18 * mm, 18 * mm, 16 * mm, 16 * mm, 16 * mm, 50 * mm])
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), _FONT_NAME), ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ef6c00")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#ddd")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(t)

    buf = _build_pdf(elements)
    tid = (first_snap or {}).get("teacher_id") or teacher_id
    return _pdf_response(buf, f"teacher-history-{tid}.pdf")


@router.get("/archives/courses/{course_code}/history/pdf")
async def archive_course_history_pdf(
    course_code: str,
    current_user: dict = Depends(get_current_user),
):
    """PDF تاريخ مقرر عبر الفصول."""
    _require(current_user)
    db = get_db()
    instances = []
    course_name = course_code
    async for a in db.semester_archives.find({}).sort("archived_at", -1):
        matches = [c for c in a.get("courses", [])
                   if (c.get("code") or "").lower() == (course_code or "").lower()]
        for c in matches:
            if c.get("name"):
                course_name = c.get("name")
            instances.append({
                "semester": f"{a.get('semester_name')} ({a.get('academic_year')})",
                "section": c.get("section", "-") or "-",
                "teacher": c.get("teacher_name", "-") or "-",
                "department": c.get("department_name", "-") or "-",
                "students": c.get("students_count", 0),
                "lectures": c.get("lectures_total", 0),
                "completed": c.get("lectures_completed", 0),
                "pct": c.get("completion_pct", 0),
            })

    elements = []
    title, _, sec, norm = _styles()
    elements.append(Paragraph(ar(f"تاريخ المقرر: {course_name}"), title))
    elements.append(Paragraph(ar(f"الكود: {course_code} - عدد المرات: {len(instances)}"), norm))
    elements.append(Spacer(1, 6 * mm))

    if not instances:
        elements.append(Paragraph(ar("لم يُدرَّس هذا المقرر في أي فصل مؤرشف."), norm))
    else:
        rows = [[
            ar("النسبة"), ar("مكتملة"), ar("محاضرات"), ar("طلاب"),
            ar("القسم"), ar("المعلم"), ar("شعبة"), ar("الفصل"),
        ]]
        for it in instances:
            rows.append([
                f"{it['pct']}%", str(it["completed"]), str(it["lectures"]),
                str(it["students"]),
                ar(it["department"]), ar(it["teacher"]),
                ar(it["section"]), ar(it["semester"]),
            ])
        t = Table(rows, colWidths=[14 * mm, 14 * mm, 16 * mm, 14 * mm,
                                    28 * mm, 28 * mm, 14 * mm, 42 * mm])
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), _FONT_NAME), ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2e7d32")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#ddd")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(t)

    buf = _build_pdf(elements)
    return _pdf_response(buf, f"course-history-{course_code}.pdf")
