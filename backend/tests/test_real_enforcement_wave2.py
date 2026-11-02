# Real Enforcement Wave 2 (read-only GET) — attendance/reports/teaching-load/enrollments/alumni/councils/archive/certificates/statements
# Covers: in-scope 200 / out-of-scope 403 / no-param 400 for new real-enforcement users, escalation attempts, and admin/Saeed regression.
import os
import uuid
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"')
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "test_database")]

DEPT_A = "698e500997fef774e66e93a8"   # الشريعة والقانون (in scope)
DEPT_B = "698e501d97fef774e66e93a9"   # الدراسات الإسلامية (out of scope)
FAKE_SEM = "fakesemester123"

ALL_KEYS = [
    "attendance_ser_get_lecture_attendance", "attendance_ser_get_course_attendance", "attendance_ser_get_student_attendance",
    "attendance_ser_get_student_stats", "attendance_ser_get_course_stats", "enrollments_ser_get_course_enrollments",
    "enrollments_ser_get_enrolled_students_for_attendance", "reports_ser_get_department_report",
    "reports_ser_get_attendance_overview_report", "reports_ser_get_student_attendance_report",
    "reports_ser_get_course_detailed_report", "teaching_load_teaching_load_get_teaching_loads",
    "teaching_load_teaching_load_advanced_teaching_load_report", "alumni_alumni_list_alumni",
    "councils_faculty_board_list_candidates", "councils_faculty_board_list_decisions",
    "archive_archives_get_archive_courses", "archive_archives_get_archive_students",
    "certificates_certificates_list_certificates", "certificates_statements_list_statements",
]

CREATED = {"users": [], "roles": [], "assignments": []}


def _dept_fixture(dep):
    d = mongo.departments.find_one({"_id": ObjectId(dep)})
    c = mongo.courses.find_one({"department_id": dep, "is_active": True})
    lec = mongo.lectures.find_one({"course_id": str(c["_id"])}) if c else None
    s = mongo.students.find_one({"department_id": dep})
    t = mongo.teachers.find_one({"department_id": dep, "is_active": {"$ne": False}})
    return {"faculty": str(d["faculty_id"]), "course": str(c["_id"]), "lecture": str(lec["_id"]) if lec else None,
            "student": str(s["_id"]), "teacher": str(t["_id"]) if t else None}


A = _dept_fixture(DEPT_A)
B = _dept_fixture(DEPT_B)


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin_h():
    return login("admin", "admin123")


@pytest.fixture(scope="module")
def saeed_h():
    return login("Saeed", "test1234")


def _make_user(admin_h, keys, scopes):
    """scopes: list of (scope_type, [refs])"""
    uname = f"TEST_w2_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/advanced-access/users/quick-find-or-create", headers=admin_h,
                      json={"username": uname, "full_name": f"TEST {uname}"}, timeout=30)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    CREATED["users"].append(uid)
    assert r.json()["existed"] is False
    rr = requests.post(f"{API}/advanced-access/roles", headers=admin_h,
                       json={"name_ar": f"TEST role {uname}", "permission_keys": keys}, timeout=30)
    assert rr.status_code == 200, rr.text
    rid = rr.json()["id"]
    CREATED["roles"].append(rid)
    for stype, refs in scopes:
        ra = requests.post(f"{API}/advanced-access/assignments", headers=admin_h, json={
            "user_id": uid, "assignment_type": "academic", "advanced_role_id": rid,
            "context_label_ar": "TEST", "scope": {"scope_type": stype, "scope_ref_ids": refs}}, timeout=30)
        assert ra.status_code == 200, ra.text
        CREATED["assignments"].append(ra.json()["id"])
    return uid, login(uname, uname)


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    mongo.advanced_user_assignments.delete_many({"_id": {"$in": [ObjectId(x) for x in CREATED["assignments"]]}})
    mongo.advanced_roles.delete_many({"_id": {"$in": [ObjectId(x) for x in CREATED["roles"]]}})
    mongo.users.delete_many({"_id": {"$in": [ObjectId(x) for x in CREATED["users"]]}})
    mongo.users.delete_many({"username": {"$regex": "^TEST_w2_"}})


@pytest.fixture(scope="module")
def u1(admin_h):
    """Dept-A scoped real-enforcement user with all wave-2 keys"""
    return _make_user(admin_h, ALL_KEYS, [("department", [DEPT_A])])[1]


def g(h, path, **params):
    return requests.get(f"{API}{path}", headers=h, params=params or None, timeout=90)


# ---------- Batch 1: entity-derived scope (course/student/lecture) ----------
ENTITY_CASES = [
    ("/attendance/course/{course}", "course"),
    ("/attendance/student/{student}", "student"),
    ("/attendance/lecture/{lecture}", "lecture"),
    ("/attendance/stats/student/{student}", "student"),
    ("/attendance/stats/course/{course}", "course"),
    ("/reports/student/{student}", "student"),
    ("/reports/course/{course}/detailed", "course"),
    ("/enrollments/{course}", "course"),
    ("/enrollments/{course}/students", "course"),
]


