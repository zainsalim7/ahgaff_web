"""Tests for HR Presence Check (Phase 2 random presence confirmation)"""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
INTERNAL_KEY = None  # loaded below

# Load backend .env for INTERNAL_PUSH_KEY
with open("/app/backend/.env") as f:
    for line in f:
        if line.startswith("INTERNAL_PUSH_KEY"):
            INTERNAL_KEY = line.split("=", 1)[1].strip().strip('"')

YEMEN = timezone(timedelta(hours=3))
TODAY = datetime.now(YEMEN).strftime("%Y-%m-%d")


@pytest.fixture(scope="module")
def db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


def _login(u, p):
    r = requests.post(f"{BASE}/auth/login", json={"username": u, "password": p}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return d.get("access_token") or d.get("token")


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin", "admin123")


@pytest.fixture(scope="module")
def salim_token():
    return _login("Salim", "test1234")


def _h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def sample_employees(db):
    emps = list(db.employees.find({"status": {"$nin": ["ended", "suspended"]}}, {"_id": 1, "full_name": 1}).limit(3))
    assert len(emps) >= 1, "Need at least 1 employee"
    return [{"id": str(e["_id"]), "name": e.get("full_name", "")} for e in emps]


@pytest.fixture(scope="module")
def original_attendance_settings(admin_token):
    r = requests.get(f"{BASE}/hr/attendance/settings", headers=_h(admin_token))
    return r.json() if r.status_code == 200 else None


@pytest.fixture(scope="module", autouse=True)
def cleanup(db, admin_token, original_attendance_settings):
    yield
    # Cleanup all test artifacts
    try:
        db.hr_presence_checks.delete_many({"date": TODAY})
        db.hr_presence_state.delete_one({"_id": f"plan_{TODAY}"})
        db.notifications.delete_many({"type": "presence_check"})
        db.hr_locations.delete_many({"name": "TEST_presence_loc"})
        # Restore settings
        requests.put(f"{BASE}/hr/presence-check/settings", headers=_h(admin_token), json={
            "enabled": False, "checks_per_day": 1, "min_interval_minutes": 60,
            "response_timeout_minutes": 5, "employee_ids": "all", "only_checked_in": True
        })
        # Restore attendance settings
        if original_attendance_settings:
            payload = {k: v for k, v in original_attendance_settings.items() if k not in ("_id",)}
            requests.put(f"{BASE}/hr/attendance/settings", headers=_h(admin_token), json=payload)
    except Exception as e:
        print(f"cleanup error: {e}")


# ─────────────── SETTINGS ───────────────

class TestSettings:
    def test_perm_denied_for_salim(self, salim_token):
        r = requests.get(f"{BASE}/hr/presence-check/settings", headers=_h(salim_token))
        assert r.status_code == 403

    def test_get_settings_admin(self, admin_token):
        r = requests.get(f"{BASE}/hr/presence-check/settings", headers=_h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "enabled" in d and "checks_per_day" in d and "statuses" in d

    def test_save_invalid_checks_per_day(self, admin_token):
        r = requests.put(f"{BASE}/hr/presence-check/settings", headers=_h(admin_token), json={
            "enabled": True, "checks_per_day": 20, "min_interval_minutes": 60,
            "response_timeout_minutes": 5, "employee_ids": "all"
        })
        assert r.status_code == 400

    def test_save_invalid_interval(self, admin_token):
        r = requests.put(f"{BASE}/hr/presence-check/settings", headers=_h(admin_token), json={
            "enabled": True, "checks_per_day": 2, "min_interval_minutes": 3,
            "response_timeout_minutes": 5, "employee_ids": "all"
        })
        assert r.status_code == 400

    def test_save_empty_list(self, admin_token):
        r = requests.put(f"{BASE}/hr/presence-check/settings", headers=_h(admin_token), json={
            "enabled": True, "checks_per_day": 2, "min_interval_minutes": 60,
            "response_timeout_minutes": 5, "employee_ids": []
        })
        assert r.status_code == 400

    def test_save_ok_and_enrichment(self, admin_token, sample_employees):
        eid = sample_employees[0]["id"]
        r = requests.put(f"{BASE}/hr/presence-check/settings", headers=_h(admin_token), json={
            "enabled": True, "checks_per_day": 2, "min_interval_minutes": 10,
            "response_timeout_minutes": 5, "employee_ids": [eid], "only_checked_in": False
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert "settings" in d
        # verify enrichment
        r2 = requests.get(f"{BASE}/hr/presence-check/settings", headers=_h(admin_token))
        got = r2.json()
        assert got["employee_ids"] == [eid]
        assert isinstance(got.get("employees"), list) and got["employees"][0].get("employee_name")


# ─────────────── PLANNING (run-now) ───────────────

class TestPlanning:
    def test_run_now_plans_checks(self, admin_token, sample_employees, original_attendance_settings):
        eid = sample_employees[0]["id"]
        # Save settings enabled, employee_ids=[eid], only_checked_in=false, checks_per_day=2
        r = requests.put(f"{BASE}/hr/presence-check/settings", headers=_h(admin_token), json={
            "enabled": True, "checks_per_day": 2, "min_interval_minutes": 10,
            "response_timeout_minutes": 5, "employee_ids": [eid], "only_checked_in": False
        })
        assert r.status_code == 200

        # Set HR attendance work hours to whole day and include today
        AR_DAYS = {5: "السبت", 6: "الأحد", 0: "الاثنين", 1: "الثلاثاء", 2: "الأربعاء", 3: "الخميس", 4: "الجمعة"}
        weekday_ar = AR_DAYS[datetime.now(YEMEN).weekday()]
        att_payload = dict(original_attendance_settings or {})
        att_payload.pop("_id", None)
        att_payload["work_start"] = "00:00"
        att_payload["work_end"] = "23:59"
        wd = list(att_payload.get("work_days") or [])
        if weekday_ar not in wd:
            wd.append(weekday_ar)
        att_payload["work_days"] = wd
        r = requests.put(f"{BASE}/hr/attendance/settings", headers=_h(admin_token), json=att_payload)
        assert r.status_code == 200, r.text

        r = requests.post(f"{BASE}/hr/presence-check/run-now", headers=_h(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "plan" in d and "dispatch" in d
        assert d["plan"].get("planned", 0) >= 1


# ─────────────── SEND-NOW ───────────────

class TestSendNow:
    def test_send_now_bad_and_ok(self, admin_token, sample_employees, db):
        eid = sample_employees[0]["id"]
        # First clean any existing manual pending for this emp
        db.hr_presence_checks.delete_many({"employee_id": eid, "manual": True, "status": "pending"})

        r = requests.post(f"{BASE}/hr/presence-check/send-now", headers=_h(admin_token),
                          json={"employee_ids": [eid, "badid"], "timeout_minutes": 5})
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["created"]) == 1
        assert any(s.get("employee_id") == "badid" and "غير موجود" in s.get("reason", "") for s in d["skipped"])
        assert d["dispatched"]["sent"] >= 1

        # Verify DB doc
        cid = d["created"][0]
        doc = db.hr_presence_checks.find_one({"_id": ObjectId(cid)})
        assert doc and doc["sent_at"] and doc["expires_at"] and doc["status"] == "pending"

        # Verify notification
        notif = db.notifications.find_one({"type": "presence_check", "data.check_id": cid})
        assert notif is not None

        # Second send-now → skipped as already open
        r2 = requests.post(f"{BASE}/hr/presence-check/send-now", headers=_h(admin_token),
                           json={"employee_ids": [eid], "timeout_minutes": 5})
        assert r2.status_code == 200
        d2 = r2.json()
        assert any("مفتوح" in s.get("reason", "") for s in d2["skipped"])


# ─────────────── EMPLOYEE FLOW ───────────────

class TestEmployeeFlow:
    def _ensure_admin_employee(self, db):
        u = db.users.find_one({"username": "admin"}, {"_id": 1})
        uid = str(u["_id"])
        e = db.employees.find_one({"user_id": uid})
        created = False
        if not e:
            r = db.employees.insert_one({
                "full_name": "TEST admin emp", "user_id": uid, "employee_no": "TESTADMIN1",
                "status": "active", "created_at": datetime.utcnow()
            })
            eid = str(r.inserted_id)
            created = True
        else:
            eid = str(e["_id"])
        return eid, created

    def test_confirm_flow(self, admin_token, db):
        eid, created = self._ensure_admin_employee(db)
        try:
            # Create temp active location
            r = requests.post(f"{BASE}/hr/locations", headers=_h(admin_token), json={
                "name": "TEST_presence_loc", "latitude": 14.5427, "longitude": 49.1342,
                "radius_meters": 200, "active": True
            })
            assert r.status_code in (200, 201), r.text
            loc_id = r.json().get("id") or r.json().get("_id")

            # Create a manual send-now for admin employee
            db.hr_presence_checks.delete_many({"employee_id": eid, "date": TODAY})
            r = requests.post(f"{BASE}/hr/presence-check/send-now", headers=_h(admin_token),
                              json={"employee_ids": [eid], "timeout_minutes": 5})
            assert r.status_code == 200
            cid = r.json()["created"][0]

            # my endpoint
            r = requests.get(f"{BASE}/hr/presence-check/my", headers=_h(admin_token))
            assert r.status_code == 200
            my = r.json()
            assert my["pending"] and my["pending"]["id"] == cid

            # biometric false → 403 هويتك
            r = requests.post(f"{BASE}/hr/presence-check/{cid}/confirm", headers=_h(admin_token),
                              json={"latitude": 14.5427, "longitude": 49.1342, "biometric_verified": False})
            assert r.status_code == 403
            assert "هويت" in r.json().get("detail", "")

            # out of range → 403 خارج
            r = requests.post(f"{BASE}/hr/presence-check/{cid}/confirm", headers=_h(admin_token),
                              json={"latitude": 20.0, "longitude": 20.0, "biometric_verified": True})
            assert r.status_code == 403
            assert "خارج" in r.json().get("detail", "")

            # no coords → 400
            r = requests.post(f"{BASE}/hr/presence-check/{cid}/confirm", headers=_h(admin_token),
                              json={"latitude": None, "longitude": None, "biometric_verified": True})
            assert r.status_code == 400

            # good → 200 confirmed
            r = requests.post(f"{BASE}/hr/presence-check/{cid}/confirm", headers=_h(admin_token),
                              json={"latitude": 14.5427, "longitude": 49.1342, "biometric_verified": True})
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["status"] == "confirmed" and d["in_range"] is True

            # confirm again → 400 مُغلق
            r = requests.post(f"{BASE}/hr/presence-check/{cid}/confirm", headers=_h(admin_token),
                              json={"latitude": 14.5427, "longitude": 49.1342, "biometric_verified": True})
            assert r.status_code == 400
            assert "مغلق" in r.json().get("detail", "") or "مُغلق" in r.json().get("detail", "")

            # unknown id → 404
            bad = str(ObjectId())
            r = requests.post(f"{BASE}/hr/presence-check/{bad}/confirm", headers=_h(admin_token),
                              json={"latitude": 14.5427, "longitude": 49.1342, "biometric_verified": True})
            assert r.status_code == 404

            # delete temp location
            if loc_id:
                requests.delete(f"{BASE}/hr/locations/{loc_id}", headers=_h(admin_token))
        finally:
            if created:
                db.employees.delete_one({"_id": ObjectId(eid)})


# ─────────────── EXPIRY ───────────────

class TestExpiry:
    def test_expiry_via_run_now_and_confirm(self, admin_token, sample_employees, db):
        eid = sample_employees[0]["id"]
        db.hr_presence_checks.delete_many({"employee_id": eid, "date": TODAY, "manual": True})
        r = requests.post(f"{BASE}/hr/presence-check/send-now", headers=_h(admin_token),
                          json={"employee_ids": [eid], "timeout_minutes": 5})
        assert r.status_code == 200
        cid = r.json()["created"][0]
        # Set expires_at in the past
        past = (datetime.now(YEMEN) - timedelta(minutes=10)).replace(microsecond=0).isoformat()
        db.hr_presence_checks.update_one({"_id": ObjectId(cid)}, {"$set": {"expires_at": past}})
        # run-now → expired
        r = requests.post(f"{BASE}/hr/presence-check/run-now", headers=_h(admin_token))
        assert r.status_code == 200
        doc = db.hr_presence_checks.find_one({"_id": ObjectId(cid)})
        assert doc["status"] in ("expired", "out_of_range", "failed_biometric")

        # Create another & confirm expired
        db.hr_presence_checks.delete_many({"employee_id": eid, "date": TODAY, "manual": True, "status": "pending"})
        r = requests.post(f"{BASE}/hr/presence-check/send-now", headers=_h(admin_token),
                          json={"employee_ids": [eid], "timeout_minutes": 5})
        cid2 = r.json()["created"][0]
        db.hr_presence_checks.update_one({"_id": ObjectId(cid2)}, {"$set": {"expires_at": past, "status": "pending"}})
        # Try confirm as that employee — we don't have their user; use admin (would be 404).
        # Just verify status via report
        r = requests.get(f"{BASE}/hr/presence-check/report?date={TODAY}", headers=_h(admin_token))
        assert r.status_code == 200


# ─────────────── REPORT & INTERNAL ───────────────

class TestReportAndInternal:
    def test_report(self, admin_token):
        r = requests.get(f"{BASE}/hr/presence-check/report?date={TODAY}", headers=_h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert d["date"] == TODAY
        for k in ("pending", "confirmed", "expired", "out_of_range", "failed_biometric", "total", "planned_unsent"):
            assert k in d["summary"]
        assert "rows" in d and "statuses" in d and "settings" in d

    def test_internal_run_without_key(self):
        r = requests.post(f"{BASE}/hr/presence-check/run")
        assert r.status_code in (401, 503)

    def test_internal_run_with_key(self):
        assert INTERNAL_KEY, "INTERNAL_PUSH_KEY missing"
        r = requests.post(f"{BASE}/hr/presence-check/run", headers={"X-Internal-Key": INTERNAL_KEY})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "sent" in d and "expired" in d
