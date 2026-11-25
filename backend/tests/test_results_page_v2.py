# Results page v2 (/api/results/*): list/card/manual entries/template/import preview+commit/scope isolation/student app contract
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
STUDENT_REG = "1001"
STUDENT_UID = "69a99544650b31fa86440da2"
DEP = "698e500997fef774e66e93a8"
FAC = "698e4f9297fef774e66e93a4"
OTHER_REG = "12345"
OTHER_DB = "698ef706d803b27aab012065"
OTHER_DEP = "698e501d97fef774e66e93a9"
YEAR = "2098-2099"  # test-only year (latest numerically)
SALIM_ORIG = ["manage_fee_receipts", "hr_manage_tasks", "hr_manage_appraisals"]


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin():
    return login("admin", "admin123")


@pytest.fixture(scope="module")
def dean():
    mdb.users.update_one({"username": "Salim"}, {"$set": {"custom_permissions": SALIM_ORIG + ["manage_grades"]}})
    try:
        yield login("Salim", "test1234")
    finally:
        mdb.users.update_one({"username": "Salim"}, {"$set": {"custom_permissions": SALIM_ORIG}})


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    before = {str(x["_id"]) for x in mdb.result_entries.find({}, {"_id": 1})}
    nb = {str(x["_id"]) for x in mdb.notifications.find({"user_id": STUDENT_UID, "type": "results"}, {"_id": 1})}
    yield
    created = [ObjectId(i) for i in {str(x["_id"]) for x in mdb.result_entries.find({"academic_year": YEAR}, {"_id": 1})} - before]
    if created:
        mdb.result_entries.delete_many({"_id": {"$in": created}})
    newn = [ObjectId(i) for i in {str(x["_id"]) for x in mdb.notifications.find({"user_id": STUDENT_UID, "type": "results"}, {"_id": 1})} - nb]
    if newn:
        mdb.notifications.delete_many({"_id": {"$in": newn}})


def xlsx(rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["رقم القيد", "الحالة", "المعدل", "التقدير"])
    for r in rows:
        ws.append(r)
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


