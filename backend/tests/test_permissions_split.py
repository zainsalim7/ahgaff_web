"""
Backend tests for fine-grained admin permission split.
Covers:
 - GET /api/permissions/available (admin returns ~129 incl new keys)
 - POST /api/roles/admin-presets (idempotent, 7 roles)
 - Fine-grained enforcement on EMP-100 with a temporary custom role
 - Admin regression + Dean umbrella regression
"""
import os
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # try frontend/.env
    for p in ("/app/frontend/.env", "/app/frontend-web/.env"):
        try:
            with open(p) as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        return line.split("=", 1)[1].strip().rstrip("/")
        except FileNotFoundError:
            pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"


# -------------------------- fixtures --------------------------
def _login(username, password):
    r = requests.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {username} failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login("admin", "admin123")


@pytest.fixture(scope="session")
def dean_token():
    return _login("Salim", "test1234")


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# -------------------------- Expected new keys --------------------------
NEW_KEYS = [
    "manage_institution", "manage_academic_years",
    "students_safe_delete", "students_toggle_active", "students_bulk_ops",
    "students_reset_password", "students_exclude_course",
    "teachers_safe_delete", "teachers_toggle_active", "teachers_reset_password",
    "teachers_bulk_ops", "teachers_export", "report_teacher_attendance",
    "courses_clone_section", "enrollments_auto", "enrollments_bulk",
    "lectures_reassign_history", "export_students",
    "manage_user_permissions", "users_toggle_active",
    "view_activity_logs", "delete_activity_logs",
    "manage_trash", "purge_trash",
    "system_diagnostics", "system_tools",
    "view_fee_receipts", "issue_statements",
    "hr_approve_photos", "hr_print_cards", "hr_manage_locations",
]


