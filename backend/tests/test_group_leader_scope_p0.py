"""P0 security: group-leader teacher scope (enrollments/students, lecture-stats, lectures today/month, attendance/session)."""
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import requests
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
COURSE_ID = "698f0000d803b27aab0120af"  # groups: '1' -> 222222, '2' -> Saeed teacher record; owner teacher180156
OTHER_GROUPED_COURSE = "6ac2c04cb031f88e942618de"  # unrelated grouped course
G1_OWN_COURSE = "698f671431cfba92c49a550d"  # owned by 222222's teacher record, no groups
GROUP2_LECTURE_STAMPED_G1 = "6ac234164b7f763cfb72f01a"  # group '2' lecture whose teacher_id == 222222 (2026-10-07)

mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed for {u}: {r.text[:200]}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin():
    return _login("admin", "admin123")


@pytest.fixture(scope="module")
def g1():
    return _login("222222", "teacher123")


@pytest.fixture(scope="module")
def owner():
    return _login("teacher180156", "teacher123")


@pytest.fixture(scope="module")
def dean():
    return _login("Salim", "test1234")


def _students(h, cid=COURSE_ID, **params):
    return requests.get(f"{BASE_URL}/api/enrollments/{cid}/students", headers=h, params=params, timeout=30)


def _db_group_ids(group):
    return {e["student_id"] for e in mdb.enrollments.find({"course_id": COURSE_ID, "group": group}, {"student_id": 1})}


# ---------- enrollments/students ----------
class TestEnrollmentsStudents:
    def test_group_leader_no_param_only_own_group(self, g1):
        r = _students(g1)
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data) > 0
        assert all(s["group"] == "1" for s in data), {s["group"] for s in data}
        ids = {s["id"] for s in data}
        assert ids <= _db_group_ids("1")
        assert not (ids & _db_group_ids("2"))

    def test_group_leader_no_param_with_fields(self, g1):
        r = _students(g1, fields="id,full_name")
        assert r.status_code == 200
        ids = {s["id"] for s in r.json()}
        assert ids and ids <= _db_group_ids("1")

    def test_group_leader_other_group_403(self, g1):
        assert _students(g1, group="2").status_code == 403

    def test_group_leader_nonexistent_group_403(self, g1):
        assert _students(g1, group="zzz").status_code == 403

    def test_group_leader_own_group_equals_no_param(self, g1):
        a = {s["id"] for s in _students(g1).json()}
        r = _students(g1, group="1")
        assert r.status_code == 200
        assert {s["id"] for s in r.json()} == a

    def test_primary_owner_sees_all(self, owner, admin):
        r = _students(owner)
        assert r.status_code == 200, r.text
        all_admin = _students(admin).json()
        assert len(r.json()) == len(all_admin)
        groups = {s["group"] for s in r.json()}
        assert {"1", "2"} <= groups

    def test_admin_unfiltered(self, admin):
        data = _students(admin).json()
        groups = {s["group"] for s in data}
        assert {"1", "2"} <= groups

    def test_admin_group_param_any(self, admin):
        r = _students(admin, group="2")
        assert r.status_code == 200 and r.json() and all(s["group"] == "2" for s in r.json())

    def test_dean_unaffected(self, dean, admin):
        r = _students(dean)
        assert r.status_code == 200, r.text
        assert len(r.json()) == len(_students(admin).json())

    def test_group_leader_cross_course_unrelated_403(self, g1):
        # 222222 leads group in course A, must not see unrelated grouped course B
        assert _students(g1, cid=OTHER_GROUPED_COURSE).status_code == 403

    def test_group_leader_own_ungrouped_course_full(self, g1, admin):
        r = _students(g1, cid=G1_OWN_COURSE)
        assert r.status_code == 200
        assert len(r.json()) == len(_students(admin, cid=G1_OWN_COURSE).json())

    def test_primary_owner_unrelated_course_403(self, owner):
        assert _students(owner, cid=OTHER_GROUPED_COURSE).status_code == 403


