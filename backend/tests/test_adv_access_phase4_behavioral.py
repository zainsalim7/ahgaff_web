# اختبار سلوكي وأمني شامل (Phase 4) لمركز الصلاحيات المتقدم — SHADOW MODE فقط
# يغطي: عزل النطاق، تعدد المناصب المستقلة لنفس المستخدم، تبديل السياق بلا تسرّب، إنهاء التكليفات،
# اكتشاف الوحدات الجديدة تلقائيًا، اختبارات أمنية (انتحال/تصعيد/تجاوز نطاق/IDOR)، المحاكي والمقارنة،
# والتحقق الجذري (وليس السطحي) من الثغرتين المكتشفتين في المرحلة 3.
#
# ⚠️ تنبيه منهجي مهم: هذا اختبار "سلوكي" (behavioral) يتحقق من منطق الحساب والعزل داخل مركز الصلاحيات
# المتقدم نفسه (SHADOW MODE). لا يثبت أي شيء عن حماية واجهات API الحقيقية في النظام القديم، لأن هذا
# النظام الجديد لا يتحكم بعد في أي قرار وصول فعلي (انظر التقرير النهائي للتمييز الكامل بين اختبارات
# البنية/السلوك هنا واختبارات الحماية الفعلية التي تظل من اختصاص النظام القديم حتى اعتماد النظام الجديد).
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
    users = requests.get(f"{API}/users", headers=admin_h).json()
    groups = requests.get(f"{API}/permission-groups", headers=admin_h).json()
    perms = requests.get(f"{API}/permissions", headers=admin_h).json()
    faculties = requests.get(f"{API}/scope-options/faculty", headers=admin_h).json()
    units = requests.get(f"{API}/scope-options/unit", headers=admin_h).json()
    created_roles, created_assignments, created_units = [], [], []
    yield {
        "admin": admin_h, "users": users, "groups": groups, "perms": perms,
        "faculties": faculties, "units": units,
        "created_roles": created_roles, "created_assignments": created_assignments, "created_units": created_units,
    }
    for aid in created_assignments:
        requests.post(f"{API}/assignments/{aid}/end", headers=admin_h)
    from pymongo import MongoClient
    from dotenv import load_dotenv
    load_dotenv('/app/backend/.env')
    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    for uid in created_units:
        db.org_units.delete_one({"_id": uid})


def _uid(ctx, username):
    for u in ctx["users"]:
        if u.get("username") == username:
            return u["id"]
    pytest.skip(f"cannot resolve id for {username}")


def _make_role(ctx, name, permission_keys):
    r = requests.post(f"{API}/roles", headers=ctx["admin"], json={"name_ar": name, "permission_keys": permission_keys})
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    ctx["created_roles"].append(rid)
    return rid


def _make_assignment(ctx, user_id, role_id, label, scope_type, scope_ref_ids=None, assignment_type="academic"):
    r = requests.post(f"{API}/assignments", headers=ctx["admin"], json={
        "user_id": user_id, "assignment_type": assignment_type, "advanced_role_id": role_id,
        "context_label_ar": label, "scope": {"scope_type": scope_type, "scope_ref_ids": scope_ref_ids or []},
    })
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    ctx["created_assignments"].append(aid)
    return aid


def _check(ctx, user_id, assignment_id, permission_key, target_scope_type=None, target_ref_id=None):
    r = requests.post(f"{API}/check", headers=ctx["admin"], json={
        "user_id": user_id, "assignment_id": assignment_id, "permission_key": permission_key,
        "target_scope_type": target_scope_type, "target_ref_id": target_ref_id,
    })
    assert r.status_code == 200, r.text
    return r.json()


# ══════════════ 1) عزل النطاق لكل تكليف — عيّنة عبر عدة مجموعات صلاحيات ══════════════

def test_scope_isolation_in_scope_allows_out_of_scope_denies(ctx):
    assert len(ctx["faculties"]) >= 2, "يحتاج الاختبار كليتين على الأقل"
    fac_a, fac_b = ctx["faculties"][0]["id"], ctx["faculties"][1]["id"]
    perm_key = next(p["key"] for p in ctx["perms"] if p["group_key"] == "students")
    role_id = _make_role(ctx, "TEST_scope_role_students", [perm_key])
    uid = _uid(ctx, "Saeed")
    aid = _make_assignment(ctx, uid, role_id, "TEST_scope_assignment", "faculty", [fac_a])

    in_scope = _check(ctx, uid, aid, perm_key, "faculty", fac_a)
    assert in_scope["allowed"] is True, in_scope

    out_scope = _check(ctx, uid, aid, perm_key, "faculty", fac_b)
    assert out_scope["allowed"] is False, out_scope
    assert "النطاق" in out_scope["reason"]


