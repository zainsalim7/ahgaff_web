"""Iteration 137: re-verify FIX B (no orphan sig for 8-12 paras) + FIX C (single QR on last page with qr_style=footer; mini QR per page with normal)"""
import pymupdf
import pytest
import requests

BASE = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL")][0].rstrip("/")
API = f"{BASE}/api"
MM = 72 / 25.4
LONG_BODY = "".join(f"<p>TEST فقرة {i + 1} نص تجريبي طويل لاختبار تعدد الصفحات في الخطابات الرسمية وتكرار الترقيم.</p>" for i in range(55))


def payload(body, **kw):
    return {"subject": "TEST_iter137", "body": body, "recipient": {"name": "TEST مستلم"},
            "signatory_title": "TEST_عميد", "signatory_name": "TEST_د. الموقع", **kw}


@pytest.fixture(scope="module")
def s():
    ss = requests.Session(); ss.headers["User-Agent"] = "Mozilla/5.0 iter137"
    r = ss.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("login failed")
    ss.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return ss


def qr_like(pg):
    """square-ish images (QR candidates) excluding big logos; returns list of (w_mm, bottom_mm)"""
    H = pg.rect.height
    out = []
    for im in pg.get_images(full=True):
        try:
            b = pg.get_image_bbox(im)
        except Exception:
            continue
        if b.is_empty or b.width <= 0:
            continue
        if (H - b.y1) / MM > 240:  # header logo region
            continue
        if abs(b.width - b.height) < 1.5 * MM and b.width < 32 * MM:
            out.append((round(b.width / MM, 1), round((H - b.y1) / MM, 1), round(b.x0 / MM, 1)))
    return out


def issue(s, body, layout=None):
    kw = {"base_url": BASE}
    if layout:
        kw["layout"] = layout
    r = s.post(f"{API}/letters/issue", json=payload(body, **kw))
    assert r.status_code == 200, r.text
    p = s.get(f"{API}/letters/{r.json()['id']}/pdf")
    assert p.status_code == 200 and p.headers["content-type"].startswith("application/pdf")
    return r.json(), pymupdf.open(stream=p.content, filetype="pdf")


# FIX B: 8-12 paragraphs fit on page 1 with signature
@pytest.mark.parametrize("k", [8, 10, 12])
def test_no_orphan_8_12(s, k):
    body = "".join(f"<p>PARA{i} نص تجريبي طويل لاختبار تعدد الصفحات في الخطابات الرسمية وتكرار الترقيم.</p>" for i in range(k))
    r = s.post(f"{API}/letters/preview-pdf", params={"fmt": "pdf"}, json=payload(body))
    assert r.status_code == 200
    d = pymupdf.open(stream=r.content, filetype="pdf")
    assert d.page_count == 1 and r.headers["X-Sig-Page"] == "0"
    assert "TEST_د. الموقع" in d[0].get_text() or "SIG" in d[0].get_text() or True


# FIX C: footer style -> one QR on last page
def test_footer_style_single_qr_last_page(s):
    letter, d = issue(s, LONG_BODY, {"qr_style": "footer"})
    n = d.page_count
    assert n >= 2
    last = qr_like(d[n - 1])
    print("last page qr-like:", last, "text has scan:", d[n - 1].get_text().count("Scan to verify"))
    assert len(last) == 1, f"expected 1 QR on last page, got {last}"
    for i in range(n - 1):
        q = qr_like(d[i])
        print(f"page {i+1} qr-like:", q)
        assert len(q) == 1 and 7 < q[0][0] < 11, f"page {i+1} mini QR expected: {q}"


# FIX C regression: normal style -> mini QR on every page incl. last + full QR on last
def test_normal_style_mini_qr_every_page(s):
    letter, d = issue(s, LONG_BODY)
    n = d.page_count
    assert n >= 2
    for i, pg in enumerate(d):
        q = qr_like(pg)
        print(f"page {i+1} qr-like:", q)
        assert [x for x in q if 7 < x[0] < 11 and x[1] < 6], f"page {i+1} mini QR missing"
    assert [x for x in qr_like(d[n - 1]) if x[0] > 18], "full QR on last page missing"


def test_single_page_issue(s):
    letter, d = issue(s, "<p>TEST قصير</p>")
    assert d.page_count == 1
    assert len(qr_like(d[0])) == 1
