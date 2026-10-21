# Phase 3: lecture cancellation reason type (college/non_college) + Prep Leave Periods + absence engine + overtime report
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

TEACHER_COURSE = "6ace901ad7775476ff611baf"  # دراسات حضرموت (active semester, teacher 698e533b...) — student 999 enrolled
TEST_DATES = ["2027-03-01", "2027-03-02"]  # future dates for test lectures (Mon/Tue)


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        pytest.skip(f"login failed for {u}: {r.status_code} {r.text[:200]}")
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    s.user = d.get("user", {})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("admin", "admin123")


@pytest.fixture(scope="module")
def teacher():
    return _login("teacher180156", "teacher123")


@pytest.fixture(scope="module")
def student():
    return _login("1001", "test1234")


@pytest.fixture(scope="module")
def test_lectures(admin):
    ids = []
    for d in TEST_DATES:
        r = admin.post(f"{API}/lectures", json={"course_id": TEACHER_COURSE, "date": d, "start_time": "07:00", "end_time": "08:00", "room": "TEST_ROOM", "force": True})
        assert r.status_code == 200, r.text
        ids.append(r.json()["id"])
    yield ids
    for i in ids:
        admin.delete(f"{API}/lectures/{i}")


def _get_lecture(admin, lid):
    r = admin.get(f"{API}/lectures/{TEACHER_COURSE}", params={"per_page": 1000})
    assert r.status_code == 200, r.text
    data = r.json()
    items = data if isinstance(data, list) else data.get("lectures") or data.get("items") or []
    for l in items:
        if l.get("id") == lid:
            return l
    raise AssertionError(f"lecture {lid} not found in list")


# ---------- PUT /lectures/{id}/status ----------
class TestStatusEndpoint:
    def test_cancel_college_persists_then_reset(self, admin, test_lectures):
        lid = test_lectures[0]
        r = admin.put(f"{API}/lectures/{lid}/status", json={"status": "cancelled", "cancellation_reason": "TEST_college", "cancellation_reason_type": "college", "apply_to_shared": False})
        assert r.status_code == 200, r.text
        l = _get_lecture(admin, lid)
        assert l["status"] == "cancelled"
        assert l["cancellation_reason_type"] == "college"
        r = admin.put(f"{API}/lectures/{lid}/status", json={"status": "scheduled", "apply_to_shared": False})
        assert r.status_code == 200
        l = _get_lecture(admin, lid)
        assert l["status"] == "scheduled"
        assert l.get("cancellation_reason_type") is None

    def test_absent_does_not_persist_type(self, admin, test_lectures):
        lid = test_lectures[0]
        r = admin.put(f"{API}/lectures/{lid}/status", json={"status": "absent", "cancellation_reason_type": "college", "apply_to_shared": False})
        assert r.status_code == 200, r.text
        l = _get_lecture(admin, lid)
        assert l["status"] == "absent"
        assert l.get("cancellation_reason_type") is None
        admin.put(f"{API}/lectures/{lid}/status", json={"status": "scheduled", "apply_to_shared": False})

    def test_invalid_type_400(self, admin, test_lectures):
        r = admin.put(f"{API}/lectures/{test_lectures[0]}/status", json={"status": "cancelled", "cancellation_reason_type": "invalid_value"})
        assert r.status_code == 400

    def test_teacher_forbidden_status_endpoint(self, teacher, test_lectures):
        r = teacher.put(f"{API}/lectures/{test_lectures[0]}/status", json={"status": "cancelled", "cancellation_reason_type": "college"})
        assert r.status_code == 403


