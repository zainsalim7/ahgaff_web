# Tests: relaxed section-conflict for parallel different courses (diff teacher+room) in weekly schedule
import os
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

DEPT = "698e500997fef774e66e93a8"
FAC = "698e4f9297fef774e66e93a4"
LEVEL = 1
SECTION = "أ"
DAY = "الجمعة"  # no real slots on Friday -> isolated

mdb = MongoClient(MONGO_URL)[DB_NAME]
CREATED = {"courses": [], "teachers": [], "rooms": [], "weekly_schedule": []}


def _mk(coll, doc):
    doc["created_at"] = datetime.now(timezone.utc)
    _id = mdb[coll].insert_one(doc).inserted_id
    CREATED[coll].append(_id)
    return str(_id)


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def data():
    d = {}
    for i in range(1, 4):
        d[f"t{i}"] = _mk("teachers", {"full_name": f"TEST_معلم{i}", "department_id": DEPT, "faculty_id": FAC, "is_active": True})
        d[f"r{i}"] = _mk("rooms", {"name": f"TEST_قاعة{i}", "faculty_id": FAC, "capacity": 30, "is_active": True, "room_type": "lecture"})
    for n in ("A", "B", "C"):
        d[f"c{n}"] = _mk("courses", {"name": f"TEST_مقرر{n}", "code": f"TESTPAR{n}", "department_id": DEPT, "faculty_id": FAC,
                                      "level": LEVEL, "section": SECTION, "is_active": True})
    d["cG"] = _mk("courses", {"name": "TEST_مقررمجموعات", "code": "TESTPARG", "department_id": DEPT, "faculty_id": FAC,
                              "level": LEVEL, "section": SECTION, "is_active": True,
                              "groups": [{"key": "1", "name": "TEST_م1", "teacher_id": None},
                                         {"key": "2", "name": "TEST_م2", "teacher_id": None}]})
    yield d
    # teardown
    ids = [str(x) for x in CREATED["courses"]]
    mdb.weekly_schedule.delete_many({"course_id": {"$in": ids}})
    mdb.lectures.delete_many({"course_id": {"$in": ids}})
    for coll, lst in CREATED.items():
        if lst:
            mdb[coll].delete_many({"_id": {"$in": lst}})


def _clear(d):
    mdb.weekly_schedule.delete_many({"course_id": {"$in": [d["cA"], d["cB"], d["cC"], d["cG"]]}})


def _slot(client, course, teacher, room, slot_number=1, group=None, day=DAY, slot_type="theory"):
    body = {"faculty_id": FAC, "department_id": DEPT, "level": LEVEL, "section": SECTION, "day": day,
            "slot_number": slot_number, "course_id": course, "teacher_id": teacher, "room_id": room, "slot_type": slot_type}
    if group is not None:
        body["group"] = group
    return client.post(f"{BASE_URL}/api/weekly-schedule", json=body)


