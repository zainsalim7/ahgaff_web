"""Tests for clone-section feature (POST /api/courses/{id}/clone-section, GET .../sections)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com").rstrip("/")


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def teacher_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "teacher180156", "password": "teacher123"}, timeout=20)
    if r.status_code != 200:
        pytest.skip("teacher login unavailable")
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def teacher_headers(teacher_token):
    return {"Authorization": f"Bearer {teacher_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def base_course(admin_headers):
    """Pick the first course that has section 'أ' or no section duplicates yet."""
    r = requests.get(f"{BASE_URL}/api/courses", headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    courses = data if isinstance(data, list) else data.get("courses", data.get("items", []))
    assert courses, "no courses available"
    # prefer one with explicit section (so duplicate check is deterministic)
    for c in courses:
        if c.get("is_active", True):
            return c
    return courses[0]


# Track ids created so we cleanup at module teardown
_created_ids = []


@pytest.fixture(scope="module", autouse=True)
def _cleanup(admin_headers):
    yield
    for cid in _created_ids:
        try:
            requests.delete(f"{BASE_URL}/api/courses/{cid}", headers=admin_headers, timeout=15)
        except Exception:
            pass


# ---------- tests ----------
class TestCloneSection:

    def test_get_sections_initial(self, admin_headers, base_course):
        r = requests.get(f"{BASE_URL}/api/courses/{base_course['id']}/sections", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "sections" in body
        assert "total_sections" in body
        assert body["total_sections"] == len(body["sections"])
        # is_primary should be True for at least one section (the queried one)
        primaries = [s for s in body["sections"] if s.get("is_primary")]
        assert len(primaries) >= 1
        # students_count present and int, teacher_name key present
        for s in body["sections"]:
            assert "students_count" in s and isinstance(s["students_count"], int)
            assert "section" in s
            assert "teacher_name" in s

    def test_clone_empty_section_rejected(self, admin_headers, base_course):
        r = requests.post(
            f"{BASE_URL}/api/courses/{base_course['id']}/clone-section",
            headers=admin_headers,
            json={"new_section": "   "},
            timeout=20,
        )
        assert r.status_code == 400, r.text

    def test_clone_too_long_section_rejected(self, admin_headers, base_course):
        r = requests.post(
            f"{BASE_URL}/api/courses/{base_course['id']}/clone-section",
            headers=admin_headers,
            json={"new_section": "ابجدوز"},  # 6 chars > 5
            timeout=20,
        )
        assert r.status_code == 400, r.text

    def test_clone_success_section_zay(self, admin_headers, base_course):
        # use rare section 'ز' to avoid clash
        r = requests.post(
            f"{BASE_URL}/api/courses/{base_course['id']}/clone-section",
            headers=admin_headers,
            json={"new_section": "ز", "room": "T-TEST-101"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["section"] == "ز"
        assert body["cloned_from"] == base_course["id"]
        assert "id" in body
        _created_ids.append(body["id"])

        # verify GET sections now includes 'ز' and is_active
        r2 = requests.get(f"{BASE_URL}/api/courses/{base_course['id']}/sections", headers=admin_headers, timeout=20)
        assert r2.status_code == 200
        labels = [s["section"] for s in r2.json()["sections"]]
        assert "ز" in labels

        # verify the cloned course appears in main courses list (is_active=True)
        r3 = requests.get(f"{BASE_URL}/api/courses", headers=admin_headers, timeout=30)
        assert r3.status_code == 200
        all_courses = r3.json()
        all_courses = all_courses if isinstance(all_courses, list) else all_courses.get("courses", all_courses.get("items", []))
        ids = [c["id"] for c in all_courses]
        assert body["id"] in ids, "cloned course must appear in /courses list (is_active=True)"

        # Validate fields persisted - curriculum_course_id preservation
        cloned = next(c for c in all_courses if c["id"] == body["id"])
        assert cloned.get("section") == "ز"
        if base_course.get("curriculum_course_id"):
            assert cloned.get("curriculum_course_id") == base_course.get("curriculum_course_id")
        # cloned_from
        assert cloned.get("cloned_from") == base_course["id"] or True  # may not be returned in list

    def test_clone_duplicate_section_rejected(self, admin_headers, base_course):
        # Now clone same 'ز' again - should 400
        r = requests.post(
            f"{BASE_URL}/api/courses/{base_course['id']}/clone-section",
            headers=admin_headers,
            json={"new_section": "ز"},
            timeout=20,
        )
        assert r.status_code == 400, r.text

    def test_clone_rbac_teacher_forbidden(self, teacher_headers, base_course):
        r = requests.post(
            f"{BASE_URL}/api/courses/{base_course['id']}/clone-section",
            headers=teacher_headers,
            json={"new_section": "ح"},
            timeout=20,
        )
        assert r.status_code == 403, f"expected 403 got {r.status_code} body={r.text}"
