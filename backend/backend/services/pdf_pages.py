"""📑 تزيين الخطابات متعددة الصفحات بعد التوليد: ترقيم «1/3»، سطر «تابع الخطاب…»، «يُتبع…»، وQR مصغّر في كل صفحة — لا شيء يُضاف إذا كان الخطاب صفحة واحدة"""
import io
from pathlib import Path


def _fonts():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    fonts = Path(__file__).resolve().parent.parent / "fonts"
    if "Amiri" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Amiri", str(fonts / "Amiri-Regular.ttf")))
    if "Amiri-Bold" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Amiri-Bold", str(fonts / "Amiri-Bold.ttf")))


def _ar(t) -> str:
    import arabic_reshaper
    from bidi.algorithm import get_display
    return get_display(arabic_reshaper.reshape(str(t or "")))


def number_pages(pdf: bytes, title: str = "", footer_y_mm: float = 5.5, margin_mm: float = 12, only_multi: bool = True) -> bytes:
    """للتقارير والكشوف: «n/N» أسفل الوسط + عنوان مختصر يمين الذيل، فقط إن زادت الصفحات عن 1 (افتراضياً)"""
    from pypdf import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import mm

    reader = PdfReader(io.BytesIO(pdf))
    n = len(reader.pages)
    if n <= 1 and only_multi:
        return pdf
    _fonts()
    writer = PdfWriter()
    for i, page in enumerate(reader.pages):
        W, H = float(page.mediabox.width), float(page.mediabox.height)
        ob = io.BytesIO(); c = canvas.Canvas(ob, pagesize=(W, H))
        c.setFillColorRGB(0.42, 0.45, 0.5)
        c.setFont("Amiri-Bold", 9); c.drawCentredString(W / 2, footer_y_mm * mm, f"{i + 1}/{n}")
        if title:
            c.setFont("Amiri", 8); c.drawRightString(W - margin_mm * mm, footer_y_mm * mm, _ar(title))
        if i < n - 1:
            c.setFont("Amiri", 8); c.drawString(margin_mm * mm, footer_y_mm * mm, _ar("يُتبع…"))
        c.showPage(); c.save(); ob.seek(0)
        page.merge_page(PdfReader(ob).pages[0])
        writer.add_page(page)
    out = io.BytesIO(); writer.write(out)
    return out.getvalue()


def number_pages_buf(buf: io.BytesIO, title: str = "", **kw) -> io.BytesIO:
    out = io.BytesIO(number_pages(buf.getvalue(), title, **kw)); out.seek(0)
    return out


def decorate_multipage(pdf: bytes, *, ref: str = "", date: str = "", verify: str = "", mini_qr: bool = True, continuation: bool = True,
                       header_y_mm: float = 48, footer_y_mm: float = 3, margin_mm: float = 20, skip_qr_on_last: bool = False) -> bytes:
    """يرجع الـPDF كما هو إن كان صفحة واحدة؛ وإلا يضيف لكل صفحة: «تابع الخطاب رقم … — بتاريخ …» تحت الكليشة مباشرة (من
    الصفحة 2)، وشارة أنيقة صغيرة داخل شريط التذييل نفسه أمام صوره/معلوماته مباشرة (أسفل يسار الصفحة، 7-16مم من الأسفل
    تقريباً): رقم الصفحة «صفحة n من N» + QR مصغّر للتحقق + «يُتبع…» إن لم تكن الأخيرة. بإخفاء هذه الشارة (mini_qr/continuation
    معطّلين أو خطاب بصفحة واحدة) يظهر شريط التذييل كاملاً دون أي إضافة. المتن لا يحتاج حيّزاً إضافياً لأجلها فيبقى قريباً
    من التذييل كالمعتاد (`BOTTOM_SAFE`)."""
    from pypdf import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader

    reader = PdfReader(io.BytesIO(pdf))
    n = len(reader.pages)
    if n <= 1:
        return pdf
    _fonts()
    qr_img = None
    if mini_qr and verify:
        import qrcode
        q = qrcode.make(verify, box_size=3, border=1)
        qb = io.BytesIO(); q.save(qb, format="PNG"); qb.seek(0); qr_img = ImageReader(qb)
    writer = PdfWriter()
    for i, page in enumerate(reader.pages):
        W, H = float(page.mediabox.width), float(page.mediabox.height)
        ob = io.BytesIO(); c = canvas.Canvas(ob, pagesize=(W, H))
        if continuation and i > 0:
            c.setFillColorRGB(0.42, 0.45, 0.5); c.setFont("Amiri", 8.5)
            c.drawRightString(W - margin_mm * mm, H - header_y_mm * mm, _ar(f"تابع الخطاب رقم {ref}" + (f" — بتاريخ {date}" if date else "")))
        show_qr = qr_img is not None and not (skip_qr_on_last and i == n - 1)
        qsz = 6.5 * mm
        chip_h, chip_w = 9 * mm, (32 * mm if show_qr else 22 * mm)
        cx1, cy1 = margin_mm * mm, 6 * mm  # 🆕 يسار الصفحة، أمام شريط/صورة التذييل مباشرة (بناءً على طلب المستخدم)
        c.saveState()
        c.setFillColorRGB(0.93, 0.97, 0.93); c.setStrokeColorRGB(0.0, 0.5, 0.13); c.setLineWidth(0.6)
        c.roundRect(cx1, cy1, chip_w, chip_h, 1.6 * mm, fill=1, stroke=1)
        text_right = cx1 + chip_w - 2.2 * mm
        if show_qr:
            c.drawImage(qr_img, cx1 + 1.6 * mm, cy1 + (chip_h - qsz) / 2, qsz, qsz)
        c.setFillColorRGB(0.0, 0.5, 0.13); c.setFont("Amiri-Bold", 7.5)
        c.drawRightString(text_right, cy1 + chip_h / 2 + 1, _ar(f"صفحة {i + 1} من {n}"))
        c.setFillColorRGB(0.5, 0.52, 0.55); c.setFont("Amiri", 5.5)
        c.drawRightString(text_right, cy1 + 1.8 * mm, _ar("يُتبع…") if i < n - 1 else _ar("التحقق من الأصالة") if show_qr else "")
        c.restoreState()
        c.showPage(); c.save(); ob.seek(0)
        page.merge_page(PdfReader(ob).pages[0])
        writer.add_page(page)
    out = io.BytesIO(); writer.write(out)
    return out.getvalue()
