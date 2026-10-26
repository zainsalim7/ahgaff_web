"""تحويل HTML بسيط (من محرر النصوص) إلى أسطر مرسومة على canvas ReportLab مع دعم العربية (خط/حجم/عريض/تسطير/لون/محاذاة)"""
import os
import re
import unicodedata
from html.parser import HTMLParser
from typing import List, Optional

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONTS = {
    "amiri": ("Amiri-Regular.ttf", "Amiri-Bold.ttf", "أميري (نسخي رسمي)", "Amiri"),
    "kufi": ("NotoKufiArabic-Regular.ttf", "NotoKufiArabic-Bold.ttf", "نوتو كوفي", "Noto Kufi Arabic"),
    "cairo": ("Cairo-Regular.ttf", "Cairo-Bold.ttf", "القاهرة", "Cairo"),
    "tajawal": ("Tajawal-Regular.ttf", "Tajawal-Bold.ttf", "تجوّل", "Tajawal"),
    "almarai": ("Almarai-Regular.ttf", "Almarai-Bold.ttf", "المرعي", "Almarai"),
}
_ALIASES = {v[3].lower(): k for k, v in FONTS.items()}
_ALIASES.update({"kufi": "kufi", "noto kufi": "kufi"})
_HTML_RE = re.compile(r"</?(p|div|br|span|b|strong|i|em|u|h[1-6]|font|li|ul|ol|table|tr|td|th)\b", re.I)
_here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_registered: set = set()


def is_html(text: str) -> bool:
    return bool(text) and bool(_HTML_RE.search(text))


def font_list() -> list:
    return [{"key": k, "label": v[2], "family": v[3]} for k, v in FONTS.items()]


def font_name(key: str, bold: bool = False) -> str:
    reg, bld, _, _ = FONTS.get(key, FONTS["amiri"])
    fn = bld if bold else reg
    name = f"R-{fn}"
    if name not in _registered:
        try:
            pdfmetrics.registerFont(TTFont(name, os.path.join(_here, "fonts", fn)))
            _registered.add(name)
        except Exception:
            return "Helvetica-Bold" if bold else "Helvetica"
    return name


def _family_key(css_family: str) -> Optional[str]:
    first = (css_family or "").split(",")[0].strip().strip("'\"").lower()
    return _ALIASES.get(first)


def _style_dict(style: str) -> dict:
    out = {}
    for part in (style or "").split(";"):
        if ":" in part:
            k, v = part.split(":", 1)
            out[k.strip().lower()] = v.strip()
    return out


def _px_to_pt(v: str) -> Optional[float]:
    m = re.match(r"([\d.]+)\s*(px|pt|em|rem)?", v or "")
    if not m:
        return None
    n, unit = float(m.group(1)), (m.group(2) or "px")
    return n * 0.75 if unit == "px" else n * 12 if unit in ("em", "rem") else n


