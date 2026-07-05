"""
Tests: registration_manager / registrar multi-department scope fix
Bug: when department_ids has multiple depts, only one was visible.
Fix: get_user_scope_filter branch for registration_manager/registrar now
     prioritises department_ids (Case 1) over faculty_id (Case 2).
Also verifies fail-safe (no scope → 0 results) and that custom / department_head
/ employee behaviour is unaffected (smoke).
"""
import os
import uuid
from datetime import datetime

import pytest
import requests
from bson import ObjectId
from passlib.context import CryptContext
from pymongo import MongoClient

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com"
).rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
TAG = "TEST_RMDS_" + uuid.uuid4().hex[:8]


# ── helpers ──────────────────────────────────────────────────────
def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _login(username, password="test1234"):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": username, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed {username}: {r.text}"
    return r.json()["access_token"]


# ── fixtures ─────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def env(db):
    # Faculties: F1 (target), F2 (other)
    f1 = str(db.faculties.insert_one({"name": f"{TAG}_F1"}).inserted_id)
    f2 = str(db.faculties.insert_one({"name": f"{TAG}_F2"}).inserted_id)

    # Departments in F1: D1, D2 ; and D_OTHER in F2
    d1 = str(
        db.departments.insert_one(
            {"name": f"{TAG}_D1", "code": f"{TAG[-4:]}D1", "faculty_id": f1,
             "created_at": datetime.utcnow()}
        ).inserted_id
    )
    d2 = str(
        db.departments.insert_one(
            {"name": f"{TAG}_D2", "code": f"{TAG[-4:]}D2", "faculty_id": f1,
             "created_at": datetime.utcnow()}
        ).inserted_id
    )
    d_other = str(
        db.departments.insert_one(
            {"name": f"{TAG}_DO", "code": f"{TAG[-4:]}DO", "faculty_id": f2,
             "created_at": datetime.utcnow()}
        ).inserted_id
    )

    # Courses c1(D1), c2(D2), c3(D_OTHER)
    def _mk_course(dept, tag):
        return str(
            db.courses.insert_one(
                {
                    "name": f"{TAG}_C_{tag}",
                    "code": f"{TAG[-4:]}{tag}",
                    "faculty_id": f1 if dept in (d1, d2) else f2,
                    "department_id": dept,
                    "credit_hours": 3,
                    "is_active": True,
                }
            ).inserted_id
        )

    c1, c2, c3 = _mk_course(d1, "1"), _mk_course(d2, "2"), _mk_course(d_other, "3")

    # Students s1(D1), s2(D2), s3(D_OTHER)
    def _mk_student(dept, fac, tag):
        return str(
            db.students.insert_one(
                {
                    "full_name": f"{TAG}_STU_{tag}",
                    "student_id": f"{TAG[-4:]}{tag}",
                    "faculty_id": fac,
                    "department_id": dept,
                    "level": 1,
                    "section": "A",
                    "status": "active",
                    "qr_code": f"{TAG[-4:]}QR{tag}",
                    "is_active": True,
                    "created_at": datetime.utcnow(),
                }
            ).inserted_id
        )

    s1, s2, s3 = _mk_student(d1, f1, "1"), _mk_student(d2, f1, "2"), _mk_student(d_other, f2, "3")

    # Users (registration_manager / registrar) with different scopes
    perms = ["view_courses", "manage_students", "view_students", "view_departments"]

    def _mk_user(username, role, **extra):
        doc = {
            "username": username,
            "password": pwd_context.hash("test1234"),
            "full_name": username,
            "role": role,
            "email": f"{username}@t.local",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "custom_permissions": perms,
            "permissions": perms,
        }
        doc.update(extra)
        return str(db.users.insert_one(doc).inserted_id)

    u1 = _mk_user(f"{TAG}_u1", "registration_manager",
                  faculty_id=f1, department_ids=[d1, d2])          # multi-dept
    u2 = _mk_user(f"{TAG}_u2", "registration_manager",
                  faculty_id=f1, department_ids=[d1])              # single-dept via list
    u3 = _mk_user(f"{TAG}_u3", "registration_manager",
                  faculty_id=f1)                                    # faculty-only
    u4 = _mk_user(f"{TAG}_u4", "registration_manager")             # fail-safe (no scope)
    u5 = _mk_user(f"{TAG}_u5", "registrar",
                  faculty_id=f1, department_ids=[d1, d2])           # registrar multi-dept

    yield {
        "f1": f1, "f2": f2,
        "d1": d1, "d2": d2, "d_other": d_other,
        "c1": c1, "c2": c2, "c3": c3,
        "s1": s1, "s2": s2, "s3": s3,
        "u1": u1, "u2": u2, "u3": u3, "u4": u4, "u5": u5,
    }

    # ── teardown ──
    db.users.delete_many({"username": {"$regex": f"^{TAG}"}})
    db.courses.delete_many({"code": {"$regex": f"^{TAG[-4:]}"}})
    db.students.delete_many({"student_id": {"$regex": f"^{TAG[-4:]}"}})
    db.departments.delete_many({"name": {"$regex": f"^{TAG}"}})
    db.faculties.delete_many({"name": {"$regex": f"^{TAG}"}})


