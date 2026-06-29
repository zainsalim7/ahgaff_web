"""Regression test for the *bulk* teaching-load semester fix (iteration 49).

Bug: POST /api/teaching-load/bulk inserted a teaching_load with
semester_id=null because the frontend doesn't send semester_id. Then GET
/api/teaching-load (defaults to active semester filter) couldn't see it
until startup backfill ran (~1h cold restart on Cloud Run).

Fix: bulk endpoint now computes
    effective_sem_id = item.semester_id OR course.semester_id OR active_semester_id
and, when the course has NO semester_id, the *course* document is also
migrated to the active semester so backfill won't undo it later.

This file covers the new contract end-to-end (no waiting allowed).
"""

import os
import pytest
import requests
from datetime import datetime, timezone
from pymongo import MongoClient
from bson import ObjectId


def _load_env_file(path):
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_file("/app/frontend/.env")
_load_env_file("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
assert BASE_URL, "REACT_APP_BACKEND_URL is required"


# ---------- shared fixtures ----------
@pytest.fixture(scope="module")
def db():
    return MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)[DB_NAME]


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "admin", "password": "admin123"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    token = r.json().get("access_token") or r.json().get("token")
    assert token
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def active_sem_id(db):
    sem = db.semesters.find_one({"status": "active"})
    assert sem, "No active semester"
    return str(sem["_id"])


@pytest.fixture(scope="module")
def old_sem_id(db, active_sem_id):
    sem = db.semesters.find_one({"status": {"$ne": "active"}})
    assert sem, "Need at least one non-active semester for Step 5"
    sid = str(sem["_id"])
    assert sid != active_sem_id
    return sid


@pytest.fixture(scope="module")
def primary_teacher(db):
    t = db.teachers.find_one(
        {"is_active": {"$ne": False}, "full_name": "حسن صالح"}
    ) or db.teachers.find_one({"is_active": {"$ne": False}})
    assert t, "No active teacher available"
    return t


@pytest.fixture(scope="module")
def secondary_teacher(db, primary_teacher):
    t = db.teachers.find_one(
        {"_id": {"$ne": primary_teacher["_id"]}, "is_active": {"$ne": False}}
    )
    assert t, "Need a second teacher for conflict test"
    return t


# ---------- helpers ----------
TEST_PREFIX = "TLBLK_"  # so cleanup can identify our docs
_created_courses = []   # course ids we created (to delete)
_created_loads = []     # teaching_load _ids we created
_courses_to_restore_orphan = []  # course ids whose semester_id we must reset to None


def _make_course(db, *, code_suffix, name, semester_id, faculty_id, department_id):
    doc = {
        "code": f"{TEST_PREFIX}{code_suffix}",
        "name": name,
        "credit_hours": 3,
        "level": 1,
        "section": "أ",
        "faculty_id": faculty_id,
        "department_id": department_id,
        "created_at": datetime.now(timezone.utc),
    }
    if semester_id is not None:
        doc["semester_id"] = semester_id
    res = db.courses.insert_one(doc)
    _created_courses.append(res.inserted_id)
    return str(res.inserted_id)


def _post_bulk(headers, teacher_id, course_id, weekly_hours=3, include_semester=None):
    body = [{"teacher_id": teacher_id, "course_id": course_id, "weekly_hours": weekly_hours}]
    if include_semester is not None:
        body[0]["semester_id"] = include_semester
    return requests.post(
        f"{BASE_URL}/api/teaching-load/bulk", headers=headers, json=body, timeout=30
    )


def _get_loads(headers, *, semester_id=None, all_semesters=False):
    params = {}
    if semester_id:
        params["semester_id"] = semester_id
    if all_semesters:
        params["all_semesters"] = "true"
    r = requests.get(
        f"{BASE_URL}/api/teaching-load", headers=headers, params=params, timeout=30
    )
    assert r.status_code == 200, r.text
    return r.json().get("items", [])


# ============================================================================
# Step 2 + 3: assign course already in active sem → load appears immediately
# ============================================================================
def test_bulk_assigns_course_in_active_semester_visible_immediately(
    db, admin_headers, active_sem_id, primary_teacher
):
    course_id = _make_course(
        db,
        code_suffix="ACT01",
        name="مقرر اختبار نشط",
        semester_id=active_sem_id,
        faculty_id=primary_teacher.get("faculty_id"),
        department_id=primary_teacher.get("department_id"),
    )

    # NOTE: deliberately NOT sending semester_id (mimics frontend)
    r = _post_bulk(admin_headers, str(primary_teacher["_id"]), course_id)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["created"] == 1, data
    assert data["updated"] == 0, data
    assert data["errors"] == [], data

    # GET default = active semester → must appear with no wait
    items = _get_loads(admin_headers)  # default filter = active
    match = [i for i in items if i["course_id"] == course_id and i["teacher_id"] == str(primary_teacher["_id"])]
    assert match, (
        f"New load NOT visible in GET /teaching-load (default active filter). "
        f"course_id={course_id}, teacher_id={primary_teacher['_id']}"
    )
    assert match[0]["semester_id"] == active_sem_id

    # Step 3: Mongo invariant
    load = db.teaching_loads.find_one(
        {"teacher_id": str(primary_teacher["_id"]), "course_id": course_id}
    )
    assert load, "teaching_load not in DB"
    _created_loads.append(load["_id"])
    assert load.get("semester_id") == active_sem_id, (
        f"teaching_load.semester_id must equal active ({active_sem_id}), got {load.get('semester_id')}"
    )