@pytest.mark.parametrize("tpl,_k", ENTITY_CASES)
def test_entity_in_scope_200_out_scope_403(u1, tpl, _k):
    r_in = g(u1, tpl.format(**A))
    r_out = g(u1, tpl.format(**B))
    assert r_in.status_code == 200, f"in-scope {tpl}: {r_in.status_code} {r_in.text[:200]}"
    assert r_out.status_code == 403, f"out-scope {tpl}: {r_out.status_code} {r_out.text[:200]}"


# ---------- Batch 1/2: explicit param endpoints ----------
PARAM_CASES = [
    "/reports/attendance-overview", "/teaching-load", "/teaching-load/report/advanced", "/alumni",
    "/faculty-board/candidates", "/faculty-board/decisions",
]


@pytest.mark.parametrize("path", PARAM_CASES)
def test_param_endpoints_scope(u1, path):
    assert g(u1, path, department_id=DEPT_A).status_code == 200
    r_out = g(u1, path, department_id=DEPT_B)
    assert r_out.status_code == 403, r_out.text[:200]
    r_none = g(u1, path)
    assert r_none.status_code == 400, r_none.text[:200]


def test_department_report_scope(u1):
    assert g(u1, f"/reports/department/{DEPT_A}").status_code == 200
    assert g(u1, f"/reports/department/{DEPT_B}").status_code == 403
    r = g(u1, "/reports/department/notanobjectid")
    assert r.status_code == 403, f"invalid id should be rejected by guard, got {r.status_code}"


def test_archives_fake_semester(u1):
    for p in ("courses", "students"):
        assert g(u1, f"/archives/{FAKE_SEM}/{p}").status_code == 400
        assert g(u1, f"/archives/{FAKE_SEM}/{p}", department_id=DEPT_B).status_code == 403
        r = g(u1, f"/archives/{FAKE_SEM}/{p}", department_id=DEPT_A)
        assert r.status_code == 404, r.text[:200]


def test_certificates_statements_faculty_derived(u1):
    rc = g(u1, "/certificates")
    assert rc.status_code == 200, rc.text[:200]
    assert all(c.get("faculty_id") == A["faculty"] for c in rc.json())
    rs = g(u1, "/statements")
    assert rs.status_code == 200, rs.text[:200]
    assert all(s.get("faculty_id") == A["faculty"] for s in rs.json())
    assert g(u1, "/statements", faculty_id=B["faculty"]).status_code == 403


# ---------- Escalation attempts ----------
def test_escalation_mixed_dept_faculty(u1):
    # in-scope dept + out-of-scope faculty must not pass
    for path in ("/reports/attendance-overview", "/alumni", "/faculty-board/candidates", "/faculty-board/decisions",
                 "/teaching-load/report/advanced"):
        r = g(u1, path, department_id=DEPT_A, faculty_id=B["faculty"])
        assert r.status_code == 403, f"{path}: {r.status_code}"


def test_escalation_candidates_foreign_course(u1):
    r = g(u1, "/faculty-board/candidates", department_id=DEPT_A, course_id=B["course"])
    assert r.status_code in (403,) or r.json().get("total", 0) == 0, r.text[:200]


def test_escalation_decisions_foreign_course(u1):
    r = g(u1, "/faculty-board/decisions", department_id=DEPT_A, course_id=B["course"])
    assert r.status_code == 200
    assert all(True for _ in r.json()["items"])
    for d in r.json()["items"]:
        assert d.get("course_id") != B["course"]


def test_escalation_teaching_load_foreign_teacher(u1):
    r = g(u1, "/teaching-load", department_id=DEPT_A, teacher_id=B["teacher"])
    assert r.status_code == 200
    assert r.json().get("items") == []


def test_escalation_advanced_report_foreign_teacher(u1):
    """department_id in scope + teacher_id from another dept — must not leak the foreign teacher's load"""
    r = g(u1, "/teaching-load/report/advanced", department_id=DEPT_A, teacher_id=B["teacher"])
    if r.status_code == 200:
        body = r.text
        assert B["teacher"] not in body, "LEAK: foreign-department teacher returned in advanced report"


def test_escalation_alumni_results_limited(u1):
    r = g(u1, "/alumni", department_id=DEPT_A)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    for s in items:
        assert s.get("department_id") in (DEPT_A, None) or \
            (s.get("graduation_data", {}).get("department_snapshot", {}) or {}).get("department_id") == DEPT_A


def test_overview_results_limited(u1):
    r = g(u1, "/reports/attendance-overview", department_id=DEPT_A)
    assert r.status_code == 200
    cids = [c["course_id"] for c in (r.json() if isinstance(r.json(), list) else r.json().get("courses", r.json().get("items", [])))]
    if cids:
        deps = {str(c.get("department_id")) for c in mongo.courses.find({"_id": {"$in": [ObjectId(x) for x in cids]}})}
        assert deps == {DEPT_A}


