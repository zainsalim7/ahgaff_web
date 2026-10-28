# Tests for PUT /api/users/{id}/custom-permissions (additive per-user extra permissions) + regression on role/permissions
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
API = f"{BASE_URL}/api"
DEAN_ROLE_ID = "698c93119a944c07ac7f80c2"
HR_MGR_ROLE_ID = "6ab443a1724aacd57bcc03ec"
FIN_ROLE_ID = "6ae12b45b4d7a835c4c9b5fe"


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p})
    assert r.status_code == 200, r.text
    d = r.json()
    return d.get("access_token") or d.get("token")


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {login('admin', 'admin123')}"
    return s


def get_user(admin, uid):
    users = admin.get(f"{API}/users").json()
    return next((u for u in users if u["id"] == uid), None)


@pytest.fixture(scope="module")
def temp_user(admin):
    uname = f"TEST_cp_{int(time.time())}"
    r = admin.post(f"{API}/users", json={"username": uname, "password": "test1234", "full_name": "TEST مستخدم هجين",
                                         "role": "dean", "role_id": DEAN_ROLE_ID, "faculty_id": "698e4f9297fef774e66e93a4"})
    assert r.status_code in (200, 201), r.text
    uid = r.json()["id"]
    yield {"id": uid, "username": uname}
    admin.delete(f"{API}/users/{uid}")


# Snapshot regression: existing users' permissions/role untouched by GET listing
class TestRegressionSnapshot:
    def test_users_list_has_custom_permissions_field(self, admin):
        users = admin.get(f"{API}/users").json()
        assert len(users) > 0
        for u in users:
            assert "custom_permissions" in u and isinstance(u["custom_permissions"], list)

    def test_salim_and_admin_unchanged(self, admin):
        users = {u["username"]: u for u in admin.get(f"{API}/users").json()}
        assert users["admin"]["role"] == "admin"
        assert users["Salim"]["role_id"] == DEAN_ROLE_ID
        assert "manage_fee_receipts" in users["Salim"]["custom_permissions"]


class TestCustomPermissions:
    def test_new_user_default_empty(self, admin, temp_user):
        u = get_user(admin, temp_user["id"])
        assert u["custom_permissions"] == []

    def test_save_custom_and_persist_no_role_change(self, admin, temp_user):
        before = get_user(admin, temp_user["id"])
        r = admin.put(f"{API}/users/{temp_user['id']}/custom-permissions",
                      json={"custom_permissions": ["manage_fee_receipts", "hr_view_employees"]})
        assert r.status_code == 200, r.text
        assert set(r.json()["custom_permissions"]) == {"manage_fee_receipts", "hr_view_employees"}
        after = get_user(admin, temp_user["id"])
        assert set(after["custom_permissions"]) == {"manage_fee_receipts", "hr_view_employees"}
        assert after["role"] == before["role"] and after["role_id"] == before["role_id"]
        assert sorted(after["permissions"]) == sorted(before["permissions"])

    def test_effective_permissions_on_login(self, admin, temp_user):
        tok = login(temp_user["username"], "test1234")
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert me.status_code == 200, me.text
        perms = me.json().get("permissions", [])
        assert "manage_fee_receipts" in perms and "hr_view_employees" in perms

    def test_invalid_permission_filtered(self, admin, temp_user):
        r = admin.put(f"{API}/users/{temp_user['id']}/custom-permissions",
                      json={"custom_permissions": ["not_a_real_permission", "manage_fee_receipts"]})
        assert r.status_code == 200
        assert r.json()["custom_permissions"] == ["manage_fee_receipts"]
        assert get_user(admin, temp_user["id"])["custom_permissions"] == ["manage_fee_receipts"]

    def test_reset_clears_only_custom(self, admin, temp_user):
        before = get_user(admin, temp_user["id"])
        r = admin.put(f"{API}/users/{temp_user['id']}/custom-permissions", json={"custom_permissions": []})
        assert r.status_code == 200
        after = get_user(admin, temp_user["id"])
        assert after["custom_permissions"] == []
        assert sorted(after["permissions"]) == sorted(before["permissions"])
        assert after["role_id"] == DEAN_ROLE_ID

    def test_missing_user_404(self, admin):
        r = admin.put(f"{API}/users/000000000000000000000000/custom-permissions", json={"custom_permissions": []})
        assert r.status_code == 404

    def test_invalid_objectid(self, admin):
        r = admin.put(f"{API}/users/not-an-id/custom-permissions", json={"custom_permissions": []})
        assert r.status_code in (400, 404, 422), f"got {r.status_code}"

    def test_bad_body_422(self, admin, temp_user):
        r = admin.put(f"{API}/users/{temp_user['id']}/custom-permissions", json={"foo": 1})
        assert r.status_code == 422

    def test_unauthorized_non_admin(self, temp_user):
        tok = login("teacher180156", "teacher123")
        r = requests.put(f"{API}/users/{temp_user['id']}/custom-permissions",
                         headers={"Authorization": f"Bearer {tok}"}, json={"custom_permissions": ["manage_users"]})
        assert r.status_code == 403

    def test_no_auth(self, temp_user):
        r = requests.put(f"{API}/users/{temp_user['id']}/custom-permissions", json={"custom_permissions": []})
        assert r.status_code in (401, 403)


# Regression: manage-users role change (role_id) still works and does not wipe custom_permissions
class TestManageUsersRoleChange:
    def test_role_change_via_put_users(self, admin, temp_user):
        admin.put(f"{API}/users/{temp_user['id']}/custom-permissions", json={"custom_permissions": ["manage_fee_receipts"]})
        r = admin.put(f"{API}/users/{temp_user['id']}", json={"role_id": FIN_ROLE_ID})
        assert r.status_code == 200, r.text
        u = get_user(admin, temp_user["id"])
        assert u["role_id"] == FIN_ROLE_ID
        print("after role change custom_permissions:", u["custom_permissions"], "role:", u["role"])
        # change back
        r2 = admin.put(f"{API}/users/{temp_user['id']}", json={"role_id": DEAN_ROLE_ID})
        assert r2.status_code == 200
        assert get_user(admin, temp_user["id"])["role_id"] == DEAN_ROLE_ID
