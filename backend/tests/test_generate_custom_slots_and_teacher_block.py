# Tests: generate-semester (iteration_115)
# - Block generation for courses without teacher (course or group teacher)
# - Custom (non-standard) time slots reflected to weekly_schedule as independent cells (custom_slot, negative slot_number)
# - Real time-overlap conflict detection (section / teacher / room) for custom & standard cells
# - GET /weekly-schedule returns custom_slot / actual_start_time / actual_end_time
import os
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/frontend/.env')
load_dotenv('/app/backend/.env')
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
FAC_ID = "698e4fb497fef774e66e93a6"  # كلية البنات (global time slots 08:00-09:30, 09:45-11:15, ...)

db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    d = r.json()
    return d.get("access_token") or d.get("token")


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def seed():
    ids = {"courses": [], "depts": [], "teachers": [], "rooms": []}

    def dept(name):
        _id = db.departments.insert_one({"name": name, "faculty_id": FAC_ID, "is_active": True}).inserted_id
        ids["depts"].append(_id)
        return str(_id)

    def teacher(name):
        _id = db.teachers.insert_one({"full_name": name, "is_active": True}).inserted_id
        ids["teachers"].append(_id)
        return str(_id)

    def course(name, dept_id, teacher_id, level=9, groups=None):
        _id = db.courses.insert_one({
            "name": name, "code": name[-6:], "department_id": dept_id, "faculty_id": FAC_ID,
            "teacher_id": teacher_id, "level": level, "section": "", "groups": groups or [],
            "credit_hours": 3, "is_active": True, "semester_id": "TEST_SEM",
        }).inserted_id
        ids["courses"].append(_id)
        return str(_id)

    d1 = dept("TEST_DEPT_A")
    d2 = dept("TEST_DEPT_B")
    tb, tc, td, tf, tg, tgrp = [teacher(f"TEST_T_{x}") for x in ["b", "c", "d", "f", "g", "grp"]]
    room_id = db.rooms.insert_one({"name": "TEST_ROOM_X", "faculty_id": FAC_ID, "is_active": True}).inserted_id
    ids["rooms"].append(room_id)
    data = {
        "d1": d1, "d2": d2, "tb": tb,
        "no_teacher": course("TEST_NoTeacher", d1, None),
        "grp_only": course("TEST_GroupOnly", d1, None, groups=[{"key": "1", "name": "مجموعة 1", "teacher_id": tgrp}, {"key": "2", "name": "مجموعة 2"}]),
        "B": course("TEST_CourseB", d1, tb),
        "C": course("TEST_CourseC", d1, tc),
        "D": course("TEST_CourseD", d1, td),
        "E": course("TEST_CourseE", d2, tb),  # same teacher as B, other dept
        "F": course("TEST_CourseF", d2, tf),
        "G": course("TEST_CourseG", d2, tg, level=8),
    }
    yield data
    cids = [str(c) for c in ids["courses"]]
    db.weekly_schedule.delete_many({"course_id": {"$in": cids}})
    db.lectures.delete_many({"course_id": {"$in": cids}})
    db.notifications.delete_many({"course_id": {"$in": cids}})
    db.courses.delete_many({"_id": {"$in": ids["courses"]}})
    db.departments.delete_many({"_id": {"$in": ids["depts"]}})
    db.teachers.delete_many({"_id": {"$in": ids["teachers"]}})
    db.rooms.delete_many({"_id": {"$in": ids["rooms"]}})


def gen(h, course_id, day, start, end, room="", group=None, dry_run=False):
    body = {"course_id": course_id, "room": room, "start_date": "2027-03-01", "end_date": "2027-03-07",
            "schedule": [{"day": day, "slots": [{"start_time": start, "end_time": end}]}], "dry_run": dry_run}
    if group:
        body["group"] = group
    return requests.post(f"{BASE_URL}/api/lectures/generate-semester", json=body, headers=h)


def cells(course_id, **q):
    return list(db.weekly_schedule.find({"course_id": course_id, **q}))


# ---- Feature 1: block generation without teacher ----
class TestTeacherBlock:
    def test_no_teacher_blocked(self, h, seed):
        r = gen(h, seed["no_teacher"], "wednesday", "08:00", "09:30")
        assert r.status_code == 400, r.text
        assert "لم يُسنَد له أستاذ" in r.json()["detail"]
        assert db.lectures.count_documents({"course_id": seed["no_teacher"]}) == 0

    def test_no_teacher_dry_run_blocked(self, h, seed):
        r = gen(h, seed["no_teacher"], "wednesday", "08:00", "09:30", dry_run=True)
        assert r.status_code == 400
        assert "لم يُسنَد له أستاذ" in r.json()["detail"]

    def test_group_with_teacher_allowed(self, h, seed):
        r = gen(h, seed["grp_only"], "saturday", "15:00", "16:30", group="1")
        assert r.status_code == 200, r.text
        assert r.json()["lectures_created"] == 1

    def test_group_without_teacher_blocked(self, h, seed):
        r = gen(h, seed["grp_only"], "saturday", "15:00", "16:30", group="2")
        assert r.status_code == 400, r.text

    def test_course_without_group_but_no_course_teacher_blocked(self, h, seed):
        r = gen(h, seed["grp_only"], "saturday", "15:00", "16:30")
        assert r.status_code == 400


