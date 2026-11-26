# Results DRAFT + publish (iter 209): import always draft, publish endpoint, notify at publish, scope, manual edit on draft, undo, grades-import link draft
import os
import time
from datetime import datetime, timezone
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient


def _env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env("/app/frontend/.env", "REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
mdb = MongoClient(_env("/app/backend/.env", "MONGO_URL"))[_env("/app/backend/.env", "DB_NAME")]

DEP = "698e500997fef774e66e93a8"
OTHER_DEP = "698e501d97fef774e66e93a9"
YEAR = "2099-2100"
GYEAR = "2097-2098"
SALIM_ORIG = ["manage_fee_receipts", "hr_manage_tasks", "hr_manage_appraisals"]
GFILE = "/app/backend/tests/sample_grades_L3S2.xls"
S = {"batches": [], "imports": [], "start": datetime.now(timezone.utc).isoformat()}


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def imp(h, rows, dep=DEP, sem="1", notify="true", commit="true", level="1"):
    csv = "رقم القيد,الحالة,المعدل,التقدير\n" + "\n".join(",".join(r) for r in rows)
    r = requests.post(f"{API}/results/import", headers=h, timeout=60,
                      files={"file": ("TEST_res.csv", csv.encode("utf-8"), "text/csv")},
                      data={"academic_year": YEAR, "level": level, "semester": sem, "scope": "department",
                            "scope_id": dep, "commit": commit, "notify": notify})
    if r.status_code == 200 and r.json().get("batch_id"):
        S["batches"].append(r.json()["batch_id"])
    return r


def notifs():
    return mdb.notifications.count_documents({"user_id": S["uid"], "type": "results", "created_at": {"$gte": S["start"]}})


def my_l1(stu, sem_key="first_semester"):
    res = requests.get(f"{API}/students/me/results", headers=stu, timeout=30).json()
    l1 = next((x for x in res["levels"] if x["level"] == 1), None)
    return (l1 or {}).get(sem_key)


def batch(h, bid):
    return next(i for i in requests.get(f"{API}/results/batches", headers=h, timeout=30).json()["items"] if i["id"] == bid)


@pytest.fixture(scope="module", autouse=True)
def env():
    st = mdb.students.find_one({"student_id": "1001", "department_id": DEP})
    S["sid"], S["uid"] = st["_id"], st["user_id"]
    S["admin"] = login("admin", "admin123")
    S["stu"] = login("1001", "test1234")
    S["base_s1"] = my_l1(S["stu"])
    S["base_s2"] = my_l1(S["stu"], "second_semester")
    yield
    a = S["admin"]
    mdb.users.update_one({"username": "Salim"}, {"$set": {"custom_permissions": SALIM_ORIG}})
    mdb.students.update_one({"_id": S["sid"]}, {"$set": {"student_id": "1001"}})
    for i in S["imports"]:
        requests.delete(f"{API}/grades/imports/{i}", headers=a, timeout=30)
    for b in reversed(S["batches"]):
        requests.post(f"{API}/results/batches/{b}/undo", headers=a, timeout=30)
    mdb.result_entries.delete_many({"academic_year": {"$in": [YEAR, GYEAR]}, "reg_no": {"$in": ["1001", "12345", "128002"]}})
    mdb.result_batches.delete_many({"_id": {"$in": [ObjectId(b) for b in S["batches"]]}})
    mdb.notifications.delete_many({"user_id": S["uid"], "type": "results", "created_at": {"$gte": S["start"]}})
    for s, sid in (("department", OTHER_DEP),):
        requests.post(f"{API}/results/pauses", headers=a, json={"scope": s, "scope_id": sid, "paused": False})


class TestDraftPublish:
    def test_import_is_draft_hidden_no_notif(self):
        r = imp(S["admin"], [["1001", "TEST_ناجح", "91.5", "ممتاز"]])
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["draft"] is True and d["notified"] == 0 and d["batch_id"]
        S["d1"] = d["batch_id"]
        b = mdb.result_batches.find_one({"_id": ObjectId(S["d1"])})
        assert b["draft"] is True and b["hidden"] is True and b["notify_on_publish"] is True and b["notify_uids"] == [S["uid"]]
        e = mdb.result_entries.find_one({"reg_no": "1001", "level": 1, "semester": 1, "academic_year": YEAR})
        assert e["batch_hidden"] is True and e["batch_id"] == S["d1"]
        assert my_l1(S["stu"]) == S["base_s1"]
        time.sleep(1.5)
        assert notifs() == 0

    def test_batches_list_draft_pending(self):
        it = batch(S["admin"], S["d1"])
        assert it["draft"] is True and it["notify_pending"] == 1 and it["notified"] == 0

    def test_visibility_on_draft_400(self):
        r = requests.post(f"{API}/results/batches/{S['d1']}/visibility", headers=S["admin"], json={"hidden": False})
        assert r.status_code == 400
        assert my_l1(S["stu"]) == S["base_s1"]

    def test_manual_edit_on_draft_stays_hidden(self):
        r = requests.post(f"{API}/results/entries", headers=S["admin"], json={
            "student_id": str(S["sid"]), "level": 1, "semester": 1, "academic_year": YEAR,
            "status": "TEST_ناجح", "gpa": "92.0", "grade": "ممتاز"})
        assert r.status_code == 200, r.text
        S["batches"].append(r.json()["batch_id"])
        S["m1"] = r.json()["batch_id"]
        e = mdb.result_entries.find_one({"reg_no": "1001", "level": 1, "semester": 1, "academic_year": YEAR})
        assert e["batch_hidden"] is True and e["draft_batch_id"] == S["d1"] and e["gpa"] == "92.0"
        assert my_l1(S["stu"]) == S["base_s1"]
        # publish on manual batch -> 400
        assert requests.post(f"{API}/results/batches/{S['m1']}/publish", headers=S["admin"], json={}).status_code == 400

    def test_publish_makes_visible_and_notifies(self):
        r = requests.post(f"{API}/results/batches/{S['d1']}/publish", headers=S["admin"], json={})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["notified"] == 1 and d["published"] >= 1
        cell = my_l1(S["stu"])
        assert cell["status"] == "TEST_ناجح" and cell["gpa"] == "92.0"
        time.sleep(2)
        assert notifs() == 1
        it = batch(S["admin"], S["d1"])
        assert it["draft"] is False and it["hidden"] is False and it["notified"] == 1 and it["published_by_name"]
        e = mdb.result_entries.find_one({"reg_no": "1001", "level": 1, "semester": 1, "academic_year": YEAR})
        assert e["batch_hidden"] is False and e.get("draft_batch_id") is None

    def test_republish_400_and_toggle_allowed(self):
        assert requests.post(f"{API}/results/batches/{S['d1']}/publish", headers=S["admin"], json={}).status_code == 400
        r = requests.post(f"{API}/results/batches/{S['d1']}/visibility", headers=S["admin"], json={"hidden": False})
        assert r.status_code == 200

    def test_draft_over_published_then_undo_restores(self):
        r = imp(S["admin"], [["1001", "TEST_راسب", "40", "ضعيف"]])
        assert r.status_code == 200, r.text
        d2 = r.json()["batch_id"]
        cell = my_l1(S["stu"])
        print("student view while correction draft pending:", cell)
        S["draft_over_published_cell"] = cell
        u = requests.post(f"{API}/results/batches/{d2}/undo", headers=S["admin"])
        assert u.status_code == 200, u.text
        cell = my_l1(S["stu"])
        assert cell["status"] == "TEST_ناجح" and cell["gpa"] == "92.0"
        assert requests.post(f"{API}/results/batches/{d2}/publish", headers=S["admin"], json={}).status_code == 400

    def test_draft_over_published_keeps_old_visible(self):
        # a pending correction draft should not hide the already-published result
        c = S.get("draft_over_published_cell") or {}
        assert c.get("status") == "TEST_ناجح", f"published result disappeared while correction is a draft: {c}"

    def test_undo_new_draft_removes_entry(self):
        r = imp(S["admin"], [["1001", "TEST_ناجح", "70", "جيد"]], sem="2")
        assert r.status_code == 200
        d3 = r.json()["batch_id"]
        assert requests.post(f"{API}/results/batches/{d3}/undo", headers=S["admin"]).status_code == 200
        assert mdb.result_entries.find_one({"reg_no": "1001", "level": 1, "semester": 2, "academic_year": YEAR}) is None
        assert my_l1(S["stu"], "second_semester") == S["base_s2"]

    def test_notify_false_publish_no_notification(self):
        before = notifs()
        r = imp(S["admin"], [["1001", "TEST_ناجح", "75", "جيد جدا"]], sem="2", notify="false")
        assert r.status_code == 200
        d4 = r.json()["batch_id"]
        assert batch(S["admin"], d4)["notify_pending"] == 0
        p = requests.post(f"{API}/results/batches/{d4}/publish", headers=S["admin"], json={})
        assert p.status_code == 200 and p.json()["notified"] == 0
        assert my_l1(S["stu"], "second_semester")["gpa"] == "75"
        time.sleep(1.5)
        assert notifs() == before

    def test_publish_event_only_400(self):
        a = S["admin"]
        assert requests.post(f"{API}/results/pauses", headers=a, json={"scope": "department", "scope_id": OTHER_DEP, "paused": True}).status_code == 200
        assert requests.post(f"{API}/results/pauses", headers=a, json={"scope": "department", "scope_id": OTHER_DEP, "paused": False}).status_code == 200
        ev = [i for i in requests.get(f"{API}/results/batches", headers=a).json()["items"] if i.get("event_only")][:2]
        S["batches"].extend(i["id"] for i in ev)
        for i in ev:
            assert requests.post(f"{API}/results/batches/{i['id']}/publish", headers=a, json={}).status_code == 400

    def test_invalid_batch_id_404(self):
        assert requests.post(f"{API}/results/batches/xyz/publish", headers=S["admin"], json={}).status_code == 404


class TestDeanScope:
    def test_dean_cannot_publish_other_faculty(self):
        r = imp(S["admin"], [["12345", "TEST_ناجح", "80", "جيد"]], dep=OTHER_DEP, level="3")
        assert r.status_code == 200, r.text
        other = r.json()["batch_id"]
        mdb.users.update_one({"username": "Salim"}, {"$set": {"custom_permissions": SALIM_ORIG + ["manage_results"]}})
        h = login("Salim", "test1234")
        assert requests.post(f"{API}/results/batches/{other}/publish", headers=h, json={}).status_code in (403, 404)
        assert all(i["id"] != other for i in requests.get(f"{API}/results/batches", headers=h).json()["items"])
        assert mdb.result_batches.find_one({"_id": ObjectId(other)})["draft"] is True

    def test_dean_can_publish_own(self):
        h = login("Salim", "test1234")
        r = imp(h, [["1001", "TEST_ناجح", "93", "ممتاز"]], sem="2", notify="false")
        assert r.status_code == 200, r.text
        p = requests.post(f"{API}/results/batches/{r.json()['batch_id']}/publish", headers=h, json={})
        assert p.status_code == 200, p.text

    def test_view_only_cannot_publish(self):
        mdb.users.update_one({"username": "Salim"}, {"$set": {"custom_permissions": SALIM_ORIG + ["view_results"]}})
        h = login("Salim", "test1234")
        r = imp(S["admin"], [["1001", "TEST_ناجح", "60", "مقبول"]], sem="2", notify="false")
        assert requests.post(f"{API}/results/batches/{r.json()['batch_id']}/publish", headers=h, json={}).status_code == 403


class TestGradesLinkDraft:
    def test_grades_import_link_is_draft(self):
        assert mdb.grade_imports.count_documents({"department_id": DEP, "level": 3, "semester_no": 2, "academic_year": GYEAR}) == 0
        mdb.students.update_one({"_id": S["sid"]}, {"$set": {"student_id": "128002"}})
        with open(GFILE, "rb") as f:
            r = requests.post(f"{API}/grades/import", headers=S["admin"], timeout=120,
                              files={"file": ("sample_grades_L3S2.xls", f, "application/vnd.ms-excel")},
                              data={"faculty_id": "698e4f9297fef774e66e93a4", "department_id": DEP, "level": "3", "semester_no": "2",
                                    "academic_year": GYEAR, "batch_no": "28", "commit": "true", "replace": "true", "notify": "true"})
        assert r.status_code == 200, r.text
        d = r.json()
        S["imports"].append(d["import_id"])
        assert d["linked"] == 1 and d["draft"] is True and d["notified"] == 0
        S["gb"] = d["results_batch_id"]
        S["batches"].append(S["gb"])
        before = notifs()
        g = requests.get(f"{API}/students/me/grades", headers=S["stu"]).json()["semesters"]
        assert not any(x["level"] == 3 and x["semester"] == 2 for x in g), g
        res = requests.get(f"{API}/students/me/results", headers=S["stu"]).json()["levels"]
        l3 = next((x for x in res if x["level"] == 3), None)
        assert l3 is None or not any(l3["second_semester"].values())
        it = batch(S["admin"], S["gb"])
        assert it["draft"] is True and it["notify_pending"] == 1
        p = requests.post(f"{API}/results/batches/{S['gb']}/publish", headers=S["admin"], json={})
        assert p.status_code == 200 and p.json()["notified"] == 1
        g = requests.get(f"{API}/students/me/grades", headers=S["stu"]).json()["semesters"]
        assert any(x["level"] == 3 and x["semester"] == 2 for x in g)
        time.sleep(2)
        assert notifs() == before + 1


class TestUndoDraftAfterManualEdit:
    def test_undo_draft_after_manual_edit_not_stuck_hidden(self):
        r = imp(S["admin"], [["1001", "TEST_ناجح", "66", "جيد"]], sem="2", level="2")
        assert r.status_code == 200, r.text
        d = r.json()["batch_id"]
        m = requests.post(f"{API}/results/entries", headers=S["admin"], json={
            "student_id": str(S["sid"]), "level": 2, "semester": 2, "academic_year": YEAR, "status": "TEST_ناجح", "gpa": "67", "grade": "جيد"})
        assert m.status_code == 200
        S["batches"].append(m.json()["batch_id"])
        assert requests.post(f"{API}/results/batches/{d}/undo", headers=S["admin"]).status_code == 200
        e = mdb.result_entries.find_one({"reg_no": "1001", "level": 2, "semester": 2, "academic_year": YEAR})
        print("after undo of draft (manual edit kept):", e and {k: e.get(k) for k in ("gpa", "batch_hidden", "draft_batch_id")})
        # entry is either removed or not permanently tied to an undone draft
        assert e is None or not (e.get("batch_hidden") and e.get("draft_batch_id") == d), "entry stuck hidden: linked to undone draft, cannot be published"
