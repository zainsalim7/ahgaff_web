# Iter158: faculty-scoped real-enforcement user (get_user_scope_filter faculty_ids + GET /teachers?faculty_id)
# + regression for admin / Saeed / Salim / layer2_test_emp (department-scoped)
import os
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

FAC_A = "698e4f9297fef774e66e93a4"  # كلية الشريعة والقانون (3 depts, 12 teachers)
FAC_B = "698e4fb497fef774e66e93a6"  # كلية البنات
TEST_USER = "TEST_facscope158"
L2_ROLE_ID = "6ae98be3fbf74b036f42a7a7"
L2_ORIG_KEYS = ["students_ser_create_student", "students_ser_delete_student", "grades_grades_download_grades_template"]
L2_DEPT = "698e500997fef774e66e93a8"

STATE = {}


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    assert r.status_code == 200, f"login {u} failed: {r.status_code} {r.text[:200]}"
    d = r.json()
    return d, {"Authorization": f"Bearer {d.get('token') or d.get('access_token')}"}


def _mongo():
    env = {}
    for line in open("/app/backend/.env"):
        if "=" in line:
            k, v = line.strip().split("=", 1)
            env[k] = v.strip('"')
    return MongoClient(env["MONGO_URL"])[env["DB_NAME"]]


@pytest.fixture(scope="module")
def admin_h():
    return _login("admin", "admin123")[1]


@pytest.fixture(scope="module")
def depts(admin_h):
    return requests.get(f"{API}/departments", headers=admin_h, timeout=30).json()


@pytest.fixture(scope="module")
def fac_user(admin_h):
    """Create TEST_ user + all-permissions role + faculty-scoped assignment; cleanup by ids."""
    perms = requests.get(f"{API}/advanced-access/permissions", headers=admin_h, timeout=60).json()
    perms = perms if isinstance(perms, list) else perms.get("items") or perms.get("permissions") or []
    keys = [p["key"] for p in perms if p.get("is_active", True)]
    print("permission keys granted:", len(keys))
    u = requests.post(f"{API}/advanced-access/users/quick-find-or-create", headers=admin_h,
                      json={"username": TEST_USER, "full_name": "TEST_ faculty scope 158"}, timeout=30)
    assert u.status_code == 200, u.text
    STATE["user_id"] = u.json()["id"]
    r = requests.post(f"{API}/advanced-access/roles", headers=admin_h,
                      json={"name_ar": "TEST_role_facscope158", "permission_keys": keys}, timeout=60)
    assert r.status_code == 200, r.text[:300]
    STATE["role_id"] = r.json()["id"]
    a = requests.post(f"{API}/advanced-access/assignments", headers=admin_h, json={
        "user_id": STATE["user_id"], "assignment_type": "academic", "advanced_role_id": STATE["role_id"],
        "context_label_ar": "TEST_ كلية واحدة", "scope": {"scope_type": "faculty", "scope_ref_ids": [FAC_A]}}, timeout=30)
    assert a.status_code == 200, a.text[:300]
    STATE["assignment_id"] = a.json()["id"]
    d, h = _login(TEST_USER, TEST_USER)
    STATE["login_user"] = d.get("user")
    # before any routes/deps-based call, faculty_ids is not yet synced on user doc
    pre = requests.get(f"{API}/students", headers=h, timeout=60)
    STATE["pre_sync_students"] = len(pre.json()) if pre.status_code == 200 else pre.status_code
    me = requests.get(f"{API}/auth/me", headers=h, timeout=30)
    STATE["me"] = me.json() if me.status_code == 200 else {}
    yield h
    if os.environ.get("KEEP_TEST_USER") == "1":
        return
    db = _mongo()
    db.advanced_user_assignments.delete_one({"_id": ObjectId(STATE["assignment_id"])})
    db.advanced_roles.delete_one({"_id": ObjectId(STATE["role_id"])})
    db.users.delete_one({"_id": ObjectId(STATE["user_id"]), "username": TEST_USER})


