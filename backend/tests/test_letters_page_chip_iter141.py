"""Iteration 141: chip moved to 25-33mm, BOTTOM_SAFE=37mm, big-QR floor 40mm on multipage last page.
Geometry checks (pymupdf): chip vs big QR, body text vs chip top, chip text inside chip, chip vs footer image gap,
orphan guard scan, single page no chip, HR multipage chip."""
import pytest, pymupdf
from test_letters_bottom_safe_iter139 import API, MM, body, s, preview  # noqa: F401
from test_letters_page_chip_iter140 import chip, inter, footer_png

SAFE = 0.5  # mm


def mm_b(pg, y):  # pdf y (top-down) -> mm from bottom
    return (pg.rect.height - y) / MM


def spans(pg):
    for b in pg.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            for sp in ln["spans"]:
                if sp["text"].strip():
                    yield sp, pymupdf.Rect(sp["bbox"])


def chip_own(cr, r):
    c = (r.y0 + r.y1) / 2
    return cr.x0 - 1 <= r.x0 and r.x1 <= cr.x1 + 1 and cr.y0 - 3 * MM < c < cr.y1 + 3 * MM and (r.x1 - r.x0) < cr.width + 2


def big_imgs(pg, lo=15, hi=100):
    out = []
    for ii in pg.get_image_info():
        r = pymupdf.Rect(ii["bbox"]); w = r.width / MM
        if lo <= w <= hi:
            out.append(r)
    return out


# Chip geometry 25-33mm from bottom on every page
def test_chip_geometry(s):
    _, d, _ = preview(s, body(25))
    assert d.page_count >= 2
    for pg in d:
        cr = chip(pg)
        assert cr is not None
        lo, hi = mm_b(pg, cr.y1), mm_b(pg, cr.y0)
        print("chip mm", round(lo, 2), round(hi, 2), round(cr.x0 / MM, 1), round(cr.x1 / MM, 1))
        assert abs(lo - 25) < 0.4 and abs(hi - 33) < 0.4


# CRITICAL from iter140: chip must not overlap big QR (>15mm) or its 'Scan to verify' label
@pytest.mark.parametrize("k", list(range(10, 33)))
def test_chip_vs_big_qr(s, k):
    _, d, _ = preview(s, body(k), layout={"qr_style": "normal"})
    if d.page_count < 2:
        pytest.skip("single page")
    pg = d[-1]; cr = chip(pg)
    assert cr is not None
    qrs = big_imgs(pg)
    assert qrs, "big QR missing on last page"
    for q in qrs:
        gap = mm_b(pg, q.y1) - mm_b(pg, cr.y0)
        print(f"k={k} QR bottom={mm_b(pg, q.y1):.2f}mm chip top={mm_b(pg, cr.y0):.2f}mm gap={gap:.2f}")
        assert not inter(q, cr), f"k={k} QR overlaps chip"
    for sp, r in spans(pg):
        if "Scan" in sp["text"]:
            assert not inter(r, cr), f"label overlaps chip {mm_b(pg, r.y1):.2f}"
            assert mm_b(pg, r.y1) - mm_b(pg, cr.y0) >= SAFE


# Body text (span bbox incl. descenders) must stay >= 0.5mm above chip top on every page
def test_body_text_clear_of_chip(s):
    bad, mins = [], []
    for k in range(10, 33):
        _, d, _ = preview(s, body(k))
        for i, pg in enumerate(d):
            cr = chip(pg)
            if cr is None:
                continue
            top = mm_b(pg, cr.y0)
            low = [mm_b(pg, r.y1) for sp, r in spans(pg) if not chip_own(cr, r) and r.x1 > cr.x0 and r.x0 < cr.x1 and mm_b(pg, r.y1) > 20]
            if low:
                m = min(low); mins.append(round(m - top, 2))
                if m - top < SAFE:
                    bad.append((k, i + 1, round(m, 2), round(top, 2)))
    print("min clearances", sorted(mins)[:5], "bad", bad)
    assert not bad, bad


# Chip text fully inside chip rect; gap chip bottom vs footer image/line >= 0.5mm (default + custom footer image)
@pytest.mark.parametrize("fimg", [False, True])
def test_chip_text_inside_and_footer_gap(s, fimg):
    kw = {"letterhead_override": {"footer_image_base64": footer_png()}} if fimg else {}
    _, d, _ = preview(s, body(25), **kw)
    out = []
    for i, pg in enumerate(d):
        cr = chip(pg)
        for sp, r in spans(pg):
            if chip_own(cr, r):
                print(f"p{i+1} chip-span '{sp['text'][:18]}' bot={mm_b(pg, r.y1):.2f} top={mm_b(pg, r.y0):.2f}")
                if not (r.y0 >= cr.y0 - 0.01 and r.y1 <= cr.y1 + 0.01):
                    out.append((i + 1, sp["text"][:15], round(mm_b(pg, r.y1), 2), round(mm_b(pg, r.y0), 2)))
        cb = mm_b(pg, cr.y1)
        # footer image (wide) top
        for ii in pg.get_image_info():
            r = pymupdf.Rect(ii["bbox"])
            if r.width / MM > 100 and mm_b(pg, r.y0) < 60:
                g = cb - mm_b(pg, r.y0); print(f"p{i+1} footer img top={mm_b(pg, r.y0):.2f} gap={g:.2f}")
                if g < SAFE: out.append((i + 1, "footer-img gap", round(g, 2)))
        # vector footer lines/fills below chip
        for dr in pg.get_drawings():
            r = dr["rect"]
            if r is cr or r == cr:
                continue
            if r.width / MM > 100 and mm_b(pg, r.y0) < cb + 3 and inter(r, cr):
                out.append((i + 1, "drawing overlaps chip", [round(mm_b(pg, v), 2) for v in (r.y1, r.y0)]))
    print(out)
    assert not out, out


# Orphan-signature guard scan k=5..30 with BOTTOM_SAFE=37mm
def test_orphan_scan(s):
    orphans, pages = [], {}
    for k in range(5, 31):
        _, d, _ = preview(s, body(k))
        pages[k] = d.page_count
        if d.page_count >= 2:
            n_last = d[-1].get_text().count("PARA")
            if n_last == 0:
                orphans.append((k, d.page_count, "no PARA"))
    print("pages", pages, "orphans", orphans)
    assert not orphans


# Single page letter: no chip
def test_single_page_no_chip(s):
    for k in (1, 3, 6):
        _, d, _ = preview(s, body(k))
        if d.page_count == 1:
            assert chip(d[0]) is None


# HR multipage: text-only chip, no clash with HR QR/Ref-Date (exclude full-bg image >100mm)
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
        cr = chip(pg); assert cr is not None
        print("HR chip mm", round(mm_b(pg, cr.y1), 2), round(mm_b(pg, cr.y0), 2), round(cr.x0 / MM, 1), round(cr.x1 / MM, 1))
        assert not [ii for ii in pg.get_image_info() if cr.contains(pymupdf.Rect(ii["bbox"]))], "HR chip should not have mini QR"
        for sp, rr in spans(pg):
            if not chip_own(cr, rr) and inter(rr, cr):
                bad.append((i + 1, sp["text"][:20]))
        for q in big_imgs(pg, 5, 100):
            if inter(q, cr):
                bad.append((i + 1, "img", [round(v / MM, 1) for v in q]))
        pg.get_pixmap(dpi=90).save(f"/tmp/i141_hr_p{i+1}.png")
    print("HR bad", bad)
    assert not bad
