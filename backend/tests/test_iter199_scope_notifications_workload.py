# Iter199: academic-scope restriction — /me/academic-scope, notifications scope enforcement, search scoping, workload select_teachers
import os
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
A4 = "698e4f9297fef774e66e93a4"   # Salim's faculty
A6 = "698e4fb497fef774e66e93a6"   # other faculty
DEP_IN = "698e500997fef774e66e93a8"
DEP_OUT = "698e501d97fef774e66e93a9"
STU_IN_UID = "69a99544650b31fa86440da1"
STU_OUT_UID = "69a99545650b31fa86440da5"
TCH_IN_UID = "698f867e9245118463b679ca"          # زين سالم (org in a4)
TCH_VISITOR_UID = "698f85b8539792f8917b7be0"     # حسن صالح (org a6, teaches in a4)
TCH_VISITOR_ID = "698e533beb4c6eb021c50302"
TCH_OUT_UID = "698bc0603a8982391e9ba189"         # Saeed (a6)
COURSE_IN = "698f671431cfba92c49a550d"
COURSE_OUT = "698f0000d803b27aab0120af"
DENY = "نطاق صلاحيتك محدود"


def _login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        pytest.skip(f"login {u} failed {r.status_code}")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("admin", "admin123")


@pytest.fixture(scope="module")
def salim():
    return _login("Salim", "test1234")


def _msg(**kw):
    d = {"title": "TEST_scope", "body": "TEST_scope body"}
    d.update(kw)
    return d


# ---- academic scope ----
class TestAcademicScope:
    def test_admin_unrestricted(self, admin):
        r = admin.get(f"{BASE_URL}/api/me/academic-scope")
        assert r.status_code == 200 and r.json()["restricted"] is False

    def test_salim_restricted(self, salim):
        d = salim.get(f"{BASE_URL}/api/me/academic-scope").json()
        assert d["restricted"] is True
        assert d["faculty_ids"] == [A4]
        assert d["full_faculty_ids"] == [A4]
        assert DEP_IN in d["department_ids"] and DEP_OUT not in d["department_ids"]


# ---- notifications preview deny/allow ----
DENY_CASES = [
    dict(target_type="all"),
    dict(target_type="role", target_role="student"),
    dict(target_type="role", target_role="teacher"),
    dict(target_type="role", target_role="student", faculty_id=A6),
    dict(target_type="role", target_role="student", department_id=DEP_OUT),
    dict(target_type="faculty", faculty_id=A6, audience="all"),
    dict(target_type="department", department_id=DEP_OUT, audience="all"),
    dict(target_type="level", faculty_id=A6, level=1, audience="all"),
    dict(target_type="level", level=1, audience="all"),
    dict(target_type="section", department_id=DEP_OUT, level=1, section="أ"),
    dict(target_type="student", student_user_id=STU_OUT_UID),
    dict(target_type="teacher", teacher_user_id=TCH_OUT_UID),
    dict(target_type="course", course_id=COURSE_OUT),
    dict(target_type="users", user_ids=[STU_OUT_UID]),
]