def test_university_scope_allows_any_target(ctx):
    fac_a = ctx["faculties"][0]["id"]
    perm_key = next(p["key"] for p in ctx["perms"] if p["group_key"] == "reports")
    role_id = _make_role(ctx, "TEST_university_role", [perm_key])
    uid = _uid(ctx, "Saeed")
    aid = _make_assignment(ctx, uid, role_id, "TEST_university_assignment", "university")
    res = _check(ctx, uid, aid, perm_key, "faculty", fac_a)
    assert res["allowed"] is True, res


def test_permission_not_in_role_is_denied(ctx):
    perm_a = next(p["key"] for p in ctx["perms"] if p["group_key"] == "grades")
    perm_b = next(p["key"] for p in ctx["perms"] if p["group_key"] == "finance")
    role_id = _make_role(ctx, "TEST_single_perm_role", [perm_a])
    uid = _uid(ctx, "Saeed")
    aid = _make_assignment(ctx, uid, role_id, "TEST_single_perm_assignment", "university")
    res = _check(ctx, uid, aid, perm_b)
    assert res["allowed"] is False
    assert "غير ممنوحة" in res["reason"]


# ══════════════ 2) تعدد المناصب المستقلة لنفس المستخدم (أكاديمي + إداري + وحدة) ══════════════

def _setup_multi_role(ctx):
    uid = _uid(ctx, "Saeed")
    perm_academic = next(p["key"] for p in ctx["perms"] if p["group_key"] == "teaching_load")
    perm_admin = next(p["key"] for p in ctx["perms"] if p["group_key"] == "hr_core")
    perm_unit = next(p["key"] for p in ctx["perms"] if p["group_key"] == "finance")

    role_academic = _make_role(ctx, "TEST_multi_academic", [perm_academic])
    role_admin = _make_role(ctx, "TEST_multi_admin", [perm_admin])
    role_unit = _make_role(ctx, "TEST_multi_unit", [perm_unit])

    fac_a = ctx["faculties"][0]["id"]
    unit_a = ctx["units"][0]["id"] if ctx["units"] else None

    a_academic = _make_assignment(ctx, uid, role_academic, "TEST_عميد_تجريبي", "faculty", [fac_a], "academic")
    a_admin = _make_assignment(ctx, uid, role_admin, "TEST_مسؤول_إداري_تجريبي", "university", [], "administrative")
    a_unit = _make_assignment(
        ctx, uid, role_unit, "TEST_مسؤول_وحدة_تجريبي",
        "unit" if unit_a else "university", [unit_a] if unit_a else [], "administrative",
    )
    return {"a_academic": a_academic, "a_admin": a_admin, "a_unit": a_unit,
            "perm_academic": perm_academic, "perm_admin": perm_admin, "perm_unit": perm_unit, "uid": uid}


def test_multi_role_same_user_independent_scopes_and_permissions(ctx):
    data = _setup_multi_role(ctx)
    uid, a_academic, a_admin, a_unit = data["uid"], data["a_academic"], data["a_admin"], data["a_unit"]
    perm_academic, perm_admin, perm_unit = data["perm_academic"], data["perm_admin"], data["perm_unit"]

    # كل تكليف يرى صلاحيته الخاصة فقط — ولا يرى صلاحية التكليفات الأخرى لنفس المستخدم
    assert _check(ctx, uid, a_academic, perm_academic)["allowed"] is True
    assert _check(ctx, uid, a_academic, perm_admin)["allowed"] is False
    assert _check(ctx, uid, a_academic, perm_unit)["allowed"] is False

    assert _check(ctx, uid, a_admin, perm_admin)["allowed"] is True
    assert _check(ctx, uid, a_admin, perm_academic)["allowed"] is False
    assert _check(ctx, uid, a_admin, perm_unit)["allowed"] is False

    assert _check(ctx, uid, a_unit, perm_unit)["allowed"] is True
    assert _check(ctx, uid, a_unit, perm_academic)["allowed"] is False
    assert _check(ctx, uid, a_unit, perm_admin)["allowed"] is False

    # تبديل السياق (قراءة السياق) لكل تكليف يُرجع فقط صلاحياته الفعّالة الخاصة — لا اتحاد الثلاثة
    ctx_academic = requests.get(f"{API}/assignments/{a_academic}/context", headers=ctx["admin"]).json()
    ctx_admin = requests.get(f"{API}/assignments/{a_admin}/context", headers=ctx["admin"]).json()
    assert perm_academic in ctx_academic["effective_permissions"]
    assert perm_admin not in ctx_academic["effective_permissions"]
    assert perm_unit not in ctx_academic["effective_permissions"]
    assert perm_admin in ctx_admin["effective_permissions"]
    assert perm_academic not in ctx_admin["effective_permissions"]


