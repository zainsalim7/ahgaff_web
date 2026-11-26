# Results pause master switch (iter 208): POST/GET /api/results/pauses, student /me/results & /me/grades paused, scope rules, history events
import os
import pytest
import requests
from pymongo import MongoClient


def _env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env("/app/frontend/.env", "REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
mdb = MongoClient(_env("/app/backend/.env", "MONGO_URL"))[_env("/app/backend/.env", "DB_NAME")]

FAC = "698e4f9297fef774e66e93a4"
OTHER_FAC = "698e4fb497fef774e66e93a6"
DEP = "698e500997fef774e66e93a8"
OTHER_DEP = "698e501d97fef774e66e93a9"
SALIM_ORIG = ["manage_fee_receipts", "hr_manage_tasks", "hr_manage_appraisals"]
PAUSED_MSG = "النتائج غير متاحة حالياً"


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin():
    return login("admin", "admin123")


@pytest.fixture(scope="module")
def student():
    return login("1001", "test1234")


@pytest.fixture(scope="module")
def baseline(student):
    r1 = requests.get(f"{API}/students/me/results", headers=student).json()
    r2 = requests.get(f"{API}/students/me/grades", headers=student).json()
    return r1, r2


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin):
    yield
    mdb.users.update_one({"username": "Salim"}, {"$set": {"custom_permissions": SALIM_ORIG}})
    for s, sid in (("all", None), ("faculty", FAC), ("faculty", OTHER_FAC), ("department", DEP), ("department", OTHER_DEP)):
        requests.post(f"{API}/results/pauses", headers=admin, json={"scope": s, "scope_id": sid, "paused": False})
    assert mdb.results_pauses.count_documents({}) == 0


def pause(h, scope, sid, paused=True):
    return requests.post(f"{API}/results/pauses", headers=h, json={"scope": scope, "scope_id": sid, "paused": paused})


def assert_paused(student):
    r = requests.get(f"{API}/students/me/results", headers=student).json()
    g = requests.get(f"{API}/students/me/grades", headers=student).json()
    assert r == {"levels": [], "paused": True, "message": PAUSED_MSG}, r
    assert g == {"semesters": [], "paused": True, "message": PAUSED_MSG}, g


def assert_restored(student, baseline):
    r = requests.get(f"{API}/students/me/results", headers=student).json()
    g = requests.get(f"{API}/students/me/grades", headers=student).json()
    assert r == baseline[0]
    assert g == baseline[1]
    assert not r.get("paused") and not g.get("paused")


class TestAdminPause:
    def test_baseline_has_data(self, baseline):
        assert len(baseline[0].get("levels", [])) > 0 or len(baseline[1].get("semesters", [])) > 0, baseline

    @pytest.mark.parametrize("scope,sid", [("all", None), ("faculty", FAC), ("department", DEP)])
    def test_pause_scope_affects_student(self, admin, student, baseline, scope, sid):
        r = pause(admin, scope, sid)
        assert r.status_code == 200, r.text
        assert r.json()["paused"] is True
        lst = requests.get(f"{API}/results/pauses", headers=admin).json()
        assert lst["can_pause_all"] is True
        it = [i for i in lst["items"] if i["scope"] == scope and i["scope_id"] == sid]
        assert it and it[0]["can_resume"] is True and it[0]["scope_name"] and it[0]["paused_by_name"]
        assert_paused(student)
        r = pause(admin, scope, sid, False)
        assert r.status_code == 200, r.text
        assert_restored(student, baseline)

    def test_other_department_not_affecting(self, admin, student, baseline):
        assert pause(admin, "department", OTHER_DEP).status_code == 200
        assert_restored(student, baseline)
        assert pause(admin, "department", OTHER_DEP, False).status_code == 200

    def test_other_faculty_not_affecting(self, admin, student, baseline):
        assert pause(admin, "faculty", OTHER_FAC).status_code == 200
        assert_restored(student, baseline)
        assert pause(admin, "faculty", OTHER_FAC, False).status_code == 200

    def test_double_pause_idempotent(self, admin):
        assert pause(admin, "department", DEP).status_code == 200
        assert pause(admin, "department", DEP).status_code == 200
        assert mdb.results_pauses.count_documents({"scope": "department", "scope_id": DEP}) == 1
        assert pause(admin, "department", DEP, False).status_code == 200

    def test_resume_not_paused_404(self, admin):
        assert pause(admin, "department", DEP, False).status_code == 404
        assert pause(admin, "all", None, False).status_code == 404

    def test_bad_scope_400(self, admin):
        assert pause(admin, "faculty", None).status_code == 400
        assert pause(admin, "xyz", FAC).status_code == 400

    def test_history_has_events(self, admin):
        items = requests.get(f"{API}/results/batches", headers=admin).json()["items"]
        ev = [i for i in items if i["kind"] in ("pause", "resume")]
        assert any(i["kind"] == "pause" for i in ev) and any(i["kind"] == "resume" for i in ev)
        assert all(i["event_only"] is True for i in ev)
        assert all(i["kind_name"] for i in ev)


class TestDeanScope:
    def test_view_only_403(self):
        mdb.users.update_one({"username": "Salim"}, {"$set": {"custom_permissions": SALIM_ORIG + ["view_results"]}})
        h = login("Salim", "test1234")
        assert requests.get(f"{API}/results/pauses", headers=h).status_code == 200
        assert pause(h, "faculty", FAC).status_code == 403

    def test_dean_manage_scope(self, admin, student, baseline):
        mdb.users.update_one({"username": "Salim"}, {"$set": {"custom_permissions": SALIM_ORIG + ["manage_results"]}})
        h = login("Salim", "test1234")
        lst = requests.get(f"{API}/results/pauses", headers=h).json()
        assert lst["can_pause_all"] is False
        assert pause(h, "all", None).status_code == 403
        assert pause(h, "faculty", OTHER_FAC).status_code == 403
        assert pause(h, "department", OTHER_DEP).status_code == 403
        r = pause(h, "faculty", FAC)
        assert r.status_code == 200, r.text
        assert_paused(student)
        it = [i for i in requests.get(f"{API}/results/pauses", headers=h).json()["items"] if i["scope_id"] == FAC]
        assert it and it[0]["can_resume"] is True
        # dean sees admin's 'all' pause but cannot resume it
        assert pause(admin, "all", None).status_code == 200
        it = [i for i in requests.get(f"{API}/results/pauses", headers=h).json()["items"] if i["scope"] == "all"]
        assert it and it[0]["can_resume"] is False
        assert pause(h, "all", None, False).status_code == 403
        assert pause(admin, "all", None, False).status_code == 200
        assert pause(h, "faculty", FAC, False).status_code == 200
        assert_restored(student, baseline)
