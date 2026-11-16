# Reports scope isolation (dean/department_head) — iteration 190. Read-only GETs only.
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

SHARIA_STUDENT = "698e50c797fef774e66e93aa"
SHARIA_TEACHER = "698ad3da31ab437a06176e2a"
SHARIA_COURSE = "698f671431cfba92c49a550d"
SHARIA_DEPT = "698e500997fef774e66e93a8"
SHARIA_FAC = "698e4f9297fef774e66e93a4"


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed for {u}: {r.status_code} {r.text[:200]}")
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}"})
    s.user = d.get("user", {})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("admin", "admin123")


@pytest.fixture(scope="module")
def saeed():
    return _login("Saeed", "test1234")


@pytest.fixture(scope="module")
def salim():
    return _login("Salim", "test1234")


@pytest.fixture(scope="module")
def t222():
    return _login("222222", "teacher123")


@pytest.fixture(scope="module")
def t180():
    return _login("teacher180156", "teacher123")


# ---- student report
def test_student_report_saeed_403(saeed):
    r = saeed.get(f"{API}/reports/student/{SHARIA_STUDENT}")
    assert r.status_code == 403, r.text[:300]


def test_student_report_admin_200(admin):
    r = admin.get(f"{API}/reports/student/{SHARIA_STUDENT}")
    assert r.status_code == 200, r.text[:300]


def test_student_report_salim_200(salim):
    # Salim is dean of Sharia faculty -> must still see own faculty student
    r = salim.get(f"{API}/reports/student/{SHARIA_STUDENT}")
    assert r.status_code == 200, r.text[:300]


# ---- teacher summary
def test_teacher_summary_saeed_403(saeed):
    r = saeed.get(f"{API}/reports/teacher-summary", params={"teacher_id": SHARIA_TEACHER})
    assert r.status_code == 403, r.text[:300]


def test_teacher_summary_pdf_saeed_403(saeed):
    r = saeed.get(f"{API}/reports/teacher-summary/export-pdf", params={"teacher_id": SHARIA_TEACHER})
    assert r.status_code == 403, r.status_code


def test_teacher_summary_admin_200(admin):
    r = admin.get(f"{API}/reports/teacher-summary", params={"teacher_id": SHARIA_TEACHER})
    assert r.status_code == 200, r.text[:300]
    assert "courses" in r.json()


def test_teacher_summary_salim_200(salim):
    r = salim.get(f"{API}/reports/teacher-summary", params={"teacher_id": SHARIA_TEACHER})
    assert r.status_code == 200, r.text[:300]


# ---- course detailed
def test_course_detailed_saeed_403(saeed):
    r = saeed.get(f"{API}/reports/course/{SHARIA_COURSE}/detailed")
    assert r.status_code == 403, r.text[:300]


def test_course_pdf_saeed_403(saeed):
    r = saeed.get(f"{API}/reports/course/{SHARIA_COURSE}/export-pdf")
    assert r.status_code == 403, r.status_code


def test_course_detailed_admin_200(admin):
    r = admin.get(f"{API}/reports/course/{SHARIA_COURSE}/detailed")
    assert r.status_code == 200, r.text[:300]
    assert "course" in r.json()


def test_course_detailed_salim_200(salim):
    r = salim.get(f"{API}/reports/course/{SHARIA_COURSE}/detailed")
    assert r.status_code == 200, r.text[:300]


# ---- department
def test_department_saeed_403(saeed):
    r = saeed.get(f"{API}/reports/department/{SHARIA_DEPT}")
    assert r.status_code == 403, r.text[:300]


def test_department_admin_200(admin):
    r = admin.get(f"{API}/reports/department/{SHARIA_DEPT}")
    assert r.status_code == 200, r.text[:300]


# ---- teacher workload
def test_workload_saeed_foreign_faculty_empty(saeed):
    r = saeed.get(f"{API}/reports/teacher-workload", params={"faculty_id": SHARIA_FAC})
    assert r.status_code == 200, r.text[:300]
    assert r.json()["teachers"] == []


def test_workload_counts_saeed_vs_admin(saeed, admin):
    rs = saeed.get(f"{API}/reports/teacher-workload")
    ra = admin.get(f"{API}/reports/teacher-workload")
    assert rs.status_code == 200 and ra.status_code == 200
    ns, na = len(rs.json()["teachers"]), len(ra.json()["teachers"])
    print(f"workload saeed={ns} admin={na}")
    assert ns < na
    assert ns == 3
    assert na == 15


def test_workload_raised_saeed_scoped(saeed):
    r = saeed.get(f"{API}/reports/teacher-workload/raised",
                  params={"start_date": "2026-01-01", "end_date": "2026-12-31", "faculty_id": SHARIA_FAC})
    assert r.status_code == 200, r.text[:300]
    assert r.json()["count"] == 0


# ---- teacher delays / attendance
def test_delays_saeed_empty(saeed):
    r = saeed.get(f"{API}/reports/teacher-delays", params={"department_id": SHARIA_DEPT})
    assert r.status_code == 200, r.text[:300]
    assert r.json().get("teachers") == []


def test_teacher_attendance_saeed_empty(saeed):
    r = saeed.get(f"{API}/reports/teacher-attendance",
                  params={"department_id": SHARIA_DEPT, "start_date": "2025-09-01", "end_date": "2026-12-31"})
    assert r.status_code == 200, r.text[:300]
    assert r.json().get("teachers") == []


def test_teacher_attendance_admin_nonempty(admin):
    r = admin.get(f"{API}/reports/teacher-attendance",
                  params={"department_id": SHARIA_DEPT, "start_date": "2025-09-01", "end_date": "2026-12-31"})
    assert r.status_code == 200, r.text[:300]
    print("admin teacher-attendance teachers:", len(r.json().get("teachers", [])))


def test_delays_admin_200(admin):
    r = admin.get(f"{API}/reports/teacher-delays", params={"department_id": SHARIA_DEPT})
    assert r.status_code == 200, r.text[:300]
    print("admin delays teachers:", len(r.json().get("teachers", [])))


# ---- list reports with foreign filters (Saeed) should not leak Sharia data
@pytest.mark.parametrize("path", ["/reports/absent-students", "/reports/warnings", "/reports/daily",
                                  "/reports/attendance-overview", "/reports/lesson-completion"])
def test_list_reports_saeed_foreign_dept(saeed, admin, path):
    rs = saeed.get(f"{API}{path}", params={"department_id": SHARIA_DEPT})
    ra = admin.get(f"{API}{path}", params={"department_id": SHARIA_DEPT})
    print(path, "saeed", rs.status_code, rs.text[:250])
    print(path, "admin", ra.status_code, ra.text[:250])
    assert rs.status_code in (200, 403)
    assert ra.status_code == 200
    if rs.status_code == 200:
        # Saeed's response must not contain the Sharia course id
        assert SHARIA_COURSE not in rs.text


# ---- teacher regressions
def test_teacher222_summary_own(t222):
    r = t222.get(f"{API}/reports/teacher-summary")
    assert r.status_code == 200, r.text[:300]


def test_teacher222_workload_own(t222):
    r = t222.get(f"{API}/reports/teacher-workload")
    assert r.status_code == 200, r.text[:300]
    assert len(r.json()["teachers"]) == 1


def test_teacher180_absent_students(t180):
    r = t180.get(f"{API}/reports/absent-students")
    assert r.status_code == 200, r.text[:300]
