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
_HTML_RE = re.compile(r"<(p|div|br|span|b|strong|i|em|u|h[1-6]|font|li|ul|ol)\b", re.I)
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
        if tag in self.BLOCK:
            self._close()
            self._open(st.get("text-align"))
        elif tag == "br":
            align = self.cur["align"] if self.cur else None
            self._close()
            self._open(align)

    def handle_endtag(self, tag):
        if len(self.stack) > 1 and tag != "br":
            self.stack.pop()
        if tag in self.BLOCK:
            self._close()

    def handle_data(self, data):
        text = re.sub(r"\s+", " ", data)
        if not text.strip() and not self.cur:
            return
        if self.cur is None:
            self._open()
        self.cur["runs"].append({"text": text, **self.stack[-1]})

    def result(self):
        self._close()
        return [p for p in self.paras if any(r["text"].strip() for r in p["runs"])] or [{"align": self.default_align, "runs": []}]


def parse_rich(html: str, default_size: float = 14, default_font: str = "amiri", default_align: str = "center") -> List[dict]:
    if not is_html(html):
        return [{"align": default_align, "runs": [{"text": line, "size": default_size, "font": default_font, "bold": False, "underline": False, "color": None}]}
                for line in (html or "").split("\n")]
    p = _Parser(default_size, default_font, default_align)
    p.feed(html)
    return p.result()


def _words(para: dict) -> List[dict]:
    out = []
    for r in para["runs"]:
        for w in r["text"].split(" "):
            if w:
                out.append({**r, "text": w})
    return out


def _disp(t: str) -> str:
    if not re.search(r"[\u0621-\u064A]", t):
        m = re.match(r"^(.*?)([،؛؟:.,]*)$", t)
        return (m.group(2) + m.group(1)) if m and m.group(2) else t
    return get_display(arabic_reshaper.reshape(t))


_cmaps: dict = {}


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


def draw_rich(c, paras: List[dict], x_left: float, x_right: float, y: float, leading: float = 1.55, para_gap: float = 4, ensure=None) -> float:
    """يرسم الفقرات من y نزولاً ويعيد y بعد آخر سطر. ensure(height) اختيارية: تعيد y جديدة عند الانتقال لصفحة جديدة"""
    max_w = x_right - x_left
    for para in paras:
        words = _words(para)
        if not words:
            y -= 14 * leading * 0.6
            continue
        for w in words:
            w["font_name"] = font_name(w["font"], w["bold"])
            w["disp"] = _fit(_disp(w["text"]), w["font"], w["bold"])
            w["w"] = pdfmetrics.stringWidth(w["disp"], w["font_name"], w["size"])
            w["sp"] = pdfmetrics.stringWidth(" ", w["font_name"], w["size"])
        lines, cur, cur_w = [], [], 0.0
        for w in words:
            add = w["w"] + (cur[-1]["sp"] if cur else 0)
            if cur and cur_w + add > max_w:
                lines.append((cur, cur_w))
                cur, cur_w = [w], w["w"]
            else:
                cur.append(w)
                cur_w += add
        if cur:
            lines.append((cur, cur_w))
        align = (para.get("align") or "center").lower()
        for line, lw in lines:
            size = max(w["size"] for w in line)
            if ensure:
                ny = ensure(size * leading)
                if ny is not None:
                    y = ny
            y -= size * leading
            x = x_right if align in ("right", "justify", "start") else (x_left + lw if align == "left" else x_right - (max_w - lw) / 2)
            for w in line:
                c.setFont(w["font_name"], w["size"])
                try:
                    c.setFillColor(colors.HexColor(w["color"]) if w.get("color") and w["color"].startswith("#") else colors.black)
                except Exception:
                    c.setFillColor(colors.black)
                x -= w["w"]
                c.drawString(x, y, w["disp"])
                if w["underline"]:
                    c.setLineWidth(0.6)
                    c.line(x, y - w["size"] * 0.12, x + w["w"], y - w["size"] * 0.12)
                x -= w["sp"]
        c.setFillColor(colors.black)
        y -= para_gap
    return y


def html_to_text(html: str) -> str:
    if not is_html(html):
        return html or ""
    return "\n".join(re.sub(r"\s+", " ", "".join(r["text"] for r in p["runs"])).strip() for p in parse_rich(html))
