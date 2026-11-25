# Results v3: view_results/manage_results permissions, batch+entry hide, undo (import/manual/delete), dean scope on batches
import io
import os
import pytest
import requests
import openpyxl
from pymongo import MongoClient
from bson import ObjectId


def _env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env("/app/frontend/.env", "REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
mdb = MongoClient(_env("/app/backend/.env", "MONGO_URL"))[_env("/app/backend/.env", "DB_NAME")]

STUDENT_DB = "698e57518cfb2f14627a285e"
STUDENT_UID = "69a99544650b31fa86440da2"
DEP = "698e500997fef774e66e93a8"
OTHER_DB = "698ef706d803b27aab012065"  # student 12345 in out-of-scope dept for Salim
YEAR = "2098-2099"
LVL = 7
SALIM_ORIG = ["manage_fee_receipts", "hr_manage_tasks", "hr_manage_appraisals"]
CREATED_BATCHES = []


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def salim_with(perms):
    mdb.users.update_one({"username": "Salim"}, {"$set": {"custom_permissions": SALIM_ORIG + perms}})
    return login("Salim", "test1234")


def xlsx(gpa="95", reg="1001"):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["رقم القيد", "الحالة", "المعدل", "التقدير"])
    ws.append([reg, "ناجح", gpa, "ممتاز"])
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


def do_import(h, gpa="95", sem=1, dep=DEP):
    r = requests.post(f"{API}/results/import", headers=h, files={"file": ("t.xlsx", xlsx(gpa), "application/octet-stream")},
                      data={"academic_year": YEAR, "level": str(LVL), "semester": str(sem), "scope": "department",
                            "scope_id": dep, "commit": "true", "notify": "false"})
    if r.status_code == 200 and r.json().get("batch_id"):
        CREATED_BATCHES.append(r.json()["batch_id"])
    return r


def manual(h, sid=STUDENT_DB, sem=1, **vals):
    r = requests.post(f"{API}/results/entries", headers=h, json={"student_id": sid, "level": LVL, "semester": sem, "academic_year": YEAR, **vals})
    if r.status_code == 200 and r.json().get("batch_id"):
        CREATED_BATCHES.append(r.json()["batch_id"])
    return r


def entry(sem=1, reg="1001"):
    return mdb.result_entries.find_one({"reg_no": reg, "level": LVL, "semester": sem, "academic_year": YEAR})


def my_level(student):
    lv = [x for x in requests.get(f"{API}/students/me/results", headers=student).json()["levels"] if x["level"] == LVL]
    return lv[0] if lv else None


@pytest.fixture(scope="module")
def admin():
    return login("admin", "admin123")


@pytest.fixture(scope="module")
def student():
    return login("1001", "test1234")


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    mdb.users.update_one({"username": "Salim"}, {"$set": {"custom_permissions": SALIM_ORIG}})
    mdb.result_entries.delete_many({"academic_year": YEAR, "level": LVL, "reg_no": {"$in": ["1001", "12345"]}})
    if CREATED_BATCHES:
        mdb.result_batches.delete_many({"_id": {"$in": [ObjectId(b) for b in CREATED_BATCHES]}})


