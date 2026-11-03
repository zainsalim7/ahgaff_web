# Real Enforcement — batch 3 "activate the rest" (844 guarded endpoints) regression tests
# Legacy admin/Saeed must be unaffected; layer2_test_emp must be blocked on newly covered groups;
# self-service ("my data") endpoints must never return 403 for anyone.
import os
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
GUARD_MSG = "غير مصرح لك بهذا الإجراء"


def _session(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed for {u}: {r.status_code}")
    d = r.json()
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {d['access_token']}"})
    s.user = d["user"]
    return s


@pytest.fixture(scope="module")
def admin():
    return _session("admin", "admin123")


@pytest.fixture(scope="module")
def saeed():
    return _session("Saeed", "test1234")


@pytest.fixture(scope="module")
def l2():
    return _session("layer2_test_emp", "test1234")


# ---------- Legacy admin: broad GET smoke across newly covered groups ----------
ADMIN_GETS = [
    "/students", "/teachers", "/courses", "/departments", "/faculties", "/enrollments",
    "/hr/employees", "/hr/leaves", "/hr/tasks", "/hr/attendance/records", "/hr/org-units",
    "/correspondence/dashboard", "/correspondence/organizations", "/letters",
    "/notifications/history", "/notifications/stats", "/notifications/my", "/notifications", "/notifications/count",
    "/calendar/events", "/calendar/holidays", "/cards/batches", "/cards/print-settings",
    "/fees/types", "/fees/stats", "/settings", "/users", "/roles", "/activity-logs",
    "/semesters", "/attendance-changes", "/reports/summary", "/teacher-preferences",
    "/faculty-board/sessions", "/assistant/sessions", "/advanced-access/me/access",
    "/my-institution", "/my-scope", "/auth/me", "/dashboard/management",
]


@pytest.mark.parametrize("path", ADMIN_GETS)
def test_admin_get_no_403(admin, path):
    r = admin.get(f"{API}{path}", timeout=60)
    assert r.status_code not in (403, 500, 502), f"{path} -> {r.status_code} {r.text[:200]}"


SAEED_GETS = ["/students", "/teachers", "/courses", "/departments", "/auth/me", "/my-scope",
              "/notifications", "/notifications/count", "/notifications/my", "/calendar/events",
              "/correspondence/dashboard", "/letters", "/hr/tasks", "/my-institution"]


@pytest.mark.parametrize("path", SAEED_GETS)
def test_saeed_get_no_guard_403(saeed, path):
    r = saeed.get(f"{API}{path}", timeout=60)
    assert r.status_code not in (500, 502), f"{path} -> {r.status_code}"
    if r.status_code == 403:
        # A legacy 403 must never be the global-guard message
        assert GUARD_MSG not in r.text, f"guard blocked legacy Saeed on {path}"
        pytest.xfail(f"legacy 403 {path}: {r.text[:120]}")


def test_saeed_hr_leaves_legacy_behavior(saeed):
    r = saeed.get(f"{API}/hr/leaves", timeout=30)
    assert GUARD_MSG not in r.text
    print("Saeed /hr/leaves:", r.status_code, r.text[:150])


# ---------- layer2_test_emp ----------
def test_l2_flagged(l2):
    assert l2.user.get("username") == "layer2_test_emp"


def test_l2_create_student_scope_autocorrect(l2, admin):
    code = "T" + uuid.uuid4().hex[:7]
    r = l2.post(f"{API}/students", json={"student_id": code, "full_name": f"TEST_full_{code}",
                                         "department_id": "698e501d97fef774e66e93a9", "level": 1, "section": "A"}, timeout=30)
    assert r.status_code in (200, 201), r.text[:300]
    sid = r.json().get("id")
    g = admin.get(f"{API}/students/{sid}", timeout=30)
    assert g.json().get("department_id") == OWN_DEPT
    d = l2.delete(f"{API}/students/{sid}", timeout=30)
    assert d.status_code in (200, 204), d.text[:200]


def test_l2_dashboard_management(l2):
    r = l2.get(f"{API}/dashboard/management", timeout=60)
    assert r.status_code == 200, r.text[:200]


BLOCKED_WRITES = [
    ("POST", "/notifications/send", {"title": "TEST_x", "body": "x", "target": "all"}),
    ("POST", "/api/notifications/manual", {"title": "TEST_x", "message": "x"}),
    ("POST", "/correspondence/organizations", {"name": "TEST_org"}),
    ("POST", "/hr/cards/batch-preview", {"employee_ids": []}),
    ("POST", "/fees/remind-unpaid", {}),
    ("POST", "/fees/types", {"name": "TEST_fee", "amount": 1}),
    ("POST", "/calendar/events", {"title": "TEST_ev"}),
    ("POST", "/teachers", {"full_name": "TEST_t"}),
]


@pytest.mark.parametrize("method,path,body", BLOCKED_WRITES)
def test_l2_blocked_new_groups(l2, method, path, body):
    p = path if path.startswith("/api/") else f"/api{path}"
    r = l2.request(method, f"{BASE_URL}{p}", json=body, timeout=30)
    print(method, p, r.status_code, r.text[:120])
    assert r.status_code == 403, f"{p} -> {r.status_code} {r.text[:200]}"


BLOCKED_READS = ["/teachers", "/correspondence/dashboard", "/cards/batches", "/fees/types",
                 "/calendar/events", "/notifications/history", "/users", "/activity-logs"]


@pytest.mark.parametrize("path", BLOCKED_READS)
def test_l2_blocked_reads(l2, path):
    r = l2.get(f"{API}{path}", timeout=30)
    print(path, r.status_code, r.text[:100])
    assert r.status_code == 403


# ---------- Self-service must never be 403 for enforcement user ----------
SELF_SERVICE_GETS = ["/auth/me", "/my-institution", "/notifications/my", "/my-scope",
                     "/notifications", "/notifications/count", "/advanced-access/me/access",
                     "/advanced-access/me/contexts", "/correspondence/me", "/hr/attendance/my",
                     "/students/me", "/students/me/courses", "/students/me/card", "/teachers/me", "/hr/employees/me/card"]


@pytest.mark.parametrize("path", SELF_SERVICE_GETS)
def test_l2_self_service_not_403(l2, path):
    r = l2.get(f"{API}{path}", timeout=30)
    print(path, r.status_code, r.text[:120])
    assert not (r.status_code == 403 and GUARD_MSG in r.text), f"guard blocked self-service {path}"
    assert r.status_code != 500


SELF_SERVICE_WRITES = [
    ("POST", "/auth/change-password", {"current_password": "wrong_pw_x", "new_password": "test1234"}),
    ("POST", "/notifications/register-token", {"token": "TEST_tok", "platform": "web"}),
    ("POST", "/notifications/mark-all-read", {}),
    ("PUT", "/notifications/read-all", {}),
]


@pytest.mark.parametrize("method,path,body", SELF_SERVICE_WRITES)
def test_l2_self_service_writes_not_guarded(l2, method, path, body):
    r = l2.request(method, f"{API}{path}", json=body, timeout=30)
    print(method, path, r.status_code, r.text[:120])
    assert not (r.status_code == 403 and GUARD_MSG in r.text), f"guard blocked self-service {method} {path}"
