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
    """يرجع الـPDF كما هو إن كان صفحة واحدة؛ وإلا يضيف لكل صفحة: الرقم «n/N» + «يُتبع…» ضمن شريط الذيل نفسه (أسفله مباشرة،
    لا فوقه بفراغ منفصل)، و«تابع الخطاب رقم … — بتاريخ …» تحت الكليشة (من الصفحة 2)، وQR مصغّر 11مم أسفل يمين الذيل يتكرر في كل صفحة."""
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
        c.setFillColorRGB(0.42, 0.45, 0.5)
        c.setFont("Amiri-Bold", 7.5); c.drawString(margin_mm * mm, footer_y_mm * mm, f"{i + 1}/{n}")
        if continuation and i > 0:
            c.setFont("Amiri", 8.5)
            c.drawRightString(W - margin_mm * mm, H - header_y_mm * mm, _ar(f"تابع الخطاب رقم {ref}" + (f" — بتاريخ {date}" if date else "")))
        if i < n - 1:
            c.setFont("Amiri", 7); c.drawString(margin_mm * mm + 20, footer_y_mm * mm, _ar("— يُتبع…"))
        if qr_img is not None and not (skip_qr_on_last and i == n - 1):
            qsz = 9 * mm
            c.drawImage(qr_img, W - margin_mm * mm - qsz, footer_y_mm * mm - 1, qsz, qsz)
            c.setFont("Helvetica", 5.5); c.drawRightString(W - margin_mm * mm - qsz - 1.5 * mm, footer_y_mm * mm + qsz / 2 - 2, "Scan to verify")
        c.showPage(); c.save(); ob.seek(0)
        page.merge_page(PdfReader(ob).pages[0])
        writer.add_page(page)
    out = io.BytesIO(); writer.write(out)
    return out.getvalue()
