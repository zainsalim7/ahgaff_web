# Matrix probe: manual 25-space gap at Arabic/Latin run boundaries (draw_rich x-positions)
import sys
sys.path.insert(0, "/app/backend")
from backend.services.rich_text_pdf import parse_rich, draw_rich


class Cap:
    def __init__(self): self.calls = []
    def setFont(self, *a): pass
    def setFillColor(self, *a): pass
    def setLineWidth(self, *a): pass
    def line(self, *a): pass
    def drawString(self, x, y, s): self.calls.append((round(x, 1), s))


G = " " * 25
cases = [
    ("نص", "XYZ"), ("نص عربي", "XYZ"), ("نص عربي", "ABC DEF"), ("نص", "ABC DEF"),
    ("الموضوع: طلب ترشيح", "ABC"), ("الموضوع: طلب ترشيح", "ABC DEF GHI"),
    ("XYZ", "نص عربي"), ("ABC DEF", "نص عربي"), ("ABC DEF", "نص"), ("ABC", "نص"),
    ("نص عربي", "عربي آخر"),  # pure arabic control
]
for align in ("right", "left", "center"):
    for a, b in cases:
        c = Cap()
        draw_rich(c, parse_rich(f'<p style="text-align: {align};">{a}{G}{b}</p>', default_size=14, default_font="amiri", default_align="center"), 56.7, 538.6, 700)
        cn = Cap()
        draw_rich(cn, parse_rich(f'<p style="text-align: {align};">{a} {b}</p>', default_size=14, default_font="amiri", default_align="center"), 56.7, 538.6, 700)
        span = max(x for x, _ in c.calls) - min(x for x, _ in c.calls)
        span0 = max(x for x, _ in cn.calls) - min(x for x, _ in cn.calls)
        extra = span - span0
        ok = "OK " if extra > 70 else "LOST"
        print(f"{ok} {align:6s} '{a}'+25sp+'{b}'  extra={extra:6.1f}  {sorted(c.calls)}")
