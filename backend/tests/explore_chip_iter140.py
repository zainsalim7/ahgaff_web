import os, sys, base64, io, pymupdf, requests
sys.path.insert(0, "/app/backend/tests")
from test_letters_bottom_safe_iter139 import API, MM, body, payload

s = requests.Session()
r = s.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"


def footer_png():
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (2100, 240), (20, 60, 120))
    d = ImageDraw.Draw(im)
    for x in range(0, 2100, 150):
        d.ellipse((x + 20, 40, x + 120, 140), fill=(255, 200, 0))
    b = io.BytesIO(); im.save(b, "PNG")
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


def analyse(d, tag):
    for i, pg in enumerate(d):
        H = pg.rect.height
        chips = [dr for dr in pg.get_drawings() if dr.get("fill") and abs(dr["fill"][0] - 0.93) < 0.02 and abs(dr["fill"][1] - 0.97) < 0.02]
        cr = chips[0]["rect"] if chips else None
        blocks = [(round((H - b[3]) / MM, 1), round((H - b[1]) / MM, 1), round(b[0] / MM, 1), round(b[2] / MM, 1), b[4][:40].replace("\n", " ")) for b in pg.get_text("blocks")]
        imgs = [(round(ii["bbox"][0] / MM, 1), round((H - ii["bbox"][3]) / MM, 1), round(ii["bbox"][2] / MM, 1), round((H - ii["bbox"][1]) / MM, 1)) for ii in pg.get_image_info()]
        print(f"[{tag}] page {i+1}/{d.page_count} chip={'x%.1f-%.1f y%.1f-%.1f' % (cr.x0/MM, cr.x1/MM, (H-cr.y1)/MM, (H-cr.y0)/MM) if cr else None}")
        low = sorted(blocks)[:6]
        for b in low:
            print("    blk bottom/top/x0/x1:", b)
        print("    imgs x0,y0,x1,y1:", imgs)
        print("    text:", pg.get_text()[-200:].replace("\n", " | "))


for name, kw in [("default", {}), ("footer_img", {"letterhead_override": {"footer_image_base64": footer_png()}}),
                 ("qr_footer", {"layout": {"qr_style": "footer"}}), ("short", {})]:
    n = 3 if name == "short" else 25
    rr = s.post(f"{API}/letters/preview-pdf", params={"fmt": "pdf"}, json=payload(body(n), **kw))
    print(name, rr.status_code)
    d = pymupdf.open(stream=rr.content, filetype="pdf")
    analyse(d, name)
    for i in range(d.page_count):
        d[i].get_pixmap(dpi=80).save(f"/tmp/iter140_{name}_p{i+1}.png")
