"""Iteration 140: page-number chip (صفحة n من N + mini QR) above footer, BOTTOM_SAFE=33mm, no overlap with body/footer/QR,
no chip on 1-page letters, orphan-signature guard, HR multipage chip"""
import io, base64, pytest, pymupdf
from test_letters_bottom_safe_iter139 import API, MM, body, payload, s, preview  # noqa: F401  (s fixture)

CHIP_FILL = (0.93, 0.97, 0.93)


def footer_png():
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (2100, 240), (20, 60, 120)); d = ImageDraw.Draw(im)
    for x in range(0, 2100, 150):
        d.ellipse((x + 20, 40, x + 120, 140), fill=(255, 200, 0))
    b = io.BytesIO(); im.save(b, "PNG")
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


def chip(pg):
    for dr in pg.get_drawings():
        f = dr.get("fill")
        if f and all(abs(a - b) < 0.02 for a, b in zip(f, CHIP_FILL)):
            return dr["rect"]
    return None


def inter(a, b, pad=0):
    return a.x0 < b.x1 - pad and b.x0 < a.x1 - pad and a.y0 < b.y1 - pad and b.y0 < a.y1 - pad


def chip_collisions(pg, cr):
    """text spans (outside the chip) & images (other than mini QR) whose bbox hits the chip"""
    hits = []
    for b in pg.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            for sp in ln["spans"]:
                r = pymupdf.Rect(sp["bbox"])
                if cr.contains(pymupdf.Rect(r.x0 + 0.5, r.y0 + 0.5, r.x1 - 0.5, r.y0 + 1)):
                    continue  # chip's own text
                if inter(r, cr):
                    hits.append(("text", sp["text"][:25], round((pg.rect.height - r.y1) / MM, 1)))
    for ii in pg.get_image_info():
        r = pymupdf.Rect(ii["bbox"])
        if cr.contains(r):
            continue
        if inter(r, cr):
            hits.append(("img", tuple(round(v / MM, 1) for v in r)))
    return hits


# Chip present on every page of a multipage letter, right side, 24-32mm from bottom, with mini QR
@pytest.mark.parametrize("fimg", [False, True])
def test_chip_geometry(s, fimg):
    kw = {"letterhead_override": {"footer_image_base64": footer_png()}} if fimg else {}
    _, d, _ = preview(s, body(25), **kw)
    assert d.page_count >= 2
    for pg in d:
        cr = chip(pg); H = pg.rect.height
        assert cr is not None
        assert abs((H - cr.y1) / MM - 24) < 0.3 and abs((H - cr.y0) / MM - 32) < 0.3
        assert cr.x1 / MM > 185
        txt = pg.get_text()
        assert f"{d.page_count}" in txt


# Last page: no 'يتبع'; non-last pages have it
def test_last_page_no_continue_word(s):
    _, d, _ = preview(s, body(25))
    for i, pg in enumerate(d):
        t = pg.get_text()
        has = "ﻳﺘﺒﻊ" in t or "يتبع" in t or "يُتبع" in t
        assert has == (i < d.page_count - 1), f"page {i+1}"


# Continuation header from page 2
def test_continuation_header(s):
    _, d, _ = preview(s, body(25))
    assert "ﺗﺎﺑﻊ ﺍﻟﺨﻄﺎﺏ" not in d[0].get_text()
    for pg in list(d)[1:]:
        assert "ﺗﺎﺑﻊ ﺍﻟﺨﻄﺎﺏ" in pg.get_text()


# Single page: no chip
def test_single_page_no_chip(s):
    _, d, _ = preview(s, body(3))
    assert d.page_count == 1 and chip(d[0]) is None


# No text/image (body line, sig, big QR) intersects chip — scan many paragraph counts
@pytest.mark.parametrize("qr_style", ["normal", "footer"])
def test_no_overlap_with_chip_scan(s, qr_style):
    bad = []
    for k in range(10, 32, 2):
        _, d, _ = preview(s, body(k), layout={"qr_style": qr_style})
        for i, pg in enumerate(d):
            cr = chip(pg)
            if cr is None:
                continue
            h = chip_collisions(pg, cr)
            if h:
                bad.append((k, i + 1, h[:3]))
    print("collisions:", bad)
    assert not bad, bad


