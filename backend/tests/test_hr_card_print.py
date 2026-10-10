"""Tests for HR Card Print endpoints (/api/hr/cards/*)"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def teacher_headers():
    r = requests.post(f"{API}/auth/login", json={"username": "teacher180156", "password": "teacher123"})
    if r.status_code != 200:
        pytest.skip("teacher login failed")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---------- Print Settings ----------
class TestPrintSettings:
    def test_get_print_settings_admin(self, admin_headers):
        r = requests.get(f"{API}/hr/cards/print-settings", headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("card_w", "card_h", "card1_x", "card1_y", "card2_x", "card2_y", "orientation"):
            assert k in d, f"missing {k}"

    def test_get_print_settings_teacher_forbidden(self, teacher_headers):
        r = requests.get(f"{API}/hr/cards/print-settings", headers=teacher_headers)
        assert r.status_code == 403


# ---------- Batch Preview ----------
class TestBatchPreview:
    def test_preview_default(self, admin_headers):
        r = requests.post(f"{API}/hr/cards/batch-preview", json={}, headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "rows" in d and "summary" in d
        s = d["summary"]
        for k in ("total", "included", "pages", "excluded_printed", "excluded_no_photo", "excluded_manual"):
            assert k in s
        if d["rows"]:
            row = d["rows"][0]
            for k in ("id", "full_name", "number", "has_photo", "included", "reason"):
                assert k in row

    def test_preview_exclude_printed(self, admin_headers):
        r = requests.post(f"{API}/hr/cards/batch-preview", json={"exclude_printed": True}, headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()["rows"]
        for row in rows:
            if row.get("printed_at"):
                assert not row["included"]
                assert "طُبعت" in row["reason"]

    def test_preview_only_with_photo(self, admin_headers):
        r = requests.post(f"{API}/hr/cards/batch-preview", json={"only_with_photo": True}, headers=admin_headers)
        assert r.status_code == 200
        for row in r.json()["rows"]:
            if not row["has_photo"]:
                assert not row["included"]
                assert row["reason"] == "لا توجد صورة معتمدة"

    def test_preview_exclude_ids(self, admin_headers):
        r = requests.post(f"{API}/hr/cards/batch-preview", json={}, headers=admin_headers)
        rows = r.json()["rows"]
        if not rows:
            pytest.skip("no employees")
        eid = rows[0]["id"]
        r2 = requests.post(f"{API}/hr/cards/batch-preview", json={"exclude_ids": [eid]}, headers=admin_headers)
        assert r2.status_code == 200
        match = [x for x in r2.json()["rows"] if x["id"] == eid]
        assert match and not match[0]["included"]
        assert match[0]["reason"] == "مستبعد يدوياً"

    def test_preview_search(self, admin_headers):
        r = requests.post(f"{API}/hr/cards/batch-preview", json={"q": "zzzzz_no_match"}, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["summary"]["total"] == 0

    def test_preview_employee_ids_mode(self, admin_headers):
        rp = requests.post(f"{API}/hr/cards/batch-preview", json={}, headers=admin_headers).json()
        if not rp["rows"]:
            pytest.skip("no employees")
        eid = rp["rows"][0]["id"]
        r = requests.post(f"{API}/hr/cards/batch-preview", json={"employee_ids": [eid]}, headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()["rows"]
        assert len(rows) == 1 and rows[0]["id"] == eid


# ---------- Batches ----------
class TestBatches:
    def test_list_batches(self, admin_headers):
        r = requests.get(f"{API}/hr/cards/batches", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and isinstance(d["items"], list)
        for b in d["items"]:
            assert "employees" not in b
            assert "employee_ids" not in b

    def test_get_batch_not_found(self, admin_headers):
        r = requests.get(f"{API}/hr/cards/batches/999999", headers=admin_headers)
        assert r.status_code == 404

    def test_reset_batch_not_found(self, admin_headers):
        r = requests.post(f"{API}/hr/cards/batches/999999/reset", headers=admin_headers)
        assert r.status_code == 404


# ---------- Full batch PDF cycle ----------
class TestBatchPdfCycle:
    def test_batch_pdf_and_reset_and_reprint(self, admin_headers):
        # reset existing batch #1 first to free employees
        batches = requests.get(f"{API}/hr/cards/batches", headers=admin_headers).json()["items"]
        for b in batches:
            requests.post(f"{API}/hr/cards/batches/{b['batch_no']}/reset", headers=admin_headers)

        prev = requests.post(f"{API}/hr/cards/batch-preview",
                             json={"exclude_printed": True, "only_with_photo": True},
                             headers=admin_headers).json()
        if prev["summary"]["included"] == 0:
            pytest.skip("no eligible employees with photo")

        r = requests.post(f"{API}/hr/cards/batch-pdf", json={
            "exclude_printed": True, "only_with_photo": True, "orientation": "auto",
            "settings": {"card_w": 85.6, "card_h": 54, "card1_x": 62, "card1_y": 40, "card2_x": 62, "card2_y": 180}
        }, headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        batch_no = r.headers.get("x-batch-no")
        assert batch_no is not None
        assert int(r.headers.get("x-batch-count")) >= 1

        # GET single
        g = requests.get(f"{API}/hr/cards/batches/{batch_no}", headers=admin_headers)
        assert g.status_code == 200
        bd = g.json()
        assert "employees" in bd and "employee_ids" in bd
        assert bd["count"] >= 1

        # Reprint
        rp = requests.post(f"{API}/hr/cards/batch-pdf",
                           json={"reprint_batch_no": int(batch_no)}, headers=admin_headers)
        assert rp.status_code == 200
        assert rp.headers.get("content-type", "").startswith("application/pdf")
        # should NOT create new batch
        assert rp.headers.get("x-batch-no") is None

        # Reset
        rs = requests.post(f"{API}/hr/cards/batches/{batch_no}/reset", headers=admin_headers)
        assert rs.status_code == 200
        assert "modified" in rs.json()

    def test_batch_pdf_empty_filter(self, admin_headers):
        r = requests.post(f"{API}/hr/cards/batch-pdf", json={"q": "zzz_nothing"}, headers=admin_headers)
        assert r.status_code == 400


# ---------- Print Report ----------
class TestPrintReport:
    def test_print_report_xlsx(self, admin_headers):
        r = requests.get(f"{API}/hr/cards/print-report", headers=admin_headers)
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", "")
        assert len(r.content) > 100


# ---------- Back settings ----------
class TestBack:
    def test_get_back_settings(self, admin_headers):
        r = requests.get(f"{API}/hr/cards/back-settings", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "lines" in d and "title" in d and "defaults" in d

    def test_put_back_settings_caps_lines(self, admin_headers):
        payload = {"lines": [f"line {i}" for i in range(15)], "title": "اختبار الخلفية"}
        r = requests.put(f"{API}/hr/cards/back-settings", json=payload, headers=admin_headers)
        assert r.status_code == 200
        assert len(r.json()["lines"]) <= 10

    def test_back_preview_png(self, admin_headers):
        r = requests.get(f"{API}/hr/cards/back-preview", headers=admin_headers)
        assert r.status_code == 200
        assert r.headers.get("content-type") == "image/png"

    def test_batch_back_pdf_count(self, admin_headers):
        # ensure enabled
        requests.put(f"{API}/hr/cards/back-settings", json={"enabled": True}, headers=admin_headers)
        r = requests.post(f"{API}/hr/cards/batch-back-pdf", json={"count": 2, "orientation": "auto"}, headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")

    def test_batch_back_pdf_disabled(self, admin_headers):
        requests.put(f"{API}/hr/cards/back-settings", json={"enabled": False}, headers=admin_headers)
        r = requests.post(f"{API}/hr/cards/batch-back-pdf", json={"count": 1}, headers=admin_headers)
        assert r.status_code == 400
        # re-enable
        requests.put(f"{API}/hr/cards/back-settings", json={"enabled": True}, headers=admin_headers)


# ---------- Sample preview ----------
class TestSamplePreview:
    def test_sample_preview_valid(self, admin_headers):
        r = requests.get(f"{API}/hr/cards/sample-preview", params={"template": "dark", "font": "cairo"}, headers=admin_headers)
        assert r.status_code == 200
        assert r.headers.get("content-type") == "image/png"

    def test_sample_preview_invalid_template_fallback(self, admin_headers):
        r = requests.get(f"{API}/hr/cards/sample-preview", params={"template": "bogus_tpl"}, headers=admin_headers)
        assert r.status_code == 200
        assert r.headers.get("content-type") == "image/png"


# ---------- /hr/card-settings regression ----------
class TestCardSettings:
    def test_get_card_settings(self, admin_headers):
        r = requests.get(f"{API}/hr/card-settings", headers=admin_headers)
        assert r.status_code == 200
        assert "template" in r.json()

    def test_put_card_settings(self, admin_headers):
        r = requests.put(f"{API}/hr/card-settings", json={"template": "dark"}, headers=admin_headers)
        assert r.status_code == 200
        assert r.json().get("template") == "dark"


# ---------- Student batch regression ----------
class TestStudentBatchRegression:
    def test_student_batches_list(self, admin_headers):
        r = requests.get(f"{API}/cards/batches", headers=admin_headers)
        # should not 404 or 500
        assert r.status_code in (200, 403), r.text