# ---- Feature 2/3/4: custom slots + overlap conflicts ----
class TestCustomSlots:
    def test_custom_slot_created_exact(self, h, seed):
        r = gen(h, seed["B"], "wednesday", "20:10", "20:55")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["lectures_created"] == 1
        assert d["weekly_cells_created"] == 1
        notes = " ".join(d["weekly_notes"])
        assert "ℹ️ خانة مستقلة بوقتها الدقيق 20:10–20:55" in notes
        assert "أقرب" not in notes and "⚠️" not in notes
        lec = db.lectures.find_one({"course_id": seed["B"], "date": "2027-03-03"})
        assert lec["start_time"] == "20:10" and lec["end_time"] == "20:55"
        c = cells(seed["B"], day="الأربعاء")
        assert len(c) == 1
        assert c[0]["custom_slot"] is True
        assert c[0]["slot_number"] == -(20 * 60 + 10 + 1)
        assert c[0]["actual_start_time"] == "20:10" and c[0]["actual_end_time"] == "20:55"

    def test_standard_cell_and_get_fields(self, h, seed):
        r = gen(h, seed["B"], "tuesday", "09:45", "11:15")
        assert r.status_code == 200, r.text
        assert r.json()["weekly_cells_created"] == 1
        g = requests.get(f"{BASE_URL}/api/weekly-schedule", params={"department_id": seed["d1"], "level": 9}, headers=h)
        assert g.status_code == 200, g.text
        items = g.json() if isinstance(g.json(), list) else g.json().get("schedule", g.json().get("items", []))
        mine = [i for i in items if i["course_id"] == seed["B"]]
        cust = [i for i in mine if i["day"] == "الأربعاء"][0]
        std = [i for i in mine if i["day"] == "الثلاثاء"][0]
        assert cust["custom_slot"] is True and cust["actual_start_time"] == "20:10" and cust["actual_end_time"] == "20:55"
        assert cust["slot_number"] == -1211
        assert std["custom_slot"] is False and std["actual_start_time"] is None and std["actual_end_time"] is None
        assert std["slot_number"] == 2

    def test_idempotent_regen_custom(self, h, seed):
        r = gen(h, seed["B"], "wednesday", "20:10", "20:55")
        assert r.status_code == 200
        d = r.json()
        assert d["weekly_cells_created"] == 0 and d["weekly_cells_existing"] == 1
        assert len(cells(seed["B"], day="الأربعاء")) == 1

    def test_custom_overlapping_standard_section_conflict(self, h, seed):
        # C custom 10:00-10:45 Tue overlaps B standard slot 2 (09:45-11:15) in same section
        # 🆕 الآن يُحظر مسبقاً (409) بدل إنشاء محاضرة يتيمة لا تظهر في الجدول الأسبوعي
        r = gen(h, seed["C"], "tuesday", "10:00", "10:45")
        assert r.status_code == 409, r.text
        detail = r.json()["detail"]
        assert "TEST_CourseB" in detail["message"]
        assert len(cells(seed["C"], day="الثلاثاء")) == 0

    def test_adjacent_custom_not_conflict(self, h, seed):
        # C custom 20:55-21:30 Wed adjacent (not overlapping) to B 20:10-20:55
        r = gen(h, seed["C"], "wednesday", "20:55", "21:30")
        assert r.status_code == 200, r.text
        assert r.json()["weekly_cells_created"] == 1, r.json()
        c = cells(seed["C"], day="الأربعاء")
        assert c[0]["slot_number"] == -(20 * 60 + 55 + 1)

    def test_standard_overlapping_existing_custom(self, h, seed):
        # C custom 08:30-09:00 Thu first, then D standard slot 1 (08:00-09:30) Thu
        r1 = gen(h, seed["C"], "thursday", "08:30", "09:00")
        assert r1.status_code == 200 and r1.json()["weekly_cells_created"] == 1, r1.text
        r2 = gen(h, seed["D"], "thursday", "08:00", "09:30")
        print("D standard vs custom:", r2.status_code, r2.text[:400])
        assert r2.status_code in (200, 409)
        if r2.status_code == 200:
            assert r2.json()["weekly_cells_created"] == 0
            assert any("مشغولة" in n for n in r2.json()["weekly_notes"])
        assert len(cells(seed["D"], day="الخميس")) == 0

    def test_teacher_busy_overlap(self, h, seed):
        # E (other dept, same teacher as B) custom 20:30-21:00 Wed overlaps B's 20:10-20:55
        r = gen(h, seed["E"], "wednesday", "20:30", "21:00")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["weekly_cells_created"] == 0
        assert any("الأستاذ لديه محاضرة أخرى" in n for n in d["weekly_notes"]), d["weekly_notes"]
        assert len(cells(seed["E"])) == 0

    def test_room_busy_overlap(self, h, seed):
        r1 = gen(h, seed["F"], "saturday", "12:00", "12:30", room="TEST_ROOM_X")
        assert r1.status_code == 200 and r1.json()["weekly_cells_created"] == 1, r1.text
        fc = cells(seed["F"])[0]
        assert fc["room_id"] and fc["custom_slot"] is True
        # G (level 8, other section) standard slot 3 11:30-13:00 same room → cell without room
        r2 = gen(h, seed["G"], "saturday", "11:30", "13:00", room="TEST_ROOM_X")
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert any("القاعة مشغولة" in n for n in d["weekly_notes"]), d["weekly_notes"]
        gc = cells(seed["G"])
        assert len(gc) == 1 and gc[0]["room_id"] == ""