# Chip text stays inside its own rounded rect (2nd line 'يتبع…' / 'التحقق من الأصالة')
def test_chip_text_inside_chip(s):
    _, d, _ = preview(s, body(25))
    out = []
    for i, pg in enumerate(d):
        cr = chip(pg)
        for b in pg.get_text("dict")["blocks"]:
            for ln in b.get("lines", []):
                for sp in ln["spans"]:
                    r = pymupdf.Rect(sp["bbox"])
                    if inter(r, cr) and not cr.contains(r):
                        out.append((i + 1, sp["text"][:20], round((pg.rect.height - r.y1) / MM, 2)))
    print(out)
    assert not out, out


# Orphan-signature guard still works with BOTTOM_SAFE=33mm
def test_orphan_scan(s):
    orphans = []
    for k in range(5, 32):
        r, d, _ = preview(s, body(k))
        if d.page_count >= 2 and "PARA" not in d[-1].get_text():
            orphans.append((k, d.page_count))
    print("orphans:", orphans)
    assert not orphans


# HR multipage: text-only chip (no mini QR) and no clash with HR QR / Ref-Date
def test_hr_multipage_chip(s):
    rows = s.get(f"{API}/hr/letters").json()
    rows = rows if isinstance(rows, list) else rows.get("items") or rows.get("letters") or []
    if not rows:
        pytest.skip("no HR letters")
    lid = rows[0].get("id") or rows[0].get("_id")
    long_body = "\n".join(f"PARA{i} فقرة اختبار طويلة لخطاب الموارد البشرية لاختبار تعدد الصفحات وعدم تداخل شارة الترقيم مع رمز التحقق ونص المرجع." for i in range(40))
    r = s.post(f"{API}/hr/letters/{lid}/preview-pdf", json={"body": long_body})
    assert r.status_code == 200, r.text[:200]
    d = pymupdf.open(stream=r.content, filetype="pdf")
    assert d.page_count >= 2
    bad = []
    for i, pg in enumerate(d):
        cr = chip(pg)
        assert cr is not None
        print("HR chip mm", [round(v / MM, 1) for v in cr], "H-mm", round(pg.rect.height / MM, 1))
        h = chip_collisions(pg, cr)
        imgs = [pymupdf.Rect(ii["bbox"]) for ii in pg.get_image_info() if ii["bbox"][2] - ii["bbox"][0] < 100 * MM]
        if h or any(inter(cr, im) for im in imgs):
            bad.append((i + 1, h))
        pg.get_pixmap(dpi=80).save(f"/tmp/hr_p{i+1}.png")
    print("HR collisions", bad)
    assert not bad


# Stored letters (incl. overtime letters opened in /letters) — real /letters/{id}/pdf multipage → chip + no collisions
def test_stored_multipage_letters_chip(s):
    rows = s.get(f"{API}/letters", params={"limit": 60}).json()
    rows = rows if isinstance(rows, list) else rows.get("items") or rows.get("letters") or []
    checked, bad = 0, []
    for row in rows:
        lid = row.get("id") or row.get("_id")
        r = s.get(f"{API}/letters/{lid}/pdf")
        if r.status_code != 200 or not r.content.startswith(b"%PDF"):
            continue
        d = pymupdf.open(stream=r.content, filetype="pdf")
        if d.page_count < 2:
            continue
        checked += 1
        for i, pg in enumerate(d):
            cr = chip(pg)
            if cr is None:
                bad.append((lid, i + 1, "no chip")); continue
            h = [x for x in chip_collisions(pg, cr) if not (x[0] == "img" and x[1][2] - x[1][0] > 100)]
            if h:
                bad.append((lid, row.get("subject", "")[:20], i + 1, h[:2]))
        if checked >= 6:
            break
    print("checked", checked, "bad", bad)
    if not checked:
        pytest.skip("no multipage stored letters")
    assert not bad
