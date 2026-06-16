"""Backend tests for the new /student-details page.

Endpoints under test:
- GET  /api/students/{id}                       (existence / shape)
- GET  /api/students/{id}/courses               (courses with is_inferred flag)
- GET  /api/attendance/stats/student/{id}       (AttendanceStats shape)
- POST /api/student-status/{id}/change          (status change flow)
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_USER = "admin"
ADMIN_PASS = "admin123"
SAMPLE_STUDENT_ID = "698ef706d803b27aab012065"  # محمد أحمد علي (per request)


@pytest.fixture(scope="session")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": ADMIN_USER, "password": ADMIN_PASS},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def any_student_id(client):
    """Resolve a valid student id (fall back if sample doesn't exist)."""
    r = client.get(f"{BASE_URL}/api/students/{SAMPLE_STUDENT_ID}", timeout=15)
    if r.status_code == 200:
        return SAMPLE_STUDENT_ID
    r = client.get(f"{BASE_URL}/api/students", timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert len(items) > 0, "no students seeded"
    return items[0]["id"]


# ---------- GET /api/students/{id} ----------
class TestStudentDetail:
    def test_get_student_by_id(self, client, any_student_id):
        r = client.get(f"{BASE_URL}/api/students/{any_student_id}", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == any_student_id
        for key in ("full_name", "student_id", "status"):
            assert key in data, f"missing field {key}"


# ---------- GET /api/students/{id}/courses ----------
class TestStudentCourses:
    def test_courses_endpoint(self, client, any_student_id):
        r = client.get(
            f"{BASE_URL}/api/students/{any_student_id}/courses", timeout=20
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Endpoint returns wrapper: {courses: [...], total_courses: N, is_inferred: bool, student_id: str}
        assert isinstance(data, dict), f"expected wrapper dict, got {type(data)}"
        assert "courses" in data and isinstance(data["courses"], list)
        assert "is_inferred" in data and isinstance(data["is_inferred"], bool)
        assert "total_courses" in data
        if data["courses"]:
            c = data["courses"][0]
            for field in ("id", "name", "code", "level", "section", "credit_hours"):
                assert field in c, f"missing field {field} in course"


# ---------- GET /api/attendance/stats/student/{id} ----------
class TestAttendanceStats:
    def test_attendance_stats_shape(self, client, any_student_id):
        r = client.get(
            f"{BASE_URL}/api/attendance/stats/student/{any_student_id}", timeout=20
        )
        assert r.status_code == 200, r.text
        data = r.json()
        for k in (
            "present_count",
            "absent_count",
            "late_count",
            "excused_count",
            "total_sessions",
            "attendance_rate",
        ):
            assert k in data, f"AttendanceStats missing field {k}"
            assert isinstance(data[k], (int, float))


# ---------- GET /api/attendance/student/{id} ----------
class TestAttendanceRecords:
    def test_attendance_records_list(self, client, any_student_id):
        r = client.get(
            f"{BASE_URL}/api/attendance/student/{any_student_id}", timeout=20
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)


# ---------- POST /api/student-status/{id}/change ----------
class TestStudentStatusChange:
    def test_change_status_round_trip(self, client, any_student_id):
        # Switch to 'frozen' (non-destructive)
        r = client.post(
            f"{BASE_URL}/api/student-status/{any_student_id}/change",
            json={"new_status": "frozen", "reason": "TEST_automation"},
            timeout=20,
        )
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("new_status") == "frozen"

        # Verify the GET reflects change (status field OR derived is_active)
        r2 = client.get(f"{BASE_URL}/api/students/{any_student_id}", timeout=15)
        assert r2.status_code == 200
        s2 = r2.json()
        # When 'frozen' the backend toggles is_active=False
        assert s2.get("status") == "frozen" or s2.get("is_active") is False

        # Revert to active
        r3 = client.post(
            f"{BASE_URL}/api/student-status/{any_student_id}/change",
            json={"new_status": "active", "reason": "TEST_revert"},
            timeout=20,
        )
        assert r3.status_code in (200, 201)
        assert r3.json().get("new_status") == "active"


# ---------- GET /api/export/report/student/{id}/excel ----------
class TestExcelExport:
    def test_excel_export_works(self, client, any_student_id):
        r = client.get(
            f"{BASE_URL}/api/export/report/student/{any_student_id}/excel",
            timeout=30,
        )
        assert r.status_code == 200, r.text
        ctype = r.headers.get("content-type", "")
        assert (
            "spreadsheet" in ctype
            or "excel" in ctype
            or "octet-stream" in ctype
        ), f"unexpected content-type: {ctype}"
        assert len(r.content) > 100  # non-empty file
