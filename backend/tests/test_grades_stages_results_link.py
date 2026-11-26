# Grades import (stage sheets) → results link → student app /me/grades + strict dept isolation (iteration 207)
import os
import time
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for ln in open("/app/frontend/.env"):
        if ln.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = ln.split("=", 1)[1].strip().strip('"').rstrip("/")
API = f"{BASE_URL}/api"
FILE = "/app/backend/tests/sample_grades_L3S2.xls"
DEP_A = "698e500997fef774e66e93a8"   # الشريعة والقانون (faculty of Salim)
DEP_B = "698e501d97fef774e66e93a9"   # الدراسات الإسلامية (other faculty)
FAC_A = "698e4f9297fef774e66e93a4"
YEAR = "2098-2099"
SALIM_PERMS = ["manage_fee_receipts", "hr_manage_tasks", "hr_manage_appraisals"]

mdb = MongoClient("mongodb://localhost:27017")["test_database"]
STATE = {}


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    return d.get("access_token") or d.get("token")


def H(t):
    return {"Authorization": f"Bearer {t}"}


def upload(token, dep, commit="false", replace="false", notify="false", level=3, sem=2, year=YEAR, fac=FAC_A):
    with open(FILE, "rb") as f:
        return requests.post(f"{API}/grades/import", headers=H(token), timeout=120,
                             files={"file": ("sample_grades_L3S2.xls", f, "application/vnd.ms-excel")},
                             data={"faculty_id": fac, "department_id": dep, "level": str(level), "semester_no": str(sem),
                                   "academic_year": year, "batch_no": "28", "commit": commit, "replace": replace, "notify": notify})


@pytest.fixture(scope="module", autouse=True)
def setup_env():
    st = mdb.students.find_one({"student_id": "1001", "department_id": DEP_A})
    assert st
    STATE["sid"] = st["_id"]
    mdb.students.update_one({"_id": st["_id"]}, {"$set": {"student_id": "128002"}})
    sal = mdb.users.find_one({"username": "Salim"})
    STATE["salim_id"] = sal["_id"]
    mdb.users.update_one({"_id": sal["_id"]}, {"$set": {"custom_permissions": SALIM_PERMS + ["manage_grades"]}})
    STATE["admin"] = login("admin", "admin123")
    STATE["salim"] = login("Salim", "test1234")
    STATE["tmp_students"] = []
    yield
    # cleanup — always restore
    mdb.students.update_one({"_id": STATE["sid"]}, {"$set": {"student_id": "1001"}})
    mdb.users.update_one({"_id": STATE["salim_id"]}, {"$set": {"custom_permissions": SALIM_PERMS}})
    for x in STATE["tmp_students"]:
        mdb.students.delete_one({"_id": x})
    a = STATE["admin"]
    for b in STATE.get("batches", []):
        requests.post(f"{API}/results/batches/{b}/undo", headers=H(a), timeout=30)
    for i in STATE.get("imports", []):
        requests.delete(f"{API}/grades/imports/{i}", headers=H(a), timeout=30)


# --- preview ---
def test_preview_counts():
    r = upload(STATE["admin"], DEP_A)
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["students"]) == 33 and len(d["courses"]) == 9
    s = d["stats"]
    assert s["total"] == 33 and s["matched_by_reg"] == 1, s
    assert set(s) >= {"matched_by_reg", "matched_by_name", "unmatched"}
    assert "duplicate_regs" in d and "already_imported" in d and d["already_imported"] is False
    first = d["students"][0]
    assert first["reg_no"] == "128002" and first["match_type"] == "reg"
    assert first["sem_gpa"] == "4.31" and first["cum_gpa"] == "4.44" and first["sem_status"] == "ناجح"
    assert [g["letter"] for g in first["grades"]] == ["أ", "أ", "ب", "ج", "ب", "ج", "أ", "أ", "ب"]
    s306 = next(x for x in d["students"] if x["reg_no"] == "127306")
    stg = {g["course_name"]: g["stage"] for g in s306["grades"]}
    assert stg["القرآن الكريم -2"] == "second" and stg["أصول الفقه -5"] == "second"
    assert stg["فقه النكاح"] == "first"


def test_preview_other_department_no_cross_match():
    """admin previewing into DEP_B must not match student of DEP_A"""
    r = upload(STATE["admin"], DEP_B, fac="698e4fb497fef774e66e93a6")
    assert r.status_code == 200
    s = r.json()["stats"]
    assert s["matched_by_reg"] == 0, s


