"""مولّد PDF للخطابات الرسمية (ReportLab + تشكيل عربي) — كليشة + متن منسّق + جدول أسماء، مع تخطيط صفحة قابل للضبط (بالمليمتر)."""
import io
import base64
from pathlib import Path

DEFAULT_LAYOUT = {
    "margin_side": 18,        # الهامش الجانبي
    "header_bottom": 42,      # نهاية الكليشة (خط الفصل) من الأعلى
    "ref_y": 52,              # سطر الرقم/التاريخ من الأعلى
    "start_y": 70,            # بداية المحتوى (إلى:) من الأعلى
    "gap_recipient": 3,       # بعد كتلة المرسَل إليه
    "recipient_indent": 0,    # 📍 إزاحة كتلة المرسَل إليه من الهامش (مم)
    "recipient_align": "right",  # right | center | left
    "recipient_font": 14,        # حجم خط سطر «إلى:»
    "recipient_sub_font": 13,    # حجم خط الصفة/الجهة
    "recipient_line_gap": 7,     # المسافة بين أسطر كتلة المرسَل إليه (مم)
    "recipient_suffix_gap": 0,   # مسافة إضافية بين الاسم و«المحترم» (مم)
    "greeting_align": "right",   # 🙏 موضع التحية: right | center | left
    "greeting_indent": 0,        # إزاحة التحية من الهامش (مم)
    "greeting_font": 13,
    "ref_layout": "num_left",    # 🔢 الرقم/التاريخ: num_left (رقم يسار، تاريخ يمين) | num_right | stack_right | stack_left
    "ref_x": 0,                  # إزاحة كتلة الرقم/التاريخ من الهامش (مم)
    "ref_font": 13,
    "header_font_ar1": 16,       # 🏛️ الكليشة: السطر الأول عربي (كبير)
    "header_font_ar2": 13,       # السطر الثاني عربي (أصغر)
    "header_font_en1": 12,       # السطر الأول إنجليزي
    "header_font_en2": 10,       # السطر الثاني إنجليزي
    "header_line1": 24,          # ارتفاع السطر الأول فوق خط الكليشة (مم)
    "header_line2": 16,          # ارتفاع السطر الثاني فوق خط الكليشة (مم)
    "signature_align": "left",   # left | center | right
    "signature_offset": 0,       # إزاحة كتلة التوقيع من الهامش (مم)
    "show_greeting": True,
    "gap_greeting": 10,       # بعد السلام
    "gap_subject": 11,        # بعد الموضوع
    "body_font": 13.5,
    "body_leading": 1.5,
    "gap_table_before": 4,
    "gap_table_after": 6,
    "table_font": 10.5,
    "table_row_h": 8,
    "table_columns": None,    # قائمة عناوين الأعمدة الظاهرة بترتيبها (None = الكل)
    "table_text_color": "",   # 🎨 لون نص الجدول ("" = يرث من تنسيق {جدول_الأسماء} أو أسود)
    "table_header_bg": "",    # لون خلفية رأس الجدول ("" = رمادي فاتح)
    "table_header_color": "", # لون نص رأس الجدول ("" = لون النص)
    "table_border_color": "", # لون إطار الجدول ("" = أسود)
    "show_closing": True,
    "gap_closing": 4,         # قبل الخاتمة
    "gap_signature": 16,      # بين الخاتمة والتوقيع
    "watermark": "",
}


def merge_layout(*parts) -> dict:
    out = dict(DEFAULT_LAYOUT)
    for p in parts:
        for k, v in (p or {}).items():
            if k in DEFAULT_LAYOUT and v is not None and v != "":
                out[k] = v
    return out


def filter_table(tbl: dict, columns) -> dict:
    """يُبقي الأعمدة المختارة بترتيبها: نص = عمود من بيانات النظام، {label, text} = عمود مخصص (فارغ أو نص ثابت).
    بلا تخصيص → الأعمدة الافتراضية (default_headers) فقط"""
    headers, rows = (tbl or {}).get("headers") or [], (tbl or {}).get("rows") or []
    if not headers:
        return tbl or {}
    if not columns:
        columns = (tbl or {}).get("default_headers") or headers
    out_h, picks = [], []
    for col in columns:
        if isinstance(col, dict):
            out_h.append(str(col.get("label") or "")); picks.append(("custom", str(col.get("text") or "")))
        elif col in headers:
            out_h.append(col); picks.append(("idx", headers.index(col)))
    if not out_h:
        return tbl
    return {**tbl, "headers": out_h, "rows": [[(r[p] if p < len(r) else "") if t == "idx" else p for t, p in picks] for r in rows]}


