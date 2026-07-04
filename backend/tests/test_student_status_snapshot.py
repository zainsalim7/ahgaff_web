"""
Tests for Student Status Snapshot feature:
- Snapshot capture on frozen/repeat/expelled
- GET /api/student-statuses list + filters + search
- Snapshot immutability
- Restore endpoint
- Available-sections
- History log
- Permission scope
"""
import os
import asyncio
import uuid
import pytest
import requests
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

# Shared state across tests
STATE = {
    "s1": None,  # frozen
    "s2": None,  # repeat
    "s3": None,  # expelled
    "dept_id": None,
    "fac_id": None,
    "employee_user_id": None,
    "employee_token": None,
    "employee_username": None,
    "admin_token": None,
}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    STATE["admin_token"] = tok
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def db(event_loop):
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


# ---------- Seed ----------

def test_01_seed_students(event_loop, db):
    async def _seed():
        # Pick an existing dept/fac from students
        sample = await db.students.find_one({"is_active": True, "department_id": {"$exists": True}})
        assert sample is not None
        STATE["dept_id"] = str(sample["department_id"])
        STATE["fac_id"] = str(sample.get("faculty_id") or "")
        base_name = "TEST_SNAP"
        ids = []
        for i in range(1, 4):
            doc = {
                "student_id": f"TEST9{uuid.uuid4().hex[:6]}",
                "reference_number": f"TESTREF{uuid.uuid4().hex[:6]}",
                "full_name": f"{base_name}_طالب_{i}",
                "department_id": STATE["dept_id"],
                "faculty_id": STATE["fac_id"] or None,
                "level": 2,
                "section": "أ",
                "is_active": True,
                "status": "active",
                "created_at": "2026-01-01T00:00:00Z",
            }
            res = await db.students.insert_one(doc)
            ids.append(str(res.inserted_id))
        STATE["s1"], STATE["s2"], STATE["s3"] = ids
    event_loop.run_until_complete(_seed())
    assert STATE["s1"] and STATE["s2"] and STATE["s3"]


# ---------- Change statuses ----------

def _bulk_change(headers, ids, status, reason):
    return requests.post(
        f"{API}/student-status/bulk-change",
        headers=headers,
        json={"student_ids": ids, "new_status": status, "reason": reason},
    )


def test_02_change_to_frozen(admin_headers, event_loop, db):
    r = _bulk_change(admin_headers, [STATE["s1"]], "frozen", "ظروف صحية")
    assert r.status_code == 200, r.text
    assert r.json()["success_count"] == 1

    async def _check():
        d = await db.students.find_one({"_id": ObjectId(STATE["s1"])})
        assert d["status"] == "frozen"
        assert d["is_active"] is False
        assert d["status_reason"] == "ظروف صحية"
        snap = d.get("status_snapshot")
        assert snap, "snapshot missing"
        assert snap["level"] == 2
        assert snap["section"] == "أ"
        assert snap["semester_id"] is not None
        assert snap["academic_year"] is not None or snap["academic_year_id"] is not None
        assert snap["department_id"] is not None
        assert snap["captured_at"] is not None
    event_loop.run_until_complete(_check())


def test_03_change_to_repeat(admin_headers, event_loop, db):
    r = _bulk_change(admin_headers, [STATE["s2"]], "repeat", "رسوب متكرر")
    assert r.status_code == 200
    assert r.json()["success_count"] == 1

    async def _check():
        d = await db.students.find_one({"_id": ObjectId(STATE["s2"])})
        assert d["status"] == "repeat"
        assert d.get("status_snapshot")
    event_loop.run_until_complete(_check())


def test_04_change_to_expelled(admin_headers, event_loop, db):
    r = _bulk_change(admin_headers, [STATE["s3"]], "expelled", "مخالفة أكاديمية")
    assert r.status_code == 200

    async def _check():
        d = await db.students.find_one({"_id": ObjectId(STATE["s3"])})
        assert d["status"] == "expelled"
        assert d.get("status_snapshot")
        assert d.get("expulsion_date")
    event_loop.run_until_complete(_check())


# ---------- GET /api/student-statuses ----------