# -------------------------- Tests --------------------------
class TestPermissionsAvailable:
    def test_admin_lists_new_keys_no_duplicates(self, admin_token):
        r = requests.get(f"{API}/permissions/available", headers=H(admin_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        # could be list of {key,...} or dict with permissions key
        if isinstance(data, dict):
            perms = data.get("permissions") or data.get("items") or []
        else:
            perms = data
        assert isinstance(perms, list)
        keys = [p.get("key") if isinstance(p, dict) else p for p in perms]
        # No duplicates
        assert len(keys) == len(set(keys)), f"duplicate keys: {[k for k in keys if keys.count(k) > 1][:5]}"
        # Count ~129 (be lenient: >=120)
        assert len(keys) >= 120, f"expected ~129 permissions, got {len(keys)}"
        # All new keys present
        missing = [k for k in NEW_KEYS if k not in keys]
        assert not missing, f"missing new keys: {missing}"


class TestAdminPresets:
    def test_create_and_idempotent(self, admin_token):
        r1 = requests.post(f"{API}/roles/admin-presets", headers=H(admin_token), timeout=30)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        total1 = len(d1.get("created", [])) + len(d1.get("updated", []))
        assert total1 == 7, f"first call must affect 7 roles: {d1}"

        # Second call - should all be updates, no creations
        r2 = requests.post(f"{API}/roles/admin-presets", headers=H(admin_token), timeout=30)
        assert r2.status_code == 200
        d2 = r2.json()
        assert len(d2.get("created", [])) == 0, f"second call created roles: {d2}"
        assert len(d2.get("updated", [])) == 7, f"second call updated != 7: {d2}"

    def test_presets_in_roles_list(self, admin_token):
        r = requests.get(f"{API}/roles", headers=H(admin_token), timeout=30)
        assert r.status_code == 200
        roles = r.json() if isinstance(r.json(), list) else r.json().get("roles", [])
        names = [x.get("name") for x in roles]
        expected = [
            "مسؤول القبول والتسجيل",
            "مسؤول الجداول والمحاضرات",
            "مسؤول الاستيراد والبيانات",
            "مدقق السجلات (اطّلاع)",
            "مهندس نظام",
            "مسؤول طباعة البطاقات",
            "مسؤول المراسلات",
        ]
        missing = [n for n in expected if n not in names]
        assert not missing, f"missing preset roles: {missing}"


# -------------- Fine-grained enforcement via EMP-100 ----------------
@pytest.fixture(scope="class")
def temp_role_ctx(admin_token):
    """Create a temp role, find EMP-100, snapshot it, assign role, cleanup after."""
    # Find EMP-100
    r = requests.get(f"{API}/users", headers=H(admin_token), timeout=30)
    assert r.status_code == 200
    users_list = r.json() if isinstance(r.json(), list) else r.json().get("users", [])
    emp = None
    for u in users_list:
        if u.get("username") == "EMP-100":
            emp = u
            break
    if not emp:
        pytest.skip("EMP-100 not found")
    emp_id = emp.get("id") or emp.get("_id")
    orig_role_id = emp.get("role_id")
    orig_role = emp.get("role")
    orig_permissions = emp.get("permissions", []) or []

    # If prior test left EMP-100 attached to the TEST role, resolve the real employee system role as fallback
    fallback_role_id = None
    roles_list_resp = requests.get(f"{API}/roles", headers=H(admin_token), timeout=30).json()
    roles_list_resp = roles_list_resp if isinstance(roles_list_resp, list) else roles_list_resp.get("roles", [])
    for x in roles_list_resp:
        if x.get("system_key") == "employee":
            fallback_role_id = x.get("id") or x.get("_id")
            break

    # Cleanup any pre-existing stale role from previous failed runs
    existing_roles = requests.get(f"{API}/roles", headers=H(admin_token), timeout=30).json()
    existing_roles = existing_roles if isinstance(existing_roles, list) else existing_roles.get("roles", [])
    for x in existing_roles:
        if x.get("name") == "TEST_fine_role_perm_split":
            rid = x.get("id") or x.get("_id")
            if rid:
                requests.delete(f"{API}/roles/{rid}", headers=H(admin_token), timeout=30)

    # Create temp role
    role_body = {
        "name": "TEST_fine_role_perm_split",
        "description": "temp test role",
        "permissions": [
            "view_activity_logs",
            "students_toggle_active",
            "hr_view_employees",
            "hr_print_cards",
            "view_fee_receipts",
            "manage_semesters",
        ],
    }
    rc = requests.post(f"{API}/roles", headers=H(admin_token), json=role_body, timeout=30)
    assert rc.status_code in (200, 201), rc.text
    role_data = rc.json()
    role_id = role_data.get("id") or role_data.get("_id") or role_data.get("role_id") or (role_data.get("role") or {}).get("id")
    if not role_id:
        # try fetch
        rr = requests.get(f"{API}/roles", headers=H(admin_token), timeout=30).json()
        rr = rr if isinstance(rr, list) else rr.get("roles", [])
        for x in rr:
            if x.get("name") == role_body["name"]:
                role_id = x.get("id") or x.get("_id")
                break
    assert role_id, f"could not resolve created role id: {role_data}"

    # Assign to EMP-100 with empty permissions
    up = requests.put(
        f"{API}/users/{emp_id}",
        headers=H(admin_token),
        json={"role_id": role_id, "permissions": []},
        timeout=30,
    )
    assert up.status_code in (200, 204), up.text

    # Login as EMP-100 (may require must_change_password=false; still returns token per spec)
    emp_login = requests.post(
        f"{API}/auth/login", json={"username": "EMP-100", "password": "EMP-100"}, timeout=30
    )
    assert emp_login.status_code == 200, f"EMP-100 login failed: {emp_login.text}"
    emp_token = emp_login.json()["access_token"]

    yield {
        "emp_id": emp_id,
        "emp_token": emp_token,
        "role_id": role_id,
    }

    # Restore: reassign user back FIRST, then delete role
    restore_role_id = orig_role_id if orig_role_id and orig_role_id != role_id else fallback_role_id
    restore_body = {"role_id": restore_role_id, "permissions": orig_permissions}
    if orig_role and orig_role != "custom":
        restore_body["role"] = orig_role
    else:
        restore_body["role"] = "employee"
    requests.put(
        f"{API}/users/{emp_id}",
        headers=H(admin_token),
        json=restore_body,
        timeout=30,
    )
    requests.delete(f"{API}/roles/{role_id}", headers=H(admin_token), timeout=30)


@pytest.fixture(scope="class")
def student_id(admin_token):
    r = requests.get(f"{API}/students", headers=H(admin_token), timeout=30)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else (data.get("students") or data.get("items") or [])
    if not items:
        pytest.skip("no students")
    sid = items[0].get("id") or items[0].get("_id")
    return sid


class TestFineGrainedEnforcement:
    def test_activity_logs_allowed(self, temp_role_ctx):
        r = requests.get(f"{API}/activity-logs", headers=H(temp_role_ctx["emp_token"]), timeout=30)
        assert r.status_code == 200, f"expected 200: {r.status_code} {r.text[:200]}"

    def test_delete_activity_logs_forbidden(self, temp_role_ctx):
        r = requests.delete(f"{API}/activity-logs", headers=H(temp_role_ctx["emp_token"]), timeout=30)
        assert r.status_code == 403, f"expected 403: {r.status_code} {r.text[:200]}"

    def test_trash_forbidden(self, temp_role_ctx):
        r = requests.get(f"{API}/trash", headers=H(temp_role_ctx["emp_token"]), timeout=30)
        assert r.status_code == 403, f"expected 403: got {r.status_code}"

    def test_student_activate_not_forbidden(self, temp_role_ctx, student_id):
        r = requests.post(
            f"{API}/students/{student_id}/activate",
            headers=H(temp_role_ctx["emp_token"]),
            timeout=30,
        )
        assert r.status_code != 403, f"should NOT be 403, got {r.status_code}: {r.text[:200]}"

    def test_student_reset_password_forbidden(self, temp_role_ctx, student_id):
        r = requests.post(
            f"{API}/students/{student_id}/reset-password",
            headers=H(temp_role_ctx["emp_token"]),
            timeout=30,
        )
        assert r.status_code == 403

    def test_bulk_activate_forbidden(self, temp_role_ctx):
        r = requests.post(
            f"{API}/students/bulk-activate",
            headers=H(temp_role_ctx["emp_token"]),
            json={"student_ids": []},
            timeout=30,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}"

    def test_hr_print_settings_allowed(self, temp_role_ctx):
        r = requests.get(
            f"{API}/hr/cards/print-settings", headers=H(temp_role_ctx["emp_token"]), timeout=30
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:200]}"

    def test_hr_batch_preview_allowed(self, temp_role_ctx):
        r = requests.post(
            f"{API}/hr/cards/batch-preview",
            headers=H(temp_role_ctx["emp_token"]),
            json={},
            timeout=30,
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:200]}"

    def test_fee_receipts_read_allowed(self, temp_role_ctx):
        r = requests.get(
            f"{API}/fees/receipts", headers=H(temp_role_ctx["emp_token"]), timeout=30
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:200]}"

    def test_fee_receipts_write_forbidden(self, temp_role_ctx):
        # bulk-review checks can_manage_fees() first
        r = requests.post(
            f"{API}/fees/receipts/bulk-review",
            headers=H(temp_role_ctx["emp_token"]),
            json={"receipt_ids": ["000000000000000000000000"], "action": "approve"},
            timeout=30,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"

    def test_diagnose_roles_forbidden(self, temp_role_ctx):
        r = requests.get(
            f"{API}/admin/diagnose-roles", headers=H(temp_role_ctx["emp_token"]), timeout=30
        )
        assert r.status_code == 403

    def test_semesters_create_not_forbidden(self, temp_role_ctx, admin_token):
        body = {
            "name": "TEST_perm_split_sem",
            "academic_year": "2025-2026",
            "start_date": "2026-01-01",
            "end_date": "2026-06-30",
        }
        r = requests.post(
            f"{API}/semesters", headers=H(temp_role_ctx["emp_token"]), json=body, timeout=30
        )
        assert r.status_code != 403, f"should NOT be 403, got {r.status_code}: {r.text[:200]}"
        # cleanup if created
        if r.status_code in (200, 201):
            try:
                sem = r.json()
                sid = sem.get("id") or sem.get("_id")
                if sid:
                    requests.delete(f"{API}/semesters/{sid}", headers=H(admin_token), timeout=30)
            except Exception:
                pass

    def test_export_students_forbidden(self, temp_role_ctx):
        r = requests.get(
            f"{API}/export/students", headers=H(temp_role_ctx["emp_token"]), timeout=30
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}"

    def test_admin_fix_user_forbidden(self, temp_role_ctx):
        r = requests.post(
            f"{API}/admin/fix-user",
            headers=H(temp_role_ctx["emp_token"]),
            json={"username": "nobody_test", "action": "delete"},
            timeout=30,
        )
        assert r.status_code == 403

    def test_grant_more_then_export_and_cleanup(self, temp_role_ctx, admin_token):
        # Update role to add system_tools + export_students
        new_perms = [
            "view_activity_logs",
            "students_toggle_active",
            "hr_view_employees",
            "hr_print_cards",
            "view_fee_receipts",
            "manage_semesters",
            "system_tools",
            "export_students",
        ]
        up = requests.put(
            f"{API}/roles/{temp_role_ctx['role_id']}",
            headers=H(admin_token),
            json={"permissions": new_perms},
            timeout=30,
        )
        assert up.status_code in (200, 204), up.text
        # Re-login to refresh token perms
        emp_login = requests.post(
            f"{API}/auth/login",
            json={"username": "EMP-100", "password": "EMP-100"},
            timeout=30,
        )
        assert emp_login.status_code == 200
        tok = emp_login.json()["access_token"]
        # export_students → 200
        r1 = requests.get(f"{API}/export/students", headers=H(tok), timeout=60)
        assert r1.status_code == 200, f"export_students expected 200, got {r1.status_code}"
        # diagnose-roles should still be 403 (diagnostics separate)
        r2 = requests.get(f"{API}/admin/diagnose-roles", headers=H(tok), timeout=30)
        assert r2.status_code == 403, f"diagnose-roles should be 403, got {r2.status_code}"
        # cleanup-duplicate-roles-now → 200
        r3 = requests.post(
            f"{API}/admin/cleanup-duplicate-roles-now", headers=H(tok), timeout=60
        )
        assert r3.status_code == 200, f"cleanup-duplicate expected 200, got {r3.status_code}: {r3.text[:200]}"


# -------------- Regression: admin + dean --------------
class TestAdminRegression:
    def test_admin_trash(self, admin_token):
        r = requests.get(f"{API}/trash", headers=H(admin_token), timeout=30)
        assert r.status_code == 200

    def test_admin_activity_logs(self, admin_token):
        r = requests.get(f"{API}/activity-logs", headers=H(admin_token), timeout=30)
        assert r.status_code == 200

    def test_admin_bulk_activate(self, admin_token):
        r = requests.post(
            f"{API}/students/bulk-activate",
            headers=H(admin_token),
            json={"student_ids": []},
            timeout=30,
        )
        # must NOT be 403; expected 4xx (bad request) or 200
        assert r.status_code != 403, f"admin got 403: {r.text[:200]}"

    def test_admin_export_students(self, admin_token):
        r = requests.get(f"{API}/export/students", headers=H(admin_token), timeout=60)
        assert r.status_code == 200


class TestDeanUmbrella:
    def test_dean_student_activate(self, dean_token, student_id):
        r = requests.post(
            f"{API}/students/{student_id}/activate",
            headers=H(dean_token),
            timeout=30,
        )
        assert r.status_code != 403, f"dean got 403 on activate: {r.text[:200]}"

    def test_dean_export_students(self, dean_token):
        r = requests.get(f"{API}/export/students", headers=H(dean_token), timeout=60)
        assert r.status_code != 403, f"dean got 403 on export: {r.status_code}"
