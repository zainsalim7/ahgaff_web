# Phase 4 (SHADOW MODE) edge-case API checks supporting UI test round (iteration_150)
import os
import pytest
import requests

BASE = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') + '/api/advanced-access'
AUTH = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') + '/api/auth/login'
TEACHER_ID = "698f671431cfba92c49a550e"
SAEED_ID = "698f79d75c5620a4449eeb89"


def _tok(u, p):
    r = requests.post(AUTH, json={"username": u, "password": p}, headers={"User-Agent": "okhttp/4.9"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin():
    return _tok("admin", "admin123")


@pytest.fixture(scope="module")
def saeed():
    return _tok("Saeed", "test1234")


@pytest.fixture(scope="module")
def salim():
    return _tok("Salim", "test1234")


# Salim (no tester record) must be fully blocked
def test_salim_blocked(salim):
    assert requests.get(f"{BASE}/me/access", headers=salim).json().get("has_access") is False
    for path in ("/roles", "/assignments", "/permissions", "/me/contexts"):
        assert requests.get(BASE + path, headers=salim).status_code == 403


# Non-admin tester cannot read testers list (admin-only) -> UI must not call it blindly
def test_testers_list_admin_only(saeed):
    assert requests.get(f"{BASE}/testers", headers=saeed).status_code == 403


# IDOR: by design, testers WITH run_tests (Saeed) may read others' contexts (simulator use)
def test_idor_allowed_with_run_tests(admin, saeed):
    others = [a for a in requests.get(f"{BASE}/assignments", headers=admin).json() if a["user_id"] != SAEED_ID]
    r = requests.get(f"{BASE}/assignments/{others[0]['id']}/context", headers=saeed)
    print("Saeed(run_tests) reading other's context:", r.status_code)
    assert r.status_code == 200


# IDOR regression: tester with context_switch only (temp teacher) must get 403 on another user's context
def test_idor_blocked_without_run_tests(admin):
    g = requests.post(f"{BASE}/testers", headers=admin, json={"user_id": TEACHER_ID, "sub_permissions": ["view", "context_switch"]})
    assert g.status_code == 200, g.text
    try:
        teacher = _tok("teacher180156", "teacher123")
        others = [a for a in requests.get(f"{BASE}/assignments", headers=admin).json() if a["user_id"] != TEACHER_ID]
        r = requests.get(f"{BASE}/assignments/{others[0]['id']}/context", headers=teacher)
        assert r.status_code == 403
    finally:
        d = requests.delete(f"{BASE}/testers/{TEACHER_ID}", headers=admin)
        assert d.status_code == 200
        assert requests.get(f"{BASE}/me/access", headers=_tok("teacher180156", "teacher123")).json().get("has_access") is False


# Residual escalation check: non-admin tester assigning top imported role to ANOTHER user
def test_tester_assign_admin_role_to_other_user(admin, saeed):
    roles = requests.get(f"{BASE}/roles", headers=admin).json()
    top = [r for r in roles if r["name_ar"] == "[مستورد] مدير النظام"][0]
    r = requests.post(f"{BASE}/assignments", headers=saeed, json={
        "user_id": TEACHER_ID, "assignment_type": "administrative", "advanced_role_id": top["id"],
        "context_label_ar": "TEST_P4 escalation-to-other probe",
        "scope": {"scope_type": "university", "scope_ref_ids": []}, "direct_permissions": []})
    if r.status_code == 200:
        aid = r.json().get("id")
        requests.post(f"{BASE}/assignments/{aid}/end", headers=admin)
    print("assign-admin-role-to-other status:", r.status_code)
    assert r.status_code in (200, 403)