# ---------- PUT /lectures/{id} ----------
class TestGeneralUpdateEndpoint:
    def test_admin_persists_type(self, admin, test_lectures):
        lid = test_lectures[1]
        r = admin.put(f"{API}/lectures/{lid}", json={"status": "cancelled", "cancellation_reason": "TEST_admin", "cancellation_reason_type": "college", "apply_to_shared": False})
        assert r.status_code == 200, r.text
        assert _get_lecture(admin, lid)["cancellation_reason_type"] == "college"
        r = admin.put(f"{API}/lectures/{lid}", json={"status": "scheduled", "apply_to_shared": False})
        assert r.status_code == 200, r.text
        assert _get_lecture(admin, lid).get("cancellation_reason_type") is None

    def test_admin_invalid_type_400(self, admin, test_lectures):
        r = admin.put(f"{API}/lectures/{test_lectures[1]}", json={"status": "cancelled", "cancellation_reason_type": "invalid_value"})
        assert r.status_code == 400

    def test_teacher_type_stripped(self, admin, teacher, test_lectures):
        lid = test_lectures[1]
        r = teacher.put(f"{API}/lectures/{lid}", json={"status": "cancelled", "cancellation_reason": "TEST_teacher", "cancellation_reason_type": "college", "apply_to_shared": False})
        assert r.status_code == 200, r.text
        l = _get_lecture(admin, lid)
        assert l["status"] == "cancelled"
        assert l.get("cancellation_reason_type") is None
        admin.put(f"{API}/lectures/{lid}", json={"status": "scheduled", "apply_to_shared": False})


# ---------- Overtime report: college vs non_college ----------
class TestOvertimeReport:
    def _course_row(self, admin):
        tid = admin.get(f"{API}/lectures/{TEACHER_COURSE}").json()
        r = admin.get(f"{API}/reports/teacher-workload", params={"start_date": "2027-03-01", "end_date": "2027-03-07", "course_ids": TEACHER_COURSE})
        assert r.status_code == 200, r.text
        data = r.json()
        teachers = data if isinstance(data, list) else data.get("teachers") or data.get("items") or []
        for t in teachers:
            for c in t.get("courses", []):
                if c["course_id"] == TEACHER_COURSE:
                    return c
        raise AssertionError(f"course not in report: {str(data)[:500]}")

    def test_college_vs_non_college_shortfall(self, admin, test_lectures):
        lid = test_lectures[0]
        for i in test_lectures:
            admin.put(f"{API}/lectures/{i}/status", json={"status": "scheduled", "apply_to_shared": False})
        base = self._course_row(admin)
        admin.put(f"{API}/lectures/{lid}/status", json={"status": "cancelled", "cancellation_reason_type": "non_college", "apply_to_shared": False})
        nc = self._course_row(admin)
        admin.put(f"{API}/lectures/{lid}/status", json={"status": "cancelled", "cancellation_reason_type": "college", "apply_to_shared": False})
        col = self._course_row(admin)
        admin.put(f"{API}/lectures/{lid}/status", json={"status": "scheduled", "apply_to_shared": False})
        print("base", base, "\nnon_college", nc, "\ncollege", col)
        assert nc.get("college_cancel_hours", 0) == 0
        assert col["college_cancel_hours"] == 1.0
        assert "إلغاء بسبب الكلية" in col["note"]
        assert nc["shortfall_hours"] >= base["shortfall_hours"]
        if nc["expected_hours"] > 0:
            assert col["shortfall_hours"] < nc["shortfall_hours"] or nc["shortfall_hours"] == 0


