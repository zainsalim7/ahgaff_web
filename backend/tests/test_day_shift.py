"""Tests for Day-Shift feature (إزاحة اليوم الدراسي)"""
import os
import time
import requests
import pytest
from datetime import datetime, timedelta

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback: read from frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE = line.strip().split("=", 1)[1].rstrip("/")

API = f"{BASE}/api"
FUTURE_DATE = "2026-11-02"


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    assert r.status_code == 200, f"login {u} failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_hdr():
    return _login("admin", "admin123")


@pytest.fixture(scope="module")
def noperm_hdr():
    try:
        return _login("fee_general", "test1234")
    except AssertionError:
        pytest.skip("fee_general user not available")


@pytest.fixture(scope="module")
def lectures(admin_hdr):
    """Create 3 lectures at FUTURE_DATE, mark 3rd as completed. Cleanup after."""
    # get 3 courses
    r = requests.get(f"{API}/courses", headers=admin_hdr, timeout=30)
    assert r.status_code == 200
    courses = r.json()
    if isinstance(courses, dict):
        courses = courses.get("courses") or courses.get("items") or []
    assert len(courses) >= 3, f"not enough courses: {len(courses)}"
    c1, c2, c3 = courses[0], courses[1], courses[2]

    def cid(c):
        return c.get("id") or c.get("_id")

    slots = [("08:00", "09:30"), ("09:45", "11:15"), ("13:15", "14:45")]
    created = []
    for c, (st, en) in zip([c1, c2, c3], slots):
        payload = {
            "course_id": cid(c),
            "date": FUTURE_DATE,
            "start_time": st,
            "end_time": en,
            "topic": f"TEST_day_shift {st}",
        }
        r = requests.post(f"{API}/lectures", headers=admin_hdr, json=payload, timeout=30)
        assert r.status_code in (200, 201), f"create lecture failed: {r.status_code} {r.text[:300]}"
        j = r.json()
        lid = j.get("id") or (j.get("lecture") or {}).get("id") or j.get("_id")
        assert lid, f"no id in {j}"
        created.append(lid)

    # mark 3rd as completed
    r = requests.put(f"{API}/lectures/{created[2]}", headers=admin_hdr, json={"status": "completed"}, timeout=30)
    assert r.status_code in (200, 204), f"mark completed failed: {r.status_code} {r.text[:200]}"

    yield created

    # cleanup: delete lectures
    for lid in created:
        requests.delete(f"{API}/lectures/{lid}", headers=admin_hdr, timeout=30)


# ---- Tests ----

def test_permission_key_in_list(admin_hdr):
    r = requests.get(f"{API}/permissions/all", headers=admin_hdr, timeout=30)
    assert r.status_code == 200
    data = r.json()
    perms = data if isinstance(data, list) else (data.get("permissions") or data.get("items") or [])
    keys = [p.get("key") for p in perms if isinstance(p, dict)]
    assert "shift_day" in keys, f"shift_day missing from permissions: sample {keys[:10]}"


def test_preview_ok(admin_hdr, lectures):
    body = {"date_from": FUTURE_DATE, "new_start_time": "10:00", "reason": "TEST", "notify": False}
    r = requests.post(f"{API}/day-shift/preview", headers=admin_hdr, json=body, timeout=30)
    assert r.status_code == 200, r.text[:400]
    j = r.json()
    assert j["total_lectures"] == 2, j
    assert j["total_skipped"] == 1
    assert j["skipped_reasons"]["completed"] == 1
    assert j["days"][0]["offset_minutes"] == 120
    assert j["days"][0]["old_first"] == "08:00"
    assert j["days"][0]["new_first"] == "10:00"
    assert j["faculty_name"] == "جميع الكليات"
    assert len(j["sample"]) >= 1


def test_apply_and_verify(admin_hdr, lectures):
    body = {"date_from": FUTURE_DATE, "new_start_time": "10:00", "reason": "TEST_apply", "notify": False}
    r = requests.post(f"{API}/day-shift/apply", headers=admin_hdr, json=body, timeout=30)
    assert r.status_code == 200, r.text[:400]
    j = r.json()
    shift_id = j["id"]
    assert j["updated"] == 2
    assert j["skipped"] == 1
    pytest.shift_id = shift_id

    # verify list
    r = requests.get(f"{API}/day-shift", headers=admin_hdr, params={"date": FUTURE_DATE}, timeout=30)
    assert r.status_code == 200
    lst = r.json()
    ids = [s.get("id") for s in lst]
    assert shift_id in ids
    rec = next(s for s in lst if s.get("id") == shift_id)
    assert rec.get("status") == "active"
    assert "changes" not in rec
    assert rec.get("created_by_name")

    # preview same date again returns note
    r = requests.post(f"{API}/day-shift/preview", headers=admin_hdr, json=body, timeout=30)
    assert r.status_code == 200
    j2 = r.json()
    assert j2["total_lectures"] == 0
    assert "اليوم يبدأ" in (j2["days"][0].get("note") or "")


