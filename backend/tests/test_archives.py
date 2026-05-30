"""
Tests for the Archived Semester Reports system.

Coverage:
- GET /api/archives           (admin 200, teacher 403)
- GET /api/archives/search    (admin 200, teacher 403, validation)
- GET /api/archives/{id}      (404 when not archived)
- GET /api/archives/{id}/courses, /students, /teachers (404 when not archived)
- POST /api/semesters/{id}/archive validation (active=400, already-archived=400)
- Regression on key existing endpoints used by mobile apps
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"username": "admin", "password": "admin123"}
TEACHER = {"username": "teacher180156", "password": "teacher123"}


# ---------- helpers ----------
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


# ---------- /api/archives (list) ----------
class TestArchiveList:
    def test_list_archives_admin_200(self, admin_headers):
        r = requests.get(f"{API}/archives", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and isinstance(data["items"], list)
        assert "total" in data and isinstance(data["total"], int)
        assert data["total"] == len(data["items"])
        # validate item shape if any present
        for it in data["items"]:
            assert "archive_id" in it
            assert "semester_id" in it
            assert "summary" in it

    def test_list_archives_teacher_403(self, teacher_headers):
        r = requests.get(f"{API}/archives", headers=teacher_headers, timeout=15)
        assert r.status_code == 403, r.text

    def test_list_archives_unauthenticated_401(self):
        r = requests.get(f"{API}/archives", timeout=15)
        assert r.status_code in (401, 403), r.text


# ---------- /api/archives/search ----------
class TestArchiveSearch:
    def test_search_admin_200(self, admin_headers):
        r = requests.get(f"{API}/archives/search", params={"q": "اح"}, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "results" in data
        assert set(data["results"].keys()) >= {"students", "teachers", "courses"}
        assert "total" in data

    def test_search_teacher_403(self, teacher_headers):
        r = requests.get(f"{API}/archives/search", params={"q": "اح"}, headers=teacher_headers, timeout=15)
        assert r.status_code == 403, r.text

    def test_search_too_short_422(self, admin_headers):
        r = requests.get(f"{API}/archives/search", params={"q": "a"}, headers=admin_headers, timeout=15)
        # min_length=2 -> FastAPI 422 validation
        assert r.status_code == 422, r.text

    def test_search_with_type_filter(self, admin_headers):
        for t in ["students", "teachers", "courses", "all"]:
            r = requests.get(f"{API}/archives/search", params={"q": "اح", "type": t},
                             headers=admin_headers, timeout=15)
            assert r.status_code == 200, f"{t} -> {r.text}"


# ---------- /api/archives/{semester_id} and sub-resources ----------
class TestArchiveDetail:
    NON_EXISTENT = "non-existent-semester-id-xxx"

    def test_summary_404(self, admin_headers):
        r = requests.get(f"{API}/archives/{self.NON_EXISTENT}", headers=admin_headers, timeout=15)
        assert r.status_code == 404, r.text

    def test_courses_404(self, admin_headers):
        r = requests.get(f"{API}/archives/{self.NON_EXISTENT}/courses", headers=admin_headers, timeout=15)
        assert r.status_code == 404, r.text

    def test_students_404(self, admin_headers):
        r = requests.get(f"{API}/archives/{self.NON_EXISTENT}/students", headers=admin_headers, timeout=15)
        assert r.status_code == 404, r.text

    def test_teachers_404(self, admin_headers):
        r = requests.get(f"{API}/archives/{self.NON_EXISTENT}/teachers", headers=admin_headers, timeout=15)
        assert r.status_code == 404, r.text

    def test_summary_teacher_403(self, teacher_headers):
        r = requests.get(f"{API}/archives/{self.NON_EXISTENT}", headers=teacher_headers, timeout=15)
        assert r.status_code == 403, r.text

    def test_existing_archive_shape(self, admin_headers):
        """If any archive already exists, validate the response shape of summary/courses/students/teachers."""
        r = requests.get(f"{API}/archives", headers=admin_headers, timeout=15)
        items = r.json().get("items", [])
        if not items:
            pytest.skip("No archived semesters present in DB to validate detail endpoints")
        sid = items[0]["semester_id"]

        s = requests.get(f"{API}/archives/{sid}", headers=admin_headers, timeout=15)
        assert s.status_code == 200, s.text
        sd = s.json()
        for k in ("semester_id", "semester_name", "summary"):
            assert k in sd, f"missing {k} in summary"

        c = requests.get(f"{API}/archives/{sid}/courses", headers=admin_headers, timeout=15)
        assert c.status_code == 200, c.text
        cd = c.json()
        assert "courses" in cd and isinstance(cd["courses"], list)
        for crs in cd["courses"][:3]:
            # denormalized fields should be present (may be None if missing data, but key should exist)
            assert "teacher_name" in crs
            assert "department_name" in crs

        st = requests.get(f"{API}/archives/{sid}/students", headers=admin_headers, timeout=15)
        assert st.status_code == 200, st.text
        std = st.json()
        assert "students" in std and isinstance(std["students"], list)
        for s2 in std["students"][:3]:
            assert "attendance_pct" in s2

        t = requests.get(f"{API}/archives/{sid}/teachers", headers=admin_headers, timeout=15)
        assert t.status_code == 200, t.text
        td = t.json()
        assert "teachers" in td and isinstance(td["teachers"], list)
        for tch in td["teachers"][:3]:
            assert "courses_count" in tch
            assert "completion_pct" in tch


# ---------- POST /api/semesters/{id}/archive validation ----------
class TestArchiveCreation:
    """We do NOT archive a real semester. We only check that the endpoint REJECTS bad inputs."""

    def test_archive_active_semester_400(self, admin_headers):
        # find an ACTIVE semester if any
        r = requests.get(f"{API}/semesters", headers=admin_headers, timeout=15)
        if r.status_code != 200:
            pytest.skip(f"cannot list semesters: {r.status_code}")
        sems = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        active = next((s for s in sems if (s.get("status") or "").lower() == "active"), None)
        if not active:
            pytest.skip("No ACTIVE semester to test rejection")
        sid = active.get("id") or active.get("_id") or active.get("semester_id")
        r2 = requests.post(f"{API}/semesters/{sid}/archive", headers=admin_headers, timeout=20)
        # must NOT succeed: 400 expected (rejects ACTIVE)
        assert r2.status_code == 400, f"active semester archive must be rejected, got {r2.status_code} {r2.text}"

    def test_archive_already_archived_400(self, admin_headers):
        r = requests.get(f"{API}/semesters", headers=admin_headers, timeout=15)
        if r.status_code != 200:
            pytest.skip(f"cannot list semesters: {r.status_code}")
        sems = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        archived = next((s for s in sems if (s.get("status") or "").lower() == "archived"), None)
        if not archived:
            pytest.skip("No ARCHIVED semester to test double-archive rejection")
        sid = archived.get("id") or archived.get("_id") or archived.get("semester_id")
        r2 = requests.post(f"{API}/semesters/{sid}/archive", headers=admin_headers, timeout=20)
        assert r2.status_code == 400, f"already-archived semester must be rejected, got {r2.status_code} {r2.text}"

    def test_archive_unauthorized_for_teacher(self, teacher_headers):
        r = requests.post(f"{API}/semesters/fake-id/archive", headers=teacher_headers, timeout=15)
        # teacher must not be able to archive (403) or at minimum not 200
        assert r.status_code in (401, 403, 404, 400), r.text
        assert r.status_code != 200


# ---------- Regression: existing endpoints used by mobile apps ----------
class TestMobileRegression:
    def test_courses_list(self, admin_headers):
        r = requests.get(f"{API}/courses", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text

    def test_teachers_me_as_teacher(self, teacher_headers):
        r = requests.get(f"{API}/teachers/me", headers=teacher_headers, timeout=15)
        assert r.status_code == 200, r.text

    def test_teacher_full_profile(self, admin_headers):
        # get one teacher id
        r = requests.get(f"{API}/teachers", headers=admin_headers, timeout=15)
        if r.status_code != 200:
            pytest.skip("cannot list teachers")
        teachers = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        if not teachers:
            pytest.skip("no teachers")
        tid = teachers[0].get("id") or teachers[0].get("_id")
        r2 = requests.get(f"{API}/teachers/{tid}/full-profile", headers=admin_headers, timeout=15)
        assert r2.status_code == 200, r2.text

    def test_course_full_details(self, admin_headers):
        r = requests.get(f"{API}/courses", headers=admin_headers, timeout=15)
        if r.status_code != 200:
            pytest.skip("cannot list courses")
        courses = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        if not courses:
            pytest.skip("no courses")
        cid = courses[0].get("id") or courses[0].get("_id")
        r2 = requests.get(f"{API}/courses/{cid}/full-details", headers=admin_headers, timeout=15)
        assert r2.status_code == 200, r2.text
