# Iter159: university-scoped real-enforcement user (adv_has_university_scope + real_enforce_guard live check)
# + regression: dept-scoped (layer2_test_emp) / faculty-scoped users NOT widened; admin/Saeed/Salim unchanged
import os
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

FAC_A = "698e4f9297fef774e66e93a4"
FAC_B = "698e4fb497fef774e66e93a6"
L2_ROLE_ID = "6ae98be3fbf74b036f42a7a7"
L2_ORIG_KEYS = ["students_ser_create_student", "students_ser_delete_student", "grades_grades_download_grades_template"]
L2_DEPT = "698e500997fef774e66e93a8"
UNI_KEYS = ["teachers_ser_get_teachers", "students_ser_get_students",
            "academic_structure_ser_get_departments", "courses_ser_get_courses"]

CREATED = {"users": [], "roles": [], "assignments": []}


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


def _n(r):
    j = r.json()
    return len(j) if isinstance(j, list) else len(j.get("items", []))


@pytest.fixture(scope="module")
def admin_h():
    return _login("admin", "admin123")[1]


@pytest.fixture(scope="module")
def admin_counts(admin_h):
    out = {}
    for p in ["/teachers", "/students", "/departments", "/courses"]:
        r = requests.get(f"{API}{p}", headers=admin_h, timeout=90)
        out[p] = _n(r)
    print("admin counts:", out)
    return out


@pytest.fixture(scope="module")
def depts(admin_h):
    return requests.get(f"{API}/departments", headers=admin_h, timeout=30).json()


