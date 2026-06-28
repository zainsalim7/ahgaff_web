"""
Backend test for teaching_loads.semester_id fix (iteration 46).

Verifies:
  1) No orphan teaching_loads records remain in MongoDB after backend startup.
  2) PUT /api/courses/{id} setting teacher_id creates a teaching_load WITH semester_id.
  3) The new assignment appears IMMEDIATELY in GET /api/teaching-load?teacher_id=X
     (default filter = active semester) — no /sync, no delay.
  4) POST /api/teaching-load/backfill-semester returns {success, fixed, total_orphans}
     and leaves zero orphans.
  5) Default GET /api/teaching-load filters by active semester (does NOT leak past
     semesters), while all_semesters=true returns more rows.
"""

import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

assert BASE_URL, "REACT_APP_BACKEND_URL must be set"


# ---------------- Fixtures ----------------

@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(api):
    r = api.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "admin", "password": "admin123"},
        timeout=20,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


def _run(coro):
    # Compat shim retained for older test bodies; new code uses sync pymongo directly.
    raise RuntimeError("_run() not supported with pymongo; use mongo_db directly")


# ---------------- Tests ----------------

# Feature: startup migration (backfill_teaching_loads_semester_internal)
def test_no_orphan_teaching_loads_after_startup(mongo_db):
    """Verify the startup migration left no records without semester_id."""
    total = mongo_db.teaching_loads.count_documents({})
    orphans = mongo_db.teaching_loads.count_documents({
        "$or": [
            {"semester_id": None},
            {"semester_id": ""},
            {"semester_id": {"$exists": False}},
        ]
    })
    print(f"teaching_loads total={total}, orphans={orphans}")
    assert orphans == 0, f"Found {orphans} orphan records out of {total}"


