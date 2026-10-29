# Advanced Access (SHADOW MODE) - isolation / privilege-escalation checks for testers
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
API = f"{BASE_URL}/api/advanced-access"


def _login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        pytest.skip(f"login failed for {u}")
    d = r.json()
    return {"Authorization": f"Bearer {d.get('access_token') or d.get('token')}"}, d.get("user", {})


@pytest.fixture(scope="module")
def ctx():
    admin_h, _ = _login("admin", "admin123")
    saeed_h, _ = _login("Saeed", "test1234")
    salim_h, _ = _login("Salim", "test1234")
    users = requests.get(f"{API}/users", headers=admin_h)
    if users.status_code != 200:
        # fallback: find ids through assignments/testers
        users = None
    roles = requests.get(f"{API}/roles", headers=admin_h).json()
    admin_role = next((r for r in roles if 'مدير النظام' in (r.get('name_ar') or '')), roles[0])
    created = []
    yield {"admin": admin_h, "saeed": saeed_h, "salim": salim_h, "users": users.json() if users else [], "admin_role": admin_role, "created": created}
    for aid in created:
        requests.post(f"{API}/assignments/{aid}/end", headers=admin_h)


def _uid(ctx, username):
    for u in ctx["users"]:
        if u.get("username") == username:
            return u["id"]
    pytest.skip(f"cannot resolve id for {username}")


def test_me_access_values(ctx):
    a = requests.get(f"{API}/me/access", headers=ctx["admin"]).json()
    s = requests.get(f"{API}/me/access", headers=ctx["saeed"]).json()
    m = requests.get(f"{API}/me/access", headers=ctx["salim"]).json()
    assert a["is_admin"] and a["has_access"]
    assert s["has_access"] and "context_switch" in s["sub_permissions"] and not s["is_admin"]
    assert m["has_access"] is False and m["sub_permissions"] == []


def test_salim_blocked_from_adv_endpoints(ctx):
    for path in ["/me/contexts", "/permissions", "/roles", "/assignments", "/testers"]:
        r = requests.get(f"{API}{path}", headers=ctx["salim"])
        assert r.status_code == 403, f"{path} -> {r.status_code}"


def test_saeed_cannot_manage_testers(ctx):
    assert requests.get(f"{API}/testers", headers=ctx["saeed"]).status_code == 403
    r = requests.post(f"{API}/testers", headers=ctx["saeed"], json={"user_id": "698f79d75c5620a4449eeb89", "sub_permissions": ["manage_permissions"]})
    assert r.status_code == 403


def test_tester_can_view_other_users_context_IDOR(ctx):
    """Tester with ONLY context_switch (no run_tests) should NOT be able to read another user's assignment context"""
    salim_id = _uid(ctx, "Salim")
    teacher_id = _uid(ctx, "teacher180156")
    r = requests.post(f"{API}/assignments", headers=ctx["admin"], json={
        "user_id": salim_id, "assignment_type": "academic", "advanced_role_id": ctx["admin_role"]["id"],
        "context_label_ar": "TEST_isolation_salim", "scope": {"scope_type": "faculty", "scope_ref_ids": []}})
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    ctx["created"].append(aid)
    grant = requests.post(f"{API}/testers", headers=ctx["admin"], json={"user_id": teacher_id, "sub_permissions": ["context_switch"]})
    assert grant.status_code == 200, grant.text
    teacher_h, _ = _login("teacher180156", "teacher123")
    try:
        r2 = requests.get(f"{API}/assignments/{aid}/context", headers=teacher_h)
        print("Context-switch-only tester GET other user's context ->", r2.status_code)
        assert r2.status_code == 403, f"IDOR: read another user's assignment context ({r2.status_code})"
    finally:
        requests.delete(f"{API}/testers/{teacher_id}", headers=ctx["admin"])


def test_tester_self_escalation_via_assignment(ctx):
    """Non-admin tester with manage_assignments should NOT assign himself the imported admin role"""
    saeed_id = _uid(ctx, "Saeed")
    r = requests.post(f"{API}/assignments", headers=ctx["saeed"], json={
        "user_id": saeed_id, "assignment_type": "administrative", "advanced_role_id": ctx["admin_role"]["id"],
        "context_label_ar": "TEST_self_escalation", "scope": {"scope_type": "university", "scope_ref_ids": []}})
    print("Saeed self-assign admin role ->", r.status_code, r.text[:200])
    if r.status_code == 200:
        ctx["created"].append(r.json()["id"])
    assert r.status_code in (400, 403), "Tester could self-assign imported admin role (privilege escalation in shadow system)"
