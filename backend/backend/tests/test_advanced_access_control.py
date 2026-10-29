"""
اختبارات المرحلة 2 — مركز الصلاحيات المتقدم (Advanced Access Control, SHADOW MODE)
تغطي: بوابة الوصول التجريبي، تعدد المناصب، عزل النطاقات، تبديل السياق، انتهاء التكليفات،
منع تصعيد الصلاحيات، سجل التدقيق، وعدم تأثر النظام القديم إطلاقًا.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://schedule-hub-272.preview.emergentagent.com').rstrip('/')

ADMIN = {"username": "admin", "password": "admin123"}
SAEED = {"username": "Saeed", "password": "test1234"}  # department_head عادي (غير أدمن) — مستخدم اختبار موجود مسبقًا


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds)
    assert r.status_code == 200, r.text
    d = r.json()
    return d["access_token"], d["user"]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_session():
    token, user = _login(ADMIN)
    return {"token": token, "user": user}


@pytest.fixture(scope="module")
def saeed_session():
    token, user = _login(SAEED)
    return {"token": token, "user": user}


@pytest.fixture(scope="module", autouse=True)
def reset_saeed_tester_state(admin_session, saeed_session):
    """تصفير حالة Saeed التجريبية أولًا لضمان تكرارية الاختبار (Idempotent) عبر التشغيلات المتعددة"""
    uid = saeed_session["user"]["id"]
    requests.delete(f"{BASE_URL}/api/advanced-access/testers/{uid}", headers=_h(admin_session["token"]))
    yield


@pytest.fixture(scope="module")
def two_faculties(admin_session):
    r = requests.get(f"{BASE_URL}/api/faculties", headers=_h(admin_session["token"]))
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 2, "يلزم وجود كليتين على الأقل في بيئة الاختبار"
    ids = [f.get("id") or f.get("_id") for f in data[:2]]
    return ids


class TestLegacySystemUntouched:
    def test_legacy_roles_count_stable(self, admin_session):
        r1 = requests.get(f"{BASE_URL}/api/roles", headers=_h(admin_session["token"]))
        assert r1.status_code == 200
        before = len(r1.json())
        # تشغيل عمليات النظام الجديد بالكامل (seed + import) ثم إعادة الفحص
        requests.post(f"{BASE_URL}/api/advanced-access/seed-registry", headers=_h(admin_session["token"]))
        requests.post(f"{BASE_URL}/api/advanced-access/import-legacy-roles", headers=_h(admin_session["token"]))
        r2 = requests.get(f"{BASE_URL}/api/roles", headers=_h(admin_session["token"]))
        assert r2.status_code == 200
        after = len(r2.json())
        assert before == after, "عدد الأدوار القديمة يجب ألا يتغير إطلاقًا"
        print(f"PASS: عدد الأدوار القديمة ثابت = {after}")

    def test_legacy_login_and_permissions_unchanged(self, saeed_session):
        # تسجيل دخول Saeed (دور قديم) يجب أن يبقى يعمل بنفس صلاحياته القديمة تمامًا
        assert saeed_session["user"]["role"] == "department_head"
        r = requests.get(f"{BASE_URL}/api/students", headers=_h(saeed_session["token"]))
        assert r.status_code == 200, "وصول Saeed لبياناته القديمة يجب ألا يتأثر بالنظام الجديد"
        print("PASS: مستخدم قديم (Saeed) يصل لبياناته بشكل طبيعي رغم وجود النظام الجديد")


class TestTesterAccessGate:
    def test_non_admin_blocked_before_grant(self, saeed_session):
        r = requests.get(f"{BASE_URL}/api/advanced-access/permissions", headers=_h(saeed_session["token"]))
        assert r.status_code == 403, "يجب رفض مستخدم غير مصرَّح له بدون سجل tester"
        print("PASS: مستخدم عادي غير مصرَّح له يُرفض (403) قبل المنح")

    def test_admin_can_grant_and_revoke_tester(self, admin_session, saeed_session):
        uid = saeed_session["user"]["id"]
        r = requests.post(f"{BASE_URL}/api/advanced-access/testers", headers=_h(admin_session["token"]),
                           json={"user_id": uid, "sub_permissions": ["view"]})
        assert r.status_code == 200, r.text

        r2 = requests.get(f"{BASE_URL}/api/advanced-access/permissions", headers=_h(saeed_session["token"]))
        assert r2.status_code == 200, "بعد المنح يجب أن يُسمح بالدخول"
        assert len(r2.json()) > 0

        # تجاوز صلاحية فرعية لم تُمنح (manage_roles) يجب أن يُرفض
        r3 = requests.post(f"{BASE_URL}/api/advanced-access/roles", headers=_h(saeed_session["token"]),
                            json={"name_ar": "دور تجريبي محظور", "permission_keys": []})
        assert r3.status_code == 403, "منح view فقط يجب ألا يسمح بإدارة الأدوار (منع تصعيد الصلاحيات)"
        print("PASS: صلاحية فرعية غير ممنوحة تُرفض رغم امتلاك المستخدم وصولًا أساسيًا")

        r4 = requests.delete(f"{BASE_URL}/api/advanced-access/testers/{uid}", headers=_h(admin_session["token"]))
        assert r4.status_code == 200

        r5 = requests.get(f"{BASE_URL}/api/advanced-access/permissions", headers=_h(saeed_session["token"]))
        assert r5.status_code == 403, "بعد السحب يجب أن يُرفض الوصول مجددًا"
        print("PASS: سحب صلاحية الاختبار يمنع الوصول فورًا")

        # إعادة منح صلاحيات كاملة لبقية الاختبارات
        requests.post(f"{BASE_URL}/api/advanced-access/testers", headers=_h(admin_session["token"]), json={
            "user_id": uid, "sub_permissions": ["view", "context_switch", "manage_roles", "manage_assignments", "run_tests", "view_audit"]
        })


class TestMultiAssignmentAndScopeIsolation:
    def test_create_two_assignments_same_user(self, admin_session, saeed_session, two_faculties):
        uid = saeed_session["user"]["id"]
        token = admin_session["token"]
        roles = requests.get(f"{BASE_URL}/api/advanced-access/roles", headers=_h(token)).json()
        role_id = roles[0]["id"]

        a1 = requests.post(f"{BASE_URL}/api/advanced-access/assignments", headers=_h(token), json={
            "user_id": uid, "assignment_type": "academic", "advanced_role_id": role_id,
            "context_label_ar": "عميد تجريبي — الكلية الأولى",
            "scope": {"scope_type": "faculty", "scope_ref_ids": [two_faculties[0]]},
            "direct_permissions": [],
        })
        assert a1.status_code == 200, a1.text
        a2 = requests.post(f"{BASE_URL}/api/advanced-access/assignments", headers=_h(token), json={
            "user_id": uid, "assignment_type": "administrative", "advanced_role_id": role_id,
            "context_label_ar": "عضو لجنة تجريبي",
            "scope": {"scope_type": "faculty", "scope_ref_ids": [two_faculties[1]]},
            "direct_permissions": [],
        })
        assert a2.status_code == 200, a2.text

        contexts = requests.get(f"{BASE_URL}/api/advanced-access/users/{uid}/contexts", headers=_h(token)).json()
        assert len(contexts) >= 2, "يجب أن يمتلك المستخدم تكليفين نشطين في آن واحد"
        print(f"PASS: مستخدم واحد لديه {len(contexts)} تكليفات نشطة متزامنة")

        pytest.shared = {"assignment1": a1.json()["id"], "assignment2": a2.json()["id"], "role_id": role_id, "uid": uid, "faculties": two_faculties}

    def test_scope_isolation_denies_other_faculty(self, admin_session):
        s = pytest.shared
        token = admin_session["token"]
        perm_key = None
        role = requests.get(f"{BASE_URL}/api/advanced-access/roles/{s['role_id']}", headers=_h(token)).json()
        if role.get("permission_keys"):
            perm_key = role["permission_keys"][0]
        if not perm_key:
            pytest.skip("الدور المستورد لا يملك صلاحيات مشتقة كافية لهذا الاختبار")

        allowed_same = requests.post(f"{BASE_URL}/api/advanced-access/check", headers=_h(token), json={
            "user_id": s["uid"], "assignment_id": s["assignment1"], "permission_key": perm_key,
            "target_scope_type": "faculty", "target_ref_id": s["faculties"][0],
        }).json()
        assert allowed_same["allowed"] is True, allowed_same

        denied_other = requests.post(f"{BASE_URL}/api/advanced-access/check", headers=_h(token), json={
            "user_id": s["uid"], "assignment_id": s["assignment1"], "permission_key": perm_key,
            "target_scope_type": "faculty", "target_ref_id": s["faculties"][1],
        }).json()
        assert denied_other["allowed"] is False, denied_other
        print(f"PASS: صلاحية «{perm_key}» في نطاق الكلية الأولى لا تمتد تلقائيًا للكلية الثانية")

    def test_context_switch_does_not_leak_permissions(self, admin_session):
        s = pytest.shared
        token = admin_session["token"]
        ctx1 = requests.get(f"{BASE_URL}/api/advanced-access/assignments/{s['assignment1']}/context", headers=_h(token)).json()
        ctx2 = requests.get(f"{BASE_URL}/api/advanced-access/assignments/{s['assignment2']}/context", headers=_h(token)).json()
        assert ctx1["scope"]["scope_ref_ids"] == [s["faculties"][0]]
        assert ctx2["scope"]["scope_ref_ids"] == [s["faculties"][1]]
        assert ctx1["context_label_ar"] != ctx2["context_label_ar"]
        print("PASS: تبديل السياق يعرض نطاق وتسمية كل تكليف دون تسرّب بين التكليفين")

    def test_cannot_impersonate_other_users_assignment(self, admin_session, two_faculties):
        s = pytest.shared
        token = admin_session["token"]
        other_users = requests.get(f"{BASE_URL}/api/users", headers=_h(token)).json()
        other_user_id = next(u["id"] for u in other_users if u["id"] != s["uid"])
        res = requests.post(f"{BASE_URL}/api/advanced-access/check", headers=_h(token), json={
            "user_id": other_user_id, "assignment_id": s["assignment1"], "permission_key": "students.students.list_students",
        }).json()
        assert res["allowed"] is False
        assert "لا يخص" in res["reason"] or "يخص" in res["reason"]
        print("PASS: مستخدم آخر لا يستطيع استخدام تكليف ليس له")

    def test_end_assignment_does_not_affect_other(self, admin_session):
        s = pytest.shared
        token = admin_session["token"]
        r = requests.post(f"{BASE_URL}/api/advanced-access/assignments/{s['assignment1']}/end", headers=_h(token))
        assert r.status_code == 200

        contexts = requests.get(f"{BASE_URL}/api/advanced-access/users/{s['uid']}/contexts", headers=_h(token)).json()
        active_ids = [c["id"] for c in contexts]
        assert s["assignment1"] not in active_ids, "التكليف المنتهي يجب ألا يظهر كنشط"
        assert s["assignment2"] in active_ids, "إنهاء تكليف واحد يجب ألا يؤثر على بقية تكليفات نفس المستخدم"
        print("PASS: إنهاء تكليف واحد لا يؤثر على التكليفات الأخرى لنفس المستخدم")

        # تحقق إضافي: الصلاحية بعد الإنهاء تُرفض
        role = requests.get(f"{BASE_URL}/api/advanced-access/roles/{s['role_id']}", headers=_h(token)).json()
        if role.get("permission_keys"):
            res = requests.post(f"{BASE_URL}/api/advanced-access/check", headers=_h(token), json={
                "user_id": s["uid"], "assignment_id": s["assignment1"], "permission_key": role["permission_keys"][0],
            }).json()
            assert res["allowed"] is False
            print("PASS: الصلاحية تُرفض فور انتهاء التكليف")


class TestAuditLog:
    def test_audit_log_recorded(self, admin_session):
        logs = requests.get(f"{BASE_URL}/api/advanced-access/audit-logs?limit=20", headers=_h(admin_session["token"])).json()
        assert isinstance(logs, list) and len(logs) > 0
        actions = {l["action"] for l in logs}
        assert "assignment_created" in actions or "assignment_ended" in actions
        print(f"PASS: سجل التدقيق يحتوي {len(logs)} إدخال، منها عمليات: {sorted(actions)}")


class TestFutureOrgUnitsAutoDiscovery:
    def test_new_faculty_appears_in_scope_options_automatically(self, admin_session):
        token = admin_session["token"]
        before = requests.get(f"{BASE_URL}/api/advanced-access/scope-options/faculty", headers=_h(token)).json()
        import time
        unique_code = f"ADVTEST{int(time.time())}"
        new_fac = requests.post(f"{BASE_URL}/api/faculties", headers=_h(token), json={"name": "كلية اختبار الصلاحيات المتقدمة", "code": unique_code})
        assert new_fac.status_code in (200, 201), new_fac.text
        after = requests.get(f"{BASE_URL}/api/advanced-access/scope-options/faculty", headers=_h(token)).json()
        assert len(after) == len(before) + 1, "يجب أن تظهر الكلية الجديدة تلقائيًا دون أي تعديل كود"
        print(f"PASS: كلية جديدة أُنشئت بالنظام القديم ظهرت فورًا كنطاق متاح ({len(before)} → {len(after)})")