# ---------- Other real-enforcement user shapes ----------
def test_user_without_keys_gets_403(admin_h):
    _, h = _make_user(admin_h, ["alumni_alumni_list_alumni"], [("department", [DEPT_A])])
    assert g(h, "/alumni", department_id=DEPT_A).status_code == 200
    assert g(h, "/reports/attendance-overview", department_id=DEPT_A).status_code == 403
    assert g(h, f"/attendance/course/{A['course']}").status_code == 403
    assert g(h, "/certificates").status_code == 403


def test_user_without_assignment_gets_403(admin_h):
    uname = f"TEST_w2_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/advanced-access/users/quick-find-or-create", headers=admin_h,
                      json={"username": uname, "full_name": "TEST noassign"}, timeout=30)
    CREATED["users"].append(r.json()["id"])
    h = login(uname, uname)
    assert g(h, "/alumni", department_id=DEPT_A).status_code == 403
    assert g(h, f"/attendance/course/{A['course']}").status_code == 403
    assert g(h, "/certificates").status_code in (400, 403)


def test_multi_faculty_dept_assignments_no_widening(admin_h):
    """Two dept assignments in different faculties → faculty_ids gets 2 entries. Legacy scope filter treats
    len(faculty_ids)>=2 as FULL faculties — check candidates by course_id from a 3rd (unassigned) department."""
    _, h = _make_user(admin_h, ALL_KEYS, [("department", [DEPT_A]), ("department", [DEPT_B])])
    g(h, "/alumni", department_id=DEPT_A)  # trigger sync
    other_deps = [str(d["_id"]) for d in mongo.departments.find({"faculty_id": A["faculty"]}) if str(d["_id"]) != DEPT_A]
    foreign = mongo.courses.find_one({"department_id": {"$in": other_deps}})
    if not foreign:
        pytest.skip("no course in sibling dept")
    r = g(h, "/faculty-board/candidates", department_id=DEPT_A, course_id=str(foreign["_id"]))
    assert r.status_code == 403, f"LEAK: sibling-dept course accessible via course_id ({r.status_code})"


# ---------- Regression: admin / Saeed ----------
REG_PATHS = [
    f"/attendance/course/{B['course']}", f"/attendance/student/{B['student']}", f"/attendance/lecture/{B['lecture']}",
    f"/attendance/stats/student/{B['student']}", f"/attendance/stats/course/{B['course']}",
    f"/reports/department/{DEPT_B}", "/reports/attendance-overview", f"/reports/student/{B['student']}",
    f"/reports/course/{B['course']}/detailed", "/teaching-load", "/teaching-load/report/advanced",
    f"/enrollments/{B['course']}", f"/enrollments/{B['course']}/students", "/alumni",
    "/faculty-board/candidates", "/faculty-board/decisions", "/certificates", "/statements",
]


@pytest.mark.parametrize("path", REG_PATHS)
def test_admin_regression_200(admin_h, path):
    r = g(admin_h, path)
    assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"


def test_admin_archives_fake_404(admin_h):
    assert g(admin_h, f"/archives/{FAKE_SEM}/courses").status_code == 404
    assert g(admin_h, f"/archives/{FAKE_SEM}/students").status_code == 404


SAEED_EXPECTED = {
    f"/attendance/course/{B['course']}": 200, f"/attendance/student/{B['student']}": 200,
    f"/attendance/stats/student/{B['student']}": 200, f"/attendance/stats/course/{B['course']}": 200,
    f"/reports/department/{DEPT_B}": 200, "/reports/attendance-overview": 200,
    f"/reports/student/{B['student']}": 200, f"/reports/course/{B['course']}/detailed": 200,
    "/teaching-load": 403, "/teaching-load/report/advanced": 403,
    f"/enrollments/{B['course']}": 200, f"/enrollments/{B['course']}/students": 200, "/alumni": 200,
    "/certificates": 403, "/statements": 403,
}


@pytest.mark.parametrize("path,expected", list(SAEED_EXPECTED.items()))
def test_saeed_regression(saeed_h, path, expected):
    r = g(saeed_h, path)
    assert r.status_code == expected, f"{path}: {r.status_code} {r.text[:200]}"
    assert "حدد القسم أو الكلية" not in r.text


def test_saeed_statements_foreign_faculty_blocked(saeed_h):
    assert g(saeed_h, "/statements", faculty_id=A["faculty"]).status_code == 403


def test_saeed_council_and_alumni_scope(saeed_h):
    r = g(saeed_h, "/alumni")
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    for s in items:
        assert s.get("department_id") == DEPT_B
    rc = g(saeed_h, "/faculty-board/candidates")
    print("Saeed candidates:", rc.status_code)
    assert rc.status_code in (200, 403)
