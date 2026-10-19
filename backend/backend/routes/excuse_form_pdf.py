"""📄 استمارة PDF رسمية لعذر غياب (طالب/أستاذ): بيانات الطلب، تفاصيل الغياب، التوجيه، القرار، التوقيعات، وصورة العذر مدرجة في الصفحة"""
import io
import os
from datetime import datetime
from typing import List, Optional

NAVY, GREY, LINE, SOFT = "#0f2440", "#64748b", "#cbd5e1", "#f5f7fa"


def _fonts():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        if "Amiri" not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont("Amiri", os.path.join(here, "fonts", "Amiri-Regular.ttf")))
            pdfmetrics.registerFont(TTFont("Amiri-Bold", os.path.join(here, "fonts", "Amiri-Bold.ttf")))
        return "Amiri", "Amiri-Bold"
    except Exception:
        return "Helvetica", "Helvetica-Bold"


def _ar(t) -> str:
    import arabic_reshaper
    from bidi.algorithm import get_display
    try:
        return get_display(arabic_reshaper.reshape(str(t if t is not None else "")))
    except Exception:
        return str(t or "")


def _fmt(iso: Optional[str]) -> str:
    return (iso or "")[:16].replace("T", " ") or "—"


def build_excuse_form_pdf(form: dict, images: List[tuple]) -> bytes:
    """form: {kind_title, ref_no, status, status_label, created_at, faculty, department, applicant: [(label, value)], absences_head: [...], absences: [[...]],
    description, excuse_type_label, route_label, reviewer_label, decision: approved|rejected|needs_info|None, decision_note, decided_by, decided_at,
    signatures: [label...], extra_notes: [str]} · images: [(bytes, mime, name)] تُدرج أسفل الاستمارة"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.lib.utils import ImageReader
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    font, bold = _fonts()
    W, H = A4
    margin = 14 * mm
    page_w = W - 2 * margin
    C = lambda h: colors.HexColor(h)
    st_title = ParagraphStyle("t", fontName=bold, fontSize=15, leading=22, alignment=TA_CENTER, textColor=C(NAVY))
    st_uni = ParagraphStyle("u", fontName=bold, fontSize=11, leading=16, alignment=TA_RIGHT, textColor=C(NAVY))
    st_meta = ParagraphStyle("m", fontName=font, fontSize=9, leading=13, alignment=TA_RIGHT, textColor=C(GREY))
    st_sec = ParagraphStyle("c", fontName=bold, fontSize=10.5, leading=15, alignment=TA_RIGHT, textColor=colors.white)
    st_cell = ParagraphStyle("x", fontName=font, fontSize=9.5, leading=14, alignment=TA_RIGHT)
    st_cell_b = ParagraphStyle("xb", fontName=bold, fontSize=9.5, leading=14, alignment=TA_RIGHT, textColor=C(NAVY))
    st_small = ParagraphStyle("s", fontName=font, fontSize=8, leading=11, alignment=TA_CENTER, textColor=C(GREY))
    P = lambda t, st=st_cell: Paragraph(_ar(t), st)

    def section(title):
        t = Table([[P(title, st_sec)]], colWidths=[page_w])
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), C(NAVY)), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))
        return t

    def kv_table(pairs, cols=2):
        """أزواج (عنوان، قيمة) في شبكة RTL: القيمة يسار العنوان، والعنوان الأول أقصى اليمين"""
        rows, row = [], []
        for lbl, val in pairs:
            row = [P(val or "—"), P(lbl, st_cell_b)] + row
            if len(row) == cols * 2:
                rows.append(row); row = []
        if row:
            row = [P("", st_cell)] * (cols * 2 - len(row)) + row
            rows.append(row)
        lw, vw = 30 * mm, (page_w - cols * 30 * mm) / cols
        widths = []
        for _ in range(cols):
            widths += [vw, lw]
        t = Table(rows, colWidths=widths)
        style = [("GRID", (0, 0), (-1, -1), 0.4, C(LINE)), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
        for i in range(cols):
            style.append(("BACKGROUND", (i * 2 + 1, 0), (i * 2 + 1, -1), C(SOFT)))
        t.setStyle(TableStyle(style))
        return t

    def grid(head, rows):
        data = [[P(h, ParagraphStyle("h", parent=st_cell_b, alignment=TA_CENTER)) for h in reversed(head)]]
        for r in rows:
            data.append([P(c, ParagraphStyle("g", parent=st_cell, alignment=TA_CENTER)) for c in reversed(r)])
        if not rows:
            data.append([P("—", st_cell)] * len(head))
        t = Table(data, colWidths=[page_w / len(head)] * len(head), repeatRows=1)
        t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, C(LINE)), ("BACKGROUND", (0, 0), (-1, 0), C(SOFT)), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                               ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        return t

    el = []
    # ---- الترويسة
    status_color = {"approved": "#15803d", "rejected": "#b91c1c", "needs_info": "#b45309"}.get(form.get("decision") or "", "#64748b")
    head_left = [P(f"رقم الطلب: {form.get('ref_no', '')}", st_meta), P(f"تاريخ التقديم: {_fmt(form.get('created_at'))}", st_meta),
                 Paragraph(_ar(f"الحالة: {form.get('status_label', '')}"), ParagraphStyle("st", parent=st_meta, textColor=C(status_color), fontName=bold))]
    head_right = [P(form.get("university", "جامعة الأحقاف"), st_uni), P(form.get("faculty") or "", st_meta), P(form.get("department") or "", st_meta)]
    ht = Table([[head_left, head_right]], colWidths=[page_w * 0.42, page_w * 0.58])
    ht.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, 0), 1.2, C(NAVY)), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    el += [ht, Spacer(1, 4), P(form["kind_title"], st_title), Spacer(1, 6)]

    # ---- 1) بيانات مقدم الطلب
    el += [section("أولاً: بيانات مقدم الطلب"), kv_table(form["applicant"], cols=2), Spacer(1, 5)]
    # ---- 2) تفاصيل الغياب
    el += [section("ثانياً: تفاصيل الغياب المطلوب تبريره"), grid(form["absences_head"], form["absences"]), Spacer(1, 5)]
    # ---- 3) العذر
    excuse_pairs = [("نوع العذر", form.get("excuse_type_label")), ("عدد المرفقات", str(form.get("attachments_count", 0)))]
    el += [section("ثالثاً: العذر وبيانه"), kv_table(excuse_pairs, cols=2)]
    desc = Table([[P(form.get("description") or "—")]], colWidths=[page_w])
    desc.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.4, C(LINE)), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))
    el += [desc, Spacer(1, 5)]
    # ---- 4) التوجيه
    route_pairs = [("جهة البت", form.get("route_label")), ("المراجع المختص", form.get("reviewer_label"))]
    el += [section("رابعاً: التوجيه"), kv_table(route_pairs, cols=2)]
    for n in form.get("extra_notes") or []:
        el.append(P(n, ParagraphStyle("xn", parent=st_meta, alignment=TA_RIGHT)))
    el.append(Spacer(1, 5))
    # ---- 5) القرار
    dec = form.get("decision")
    box = lambda k, label: f"{'[ X ]' if dec == k else '[     ]'}  {label}"
    dec_row = Table([[P(box("needs_info", "مطلوب استكمال")), P(box("rejected", "مرفوض")), P(box("approved", "معتمد / مقبول"))]], colWidths=[page_w / 3] * 3)
    dec_row.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, C(LINE)), ("BACKGROUND", (0, 0), (-1, -1), C(SOFT)), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    note_pairs = [("ملاحظة / سبب القرار", form.get("decision_note") or " "), ("صاحب القرار", form.get("decided_by") or " "), ("تاريخ القرار", _fmt(form.get("decided_at")) if form.get("decided_at") else " ")]
    el += [section("خامساً: القرار"), dec_row, kv_table(note_pairs[:1], cols=1), kv_table(note_pairs[1:], cols=2), Spacer(1, 6)]
    # ---- 6) التوقيعات
    sigs = form.get("signatures") or []
    sig_cells = [[P(s, ParagraphStyle("sg", parent=st_cell_b, alignment=TA_CENTER)) for s in reversed(sigs)], [P("\n\n\n", st_cell) for _ in sigs],
                 [P("الاسم: ....................................", ParagraphStyle("sn", parent=st_small, alignment=TA_RIGHT)) for _ in sigs],
                 [P("التوقيع: ....................     التاريخ:      /      /", ParagraphStyle("sn2", parent=st_small, alignment=TA_RIGHT)) for _ in sigs]]
    sig_t = Table(sig_cells, colWidths=[page_w / len(sigs)] * len(sigs))
    sig_t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, C(NAVY)), ("INNERGRID", (0, 0), (-1, -1), 0.4, C(LINE)), ("BACKGROUND", (0, 0), (-1, 0), C(SOFT)), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    el += [section("سادساً: التوقيعات"), sig_t, Spacer(1, 6)]

    # ---- 7) صورة العذر
    el.append(section("سابعاً: صورة العذر المرفقة"))
    img_items, notes = [], []
    from reportlab.platypus import Flowable

    class FitImage(Flowable):
        """صورة تتكيّف مع المساحة المتبقية في الصفحة (حتى 80مم)؛ وإن كانت المساحة أقل من 30مم تنتقل للصفحة التالية"""
        def __init__(self, data, max_w):
            super().__init__(); self.ir = ImageReader(io.BytesIO(data)); self.iw, self.ih = self.ir.getSize(); self.max_w = max_w; self.w = self.h = 0; self.hAlign = "CENTER"
        def wrap(self, aw, ah):
            avail_h = ah - 6
            if avail_h < 30 * mm:
                self.w, self.h = self.max_w, 80 * mm
                return self.w, self.h
            sc = min(self.max_w / self.iw, min(80 * mm, avail_h) / self.ih)
            self.w, self.h = self.iw * sc, self.ih * sc
            return self.w, self.h
        def draw(self):
            x = 0
            self.canv.setStrokeColor(C(LINE)); self.canv.rect(x - 2, -2, self.w + 4, self.h + 4, stroke=1, fill=0)
            self.canv.drawImage(self.ir, x, 0, width=self.w, height=self.h, preserveAspectRatio=True, mask="auto")

    imgs = [(d, m, n) for d, m, n in images if (m or "").startswith("image/") and d]
    for data, mime, name in images:
        if not (mime or "").startswith("image/") or not data:
            notes.append(f"مرفق غير صوري أو غير متاح ({name}) — يُراجع من النظام")
    if imgs:
        try:
            el.append(FitImage(imgs[0][0], page_w - 6 * mm))
        except Exception:
            notes.append(f"تعذّر عرض الصورة: {imgs[0][2]}")
        for data, mime, name in imgs[1:]:
            try:
                el.append(Spacer(1, 4)); el.append(FitImage(data, page_w - 6 * mm))
            except Exception:
                notes.append(f"تعذّر عرض الصورة: {name}")
    elif not notes:
        notes.append("لا توجد صورة مرفقة")
    for n in notes:
        el.append(P(n, ParagraphStyle("nt", parent=st_meta, alignment=TA_CENTER)))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont(font, 7.5); canvas.setFillColor(C(GREY))
        canvas.drawCentredString(W / 2, 8 * mm, _ar(f"{form['kind_title']} — {form.get('ref_no', '')} — طُبعت {datetime.now().strftime('%Y-%m-%d %H:%M')} — صفحة {doc.page}"))
        canvas.restoreState()

    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=margin, rightMargin=margin, topMargin=10 * mm, bottomMargin=14 * mm, title=form["kind_title"]).build(el, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
