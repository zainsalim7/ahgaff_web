# Official Letters module: log filters, template name uniqueness, letterhead-only sections, QR layout, PDF numbering, overtime sheet PDF
import io
import os
import time
import pytest
import requests
import pymupdf

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    r = ses.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    ses.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return ses


def _pdf_text(content: bytes):
    d = pymupdf.open(stream=content, filetype="pdf")
    return d.page_count, [p.get_text() for p in d]


# --- Log list + status filters
class TestLog:
    def test_list_all(self, s):
        r = s.get(f"{API}/letters")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        for x in r.json()[:5]:
            assert "_id" not in x and "id" in x

    def test_status_draft(self, s):
        r = s.get(f"{API}/letters", params={"status": "draft"})
        assert r.status_code == 200
        assert all(x.get("status") == "draft" for x in r.json())

    def test_status_issued(self, s):
        r = s.get(f"{API}/letters", params={"status": "issued"})
        assert r.status_code == 200
        assert all(x.get("status") != "draft" and not x.get("is_revoked") for x in r.json())

    def test_status_revoked(self, s):
        r = s.get(f"{API}/letters", params={"status": "revoked"})
        assert r.status_code == 200
        assert all(x.get("is_revoked") is True for x in r.json())

    def test_counts_sum(self, s):
        tot = len(s.get(f"{API}/letters").json())
        parts = sum(len(s.get(f"{API}/letters", params={"status": k}).json()) for k in ("draft", "issued", "revoked"))
        if tot < 300:
            assert parts == tot, f"all={tot} parts={parts}"

    def test_q_by_number(self, s):
        rows = s.get(f"{API}/letters", params={"status": "issued"}).json()
        if not rows:
            pytest.skip("no issued letters")
        num = rows[0]["number_display"]
        r = s.get(f"{API}/letters", params={"q": num}).json()
        assert any(x["id"] == rows[0]["id"] for x in r)

    def test_date_filter(self, s):
        r = s.get(f"{API}/letters", params={"date_from": "2099-01-01"})
        assert r.status_code == 200 and r.json() == []


# --- Template name uniqueness
class TestTemplateUnique:
    ids = []

    def test_create_unique_then_duplicate(self, s):
        name = f"TEST_tpl_{int(time.time())}"
        r = s.post(f"{API}/letter-templates", json={"name": name, "subject": "x", "body": "<p>متن</p>"})
        assert r.status_code == 200, r.text
        TestTemplateUnique.ids.append(r.json()["id"])
        names = [t["name"] for t in s.get(f"{API}/letter-templates").json()]
        assert name in names
        d = s.post(f"{API}/letter-templates", json={"name": name, "subject": "y", "body": "<p>b</p>"})
        assert d.status_code == 400
        assert "يوجد قالب آخر بهذا الاسم" in d.json()["detail"]
        d2 = s.post(f"{API}/letter-templates", json={"name": name.lower(), "subject": "y", "body": "<p>b</p>"})
        assert d2.status_code == 400
        d3 = s.post(f"{API}/letter-templates", json={"name": f"  {name}  ", "subject": "y", "body": "<p>b</p>"})
        if d3.status_code == 200:
            TestTemplateUnique.ids.append(d3.json()["id"])
        assert d3.status_code == 400, "whitespace-padded duplicate accepted"

    def test_update_to_duplicate_name(self, s):
        name2 = f"TEST_tpl2_{int(time.time())}"
        r = s.post(f"{API}/letter-templates", json={"name": name2, "subject": "x", "body": "<p>متن</p>"})
        assert r.status_code == 200
        tid = r.json()["id"]; TestTemplateUnique.ids.append(tid)
        first = [t for t in s.get(f"{API}/letter-templates").json() if t["id"] == TestTemplateUnique.ids[0]][0]
        u = s.put(f"{API}/letter-templates/{tid}", json={"name": first["name"], "subject": "x", "body": "<p>متن</p>"})
        assert u.status_code == 400
        # same name (self) is allowed
        u2 = s.put(f"{API}/letter-templates/{tid}", json={"name": name2, "subject": "z", "body": "<p>متن</p>"})
        assert u2.status_code == 200

    def test_update_invalid_id(self, s):
        u = s.put(f"{API}/letter-templates/notanid", json={"name": "TEST_x", "subject": "x", "body": "<p>b</p>"})
        assert u.status_code in (400, 404), f"got {u.status_code}"

    @classmethod
    def teardown_class(cls):
        ses = requests.Session()
        tok = ses.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
        for i in cls.ids:
            ses.delete(f"{API}/letter-templates/{i}", headers={"Authorization": f"Bearer {tok}"})