class _Parser(HTMLParser):
    BLOCK = {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr"}

    def __init__(self, default_size: float, default_font: str, default_align: str):
        super().__init__(convert_charrefs=True)
        self.base = {"size": default_size, "font": default_font, "bold": False, "underline": False, "color": None}
        self.stack = [dict(self.base)]
        self.default_align = default_align
        self.paras: List[dict] = []
        self.cur: Optional[dict] = None
        self.table_ctx: List[dict] = []  # 🆕 جدول حر يُدرجه المستخدم يدوياً (بلا تداخل)

    def _open(self, align=None):
        self.cur = {"align": align or self.default_align, "runs": []}

    def _close(self):
        if self.cur is not None:
            self.paras.append(self.cur)
            self.cur = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        st = _style_dict(a.get("style", ""))
        s = dict(self.stack[-1])
        if tag in ("b", "strong") or tag.startswith("h") and tag[1:].isdigit():
            s["bold"] = True
        if tag == "u":
            s["underline"] = True
        if "font-weight" in st and st["font-weight"] in ("bold", "700", "800", "900"):
            s["bold"] = True
        if "text-decoration" in st and "underline" in st["text-decoration"]:
            s["underline"] = True
        if "font-size" in st:
            pt = _px_to_pt(st["font-size"])
            if pt:
                s["size"] = pt
        if tag.startswith("h") and tag[1:].isdigit():
            s["size"] = {"1": 22, "2": 19, "3": 17}.get(tag[1], s["size"])
        fam = _family_key(st.get("font-family") or a.get("face") or "")
        if fam:
            s["font"] = fam
        if "color" in st:
            s["color"] = st["color"]
        if tag == "font":
            if a.get("size"):
                s["size"] = {"1": 8, "2": 10, "3": 12, "4": 14, "5": 18, "6": 24, "7": 36}.get(a["size"], s["size"])
            if a.get("color"):
                s["color"] = a["color"]
        self.stack.append(s)
        if tag == "table":
            self._close()
            self.table_ctx.append({"rows": [], "cur_row": None, "cur_cell_start": None, "cur_cell_align": None, "cur_cell_bg": None})
        elif tag == "tr" and self.table_ctx:
            self._close()
            self.table_ctx[-1]["cur_row"] = []
        elif tag in ("td", "th") and self.table_ctx:
            self._close()
            self.table_ctx[-1]["cur_cell_start"] = len(self.paras)
            self.table_ctx[-1]["cur_cell_align"] = st.get("text-align")
            self.table_ctx[-1]["cur_cell_bg"] = st.get("background-color")  # 🆕 خلفية الخلية (محفوظة من لصق جدول Word أو زر التلوين)
        elif tag in self.BLOCK:
            self._close()
            self._open(st.get("text-align"))
        elif tag == "br":
            align = self.cur["align"] if self.cur else None
            self._close()
            self._open(align)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.table_ctx:
            self._close()
            ctx = self.table_ctx[-1]
            start = ctx.pop("cur_cell_start", None)
            bg = ctx.pop("cur_cell_bg", None)
            if start is None:
                if len(self.stack) > 1 and tag != "br":
                    self.stack.pop()
                return  # 🆕 وسم إغلاق خلية بلا فتح مطابق — تجاهل بأمان بدل حذف محتوى سابق بالخطأ
            cell_paras = self.paras[start:]
            del self.paras[start:]
            if not cell_paras:
                cell_paras = [{"align": ctx.get("cur_cell_align") or "right", "runs": []}]
            if ctx.get("cur_row") is None:
                ctx["cur_row"] = []
            ctx["cur_row"].append({"paras": cell_paras, "bg": bg})
        elif tag == "tr" and self.table_ctx:
            ctx = self.table_ctx[-1]
            if ctx.get("cur_row") is not None:
                ctx["rows"].append(ctx["cur_row"])
                ctx["cur_row"] = None
        elif tag == "table" and self.table_ctx:
            ctx = self.table_ctx.pop()
            if not self.table_ctx and ctx["rows"]:
                self.paras.append({"type": "table", "rows": ctx["rows"]})
        elif tag in self.BLOCK:
            self._close()
        if len(self.stack) > 1 and tag != "br":
            self.stack.pop()

    def handle_data(self, data):
        # 🆕 لا نُلغي الفراغات المتعددة (تفريق الكلمات يدوياً) — فقط نُطبّع فواصل الأسطر/التبويب الناتجة عن تنسيق HTML المصدر
        text = re.sub(r"[\t\r\n]+", " ", data)
        if not text.strip() and not self.cur:
            return
        if self.cur is None:
            self._open()
        self.cur["runs"].append({"text": text, **self.stack[-1]})

    def result(self):
        self._close()
        return [p for p in self.paras if p.get("type") == "table" or any(r["text"].strip() for r in p.get("runs", []))] or [{"align": self.default_align, "runs": []}]


def parse_rich(html: str, default_size: float = 14, default_font: str = "amiri", default_align: str = "center") -> List[dict]:
    if not is_html(html):
        return [{"align": default_align, "runs": [{"text": line, "size": default_size, "font": default_font, "bold": False, "underline": False, "color": None}]}
                for line in (html or "").split("\n")]
    p = _Parser(default_size, default_font, default_align)
    p.feed(html)
    return p.result()


def _words(para: dict) -> List[dict]:
    """🆕 يحافظ على عدد الفراغات الفعلي بين الكلمات (تفريق يدوي متعمَّد)، بما فيها الفراغات العابرة لحدود
    تنسيق مختلف (bold/لون/...)، بدل اختزالها دائماً لفراغ واحد أو فقدانها عند حدود التنسيق.
    🆕 الفراغات التي يكتبها المستخدم في بداية الفقرة (محاولة إزاحة النص يدوياً من الحافة) تُحفظ أيضاً
    بدل إسقاطها بصمت، وتُستخدم كبادئة إضافية (مثل first_indent) عند الرسم"""
    out = []
    pending = None
    lead = 0
    for r in para.get("runs", []):
        text = (r["text"] or "").replace("\xa0", " ")
        for tok in re.findall(r"\S+|\s+", text):
            if tok.isspace():
                if pending is not None:
                    pending["gap"] = max(pending.get("gap", 0), len(tok))
                elif not out:
                    lead += len(tok)  # 🆕 فراغات قبل أول كلمة فعلية في الفقرة بأكملها
            else:
                if pending is not None:
                    out.append(pending)
                pending = {**r, "text": tok, "gap": 0}
    if pending is not None:
        out.append(pending)
    for i, w in enumerate(out):
        w["idx"] = i  # 🆕 الترتيب المنطقي الأصلي (قبل إعادة الترتيب البصري BiDi) لضبط الفجوة الصحيحة لاحقاً
        if not w.get("gap"):
            w["gap"] = 1  # فراغ افتراضي واحد بين الكلمات (يشمل الحدود بين عناصر HTML المختلفة)
    if out and lead:
        out[0]["lead_gap"] = lead
    return out


def _disp(t: str, rtl: bool = True) -> str:
    if not re.search(r"[\u0621-\u064A]", t):
        m = re.match(r"^(.*?)([،؛؟:.,]*)$", t) if rtl else None
        return (m.group(2) + m.group(1)) if m and m.group(2) else t
    return get_display(arabic_reshaper.reshape(t))


_cmaps: dict = {}
_LTR_RE = re.compile(r"[A-Za-z]")
_AR_RE = re.compile(r"[\u0600-\u06FF]")


def _visual_order(line: List[dict], ltr: bool = False) -> List[dict]:
    """ترتيب الكلمات بصرياً: السطر يُرسم من اليمين لليسار، فالمقاطع اللاتينية المتتالية تُعكس لتظهر بترتيبها الصحيح.
    ltr=True (محاذاة يسار): السطر كله LTR والمقاطع العربية هي التي تُعكس داخلياً"""
    def is_ltr(w):
        t = w["text"]
        return bool(_LTR_RE.search(t)) and not _AR_RE.search(t)
    out, grp = [], []
    flip_ltr_groups = not ltr
    for w in (line if not ltr else list(reversed(line))):
        if (is_ltr(w) if flip_ltr_groups else not is_ltr(w) and _AR_RE.search(w["text"])):
            grp.append(w)
        else:
            out += list(reversed(grp)); grp = []; out.append(w)
    out += list(reversed(grp))
    return out


def _apply_draw_gaps(line: List[dict]) -> List[dict]:
    """🆕 بعد إعادة الترتيب البصري (BiDi)، تصحيح عرض الفجوة بعد كل كلمة لتطابق الفجوة الفعلية الأصلية بينها
    وبين جارتها البصرية التالية (مهم عند تداخل مقاطع لاتينية متعددة الكلمات داخل سطر عربي والعكس)"""
    n = len(line)
    for i, w in enumerate(line):
        if i == n - 1:
            w["_draw_sp"] = w.get("sp", 0)
            continue
        nxt = line[i + 1]
        wi, ni = w.get("idx"), nxt.get("idx")
        if wi is not None and ni == wi + 1:
            w["_draw_sp"] = w.get("sp", 0)
        elif ni is not None and wi == ni + 1:
            w["_draw_sp"] = nxt.get("sp", 0)
        elif wi is not None and ni is not None and ni > wi:
            # 🆕 حد فاصل أمامي بين مقطعين (عربي↔لاتيني) بعد انعكاس مجموعة متعددة الكلمات بصرياً: الفجوة
            # الصحيحة هي فجوة الكلمة الحالية نفسها (ما بعدها منطقياً)، وليست فجوة افتراضية بمسافة واحدة
            w["_draw_sp"] = w.get("sp", 0)
        elif wi is not None and ni is not None and wi > ni:
            w["_draw_sp"] = nxt.get("sp", 0)
        else:
            w["_draw_sp"] = w.get("sp_unit", w.get("sp", 0))
    return line


def _fit(disp: str, key: str, bold: bool) -> str:
    """بعض الخطوط (القاهرة/تجوّل/المرعي) تفتقر للأشكال المنفصلة FExx → نعيدها إلى الحرف الأساسي"""
    reg, bld, _, _ = FONTS.get(key, FONTS["amiri"])
    fn = bld if bold else reg
    if fn not in _cmaps:
        try:
            from fontTools.ttLib import TTFont as _TT
            _cmaps[fn] = set(_TT(os.path.join(_here, "fonts", fn)).getBestCmap().keys())
        except Exception:
            _cmaps[fn] = None
    cm = _cmaps[fn]
    if not cm:
        return disp
    return "".join(ch if ord(ch) in cm else unicodedata.normalize("NFKC", ch) for ch in disp)


def parse_color(v) -> Optional[colors.Color]:
    """يقبل #rgb / #rrggbb / rgb(r,g,b) / rgba(r,g,b,a) (المحرر يحفظ الألوان بصيغة rgb غالباً)"""
    v = (v or "").strip().lower()
    if not v:
        return None
    try:
        if v.startswith("#"):
            h = v[1:]
            if len(h) == 3:
                h = "".join(ch * 2 for ch in h)
            return colors.HexColor("#" + h[:6])
        m = re.match(r"rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)", v)
        if m:
            r, g, b = (min(255.0, float(m.group(i))) / 255.0 for i in (1, 2, 3))
            return colors.Color(r, g, b)
        return colors.toColor(v)
    except Exception:
        return None


def color_hex(v) -> Optional[str]:
    col = parse_color(v)
    return col.hexval().replace("0x", "#") if col else None


def placeholder_style(html: str, token: str) -> Optional[dict]:
    """تنسيق المقطع الذي يحوي متغيراً (مثل {جدول_الأسماء}) ليرثه العنصر المولَّد مكانه"""
    if not is_html(html) or token not in (html or ""):
        return None
    for p in parse_rich(html):
        for r in p.get("runs", []):
            if token in r["text"]:
                return {"color": r.get("color"), "size": r.get("size"), "bold": r.get("bold"), "font": r.get("font")}
    return None


def _hard_break_word(w: dict, max_w: float, align: str) -> List[dict]:
    """🆕 تقسيم كلمة واحدة متصلة (بلا مسافات) أعرض من عرض الخلية إلى أجزاء تلائم العرض المتاح"""
    rtl = align.lower() != "left"
    text = w["text"]
    if len(text) <= 1:
        return [w]
    pieces, chunk = [], ""
    for ch in text:
        trial = chunk + ch
        disp = _fit(_disp(trial, rtl=rtl), w["font"], w["bold"])
        tw = pdfmetrics.stringWidth(disp, w["font_name"], w["size"])
        if chunk and tw > max_w:
            pieces.append(chunk)
            chunk = ch
        else:
            chunk = trial
    if chunk:
        pieces.append(chunk)
    out = []
    for i, p in enumerate(pieces):
        nw = dict(w)
        nw["text"] = p
        nw["disp"] = _fit(_disp(p, rtl=rtl), w["font"], w["bold"])
        nw["w"] = pdfmetrics.stringWidth(nw["disp"], nw["font_name"], nw["size"])
        nw["sp"] = w["sp"] if i == len(pieces) - 1 else 0  # لا فراغ بين أجزاء الكلمة نفسها
        out.append(nw)
    return out


def _draw_simple_table(c, rows: List[list], x_left: float, x_right: float, y: float, ensure=None, leading: float = 1.4, pad: float = 4) -> float:
    """🆕 جدول حر فارغ يُدرج المستخدم محتواه يدوياً داخل محرر الخطاب — حدود بسيطة + نص منسّق داخل كل خلية"""
    if not rows:
        return y
    ncols = max((len(r) for r in rows), default=0)
    if ncols == 0:
        return y
    col_w = (x_right - x_left) / ncols
    for row in rows:
        cells_lines, cells_bg, row_max_size = [], [], 11.0
        for ci in range(ncols):
            cell_obj = row[ci] if ci < len(row) else {"paras": [{"align": "right", "runs": []}], "bg": None}
            cell = cell_obj.get("paras") or [{"align": "right", "runs": []}]
            cells_bg.append(cell_obj.get("bg"))
            lines_for_cell = []
            for cpara in cell:
                align = (cpara.get("align") or "right")
                words = _words(cpara)
                if not words:
                    lines_for_cell.append(([], 0.0, align, 11.0))
                    continue
                for w in words:
                    w["font_name"] = font_name(w["font"], w["bold"])
                    w["disp"] = _fit(_disp(w["text"], rtl=align.lower() != "left"), w["font"], w["bold"])
                    w["w"] = pdfmetrics.stringWidth(w["disp"], w["font_name"], w["size"])
                    w["sp_unit"] = pdfmetrics.stringWidth(" ", w["font_name"], w["size"])
                    w["sp"] = w["sp_unit"] * w.get("gap", 1)
                cell_max_w = col_w - 2 * pad
                # 🆕 تقسيم قسري لكلمة واحدة أعرض من الخلية (بلا مسافات) بدل خروجها من حدود الخلية
                words = [piece for w in words for piece in (_hard_break_word(w, cell_max_w, align) if w["w"] > cell_max_w else [w])]
                lines, cur, cur_w = [], [], 0.0
                for w in words:
                    add = w["w"] + (cur[-1]["sp"] if cur else 0)
                    if cur and cur_w + add > cell_max_w:
                        lines.append((cur, cur_w)); cur, cur_w = [w], w["w"]
                    else:
                        cur.append(w); cur_w += add
                if cur:
                    lines.append((cur, cur_w))
                for ln, lw in lines:
                    sz = max((w["size"] for w in ln), default=11.0)
                    row_max_size = max(row_max_size, sz)
                    lines_for_cell.append((ln, lw, align, sz))
            cells_lines.append(lines_for_cell or [([], 0.0, "right", 11.0)])
        n_lines = max(len(cl) for cl in cells_lines)
        line_h = row_max_size * leading
        row_h = n_lines * line_h + 2 * pad
        if ensure:
            ny = ensure(row_h, y)
            if ny is not None:
                y = ny
        top_y = y
        c.setStrokeColor(colors.HexColor("#94a3b8"))
        c.setLineWidth(0.6)
        for ci in range(ncols):
            cx_right = x_right - ci * col_w
            cx_left = cx_right - col_w
            bgc = parse_color(cells_bg[ci])
            if bgc:
                c.setFillColor(bgc); c.rect(cx_left, top_y - row_h, col_w, row_h, fill=1, stroke=0)
            c.setStrokeColor(colors.HexColor("#94a3b8"))
            c.rect(cx_left, top_y - row_h, col_w, row_h, stroke=1, fill=0)
            ty = top_y - pad - row_max_size * 0.8
            for ln, lw, align, sz in cells_lines[ci]:
                if ln:
                    line = _apply_draw_gaps(_visual_order(ln, ltr=(align == "left")))
                    cell_max_w = col_w - 2 * pad
                    x = (cx_right - pad) if align in ("right", "justify", "start") else ((cx_left + pad + lw) if align == "left" else (cx_right - pad - (cell_max_w - lw) / 2))
                    for w in line:
                        c.setFont(w["font_name"], w["size"])
                        c.setFillColor(parse_color(w.get("color")) or colors.black)
                        x -= w["w"]
                        c.drawString(x, ty, w["disp"])
                        if w["underline"]:
                            c.setLineWidth(0.6)
                            c.line(x, ty - w["size"] * 0.12, x + w["w"], ty - w["size"] * 0.12)
                        x -= w["_draw_sp"]
                ty -= line_h
        c.setFillColor(colors.black)
        c.setStrokeColor(colors.black)
        y = top_y - row_h
    return y


def draw_rich(c, paras: List[dict], x_left: float, x_right: float, y: float, leading: float = 1.55, para_gap: float = 4, ensure=None, first_indent: float = 0) -> float:
    """يرسم الفقرات من y نزولاً ويعيد y بعد آخر سطر. ensure(height) اختيارية: تعيد y جديدة عند الانتقال لصفحة جديدة.
    first_indent: مسافة بادئة لأول سطر في كل فقرة (نقاط) — للمحاذاة يمين/ضبط/يسار فقط"""
    max_w = x_right - x_left
    for para in paras:
        if para.get("type") == "table":
            y -= 3  # 🆕 فسحة صغيرة قبل الجدول كي لا يلتصق بالسطر الذي قبله
            y = _draw_simple_table(c, para.get("rows") or [], x_left, x_right, y, ensure=ensure)
            y -= para_gap
            continue
        words = _words(para)
        if not words:
            y -= 14 * leading * 0.6
            continue
        for w in words:
            w["font_name"] = font_name(w["font"], w["bold"])
            w["disp"] = _fit(_disp(w["text"], rtl=(para.get("align") or "").lower() != "left"), w["font"], w["bold"])
            w["w"] = pdfmetrics.stringWidth(w["disp"], w["font_name"], w["size"])
            w["sp_unit"] = pdfmetrics.stringWidth(" ", w["font_name"], w["size"])
            w["sp"] = w["sp_unit"] * w.get("gap", 1)
        align = (para.get("align") or "center").lower()
        lead_px = (words[0].get("lead_gap", 0) * words[0]["sp_unit"]) if words else 0  # 🆕 إزاحة الفراغات البادئة
        indent = (first_indent if (first_indent and align != "center") else 0) + (lead_px if align != "center" else 0)
        lines, cur, cur_w = [], [], 0.0
        for w in words:
            add = w["w"] + (cur[-1]["sp"] if cur else 0)
            if cur and cur_w + add > max_w - (indent if not lines else 0):
                lines.append((cur, cur_w))
                cur, cur_w = [w], w["w"]
            else:
                cur.append(w)
                cur_w += add
        if cur:
            lines.append((cur, cur_w))
        for li, (line, lw) in enumerate(lines):
            size = max(w["size"] for w in line)
            if ensure:
                ny = ensure(size * leading, y)
                if ny is not None:
                    y = ny
            y -= size * leading
            line = _apply_draw_gaps(_visual_order(line, ltr=(align == "left")))
            # 🆕 إعادة حساب عرض السطر الفعلي بعد إعادة الترتيب البصري (BiDi) بدل عرض الترتيب المنطقي قبله —
            # يمنع "دفع" السطر يميناً/تمركزه خطأً عند فقدان فجوة عربي/لاتيني مختلطة أثناء إعادة الترتيب
            lw_v = sum(w["w"] for w in line) + sum(w["_draw_sp"] for w in line[:-1])
            ind = indent if li == 0 else 0
            x = x_right - ind if align in ("right", "justify", "start") else (x_left + ind + lw_v if align == "left" else x_right - (max_w - lw_v) / 2)
            for w in line:
                c.setFont(w["font_name"], w["size"])
                c.setFillColor(parse_color(w.get("color")) or colors.black)
                x -= w["w"]
                c.drawString(x, y, w["disp"])
                if w["underline"]:
                    c.setLineWidth(0.6)
                    c.line(x, y - w["size"] * 0.12, x + w["w"], y - w["size"] * 0.12)
                x -= w["_draw_sp"]
        c.setFillColor(colors.black)
        y -= para_gap
    return y


def _table_to_text(rows: list) -> str:
    lines = []
    for row in rows:
        cells = []
        for cell in row:
            paras = cell.get("paras") if isinstance(cell, dict) else cell
            cells.append(re.sub(r"\s+", " ", "".join(r["text"] for cpara in (paras or []) for r in cpara.get("runs", []))).strip())
        lines.append(" | ".join(cells))
    return "\n".join(lines)


def html_to_text(html: str) -> str:
    if not is_html(html):
        return html or ""
    parts = []
    for p in parse_rich(html):
        if p.get("type") == "table":
            parts.append(_table_to_text(p.get("rows") or []))
        else:
            parts.append(re.sub(r"\s+", " ", "".join(r["text"] for r in p.get("runs", []))).strip())
    return "\n".join(parts)
