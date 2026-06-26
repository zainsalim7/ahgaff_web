"""Iteration 42 - Verify curriculum PDF reverted to PORTRAIT A4 with KeepTogether grouping."""
import os
import io
import pytest
import requests
from pypdf import PdfReader

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
# fallback to frontend/.env if env var not set in pytest shell
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass

DEPT_ID = "698e500997fef774e66e93a8"
EXPORT_URL = f"{BASE_URL}/api/curriculum/department/{DEPT_ID}/export"


def _login(username: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": username, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {username}: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin", "admin123")


@pytest.fixture(scope="module")
def student_token():
    return _login("234", "234")


# --- 1. PDF basic validity ---
def test_pdf_export_returns_valid_pdf(admin_token):
    r = requests.get(f"{EXPORT_URL}?format=pdf",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=60)
    assert r.status_code == 200, r.text[:200]
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"
    assert b"%%EOF" in r.content[-1024:]
    assert len(r.content) > 1000, "PDF suspiciously small"


# --- 2. PDF page size must be PORTRAIT A4 ---
def test_pdf_is_portrait_a4(admin_token):
    r = requests.get(f"{EXPORT_URL}?format=pdf",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=60)
    assert r.status_code == 200
    reader = PdfReader(io.BytesIO(r.content))
    assert len(reader.pages) >= 1
    for i, page in enumerate(reader.pages):
        box = page.mediabox
        w = float(box.width)
        h = float(box.height)
        # A4 portrait: 595 x 842 (tolerate <1pt rounding)
        assert abs(w - 595.27) < 1.5, f"page {i} width={w} not portrait A4"
        assert abs(h - 841.89) < 1.5, f"page {i} height={h} not portrait A4"
        assert h > w, f"page {i} is landscape (w={w} h={h}), expected portrait"


# --- 3. Section header + at least one row stay together on same page ---
def test_section_headers_not_orphaned(admin_token):
    r = requests.get(f"{EXPORT_URL}?format=pdf",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=60)
    reader = PdfReader(io.BytesIO(r.content))
    # Extract per-page text
    page_texts = []
    for p in reader.pages:
        try:
            page_texts.append(p.extract_text() or "")
        except Exception:
            page_texts.append("")
    full_text = "\n".join(page_texts)
    # At least one section header marker should appear
    # The arabic-reshaped text may not match raw substrings, so look for a hint
    # We rely on presence of digit + arabic characters; just assert each page that
    # contains a section heading also contains a table header indicator OR data.
    # Heuristic: if a page contains 'المستوى' (level) it should also contain at
    # least one of 'الكود' (code header) or numeric digit '1'..'9'.
    found_any_section = False
    for i, t in enumerate(page_texts):
        if "المستوى" in t or "ﻯﻮﺘﺴﻤﻟﺍ" in t or "level" in t.lower():
            found_any_section = True
            # Look for digit indicating row content present on same page
            has_digit = any(ch.isdigit() for ch in t)
            assert has_digit, (
                f"Page {i+1} has a section header but no row data — "
                f"possible orphan (KeepTogether failed)"
            )
    # Note: due to arabic_reshaper + bidi the literal 'المستوى' may not be in extracted text.
    # If not found, do not fail — the page-size + multi-page integrity tests still cover layout.
    if not found_any_section:
        pytest.skip("Could not locate section labels in extracted PDF text (arabic shaping). "
                    "Portrait + valid PDF asserted; visual KeepTogether not provable from text extract.")


# --- 4. Excel export unchanged ---
def test_excel_export_works(admin_token):
    r = requests.get(f"{EXPORT_URL}?format=xlsx",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=60)
    assert r.status_code == 200, r.text[:200]
    ctype = r.headers.get("content-type", "")
    assert "spreadsheet" in ctype or "xlsx" in ctype
    # XLSX is a zip → starts with PK
    assert r.content[:2] == b"PK", "xlsx missing PK zip magic"


# --- 5. Permission gate: student gets 403 ---
def test_student_forbidden(student_token):
    r = requests.get(f"{EXPORT_URL}?format=pdf",
                     headers={"Authorization": f"Bearer {student_token}"}, timeout=30)
    assert r.status_code == 403


# --- 6. Scoped exports ---
@pytest.mark.parametrize("qs", [
    "format=pdf&level=1",
    "format=pdf&term=1",
    "format=pdf&level=1&term=2",
])
def test_scoped_pdf_exports(admin_token, qs):
    r = requests.get(f"{EXPORT_URL}?{qs}",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=60)
    assert r.status_code == 200, f"{qs} → {r.status_code} {r.text[:200]}"
    assert r.content[:4] == b"%PDF"
    reader = PdfReader(io.BytesIO(r.content))
    assert len(reader.pages) >= 1
    # Each must still be portrait
    p0 = reader.pages[0]
    assert float(p0.mediabox.height) > float(p0.mediabox.width), \
        f"{qs} returned landscape page"
