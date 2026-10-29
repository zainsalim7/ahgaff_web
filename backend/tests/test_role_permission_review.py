# اختبار واجهات مراجعة الأدوار والصلاحيات الحساسة (Phase 7-B) — /api/advanced-access/review/*
import os
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
API = f"{BASE_URL}/api/advanced-access"

ROLE_NO_USERS = "legacy_698c93119a944c07ac7f80c4"  # مدير التسجيل (0 مستخدمين مرتبطين حاليًا)
ROLE_WITH_ADMIN = "legacy_698a4cffbc4813c8639d66d2"  # مدير النظام (admin ضمن linked_users)
SENSITIVE_PERM = "students_students_delete_student"  # critical


def _login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p})
    assert r.status_code == 200, f"login failed for {u}: {r.text}"
    d = r.json()
    return {"Authorization": f"Bearer {d['access_token']}"}, d["user"]


def _grant_saeed(admin_h, saeed_id):
    requests.post(f"{API}/testers", headers=admin_h, json={"user_id": saeed_id, "sub_permissions": ["view", "manage_role_review", "view_audit"]})


def _revoke_saeed(admin_h, saeed_id):
    requests.delete(f"{API}/testers/{saeed_id}", headers=admin_h)


def _reset_role(admin_h, role_key):
    requests.put(f"{API}/review/roles/{role_key}", headers=admin_h, json={"status": "not_reviewed"})
    # إعادة ضبط الاعتماد والموافقات مباشرة عبر قاعدة البيانات لضمان استقلالية الاختبار بين التشغيلات
    from pymongo import MongoClient
    import os as _os
    client = MongoClient(_os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = client[_os.environ.get("DB_NAME", "test_database")]
    db.advanced_role_reviews.update_one({"_id": role_key}, {"$set": {"approved": False, "approvals": []}})


def test_exact_counts_28_roles_and_sensitive_permissions():
    admin_h, _ = _login("admin", "admin123")
    roles = requests.get(f"{API}/review/roles", headers=admin_h).json()
    perms = requests.get(f"{API}/review/sensitive-permissions", headers=admin_h).json()
    assert len(roles) == 28
    # 122 بعد المرحلة 7-د: 1026 صلاحية فعلية (نمو حقيقي في الـ Endpoints منذ المرحلة 2، وليس 976) +
    # صلاحيتا الدرجات المُصحَّحتان فعليًا الآن إلى "عالية" (التصحيح وُثِّق نصًّا في 7-ب لكن لم يُطبَّق على
    # قاعدة البيانات حتى اكتُشفت الفجوة في 7-ج وطُبِّقت فعليًا هنا في 7-د كتصحيح دائم في مصدر التوليد)
    assert len(perms) == 122
    assert all(p["sensitivity"] in ("critical", "high") for p in perms)
    assert sum(1 for p in perms if p["category"] == "grades_results") == 5


def test_no_auto_approval_on_seed():
    admin_h, _ = _login("admin", "admin123")
    roles = requests.get(f"{API}/review/roles", headers=admin_h).json()
    perms = requests.get(f"{API}/review/sensitive-permissions", headers=admin_h).json()
    assert all(r["approved"] is False and r["status"] == "not_reviewed" for r in roles if r["key"] not in (ROLE_NO_USERS, ROLE_WITH_ADMIN))
    assert all(not p["allowed_role_keys"] for p in perms)  # لا منح تلقائي بناءً على تشابه الأسماء


def test_approval_requires_ready_for_approval_status(ctx_cleanup=None):
    admin_h, _ = _login("admin", "admin123")
    _reset_role(admin_h, ROLE_NO_USERS)
    r = requests.post(f"{API}/review/roles/{ROLE_NO_USERS}/approve", headers=admin_h, json={"reason": "محاولة مبكرة"})
    assert r.status_code == 400


def test_dual_approval_required_when_sensitive_permissions_linked():
    admin_h, admin_user = _login("admin", "admin123")
    saeed_h, saeed_user = _login("Saeed", "test1234")
    _grant_saeed(admin_h, saeed_user["id"])
    try:
        requests.put(f"{API}/review/roles/{ROLE_NO_USERS}", headers=admin_h, json={"status": "ready_for_approval"})
        r1 = requests.post(f"{API}/review/roles/{ROLE_NO_USERS}/approve", headers=admin_h, json={"reason": "مراجعة أولى"})
        assert r1.status_code == 200 and r1.json()["approved"] is False
        r2 = requests.post(f"{API}/review/roles/{ROLE_NO_USERS}/approve", headers=saeed_h, json={"reason": "مراجعة ثانية"})
        assert r2.status_code == 200 and r2.json()["approved"] is True
    finally:
        _revoke_saeed(admin_h, saeed_user["id"])
        _reset_role(admin_h, ROLE_NO_USERS)


def test_self_approval_blocked():
    admin_h, _ = _login("admin", "admin123")
    requests.put(f"{API}/review/roles/{ROLE_WITH_ADMIN}", headers=admin_h, json={"status": "ready_for_approval"})
    r = requests.post(f"{API}/review/roles/{ROLE_WITH_ADMIN}/approve", headers=admin_h, json={"reason": "محاولة اعتماد الذات"})
    assert r.status_code == 403
    _reset_role(admin_h, ROLE_WITH_ADMIN)


def test_non_authorized_user_cannot_update_review():
    teacher_h, _ = _login("teacher180156", "teacher123")
    r = requests.put(f"{API}/review/sensitive-permissions/{SENSITIVE_PERM}", headers=teacher_h, json={"status": "in_review"})
    assert r.status_code == 403


def test_excess_and_missing_coverage_fields_present():
    admin_h, _ = _login("admin", "admin123")
    roles = requests.get(f"{API}/review/roles", headers=admin_h).json()
    assert any(r["excess_flags_count"] > 0 for r in roles)
    assert any(r["missing_coverage_count"] > 0 for r in roles)


def test_legacy_login_and_permissions_unaffected():
    h, user = _login("admin", "admin123")
    assert user.get("role") == "admin"
    r = requests.get(f"{BASE_URL}/api/users", headers=h)
    assert r.status_code == 200


def test_permission_decision_updates_completion_and_is_not_auto_approval():
    admin_h, _ = _login("admin", "admin123")
    role = requests.get(f"{API}/review/roles/{ROLE_WITH_ADMIN}", headers=admin_h).json()
    some_key = next(iter(role["permission_decisions"].keys()))
    r = requests.post(f"{API}/review/roles/{ROLE_WITH_ADMIN}/permissions/{some_key}/decision", headers=admin_h, json={"decision": "approved", "note": "اختبار آلي"})
    assert r.status_code == 200
    updated = r.json()
    assert updated["permission_decisions"][some_key]["decision"] == "approved"
    assert updated["completion_percentage"] > 0
    assert updated["approved"] is False  # قرار بصلاحية واحدة لا يعني اعتماد الدور كله
    # إعادة الضبط
    requests.post(f"{API}/review/roles/{ROLE_WITH_ADMIN}/permissions/{some_key}/decision", headers=admin_h, json={"decision": "pending"})


def test_candidate_role_keys_are_suggestions_not_auto_granted():
    admin_h, _ = _login("admin", "admin123")
    perms = requests.get(f"{API}/review/sensitive-permissions", headers=admin_h).json()
    for p in perms:
        assert p["allowed_role_keys"] == []  # لا منح تلقائي حتى لو وُجدت أدوار مرشَّحة
        assert isinstance(p["candidate_role_keys"], list)
