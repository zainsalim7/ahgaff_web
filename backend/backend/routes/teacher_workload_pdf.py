"""📄 PDF احترافي لتقرير نصاب المدرسين (reportlab + Amiri) — يستهلك نتيجة /reports/teacher-workload"""
import io
import os
from datetime import datetime


def build_workload_pdf(report: dict, scope_label: str = "", generated_by: str = "") -> io.BytesIO:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import arabic_reshaper
    from bidi.algorithm import get_display

    font = "Helvetica"
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        pdfmetrics.registerFont(TTFont("Amiri", os.path.join(here, "fonts", "Amiri-Regular.ttf")))
        pdfmetrics.registerFont(TTFont("Amiri-Bold", os.path.join(here, "fonts", "Amiri-Bold.ttf")))
        font, bold = "Amiri", "Amiri-Bold"
    except Exception:
        bold = "Helvetica-Bold"

    def ar(t):
        try:
            return get_display(arabic_reshaper.reshape(str(t if t is not None else "")))
        except Exception:
            return str(t or "")

    NAVY, GOLD, GREY = colors.HexColor("#0f2440"), colors.HexColor("#d4a017"), colors.HexColor("#64748b")
    st_title = ParagraphStyle("t", fontName=bold, fontSize=17, leading=26, alignment=TA_CENTER, textColor=NAVY, spaceAfter=6)
    st_sub = ParagraphStyle("s", fontName=font, fontSize=9.5, leading=14, alignment=TA_CENTER, textColor=GREY, spaceAfter=8)
    st_sec = ParagraphStyle("c", fontName=bold, fontSize=12, alignment=TA_RIGHT, textColor=NAVY, spaceBefore=8, spaceAfter=4)
    st_small = ParagraphStyle("m", fontName=font, fontSize=8.5, alignment=TA_RIGHT, textColor=GREY)

    def grid(rows, widths, head_bg=NAVY, fs=9, zebra=True, bold_last=False):
        rows = [[ar(c) for c in reversed(r)] for r in rows]
        t = Table(rows, colWidths=list(reversed(widths)), repeatRows=1)
        style = [
            ("FONTNAME", (0, 0), (-1, -1), font), ("FONTNAME", (0, 0), (-1, 0), bold), ("FONTSIZE", (0, 0), (-1, -1), fs),
            ("BACKGROUND", (0, 0), (-1, 0), head_bg), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
        if zebra:
            style.append(("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")]))
        if bold_last:
            style += [("FONTNAME", (0, -1), (-1, -1), bold), ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#fff7e0"))]
        t.setStyle(TableStyle(style))
        return t

    period = report.get("period", {})
    p_from, p_to = str(period.get("start_date", ""))[:10], str(period.get("end_date", ""))[:10]
    s = report.get("summary", {})
    teachers = report.get("teachers", [])
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    el = [Paragraph(ar("جامعة الأحقاف — تقرير نصاب المدرسين"), st_title),
          Paragraph(ar(f"الفترة: {p_from} → {p_to} ({period.get('total_weeks', '')} أسبوع)" + (f"   |   النطاق: {scope_label}" if scope_label else "") + f"   |   تاريخ الإصدار: {now}"), st_sub)]

    # ملخص عام
    rate = round(s.get("total_actual_hours", 0) * 100 / s["total_required_hours"], 1) if s.get("total_required_hours") else 0
    diff = s.get("total_difference_hours", 0)
    el += [grid([["المدرسون", "النصاب المطلوب (س)", "المجدولة (س)", "المنفَّذة (س)", "الفرق (س)", "نسبة الإنجاز"],
                 [s.get("total_teachers", 0), s.get("total_required_hours", 0), s.get("total_scheduled_hours", 0), s.get("total_actual_hours", 0),
                  f"{'+' if diff > 0 else ''}{diff}", f"{rate}%"]], [45 * mm] * 6, head_bg=colors.HexColor("#173a63"), fs=10, zebra=False), Spacer(1, 4 * mm)]

    # جدول المدرسين
    el.append(Paragraph(ar("ملخص المدرسين"), st_sec))
    rows = [["#", "المدرس", "المقررات", "نصاب أسبوعي", "المطلوب (س)", "المجدولة (س)", "المنفَّذة (س)", "الفرق (س)", "الإنجاز"]]
    for i, t in enumerate(teachers, 1):
        ts = t.get("summary", {})
        d = ts.get("difference_hours", 0)
        rows.append([i, t.get("teacher_name", ""), ts.get("total_courses", 0), ts.get("weekly_hours", 0), ts.get("required_hours", 0),
                     ts.get("total_scheduled_hours", 0), ts.get("total_actual_hours", 0), f"{'+' if d > 0 else ''}{d}", f"{ts.get('completion_rate', 0)}%"])
    rows.append(["", "الإجمالي", sum(t.get("summary", {}).get("total_courses", 0) for t in teachers), "", s.get("total_required_hours", 0),
                 s.get("total_scheduled_hours", 0), s.get("total_actual_hours", 0), f"{'+' if diff > 0 else ''}{diff}", f"{rate}%"])
    el.append(grid(rows, [10 * mm, 70 * mm, 20 * mm, 24 * mm, 26 * mm, 26 * mm, 26 * mm, 24 * mm, 22 * mm], bold_last=True))

    # تفصيل لكل مدرس
    if teachers:
        el.append(Paragraph(ar("تفصيل المقررات لكل مدرس"), st_sec))
    for t in teachers:
        ts = t.get("summary", {})
        head = Paragraph(ar(f"{t.get('teacher_name', '')} — نصاب {ts.get('weekly_hours', 0)} س/أسبوع · إنجاز {ts.get('completion_rate', 0)}%"),
                         ParagraphStyle("h", fontName=bold, fontSize=10.5, alignment=TA_RIGHT, textColor=NAVY, spaceBefore=6, spaceAfter=3))
        crows = [["المقرر", "الرمز", "محاضرات مجدولة", "محاضرات منفَّذة", "ساعات مجدولة", "ساعات منفَّذة", "نسبة التنفيذ"]]
        for c in t.get("courses", []):
            sc, ex = c.get("scheduled_lectures", 0), c.get("executed_lectures", 0)
            crows.append([c.get("course_name", ""), c.get("course_code", ""), sc, ex, c.get("scheduled_hours", 0), c.get("actual_hours", 0),
                          f"{round(ex * 100 / sc, 1) if sc else 0}%"])
        if len(crows) == 1:
            crows.append(["لا مقررات مسندة في هذه الفترة", "", "", "", "", "", ""])
        el.append(KeepTogether([head, grid(crows, [80 * mm, 26 * mm, 30 * mm, 30 * mm, 28 * mm, 28 * mm, 26 * mm], head_bg=colors.HexColor("#37474f"), fs=8.5)]))

    el += [Spacer(1, 6 * mm), Paragraph(ar("الإنجاز = الساعات المنفَّذة ÷ النصاب المطلوب (النصاب الأسبوعي × عدد الأسابيع). المحاضرة تُعد منفَّذة إذا سُجِّل لها حضور." + (f"  |  أُصدر بواسطة: {generated_by}" if generated_by else "")), st_small)]

    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm, topMargin=12 * mm, bottomMargin=12 * mm,
                      title="تقرير نصاب المدرسين").build(el)
    buf.seek(0)
    return buf
