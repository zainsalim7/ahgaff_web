"""Tests for alumni department snapshot behavior.

Covers:
- Bulk graduation stores department_snapshot
- list_alumni prefers snapshot over current lookup (even if department_id is changed later)
- Restore returns student to original department (from snapshot)
- Backfill migration fills missing snapshot
- Bulk graduate detailed failures (invalid IDs, non-existent) and skipped for already graduated
- Single graduate stores snapshot
- List idempotency

Cleans up all seed data at teardown.
"""
import os
import asyncio
import pytest
import requests
from bson import ObjectId
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com"
).rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
API = f"{BASE_URL}/api"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def mongo():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{API}/auth/login",
        json={"username": "admin", "password": "admin123"},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# Store IDs created to cleanup
CREATED = {
    "faculty_id": None,
    "other_faculty_id": None,
    "dept_id": None,
    "other_dept_id": None,
    "student_ids": [],   # active seed students
    "extra_ids": [],     # extras added during tests (backfill legacy, step-6/9)
}


@pytest.fixture(scope="module", autouse=True)
def seed_and_cleanup(event_loop, mongo):
    """Create faculty + department + 3 students. Cleanup at end."""
    async def _seed():
        # Faculty (Shariah & Law) — use unique test name to avoid collision
        fac_doc = {
            "name": "TEST_شريعة_وقانون",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        res = await mongo.faculties.insert_one(fac_doc)
        CREATED["faculty_id"] = str(res.inserted_id)

        # Other faculty for "sneaky" reassignment scenario
        res2 = await mongo.faculties.insert_one({
            "name": "TEST_كلية_أخرى",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        CREATED["other_faculty_id"] = str(res2.inserted_id)

        # Department (الشريعة والقانون)
        dept_doc = {
            "name": "الشريعة والقانون",
            "faculty_id": CREATED["faculty_id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        rd = await mongo.departments.insert_one(dept_doc)
        CREATED["dept_id"] = str(rd.inserted_id)

        # Other unrelated department (for sneaky reassign)
        rd2 = await mongo.departments.insert_one({
            "name": "TEST_قسم_مختلف",
            "faculty_id": CREATED["other_faculty_id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        CREATED["other_dept_id"] = str(rd2.inserted_id)

        # 3 active students
        now = datetime.now(timezone.utc).isoformat()
        for i in range(3):
            sd = {
                "full_name": f"TEST_طالب_{i+1}",
                "student_id": f"TEST-STU-{i+1}",
                "reference_number": f"TESTREF-{i+1}",
                "department_id": CREATED["dept_id"],
                "faculty_id": CREATED["faculty_id"],
                "status": "active",
                "is_alumni": False,
                "level": 4,
                "created_at": now,
            }
            r = await mongo.students.insert_one(sd)
            CREATED["student_ids"].append(str(r.inserted_id))

    event_loop.run_until_complete(_seed())

    yield

    async def _cleanup():
        all_ids = CREATED["student_ids"] + CREATED["extra_ids"]
        obj_ids = [ObjectId(x) for x in all_ids if x]
        if obj_ids:
            await mongo.students.delete_many({"_id": {"$in": obj_ids}})
        dept_obj_ids = [
            ObjectId(x) for x in [CREATED.get("dept_id"), CREATED.get("other_dept_id")] if x
        ]
        if dept_obj_ids:
            await mongo.departments.delete_many({"_id": {"$in": dept_obj_ids}})
        fac_obj_ids = [
            ObjectId(x) for x in [CREATED.get("faculty_id"), CREATED.get("other_faculty_id")] if x
        ]
        if fac_obj_ids:
            await mongo.faculties.delete_many({"_id": {"$in": fac_obj_ids}})
        # Clean activity logs for our test users? skip; low-risk.

    event_loop.run_until_complete(_cleanup())


# ---------------- Tests ----------------

def test_step2_bulk_graduate_stores_snapshot(event_loop, mongo, headers):
    """Step 2: Bulk graduate 3 students; ensure snapshot saved."""
    ids = CREATED["student_ids"]
    r = requests.post(
        f"{API}/students/bulk-graduate",
        json={"student_ids": ids, "graduation_year": 2025},
        headers=headers, timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["graduated"] == 3, data
    assert data["failed"] == [], data
    # Verify DB: each has department_snapshot
    async def _check():
        for sid in ids:
            s = await mongo.students.find_one({"_id": ObjectId(sid)})
            assert s["is_alumni"] is True
            snap = (s.get("graduation_data") or {}).get("department_snapshot") or {}
            assert snap.get("department_name") == "الشريعة والقانون", snap
            assert snap.get("faculty_name") == "TEST_شريعة_وقانون", snap
            assert snap.get("department_id") == CREATED["dept_id"]
    event_loop.run_until_complete(_check())


def test_step3_list_alumni_uses_snapshot_after_dept_change(event_loop, mongo, headers):
    """Step 3: list_alumni shows snapshot department even if student's dept_id was changed."""
    # Baseline: list has all three with correct dept name
    r = requests.get(f"{API}/alumni?year=2025", headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    our = [x for x in items if x["id"] in CREATED["student_ids"]]
    assert len(our) == 3
    for x in our:
        assert x["department_name"] == "الشريعة والقانون", x
        assert x["faculty_name"] == "TEST_شريعة_وقانون", x

    # Sneaky: modify one student's department_id to a different department
    target_id = CREATED["student_ids"][0]

    async def _tamper():
        await mongo.students.update_one(
            {"_id": ObjectId(target_id)},
            {"$set": {
                "department_id": CREATED["other_dept_id"],
                "faculty_id": CREATED["other_faculty_id"],
            }},
        )
    event_loop.run_until_complete(_tamper())

    r2 = requests.get(f"{API}/alumni?year=2025", headers=headers, timeout=20)
    assert r2.status_code == 200
    items2 = r2.json()["items"]
    tampered = next(x for x in items2 if x["id"] == target_id)
    # snapshot should still win
    assert tampered["department_name"] == "الشريعة والقانون", tampered
    assert tampered["faculty_name"] == "TEST_شريعة_وقانون", tampered


def test_step4_restore_returns_to_original_department(event_loop, mongo, headers):
    """Step 4: restore alumni returns them to snapshot department."""
    target_id = CREATED["student_ids"][0]  # this one was tampered in step 3
    r = requests.put(f"{API}/alumni/{target_id}/restore", headers=headers, timeout=20)
    assert r.status_code == 200, r.text

    async def _check():
        s = await mongo.students.find_one({"_id": ObjectId(target_id)})
        assert s["is_alumni"] is False
        assert str(s["department_id"]) == CREATED["dept_id"], s.get("department_id")
        assert str(s.get("faculty_id") or "") == CREATED["faculty_id"]
    event_loop.run_until_complete(_check())


def test_step5_backfill_snapshot_migration(event_loop, mongo):
    """Step 5: create legacy alumnus without snapshot, run backfill, verify."""
    now = datetime.now(timezone.utc).isoformat()
    legacy_doc = {
        "full_name": "TEST_خريج_قديم",
        "student_id": "TEST-OLD-1",
        "department_id": CREATED["dept_id"],
        "faculty_id": CREATED["faculty_id"],
        "status": "graduated",
        "is_alumni": True,
        "level": 4,
        "graduation_data": {
            "year": 2020,
            "date": None,
            "semester": None,
            "final_gpa": None,
            "graduated_at": now,
        },
        "created_at": now,
    }

    async def _insert_and_backfill():
        res = await mongo.students.insert_one(legacy_doc)
        CREATED["extra_ids"].append(str(res.inserted_id))
        # Import backfill from server (needs env loaded)
        import sys
        sys.path.insert(0, "/app/backend/backend")
        # server.db is initialized on import; call the async function
        from server import backfill_alumni_department_snapshot_internal
        await backfill_alumni_department_snapshot_internal()
        # Verify
        s = await mongo.students.find_one({"_id": res.inserted_id})
        snap = (s.get("graduation_data") or {}).get("department_snapshot") or {}
        assert snap.get("department_name") == "الشريعة والقانون", snap
        assert snap.get("backfilled") is True, snap
        assert snap.get("faculty_name") == "TEST_شريعة_وقانون", snap
    event_loop.run_until_complete(_insert_and_backfill())


def test_step6_bulk_graduate_detailed_failures(event_loop, mongo, headers):
    """Step 6: mix of invalid ObjectId, non-existent, and one valid."""
    # We restored student[0] in step 4 → it's active now. Use it as the valid one.
    # But we also need a "fresh" valid; use the restored student.
    valid_id = CREATED["student_ids"][0]
    invalid_id = "not_an_object_id"
    nonexistent_id = str(ObjectId())  # random valid ObjectId, no such student

    payload = {
        "student_ids": [invalid_id, nonexistent_id, valid_id],
        "graduation_year": 2026,
    }
    r = requests.post(f"{API}/students/bulk-graduate", json=payload, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["graduated"] == 1, data
    assert len(data["failed"]) == 2, data
    for f in data["failed"]:
        assert "id" in f and "error" in f, f


def test_step7_skipped_already_graduated(event_loop, mongo, headers):
    """Step 7: re-submit an already graduated ID → appears in skipped, not failed."""
    already = CREATED["student_ids"][1]  # graduated in step2, still alumni
    payload = {"student_ids": [already], "graduation_year": 2025}
    r = requests.post(f"{API}/students/bulk-graduate", json=payload, headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["graduated"] == 0
    assert data["failed"] == []
    assert len(data["skipped"]) == 1
    assert data["skipped"][0]["reason"] == "متخرج بالفعل"


def test_step8_idempotent_list_alumni(headers):
    r1 = requests.get(f"{API}/alumni?year=2025", headers=headers, timeout=20).json()
    r2 = requests.get(f"{API}/alumni?year=2025", headers=headers, timeout=20).json()
    assert r1["total"] == r2["total"]
    # ordered by grad year then name — same
    ids1 = [x["id"] for x in r1["items"]]
    ids2 = [x["id"] for x in r2["items"]]
    assert ids1 == ids2


def test_step9_single_graduate_stores_snapshot(event_loop, mongo, headers):
    """Step 9: single POST /students/{id}/graduate stores snapshot."""
    now = datetime.now(timezone.utc).isoformat()

    async def _create():
        doc = {
            "full_name": "TEST_طالب_مفرد",
            "student_id": "TEST-SINGLE-1",
            "department_id": CREATED["dept_id"],
            "faculty_id": CREATED["faculty_id"],
            "status": "active",
            "is_alumni": False,
            "level": 4,
            "created_at": now,
        }
        res = await mongo.students.insert_one(doc)
        CREATED["extra_ids"].append(str(res.inserted_id))
        return str(res.inserted_id)

    sid = event_loop.run_until_complete(_create())
    r = requests.post(
        f"{API}/students/{sid}/graduate",
        json={"graduation_year": 2027, "graduation_semester": "first"},
        headers=headers, timeout=20,
    )
    assert r.status_code == 200, r.text

    async def _check():
        s = await mongo.students.find_one({"_id": ObjectId(sid)})
        snap = (s.get("graduation_data") or {}).get("department_snapshot") or {}
        assert snap.get("department_name") == "الشريعة والقانون", snap
        assert snap.get("faculty_name") == "TEST_شريعة_وقانون", snap
    event_loop.run_until_complete(_check())
