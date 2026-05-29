"""
Backend tests for new entity details endpoints + global search route updates.
Covers:
- GET /api/teachers/{id}/full-profile
- GET /api/courses/{id}/full-details
- GET /api/departments/{id}/summary
- GET /api/faculties/{id}/summary
- GET /api/search routes point to new detail pages
- Regression: existing mobile-app endpoints still work
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Backend-only env fallback
    BASE_URL = "https://schedule-hub-272.preview.emergentagent.com"

# Sample IDs from production data
COURSE_ID = "698f0000d803b27aab0120af"
TEACHER_ID = "698ad3da31ab437a06176e2a"
DEPT_ID = "698e500997fef774e66e93a8"
FACULTY_ID = "698e4f9297fef774e66e93a4"

INVALID_OBJID = "not-a-valid-objectid"
NONEXISTENT_OBJID = "000000000000000000000000"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "admin", "password": "admin123"},
        timeout=30,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"no token in response: {data}"
    return token


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- Teacher full-profile ----------
class TestTeacherFullProfile:
    def test_success(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/teachers/{TEACHER_ID}/full-profile",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == TEACHER_ID
        assert "full_name" in data
        assert isinstance(data.get("courses"), list)
        assert "stats" in data
        stats = data["stats"]
        assert "courses_count" in stats
        assert "total_students" in stats
        assert "total_credit_hours" in stats
        assert isinstance(data.get("departments"), list)

    def test_404(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/teachers/{NONEXISTENT_OBJID}/full-profile",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 404

    def test_400_invalid(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/teachers/{INVALID_OBJID}/full-profile",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 400


# ---------- Course full-details ----------
class TestCourseFullDetails:
    def test_success(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/courses/{COURSE_ID}/full-details",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == COURSE_ID
        assert "name" in data
        # required fields
        for key in ["teacher_name", "department_name", "students", "lecture_stats", "study_plan"]:
            assert key in data, f"missing {key}"
        assert isinstance(data["students"], list)
        assert isinstance(data["lecture_stats"], dict)
        for k in ["total", "completed", "scheduled"]:
            assert k in data["lecture_stats"]
        # student attendance_pct present
        if data["students"]:
            s = data["students"][0]
            assert "attendance_pct" in s
            assert "full_name" in s

    def test_404(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/courses/{NONEXISTENT_OBJID}/full-details",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 404

    def test_400_invalid(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/courses/{INVALID_OBJID}/full-details",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 400


# ---------- Department summary ----------
class TestDepartmentSummary:
    def test_success(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/departments/{DEPT_ID}/summary",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == DEPT_ID
        assert "name" in data
        assert "faculty_name" in data
        assert "stats" in data
        for k in ["students_count", "courses_count", "teachers_count"]:
            assert k in data["stats"]
        assert isinstance(data["teachers"], list)
        assert isinstance(data["courses"], list)

    def test_404(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/departments/{NONEXISTENT_OBJID}/summary",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 404

    def test_400_invalid(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/departments/{INVALID_OBJID}/summary",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 400


# ---------- Faculty summary ----------
class TestFacultySummary:
    def test_success(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/faculties/{FACULTY_ID}/summary",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == FACULTY_ID
        assert "name" in data
        assert "dean_name" in data
        assert "departments" in data
        assert isinstance(data["departments"], list)
        assert "stats" in data
        for k in ["departments_count", "students_count", "courses_count"]:
            assert k in data["stats"]
        # each department has mini stats
        if data["departments"]:
            d = data["departments"][0]
            assert "students_count" in d
            assert "courses_count" in d

    def test_404(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/faculties/{NONEXISTENT_OBJID}/summary",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 404

    def test_400_invalid(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/faculties/{INVALID_OBJID}/summary",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 400


# ---------- Global search routes ----------
class TestGlobalSearchRoutes:
    def _search(self, headers, q):
        r = requests.get(f"{BASE_URL}/api/search", params={"q": q}, headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        return r.json().get("results", {})

    def test_course_route_points_to_course_details(self, auth_headers):
        results = self._search(auth_headers, "دراسات")
        courses = results.get("courses") or []
        assert courses, "no course in search results"
        assert "/course-details" in courses[0]["route"]
        assert "/course-lectures" not in courses[0]["route"]

    def test_teacher_route(self, auth_headers):
        results = self._search(auth_headers, "زين")
        teachers = results.get("teachers") or []
        if not teachers:
            pytest.skip("no teacher in search results")
        assert "/teacher-details" in teachers[0]["route"]

    def test_department_route(self, auth_headers):
        results = self._search(auth_headers, "الشريعة")
        depts = results.get("departments") or []
        assert depts, "no department in search results"
        assert "/department-details" in depts[0]["route"]

    def test_faculty_route(self, auth_headers):
        results = self._search(auth_headers, "كلية")
        facs = results.get("faculties") or []
        if not facs:
            pytest.skip("no faculty in search results")
        assert "/faculty-details" in facs[0]["route"]


# ---------- Regression: existing mobile-app endpoints ----------
class TestMobileRegression:
    def test_courses_list(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/courses", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text

    def test_teachers_me_with_teacher_token(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "teacher180156", "password": "teacher123"},
            timeout=30,
        )
        if r.status_code != 200:
            pytest.skip(f"teacher login unavailable: {r.status_code}")
        tk = r.json().get("access_token") or r.json().get("token")
        h = {"Authorization": f"Bearer {tk}"}
        # /api/teachers/me
        r2 = requests.get(f"{BASE_URL}/api/teachers/me", headers=h, timeout=30)
        assert r2.status_code in (200, 404), r2.text  # 404 acceptable if no record but no 500
