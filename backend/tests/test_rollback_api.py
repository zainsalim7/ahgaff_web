# اختبار واجهات API لمنظومة التحكم والتراجع الآمن (Phase 6B) — /api/advanced-access/rollback/*
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
    admin_h, admin_user = _login("admin", "admin123")
    saeed_h, saeed_user = _login("Saeed", "test1234")
    # الأدمن يمنح Saeed صلاحية manage_rollback فرعية مؤقتًا لاختبار التفويض غير الأدمن، ثم يسحبها
    requests.post(f"{API}/testers", headers=admin_h, json={"user_id": saeed_user["id"], "sub_permissions": ["view", "manage_rollback", "view_audit", "run_tests"]})
    yield {"admin": admin_h, "saeed": saeed_h, "saeed_user": saeed_user}
    requests.delete(f"{API}/testers/{saeed_user['id']}", headers=admin_h)
    # إعادة ضبط المفتاح المركزي لحالته الافتراضية بعد الاختبارات
    requests.put(f"{API}/rollback/master", headers=admin_h, json={"enabled": False, "reason": "إعادة ضبط بعد الاختبار الآلي"})


def test_status_reports_legacy_as_effective_source(ctx):
    r = requests.get(f"{API}/rollback/status", headers=ctx["admin"])
    assert r.status_code == 200
    d = r.json()
    assert d["activation_locked"] is True
    assert d["effective_decision_source"] == "legacy"
    assert d["scoped_activations"] == []


def test_master_flag_requires_reason(ctx):
    r = requests.put(f"{API}/rollback/master", headers=ctx["admin"], json={"enabled": True, "reason": ""})
    assert r.status_code == 400


def test_master_flag_toggle_by_authorized_tester_still_locked(ctx):
    r = requests.put(f"{API}/rollback/master", headers=ctx["saeed"], json={"enabled": True, "reason": "اختبار آلي Phase 6B"})
    assert r.status_code == 200
    body = r.json()
    assert body["activation_locked"] is True
    status = requests.get(f"{API}/rollback/status", headers=ctx["admin"]).json()
    assert status["master_enabled"] is True
    assert status["effective_decision_source"] == "legacy"  # حتى بعد التفعيل، المصدر الفعلي يبقى legacy


def test_non_authorized_user_cannot_toggle_master_flag():
    teacher_h, _ = _login("teacher180156", "teacher123")
    r = requests.put(f"{API}/rollback/master", headers=teacher_h, json={"enabled": True, "reason": "محاولة غير مصرَّحة"})
    assert r.status_code == 403


def test_scope_activation_always_rejected_423(ctx):
    r = requests.post(f"{API}/rollback/scope-activation", headers=ctx["admin"], json={"scope_type": "user", "ref_id": "x", "reason": "اختبار"})
    assert r.status_code == 423
    status = requests.get(f"{API}/rollback/status", headers=ctx["admin"]).json()
    assert status["scoped_activations"] == []


def test_audit_log_records_actions_without_secrets(ctx):
    r = requests.get(f"{API}/rollback/audit", headers=ctx["admin"])
    assert r.status_code == 200
    logs = r.json()
    actions = [l["action"] for l in logs]
    assert "master_flag_updated" in actions
    assert "scope_activation_attempt_rejected" in actions
    dump = str(logs)
    assert "ADV_ACCESS_EMERGENCY_KILL_SWITCH" not in dump
    assert os.environ.get("SECRET_KEY", "zzz_should_not_appear") not in dump


def test_simulate_always_returns_legacy(ctx):
    r = requests.post(f"{API}/rollback/simulate", headers=ctx["admin"], json={"user_id": "any"})
    assert r.status_code == 200
    d = r.json()
    assert d["decision"] == "legacy"
    assert d["stopped_at"] == "activation_locked"


def test_legacy_login_and_permissions_unaffected():
    """تراجع سريع: تسجيل الدخول وصلاحيات النظام القديم للأدمن لم تتأثرا بأي شيء من هذه المنظومة"""
    h, user = _login("admin", "admin123")
    assert user.get("role") == "admin"
    r = requests.get(f"{BASE_URL}/api/users", headers=h)
    assert r.status_code == 200
