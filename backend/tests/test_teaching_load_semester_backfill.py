"""Backend regression tests for teaching_loads semester_id backfill fix.

Verifies that the backfill aligns teaching_loads.semester_id with the parent
course.semester_id (NOT the active semester as a default), preventing
historical teaching_load records from showing up in the active semester view.
"""

import os
import pytest
import requests
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
            v = v.strip().strip('"').strip("'")
            os.environ.setdefault(k.strip(), v)


_load_env_file("/app/frontend/.env")
_load_env_file("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
assert BASE_URL, "REACT_APP_BACKEND_URL is required"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "admin", "password": "admin123"},
        timeout=30,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def mongo_db():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def active_semester(mongo_db):
    sem = mongo_db.semesters.find_one({"status": "active"})
    assert sem, "No active semester found in DB"
    return sem


# ---- Test 1: Manual endpoint responds 200 with expected schema ----
def test_backfill_endpoint_responds_with_expected_shape(auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/teaching-load/backfill-semester",
        headers=auth_headers,
        timeout=60,
    )
    assert r.status_code == 200, f"Backfill returned {r.status_code}: {r.text}"
    data = r.json()
    for k in ["success", "fixed", "reset_to_orphan", "course_missing", "total_checked"]:
        assert k in data, f"Missing key '{k}' in response: {data}"
    assert data["success"] is True
    assert isinstance(data["fixed"], int)
    assert isinstance(data["reset_to_orphan"], int)
    assert isinstance(data["course_missing"], int)
    assert isinstance(data["total_checked"], int)
    print(f"First backfill call: {data}")


# ---- Test 2: Idempotency — second call must return zeros ----
def test_backfill_is_idempotent(auth_headers):
    # First call to ensure aligned state
    r1 = requests.post(
        f"{BASE_URL}/api/teaching-load/backfill-semester",
        headers=auth_headers,
        timeout=60,
    )
    assert r1.status_code == 200
    # Second call must be a no-op
    r2 = requests.post(
        f"{BASE_URL}/api/teaching-load/backfill-semester",
        headers=auth_headers,
        timeout=60,
    )
    assert r2.status_code == 200
    data2 = r2.json()
    assert data2["fixed"] == 0, (
        f"Second backfill should not fix anything but reported fixed={data2['fixed']}. "
        f"This means the alignment logic is not stable. Response: {data2}"
    )
    assert data2["reset_to_orphan"] == 0, (
        f"Second backfill should not reset anything but reported "
        f"reset_to_orphan={data2['reset_to_orphan']}. Response: {data2}"
    )
    print(f"Idempotent second call: {data2}")


# ---- Test 3: Direct Mongo invariant — every teaching_load.semester_id ----
# ---- must equal course.semester_id (or both null), no exceptions. ----
def test_mongo_invariant_load_semester_matches_course_semester(mongo_db, auth_headers):
    # Ensure backfill has been run first
    requests.post(
        f"{BASE_URL}/api/teaching-load/backfill-semester",
        headers=auth_headers,
        timeout=60,
    )

    all_loads = list(mongo_db.teaching_loads.find({}))
    assert len(all_loads) > 0, "No teaching_loads present in DB — cannot validate invariant"

    mismatches = []
    course_missing = 0
    for load in all_loads:
        try:
            course = mongo_db.courses.find_one({"_id": ObjectId(load["course_id"])})
        except Exception:
            course_missing += 1
            continue
        if not course:
            course_missing += 1
            continue
        course_sem = course.get("semester_id")
        load_sem = load.get("semester_id")
        # Normalize None vs empty string
        if (course_sem or None) != (load_sem or None):
            mismatches.append({
                "load_id": str(load["_id"]),
                "course_id": load.get("course_id"),
                "load_semester_id": load_sem,
                "course_semester_id": course_sem,
            })

    print(
        f"Total loads={len(all_loads)}, course_missing={course_missing}, "
        f"mismatches={len(mismatches)}"
    )
    if mismatches[:5]:
        print(f"Sample mismatches: {mismatches[:5]}")
    assert not mismatches, (
        f"Found {len(mismatches)} teaching_loads whose semester_id does not match "
        f"course.semester_id. Sample: {mismatches[:3]}"
    )


