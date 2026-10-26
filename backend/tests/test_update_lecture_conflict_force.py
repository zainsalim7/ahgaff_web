# Follow-up of iteration_126: update_lecture (PUT /api/lectures/{id}) force/409 gate + reschedule group-teacher override
import os
import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")

FIQH_A = "69cd1f0b12f04e7c1d6a4991"
FIQH_B = "6a1b3f41b319b9f2bee0be23"
ENGLISH = "6ac2c04cb031f88e942618de"
HADRAMOUT = "698f0000d803b27aab0120af"   # group1 teacher 698ad3da..., group2 teacher 698bc059...
T180156 = "698f671431cfba92c49a550d"     # taught by 698ad3da...
TAG = "TEST_UPD_FORCE"
CREATED = []
db = MongoClient("mongodb://localhost:27017")["test_database"]


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    r = sess.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    d = r.json()
    sess.headers.update({"Authorization": f"Bearer {d.get('access_token') or d.get('token')}"})
    yield sess
    for lid in CREATED:
        sess.delete(f"{BASE_URL}/api/lectures/{lid}")
    db.lectures.delete_many({"notes": TAG})


def mk(s, course, date, st, et, room="", group=None, force=True):
    body = {"course_id": course, "date": date, "start_time": st, "end_time": et, "room": room, "notes": TAG, "force": force}
    if group:
        body["group"] = group
    r = s.post(f"{BASE_URL}/api/lectures", json=body)
    assert r.status_code == 200, f"create failed {r.status_code} {r.text}"
    CREATED.append(r.json()["id"])
    return r.json()["id"]


def lec(lid):
    return db.lectures.find_one({"_id": ObjectId(lid)})


def put(s, lid, body):
    return s.put(f"{BASE_URL}/api/lectures/{lid}", json=body)


class TestUpdateWarningGate:
    # GAP 1: other section same base name same teacher → 409 unless force
    def test_update_warning_409_then_force(self, s):
        mk(s, FIQH_A, "2027-07-05", "08:00", "09:30")
        b = mk(s, FIQH_B, "2027-07-06", "08:00", "09:30")
        slot = {"date": "2027-07-05", "start_time": "08:00", "end_time": "09:30"}
        r = put(s, b, slot)
        assert r.status_code == 409, r.text
        assert lec(b)["date"] == "2027-07-06"
        r = put(s, b, {**slot, "force": False})
        assert r.status_code == 409, r.text
        assert lec(b)["date"] == "2027-07-06"
        r = put(s, b, {**slot, "force": True})
        assert r.status_code == 200, r.text
        L = lec(b)
        assert L["date"] == "2027-07-05" and L["start_time"] == "08:00"
        assert "force" not in L, "force key leaked into DB document"

    def test_update_start_time_only_warning(self, s):
        mk(s, FIQH_A, "2027-07-07", "10:00", "11:30")
        b = mk(s, FIQH_B, "2027-07-07", "12:00", "13:30")
        r = put(s, b, {"start_time": "11:00", "end_time": "12:30"})
        assert r.status_code == 409, r.text
        assert lec(b)["start_time"] == "12:00"

    def test_update_same_course_400_with_force(self, s):
        mk(s, FIQH_A, "2027-07-08", "08:00", "09:30")
        b = mk(s, FIQH_A, "2027-07-09", "08:00", "09:30")
        r = put(s, b, {"date": "2027-07-08", "start_time": "08:30", "end_time": "10:00", "force": True})
        assert r.status_code == 400, r.text
        assert lec(b)["date"] == "2027-07-09"

    def test_update_diff_course_same_teacher_400_with_force(self, s):
        mk(s, FIQH_A, "2027-07-12", "08:00", "09:30")
        e = mk(s, ENGLISH, "2027-07-13", "08:00", "09:30")
        r = put(s, e, {"date": "2027-07-12", "force": True})
        assert r.status_code == 400, r.text
        assert lec(e)["date"] == "2027-07-13"

    def test_update_room_diff_teacher_400_with_force(self, s):
        mk(s, HADRAMOUT, "2027-07-14", "08:00", "09:30", room="TEST_ROOM_UPD")
        a = mk(s, FIQH_A, "2027-07-14", "12:00", "13:30")
        r = put(s, a, {"start_time": "08:00", "end_time": "09:30", "room": "TEST_ROOM_UPD", "force": True})
        assert r.status_code == 400, r.text
        assert lec(a)["start_time"] == "12:00"

    def test_update_free_slot_200(self, s):
        a = mk(s, FIQH_A, "2027-07-15", "08:00", "09:30")
        r = put(s, a, {"date": "2027-07-16", "start_time": "12:00", "end_time": "13:30"})
        assert r.status_code == 200, r.text
        assert lec(a)["date"] == "2027-07-16"


