"""Duplicate-course root-cause fix: generate-semester 409 {message, conflicts, duplicates},
duplicate-candidates listing, merge-duplicates resolving the phantom conflict."""
import os
import pytest
import requests
from bson import ObjectId
from datetime import datetime
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com").rstrip("/")
TEMPLATE_COURSE = "6a343eaf15515862788eddab"  # مقرر اختبار للحذف (الشريعة والقانون، م1)
DUP_NAME = "TEST_مقرر مكرر للتعارض"
OTHER_NAME = "TEST_مقرر مختلف للتعارض"


@pytest.fixture(scope="module")
def H():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def db():
    return MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "test_database")]


@pytest.fixture(scope="module")
def seed(db):
    """Two duplicate courses (A,B) + one different course (C) in same dept/level/section.
    B occupies a free weekly slot; C occupies another free slot."""
    tpl = db.courses.find_one({"_id": ObjectId(TEMPLATE_COURSE)})
    assert tpl, "template course missing"
    dept, level, section = tpl["department_id"], tpl.get("level") or 1, tpl.get("section") or ""
    fac = tpl.get("faculty_id") or db.departments.find_one({"_id": ObjectId(dept)})["faculty_id"]
    settings = db.schedule_settings.find_one({"_id": f"faculty_{fac}"}) or db.schedule_settings.find_one({"_id": "global"})
    slots = settings["time_slots"]
    days = [("saturday", "السبت"), ("sunday", "الأحد"), ("monday", "الاثنين"), ("tuesday", "الثلاثاء"), ("wednesday", "الأربعاء"), ("thursday", "الخميس")]
    free = []
    for en, ar in days:
        for ts in slots:
            if not db.weekly_schedule.find_one({"department_id": dept, "level": level, "section": section, "day": ar, "slot_number": ts["slot_number"]}):
                free.append((en, ar, ts))
    assert len(free) >= 2, "need 2 free weekly cells"
    base = {k: tpl.get(k) for k in ("department_id", "faculty_id", "level", "section", "semester_id")}
    base.update({"is_active": True, "credit_hours": 2, "created_at": datetime.utcnow(), "teacher_id": None})
    ids = []
    for nm, code in ((DUP_NAME, "TESTDUPA"), (DUP_NAME, "TESTDUPB"), (OTHER_NAME, "TESTDUPC")):
        ids.append(str(db.courses.insert_one({**base, "name": nm, "code": code}).inserted_id))
    a, b, c = ids
    cells = []
    for cid, (en, ar, ts) in ((b, free[0]), (c, free[1])):
        cells.append(db.weekly_schedule.insert_one({
            "faculty_id": fac, "department_id": dept, "level": level, "section": section,
            "day": ar, "slot_number": ts["slot_number"], "course_id": cid, "room_id": "",
            "created_at": datetime.utcnow(), "created_by": "TEST",
        }).inserted_id)
    yield {"a": a, "b": b, "c": c, "dup_slot": free[0], "other_slot": free[1]}
    db.courses.delete_many({"_id": {"$in": [ObjectId(i) for i in ids]}})
    db.weekly_schedule.delete_many({"course_id": {"$in": ids}})
    db.lectures.delete_many({"course_id": {"$in": ids}})
    db.teaching_loads.delete_many({"course_id": {"$in": ids}})


def _payload(cid, slot, dry=True):
    en, ar, ts = slot
    return {"course_id": cid, "room": "", "dry_run": dry, "start_date": "2026-02-01", "end_date": "2026-02-28",
            "schedule": [{"day": en, "slots": [{"start_time": ts["start_time"], "end_time": ts["end_time"]}]}]}


# --- duplicate-candidates lists the seeded duplicate group ---
def test_duplicate_candidates_contains_seed(H, seed):
    r = requests.get(f"{BASE_URL}/api/courses-tools/duplicate-candidates", headers=H)
    assert r.status_code == 200
    groups = {g["name"]: g for g in r.json()["duplicates"]}
    assert DUP_NAME in groups
    ids = {c["id"] for c in groups[DUP_NAME]["courses"]}
    assert ids == {seed["a"], seed["b"]}
    assert OTHER_NAME not in groups
    slots = {c["id"]: c["slots"] for c in groups[DUP_NAME]["courses"]}
    assert slots[seed["b"]] == 1 and slots[seed["a"]] == 0


# --- 409 with duplicates when the occupant is a duplicate copy ---
def test_generate_409_duplicate_detail_object(H, seed):
    r = requests.post(f"{BASE_URL}/api/lectures/generate-semester", headers=H, json=_payload(seed["a"], seed["dup_slot"]))
    assert r.status_code == 409, r.text
    d = r.json()["detail"]
    assert isinstance(d, dict)
    assert isinstance(d["message"], str) and "دمج المقررات المكررة" in d["message"]
    assert len(d["conflicts"]) == 1
    assert len(d["duplicates"]) == 1
    dup = d["duplicates"][0]
    assert dup["duplicate_course_id"] == seed["b"]
    assert dup["duplicate_course_name"] == DUP_NAME
    assert dup["this_course_id"] == seed["a"]
    assert dup["this_course_name"] == DUP_NAME
    assert "duplicate_teacher_name" in dup


# --- 409 with empty duplicates for a real conflict (different course) ---
def test_generate_409_real_conflict_no_duplicates(H, seed):
    r = requests.post(f"{BASE_URL}/api/lectures/generate-semester", headers=H, json=_payload(seed["a"], seed["other_slot"]))
    assert r.status_code == 409, r.text
    d = r.json()["detail"]
    assert isinstance(d, dict)
    assert d["duplicates"] == []
    assert len(d["conflicts"]) == 1 and OTHER_NAME in d["conflicts"][0]
    assert "دمج المقررات المكررة" not in d["message"]


# --- merge resolves the phantom conflict ---
def test_merge_then_dry_run_succeeds(H, seed, db):
    r = requests.post(f"{BASE_URL}/api/courses-tools/merge-duplicates", headers=H,
                      json={"keep_course_id": seed["a"], "remove_course_id": seed["b"]})
    assert r.status_code == 200, r.text
    assert r.json()["moved"]["weekly_schedule"] == 1
    b = db.courses.find_one({"_id": ObjectId(seed["b"])})
    assert b["is_active"] is False and b["merged_into"] == seed["a"]
    r = requests.post(f"{BASE_URL}/api/lectures/generate-semester", headers=H, json=_payload(seed["a"], seed["dup_slot"]))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("dry_run") is True
    assert d.get("to_create", 0) >= 1
    assert d.get("conflicts_skipped", 0) == 0
    groups = {g["name"] for g in requests.get(f"{BASE_URL}/api/courses-tools/duplicate-candidates", headers=H).json()["duplicates"]}
    assert DUP_NAME not in groups


# --- merge validation ---
def test_merge_self_400(H, seed):
    r = requests.post(f"{BASE_URL}/api/courses-tools/merge-duplicates", headers=H,
                      json={"keep_course_id": seed["a"], "remove_course_id": seed["a"]})
    assert r.status_code == 400


def test_merge_invalid_id_400(H):
    r = requests.post(f"{BASE_URL}/api/courses-tools/merge-duplicates", headers=H,
                      json={"keep_course_id": "bad", "remove_course_id": "bad2"})
    assert r.status_code == 400


def test_duplicate_candidates_requires_auth():
    r = requests.get(f"{BASE_URL}/api/courses-tools/duplicate-candidates")
    assert r.status_code in (401, 403)
