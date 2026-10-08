"""Letters module – Page Layout Sections (TipTap sections) regression tests.

Scope:
- GET /api/letters/section-defaults keys
- POST /api/letters/preview-pdf with letterhead_override.sections
- Letterhead sections fallback: when sections omitted, saved letterheads.sections apply
- Draft creation inherits letterhead sections if not sent in body
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

MARKER = "تحية_اختبار_777_UNIQUE_LH"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def default_lh(H):
    r = requests.get(f"{API}/letterheads", headers=H, timeout=30)
    assert r.status_code == 200, r.text
    lhs = r.json()
    assert lhs, "No letterheads available"
    default = next((x for x in lhs if x.get("is_default")), lhs[0])
    return default


def test_section_defaults_keys(H):
    r = requests.get(f"{API}/letters/section-defaults", headers=H, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ("sections", "system", "labels", "keys"):
        assert k in data, f"missing key {k} in section-defaults"
    assert isinstance(data["sections"], dict)
    assert isinstance(data["keys"], list)


def test_preview_pdf_with_letterhead_override_sections(H, default_lh):
    payload = {
        "subject": "اختبار معاينة",
        "body": "<p>نص المتن للاختبار</p>",
        "recipient": {"title": "المدير", "name": "فلان"},
        "people": [],
        "letterhead_id": default_lh["id"],
        "letterhead_override": {"sections": {"greeting": f"<p>{MARKER}</p>"}},
    }
    r = requests.post(f"{API}/letters/preview-pdf", params={"fmt": "png"}, json=payload, headers=H, timeout=60)
    assert r.status_code == 200, f"preview-pdf failed: {r.status_code} {r.text[:300]}"
    assert r.headers.get("content-type", "").startswith("image/"), r.headers


def test_letterhead_sections_fallback_in_draft(H, default_lh):
    """PATCH letterhead sections -> create draft WITHOUT sections -> GET draft -> sections.greeting == marker"""
    lh_id = default_lh["id"]
    # Save original to restore
    r = requests.get(f"{API}/letterheads", headers=H, timeout=30)
    orig = next(x for x in r.json() if x["id"] == lh_id)
    orig_sections = orig.get("sections") or {}

    try:
        # Patch sections with marker
        patch = requests.patch(
            f"{API}/letterheads/{lh_id}/sections",
            json={"sections": {"greeting": f"<p>{MARKER}</p>"}},
            headers=H,
            timeout=30,
        )
        assert patch.status_code == 200, patch.text

        # preview-pdf WITHOUT sections -> should still return PNG
        prev = requests.post(
            f"{API}/letters/preview-pdf",
            params={"fmt": "png"},
            json={
                "subject": "اختبار",
                "body": "<p>متن</p>",
                "recipient": {"title": "المدير", "name": "فلان"},
                "people": [],
                "letterhead_id": lh_id,
            },
            headers=H,
            timeout=60,
        )
        assert prev.status_code == 200, prev.text[:300]

        # Create draft WITHOUT sections key -> fallback should apply
        draft = requests.post(
            f"{API}/letters/draft",
            json={
                "subject": "اختبار تطبيق أقسام الكليشة",
                "body": "<p>متن اختبار</p>",
                "recipient": {"title": "المدير", "name": "فلان"},
                "people": [],
                "letterhead_id": lh_id,
                "base_url": BASE_URL,
            },
            headers=H,
            timeout=30,
        )
        assert draft.status_code == 200, draft.text
        did = draft.json()["id"]

        try:
            got = requests.get(f"{API}/letters/{did}", headers=H, timeout=30)
            assert got.status_code == 200, got.text
            d = got.json()
            inputs_sections = (d.get("inputs") or {}).get("sections") or {}
            doc_sections = d.get("sections") or {}
            # At least one should contain the marker
            combined = str(inputs_sections) + str(doc_sections)
            assert MARKER in combined, f"Letterhead sections fallback did not apply. inputs.sections={inputs_sections} sections={doc_sections}"
        finally:
            requests.delete(f"{API}/letters/{did}", headers=H, timeout=30)
    finally:
        # Restore original sections
        requests.patch(
            f"{API}/letterheads/{lh_id}/sections",
            json={"sections": orig_sections},
            headers=H,
            timeout=30,
        )


def test_preview_pdf_returns_200_png_with_override(H, default_lh):
    r = requests.post(
        f"{API}/letters/preview-pdf",
        params={"fmt": "png"},
        json={
            "subject": "س",
            "body": "<p>م</p>",
            "recipient": {"title": "ت", "name": "ن"},
            "people": [],
            "letterhead_id": default_lh["id"],
            "letterhead_override": {"sections": {"greeting": "<p>مرحبا</p>"}},
        },
        headers=H,
        timeout=60,
    )
    assert r.status_code == 200