def test_name_match_unique_only():
    d0 = upload(STATE["admin"], DEP_A).json()
    target = d0["students"][1]
    assert target["match_type"] == "none"
    ins = mdb.students.insert_one({"student_id": "TEST_GR_1", "full_name": target["name"], "department_id": DEP_A, "level": 3})
    STATE["tmp_students"].append(ins.inserted_id)
    d1 = upload(STATE["admin"], DEP_A).json()
    assert d1["stats"]["matched_by_name"] == 1 and d1["students"][1]["match_type"] == "name"
    # same name in other dept doesn't break uniqueness in DEP_A
    ins_b = mdb.students.insert_one({"student_id": "TEST_GR_3", "full_name": target["name"], "department_id": DEP_B, "level": 3})
    STATE["tmp_students"].append(ins_b.inserted_id)
    assert upload(STATE["admin"], DEP_A).json()["stats"]["matched_by_name"] == 1
    ins2 = mdb.students.insert_one({"student_id": "TEST_GR_2", "full_name": target["name"], "department_id": DEP_A, "level": 3})
    STATE["tmp_students"].append(ins2.inserted_id)
    d2 = upload(STATE["admin"], DEP_A).json()
    assert d2["stats"]["matched_by_name"] == 0
    for x in STATE["tmp_students"]:
        mdb.students.delete_one({"_id": x})
    STATE["tmp_students"] = []


# --- commit + link ---
def test_commit_and_link():
    r = upload(STATE["admin"], DEP_A, commit="true", replace="true", notify="false")
    assert r.status_code == 200, r.text
    d = r.json()
    STATE.setdefault("imports", []).append(d["import_id"])
    assert d["linked"] == 1 and d["notified"] == 0 and d["results_batch_id"]
    STATE.setdefault("batches", []).append(d["results_batch_id"])
    rec = mdb.student_grades.find_one({"import_id": d["import_id"], "reg_no": "128002"})
    assert rec["sem_status"] == "ناجح" and rec["sem_gpa"] == "4.31" and rec["cum_gpa"] == "4.44"
    assert all("letter" in g and "stage" in g for g in rec["grades"])
    b = mdb.result_batches.find_one({"_id": ObjectId(d["results_batch_id"])})
    assert b["kind"] == "import" and b["file_name"].startswith("كشف درجات:")
    e = mdb.result_entries.find_one({"reg_no": "128002", "level": 3, "semester": 2, "academic_year": YEAR})
    assert e["status"] == "ناجح" and e["gpa"] == "4.31" and e["grade"] == "تراكمي 4.44"
    # appears in batches list (admin)
    items = requests.get(f"{API}/results/batches", headers=H(STATE["admin"]), timeout=30).json()["items"]
    assert any(i["id"] == d["results_batch_id"] for i in items)


def test_recommit_replace_notify_true():
    """replace again with notify=true: unchanged results → linked 0 (no duplicate notification)"""
    r = upload(STATE["admin"], DEP_A, commit="true", replace="true", notify="true")
    assert r.status_code == 200, r.text
    d = r.json()
    STATE["imports"].append(d["import_id"])
    if d.get("results_batch_id"):
        STATE["batches"].append(d["results_batch_id"])
    STATE["last_import"] = d["import_id"]
    print("recommit:", d.get("linked"), d.get("notified"), d.get("results_batch_id"))
    assert mdb.grade_imports.count_documents({"department_id": DEP_A, "level": 3, "semester_no": 2, "academic_year": YEAR}) == 1


def test_commit_without_replace_409():
    r = upload(STATE["admin"], DEP_A, commit="true", replace="false")
    assert r.status_code == 409


def test_student_me_grades_and_hide():
    tok = login("1001", "test1234")
    r = requests.get(f"{API}/students/me/grades", headers=H(tok), timeout=30)
    assert r.status_code == 200, r.text
    sems = r.json()["semesters"]
    s = next(x for x in sems if x["level"] == 3 and x["semester"] == 2)
    assert s["status"] == "ناجح" and s["gpa"] == "4.31" and s["cumulative_gpa"] == "4.44"
    assert len(s["courses"]) == 9
    c0 = s["courses"][0]
    assert set(c0) >= {"name", "credits", "total", "grade", "stage", "stage_label"}
    assert c0["grade"] == "أ" and c0["total"] == "100" and c0["stage_label"] == "دور أول"
    res = requests.get(f"{API}/students/me/results", headers=H(tok), timeout=30).json()
    l3 = next(x for x in res["levels"] if x["level"] == 3)
    assert l3["second_semester"]["grade"] == "تراكمي 4.44"
    bid = STATE["batches"][0]
    h = requests.post(f"{API}/results/batches/{bid}/visibility", headers=H(STATE["admin"]), json={"hidden": True}, timeout=30)
    assert h.status_code == 200
    sems2 = requests.get(f"{API}/students/me/grades", headers=H(tok), timeout=30).json()["semesters"]
    assert not any(x["level"] == 3 and x["semester"] == 2 for x in sems2)
    res2 = requests.get(f"{API}/students/me/results", headers=H(tok), timeout=30).json()
    l3b = next((x for x in res2["levels"] if x["level"] == 3), None)
    assert l3b is None or not any(l3b["second_semester"].values())
    requests.post(f"{API}/results/batches/{bid}/visibility", headers=H(STATE["admin"]), json={"hidden": False}, timeout=30)


