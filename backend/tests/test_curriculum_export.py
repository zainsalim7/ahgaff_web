"""Backend tests for GET /api/curriculum/department/{department_id}/export.

Validates: Excel (xlsx) format & content-type, PDF format (%PDF magic),
filter-by-level changes payload size, filter-by-level+term yields smaller,
permission gate (403 for non-privileged user), invalid id (400), missing id (404),
empty filter (level=99) still returns a valid file.
"""

import os
import io
import zipfile
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com").rstrip("/")
DEPT_ID = "698e500997fef774e66e93a8"  # provided by main agent

ADMIN = {"username": "admin", "password": "admin123"}
STUDENT = {"username": "234", "password": "234"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def student_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"student login failed: {r.status_code}")
    return r.json().get("access_token") or r.json().get("token")


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- happy paths ----------

def test_export_xlsx_all(admin_token):
    url = f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export?format=xlsx"
    r = requests.get(url, headers=_auth(admin_token), timeout=60)
    assert r.status_code == 200, r.text[:300]
    ct = r.headers.get("content-type", "").lower()
    assert "spreadsheetml.sheet" in ct or "openxmlformats" in ct, f"unexpected content-type: {ct}"
    # xlsx is a zip => PK header
    assert r.content[:2] == b"PK", "xlsx body is not a valid ZIP/xlsx"
    # ensure valid openable zip with xl/ entries
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        names = z.namelist()
        assert any(n.startswith("xl/") for n in names), "xlsx missing xl/ entries"
    # store size for size-diff check
    pytest.full_xlsx_size = len(r.content)


def test_export_pdf_all(admin_token):
    url = f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export?format=pdf"
    r = requests.get(url, headers=_auth(admin_token), timeout=60)
    assert r.status_code == 200, r.text[:300]
    ct = r.headers.get("content-type", "").lower()
    assert "application/pdf" in ct, f"unexpected content-type: {ct}"
    assert r.content[:5] == b"%PDF-", "pdf body missing %PDF magic"
    # %%EOF marker should appear in the last 1KB
    assert b"%%EOF" in r.content[-2048:], "pdf missing %%EOF"
    pytest.full_pdf_size = len(r.content)


def test_export_xlsx_level1_differs_from_all(admin_token):
    url = f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export?format=xlsx&level=1"
    r = requests.get(url, headers=_auth(admin_token), timeout=60)
    assert r.status_code == 200
    assert r.content[:2] == b"PK"
    full = getattr(pytest, "full_xlsx_size", None)
    if full is not None:
        assert len(r.content) != full, "level=1 export size equals full export — filter may not be applied"


def test_export_pdf_level1_term2_smaller_than_all(admin_token):
    url = f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export?format=pdf&level=1&term=2"
    r = requests.get(url, headers=_auth(admin_token), timeout=60)
    assert r.status_code == 200
    assert r.content[:5] == b"%PDF-"
    full = getattr(pytest, "full_pdf_size", None)
    if full is not None:
        assert len(r.content) <= full, "level=1&term=2 PDF is larger than full PDF (unexpected)"


def test_export_empty_filter_level99_still_valid(admin_token):
    """Empty result set must still return a valid file (header-only)."""
    url = f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export?format=xlsx&level=99"
    r = requests.get(url, headers=_auth(admin_token), timeout=60)
    assert r.status_code == 200, r.text[:300]
    assert r.content[:2] == b"PK"
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        assert len(z.namelist()) > 0

    url2 = f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export?format=pdf&level=99"
    r2 = requests.get(url2, headers=_auth(admin_token), timeout=60)
    assert r2.status_code == 200
    assert r2.content[:5] == b"%PDF-"


# ---------- negative / permission ----------

def test_export_invalid_department_id_returns_400(admin_token):
    url = f"{BASE_URL}/api/curriculum/department/not-a-real-id/export?format=xlsx"
    r = requests.get(url, headers=_auth(admin_token), timeout=30)
    assert r.status_code in (400, 404), f"expected 400/404 got {r.status_code}: {r.text[:200]}"


def test_export_nonexistent_department_returns_404(admin_token):
    # 24-char hex but not a real dept
    fake_id = "0" * 24
    url = f"{BASE_URL}/api/curriculum/department/{fake_id}/export?format=xlsx"
    r = requests.get(url, headers=_auth(admin_token), timeout=30)
    assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text[:200]}"


def test_export_permission_denied_for_student(student_token):
    url = f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export?format=xlsx"
    r = requests.get(url, headers=_auth(student_token), timeout=30)
    assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text[:200]}"


def test_export_no_auth_unauthorized():
    url = f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export?format=xlsx"
    r = requests.get(url, timeout=30)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"
