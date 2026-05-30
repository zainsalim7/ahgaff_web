"""
Tests for the 5 NEW Archive Reports endpoints (read-only, no restore):
- GET /api/archives/{semester_id}/students/{student_id}
- GET /api/archives/students/{student_id}/history
- GET /api/archives/{semester_id}/teachers/{teacher_id}
- GET /api/archives/teachers/{teacher_id}/history
- GET /api/archives/courses/{course_code}/history

Also regressions on:
- existing archive endpoints
- mobile-app endpoints
- POST /api/semesters/{id}/restore
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"username": "admin", "password": "admin123"}
TEACHER = {"username": "teacher180156", "password": "teacher123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['username']}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"no token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def teacher_headers():
    return {"Authorization": f"Bearer {_login(TEACHER)}"}


@pytest.fixture(scope="module")
def first_archive_semester_id(admin_headers):
    """Returns a semester_id of an existing archive if any, else None."""
    r = requests.get(f"{API}/archives", headers=admin_headers, timeout=15)
    if r.status_code != 200:
        return None
    items = r.json().get("items", [])
    return items[0].get("semester_id") if items else None


# === 1. Student attendance report in a semester ===
class TestArchiveStudentReport:
    def test_admin_404_for_nonexistent_archive(self, admin_headers):
        r = requests.get(
            f"{API}/archives/NONEXISTENT_SEM/students/NONEXISTENT_STU",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 404, r.text
        assert "detail" in r.json()

    def test_teacher_forbidden_403(self, teacher_headers):
        r = requests.get(
            f"{API}/archives/ANY_SEM/students/ANY_STU",
            headers=teacher_headers, timeout=15,
        )
        assert r.status_code == 403, r.text

    def test_unauthenticated_401(self):
        r = requests.get(f"{API}/archives/X/students/Y", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_admin_existing_archive_student_404(self, admin_headers, first_archive_semester_id):
        if not first_archive_semester_id:
            pytest.skip("No archives exist in DB")
        r = requests.get(
            f"{API}/archives/{first_archive_semester_id}/students/NONEXISTENT_STU",
            headers=admin_headers, timeout=15,
        )
        # archive exists but student doesn't -> 404 with "الطالب غير موجود في أرشيف هذا الفصل"
        assert r.status_code == 404, r.text
        detail = r.json().get("detail", "")
        assert "الطالب" in detail or "غير موجود" in detail


# === 2. Student academic history across all archives ===
class TestArchiveStudentHistory:
    def test_admin_200_empty_or_full(self, admin_headers):
        r = requests.get(
            f"{API}/archives/students/SOME_RANDOM_ID/history",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "student_id" in data and data["student_id"] == "SOME_RANDOM_ID"
        assert "history" in data and isinstance(data["history"], list)
        assert "total_semesters" in data
        assert data["total_semesters"] == len(data["history"])

    def test_teacher_403(self, teacher_headers):
        r = requests.get(
            f"{API}/archives/students/X/history",
            headers=teacher_headers, timeout=15,
        )
        assert r.status_code == 403, r.text


# === 3. Teacher workload report in a semester ===
class TestArchiveTeacherReport:
    def test_admin_404_for_nonexistent_archive(self, admin_headers):
        r = requests.get(
            f"{API}/archives/NONEXISTENT_SEM/teachers/NONEXISTENT_TEA",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 404, r.text

    def test_teacher_403(self, teacher_headers):
        r = requests.get(
            f"{API}/archives/ANY/teachers/ANY",
            headers=teacher_headers, timeout=15,
        )
        assert r.status_code == 403, r.text


# === 4. Teacher teaching history across archives ===
class TestArchiveTeacherHistory:
    def test_admin_200_shape(self, admin_headers):
        r = requests.get(
            f"{API}/archives/teachers/SOME_RANDOM_TEA/history",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["teacher_id"] == "SOME_RANDOM_TEA"
        assert isinstance(data.get("history"), list)
        assert "total_semesters" in data
        assert "grand_total" in data
        gt = data["grand_total"]
        for k in ("courses", "students", "credit_hours", "lectures", "completed", "completion_pct"):
            assert k in gt, f"grand_total missing {k}"

    def test_teacher_403(self, teacher_headers):
        r = requests.get(
            f"{API}/archives/teachers/X/history",
            headers=teacher_headers, timeout=15,
        )
        assert r.status_code == 403, r.text


# === 5. Course history across archives ===
class TestArchiveCourseHistory:
    def test_admin_200_shape(self, admin_headers):
        r = requests.get(
            f"{API}/archives/courses/CS101/history",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["course_code"] == "CS101"
        assert isinstance(data.get("instances"), list)
        assert data["total_instances"] == len(data["instances"])

    def test_case_insensitive_param(self, admin_headers):
        # course code lookup is case-insensitive on (c.code).lower() == param.lower()
        r1 = requests.get(f"{API}/archives/courses/cs101/history",
                          headers=admin_headers, timeout=15)
        r2 = requests.get(f"{API}/archives/courses/CS101/history",
                          headers=admin_headers, timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200
        # should return same total
        assert r1.json().get("total_instances") == r2.json().get("total_instances")

    def test_teacher_403(self, teacher_headers):
        r = requests.get(f"{API}/archives/courses/X/history",
                        headers=teacher_headers, timeout=15)
        assert r.status_code == 403, r.text


# === Regression: existing archive endpoints still work ===
class TestArchivesRegression:
    def test_list_archives(self, admin_headers):
        r = requests.get(f"{API}/archives", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_search_archives(self, admin_headers):
        r = requests.get(f"{API}/archives/search?q=ab", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "results" in data and "total" in data

    def test_archive_summary_404(self, admin_headers):
        r = requests.get(f"{API}/archives/NOPE", headers=admin_headers, timeout=15)
        assert r.status_code == 404

    def test_archive_courses_404(self, admin_headers):
        r = requests.get(f"{API}/archives/NOPE/courses", headers=admin_headers, timeout=15)
        assert r.status_code == 404

    def test_archive_students_404(self, admin_headers):
        r = requests.get(f"{API}/archives/NOPE/students", headers=admin_headers, timeout=15)
        assert r.status_code == 404

    def test_archive_teachers_404(self, admin_headers):
        r = requests.get(f"{API}/archives/NOPE/teachers", headers=admin_headers, timeout=15)
        assert r.status_code == 404


# === Regression: mobile-app endpoints ===
class TestMobileRegression:
    def test_courses(self, admin_headers):
        r = requests.get(f"{API}/courses", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_semesters(self, admin_headers):
        r = requests.get(f"{API}/semesters", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_teachers_list(self, admin_headers):
        r = requests.get(f"{API}/teachers", headers=admin_headers, timeout=20)
        assert r.status_code == 200


# === Regression: POST /api/semesters/{id}/restore ===
class TestRestoreEndpoint:
    def test_restore_nonexistent_404(self, admin_headers):
        r = requests.post(
            f"{API}/semesters/NONEXISTENT_ID/restore",
            headers=admin_headers, timeout=20,
        )
        # Either 404 (not found) or 400 (invalid id)
        assert r.status_code in (400, 404), r.text

    def test_restore_non_archived_400_or_404(self, admin_headers):
        # Fetch a current (not archived) semester
        r = requests.get(f"{API}/semesters", headers=admin_headers, timeout=20)
        if r.status_code != 200 or not r.json():
            pytest.skip("No semesters available")
        sem = r.json()[0]
        sem_id = sem.get("id") or sem.get("_id")
        if not sem_id:
            pytest.skip("Semester has no id")
        r2 = requests.post(
            f"{API}/semesters/{sem_id}/restore",
            headers=admin_headers, timeout=20,
        )
        # non-archived semester -> should be 400 (or 404 if route only matches archived)
        assert r2.status_code in (400, 404), r2.text
