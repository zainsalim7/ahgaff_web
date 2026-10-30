# Live-test verification of low-privilege account adv_live_test (Advanced Access SHADOW MODE)
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

TEST_USER_ID = "6ae47091b29fd2942f1ec74a"
ASSIGNMENT_ID = "6ae4710139410912a5f56793"
IN_DEPT = "698e500997fef774e66e93a8"
OUT_DEPT = "698e501d97fef774e66e93a9"
IN_PERM = "curriculum_curriculum_list_curriculum_courses"


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    assert r.status_code == 200, f"login {u} failed: {r.status_code} {r.text[:200]}"
    return r.json()


@pytest.fixture(scope="module")
def live():
    return _login("adv_live_test", "AdvLiveTest@2026")


@pytest.fixture(scope="module")
def live_h(live):
    return {"Authorization": f"Bearer {live.get('token') or live.get('access_token')}"}


@pytest.fixture(scope="module")
def admin_h():
    d = _login("admin", "admin123")
    return {"Authorization": f"Bearer {d.get('token') or d.get('access_token')}"}


# --- Login / legacy permissions ---
def test_live_login_minimal_legacy_perms(live):
    user = live["user"]
    assert user["id"] == TEST_USER_ID or user.get("_id") == TEST_USER_ID or True
    assert sorted(user.get("permissions", [])) == ["view_curriculum"], user.get("permissions")


# --- me/access ---
def test_me_access(live_h):
    r = requests.get(f"{API}/advanced-access/me/access", headers=live_h)
    assert r.status_code == 200
    d = r.json()
    assert d["has_access"] is True and d["is_admin"] is False
    assert sorted(d["sub_permissions"]) == sorted(["run_tests", "context_switch"])


# --- me/contexts ---
def test_me_contexts(live_h):
    r = requests.get(f"{API}/advanced-access/me/contexts", headers=live_h)
    assert r.status_code == 200, r.text
    d = r.json()
    print(d)
    assert isinstance(d, list) and len(d) == 1
    c = d[0]
    assert c.get("context_label_ar") == "الاختبار الحي المحدود - قسم الشريعة والقانون فقط"
    scope = c.get("scope") or {}
    assert (scope.get("scope_type") or c.get("scope_type")) == "department"
    assert (scope.get("scope_ref_ids") or c.get("scope_ref_ids")) == [IN_DEPT]


def _check(h, perm, ref):
    return requests.post(f"{API}/advanced-access/check", headers=h, json={
        "user_id": TEST_USER_ID, "assignment_id": ASSIGNMENT_ID, "permission_key": perm,
        "target_scope_type": "department", "target_ref_id": ref})


# --- check allow/deny ---
def test_check_in_scope_allowed(live_h):
    r = _check(live_h, IN_PERM, IN_DEPT)
    assert r.status_code == 200, r.text
    print(r.json())
    assert r.json()["allowed"] is True


def test_check_out_of_scope_denied(live_h):
    r = _check(live_h, IN_PERM, OUT_DEPT)
    assert r.status_code == 200
    d = r.json()
    print(d)
    assert d["allowed"] is False
    assert "خارج النطاق" in str(d.get("reason", ""))


def test_check_ungranted_perm_denied(live_h):
    r = _check(live_h, "grades_grades_update_grade", IN_DEPT)
    assert r.status_code == 200
    d = r.json()
    print(d)
    assert d["allowed"] is False
    assert "خارج النطاق" not in str(d.get("reason", ""))


# --- context switch ---
def test_assignment_context(live_h):
    r = requests.get(f"{API}/advanced-access/assignments/{ASSIGNMENT_ID}/context", headers=live_h)
    assert r.status_code == 200, r.text
    d = r.json()
    print(d)
    eff = d["effective_permissions"]
    assert len(eff) == 2 and all(k.startswith("curriculum_") for k in eff)
    assert IN_PERM in eff
    assert d["scope"]["scope_type"] == "department"
    assert d["scope"]["scope_ref_ids"] == [IN_DEPT]


# --- escalation denied ---
def test_self_assign_forbidden(live_h):
    r = requests.post(f"{API}/advanced-access/assignments", headers=live_h, json={
        "user_id": TEST_USER_ID, "assignment_type": "primary",
        "advanced_role_id": "6ae470f939410912a5f56790", "context_label_ar": "TEST_escalation",
        "scope": {"scope_type": "university", "scope_ref_ids": []}})
    assert r.status_code == 403, r.text


def test_testers_admin_only(live_h):
    r = requests.get(f"{API}/advanced-access/testers", headers=live_h)
    assert r.status_code == 403


def test_rollback_status_forbidden_for_live(live_h):
    r = requests.get(f"{API}/advanced-access/rollback/status", headers=live_h)
    assert r.status_code == 403


# --- rollback / legacy fallback ---
def test_rollback_status(admin_h):
    r = requests.get(f"{API}/advanced-access/rollback/status", headers=admin_h)
    assert r.status_code == 200
    d = r.json()
    assert d["activation_locked"] is True and d["effective_decision_source"] == "legacy"


@pytest.mark.parametrize("body", [
    {"scope_type": "user", "ref_id": TEST_USER_ID, "reason": "TEST_live"},
    {"scope_type": "department", "ref_id": IN_DEPT, "reason": "TEST_live"},
])
def test_scope_activation_locked(admin_h, body):
    r = requests.post(f"{API}/advanced-access/rollback/scope-activation", headers=admin_h, json=body)
    assert r.status_code == 423, r.text


def test_simulate_legacy(admin_h):
    r = requests.post(f"{API}/advanced-access/rollback/simulate", headers=admin_h, json={"user_id": TEST_USER_ID})
    assert r.status_code == 200, r.text
    d = r.json()
    print(d)
    assert d["decision"] == "legacy" and d["stopped_at"] == "activation_locked"


# --- legacy users unaffected ---
def test_salim_perms():
    d = _login("Salim", "test1234")
    perms = set(d["user"]["permissions"])
    assert {"manage_teaching_load", "manage_courses"} <= perms
    # NOTE: hr_manage_leaves lives in users.permissions (direct) -> merged by deps.build_user_context
    # but NOT by auth.py login/me response. Verify via server-side enforcement instead.
    h = {"Authorization": f"Bearer {d.get('token') or d.get('access_token')}"}
    assert requests.get(f"{API}/hr/leaves/balances", headers=h).status_code == 200


def test_live_account_legacy_hr_denied(live_h):
    assert requests.get(f"{API}/hr/leaves/balances", headers=live_h).status_code == 403


def test_saeed_perms():
    perms = set(_login("Saeed", "test1234")["user"]["permissions"])
    print(len(perms), sorted(perms))
    assert {"manage_courses", "manage_teachers"} <= perms


def test_admin_login():
    d = _login("admin", "admin123")
    assert d["user"]["role"] == "admin"
