# RCA probe: draw_rich() positions for left/center/right + multi-space gap (mixed Arabic/Latin and pure Arabic)
import sys
sys.path.insert(0, "/app/backend")
from backend.services.rich_text_pdf import parse_rich, draw_rich  # noqa


class Cap:
    def __init__(self): self.calls = []
    def setFont(self, *a): pass
    def setFillColor(self, *a): pass
    def setLineWidth(self, *a): pass
    def line(self, *a): pass
    def drawString(self, x, y, s): self.calls.append((round(x, 1), s))


GAP = " " * 25
CASES = {
    "arabic+gap+latin": f"الموضوع: ترشيح طلاب{GAP}XYZ",
    "arabic+gap+arabic": f"السلام عليكم{GAP}وبركاته",
    "arabic only": "السلام عليكم ورحمة الله",
}
X_L, X_R = 56.7, 538.6
for name, txt in CASES.items():
    for al in ("right", "center", "left"):
        html = f'<p style="text-align: {al};"><span style="font-size: 14pt;">{txt}</span></p>'
        c = Cap()
        draw_rich(c, parse_rich(html, default_size=14, default_font="amiri", default_align="center"), X_L, X_R, 700)
        xs = [x for x, _ in c.calls]
        print(f"{name:20s} {al:6s} minx={min(xs):6.1f} (x_left={X_L})  words={[(x, s[:8]) for x, s in c.calls]}")
