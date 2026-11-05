# Iter160: confirm per-key (key-aware) + live (non-cached) university-scope check in get_user_scope_filter
# Scenario 1: dept A (students key) + uni B (grades key only) -> /students limited to dept
# Scenario 2: end A, keep B -> same token -> /students must be 403
# + light sanity: true uni user full access, layer2/faculty not widened, legacy users OK
import requests
import pytest
from bson import ObjectId
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from test_university_scope_real_enforce_iter159 import (  # noqa
    API, L2_DEPT, L2_ROLE_ID, L2_ORIG_KEYS, UNI_KEYS, FAC_A, FAC_B, _login, _mongo, _n)

CREATED = {"users": [], "roles": [], "assignments": []}
STATE = {}


def _make_user(admin_h, username, assignments):
    u = requests.post(f"{API}/advanced-access/users/quick-find-or-create", headers=admin_h,
                      json={"username": username, "full_name": f"TEST_ {username}"}, timeout=30)
    assert u.status_code == 200, u.text
    uid = u.json()["id"]
    CREATED["users"].append((uid, username))
    ids = []
    for keys, scope in assignments:
        r = requests.post(f"{API}/advanced-access/roles", headers=admin_h,
                          json={"name_ar": f"TEST_role_{username}_{len(ids)}", "permission_keys": keys}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        CREATED["roles"].append(r.json()["id"])
        a = requests.post(f"{API}/advanced-access/assignments", headers=admin_h, json={
            "user_id": uid, "assignment_type": "academic", "advanced_role_id": r.json()["id"],
            "context_label_ar": f"TEST_ {username}", "scope": scope}, timeout=30)
        assert a.status_code == 200, a.text[:300]
        CREATED["assignments"].append(a.json()["id"])
        ids.append(a.json()["id"])
    return uid, ids


@pytest.fixture(scope="module")
def admin_h():
    return _login("admin", "admin123")[1]


@pytest.fixture(scope="module")
def admin_counts(admin_h):
    out = {p: _n(requests.get(f"{API}{p}", headers=admin_h, timeout=90))
           for p in ["/teachers", "/students", "/departments", "/courses"]}
    print("admin counts:", out)
    return out


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
    left = db.users.count_documents({"username": {"$in": [u for _, u in CREATED["users"]]}})
    print("cleanup leftover users:", left)


class TestKeyAwareAndLive:
    def test_1_unrelated_uni_key_does_not_widen(self, admin_h, admin_counts):
        uid, ids = _make_user(admin_h, "TEST_keyaware160", [
            (["students_ser_get_students"], {"scope_type": "department", "scope_ref_ids": [L2_DEPT]}),
            (["grades_grades_download_grades_template"], {"scope_type": "university", "scope_ref_ids": []}),
        ])
        _, h = _login("TEST_keyaware160", "TEST_keyaware160")
        STATE.update(h=h, a_ids=ids)
        rs = requests.get(f"{API}/students", headers=h, timeout=90)
        print("scenario1 /students:", rs.status_code, _n(rs) if rs.ok else rs.text[:200], "admin:", admin_counts["/students"])
        assert rs.status_code == 200
        assert _n(rs) < admin_counts["/students"], "LEAK: unrelated uni key widened /students"
        assert all(s.get("department_id") == L2_DEPT for s in rs.json())
        rt = requests.get(f"{API}/teachers", headers=h, timeout=30)
        rd = requests.get(f"{API}/departments", headers=h, timeout=30)
        rc = requests.get(f"{API}/courses", headers=h, timeout=60)
        print("scenario1 teachers/departments/courses:", rt.status_code, rd.status_code,
              _n(rd) if rd.ok else rd.text[:100], rc.status_code, _n(rc) if rc.ok else rc.text[:100])
        assert not (rt.ok and _n(rt) == admin_counts["/teachers"])
        assert not (rd.ok and _n(rd) == admin_counts["/departments"])
        assert not (rc.ok and _n(rc) == admin_counts["/courses"])

    def test_2_end_dept_keep_uni_same_token_403(self, admin_h):
        assert "h" in STATE, "scenario 1 did not run"
        e = requests.post(f"{API}/advanced-access/assignments/{STATE['a_ids'][0]}/end", headers=admin_h, timeout=30)
        assert e.status_code == 200, e.text[:200]
        rs = requests.get(f"{API}/students", headers=STATE["h"], timeout=90)
        print("scenario2 /students after end A:", rs.status_code, _n(rs) if rs.ok else rs.text[:200])
        assert rs.status_code == 403, f"expected 403, got {rs.status_code} ({_n(rs) if rs.ok else ''})"


class TestSanity:
    def test_true_uni_full(self, admin_h, admin_counts):
        _make_user(admin_h, "TEST_unifull160", [(UNI_KEYS, {"scope_type": "university", "scope_ref_ids": []})])
        _, h = _login("TEST_unifull160", "TEST_unifull160")
        for p in ["/teachers", "/students", "/departments", "/courses"]:
            r = requests.get(f"{API}{p}", headers=h, timeout=90)
            print("uni full", p, r.status_code, _n(r) if r.ok else r.text[:100])
            assert r.status_code == 200 and _n(r) == admin_counts[p]

    def test_layer2_not_widened(self, admin_h, admin_counts):
        r = requests.put(f"{API}/advanced-access/roles/{L2_ROLE_ID}", headers=admin_h,
                         json={"permission_keys": L2_ORIG_KEYS + UNI_KEYS}, timeout=30)
        assert r.status_code == 200
        try:
            _, h = _login("layer2_test_emp", "test1234")
            assert requests.get(f"{API}/teachers", headers=h, timeout=30).status_code == 400
            rs = requests.get(f"{API}/students", headers=h, timeout=60)
            assert rs.ok and _n(rs) < admin_counts["/students"]
            assert all(s.get("department_id") == L2_DEPT for s in rs.json())
            rd = requests.get(f"{API}/departments", headers=h, timeout=60)
            assert [d["id"] for d in rd.json()] == [L2_DEPT]
            assert requests.get(f"{API}/teachers", params={"faculty_id": FAC_A}, headers=h, timeout=30).status_code == 403
        finally:
            rr = requests.put(f"{API}/advanced-access/roles/{L2_ROLE_ID}", headers=admin_h,
                              json={"permission_keys": L2_ORIG_KEYS}, timeout=30)
            assert rr.status_code == 200
            role = _mongo().advanced_roles.find_one({"_id": ObjectId(L2_ROLE_ID)})
            assert sorted(role["permission_keys"]) == sorted(L2_ORIG_KEYS)

    def test_faculty_not_widened(self, admin_h, admin_counts):
        depts = requests.get(f"{API}/departments", headers=admin_h, timeout=30).json()
        fa = {d["id"] for d in depts if d.get("faculty_id") == FAC_A}
        _make_user(admin_h, "TEST_facnw160", [(UNI_KEYS, {"scope_type": "faculty", "scope_ref_ids": [FAC_A]})])
        _, h = _login("TEST_facnw160", "TEST_facnw160")
        assert requests.get(f"{API}/teachers", headers=h, timeout=30).status_code == 400
        assert requests.get(f"{API}/teachers", params={"faculty_id": FAC_B}, headers=h, timeout=30).status_code == 403
        rs = requests.get(f"{API}/students", headers=h, timeout=60)
        assert rs.ok and _n(rs) < admin_counts["/students"] and all(s.get("department_id") in fa for s in rs.json())
        rd = requests.get(f"{API}/departments", headers=h, timeout=60)
        assert {d["id"] for d in rd.json()} == fa

    @pytest.mark.parametrize("user,pw", [("admin", "admin123"), ("Saeed", "test1234"), ("Salim", "test1234")])
    def test_legacy(self, user, pw):
        _, h = _login(user, pw)
        for p in ["/students", "/departments", "/teachers"]:
            r = requests.get(f"{API}{p}", headers=h, timeout=60)
            assert r.status_code == 200 and _n(r) > 0, f"{user}{p} {r.status_code}"
