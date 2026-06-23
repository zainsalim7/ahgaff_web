"""
Iteration 38 tests: GET /api/students/{id}/courses must return ONLY explicitly-enrolled
courses in the active semester. NO inference fallback.

Also verifies GET /api/enrollments/{course_id} returns enrolled students.
"""
import os
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_USER = "admin"
ADMIN_PASS = "admin123"

KNOWN_STUDENT_WITH_ENROLLMENTS = "698e57518cfb2f14627a285e"
KNOWN_ACTIVE_COURSE_ID = "6a343eaf15515862788eddab"
KNOWN_ACTIVE_SEMESTER_ID = "6a21bee0ddb8d04530cf65f4"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": ADMIN_USER, "password": ADMIN_PASS},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    return client[DB_NAME]


# ========================================================
# 1. Student WITH explicit enrollment in active semester
# ========================================================
def test_student_with_active_enrollment_returns_explicit_courses(headers):
    r = requests.get(
        f"{BASE_URL}/api/students/{KNOWN_STUDENT_WITH_ENROLLMENTS}/courses",
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert isinstance(data, dict), "Response must be a dict (not legacy list)"
    assert data["is_inferred"] is False, "is_inferred must be False — no inference allowed"
    assert data["total_courses"] == 1, f"Expected 1 active enrollment, got {data['total_courses']}: {data}"
    assert len(data["courses"]) == 1
    assert data["courses"][0]["id"] == KNOWN_ACTIVE_COURSE_ID


# ========================================================
# 2. Student WITHOUT any enrollment → empty list
# ========================================================
def test_student_without_enrollments_returns_empty(headers, db):
    # Find a student that has no rows in enrollments collection
    candidate = None
    for s in db.students.find({}).limit(100):
        sid = str(s["_id"])
        if db.enrollments.count_documents({"student_id": sid}) == 0:
            candidate = sid
            break
    if not candidate:
        pytest.skip("No student without enrollments found in DB")

    r = requests.get(
        f"{BASE_URL}/api/students/{candidate}/courses",
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert data["is_inferred"] is False, "Must NEVER be inferred"
    assert data["total_courses"] == 0, f"Expected empty, got {data}"
    assert data["courses"] == [], f"Expected [], got {data['courses']}"


# ========================================================
# 3. Student with enrollments ONLY in inactive semesters → empty
# ========================================================
def test_student_with_only_inactive_enrollments_returns_empty(headers, db):
    active_sem = db.semesters.find_one({"status": "active"})
    if not active_sem:
        pytest.skip("No active semester in DB")
    active_id_str = str(active_sem["_id"])

    # Find a student whose enrollments all map to courses with semester_id != active
    candidate = None
    for enr_doc in db.enrollments.aggregate([
        {"$group": {"_id": "$student_id", "course_ids": {"$addToSet": "$course_id"}}},
        {"$limit": 200},
    ]):
        sid = enr_doc["_id"]
        if not sid:
            continue
        course_oids = []
        for cid in enr_doc["course_ids"]:
            try:
                course_oids.append(ObjectId(cid))
            except Exception:
                continue
        if not course_oids:
            continue
        courses_in_active = db.courses.count_documents({
            "_id": {"$in": course_oids},
            "semester_id": {"$in": [active_id_str, active_sem["_id"]]},
        })
        if courses_in_active == 0:
            # validate the student doc exists
            try:
                if db.students.find_one({"_id": ObjectId(sid)}):
                    candidate = sid
                    break
            except Exception:
                continue

    if not candidate:
        pytest.skip("No student found with only inactive-semester enrollments")

    r = requests.get(
        f"{BASE_URL}/api/students/{candidate}/courses",
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert data["is_inferred"] is False
    assert data["total_courses"] == 0, f"Inactive-only student must yield empty, got {data}"
    assert data["courses"] == []


# ========================================================
# 4. Course enrollments endpoint returns the enrolled students
# ========================================================
def test_course_enrollments_returns_students(headers):
    r = requests.get(
        f"{BASE_URL}/api/enrollments/{KNOWN_ACTIVE_COURSE_ID}",
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    # Endpoint may return list directly or wrapped dict
    if isinstance(data, dict):
        students = data.get("students") or data.get("enrollments") or []
    else:
        students = data
    assert isinstance(students, list), f"Expected list, got {type(students)}"
    assert len(students) > 0, "Expected enrolled students"
    s0 = students[0]
    for field in ("student_id", "full_name"):
        assert field in s0, f"Missing field {field} in {s0}"
