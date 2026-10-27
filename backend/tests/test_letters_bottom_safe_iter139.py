"""Iteration 139: BOTTOM_SAFE=28mm regression — body ends close to footer w/o overlap, sig/QR on last page,
headers consistent with PDF, issue+PDF, overtime letters PDF + pdf-with-attachments, HR letters PDF"""
import os
import time
import pymupdf
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL")][0].rstrip("/")
API = f"{BASE}/api"
MM = 72 / 25.4
PARA = "نص تجريبي طويل لاختبار تعدد الصفحات في الخطابات الرسمية وتكرار الترقيم وضمان عدم التداخل مع التذييل."


def body(n):
    return "".join(f"<p>PARA{i} {PARA}</p>" for i in range(n))


def payload(b, **kw):
    return {"subject": "TEST_iter139", "body": b, "recipient": {"name": "TEST مستلم"},
            "signatory_title": "TEST_عميد", "signatory_name": "TEST_SIGNAME", **kw}


@pytest.fixture(scope="module")
def s():
    ss = requests.Session(); ss.headers["User-Agent"] = "Mozilla/5.0 iter139"
    r = ss.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("login failed")
    ss.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return ss


def preview(s, b, **kw):
    t = time.time()
    r = s.post(f"{API}/letters/preview-pdf", params={"fmt": "pdf"}, json=payload(b, **kw))
    assert r.status_code == 200, r.text[:300]
    return r, pymupdf.open(stream=r.content, filetype="pdf"), time.time() - t


def lowest_para_bottom_mm(pg):
    """lowest y (from bottom, mm) of any PARA body line"""
    H = pg.rect.height
    ys = [H - b[3] for b in pg.get_text("blocks") if "PARA" in b[4]]
    return min(ys) / MM if ys else None


# Short letter: 1 page, sig page 0, headers present & sane
def test_short_preview_headers(s):
    r, d, dt = preview(s, body(3))
    assert d.page_count == 1
    png = s.post(f"{API}/letters/preview-pdf", params={"fmt": "png", "page": 0}, json=payload(body(3)))
    assert png.status_code == 200 and png.headers["content-type"].startswith("image/png")
    assert png.headers.get("X-Page-Count") == "1"  # X-Page-Count only sent for fmt=png
    assert r.headers.get("X-Sig-Page") == "0"
    x, y = float(r.headers["X-Sig-X-Mm"]), float(r.headers["X-Sig-Y-Mm"])
    assert 0 < x < 210 and 0 < y < 297
    assert dt < 5


# Long letter: multipage, body text gets close to footer (BOTTOM_SAFE 28mm) but never under 22mm (footer zone)
@pytest.mark.parametrize("n", [20, 30, 45])
def test_long_body_close_to_footer_no_overlap(s, n):
    r, d, _ = preview(s, body(n))
    assert d.page_count >= 2
    png = s.post(f"{API}/letters/preview-pdf", params={"fmt": "png", "page": 1}, json=payload(body(n)))
    assert png.headers["X-Page-Count"] == str(d.page_count) and png.headers["X-Sig-Page"] == r.headers["X-Sig-Page"]
    assert int(r.headers["X-Sig-Page"]) == d.page_count - 1
    p0 = lowest_para_bottom_mm(d[0])
    print(f"n={n} pages={d.page_count} page0 lowest body line bottom={p0:.1f}mm")
    assert p0 is not None and 22 <= p0 <= 45, f"body bottom on page 1 at {p0}mm"
    # signature name on last page
    assert "TEST_SIGNAME" in d[-1].get_text() or "SIGNAME" in d[-1].get_text()


# Signature header y corresponds to where the signatory text actually is on sig page
def test_sig_header_matches_pdf(s):
    r, d, _ = preview(s, body(25))
    pg = d[int(r.headers["X-Sig-Page"])]
    H = pg.rect.height
    hits = [b for b in pg.get_text("blocks") if "SIGNAME" in b[4] or "عميد" in b[4]]
    assert hits, "signature text not found on sig page"
    y_mm = float(r.headers["X-Sig-Y-Mm"])
    tops = [b[1] / MM for b in hits] + [(H - b[3]) / MM for b in hits]
    print("sig y header", y_mm, "sig text candidates", tops)
    assert any(abs(t - y_mm) < 30 for t in tops)
    # sig/name must stay above footer zone (>=22mm from bottom)
    for b in hits:
        assert (H - b[3]) / MM >= 20


