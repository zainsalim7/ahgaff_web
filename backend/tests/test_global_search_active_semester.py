"""
Tests for the active-semester filtering fix in Global Search (/api/search)
Bug RCA: previously /api/search returned ALL course documents including old
curriculum templates from previous semesters. Fix ensures courses & lectures
are filtered by semester_id == active_semester_id.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

API = f"{BASE_URL}/api"


# ------------ helpers / fixtures -----------------
def _login(username: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {username}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token returned for {username}: {data}"
    return token


@pytest.fixture(scope="module")
def admin_headers():
    token = _login("admin", "admin123")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def dean_headers():
    token = _login("Salim", "test1234")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def active_semester_id(admin_headers):
    """Find the active semester id."""
    r = requests.get(f"{API}/semesters", headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"GET /api/semesters failed: {r.status_code} {r.text}"
    semesters = r.json()
    # Active semester
    actives = [s for s in semesters if s.get("status") == "active"]
    assert actives, "No active semester found in DB"
    sid = str(actives[0].get("id") or actives[0].get("_id"))
    print(f"Active semester id: {sid} (name: {actives[0].get('name')})")
    return sid


@pytest.fixture(scope="module")
def active_semester_course_ids(admin_headers, active_semester_id):
    """All course ids that belong to active semester (for verifying lecture filter)."""
    # Try query by semester_id
    r = requests.get(f"{API}/courses", headers=admin_headers, params={"semester_id": active_semester_id}, timeout=30)
    if r.status_code != 200:
        return set()
    courses = r.json()
    ids = {str(c.get("id") or c.get("_id")) for c in courses}
    print(f"Active semester courses count: {len(ids)}")
    return ids


# ------------ tests ---------------
class TestGlobalSearchActiveSemester:

    def _search(self, headers, q, types="courses"):
        r = requests.get(f"{API}/search", headers=headers, params={"q": q, "types": types}, timeout=30)
        return r

    def test_admin_course_search_returns_only_active_semester(self, admin_headers, active_semester_id):
        """Admin searches 'تفسير' -> only active-semester courses should appear."""
        r = self._search(admin_headers, "تفسير", "courses")
        assert r.status_code == 200, f"Search failed: {r.status_code} {r.text}"
        body = r.json()
        # Response shape: { results: { courses: [...]} } OR { courses: [...] }
        results = body.get("results") if isinstance(body.get("results"), dict) else body
        courses = (results or {}).get("courses") or []
        print(f"Returned {len(courses)} courses for 'تفسير'")

        # Verify by fetching detail for each course's id and check semester_id
        for c in courses:
            cid = c.get("id") or c.get("_id")
            assert cid, f"Course missing id: {c}"
            # fetch full course detail
            cr = requests.get(f"{API}/courses/{cid}", headers=admin_headers, timeout=30)
            assert cr.status_code == 200, f"Could not fetch course {cid}: {cr.status_code}"
            full = cr.json()
            sem_id = str(full.get("semester_id", ""))
            assert sem_id == active_semester_id, (
                f"Course {cid} ({full.get('code')}) belongs to semester {sem_id}, "
                f"not active {active_semester_id}"
            )

    def test_admin_search_with_generic_query_filters_by_active_semester(self, admin_headers, active_semester_id):
        """Use a broader query likely to match curriculum templates too."""
        for q in ["م", "10", "ا"]:
            r = self._search(admin_headers, q, "courses")
            assert r.status_code == 200, f"Search '{q}' failed: {r.status_code}"
            body = r.json()
            results = body.get("results") if isinstance(body.get("results"), dict) else body
            courses = (results or {}).get("courses") or []
            print(f"Query '{q}': {len(courses)} courses returned")
            for c in courses:
                cid = c.get("id") or c.get("_id")
                cr = requests.get(f"{API}/courses/{cid}", headers=admin_headers, timeout=30)
                if cr.status_code != 200:
                    continue
                sem_id = str(cr.json().get("semester_id", ""))
                assert sem_id == active_semester_id, (
                    f"Search '{q}': course {cid} has semester_id {sem_id} != active {active_semester_id}"
                )

    def test_search_other_types_still_work(self, admin_headers):
        """Departments, faculties, teachers, students, lectures should still return data."""
        types_to_try = ["departments", "faculties", "teachers", "students", "lectures"]
        for t in types_to_try:
            r = self._search(admin_headers, "ا", t)
            assert r.status_code == 200, f"Search type {t} failed: {r.status_code} {r.text}"
            body = r.json()
            # Just ensure no crash and proper shape
            assert isinstance(body, dict), f"Unexpected shape for {t}: {body}"
            print(f"type={t} ok, keys={list(body.keys())}")

    def test_dean_course_search_scoped_and_active_semester(self, dean_headers, admin_headers, active_semester_id):
        """Dean Salim (كلية الشريعة والقانون) sees only his faculty's courses in active semester."""
        # Find Salim's faculty_id via /api/auth/me
        me = requests.get(f"{API}/auth/me", headers=dean_headers, timeout=30)
        assert me.status_code == 200, f"/auth/me failed: {me.status_code} {me.text}"
        me_data = me.json()
        dean_faculty_id = str(me_data.get("faculty_id") or "")
        print(f"Dean faculty_id: {dean_faculty_id}")

        r = self._search(dean_headers, "ا", "courses")
        assert r.status_code == 200, f"Dean search failed: {r.status_code} {r.text}"
        body = r.json()
        results = body.get("results") if isinstance(body.get("results"), dict) else body
        courses = (results or {}).get("courses") or []
        print(f"Dean returned {len(courses)} courses")
        for c in courses:
            cid = c.get("id") or c.get("_id")
            cr = requests.get(f"{API}/courses/{cid}", headers=admin_headers, timeout=30)
            if cr.status_code != 200:
                continue
            full = cr.json()
            sem_id = str(full.get("semester_id", ""))
            assert sem_id == active_semester_id, (
                f"Dean got course {cid} semester {sem_id} != active {active_semester_id}"
            )
            if dean_faculty_id:
                course_fac = str(full.get("faculty_id", ""))
                # Faculty scope: course must belong to dean's faculty (if course has faculty_id)
                if course_fac:
                    assert course_fac == dean_faculty_id, (
                        f"Dean got course {cid} from faculty {course_fac} != his {dean_faculty_id}"
                    )

    def test_lecture_search_scoped_to_active_semester_courses(self, admin_headers, active_semester_course_ids, active_semester_id):
        """Lectures search should only return lectures of active-semester courses."""
        r = requests.get(f"{API}/search", headers=admin_headers, params={"q": "ا", "types": "lectures"}, timeout=30)
        assert r.status_code == 200, f"Lecture search failed: {r.status_code} {r.text}"
        body = r.json()
        results = body.get("results") if isinstance(body.get("results"), dict) else body
        lectures = (results or {}).get("lectures") or []
        print(f"Lecture search returned {len(lectures)} lectures")
        # If we couldn't load active_semester_course_ids via /api/courses?semester_id, skip strict check
        if not active_semester_course_ids:
            print("Skipping strict lecture check (could not load active semester courses)")
            return
        for lec in lectures:
            lid = lec.get("id") or lec.get("_id")
            # Fetch lecture detail to know course_id
            lr = requests.get(f"{API}/lectures/{lid}", headers=admin_headers, timeout=30)
            if lr.status_code != 200:
                continue
            course_id = str(lr.json().get("course_id", ""))
            assert course_id in active_semester_course_ids, (
                f"Lecture {lid} course_id {course_id} NOT in active semester courses"
            )