# --- dean scope isolation ---
def test_dean_import_other_faculty_403():
    r = upload(STATE["salim"], DEP_B, fac="698e4fb497fef774e66e93a6")
    assert r.status_code == 403, r.text
    r2 = upload(STATE["salim"], DEP_B, commit="true", replace="true", fac="698e4fb497fef774e66e93a6")
    assert r2.status_code == 403


def test_dean_preview_own_dep_ok():
    r = upload(STATE["salim"], DEP_A)
    assert r.status_code == 200 and r.json()["stats"]["matched_by_reg"] == 1


def test_dean_preview_no_dep_scope():
    """preview without department → matching limited to dean's deps"""
    r = upload(STATE["salim"], "", fac="")
    assert r.status_code == 200, r.text


def test_dean_out_of_scope_import_blocked():
    # create an out-of-scope import directly as admin into DEP_B
    r = upload(STATE["admin"], DEP_B, commit="true", replace="true", fac="698e4fb497fef774e66e93a6")
    assert r.status_code == 200, r.text
    oid = r.json()["import_id"]
    STATE["imports"].append(oid)
    if r.json().get("results_batch_id"):
        STATE["batches"].append(r.json()["results_batch_id"])
    S = H(STATE["salim"])
    lst = requests.get(f"{API}/grades/imports", headers=S, timeout=30).json()
    assert all(i["department_id"] != DEP_B for i in lst) and any(i["id"] == STATE["last_import"] for i in lst)
    assert requests.get(f"{API}/grades/analysis/{oid}", headers=S, timeout=30).status_code == 403
    assert requests.get(f"{API}/grades/analysis/{oid}/export/excel", headers=S, timeout=30).status_code == 403
    assert requests.get(f"{API}/grades/analysis/{oid}/export/pdf", headers=S, timeout=30).status_code == 403
    srch = requests.get(f"{API}/grades/search", params={"q": "إسحاق"}, headers=S, timeout=30).json()
    recB = mdb.student_grades.find_one({"import_id": oid})
    assert all(x["reg_no"] != recB["reg_no"] or x.get("student_db_id") for x in srch)
    rec = requests.get(f"{API}/grades/record", params={"reg_no": recB["reg_no"]}, headers=S, timeout=30).json()
    assert all(x["id"] != str(recB["_id"]) for x in rec)
    u = requests.put(f"{API}/grades/records/{recB['_id']}", headers=S, json={"note": "TEST_hack"}, timeout=30)
    assert u.status_code == 403
    st = requests.post(f"{API}/grades/statement", headers=S, json={"record_ids": [str(recB["_id"])]}, timeout=60)
    assert st.status_code == 403
    dl = requests.delete(f"{API}/grades/imports/{oid}", headers=S, timeout=30)
    assert dl.status_code == 403
    assert mdb.grade_imports.find_one({"_id": ObjectId(oid)})
    cum = requests.get(f"{API}/grades/analysis-cumulative", headers=S, timeout=60)
    assert cum.status_code == 200
    # dean sees in-scope analysis
    assert requests.get(f"{API}/grades/analysis/{STATE['last_import']}", headers=S, timeout=60).status_code == 200


def test_invalid_ids_no_500():
    A = H(STATE["admin"])
    u = requests.put(f"{API}/grades/records/notanid", headers=A, json={"note": "x"}, timeout=30)
    s = requests.post(f"{API}/grades/statement", headers=A, json={"record_ids": ["notanid"]}, timeout=30)
    print("invalid id codes:", u.status_code, s.status_code)
    assert u.status_code < 500 and s.status_code < 500


def test_delete_import_orphans_results_batch():
    """After deleting grade import, check whether linked result entry remains (informational)"""
    iid = STATE["last_import"]
    r = requests.delete(f"{API}/grades/imports/{iid}", headers=H(STATE["admin"]), timeout=30)
    assert r.status_code == 200
    STATE["imports"].remove(iid)
    e = mdb.result_entries.find_one({"reg_no": "128002", "level": 3, "semester": 2, "academic_year": YEAR})
    print("result entry after grade import delete:", bool(e))
    assert e is None, "grade import deleted but its linked result entry still shown on Results page/app"
