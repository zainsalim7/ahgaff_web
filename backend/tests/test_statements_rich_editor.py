"""Backend tests for Statements rich-text editor + signatory from positions directory."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com").rstrip("/")
HEADERS = {"User-Agent": "Mozilla/5.0 (TestAgent)"}
STUDENT_ID = "698e57518cfb2f14627a285e"
POSITION_ID = "6ac51feeb2c965d595bd6ca3"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "admin", "password": "admin123"},
                      headers=HEADERS, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def hdrs(token):
    return {**HEADERS, "Authorization": f"Bearer {token}"}


# ---- fonts endpoint ----
def test_fonts_endpoint(hdrs):
    r = requests.get(f"{BASE_URL}/api/statements/fonts", headers=hdrs, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    fonts = data.get("fonts") or []
    keys = {f.get("key") for f in fonts}
    assert {"amiri", "kufi", "cairo", "tajawal", "almarai"}.issubset(keys), keys


# ---- positions directory sanity ----
def test_position_exists(hdrs):
    r = requests.get(f"{BASE_URL}/api/correspondence/positions?kind=INTERNAL", headers=hdrs, timeout=30)
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    ids = {p.get("id") for p in items}
    assert POSITION_ID in ids, f"position {POSITION_ID} missing; got {len(items)} positions"


# ---- template CRUD with signatory_position_id ----
@pytest.fixture(scope="module")
def created_template(hdrs):
    payload = {
        "name": "TEST_rich_template_agent",
        "body": '<p style="text-align: right"><span style="font-family: Cairo; font-size: 18pt"><strong>قالب اختبار</strong></span></p>',
        "signatory_position_id": POSITION_ID,
        "signatory_name": "",
        "signatory_title": "",
    }
    r = requests.post(f"{BASE_URL}/api/statement-templates", json=payload, headers=hdrs, timeout=30)
    assert r.status_code == 200, r.text
    tpl = r.json()
    yield tpl
    # cleanup
    tid = tpl.get("id")
    if tid:
        requests.delete(f"{BASE_URL}/api/statement-templates/{tid}", headers=hdrs, timeout=30)


def test_template_persists_signatory(hdrs, created_template):
    r = requests.get(f"{BASE_URL}/api/statement-templates", headers=hdrs, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    found = next((x for x in items if x.get("id") == created_template.get("id")), None)
    assert found is not None, "template not returned in list"
    assert found.get("signatory_position_id") == POSITION_ID


# ---- issue statement with rich body + signatory_position_id ----
def test_issue_statement_rich(hdrs):
    body = ('<p style="text-align: right">'
            '<span style="font-family: Cairo; font-size: 18pt"><strong>من طلاب {الكلية}</strong></span>'
            ' <u>{يدرس}</u> بالمستوى {المستوى}</p>')
    payload = {
        "student_id": STUDENT_ID,
        "body": body,
        "signatory_position_id": POSITION_ID,
        "template_name": "test",
    }
    r = requests.post(f"{BASE_URL}/api/statements/issue", json=payload, headers=hdrs, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    sid = data.get("id")
    assert sid, data

    # PDF
    r2 = requests.get(f"{BASE_URL}/api/statements/{sid}/pdf", headers=hdrs, timeout=90)
    assert r2.status_code == 200, r2.text[:300]
    ct = r2.headers.get("content-type", "")
    assert "application/pdf" in ct, ct
    size = len(r2.content)
    assert size > 20_000, f"PDF too small: {size} bytes"


# ---- regression: standard statement (no body) ----
def test_issue_statement_standard(hdrs):
    payload = {"student_id": STUDENT_ID}
    r = requests.post(f"{BASE_URL}/api/statements/issue", json=payload, headers=hdrs, timeout=60)
    assert r.status_code == 200, r.text
    sid = r.json().get("id")
    assert sid

    r2 = requests.get(f"{BASE_URL}/api/statements/{sid}/pdf", headers=hdrs, timeout=90)
    assert r2.status_code == 200
    assert "application/pdf" in r2.headers.get("content-type", "")


def test_list_statements(hdrs):
    r = requests.get(f"{BASE_URL}/api/statements", headers=hdrs, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "items" in data or isinstance(data, list)