# Issue real letter: number/date/sig in final PDF; page count consistent with preview
def test_issue_and_pdf(s):
    b = body(22)
    rp, dp, _ = preview(s, b)
    r = s.post(f"{API}/letters/issue", json=payload(b, base_url=BASE))
    assert r.status_code == 200, r.text
    lid = r.json()["id"]
    p = s.get(f"{API}/letters/{lid}/pdf")
    assert p.status_code == 200 and p.headers["content-type"].startswith("application/pdf")
    d = pymupdf.open(stream=p.content, filetype="pdf")
    assert d.page_count == dp.page_count
    txt = "".join(pg.get_text() for pg in d)
    assert "SIGNAME" in d[-1].get_text()
    g = s.get(f"{API}/letters/{lid}").json()
    num = g.get("number_display") or ""
    assert num and any(ch.isdigit() for ch in num)
    assert "PARA21" in txt
    s.post(f"{API}/letters/{lid}/revoke", json={"reason": "TEST cleanup"})


# Overtime letters: existing letters still render via shared engine
def test_overtime_letters_pdf(s):
    r = s.get(f"{API}/reports/teacher-workload/letters")
    assert r.status_code == 200
    items = r.json()["items"]
    if not items:
        pytest.skip("no overtime letters")
    for it in items[:3]:
        lid = it["letter_id"]
        p = s.get(f"{API}/letters/{lid}/pdf")
        assert p.status_code == 200, p.text[:200]
        d = pymupdf.open(stream=p.content, filetype="pdf")
        assert d.page_count >= 1
        pa = s.get(f"{API}/letters/{lid}/pdf-with-attachments")
        assert pa.status_code == 200
        da = pymupdf.open(stream=pa.content, filetype="pdf")
        assert da.page_count >= d.page_count
        print(lid, it["status"], "pages", d.page_count, "with att", da.page_count)


# HR letters (separate hr_letter_pdf engine) still render
def test_hr_letters_pdf(s):
    r = s.get(f"{API}/hr/letters")
    assert r.status_code == 200, r.text[:200]
    js = r.json()
    items = js.get("items", js) if isinstance(js, dict) else js
    lid = next((x.get("id") or x.get("_id") for x in items if x.get("status") in ("approved", "issued")), None)
    if not lid:
        pytest.skip("no approved HR letter")
    p = s.get(f"{API}/hr/letters/{lid}/pdf")
    assert p.status_code == 200
    assert pymupdf.open(stream=p.content, filetype="pdf").page_count >= 1


# Overtime: create a draft via raise-letter, render PDF (shared engine) + with attachments, preview-pdf of its body, then delete
def test_overtime_raise_letter_pdf(s):
    r = s.post(f"{API}/reports/teacher-workload/raise-letter", json={
        "template_key": "presidency", "start_date": "2025-01-01", "end_date": "2025-12-31", "hide_empty": False,
        "recipient": {"title": "TEST نائب الرئيس"}, "mode": "amend", "tag_previous": True, "base_url": BASE})
    if r.status_code == 400:
        pytest.skip(r.text[:200])
    assert r.status_code == 200, r.text[:300]
    lid = r.json()["letter_id"]
    try:
        p = s.get(f"{API}/letters/{lid}/pdf")
        assert p.status_code == 200, p.text[:200]
        d = pymupdf.open(stream=p.content, filetype="pdf")
        print("overtime draft pages", d.page_count)
        assert d.page_count >= 1
        H = d[0].rect.height
        pa = s.get(f"{API}/letters/{lid}/pdf-with-attachments")
        assert pa.status_code == 200
        assert pymupdf.open(stream=pa.content, filetype="pdf").page_count > d.page_count
        reg = s.get(f"{API}/reports/teacher-workload/letters").json()["items"]
        assert any(x["letter_id"] == lid for x in reg)
    finally:
        s.delete(f"{API}/letters/{lid}")
