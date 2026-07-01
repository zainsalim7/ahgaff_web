"""
Backend tests for the new Attendance Change Approval feature.

Covers:
- Role migration for `dean` includes `approve_attendance_changes`
- Endpoint availability & RBAC (list, pending-count, mine, lecture pending)
- Full E2E: employee edits outside window → pending_approval → dean approves/rejects
- Faculty scoping for dean approver
- Self-cancel by requester
- No approval needed inside window
- Admin/Dean bypass (direct write)
- Idempotent duplicate → old pending cancelled, new pending
- Batch approve/reject
- Pending count badge
- Department-head triggers pending; sibling dept-head cannot approve
"""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient
from bson import ObjectId
from passlib.context import CryptContext

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
YEMEN_TZ = timezone(timedelta(hours=3))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─── shared fixtures ─────────────────────────────────────────────
@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "admin", "password": "admin123"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _login(username, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": username, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {username}: {r.text}"
    return r.json()["access_token"]


# ─── seeding helpers ─────────────────────────────────────────────
TAG = "TEST_APPR_" + uuid.uuid4().hex[:8]


def _mk_user(db, username, role, faculty_id=None, department_id=None,
             custom_permissions=None, password="test1234", full_name=None):
    doc = {
        "username": username,
        "password": pwd_context.hash(password),
        "full_name": full_name or username,
        "role": role,
        "email": f"{username}@t.local",
        "is_active": True,
        "created_at": datetime.utcnow(),
        "faculty_id": faculty_id,
        "department_id": department_id,
        "custom_permissions": custom_permissions or [],
    }
    res = db.users.insert_one(doc)
    return str(res.inserted_id)


def _mk_faculty(db, name):
    r = db.faculties.insert_one({
        "name": name,
        "attendance_duration_minutes": 15,
        "max_attendance_delay_minutes": 30,
        "attendance_edit_minutes": 60,
    })
    return str(r.inserted_id)


def _mk_department(db, faculty_id, name):
    r = db.departments.insert_one({"name": name, "faculty_id": faculty_id})
    return str(r.inserted_id)


def _mk_course(db, faculty_id, department_id, name, code):
    r = db.courses.insert_one({
        "name": name, "code": code,
        "faculty_id": faculty_id,
        "department_id": department_id,
        "credit_hours": 3,
        "is_active": True,
    })
    return str(r.inserted_id)


def _mk_student(db, faculty_id, department_id, name):
    r = db.students.insert_one({
        "full_name": name, "student_id": "S" + uuid.uuid4().hex[:6],
        "faculty_id": faculty_id, "department_id": department_id,
    })
    return str(r.inserted_id)


def _mk_lecture(db, course_id, minutes_ago_started=180, status="completed"):
    # Lecture that was completed 3h ago (way past edit window default 60m)
    now_ye = datetime.now(YEMEN_TZ)
    started = now_ye - timedelta(minutes=minutes_ago_started)
    date_str = started.strftime("%Y-%m-%d")
    start_str = started.strftime("%H:%M")
    end_dt = started + timedelta(minutes=60)
    end_str = end_dt.strftime("%H:%M")
    r = db.lectures.insert_one({
        "course_id": course_id,
        "date": date_str,
        "start_time": start_str,
        "end_time": end_str,
        "status": status,
        "attendance_started_at": started.isoformat(),
    })
    return str(r.inserted_id)


def _mk_attendance(db, lecture_id, course_id, student_id, status="absent"):
    r = db.attendance.insert_one({
        "lecture_id": lecture_id, "course_id": course_id,
        "student_id": student_id, "status": status,
        "date": datetime.utcnow(), "recorded_by": "seed", "method": "seed",
    })
    return str(r.inserted_id)


# ─── main env fixture ────────────────────────────────────────────
@pytest.fixture(scope="module")
def env(db):
    """Build isolated faculties/depts/users/courses/lectures/students."""
    fac_a = _mk_faculty(db, f"{TAG}_FAC_A")
    fac_b = _mk_faculty(db, f"{TAG}_FAC_B")
    dep_a1 = _mk_department(db, fac_a, f"{TAG}_DEP_A1")
    dep_a2 = _mk_department(db, fac_a, f"{TAG}_DEP_A2")
    dep_b = _mk_department(db, fac_b, f"{TAG}_DEP_B")

    course_a = _mk_course(db, fac_a, dep_a1, f"{TAG}_C_A", f"{TAG[-4:]}A")
    course_b = _mk_course(db, fac_b, dep_b, f"{TAG}_C_B", f"{TAG[-4:]}B")

    # Users
    dean_a = _mk_user(db, f"{TAG}_dean_a", "dean", fac_a, None,
                      custom_permissions=["approve_attendance_changes",
                                          "view_attendance", "edit_attendance"])
    dean_b = _mk_user(db, f"{TAG}_dean_b", "dean", fac_b, None,
                      custom_permissions=["approve_attendance_changes",
                                          "view_attendance", "edit_attendance"])
    emp_a = _mk_user(db, f"{TAG}_emp_a", "employee", fac_a, dep_a1,
                     custom_permissions=["edit_attendance", "view_attendance"])
    emp_a2 = _mk_user(db, f"{TAG}_emp_a2", "employee", fac_a, dep_a1,
                      custom_permissions=["edit_attendance", "view_attendance"])
    emp_plain = _mk_user(db, f"{TAG}_emp_plain", "employee", fac_a, dep_a1,
                         custom_permissions=["view_attendance"])
    dh_a1 = _mk_user(db, f"{TAG}_dh_a1", "department_head", fac_a, dep_a1,
                     custom_permissions=["edit_attendance", "view_attendance"])
    dh_a2 = _mk_user(db, f"{TAG}_dh_a2", "department_head", fac_a, dep_a2,
                     custom_permissions=["edit_attendance", "view_attendance",
                                         "view_attendance_changes"])

    students_a = [_mk_student(db, fac_a, dep_a1, f"{TAG}_stu_{i}") for i in range(6)]
    student_b = _mk_student(db, fac_b, dep_b, f"{TAG}_stu_b")

    yield {
        "fac_a": fac_a, "fac_b": fac_b,
        "course_a": course_a, "course_b": course_b,
        "dean_a": dean_a, "dean_b": dean_b,
        "emp_a": emp_a, "emp_a2": emp_a2, "emp_plain": emp_plain,
        "dh_a1": dh_a1, "dh_a2": dh_a2,
        "students_a": students_a, "student_b": student_b,
    }

    # ─── teardown ─────
    db.attendance_change_requests.delete_many({
        "$or": [{"faculty_id": fac_a}, {"faculty_id": fac_b}]
    })
    db.attendance.delete_many({"course_id": {"$in": [course_a, course_b]}})
    db.lectures.delete_many({"course_id": {"$in": [course_a, course_b]}})
    db.students.delete_many({"full_name": {"$regex": f"^{TAG}"}})
    db.courses.delete_many({"code": {"$regex": f"^{TAG[-4:]}"}})
    db.departments.delete_many({"name": {"$regex": f"^{TAG}"}})
    db.faculties.delete_many({"name": {"$regex": f"^{TAG}"}})
    db.users.delete_many({"username": {"$regex": f"^{TAG}"}})


# ─── Step 1 — role migration ─────────────────────────────────────
def test_step1_dean_role_has_approve_permission(db):
    role = db.roles.find_one({"system_key": "dean"})
    assert role, "dean role not seeded in db.roles"
    assert "approve_attendance_changes" in role.get("permissions", []), \
        f"migration missing; perms={role.get('permissions')}"


# ─── Step 2 — endpoints reachability & 403 for non-approver ──────
def test_step2a_list_endpoint_admin(admin_token):
    r = requests.get(f"{BASE_URL}/api/attendance-changes", headers=_hdr(admin_token))
    assert r.status_code == 200, r.text
    assert "items" in r.json()


def test_step2b_pending_count_admin(admin_token):
    r = requests.get(f"{BASE_URL}/api/attendance-changes/pending-count",
                     headers=_hdr(admin_token))
    assert r.status_code == 200
    assert "count" in r.json()


def test_step2c_mine_admin(admin_token):
    r = requests.get(f"{BASE_URL}/api/attendance-changes/mine", headers=_hdr(admin_token))
    assert r.status_code == 200


def test_step2d_lecture_pending_admin(admin_token):
    r = requests.get(f"{BASE_URL}/api/attendance-changes/lecture/000000000000000000000000/pending",
                     headers=_hdr(admin_token))
    assert r.status_code == 200


def test_step2e_list_forbidden_for_employee(env):
    tok = _login(f"{TAG}_emp_plain", "test1234")
    r = requests.get(f"{BASE_URL}/api/attendance-changes", headers=_hdr(tok))
    assert r.status_code == 403


def test_step2f_pending_count_returns_zero_for_non_approver(env):
    tok = _login(f"{TAG}_emp_plain", "test1234")
    r = requests.get(f"{BASE_URL}/api/attendance-changes/pending-count",
                     headers=_hdr(tok))
    assert r.status_code == 200
    assert r.json().get("count") == 0


# ─── Step 3 — E2E: employee edit outside window → pending ────────
@pytest.fixture(scope="module")
def lecture_a(db, env):
    lec = _mk_lecture(db, env["course_a"], minutes_ago_started=180, status="completed")
    for s in env["students_a"]:
        _mk_attendance(db, lec, env["course_a"], s, status="absent")
    return lec


def test_step3_employee_outside_window_creates_pending(db, env, lecture_a):
    tok = _login(f"{TAG}_emp_a", "test1234")
    student_x = env["students_a"][0]
    r = requests.post(
        f"{BASE_URL}/api/attendance/session",
        headers=_hdr(tok),
        json={"lecture_id": lecture_a,
              "records": [{"student_id": student_x, "status": "present"}]},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("status") == "pending_approval", body
    assert body.get("created") == 1
    assert len(body.get("request_ids", [])) == 1

    # Attendance record STILL absent
    att = db.attendance.find_one({"lecture_id": lecture_a, "student_id": student_x})
    assert att["status"] == "absent", "attendance changed prematurely!"

    # Change request exists
    reqs = list(db.attendance_change_requests.find({
        "lecture_id": lecture_a, "student_id": student_x, "status": "pending"}))
    assert len(reqs) == 1


# ─── Step 4 — Dean approves ──────────────────────────────────────
def test_step4_dean_approves(db, env, lecture_a):
    tok_dean = _login(f"{TAG}_dean_a", "test1234")
    student_x = env["students_a"][0]

    r = requests.get(f"{BASE_URL}/api/attendance-changes?status=pending",
                     headers=_hdr(tok_dean))
    assert r.status_code == 200
    ids = [i["id"] for i in r.json()["items"]
           if i["lecture_id"] == lecture_a and i["student_id"] == student_x]
    assert ids, "dean cannot see the pending request from his faculty"
    req_id = ids[0]

    r = requests.post(f"{BASE_URL}/api/attendance-changes/{req_id}/approve",
                      headers=_hdr(tok_dean))
    assert r.status_code == 200, r.text

    att = db.attendance.find_one({"lecture_id": lecture_a, "student_id": student_x})
    assert att["status"] == "present"
    req = db.attendance_change_requests.find_one({"_id": ObjectId(req_id)})
    assert req["status"] == "approved"
    assert req["reviewed_by"] == env["dean_a"]


# ─── Step 5 — Dean rejects ───────────────────────────────────────
def test_step5_dean_rejects(db, env, lecture_a):
    tok_emp = _login(f"{TAG}_emp_a", "test1234")
    student_y = env["students_a"][1]
    r = requests.post(f"{BASE_URL}/api/attendance/session", headers=_hdr(tok_emp),
                      json={"lecture_id": lecture_a,
                            "records": [{"student_id": student_y, "status": "present"}]})
    assert r.status_code == 200
    req_id = r.json()["request_ids"][0]

    tok_dean = _login(f"{TAG}_dean_a", "test1234")
    r = requests.post(f"{BASE_URL}/api/attendance-changes/{req_id}/reject",
                      headers=_hdr(tok_dean),
                      json={"review_notes": "خطأ إدخال"})
    assert r.status_code == 200

    att = db.attendance.find_one({"lecture_id": lecture_a, "student_id": student_y})
    assert att["status"] == "absent"
    req = db.attendance_change_requests.find_one({"_id": ObjectId(req_id)})
    assert req["status"] == "rejected"
    assert req.get("review_notes") == "خطأ إدخال"


# ─── Step 6 — Faculty scope isolation ────────────────────────────
def test_step6_dean_b_cannot_see_or_action_faculty_a(db, env, lecture_a):
    tok_emp = _login(f"{TAG}_emp_a", "test1234")
    student_z = env["students_a"][2]
    r = requests.post(f"{BASE_URL}/api/attendance/session", headers=_hdr(tok_emp),
                      json={"lecture_id": lecture_a,
                            "records": [{"student_id": student_z, "status": "present"}]})
    req_id = r.json()["request_ids"][0]

    tok_dean_b = _login(f"{TAG}_dean_b", "test1234")
    r = requests.get(f"{BASE_URL}/api/attendance-changes?status=pending",
                     headers=_hdr(tok_dean_b))
    assert r.status_code == 200
    ids = [i["id"] for i in r.json()["items"]]
    assert req_id not in ids

    r = requests.post(f"{BASE_URL}/api/attendance-changes/{req_id}/approve",
                      headers=_hdr(tok_dean_b))
    assert r.status_code == 403
    r = requests.post(f"{BASE_URL}/api/attendance-changes/{req_id}/reject",
                      headers=_hdr(tok_dean_b), json={"review_notes": "x"})
    assert r.status_code == 403

    # cleanup: dean A cancels via approve to leave DB clean-ish (or just leave pending)
    # We won't approve it; leave pending. Cleanup fixture removes.


# ─── Step 7 — Self cancel ────────────────────────────────────────
def test_step7_self_cancel(db, env, lecture_a):
    tok_emp = _login(f"{TAG}_emp_a", "test1234")
    student = env["students_a"][3]
    r = requests.post(f"{BASE_URL}/api/attendance/session", headers=_hdr(tok_emp),
                      json={"lecture_id": lecture_a,
                            "records": [{"student_id": student, "status": "present"}]})
    req_id = r.json()["request_ids"][0]

    # Other employee cannot cancel
    tok_other = _login(f"{TAG}_emp_a2", "test1234")
    r = requests.delete(f"{BASE_URL}/api/attendance-changes/{req_id}",
                        headers=_hdr(tok_other))
    assert r.status_code == 403

    # Owner can cancel
    r = requests.delete(f"{BASE_URL}/api/attendance-changes/{req_id}",
                        headers=_hdr(tok_emp))
    assert r.status_code == 200
    req = db.attendance_change_requests.find_one({"_id": ObjectId(req_id)})
    assert req["status"] == "cancelled"

    # Cannot re-cancel non-pending
    r = requests.delete(f"{BASE_URL}/api/attendance-changes/{req_id}",
                        headers=_hdr(tok_emp))
    assert r.status_code == 400


# ─── Step 8 — Inside window → direct write (no approval) ────────
def test_step8_inside_window_direct_apply(db, env):
    # Lecture started 2 min ago, status=in_progress, edit window = 60 min
    lec = _mk_lecture(db, env["course_a"], minutes_ago_started=2, status="in_progress")
    student = env["students_a"][4]
    _mk_attendance(db, lec, env["course_a"], student, status="absent")

    tok = _login(f"{TAG}_emp_a", "test1234")
    r = requests.post(f"{BASE_URL}/api/attendance/session", headers=_hdr(tok),
                      json={"lecture_id": lec,
                            "records": [{"student_id": student, "status": "present"}]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("status") != "pending_approval", body
    att = db.attendance.find_one({"lecture_id": lec, "student_id": student})
    assert att["status"] == "present"


# ─── Step 9 — Admin bypass (direct write) ────────────────────────
def test_step9_admin_direct_apply_outside_window(db, admin_token, env, lecture_a):
    # Pick a student whose attendance is still absent (student index 5)
    student = env["students_a"][5]
    att = db.attendance.find_one({"lecture_id": lecture_a, "student_id": student})
    assert att and att["status"] == "absent"

    r = requests.put(f"{BASE_URL}/api/attendance/{att['_id']}/status",
                     headers=_hdr(admin_token),
                     json={"status": "present", "reason": "admin edit"})
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") != "pending_approval"
    att2 = db.attendance.find_one({"_id": att["_id"]})
    assert att2["status"] == "present"


# ─── Step 10 — Idempotent duplicate (old cancelled, new pending) ──
def test_step10_duplicate_replaces_pending(db, env):
    # Fresh lecture completed 3h ago
    lec = _mk_lecture(db, env["course_a"], minutes_ago_started=200, status="completed")
    student = env["students_a"][0]  # already approved earlier lecture — but this is a NEW lecture
    _mk_attendance(db, lec, env["course_a"], student, status="absent")

    tok = _login(f"{TAG}_emp_a", "test1234")
    r1 = requests.post(f"{BASE_URL}/api/attendance/session", headers=_hdr(tok),
                       json={"lecture_id": lec,
                             "records": [{"student_id": student, "status": "present"}]})
    req_id_1 = r1.json()["request_ids"][0]

    r2 = requests.post(f"{BASE_URL}/api/attendance/session", headers=_hdr(tok),
                       json={"lecture_id": lec,
                             "records": [{"student_id": student, "status": "late"}]})
    assert r2.status_code == 200
    req_id_2 = r2.json()["request_ids"][0]
    assert req_id_2 != req_id_1

    d1 = db.attendance_change_requests.find_one({"_id": ObjectId(req_id_1)})
    d2 = db.attendance_change_requests.find_one({"_id": ObjectId(req_id_2)})
    assert d1["status"] == "cancelled"
    assert d2["status"] == "pending"

    # Only 1 pending for this (lecture, student)
    pending = db.attendance_change_requests.count_documents({
        "lecture_id": lec, "student_id": student, "status": "pending"})
    assert pending == 1


# ─── Step 11 — Batch approve/reject ──────────────────────────────
def test_step11_batch_approve_and_reject(db, env):
    lec = _mk_lecture(db, env["course_a"], minutes_ago_started=210, status="completed")
    students = env["students_a"][:3]
    for s in students:
        _mk_attendance(db, lec, env["course_a"], s, status="absent")

    tok_emp = _login(f"{TAG}_emp_a", "test1234")
    r = requests.post(f"{BASE_URL}/api/attendance/session", headers=_hdr(tok_emp),
                      json={"lecture_id": lec,
                            "records": [{"student_id": s, "status": "present"} for s in students]})
    assert r.status_code == 200, r.text
    approve_ids = r.json()["request_ids"]
    assert len(approve_ids) == 3

    tok_dean = _login(f"{TAG}_dean_a", "test1234")
    r = requests.post(f"{BASE_URL}/api/attendance-changes/batch/approve",
                      headers=_hdr(tok_dean),
                      json={"request_ids": approve_ids})
    assert r.status_code == 200
    assert r.json().get("approved") == 3
    for s in students:
        att = db.attendance.find_one({"lecture_id": lec, "student_id": s})
        assert att["status"] == "present"

    # Now create 3 new pending on another lecture for batch reject
    lec2 = _mk_lecture(db, env["course_a"], minutes_ago_started=220, status="completed")
    for s in students:
        _mk_attendance(db, lec2, env["course_a"], s, status="absent")

    r = requests.post(f"{BASE_URL}/api/attendance/session", headers=_hdr(tok_emp),
                      json={"lecture_id": lec2,
                            "records": [{"student_id": s, "status": "late"} for s in students]})
    reject_ids = r.json()["request_ids"]

    r = requests.post(f"{BASE_URL}/api/attendance-changes/batch/reject",
                      headers=_hdr(tok_dean),
                      json={"request_ids": reject_ids, "review_notes": "batch reject"})
    assert r.status_code == 200
    assert r.json().get("rejected") == 3
    for s in students:
        att = db.attendance.find_one({"lecture_id": lec2, "student_id": s})
        assert att["status"] == "absent"


# ─── Step 12 — pending-count badge ───────────────────────────────
def test_step12_pending_count(db, env):
    tok_dean = _login(f"{TAG}_dean_a", "test1234")
    r = requests.get(f"{BASE_URL}/api/attendance-changes/pending-count",
                     headers=_hdr(tok_dean))
    assert r.status_code == 200
    assert isinstance(r.json()["count"], int)
    assert r.json()["count"] >= 0

    tok_plain = _login(f"{TAG}_emp_plain", "test1234")
    r = requests.get(f"{BASE_URL}/api/attendance-changes/pending-count",
                     headers=_hdr(tok_plain))
    assert r.status_code == 200
    assert r.json()["count"] == 0


# ─── Step 13 — Department head triggers pending; sibling DH cannot approve ──
def test_step13_department_head_pending_and_sibling_cannot_approve(db, env):
    lec = _mk_lecture(db, env["course_a"], minutes_ago_started=230, status="completed")
    student = env["students_a"][4]
    _mk_attendance(db, lec, env["course_a"], student, status="absent")

    tok_dh = _login(f"{TAG}_dh_a1", "test1234")
    r = requests.post(f"{BASE_URL}/api/attendance/session", headers=_hdr(tok_dh),
                      json={"lecture_id": lec,
                            "records": [{"student_id": student, "status": "present"}]})
    assert r.status_code == 200
    assert r.json().get("status") == "pending_approval", r.json()
    req_id = r.json()["request_ids"][0]

    # Sibling DH from another dept (same faculty) but no approve perm
    tok_dh2 = _login(f"{TAG}_dh_a2", "test1234")
    r = requests.post(f"{BASE_URL}/api/attendance-changes/{req_id}/approve",
                      headers=_hdr(tok_dh2))
    assert r.status_code == 403