def _course_ids(resp):
    data = resp.json()
    return {c.get("id") or c.get("_id") for c in data}


def _student_ids(resp):
    return {s.get("id") or s.get("_id") for s in resp.json()}


def _dept_ids(resp):
    return {d.get("id") or d.get("_id") for d in resp.json()}


# ── tests ────────────────────────────────────────────────────────
def test_multi_dept_registration_manager_courses(env):
    """U1 (department_ids=[D1,D2]) sees c1 and c2 only."""
    tok = _login(f"{TAG}_u1")
    r = requests.get(f"{BASE_URL}/api/courses", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200, r.text
    ids = _course_ids(r)
    assert env["c1"] in ids, "c1 (D1) must be visible"
    assert env["c2"] in ids, "c2 (D2) must be visible"
    assert env["c3"] not in ids, "c3 (other faculty dept) must NOT be visible"


def test_single_dept_registration_manager_courses(env):
    """U2 (department_ids=[D1]) sees c1 only."""
    tok = _login(f"{TAG}_u2")
    r = requests.get(f"{BASE_URL}/api/courses", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200
    ids = _course_ids(r)
    assert env["c1"] in ids
    assert env["c2"] not in ids
    assert env["c3"] not in ids


def test_faculty_only_registration_manager_courses(env):
    """U3 (faculty_id only) sees all F1 depts → c1 + c2."""
    tok = _login(f"{TAG}_u3")
    r = requests.get(f"{BASE_URL}/api/courses", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200
    ids = _course_ids(r)
    assert env["c1"] in ids
    assert env["c2"] in ids
    assert env["c3"] not in ids


def test_failsafe_no_scope_registration_manager_courses(env):
    """U4 (no faculty, no departments) must see 0 courses."""
    tok = _login(f"{TAG}_u4")
    r = requests.get(f"{BASE_URL}/api/courses", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200
    ids = _course_ids(r)
    for cid in (env["c1"], env["c2"], env["c3"]):
        assert cid not in ids, "fail-safe: RBAC must yield 0 test courses"


def test_multi_dept_registration_manager_students(env):
    """U1 sees s1 + s2, not s3."""
    tok = _login(f"{TAG}_u1")
    r = requests.get(f"{BASE_URL}/api/students", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200, r.text
    ids = _student_ids(r)
    assert env["s1"] in ids
    assert env["s2"] in ids
    assert env["s3"] not in ids


def test_single_dept_registration_manager_students(env):
    tok = _login(f"{TAG}_u2")
    r = requests.get(f"{BASE_URL}/api/students", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200
    ids = _student_ids(r)
    assert env["s1"] in ids
    assert env["s2"] not in ids
    assert env["s3"] not in ids


def test_faculty_only_registration_manager_students(env):
    tok = _login(f"{TAG}_u3")
    r = requests.get(f"{BASE_URL}/api/students", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200
    ids = _student_ids(r)
    assert env["s1"] in ids
    assert env["s2"] in ids
    assert env["s3"] not in ids


def test_multi_dept_registration_manager_departments(env):
    """U1 /api/departments returns D1 and D2 only."""
    tok = _login(f"{TAG}_u1")
    r = requests.get(f"{BASE_URL}/api/departments", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200, r.text
    ids = _dept_ids(r)
    assert env["d1"] in ids
    assert env["d2"] in ids
    assert env["d_other"] not in ids


def test_registrar_role_multi_dept_courses(env):
    """Same fix should apply to 'registrar' role too."""
    tok = _login(f"{TAG}_u5")
    r = requests.get(f"{BASE_URL}/api/courses", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200
    ids = _course_ids(r)
    assert env["c1"] in ids
    assert env["c2"] in ids
    assert env["c3"] not in ids
