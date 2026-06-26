"""
Tests for iteration 41:
PDF curriculum export must be:
  - landscape A4 (842 x 595 pt)
  - side-by-side terms per level
  - one page per distinct level (no splits)
  - excel format unchanged
  - non-admin without manage_courses gets 403
"""
import io
import os
import pytest
import requests
from pypdf import PdfReader

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com").rstrip("/")
DEPT_ID = "698e500997fef774e66e93a8"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def student_token():
    # Try student to verify 403 (no manage_courses, no dean/dept_head role)
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "234", "password": "234"}, timeout=30)
    if r.status_code != 200:
        return None
    return r.json().get("access_token") or r.json().get("token")


# ---------- Backend: PDF export full department ----------
class TestCurriculumPdfFull:
    def test_pdf_full_export_status_and_headers(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export",
            params={"format": "pdf"}, headers=admin_headers, timeout=60,
        )
        assert r.status_code == 200, f"status {r.status_code} body={r.text[:300]}"
        assert "application/pdf" in r.headers.get("content-type", "").lower()
        assert r.content.startswith(b"%PDF-"), "missing %PDF- header"
        assert b"%%EOF" in r.content[-1024:], "missing %%EOF trailer"
        assert len(r.content) > 5 * 1024, f"PDF too small: {len(r.content)} bytes"

    def test_pdf_is_landscape_a4(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export",
            params={"format": "pdf"}, headers=admin_headers, timeout=60,
        )
        assert r.status_code == 200
        reader = PdfReader(io.BytesIO(r.content))
        assert len(reader.pages) >= 1
        for i, page in enumerate(reader.pages):
            w = float(page.mediabox.width)
            h = float(page.mediabox.height)
            # landscape A4 ~ 842 x 595
            assert w > h, f"page {i} not landscape: w={w} h={h}"
            assert abs(w - 842) < 5 and abs(h - 595) < 5, \
                f"page {i} not A4 landscape: w={w} h={h}"

    def test_pdf_pages_match_distinct_levels(self, admin_headers):
        # Get curriculum data to count distinct levels with data
        r2 = requests.get(
            f"{BASE_URL}/api/curriculum/courses",
            params={"department_id": DEPT_ID}, headers=admin_headers, timeout=30,
        )
        assert r2.status_code == 200
        items = r2.json().get("items", [])
        distinct_levels = sorted({c.get("level") for c in items if c.get("level")})
        assert distinct_levels, "no curriculum data present - cannot validate page count"

        r = requests.get(
            f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export",
            params={"format": "pdf"}, headers=admin_headers, timeout=60,
        )
        assert r.status_code == 200
        reader = PdfReader(io.BytesIO(r.content))
        num_pages = len(reader.pages)
        # Each level should fit in 1 page (KeepTogether + landscape).
        # Total pages should equal number of distinct levels.
        assert num_pages == len(distinct_levels), \
            f"pages={num_pages} but distinct levels={len(distinct_levels)} ({distinct_levels})"


# ---------- Backend: PDF filtered by level ----------
class TestCurriculumPdfFiltered:
    def test_pdf_single_level_one_page(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export",
            params={"format": "pdf", "level": 1}, headers=admin_headers, timeout=60,
        )
        assert r.status_code == 200, f"status {r.status_code} body={r.text[:300]}"
        assert r.content.startswith(b"%PDF-")
        reader = PdfReader(io.BytesIO(r.content))
        assert len(reader.pages) == 1, f"expected 1 page for level=1, got {len(reader.pages)}"
        # still landscape
        w = float(reader.pages[0].mediabox.width)
        h = float(reader.pages[0].mediabox.height)
        assert w > h


# ---------- Backend: Excel unchanged ----------
class TestCurriculumXlsx:
    def test_xlsx_still_works(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export",
            params={"format": "xlsx"}, headers=admin_headers, timeout=60,
        )
        assert r.status_code == 200
        ct = r.headers.get("content-type", "").lower()
        assert "spreadsheetml" in ct or "xlsx" in ct or "officedocument" in ct
        # zip-based xlsx file
        assert r.content[:2] == b"PK", "xlsx should start with PK (zip magic)"
        assert len(r.content) > 2 * 1024


# ---------- Backend: permission gate ----------
class TestPermissionGate:
    def test_student_forbidden(self, student_token):
        if not student_token:
            pytest.skip("student login not available")
        r = requests.get(
            f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export",
            params={"format": "pdf"},
            headers={"Authorization": f"Bearer {student_token}"}, timeout=30,
        )
        assert r.status_code == 403, f"expected 403 for student, got {r.status_code}"

    def test_unauthenticated_forbidden(self):
        r = requests.get(
            f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export",
            params={"format": "pdf"}, timeout=30,
        )
        assert r.status_code in (401, 403)