# ---------- lecture-stats ----------
class TestLectureStats:
    def test_group_leader_stats_equal_group1(self, g1, admin):
        mine = requests.get(f"{BASE_URL}/api/courses/{COURSE_ID}/lecture-stats", headers=g1, timeout=30)
        ref = requests.get(f"{BASE_URL}/api/courses/{COURSE_ID}/lecture-stats", headers=admin, params={"group": "1"}, timeout=30)
        assert mine.status_code == 200 and mine.json() == ref.json()

    def test_group_leader_stats_other_group_403(self, g1):
        r = requests.get(f"{BASE_URL}/api/courses/{COURSE_ID}/lecture-stats", headers=g1, params={"group": "2"}, timeout=30)
        assert r.status_code == 403


# ---------- lectures today / month ----------
class TestLecturesTodayMonth:
    def test_month_fields_keep_group(self, g1, owner, admin):
        for h in (g1, owner, admin):
            r = requests.get(f"{BASE_URL}/api/lectures/month/2026/10", headers=h, params={"fields": "id,course_id,date"}, timeout=60)
            assert r.status_code == 200, r.text
            for lec in r.json()["lectures"]:
                assert "group" in lec and "group_name" in lec
                assert "start_time" not in lec  # fields filter still applied

    def test_month_group_leader_no_other_group_lectures(self, g1):
        r = requests.get(f"{BASE_URL}/api/lectures/month/2026/10", headers=g1, timeout=60)
        assert r.status_code == 200
        lecs = [l for l in r.json()["lectures"] if l["course_id"] == COURSE_ID]
        assert all(l["group"] == "1" for l in lecs), [(l["id"], l["group"]) for l in lecs]
        assert GROUP2_LECTURE_STAMPED_G1 not in {l["id"] for l in r.json()["lectures"]}

    def test_today_fields_keep_group(self, g1):
        r = requests.get(f"{BASE_URL}/api/lectures/today", headers=g1, params={"fields": "id,course_id"}, timeout=60)
        assert r.status_code == 200
        for lec in r.json():
            assert "group" in lec and "group_name" in lec


# ---------- attendance/session group filter ----------
@pytest.fixture
def temp_group_lecture():
    now = datetime.now(ZoneInfo("Asia/Aden"))
    start = now - timedelta(minutes=2)
    end = now + timedelta(minutes=60)
    doc = {
        "course_id": COURSE_ID, "date": now.strftime("%Y-%m-%d"),
        "start_time": start.strftime("%H:%M"), "end_time": end.strftime("%H:%M"),
        "group": "1", "group_name": "TEST_g1", "teacher_id": "698ad3da31ab437a06176e2a",
        "status": "scheduled", "room": "TEST_ROOM", "notes": "TEST_p0_group_scope",
        "created_at": now,
    }
    lid = str(mdb.lectures.insert_one(doc).inserted_id)
    yield lid
    mdb.attendance.delete_many({"lecture_id": lid})
    mdb.attendance_operations.delete_many({"lecture_id": lid})
    mdb.lectures.delete_one({"_id": ObjectId(lid)})


def test_attendance_session_drops_other_group(g1, temp_group_lecture):
    in_ids = sorted(_db_group_ids("1"))[:2]
    out_ids = sorted(_db_group_ids("2"))[:3]
    assert in_ids and out_ids
    records = [{"student_id": s, "status": "present"} for s in in_ids + out_ids]
    r = requests.post(f"{BASE_URL}/api/attendance/session", headers=g1,
                      json={"lecture_id": temp_group_lecture, "records": records}, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("skipped_other_group") == len(out_ids), body
    saved = {a["student_id"] for a in mdb.attendance.find({"lecture_id": temp_group_lecture})}
    assert saved == set(in_ids)
    log = open("/var/log/supervisor/backend.err.log", encoding="utf-8", errors="ignore").read()[-200000:]
    assert temp_group_lecture in log and "تجاهل" in log and "خارج مجموعة" in log


def test_attendance_session_all_out_of_group(g1, temp_group_lecture):
    out_ids = sorted(_db_group_ids("2"))[:2]
    r = requests.post(f"{BASE_URL}/api/attendance/session", headers=g1,
                      json={"lecture_id": temp_group_lecture, "records": [{"student_id": s, "status": "present"} for s in out_ids]}, timeout=60)
    assert r.status_code == 200, r.text
    assert r.json().get("skipped_other_group") == len(out_ids)
    assert mdb.attendance.count_documents({"lecture_id": temp_group_lecture}) == 0