# ============================================================================
# Step 4: course with NO semester_id → load=active, course auto-migrated
# ============================================================================
def test_bulk_with_orphan_course_migrates_course_to_active(
    db, admin_headers, active_sem_id, primary_teacher
):
    course_id = _make_course(
        db,
        code_suffix="ORPH01",
        name="مقرر بدون فصل",
        semester_id=None,  # orphan!
        faculty_id=primary_teacher.get("faculty_id"),
        department_id=primary_teacher.get("department_id"),
    )

    r = _post_bulk(admin_headers, str(primary_teacher["_id"]), course_id)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["created"] == 1 and data["errors"] == [], data

    # (a) teaching_load created with semester_id == active
    load = db.teaching_loads.find_one(
        {"teacher_id": str(primary_teacher["_id"]), "course_id": course_id}
    )
    assert load
    _created_loads.append(load["_id"])
    assert load.get("semester_id") == active_sem_id, (
        f"Orphan-course load must inherit active semester. got={load.get('semester_id')}"
    )

    # (b) course doc auto-migrated to active
    course_after = db.courses.find_one({"_id": ObjectId(course_id)})
    assert course_after.get("semester_id") == active_sem_id, (
        f"Course should have been migrated to active semester. got={course_after.get('semester_id')}"
    )

    # (c) GET default (active filter) includes it immediately
    items = _get_loads(admin_headers)
    assert any(i["course_id"] == course_id for i in items), (
        "Auto-migrated load not visible in active-semester GET"
    )


# ============================================================================
# Step 5 (CRITICAL): course in OLD/non-active semester must NOT be moved
# ============================================================================
def test_bulk_with_old_semester_course_keeps_old_semester(
    db, admin_headers, active_sem_id, old_sem_id, primary_teacher
):
    course_id = _make_course(
        db,
        code_suffix="OLD01",
        name="مقرر في فصل قديم",
        semester_id=old_sem_id,
        faculty_id=primary_teacher.get("faculty_id"),
        department_id=primary_teacher.get("department_id"),
    )

    r = _post_bulk(admin_headers, str(primary_teacher["_id"]), course_id)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["created"] == 1 and data["errors"] == [], data

    # teaching_load must honour the course's OLD semester
    load = db.teaching_loads.find_one(
        {"teacher_id": str(primary_teacher["_id"]), "course_id": course_id}
    )
    assert load
    _created_loads.append(load["_id"])
    assert load.get("semester_id") == old_sem_id, (
        f"Old-sem course load MUST stay on old semester ({old_sem_id}), "
        f"got {load.get('semester_id')}. "
        f"This is the critical regression: archived courses must NOT be pulled into active."
    )

    # course doc must NOT have been changed
    course_after = db.courses.find_one({"_id": ObjectId(course_id)})
    assert course_after.get("semester_id") == old_sem_id, (
        f"OLD course must not be silently moved to active. got={course_after.get('semester_id')}"
    )

    # GET default (active) must NOT include it
    items_active = _get_loads(admin_headers)
    assert not any(i["course_id"] == course_id for i in items_active), (
        "Old-sem load incorrectly leaked into active-semester listing"
    )

    # GET ?all_semesters=true MUST include it
    items_all = _get_loads(admin_headers, all_semesters=True)
    assert any(i["course_id"] == course_id for i in items_all), (
        "Old-sem load missing from all_semesters=true listing"
    )


# ============================================================================
# Step 6: idempotency — same bulk twice → second is updated=1, no duplicates
# ============================================================================
def test_bulk_is_idempotent(db, admin_headers, active_sem_id, primary_teacher):
    course_id = _make_course(
        db,
        code_suffix="IDEMP01",
        name="مقرر اختبار idempotency",
        semester_id=active_sem_id,
        faculty_id=primary_teacher.get("faculty_id"),
        department_id=primary_teacher.get("department_id"),
    )

    r1 = _post_bulk(admin_headers, str(primary_teacher["_id"]), course_id)
    assert r1.status_code == 200
    assert r1.json()["created"] == 1

    r2 = _post_bulk(admin_headers, str(primary_teacher["_id"]), course_id)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["created"] == 0, d2
    assert d2["updated"] == 1, d2
    assert d2["errors"] == [], d2

    count = db.teaching_loads.count_documents(
        {"teacher_id": str(primary_teacher["_id"]), "course_id": course_id}
    )
    assert count == 1, f"Expected exactly 1 load for the pair, got {count} (duplicates!)"

    load = db.teaching_loads.find_one(
        {"teacher_id": str(primary_teacher["_id"]), "course_id": course_id}
    )
    _created_loads.append(load["_id"])


