# Iter184: explicit-permission gates for lecture-swaps / student-excuses / trash (no role bypass)
import os
import sys
import pytest
import requests
from pymongo import MongoClient


def _env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env("/app/frontend/.env", "REACT_APP_BACKEND_URL")).rstrip("/")
mdb = MongoClient(_env("/app/backend/.env", "MONGO_URL"))[_env("/app/backend/.env", "DB_NAME")]
FAKE = "0123456789abcdef01234567"


def login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        pytest.skip(f"login failed {u}: {r.status_code}")
    return {"Authorization": f"Bearer {r.json().get('access_token') or r.json().get('token')}"}


@pytest.fixture(scope="module")
def admin_h():
    return login("admin", "admin123")


@pytest.fixture(scope="module")
def reg():
    """test_registrar with original permissions snapshot; restored on teardown"""
    doc = mdb.users.find_one({"username": "test_registrar"})
    orig_p, orig_c = doc.get("permissions"), doc.get("custom_permissions")
    h = login("test_registrar", "test1234")

    def setp(perms):
        mdb.users.update_one({"_id": doc["_id"]}, {"$set": {"permissions": perms}})
    yield h, setp, orig_p
    upd = {"permissions": orig_p} if orig_p is not None else None
    if upd:
        mdb.users.update_one({"_id": doc["_id"]}, {"$set": upd})
    else:
        mdb.users.update_one({"_id": doc["_id"]}, {"$unset": {"permissions": ""}})
    if orig_c is None:
        mdb.users.update_one({"_id": doc["_id"]}, {"$unset": {"custom_permissions": ""}})


SWAP_GETS = ["/api/lecture-swaps", "/api/lecture-swaps/teachers", "/api/lecture-swaps/settings",
             "/api/lecture-swaps/report", f"/api/lecture-swaps/teacher-lectures?teacher_id={FAKE}",
             f"/api/lecture-swaps/candidates?lecture_id={FAKE}"]


