# Real Enforcement global guard (Layer1 middleware) + Layer2 scope checks — regression tests
# Legacy users (admin, Saeed) must be totally unaffected; layer2_test_emp is the enforcement user.
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"')
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

OWN_DEPT = "698e500997fef774e66e93a8"
OTHER_DEPT = "698e501d97fef774e66e93a9"
OUT_OF_SCOPE_STUDENT = "698ef706d803b27aab012065"


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed for {u}: {r.status_code} {r.text[:200]}")
    return r.json()


@pytest.fixture(scope="module")
def admin():
    d = _login("admin", "admin123")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {d['access_token']}"})
    return s


@pytest.fixture(scope="module")
def saeed():
    d = _login("Saeed", "test1234")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {d['access_token']}"})
    s.user = d["user"]
    return s


@pytest.fixture(scope="module")
def l2():
    d = _login("layer2_test_emp", "test1234")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {d['access_token']}"})
    s.user = d["user"]
    return s


# ---------- Legacy admin: no regressions ----------
ADMIN_GETS = [
    "/students", "/teachers", "/courses", "/departments", "/faculties", "/enrollments",
    "/attendance-changes", "/semesters", "/semesters/current", "/settings", "/users",
    "/reports/summary", "/lectures/today", "/hr/employees", "/hr/org-units", "/hr/my-scope",
    "/correspondence/dashboard", "/correspondence/organizations", "/correspondence/document-types",
    "/letters", "/calendar/events", "/calendar/holidays", "/cards/batches", "/cards/print-settings",
    "/grades/imports", "/fees/types", "/fees/stats", "/activity-logs", "/auth/me",
]


@pytest.mark.parametrize("path", ADMIN_GETS)
def test_admin_get_smoke(admin, path):
    r = admin.get(f"{API}{path}", timeout=60)
    assert r.status_code not in (403, 500, 502), f"{path} -> {r.status_code} {r.text[:200]}"
    assert r.status_code in (200, 404, 422, 400), f"{path} -> {r.status_code} {r.text[:200]}"