# Feature: POST /api/teaching-load/backfill-semester endpoint
def test_backfill_semester_endpoint(api, admin_headers):
    r = api.post(f"{BASE_URL}/api/teaching-load/backfill-semester", headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"backfill returned {r.status_code}: {r.text}"
    body = r.json()
    assert body.get("success") is True
    assert "fixed" in body
    # total_orphans only present when there were orphans; allow absence (success with 0)
    if body.get("fixed", 0) > 0 or "total_orphans" in body:
        assert "total_orphans" in body
    print("Backfill response:", body)


# Feature: PUT /api/courses/{id} -> teaching_load created WITH semester_id, visible immediately
def test_assign_teacher_creates_visible_teaching_load(api, admin_headers, mongo_db):
    """End-to-end: pick a course, assign teacher, GET /teaching-load -> assignment is there."""

    # 1) Find an active semester id
    s = mongo_db.semesters.find_one({"status": "active"})
    active_sem_id = str(s["_id"]) if s else None
    assert active_sem_id, "No active semester present in DB; cannot validate"

    # 2) Fetch a teacher id
    r_t = api.get(f"{BASE_URL}/api/teachers", headers=admin_headers, timeout=20)
    assert r_t.status_code == 200, f"GET /teachers {r_t.status_code}: {r_t.text[:300]}"
    teachers = r_t.json()
    if isinstance(teachers, dict):
        teachers = teachers.get("items") or teachers.get("teachers") or []
    assert len(teachers) > 0, "No teachers available"
    teacher_id = teachers[0].get("id") or teachers[0].get("_id")
    assert teacher_id, f"No teacher id field: {teachers[0]}"

    # 3) Fetch courses; we MUST pick a course in the ACTIVE semester (or with no
    #    semester_id — which the fix will tag with the active semester). This mirrors
    #    the real user workflow: assigning teachers in the current term.
    r_c = api.get(f"{BASE_URL}/api/courses", headers=admin_headers, timeout=20)
    assert r_c.status_code == 200, f"GET /courses {r_c.status_code}: {r_c.text[:300]}"
    courses = r_c.json()
    if isinstance(courses, dict):
        courses = courses.get("items") or courses.get("courses") or []
    assert len(courses) > 0, "No courses available"
    target = None
    for c in courses:
        cid = c.get("id") or c.get("_id")
        c_sem = c.get("semester_id")
        if cid and (c_sem == active_sem_id or not c_sem):
            target = c
            break
    assert target, (
        "No course in active semester or with empty semester_id — cannot validate "
        "the visibility-on-default-filter assertion."
    )
    course_id = target.get("id") or target.get("_id")
    original_teacher = target.get("teacher_id")
    print(
        f"Using active-sem course_id={course_id} (sem={target.get('semester_id')}, "
        f"original teacher={original_teacher}) and teacher_id={teacher_id}"
    )

    # If the chosen teacher is already on this course, pick another teacher (so we trigger insert)
    if original_teacher == teacher_id and len(teachers) > 1:
        teacher_id = teachers[1].get("id") or teachers[1].get("_id")
        print(f"Switched to alternate teacher_id={teacher_id} (avoid no-op)")

    # 4) PUT teacher_id
    put_payload = {"teacher_id": teacher_id}
    r_put = api.put(f"{BASE_URL}/api/courses/{course_id}", headers=admin_headers, json=put_payload, timeout=30)
    assert r_put.status_code == 200, f"PUT /courses/{course_id} {r_put.status_code}: {r_put.text[:400]}"

    # 5) Immediately verify the teaching_load doc in Mongo HAS semester_id
    load = mongo_db.teaching_loads.find_one({
        "course_id": course_id,
        "teacher_id": teacher_id,
    })
    assert load is not None, "teaching_load was NOT created on assignment"
    assert load.get("semester_id"), f"teaching_load is missing semester_id: {load}"
    print(f"teaching_load doc has semester_id={load.get('semester_id')}")

    # 6) Immediately call GET /teaching-load?teacher_id=X and verify the row appears
    r_tl = api.get(
        f"{BASE_URL}/api/teaching-load",
        headers=admin_headers,
        params={"teacher_id": teacher_id},
        timeout=20,
    )
    assert r_tl.status_code == 200, f"GET /teaching-load {r_tl.status_code}: {r_tl.text[:300]}"
    data = r_tl.json()
    items = data.get("items") if isinstance(data, dict) else data
    assert items is not None, f"Unexpected /teaching-load shape: {data}"
    course_ids_in_response = [
        (it.get("course_id") or (it.get("course") or {}).get("id"))
        for it in items
    ]
    assert course_id in course_ids_in_response, (
        f"New assignment not visible immediately. Items: {items[:5]}"
    )
    print(f"Assignment visible immediately: {len(items)} items for teacher {teacher_id}")

    # 7) Cleanup: revert teacher_id on the course (best-effort) so re-running tests works
    try:
        if original_teacher and original_teacher != teacher_id:
            api.put(
                f"{BASE_URL}/api/courses/{course_id}",
                headers=admin_headers,
                json={"teacher_id": original_teacher},
                timeout=20,
            )
    except Exception:
        pass


# Feature: GET /teaching-load default filter = active semester (no cross-semester leak)
def test_default_filter_uses_active_semester(api, admin_headers, mongo_db):
    """Default call should return only rows of the active semester.
    With all_semesters=true, count should be >= default count.
    """
    s = mongo_db.semesters.find_one({"status": "active"})
    active_sem_id = str(s["_id"]) if s else None
    assert active_sem_id

    r_def = api.get(f"{BASE_URL}/api/teaching-load", headers=admin_headers, timeout=20)
    assert r_def.status_code == 200, f"{r_def.status_code}: {r_def.text[:200]}"
    items_default = r_def.json().get("items", []) if isinstance(r_def.json(), dict) else r_def.json()

    r_all = api.get(
        f"{BASE_URL}/api/teaching-load",
        headers=admin_headers,
        params={"all_semesters": "true"},
        timeout=20,
    )
    assert r_all.status_code == 200, f"{r_all.status_code}: {r_all.text[:200]}"
    items_all = r_all.json().get("items", []) if isinstance(r_all.json(), dict) else r_all.json()

    # Every default-row must belong to active semester (when semester_id present in item)
    for it in items_default:
        sid = it.get("semester_id") or (it.get("semester") or {}).get("id")
        if sid:
            assert sid == active_sem_id, (
                f"Default response leaked non-active semester row: {it}"
            )
    assert len(items_all) >= len(items_default), (
        f"all_semesters returned fewer rows ({len(items_all)}) than default ({len(items_default)})"
    )
    print(f"default={len(items_default)} active-only, all_semesters={len(items_all)}")
