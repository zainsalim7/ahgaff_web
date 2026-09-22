"""📄 مولّد PDF موحّد للتقارير (reportlab + Amiri) — عنوان، مؤشرات، وأقسام جداول بنفس هوية لوحة القيادة"""
import io
import os
from datetime import datetime


def build_report_pdf(title: str, subtitle: str = "", kpis=None, sections=None, footer: str = "", generated_by: str = "") -> io.BytesIO:
    """kpis: [(label, value)] · sections: [{"title", "rows": [[...]] (الصف الأول رأس), "widths_mm": [...] اختياري, "head_bg": hex اختياري, "bold_last": bool}]"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import arabic_reshaper
    from bidi.algorithm import get_display

    font, bold = "Helvetica", "Helvetica-Bold"
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        pdfmetrics.registerFont(TTFont("Amiri", os.path.join(here, "fonts", "Amiri-Regular.ttf")))
        pdfmetrics.registerFont(TTFont("Amiri-Bold", os.path.join(here, "fonts", "Amiri-Bold.ttf")))
        font, bold = "Amiri", "Amiri-Bold"
    except Exception:
        pass

    def ar(t):
        try:
            return get_display(arabic_reshaper.reshape(str(t if t is not None else "")))
        except Exception:
            return str(t or "")

    NAVY, GREY = colors.HexColor("#0f2440"), colors.HexColor("#64748b")
    st_title = ParagraphStyle("t", fontName=bold, fontSize=17, leading=26, alignment=TA_CENTER, textColor=NAVY, spaceAfter=6)
    st_sub = ParagraphStyle("s", fontName=font, fontSize=9.5, leading=14, alignment=TA_CENTER, textColor=GREY, spaceAfter=8)
    st_sec = ParagraphStyle("c", fontName=bold, fontSize=12, alignment=TA_RIGHT, textColor=NAVY, spaceBefore=8, spaceAfter=4)
    st_small = ParagraphStyle("m", fontName=font, fontSize=8.5, alignment=TA_RIGHT, textColor=GREY)
    page_w = landscape(A4)[0] - 24 * mm

    def grid(rows, widths=None, head_bg=NAVY, fs=9, bold_last=False):
        n = len(rows[0])
        widths = [w * mm for w in widths] if widths else [page_w / n] * n
        rows = [[ar(c) for c in reversed(r)] for r in rows]
        t = Table(rows, colWidths=list(reversed(widths)), repeatRows=1)
        style = [
            ("FONTNAME", (0, 0), (-1, -1), font), ("FONTNAME", (0, 0), (-1, 0), bold), ("FONTSIZE", (0, 0), (-1, -1), fs),
            ("BACKGROUND", (0, 0), (-1, 0), head_bg), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")]),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
        if bold_last:
            style += [("FONTNAME", (0, -1), (-1, -1), bold), ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#fff7e0"))]
        t.setStyle(TableStyle(style))
        return t

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    el = [Paragraph(ar(f"جامعة الأحقاف — {title}"), st_title),
          Paragraph(ar((subtitle + "   |   " if subtitle else "") + f"تاريخ الإصدار: {now}"), st_sub)]
    if kpis:
        el += [grid([[k[0] for k in kpis], [k[1] for k in kpis]], head_bg=colors.HexColor("#173a63"), fs=10), Spacer(1, 4 * mm)]
    for sec in sections or []:
        rows = sec.get("rows") or []
        if len(rows) <= 1 and not sec.get("show_empty"):
            continue
        el.append(Paragraph(ar(sec.get("title", "")), st_sec))
        if len(rows) <= 1:
            rows = rows + [["لا توجد بيانات"] + [""] * (len(rows[0]) - 1)]
        el.append(grid(rows, sec.get("widths_mm"), colors.HexColor(sec.get("head_bg", "#0f2440")), sec.get("fs", 9), sec.get("bold_last", False)))
    if footer or generated_by:
        el += [Spacer(1, 6 * mm), Paragraph(ar((footer or "") + (f"  |  أُصدر بواسطة: {generated_by}" if generated_by else "")), st_small)]
    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm, topMargin=12 * mm, bottomMargin=12 * mm, title=title).build(el)
    buf.seek(0)
    return buf
