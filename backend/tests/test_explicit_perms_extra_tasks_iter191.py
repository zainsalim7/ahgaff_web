# Iter 191: explicit (no-default) permissions for grades/statements/student photos/cards + dashboard extra-tasks backend gates
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
SALIM_FID = "698e4f9297fef774e66e93a4"

GATED = [
    "/api/grades/template",
    f"/api/statements/settings/{SALIM_FID}",
    "/api/pending-photos",
    "/api/approved-photos",
    "/api/cards/print-settings",
    "/api/cards/back-settings",
    f"/api/cards/settings/{SALIM_FID}",
]


def _login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p}, timeout=30)
    if r.status_code != 200:
        return None, r
    d = r.json()
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {d.get('access_token') or d.get('token')}"})
    return s, d


@pytest.fixture(scope="module")
def admin():
    s, d = _login("admin", "admin123")
    if not s:
        pytest.skip("admin login failed")
    return s


@pytest.fixture(scope="module")
def salim():
    s, d = _login("Salim", "test1234")
    if not s:
        pytest.skip("Salim login failed")
    return s


# --- Dean (Salim) must be denied on all gated endpoints
@pytest.mark.parametrize("path", GATED)
def test_dean_denied(salim, path):
    r = salim.get(f"{BASE_URL}{path}", timeout=30)
    assert r.status_code == 403, f"{path} -> {r.status_code} {r.text[:200]}"


# --- Admin keeps full access
@pytest.mark.parametrize("path", GATED)
def test_admin_allowed(admin, path):
    r = admin.get(f"{BASE_URL}{path}", timeout=60)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"


def test_salim_me_perms(salim):
    r = salim.get(f"{BASE_URL}/api/auth/me", timeout=30)
    assert r.status_code == 200
    perms = set(r.json().get("permissions") or [])
    for p in ("manage_grades", "issue_statements", "approve_student_photos", "print_student_cards"):
        assert p not in perms
    assert "manage_fee_receipts" in perms


def test_salim_fee_receipts_ok(salim):
    r = salim.get(f"{BASE_URL}/api/fees/receipts", timeout=30)
    assert r.status_code == 200, r.text[:200]


def test_new_perms_in_catalog(admin):
    r = admin.get(f"{BASE_URL}/api/permissions/all", timeout=30)
    assert r.status_code == 200, r.text[:200]
    txt = r.text
    for p in ("manage_grades", "approve_student_photos", "print_student_cards", "issue_statements"):
        assert p in txt, p


# --- Possible remaining leaks (not explicitly gated) — reported as findings
@pytest.mark.parametrize("path", [
    "/api/statements",                       # statements log list
    "/api/statement-templates",              # templates list
    "/api/cards/batches",                    # print batches list
    f"/api/cards/print-report?faculty_id={SALIM_FID}",  # excel report of students print status
])
def test_dean_leak_probe(salim, path):
    r = salim.get(f"{BASE_URL}{path}", timeout=60)
    assert r.status_code == 403, f"LEAK {path} -> {r.status_code}"


# --- Custom role with the explicit perms gets access; custom role without gets 403
class TestCustomRole:
    created = {"users": [], "roles": []}

    @pytest.fixture(scope="class", autouse=True)
    def _setup(self, admin):
        sfx = uuid.uuid4().hex[:6]
        perms = ["manage_grades", "issue_statements", "approve_student_photos", "print_student_cards"]
        r = admin.post(f"{BASE_URL}/api/roles", json={"name": f"TEST_role_full_{sfx}", "description": "t", "permissions": perms}, timeout=30)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]; self.created["roles"].append(rid)
        r2 = admin.post(f"{BASE_URL}/api/roles", json={"name": f"TEST_role_none_{sfx}", "description": "t", "permissions": ["view_students"]}, timeout=30)
        assert r2.status_code == 200, r2.text
        rid2 = r2.json()["id"]; self.created["roles"].append(rid2)
        for name, role_id in ((f"TEST_full_{sfx}", rid), (f"TEST_none_{sfx}", rid2)):
            u = admin.post(f"{BASE_URL}/api/users", json={"username": name, "full_name": name, "password": "Test1234!",
                                                         "role_id": role_id, "faculty_id": SALIM_FID}, timeout=30)
            assert u.status_code == 200, u.text
            self.created["users"].append(u.json()["id"])
        TestCustomRole.full_u = f"TEST_full_{sfx}"
        TestCustomRole.none_u = f"TEST_none_{sfx}"
        yield
        for uid in self.created["users"]:
            admin.delete(f"{BASE_URL}/api/users/{uid}", timeout=30)
        for rid_ in self.created["roles"]:
            admin.delete(f"{BASE_URL}/api/roles/{rid_}", timeout=30)

    def test_full_role_allowed(self):
        s, d = _login(self.full_u, "Test1234!")
        assert s, d.text
        bad = {}
        for p in GATED:
            r = s.get(f"{BASE_URL}{p}", timeout=60)
            if r.status_code != 200:
                bad[p] = r.status_code
        assert not bad, bad

    def test_none_role_denied(self):
        s, d = _login(self.none_u, "Test1234!")
        assert s, d.text
        bad = {}
        for p in GATED:
            r = s.get(f"{BASE_URL}{p}", timeout=60)
            if r.status_code != 403:
                bad[p] = r.status_code
        assert not bad, bad

    def test_full_other_faculty_denied(self, admin):
        # statements settings for another faculty must be 403 (faculty scope)
        facs = admin.get(f"{BASE_URL}/api/faculties", timeout=30).json()
        facs = facs if isinstance(facs, list) else facs.get("items", [])
        other = next((f.get("id") or f.get("_id") for f in facs if (f.get("id") or f.get("_id")) != SALIM_FID), None)
        if not other:
            pytest.skip("no other faculty")
        s, _ = _login(self.full_u, "Test1234!")
        assert s.get(f"{BASE_URL}/api/statements/settings/{other}", timeout=30).status_code == 403
        assert s.get(f"{BASE_URL}/api/cards/settings/{other}", timeout=30).status_code == 403


# --- Teacher / student regression
def test_teacher_login_and_denied():
    s, d = _login("teacher180156", "teacher123")
    assert s, d.text
    for p in GATED:
        assert s.get(f"{BASE_URL}{p}", timeout=30).status_code == 403, p


def test_student_login_and_denied():
    s, d = _login("1001", "test1234")
    if not s:
        pytest.skip(f"student 1001 login failed {d.status_code}")
    for p in GATED:
        assert s.get(f"{BASE_URL}{p}", timeout=30).status_code == 403, p


# --- Ungated card endpoints reachable by students (PII leak probes)
@pytest.mark.parametrize("path", ["/api/cards/batches", f"/api/cards/print-report?faculty_id={SALIM_FID}"])
def test_student_leak_probe(path):
    s, d = _login("1001", "test1234")
    if not s:
        pytest.skip("student login failed")
    assert s.get(f"{BASE_URL}{path}", timeout=60).status_code == 403, f"LEAK {path}"
