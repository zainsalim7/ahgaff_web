# Regression: explicit view_schedule permission (no implicit grant via manage_courses)
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"
ROLE_ID = "698c93119a944c07ac7f80c3"


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    return d.get("access_token") or d.get("token")


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def tokens():
    return {"admin": login("admin", "admin123"), "saeed": login("Saeed", "test1234"), "salim": login("Salim", "test1234")}


def me(tok):
    r = requests.get(f"{API}/auth/me", headers=H(tok), timeout=30)
    assert r.status_code == 200
    return r.json()


# /auth/me permissions
@pytest.mark.parametrize("who", ["saeed", "salim"])
def test_me_no_schedule_perms(tokens, who):
    perms = me(tokens[who]).get("permissions", [])
    assert "view_schedule" not in perms and "manage_schedule" not in perms, perms


def test_full_mapping_manage_courses(tokens):
    r = requests.get(f"{API}/permissions/available", headers=H(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    fm = r.json().get("full_mapping")
    assert isinstance(fm, dict)
    assert "manage_schedule" not in fm.get("manage_courses", [])
    for k, v in fm.items():
        if k not in ("manage_schedule",):
            assert "view_schedule" not in v and "manage_schedule" not in v, (k, v)


# guards
def test_saeed_weekly_403(tokens):
    r = requests.get(f"{API}/weekly-schedule", headers=H(tokens["saeed"]), timeout=30)
    assert r.status_code == 403


def test_saeed_all_schedule_ok_via_attendance(tokens):
    perms = me(tokens["saeed"]).get("permissions", [])
    r = requests.get(f"{API}/lectures/all-schedule", headers=H(tokens["saeed"]), timeout=30)
    expected = 200 if "manage_attendance" in perms else 403
    assert r.status_code == expected, (r.status_code, "manage_attendance" in perms)


def test_salim_both_403(tokens):
    assert requests.get(f"{API}/weekly-schedule", headers=H(tokens["salim"]), timeout=30).status_code == 403
    assert requests.get(f"{API}/lectures/all-schedule", headers=H(tokens["salim"]), timeout=30).status_code == 403


def test_admin_both_200(tokens):
    r1 = requests.get(f"{API}/weekly-schedule", headers=H(tokens["admin"]), timeout=60)
    r2 = requests.get(f"{API}/lectures/all-schedule", headers=H(tokens["admin"]), timeout=60)
    assert r1.status_code == 200 and r2.status_code == 200


def test_teacher_param_with_course_perms(tokens):
    perms = me(tokens["saeed"]).get("permissions", [])
    r = requests.get(f"{API}/weekly-schedule", params={"teacher_id": "698ad3da31ab437a06176e2a"}, headers=H(tokens["saeed"]), timeout=30)
    has_staff = any(p in perms for p in ("manage_teachers", "view_teachers", "manage_courses", "view_courses"))
    assert r.status_code == (200 if has_staff else 403)


def test_teacher_own_schedule():
    t = login("222222", "teacher123")
    r = requests.get(f"{API}/weekly-schedule", params={"teacher_id": "698ad3da31ab437a06176e2a"}, headers=H(t), timeout=30)
    assert r.status_code == 200
    r2 = requests.get(f"{API}/weekly-schedule", headers=H(t), timeout=30)
    assert r2.status_code == 403
    r3 = requests.get(f"{API}/lectures/all-schedule", headers=H(t), timeout=30)
    assert r3.status_code == 200


# grant then revert
def test_grant_view_schedule_then_revert(tokens):
    ah = H(tokens["admin"])
    role = requests.get(f"{API}/roles/{ROLE_ID}", headers=ah, timeout=30).json()
    original = list(role["permissions"])
    assert "view_schedule" not in original
    try:
        r = requests.put(f"{API}/roles/{ROLE_ID}", json={"permissions": original + ["view_schedule"]}, headers=ah, timeout=30)
        assert r.status_code == 200, r.text
        st = login("Saeed", "test1234")
        assert "view_schedule" in me(st).get("permissions", [])
        assert requests.get(f"{API}/weekly-schedule", headers=H(st), timeout=30).status_code == 200
        assert requests.get(f"{API}/lectures/all-schedule", headers=H(st), timeout=30).status_code == 200
    finally:
        r = requests.put(f"{API}/roles/{ROLE_ID}", json={"permissions": original}, headers=ah, timeout=30)
        assert r.status_code == 200
        after = requests.get(f"{API}/roles/{ROLE_ID}", headers=ah, timeout=30).json()["permissions"]
        assert sorted(after) == sorted(original)
    st = login("Saeed", "test1234")
    assert requests.get(f"{API}/weekly-schedule", headers=H(st), timeout=30).status_code == 403