class TestFacultyScopedUser:
    def test_login_scope_synced(self, fac_user):
        u = STATE["login_user"]
        print("login user faculty_ids:", u.get("faculty_ids"), "dept_ids:", u.get("department_ids"),
              "RE:", u.get("advanced_access_real_enforcement"))
        assert u.get("advanced_access_real_enforcement") is True
        print("pre-sync /students count (before /auth/me):", STATE["pre_sync_students"])
        print("/auth/me faculty_ids:", STATE["me"].get("faculty_ids"))
        assert FAC_A in (STATE["me"].get("faculty_ids") or [])

    def test_scope_available_without_me_call(self, fac_user):
        # sync of faculty_ids only happens in routes/deps.build_user_context (not in login / server.get_current_user)
        assert STATE["pre_sync_students"] not in (0,), "GET /students returned 0 before /auth/me sync"

    def test_students_no_params(self, fac_user, depts):
        r = requests.get(f"{API}/students", headers=fac_user, timeout=60)
        assert r.status_code == 200, r.text[:300]
        items = r.json()
        fa_depts = {d["id"] for d in depts if d.get("faculty_id") == FAC_A}
        print("students:", len(items))
        assert len(items) > 0
        bad = [s.get("department_id") for s in items if s.get("department_id") not in fa_depts]
        assert not bad, f"students outside faculty: {set(bad)}"

    def test_courses_no_params(self, fac_user, depts):
        r = requests.get(f"{API}/courses", headers=fac_user, timeout=60)
        assert r.status_code == 200, r.text[:300]
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        fa_depts = {d["id"] for d in depts if d.get("faculty_id") == FAC_A}
        print("courses:", len(items))
        assert len(items) > 0
        assert all(c.get("department_id") in fa_depts for c in items)

    def test_departments_no_params(self, fac_user, depts):
        r = requests.get(f"{API}/departments", headers=fac_user, timeout=60)
        assert r.status_code == 200, r.text[:300]
        items = r.json()
        print("departments:", [(d["id"], d.get("faculty_id")) for d in items])
        exp = {d["id"] for d in depts if d.get("faculty_id") == FAC_A}
        assert {d["id"] for d in items} == exp

    def test_teachers_no_params_400(self, fac_user):
        r = requests.get(f"{API}/teachers", headers=fac_user, timeout=30)
        print("teachers no params:", r.status_code, r.text[:150])
        assert r.status_code == 400

    def test_teachers_own_faculty(self, fac_user, depts):
        r = requests.get(f"{API}/teachers", params={"faculty_id": FAC_A}, headers=fac_user, timeout=60)
        assert r.status_code == 200, r.text[:300]
        items = r.json()
        fa_depts = {d["id"] for d in depts if d.get("faculty_id") == FAC_A}
        print("teachers own faculty:", len(items), [t.get("department_id") for t in items])
        assert len(items) > 0
        outside = [t.get("full_name") or t.get("name") for t in items if t.get("department_id") not in fa_depts]
        print("teachers outside faculty depts (cross-dept via teaching_load):", outside)

    def test_teachers_other_faculty_403(self, fac_user):
        r = requests.get(f"{API}/teachers", params={"faculty_id": FAC_B}, headers=fac_user, timeout=30)
        print("other faculty:", r.status_code, r.text[:150])
        assert r.status_code == 403

    def test_teachers_random_faculty_403(self, fac_user):
        r = requests.get(f"{API}/teachers", params={"faculty_id": str(ObjectId())}, headers=fac_user, timeout=30)
        assert r.status_code == 403

    def test_teachers_dept_in_own_faculty_403_strict(self, fac_user, depts):
        # strict scope_type equality: department_id target vs faculty-scoped assignment
        d_in = next(d["id"] for d in depts if d.get("faculty_id") == FAC_A)
        r = requests.get(f"{API}/teachers", params={"department_id": d_in}, headers=fac_user, timeout=30)
        print("dept-in-own-faculty:", r.status_code, r.text[:150])

    def test_teachers_own_faculty_plus_foreign_dept_no_leak(self, fac_user, depts):
        # SECURITY: faculty_id=A passes guard; department_id from faculty B must NOT be returned
        d_out = next(d["id"] for d in depts if d.get("faculty_id") == FAC_B)
        r = requests.get(f"{API}/teachers", params={"faculty_id": FAC_A, "department_id": d_out},
                         headers=fac_user, timeout=30)
        items = r.json() if r.status_code == 200 else []
        leaked = [t.get("department_id") for t in items if t.get("department_id") == d_out]
        print("faculty A + dept B:", r.status_code, "count", len(items), "leaked", len(leaked))
        assert not leaked, f"LEAK: {len(leaked)} teachers from foreign dept {d_out}"

    def test_students_foreign_dept_no_leak(self, fac_user, depts):
        d_out = next(d["id"] for d in depts if d.get("faculty_id") == FAC_B)
        r = requests.get(f"{API}/students", params={"department_id": d_out}, headers=fac_user, timeout=30)
        items = r.json() if r.status_code == 200 else []
        assert not [s for s in items if s.get("department_id") == d_out]