class TestUpdateGroupChange:
    def test_group_change_to_teacher_busy_400(self, s):
        # HADRAMOUT lecture (no group) → group 1 whose teacher already teaches 180156 at that slot
        mk(s, T180156, "2027-07-19", "08:00", "09:30")
        h = mk(s, HADRAMOUT, "2027-07-19", "08:00", "09:30")
        r = put(s, h, {"group": "1", "force": True})
        assert r.status_code == 400, r.text
        assert not lec(h).get("group")

    def test_group_change_students_warning_409_then_force(self, s):
        mk(s, ENGLISH, "2027-07-20", "08:00", "09:30")
        h = mk(s, HADRAMOUT, "2027-07-20", "08:00", "09:30")
        r = put(s, h, {"group": "2"})
        assert r.status_code == 409, r.text
        assert not lec(h).get("group")
        r = put(s, h, {"group": "2", "force": True})
        assert r.status_code == 200, r.text
        L = lec(h)
        assert L["group"] == "2" and L["teacher_id"] == "698bc0593a8982391e9ba188"

    def test_group_lecture_date_change_uses_group_teacher(self, s):
        # group-1 lecture moved via PUT (no group in body) onto slot where group teacher teaches 180156
        mk(s, T180156, "2027-07-21", "08:00", "09:30")
        g1 = mk(s, HADRAMOUT, "2027-07-22", "08:00", "09:30", group="1")
        r = put(s, g1, {"date": "2027-07-21"})
        moved = lec(g1)["date"] == "2027-07-21"
        assert r.status_code == 400 and not moved, f"update_lecture misses group-teacher clash: {r.status_code} {r.text} moved={moved}"


class TestUpdateNonSchedulingFlows:
    # Fields other than date/time/room/group must not be conflict-checked nor require force
    def test_non_schedule_fields_on_conflicting_lecture(self, s):
        a = mk(s, FIQH_A, "2027-07-26", "08:00", "09:30")
        b = mk(s, FIQH_B, "2027-07-26", "08:00", "09:30", force=True)  # already merged/overlapping
        r = put(s, b, {"lesson_title": "TEST_lesson"})
        assert r.status_code == 200, r.text
        assert lec(b)["lesson_title"] == "TEST_lesson"
        r = put(s, b, {"notes": TAG, "time_locked": True})
        assert r.status_code == 200, r.text
        assert lec(b)["time_locked"] is True
        r = put(s, b, {"time_locked": False})
        assert r.status_code == 200 and lec(b)["time_locked"] is False
        r = put(s, b, {"status": "cancelled", "cancellation_reason": "TEST", "cancellation_reason_type": "college", "apply_to_shared": False})
        assert r.status_code == 200, r.text
        L = lec(b)
        assert L["status"] == "cancelled" and L["cancellation_reason"] == "TEST" and L.get("cancelled_by_name") is not None
        r = put(s, b, {"status": "scheduled", "apply_to_shared": False})
        assert r.status_code == 200, r.text
        assert lec(b)["status"] == "scheduled"
        r = put(s, b, {"lesson_title": ""})
        assert r.status_code == 200 and lec(b)["lesson_title"] == ""


class TestRescheduleGroupTeacher:
    # GAP 2
    def _resched(self, s, lid, date, force=None):
        body = {"date": date, "start_time": "08:00", "end_time": "09:30", "apply_to_shared": False}
        if force is not None:
            body["force"] = force
        return s.put(f"{BASE_URL}/api/lectures/{lid}/reschedule", json=body)

    def test_group_teacher_clash_400_even_with_force(self, s):
        mk(s, T180156, "2027-08-02", "08:00", "09:30")
        g1 = mk(s, HADRAMOUT, "2027-08-03", "08:00", "09:30", group="1")
        for f in (None, True):
            r = self._resched(s, g1, "2027-08-02", force=f)
            assert r.status_code == 400, f"force={f}: {r.status_code} {r.text}"
        assert lec(g1)["date"] == "2027-08-03"

    def test_group2_on_same_slot_not_blocked_by_group1_teacher(self, s):
        mk(s, T180156, "2027-08-04", "08:00", "09:30")
        g2 = mk(s, HADRAMOUT, "2027-08-05", "08:00", "09:30", group="2")
        r = self._resched(s, g2, "2027-08-04")
        # group 2 teacher is free; only possible issue is students (none: 180156 different dept)
        assert r.status_code == 200, r.text
        assert lec(g2)["date"] == "2027-08-04"
