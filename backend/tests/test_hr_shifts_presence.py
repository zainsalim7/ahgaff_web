"""Backend tests for HR work-settings (multi-shift) + multi-shift attendance + presence-check.

Covers:
- Work-settings CRUD (shifts add/edit/delete/assign) with permission gating
- Legacy /api/hr/attendance/settings behavior (still gated by P_WORK_SETTINGS)
- Multi-shift daily sheet, /my (multi_shift, today_shifts, next_shift), check-in/out per shift
- Manual mark with shift_id (no duplicate), delete-record with shift_id
- Monthly report shifts_count / due_days scaling
- Presence-check settings validation, send-now, /my remaining_seconds, confirm branches, report, internal /run auth

Cleanup: restores hr_settings + hr_presence_settings; deletes today's presence checks + plan_state;
notifications type=presence_check for admin uid; hr_attendance today rows for admin employee; any temp
shifts and temp locations we created; temp employee record if we created it.
"""
import os
import datetime as dt
import time
import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId


def _read_env_file(path, key):
    try:
        with open(path) as f:
            for line in f:
                if line.strip().startswith(key + "="):
                    return line.strip().split("=", 1)[1].strip().strip('"')
    except Exception:
        return None


BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env_file("/app/frontend/.env", "REACT_APP_BACKEND_URL") or "").rstrip("/")
MONGO_URL = _read_env_file("/app/backend/.env", "MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = _read_env_file("/app/backend/.env", "DB_NAME") or "test_database"
INTERNAL_KEY = _read_env_file("/app/backend/.env", "INTERNAL_PUSH_KEY") or ""
assert BASE, "REACT_APP_BACKEND_URL missing"

ADMIN = {"username": "admin", "password": "admin123"}
SALIM = {"username": "Salim", "password": "test1234"}
AR_DAYS = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]
ALL_DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"]

REF_LAT = 14.5427
REF_LNG = 49.1342
FAR_LAT = REF_LAT + 0.5   # ~55km away → out of range
FAR_LNG = REF_LNG


def login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login {creds['username']}: {r.status_code} {r.text}"
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {login(ADMIN)}"}


@pytest.fixture(scope="module")
def salim_h():
    try:
        return {"Authorization": f"Bearer {login(SALIM)}"}
    except Exception:
        pytest.skip("Salim not available")


@pytest.fixture(scope="module")
def db():
    mc = MongoClient(MONGO_URL)
    return mc[DB_NAME]