def build_letter_pdf(s: dict, settings: dict, draft: bool = False, letterhead: bool = True) -> bytes:
    """letterhead=False: طباعة على ورق مطبوع مسبقاً (بلا ترويسة ولا تذييل) مع الحفاظ على مواضع المحتوى"""
    import arabic_reshaper
    import qrcode
    from bidi.algorithm import get_display
    from hijridate import Gregorian
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas as pdfcanvas
    from services.rich_text_pdf import is_html, parse_rich, draw_rich, parse_color, placeholder_style
    from reportlab.lib import colors as rl_colors

    L = merge_layout(settings.get("layout"), s.get("layout"))
    f = lambda k: float(L[k])  # noqa: E731
    explicit_tf = any((p or {}).get("table_font") for p in (settings.get("layout"), s.get("layout")))

    def ar(t):
        return get_display(arabic_reshaper.reshape(str(t or "")))

    fonts = Path(__file__).parent.parent / "fonts"
    if "Amiri" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Amiri", str(fonts / "Amiri-Regular.ttf")))
    if (fonts / "Amiri-Bold.ttf").exists() and "Amiri-Bold" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Amiri-Bold", str(fonts / "Amiri-Bold.ttf")))
    BOLD = "Amiri-Bold" if "Amiri-Bold" in pdfmetrics.getRegisteredFontNames() else "Amiri"
    W, H = A4
    RM, LM = W - f("margin_side") * mm, f("margin_side") * mm
    BODY, TF, RH = f("body_font"), f("table_font"), f("table_row_h") * mm
    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=A4)

    def wrap(text: str, font: str, size: float, width: float):
        out = []
        for para in str(text or "").split("\n"):
            words, line = para.split(), ""
            for w in words:
                t = f"{line} {w}".strip()
                if pdfmetrics.stringWidth(ar(t), font, size) <= width:
                    line = t
                else:
                    out.append(line); line = w
            out.append(line)
        return out

    def _img(key):
        if not settings.get(key):
            return None
        try:
            return ImageReader(io.BytesIO(base64.b64decode(settings[key].split(",")[-1])))
        except Exception:
            return None

    def header():
        if not letterhead:
            return
        hb = f("header_bottom") * mm
        head_img = _img("header_image_base64")
        if head_img:
            # 🖼️ ترويسة جاهزة كصورة: تملأ عرض الصفحة من الأعلى حتى نهاية الكليشة
            c.drawImage(head_img, 0, H - hb, W, hb, mask="auto", preserveAspectRatio=True, anchor="n")
            return
        img = _img("logo_base64")
        if img is None:
            d = Path(__file__).parent.parent / "assets" / "university_logo.jpeg"
            if d.exists():
                img = ImageReader(str(d))
        logo = max(12 * mm, min(28 * mm, hb - 14 * mm))
        if img:
            c.drawImage(img, W / 2 - logo / 2, H - 10 * mm - logo, logo, logo, mask="auto", preserveAspectRatio=True)
        t1, t2 = H - hb + f("header_line1") * mm, H - hb + f("header_line2") * mm
        c.setFont("Amiri", f("header_font_ar1")); c.drawRightString(RM, t1, ar(settings.get("org_name") or "جامعة الأحقاف"))
        c.setFont("Amiri", f("header_font_ar2")); c.drawRightString(RM, t2, ar(settings.get("office_name", "")))
        c.setFont("Helvetica-Bold", f("header_font_en1")); c.drawString(LM, t1, settings.get("org_name_en") or "AL-AHGAFF UNIVERSITY")
        c.setFont("Helvetica", f("header_font_en2")); c.drawString(LM, t2, settings.get("office_name_en", "") or "")
        c.setLineWidth(1.3); c.line(LM, H - hb + 1 * mm, RM, H - hb + 1 * mm)
        c.setLineWidth(0.4); c.line(LM, H - hb - 0.4 * mm, RM, H - hb - 0.4 * mm)

    def footer():
        if not letterhead:
            return
        foot_img = _img("footer_image_base64")
        if foot_img:
            c.drawImage(foot_img, 0, 0, W, 24 * mm, mask="auto", preserveAspectRatio=True, anchor="s")
            return
        c.setLineWidth(0.6); c.line(LM, 22 * mm, RM, 22 * mm)
        c.setFont("Amiri", 9)
        parts = [settings.get("address")] + [f"{l}: {settings[k]}" for k, l in (("phones", "تلفون"), ("fax", "فاكس")) if settings.get(k)] + ([f"ص.ب ({settings['po_box']})"] if settings.get("po_box") else []) + [settings.get("website")]
        c.drawCentredString(W / 2, 16 * mm, ar(" — ".join(p for p in parts if p)))

    header()
    issued = (s.get("issued_at") or "")[:10]
    try:
        yy_, m, d = [int(x) for x in issued.split("-")]
        hj = Gregorian(yy_, m, d).to_hijri(); hijri = f"{hj.year}/{hj.month:02d}/{hj.day:02d}هـ"
    except Exception:
        hijri = ""
    ry = H - f("ref_y") * mm
    rf, rx, rl = f("ref_font"), f("ref_x") * mm, str(L.get("ref_layout") or "num_left")
    num_txt, d1, d2 = ar(f"الرقم : {s.get('number_display', '')}"), ar(f"التاريخ: {hijri}"), ar(f"الموافق: {issued.replace('-', '/')}م")
    c.setFillColorRGB(0.0, 0.5, 0.13)
    if rl == "num_right":       # الرقم يمين، التاريخ يسار
        c.setFont(BOLD, rf); c.drawRightString(RM - rx, ry, num_txt)
        c.setFont(BOLD, rf - 1.5); c.drawString(LM + rx, ry + 2 * mm, d1); c.drawString(LM + rx, ry - 5 * mm, d2)
    elif rl in ("stack_right", "stack_left"):   # الثلاثة متراصّة في جهة واحدة
        draw = (lambda yy, t: c.drawRightString(RM - rx, yy, t)) if rl == "stack_right" else (lambda yy, t: c.drawString(LM + rx, yy, t))
        c.setFont(BOLD, rf); draw(ry + 2 * mm, num_txt)
        c.setFont(BOLD, rf - 1.5); draw(ry - 4 * mm, d1); draw(ry - 10 * mm, d2)
    else:                       # الافتراضي: الرقم يسار، التاريخ يمين
        c.setFont(BOLD, rf); c.drawString(LM + rx, ry, num_txt)
        c.setFont(BOLD, rf - 1.5); c.drawRightString(RM - rx, ry + 2 * mm, d1); c.drawRightString(RM - rx, ry - 5 * mm, d2)
    c.setFillColorRGB(0, 0, 0)

    y = H - f("start_y") * mm
    rec = s.get("recipient") or {}
    r_align, r_ind = str(L.get("recipient_align") or "right"), f("recipient_indent") * mm

    rfont, rsub, rgap, sgap = f("recipient_font"), f("recipient_sub_font"), f("recipient_line_gap") * mm, f("recipient_suffix_gap") * mm

    def rec_line(text, sub=False, suffix=""):
        """سطر من كتلة المرسَل إليه؛ suffix («المحترم») يُرسم منفصلاً بمسافة إضافية عن الاسم"""
        fnt, size = ("Amiri", rsub) if sub else (BOLD, rfont)
        c.setFont(fnt, size)
        main, sfx = ar(text), ar(suffix) if suffix else ""
        w_main = pdfmetrics.stringWidth(main, fnt, size)
        w_sfx = pdfmetrics.stringWidth(sfx, fnt, size) if sfx else 0
        total = w_main + ((pdfmetrics.stringWidth(" ", fnt, size) + sgap + w_sfx) if sfx else 0)
        if r_align == "center":
            right = W / 2 + total / 2
        elif r_align == "left":
            right = LM + r_ind + (10 * mm if sub else 0) + total
        else:
            right = RM - r_ind - (10 * mm if sub else 0)
        c.drawRightString(right, y, main)
        if sfx:
            c.drawRightString(right - w_main - pdfmetrics.stringWidth(" ", fnt, size) - sgap, y, sfx)
    rec_line(f"إلى: {rec.get('name') or rec.get('title') or ''}", suffix=rec.get("suffix") or ""); y -= rgap + 0.5 * mm
    if rec.get("name") and rec.get("title"):
        rec_line(rec["title"], sub=True); y -= rgap
    if rec.get("organization") and rec.get("organization") != rec.get("title"):
        rec_line(rec["organization"], sub=True); y -= rgap
    y -= f("gap_recipient") * mm
    if L.get("show_greeting"):
        g_al, g_in = str(L.get("greeting_align") or "right"), f("greeting_indent") * mm
        c.setFont("Amiri", f("greeting_font")); g_txt = ar("السلام عليكم ورحمة الله وبركاته،")
        if g_al == "center":
            c.drawCentredString(W / 2, y, g_txt)
        elif g_al == "left":
            c.drawString(LM + g_in, y, g_txt)
        else:
            c.drawRightString(RM - g_in, y, g_txt)
        y -= f("gap_greeting") * mm
    c.setFont(BOLD, 14)
    c.drawCentredString(W / 2, y, ar(f"الموضوع: {s.get('subject', '')}"))
    sw = pdfmetrics.stringWidth(ar(f"الموضوع: {s.get('subject', '')}"), BOLD, 14)
    c.setLineWidth(0.7); c.line(W / 2 - sw / 2, y - 1.6 * mm, W / 2 + sw / 2, y - 1.6 * mm); y -= f("gap_subject") * mm

    def ensure(space):
        nonlocal y
        if y - space < 60 * mm:
            footer(); c.showPage(); header(); y = H - (f("header_bottom") + 13) * mm

    def draw_table(tbl, inherit=None):
        nonlocal y
        tbl = filter_table(tbl, L.get("table_columns"))
        headers, rows = tbl.get("headers") or [], tbl.get("rows") or []
        if not headers or not rows:
            return
        inh = inherit or {}
        # 🎨 الأولوية: إعدادات الجدول الصريحة > تنسيق متغير {جدول_الأسماء} في المحرر > الافتراضي
        tf = TF if explicit_tf or not inh.get("size") else min(float(inh["size"]), 16)
        rh = RH if explicit_tf or not inh.get("size") else max(RH, tf * 2.1)
        text_col = parse_color(L.get("table_text_color")) or parse_color(inh.get("color")) or rl_colors.black
        head_bg = parse_color(L.get("table_header_bg")) or rl_colors.Color(0.93, 0.95, 0.98)
        head_col = parse_color(L.get("table_header_color")) or text_col
        border_col = parse_color(L.get("table_border_color")) or rl_colors.black
        all_bold = bool(inh.get("bold"))
        n = len(headers)
        total = RM - LM
        has_idx = headers[0] == "م"
        # عرض الأعمدة حسب المحتوى الفعلي (بحد أدنى وأقصى) ثم يُضبط على عرض الصفحة
        def nat(i):
            w = pdfmetrics.stringWidth(ar(headers[i]), BOLD, tf)
            for r in rows:
                w = max(w, pdfmetrics.stringWidth(ar(str(r[i] if i < len(r) else "")), "Amiri", tf))
            return min(max(w + 4 * mm, 14 * mm), 75 * mm)
        widths = [(10 * mm if has_idx and i == 0 else nat(i)) for i in range(n)]
        flex = [i for i in range(n) if not (has_idx and i == 0)]
        cur = sum(widths)
        if flex and abs(cur - total) > 0.1:
            k = (total - (10 * mm if has_idx else 0)) / max(1e-6, sum(widths[i] for i in flex))
            for i in flex:
                widths[i] *= k

        def row(cells, bold=False, fill=False):
            nonlocal y
            ensure(rh)
            x = RM
            c.setStrokeColor(border_col)
            if fill:
                c.setFillColor(head_bg); c.rect(LM, y - rh, total, rh, fill=1, stroke=0)
            fnt = BOLD if (bold or all_bold) else "Amiri"
            c.setFont(fnt, tf)
            c.setFillColor(head_col if fill else text_col)
            for i, cell in enumerate(cells):
                c.rect(x - widths[i], y - rh, widths[i], rh, fill=0, stroke=1)
                txt = str(cell or "")
                while pdfmetrics.stringWidth(ar(txt), fnt, tf) > widths[i] - 3 * mm and len(txt) > 3:
                    txt = txt[:-2]
                c.drawCentredString(x - widths[i] / 2, y - rh + (rh - tf * 0.72) / 2, ar(txt))
                x -= widths[i]
            y -= rh
        c.setLineWidth(0.5)
        row(headers, bold=True, fill=True)
        for r in rows:
            row(r)
        c.setFillColor(rl_colors.black); c.setStrokeColor(rl_colors.black)

    def ensure_y(space):
        nonlocal y
        before = y
        ensure(space)
        return y if y != before else None

    c.setFont("Amiri", BODY)
    body = s.get("body") or ""
    parts = body.split("{جدول_الأسماء}")
    rich = is_html(body)
    has_table = bool((s.get("table") or {}).get("rows"))
    tbl_inherit = placeholder_style(body, "{جدول_الأسماء}") if rich else None
    for pi, part in enumerate(parts):
        if rich:
            y = draw_rich(c, parse_rich(part, default_size=BODY, default_font="amiri", default_align="right"), LM, RM, y, leading=f("body_leading"), para_gap=3, ensure=ensure_y)
        else:
            for line in wrap(part.strip("\n"), "Amiri", BODY, RM - LM):
                ensure(BODY * f("body_leading"))
                c.setFont("Amiri", BODY); c.drawRightString(RM, y, ar(line)); y -= BODY * f("body_leading")
        if pi < len(parts) - 1 and has_table:
            y -= f("gap_table_before") * mm; draw_table(s["table"], tbl_inherit); y -= f("gap_table_after") * mm
    if "{جدول_الأسماء}" not in body and has_table and s.get("auto_table", True):
        y -= f("gap_table_before") * mm; draw_table(s["table"]); y -= f("gap_table_after") * mm
    y -= f("gap_closing") * mm
    ensure(45 * mm)
    if L.get("show_closing"):
        c.setFont("Amiri", BODY); c.drawRightString(RM, y, ar(settings.get("closing") or "وتفضلوا بقبول فائق الاحترام والتقدير،"))
    y -= f("gap_signature") * mm

    sig_title = (s.get("signatory_title") or "").strip()
    sig_name = (s.get("signatory_name") or "").strip()
    sig_img = _img("signature_base64")
    s_align, s_off = str(L.get("signature_align") or "left"), f("signature_offset") * mm
    sig_cx = (W / 2) if s_align == "center" else (RM - s_off - 22 * mm) if s_align == "right" else (LM + s_off + 22 * mm)
    c.setFont(BOLD, 13); c.drawCentredString(sig_cx, y, ar(sig_title))
    name_y = y - 9 * mm
    if sig_img:
        c.drawImage(sig_img, sig_cx - 19 * mm, y - 20 * mm, 38 * mm, 15 * mm, mask="auto", preserveAspectRatio=True); name_y = y - 25 * mm
    c.setFont("Amiri", 13); c.drawCentredString(sig_cx, name_y, ar(sig_name))

    qr = qrcode.make(s.get("verify_url") or s.get("verify_token", "") or "DRAFT", box_size=4, border=1)
    qb = io.BytesIO(); qr.save(qb, format="PNG"); qb.seek(0)
    c.drawImage(ImageReader(qb), W - 48 * mm, 30 * mm, 26 * mm, 26 * mm)
    c.setFont("Helvetica", 8); c.drawCentredString(W - 35 * mm, 26 * mm, "Scan to verify")
    if draft:
        c.saveState()
        c.setFillColorRGB(0.85, 0.15, 0.15, alpha=0.13)
        c.setFont(BOLD, 72)
        c.translate(W / 2, H / 2); c.rotate(35)
        c.drawCentredString(0, 0, ar(L.get("watermark") or "مسوَّدة — غير صادر"))
        c.restoreState()
    footer()
    c.showPage(); c.save()
    return buf.getvalue()