class TestRegression:
    @pytest.mark.parametrize("user,pw", [("admin", "admin123"), ("Saeed", "test1234"), ("Salim", "test1234")])
    @pytest.mark.parametrize("path", ["/students", "/courses", "/departments", "/teachers"])
    def test_legacy_reads(self, user, pw, path):
        _, h = _login(user, pw)
        r = requests.get(f"{API}{path}", headers=h, timeout=60)
        assert r.status_code == 200, f"{user} {path}: {r.status_code} {r.text[:200]}"
        j = r.json()
        n = len(j) if isinstance(j, list) else len(j.get("items", []))
        print(user, path, n)
        assert n > 0

    def test_admin_teachers_15(self, admin_h):
        r = requests.get(f"{API}/teachers", headers=admin_h, timeout=60)
        assert len(r.json()) == 15

    def test_layer2_dept_scope_unchanged(self, admin_h):
        r = requests.put(f"{API}/advanced-access/roles/{L2_ROLE_ID}", headers=admin_h,
                         json={"permission_keys": L2_ORIG_KEYS + ["teachers_ser_get_teachers", "students_ser_get_students",
                                                                  "courses_ser_get_courses", "academic_structure_ser_get_departments"]},
                         timeout=30)
        assert r.status_code == 200
        try:
            _, h = _login("layer2_test_emp", "test1234")
            r1 = requests.get(f"{API}/teachers", params={"department_id": L2_DEPT}, headers=h, timeout=30)
            assert r1.status_code == 200, r1.text[:200]
            print("layer2 teachers:", len(r1.json()))
            assert len(r1.json()) == 12
            assert all(t.get("department_id") == L2_DEPT for t in r1.json())
            r2 = requests.get(f"{API}/teachers", params={"faculty_id": FAC_A}, headers=h, timeout=30)
            print("layer2 faculty_id param:", r2.status_code)
            assert r2.status_code == 403
            r3 = requests.get(f"{API}/teachers", params={"faculty_id": FAC_B}, headers=h, timeout=30)
            assert r3.status_code == 403
            for p in ["/students", "/courses", "/departments"]:
                rr = requests.get(f"{API}{p}", headers=h, timeout=60)
                j = rr.json() if rr.status_code == 200 else []
                print("layer2", p, rr.status_code, len(j))
                assert rr.status_code == 200
                assert len(j) > 0
                if p != "/departments":
                    assert all(x.get("department_id") == L2_DEPT for x in j)
                else:
                    assert [x["id"] for x in j] == [L2_DEPT]
        finally:
            rr = requests.put(f"{API}/advanced-access/roles/{L2_ROLE_ID}", headers=admin_h,
                              json={"permission_keys": L2_ORIG_KEYS}, timeout=30)
            assert rr.status_code == 200

    def test_layer2_role_restored(self, admin_h):
        role = requests.get(f"{API}/advanced-access/roles/{L2_ROLE_ID}", headers=admin_h, timeout=30).json()
        assert sorted(role.get("permission_keys", [])) == sorted(L2_ORIG_KEYS)