def _make_user(admin_h, username, assignments):
    u = requests.post(f"{API}/advanced-access/users/quick-find-or-create", headers=admin_h,
                      json={"username": username, "full_name": f"TEST_ {username}"}, timeout=30)
    assert u.status_code == 200, u.text
    uid = u.json()["id"]
    CREATED["users"].append((uid, username))
    a_ids = []
    for keys, scope in assignments:
        r = requests.post(f"{API}/advanced-access/roles", headers=admin_h,
                          json={"name_ar": f"TEST_role_{username}_{len(a_ids)}", "permission_keys": keys}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        rid = r.json()["id"]
        CREATED["roles"].append(rid)
        a = requests.post(f"{API}/advanced-access/assignments", headers=admin_h, json={
            "user_id": uid, "assignment_type": "academic", "advanced_role_id": rid,
            "context_label_ar": f"TEST_ {username}", "scope": scope}, timeout=30)
        assert a.status_code == 200, a.text[:300]
        CREATED["assignments"].append(a.json()["id"])
        a_ids.append(a.json()["id"])
    return uid, a_ids


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    db = _mongo()
    for aid in CREATED["assignments"]:
        db.advanced_user_assignments.delete_one({"_id": ObjectId(aid)})
    for rid in CREATED["roles"]:
        db.advanced_roles.delete_one({"_id": ObjectId(rid)})
    for uid, un in CREATED["users"]:
        db.users.delete_one({"_id": ObjectId(uid), "username": un})


@pytest.fixture(scope="module")
def uni_user(admin_h):
    uid, a_ids = _make_user(admin_h, "TEST_uniscope159", [(UNI_KEYS, {"scope_type": "university", "scope_ref_ids": []})])
    d, h = _login("TEST_uniscope159", "TEST_uniscope159")  # fresh login, no /auth/me
    return {"id": uid, "a_ids": a_ids, "login": d, "h": h}


# ---------- University-scoped user ----------
class TestUniversityScope:
    def test_login_real_enforcement(self, uni_user):
        u = uni_user["login"].get("user") or {}
        print("login user keys RE:", u.get("advanced_access_real_enforcement"), "uni:", u.get("adv_has_university_scope"))
        assert u.get("advanced_access_real_enforcement") is True
        doc = _mongo().users.find_one({"_id": ObjectId(uni_user["id"])})
        assert doc.get("adv_has_university_scope") is True

    def test_teachers_no_params_full(self, uni_user, admin_counts):
        r = requests.get(f"{API}/teachers", headers=uni_user["h"], timeout=60)
        assert r.status_code == 200, r.text[:300]
        print("uni teachers:", _n(r))
        assert _n(r) == admin_counts["/teachers"]

    def test_students_no_params_full(self, uni_user, admin_counts):
        r = requests.get(f"{API}/students", headers=uni_user["h"], timeout=90)
        assert r.status_code == 200, r.text[:300]
        print("uni students:", _n(r))
        assert _n(r) == admin_counts["/students"]

    def test_departments_no_params_full(self, uni_user, admin_counts):
        r = requests.get(f"{API}/departments", headers=uni_user["h"], timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert _n(r) == admin_counts["/departments"]

    def test_courses_no_params_full(self, uni_user, admin_counts):
        r = requests.get(f"{API}/courses", headers=uni_user["h"], timeout=90)
        print("uni courses:", r.status_code, _n(r) if r.status_code == 200 else r.text[:150])
        assert r.status_code == 200
        assert _n(r) == admin_counts["/courses"]

    def test_teachers_with_dept_and_faculty(self, uni_user):
        r1 = requests.get(f"{API}/teachers", params={"department_id": L2_DEPT}, headers=uni_user["h"], timeout=60)
        r2 = requests.get(f"{API}/teachers", params={"faculty_id": FAC_A}, headers=uni_user["h"], timeout=60)
        print("uni dept:", r1.status_code, _n(r1) if r1.ok else "", "fac:", r2.status_code, _n(r2) if r2.ok else "")
        assert r1.status_code == 200 and r2.status_code == 200
        assert all(t.get("department_id") == L2_DEPT for t in r1.json())

    def test_auth_me_after(self, uni_user):
        r = requests.get(f"{API}/auth/me", headers=uni_user["h"], timeout=30)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/teachers", headers=uni_user["h"], timeout=60)
        assert r2.status_code == 200


class TestUniversityEdge:
    def test_uni_without_teachers_key(self, admin_h):
        # university scope but missing teachers key -> should be denied (403 ideally)
        _make_user(admin_h, "TEST_uninokey159", [(["grades_grades_download_grades_template"],
                                                  {"scope_type": "university", "scope_ref_ids": []})])
        _, h = _login("TEST_uninokey159", "TEST_uninokey159")
        r = requests.get(f"{API}/teachers", headers=h, timeout=30)
        print("uni no-key teachers:", r.status_code, r.text[:150])
        assert r.status_code in (400, 403)
        rs = requests.get(f"{API}/students", headers=h, timeout=90)
        rd = requests.get(f"{API}/departments", headers=h, timeout=60)
        print("uni no-key students:", rs.status_code, _n(rs) if rs.ok else "", "departments:", rd.status_code, _n(rd) if rd.ok else "")
        STATE_EDGE["nokey_students"] = _n(rs) if rs.ok else rs.status_code

    def test_mixed_dept_and_uni_assignments(self, admin_h, admin_counts):
        # assignment1: dept L2 with read keys; assignment2: university with ONE unrelated key
        _make_user(admin_h, "TEST_unimixed159", [
            (UNI_KEYS, {"scope_type": "department", "scope_ref_ids": [L2_DEPT]}),
            (["grades_grades_download_grades_template"], {"scope_type": "university", "scope_ref_ids": []}),
        ])
        _, h = _login("TEST_unimixed159", "TEST_unimixed159")
        rt = requests.get(f"{API}/teachers", headers=h, timeout=30)
        rs = requests.get(f"{API}/students", headers=h, timeout=90)
        ns = _n(rs) if rs.ok else rs.status_code
        print("mixed: teachers no params:", rt.status_code, "students:", ns, "admin:", admin_counts["/students"])
        assert rt.status_code == 400  # teachers key only on dept assignment -> must specify dept
        assert ns != admin_counts["/students"], "LEAK: unrelated university-scoped key widened /students to whole university"

    def test_stale_flag_after_assignment_end(self, admin_h, admin_counts):
        uid, a_ids = _make_user(admin_h, "TEST_unistale159", [(UNI_KEYS, {"scope_type": "university", "scope_ref_ids": []})])
        _, h = _login("TEST_unistale159", "TEST_unistale159")
        assert _n(requests.get(f"{API}/students", headers=h, timeout=90)) == admin_counts["/students"]
        e = requests.post(f"{API}/advanced-access/assignments/{a_ids[0]}/end", headers=admin_h, timeout=30)
        assert e.status_code == 200
        rs = requests.get(f"{API}/students", headers=h, timeout=90)  # server.py get_current_user path (no sync)
        rt = requests.get(f"{API}/teachers", headers=h, timeout=30)
        ns = _n(rs) if rs.ok else rs.status_code
        print("after end (no resync): students", ns, "teachers", rt.status_code)
        STATE_EDGE["stale_students"] = ns
        assert rt.status_code in (400, 403)
        assert ns != admin_counts["/students"], "STALE: ended university assignment still grants full /students until resync"


STATE_EDGE = {}


# ---------- Regression: department & faculty-scoped not widened ----------
class TestNotWidened:
    def test_layer2(self, admin_h, admin_counts):
        r = requests.put(f"{API}/advanced-access/roles/{L2_ROLE_ID}", headers=admin_h,
                         json={"permission_keys": L2_ORIG_KEYS + UNI_KEYS}, timeout=30)
        assert r.status_code == 200
        try:
            _, h = _login("layer2_test_emp", "test1234")
            doc = _mongo().users.find_one({"username": "layer2_test_emp"})
            assert not doc.get("adv_has_university_scope")
            r1 = requests.get(f"{API}/teachers", params={"department_id": L2_DEPT}, headers=h, timeout=30)
            assert r1.status_code == 200 and len(r1.json()) == 12
            r2 = requests.get(f"{API}/teachers", headers=h, timeout=30)
            print("layer2 no params:", r2.status_code)
            assert r2.status_code == 400
            for fid in (FAC_A, FAC_B):
                r3 = requests.get(f"{API}/teachers", params={"faculty_id": fid}, headers=h, timeout=30)
                print("layer2 faculty", fid, r3.status_code)
                assert r3.status_code == 403
            rs = requests.get(f"{API}/students", headers=h, timeout=60)
            assert rs.status_code == 200
            assert all(s.get("department_id") == L2_DEPT for s in rs.json())
            assert _n(rs) < admin_counts["/students"]
            rd = requests.get(f"{API}/departments", headers=h, timeout=60)
            assert [d["id"] for d in rd.json()] == [L2_DEPT]
        finally:
            rr = requests.put(f"{API}/advanced-access/roles/{L2_ROLE_ID}", headers=admin_h,
                              json={"permission_keys": L2_ORIG_KEYS}, timeout=30)
            assert rr.status_code == 200
            role = _mongo().advanced_roles.find_one({"_id": ObjectId(L2_ROLE_ID)})
            assert sorted(role["permission_keys"]) == sorted(L2_ORIG_KEYS)

    def test_faculty_scoped(self, admin_h, depts, admin_counts):
        _make_user(admin_h, "TEST_facnw159", [(UNI_KEYS, {"scope_type": "faculty", "scope_ref_ids": [FAC_A]})])
        _, h = _login("TEST_facnw159", "TEST_facnw159")
        assert not _mongo().users.find_one({"username": "TEST_facnw159"}).get("adv_has_university_scope")
        r = requests.get(f"{API}/teachers", headers=h, timeout=30)
        assert r.status_code == 400
        assert requests.get(f"{API}/teachers", params={"faculty_id": FAC_A}, headers=h, timeout=30).status_code == 200
        assert requests.get(f"{API}/teachers", params={"faculty_id": FAC_B}, headers=h, timeout=30).status_code == 403
        fa = {d["id"] for d in depts if d.get("faculty_id") == FAC_A}
        rs = requests.get(f"{API}/students", headers=h, timeout=60)
        assert rs.status_code == 200 and all(s.get("department_id") in fa for s in rs.json())
        assert _n(rs) < admin_counts["/students"]
        rd = requests.get(f"{API}/departments", headers=h, timeout=60)
        assert {d["id"] for d in rd.json()} == fa


class TestLegacy:
    @pytest.mark.parametrize("user,pw", [("admin", "admin123"), ("Saeed", "test1234"), ("Salim", "test1234")])
    @pytest.mark.parametrize("path", ["/students", "/departments", "/teachers"])
    def test_legacy_reads(self, user, pw, path):
        _, h = _login(user, pw)
        r = requests.get(f"{API}{path}", headers=h, timeout=60)
        assert r.status_code == 200, f"{user} {path}: {r.status_code} {r.text[:200]}"
        print(user, path, _n(r))
        assert _n(r) > 0

    def test_admin_teachers_15(self, admin_counts):
        assert admin_counts["/teachers"] == 15


class TestStaleWithRemainingAssignment:
    def test_end_uni_keep_dept(self, admin_h, admin_counts):
        # user with dept read assignment + university read assignment; end the university one -> must drop back to dept
        _, a_ids = _make_user(admin_h, "TEST_unistale2_159", [
            (UNI_KEYS, {"scope_type": "department", "scope_ref_ids": [L2_DEPT]}),
            (UNI_KEYS, {"scope_type": "university", "scope_ref_ids": []}),
        ])
        _, h = _login("TEST_unistale2_159", "TEST_unistale2_159")
        assert _n(requests.get(f"{API}/students", headers=h, timeout=90)) == admin_counts["/students"]
        assert requests.post(f"{API}/advanced-access/assignments/{a_ids[1]}/end", headers=admin_h, timeout=30).status_code == 200
        rs = requests.get(f"{API}/students", headers=h, timeout=90)
        rt = requests.get(f"{API}/teachers", headers=h, timeout=30)
        print("after ending uni (dept kept): students", _n(rs) if rs.ok else rs.status_code, "teachers no params", rt.status_code)
        assert rt.status_code == 400
        assert rs.ok and all(s.get("department_id") == L2_DEPT for s in rs.json())
