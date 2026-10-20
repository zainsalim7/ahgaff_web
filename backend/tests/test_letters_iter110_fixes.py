# Letters module re-test (iteration 110): long letter content loss fix, template invalid id 404, reversed number search, letterhead defaults
import os
import re
import pytest
import requests
import pymupdf

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
LH_ID = "6ac66145ff8dc59d8f539a1c"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    r = ses.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    ses.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return ses


def _body(n):
    return "".join(f"<p>P{i:02d} فقرة رقم {i} — هذا نص تجريبي طويل لاختبار انتقال الصفحات وترقيمها في الخطاب الرسمي مع التأكد من عدم وجود فراغ كبير أسفل الصفحة.</p>" for i in range(n))


def _markers(pdf):
    d = pymupdf.open(stream=pdf, filetype="pdf")
    found = {}
    for pi, p in enumerate(d):
        for w in p.get_text("words"):
            m = re.search(r"P(\d\d)", w[4])
            if m:
                found.setdefault(int(m.group(1)), (pi + 1, w[3]))
    return d.page_count, found


# --- Long body: no paragraph loss, none drawn into footer zone (BOTTOM_SAFE=54mm => y <= ~689pt from top)
class TestLongLetter:
    @pytest.mark.parametrize("n", [40, 45])
    def test_all_paragraphs_present(self, s, n):
        r = s.post(f"{API}/letters/preview-pdf", params={"fmt": "pdf"}, json={"subject": "TEST_long", "body": _body(n), "recipient": {"name": "TEST", "title": "عميد"}})
        assert r.status_code == 200
        pages, found = _markers(r.content)
        assert 4 <= pages <= 5, f"pages={pages}"
        assert sorted(found) == list(range(n)), f"missing={[i for i in range(n) if i not in found]}"
        assert all(bottom < 842 - 150 for _, bottom in found.values()), "text drawn into footer zone"
        txt = [p.get_text() for p in pymupdf.open(stream=r.content, filetype="pdf")]
        for i, t in enumerate(txt, 1):
            assert f"{i}/{pages}" in t or f"{pages}/{i}" in t

    def test_draft_long_pdf(self, s):
        r = s.post(f"{API}/letters/draft", json={"subject": "TEST_long_draft", "body": _body(45), "recipient": {"name": "TEST", "title": "عميد"}})
        lid = r.json()["id"]
        try:
            p = s.get(f"{API}/letters/{lid}/pdf")
            assert p.status_code == 200
            pages, found = _markers(p.content)
            assert sorted(found) == list(range(45)) and pages >= 4
        finally:
            s.delete(f"{API}/letters/{lid}")


# --- Template invalid id -> 404
class TestTemplateInvalidId:
    def test_put_invalid(self, s):
        r = s.put(f"{API}/letter-templates/notanid", json={"name": "TEST_x", "subject": "x", "body": "<p>b</p>"})
        assert r.status_code == 404 and r.json()["detail"] == "القالب غير موجود"

    def test_delete_invalid(self, s):
        r = s.delete(f"{API}/letter-templates/notanid")
        assert r.status_code == 404


# --- Reversed-number search
class TestReversedSearch:
    def test_reversed_number(self, s):
        rows = [x for x in s.get(f"{API}/letters", params={"status": "issued"}).json() if x.get("number_display") and x["number_display"][::-1] != x["number_display"]]
        if not rows:
            pytest.skip("no issued letters")
        num = rows[0]["number_display"]
        res = s.get(f"{API}/letters", params={"q": num[::-1]}).json()
        assert any(x["id"] == rows[0]["id"] for x in res), f"reversed {num[::-1]} not found"
        res2 = s.get(f"{API}/letters", params={"q": num}).json()
        assert any(x["id"] == rows[0]["id"] for x in res2)


# --- Default letterhead is clean (no leftover test signature)
def test_letterhead_clean(s):
    full = s.get(f"{API}/letterheads/{LH_ID}").json()
    assert "signature" not in (full.get("sections") or {})