# --- Closing/signature always from letterhead
class TestSectionsFromLetterhead:
    def test_signature_from_letterhead_even_with_template(self, s):
        lhs = s.get(f"{API}/letterheads").json()
        lhs = lhs if isinstance(lhs, list) else lhs.get("items", [])
        if not lhs:
            pytest.skip("no letterheads")
        lh = next((x for x in lhs if x.get("is_default")), lhs[0])
        full = s.get(f"{API}/letterheads/{lh['id']}").json()
        orig = full.get("sections") or {}
        marker = f"<p>TEST_SIG_{int(time.time())}</p>"
        tid = None
        try:
            p = s.patch(f"{API}/letterheads/{lh['id']}/sections", json={"sections": {**orig, "signature": marker, "closing": "<p>TEST_CLOSE</p>"}})
            assert p.status_code == 200, p.text
            t = s.post(f"{API}/letter-templates", json={"name": f"TEST_secs_{int(time.time())}", "subject": "x", "body": "<p>b</p>",
                                                         "sections": {"signature": "<p>TPL_SIG</p>", "closing": "<p>TPL_CLOSE</p>", "greeting": "<p>TPL_GREET</p>"}})
            assert t.status_code == 200, t.text
            tid = t.json()["id"]
            r = s.get(f"{API}/letters/section-defaults", params={"letterhead_id": lh["id"], "template_id": tid}).json()["sections"]
            assert r["signature"] == marker
            assert r["closing"] == "<p>TEST_CLOSE</p>"
            tpl_secs = s.get(f"{API}/letter-templates").json()
            saved = [x for x in tpl_secs if x["id"] == tid][0]
            if (saved.get("sections") or {}).get("greeting"):
                assert r["greeting"] == "<p>TPL_GREET</p>"
        finally:
            s.patch(f"{API}/letterheads/{lh['id']}/sections", json={"sections": orig})
            if tid:
                s.delete(f"{API}/letter-templates/{tid}")


# --- QR layout + long letter PDF numbering
LONG_BODY = "".join(f"<p>فقرة رقم {i} — هذا نص تجريبي طويل لاختبار انتقال الصفحات وترقيمها في الخطاب الرسمي مع التأكد من عدم وجود فراغ كبير أسفل الصفحة.</p>" for i in range(45))
BASE = {"subject": "TEST_اختبار", "body": "<p>متن قصير</p>", "recipient": {"name": "TEST", "title": "عميد"}}


class TestPreviewPdf:
    @pytest.mark.parametrize("layout", [{}, {"qr_enabled": False}, {"qr_style": "footer"}, {"qr_size": 14}])
    def test_preview_qr_variants(self, s, layout):
        r = s.post(f"{API}/letters/preview-pdf", params={"fmt": "pdf"}, json={**BASE, "layout": layout})
        assert r.status_code == 200, r.text[:300]
        assert r.content[:4] == b"%PDF"

    def test_preview_png_changes_with_qr(self, s):
        a = s.post(f"{API}/letters/preview-pdf", json={**BASE, "layout": {}}).content
        b = s.post(f"{API}/letters/preview-pdf", json={**BASE, "layout": {"qr_enabled": False}}).content
        assert a[:4] == b"\x89PNG" and b[:4] == b"\x89PNG"
        assert a != b

    def test_long_letter_page_numbers(self, s):
        r = s.post(f"{API}/letters/preview-pdf", params={"fmt": "pdf"}, json={**BASE, "body": LONG_BODY})
        assert r.status_code == 200
        n, texts = _pdf_text(r.content)
        assert n >= 2, f"pages={n}"
        for i, t in enumerate(texts, 1):
            assert f"{i}/{n}" in t or f"{n}/{i}" in t, f"page {i} missing numbering"


# --- Draft lifecycle: draft -> quick view GET -> PDF -> delete
class TestDraft:
    def test_draft_lifecycle(self, s):
        r = s.post(f"{API}/letters/draft", json={**BASE, "body": LONG_BODY})
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        try:
            g = s.get(f"{API}/letters/{lid}").json()
            assert g["status"] == "draft" and g["subject"] == "TEST_اختبار"
            assert any(x["id"] == lid for x in s.get(f"{API}/letters", params={"status": "draft"}).json())
            p = s.get(f"{API}/letters/{lid}/pdf")
            assert p.status_code == 200 and p.content[:4] == b"%PDF"
            n, _ = _pdf_text(p.content)
            assert n >= 2
        finally:
            d = s.delete(f"{API}/letters/{lid}")
            assert d.status_code == 200
        assert s.get(f"{API}/letters/{lid}").status_code == 404


# --- Overtime sheet / HR report PDF
class TestReportPdfs:
    def test_overtime_sheet_pdf(self, s):
        r = s.get(f"{API}/export/report/teacher-workload/sheet-pdf", timeout=120)
        assert r.status_code == 200, r.text[:300]
        assert r.content[:4] == b"%PDF"
        n, texts = _pdf_text(r.content)
        if n > 1:
            assert f"1/{n}" in texts[0] or f"{n}/1" in texts[0]

    def test_hr_annual_pdf(self, s):
        r = s.get(f"{API}/hr/reports/annual/export", params={"fmt": "pdf"}, timeout=120)
        assert r.status_code == 200, r.text[:300]
        assert r.content[:4] == b"%PDF"


# --- Regression: draft -> finalize -> docx -> revoke -> restore -> revoke (creates one revoked TEST_ letter)
class TestFinalizeRevoke:
    def test_finalize_revoke_restore(self, s):
        r = s.post(f"{API}/letters/draft", json={**BASE, "subject": "TEST_اعتماد_تجريبي"})
        lid = r.json()["id"]
        f = s.post(f"{API}/letters/{lid}/finalize")
        assert f.status_code == 200, f.text
        g = s.get(f"{API}/letters/{lid}").json()
        assert g["status"] != "draft" and g["number_display"] == f.json()["number"]
        assert s.get(f"{API}/letters/{lid}/docx").status_code == 200
        assert s.post(f"{API}/letters/{lid}/revoke").status_code == 200
        assert s.get(f"{API}/letters/{lid}").json()["is_revoked"] is True
        assert s.post(f"{API}/letters/{lid}/restore").status_code == 200
        assert s.get(f"{API}/letters/{lid}").json()["is_revoked"] is False
        s.post(f"{API}/letters/{lid}/revoke")
        assert s.delete(f"{API}/letters/{lid}").status_code == 400