class TestNotifScope:
    @pytest.mark.parametrize("payload", DENY_CASES)
    def test_preview_denied(self, salim, payload):
        r = salim.post(f"{BASE_URL}/api/notifications/preview", json=_msg(**payload))
        assert r.status_code == 403, f"{payload} -> {r.status_code} {r.text[:200]}"
        assert DENY in r.json()["detail"]

    @pytest.mark.parametrize("payload", [DENY_CASES[0], DENY_CASES[3], DENY_CASES[10]])
    def test_send_denied(self, salim, payload):
        r = salim.post(f"{BASE_URL}/api/notifications/send", json=_msg(**payload))
        assert r.status_code == 403 and DENY in r.json()["detail"]

    def test_scheduled_denied(self, salim):
        when = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        r = salim.post(f"{BASE_URL}/api/notifications/send", json=_msg(target_type="all", scheduled_at=when))
        assert r.status_code == 403

    def test_preview_role_student_faculty(self, salim):
        r = salim.post(f"{BASE_URL}/api/notifications/preview", json=_msg(target_type="role", target_role="student", faculty_id=A4))
        assert r.status_code == 200 and r.json()["users"] == 20

    def test_preview_faculty_all(self, salim):
        r = salim.post(f"{BASE_URL}/api/notifications/preview", json=_msg(target_type="faculty", faculty_id=A4, audience="all"))
        assert r.status_code == 200 and r.json()["users"] == 30

    @pytest.mark.parametrize("payload", [
        dict(target_type="department", department_id=DEP_IN, audience="students"),
        dict(target_type="level", department_id=DEP_IN, level=1, audience="all"),
        dict(target_type="student", student_user_id=STU_IN_UID),
        dict(target_type="teacher", teacher_user_id=TCH_IN_UID),
        dict(target_type="teacher", teacher_user_id=TCH_VISITOR_UID),
        dict(target_type="course", course_id=COURSE_IN),
    ])
    def test_preview_allowed(self, salim, payload):
        r = salim.post(f"{BASE_URL}/api/notifications/preview", json=_msg(**payload))
        assert r.status_code == 200, f"{payload} -> {r.text[:200]}"

    def test_admin_all(self, admin):
        r = admin.post(f"{BASE_URL}/api/notifications/preview", json=_msg(target_type="all"))
        assert r.status_code == 200 and r.json()["users"] == 125

    def test_admin_role_univ(self, admin):
        r = admin.post(f"{BASE_URL}/api/notifications/preview", json=_msg(target_type="role", target_role="student"))
        assert r.status_code == 200 and r.json()["users"] > 20


# ---- search scoping ----
class TestSearchScope:
    def test_search_students(self, salim, admin):
        a = admin.get(f"{BASE_URL}/api/notifications/search-students", params={"q": "محمد"}).json()
        s = salim.get(f"{BASE_URL}/api/notifications/search-students", params={"q": "محمد"}).json()
        assert len(s) <= len(a)
        assert all(x["user_id"] != STU_OUT_UID for x in s)
        s2 = salim.get(f"{BASE_URL}/api/notifications/search-students", params={"q": "12345"}).json()
        assert s2 == []

    def test_search_teachers(self, salim):
        s = salim.get(f"{BASE_URL}/api/notifications/search-teachers", params={"q": "Saeed"}).json()
        assert all(x["user_id"] != TCH_OUT_UID for x in s)
        v = salim.get(f"{BASE_URL}/api/notifications/search-teachers", params={"q": "حسن"}).json()
        assert any(x["user_id"] == TCH_VISITOR_UID for x in v)

    def test_courses(self, salim, admin):
        s = salim.get(f"{BASE_URL}/api/notifications/courses").json()
        a = admin.get(f"{BASE_URL}/api/notifications/courses").json()
        ids = {c["id"] for c in s}
        assert COURSE_IN in ids and COURSE_OUT not in ids
        assert len(a) > len(s)


# ---- workload select_teachers ----
class TestWorkload:
    def test_salim_faculty_includes_visitor(self, salim):
        r = salim.get(f"{BASE_URL}/api/reports/teacher-workload", params={"faculty_id": A4})
        assert r.status_code == 200, r.text[:200]
        txt = r.text
        assert TCH_VISITOR_ID in txt or "حسن صالح" in txt

    def test_salim_dept_includes_visitor(self, salim):
        r = salim.get(f"{BASE_URL}/api/reports/teacher-workload", params={"department_id": DEP_IN})
        assert r.status_code == 200
        assert "حسن صالح" in r.text

    def test_salim_other_faculty_excludes_outside(self, salim):
        r = salim.get(f"{BASE_URL}/api/reports/teacher-workload", params={"faculty_id": A6})
        # either 403 or no Saeed (out-of-scope teacher)
        assert r.status_code in (200, 403)
        if r.status_code == 200:
            assert "Saeed" not in r.text

    def test_admin_all(self, admin):
        r = admin.get(f"{BASE_URL}/api/reports/teacher-workload")
        assert r.status_code == 200