# ---- Test 4: The original regression case — no teaching_load should be in ----
# ---- active semester while its course belongs to a different (old) semester ----
def test_no_load_in_active_semester_with_old_course(mongo_db, active_semester):
    active_id = str(active_semester["_id"])

    loads_in_active = list(
        mongo_db.teaching_loads.find({"semester_id": active_id})
    )
    print(f"Loads in active semester ({active_id}): {len(loads_in_active)}")

    regression_records = []
    for load in loads_in_active:
        try:
            course = mongo_db.courses.find_one({"_id": ObjectId(load["course_id"])})
        except Exception:
            continue
        if not course:
            continue
        course_sem = course.get("semester_id")
        if course_sem and course_sem != active_id:
            regression_records.append({
                "load_id": str(load["_id"]),
                "course_id": load.get("course_id"),
                "course_semester_id": course_sem,
                "active_semester_id": active_id,
            })

    assert not regression_records, (
        f"REGRESSION: Found {len(regression_records)} teaching_load(s) tagged with "
        f"active semester but whose parent course belongs to an OLD semester. "
        f"Sample: {regression_records[:3]}"
    )


# ---- Test 5: Orphan handling — loads of courses with no semester_id ----
# ---- should be orphan (semester_id null), NOT pinned to active semester ----
def test_orphan_courses_yield_orphan_loads(mongo_db, active_semester):
    active_id = str(active_semester["_id"])

    # Find courses with no semester_id (or null/empty)
    orphan_courses = list(
        mongo_db.courses.find(
            {"$or": [{"semester_id": None}, {"semester_id": ""}, {"semester_id": {"$exists": False}}]}
        )
    )
    print(f"Orphan courses (no semester_id): {len(orphan_courses)}")

    if not orphan_courses:
        pytest.skip("No orphan courses to validate (this is fine)")

    orphan_course_ids = {str(c["_id"]) for c in orphan_courses}
    violations = []
    for load in mongo_db.teaching_loads.find({"course_id": {"$in": list(orphan_course_ids)}}):
        sem_id = load.get("semester_id")
        if sem_id:  # any non-null value is a violation
            violations.append({
                "load_id": str(load["_id"]),
                "course_id": load.get("course_id"),
                "load_semester_id": sem_id,
                "is_active": sem_id == active_id,
            })

    assert not violations, (
        f"Found {len(violations)} teaching_load(s) attached to orphan courses but "
        f"with non-null semester_id (should be null). Sample: {violations[:3]}"
    )


# ---- Test 6: API filter view — GET /teaching-load?semester_id=ACTIVE ----
# ---- must only return loads whose course truly belongs to active semester ----
def test_api_listing_active_semester_only_returns_active_courses(
    mongo_db, active_semester, auth_headers
):
    active_id = str(active_semester["_id"])

    r = requests.get(
        f"{BASE_URL}/api/teaching-load?semester_id={active_id}",
        headers=auth_headers,
        timeout=60,
    )
    assert r.status_code == 200, f"GET /teaching-load failed: {r.status_code} {r.text}"
    payload = r.json()
    items = payload.get("items", payload if isinstance(payload, list) else [])
    print(f"API returned {len(items)} items for active semester")

    bad = []
    for item in items:
        course_id = item.get("course_id") or (item.get("course") or {}).get("id")
        if not course_id:
            continue
        try:
            course = mongo_db.courses.find_one({"_id": ObjectId(course_id)})
        except Exception:
            continue
        if not course:
            continue
        c_sem = course.get("semester_id")
        if c_sem and c_sem != active_id:
            bad.append({
                "load_id": item.get("id") or item.get("_id"),
                "course_id": course_id,
                "course_semester_id": c_sem,
            })

    assert not bad, (
        f"GET /api/teaching-load?semester_id=<ACTIVE> returned {len(bad)} record(s) "
        f"whose course belongs to a different (old) semester. Sample: {bad[:3]}"
    )


# ---- Test 7: Startup migration ran without errors (log check) ----
def test_startup_migration_ran_without_exception():
    log_path = "/var/log/supervisor/backend.err.log"
    if not os.path.exists(log_path):
        pytest.skip(f"Backend log not present at {log_path}")
    with open(log_path, "r", errors="ignore") as f:
        content = f.read()
    # Should not contain failure message for backfill
    assert "Teaching loads backfill failed" not in content, (
        "Startup migration raised an exception (see backend.err.log)"
    )
    # Positive signal: either the success log or no log (when nothing to fix)
    print("Startup migration completed without exception (no failure log present)")
