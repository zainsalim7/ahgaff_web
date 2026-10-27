"""Iteration 142: chip moved to bottom-LEFT inside footer band (x=margin_side, y=6-15mm), BOTTOM_SAFE back to 28mm,
big-QR floor 30mm, signature block never split, orphan guard scan, custom footer image, qr disabled chip."""
import pytest, pymupdf
from test_letters_bottom_safe_iter139 import API, MM, body, s, preview, lowest_para_bottom_mm  # noqa: F401
from test_letters_page_chip_iter140 import chip, inter, footer_png

OUT = []
WIDOW = []


def mm_b(pg, y):
    return (pg.rect.height - y) / MM


def spans(pg):
    for b in pg.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            for sp in ln["spans"]:
                if sp["text"].strip():
                    yield sp, pymupdf.Rect(sp["bbox"])


def own(cr, r):
    return cr.x0 - 1 <= r.x0 and r.x1 <= cr.x1 + 1 and cr.y0 - 1.5 * MM <= r.y0 and r.y1 <= cr.y1 + 1.5 * MM


# Chip geometry: bottom-left, 6-15mm, x0=margin_side(18mm), with mini QR inside (32mm wide)
@pytest.mark.parametrize("fimg", [False, True])
def test_chip_geometry_left(s, fimg):
    kw = {"letterhead_override": {"footer_image_base64": footer_png()}} if fimg else {}
    _, d, _ = preview(s, body(25), **kw)
    assert d.page_count >= 2
    for i, pg in enumerate(d):
        cr = chip(pg)
        assert cr is not None, f"no chip p{i+1}"
        lo, hi, x0, x1 = mm_b(pg, cr.y1), mm_b(pg, cr.y0), cr.x0 / MM, cr.x1 / MM
        print(f"fimg={fimg} p{i+1} chip y={lo:.2f}-{hi:.2f} x={x0:.2f}-{x1:.2f}")
        assert abs(lo - 6) < 0.3 and abs(hi - 15) < 0.3
        assert abs(x0 - 18) < 0.3 and abs(x1 - 50) < 0.3
        qr_in = [ii for ii in pg.get_image_info() if cr.contains(pymupdf.Rect(ii["bbox"]))]
        assert qr_in, "mini QR missing inside chip"
        q = pymupdf.Rect(qr_in[0]["bbox"])
        assert q.x0 / MM < 22  # QR at left inside chip
        txt = " ".join(sp["text"] for sp, r in spans(pg) if own(cr, r))
        print("  chip text:", txt)
        assert any(ch.isdigit() for ch in txt)
        if fimg:
            fi = [pymupdf.Rect(ii["bbox"]) for ii in pg.get_image_info() if pymupdf.Rect(ii["bbox"]).width / MM > 150]
            assert fi and inter(fi[0], cr), "chip should sit IN FRONT of footer image"
        if i in (0, len(d) - 1):
            pg.get_pixmap(dpi=110, clip=pymupdf.Rect(0, pg.rect.height - 40 * MM, pg.rect.width, pg.rect.height)).save(f"/tmp/i142_f{int(fimg)}_p{i+1}.png")


# Chip must not overlap default footer text/line or any non-chip text/image (except custom footer image itself)
@pytest.mark.parametrize("fimg", [False, True])
def test_chip_no_collision(s, fimg):
    kw = {"letterhead_override": {"footer_image_base64": footer_png()}} if fimg else {}
    bad = []
    for k in (12, 20, 25, 40):
        _, d, _ = preview(s, body(k), **kw)
        for i, pg in enumerate(d):
            cr = chip(pg)
            if cr is None:
                continue
            for sp, r in spans(pg):
                if not own(cr, r) and inter(r, cr):
                    bad.append((k, i + 1, "text", sp["text"][:25], round(mm_b(pg, r.y1), 2), round(mm_b(pg, r.y0), 2)))
            for ii in pg.get_image_info():
                r = pymupdf.Rect(ii["bbox"])
                if cr.contains(r) or r.width / MM > 150:
                    continue
                if inter(r, cr):
                    bad.append((k, i + 1, "img", [round(v / MM, 1) for v in r]))
            for dr in pg.get_drawings():
                r = dr["rect"]
                if r == cr or cr.contains(r):
                    continue
                if inter(r, cr):
                    bad.append((k, i + 1, "drawing", [round(v / MM, 1) for v in r]))
    print("collisions", bad[:10])
    assert not bad, bad[:10]


# Single page or qr disabled
def test_single_page_no_chip(s):
    for k in (1, 3, 6):
        _, d, _ = preview(s, body(k))
        if d.page_count == 1:
            assert chip(d[0]) is None


def test_qr_disabled_chip_text_only(s):
    _, d, _ = preview(s, body(25), layout={"qr_enabled": False})
    assert d.page_count >= 2
    for pg in d:
        cr = chip(pg)
        print("qr off chip", cr and [round(v / MM, 1) for v in cr])
        assert cr is not None and abs(cr.width / MM - 22) < 0.3
        assert not [ii for ii in pg.get_image_info() if cr.contains(pymupdf.Rect(ii["bbox"]))]


# BOTTOM_SAFE back to 28mm: lowest body line on page 1 close to footer (~28-34mm)
def test_body_close_to_footer(s):
    vals = {}
    for k in range(5, 46, 5):
        _, d, _ = preview(s, body(k))
        if d.page_count >= 2:
            H = d[0].rect.height
            vals[k] = round(min((H - b[3]) / MM for b in d[0].get_text("blocks") if (H - b[3]) / MM > 20), 1)  # lowest body line above footer band
    print("page1 lowest PARA bottom mm", vals)
    assert vals
    for k, v in vals.items():
        assert 22 <= v <= 36, (k, v)


