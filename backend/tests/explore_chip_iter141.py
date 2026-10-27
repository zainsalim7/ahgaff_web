"""iter141: pixel-level check of chip 2nd-line glyph ink vs chip bottom border; save zooms"""
import sys, requests, pymupdf
sys.path.insert(0, "/app/backend/tests")
from test_letters_bottom_safe_iter139 import API, MM, body, payload
from test_letters_page_chip_iter140 import chip, footer_png

s = requests.Session()
r = s.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
DPI = 600
for name, kw, k in [("default", {}, 20), ("fimg", {"letterhead_override": {"footer_image_base64": footer_png()}}, 25)]:
    d = pymupdf.open(stream=s.post(f"{API}/letters/preview-pdf", params={"fmt": "pdf"}, json=payload(body(k), **kw)).content, filetype="pdf")
    for i, pg in enumerate(d):
        cr = chip(pg); H = pg.rect.height
        clip = pymupdf.Rect(cr.x0 - 5 * MM, cr.y0 - 10 * MM, cr.x1 + 2 * MM, H - 18 * MM)
        pix = pg.get_pixmap(dpi=DPI, clip=clip)
        pix.save(f"/tmp/i141_{name}_p{i+1}_zoom.png")
        sc = DPI / 72
        # gray text ink (0.5,0.52,0.55)*255 ≈ (128,133,140): find lowest row of such pixels inside chip x-range
        low = None
        for yy in range(pix.height):
            for xx in range(int((cr.x0 - clip.x0) * sc) + 40, int((cr.x1 - clip.x0) * sc) - 40, 2):
                p = pix.pixel(xx, yy)
                if abs(p[0] - 128) < 25 and abs(p[1] - 133) < 25 and abs(p[2] - 140) < 25 and p[2] > p[0]:
                    low = yy
        if low is not None:
            y_pdf = clip.y0 + low / sc
            print(f"{name} p{i+1}: lowest gray-ink at {(H - y_pdf) / MM:.2f}mm; chip bottom {(H - cr.y1) / MM:.2f}mm; chip border inner ~{(H - cr.y1) / MM + 0.1:.2f}mm")
        # body text lowest ink (black) above chip
        print(f"{name} p{i+1} done, pages={d.page_count}")
