# Regression tests: ghost-attendance fix — attendance.date must equal the lecture's actual date/start_time
# (POST /api/attendance/session, /api/attendance/single, attendance-changes approve), plus
# /api/admin/attendance-lookup lecture_change_history and course report endpoints.
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


def _load_env(path):
    out = {}
    with open(path) as f:
        for line in f:
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.strip().split("=", 1)
                out[k] = v.strip().strip('"')
    return out


_ENV = _load_env("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or _ENV["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME") or _ENV["DB_NAME"]
YEMEN = timezone(timedelta(hours=3))
REG_USER = "test_registrar"

mdb = MongoClient(MONGO_URL, tz_aware=True)[DB_NAME]
STATE = {"lectures": [], "students": [], "courses": [], "change_log": [], "orig_perms": None}


def _login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed for {u}: {r.status_code} {r.text[:200]}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _mk_lecture(course_id, start_dt, minutes=60, **extra):
    end_dt = start_dt + timedelta(minutes=minutes)
    doc = {
        "course_id": course_id,
        "date": start_dt.strftime("%Y-%m-%d"),
        "start_time": start_dt.strftime("%H:%M"),
        "end_time": end_dt.strftime("%H:%M"),
        "status": "scheduled",
        "room": "TEST_ROOM",
        "created_at": datetime.now(timezone.utc),
    }
    doc.update(extra)
    lid = str(mdb.lectures.insert_one(doc).inserted_id)
    STATE["lectures"].append(lid)
    return lid


def _lec_start(lid):
    lec = mdb.lectures.find_one({"_id": ObjectId(lid)})
    return datetime.strptime(f"{lec['date']} {lec['start_time']}", "%Y-%m-%d %H:%M").replace(tzinfo=YEMEN)


@pytest.fixture(scope="module", autouse=True)
def setup_data():
    now = datetime.now(YEMEN)
    cid = str(mdb.courses.insert_one({"name": "TEST_GhostAttendanceCourse", "code": "TEST_GHOST1",
                                      "teacher_id": None, "is_active": True,
                                      "created_at": datetime.now(timezone.utc)}).inserted_id)
    STATE["courses"].append(cid)
    STATE["course_id"] = cid
    for i in range(3):
        sid = str(mdb.students.insert_one({"full_name": f"TEST_GhostStudent_{i}", "student_id": f"TEST_GHOST_{i}",
                                           "is_active": True, "created_at": datetime.now(timezone.utc)}).inserted_id)
        STATE["students"].append(sid)
        mdb.enrollments.insert_one({"course_id": cid, "student_id": sid, "enrolled_at": datetime.now(timezone.utc)})

    # Old lecture (30 days ago) never opened
    old_start = (now - timedelta(days=30)).replace(hour=8, minute=0, second=0, microsecond=0)
    STATE["old_lec"] = _mk_lecture(cid, old_start)
    # Today on-time lecture (started 2 minutes ago)
    STATE["today_lec"] = _mk_lecture(cid, (now - timedelta(minutes=2)).replace(second=0, microsecond=0))
    # Today offline-sync lecture (started 5 minutes ago)
    STATE["offline_lec"] = _mk_lecture(cid, (now - timedelta(minutes=5)).replace(second=0, microsecond=0))
    # Old lecture for QR single
    STATE["single_lec"] = _mk_lecture(cid, (now - timedelta(days=25)).replace(hour=10, minute=0, second=0, microsecond=0))
    # Old completed lecture for approval flow (with existing record for student 0)
    appr_start = (now - timedelta(days=20)).replace(hour=9, minute=0, second=0, microsecond=0)
    STATE["appr_lec"] = _mk_lecture(cid, appr_start, status="completed", attendance_started_at=appr_start.isoformat())
    mdb.attendance.insert_one({"lecture_id": STATE["appr_lec"], "course_id": cid, "student_id": STATE["students"][0],
                               "status": "present", "date": appr_start, "recorded_by": "TEST", "method": "manual",
                               "created_at": appr_start})

    # Temporarily grant registrar edit/record attendance
    reg = mdb.users.find_one({"username": REG_USER})
    assert reg, "test_registrar missing"
    STATE["orig_perms"] = reg.get("permissions")
    STATE["reg_id"] = reg["_id"]
    mdb.users.update_one({"_id": reg["_id"]}, {"$set": {"permissions": list(set((reg.get("permissions") or []) + ["edit_attendance", "record_attendance"]))}})
    yield
    # ---- cleanup (only by ids we created) ----
    if STATE["orig_perms"] is None:
        mdb.users.update_one({"_id": reg["_id"]}, {"$unset": {"permissions": ""}})
    else:
        mdb.users.update_one({"_id": reg["_id"]}, {"$set": {"permissions": STATE["orig_perms"]}})
    lids = STATE["lectures"]
    mdb.attendance.delete_many({"lecture_id": {"$in": lids}})
    mdb.attendance_change_requests.delete_many({"lecture_id": {"$in": lids}})
    mdb.attendance_operations.delete_many({"lecture_id": {"$in": lids}})
    mdb.offline_sync_log.delete_many({"lecture_id": {"$in": lids}})
    mdb.lecture_change_log.delete_many({"_id": {"$in": STATE["change_log"]}})
    mdb.lectures.delete_many({"_id": {"$in": [ObjectId(x) for x in lids]}})
    mdb.enrollments.delete_many({"course_id": {"$in": STATE["courses"]}})
    mdb.notifications.delete_many({"student_id": {"$in": STATE["students"]}})
    mdb.students.delete_many({"_id": {"$in": [ObjectId(x) for x in STATE["students"]]}})
    mdb.courses.delete_many({"_id": {"$in": [ObjectId(x) for x in STATE["courses"]]}})


@pytest.fixture(scope="module")
def admin_h():
    return _login("admin", "admin123")


@pytest.fixture(scope="module")
def reg_h():
    return _login(REG_USER, "test1234")


def _records(status="absent"):
    return [{"student_id": s, "status": status} for s in STATE["students"]]


# --- Fix 1: late (registrar) recording of a 30-day-old lecture stores lecture date
def test_registrar_late_session_stores_lecture_date(reg_h):
    lid = STATE["old_lec"]
    r = requests.post(f"{BASE_URL}/api/attendance/session", headers=reg_h,
                      json={"lecture_id": lid, "records": _records("absent")}, timeout=60)
    assert r.status_code == 200, r.text
    recs = list(mdb.attendance.find({"lecture_id": lid}))
    assert len(recs) == 3
    exp = _lec_start(lid)
    today = datetime.now(YEMEN).date()
    for rec in recs:
        assert rec["date"] == exp, f"date={rec['date']} expected={exp}"
        assert rec["date"].astimezone(YEMEN).date() != today
        assert rec["created_at"].astimezone(YEMEN).date() == today
    assert mdb.lectures.find_one({"_id": ObjectId(lid)})["status"] == "completed"


# --- Non-regression: on-time recording by admin today
def test_on_time_session_admin(admin_h):
    lid = STATE["today_lec"]
    r = requests.post(f"{BASE_URL}/api/attendance/session", headers=admin_h,
                      json={"lecture_id": lid, "records": _records("present")}, timeout=60)
    assert r.status_code == 200, r.text
    assert "3" in r.json()["message"]
    recs = list(mdb.attendance.find({"lecture_id": lid}))
    assert len(recs) == 3
    exp = _lec_start(lid)
    for rec in recs:
        assert rec["date"] == exp
        assert rec["status"] == "present"
    assert mdb.lectures.find_one({"_id": ObjectId(lid)})["status"] == "completed"


# --- Non-regression: on-time re-edit (within edit window) still works
def test_on_time_session_admin_reedit(admin_h):
    lid = STATE["today_lec"]
    recs = _records("present")
    recs[0]["status"] = "absent"
    r = requests.post(f"{BASE_URL}/api/attendance/session", headers=admin_h,
                      json={"lecture_id": lid, "records": recs}, timeout=60)
    assert r.status_code == 200, r.text
    a = mdb.attendance.find_one({"lecture_id": lid, "student_id": STATE["students"][0]})
    assert a["status"] == "absent" and a["date"] == _lec_start(lid)


# --- Non-regression: on-time recording by a real teacher (course owner)
def test_on_time_session_teacher():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "teacher180156", "password": "teacher123"}, timeout=30)
    if r.status_code != 200:
        pytest.skip("teacher login failed")
    th = {"Authorization": f"Bearer {r.json()['access_token']}"}
    tuid = r.json()["user"]["id"]
    now = datetime.now(YEMEN)
    lid = _mk_lecture(STATE["course_id"], (now - timedelta(minutes=3)).replace(second=0, microsecond=0), teacher_id=tuid)
    mdb.courses.update_one({"_id": ObjectId(STATE["course_id"])}, {"$set": {"teacher_id": tuid}})
    try:
        r = requests.post(f"{BASE_URL}/api/attendance/session", headers=th,
                          json={"lecture_id": lid, "records": _records("present")}, timeout=60)
        assert r.status_code == 200, r.text
        recs = list(mdb.attendance.find({"lecture_id": lid}))
        assert len(recs) == 3 and all(x["date"] == _lec_start(lid) for x in recs)
        assert mdb.lectures.find_one({"_id": ObjectId(lid)})["status"] == "completed"
        # teacher cannot record a 30-day-old lecture (window still enforced)
        old2 = _mk_lecture(STATE["course_id"], (now - timedelta(days=30)).replace(hour=11, minute=0, second=0, microsecond=0))
        r2 = requests.post(f"{BASE_URL}/api/attendance/session", headers=th,
                           json={"lecture_id": old2, "records": _records("present")}, timeout=60)
        assert r2.status_code == 400, r2.text
    finally:
        mdb.courses.update_one({"_id": ObjectId(STATE["course_id"])}, {"$set": {"teacher_id": None}})


