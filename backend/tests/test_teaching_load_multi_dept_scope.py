"""
Verifies _ensure_course_in_user_scope supports multi-department (department_ids array).

Scenarios:
  1. admin -> can assign & delete anywhere (baseline)
  2. Single-dept user (Saeed) -> allowed within his dept; rejected outside (regression)
  3. Multi-dept temp user with department_ids = [deptA, deptB] -> can assign/delete
     for a course in deptA AND deptB; rejected for course in a third dept.
  4. POST /teaching-load/bulk enforces same rule per item.
"""
import os
import requests
import pytest
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MANAGE_PERM = "manage_teaching_load"
VIEW_PERM = "view_teaching_load"


# ------------------------- helpers -------------------------
def _login(username: str, password: str):
    r = requests.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {username} failed: {r.status_code} {r.text}"
    j = r.json()
    return j.get("access_token") or j.get("token"), j.get("user", {})


@pytest.fixture(scope="module")
def admin_token():
    tok, _u = _login("admin", "admin123")
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _find_courses_grouped_by_dept(admin_headers, min_depts=3):
    """Return dict dept_id -> list of course dicts (id, department_id, name)."""
    # Prefer /api/teaching-load/search-courses for active-sem filtering
    r = requests.get(f"{API}/teaching-load/search-courses?q=", headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    grouped: dict = {}
    for c in r.json():
        d = c.get("department_id")
        if not d:
            continue
        grouped.setdefault(d, []).append(c)
    if len(grouped) >= min_depts:
        return grouped

    # Fallback: general courses endpoint
    r = requests.get(f"{API}/courses?limit=500", headers=admin_headers, timeout=30)
    if r.status_code == 200:
        payload = r.json()
        items = payload if isinstance(payload, list) else payload.get("items", [])
        for c in items:
            d = c.get("department_id")
            if not d or c.get("is_active") is False:
                continue
            grouped.setdefault(d, []).append({
                "course_id": c.get("id") or c.get("_id"),
                "department_id": d,
                "course_name": c.get("name", ""),
                "course_code": c.get("code", ""),
                "semester_id": c.get("semester_id"),
            })
    return grouped


def _find_teacher(admin_headers):
    r = requests.get(f"{API}/teachers?limit=20", headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    payload = r.json()
    items = payload if isinstance(payload, list) else payload.get("items", [])
    assert items, "No teachers available"
    return items[0]


# ------------------------- tests -------------------------
class TestAdminBaseline:
    def test_admin_can_assign_and_delete_any_course(self, admin_headers):
        grouped = _find_courses_grouped_by_dept(admin_headers, min_depts=1)
        assert grouped, "No courses with department_id found — cannot run test"
        dept_id, courses = next(iter(grouped.items()))
        course = courses[0]
        teacher = _find_teacher(admin_headers)

        # First delete any existing load for that course (to avoid 409 assigned-to-other)
        _cleanup_existing_load(admin_headers, course["course_id"])

        payload = {
            "teacher_id": teacher["id"],
            "course_id": course["course_id"],
            "weekly_hours": 2.0,
            "notes": "TEST_admin_baseline",
        }
        r = requests.post(f"{API}/teaching-load", json=payload, headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"admin assign failed: {r.status_code} {r.text}"
        load_id = r.json().get("id")
        assert load_id
        d = requests.delete(f"{API}/teaching-load/{load_id}", headers=admin_headers, timeout=30)
        assert d.status_code == 200, d.text


def _cleanup_existing_load(admin_headers, course_id):
    """Delete any teaching_load referencing a course (via admin)."""
    r = requests.get(f"{API}/teaching-load?all_semesters=true", headers=admin_headers, timeout=30)
    if r.status_code != 200:
        return
    for it in r.json().get("items", []):
        if it.get("course_id") == course_id:
            requests.delete(f"{API}/teaching-load/{it['id']}", headers=admin_headers, timeout=30)


# --------------------- multi-dept user via direct DB tweak ---------------------
@pytest.fixture(scope="module")
def multi_dept_user(admin_headers):
    """Create a temp user, then upgrade its department_ids via PUT /api/users/{id}."""
    grouped = _find_courses_grouped_by_dept(admin_headers, min_depts=3)
    dept_ids = list(grouped.keys())
    if len(dept_ids) < 3:
        pytest.skip(f"Need >=3 departments with active courses; found {len(dept_ids)}")

    dept_a, dept_b, dept_c = dept_ids[0], dept_ids[1], dept_ids[2]
    username = f"TEST_multidept_{uuid.uuid4().hex[:6]}"
    password = "Testpass123!"

    body = {
        "username": username,
        "password": password,
        "full_name": "Multi Dept Tester",
        "role": "employee",
        "permissions": [MANAGE_PERM, VIEW_PERM],
        "department_ids": [dept_a, dept_b],
    }
    r = requests.post(f"{API}/users", json=body, headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"create user failed: {r.status_code} {r.text}"
    user_id = r.json()["id"]

    # ⚙️ Direct DB tweak: set custom_permissions + department_ids reliably.
    # (create endpoint drops department_ids array and permissions get overridden
    # by role_doc lookup in get_current_user, so we bypass the API here.)
    from pymongo import MongoClient
    from bson import ObjectId as _OID
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    _cli = MongoClient(mongo_url)
    _cli[db_name].users.update_one(
        {"_id": _OID(user_id)},
        {"$set": {
            "custom_permissions": [MANAGE_PERM, VIEW_PERM],
            "department_ids": [dept_a, dept_b],
            "department_id": dept_a,
            "faculty_ids": [],
        }},
    )
    _cli.close()

    # login
    tok, u = _login(username, password)
    yield {
        "id": user_id,
        "token": tok,
        "user": u,
        "dept_a": dept_a,
        "dept_b": dept_b,
        "dept_c": dept_c,
        "grouped": grouped,
    }

    # teardown
    requests.delete(f"{API}/users/{user_id}", headers=admin_headers, timeout=30)


class TestMultiDeptScope:
    def test_user_has_department_ids_populated(self, multi_dept_user):
        u = multi_dept_user["user"]
        # login response may not include department_ids; fetch /me
        h = {"Authorization": f"Bearer {multi_dept_user['token']}"}
        r = requests.get(f"{API}/auth/me", headers=h, timeout=30)
        assert r.status_code == 200
        me = r.json()
        assert multi_dept_user["dept_a"] in (me.get("department_ids") or []), me
        assert multi_dept_user["dept_b"] in (me.get("department_ids") or []), me

    def test_can_assign_course_in_dept_a(self, multi_dept_user, admin_headers):
        course = multi_dept_user["grouped"][multi_dept_user["dept_a"]][0]
        teacher = _find_teacher(admin_headers)
        _cleanup_existing_load(admin_headers, course["course_id"])
        h = {"Authorization": f"Bearer {multi_dept_user['token']}"}
        payload = {"teacher_id": teacher["id"], "course_id": course["course_id"], "weekly_hours": 2.0}
        r = requests.post(f"{API}/teaching-load", json=payload, headers=h, timeout=30)
        assert r.status_code == 200, f"multi-dept user should assign in dept_a: {r.status_code} {r.text}"
        # cleanup
        _cleanup_existing_load(admin_headers, course["course_id"])

    def test_can_assign_and_delete_in_dept_b(self, multi_dept_user, admin_headers):
        course = multi_dept_user["grouped"][multi_dept_user["dept_b"]][0]
        teacher = _find_teacher(admin_headers)
        _cleanup_existing_load(admin_headers, course["course_id"])
        h = {"Authorization": f"Bearer {multi_dept_user['token']}"}
        payload = {"teacher_id": teacher["id"], "course_id": course["course_id"], "weekly_hours": 2.0}
        r = requests.post(f"{API}/teaching-load", json=payload, headers=h, timeout=30)
        assert r.status_code == 200, f"multi-dept user should assign in dept_b: {r.status_code} {r.text}"
        load_id = r.json().get("id")
        # DELETE by same user
        d = requests.delete(f"{API}/teaching-load/{load_id}", headers=h, timeout=30)
        assert d.status_code == 200, f"multi-dept user should delete load in dept_b: {d.status_code} {d.text}"

    def test_rejected_in_dept_c(self, multi_dept_user, admin_headers):
        course = multi_dept_user["grouped"][multi_dept_user["dept_c"]][0]
        teacher = _find_teacher(admin_headers)
        _cleanup_existing_load(admin_headers, course["course_id"])
        h = {"Authorization": f"Bearer {multi_dept_user['token']}"}
        payload = {"teacher_id": teacher["id"], "course_id": course["course_id"], "weekly_hours": 2.0}
        r = requests.post(f"{API}/teaching-load", json=payload, headers=h, timeout=30)
        assert r.status_code == 403, f"expected 403 for course outside user's departments, got {r.status_code} {r.text}"

    def test_delete_rejected_when_load_created_by_admin_in_dept_c(self, multi_dept_user, admin_headers):
        course = multi_dept_user["grouped"][multi_dept_user["dept_c"]][0]
        teacher = _find_teacher(admin_headers)
        _cleanup_existing_load(admin_headers, course["course_id"])
        # admin creates a load in dept_c
        create = requests.post(
            f"{API}/teaching-load",
            json={"teacher_id": teacher["id"], "course_id": course["course_id"], "weekly_hours": 2.0},
            headers=admin_headers, timeout=30,
        )
        assert create.status_code == 200, create.text
        load_id = create.json()["id"]

        # multi-dept user tries to delete -> must be 403
        h = {"Authorization": f"Bearer {multi_dept_user['token']}"}
        d = requests.delete(f"{API}/teaching-load/{load_id}", headers=h, timeout=30)
        assert d.status_code == 403, f"expected 403 delete for out-of-scope, got {d.status_code} {d.text}"

        # cleanup as admin
        requests.delete(f"{API}/teaching-load/{load_id}", headers=admin_headers, timeout=30)

    def test_bulk_rejects_out_of_scope_and_accepts_in_scope(self, multi_dept_user, admin_headers):
        c_in = multi_dept_user["grouped"][multi_dept_user["dept_a"]][0]
        c_out = multi_dept_user["grouped"][multi_dept_user["dept_c"]][0]
        teacher = _find_teacher(admin_headers)
        _cleanup_existing_load(admin_headers, c_in["course_id"])
        _cleanup_existing_load(admin_headers, c_out["course_id"])

        h = {"Authorization": f"Bearer {multi_dept_user['token']}"}
        payload = [
            {"teacher_id": teacher["id"], "course_id": c_in["course_id"], "weekly_hours": 2.0},
            {"teacher_id": teacher["id"], "course_id": c_out["course_id"], "weekly_hours": 2.0},
        ]
        r = requests.post(f"{API}/teaching-load/bulk", json=payload, headers=h, timeout=60)
        assert r.status_code == 200, r.text
        j = r.json()
        # in-scope one saved
        assert (j.get("created", 0) + j.get("updated", 0)) >= 1, j
        # out-of-scope reported as error
        errs = j.get("errors", [])
        assert any("لا ينتمي" in e or "أقسامك" in e or "كلياتك" in e for e in errs), f"expected scope error, got {errs}"

        # cleanup
        _cleanup_existing_load(admin_headers, c_in["course_id"])


# --------------------- single-dept regression: Saeed ---------------------
class TestSingleDeptRegression:
    def test_saeed_login(self):
        tok, u = _login("Saeed", "test1234")
        assert tok

    def test_saeed_denied_outside_his_department(self, admin_headers):
        tok, u = _login("Saeed", "test1234")
        # find Saeed's dept id
        h_me = {"Authorization": f"Bearer {tok}"}
        r = requests.get(f"{API}/auth/me", headers=h_me, timeout=30)
        me = r.json()
        saeed_depts = set((me.get("department_ids") or []) + ([me.get("department_id")] if me.get("department_id") else []))
        saeed_depts = {d for d in saeed_depts if d}
        assert saeed_depts, "Saeed has no dept assigned"

        grouped = _find_courses_grouped_by_dept(admin_headers, min_depts=1)
        # find a course in a dept not in saeed_depts
        target = None
        for d, courses in grouped.items():
            if d not in saeed_depts and courses:
                target = courses[0]
                break
        if not target:
            pytest.skip("No course outside Saeed's dept available")

        teacher = _find_teacher(admin_headers)
        _cleanup_existing_load(admin_headers, target["course_id"])
        payload = {"teacher_id": teacher["id"], "course_id": target["course_id"], "weekly_hours": 2.0}
        r = requests.post(f"{API}/teaching-load", json=payload, headers=h_me, timeout=30)
        assert r.status_code == 403, f"Saeed should be denied outside his dept, got {r.status_code} {r.text}"

    def test_saeed_allowed_inside_his_department(self, admin_headers):
        tok, u = _login("Saeed", "test1234")
        h_me = {"Authorization": f"Bearer {tok}"}
        me = requests.get(f"{API}/auth/me", headers=h_me, timeout=30).json()
        saeed_depts = set((me.get("department_ids") or []) + ([me.get("department_id")] if me.get("department_id") else []))
        saeed_depts = {d for d in saeed_depts if d}

        grouped = _find_courses_grouped_by_dept(admin_headers, min_depts=1)
        target = None
        for d in saeed_depts:
            if d in grouped and grouped[d]:
                target = grouped[d][0]
                break
        if not target:
            pytest.skip("No active course inside Saeed's dept")
        # check Saeed actually has MANAGE perm; if not, skip (auth setup dependent)
        if MANAGE_PERM not in (me.get("permissions") or []):
            pytest.skip(f"Saeed has no {MANAGE_PERM} — skipping allow-case")

        teacher = _find_teacher(admin_headers)
        _cleanup_existing_load(admin_headers, target["course_id"])
        payload = {"teacher_id": teacher["id"], "course_id": target["course_id"], "weekly_hours": 2.0}
        r = requests.post(f"{API}/teaching-load", json=payload, headers=h_me, timeout=30)
        assert r.status_code == 200, f"Saeed should be allowed in his dept, got {r.status_code} {r.text}"
        # cleanup
        _cleanup_existing_load(admin_headers, target["course_id"])
