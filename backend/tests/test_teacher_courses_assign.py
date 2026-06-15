"""
Tests for /teacher-courses page backend endpoints:
- GET /api/teachers/{teacher_id}/courses
- GET /api/teaching-load/search-courses
- POST /api/teaching-load/bulk (assign)
- PUT /api/courses/{id} with teacher_id=null (unassign)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Known seed teacher per review_request
TEACHER_ID = "698ad3da31ab437a06176e2a"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"}


# ---------------- GET teacher courses ----------------
class TestTeacherCoursesEndpoint:
    def test_get_teacher_courses_shape(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/teachers/{TEACHER_ID}/courses",
                         headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "teacher_id" in data
        assert "teacher_name" in data
        assert "total_courses" in data
        assert "courses" in data
        assert isinstance(data["courses"], list)
        if data["courses"]:
            c = data["courses"][0]
            for k in ("id", "name", "code", "level", "section",
                      "students_count", "lectures_count"):
                assert k in c, f"missing key {k} in course"


# ---------------- Search courses ----------------
class TestSearchCourses:
    def test_search_courses_empty_query(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/teaching-load/search-courses",
                         headers=auth_headers, params={"q": ""})
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)

    def test_search_courses_query(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/teaching-load/search-courses",
                         headers=auth_headers, params={"q": "a"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        if data:
            it = data[0]
            for k in ("course_id", "course_name", "course_code"):
                assert k in it


# ---------------- Bulk assign + unassign roundtrip ----------------
class TestAssignUnassignRoundtrip:
    """
    Pick a course currently NOT assigned to TEACHER_ID, bulk-assign it,
    verify it appears in teacher's courses, then unassign via PUT /courses/{id}
    with teacher_id=null and verify it is removed.
    """

    def _get_existing_course_ids(self, headers):
        r = requests.get(f"{BASE_URL}/api/teachers/{TEACHER_ID}/courses",
                         headers=headers)
        assert r.status_code == 200
        return {c["id"] for c in r.json().get("courses", [])}

    def _pick_candidate(self, headers):
        existing = self._get_existing_course_ids(headers)
        r = requests.get(f"{BASE_URL}/api/teaching-load/search-courses",
                         headers=headers, params={"q": ""})
        assert r.status_code == 200
        for c in r.json():
            if c["course_id"] not in existing:
                # prefer unassigned to others to avoid mutating other teachers
                if not c.get("current_teacher_name"):
                    return c
        # fallback: any not currently in teacher's list
        for c in r.json():
            if c["course_id"] not in existing:
                return c
        return None

    def test_bulk_assign_then_unassign(self, auth_headers):
        candidate = self._pick_candidate(auth_headers)
        if not candidate:
            pytest.skip("No candidate course available to assign")

        course_id = candidate["course_id"]
        original_teacher = candidate.get("current_teacher_name")

        # Snapshot original course doc to restore teacher_id if needed
        get_course = requests.get(f"{BASE_URL}/api/courses/{course_id}",
                                  headers=auth_headers)
        original_teacher_id = None
        if get_course.status_code == 200:
            original_teacher_id = get_course.json().get("teacher_id")

        try:
            # 1) Bulk assign
            payload = [{
                "teacher_id": TEACHER_ID,
                "course_id": course_id,
                "weekly_hours": float(candidate.get("credit_hours") or 3),
            }]
            r = requests.post(f"{BASE_URL}/api/teaching-load/bulk",
                              headers=auth_headers, json=payload)
            assert r.status_code in (200, 201), f"bulk failed: {r.status_code} {r.text}"

            # 2) Verify in teacher courses
            r2 = requests.get(f"{BASE_URL}/api/teachers/{TEACHER_ID}/courses",
                              headers=auth_headers)
            assert r2.status_code == 200
            ids_after_assign = {c["id"] for c in r2.json()["courses"]}
            assert course_id in ids_after_assign, "Course did not appear in teacher courses after assign"

            # 3) Verify courses.teacher_id was synced
            r3 = requests.get(f"{BASE_URL}/api/courses/{course_id}",
                              headers=auth_headers)
            assert r3.status_code == 200
            assert r3.json().get("teacher_id") == TEACHER_ID, \
                "courses.teacher_id not synced after bulk assign"

            # 4) Unassign via PUT /courses/{id} with teacher_id=null
            r4 = requests.put(f"{BASE_URL}/api/courses/{course_id}",
                              headers=auth_headers,
                              json={"teacher_id": None})
            assert r4.status_code == 200, f"unassign PUT failed: {r4.status_code} {r4.text}"

            # 5) Verify course removed from teacher list
            r5 = requests.get(f"{BASE_URL}/api/teachers/{TEACHER_ID}/courses",
                              headers=auth_headers)
            assert r5.status_code == 200
            ids_after_unassign = {c["id"] for c in r5.json()["courses"]}
            assert course_id not in ids_after_unassign, \
                "Course still present after unassign"

            # 6) Verify courses.teacher_id is null now
            r6 = requests.get(f"{BASE_URL}/api/courses/{course_id}",
                              headers=auth_headers)
            assert r6.status_code == 200
            assert r6.json().get("teacher_id") in (None, "", "null"), \
                "courses.teacher_id not cleared after unassign"
        finally:
            # Best-effort restore original teacher (if any)
            if original_teacher_id:
                requests.put(f"{BASE_URL}/api/courses/{course_id}",
                             headers=auth_headers,
                             json={"teacher_id": original_teacher_id})
