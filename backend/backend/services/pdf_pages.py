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


def decorate_multipage(pdf: bytes, *, ref: str = "", date: str = "", verify: str = "", mini_qr: bool = True, continuation: bool = True,
                       header_y_mm: float = 48, footer_y_mm: float = 24.5, margin_mm: float = 20, skip_qr_on_last: bool = True) -> bytes:
    """يرجع الـPDF كما هو إن كان صفحة واحدة؛ وإلا يضيف لكل صفحة: الرقم «n/N» أسفل الوسط، و«تابع الخطاب رقم … — بتاريخ …» تحت الكليشة
    (من الصفحة 2)، و«يُتبع…» في ذيل الصفحات غير الأخيرة، وQR مصغّر 12مم مع رقم الخطاب أسفل اليسار (يُحذف من الأخيرة إن كان فيها QR كبير)."""
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
        c.setFont("Amiri-Bold", 9.5); c.drawCentredString(W / 2, footer_y_mm * mm, f"{i + 1}/{n}")
        if continuation and i > 0:
            c.setFont("Amiri", 8.5)
            c.drawRightString(W - margin_mm * mm, H - header_y_mm * mm, _ar(f"تابع الخطاب رقم {ref}" + (f" — بتاريخ {date}" if date else "")))
        if i < n - 1:
            c.setFont("Amiri", 8.5); c.drawRightString(W - margin_mm * mm, footer_y_mm * mm, _ar("يُتبع…"))
        if qr_img is not None and not (skip_qr_on_last and i == n - 1):
            c.drawImage(qr_img, margin_mm * mm, (footer_y_mm + 1) * mm, 12 * mm, 12 * mm)
            c.setFont("Amiri", 7.5); c.drawString((margin_mm + 13) * mm, (footer_y_mm + 5) * mm, _ar(f"رقم {ref}") if ref else "")
        c.showPage(); c.save(); ob.seek(0)
        page.merge_page(PdfReader(ob).pages[0])
        writer.add_page(page)
    out = io.BytesIO(); writer.write(out)
    return out.getvalue()
