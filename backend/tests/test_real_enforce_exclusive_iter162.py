# Iter162: real_enforce_guard EXCLUSIVE priority (dept_id alone if sent, else faculty_id alone),
# GET /teachers widening only w/ independent faculty scope, faculty-board candidates course_id exclusive check,
# + regression for admin / Saeed / Salim
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

FAC_A = "698e4f9297fef774e66e93a4"
DEPT_A = "698e500997fef774e66e93a8"
DEPT_A2 = "698f671331cfba92c49a550c"
FAC_B = "698e4fb497fef774e66e93a6"
DEPT_B = "698e501d97fef774e66e93a9"

KEYS = ["schedule_weekly_schedule_get_weekly_schedule", "teachers_ser_get_teachers",
        "councils_faculty_board_list_candidates", "councils_faculty_board_list_decisions",
        "alumni_alumni_list_alumni", "teaching_load_teaching_load_advanced_teaching_load_report",
        "students_ser_get_students", "academic_structure_ser_get_departments",
        "academic_structure_ser_get_faculties", "schedule_weekly_schedule_get_schedule_settings"]

CREATED = {"users": [], "assignments": []}


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    assert r.status_code == 200, f"login {u} failed: {r.status_code} {r.text[:200]}"
    d = r.json()
    return d, {"Authorization": f"Bearer {d.get('token') or d.get('access_token')}"}


def _items(r):
    j = r.json()
    if isinstance(j, list):
        return j
    return j.get("items") or j.get("teachers") or j.get("data") or []


def _get(h, path, params):
    return requests.get(f"{API}{path}", headers=h, params=params, timeout=90)


@pytest.fixture(scope="module")
def admin_h():
    return _login("admin", "admin123")[1]


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
    d, h = _login(username, username)
    assert (d.get("user") or {}).get("advanced_access_real_enforcement"), "test user not real-enforced"
    return h


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
def dept_h(admin_h):
    return _make_user(admin_h, "TEST_dept162", {"scope_type": "department", "scope_ref_ids": [DEPT_A]})


@pytest.fixture(scope="module")
def fac_h(admin_h):
    return _make_user(admin_h, "TEST_fac162", {"scope_type": "faculty", "scope_ref_ids": [FAC_A]})


@pytest.fixture(scope="module")
def courses(admin_h):
    r = _get(admin_h, "/courses", {})
    cs = _items(r)
    own = next((c for c in cs if c.get("department_id") == DEPT_A), None)
    foreign = next((c for c in cs if c.get("department_id") == DEPT_B), None)
    print("own course", own and own.get("id"), "foreign course", foreign and foreign.get("id"))
    return {"own": own, "foreign": foreign}


# ---------- FIX 1: faculty-scoped user, foreign dept + own faculty -> 403 ----------
class TestFix1ExclusiveGuard:
    @pytest.mark.parametrize("path", ["/teaching-load/report/advanced", "/teachers", "/weekly-schedule",
                                      "/faculty-board/candidates", "/faculty-board/decisions"])
    def test_foreign_dept_plus_own_fac_403(self, fac_h, path):
        r = _get(fac_h, path, {"department_id": DEPT_B, "faculty_id": FAC_A})
        assert r.status_code == 403, f"{path}: {r.status_code} {r.text[:200]}"

    @pytest.mark.parametrize("path", ["/teaching-load/report/advanced", "/teachers"])
    def test_own_child_dept_plus_own_fac_200(self, fac_h, path):
        r = _get(fac_h, path, {"department_id": DEPT_A, "faculty_id": FAC_A})
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"

    def test_teachers_fac_only_widened(self, admin_h, fac_h):
        r = _get(fac_h, "/teachers", {"faculty_id": FAC_A})
        assert r.status_code == 200, r.text[:200]
        items = _items(r)
        depts = {t.get("department_id") for t in items}
        print(f"faculty user teachers={len(items)} depts={depts}")
        # NOTE: teachers from other depts may appear by design (cross-dept teaching_loads exception in GET /teachers)
        assert len(depts & {DEPT_A, DEPT_A2}) >= 1

    def test_teaching_load_fac_only_200(self, fac_h):
        assert _get(fac_h, "/teaching-load/report/advanced", {"faculty_id": FAC_A}).status_code == 200

    def test_other_fac_403(self, fac_h):
        assert _get(fac_h, "/teachers", {"faculty_id": FAC_B}).status_code == 403


