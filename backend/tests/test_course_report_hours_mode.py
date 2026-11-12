# Course detailed report: lectures (default, regression) vs hours mode - JSON, PDF, Excel
import io
import os
import pytest
import requests
import openpyxl

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
COURSE_ID = "698f0000d803b27aab0120af"


def _login(u, p):
    s = requests.Session()
    s.headers.update({"X-Platform": "mobile"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {u}: {r.status_code} {r.text[:200]}")
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def teacher():
    return _login("teacher180156", "teacher123")


@pytest.fixture(scope="module")
def admin():
    return _login("admin", "admin123")


@pytest.fixture(scope="module")
def report(teacher):
    r = teacher.get(f"{BASE_URL}/api/reports/course/{COURSE_ID}/detailed", timeout=60)
    assert r.status_code == 200, r.text[:300]
    return r.json()


# --- Regression: default JSON fields
class TestDetailedDefault:
    def test_top_level(self, report):
        assert set(report.keys()) == {"course", "students", "lectures", "summary"}

    def test_original_student_fields(self, report):
        assert len(report["students"]) > 0
        for st in report["students"]:
            for k in ["student_id", "student_name", "present", "absent", "late", "attendance_rate"]:
                assert k in st
        rates = [s["attendance_rate"] for s in report["students"]]
        assert rates == sorted(rates, reverse=True)

    def test_original_lecture_fields(self, report):
        for l in report["lectures"]:
            for k in ["date", "start_time", "status", "present_count", "total_students", "attendance_rate"]:
                assert k in l

    def test_original_summary(self, report):
        s = report["summary"]
        for k in ["total_students", "total_lectures", "absent_lectures", "absent_excused_lectures", "avg_attendance_rate"]:
            assert k in s
        assert s["total_students"] == len(report["students"])
        avg = round(sum(x["attendance_rate"] for x in report["students"]) / len(report["students"]), 2)
        assert s["avg_attendance_rate"] == avg


# --- Hours fields sanity
class TestHoursFields:
    def test_summary_hours(self, report):
        s = report["summary"]
        assert s["unexcused_limit_percent"] == 10
        assert s["total_limit_percent"] == 25
        assert s["total_hours_executed"] == 1.5
        assert "10%" in s["absence_rule_text"] and "25%" in s["absence_rule_text"]

    def test_lecture_hours(self, report):
        for l in report["lectures"]:
            assert isinstance(l["hours"], (int, float))
            assert "end_time" in l

    def test_student_status(self, report):
        full_abs = [s for s in report["students"] if s["executed_hours"] > 0 and s["present_hours"] == 0 and s["excused_hours"] == 0]
        full_pres = [s for s in report["students"] if s["executed_hours"] > 0 and s["present_hours"] == s["executed_hours"]]
        print("full absent:", len(full_abs), "full present:", len(full_pres))
        assert len(full_abs) >= 1
        for s in full_abs:
            assert s["unexcused_hours"] == 1.5
            assert s["exceeded_unexcused_hours"] is True and s["exceeded_total_hours"] is True
            assert s["status_key_hours"] == "candidate"
            assert s["status_ar_hours"].startswith("تجاوز الحد")
            assert s["attendance_rate_hours"] == 0
        for s in full_pres:
            assert s["status_ar_hours"] == "ممتاز"
            assert s["attendance_rate_hours"] == 100
            assert s["exceeded_unexcused_hours"] is False

    def test_admin_same(self, admin, report):
        r = admin.get(f"{BASE_URL}/api/reports/course/{COURSE_ID}/detailed", timeout=60)
        assert r.status_code == 200
        assert r.json()["summary"]["total_students"] == report["summary"]["total_students"]


def _xlsx(resp):
    wb = openpyxl.load_workbook(io.BytesIO(resp.content))
    out = {}
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        out[ws.title] = rows
    return out


# --- Excel
class TestExcel:
    def test_default_unchanged(self, teacher, report):
        r = teacher.get(f"{BASE_URL}/api/export/report/course/{COURSE_ID}/excel", timeout=60)
        assert r.status_code == 200
        wb = _xlsx(r)
        assert list(wb.keys()) == ["الطلاب", "المحاضرات"]
        assert list(wb["الطلاب"][0]) == ["الترتيب", "رقم القيد", "اسم الطالب", "حاضر", "غائب", "متأخر", "نسبة الحضور %"]
        assert list(wb["المحاضرات"][0]) == ["التاريخ", "الوقت", "عدد الحاضرين", "الإجمالي", "نسبة الحضور %"]
        assert len(wb["الطلاب"]) - 1 == len(report["students"])

    def test_explicit_lectures_equals_default(self, teacher):
        a = _xlsx(teacher.get(f"{BASE_URL}/api/export/report/course/{COURSE_ID}/excel", timeout=60))
        b = _xlsx(teacher.get(f"{BASE_URL}/api/export/report/course/{COURSE_ID}/excel?mode=lectures", timeout=60))
        assert a == b

    def test_hours(self, teacher, report):
        r = teacher.get(f"{BASE_URL}/api/export/report/course/{COURSE_ID}/excel?mode=hours", timeout=60)
        assert r.status_code == 200
        wb = _xlsx(r)
        assert list(wb.keys()) == ["الطلاب", "المحاضرات"]
        assert list(wb["الطلاب"][0]) == ["الترتيب", "رقم القيد", "اسم الطالب", "ساعات حضور", "غياب بعذر (ساعة)", "غياب بلا عذر (ساعة)", "نسبة الحضور %", "الحالة"]
        assert list(wb["المحاضرات"][0]) == ["التاريخ", "الوقت", "المدة (ساعة)", "عدد الحاضرين", "الإجمالي", "نسبة الحضور %"]
        assert len(wb["الطلاب"]) - 1 == len(report["students"])
        statuses = {row[7] for row in wb["الطلاب"][1:]}
        assert any(str(x).startswith("تجاوز الحد") for x in statuses)


# --- PDF
class TestPdf:
    def test_default(self, teacher):
        r = teacher.get(f"{BASE_URL}/api/reports/course/{COURSE_ID}/export-pdf", timeout=90)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_lectures_explicit(self, teacher):
        r = teacher.get(f"{BASE_URL}/api/reports/course/{COURSE_ID}/export-pdf?mode=lectures", timeout=90)
        assert r.status_code == 200 and r.content[:4] == b"%PDF"

    def test_hours(self, teacher):
        r = teacher.get(f"{BASE_URL}/api/reports/course/{COURSE_ID}/export-pdf?mode=hours", timeout=90)
        assert r.status_code == 200 and r.content[:4] == b"%PDF"
        assert len(r.content) > 2000

    def test_invalid_mode_falls_back(self, teacher):
        r = teacher.get(f"{BASE_URL}/api/reports/course/{COURSE_ID}/export-pdf?mode=xyz", timeout=90)
        assert r.status_code == 200 and r.content[:4] == b"%PDF"


class TestAuth:
    def test_unauth(self):
        r = requests.get(f"{BASE_URL}/api/reports/course/{COURSE_ID}/detailed", timeout=30)
        assert r.status_code in (401, 403)
