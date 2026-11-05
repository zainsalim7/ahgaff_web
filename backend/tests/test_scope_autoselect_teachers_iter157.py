# Iter157: GET /teachers real-enforcement key fix + legacy users regression (Saeed self-heal pilot fix)
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ROLE_ID = "6ae98be3fbf74b036f42a7a7"
ORIG_KEYS = ["students_ser_create_student", "students_ser_delete_student", "grades_grades_download_grades_template"]
IN_DEPT = "698e500997fef774e66e93a8"
OUT_DEPT = "698e501d97fef774e66e93a9"
DENY = "غير مصرح لك بهذا الإجراء"


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    assert r.status_code == 200, f"login {u} failed: {r.status_code} {r.text[:200]}"
    d = r.json()
    return d, {"Authorization": f"Bearer {d.get('token') or d.get('access_token')}"}


def _items(r):
    j = r.json()
    if isinstance(j, list):
        return j
    for k in ("items", "teachers", "students", "data", "employees", "results"):
        if isinstance(j.get(k), list):
            return j[k]
    return []


@pytest.fixture(scope="module")
def admin_h():
    return _login("admin", "admin123")[1]


# ---------- Legacy regression ----------
class TestLegacyRegression:
    def test_saeed_login_flags(self):
        d, h = _login("Saeed", "test1234")
        u = d["user"]
        print("Saeed perms:", len(u.get("permissions") or []), "RE:", u.get("advanced_access_real_enforcement"))
        assert u["role"] == "department_head"
        assert not u.get("advanced_access_real_enforcement")
        me = requests.get(f"{API}/auth/me", headers=h, timeout=30).json()
        assert not me.get("advanced_access_real_enforcement")
        print("Saeed /me perms:", len(me.get("permissions") or []))

    @pytest.mark.parametrize("path", ["/teachers", "/students", "/departments", "/courses"])
    def test_saeed_reads(self, path):
        _, h = _login("Saeed", "test1234")
        r = requests.get(f"{API}{path}", headers=h, timeout=60)
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"
        assert DENY not in r.text[:500]
        print(path, "count", len(_items(r)))

    def test_saeed_hr_employees_403_expected(self):
        _, h = _login("Saeed", "test1234")
        r = requests.get(f"{API}/hr/employees", headers=h, timeout=60)
        print("Saeed hr/employees:", r.status_code, r.text[:150])

    @pytest.mark.parametrize("path", ["/teachers", "/students", "/courses", "/departments", "/hr/employees"])
    def test_salim_reads(self, path):
        _, h = _login("Salim", "test1234")
        r = requests.get(f"{API}{path}", headers=h, timeout=60)
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"
        print("Salim", path, len(_items(r)))

    @pytest.mark.parametrize("path", ["/teachers", "/students", "/courses", "/hr/employees"])
    def test_admin_reads(self, admin_h, path):
        r = requests.get(f"{API}{path}", headers=admin_h, timeout=60)
        assert r.status_code == 200, f"{path}: {r.status_code}"
        print("admin", path, len(_items(r)))

    def test_teacher_login_and_me(self):
        d, h = _login("teacher180156", "teacher123")
        assert d["user"]["role"] == "teacher"
        assert not d["user"].get("advanced_access_real_enforcement")
        assert requests.get(f"{API}/auth/me", headers=h, timeout=30).status_code == 200

    def test_student_login_and_me(self):
        d, h = _login("1001", "test1234")
        assert d["user"]["role"] == "student"
        assert not d["user"].get("advanced_access_real_enforcement")
        assert requests.get(f"{API}/auth/me", headers=h, timeout=30).status_code == 200


# ---------- Real-enforcement /teachers ----------
class TestRealEnforcementTeachers:
    def test_login_exposes_scope(self):
        d, h = _login("layer2_test_emp", "test1234")
        u = d["user"]
        assert u.get("advanced_access_real_enforcement") is True
        assert IN_DEPT in (u.get("department_ids") or [])
        me = requests.get(f"{API}/auth/me", headers=h, timeout=30).json()
        assert IN_DEPT in (me.get("department_ids") or [])

    def test_without_permission_403(self):
        _, h = _login("layer2_test_emp", "test1234")
        r = requests.get(f"{API}/teachers", params={"department_id": IN_DEPT}, headers=h, timeout=30)
        assert r.status_code == 403, r.text[:200]

    def test_with_permission_grant_then_restore(self, admin_h):
        r = requests.put(f"{API}/advanced-access/roles/{ROLE_ID}", headers=admin_h,
                         json={"permission_keys": ORIG_KEYS + ["teachers_ser_get_teachers"]}, timeout=30)
        assert r.status_code == 200, r.text[:200]
        try:
            _, h = _login("layer2_test_emp", "test1234")
            r0 = requests.get(f"{API}/teachers", headers=h, timeout=30)
            print("no params:", r0.status_code, r0.text[:150])
            assert r0.status_code == 400
            r1 = requests.get(f"{API}/teachers", params={"department_id": IN_DEPT}, headers=h, timeout=30)
            assert r1.status_code == 200, r1.text[:200]
            items = _items(r1)
            print("in-dept teachers:", len(items))
            assert len(items) > 0
            assert all(t.get("department_id") == IN_DEPT for t in items), \
                [t.get("department_id") for t in items if t.get("department_id") != IN_DEPT]
            r2 = requests.get(f"{API}/teachers", params={"department_id": OUT_DEPT}, headers=h, timeout=30)
            print("out-dept:", r2.status_code, r2.text[:150])
            assert r2.status_code == 403
        finally:
            rr = requests.put(f"{API}/advanced-access/roles/{ROLE_ID}", headers=admin_h,
                              json={"permission_keys": ORIG_KEYS}, timeout=30)
            assert rr.status_code == 200

    def test_role_restored(self, admin_h):
        r = requests.get(f"{API}/advanced-access/roles/{ROLE_ID}", headers=admin_h, timeout=30)
        if r.status_code == 200:
            j = r.json()
            role = j.get("role", j)
            assert sorted(role.get("permission_keys", [])) == sorted(ORIG_KEYS)