# ---- Admin bypass (regression)
class TestAdmin:
    def test_admin_all_pages(self, admin_h):
        for p in ["/api/lecture-swaps", "/api/lecture-swaps/teachers", "/api/lecture-swaps/report",
                  "/api/student-excuses", "/api/trash"]:
            r = requests.get(BASE_URL + p, headers=admin_h)
            assert r.status_code == 200, (p, r.status_code, r.text[:200])

    def test_admin_permission_catalog_has_swaps(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/permissions/all", headers=admin_h)
        if r.status_code != 200:
            r = requests.get(f"{BASE_URL}/api/permissions", headers=admin_h)
        assert "manage_lecture_swaps" in r.text, r.text[:300]


# ---- Lecture swaps gate
class TestLectureSwaps:
    def test_no_perm_403(self, reg):
        h, setp, orig = reg
        setp(["manage_curriculum"])
        for p in SWAP_GETS:
            r = requests.get(BASE_URL + p, headers=h)
            assert r.status_code == 403, (p, r.status_code)
        r = requests.post(f"{BASE_URL}/api/lecture-swaps", headers=h,
                          json={"type": "swap", "lecture_a_id": FAKE, "counterpart_teacher_id": FAKE})
        assert r.status_code == 403, r.text[:200]
        r = requests.post(f"{BASE_URL}/api/lecture-swaps/{FAKE}/cancel", headers=h, json={})
        assert r.status_code == 403

    def test_with_perm_200_and_scope(self, reg):
        h, setp, orig = reg
        setp(["manage_curriculum", "manage_lecture_swaps"])
        for p in ["/api/lecture-swaps", "/api/lecture-swaps/teachers", "/api/lecture-swaps/settings", "/api/lecture-swaps/report"]:
            r = requests.get(BASE_URL + p, headers=h)
            assert r.status_code == 200, (p, r.status_code, r.text[:200])
        # scope: registrar sees only own-faculty teachers
        fac = mdb.users.find_one({"username": "test_registrar"})["faculty_id"]
        tids = [t["teacher_id"] for t in requests.get(f"{BASE_URL}/api/lecture-swaps/teachers", headers=h).json()["teachers"]]
        from bson import ObjectId
        outside = mdb.teachers.count_documents({"_id": {"$in": [ObjectId(t) for t in tids]}, "faculty_id": {"$ne": fac}})
        assert outside == 0
        # POST validation logic still runs (non-destructive): fake lecture -> 404 (passes gate)
        r = requests.post(f"{BASE_URL}/api/lecture-swaps", headers=h,
                          json={"type": "swap", "lecture_a_id": FAKE, "counterpart_teacher_id": FAKE})
        assert r.status_code in (400, 404), r.text[:200]
        r = requests.get(f"{BASE_URL}/api/lecture-swaps/candidates?lecture_id={FAKE}", headers=h)
        assert r.status_code == 404
        setp(["manage_curriculum"])

    def test_settings_put_admin_only(self, reg):
        h, setp, orig = reg
        setp(["manage_lecture_swaps"])
        r = requests.put(f"{BASE_URL}/api/lecture-swaps/settings", headers=h, json={})
        assert r.status_code == 403
        setp(["manage_curriculum"])

    def test_dean_head_no_perm_403(self):
        for u in ["Salim", "Saeed"]:
            h = login(u, "test1234")
            r = requests.get(f"{BASE_URL}/api/lecture-swaps", headers=h)
            assert r.status_code == 403, (u, r.status_code)


# ---- Student excuses gate
class TestStudentExcuses:
    def test_registrar_role_perm_200(self, reg):
        # registrar role doc grants manage_student_excuses
        h, setp, orig = reg
        setp(["manage_curriculum"])
        r = requests.get(f"{BASE_URL}/api/student-excuses", headers=h)
        assert r.status_code == 200, r.text[:200]
        assert "items" in r.json()

    def test_dept_head_without_perm_403(self):
        h = login("Saeed", "test1234")
        r = requests.get(f"{BASE_URL}/api/student-excuses", headers=h)
        assert r.status_code == 403

    def test_student_my_excuses(self):
        h = login("1001", "test1234")
        r = requests.get(f"{BASE_URL}/api/student-excuses/my", headers=h)
        assert r.status_code == 200, r.text[:200]
        assert "items" in r.json()
        r = requests.get(f"{BASE_URL}/api/student-excuses", headers=h)
        assert r.status_code == 403

    def test_can_decide_requires_perm_unit(self):
        sys.path.insert(0, "/app/backend/backend")
        from routes import student_excuses as se
        doc = {"route": "registration", "status": "pending", "faculty_id": "F1", "department_id": "D1"}
        u_no = {"role": "registrar", "permissions": [], "faculty_id": "F1", "faculty_ids": ["F1"]}
        u_yes = {**u_no, "permissions": ["manage_student_excuses"]}
        assert se._can_decide(u_no, doc) is False
        assert se._can_forward(u_no, doc) is False
        assert se._can_decide(u_yes, doc) is True
        assert se._can_forward(u_yes, doc) is True
        assert se._can_decide({"role": "dean", "permissions": [], "faculty_ids": ["F1"]}, {**doc, "route": "dean"}) is False


# ---- Trash gate
class TestTrash:
    def test_registrar_no_perm_403(self, reg):
        h, setp, orig = reg
        setp(["manage_curriculum"])
        assert requests.get(f"{BASE_URL}/api/trash", headers=h).status_code == 403

    def test_manage_students_only_403(self, reg):
        h, setp, orig = reg
        setp(["manage_students"])
        assert requests.get(f"{BASE_URL}/api/trash", headers=h).status_code == 403
        setp(["manage_teachers"])
        assert requests.get(f"{BASE_URL}/api/trash", headers=h).status_code == 403
        setp(["manage_curriculum"])

    def test_manage_courses_only_403(self, reg):
        h, setp, orig = reg
        setp(["manage_courses"])
        r = requests.get(f"{BASE_URL}/api/trash", headers=h)
        setp(["manage_curriculum"])
        assert r.status_code == 403, f"manage_courses still grants trash: {r.status_code}"

    def test_dean_head_trash_403(self):
        res = {}
        for u in ["Salim", "Saeed"]:
            h = login(u, "test1234")
            res[u] = requests.get(f"{BASE_URL}/api/trash", headers=h).status_code
        assert all(v == 403 for v in res.values()), res

    def test_manage_trash_view_restore_not_purge(self, reg):
        h, setp, orig = reg
        setp(["manage_trash"])
        assert requests.get(f"{BASE_URL}/api/trash", headers=h).status_code == 200
        assert requests.post(f"{BASE_URL}/api/trash/{FAKE}/restore", headers=h).status_code == 404
        assert requests.delete(f"{BASE_URL}/api/trash/{FAKE}", headers=h).status_code == 403
        assert requests.delete(f"{BASE_URL}/api/trash", headers=h).status_code == 403
        setp(["manage_trash", "purge_trash"])
        assert requests.delete(f"{BASE_URL}/api/trash/{FAKE}", headers=h).status_code == 404
        setp(["manage_curriculum"])


# ---- Unrelated permissions not affected
class TestUnrelated:
    def test_dean_students_courses(self):
        h = login("Salim", "test1234")
        for p in ["/api/students?limit=5", "/api/courses"]:
            r = requests.get(BASE_URL + p, headers=h)
            assert r.status_code == 200, (p, r.status_code)
