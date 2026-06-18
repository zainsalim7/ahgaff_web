"""
Regression test for teaching-load report bug:
Teacher with courses in MULTIPLE departments was missing courses outside their primary department.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("BASE_URL", "https://schedule-hub-272.preview.emergentagent.com")
API = f"{BASE_URL}/api"


def get_admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    r.raise_for_status()
    return r.json().get("access_token") or r.json().get("token")


def test_cross_department_courses_appear_in_report():
    """Bug fix: teacher with courses in other departments must show them all."""
    token = get_admin_token()
    H = {"Authorization": f"Bearer {token}"}

    # Find any teacher with courses in MULTIPLE departments
    teachers = requests.get(f"{API}/teachers?limit=50", headers=H).json()
    teachers = teachers if isinstance(teachers, list) else teachers.get("items", [])
    assert len(teachers) > 0, "No teachers found"

    candidate = None
    for t in teachers:
        tid = t.get("id")
        # Fetch courses for this teacher across all depts
        r = requests.get(f"{API}/teaching-load/report/advanced?teacher_id={tid}", headers=H)
        if r.status_code != 200:
            continue
        data = r.json()
        tc = data.get("teacher_comparison", [])
        if tc and tc[0].get("courses_count", 0) >= 2:
            # check if courses span multiple departments
            depts = {c.get("department_id") for c in tc[0].get("courses", [])}
            if len(depts) >= 2:
                candidate = (tid, t.get("department_id"), tc[0])
                break

    if not candidate:
        pytest.skip("No teacher with cross-dept courses in this DB")

    tid, primary_dept, single_view = candidate

    # Now request the report by department_id (primary dept)
    r = requests.get(f"{API}/teaching-load/report/advanced?department_id={primary_dept}", headers=H)
    assert r.status_code == 200
    dept_view = r.json()

    # Find this teacher in the dept_view
    teacher_in_dept = next((t for t in dept_view["teacher_comparison"] if t["teacher_id"] == tid), None)
    assert teacher_in_dept is not None, "Teacher not in their primary department's report"

    # FIX VALIDATION: courses_count in dept view must match single-teacher view
    assert teacher_in_dept["courses_count"] == single_view["courses_count"], (
        f"Bug regression: dept view shows {teacher_in_dept['courses_count']} courses "
        f"but teacher actually has {single_view['courses_count']} courses"
    )

    # All courses from the single-view must appear in dept view too
    single_codes = {c["code"] for c in single_view["courses"]}
    dept_codes = {c["code"] for c in teacher_in_dept["courses"]}
    assert single_codes == dept_codes, (
        f"Course list mismatch: missing {single_codes - dept_codes}, extra {dept_codes - single_codes}"
    )


if __name__ == "__main__":
    test_cross_department_courses_appear_in_report()
    print("✓ Cross-department courses fix verified")
