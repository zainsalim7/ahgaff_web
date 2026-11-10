# Offline Sync Report — diagnosis + manual override (POST /api/reports/offline-sync/{id}/override)
import os
import pytest
import requests
from datetime import datetime, timezone
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

_env = {}
with open("/app/backend/.env") as f:
    for line in f:
        if "=" in line:
            k, v = line.strip().split("=", 1)
            _env[k] = v.strip('"')
mdb = MongoClient(_env["MONGO_URL"])[_env["DB_NAME"]]

COURSE_ID = "698f0000d803b27aab0120af"  # دراسات حضرموت — teacher180156
TEST_STUDENT = "TESTSTUDENT1"


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        pytest.skip(f"login failed for {u}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin_h():
    return _login("admin", "admin123")


@pytest.fixture(scope="module")
def teacher_h():
    return _login("teacher180156", "teacher123")


@pytest.fixture(scope="module")
def ctx():
    """Creates a dedicated TEST lecture (so override's delete_many cannot touch real data)."""
    lec = {"course_id": COURSE_ID, "date": "2026-11-02", "start_time": "08:00", "end_time": "09:00",
           "room": "TEST_OSR", "status": "scheduled"}
    lid = str(mdb.lectures.insert_one(lec).inserted_id)
    c = {"lecture_id": lid, "log_ids": []}
    yield c
    mdb.attendance.delete_many({"lecture_id": lid})
    mdb.attendance_operations.delete_many({"lecture_id": lid})
    mdb.offline_sync_log.delete_many({"lecture_id": lid})
    for x in c["log_ids"]:
        mdb.offline_sync_log.delete_one({"_id": ObjectId(x)})
    mdb.lectures.delete_one({"_id": ObjectId(lid)})


def _get_item(admin_h, log_id):
    r = requests.get(f"{API}/reports/offline-sync", headers=admin_h,
                     params={"start_date": "2026-10-01", "end_date": "2026-11-30"})
    assert r.status_code == 200
    return next((i for i in r.json()["items"] if i["id"] == log_id), None), r.json()


class TestOfflineSyncOverride:
    def test_real_sync_outside_window_logs_diagnosis_and_payload(self, teacher_h, admin_h, ctx):
        # device recorded at 2026-11-04 10:00 for a lecture on 2026-11-02 08-09 (age < 168h) -> window failure
        r = requests.post(f"{API}/attendance/session", headers=teacher_h, json={
            "lecture_id": ctx["lecture_id"], "records": [{"student_id": TEST_STUDENT, "status": "present"}],
            "notes": "TEST_notes", "offline_recorded_at": "2026-11-04T10:00:00+03:00"})
        print(r.status_code, r.text[:300])
        assert r.status_code == 400
        assert "خارج نافذة المحاضرة" in r.json()["detail"]
        log = mdb.offline_sync_log.find_one({"lecture_id": ctx["lecture_id"], "status": "failed"}, sort=[("_id", -1)])
        assert log is not None
        ctx["window_log"] = str(log["_id"])
        assert log["pending_payload"]["records"] == [{"student_id": TEST_STUDENT, "status": "present"}]
        assert "بعد نهاية نافذة السماح" in log["diagnosis"]
        item, _ = _get_item(admin_h, ctx["window_log"])
        assert item and item["can_override"] is True and item["diagnosis"] == log["diagnosis"]
        print("DIAG:", item["diagnosis"])

    def test_real_sync_older_than_max_hours_logs_diagnosis(self, teacher_h, admin_h, ctx):
        r = requests.post(f"{API}/attendance/session", headers=teacher_h, json={
            "lecture_id": ctx["lecture_id"], "records": [{"student_id": TEST_STUDENT, "status": "absent"}],
            "offline_recorded_at": "2026-10-01T08:30:00+03:00"})
        assert r.status_code == 400
        assert "أقدم من" in r.json()["detail"]
        log = mdb.offline_sync_log.find_one({"lecture_id": ctx["lecture_id"], "reason": {"$regex": "أقدم من"}})
        assert log and log.get("pending_payload") and log.get("diagnosis")
        ctx["age_log"] = str(log["_id"])
        print("AGE DIAG:", log["diagnosis"])

    def test_override_empty_reason_400(self, admin_h, ctx):
        r = requests.post(f"{API}/reports/offline-sync/{ctx['window_log']}/override", headers=admin_h, json={"reason": "   "})
        assert r.status_code == 400 and r.json()["detail"] == "سبب القبول اليدوي إلزامي"

    def test_override_missing_reason_field_422(self, admin_h, ctx):
        r = requests.post(f"{API}/reports/offline-sync/{ctx['window_log']}/override", headers=admin_h, json={})
        assert r.status_code == 422

    def test_override_invalid_and_unknown_id_404(self, admin_h):
        assert requests.post(f"{API}/reports/offline-sync/bad-id/override", headers=admin_h, json={"reason": "x"}).status_code == 404
        assert requests.post(f"{API}/reports/offline-sync/{ObjectId()}/override", headers=admin_h, json={"reason": "x"}).status_code == 404

    def test_non_admin_403(self, teacher_h, ctx):
        assert requests.get(f"{API}/reports/offline-sync", headers=teacher_h).status_code == 403
        r = requests.post(f"{API}/reports/offline-sync/{ctx['window_log']}/override", headers=teacher_h, json={"reason": "x"})
        assert r.status_code == 403

    def test_dean_403(self, ctx):
        h = _login("Salim", "test1234")
        assert requests.get(f"{API}/reports/offline-sync", headers=h).status_code == 403
        assert requests.post(f"{API}/reports/offline-sync/{ctx['window_log']}/override", headers=h, json={"reason": "x"}).status_code == 403

    def test_unauthenticated_rejected(self, ctx):
        assert requests.get(f"{API}/reports/offline-sync").status_code in (401, 403)

    def test_override_success_writes_attendance(self, admin_h, ctx):
        r = requests.post(f"{API}/reports/offline-sync/{ctx['window_log']}/override", headers=admin_h,
                          json={"reason": "TEST_تحقق ورقي"})
        assert r.status_code == 200, r.text
        assert r.json() == {"status": "overridden", "records_count": 1}
        att = list(mdb.attendance.find({"lecture_id": ctx["lecture_id"]}))
        assert len(att) == 1 and att[0]["student_id"] == TEST_STUDENT and att[0]["status"] == "present"
        assert att[0]["method"] == "manual_override" and att[0]["course_id"] == COURSE_ID
        lec = mdb.lectures.find_one({"_id": ObjectId(ctx["lecture_id"])})
        assert lec["status"] == "completed"
        op = mdb.attendance_operations.find_one({"lecture_id": ctx["lecture_id"]})
        assert op and op["manual_override_reason"] == "TEST_تحقق ورقي"
        item, data = _get_item(admin_h, ctx["window_log"])
        assert item["status"] == "overridden" and item["can_override"] is False
        assert item["overridden_by_name"] and item["override_reason"] == "TEST_تحقق ورقي"
        assert data["summary"]["overridden"] >= 1

    def test_override_twice_400(self, admin_h, ctx):
        r = requests.post(f"{API}/reports/offline-sync/{ctx['window_log']}/override", headers=admin_h, json={"reason": "again"})
        assert r.status_code == 400 and r.json()["detail"].startswith("هذا السجل ليس محاولة فاشلة")

    def test_failed_without_payload_cannot_override(self, admin_h, ctx):
        base = {"teacher_id": "698f671431cfba92c49a550e", "teacher_name": "أستاذ اختبار 180156",
                "course_id": COURSE_ID, "course_name": "TEST", "lecture_id": ctx["lecture_id"],
                "lecture_date": "2026-11-02", "lecture_start_time": "08:00", "lecture_end_time": "09:00",
                "offline_recorded_at": "2026-11-04T10:00:00", "synced_at": datetime.now(timezone.utc).isoformat(),
                "delay_seconds": 3600, "status": "failed", "reason": "TEST old", "records_count": 1}
        ids = []
        for extra in ({}, {"pending_payload": None}, {"pending_payload": {}}):
            ids.append(str(mdb.offline_sync_log.insert_one({**base, **extra}).inserted_id))
        ctx["log_ids"] += ids
        for lid in ids:
            item, _ = _get_item(admin_h, lid)
            assert item["can_override"] is False and item["diagnosis"] is None
            r = requests.post(f"{API}/reports/offline-sync/{lid}/override", headers=admin_h, json={"reason": "x"})
            assert r.status_code == 400
            assert r.json()["detail"] == "تعذّر التجاوز — بيانات المحاولة الأصلية غير محفوظة لهذا السجل"

    def test_success_status_cannot_override(self, admin_h, ctx):
        lid = str(mdb.offline_sync_log.insert_one({"lecture_id": ctx["lecture_id"], "status": "success",
                                                    "lecture_date": "2026-11-02", "synced_at": "2026-11-05T00:00:00",
                                                    "pending_payload": {"records": []}}).inserted_id)
        ctx["log_ids"].append(lid)
        item, _ = _get_item(admin_h, lid)
        assert item["can_override"] is False
        r = requests.post(f"{API}/reports/offline-sync/{lid}/override", headers=admin_h, json={"reason": "x"})
        assert r.status_code == 400

    def test_malformed_lecture_id_in_log(self, admin_h, ctx):
        # robustness: failed log pointing to non-ObjectId / deleted lecture
        lid1 = str(mdb.offline_sync_log.insert_one({"lecture_id": "not-an-oid", "status": "failed", "lecture_date": "2026-11-02",
                                                     "synced_at": "2026-11-05T00:00:00",
                                                     "pending_payload": {"records": [{"student_id": TEST_STUDENT, "status": "present"}]}}).inserted_id)
        lid2 = str(mdb.offline_sync_log.insert_one({"lecture_id": str(ObjectId()), "status": "failed", "lecture_date": "2026-11-02",
                                                     "synced_at": "2026-11-05T00:00:00",
                                                     "pending_payload": {"records": [{"student_id": TEST_STUDENT, "status": "present"}]}}).inserted_id)
        ctx["log_ids"] += [lid1, lid2]
        r2 = requests.post(f"{API}/reports/offline-sync/{lid2}/override", headers=admin_h, json={"reason": "x"})
        assert r2.status_code == 404
        r1 = requests.post(f"{API}/reports/offline-sync/{lid1}/override", headers=admin_h, json={"reason": "x"})
        print("malformed lecture_id status:", r1.status_code)
        assert r1.status_code in (400, 404), f"got {r1.status_code} (likely unhandled bson InvalidId -> 500)"
