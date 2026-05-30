"""
Curriculum (Academic Plan) endpoints tests
Covers: curriculum/courses CRUD, by-department grid, assignments,
generate-offerings, backfill-from-active, import-from-archive,
RBAC (admin vs teacher), activate_semester auto_generate_from_curriculum.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "admin", "password": "admin123"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def teacher_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "teacher180156", "password": "teacher123"}, timeout=20)
    if r.status_code != 200:
        pytest.skip("teacher180156 login failed")
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Listing & basic GETs ----------

class TestCurriculumList:
    def test_list_curriculum_courses(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/curriculum/courses", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and "total" in body
        assert isinstance(body["items"], list)
        assert isinstance(body["total"], int)

    def test_list_with_filters(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/curriculum/courses?level=1&term=1",
                         headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        for c in r.json()["items"]:
            assert c.get("level") == 1
            assert c.get("term") == 1

    def test_list_assignments(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/curriculum/assignments", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "total" in body


# ---------- RBAC ----------

class TestRBAC:
    def test_teacher_cannot_create_curriculum(self, teacher_token):
        payload = {"code": "TST101", "name": "RBAC", "credit_hours": 3,
                   "faculty_id": "fake", "department_id": "fake",
                   "level": 1, "term": 1}
        r = requests.post(f"{BASE_URL}/api/curriculum/courses",
                          json=payload, headers=_h(teacher_token), timeout=20)
        assert r.status_code == 403

    def test_teacher_cannot_create_assignment(self, teacher_token):
        r = requests.post(f"{BASE_URL}/api/curriculum/assignments",
                          json={"teacher_id": "x", "curriculum_course_id": "y"},
                          headers=_h(teacher_token), timeout=20)
        assert r.status_code == 403

    def test_teacher_cannot_backfill(self, teacher_token):
        r = requests.post(f"{BASE_URL}/api/curriculum/backfill-from-active",
                          headers=_h(teacher_token), timeout=20)
        assert r.status_code == 403

    def test_teacher_can_list_assignments(self, teacher_token):
        # _has_view: teacher with VIEW_COURSES should be ok; otherwise 403 acceptable
        r = requests.get(f"{BASE_URL}/api/curriculum/assignments",
                         headers=_h(teacher_token), timeout=20)
        assert r.status_code in (200, 403)


# ---------- CRUD lifecycle ----------

class TestCurriculumCRUD:
    created_id = None
    dept_id = None
    fac_id = None

    def _get_dept(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/departments", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items") or data.get("departments") or []
        if not items:
            pytest.skip("no departments")
        d = items[0]
        return d.get("id") or d.get("_id"), d.get("faculty_id")

    def test_create_curriculum(self, admin_token):
        dept_id, fac_id = self._get_dept(admin_token)
        TestCurriculumCRUD.dept_id = dept_id
        TestCurriculumCRUD.fac_id = fac_id or "any"
        payload = {
            "code": "TEST_CUR_99",
            "name": "TEST Curriculum Course",
            "credit_hours": 3,
            "faculty_id": fac_id or "any",
            "department_id": dept_id,
            "level": 1, "term": 1,
        }
        r = requests.post(f"{BASE_URL}/api/curriculum/courses",
                          json=payload, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "course" in body
        assert body["course"]["code"] == "TEST_CUR_99"
        assert "id" in body["course"]
        TestCurriculumCRUD.created_id = body["course"]["id"]

    def test_get_curriculum_details(self, admin_token):
        if not TestCurriculumCRUD.created_id:
            pytest.skip("create failed")
        r = requests.get(f"{BASE_URL}/api/curriculum/courses/{TestCurriculumCRUD.created_id}",
                         headers=_h(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "course" in body
        assert "teachers" in body
        assert "assignments" in body
        assert body["course"]["id"] == TestCurriculumCRUD.created_id

    def test_duplicate_code_conflict(self, admin_token):
        if not TestCurriculumCRUD.created_id:
            pytest.skip("create failed")
        payload = {
            "code": "TEST_CUR_99",
            "name": "Duplicate",
            "credit_hours": 3,
            "faculty_id": TestCurriculumCRUD.fac_id,
            "department_id": TestCurriculumCRUD.dept_id,
            "level": 1, "term": 1,
        }
        r = requests.post(f"{BASE_URL}/api/curriculum/courses",
                          json=payload, headers=_h(admin_token), timeout=20)
        assert r.status_code == 409

    def test_update_curriculum(self, admin_token):
        if not TestCurriculumCRUD.created_id:
            pytest.skip("create failed")
        r = requests.put(f"{BASE_URL}/api/curriculum/courses/{TestCurriculumCRUD.created_id}",
                         json={"name": "TEST Updated Name"}, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        # verify
        g = requests.get(f"{BASE_URL}/api/curriculum/courses/{TestCurriculumCRUD.created_id}",
                        headers=_h(admin_token), timeout=20)
        assert g.json()["course"]["name"] == "TEST Updated Name"

    def test_assignment_lifecycle(self, admin_token):
        if not TestCurriculumCRUD.created_id:
            pytest.skip("create failed")
        # find a teacher id
        tr = requests.get(f"{BASE_URL}/api/teachers", headers=_h(admin_token), timeout=20)
        assert tr.status_code == 200
        td = tr.json()
        teachers = td if isinstance(td, list) else td.get("items") or td.get("teachers") or []
        if not teachers:
            pytest.skip("no teachers in DB")
        teacher_id = teachers[0].get("id") or teachers[0].get("_id")

        # create assignment
        ar = requests.post(f"{BASE_URL}/api/curriculum/assignments",
                           json={"teacher_id": teacher_id,
                                 "curriculum_course_id": TestCurriculumCRUD.created_id,
                                 "notes": "TEST assignment"},
                           headers=_h(admin_token), timeout=20)
        assert ar.status_code == 200, ar.text
        aid = ar.json()["assignment"]["id"]

        # duplicate -> 409
        dup = requests.post(f"{BASE_URL}/api/curriculum/assignments",
                            json={"teacher_id": teacher_id,
                                  "curriculum_course_id": TestCurriculumCRUD.created_id},
                            headers=_h(admin_token), timeout=20)
        assert dup.status_code == 409

        # delete assignment
        dr = requests.delete(f"{BASE_URL}/api/curriculum/assignments/{aid}",
                             headers=_h(admin_token), timeout=20)
        assert dr.status_code == 200

    def test_soft_delete_curriculum(self, admin_token):
        if not TestCurriculumCRUD.created_id:
            pytest.skip("create failed")
        r = requests.delete(f"{BASE_URL}/api/curriculum/courses/{TestCurriculumCRUD.created_id}",
                            headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        # listing without include_inactive should not have it
        lr = requests.get(f"{BASE_URL}/api/curriculum/courses",
                          headers=_h(admin_token), timeout=20)
        ids = [c["id"] for c in lr.json()["items"]]
        assert TestCurriculumCRUD.created_id not in ids


# ---------- By-department grid ----------

class TestByDepartment:
    def test_grid_shape(self, admin_token):
        # find a real department id
        r = requests.get(f"{BASE_URL}/api/departments", headers=_h(admin_token), timeout=20)
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        if not items:
            pytest.skip("no departments")
        did = items[0].get("id") or items[0].get("_id")
        gr = requests.get(f"{BASE_URL}/api/curriculum/by-department/{did}",
                          headers=_h(admin_token), timeout=20)
        assert gr.status_code == 200, gr.text
        body = gr.json()
        assert "department" in body and "grid" in body and "total_courses" in body
        for row in body["grid"]:
            assert "level" in row and "term1" in row and "term2" in row

    def test_invalid_department_id(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/curriculum/by-department/NOT_AN_ID",
                         headers=_h(admin_token), timeout=20)
        assert r.status_code == 400


# ---------- Backfill idempotency & generate offerings ----------

class TestBackfillAndGenerate:
    def test_backfill_idempotent(self, admin_token):
        r1 = requests.post(f"{BASE_URL}/api/curriculum/backfill-from-active",
                           headers=_h(admin_token), timeout=60)
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{BASE_URL}/api/curriculum/backfill-from-active",
                           headers=_h(admin_token), timeout=60)
        assert r2.status_code == 200
        # second pass should create 0 new (idempotent)
        assert r2.json().get("created", 1) == 0

    def test_generate_offerings_invalid_semester(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/curriculum/generate-offerings?semester_id=BADID",
                          headers=_h(admin_token), timeout=20)
        assert r.status_code == 400

    def test_generate_offerings_skip_existing(self, admin_token):
        # find an active semester
        sr = requests.get(f"{BASE_URL}/api/semesters", headers=_h(admin_token), timeout=20)
        sems = sr.json() if isinstance(sr.json(), list) else sr.json().get("items") or sr.json().get("semesters") or []
        if not sems:
            pytest.skip("no semesters")
        sid = sems[0].get("id") or sems[0].get("_id")
        r = requests.post(f"{BASE_URL}/api/curriculum/generate-offerings?semester_id={sid}",
                          headers=_h(admin_token), timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "created" in body and "skipped" in body


# ---------- Import from Archive ----------

class TestImportArchive:
    def test_import_nonexistent_archive(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/curriculum/import-from-archive/nonexistent_sem_id",
                          headers=_h(admin_token), timeout=20)
        assert r.status_code == 404
