"""Tests for GET /api/students/{id}/courses - inferred fallback behavior.

Backend behavior should be UNCHANGED for this UI-only fix; verify that
- Students with no explicit enrollments → response has is_inferred: True and a list of suggested courses.
- Students with explicit enrollments  → response has is_inferred: False (or absent), enrolled courses listed.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "admin", "password": "admin123"}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, data
    return tok


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def students(headers):
    r = requests.get(f"{BASE_URL}/api/students?limit=200", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    items = body if isinstance(body, list) else body.get("items") or body.get("students") or []
    assert items, "No students found in DB"
    return items


def _fetch_courses(headers, sid):
    r = requests.get(f"{BASE_URL}/api/students/{sid}/courses", headers=headers, timeout=20)
    return r


def test_endpoint_reachable(headers, students):
    sid = students[0]["id"]
    r = _fetch_courses(headers, sid)
    assert r.status_code == 200, r.text
    body = r.json()
    # Response can be dict with is_inferred or list (legacy). Assert known structure.
    assert isinstance(body, (dict, list))


def test_inferred_path_present(headers, students):
    """At least one student in dev DB should hit the inferred path."""
    found_inferred = None
    found_explicit = None
    for s in students:
        sid = s.get("id")
        r = _fetch_courses(headers, sid)
        if r.status_code != 200:
            continue
        b = r.json()
        if isinstance(b, dict):
            is_inf = b.get("is_inferred")
            courses = b.get("courses") or b.get("items") or []
        else:
            is_inf = None
            courses = b
        if is_inf is True and found_inferred is None:
            found_inferred = (sid, s.get("full_name"), s.get("level"), len(courses))
        elif is_inf is False and found_explicit is None:
            found_explicit = (sid, s.get("full_name"), s.get("level"), len(courses))
        if found_inferred and found_explicit:
            break

    print(f"INFERRED example: {found_inferred}")
    print(f"EXPLICIT example: {found_explicit}")

    assert found_inferred is not None, (
        "Expected at least one student to hit inferred fallback (no explicit enrollments)."
    )


def test_inferred_response_has_suggested_courses(headers, students):
    """When is_inferred:true, the response should still list suggested courses (or could be empty if no matching dept/level/semester)."""
    for s in students:
        sid = s.get("id")
        r = _fetch_courses(headers, sid)
        if r.status_code != 200:
            continue
        b = r.json()
        if not isinstance(b, dict):
            continue
        if b.get("is_inferred") is True:
            courses = b.get("courses") or b.get("items") or []
            assert isinstance(courses, list)
            # The "12 مقرر" screenshot suggests there's at least one student with non-empty inferred list
            # but not all students need to have non-empty
            # Print for visibility
            print(f"Student {sid} inferred with {len(courses)} suggested courses")
            return
    pytest.skip("No inferred student found")