# Orphan guard scan k=5..30 & signature block never split, sig on last page, sig header page matches
@pytest.mark.parametrize("sig_img", [False, True])
def test_orphan_and_signature_not_split(s, sig_img):
    from test_letters_page_chip_iter140 import footer_png as _png
    kw = {"letterhead_override": {"signature_base64": _png()}} if sig_img else {}
    pages, bad = {}, []
    for k in range(5, 31):
        r, d, _ = preview(s, body(k), signatory_title="SIGTITLEX", **kw)
        pages[k] = d.page_count
        sp_ = int(r.headers["X-Sig-Page"])
        if sp_ != d.page_count - 1:
            bad.append((k, "sig page hdr", sp_, d.page_count))
        title_pages = [i for i, pg in enumerate(d) if "SIGTITLEX" in pg.get_text()]
        name_pages = [i for i, pg in enumerate(d) if "SIGNAME" in pg.get_text()]
        if not name_pages or not title_pages or name_pages[-1] != title_pages[-1]:
            bad.append((k, "split", title_pages, name_pages))
        if d.page_count >= 2 and d[-1].get_text().count("PARA") == 0:
            if "\ufe8d\ufedf\ufe98\ufeac\ufef3\ufef4\ufede" in d[-1].get_text():
                WIDOW.append((k, sig_img))  # only the tail line of last paragraph precedes signature
            else:
                bad.append((k, "orphan"))
        if sig_img:
            sigimg_pages = [i for i, pg in enumerate(d) for ii in pg.get_image_info() if abs(pymupdf.Rect(ii["bbox"]).width / MM - 38) < 1.5]
            if sigimg_pages != [name_pages[-1]] if name_pages else True:
                bad.append((k, "sig img page", sigimg_pages, name_pages))
        # signature name above footer band and above chip
        pg = d[-1]
        for spn, rr in spans(pg):
            if "SIGNAME" in spn["text"] and mm_b(pg, rr.y1) < 22:
                bad.append((k, "sig in footer", round(mm_b(pg, rr.y1), 1)))
    print("sig_img", sig_img, "pages", pages, "bad", bad, "widow(1 tail line + sig)", WIDOW)
    assert not bad, bad


# Big QR (normal) on last page: floor 30mm, no overlap with chip/footer, label above footer line
def test_big_qr_floor(s):
    mins = []
    for k in range(10, 33):
        _, d, _ = preview(s, body(k), layout={"qr_style": "normal"})
        pg = d[-1]
        qrs = [pymupdf.Rect(ii["bbox"]) for ii in pg.get_image_info() if 15 <= pymupdf.Rect(ii["bbox"]).width / MM <= 100 and pymupdf.Rect(ii["bbox"]).x0 / MM > 150]
        assert qrs, k
        q = qrs[0]; qb = mm_b(pg, q.y1); mins.append((k, round(qb, 1)))
        assert qb >= 29.7, (k, qb)
        cr = chip(pg)
        if cr is not None:
            assert not inter(q, cr)
        for spn, rr in spans(pg):
            if "Scan" in spn["text"]:
                assert mm_b(pg, rr.y1) > 22.3, (k, mm_b(pg, rr.y1))
    print("qr bottoms", mins)


# qr_style=footer: small footer QR at 24mm left; chip on last page without mini QR; no overlap
def test_footer_qr_style_vs_chip(s):
    _, d, _ = preview(s, body(25), layout={"qr_style": "footer"})
    assert d.page_count >= 2
    pg = d[-1]; cr = chip(pg)
    assert cr is not None
    assert not [ii for ii in pg.get_image_info() if cr.contains(pymupdf.Rect(ii["bbox"]))], "mini QR duplicated on last page"
    for ii in pg.get_image_info():
        r = pymupdf.Rect(ii["bbox"])
        assert not inter(r, cr), [round(v / MM, 1) for v in r]


# Default vector footer with LONG contact text (address+phones+fax+po+website) — centered at 16mm, may extend under chip x=18-50mm
def test_long_footer_text_vs_chip(s):
    ov = {"footer_image_base64": "", "address": "حضرموت - المكلا - شارع الجامعة", "phones": "05-123456 / 777123456", "fax": "05-111222", "po_box": "50000", "website": "www.ahgaff.edu"}
    _, d, _ = preview(s, body(25), letterhead_override=ov)
    pg = d[0]; cr = chip(pg)
    hits = [(sp["text"][:30], round(r.x0 / MM, 1), round(r.x1 / MM, 1), round(mm_b(pg, r.y1), 2), round(mm_b(pg, r.y0), 2))
            for sp, r in spans(pg) if not own(cr, r) and mm_b(pg, r.y0) < 22]
    print("footer spans", hits, "chip", [round(v / MM, 1) for v in cr])
    pg.get_pixmap(dpi=110, clip=pymupdf.Rect(0, pg.rect.height - 30 * MM, pg.rect.width, pg.rect.height)).save("/tmp/i142_longfooter.png")
    for sp, r in spans(pg):
        if not own(cr, r) and mm_b(pg, r.y0) < 22:
            if inter(r, cr):  # span bbox incl. descent may dip ~1mm into chip top; glyph baseline is at 16mm (chip top 15mm)
                assert mm_b(pg, r.y1) > mm_b(pg, cr.y0) - 1.2, ("footer text deep under chip", sp["text"][:30])
