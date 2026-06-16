"""Tests for /api/teaching-load/report/advanced and supporting endpoints.

Covers the redesigned /teaching-load-report page (iteration_30).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "admin", "password": "admin123"},
        timeout=20,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"no token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ------------- prerequisite data -------------

@pytest.fixture(scope="module")
def departments(auth_headers):
    r = requests.get(f"{BASE_URL}/api/departments", headers=auth_headers, timeout=20)
    assert r.status_code == 200, f"departments failed: {r.text[:200]}"
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0, "no departments in DB"
    return data


@pytest.fixture(scope="module")
def semesters(auth_headers):
    r = requests.get(f"{BASE_URL}/api/semesters", headers=auth_headers, timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0, "no semesters in DB"
    return data


@pytest.fixture(scope="module")
def active_semester(semesters):
    actives = [s for s in semesters if s.get("status") == "active"]
    assert len(actives) >= 1, f"no active semester. semesters={[(s.get('name'), s.get('status')) for s in semesters]}"
    return actives[0]


# ------------- advanced report endpoint -------------

class TestAdvancedReport:
    def test_report_by_department_and_active_semester(self, auth_headers, departments, active_semester):
        dept = departments[0]
        r = requests.get(
            f"{BASE_URL}/api/teaching-load/report/advanced",
            params={"department_id": dept["id"], "semester_id": active_semester["id"]},
            headers=auth_headers,
            timeout=30,
        )
        assert r.status_code == 200, f"advanced report failed: {r.status_code} {r.text[:300]}"
        body = r.json()

        # Structural assertions matching what the new UI consumes
        assert "summary" in body, f"missing 'summary': keys={list(body.keys())}"
        assert "teacher_comparison" in body
        assert "courses_without_teacher" in body
        assert "teachers_without_courses" in body

        s = body["summary"]
        # Field names used by the new StatCards
        for key in [
            "total_teachers",
            "teachers_with_load",
            "courses_without_teacher",
            "overloaded_teachers",
            "average_weekly_load",
            "courses_assigned",
            "total_courses",
            "teachers_without_courses",
        ]:
            assert key in s, f"summary missing field '{key}'. summary={s}"

        # types are numeric-ish
        for key in [
            "total_teachers", "teachers_with_load", "courses_without_teacher",
            "overloaded_teachers", "courses_assigned", "total_courses", "teachers_without_courses"
        ]:
            assert isinstance(s[key], int), f"{key} not int: {type(s[key]).__name__}={s[key]}"

        assert isinstance(body["teacher_comparison"], list)
        assert isinstance(body["courses_without_teacher"], list)
        assert isinstance(body["teachers_without_courses"], list)

    def test_report_all_departments(self, auth_headers, departments, active_semester):
        """Run for every dept; report should always return 200 even if empty."""
        results = {}
        for d in departments:
            r = requests.get(
                f"{BASE_URL}/api/teaching-load/report/advanced",
                params={"department_id": d["id"], "semester_id": active_semester["id"]},
                headers=auth_headers,
                timeout=30,
            )
            results[d.get("name", d["id"])] = r.status_code
            assert r.status_code == 200, f"dept {d.get('name')}: {r.status_code} {r.text[:200]}"
            body = r.json()
            assert "summary" in body and "teacher_comparison" in body
        print("Per-dept statuses:", results)

    def test_report_teacher_comparison_shape(self, auth_headers, departments, active_semester):
        # Find first dept with at least one teacher
        target = None
        for d in departments:
            r = requests.get(
                f"{BASE_URL}/api/teaching-load/report/advanced",
                params={"department_id": d["id"], "semester_id": active_semester["id"]},
                headers=auth_headers,
                timeout=30,
            )
            body = r.json()
            if body.get("teacher_comparison"):
                target = body
                break
        if not target:
            pytest.skip("no department has teacher_comparison rows to validate shape")
        t = target["teacher_comparison"][0]
        # Fields the new UI reads
        for field in ["teacher_id", "teacher_name", "status", "usage_percentage",
                      "assigned_weekly_hours", "max_weekly_hours", "courses_count", "courses"]:
            assert field in t, f"teacher_comparison row missing '{field}': {t}"
        assert t["status"] in ("optimal", "overload", "low", "none"), f"unexpected status={t['status']}"
        assert isinstance(t["courses"], list)

    def test_report_by_teacher_only(self, auth_headers, departments, active_semester):
        # find a teacher
        r = requests.get(f"{BASE_URL}/api/teachers", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        teachers = r.json()
        if not teachers:
            pytest.skip("no teachers")
        t = teachers[0]
        r2 = requests.get(
            f"{BASE_URL}/api/teaching-load/report/advanced",
            params={"teacher_id": t["id"], "semester_id": active_semester["id"]},
            headers=auth_headers,
            timeout=30,
        )
        assert r2.status_code == 200, f"teacher report failed: {r2.text[:300]}"
        body = r2.json()
        assert "summary" in body
        assert "teacher_comparison" in body
        # Should have at most 1 teacher in the comparison
        assert len(body["teacher_comparison"]) <= 1

    def test_report_without_filters_returns_global(self, auth_headers, active_semester):
        # The new UI sends no department for "teacher" scope when no dept selected;
        # endpoint should not 500.
        r = requests.get(
            f"{BASE_URL}/api/teaching-load/report/advanced",
            params={"semester_id": active_semester["id"]},
            headers=auth_headers,
            timeout=30,
        )
        assert r.status_code == 200, f"global report failed: {r.text[:300]}"
        body = r.json()
        assert "summary" in body

    def test_report_unauthorized(self):
        r = requests.get(
            f"{BASE_URL}/api/teaching-load/report/advanced",
            timeout=20,
        )
        assert r.status_code in (401, 403), f"expected 401/403 for unauth, got {r.status_code}"