# ---------- FIX 2: dept-only user + own dept + extra faculty_id -> no widening ----------
class TestFix2TeachersNoWiden:
    def test_own_dept_plus_parent_fac_not_widened(self, admin_h, dept_h):
        r = _get(dept_h, "/teachers", {"department_id": DEPT_A, "faculty_id": FAC_A})
        assert r.status_code == 200, r.text[:200]
        items = _items(r)
        base = _items(_get(admin_h, "/teachers", {"department_id": DEPT_A}))
        leaked = [t for t in items if t.get("department_id") != DEPT_A]
        print(f"dept user got {len(items)}; admin own-dept {len(base)}; leaked {len(leaked)}")
        assert not leaked
        assert len(items) == len(base)

    def test_own_dept_plus_foreign_fac_not_widened(self, dept_h):
        r = _get(dept_h, "/teachers", {"department_id": DEPT_A, "faculty_id": FAC_B})
        assert r.status_code == 200, r.text[:200]
        assert all(t.get("department_id") == DEPT_A for t in _items(r))

    def test_fac_only_403(self, dept_h):
        assert _get(dept_h, "/teachers", {"faculty_id": FAC_A}).status_code == 403

    def test_own_dept_only_200(self, dept_h):
        r = _get(dept_h, "/teachers", {"department_id": DEPT_A})
        assert r.status_code == 200
        assert all(t.get("department_id") == DEPT_A for t in _items(r))

    def test_teaching_load_own_dept_200(self, dept_h):
        r = _get(dept_h, "/teaching-load/report/advanced", {"department_id": DEPT_A})
        assert r.status_code == 200, r.text[:200]


# ---------- FIX 3: faculty-board candidates course_id exclusive ownership ----------
class TestFix3CandidatesCourse:
    def test_foreign_course_with_own_dept_and_course_fac_403(self, dept_h, courses):
        if not courses["foreign"]:
            pytest.skip("no course in DEPT_B")
        r = _get(dept_h, "/faculty-board/candidates",
                 {"course_id": courses["foreign"]["id"], "department_id": DEPT_A, "faculty_id": FAC_B})
        assert r.status_code == 403, f"{r.status_code} {r.text[:200]}"

    def test_own_course_own_dept_200(self, dept_h, courses):
        if not courses["own"]:
            pytest.skip("no course in DEPT_A")
        r = _get(dept_h, "/faculty-board/candidates", {"course_id": courses["own"]["id"], "department_id": DEPT_A})
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"

    def test_fac_user_foreign_course_own_fac_403(self, fac_h, courses):
        if not courses["foreign"]:
            pytest.skip("no course in DEPT_B")
        r = _get(fac_h, "/faculty-board/candidates", {"course_id": courses["foreign"]["id"], "faculty_id": FAC_A})
        assert r.status_code == 403, f"{r.status_code} {r.text[:200]}"


# ---------- Regression: admin / legacy users ----------
class TestRegression:
    @pytest.mark.parametrize("user,pw", [("admin", "admin123"), ("Saeed", "test1234"), ("Salim", "test1234")])
    @pytest.mark.parametrize("path", ["/weekly-schedule", "/teachers", "/faculty-board/candidates",
                                      "/teaching-load/report/advanced", "/students", "/courses"])
    def test_legacy_endpoints(self, user, pw, path):
        d, h = _login(user, pw)
        assert not (d.get("user") or {}).get("advanced_access_real_enforcement"), f"{user} has real_enforcement!"
        r = _get(h, path, {})
        assert r.status_code == 200, f"{user} {path}: {r.status_code} {r.text[:200]}"
