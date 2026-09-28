"""Backend tests for HR Geofencing feature (locations, exemptions, check-in/out, report).

Cleans up:
- hr_locations named starting with 'GEOTEST'
- hr_attendance records created for admin's linked employee today
- temporary employee record if we created it
- exemptions we added
- restores hr settings (geofence_required, work_days) to original values
"""
import os
import datetime as dt
import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.strip().startswith("REACT_APP_BACKEND_URL"):
                    return line.strip().split("=", 1)[1].strip()
    except Exception:
        return None
    return None

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL not set"
ADMIN = {"username": "admin", "password": "admin123"}
SALIM = {"username": "Salim", "password": "test1234"}

# Reference coords (Ahgaff-like point)
REF_LAT = 15.9333
REF_LNG = 48.7889
# Offset ~33m north
NEAR_LAT = REF_LAT + 0.0003
NEAR_LNG = REF_LNG
# ~6km away
FAR_LAT = REF_LAT + 0.06
FAR_LNG = REF_LNG

AR_DAYS = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]


def login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
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
def orig_settings(admin_h):
    r = requests.get(f"{BASE}/api/hr/attendance/settings", headers=admin_h, timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def today_workday(admin_h, orig_settings):
    """Ensure today is a work day; return callable to restore."""
    today_ar = AR_DAYS[dt.date.today().weekday()]
    wd = list(orig_settings.get("work_days") or [])
    changed = False
    if today_ar not in wd:
        new_wd = wd + [today_ar]
        payload = {**orig_settings, "work_days": new_wd}
        r = requests.put(f"{BASE}/api/hr/attendance/settings", headers=admin_h, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        changed = True
    yield today_ar
    if changed:
        requests.put(f"{BASE}/api/hr/attendance/settings", headers=admin_h, json=orig_settings, timeout=15)


@pytest.fixture(scope="module")
def admin_employee(admin_h):
    """Ensure admin user has a linked employee record. Return (emp_id, created_temp bool).
    Uses direct MongoDB write because create_employee endpoint forces user_id=None.
    """
    from pymongo import MongoClient
    from bson import ObjectId
    mc = MongoClient("mongodb://localhost:27017")
    db = mc["test_database"]
    # find admin user id via /users
    r = requests.get(f"{BASE}/api/users", headers=admin_h, params={"search": "admin"}, timeout=15)
    assert r.status_code == 200
    users = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    admin_user = next((u for u in users if u.get("username") == "admin"), None)
    assert admin_user, "admin user not found"
    admin_uid = admin_user["id"]
    # existing?
    existing = db.employees.find_one({"user_id": admin_uid})
    if existing:
        yield {"id": str(existing["_id"]), "created": False}
        return
    # insert directly
    doc = {"full_name": "TEST_ADMIN_EMP", "user_id": admin_uid, "employee_no": "TESTGEO" + dt.datetime.now().strftime("%H%M%S"),
           "job_title": "test", "is_active": True, "created_at": _now_utc(), "created_by_name": "test"}
    ins = db.employees.insert_one(doc)
    yield {"id": str(ins.inserted_id), "created": True}
    db.employees.delete_one({"_id": ins.inserted_id})
    db.hr_attendance.delete_many({"employee_id": str(ins.inserted_id)})


def _now_utc():
    return dt.datetime.utcnow().isoformat()


@pytest.fixture(scope="module", autouse=True)
def cleanup_after(admin_h, orig_settings):
    yield
    # Restore settings
    requests.put(f"{BASE}/api/hr/attendance/settings", headers=admin_h, json=orig_settings, timeout=15)
    # Delete any GEOTEST locations
    r = requests.get(f"{BASE}/api/hr/locations", headers=admin_h, timeout=15)
    if r.status_code == 200:
        for l in r.json().get("locations", []):
            if (l.get("name") or "").startswith("GEOTEST"):
                requests.delete(f"{BASE}/api/hr/locations/{l['id']}", headers=admin_h, timeout=10)


# =================== Locations CRUD ===================

@pytest.fixture(scope="module")
def loc_id(admin_h):
    payload = {"name": "GEOTEST_MAIN", "latitude": REF_LAT, "longitude": REF_LNG,
               "radius_meters": 200, "is_active": True, "description": "test"}
    r = requests.post(f"{BASE}/api/hr/locations", headers=admin_h, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    lid = r.json()["location"]["id"]
    yield lid
    requests.delete(f"{BASE}/api/hr/locations/{lid}", headers=admin_h, timeout=10)


class TestLocationsCRUD:
    def test_create_ok(self, loc_id):
        assert loc_id

    def test_list(self, admin_h, loc_id):
        r = requests.get(f"{BASE}/api/hr/locations", headers=admin_h, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "locations" in j and "geofence_required" in j
        assert any(l["id"] == loc_id for l in j["locations"])

    def test_validate_empty_name(self, admin_h):
        r = requests.post(f"{BASE}/api/hr/locations", headers=admin_h,
                          json={"name": "  ", "latitude": REF_LAT, "longitude": REF_LNG, "radius_meters": 200}, timeout=15)
        assert r.status_code == 400

    def test_validate_radius_low(self, admin_h):
        r = requests.post(f"{BASE}/api/hr/locations", headers=admin_h,
                          json={"name": "GEOTEST_bad", "latitude": REF_LAT, "longitude": REF_LNG, "radius_meters": 10}, timeout=15)
        assert r.status_code == 400

    def test_validate_radius_high(self, admin_h):
        r = requests.post(f"{BASE}/api/hr/locations", headers=admin_h,
                          json={"name": "GEOTEST_bad2", "latitude": REF_LAT, "longitude": REF_LNG, "radius_meters": 9999}, timeout=15)
        assert r.status_code == 400

    def test_update(self, admin_h, loc_id):
        r = requests.put(f"{BASE}/api/hr/locations/{loc_id}", headers=admin_h,
                         json={"name": "GEOTEST_MAIN", "latitude": REF_LAT, "longitude": REF_LNG,
                               "radius_meters": 250, "is_active": True, "description": "upd"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["location"]["radius_meters"] == 250

    def test_update_404(self, admin_h):
        r = requests.put(f"{BASE}/api/hr/locations/507f1f77bcf86cd799439011", headers=admin_h,
                         json={"name": "x", "latitude": 0, "longitude": 0, "radius_meters": 100}, timeout=15)
        assert r.status_code == 404

    def test_delete_404(self, admin_h):
        r = requests.delete(f"{BASE}/api/hr/locations/507f1f77bcf86cd799439011", headers=admin_h, timeout=15)
        assert r.status_code == 404


# =================== /active + haversine ===================

class TestActive:
    def test_active_in_range(self, admin_h, loc_id):
        r = requests.get(f"{BASE}/api/hr/locations/active",
                         params={"lat": NEAR_LAT, "lng": NEAR_LNG, "accuracy": 5}, headers=admin_h, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "geofence_required" in j and "is_exempt" in j
        assert j["in_any_range"] is True
        near = next((l for l in j["locations"] if l["id"] == loc_id), None)
        assert near and near["in_range"] is True
        assert 20 <= near["distance_m"] <= 60  # ~33m

    def test_active_out_of_range(self, admin_h, loc_id):
        r = requests.get(f"{BASE}/api/hr/locations/active",
                         params={"lat": FAR_LAT, "lng": FAR_LNG, "accuracy": 5}, headers=admin_h, timeout=15)
        assert r.status_code == 200
        j = r.json()
        near = next((l for l in j["locations"] if l["id"] == loc_id), None)
        assert near and near["in_range"] is False
        assert near["distance_m"] > 3000


# =================== Check-in / Check-out ===================

def _clear_today(admin_h, emp_id):
    from pymongo import MongoClient
    mc = MongoClient("mongodb://localhost:27017")
    db = mc["test_database"]
    db.hr_attendance.delete_many({"employee_id": str(emp_id), "date": dt.date.today().isoformat()})


class TestCheckInOut:
    def test_out_of_range_403(self, admin_h, loc_id, admin_employee, today_workday):
        _clear_today(admin_h, admin_employee["id"])
        r = requests.post(f"{BASE}/api/hr/attendance/check-in", headers=admin_h,
                          json={"latitude": FAR_LAT, "longitude": FAR_LNG, "accuracy": 5}, timeout=15)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"
        assert "خارج نطاق العمل" in r.json().get("detail", "")

    def test_in_range_ok(self, admin_h, loc_id, admin_employee, today_workday):
        _clear_today(admin_h, admin_employee["id"])
        r = requests.post(f"{BASE}/api/hr/attendance/check-in", headers=admin_h,
                          json={"latitude": NEAR_LAT, "longitude": NEAR_LNG, "accuracy": 5}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["location"]["status"] == "in_range"
        # check-out in range too
        r2 = requests.post(f"{BASE}/api/hr/attendance/check-out", headers=admin_h,
                           json={"latitude": NEAR_LAT, "longitude": NEAR_LNG, "accuracy": 5}, timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json()["location"]["status"] == "in_range"

    def test_no_location_ok(self, admin_h, loc_id, admin_employee, today_workday):
        _clear_today(admin_h, admin_employee["id"])
        r = requests.post(f"{BASE}/api/hr/attendance/check-in", headers=admin_h, json={}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["location"]["status"] == "no_location"


# =================== Settings toggle geofence_required ===================

class TestSettingsToggle:
    def test_disable_allows_out_of_range(self, admin_h, orig_settings, loc_id, admin_employee, today_workday):
        _clear_today(admin_h, admin_employee["id"])
        payload = {**orig_settings, "geofence_required": False}
        # ensure today is workday
        wd = list(payload.get("work_days") or [])
        today_ar = AR_DAYS[dt.date.today().weekday()]
        if today_ar not in wd:
            wd.append(today_ar)
        payload["work_days"] = wd
        r = requests.put(f"{BASE}/api/hr/attendance/settings", headers=admin_h, json=payload, timeout=15)
        assert r.status_code == 200
        try:
            r2 = requests.post(f"{BASE}/api/hr/attendance/check-in", headers=admin_h,
                               json={"latitude": FAR_LAT, "longitude": FAR_LNG, "accuracy": 5}, timeout=15)
            assert r2.status_code == 200, r2.text
            assert r2.json()["location"]["status"] == "out_of_range"
        finally:
            # restore geofence_required
            restore = {**orig_settings, "work_days": payload["work_days"]}
            requests.put(f"{BASE}/api/hr/attendance/settings", headers=admin_h, json=restore, timeout=15)


# =================== Exemptions ===================

class TestExemptions:
    def test_non_admin_forbidden(self, salim_h, admin_employee):
        r = requests.put(f"{BASE}/api/hr/locations/exemptions/{admin_employee['id']}",
                         headers=salim_h, json={"exempt": True, "reason": "x"}, timeout=15)
        assert r.status_code == 403

    def test_admin_set_and_list_and_unset(self, admin_h, admin_employee, loc_id, today_workday):
        eid = admin_employee["id"]
        # set
        r = requests.put(f"{BASE}/api/hr/locations/exemptions/{eid}", headers=admin_h,
                        json={"exempt": True, "reason": "GEOTEST_reason"}, timeout=15)
        assert r.status_code == 200, r.text
        # list
        r2 = requests.get(f"{BASE}/api/hr/locations/exemptions", headers=admin_h, timeout=15)
        assert r2.status_code == 200
        items = r2.json()["items"]
        assert any(str(x["employee_id"]) == str(eid) for x in items)
        row = next(x for x in items if str(x["employee_id"]) == str(eid))
        assert "employee_name" in row
        # exempt user out-of-range should be 200 with exempt=true
        _clear_today(admin_h, eid)
        r3 = requests.post(f"{BASE}/api/hr/attendance/check-in", headers=admin_h,
                           json={"latitude": FAR_LAT, "longitude": FAR_LNG, "accuracy": 5}, timeout=15)
        assert r3.status_code == 200, r3.text
        assert r3.json()["location"].get("exempt") is True
        # unset
        r4 = requests.put(f"{BASE}/api/hr/locations/exemptions/{eid}", headers=admin_h,
                         json={"exempt": False}, timeout=15)
        assert r4.status_code == 200
        r5 = requests.get(f"{BASE}/api/hr/locations/exemptions", headers=admin_h, timeout=15)
        assert not any(str(x["employee_id"]) == str(eid) for x in r5.json()["items"])


# =================== Report ===================

class TestReport:
    def test_report_shape(self, admin_h):
        r = requests.get(f"{BASE}/api/hr/locations/report",
                         params={"date": dt.date.today().isoformat()}, headers=admin_h, timeout=15)
        assert r.status_code == 200
        j = r.json()
        for k in ("date", "summary", "rows", "locations", "status_labels"):
            assert k in j
        for k in ("in_range", "out_of_range", "no_location", "exempt", "manual"):
            assert k in j["summary"]


# =================== /my geofence ===================

class TestMyGeofence:
    def test_my(self, admin_h, admin_employee):
        r = requests.get(f"{BASE}/api/hr/attendance/my", headers=admin_h, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "geofence" in j
        for k in ("required", "exempt", "locations_count"):
            assert k in j["geofence"]