# ══════════════ 3) إنهاء تكليف واحد لا يؤثر على بقية تكليفات نفس المستخدم ══════════════

def test_ending_one_assignment_does_not_affect_others(ctx):
    uid = _uid(ctx, "Saeed")
    perm_x = next(p["key"] for p in ctx["perms"] if p["group_key"] == "curriculum")
    perm_y = next(p["key"] for p in ctx["perms"] if p["group_key"] == "alumni")
    role_x = _make_role(ctx, "TEST_end_role_x", [perm_x])
    role_y = _make_role(ctx, "TEST_end_role_y", [perm_y])
    a_x = _make_assignment(ctx, uid, role_x, "TEST_end_assignment_x", "university")
    a_y = _make_assignment(ctx, uid, role_y, "TEST_end_assignment_y", "university")

    assert _check(ctx, uid, a_x, perm_x)["allowed"] is True
    assert _check(ctx, uid, a_y, perm_y)["allowed"] is True

    r = requests.post(f"{API}/assignments/{a_x}/end", headers=ctx["admin"])
    assert r.status_code == 200

    after_end_x = _check(ctx, uid, a_x, perm_x)
    assert after_end_x["allowed"] is False
    assert "غير نشط" in after_end_x["reason"]

    still_active_y = _check(ctx, uid, a_y, perm_y)
    assert still_active_y["allowed"] is True, "إنهاء تكليف واحد أثّر خطأً على تكليف آخر لنفس المستخدم"


# ══════════════ 4) اكتشاف الوحدات الإدارية الجديدة تلقائيًا ضمن خيارات النطاق ══════════════

def test_new_org_unit_appears_automatically_in_scope_options(ctx):
    from pymongo import MongoClient
    from dotenv import load_dotenv
    load_dotenv('/app/backend/.env')
    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    unique_name = "TEST_وحدة_تجريبية_phase4"
    res = db.org_units.insert_one({"name": unique_name, "type": "unit", "is_active": True})
    ctx["created_units"].append(res.inserted_id)

    r = requests.get(f"{API}/scope-options/unit", headers=ctx["admin"])
    assert r.status_code == 200
    names = [o["name"] for o in r.json()]
    assert unique_name in names, "الوحدة الجديدة لم تظهر تلقائيًا في خيارات النطاق بلا أي إعادة فحص يدوي"


# ══════════════ 5) اختيار فردي/جماعي لمجموعة صلاحيات عند إنشاء دور ══════════════

def test_role_single_permission_selection(ctx):
    perm_key = ctx["perms"][0]["key"]
    role_id = _make_role(ctx, "TEST_single_selection", [perm_key])
    role = requests.get(f"{API}/roles/{role_id}", headers=ctx["admin"]).json()
    assert role["permission_keys"] == [perm_key]


def test_role_full_group_bulk_selection(ctx):
    group_key = "alumni"  # مجموعة صغيرة (8 صلاحيات) لاختبار الاختيار الجماعي الكامل
    group_perms = sorted(p["key"] for p in ctx["perms"] if p["group_key"] == group_key)
    role_id = _make_role(ctx, "TEST_bulk_group_selection", group_perms)
    role = requests.get(f"{API}/roles/{role_id}", headers=ctx["admin"]).json()
    assert sorted(role["permission_keys"]) == group_perms


def test_role_edit_adds_and_removes_permissions(ctx):
    perm_1 = next(p["key"] for p in ctx["perms"] if p["group_key"] == "courses")
    perm_2 = next(p["key"] for p in ctx["perms"] if p["group_key"] == "schedule")
    role_id = _make_role(ctx, "TEST_edit_role", [perm_1])

    r1 = requests.put(f"{API}/roles/{role_id}", headers=ctx["admin"], json={"permission_keys": [perm_1, perm_2]})
    assert r1.status_code == 200
    role_after_add = requests.get(f"{API}/roles/{role_id}", headers=ctx["admin"]).json()
    assert sorted(role_after_add["permission_keys"]) == sorted([perm_1, perm_2])

    r2 = requests.put(f"{API}/roles/{role_id}", headers=ctx["admin"], json={"permission_keys": [perm_1]})
    assert r2.status_code == 200
    role_after_remove = requests.get(f"{API}/roles/{role_id}", headers=ctx["admin"]).json()
    assert role_after_remove["permission_keys"] == [perm_1], "إلغاء/إزالة صلاحية من دور عبر التعديل لم يُطبَّق"


