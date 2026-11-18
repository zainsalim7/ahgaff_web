# Notifications: role scope (university/faculty/department) + faculty/department audience + preview/send (iter197)
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

FAC = "698e4f9297fef774e66e93a4"
DEPT = "698e500997fef774e66e93a8"
MARK = "TEST_IT197_"


def _mongo():
    env = {}
    with open('/app/backend/.env') as f:
        for line in f:
            if '=' in line:
                k, v = line.strip().split('=', 1)
                env[k] = v.strip('"')
    return MongoClient(env['MONGO_URL'])[env['DB_NAME']]


def _login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        return None
    d = r.json()
    return d.get("access_token") or d.get("token")


@pytest.fixture(scope="module")
def admin():
    t = _login("admin", "admin123")
    if not t:
        pytest.skip("admin login failed")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {t}"})
    return s


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    db = _mongo()
    db.notifications.delete_many({"title": {"$regex": f"^{MARK}"}})
    db.notification_history.delete_many({"title": {"$regex": f"^{MARK}"}})


def prev(s, body):
    r = s.post(f"{BASE_URL}/api/notifications/preview", json={"title": "-", "body": "-", **body})
    assert r.status_code == 200, r.text
    return r.json()


class TestPreview:
    def test_role_teacher_university(self, admin):
        d = prev(admin, {"target_type": "role", "target_role": "teacher"})
        print(d)
        assert d["users"] == 12
        assert "كل الجامعة" in d["target_desc"]

    def test_role_teacher_faculty(self, admin):
        d = prev(admin, {"target_type": "role", "target_role": "teacher", "faculty_id": FAC})
        print(d)
        assert d["users"] == 10

    def test_role_student_faculty(self, admin):
        d = prev(admin, {"target_type": "role", "target_role": "student", "faculty_id": FAC})
        print(d)
        assert d["users"] == 20

    def test_role_student_department(self, admin):
        d = prev(admin, {"target_type": "role", "target_role": "student", "faculty_id": FAC, "department_id": DEPT})
        print(d)
        assert d["users"] == 20

    def test_role_teacher_department(self, admin):
        d = prev(admin, {"target_type": "role", "target_role": "teacher", "faculty_id": FAC, "department_id": DEPT})
        print(d)
        assert d["users"] >= 0

    def test_role_employee_dean_dh_faculty(self, admin):
        for role in ("employee", "dean", "department_head"):
            d = prev(admin, {"target_type": "role", "target_role": role, "faculty_id": FAC})
            print(role, d)
            assert isinstance(d["users"], int)

    def test_faculty_audiences(self, admin):
        t = prev(admin, {"target_type": "faculty", "faculty_id": FAC, "audience": "teachers"})
        s = prev(admin, {"target_type": "faculty", "faculty_id": FAC, "audience": "students"})
        a = prev(admin, {"target_type": "faculty", "faculty_id": FAC, "audience": "all"})
        print(t, s, a)
        assert t["users"] == 10 and s["users"] == 20 and a["users"] == 30

    def test_faculty_no_audience_default(self, admin):
        d = prev(admin, {"target_type": "faculty", "faculty_id": FAC})
        print("default audience:", d)

    def test_department_audiences(self, admin):
        s = prev(admin, {"target_type": "department", "department_id": DEPT, "audience": "students"})
        t = prev(admin, {"target_type": "department", "department_id": DEPT, "audience": "teachers"})
        a = prev(admin, {"target_type": "department", "department_id": DEPT, "audience": "all"})
        print(s, t, a)
        assert s["users"] == 20
        assert a["users"] == s["users"] + t["users"]

    def test_old_types(self, admin):
        d = prev(admin, {"target_type": "all"})
        assert d["users"] > 0 and d["target_desc"] == "الكل"
        d = prev(admin, {"target_type": "level", "level": 1})
        print("level", d)
        d = prev(admin, {"target_type": "section", "level": 1, "section": "أ"})
        print("section", d)

    def test_invalid_faculty_id(self, admin):
        r = admin.post(f"{BASE_URL}/api/notifications/preview",
                       json={"title": "-", "body": "-", "target_type": "role", "target_role": "student", "faculty_id": "bad"})
        print("invalid faculty:", r.status_code, r.text[:200])
        assert r.status_code < 500


class TestSend:
    def test_send_faculty_teachers_creates_notifications(self, admin):
        title = MARK + "fac_teachers"
        body = {"title": title, "body": "x", "target_type": "faculty", "faculty_id": FAC, "audience": "teachers"}
        p = prev(admin, body)
        r = admin.post(f"{BASE_URL}/api/notifications/send", json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        print(d)
        assert d["users"] == p["users"] == 10
        db = _mongo()
        assert db.notifications.count_documents({"title": title}) == 10
        h = db.notification_history.find_one({"title": title})
        assert h and h["target_desc"] == p["target_desc"] and h["users_count"] == 10

    def test_send_role_student_department(self, admin):
        title = MARK + "role_stu_dept"
        body = {"title": title, "body": "x", "target_type": "role", "target_role": "student", "faculty_id": FAC, "department_id": DEPT}
        r = admin.post(f"{BASE_URL}/api/notifications/send", json=body)
        assert r.status_code == 200
        assert r.json()["users"] == 20
        db = _mongo()
        uids = set(n["user_id"] for n in db.notifications.find({"title": title}))
        stu = set(s["user_id"] for s in db.students.find({"department_id": DEPT, "is_active": True}) if s.get("user_id"))
        assert uids == stu


class TestPermission:
    def test_403_without_permission(self):
        tok = _login("teacher180156", "teacher123")
        if not tok:
            pytest.skip("teacher login failed")
        h = {"Authorization": f"Bearer {tok}"}
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=h).json()
        if "send_notifications" in (me.get("permissions") or []):
            pytest.skip("teacher has perm")
        b = {"title": MARK + "deny", "body": "x", "target_type": "all"}
        assert requests.post(f"{BASE_URL}/api/notifications/preview", json=b, headers=h).status_code == 403
        assert requests.post(f"{BASE_URL}/api/notifications/send", json=b, headers=h).status_code == 403