def imp(h, rows, level=1, sem=1, scope="department", sid=DEP, commit=False, notify=True, year=YEAR):
    return requests.post(f"{API}/results/import", headers=h,
                         files={"file": ("t.xlsx", xlsx(rows), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                         data={"academic_year": year, "level": str(level), "semester": str(sem), "scope": scope,
                               "scope_id": sid, "commit": "true" if commit else "false", "notify": "true" if notify else "false"})


def year_entries():
    return list(mdb.result_entries.find({"reg_no": STUDENT_REG, "academic_year": YEAR}))


# ---- list
class TestList:
    def test_admin_list_shape(self, admin):
        r = requests.get(f"{API}/results/students", headers=admin, params={"department_id": DEP, "level": 1})
        assert r.status_code == 200
        d = r.json()
        assert {"total", "pages", "items"} <= set(d)
        assert len(d["items"]) <= 50
        assert all(i["level"] == 1 for i in d["items"])
        it = next(i for i in d["items"] if i["id"] == STUDENT_DB)
        assert set(it) >= {"id", "reg_no", "full_name", "department_name", "level", "released_count"}
        assert it["released_count"] >= 4

    def test_search_q(self, admin):
        r = requests.get(f"{API}/results/students", headers=admin, params={"q": STUDENT_REG})
        assert r.status_code == 200 and any(i["reg_no"] == STUDENT_REG for i in r.json()["items"])

    def test_year_filter_counts(self, admin):
        r = requests.get(f"{API}/results/students", headers=admin, params={"q": STUDENT_REG, "academic_year": YEAR})
        it = next(i for i in r.json()["items"] if i["reg_no"] == STUDENT_REG)
        assert it["released_count"] == 0

    def test_pagination(self, admin):
        d1 = requests.get(f"{API}/results/students", headers=admin, params={"page": 1}).json()
        if d1["pages"] > 1:
            d2 = requests.get(f"{API}/results/students", headers=admin, params={"page": 2}).json()
            assert not ({i["id"] for i in d1["items"]} & {i["id"] for i in d2["items"]})

    def test_dean_scope(self, dean):
        r = requests.get(f"{API}/results/students", headers=dean, params={"q": ""})
        assert r.status_code == 200
        deps = {x["department_id"] for x in mdb.students.find({"_id": {"$in": [ObjectId(i["id"]) for i in r.json()["items"]]}})}
        assert OTHER_DEP not in deps
        assert requests.get(f"{API}/results/students", headers=dean, params={"department_id": OTHER_DEP}).status_code == 403
        other_fac = mdb.departments.find_one({"_id": ObjectId(OTHER_DEP)})["faculty_id"]
        assert requests.get(f"{API}/results/students", headers=dean, params={"faculty_id": other_fac}).status_code == 403

    def test_no_permission(self):
        h = login("1001", "test1234")
        assert requests.get(f"{API}/results/students", headers=h).status_code == 403


# ---- card + manual entries
class TestCard:
    def test_card(self, admin):
        r = requests.get(f"{API}/results/students/{STUDENT_DB}", headers=admin)
        assert r.status_code == 200
        d = r.json()
        assert d["student"]["reg_no"] == STUDENT_REG and d["max_level"] >= 5
        assert any(e["academic_year"] is None for e in d["entries"])

    def test_card_scope(self, dean):
        assert requests.get(f"{API}/results/students/{OTHER_DB}", headers=dean).status_code == 403
        assert requests.get(f"{API}/results/students/{STUDENT_DB}", headers=dean).status_code == 200
        assert requests.get(f"{API}/results/students/badid", headers=dean).status_code == 404

    def test_manual_upsert_delete_and_student_latest(self, admin):
        p = {"student_id": STUDENT_DB, "level": 1, "semester": 1, "academic_year": YEAR, "status": "TEST_ناجح", "gpa": "91.50", "grade": "ممتاز"}
        r = requests.post(f"{API}/results/entries", headers=admin, json=p)
        assert r.status_code == 200, r.text
        p["gpa"] = "92.00"
        assert requests.post(f"{API}/results/entries", headers=admin, json=p).status_code == 200
        ents = [e for e in requests.get(f"{API}/results/students/{STUDENT_DB}", headers=admin).json()["entries"]
                if e["academic_year"] == YEAR and e["level"] == 1 and e["semester"] == 1]
        assert len(ents) == 1 and ents[0]["gpa"] == "92.00"
        # repeating: older years still kept
        card = requests.get(f"{API}/results/students/{STUDENT_DB}", headers=admin).json()
        assert len([e for e in card["entries"] if e["level"] == 1 and e["semester"] == 1]) >= 2
        # student app shows latest
        sh = login("1001", "test1234")
        sr = requests.get(f"{API}/students/me/results", headers=sh).json()
        l1 = next(l for l in sr["levels"] if l["level"] == 1)
        assert l1["first_semester"] == {"status": "TEST_ناجح", "gpa": "92.00", "grade": "ممتاز"}
        assert set(l1) == {"level", "first_semester", "second_semester"}
        # delete
        d = requests.delete(f"{API}/results/entries/{ents[0]['id']}", headers=admin)
        assert d.status_code == 200
        assert requests.delete(f"{API}/results/entries/{ents[0]['id']}", headers=admin).status_code == 404
        sr2 = requests.get(f"{API}/students/me/results", headers=sh).json()
        l1b = next(l for l in sr2["levels"] if l["level"] == 1)
        assert l1b["first_semester"]["status"] != "TEST_ناجح"

    def test_manual_validation(self, admin):
        r = requests.post(f"{API}/results/entries", headers=admin, json={"student_id": STUDENT_DB, "level": 1, "semester": 3, "academic_year": YEAR})
        assert r.status_code == 400
        r = requests.post(f"{API}/results/entries", headers=admin, json={"student_id": STUDENT_DB, "academic_year": YEAR})
        assert r.status_code == 400

    def test_dean_manual_scope(self, dean, admin):
        r = requests.post(f"{API}/results/entries", headers=dean, json={"student_id": OTHER_DB, "level": 1, "semester": 1, "academic_year": YEAR, "status": "x"})
        assert r.status_code == 403
        # out-of-scope delete: find any entry of other faculty student, or create one as admin
        requests.post(f"{API}/results/entries", headers=admin, json={"student_id": OTHER_DB, "level": 3, "semester": 2, "academic_year": YEAR, "status": "TEST_x"})
        e = mdb.result_entries.find_one({"reg_no": OTHER_REG, "academic_year": YEAR})
        assert e
        assert requests.delete(f"{API}/results/entries/{e['_id']}", headers=dean).status_code == 403
        assert requests.delete(f"{API}/results/entries/{e['_id']}", headers=admin).status_code == 200


# ---- template
class TestTemplate:
    def test_template(self, admin):
        r = requests.get(f"{API}/results/template", headers=admin, params={"academic_year": YEAR, "level": 1, "semester": 1, "scope": "department", "scope_id": DEP})
        assert r.status_code == 200
        ws = openpyxl.load_workbook(io.BytesIO(r.content)).active
        rows = list(ws.iter_rows(values_only=True))
        assert rows[0][:4] == ("رقم القيد", "الحالة", "المعدل", "التقدير")
        assert any(str(x[0]) == STUDENT_REG for x in rows[1:])

    def test_template_scope(self, dean):
        r = requests.get(f"{API}/results/template", headers=dean, params={"academic_year": YEAR, "level": 3, "semester": 1, "scope": "department", "scope_id": OTHER_DEP})
        assert r.status_code == 403
        r = requests.get(f"{API}/results/template", headers=dean, params={"academic_year": YEAR, "level": 1, "semester": 1, "scope": "faculty", "scope_id": FAC})
        assert r.status_code == 200


# ---- import
class TestImport:
    def test_preview_no_writes(self, admin):
        r = imp(admin, [[STUDENT_REG, "ناجح", 77.5, "جيد"], [OTHER_REG, "ناجح", "80", "جيد"], [STUDENT_REG, "ناجح", "78", "جيد جداً"], [None, "x", None, None]])
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["preview"] is True
        c = d["counts"]
        assert c["new"] == 1 and c["duplicate"] == 1 and c["out_of_scope"] == 1 and c["invalid"] == 1
        st = {x["row"]: x for x in d["rows"]}
        assert st[2]["status_code"] == "duplicate" and st[4]["status_code"] == "new" and st[4]["gpa"] == "78"
        assert "reason" in st[3] and "reason" in st[5]
        assert year_entries() == []

    def test_level_mismatch_warning(self, admin):
        d = imp(admin, [[STUDENT_REG, "ناجح", "70", "جيد"]], level=2).json()
        assert d["rows"][0].get("warning") and d["counts"]["warnings"] == 1

    def test_commit_flow_and_notify(self, admin):
        n0 = mdb.notifications.count_documents({"user_id": STUDENT_UID, "type": "results"})
        r = imp(admin, [[STUDENT_REG, "ناجح", "77.50", "جيد"]], level=2, sem=2, commit=True, notify=True)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["counts"]["new"] == 1 and d["notified"] == 1
        e = mdb.result_entries.find_one({"reg_no": STUDENT_REG, "academic_year": YEAR, "level": 2, "semester": 2})
        assert e and e["gpa"] == "77.50"
        import time; time.sleep(2)
        assert mdb.notifications.count_documents({"user_id": STUDENT_UID, "type": "results"}) == n0 + 1
        # unchanged -> nothing saved, no notify
        d2 = imp(admin, [[STUDENT_REG, "ناجح", "77.50", "جيد"]], level=2, sem=2, commit=True).json()
        assert d2["counts"]["unchanged"] == 1 and d2["notified"] == 0
        # changed
        p = imp(admin, [[STUDENT_REG, "ناجح", "80", "جيد جداً"]], level=2, sem=2).json()
        assert p["rows"][0]["status_code"] == "changed" and p["rows"][0]["old"]["gpa"] == "77.50"
        d3 = imp(admin, [[STUDENT_REG, "ناجح", "80", "جيد جداً"]], level=2, sem=2, commit=True, notify=False).json()
        assert d3["counts"]["changed"] == 1 and d3["notified"] == 0
        time.sleep(1)
        assert mdb.notifications.count_documents({"user_id": STUDENT_UID, "type": "results"}) == n0 + 1
        # legacy null-year L2S2 kept + student app shows latest year
        assert mdb.result_entries.find_one({"reg_no": STUDENT_REG, "academic_year": None, "level": 2, "semester": 2})
        sr = requests.get(f"{API}/students/me/results", headers=login("1001", "test1234")).json()
        l2 = next(l for l in sr["levels"] if l["level"] == 2)
        assert l2["second_semester"]["gpa"] == "80"

    def test_import_dean_scope(self, dean):
        r = imp(dean, [[OTHER_REG, "ناجح", "80", "جيد"]], level=3, scope="department", sid=OTHER_DEP)
        assert r.status_code == 403
        r = imp(dean, [[OTHER_REG, "ناجح", "80", "جيد"], [STUDENT_REG, "ناجح", "70", "جيد"]], level=1, scope="faculty", sid=FAC)
        assert r.status_code == 200
        rows = {x["reg_no"]: x["status_code"] for x in r.json()["rows"]}
        assert rows[OTHER_REG] == "out_of_scope" and rows[STUDENT_REG] == "new"

    def test_import_validation(self, admin):
        assert imp(admin, [[STUDENT_REG, "a", "1", "b"]], year="").status_code in (400, 422)
        assert imp(admin, [[STUDENT_REG, "a", "1", "b"]], sem=3).status_code == 400
        assert imp(admin, [["99999999", "a", "1", "b"]]).status_code == 400
        r = requests.post(f"{API}/results/import", headers=admin, files={"file": ("x.xlsx", b"garbage")},
                          data={"academic_year": YEAR, "level": "1", "semester": "1", "scope": "department", "scope_id": DEP})
        assert r.status_code == 400

    def test_old_endpoints_removed(self, admin):
        assert requests.get(f"{API}/student-results/template", headers=admin).status_code in (404, 405)