def test_05_list_all_nonactive(admin_headers):
    r = requests.get(f"{API}/student-statuses", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["items"]
    ids = {it["id"] for it in items}
    assert STATE["s1"] in ids and STATE["s2"] in ids and STATE["s3"] in ids
    for it in items:
        if it["id"] in {STATE["s1"], STATE["s2"], STATE["s3"]}:
            assert it["snapshot_level"] == 2
            assert it["snapshot_section"] == "أ"
            assert it["has_snapshot"] is True
            assert it["snapshot_semester_name"]


def test_06_filter_frozen(admin_headers):
    r = requests.get(f"{API}/student-statuses?status=frozen", headers=admin_headers)
    assert r.status_code == 200
    ids = {it["id"] for it in r.json()["items"]}
    assert STATE["s1"] in ids
    assert STATE["s2"] not in ids and STATE["s3"] not in ids


def test_07_filter_repeat_and_expelled(admin_headers):
    r = requests.get(f"{API}/student-statuses?status=repeat", headers=admin_headers)
    ids = {it["id"] for it in r.json()["items"]}
    assert STATE["s2"] in ids and STATE["s1"] not in ids and STATE["s3"] not in ids

    r = requests.get(f"{API}/student-statuses?status=expelled", headers=admin_headers)
    ids = {it["id"] for it in r.json()["items"]}
    assert STATE["s3"] in ids and STATE["s1"] not in ids and STATE["s2"] not in ids


def test_08_search_by_name(admin_headers):
    r = requests.get(f"{API}/student-statuses?q=TEST_SNAP", headers=admin_headers)
    assert r.status_code == 200
    ids = {it["id"] for it in r.json()["items"]}
    assert STATE["s1"] in ids and STATE["s2"] in ids and STATE["s3"] in ids


# ---------- Snapshot immutability ----------

def test_09_snapshot_immutability(admin_headers, event_loop, db):
    async def _tamper():
        await db.students.update_one(
            {"_id": ObjectId(STATE["s1"])},
            {"$set": {"level": 5, "section": "ج"}},
        )
    event_loop.run_until_complete(_tamper())

    r = requests.get(f"{API}/student-statuses?status=frozen", headers=admin_headers)
    assert r.status_code == 200
    found = next((it for it in r.json()["items"] if it["id"] == STATE["s1"]), None)
    assert found is not None
    assert found["snapshot_level"] == 2, f"snapshot mutated: {found}"
    assert found["snapshot_section"] == "أ"


# ---------- Available sections ----------

def test_10_available_sections(admin_headers):
    r = requests.get(
        f"{API}/student-status/available-sections?department_id={STATE['dept_id']}",
        headers=admin_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["levels"] == [1, 2, 3, 4]
    assert isinstance(data["sections"], list) and len(data["sections"]) >= 1


# ---------- Restore ----------

def test_11_restore_frozen_to_active(admin_headers, event_loop, db):
    r = requests.post(
        f"{API}/student-status/{STATE['s1']}/restore",
        headers=admin_headers,
        json={"new_level": 1, "new_section": "ب", "reason": "قرار مجلس"},
    )
    assert r.status_code == 200, r.text

    async def _check():
        d = await db.students.find_one({"_id": ObjectId(STATE["s1"])})
        assert d["status"] == "active"
        assert d["is_active"] is True
        assert d["level"] == 1
        assert d["section"] == "ب"
        assert "status_snapshot" not in d
    event_loop.run_until_complete(_check())


def test_12_restore_on_active_fails(admin_headers):
    r = requests.post(
        f"{API}/student-status/{STATE['s1']}/restore",
        headers=admin_headers,
        json={"new_level": 1, "new_section": "ب", "reason": "test"},
    )
    assert r.status_code == 400
    assert "لا يمكن استرجاع" in r.text or "active" in r.text


def test_13_restore_invalid_level(admin_headers):
    r = requests.post(
        f"{API}/student-status/{STATE['s2']}/restore",
        headers=admin_headers,
        json={"new_level": 99, "new_section": "ب"},
    )
    assert r.status_code == 422


# ---------- History ----------

def test_14_history_has_repeat(admin_headers):
    r = requests.get(f"{API}/student-status/{STATE['s2']}/history", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["items"]
    assert any(it.get("new_status") == "repeat" for it in items)


# ---------- Permission scope ----------

def test_15_employee_without_permission_forbidden(admin_headers, event_loop, db):
    """Create an employee user with no manage_students/view_students perms -> 403."""
    async def _create_user():
        import bcrypt
        uname = f"test_snap_emp_{uuid.uuid4().hex[:6]}"
        pw = "test1234"
        hashed = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
        from datetime import datetime, timezone
        doc = {
            "username": uname,
            "password": hashed,
            "role": "employee",
            "permissions": [],  # no perms at all
            "is_active": True,
            "full_name": "TEST snap emp",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        res = await db.users.insert_one(doc)
        STATE["employee_user_id"] = str(res.inserted_id)
        STATE["employee_username"] = uname
        return uname, pw
    uname, pw = event_loop.run_until_complete(_create_user())

    r = requests.post(f"{API}/auth/login", json={"username": uname, "password": pw})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    STATE["employee_token"] = tok

    r = requests.get(f"{API}/student-statuses", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


# ---------- Cleanup ----------

def test_99_cleanup(event_loop, db):
    async def _cleanup():
        for sid in [STATE["s1"], STATE["s2"], STATE["s3"]]:
            if sid:
                await db.students.delete_one({"_id": ObjectId(sid)})
                await db.student_status_history.delete_many({"student_db_id": sid})
        if STATE["employee_user_id"]:
            await db.users.delete_one({"_id": ObjectId(STATE["employee_user_id"])})
    event_loop.run_until_complete(_cleanup())