# ---------- Prep leave periods CRUD ----------
class TestPrepLeaveCRUD:
    def test_list(self, admin):
        r = admin.get(f"{API}/prep-leave-periods")
        assert r.status_code == 200
        assert isinstance(r.json()["items"], list)

    def test_create_delete_all_scope(self, admin):
        r = admin.post(f"{API}/prep-leave-periods", json={"date_from": "2030-01-01", "date_to": "2030-01-03", "scope": "all", "reason": "TEST_prep"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["scope_label"] == "الجامعة بالكامل" and d["reason"] == "TEST_prep"
        ids = [i["id"] for i in admin.get(f"{API}/prep-leave-periods").json()["items"]]
        assert d["id"] in ids
        r = admin.delete(f"{API}/prep-leave-periods/{d['id']}")
        assert r.status_code == 200
        ids = [i["id"] for i in admin.get(f"{API}/prep-leave-periods").json()["items"]]
        assert d["id"] not in ids
        assert admin.delete(f"{API}/prep-leave-periods/{d['id']}").status_code == 404

    def test_course_scope_requires_id(self, admin):
        r = admin.post(f"{API}/prep-leave-periods", json={"date_from": "2030-01-01", "date_to": "2030-01-03", "scope": "course"})
        assert r.status_code == 400

    def test_date_order(self, admin):
        r = admin.post(f"{API}/prep-leave-periods", json={"date_from": "2030-01-05", "date_to": "2030-01-03", "scope": "all"})
        assert r.status_code == 400

    def test_invalid_scope_and_date_format(self, admin):
        assert admin.post(f"{API}/prep-leave-periods", json={"date_from": "2030-01-01", "date_to": "2030-01-03", "scope": "xyz", "scope_id": "a"}).status_code == 400
        assert admin.post(f"{API}/prep-leave-periods", json={"date_from": "01/01/2030", "date_to": "2030-01-03", "scope": "all"}).status_code == 400

    def test_teacher_student_forbidden(self, admin, teacher, student):
        r = admin.post(f"{API}/prep-leave-periods", json={"date_from": "2030-02-01", "date_to": "2030-02-02", "scope": "all", "reason": "TEST_perm"})
        pid = r.json()["id"]
        try:
            results = {}
            for name, s in (("teacher", teacher), ("student", student)):
                rp = s.post(f"{API}/prep-leave-periods", json={"date_from": "2030-02-01", "date_to": "2030-02-02", "scope": "all", "reason": "TEST_" + name})
                if rp.status_code == 200:
                    admin.delete(f"{API}/prep-leave-periods/{rp.json()['id']}")
                rd = s.delete(f"{API}/prep-leave-periods/{pid}")
                results[name] = (rp.status_code, rd.status_code)
                if rd.status_code == 200:
                    pid = admin.post(f"{API}/prep-leave-periods", json={"date_from": "2030-02-01", "date_to": "2030-02-02", "scope": "all", "reason": "TEST_perm"}).json()["id"]
            print("perm results", results)
            assert results == {"teacher": (403, 403), "student": (403, 403)}
        finally:
            admin.delete(f"{API}/prep-leave-periods/{pid}")


# ---------- Absence engine integration ----------
ACTIVE_COURSE = "6ace901ad7775476ff611baf"  # دراسات حضرموت (active semester) — student 999 enrolled
ENGINE_DATE = "2026-10-15"


class TestAbsenceEngine:
    def _rule(self, admin, sid="69b2e7bdb318756c5856f466"):
        r = admin.get(f"{API}/reports/student/{sid}/detailed")
        assert r.status_code == 200, r.text
        for c in r.json()["courses"]:
            if c["course_id"] == ACTIVE_COURSE:
                return c["rule"]
        raise AssertionError("course not in student report")

    def test_prep_period_excludes_executed_lecture(self, admin):
        # past-date lectures can't be created via API -> create for future date, then move date directly in DB (test seed)
        r = admin.post(f"{API}/lectures", json={"course_id": ACTIVE_COURSE, "date": "2027-04-01", "start_time": "06:00", "end_time": "07:00", "room": "TEST_ROOM", "force": True})
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        from pymongo import MongoClient
        from bson import ObjectId
        load_dotenv("/app/backend/.env")
        mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        mdb.lectures.update_one({"_id": ObjectId(lid)}, {"$set": {"date": ENGINE_DATE}})
        pid = None
        try:
            base = self._rule(admin)
            assert admin.put(f"{API}/lectures/{lid}/status", json={"status": "completed"}).status_code == 200
            before = self._rule(admin)
            print("base", base, "before", before)
            assert before["executed_hours"] == base["executed_hours"] + 1
            r = admin.post(f"{API}/prep-leave-periods", json={"date_from": ENGINE_DATE, "date_to": ENGINE_DATE, "scope": "course", "scope_id": ACTIVE_COURSE, "scope_name": "TEST", "reason": "TEST_engine"})
            assert r.status_code == 200, r.text
            pid = r.json()["id"]
            after = self._rule(admin)
            print("after", after)
            assert after["executed_hours"] == base["executed_hours"]
            assert after["unexcused_hours"] == base["unexcused_hours"]
            # department scope also applies
            admin.delete(f"{API}/prep-leave-periods/{pid}")
            r = admin.post(f"{API}/prep-leave-periods", json={"date_from": ENGINE_DATE, "date_to": ENGINE_DATE, "scope": "department", "scope_id": "698e501d97fef774e66e93a9", "reason": "TEST_engine_dep"})
            pid = r.json()["id"]
            assert self._rule(admin)["executed_hours"] == base["executed_hours"]
        finally:
            if pid:
                admin.delete(f"{API}/prep-leave-periods/{pid}")
            admin.delete(f"{API}/lectures/{lid}")