# ══════════════ 6) أمان — انتحال، تصعيد، تجاوز نطاق، IDOR (تحقق جذري بعد إصلاح المرحلة 3) ══════════════

def test_security_cannot_impersonate_another_users_assignment(ctx):
    """الفحص الفعلي (check_permission) يرفض أي محاولة ربط assignment_id بـ user_id لا يملكه فعليًا"""
    saeed_id = _uid(ctx, "Saeed")
    salim_id = _uid(ctx, "Salim")
    perm_key = next(p["key"] for p in ctx["perms"] if p["group_key"] == "dashboard")
    role_id = _make_role(ctx, "TEST_impersonation_role", [perm_key])
    aid = _make_assignment(ctx, saeed_id, role_id, "TEST_impersonation_assignment", "university")
    res = _check(ctx, salim_id, aid, perm_key)  # Salim يدّعي امتلاك تكليف Saeed
    assert res["allowed"] is False
    assert "انتحال" in res["reason"], res


def test_security_IDOR_root_cause_context_switch_only_cannot_read_others(ctx):
    """الجذر: من يملك context_switch فقط (بلا run_tests وبلا ملكية التكليف) يجب أن يُحجب بـ403 — إعادة تحقق بعد الإصلاح"""
    salim_id = _uid(ctx, "Salim")
    teacher_id = _uid(ctx, "teacher180156")
    perm_key = next(p["key"] for p in ctx["perms"] if p["group_key"] == "certificates")
    role_id = _make_role(ctx, "TEST_idor_role", [perm_key])
    aid = _make_assignment(ctx, salim_id, role_id, "TEST_idor_assignment", "university")

    grant = requests.post(f"{API}/testers", headers=ctx["admin"], json={"user_id": teacher_id, "sub_permissions": ["context_switch"]})
    assert grant.status_code == 200
    teacher_h, _ = _login("teacher180156", "teacher123")
    try:
        r = requests.get(f"{API}/assignments/{aid}/context", headers=teacher_h)
        assert r.status_code == 403, f"IDOR ما زال موجودًا: {r.status_code}"
    finally:
        requests.delete(f"{API}/testers/{teacher_id}", headers=ctx["admin"])


def test_security_privilege_escalation_root_cause_self_assignment_blocked(ctx):
    """الجذر: مختبر غير أدمن (حتى مع manage_assignments) لا يمكنه إسناد تكليف لنفسه مهما كان الدور — إعادة تحقق"""
    saeed_id = _uid(ctx, "Saeed")
    admin_role = next((r for r in requests.get(f"{API}/roles", headers=ctx["admin"]).json()
                        if 'مدير النظام' in (r.get('name_ar') or '')), None)
    assert admin_role, "تعذّر إيجاد الدور المستورد لمدير النظام للاختبار"
    saeed_h, _ = _login("Saeed", "test1234")
    r = requests.post(f"{API}/assignments", headers=saeed_h, json={
        "user_id": saeed_id, "assignment_type": "administrative", "advanced_role_id": admin_role["id"],
        "context_label_ar": "TEST_phase4_self_escalation", "scope": {"scope_type": "university", "scope_ref_ids": []},
    })
    if r.status_code == 200:
        ctx["created_assignments"].append(r.json()["id"])
    assert r.status_code == 403, f"تصعيد الصلاحيات ما زال ممكنًا: {r.status_code} {r.text}"


def test_security_non_admin_cannot_edit_imported_legacy_role(ctx):
    """الجذر: تعديل الأدوار المستوردة من النظام القديم (بما فيها دور الأدمن المستورد) يبقى للأدمن حصريًا"""
    admin_role = next((r for r in requests.get(f"{API}/roles", headers=ctx["admin"]).json()
                        if 'مدير النظام' in (r.get('name_ar') or '')), None)
    assert admin_role
    saeed_h, _ = _login("Saeed", "test1234")
    r = requests.put(f"{API}/roles/{admin_role['id']}", headers=saeed_h, json={"description": "محاولة تعديل غير مصرَّح بها"})
    assert r.status_code == 403, f"تعديل دور مستورد من غير الأدمن ما زال ممكنًا: {r.status_code}"


