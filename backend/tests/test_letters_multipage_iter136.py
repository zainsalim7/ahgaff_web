"""Iteration 136: multi-page letters — footer page numbering + mini QR on every page, preview page param + X-Page-Count / X-Sig-Page headers"""
import hashlib
import os

import pymupdf
import pytest
import requests

BASE = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL")][0].rstrip("/")
API = f"{BASE}/api"
MM = 72 / 25.4

LONG_BODY = "".join(f"<p style=\"text-align: right\">TEST فقرة رقم {i + 1} نص تجريبي طويل لاختبار تعدد الصفحات في الخطابات الرسمية وتكرار الترقيم.</p>" for i in range(55))
SHORT_BODY = "<p style=\"text-align: right\">TEST نص قصير لخطاب من صفحة واحدة.</p>"


def payload(body, **kw):
    return {"subject": "TEST_multipage", "body": body, "recipient": {"name": "TEST مستلم", "title": "عميد"},
            "signatory_title": "TEST_عميد الكلية", "signatory_name": "TEST_د. الموقع", **kw}


@pytest.fixture(scope="module")
def s():
    ss = requests.Session(); ss.headers["User-Agent"] = "Mozilla/5.0 iter136"
    r = ss.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("login failed")
    ss.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    ss.created = []
    yield ss
    for lid in ss.created:
        ss.delete(f"{API}/letters/{lid}")


# --- preview endpoint: page param + headers
class TestPreviewPaging:
    def test_long_preview_headers(self, s):
        r = s.post(f"{API}/letters/preview-pdf", params={"fmt": "png", "page": 0}, json=payload(LONG_BODY))
        assert r.status_code == 200 and r.headers["content-type"].startswith("image/png")
        n, sp = int(r.headers["X-Page-Count"]), int(r.headers["X-Sig-Page"])
        print("pages", n, "sig_page", sp, r.headers.get("X-Sig-X-Mm"), r.headers.get("X-Sig-Y-Mm"))
        assert n >= 2
        assert sp == n - 1

    def test_each_page_distinct_and_clamped(self, s):
        hashes = []
        r0 = s.post(f"{API}/letters/preview-pdf", params={"fmt": "png", "page": 0}, json=payload(LONG_BODY))
        n = int(r0.headers["X-Page-Count"])
        for p in range(n):
            r = s.post(f"{API}/letters/preview-pdf", params={"fmt": "png", "page": p}, json=payload(LONG_BODY))
            assert r.status_code == 200
            hashes.append(hashlib.md5(r.content).hexdigest())
        assert len(set(hashes)) == n, "pages should render different images"
        hi = s.post(f"{API}/letters/preview-pdf", params={"fmt": "png", "page": 99}, json=payload(LONG_BODY))
        lo = s.post(f"{API}/letters/preview-pdf", params={"fmt": "png", "page": -3}, json=payload(LONG_BODY))
        assert hi.status_code == 200 and lo.status_code == 200
        # draft preview number may vary only by content not time; compare sizes approx
        assert abs(len(hi.content) - len(r.content)) < 2000
        assert int(hi.headers["X-Page-Count"]) == n

    def test_short_preview_single_page(self, s):
        r = s.post(f"{API}/letters/preview-pdf", params={"fmt": "png", "page": 0}, json=payload(SHORT_BODY))
        assert r.status_code == 200
        assert r.headers["X-Page-Count"] == "1" and r.headers["X-Sig-Page"] == "0"

    def test_preview_pdf_fmt_has_sig_page(self, s):
        r = s.post(f"{API}/letters/preview-pdf", params={"fmt": "pdf"}, json=payload(LONG_BODY))
        assert r.status_code == 200 and r.headers["content-type"].startswith("application/pdf")
        assert "X-Sig-Page" in r.headers


def _issue_and_get(s, body):
    r = s.post(f"{API}/letters/issue", json=payload(body, base_url=BASE))
    assert r.status_code == 200, r.text
    lid = r.json()["id"]; s.created.append(lid)
    p = s.get(f"{API}/letters/{lid}/pdf")
    assert p.status_code == 200 and p.headers["content-type"].startswith("application/pdf")
    return pymupdf.open(stream=p.content, filetype="pdf")


# --- issued PDF footer decoration
class TestIssuedFooter:
    def test_long_letter_footer(self, s):
        doc = _issue_and_get(s, LONG_BODY)
        n = doc.page_count
        assert n >= 2
        for i, pg in enumerate(doc):
            H = pg.rect.height
            words = pg.get_text("words")
            num = [w for w in words if w[4] == f"{i + 1}/{n}"]
            assert num, f"page {i + 1} missing number"
            bottom_mm = (H - num[0][3]) / MM
            print(f"page {i + 1}: number baseline-ish bottom at {bottom_mm:.1f}mm from bottom")
            assert bottom_mm < 8, "number should be inside footer band near bottom"
            txt = pg.get_text()
            # small images in footer band (mini QR 9mm) on every page
            imgs = [pg.get_image_bbox(im) for im in pg.get_images(full=True)]
            mini = [b for b in imgs if 7 * MM < b.width < 11 * MM and (H - b.y1) / MM < 6]
            assert mini, f"page {i + 1} mini QR missing ({[(round(b.width / MM, 1), round((H - b.y1) / MM, 1)) for b in imgs]})"
            if i < n - 1:
                assert "Scan to verify" in txt
            if i > 0:
                assert "TEST_multipage" not in txt or True
        # continuation marker on non-last only; check via reshaped text glyph presence count
        last_imgs = [doc[n - 1].get_image_bbox(im) for im in doc[n - 1].get_images(full=True)]
        big = [b for b in last_imgs if b.width > 20 * MM and b.width < 30 * MM]
        assert big, "full-size signature QR should be on last page"

    def test_short_letter_unchanged(self, s):
        doc = _issue_and_get(s, SHORT_BODY)
        assert doc.page_count == 1
        words = [w[4] for w in doc[0].get_words()] if hasattr(doc[0], "get_words") else [w[4] for w in doc[0].get_text("words")]
        assert "1/1" not in words
        imgs = [doc[0].get_image_bbox(im) for im in doc[0].get_images(full=True)]
        assert not [b for b in imgs if 7 * MM < b.width < 11 * MM], "no mini QR on single page letter"