@pytest.fixture(scope="module")
def orig_settings(admin_h):
    """Snapshot of hr_settings (legacy schema) BEFORE tests."""
    r = requests.get(f"{BASE}/api/hr/attendance/settings", headers=admin_h, timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def orig_work_settings(admin_h):
    r = requests.get(f"{BASE}/api/hr/work-settings", headers=admin_h, timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def orig_presence(admin_h):
    r = requests.get(f"{BASE}/api/hr/presence-check/settings", headers=admin_h, timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def admin_employee(admin_h, db):
    """Ensure the admin user has an employee record. Return dict {id, created, user_id}."""
    r = requests.get(f"{BASE}/api/users", headers=admin_h, params={"search": "admin"}, timeout=15)
    users = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    admin_user = next((u for u in users if u.get("username") == "admin"), None)
    assert admin_user, "admin user not found via /api/users"
    admin_uid = admin_user["id"]
    existing = db.employees.find_one({"user_id": admin_uid})
    if existing:
        info = {"id": str(existing["_id"]), "created": False, "user_id": admin_uid, "orig_shift_ids": existing.get("shift_ids")}
        yield info
        # restore shift_ids
        db.employees.update_one({"_id": existing["_id"]}, {"$set": {"shift_ids": info["orig_shift_ids"]}} if info["orig_shift_ids"] is not None else {"$unset": {"shift_ids": ""}})
        return
    doc = {"full_name": "TEST_ADMIN_EMP_SHIFT", "user_id": admin_uid,
           "employee_no": "TSHIFT" + dt.datetime.now().strftime("%H%M%S"),
           "job_title": "test", "is_active": True,
           "created_at": dt.datetime.utcnow().isoformat(), "created_by_name": "test"}
    ins = db.employees.insert_one(doc)
    yield {"id": str(ins.inserted_id), "created": True, "user_id": admin_uid, "orig_shift_ids": None}
    db.employees.delete_one({"_id": ins.inserted_id})


@pytest.fixture(scope="module", autouse=True)
def _global_cleanup(admin_h, orig_settings, orig_presence, admin_employee, db):
    """Ensure today is a work day and geofence off for test duration, restore at end."""
    today = dt.date.today().strftime("%Y-%m-%d")
    # widen work_days and disable geofence via NEW work-settings endpoint (avoids stomping shifts)
    payload = {"work_days": ALL_DAYS, "holidays": [], "allow_self_checkin": True,
               "geofence_required": False, "annual_leave_days": orig_settings.get("annual_leave_days", 30)}
    r = requests.put(f"{BASE}/api/hr/work-settings/general", headers=admin_h, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    yield
    # RESTORE hr_settings (general) via legacy PUT (preserves original values incl. main shift times)
    restore = {
        "work_start": orig_settings["work_start"], "work_end": orig_settings["work_end"],
        "late_grace_minutes": orig_settings.get("late_grace_minutes", 15),
        "early_leave_grace_minutes": orig_settings.get("early_leave_grace_minutes", 0),
        "work_days": orig_settings.get("work_days", []),
        "holidays": orig_settings.get("holidays", []),
        "allow_self_checkin": orig_settings.get("allow_self_checkin", True),
        "geofence_required": orig_settings.get("geofence_required", True),
        "annual_leave_days": orig_settings.get("annual_leave_days", 30),
    }
    requests.put(f"{BASE}/api/hr/attendance/settings", headers=admin_h, json=restore, timeout=15)
    # Restore presence settings to snapshot (enabled + employee_ids)
    pres_body = {
        "enabled": bool(orig_presence.get("enabled", False)),
        "checks_per_day": int(orig_presence.get("checks_per_day", 1)),
        "min_interval_minutes": int(orig_presence.get("min_interval_minutes", 60)),
        "response_timeout_minutes": int(orig_presence.get("response_timeout_minutes", 5)),
        "employee_ids": orig_presence.get("employee_ids", "all"),
        "only_checked_in": bool(orig_presence.get("only_checked_in", True)),
    }
    # If snapshot has enriched employees list (dicts), coerce back to ids-or-"all"
    if isinstance(pres_body["employee_ids"], list) and pres_body["employee_ids"] and isinstance(pres_body["employee_ids"][0], dict):
        pres_body["employee_ids"] = [x.get("employee_id") for x in pres_body["employee_ids"] if x.get("employee_id")]
        if not pres_body["employee_ids"]:
            pres_body["employee_ids"] = "all"
    requests.put(f"{BASE}/api/hr/presence-check/settings", headers=admin_h, json=pres_body, timeout=15)
    # Cleanup today presence data
    db.hr_presence_checks.delete_many({"date": today})
    db.hr_presence_state.delete_one({"_id": f"plan_{today}"})
    db.notifications.delete_many({"user_id": admin_employee["user_id"], "type": "presence_check"})
    # Cleanup today attendance for admin employee
    db.hr_attendance.delete_many({"employee_id": admin_employee["id"], "date": today})
    # Remove any leftover TEST shifts
    doc = db.hr_settings.find_one({"_id": "global"}) or {}
    shifts = doc.get("shifts") or []
    kept = [s for s in shifts if not (s.get("name") or "").startswith("TEST_")]
    if len(kept) != len(shifts) and kept:
        db.hr_settings.update_one({"_id": "global"}, {"$set": {"shifts": kept}})


# ══════════════ Work-settings (shifts) ══════════════

@pytest.fixture(scope="module")
def evening_shift(admin_h):
    """Create an evening shift 16:00-20:00 for use across tests. Cleanup at end."""
    payload = {"name": "TEST_evening", "work_start": "16:00", "work_end": "20:00", "late_grace_minutes": 10}
    r = requests.post(f"{BASE}/api/hr/work-settings/shifts", headers=admin_h, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    sid = r.json()["shift_id"]
    yield sid
    requests.delete(f"{BASE}/api/hr/work-settings/shifts/{sid}", headers=admin_h, timeout=15)


class TestWorkSettingsRead:
    def test_get_admin(self, admin_h):
        r = requests.get(f"{BASE}/api/hr/work-settings", headers=admin_h, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j.get("shifts"), list) and len(j["shifts"]) >= 1
        s0 = j["shifts"][0]
        assert s0.get("is_main") is True
        assert "employees" in s0 and "employees_count" in s0
        assert j.get("can_edit") is True

    def test_get_salim(self, salim_h):
        # Salim (dean, no hr_manage_attendance) → 403 expected per hr_shifts:_can_read
        r = requests.get(f"{BASE}/api/hr/work-settings", headers=salim_h, timeout=15)
        # Spec allows 403 if Salim lacks hr_manage_attendance
        assert r.status_code in (200, 403), r.text
        if r.status_code == 200:
            # If he can read, can_edit must be False (no P_WORK_SETTINGS)
            assert r.json().get("can_edit") is False


class TestWorkSettingsMutations:
    def test_add_valid(self, admin_h, evening_shift):
        assert evening_shift.startswith("sh")
        r = requests.get(f"{BASE}/api/hr/work-settings", headers=admin_h, timeout=15)
        ids = [s["id"] for s in r.json()["shifts"]]
        assert evening_shift in ids

    def test_add_invalid_time(self, admin_h):
        r = requests.post(f"{BASE}/api/hr/work-settings/shifts", headers=admin_h,
                          json={"name": "TEST_bad", "work_start": "20:00", "work_end": "16:00"}, timeout=15)
        assert r.status_code == 400

    def test_add_empty_name(self, admin_h):
        r = requests.post(f"{BASE}/api/hr/work-settings/shifts", headers=admin_h,
                          json={"name": "  ", "work_start": "10:00", "work_end": "12:00"}, timeout=15)
        assert r.status_code == 400

    def test_update_shift(self, admin_h, evening_shift):
        r = requests.put(f"{BASE}/api/hr/work-settings/shifts/{evening_shift}", headers=admin_h,
                         json={"name": "TEST_evening", "work_start": "16:00", "work_end": "20:30",
                               "late_grace_minutes": 15}, timeout=15)
        assert r.status_code == 200
        # verify persisted
        g = requests.get(f"{BASE}/api/hr/work-settings", headers=admin_h, timeout=15).json()
        sh = next(s for s in g["shifts"] if s["id"] == evening_shift)
        assert sh["work_end"] == "20:30" and sh["late_grace_minutes"] == 15

    def test_delete_main_forbidden(self, admin_h):
        g = requests.get(f"{BASE}/api/hr/work-settings", headers=admin_h, timeout=15).json()
        main_id = g["shifts"][0]["id"]
        r = requests.delete(f"{BASE}/api/hr/work-settings/shifts/{main_id}", headers=admin_h, timeout=15)
        assert r.status_code == 400


class TestShiftAssignment:
    def test_assign_via_employee(self, admin_h, evening_shift, admin_employee):
        g = requests.get(f"{BASE}/api/hr/work-settings", headers=admin_h, timeout=15).json()
        main_id = g["shifts"][0]["id"]
        r = requests.put(f"{BASE}/api/hr/work-settings/employees/{admin_employee['id']}/shifts",
                         headers=admin_h, json={"shift_ids": [main_id, evening_shift]}, timeout=15)
        assert r.status_code == 200, r.text
        assert sorted(r.json()["shift_ids"]) == sorted([main_id, evening_shift])

    def test_assign_via_shift_preserves_others(self, admin_h, evening_shift, admin_employee, db):
        # Set employee's shifts to [main, evening] first
        g = requests.get(f"{BASE}/api/hr/work-settings", headers=admin_h, timeout=15).json()
        main_id = g["shifts"][0]["id"]
        requests.put(f"{BASE}/api/hr/work-settings/employees/{admin_employee['id']}/shifts",
                     headers=admin_h, json={"shift_ids": [main_id, evening_shift]}, timeout=15)
        # Replace evening membership with [admin] — should NOT drop main
        r = requests.put(f"{BASE}/api/hr/work-settings/shifts/{evening_shift}/employees",
                         headers=admin_h, json={"employee_ids": [admin_employee["id"]]}, timeout=15)
        assert r.status_code == 200
        emp = db.employees.find_one({"_id": ObjectId(admin_employee["id"])}, {"shift_ids": 1})
        assert main_id in (emp.get("shift_ids") or [])
        assert evening_shift in (emp.get("shift_ids") or [])


class TestPermissionsGating:
    def test_salim_put_general_forbidden(self, salim_h):
        r = requests.put(f"{BASE}/api/hr/work-settings/general", headers=salim_h,
                         json={"work_days": ALL_DAYS, "holidays": [], "allow_self_checkin": True,
                               "geofence_required": False, "annual_leave_days": 30}, timeout=15)
        assert r.status_code == 403

    def test_salim_post_shift_forbidden(self, salim_h):
        r = requests.post(f"{BASE}/api/hr/work-settings/shifts", headers=salim_h,
                          json={"name": "TEST_x", "work_start": "10:00", "work_end": "12:00"}, timeout=15)
        assert r.status_code == 403

    def test_salim_legacy_settings_forbidden(self, salim_h, orig_settings):
        r = requests.put(f"{BASE}/api/hr/attendance/settings", headers=salim_h, json=orig_settings, timeout=15)
        assert r.status_code == 403


class TestLegacySettingsMirrors:
    def test_mirror(self, admin_h):
        s = requests.get(f"{BASE}/api/hr/attendance/settings", headers=admin_h, timeout=15).json()
        w = requests.get(f"{BASE}/api/hr/work-settings", headers=admin_h, timeout=15).json()
        assert s["work_start"] == w["shifts"][0]["work_start"]
        assert s["work_end"] == w["shifts"][0]["work_end"]
        assert isinstance(s.get("shifts"), list) and len(s["shifts"]) >= len(w["shifts"])


# ══════════════ Multi-shift attendance ══════════════

@pytest.fixture(scope="module")
def two_shifts(admin_h, evening_shift, admin_employee):
    """Ensure admin employee has [main, evening]. Yield (main_id, evening_id)."""
    g = requests.get(f"{BASE}/api/hr/work-settings", headers=admin_h, timeout=15).json()
    main_id = g["shifts"][0]["id"]
    r = requests.put(f"{BASE}/api/hr/work-settings/employees/{admin_employee['id']}/shifts",
                     headers=admin_h, json={"shift_ids": [main_id, evening_shift]}, timeout=15)
    assert r.status_code == 200
    return main_id, evening_shift


class TestDailyAndMy:
    def test_daily_two_rows_for_employee(self, admin_h, two_shifts, admin_employee):
        today = dt.date.today().strftime("%Y-%m-%d")
        r = requests.get(f"{BASE}/api/hr/attendance/daily", headers=admin_h, params={"date": today}, timeout=20)
        assert r.status_code == 200
        rows = [row for row in r.json()["rows"] if row["employee_id"] == admin_employee["id"]]
        assert len(rows) == 2, f"expected 2 shift rows, got {len(rows)}"
        keys = {row["row_key"] for row in rows}
        main, evening = two_shifts
        assert f"{admin_employee['id']}:{main}" in keys
        assert f"{admin_employee['id']}:{evening}" in keys
        for row in rows:
            assert row.get("shift_id") in (main, evening)
            assert row.get("shift_name")

    def test_my_multi_shift(self, admin_h, two_shifts):
        r = requests.get(f"{BASE}/api/hr/attendance/my", headers=admin_h, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j.get("multi_shift") is True
        assert isinstance(j.get("today_shifts"), list) and len(j["today_shifts"]) == 2
        assert j.get("next_shift") is not None


class TestSelfCheckInOut:
    """Test check-in flows. NOTE: run in this order via method sorting alphabetically."""
    def test_01_first_check_in(self, admin_h, two_shifts, admin_employee, db):
        today = dt.date.today().strftime("%Y-%m-%d")
        # start clean today
        db.hr_attendance.delete_many({"employee_id": admin_employee["id"], "date": today})
        r = requests.post(f"{BASE}/api/hr/attendance/check-in", headers=admin_h, json={}, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("shift")

    def test_02_second_check_in_while_open(self, admin_h):
        r = requests.post(f"{BASE}/api/hr/attendance/check-in", headers=admin_h, json={}, timeout=20)
        assert r.status_code == 400
        assert "مفتوح" in r.json().get("detail", "")

    def test_03_check_out(self, admin_h):
        r = requests.post(f"{BASE}/api/hr/attendance/check-out", headers=admin_h, json={}, timeout=20)
        assert r.status_code == 200, r.text

    def test_04_check_in_other_shift(self, admin_h, two_shifts, admin_employee, db):
        today = dt.date.today().strftime("%Y-%m-%d")
        r = requests.post(f"{BASE}/api/hr/attendance/check-in", headers=admin_h, json={}, timeout=20)
        assert r.status_code == 200, r.text
        shifts_used = [rec["shift_id"] for rec in db.hr_attendance.find({"employee_id": admin_employee["id"], "date": today})]
        assert len(set(shifts_used)) == 2, f"shifts used: {shifts_used}"

    def test_05_check_out_second(self, admin_h):
        r = requests.post(f"{BASE}/api/hr/attendance/check-out", headers=admin_h, json={}, timeout=20)
        assert r.status_code == 200

    def test_06_no_more_check_in(self, admin_h):
        r = requests.post(f"{BASE}/api/hr/attendance/check-in", headers=admin_h, json={}, timeout=20)
        assert r.status_code == 400
        assert "كل فتراتك" in r.json().get("detail", "")

    def test_07_no_more_check_out(self, admin_h):
        r = requests.post(f"{BASE}/api/hr/attendance/check-out", headers=admin_h, json={}, timeout=20)
        assert r.status_code == 400
        assert "بالفعل" in r.json().get("detail", "")


class TestMarkAndDelete:
    def test_mark_only_evening(self, admin_h, two_shifts, admin_employee, db):
        main, evening = two_shifts
        today = dt.date.today().strftime("%Y-%m-%d")
        before_evening = db.hr_attendance.count_documents({"employee_id": admin_employee["id"], "date": today, "shift_id": evening})
        before_main = db.hr_attendance.count_documents({"employee_id": admin_employee["id"], "date": today, "shift_id": main})
        payload = {"date": today, "entries": [{"employee_id": admin_employee["id"], "status": "mission", "shift_id": evening}]}
        r = requests.post(f"{BASE}/api/hr/attendance/mark", headers=admin_h, json=payload, timeout=20)
        assert r.status_code == 200, r.text
        # No duplicate: evening still 1 record
        after_evening = db.hr_attendance.count_documents({"employee_id": admin_employee["id"], "date": today, "shift_id": evening})
        after_main = db.hr_attendance.count_documents({"employee_id": admin_employee["id"], "date": today, "shift_id": main})
        assert after_evening == max(1, before_evening)
        assert after_main == before_main  # unchanged
        rec = db.hr_attendance.find_one({"employee_id": admin_employee["id"], "date": today, "shift_id": evening})
        assert rec and rec["status"] == "mission"

    def test_delete_only_evening(self, admin_h, two_shifts, admin_employee, db):
        main, evening = two_shifts
        today = dt.date.today().strftime("%Y-%m-%d")
        r = requests.delete(f"{BASE}/api/hr/attendance/record/{admin_employee['id']}/{today}",
                            headers=admin_h, params={"shift_id": evening}, timeout=15)
        assert r.status_code == 200
        assert db.hr_attendance.count_documents({"employee_id": admin_employee["id"], "date": today, "shift_id": evening}) == 0
        # main untouched
        assert db.hr_attendance.count_documents({"employee_id": admin_employee["id"], "date": today, "shift_id": main}) >= 1


class TestMonthly:
    def test_shifts_count_and_due(self, admin_h, two_shifts, admin_employee):
        month = dt.date.today().strftime("%Y-%m")
        r = requests.get(f"{BASE}/api/hr/attendance/monthly", headers=admin_h, params={"month": month}, timeout=30)
        assert r.status_code == 200
        j = r.json()
        item = next((i for i in j["items"] if i["employee_id"] == admin_employee["id"]), None)
        assert item is not None
        assert item["shifts_count"] == 2
        # due_days ≈ work_days * 2 (leave/excused reduce it; here zero)
        assert item["due_days"] <= j["work_days"] * 2
        assert item["due_days"] >= max(0, j["work_days"] * 2 - 2)


# ══════════════ Delete shift also unassigns employees ══════════════

class TestShiftDeleteUnassigns:
    def test_delete_shift(self, admin_h, admin_employee, db):
        # create a temporary shift, assign employee, delete it → shift_ids should not contain it
        r = requests.post(f"{BASE}/api/hr/work-settings/shifts", headers=admin_h,
                          json={"name": "TEST_temp_del", "work_start": "09:00", "work_end": "11:00"}, timeout=15)
        assert r.status_code == 200
        tid = r.json()["shift_id"]
        # append to employee shifts
        emp = db.employees.find_one({"_id": ObjectId(admin_employee["id"])}, {"shift_ids": 1})
        current = list(emp.get("shift_ids") or [])
        new = current + [tid]
        requests.put(f"{BASE}/api/hr/work-settings/employees/{admin_employee['id']}/shifts",
                     headers=admin_h, json={"shift_ids": new}, timeout=15)
        # delete
        d = requests.delete(f"{BASE}/api/hr/work-settings/shifts/{tid}", headers=admin_h, timeout=15)
        assert d.status_code == 200
        emp2 = db.employees.find_one({"_id": ObjectId(admin_employee["id"])}, {"shift_ids": 1})
        assert tid not in (emp2.get("shift_ids") or [])


# ══════════════ Presence-check ══════════════

class TestPresenceSettings:
    def test_put_valid(self, admin_h, admin_employee):
        body = {"enabled": True, "checks_per_day": 2, "min_interval_minutes": 60,
                "response_timeout_minutes": 5, "employee_ids": [admin_employee["id"]], "only_checked_in": False}
        r = requests.put(f"{BASE}/api/hr/presence-check/settings", headers=admin_h, json=body, timeout=15)
        assert r.status_code == 200, r.text

    def test_invalid_checks_per_day(self, admin_h, admin_employee):
        body = {"enabled": True, "checks_per_day": 11, "min_interval_minutes": 60,
                "response_timeout_minutes": 5, "employee_ids": [admin_employee["id"]], "only_checked_in": False}
        r = requests.put(f"{BASE}/api/hr/presence-check/settings", headers=admin_h, json=body, timeout=15)
        assert r.status_code == 400

    def test_get_enriched(self, admin_h, admin_employee):
        r = requests.get(f"{BASE}/api/hr/presence-check/settings", headers=admin_h, timeout=15)
        assert r.status_code == 200
        j = r.json()
        if isinstance(j.get("employee_ids"), list):
            assert "employees" in j
            assert any((row.get("employee_id") == admin_employee["id"]) for row in j["employees"])


class TestPresenceRunAndSend:
    def test_run_now(self, admin_h):
        r = requests.post(f"{BASE}/api/hr/presence-check/run-now", headers=admin_h, timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert "plan" in j and "dispatch" in j
        assert "planned" in j["plan"]

    def test_send_now(self, admin_h, admin_employee, db):
        payload = {"employee_ids": [admin_employee["id"], "bad"], "timeout_minutes": 5}
        r = requests.post(f"{BASE}/api/hr/presence-check/send-now", headers=admin_h, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert len(j["created"]) == 1
        assert any(s.get("reason") and "غير موجود" in s["reason"] for s in j.get("skipped", []))
        # check has sent_at / expires_at
        cid = j["created"][0]
        c = db.hr_presence_checks.find_one({"_id": ObjectId(cid)})
        assert c and c.get("sent_at") and c.get("expires_at")
        # notification entry
        notif = db.notifications.find_one({"user_id": admin_employee["user_id"], "type": "presence_check"})
        assert notif and (notif.get("data") or {}).get("check_id") == cid

    def test_my_pending(self, admin_h):
        r = requests.get(f"{BASE}/api/hr/presence-check/my", headers=admin_h, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j.get("pending") is not None
        assert isinstance(j["pending"].get("remaining_seconds"), int)
        assert j["pending"]["remaining_seconds"] > 0


@pytest.fixture(scope="class")
def temp_location(admin_h):
    """Create an hr_location for out-of-range confirmation tests. Delete after."""
    payload = {"name": "TEST_PRES_LOC", "latitude": REF_LAT, "longitude": REF_LNG,
               "radius_meters": 200, "is_active": True}
    r = requests.post(f"{BASE}/api/hr/locations", headers=admin_h, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    lid = r.json()["location"]["id"]
    yield lid
    requests.delete(f"{BASE}/api/hr/locations/{lid}", headers=admin_h, timeout=10)


class TestPresenceConfirm:
    def _pending_id(self, admin_h):
        r = requests.get(f"{BASE}/api/hr/presence-check/my", headers=admin_h, timeout=15)
        j = r.json()
        return (j.get("pending") or {}).get("id")

    def test_biometric_failed(self, admin_h):
        cid = self._pending_id(admin_h)
        assert cid, "no pending check"
        r = requests.post(f"{BASE}/api/hr/presence-check/{cid}/confirm", headers=admin_h,
                          json={"latitude": REF_LAT, "longitude": REF_LNG, "biometric_verified": False}, timeout=15)
        assert r.status_code == 403
        assert "هويتك" in r.json().get("detail", "")

    def test_no_coords(self, admin_h):
        cid = self._pending_id(admin_h)
        assert cid
        r = requests.post(f"{BASE}/api/hr/presence-check/{cid}/confirm", headers=admin_h,
                          json={"biometric_verified": True}, timeout=15)
        assert r.status_code == 400

    def test_out_of_range(self, admin_h, temp_location):
        cid = self._pending_id(admin_h)
        assert cid
        r = requests.post(f"{BASE}/api/hr/presence-check/{cid}/confirm", headers=admin_h,
                          json={"latitude": FAR_LAT, "longitude": FAR_LNG, "biometric_verified": True}, timeout=15)
        assert r.status_code == 403, r.text
        assert "خارج نطاق" in r.json().get("detail", "")

    def test_in_range_ok_then_repeat(self, admin_h, temp_location):
        cid = self._pending_id(admin_h)
        assert cid
        r = requests.post(f"{BASE}/api/hr/presence-check/{cid}/confirm", headers=admin_h,
                          json={"latitude": REF_LAT, "longitude": REF_LNG, "biometric_verified": True}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "confirmed"
        # second confirm -> 400 (already closed)
        r2 = requests.post(f"{BASE}/api/hr/presence-check/{cid}/confirm", headers=admin_h,
                           json={"latitude": REF_LAT, "longitude": REF_LNG, "biometric_verified": True}, timeout=15)
        assert r2.status_code == 400


class TestPresenceReportAndInternal:
    def test_report(self, admin_h, admin_employee):
        today = dt.date.today().strftime("%Y-%m-%d")
        r = requests.get(f"{BASE}/api/hr/presence-check/report", headers=admin_h, params={"date": today}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "summary" in j and "rows" in j
        assert isinstance(j["summary"].get("total"), int)
        # rows enriched with employee_name (if any rows exist for this employee)
        our = [r for r in j["rows"] if r.get("employee_id") == admin_employee["id"]]
        if our:
            assert our[0].get("employee_name") is not None

    def test_internal_run_requires_key(self):
        r = requests.post(f"{BASE}/api/hr/presence-check/run", timeout=15)
        assert r.status_code == 401

    def test_internal_run_with_key(self):
        if not INTERNAL_KEY:
            pytest.skip("no internal key")
        r = requests.post(f"{BASE}/api/hr/presence-check/run", headers={"X-Internal-Key": INTERNAL_KEY}, timeout=30)
        assert r.status_code == 200