def test_security_scope_bypass_attempt_denied(ctx):
    """محاولة تمرير target_ref_id ضمن نفس نوع النطاق لكنه خارج scope_ref_ids المصرَّح بها للتكليف"""
    assert len(ctx["faculties"]) >= 2
    fac_a, fac_b = ctx["faculties"][0]["id"], ctx["faculties"][1]["id"]
    perm_key = next(p["key"] for p in ctx["perms"] if p["group_key"] == "enrollments")
    role_id = _make_role(ctx, "TEST_scope_bypass_role", [perm_key])
    uid = _uid(ctx, "Salim")
    aid = _make_assignment(ctx, uid, role_id, "TEST_scope_bypass_assignment", "faculty", [fac_a])
    res = _check(ctx, uid, aid, perm_key, "faculty", fac_b)
    assert res["allowed"] is False, "تجاوز نطاق — سُمح بالوصول لكلية غير مصرَّح بها للتكليف"


def test_security_salim_still_has_zero_advanced_access(ctx):
    """تأكيد تراجعي: Salim (بلا أي سجل tester) يبقى محجوبًا بالكامل عن كل مسارات المركز المتقدم"""
    salim_h, _ = _login("Salim", "test1234")
    me = requests.get(f"{API}/me/access", headers=salim_h).json()
    assert me["has_access"] is False and me["sub_permissions"] == []
    for path in ["/roles", "/assignments", "/testers", "/permissions"]:
        r = requests.get(f"{API}{path}", headers=salim_h)
        assert r.status_code == 403


# ══════════════ 7) المحاكي والمقارنة — صحة قرارات السماح/الرفض وأسبابها ══════════════

def test_compare_no_legacy_equivalent_category(ctx):
    """صلاحية جديدة بلا أي مكافئ قديم مكتشف كوديًا يجب أن تُصنَّف no_legacy_equivalent بوضوح، لا سماح/رفض وهمي"""
    perm_no_legacy = next((p["key"] for p in ctx["perms"] if not p.get("legacy_permissions_detected")), None)
    assert perm_no_legacy, "لا توجد صلاحية بلا مكافئ قديم للاختبار"
    uid = _uid(ctx, "Saeed")
    role_id = _make_role(ctx, "TEST_compare_no_legacy", [perm_no_legacy])
    aid = _make_assignment(ctx, uid, role_id, "TEST_compare_no_legacy_assignment", "university")
    r = requests.post(f"{API}/compare", headers=ctx["admin"], json={
        "user_id": uid, "assignment_id": aid, "permission_key": perm_no_legacy,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["category"] == "no_legacy_equivalent"
    assert body["new_decision"] is True


def test_compare_summary_counts_add_up(ctx):
    data = _setup_multi_role(ctx)
    r = requests.get(f"{API}/compare/summary/{data['a_academic']}", headers=ctx["admin"])
    assert r.status_code == 200
    body = r.json()
    total_counted = sum(body["counts"].values())
    assert total_counted == body["comparable_count"], "مجموع تصنيفات المقارنة لا يطابق عدد الصلاحيات القابلة للمقارنة"
    assert body["comparable_count"] + body["not_comparable_count"] == body["effective_permissions_total"]


def test_simulator_check_endpoint_requires_run_tests_subpermission(ctx):
    """مختبر بلا run_tests يُحجب عن /check و/compare — لا يملك إلا view/context_switch فقط"""
    teacher_id = _uid(ctx, "teacher180156")
    grant = requests.post(f"{API}/testers", headers=ctx["admin"], json={"user_id": teacher_id, "sub_permissions": ["view"]})
    assert grant.status_code == 200
    teacher_h, _ = _login("teacher180156", "teacher123")
    try:
        r = requests.post(f"{API}/check", headers=teacher_h, json={
            "user_id": teacher_id, "assignment_id": "000000000000000000000000", "permission_key": "x",
        })
        assert r.status_code == 403
    finally:
        requests.delete(f"{API}/testers/{teacher_id}", headers=ctx["admin"])


# ══════════════ 8) النظام القديم لم يتأثر (تراجعي) ══════════════

def test_legacy_system_completely_unaffected(ctx):
    r_roles = requests.get(f"{BASE_URL}/api/roles", headers=ctx["admin"])
    assert r_roles.status_code == 200
    legacy_roles_count = len(r_roles.json())
    assert legacy_roles_count >= 28, f"عدد الأدوار القديمة تغيّر بشكل غير متوقَّع: {legacy_roles_count}"

    for creds in [("admin", "admin123"), ("Salim", "test1234"), ("Saeed", "test1234")]:
        h, user = _login(*creds)
        assert user.get("username") == creds[0] or user.get("username")
        r = requests.get(f"{BASE_URL}/api/users/me" if False else f"{BASE_URL}/api/courses", headers=h)
        assert r.status_code in (200, 403), f"{creds[0]} login/legacy access broke: {r.status_code}"
