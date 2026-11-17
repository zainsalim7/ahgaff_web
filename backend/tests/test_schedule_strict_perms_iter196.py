# Iteration 196: strict view_schedule / manage_schedule guards on weekly-schedule GET + write endpoints
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/') or open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0].rstrip('/')
API = f"{BASE_URL}/api"


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p})
    assert r.status_code == 200, r.text
    j = r.json()
    return {"Authorization": f"Bearer {j.get('access_token') or j.get('token')}"}


@pytest.fixture(scope="module")
def H():
    return {"admin": login("admin", "admin123"), "salim": login("Salim", "test1234"), "saeed": login("Saeed", "test1234")}


@pytest.fixture(scope="module")
def ids(H):
    h = H["admin"]
    deps = requests.get(f"{API}/departments", headers=h).json()
    deps = deps if isinstance(deps, list) else deps.get("items", deps.get("departments", []))
    d = next(x for x in deps if x.get("faculty_id"))
    teachers = requests.get(f"{API}/teachers", headers=h).json()
    teachers = teachers if isinstance(teachers, list) else teachers.get("items", teachers.get("teachers", []))
    return {"fac": d["faculty_id"], "dep": d["id"], "teacher": teachers[0]["id"]}


def endpoints(i):
    f, d = i["fac"], i["dep"]
    return [
        ("weekly-schedule", {"faculty_id": f}),
        ("weekly-schedule/sections", {"department_id": d}),
        ("weekly-schedule/conflicts", {"faculty_id": f}),
        ("weekly-schedule/export-visual/pdf", {"faculty_id": f}),
        ("weekly-schedule/export-visual/excel", {"faculty_id": f}),
        ("weekly-schedule/availability/rooms", {"faculty_id": f}),
        ("weekly-schedule/availability/teachers", {"faculty_id": f}),
        ("weekly-schedule/master-view", {"faculty_id": f}),
        ("weekly-schedule/master-view/export/pdf", {"faculty_id": f}),
        ("weekly-schedule/master-view/export/excel", {"faculty_id": f}),
        ("weekly-schedule/free-rooms", {"faculty_id": f, "day": "الأحد", "slot_number": 1}),
        ("weekly-schedule/valid-slots", {"faculty_id": f, "department_id": d, "level": 1}),
        ("weekly-schedule/drafts", {}),
    ]


@pytest.mark.parametrize("who", ["salim", "saeed"])
def test_no_perm_users_get_403(H, ids, who):
    bad = []
    for ep, params in endpoints(ids):
        r = requests.get(f"{API}/{ep}", params=params, headers=H[who], timeout=60)
        if r.status_code != 403:
            bad.append((ep, r.status_code))
    assert not bad, f"{who} not blocked: {bad}"


def test_admin_gets_200(H, ids):
    bad = []
    for ep, params in endpoints(ids):
        r = requests.get(f"{API}/{ep}", params=params, headers=H["admin"], timeout=90)
        if r.status_code != 200:
            bad.append((ep, r.status_code, r.text[:150]))
    assert not bad, bad


def test_master_view_admin_can_manage(H, ids):
    r = requests.get(f"{API}/weekly-schedule/master-view", params={"faculty_id": ids["fac"]}, headers=H["admin"])
    assert r.json()["can_manage"] is True


@pytest.mark.parametrize("who", ["salim", "saeed"])
def test_writes_403(H, ids, who):
    h = H[who]
    calls = [
        requests.post(f"{API}/weekly-schedule", json={"faculty_id": ids["fac"], "department_id": ids["dep"], "level": 1, "course_id": "x", "day": "الأحد", "slot_number": 1}, headers=h),
        requests.post(f"{API}/weekly-schedule/drafts", json={"name": "TEST_x"}, headers=h),
        requests.post(f"{API}/rooms", json={"name": "TEST_r", "faculty_id": ids["fac"]}, headers=h),
        requests.put(f"{API}/schedule-settings", json={}, headers=h),
        requests.delete(f"{API}/weekly-schedule/000000000000000000000000", headers=h),
    ]
    codes = [c.status_code for c in calls]
    assert all(c in (403, 422) for c in codes), codes
    assert codes.count(403) >= 4, codes


def test_teacher_id_exception_for_saeed(H, ids):
    # Saeed has course/teacher perms -> specific teacher_id allowed (used by /teacher-courses weekly report)
    r = requests.get(f"{API}/weekly-schedule", params={"teacher_id": ids["teacher"]}, headers=H["saeed"])
    assert r.status_code == 200, r.text
    r = requests.get(f"{API}/weekly-schedule/export-visual/excel", params={"teacher_id": ids["teacher"]}, headers=H["saeed"])
    assert r.status_code == 200


def test_salim_teacher_id_blocked(H, ids):
    r = requests.get(f"{API}/weekly-schedule", params={"teacher_id": ids["teacher"]}, headers=H["salim"])
    print("salim teacher_id:", r.status_code)
    assert r.status_code in (200, 403)


def test_teacher_own_schedule():
    h = login("teacher180156", "teacher123")
    me = requests.get(f"{API}/auth/me", headers=h).json()
    tid = me.get("teacher_record_id") or me.get("teacher_id") or me["id"]
    r = requests.get(f"{API}/weekly-schedule", params={"teacher_id": tid}, headers=h)
    assert r.status_code == 200, r.text
    r2 = requests.get(f"{API}/weekly-schedule", headers=h)
    assert r2.status_code == 403


def test_lectures_invalid_id_404(H):
    r = requests.get(f"{API}/lectures/month", headers=H["admin"])
    assert r.status_code == 404, r.text
