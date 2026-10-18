# Iteration 108 regression: teacher-delays filters/exports, teacher-workload course_ids, default-credentials RBAC, notifications
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"
TEACHER_ID = "698e533beb4c6eb021c50302"
COURSES = "698f0000d803b27aab0120af,69cd1f0b12f04e7c1d6a4991"


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {u}: {r.status_code} {r.text[:200]}")
    d = r.json()
    return d.get("access_token") or d.get("token")


@pytest.fixture(scope="module")
def admin():
    return {"Authorization": f"Bearer {_login('admin', 'admin123')}"}


@pytest.fixture(scope="module")
def student():
    return {"Authorization": f"Bearer {_login('1001', 'test1234')}"}


@pytest.fixture(scope="module")
def teacher():
    return {"Authorization": f"Bearer {_login('teacher180156', 'teacher123')}"}


# --- teacher delays ---
class TestTeacherDelays:
    def test_delays_unfiltered(self, admin):
        r = requests.get(f"{API}/reports/teacher-delays", headers=admin, params={"start_date": "2026-01-01", "end_date": "2026-06-30"}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), (dict, list))

    def test_delays_teacher_filter(self, admin):
        r = requests.get(f"{API}/reports/teacher-delays", headers=admin, params={"start_date": "2026-01-01", "end_date": "2026-06-30", "teacher_id": TEACHER_ID}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        rows = d.get("teachers") or d.get("data") or d.get("rows") or [] if isinstance(d, dict) else d
        for t in rows if isinstance(rows, list) else []:
            tid = t.get("teacher_id") or t.get("id")
            if tid:
                assert tid == TEACHER_ID

    def test_delays_course_filter(self, admin):
        r = requests.get(f"{API}/reports/teacher-delays", headers=admin, params={"course_id": "698f0000d803b27aab0120af"}, timeout=60)
        assert r.status_code == 200, r.text[:300]

    @pytest.mark.parametrize("suffix", ["export", "export-pdf"])
    def test_delays_exports(self, admin, suffix):
        r = requests.get(f"{API}/reports/teacher-delays/{suffix}", headers=admin, params={"start_date": "2026-01-01", "end_date": "2026-06-30", "teacher_id": TEACHER_ID}, timeout=90)
        assert r.status_code == 200, r.text[:300]
        assert len(r.content) > 500


# --- teacher workload course_ids ---
class TestWorkload:
    P = {"teacher_id": TEACHER_ID, "start_date": "2026-01-01", "end_date": "2026-06-30", "course_ids": COURSES}

    def test_workload_course_ids(self, admin):
        r = requests.get(f"{API}/reports/teacher-workload", headers=admin, params=self.P, timeout=90)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        print({k: d[k] for k in d if k != "teachers"})
        t = d["teachers"][0]
        # NOTE: course_filter lives on the teacher row (not summary)
        assert t["summary"].get("course_filter") is True
        courses = t.get("courses") or []
        assert len(courses) == 2, [c.get("course_name") for c in courses]
        assert t["summary"]["required_hours"] == 45, t["summary"]["required_hours"]

    @pytest.mark.parametrize("path", ["export/report/teacher-workload/pdf", "export/report/teacher-workload/excel", "export/report/teacher-workload/sheet-pdf"])
    def test_workload_exports(self, admin, path):
        r = requests.get(f"{API}/{path}", headers=admin, params=self.P, timeout=120)
        assert r.status_code == 200, r.text[:300]
        assert len(r.content) > 500


# --- default credentials ---
class TestDefaultCredentials:
    @pytest.mark.parametrize("kind", ["students", "teachers", "employees"])
    def test_preview_admin(self, admin, kind):
        r = requests.get(f"{API}/admin/default-credentials/preview", headers=admin, params={"kind": kind}, timeout=90)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["kind"] == kind and "summary" in d and isinstance(d["rows"], list)

    def test_export_admin(self, admin):
        r = requests.get(f"{API}/admin/default-credentials/export", headers=admin, params={"kind": "students"}, timeout=120)
        assert r.status_code == 200, r.text[:300]
        assert r.content[:2] == b"PK"

    def test_preview_student_forbidden(self, student):
        r = requests.get(f"{API}/admin/default-credentials/preview", headers=student, params={"kind": "students"}, timeout=30)
        assert r.status_code == 403

    def test_preview_teacher_forbidden(self, teacher):
        r = requests.get(f"{API}/admin/default-credentials/preview", headers=teacher, params={"kind": "students"}, timeout=30)
        assert r.status_code == 403


# --- notifications still work ---
class TestNotifications:
    def test_admin_notifications_list(self, admin):
        r = requests.get(f"{API}/notifications", headers=admin, timeout=30)
        assert r.status_code == 200

    def test_student_notifications_list(self, student):
        r = requests.get(f"{API}/notifications", headers=student, timeout=30)
        assert r.status_code == 200


# --- legacy student report by student number (called by /report-student?id=<student_no>) ---
class TestStudentReportByNumber:
    def test_student_report_by_student_no(self, admin):
        # BUG (iter108): ObjectId(student_id) raises InvalidId -> 500 before the student_no fallback runs
        r = requests.get(f"{API}/reports/student/1001", headers=admin, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