# ---------- Permissions ----------
class TestPermissions:
    def test_view_only(self, admin):
        r = manual(admin, gpa="61", status="ناجح")
        assert r.status_code == 200
        bid = r.json()["batch_id"]
        eid = str(entry()["_id"])
        h = salim_with(["view_results"])
        assert requests.get(f"{API}/results/students", headers=h).status_code == 200
        c = requests.get(f"{API}/results/students/{STUDENT_DB}", headers=h)
        assert c.status_code == 200 and any(e["id"] == eid for e in c.json()["entries"])
        bl = requests.get(f"{API}/results/batches", headers=h)
        assert bl.status_code == 200 and any(b["id"] == bid for b in bl.json()["items"])
        assert do_import(h).status_code == 403
        assert manual(h, gpa="1").status_code == 403
        assert requests.delete(f"{API}/results/entries/{eid}", headers=h).status_code == 403
        assert requests.post(f"{API}/results/entries/{eid}/visibility", headers=h, json={"hidden": True}).status_code == 403
        assert requests.post(f"{API}/results/batches/{bid}/visibility", headers=h, json={"hidden": True}).status_code == 403
        assert requests.post(f"{API}/results/batches/{bid}/undo", headers=h).status_code == 403
        t = requests.get(f"{API}/results/template", headers=h, params={"academic_year": YEAR, "level": LVL, "semester": 1, "scope": "department", "scope_id": DEP})
        assert t.status_code == 403
        assert entry()["gpa"] == "61"
        # cleanup via undo
        assert requests.post(f"{API}/results/batches/{bid}/undo", headers=admin).json()["restored"] == 1
        assert entry() is None

    def test_manage_grades_only_denied(self):
        h = salim_with(["manage_grades"])
        for r in (requests.get(f"{API}/results/students", headers=h),
                  requests.get(f"{API}/results/students/{STUDENT_DB}", headers=h),
                  requests.get(f"{API}/results/batches", headers=h),
                  manual(h, gpa="1"), do_import(h)):
            assert r.status_code == 403, r.text

    def test_manage_results_grants_all(self):
        h = salim_with(["manage_results"])
        assert requests.get(f"{API}/results/students", headers=h).status_code == 200
        assert requests.get(f"{API}/results/batches", headers=h).status_code == 200
        me = requests.get(f"{API}/auth/me", headers=h).json()
        perms = me.get("permissions") or me.get("user", {}).get("permissions") or []
        print("auth/me has view_results:", "view_results" in perms, "manage_results:", "manage_results" in perms)
        t = requests.get(f"{API}/results/template", headers=h, params={"academic_year": YEAR, "level": LVL, "semester": 1, "scope": "department", "scope_id": DEP})
        assert t.status_code == 200
        r = do_import(h, gpa="77")
        assert r.status_code == 200, r.text
        bid = r.json()["batch_id"]
        eid = str(entry()["_id"])
        assert requests.post(f"{API}/results/entries/{eid}/visibility", headers=h, json={"hidden": True}).status_code == 200
        assert requests.post(f"{API}/results/entries/{eid}/visibility", headers=h, json={"hidden": False}).status_code == 200
        assert requests.post(f"{API}/results/batches/{bid}/visibility", headers=h, json={"hidden": True}).status_code == 200
        assert requests.post(f"{API}/results/batches/{bid}/visibility", headers=h, json={"hidden": False}).status_code == 200
        u = requests.post(f"{API}/results/batches/{bid}/undo", headers=h)
        assert u.status_code == 200 and u.json()["restored"] == 1
        assert entry() is None


# ---------- Hide ----------
class TestHide:
    def test_batch_hide_show(self, admin, student):
        r = do_import(admin, gpa="95")
        assert r.status_code == 200, r.text
        bid = r.json()["batch_id"]
        lv = my_level(student)
        assert lv and lv["first_semester"]["gpa"] == "95"
        h = requests.post(f"{API}/results/batches/{bid}/visibility", headers=admin, json={"hidden": True})
        assert h.status_code == 200 and h.json()["affected"] == 1
        assert my_level(student) is None
        b = [x for x in requests.get(f"{API}/results/batches", headers=admin).json()["items"] if x["id"] == bid][0]
        assert b["hidden"] is True
        card = requests.get(f"{API}/results/students/{STUDENT_DB}", headers=admin).json()
        e = [x for x in card["entries"] if x["level"] == LVL][0]
        assert e["hidden"] is True and e["hidden_by_batch"] is True
        s = requests.post(f"{API}/results/batches/{bid}/visibility", headers=admin, json={"hidden": False})
        assert s.status_code == 200
        assert my_level(student)["first_semester"]["gpa"] == "95"

    def test_entry_hide_show(self, admin, student):
        eid = str(entry()["_id"])
        r = requests.post(f"{API}/results/entries/{eid}/visibility", headers=admin, json={"hidden": True})
        assert r.status_code == 200 and r.json()["hidden"] is True
        assert my_level(student) is None
        card = requests.get(f"{API}/results/students/{STUDENT_DB}", headers=admin).json()
        e = [x for x in card["entries"] if x["id"] == eid][0]
        assert e["hidden"] is True and e["hidden_by_batch"] is False
        requests.post(f"{API}/results/entries/{eid}/visibility", headers=admin, json={"hidden": False})
        assert my_level(student)["first_semester"]["gpa"] == "95"

    def test_bad_ids(self, admin):
        assert requests.post(f"{API}/results/entries/badid/visibility", headers=admin, json={"hidden": True}).status_code == 404
        assert requests.post(f"{API}/results/batches/{ObjectId()}/visibility", headers=admin, json={"hidden": True}).status_code == 404
        assert requests.post(f"{API}/results/batches/{ObjectId()}/undo", headers=admin).status_code == 404


