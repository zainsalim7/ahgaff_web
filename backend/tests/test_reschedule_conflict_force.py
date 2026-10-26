# P0 regression: PUT /api/lectures/{id}/reschedule conflict enforcement (warning→409/force, error→400 unbypassable)
# Also sanity on POST /api/lectures and PUT /api/lectures/{id} conflict handling.
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")

FIQH_A = "69cd1f0b12f04e7c1d6a4991"      # الفقه الإسلامي (section '') teacher 698e53...
FIQH_B = "6a1b3f41b319b9f2bee0be23"      # الفقه الإسلامي (section أ) same teacher
ENGLISH = "6ac2c04cb031f88e942618de"     # لغة إنجليزية - اختبار, same teacher 698e53..., groups 1/2
HADRAMOUT = "698f0000d803b27aab0120af"   # دراسات حضرموت, different teacher, groups 1/2
TEST_ROOM = "TEST_ROOM_RESCHED_P0"

CREATED = []


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    r = sess.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    sess.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    yield sess
    for lid in CREATED:
        sess.delete(f"{BASE_URL}/api/lectures/{lid}")


def mk(s, course, date, st, et, room="", group=None, force=False):
    body = {"course_id": course, "date": date, "start_time": st, "end_time": et, "room": room,
            "notes": "TEST_RESCHED_P0", "force": force}
    if group:
        body["group"] = group
    r = s.post(f"{BASE_URL}/api/lectures", json=body)
    assert r.status_code == 200, f"create failed {r.status_code} {r.text}"
    lid = r.json()["id"]
    CREATED.append(lid)
    return lid


def get_lec(s, lid):
    r = s.get(f"{BASE_URL}/api/lectures/{lid}/details")
    assert r.status_code == 200, r.text
    return r.json()["lecture"]


def resched(s, lid, date, st, et, force=None, room=None):
    body = {"date": date, "start_time": st, "end_time": et, "apply_to_shared": False}
    if force is not None:
        body["force"] = force
    if room is not None:
        body["room"] = room
    return s.put(f"{BASE_URL}/api/lectures/{lid}/reschedule", json=body)


class TestRescheduleWarning:
    # Exact bug scenario: other section of same base course + same teacher
    def test_warning_409_without_force_and_not_moved(self, s):
        a = mk(s, FIQH_A, "2027-05-03", "08:00", "09:30")
        b = mk(s, FIQH_B, "2027-05-04", "10:00", "11:30")
        r = resched(s, b, "2027-05-03", "08:00", "09:30")
        assert r.status_code == 409, r.text
        assert "شعبة أخرى" in r.json().get("detail", "") or "تنبيه" in r.json().get("detail", "")
        lec = get_lec(s, b)
        assert lec["date"] == "2027-05-04" and lec["start_time"] == "10:00"
        # explicit force=false also 409
        r2 = resched(s, b, "2027-05-03", "08:30", "10:00", force=False)
        assert r2.status_code == 409, r2.text
        assert get_lec(s, b)["date"] == "2027-05-04"
        # force=true succeeds
        r3 = resched(s, b, "2027-05-03", "08:00", "09:30", force=True)
        assert r3.status_code == 200, r3.text
        lec = get_lec(s, b)
        assert lec["date"] == "2027-05-03" and lec["start_time"] == "08:00" and lec["end_time"] == "09:30"


class TestRescheduleHardError:
    def test_same_course_overlap_400_even_with_force(self, s):
        a = mk(s, FIQH_A, "2027-05-05", "08:00", "09:30")
        b = mk(s, FIQH_A, "2027-05-06", "08:00", "09:30")
        for f in (None, False, True):
            r = resched(s, b, "2027-05-05", "08:30", "10:00", force=f)
            assert r.status_code == 400, f"force={f}: {r.status_code} {r.text}"
        assert get_lec(s, b)["date"] == "2027-05-06"

    def test_same_teacher_different_course_400_even_with_force(self, s):
        a = mk(s, FIQH_A, "2027-05-07", "08:00", "09:30")
        e = mk(s, ENGLISH, "2027-05-10", "08:00", "09:30")
        r = resched(s, e, "2027-05-07", "08:00", "09:30", force=True)
        assert r.status_code == 400, r.text
        assert get_lec(s, e)["date"] == "2027-05-10"


class TestRescheduleGroups:
    def test_same_course_different_group_allowed(self, s):
        g1 = mk(s, HADRAMOUT, "2027-05-11", "08:00", "09:30", group="1")
        g2 = mk(s, HADRAMOUT, "2027-05-12", "12:00", "13:30", group="2")
        r = resched(s, g2, "2027-05-11", "08:00", "09:30")
        assert r.status_code == 200, r.text
        lec = get_lec(s, g2)
        assert lec["date"] == "2027-05-11" and lec["start_time"] == "08:00"

    def test_same_course_same_group_400(self, s):
        g1 = mk(s, HADRAMOUT, "2027-05-13", "08:00", "09:30", group="1")
        g1b = mk(s, HADRAMOUT, "2027-05-14", "08:00", "09:30", group="1")
        r = resched(s, g1b, "2027-05-13", "08:00", "09:30", force=True)
        assert r.status_code == 400, r.text
        assert get_lec(s, g1b)["date"] == "2027-05-14"