# ============================================================================
# Step 7: backfill must NOT reverse the new fix
# ============================================================================
def test_backfill_does_not_undo_bulk_fix(
    db, admin_headers, active_sem_id, primary_teacher
):
    # Create both: an active-sem course and an orphan course (which got migrated).
    course_a = _make_course(
        db, code_suffix="BFA01", name="active-sem للـ backfill",
        semester_id=active_sem_id,
        faculty_id=primary_teacher.get("faculty_id"),
        department_id=primary_teacher.get("department_id"),
    )
    course_b = _make_course(
        db, code_suffix="BFB01", name="orphan للـ backfill",
        semester_id=None,
        faculty_id=primary_teacher.get("faculty_id"),
        department_id=primary_teacher.get("department_id"),
    )

    for cid in (course_a, course_b):
        r = _post_bulk(admin_headers, str(primary_teacher["_id"]), cid)
        assert r.status_code == 200 and r.json()["created"] == 1, r.text

    # Run the backfill endpoint
    r = requests.post(
        f"{BASE_URL}/api/teaching-load/backfill-semester",
        headers=admin_headers, timeout=60,
    )
    assert r.status_code == 200, r.text

    # Both loads must STILL be on active semester after backfill
    for cid in (course_a, course_b):
        load = db.teaching_loads.find_one(
            {"teacher_id": str(primary_teacher["_id"]), "course_id": cid}
        )
        assert load, f"Load missing after backfill for course {cid}"
        _created_loads.append(load["_id"])
        assert load.get("semester_id") == active_sem_id, (
            f"Backfill REVERSED the bulk fix for course={cid}: "
            f"semester_id={load.get('semester_id')} (expected {active_sem_id})"
        )

    # And both loads remain visible in default GET
    items = _get_loads(admin_headers)
    visible = {i["course_id"] for i in items}
    assert course_a in visible and course_b in visible, (
        f"After backfill, loads disappeared from active-semester GET. visible={visible}"
    )


# ============================================================================
# Step 8: conflict detection (existing teacher on the course)
# ============================================================================
def test_bulk_conflict_detection_blocks_second_teacher(
    db, admin_headers, active_sem_id, primary_teacher, secondary_teacher
):
    course_id = _make_course(
        db, code_suffix="CONF01", name="مقرر اختبار التعارض",
        semester_id=active_sem_id,
        faculty_id=primary_teacher.get("faculty_id"),
        department_id=primary_teacher.get("department_id"),
    )

    # Primary teacher assigned first
    r1 = _post_bulk(admin_headers, str(primary_teacher["_id"]), course_id)
    assert r1.status_code == 200 and r1.json()["created"] == 1, r1.text
    load1 = db.teaching_loads.find_one(
        {"teacher_id": str(primary_teacher["_id"]), "course_id": course_id}
    )
    _created_loads.append(load1["_id"])

    # Secondary teacher attempts same course → must be rejected
    r2 = _post_bulk(admin_headers, str(secondary_teacher["_id"]), course_id)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2["created"] == 0, d2
    assert d2["updated"] == 0, d2
    assert d2["errors"], "Expected an error about course already assigned"
    joined = " ".join(d2["errors"])
    assert "مسند لـ" in joined, f"Error message should mention 'مسند لـ'; got: {d2['errors']}"

    # Mongo: still exactly 1 load (no duplicate created for secondary)
    count = db.teaching_loads.count_documents({"course_id": course_id})
    assert count == 1, f"Expected 1 load (no duplicates) but got {count}"


# ============================================================================
# Best-effort cleanup
# ============================================================================
def test_zz_cleanup(db):
    # delete teaching_loads we created
    if _created_loads:
        db.teaching_loads.delete_many({"_id": {"$in": _created_loads}})
    # also wipe any TLBLK_-prefixed leftovers (idempotent safety net)
    test_courses = list(db.courses.find({"code": {"$regex": f"^{TEST_PREFIX}"}}, {"_id": 1}))
    test_course_ids = [str(c["_id"]) for c in test_courses]
    if test_course_ids:
        db.teaching_loads.delete_many({"course_id": {"$in": test_course_ids}})
        db.courses.delete_many({"_id": {"$in": [c["_id"] for c in test_courses]}})

    # explicit safety: delete remaining created_courses we tracked
    if _created_courses:
        db.courses.delete_many({"_id": {"$in": _created_courses}})

    print(
        f"Cleanup: deleted {len(_created_loads)} loads and "
        f"{len(test_course_ids) or len(_created_courses)} test courses"
    )
