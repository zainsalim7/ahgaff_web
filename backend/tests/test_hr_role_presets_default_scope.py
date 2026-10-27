# HR role presets (5 unit roles) + automatic hr_scope=MY_UNIT on first assignment (POST/PUT /api/users)
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId


def _env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env("/app/frontend/.env", "REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
MDB = MongoClient(_env("/app/backend/.env", "MONGO_URL"))[_env("/app/backend/.env", "DB_NAME")]
SUFFIX = uuid.uuid4().hex[:6]

EXPECTED = {
    "hr_manager": ("مدير شؤون الموظفين", {"hr_view_employees", "hr_manage_employees", "hr_manage_org", "hr_manage_leaves", "hr_manage_attendance",
                                         "hr_manage_work_settings", "hr_manage_correspondence", "hr_manage_tasks", "hr_manage_appraisals",
                                         "hr_manage_leave_settings", "dashboard_alerts", "dashboard_hr"}),
    "finance_manager": ("المدير المالي", {"manage_fee_receipts", "view_fee_receipts", "issue_statements", "dashboard_finance"}),
    "services_manager": ("مدير الخدمات", {"hr_view_employees", "hr_manage_attendance", "hr_manage_locations", "hr_print_cards",
                                          "hr_approve_photos", "manage_rooms", "dashboard_hr", "dashboard_alerts"}),
    "hr_secretary": ("سكرتير المدير", {"hr_manage_correspondence", "issue_letters", "hr_view_employees"}),
    "regular_employee": ("الموظف العادي", set()),
}
OLD_KEYS = ["hr_officer", "hr_attendance_clerk", "hr_correspondence_clerk", "hr_auditor"]
CREATED_USERS = []


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def tok():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def existing_hr_manager_snapshot():
    role = MDB.roles.find_one({"preset_key": "hr_manager"})
    if not role:
        return []
    return [(str(u["_id"]), u.get("hr_scope"), u.get("hr_scope_unit_ids"), sorted(u.get("permissions") or []), u.get("role_id"))
            for u in MDB.users.find({"role_id": str(role["_id"])})]


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for uid in CREATED_USERS:
        MDB.users.delete_one({"_id": ObjectId(uid)})


@pytest.fixture(scope="module")
def roles(tok, existing_hr_manager_snapshot):
    r = requests.post(f"{API}/roles/hr-presets", headers=H(tok), timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    print("presets resp:", d)
    assert len(d["created"]) + len(d["updated"]) == 9
    rl = requests.get(f"{API}/roles", headers=H(tok), timeout=30)
    assert rl.status_code == 200
    return {x.get("preset_key"): x for x in rl.json() if x.get("preset_key")}


def _create_user(tok, role_id, extra=None):
    payload = {"username": f"TEST_hrp_{SUFFIX}_{len(CREATED_USERS)}", "full_name": "TEST HR preset user", "password": "test1234", "role_id": role_id}
    payload.update(extra or {})
    r = requests.post(f"{API}/users", headers=H(tok), json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    uid = r.json().get("id") or r.json().get("_id")
    assert uid
    CREATED_USERS.append(uid)
    return uid


def _scope(tok, uid):
    r = requests.get(f"{API}/hr/users/{uid}/scope", headers=H(tok), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# --- Preset creation ---
class TestPresets:
    def test_idempotent_second_call(self, tok, roles):
        r = requests.post(f"{API}/roles/hr-presets", headers=H(tok), timeout=30)
        d = r.json()
        assert r.status_code == 200 and len(d["created"]) == 0 and len(d["updated"]) == 9
        # no duplicates
        for k in list(EXPECTED) + OLD_KEYS:
            assert MDB.roles.count_documents({"preset_key": k}) == 1, k

    @pytest.mark.parametrize("key", list(EXPECTED))
    def test_five_roles_perms_and_scope(self, roles, key):
        name, perms = EXPECTED[key]
        assert key in roles
        role = roles[key]
        assert role["name"] == name
        assert role["default_hr_scope"] == "MY_UNIT"
        rp = set(role.get("permissions") or [])
        if key == "regular_employee":
            assert rp == set()
        elif key in ("hr_secretary", "services_manager", "hr_manager"):
            assert rp == perms, rp ^ perms
        else:
            assert perms <= rp, perms - rp

    @pytest.mark.parametrize("key", OLD_KEYS)
    def test_old_presets_intact(self, roles, key):
        assert key in roles
        assert not roles[key].get("default_hr_scope")
        assert len(roles[key]["permissions"]) >= 2

    def test_admin_presets_still_work(self, tok):
        r = requests.post(f"{API}/roles/admin-presets", headers=H(tok), timeout=30)
        assert r.status_code == 200, r.text

    def test_existing_hr_manager_users_unchanged(self, roles, existing_hr_manager_snapshot):
        for uid, sc, units, perms, rid in existing_hr_manager_snapshot:
            u = MDB.users.find_one({"_id": ObjectId(uid)})
            assert u.get("hr_scope") == sc and u.get("hr_scope_unit_ids") == units and u.get("role_id") == rid
            assert sorted(u.get("permissions") or []) == perms
        print("existing hr_manager users checked:", len(existing_hr_manager_snapshot))


# --- Auto scope on create/update ---
class TestAutoScope:
    @pytest.mark.parametrize("key", list(EXPECTED))
    def test_create_user_gets_my_unit(self, tok, roles, key):
        uid = _create_user(tok, roles[key]["id"])
        assert _scope(tok, uid)["hr_scope"] == "MY_UNIT"
        u = MDB.users.find_one({"_id": ObjectId(uid)})
        assert u["hr_scope_unit_ids"] == []
        assert set(u["permissions"]) == set(roles[key]["permissions"])

    def test_create_user_old_preset_no_scope(self, tok, roles):
        uid = _create_user(tok, roles["hr_officer"]["id"])
        assert MDB.users.find_one({"_id": ObjectId(uid)}).get("hr_scope") is None

    def test_put_assigns_when_no_scope(self, tok, roles):
        uid = _create_user(tok, roles["hr_officer"]["id"])
        r = requests.put(f"{API}/users/{uid}", headers=H(tok), json={"role_id": roles["finance_manager"]["id"]}, timeout=30)
        assert r.status_code == 200, r.text
        assert _scope(tok, uid)["hr_scope"] == "MY_UNIT"
        assert "manage_fee_receipts" in MDB.users.find_one({"_id": ObjectId(uid)})["permissions"]

    @pytest.mark.parametrize("preset", ["ALL", "UNITS"])
    def test_put_keeps_explicit_scope(self, tok, roles, preset):
        uid = _create_user(tok, roles["hr_officer"]["id"])
        unit = MDB.org_units.find_one({})
        body = {"hr_scope": preset, "hr_scope_unit_ids": [str(unit["_id"])] if preset == "UNITS" else []}
        r = requests.put(f"{API}/hr/users/{uid}/scope", headers=H(tok), json=body, timeout=30)
        assert r.status_code == 200, r.text
        r = requests.put(f"{API}/users/{uid}", headers=H(tok), json={"role_id": roles["hr_manager"]["id"]}, timeout=30)
        assert r.status_code == 200, r.text
        s = _scope(tok, uid)
        assert s["hr_scope"] == preset
        if preset == "UNITS":
            assert s["hr_scope_unit_ids"] == body["hr_scope_unit_ids"]

    def test_put_unrelated_field_keeps_scope(self, tok, roles):
        uid = _create_user(tok, roles["services_manager"]["id"])
        requests.put(f"{API}/hr/users/{uid}/scope", headers=H(tok), json={"hr_scope": "ALL", "hr_scope_unit_ids": []}, timeout=30)
        r = requests.put(f"{API}/users/{uid}", headers=H(tok), json={"full_name": "TEST renamed", "role_id": roles["services_manager"]["id"]}, timeout=30)
        assert r.status_code == 200, r.text
        assert _scope(tok, uid)["hr_scope"] == "ALL"

    def test_new_user_login_and_my_scope(self, tok, roles):
        uid = _create_user(tok, roles["hr_secretary"]["id"])
        u = MDB.users.find_one({"_id": ObjectId(uid)})
        r = requests.post(f"{API}/auth/login", json={"username": u["username"], "password": "test1234"}, timeout=30)
        assert r.status_code == 200, r.text
        t = r.json()["access_token"]
        ms = requests.get(f"{API}/hr/my-scope", headers=H(t), timeout=30)
        assert ms.status_code == 200, ms.text
        print("secretary my-scope:", ms.json())
        assert ms.json()["scope"] != "ALL"