# ---------- Undo ----------
class TestUndo:
    def test_undo_import_new_and_twice(self, admin):
        mdb.result_entries.delete_many({"academic_year": YEAR, "level": LVL, "reg_no": "1001"})
        notif_before = mdb.notifications.count_documents({"user_id": STUDENT_UID})
        r = do_import(admin, gpa="95", sem=2)
        bid = r.json()["batch_id"]
        assert entry(2)["gpa"] == "95"
        u = requests.post(f"{API}/results/batches/{bid}/undo", headers=admin)
        assert u.status_code == 200 and u.json() == {**u.json(), "restored": 1, "skipped": 0}
        assert entry(2) is None
        assert requests.post(f"{API}/results/batches/{bid}/undo", headers=admin).status_code == 400
        assert requests.post(f"{API}/results/batches/{bid}/visibility", headers=admin, json={"hidden": True}).status_code == 400
        assert mdb.notifications.count_documents({"user_id": STUDENT_UID}) == notif_before

    def test_undo_import_changed_restores(self, admin):
        m = manual(admin, sem=2, status="راسب", gpa="40", grade="ضعيف")
        mid = m.json()["batch_id"]
        r = do_import(admin, gpa="88", sem=2)
        assert r.json()["counts"]["changed"] == 1
        bid = r.json()["batch_id"]
        u = requests.post(f"{API}/results/batches/{bid}/undo", headers=admin).json()
        assert u["restored"] == 1
        e = entry(2)
        assert (e["status"], e["gpa"], e["grade"], e["batch_id"]) == ("راسب", "40", "ضعيف", mid)
        requests.post(f"{API}/results/batches/{mid}/undo", headers=admin)
        assert entry(2) is None

    def test_undo_skips_later_modified(self, admin):
        r = do_import(admin, gpa="95", sem=2)
        bid = r.json()["batch_id"]
        m = manual(admin, sem=2, status="ناجح", gpa="80", grade="جيد")
        mid = m.json()["batch_id"]
        u = requests.post(f"{API}/results/batches/{bid}/undo", headers=admin).json()
        assert u["skipped"] == 1 and u["restored"] == 0
        assert entry(2)["gpa"] == "80"
        u2 = requests.post(f"{API}/results/batches/{mid}/undo", headers=admin).json()
        assert u2["restored"] == 1
        assert entry(2)["gpa"] == "95"  # back to state before manual edit

    def test_undo_manual_delete(self, admin):
        e = entry(2)
        eid = str(e["_id"])
        d = requests.delete(f"{API}/results/entries/{eid}", headers=admin)
        assert d.status_code == 200 and d.json().get("batch_id")
        CREATED_BATCHES.append(d.json()["batch_id"])
        assert entry(2) is None
        u = requests.post(f"{API}/results/batches/{d.json()['batch_id']}/undo", headers=admin).json()
        assert u["restored"] == 1
        e2 = entry(2)
        assert e2 and (e2["gpa"], e2["status"], e2["grade"]) == ("95", e["status"], e["grade"])

    def test_undo_manual_clear_all_fields_delete(self, admin):
        r = manual(admin, sem=2, status="", gpa="", grade="")
        assert r.status_code == 200 and r.json().get("batch_id")
        assert entry(2) is None
        requests.post(f"{API}/results/batches/{r.json()['batch_id']}/undo", headers=admin)
        assert entry(2)["gpa"] == "95"


# ---------- Dean scope ----------
class TestScope:
    def test_out_of_scope_batch(self, admin):
        r = manual(admin, sid=OTHER_DB, status="ناجح", gpa="70", grade="جيد")
        assert r.status_code == 200, r.text
        bid = r.json()["batch_id"]
        h = salim_with(["manage_results"])
        ids = [b["id"] for b in requests.get(f"{API}/results/batches", headers=h).json()["items"]]
        assert bid not in ids
        ids_admin = [b["id"] for b in requests.get(f"{API}/results/batches", headers=admin).json()["items"]]
        assert bid in ids_admin
        assert requests.post(f"{API}/results/batches/{bid}/visibility", headers=h, json={"hidden": True}).status_code == 403
        assert requests.post(f"{API}/results/batches/{bid}/undo", headers=h).status_code == 403
        eid = str(entry(1, "12345")["_id"])
        assert requests.post(f"{API}/results/entries/{eid}/visibility", headers=h, json={"hidden": True}).status_code == 403
        assert requests.post(f"{API}/results/batches/{bid}/undo", headers=admin).json()["restored"] == 1
        assert entry(1, "12345") is None