class TestCreateRelaxed:
    def test_diff_course_diff_teacher_diff_room_allowed(self, client, data):
        _clear(data)
        r1 = _slot(client, data["cA"], data["t1"], data["r1"])
        assert r1.status_code == 200, r1.text
        r2 = _slot(client, data["cB"], data["t2"], data["r2"])
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert "⚠️" in body["message"] and "TEST_مقررA" in body["message"]
        doc1 = mdb.weekly_schedule.find_one({"_id": ObjectId(r1.json()["id"])})
        doc2 = mdb.weekly_schedule.find_one({"_id": ObjectId(body["id"])})
        assert doc1["group"] is None
        assert isinstance(doc2["group"], str) and doc2["group"] == f"auto-{data['t2'][-8:]}"

    def test_third_parallel_course_allowed(self, client, data):
        r3 = _slot(client, data["cC"], data["t3"], data["r3"])
        assert r3.status_code == 200, r3.text
        doc3 = mdb.weekly_schedule.find_one({"_id": ObjectId(r3.json()["id"])})
        assert doc3["group"] == f"auto-{data['t3'][-8:]}"

    def test_same_teacher_rejected(self, client, data):
        _clear(data)
        assert _slot(client, data["cA"], data["t1"], data["r1"]).status_code == 200
        r = _slot(client, data["cB"], data["t1"], data["r2"])
        assert r.status_code == 409, r.text
        txt = str(r.json())
        assert "تعارض" in txt
        assert mdb.weekly_schedule.count_documents({"course_id": data["cB"]}) == 0

    def test_same_room_rejected(self, client, data):
        _clear(data)
        assert _slot(client, data["cA"], data["t1"], data["r1"]).status_code == 200
        r = _slot(client, data["cB"], data["t2"], data["r1"])
        assert r.status_code == 409, r.text
        assert "تعارض" in str(r.json())
        assert mdb.weekly_schedule.count_documents({"course_id": data["cB"]}) == 0

    def test_same_course_twice_no_group_rejected(self, client, data):
        _clear(data)
        assert _slot(client, data["cA"], data["t1"], data["r1"]).status_code == 200
        r = _slot(client, data["cA"], data["t2"], data["r2"])
        assert r.status_code == 409, r.text

    def test_same_course_explicit_groups_still_work(self, client, data):
        _clear(data)
        g1 = _slot(client, data["cG"], data["t1"], data["r1"], group="1")
        assert g1.status_code == 200, g1.text
        g2 = _slot(client, data["cG"], data["t2"], data["r2"], group="2")
        assert g2.status_code == 200, g2.text
        d2 = mdb.weekly_schedule.find_one({"_id": ObjectId(g2.json()["id"])})
        assert d2["group"] == "2"
        # same group again -> rejected
        g3 = _slot(client, data["cG"], data["t3"], data["r3"], group="1")
        assert g3.status_code == 409, g3.text


class TestUpdateRelaxed:
    def test_put_move_into_parallel_cell_allowed(self, client, data):
        _clear(data)
        a = _slot(client, data["cA"], data["t1"], data["r1"], slot_number=1)
        b = _slot(client, data["cB"], data["t2"], data["r2"], slot_number=2)
        assert a.status_code == 200 and b.status_code == 200, (a.text, b.text)
        bid = b.json()["id"]
        # PUT model has no day/slot_number -> moving is done via /move-slot (used by UI drag/drop)
        r = client.post(f"{BASE_URL}/api/weekly-schedule/move-slot", json={"slot_id": bid, "target_day": DAY, "target_slot_number": 1})
        assert r.status_code == 200, f"move-slot into parallel cell rejected: {r.status_code} {r.text}"
        doc = mdb.weekly_schedule.find_one({"_id": ObjectId(bid)})
        assert doc["slot_number"] == 1
        assert doc["group"] == f"auto-{data['t2'][-8:]}"

    def test_put_move_same_teacher_rejected(self, client, data):
        _clear(data)
        a = _slot(client, data["cA"], data["t1"], data["r1"], slot_number=1)
        b = _slot(client, data["cB"], data["t1"], data["r2"], slot_number=2)
        assert a.status_code == 200 and b.status_code == 200
        r = client.post(f"{BASE_URL}/api/weekly-schedule/move-slot", json={"slot_id": b.json()['id'], "target_day": DAY, "target_slot_number": 1})
        assert r.status_code == 409, r.text

    def test_put_move_same_room_rejected(self, client, data):
        _clear(data)
        a = _slot(client, data["cA"], data["t1"], data["r1"], slot_number=1)
        b = _slot(client, data["cB"], data["t2"], data["r1"], slot_number=2)
        assert a.status_code == 200 and b.status_code == 200
        r = client.post(f"{BASE_URL}/api/weekly-schedule/move-slot", json={"slot_id": b.json()['id'], "target_day": DAY, "target_slot_number": 1})
        assert r.status_code == 409, r.text

    def test_put_group_clear_triggers_auto_group(self, client, data):
        """PUT path of relaxation: clearing group of a slot sharing the cell with a different course"""
        _clear(data)
        assert _slot(client, data["cA"], data["t1"], data["r1"]).status_code == 200
        b = _slot(client, data["cB"], data["t2"], data["r2"])
        assert b.status_code == 200
        r = client.put(f"{BASE_URL}/api/weekly-schedule/{b.json()['id']}", json={"group": ""})
        assert r.status_code == 200, r.text
        doc = mdb.weekly_schedule.find_one({"_id": ObjectId(b.json()["id"])})
        assert doc["group"] == f"auto-{data['t2'][-8:]}"

    def test_put_slot_type_on_auto_group_slot(self, client, data):
        """Edge: toggling slot_type (MasterScheduleView does this) on an auto-grouped slot"""
        _clear(data)
        assert _slot(client, data["cA"], data["t1"], data["r1"]).status_code == 200
        b = _slot(client, data["cB"], data["t2"], data["r2"])
        assert b.status_code == 200
        r = client.put(f"{BASE_URL}/api/weekly-schedule/{b.json()['id']}", json={"slot_type": "practical"})
        assert r.status_code == 200, f"slot_type toggle on auto-group slot failed: {r.status_code} {r.text}"

    def test_put_change_room_on_auto_group_slot(self, client, data):
        _clear(data)
        assert _slot(client, data["cA"], data["t1"], data["r1"]).status_code == 200
        b = _slot(client, data["cB"], data["t2"], data["r2"])
        r = client.put(f"{BASE_URL}/api/weekly-schedule/{b.json()['id']}", json={"room_id": data["r3"]})
        assert r.status_code == 200, r.text


