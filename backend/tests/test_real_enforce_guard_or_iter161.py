# Iter161: real_enforce_guard OR-logic (department_id first, then faculty_id) + no-escalation checks
# + regression for admin / Saeed / Salim on weekly-schedule, students, teachers, faculty-board, alumni
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

KEYS = ["schedule_weekly_schedule_get_weekly_schedule", "teachers_ser_get_teachers",
        "councils_faculty_board_list_candidates", "councils_faculty_board_list_decisions",
        "alumni_alumni_list_alumni", "teaching_load_teaching_load_advanced_teaching_load_report",
        "students_ser_get_students", "academic_structure_ser_get_departments"]

CREATED = {"users": [], "assignments": []}


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    assert r.status_code == 200, f"login {u} failed: {r.status_code} {r.text[:200]}"
    d = r.json()
    return d, {"Authorization": f"Bearer {d.get('token') or d.get('access_token')}"}


@pytest.fixture(scope="module")
def admin_h():
    return _login("admin", "admin123")[1]


@pytest.fixture(scope="module")
def ids(admin_h):
    depts = requests.get(f"{API}/departments", headers=admin_h, timeout=30).json()
    by_fac = {}
    for d in depts:
        if d.get("faculty_id"):
            by_fac.setdefault(d["faculty_id"], []).append(d["id"])
    facs = sorted(by_fac, key=lambda f: -len(by_fac[f]))
    fac_a, fac_b = facs[0], facs[1]
    out = {"fac_a": fac_a, "fac_b": fac_b, "dept_a": by_fac[fac_a][0], "dept_a2": by_fac[fac_a][1],
           "dept_b": by_fac[fac_b][0]}
    print("IDS:", out)
    return out


def _make_user(admin_h, username, scope):
    u = requests.post(f"{API}/advanced-access/users/quick-find-or-create", headers=admin_h,
                      json={"username": username, "full_name": f"TEST_ {username}"}, timeout=30)
    assert u.status_code == 200, u.text
    uid = u.json()["id"]
    CREATED["users"].append(uid)
    r = requests.post(f"{API}/advanced-access/roles", headers=admin_h,
                      json={"name_ar": f"TEST_role_{username}", "permission_keys": KEYS}, timeout=60)
    assert r.status_code == 200, r.text[:300]
    a = requests.post(f"{API}/advanced-access/assignments", headers=admin_h, json={
        "user_id": uid, "assignment_type": "academic", "advanced_role_id": r.json()["id"],
        "context_label_ar": f"TEST_ {username}", "scope": scope}, timeout=30)
    assert a.status_code == 200, a.text[:300]
    CREATED["assignments"].append(a.json()["id"])
    return _login(username, username)[1]


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_h):
    yield
    for aid in CREATED["assignments"]:
        r = requests.post(f"{API}/advanced-access/assignments/{aid}/end", headers=admin_h, json={}, timeout=30)
        print("end assignment", aid, r.status_code)
    for uid in CREATED["users"]:
        r = requests.delete(f"{API}/users/{uid}", headers=admin_h, timeout=30)
        print("delete user", uid, r.status_code)


@pytest.fixture(scope="module")
def dept_h(admin_h, ids):
    return _make_user(admin_h, "TEST_deptonly161", {"scope_type": "department", "scope_ref_ids": [ids["dept_a"]]})


@pytest.fixture(scope="module")
def fac_h(admin_h, ids):
    return _make_user(admin_h, "TEST_faconly161", {"scope_type": "faculty", "scope_ref_ids": [ids["fac_a"]]})


def _get(h, path, params):
    return requests.get(f"{API}{path}", headers=h, params=params, timeout=90)


# ---------- Department-only scoped user: weekly-schedule (a)(b)(c) ----------
class TestDeptOnlyWeekly:
    def test_a_own_dept_plus_parent_fac_200(self, dept_h, ids):
        r = _get(dept_h, "/weekly-schedule", {"department_id": ids["dept_a"], "faculty_id": ids["fac_a"]})
        assert r.status_code == 200, r.text[:200]

    def test_a2_own_dept_only_200(self, dept_h, ids):
        assert _get(dept_h, "/weekly-schedule", {"department_id": ids["dept_a"]}).status_code == 200

    def test_b_fac_only_403(self, dept_h, ids):
        r = _get(dept_h, "/weekly-schedule", {"faculty_id": ids["fac_a"]})
        assert r.status_code == 403, r.text[:200]

    def test_c_foreign_dept_own_fac_403(self, dept_h, ids):
        r = _get(dept_h, "/weekly-schedule", {"department_id": ids["dept_a2"], "faculty_id": ids["fac_a"]})
        assert r.status_code == 403, r.text[:200]

    def test_c2_foreign_dept_other_fac_403(self, dept_h, ids):
        r = _get(dept_h, "/weekly-schedule", {"department_id": ids["dept_b"], "faculty_id": ids["fac_b"]})
        assert r.status_code == 403

    def test_no_params_400(self, dept_h):
        assert _get(dept_h, "/weekly-schedule", {}).status_code == 400