def test_admin_department_create_delete(admin):
    code = "TST" + uuid.uuid4().hex[:5].upper()
    fac = admin.get(f"{API}/faculties", timeout=30).json()
    fac_id = fac[0]["id"] if fac else None
    r = admin.post(f"{API}/departments", json={"name": f"TEST_dept_{code}", "code": code, "faculty_id": fac_id}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["name"] == f"TEST_dept_{code}"
    assert d["faculty_id"] == fac_id
    dr = admin.delete(f"{API}/departments/{d['id']}", timeout=30)
    assert dr.status_code == 200, dr.text
    lst = admin.get(f"{API}/departments", timeout=30).json()
    assert all(x["id"] != d["id"] for x in lst)


def test_admin_update_teacher_noop(admin):
    teachers = admin.get(f"{API}/teachers", timeout=60).json()
    items = teachers if isinstance(teachers, list) else teachers.get("items") or teachers.get("teachers") or []
    assert items, "no teachers"
    t = items[0]
    r = admin.put(f"{API}/teachers/{t['id']}", json={"full_name": t["full_name"]}, timeout=30)
    assert r.status_code == 200, r.text


def test_admin_student_create_delete_keeps_department(admin):
    sid = "TEST" + uuid.uuid4().hex[:6]
    r = admin.post(f"{API}/students", json={"student_id": sid, "full_name": "TEST_admin_student",
                                             "department_id": OTHER_DEPT, "level": 1, "section": "A"}, timeout=30)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["department_id"] == OTHER_DEPT  # no auto-correction for legacy
    g = admin.get(f"{API}/students/{s['id']}", timeout=30)
    assert g.status_code == 200 and g.json()["department_id"] == OTHER_DEPT
    d = admin.delete(f"{API}/students/{s['id']}", timeout=30)
    assert d.status_code == 200, d.text
    assert admin.get(f"{API}/students/{s['id']}", timeout=30).status_code == 404


# ---------- Legacy Saeed: no regressions ----------
SAEED_GETS = ["/students", "/teachers", "/courses", "/departments", "/faculties", "/enrollments",
              "/semesters/current", "/auth/me", "/hr/employees", "/hr/my-scope", "/letters",
              "/calendar/events", "/correspondence/dashboard", "/reports/summary", "/lectures/today"]


@pytest.mark.parametrize("path", SAEED_GETS)
def test_saeed_get_smoke(saeed, path):
    r = saeed.get(f"{API}{path}", timeout=60)
    assert r.status_code not in (500, 502), f"{path} -> {r.status_code}"
    # body must not be the new middleware's message
    if r.status_code == 403:
        assert "غير مصرح لك بهذا الإجراء" not in r.text, f"guard blocked legacy Saeed on {path}"
        pytest.xfail(f"legacy 403 on {path}: {r.text[:120]}")


def test_saeed_not_flagged(saeed):
    me = saeed.get(f"{API}/auth/me", timeout=30).json()
    assert not me.get("advanced_access_real_enforcement")


# ---------- Layer2 enforcement user ----------
def test_l2_flagged(l2):
    me = l2.get(f"{API}/auth/me", timeout=30).json()
    assert me.get("advanced_access_real_enforcement") is True


def test_l2_create_student_autocorrects_scope(l2, admin):
    sid = "TEST" + uuid.uuid4().hex[:6]
    r = l2.post(f"{API}/students", json={"student_id": sid, "full_name": "TEST_l2_student",
                                          "department_id": OTHER_DEPT, "level": 1, "section": "A"}, timeout=30)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["department_id"] == OWN_DEPT
    g = admin.get(f"{API}/students/{s['id']}", timeout=30)
    assert g.json()["department_id"] == OWN_DEPT
    # in-scope delete allowed for l2
    d = l2.delete(f"{API}/students/{s['id']}", timeout=30)
    assert d.status_code == 200, d.text
    assert admin.get(f"{API}/students/{s['id']}", timeout=30).status_code == 404


def test_l2_create_student_in_scope_kept(l2, admin):
    sid = "TEST" + uuid.uuid4().hex[:6]
    r = l2.post(f"{API}/students", json={"student_id": sid, "full_name": "TEST_l2_student2",
                                          "department_id": OWN_DEPT, "level": 1, "section": "A"}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["department_id"] == OWN_DEPT
    admin.delete(f"{API}/students/{r.json()['id']}", timeout=30)


def test_l2_delete_out_of_scope_student_403(l2, admin):
    before = admin.get(f"{API}/students/{OUT_OF_SCOPE_STUDENT}", timeout=30)
    assert before.status_code == 200
    assert before.json()["department_id"] == OTHER_DEPT
    r = l2.delete(f"{API}/students/{OUT_OF_SCOPE_STUDENT}", timeout=30)
    assert r.status_code == 403, r.text
    assert "خارج النطاق" in r.json().get("detail", "")
    after = admin.get(f"{API}/students/{OUT_OF_SCOPE_STUDENT}", timeout=30)
    assert after.status_code == 200  # still exists


def test_l2_create_teacher_blocked_by_guard(l2):
    r = l2.post(f"{API}/teachers", json={"full_name": "TEST_x", "teacher_id": "TESTT1", "department_id": OWN_DEPT}, timeout=30)
    assert r.status_code == 403
    assert r.json().get("detail") == "غير مصرح لك بهذا الإجراء"


def test_l2_create_department_blocked(l2):
    r = l2.post(f"{API}/departments", json={"name": "TEST_l2", "code": "TL2X"}, timeout=30)
    assert r.status_code == 403


def test_l2_safe_delete_without_perm_blocked(l2):
    r = l2.post(f"{API}/students/{OUT_OF_SCOPE_STUDENT}/safe-delete", timeout=30)
    assert r.status_code == 403


@pytest.mark.parametrize("path", ["/cards/batches", "/fees/types", "/users", "/calendar/events", "/grades/imports"])
def test_l2_sensitive_reads_no_500(l2, path):
    r = l2.get(f"{API}{path}", timeout=30)
    assert r.status_code != 500, f"{path} -> 500"


def test_unauthenticated_write_still_401(admin):
    r = requests.post(f"{API}/teachers", json={}, timeout=30)
    assert r.status_code in (401, 403)


# ---------- Legacy Saeed writes (own department 698e501d97fef774e66e93a9) ----------
def test_saeed_student_create_delete(saeed, admin):
    sid = "TEST" + uuid.uuid4().hex[:6]
    r = saeed.post(f"{API}/students", json={"student_id": sid, "full_name": "TEST_saeed_student",
                                             "department_id": OTHER_DEPT, "level": 1, "section": "A"}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["department_id"] == OTHER_DEPT
    d = saeed.delete(f"{API}/students/{r.json()['id']}", timeout=30)
    assert d.status_code == 200, d.text


def test_saeed_update_teacher_noop(saeed):
    tid = "698bc0593a8982391e9ba188"
    t = saeed.get(f"{API}/teachers/{tid}", timeout=30)
    assert t.status_code == 200, t.text
    r = saeed.put(f"{API}/teachers/{tid}", json={"full_name": t.json()["full_name"]}, timeout=30)
    assert r.status_code == 200, r.text