class TestRescheduleHappyPath:
    def test_free_slot_200(self, s):
        a = mk(s, FIQH_A, "2027-05-17", "08:00", "09:30")
        r = resched(s, a, "2027-05-18", "12:00", "13:30")
        assert r.status_code == 200, r.text
        lec = get_lec(s, a)
        assert lec["date"] == "2027-05-18" and lec["start_time"] == "12:00"


class TestRescheduleRoom:
    def test_room_diff_teacher_400_unbypassable(self, s):
        h = mk(s, HADRAMOUT, "2027-05-19", "08:00", "09:30", room=TEST_ROOM)
        a = mk(s, FIQH_A, "2027-05-20", "08:00", "09:30")
        r = resched(s, a, "2027-05-19", "08:00", "09:30", room=TEST_ROOM, force=True)
        assert r.status_code == 400, r.text
        assert "قاعة" in r.json().get("detail", "")
        assert get_lec(s, a)["date"] == "2027-05-20"

    def test_room_same_teacher_other_section_409_then_force(self, s):
        a = mk(s, FIQH_A, "2027-05-21", "08:00", "09:30", room=TEST_ROOM)
        b = mk(s, FIQH_B, "2027-05-24", "08:00", "09:30", room=TEST_ROOM)
        r = resched(s, b, "2027-05-21", "08:00", "09:30")
        assert r.status_code == 409, r.text
        assert get_lec(s, b)["date"] == "2027-05-24"
        r2 = resched(s, b, "2027-05-21", "08:00", "09:30", force=True)
        assert r2.status_code == 200, r2.text
        assert get_lec(s, b)["date"] == "2027-05-21"


class TestCreateUpdateRegression:
    def test_create_warning_409_and_force(self, s):
        mk(s, FIQH_A, "2027-05-25", "08:00", "09:30")
        r = s.post(f"{BASE_URL}/api/lectures", json={"course_id": FIQH_B, "date": "2027-05-25", "start_time": "08:00",
                                                  "end_time": "09:30", "room": "", "notes": "TEST_RESCHED_P0"})
        assert r.status_code == 409, r.text
        mk(s, FIQH_B, "2027-05-25", "08:00", "09:30", force=True)

    def test_create_same_course_400_with_force(self, s):
        mk(s, FIQH_A, "2027-05-26", "08:00", "09:30")
        r = s.post(f"{BASE_URL}/api/lectures", json={"course_id": FIQH_A, "date": "2027-05-26", "start_time": "08:30",
                                                  "end_time": "10:00", "force": True, "notes": "TEST_RESCHED_P0"})
        assert r.status_code == 400, r.text

    def test_update_same_course_400(self, s):
        mk(s, FIQH_A, "2027-05-27", "08:00", "09:30")
        b = mk(s, FIQH_A, "2027-05-28", "08:00", "09:30")
        r = s.put(f"{BASE_URL}/api/lectures/{b}", json={"date": "2027-05-27", "start_time": "08:30", "end_time": "10:00"})
        assert r.status_code == 400, r.text
        assert get_lec(s, b)["date"] == "2027-05-28"

    def test_update_warning_requires_force(self, s):
        # Claimed by main agent: PUT /api/lectures/{id} requires force for 'warning' — verify
        mk(s, FIQH_A, "2027-05-31", "08:00", "09:30")
        b = mk(s, FIQH_B, "2027-06-01", "08:00", "09:30")
        r = s.put(f"{BASE_URL}/api/lectures/{b}", json={"date": "2027-05-31", "start_time": "08:00", "end_time": "09:30"})
        moved = get_lec(s, b)["date"] == "2027-05-31"
        assert r.status_code == 409 and not moved, f"PUT /lectures/{{id}} silently accepted warning conflict: {r.status_code} {r.text} moved={moved}"


class TestRescheduleGroupTeacher:
    # Gap check: reschedule doesn't pass teacher_override (group teacher) unlike create_lecture
    def test_group_teacher_conflict_detected(self, s):
        other = mk(s, "698f671431cfba92c49a550d", "2027-06-02", "08:00", "09:30")  # course of teacher 698ad3...
        g1 = mk(s, HADRAMOUT, "2027-06-03", "08:00", "09:30", group="1")         # group 1 teacher = 698ad3...
        r = resched(s, g1, "2027-06-02", "08:00", "09:30")
        moved = get_lec(s, g1)["date"] == "2027-06-02"
        assert r.status_code == 400 and not moved, f"group-teacher double-booking allowed on reschedule: {r.status_code} {r.text}"
