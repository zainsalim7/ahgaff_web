# Iter163: management dashboard section gating via has_permission (no blanket grant for real-enforcement),
# 403 when zero sections, auth faculty_name/faculty_names fallback from faculty_ids, /lectures/all-schedule 403,
# + regression for admin / Saeed / Salim
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
FAC_A = "698e4f9297fef774e66e93a4"
DEPT_A = "698e500997fef774e66e93a8"
NO_DASH_MSG = "ليس لديك صلاحية عرض أي قسم في لوحة القيادة"
CREATED = {"users": [], "assignments": []}


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    assert r.status_code == 200, f"login {u}: {r.status_code} {r.text[:200]}"
    d = r.json()
    return d, {"Authorization": f"Bearer {d.get('token') or d.get('access_token')}"}


@pytest.fixture(scope="module")
def admin_h():
    return _login("admin", "admin123")[1]


def _make_user(admin_h, username, keys, scope):
    u = requests.post(f"{API}/advanced-access/users/quick-find-or-create", headers=admin_h,
                      json={"username": username, "full_name": f"TEST_ {username}"}, timeout=30)
    assert u.status_code == 200, u.text
    uid = u.json()["id"]
    CREATED["users"].append(uid)
    r = requests.post(f"{API}/advanced-access/roles", headers=admin_h,
                      json={"name_ar": f"TEST_role_{username}", "permission_keys": keys}, timeout=60)
    assert r.status_code == 200, r.text[:300]
    a = requests.post(f"{API}/advanced-access/assignments", headers=admin_h, json={
        "user_id": uid, "assignment_type": "academic", "advanced_role_id": r.json()["id"],
        "context_label_ar": f"TEST_ {username}", "scope": scope}, timeout=30)
    assert a.status_code == 200, a.text[:300]
    CREATED["assignments"].append(a.json()["id"])
    d, h = _login(username, username)
    assert (d.get("user") or {}).get("advanced_access_real_enforcement"), "not real-enforced"
    return d, h


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_h):
    yield
    for aid in CREATED["assignments"]:
        print("end", aid, requests.post(f"{API}/advanced-access/assignments/{aid}/end", headers=admin_h, json={}, timeout=30).status_code)
    for uid in CREATED["users"]:
        print("del", uid, requests.delete(f"{API}/users/{uid}", headers=admin_h, timeout=30).status_code)


@pytest.fixture(scope="module")
def hr_only(admin_h):
    return _make_user(admin_h, "TEST_hronly163", ["hr_core_hr_my_scope"], {"scope_type": "faculty", "scope_ref_ids": [FAC_A]})


@pytest.fixture(scope="module")
def dash_user(admin_h):
    return _make_user(admin_h, "TEST_dash163", ["dashboard_management_dashboard_management_dashboard_hr",
                                                "dashboard_management_dashboard_management_dashboard"],
                      {"scope_type": "department", "scope_ref_ids": [DEPT_A]})


def _dash(h):
    return requests.get(f"{API}/dashboard/management", headers=h, params={"period": "week"}, timeout=120)


class TestDashboardGating:
    def test_hr_only_user_403(self, hr_only):
        r = _dash(hr_only[1])
        assert r.status_code == 403, r.text[:300]
        assert r.json().get("detail") == NO_DASH_MSG

    def test_dash_key_user_200(self, dash_user):
        r = _dash(dash_user[1])
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        print("sections", j.get("sections"), "scope", (j.get("scope") or {}).get("label"))
        assert j["sections"]["hr"] is True

    @pytest.mark.parametrize("u,p", [("admin", "admin123"), ("Saeed", "test1234"), ("Salim", "test1234")])
    def test_regression_legacy_200(self, u, p):
        r = _dash(_login(u, p)[1])
        assert r.status_code == 200, r.text[:300]
        assert "sections" in r.json()
        print(u, r.json()["sections"])


class TestAuthFacultyName:
    def test_login_faculty_name_from_ids(self, hr_only):
        u = hr_only[0]["user"]
        print({k: u.get(k) for k in ["faculty_id", "faculty_ids", "faculty_name", "faculty_names", "department_name"]})
        assert not u.get("faculty_id")
        assert (u.get("faculty_name") or "").strip() == "كلية الشريعة والقانون"
        assert [x.strip() for x in u.get("faculty_names")] == ["كلية الشريعة والقانون"]

    def test_me_faculty_name_from_ids(self, hr_only):
        m = requests.get(f"{API}/auth/me", headers=hr_only[1], timeout=30).json()
        assert (m.get("faculty_name") or "").strip() == "كلية الشريعة والقانون"
        assert [x.strip() for x in m.get("faculty_names")] == ["كلية الشريعة والقانون"]

    def test_admin_no_faculty_name(self, admin_h):
        m = requests.get(f"{API}/auth/me", headers=admin_h, timeout=30).json()
        print("admin", m.get("faculty_name"), m.get("department_name"), m.get("faculty_names"))
        assert not m.get("faculty_name") and not m.get("department_name")

    def test_dept_user_department_name(self, dash_user):
        m = requests.get(f"{API}/auth/me", headers=dash_user[1], timeout=30).json()
        print("dept user", m.get("department_name"), m.get("faculty_name"), m.get("faculty_names"))
        assert m.get("department_name")


class TestScheduleForbidden:
    def test_hr_only_all_schedule_403(self, hr_only):
        r = requests.get(f"{API}/lectures/all-schedule", headers=hr_only[1], timeout=60)
        print(r.status_code, r.text[:200])
        assert r.status_code == 403

    @pytest.mark.parametrize("u,p", [("admin", "admin123"), ("Saeed", "test1234"), ("Salim", "test1234")])
    def test_regression_all_schedule_200(self, u, p):
        r = requests.get(f"{API}/lectures/all-schedule", headers=_login(u, p)[1], timeout=90)
        assert r.status_code == 200, r.text[:200]
        assert "lectures" in r.json()
