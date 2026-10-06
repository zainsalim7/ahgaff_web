"""مولّد PDF للخطابات الرسمية البسيطة (ReportLab + تشكيل عربي) — نفس كليشة الإفادات مع متن حر وجدول أسماء اختياري."""
import io
import base64
from pathlib import Path


def build_letter_pdf(s: dict, settings: dict, draft: bool = False) -> bytes:
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

    def ar(t):
        return get_display(arabic_reshaper.reshape(str(t or "")))

    fonts = Path(__file__).parent.parent / "fonts"
    if "Amiri" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Amiri", str(fonts / "Amiri-Regular.ttf")))
    if (fonts / "Amiri-Bold.ttf").exists() and "Amiri-Bold" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Amiri-Bold", str(fonts / "Amiri-Bold.ttf")))
    BOLD = "Amiri-Bold" if "Amiri-Bold" in pdfmetrics.getRegisteredFontNames() else "Amiri"
    W, H = A4
    RM, LM = W - 18 * mm, 18 * mm
    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=A4)

    def wrap(text: str, font: str, size: int, width: float):
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

    def header():
        img = None
        if settings.get("logo_base64"):
            try:
                img = ImageReader(io.BytesIO(base64.b64decode(settings["logo_base64"].split(",")[-1])))
            except Exception:
                img = None
        if img is None:
            d = Path(__file__).parent.parent / "assets" / "university_logo.jpeg"
            if d.exists():
                img = ImageReader(str(d))
        if img:
            c.drawImage(img, W / 2 - 14 * mm, H - 38 * mm, 28 * mm, 28 * mm, mask="auto", preserveAspectRatio=True)
        c.setFont("Amiri", 16); c.drawRightString(RM, H - 18 * mm, ar(settings.get("org_name") or "جامعة الأحقاف"))
        c.setFont("Amiri", 13); c.drawRightString(RM, H - 26 * mm, ar(settings.get("office_name", "")))
        c.setFont("Helvetica-Bold", 12); c.drawString(LM, H - 18 * mm, "AL-AHGAFF UNIVERSITY")
        c.setFont("Helvetica", 10); c.drawString(LM, H - 26 * mm, settings.get("office_name_en", "") or "")
        c.setLineWidth(1.3); c.line(LM, H - 41 * mm, RM, H - 41 * mm)
        c.setLineWidth(0.4); c.line(LM, H - 42.4 * mm, RM, H - 42.4 * mm)

    def footer():
        c.setLineWidth(0.6); c.line(LM, 22 * mm, RM, 22 * mm)
        c.setFont("Amiri", 9)
        parts = [settings.get("address")] + [f"{l}: {settings[k]}" for k, l in (("phones", "تلفون"), ("fax", "فاكس")) if settings.get(k)] + ([f"ص.ب ({settings['po_box']})"] if settings.get("po_box") else []) + [settings.get("website")]
        c.drawCentredString(W / 2, 16 * mm, ar(" — ".join(p for p in parts if p)))

    header()
    issued = (s.get("issued_at") or "")[:10]
    try:
        y, m, d = [int(x) for x in issued.split("-")]
        hj = Gregorian(y, m, d).to_hijri(); hijri = f"{hj.year}/{hj.month:02d}/{hj.day:02d}هـ"
    except Exception:
        hijri = ""
    c.setFillColorRGB(0.0, 0.5, 0.13)
    c.setFont(BOLD, 13); c.drawString(LM, H - 52 * mm, ar(f"الرقم : {s.get('number_display', '')}"))
    c.setFont(BOLD, 11.5); c.drawRightString(RM, H - 50 * mm, ar(f"التاريخ: {hijri}")); c.drawRightString(RM, H - 57 * mm, ar(f"الموافق: {issued.replace('-', '/')}م"))
    c.setFillColorRGB(0, 0, 0)

    y = H - 70 * mm
    rec = s.get("recipient") or {}
    c.setFont(BOLD, 14)
    first = " ".join(x for x in [rec.get("name") or rec.get("title"), rec.get("suffix") or ""] if x)
    c.drawRightString(RM, y, ar(f"إلى: {first}")); y -= 7.5 * mm
    c.setFont("Amiri", 13)
    if rec.get("name") and rec.get("title"):
        c.drawRightString(RM - 10 * mm, y, ar(rec["title"])); y -= 7 * mm
    if rec.get("organization") and rec.get("organization") != rec.get("title"):
        c.drawRightString(RM - 10 * mm, y, ar(rec["organization"])); y -= 7 * mm
    y -= 3 * mm
    c.drawRightString(RM, y, ar("السلام عليكم ورحمة الله وبركاته،")); y -= 10 * mm
    c.setFont(BOLD, 14)
    c.drawCentredString(W / 2, y, ar(f"الموضوع: {s.get('subject', '')}"))
    sw = pdfmetrics.stringWidth(ar(f"الموضوع: {s.get('subject', '')}"), BOLD, 14)
    c.setLineWidth(0.7); c.line(W / 2 - sw / 2, y - 1.6 * mm, W / 2 + sw / 2, y - 1.6 * mm); y -= 11 * mm

    def ensure(space):
        nonlocal y
        if y - space < 60 * mm:
            footer(); c.showPage(); header(); y = H - 55 * mm

    def draw_table(tbl):
        nonlocal y
        headers, rows = tbl.get("headers") or [], tbl.get("rows") or []
        if not headers or not rows:
            return
        n = len(headers)
        widths = [10 * mm] + [((RM - LM) - 10 * mm) / (n - 1)] * (n - 1) if n > 1 else [RM - LM]
        if n >= 3:
            widths[1] = widths[1] * 1.6; rest = (RM - LM) - 10 * mm - widths[1]
            for i in range(2, n):
                widths[i] = rest / (n - 2)
        rh = 8 * mm

        def row(cells, bold=False, fill=False):
            nonlocal y
            ensure(rh)
            x = RM
            if fill:
                c.setFillColorRGB(0.93, 0.95, 0.98); c.rect(LM, y - rh, RM - LM, rh, fill=1, stroke=0); c.setFillColorRGB(0, 0, 0)
            c.setFont(BOLD if bold else "Amiri", 10.5)
            for i, cell in enumerate(cells):
                c.rect(x - widths[i], y - rh, widths[i], rh, fill=0, stroke=1)
                txt = str(cell or "")
                while pdfmetrics.stringWidth(ar(txt), "Amiri", 10.5) > widths[i] - 3 * mm and len(txt) > 3:
                    txt = txt[:-2]
                c.drawCentredString(x - widths[i] / 2, y - rh + 2.6 * mm, ar(txt))
                x -= widths[i]
            y -= rh
        c.setLineWidth(0.5)
        row(headers, bold=True, fill=True)
        for r in rows:
            row(r)
        y -= 9 * mm

    c.setFont("Amiri", 13.5)
    body = s.get("body") or ""
    parts = body.split("{جدول_الأسماء}")
    from services.rich_text_pdf import is_html, parse_rich, draw_rich
    rich = is_html(body)

    def ensure_y(space):
        nonlocal y
        before = y
        ensure(space)
        return y if y != before else None

    for pi, part in enumerate(parts):
        if rich:
            y = draw_rich(c, parse_rich(part, default_size=13.5, default_font="amiri", default_align="right"), LM, RM, y, leading=1.5, para_gap=3, ensure=ensure_y)
        else:
            for line in wrap(part.strip("\n"), "Amiri", 13.5, RM - LM):
                ensure(7.5 * mm)
                c.setFont("Amiri", 13.5); c.drawRightString(RM, y, ar(line)); y -= 7.5 * mm
        if pi < len(parts) - 1:
            y -= 4 * mm; draw_table(s.get("table") or {}); c.setFont("Amiri", 13.5)
    if "{جدول_الأسماء}" not in body and (s.get("table") or {}).get("rows"):
        y -= 2 * mm; draw_table(s["table"])
    y -= 4 * mm
    ensure(50 * mm)
    c.setFont("Amiri", 13.5); c.drawRightString(RM, y, ar(settings.get("closing") or "وتفضلوا بقبول فائق الاحترام والتقدير،")); y -= 16 * mm

    sig_title = (s.get("signatory_title") or "").strip()
    sig_name = (s.get("signatory_name") or "").strip()
    sig_img = None
    if settings.get("signature_base64"):
        try:
            sig_img = ImageReader(io.BytesIO(base64.b64decode(settings["signature_base64"].split(",")[-1])))
        except Exception:
            sig_img = None
    c.setFont(BOLD, 13); c.drawString(30 * mm, y, ar(sig_title))
    name_y = y - 9 * mm
    if sig_img:
        c.drawImage(sig_img, 20 * mm, y - 20 * mm, 38 * mm, 15 * mm, mask="auto", preserveAspectRatio=True); name_y = y - 25 * mm
    c.setFont("Amiri", 13); c.drawString(24 * mm, name_y, ar(sig_name))

    qr = qrcode.make(s.get("verify_url") or s.get("verify_token", ""), box_size=4, border=1)
    qb = io.BytesIO(); qr.save(qb, format="PNG"); qb.seek(0)
    c.drawImage(ImageReader(qb), W - 48 * mm, 30 * mm, 26 * mm, 26 * mm)
    c.setFont("Helvetica", 8); c.drawCentredString(W - 35 * mm, 26 * mm, "Scan to verify")
    if draft:
        c.saveState()
        c.setFillColorRGB(0.85, 0.15, 0.15, alpha=0.13)
        c.setFont(BOLD, 72)
        c.translate(W / 2, H / 2); c.rotate(35)
        c.drawCentredString(0, 0, ar("معاينة — غير صادر"))
        c.restoreState()
    footer()
    c.showPage(); c.save()
    return buf.getvalue()
