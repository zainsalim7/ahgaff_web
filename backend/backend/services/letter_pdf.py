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
    """يُبقي الأعمدة المختارة فقط وبترتيبها"""
    headers, rows = (tbl or {}).get("headers") or [], (tbl or {}).get("rows") or []
    if not columns or not headers:
        return tbl or {}
    idx = [headers.index(cname) for cname in columns if cname in headers]
    if not idx:
        return tbl
    return {**tbl, "headers": [headers[i] for i in idx], "rows": [[r[i] if i < len(r) else "" for i in idx] for r in rows]}


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
        t1, t2 = H - hb + 24 * mm, H - hb + 16 * mm
        c.setFont("Amiri", 16); c.drawRightString(RM, t1, ar(settings.get("org_name") or "جامعة الأحقاف"))
        c.setFont("Amiri", 13); c.drawRightString(RM, t2, ar(settings.get("office_name", "")))
        c.setFont("Helvetica-Bold", 12); c.drawString(LM, t1, "AL-AHGAFF UNIVERSITY")
        c.setFont("Helvetica", 10); c.drawString(LM, t2, settings.get("office_name_en", "") or "")
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
    c.setFillColorRGB(0.0, 0.5, 0.13)
    c.setFont(BOLD, 13); c.drawString(LM, ry, ar(f"الرقم : {s.get('number_display', '')}"))
    c.setFont(BOLD, 11.5); c.drawRightString(RM, ry + 2 * mm, ar(f"التاريخ: {hijri}")); c.drawRightString(RM, ry - 5 * mm, ar(f"الموافق: {issued.replace('-', '/')}م"))
    c.setFillColorRGB(0, 0, 0)

    y = H - f("start_y") * mm
    rec = s.get("recipient") or {}
    c.setFont(BOLD, 14)
    first = " ".join(x for x in [rec.get("name") or rec.get("title"), rec.get("suffix") or ""] if x)
    c.drawRightString(RM, y, ar(f"إلى: {first}")); y -= 7.5 * mm
    c.setFont("Amiri", 13)
    if rec.get("name") and rec.get("title"):
        c.drawRightString(RM - 10 * mm, y, ar(rec["title"])); y -= 7 * mm
    if rec.get("organization") and rec.get("organization") != rec.get("title"):
        c.drawRightString(RM - 10 * mm, y, ar(rec["organization"])); y -= 7 * mm
    y -= f("gap_recipient") * mm
    if L.get("show_greeting"):
        c.drawRightString(RM, y, ar("السلام عليكم ورحمة الله وبركاته،")); y -= f("gap_greeting") * mm
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
        widths = [10 * mm] * has_idx + [(total - (10 * mm if has_idx else 0)) / max(1, n - has_idx)] * (n - has_idx)
        name_i = headers.index("الاسم") if "الاسم" in headers else -1
        if name_i >= 0 and n - has_idx >= 2:
            rest_n = n - has_idx - 1
            widths[name_i] = widths[name_i] * 1.6
            rest = total - (10 * mm if has_idx else 0) - widths[name_i]
            for i in range(n):
                if i != name_i and not (has_idx and i == 0):
                    widths[i] = rest / rest_n

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
    if "{جدول_الأسماء}" not in body and has_table:
        y -= f("gap_table_before") * mm; draw_table(s["table"]); y -= f("gap_table_after") * mm
    y -= f("gap_closing") * mm
    ensure(45 * mm)
    if L.get("show_closing"):
        c.setFont("Amiri", BODY); c.drawRightString(RM, y, ar(settings.get("closing") or "وتفضلوا بقبول فائق الاحترام والتقدير،"))
    y -= f("gap_signature") * mm

    sig_title = (s.get("signatory_title") or "").strip()
    sig_name = (s.get("signatory_name") or "").strip()
    sig_img = _img("signature_base64")
    c.setFont(BOLD, 13); c.drawString(30 * mm, y, ar(sig_title))
    name_y = y - 9 * mm
    if sig_img:
        c.drawImage(sig_img, 20 * mm, y - 20 * mm, 38 * mm, 15 * mm, mask="auto", preserveAspectRatio=True); name_y = y - 25 * mm
    c.setFont("Amiri", 13); c.drawString(24 * mm, name_y, ar(sig_name))

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
