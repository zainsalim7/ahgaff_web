# Tests: admin study-plans overview + student per-course approved study plan + regression
import os
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    if r.status_code != 200:
        return None
    return r.json().get("access_token") or r.json().get("token")


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin():
    t = _login("admin", "admin123")
    if not t:
        pytest.skip("admin login failed")
    return t


@pytest.fixture(scope="module")
def student():
    t = _login("1001", "test1234")
    if not t:
        pytest.skip("student login failed")
    return t


@pytest.fixture(scope="module")
def teacher():
    t = _login("teacher180156", "teacher123")
    if not t:
        pytest.skip("teacher login failed")
    return t


@pytest.fixture(scope="module")
def mdb():
    c = MongoClient(os.environ["MONGO_URL"])
    return c[os.environ["DB_NAME"]]


def _all_rows(data):
    return [c for f in data["faculties"] for d in f["departments"] for c in d["courses"]]


# ---- Overview ----
class TestOverview:
    def test_overview_structure_and_totals(self, admin, mdb):
        r = requests.get(f"{API}/study-plans/overview", headers=H(admin), timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        rows = _all_rows(data)
        t = data["totals"]
        assert t["total"] == len(rows) > 0
        assert t["approved"] + t["pending"] + t["none"] == t["total"]
        for c in rows:
            assert c["status"] in ("approved", "pending", "none")
            for k in ("course_id", "course_name", "course_code", "teacher_name", "weeks_count", "topics_count"):
                assert k in c
        # status correctness vs DB for sample
        for c in rows[:200]:
            p = mdb.study_plans.find_one({"course_id": c["course_id"]})
            exp = "approved" if p and p.get("approved") else ("pending" if p and p.get("pending_weeks") else "none")
            assert c["status"] == exp, c
        # course count vs DB active courses
        assert t["total"] == mdb.courses.count_documents({"is_active": {"$ne": False}})

    def test_overview_filters(self, admin, mdb):
        full = requests.get(f"{API}/study-plans/overview", headers=H(admin), timeout=60).json()
        dep = mdb.departments.find_one({"faculty_id": {"$exists": True, "$ne": None}})
        fac_id = dep["faculty_id"]
        rf = requests.get(f"{API}/study-plans/overview", params={"faculty_id": fac_id}, headers=H(admin), timeout=60).json()
        assert rf["totals"]["total"] <= full["totals"]["total"]
        dep_ids = [str(d["_id"]) for d in mdb.departments.find({"faculty_id": fac_id})]
        assert rf["totals"]["total"] == mdb.courses.count_documents({"is_active": {"$ne": False}, "department_id": {"$in": dep_ids}})
        # department filter
        # pick department with most courses
        agg = list(mdb.courses.aggregate([{"$match": {"is_active": {"$ne": False}}}, {"$group": {"_id": "$department_id", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 1}]))
        did = agg[0]["_id"]
        rd = requests.get(f"{API}/study-plans/overview", params={"department_id": did}, headers=H(admin), timeout=60).json()
        assert rd["totals"]["total"] == agg[0]["n"]
        assert sum(len(d["courses"]) for f in rd["faculties"] for d in f["departments"]) == agg[0]["n"]
        # status filter
        for st in ("none", "approved", "pending"):
            rs = requests.get(f"{API}/study-plans/overview", params={"status": st}, headers=H(admin), timeout=60).json()
            assert rs["totals"]["total"] == full["totals"][st]
            assert all(c["status"] == st for c in _all_rows(rs))

    def test_overview_student_forbidden(self, student):
        r = requests.get(f"{API}/study-plans/overview", headers=H(student), timeout=30)
        assert r.status_code == 403

    def test_overview_teacher(self, teacher):
        r = requests.get(f"{API}/study-plans/overview", headers=H(teacher), timeout=30)
        print("teacher overview status", r.status_code, r.text[:200])
        assert r.status_code in (200, 403)

    def test_overview_scoped_dept_head(self, admin):
        t = _login("Saeed", "test1234")
        if not t:
            pytest.skip("Saeed login failed")
        r = requests.get(f"{API}/study-plans/overview", headers=H(t), timeout=60)
        if r.status_code == 403:
            pytest.skip("Saeed lacks overview permissions")
        assert r.status_code == 200
        full = requests.get(f"{API}/study-plans/overview", headers=H(admin), timeout=60).json()
        print("Saeed totals", r.json()["totals"], "admin totals", full["totals"])
        assert r.json()["totals"]["total"] < full["totals"]["total"]

    def test_overview_scope_bypass_via_department_filter(self, admin, mdb):
        """Scoped user should NOT see other departments by passing department_id"""
        t = _login("Saeed", "test1234")
        if not t:
            pytest.skip("Saeed login failed")
        own = requests.get(f"{API}/study-plans/overview", headers=H(t), timeout=60)
        if own.status_code == 403:
            pytest.skip("no access")
        own_ids = {c["course_id"] for c in _all_rows(own.json())}
        other = mdb.courses.find_one({"is_active": {"$ne": False}, "_id": {"$nin": [__import__("bson").ObjectId(i) for i in own_ids]}, "department_id": {"$nin": [None, ""]}})
        r = requests.get(f"{API}/study-plans/overview", params={"department_id": other["department_id"]}, headers=H(t), timeout=60)
        leaked = {c["course_id"] for c in _all_rows(r.json())} - own_ids if r.status_code == 200 else set()
        print("leaked courses:", len(leaked))
        assert not leaked, f"scope bypass: {len(leaked)} out-of-scope courses returned"


# ---- Student per-course study plan ----
class TestStudentCoursePlan:
    def test_flow(self, admin, student, mdb):
        courses = requests.get(f"{API}/students/me/courses", headers=H(student), timeout=30)
        assert courses.status_code == 200
        lst = courses.json()
        lst = lst.get("courses", lst) if isinstance(lst, dict) else lst
        assert lst, "student has no courses"
        target = None
        for c in lst:
            cid = c.get("id") or c.get("_id")
            if not mdb.study_plans.find_one({"course_id": cid}):
                target = cid
                break
        if not target:
            pytest.skip("all student courses have plans; avoid mutation")
        try:
            r = requests.get(f"{API}/students/me/courses/{target}/study-plan", headers=H(student), timeout=30)
            assert r.status_code == 200 and r.json() == {"approved": False, "weeks": []}, r.text
            weeks = [{"week_number": 1, "topics": [{"title": "TEST_topic1", "notes": "n1"}, {"title": "TEST_topic2", "notes": ""}]},
                     {"week_number": 2, "topics": [{"title": "TEST_topic3", "notes": ""}]}]
            p = requests.put(f"{API}/courses/{target}/study-plan", json={"weeks": weeks}, headers=H(admin), timeout=30)
            assert p.status_code == 200, p.text
            r = requests.get(f"{API}/students/me/courses/{target}/study-plan", headers=H(student), timeout=30)
            assert r.json() == {"approved": False, "weeks": []}
            a = requests.post(f"{API}/courses/{target}/study-plan/approve", headers=H(admin), timeout=30)
            assert a.status_code == 200, a.text
            r = requests.get(f"{API}/students/me/courses/{target}/study-plan", headers=H(student), timeout=30)
            d = r.json()
            assert d["approved"] is True and d.get("updated_at")
            assert d["weeks"][0]["week_number"] == 1
            assert d["weeks"][0]["topics"][0] == {"title": "TEST_topic1", "notes": "n1"}
            assert len(d["weeks"][1]["topics"]) == 1
            # overview reflects approved
            ov = requests.get(f"{API}/study-plans/overview", params={"status": "approved"}, headers=H(admin), timeout=60).json()
            row = [c for c in _all_rows(ov) if c["course_id"] == target]
            assert row and row[0]["weeks_count"] == 2 and row[0]["topics_count"] == 3
        finally:
            mdb.study_plans.delete_one({"course_id": target})

    def test_foreign_course_forbidden(self, student, mdb):
        st_user = requests.get(f"{API}/auth/me", headers=H(student), timeout=30).json()
        uid = st_user.get("id") or st_user.get("_id")
        s = mdb.students.find_one({"user_id": uid})
        enrolled = {e["course_id"] for e in mdb.enrollments.find({"student_id": str(s["_id"])})}
        other = None
        for c in mdb.courses.find({"department_id": {"$ne": s.get("department_id")}}).limit(50):
            if str(c["_id"]) not in enrolled:
                other = str(c["_id"])
                break
        r = requests.get(f"{API}/students/me/courses/{other}/study-plan", headers=H(student), timeout=30)
        assert r.status_code == 403, r.text

    def test_invalid_id(self, student):
        r = requests.get(f"{API}/students/me/courses/badid/study-plan", headers=H(student), timeout=30)
        assert r.status_code == 400

    def test_non_student_forbidden(self, admin, teacher, mdb):
        cid = str(mdb.courses.find_one()["_id"])
        for t in (admin, teacher):
            r = requests.get(f"{API}/students/me/courses/{cid}/study-plan", headers=H(t), timeout=30)
            assert r.status_code == 403
            assert "للطلاب فقط" in r.json().get("detail", "")


# ---- Regression ----
class TestRegression:
    def test_my_study_plan(self, student, admin):
        r = requests.get(f"{API}/students/me/study-plan", headers=H(student), timeout=30)
        assert r.status_code == 200 and isinstance(r.json()["levels"], list)
        assert requests.get(f"{API}/students/me/study-plan", headers=H(admin), timeout=30).status_code == 403

    def test_my_results(self, student, admin):
        r = requests.get(f"{API}/students/me/results", headers=H(student), timeout=30)
        assert r.status_code == 200, r.text
        print("results keys", list(r.json().keys()) if isinstance(r.json(), dict) else type(r.json()))
        assert requests.get(f"{API}/students/me/results", headers=H(admin), timeout=30).status_code == 403