# --- Non-regression: offline sync within window stores lecture date (not offline_recorded_at)
def test_offline_sync_stores_lecture_date(admin_h):
    lid = STATE["offline_lec"]
    off = (datetime.now(YEMEN) - timedelta(minutes=1)).isoformat()
    r = requests.post(f"{BASE_URL}/api/attendance/session", headers=admin_h,
                      json={"lecture_id": lid, "records": _records("present"), "offline_recorded_at": off}, timeout=60)
    assert r.status_code == 200, r.text
    recs = list(mdb.attendance.find({"lecture_id": lid}))
    assert len(recs) == 3
    exp = _lec_start(lid)
    for rec in recs:
        assert rec["date"] == exp
    assert mdb.lectures.find_one({"_id": ObjectId(lid)})["status"] == "completed"


# --- Non-regression: /attendance/single stores lecture date
def test_single_attendance_stores_lecture_date(admin_h):
    lid = STATE["single_lec"]
    sid = STATE["students"][1]
    r = requests.post(f"{BASE_URL}/api/attendance/single", headers=admin_h,
                      json={"lecture_id": lid, "student_id": sid}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["student_name"] == "TEST_GhostStudent_1"
    rec = mdb.attendance.find_one({"lecture_id": lid, "student_id": sid})
    assert rec["date"] == _lec_start(lid)
    assert rec["method"] == "qr"
    # duplicate -> 400
    r2 = requests.post(f"{BASE_URL}/api/attendance/single", headers=admin_h,
                       json={"lecture_id": lid, "student_id": sid}, timeout=30)
    assert r2.status_code == 400


# --- Approval flow: registrar bypass edit → pending requests → admin approve (existing & new record)
def test_approval_flow_dates(reg_h, admin_h):
    lid = STATE["appr_lec"]
    s0, s1 = STATE["students"][0], STATE["students"][1]
    r = requests.post(f"{BASE_URL}/api/attendance/session", headers=reg_h,
                      json={"lecture_id": lid, "records": [{"student_id": s0, "status": "absent"},
                                                           {"student_id": s1, "status": "absent"}]}, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("status") == "pending_approval", body
    assert body["created"] == 2
    exp = _lec_start(lid)
    orig_s0 = mdb.attendance.find_one({"lecture_id": lid, "student_id": s0})
    for rid in body["request_ids"]:
        ar = requests.post(f"{BASE_URL}/api/attendance-changes/{rid}/approve", headers=admin_h, timeout=30)
        assert ar.status_code == 200, ar.text
        assert ar.json()["success"] is True
    a0 = mdb.attendance.find_one({"lecture_id": lid, "student_id": s0})
    assert a0["_id"] == orig_s0["_id"]
    assert a0["status"] == "absent"
    assert a0["date"] == orig_s0["date"] == exp
    a1 = mdb.attendance.find_one({"lecture_id": lid, "student_id": s1})
    assert a1 is not None and a1["status"] == "absent"
    assert a1["method"] == "approval_change"
    assert a1["date"] == exp, f"new record date {a1['date']} != {exp}"


# --- attendance-lookup returns lecture_change_history
def test_attendance_lookup_change_history(admin_h):
    lid = STATE["old_lec"]
    ins = mdb.lecture_change_log.insert_one({"lecture_id": lid, "course_id": STATE["course_id"], "action": "TEST_edit",
                                             "changes": {"date": {"from": "2026-10-01", "to": "2026-10-15"}},
                                             "reason": "TEST_reason", "by_name": "TEST_by",
                                             "at": datetime.now(timezone.utc)})
    STATE["change_log"].append(ins.inserted_id)
    r = requests.get(f"{BASE_URL}/api/admin/attendance-lookup", headers=admin_h,
                     params={"student_query": "TEST_GhostStudent_2"}, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["students_matched"] == 1
    res = data["results"]
    assert len(res) >= 3
    by_lec = {x["lecture_id"]: x for x in res}
    h = by_lec[lid]["lecture_change_history"]
    assert len(h) == 1 and h[0]["action"] == "TEST_edit"
    assert h[0]["changes"]["date"] == {"from": "2026-10-01", "to": "2026-10-15"}
    assert h[0]["by_name"] == "TEST_by" and h[0]["reason"] == "TEST_reason"
    assert by_lec[STATE["today_lec"]]["lecture_change_history"] == []
    # attendance_date in lookup should reflect lecture date
    assert by_lec[lid]["attendance_date"].startswith(str(_lec_start(lid).astimezone(timezone.utc).date()))


def test_attendance_lookup_non_admin_forbidden(reg_h):
    r = requests.get(f"{BASE_URL}/api/admin/attendance-lookup", headers=reg_h,
                     params={"student_query": "TEST_GhostStudent_2"}, timeout=30)
    assert r.status_code == 403


# --- Course report (date range + exports) still works
def test_course_report_detailed_date_range(admin_h):
    cid = STATE["course_id"]
    r = requests.get(f"{BASE_URL}/api/reports/course/{cid}/detailed", headers=admin_h, timeout=60)
    assert r.status_code == 200, r.text
    full = r.json()
    old_date = mdb.lectures.find_one({"_id": ObjectId(STATE["old_lec"])})["date"]
    r2 = requests.get(f"{BASE_URL}/api/reports/course/{cid}/detailed", headers=admin_h,
                      params={"date_from": old_date, "date_to": old_date}, timeout=60)
    assert r2.status_code == 200, r2.text
    rng = r2.json()
    print("FULL summary:", full["summary"], "lectures:", len(full["lectures"]))
    print("RANGE summary:", rng["summary"], "lectures:", len(rng["lectures"]))
    assert rng["lectures"] and all(l["date"] == old_date for l in rng["lectures"])
    assert len(full["lectures"]) > len(rng["lectures"])


def test_course_report_exports(admin_h):
    cid = STATE["course_id"]
    today = datetime.now(YEMEN)
    p = {"date_from": (today - timedelta(days=40)).strftime("%Y-%m-%d"), "date_to": today.strftime("%Y-%m-%d")}
    r = requests.get(f"{BASE_URL}/api/reports/course/{cid}/monthly-excel", headers=admin_h, params=p, timeout=90)
    assert r.status_code == 200, r.text[:300]
    assert len(r.content) > 1000 and r.content[:2] == b"PK"
    r2 = requests.get(f"{BASE_URL}/api/export/report/course/{cid}/excel", headers=admin_h, params=p, timeout=90)
    assert r2.status_code == 200, r2.text[:300]
    assert r2.content[:2] == b"PK"
