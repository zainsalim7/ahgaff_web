"""Backend tests for report PDF exports and RBAC checks."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com").rstrip("/")


def _login(username, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {username} failed: {r.status_code} {r.text[:300]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token for {username}: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin", "admin123")


@pytest.fixture(scope="module")
def teacher_token():
    return _login("9999", "teacher123")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def teacher_headers(teacher_token):
    return {"Authorization": f"Bearer {teacher_token}"}


@pytest.fixture(scope="module")
def sample_ids(admin_headers):
    # get one course and one teacher
    c = requests.get(f"{BASE_URL}/api/courses", headers=admin_headers, timeout=30)
    assert c.status_code == 200, c.text[:300]
    cj = c.json()
    courses = cj if isinstance(cj, list) else cj.get("courses") or cj.get("data") or []
    course_id = courses[0].get("id") or courses[0].get("_id") if courses else None

    t = requests.get(f"{BASE_URL}/api/teachers", headers=admin_headers, timeout=30)
    assert t.status_code == 200, t.text[:300]
    tj = t.json()
    teachers = tj if isinstance(tj, list) else tj.get("teachers") or tj.get("data") or []
    teacher_id = teachers[0].get("id") or teachers[0].get("_id") if teachers else None
    return {"course_id": course_id, "teacher_id": teacher_id}


# ---------- PDF exports (new) ----------
PDF_CT = "application/pdf"


def _assert_pdf(resp):
    assert resp.status_code == 200, f"{resp.status_code}: {resp.text[:300]}"
    ct = resp.headers.get("Content-Type", "")
    assert PDF_CT in ct, f"content-type={ct}"
    assert resp.headers.get("X-Filename"), "missing X-Filename header"
    assert len(resp.content) > 200, "pdf too small"


class TestPdfExports:
    def test_attendance_overview_pdf(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/reports/attendance-overview/export-pdf", headers=admin_headers, timeout=60)
        _assert_pdf(r)

    def test_warnings_pdf(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/reports/warnings/export-pdf?warning_threshold=25&deprivation_threshold=40", headers=admin_headers, timeout=60)
        _assert_pdf(r)

    def test_absent_students_pdf(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/reports/absent-students/export-pdf?min_absence_rate=15", headers=admin_headers, timeout=60)
        _assert_pdf(r)

    def test_daily_pdf(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/reports/daily/export-pdf?date=2026-09-22", headers=admin_headers, timeout=60)
        _assert_pdf(r)

    def test_course_pdf(self, admin_headers, sample_ids):
        cid = sample_ids["course_id"]
        if not cid:
            pytest.skip("no courses")
        r = requests.get(f"{BASE_URL}/api/reports/course/{cid}/export-pdf", headers=admin_headers, timeout=60)
        _assert_pdf(r)

    def test_teacher_summary_pdf(self, admin_headers, sample_ids):
        tid = sample_ids["teacher_id"]
        if not tid:
            pytest.skip("no teachers")
        r = requests.get(f"{BASE_URL}/api/reports/teacher-summary/export-pdf?teacher_id={tid}", headers=admin_headers, timeout=60)
        _assert_pdf(r)


# ---------- Existing Excel & other export endpoints ----------
XLSX_CTS = ("spreadsheet", "excel", "openxmlformats", "octet-stream")


def _assert_xlsx(resp):
    assert resp.status_code == 200, f"{resp.status_code}: {resp.text[:300]}"
    ct = resp.headers.get("Content-Type", "").lower()
    assert any(x in ct for x in XLSX_CTS), f"content-type={ct}"
    assert len(resp.content) > 200


class TestExcelAndLegacy:
    def test_excel_attendance_overview(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/export/report/attendance-overview/excel", headers=admin_headers, timeout=60)
        _assert_xlsx(r)

    def test_excel_warnings(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/export/report/warnings/excel", headers=admin_headers, timeout=60)
        _assert_xlsx(r)

    def test_excel_absent_students(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/export/report/absent-students/excel", headers=admin_headers, timeout=60)
        _assert_xlsx(r)

    def test_excel_daily(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/export/report/daily/excel?date=2026-09-22", headers=admin_headers, timeout=60)
        _assert_xlsx(r)

    def test_excel_course(self, admin_headers, sample_ids):
        cid = sample_ids["course_id"]
        if not cid:
            pytest.skip("no courses")
        r = requests.get(f"{BASE_URL}/api/export/report/course/{cid}/excel", headers=admin_headers, timeout=60)
        _assert_xlsx(r)

    def test_excel_teacher_summary(self, admin_headers, sample_ids):
        tid = sample_ids["teacher_id"]
        if not tid:
            pytest.skip("no teachers")
        r = requests.get(f"{BASE_URL}/api/export/report/teacher-summary/excel?teacher_id={tid}", headers=admin_headers, timeout=60)
        _assert_xlsx(r)

    def test_teacher_attendance_excel(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/reports/teacher-attendance/export/excel?start_date=2026-09-01&end_date=2026-09-22", headers=admin_headers, timeout=60)
        _assert_xlsx(r)

    def test_teacher_attendance_pdf(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/reports/teacher-attendance/export/pdf?start_date=2026-09-01&end_date=2026-09-22", headers=admin_headers, timeout=60)
        _assert_pdf(r)


# ---------- JSON base endpoints ----------
class TestJsonBase:
    def test_attendance_overview(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/reports/attendance-overview", headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text[:300]

    def test_warnings(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/reports/warnings", headers=admin_headers, timeout=60)
        assert r.status_code == 200

    def test_absent_students(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/reports/absent-students", headers=admin_headers, timeout=60)
        assert r.status_code == 200

    def test_daily(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-09-22", headers=admin_headers, timeout=60)
        assert r.status_code == 200

    def test_course_detailed(self, admin_headers, sample_ids):
        cid = sample_ids["course_id"]
        if not cid:
            pytest.skip()
        r = requests.get(f"{BASE_URL}/api/reports/course/{cid}/detailed", headers=admin_headers, timeout=60)
        assert r.status_code == 200

    def test_teacher_summary(self, admin_headers, sample_ids):
        tid = sample_ids["teacher_id"]
        if not tid:
            pytest.skip()
        r = requests.get(f"{BASE_URL}/api/reports/teacher-summary?teacher_id={tid}", headers=admin_headers, timeout=60)
        assert r.status_code == 200

    def test_teacher_attendance(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/reports/teacher-attendance?start_date=2026-09-01&end_date=2026-09-22", headers=admin_headers, timeout=60)
        assert r.status_code == 200

    def test_teacher_delays(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/reports/teacher-delays", headers=admin_headers, timeout=60)
        assert r.status_code == 200

    def test_lesson_completion(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/reports/lesson-completion", headers=admin_headers, timeout=60)
        assert r.status_code == 200


# ---------- RBAC ----------
class TestRbac:
    def test_teacher_forbidden_on_attendance_overview_pdf(self, teacher_headers):
        r = requests.get(f"{BASE_URL}/api/reports/attendance-overview/export-pdf", headers=teacher_headers, timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code}"

    def test_teacher_allowed_own_summary_pdf(self, teacher_headers):
        r = requests.get(f"{BASE_URL}/api/reports/teacher-summary/export-pdf", headers=teacher_headers, timeout=60)
        assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text[:200]}"
        assert "application/pdf" in r.headers.get("Content-Type", "")