def test_revert(admin_hdr, lectures):
    sid = getattr(pytest, "shift_id", None)
    assert sid, "shift_id from previous test missing"
    r = requests.post(f"{API}/day-shift/{sid}/revert", headers=admin_hdr, timeout=30)
    assert r.status_code == 200, r.text[:400]
    assert r.json()["reverted"] == 2

    # second revert -> 400
    r2 = requests.post(f"{API}/day-shift/{sid}/revert", headers=admin_hdr, timeout=30)
    assert r2.status_code == 400

    # list active empty for that date
    r = requests.get(f"{API}/day-shift", headers=admin_hdr, params={"date": FUTURE_DATE, "status": "active"}, timeout=30)
    assert r.status_code == 200
    assert getattr(pytest, "shift_id", None) not in [s.get("id") for s in r.json()]


def test_errors(admin_hdr, lectures):
    # date_to before date_from
    r = requests.post(f"{API}/day-shift/preview", headers=admin_hdr,
                      json={"date_from": FUTURE_DATE, "date_to": "2026-10-01", "new_start_time": "10:00"}, timeout=30)
    assert r.status_code == 400
    # range > 60
    r = requests.post(f"{API}/day-shift/preview", headers=admin_hdr,
                      json={"date_from": "2026-11-01", "date_to": "2027-02-01", "new_start_time": "10:00"}, timeout=30)
    assert r.status_code == 400
    # neither new_start_time nor offset
    r = requests.post(f"{API}/day-shift/preview", headers=admin_hdr,
                      json={"date_from": FUTURE_DATE}, timeout=30)
    assert r.status_code == 400
    # bad format
    r = requests.post(f"{API}/day-shift/preview", headers=admin_hdr,
                      json={"date_from": FUTURE_DATE, "new_start_time": "25:99"}, timeout=30)
    assert r.status_code == 400
    # excessive offset -> out of day
    r = requests.post(f"{API}/day-shift/preview", headers=admin_hdr,
                      json={"date_from": FUTURE_DATE, "offset_minutes": 900}, timeout=30)
    assert r.status_code == 400


def test_apply_no_lectures(admin_hdr):
    # date with no lectures
    r = requests.post(f"{API}/day-shift/apply", headers=admin_hdr,
                      json={"date_from": "2027-06-15", "new_start_time": "10:00", "notify": False}, timeout=30)
    assert r.status_code == 400


def test_permissions_denied(noperm_hdr):
    body = {"date_from": FUTURE_DATE, "new_start_time": "10:00"}
    r = requests.post(f"{API}/day-shift/preview", headers=noperm_hdr, json=body, timeout=30)
    assert r.status_code == 403
    r = requests.post(f"{API}/day-shift/apply", headers=noperm_hdr, json=body, timeout=30)
    assert r.status_code == 403
    r = requests.post(f"{API}/day-shift/000000000000000000000000/revert", headers=noperm_hdr, timeout=30)
    assert r.status_code == 403
    # list allowed for any authed user
    r = requests.get(f"{API}/day-shift", headers=noperm_hdr, timeout=30)
    assert r.status_code == 200


def test_offset_minutes_variant(admin_hdr, lectures):
    # Use offset_minutes=90 for preview only (not apply)
    r = requests.post(f"{API}/day-shift/preview", headers=admin_hdr,
                      json={"date_from": FUTURE_DATE, "offset_minutes": 90, "notify": False}, timeout=30)
    assert r.status_code == 200, r.text[:300]
    j = r.json()
    assert j["total_lectures"] == 2
    assert j["days"][0]["offset_minutes"] == 90


def test_range_skips_empty_days(admin_hdr, lectures):
    # date_from = FUTURE_DATE, date_to = FUTURE_DATE + 1 (no lectures)
    d2 = "2026-11-03"
    r = requests.post(f"{API}/day-shift/preview", headers=admin_hdr,
                      json={"date_from": FUTURE_DATE, "date_to": d2, "new_start_time": "10:00", "notify": False}, timeout=30)
    assert r.status_code == 200, r.text[:300]
    j = r.json()
    dates_in = [d["date"] for d in j["days"]]
    assert FUTURE_DATE in dates_in
    assert d2 not in dates_in