class TestRegressionAndSideEffects:
    def test_normal_crud(self, client, data):
        _clear(data)
        a = _slot(client, data["cA"], data["t1"], data["r1"], slot_number=3)
        assert a.status_code == 200, a.text
        sid = a.json()["id"]
        assert "⚠️" not in a.json()["message"]
        doc = mdb.weekly_schedule.find_one({"_id": ObjectId(sid)})
        assert doc["group"] is None
        u = client.put(f"{BASE_URL}/api/weekly-schedule/{sid}", json={"room_id": data["r2"]})
        assert u.status_code == 200, u.text
        assert mdb.weekly_schedule.find_one({"_id": ObjectId(sid)})["room_id"] == data["r2"]
        dl = client.delete(f"{BASE_URL}/api/weekly-schedule/{sid}")
        assert dl.status_code == 200, dl.text
        assert mdb.weekly_schedule.find_one({"_id": ObjectId(sid)}) is None

    def test_parallel_pair_times_not_shifted(self, client, data):
        """The two parallel slots should keep same computed start time (not treated as conflict by time resolver)"""
        _clear(data)
        a = _slot(client, data["cA"], data["t1"], data["r1"])
        b = _slot(client, data["cB"], data["t2"], data["r2"])
        assert a.status_code == 200 and b.status_code == 200
        da = mdb.weekly_schedule.find_one({"_id": ObjectId(a.json()["id"])})
        db_ = mdb.weekly_schedule.find_one({"_id": ObjectId(b.json()["id"])})
        print("A times", da.get("computed_start_time"), da.get("computed_end_time"),
              "B times", db_.get("computed_start_time"), db_.get("computed_end_time"), "shifted:", b.json().get("shifted"))
        assert da.get("computed_start_time") == db_.get("computed_start_time")

    def test_conflicts_endpoint_does_not_flag_pair(self, client, data):
        r = client.get(f"{BASE_URL}/api/weekly-schedule/conflicts", params={"faculty_id": FAC, "department_id": DEPT})
        assert r.status_code == 200, r.text
        ids = set(r.json().get("conflicting_slot_ids", []))
        mine = {str(x["_id"]) for x in mdb.weekly_schedule.find({"course_id": {"$in": [data["cA"], data["cB"]]}})}
        assert not (ids & mine), f"conflicts endpoint flags the auto-parallel pair as section conflict: {ids & mine}"

    def test_get_schedule_returns_slots(self, client, data):
        r = client.get(f"{BASE_URL}/api/weekly-schedule", params={"faculty_id": FAC, "department_id": DEPT, "level": LEVEL, "section": SECTION})
        assert r.status_code == 200, r.text
        txt = str(r.json())
        assert data["cA"] in txt and data["cB"] in txt