# ---------- Department-only user on other guarded endpoints (no widening to whole faculty) ----------
class TestDeptOnlyOtherEndpoints:
    @pytest.mark.parametrize("path", ["/faculty-board/candidates", "/faculty-board/decisions", "/alumni"])
    def test_own_dept_plus_fac_200(self, dept_h, ids, path):
        r = _get(dept_h, path, {"department_id": ids["dept_a"], "faculty_id": ids["fac_a"]})
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"

    @pytest.mark.parametrize("path", ["/faculty-board/candidates", "/faculty-board/decisions", "/alumni"])
    def test_fac_only_403(self, dept_h, ids, path):
        assert _get(dept_h, path, {"faculty_id": ids["fac_a"]}).status_code == 403

    def test_teachers_own_dept_plus_fac_not_widened(self, admin_h, dept_h, ids):
        """Dept-only user sending own dept + parent faculty must NOT receive teachers of sibling departments."""
        r = _get(dept_h, "/teachers", {"department_id": ids["dept_a"], "faculty_id": ids["fac_a"]})
        print("teachers status", r.status_code)
        if r.status_code != 200:
            return
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        own = _get(admin_h, "/teachers", {"department_id": ids["dept_a"]}).json()
        own = own if isinstance(own, list) else own.get("items", [])
        own_ids = {t["id"] for t in own}
        leaked = [t for t in items if t["id"] not in own_ids and t.get("department_id") != ids["dept_a"]]
        print(f"dept-user got {len(items)} teachers, admin own-dept {len(own)}, leaked {len(leaked)}")
        assert not leaked, f"LEAK: {len(leaked)} teachers outside dept: {[t.get('department_id') for t in leaked][:5]}"

    def test_teaching_load_report_own_dept_plus_fac(self, dept_h, ids):
        r = _get(dept_h, "/teaching-load/report/advanced", {"department_id": ids["dept_a"], "faculty_id": ids["fac_a"]})
        print("teaching load report", r.status_code, r.text[:120])


# ---------- Faculty-scoped user: cannot reach a department in ANOTHER faculty via own faculty_id ----------
class TestFacultyScopeNoBypass:
    def test_weekly_own_fac_200(self, fac_h, ids):
        assert _get(fac_h, "/weekly-schedule", {"faculty_id": ids["fac_a"]}).status_code == 200

    def test_weekly_child_dept_200(self, fac_h, ids):
        assert _get(fac_h, "/weekly-schedule", {"department_id": ids["dept_a"], "faculty_id": ids["fac_a"]}).status_code == 200

    def test_weekly_other_fac_403(self, fac_h, ids):
        assert _get(fac_h, "/weekly-schedule", {"faculty_id": ids["fac_b"]}).status_code == 403

    @pytest.mark.parametrize("path", ["/faculty-board/candidates", "/faculty-board/decisions"])
    def test_foreign_dept_with_own_fac(self, admin_h, fac_h, ids, path):
        """faculty A user + department_id from faculty B + own faculty_id A: must be 403 or return no foreign-dept data."""
        r = _get(fac_h, path, {"department_id": ids["dept_b"], "faculty_id": ids["fac_a"]})
        print(path, "status", r.status_code)
        if r.status_code == 403:
            return
        items = r.json().get("items", [])
        foreign = [i for i in items if i.get("department_id") == ids["dept_b"]]
        print(f"{path}: items={len(items)} foreign={len(foreign)}")
        assert not foreign, f"LEAK: {len(foreign)} items from foreign dept"
        # even if no data now, guard should reject mismatched dept
        assert r.status_code == 403, f"{path} accepted foreign department_id ({r.status_code}) — query filters by department_id only"


# ---------- Regression: admin / legacy users ----------
class TestRegression:
    @pytest.mark.parametrize("user,pw", [("admin", "admin123"), ("Saeed", "test1234"), ("Salim", "test1234")])
    @pytest.mark.parametrize("path", ["/weekly-schedule", "/students", "/teachers", "/faculty-board/candidates",
                                      "/faculty-board/decisions", "/alumni"])
    def test_legacy_endpoints(self, user, pw, path):
        d, h = _login(user, pw)
        assert not (d.get("user") or {}).get("advanced_access_real_enforcement"), f"{user} has real_enforcement!"
        r = _get(h, path, {})
        assert r.status_code == 200, f"{user} {path}: {r.status_code} {r.text[:200]}"
