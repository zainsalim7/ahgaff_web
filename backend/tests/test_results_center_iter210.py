# Results Center (/api/rc/*) regression: settings, marks, exams-before-lock, eligibility flip guard, rounds, decisions,
# Excel add-only import, RBAC/scope, publish→draft→publish. Self-seeding: creates its own courses + marks on MAIN_COURSE and cleans up.
import io
import os
import uuid
from datetime import datetime, timezone

import openpyxl
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
db = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "test_database")]

FAC = "698e4f9297fef774e66e93a4"
DEP = "698e500997fef774e66e93a8"
OTHER_COURSE = "6ac2c04cb031f88e942618de"  # كلية أخرى
MAIN_COURSE = "6a773c33d51592e96b39c174"
S = {  # S1 = student 1001
    "S1": "698e57518cfb2f14627a285e", "S2": "698e57518cfb2f14627a285f", "S3": "698e57518cfb2f14627a2860",
    "S4": "69b2f09d69f982071647f30e", "S5": "69b2f09d69f982071647f310", "S6": "69b2f09d69f982071647f312",
}
YEAR = "2099-2100"
ST = {}  # shared state


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def env():
    sem = f"TEST_RC_SEM_{uuid.uuid4().hex[:6]}"
    cA = db.courses.insert_one({"name": "TEST_RC_A", "code": "TRCA", "level": 1, "department_id": DEP, "faculty_id": FAC, "semester_id": sem}).inserted_id
    cB = db.courses.insert_one({"name": "TEST_RC_B", "code": "TRCB", "level": 1, "department_id": DEP, "semester_id": sem, "credit_hours": 2}).inserted_id
    A, B = str(cA), str(cB)
    enr = db.enrollments.insert_many([{"course_id": c, "student_id": s} for c in (A, B) for s in S.values()]).inserted_ids
    lecs = db.lectures.insert_many([{"course_id": A, "date": f"2026-10-{i+1:02d}", "start_time": "08:00", "end_time": "09:00", "status": "completed"} for i in range(10)]).inserted_ids
    att = []
    for i, lid in enumerate(lecs):
        for k, sid in S.items():
            st = "present"
            if k in ("S2", "S5") and i < 2:
                st = "absent"
            if k == "S3" and i < 2:
                st = "excused"
            if k == "S4" and i < 1:
                st = "absent"
            att.append({"course_id": A, "lecture_id": str(lid), "student_id": sid, "status": st})
    att_ids = db.attendance.insert_many(att).inserted_ids
    bds = db.faculty_board_decisions.insert_many([
        {"student_id": S["S5"], "scope": "course", "course_id": A, "decision": "exempted", "reason": "TEST_", "created_at": datetime.now(timezone.utc)},
        {"student_id": S["S6"], "scope": "course", "course_id": A, "decision": "deprived", "reason": "TEST_", "created_at": datetime.now(timezone.utc)},
    ]).inserted_ids
    had_settings = db.rc_settings.find_one({"faculty_id": FAC}) is not None
    t0 = datetime.now(timezone.utc)
    pre_marks = {m["_id"] for m in db.rc_marks.find({"course_id": MAIN_COURSE}, {"_id": 1})}
    had_sheet = db.rc_sheets.find_one({"course_id": MAIN_COURSE}) is not None
    salim = db.users.find_one({"username": "Salim"})
    salim_perms = list(salim.get("custom_permissions") or [])
    ST.update(A=A, B=B, sem=sem, imports=[], batches=[])
    yield ST
    # ---- cleanup (only what we created) ----
    db.users.update_one({"_id": salim["_id"]}, {"$set": {"custom_permissions": salim_perms}})
    bids = ST["batches"] + [str(b["_id"]) for b in db.result_batches.find({"grade_import_id": {"$in": ST["imports"]}}, {"_id": 1})]
    gis = ST["imports"] + [str(g["_id"]) for g in db.grade_imports.find({"source": "results_center", "academic_year": YEAR, "department_id": DEP}, {"_id": 1})]
    db.result_entries.delete_many({"batch_id": {"$in": bids}, "academic_year": YEAR})
    db.result_batches.delete_many({"_id": {"$in": [ObjectId(b) for b in set(bids)]}})
    db.student_grades.delete_many({"import_id": {"$in": gis}})
    db.grade_imports.delete_many({"_id": {"$in": [ObjectId(g) for g in set(gis)]}})
    db.courses.delete_many({"_id": {"$in": [cA, cB]}})
    db.enrollments.delete_many({"_id": {"$in": enr}})
    db.lectures.delete_many({"_id": {"$in": lecs}})
    db.attendance.delete_many({"_id": {"$in": att_ids}})
    db.faculty_board_decisions.delete_many({"_id": {"$in": bds}})
    for c in (A, B):
        db.rc_marks.delete_many({"course_id": c}); db.rc_sheets.delete_many({"course_id": c})
        db.rc_decisions.delete_many({"course_id": c}); db.rc_log.delete_many({"course_id": c})
    if not had_settings:
        db.rc_settings.delete_many({"faculty_id": FAC})
    # MAIN_COURSE: remove only the rc docs created during this run
    db.rc_marks.delete_many({"course_id": MAIN_COURSE, "_id": {"$nin": list(pre_marks)}})
    db.rc_log.delete_many({"course_id": MAIN_COURSE, "at": {"$gte": t0}})
    if not had_sheet:
        db.rc_sheets.delete_many({"course_id": MAIN_COURSE})


@pytest.fixture(scope="module")
def admin():
    return login("admin", "admin123")


M = {"M1": "69b2f09d69f982071647f320", "M2": "69b2f09d69f982071647f324", "M3": "69b2f09d69f982071647f31e",
     "M4": "69db65e84ddac901ce791506", "M5": "69b2f09d69f982071647f314", "M6": "69b2f09d69f982071647f316"}
MREG = {"M1": "129095", "M2": "129101", "M3": "129140", "M4": "99999", "M5": "129142", "M6": "129199"}


def marks(h, cid, field, items):
    ids = {**S, **M}
    r = requests.put(f"{API}/rc/courses/{cid}/marks", headers=h, json={"field": field, "marks": [{"student_db_id": ids[k], "value": v} for k, v in items]}, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def sheet(h, cid):
    r = requests.get(f"{API}/rc/courses/{cid}/sheet", headers=h, timeout=60)
    assert r.status_code == 200, r.text
    return {x["student_db_id"]: x for x in r.json()["rows"]}, r.json()


# ---------- settings ----------
def test_settings_get_and_put(env, admin):
    r = requests.get(f"{API}/rc/settings", params={"faculty_id": FAC}, headers=admin)
    assert r.status_code == 200 and r.json()["coursework_max"] == 40 and r.json()["final_max"] == 60
    body = {"faculty_id": FAC, "coursework_max": 40, "coursework_pass_pct": 40, "pass_mark": 50, "second_cap": 50, "exceptional_cap": 50}
    assert requests.put(f"{API}/rc/settings", headers=admin, json=body).status_code == 200
    assert marks(admin, MAIN_COURSE, "coursework", [("M1", 30)])["saved"] == 1  # self-seed
    r = requests.put(f"{API}/rc/settings", headers=admin, json={**body, "coursework_max": 30})
    assert r.status_code == 400, r.text  # marks exist on MAIN_COURSE
    assert requests.put(f"{API}/rc/settings", headers=admin, json={**body, "coursework_max": 120}).status_code == 400


def test_course_list_contains_test_course(env, admin):
    r = requests.get(f"{API}/rc/courses", params={"semester_id": env["sem"]}, headers=admin)
    ids = [c["id"] for c in r.json()["items"]]
    assert env["A"] in ids and env["B"] in ids
    r = requests.get(f"{API}/rc/courses", headers=admin)  # default active semester
    assert r.status_code == 200 and MAIN_COURSE in [c["id"] for c in r.json()["items"]]


# ---------- coursework + lock ----------
def test_coursework_validation_and_lock(env, admin):
    A = env["A"]
    r = marks(admin, A, "first_exam", [("S1", 30)])
    assert r["saved"] == 0 and "ارصد سعي" in r["errors"][0]["error"], r
    r = marks(admin, A, "coursework", [("S1", 41), ("S2", "غ"), ("S3", -1), ("S4", "abc")])
    assert r["saved"] == 0 and len(r["errors"]) == 4
    assert requests.post(f"{API}/rc/courses/{A}/lock", headers=admin, json={"locked": True}).status_code == 400
    r = marks(admin, A, "coursework", [("S1", "١٦"), ("S2", 30), ("S3", 30), ("S4", 30), ("S5", 30), ("S6", 30)])
    assert r["saved"] == 6, r
    # NEW RULE: exams allowed before lock once coursework is entered
    r = marks(admin, A, "first_exam", [("S1", 34), ("S2", 40)])  # S2 not eligible (absence)
    assert r["saved"] == 1 and "غير مؤهل" in r["errors"][0]["error"], r
    r = marks(admin, A, "second_exam", [("S2", 100)])  # absence-based not-eligible → second before lock
    assert r["saved"] == 1, r
    assert requests.post(f"{API}/rc/courses/{A}/lock", headers=admin, json={"locked": True}).status_code == 200
    r = marks(admin, A, "coursework", [("S1", 20)])
    assert r["saved"] == 0 and "مقفل" in r["errors"][0]["error"]


def test_eligibility(env, admin):
    rows, _ = sheet(admin, env["A"])
    e = {k: rows[v]["eligible"] for k, v in S.items()}
    assert e == {"S1": True, "S2": False, "S3": False, "S4": True, "S5": True, "S6": False}, e
    assert rows[S["S3"]]["att"]["exceeded_excused"] is True
    assert rows[S["S2"]]["att"]["exceeded_unexcused"] is True
    assert rows[S["S5"]]["att_status"] == "exempted" and rows[S["S6"]]["att_status"] == "deprived"
    assert rows[S["S1"]]["need_first"] == 34


# ---------- first / second / exceptional ----------
def test_first_round(env, admin):
    A = env["A"]
    r = marks(admin, A, "first_exam", [("S4", 61), ("S2", 40)])
    assert r["saved"] == 0 and len(r["errors"]) == 2
    r = marks(admin, A, "first_exam", [("S1", 34), ("S4", 10), ("S5", "غ")])
    assert r["saved"] == 2, r  # S1 already 34 (entered before lock)
    rows, _ = sheet(admin, A)
    assert rows[S["S1"]]["total1"] == 50 and rows[S["S1"]]["pass1"] is True and rows[S["S1"]]["letter"] == "مقبول"
    assert rows[S["S4"]]["pass1"] is False and rows[S["S4"]]["in_second"] is True
    assert rows[S["S5"]]["total1"] == 30 and rows[S["S5"]]["in_second"] is True


def test_second_round_cap_and_uncapped(env, admin):
    A = env["A"]
    # decision second_uncapped for S3
    assert requests.post(f"{API}/rc/courses/{A}/decisions", headers=admin, json={"kind": "second_uncapped", "student_db_id": S["S3"], "reason": ""}).status_code == 400
    r = requests.post(f"{API}/rc/courses/{A}/decisions", headers=admin, json={"kind": "second_uncapped", "student_db_id": S["S1"], "reason": "x"})
    assert r.status_code == 400  # S1 passed first
    assert requests.post(f"{API}/rc/courses/{A}/decisions", headers=admin, json={"kind": "second_uncapped", "student_db_id": S["S3"], "reason": "TEST_ عذر"}).status_code == 200
    r = marks(admin, A, "second_exam", [("S1", 70)])
    assert r["saved"] == 0
    r = marks(admin, A, "second_exam", [("S4", 100), ("S2", 100), ("S3", 90), ("S5", 20), ("S6", 10)])
    assert r["saved"] == 4, r  # S2 already 100
    rows, _ = sheet(admin, A)
    assert rows[S["S4"]]["final"] == 50 and rows[S["S4"]]["stage"] == "second"
    assert rows[S["S2"]]["final"] == 50
    assert rows[S["S3"]]["final"] == 90 and rows[S["S3"]]["letter"] == "ممتاز"
    assert rows[S["S5"]]["pass2"] is False and rows[S["S5"]]["result"] == "راسب"


def test_exceptional(env, admin):
    A = env["A"]
    r = marks(admin, A, "exceptional_exam", [("S5", 80)])
    assert r["saved"] == 0
    assert requests.post(f"{API}/rc/courses/{A}/decisions", headers=admin, json={"kind": "exceptional", "student_db_id": S["S4"], "reason": "x"}).status_code == 400
    assert requests.post(f"{API}/rc/courses/{A}/decisions", headers=admin, json={"kind": "exceptional", "student_db_id": S["S5"], "reason": "TEST_ تصفية", "capped": True}).status_code == 200
    assert requests.post(f"{API}/rc/courses/{A}/decisions", headers=admin, json={"kind": "exceptional", "student_db_id": S["S6"], "reason": "TEST_ تصفية", "capped": False}).status_code == 200
    r = marks(admin, A, "exceptional_exam", [("S5", 80), ("S6", 70)])
    assert r["saved"] == 2, r
    rows, _ = sheet(admin, A)
    assert rows[S["S5"]]["final"] == 50 and rows[S["S5"]]["stage"] == "tasfiya"
    assert rows[S["S6"]]["final"] == 70 and rows[S["S6"]]["letter"] == "جيد"
    r = requests.delete(f"{API}/rc/courses/{A}/decisions/{S['S5']}/exceptional", headers=admin)
    assert r.status_code == 400
    assert requests.delete(f"{API}/rc/courses/{A}/decisions/{S['S2']}/exceptional", headers=admin).status_code == 404


def test_board_sessions(env, admin):
    r = requests.get(f"{API}/rc/board-sessions", headers=admin)
    assert r.status_code == 200 and isinstance(r.json()["items"], list)


def test_unlock_relock_and_log(env, admin):
    A = env["A"]
    assert requests.post(f"{API}/rc/courses/{A}/lock", headers=admin, json={"locked": False}).status_code == 200
    assert marks(admin, A, "coursework", [("S1", 17)])["saved"] == 1
    assert marks(admin, A, "coursework", [("S1", 16)])["saved"] == 1
    assert requests.post(f"{API}/rc/courses/{A}/lock", headers=admin, json={"locked": True}).status_code == 200
    r = requests.get(f"{API}/rc/courses/{A}/log", headers=admin)
    fields = [x["field"] for x in r.json()["items"]]
    assert fields.count("lock") >= 3 and "decision" in fields and "exceptional_exam" in fields


# ---------- Excel ----------
def test_template_export_import(env, admin):
    A = env["A"]
    r = requests.get(f"{API}/rc/courses/{A}/template", params={"field": "second_exam"}, headers=admin)
    assert r.status_code == 200 and r.content[:2] == b"PK"
    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    regs = [str(x[0].value) for x in wb.active.iter_rows(min_row=2)]
    assert "1001" not in regs  # S1 passed first → not in second template
    r = requests.get(f"{API}/rc/courses/{A}/export", headers=admin)
    assert r.status_code == 200 and r.content[:2] == b"PK"
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["رقم القيد", "الدرجة"]); ws.append(["1002", 95]); ws.append(["1003", 90]); ws.append(["1001", 50]); ws.append(["999999", 10]); ws.append(["1002", 10])
    buf = io.BytesIO(); wb.save(buf)
    files = lambda: {"file": ("t.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    r = requests.post(f"{API}/rc/courses/{A}/import", headers=admin, files=files(), data={"field": "second_exam", "commit": "false"})
    assert r.status_code == 200, r.text
    c = r.json()["counts"]
    assert c == {"ok": 0, "unchanged": 1, "exists": 1, "rejected": 3}, r.json()  # S2 has 100 → exists (not overwritten)
    r = requests.post(f"{API}/rc/courses/{A}/import", headers=admin, files=files(), data={"field": "second_exam", "commit": "true"})
    assert r.status_code == 200 and r.json()["saved"] == 0 and r.json()["counts"]["exists"] == 1
    rows, _ = sheet(admin, A)
    assert rows[S["S2"]]["second_exam"] == 100 and rows[S["S2"]]["final"] == 50


# ---------- MAIN_COURSE (real course, self-seeded marks): exams before lock, flip guard, add-only import ----------
def _xl(rows):
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["رقم القيد", "الدرجة"])
    for r in rows:
        ws.append(list(r))
    buf = io.BytesIO(); wb.save(buf)
    return lambda: {"file": ("m.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}


def test_main_exams_before_lock(env, admin):
    _, d = sheet(admin, MAIN_COURSE)
    assert d["sheet"]["coursework_locked"] is False
    r = marks(admin, MAIN_COURSE, "first_exam", [("M3", 40)])  # no coursework yet
    assert r["saved"] == 0 and "ارصد سعي" in r["errors"][0]["error"], r
    r = marks(admin, MAIN_COURSE, "second_exam", [("M3", 40)])
    assert r["saved"] == 0 and "ارصد سعي" in r["errors"][0]["error"], r
    r = marks(admin, MAIN_COURSE, "coursework", [("M1", 30), ("M2", 10), ("M4", 30), ("M5", 30)])
    assert r["saved"] == 3, r  # M1 already 30 from settings test
    r = marks(admin, MAIN_COURSE, "first_exam", [("M1", 40), ("M2", 40)])
    assert r["saved"] == 1 and "غير مؤهل" in r["errors"][0]["error"], r
    r = marks(admin, MAIN_COURSE, "second_exam", [("M2", 60), ("M1", 60)])
    assert r["saved"] == 1 and "ليس من طلاب الدور الثاني" in r["errors"][0]["error"], r
    rows, d = sheet(admin, MAIN_COURSE)
    assert d["sheet"]["coursework_locked"] is False
    assert rows[M["M1"]]["total1"] == 70 and rows[M["M1"]]["stage"] == "first" and rows[M["M1"]]["letter"] == "جيد"
    assert rows[M["M2"]]["final2"] == 50 and rows[M["M2"]]["stage"] == "second"
    assert rows[M["M3"]]["first_exam"] is None and rows[M["M3"]]["eligibility"] == "بانتظار السعي"


def test_main_eligibility_flip_guard(env, admin):
    r = marks(admin, MAIN_COURSE, "coursework", [("M1", 10)])  # eligible→not, has first_exam
    assert r["saved"] == 0 and "يغيّر أهلية" in r["errors"][0]["error"], r
    r = marks(admin, MAIN_COURSE, "coursework", [("M2", 30)])  # not→eligible, has second_exam
    assert r["saved"] == 0 and "يغيّر أهلية" in r["errors"][0]["error"], r
    assert marks(admin, MAIN_COURSE, "coursework", [("M1", 20)])["saved"] == 1  # still eligible
    assert marks(admin, MAIN_COURSE, "coursework", [("M2", 12)])["saved"] == 1  # still not eligible
    r = marks(admin, MAIN_COURSE, "coursework", [("M1", "")])  # clearing coursework of exam-holder
    assert r["saved"] == 0, r
    rows, _ = sheet(admin, MAIN_COURSE)
    assert rows[M["M1"]]["coursework"] == 20 and rows[M["M1"]]["total1"] == 60
    assert rows[M["M2"]]["coursework"] == 12 and rows[M["M2"]]["second_exam"] == 60


def test_main_clear_coursework_with_second_exam_blocked(env, admin):
    # Clearing coursework of a not-eligible student with a second_exam mark would orphan the second mark
    r = marks(admin, MAIN_COURSE, "coursework", [("M2", "")])
    rows, _ = sheet(admin, MAIN_COURSE)
    if r["saved"]:
        marks(admin, MAIN_COURSE, "coursework", [("M2", 12)])  # restore
    assert r["saved"] == 0, f"coursework cleared while second_exam exists → in_second False, orphan mark: {rows[M['M2']]['result']}"


def test_main_import_add_only(env, admin):
    f = _xl([(MREG["M1"], 55), (MREG["M4"], 45), (MREG["M5"], None), (MREG["M3"], 30), (MREG["M2"], 30)])
    r = requests.post(f"{API}/rc/courses/{MAIN_COURSE}/import", headers=admin, files=f(), data={"field": "first_exam", "commit": "false"})
    assert r.status_code == 200, r.text
    st = {x["reg_no"]: x["status"] for x in r.json()["rows"]}
    assert st[MREG["M1"]] == "exists" and st[MREG["M4"]] == "ok" and st[MREG["M3"]] == "rejected" and st[MREG["M2"]] == "rejected", st
    assert r.json()["counts"]["exists"] == 1 and r.json()["counts"]["ok"] == 1
    r = requests.post(f"{API}/rc/courses/{MAIN_COURSE}/import", headers=admin, files=f(), data={"field": "first_exam", "commit": "true"})
    assert r.status_code == 200 and r.json()["saved"] == 1 and r.json()["counts"]["exists"] == 1, r.json()
    rows, _ = sheet(admin, MAIN_COURSE)
    assert rows[M["M1"]]["first_exam"] == 40 and rows[M["M4"]]["first_exam"] == 45 and rows[M["M5"]]["first_exam"] is None
    # empty cell for a student with a mark never wipes it
    f2 = _xl([(MREG["M1"], None), (MREG["M4"], "")])
    r = requests.post(f"{API}/rc/courses/{MAIN_COURSE}/import", headers=admin, files=f2(), data={"field": "first_exam", "commit": "true"})
    assert r.status_code == 200 and r.json()["saved"] == 0, r.json()
    rows, _ = sheet(admin, MAIN_COURSE)
    assert rows[M["M1"]]["first_exam"] == 40 and rows[M["M4"]]["first_exam"] == 45
    # coursework import also add-only
    f3 = _xl([(MREG["M1"], 35), (MREG["M6"], 25)])
    r = requests.post(f"{API}/rc/courses/{MAIN_COURSE}/import", headers=admin, files=f3(), data={"field": "coursework", "commit": "true"})
    assert r.status_code == 200 and r.json()["saved"] == 1 and r.json()["counts"]["exists"] == 1, r.json()
    rows, _ = sheet(admin, MAIN_COURSE)
    assert rows[M["M1"]]["coursework"] == 20 and rows[M["M6"]]["coursework"] == 25
    # manual edit still changes an existing exam mark
    assert marks(admin, MAIN_COURSE, "first_exam", [("M1", 41)])["saved"] == 1


def test_main_lock_and_publish_require_lock(env, admin):
    r = requests.post(f"{API}/rc/courses/{MAIN_COURSE}/lock", headers=admin, json={"locked": True})
    assert r.status_code == 400 and "بلا درجة سعي" in r.json()["detail"]
    _, d = sheet(admin, MAIN_COURSE)
    assert d["sheet"]["coursework_locked"] is False  # guard: never publish real data
    co = db.courses.find_one({"_id": ObjectId(MAIN_COURSE)})
    body = {"department_id": DEP, "level": co["level"], "semester_id": co["semester_id"], "semester_no": 1, "academic_year": YEAR, "notify": False}
    r = requests.post(f"{API}/rc/publish", headers=admin, json=body)
    assert r.status_code == 400 and "أقفل السعي أولاً" in r.json()["detail"], r.text


# ---------- RBAC / scope ----------
def test_rbac_scope(env, admin):
    sal = db.users.find_one({"username": "Salim"})
    base = list(sal.get("custom_permissions") or [])
    h = login("Salim", "test1234")
    assert requests.get(f"{API}/rc/courses", headers=h).status_code == 403
    assert requests.get(f"{API}/rc/courses/{env['A']}/sheet", headers=h).status_code == 403
    db.users.update_one({"_id": sal["_id"]}, {"$set": {"custom_permissions": base + ["rc_view", "rc_enter_coursework", "rc_enter_exams"]}})
    h = login("Salim", "test1234")
    r = requests.get(f"{API}/rc/courses", headers=h)
    assert r.status_code == 200
    deps = {c["department_id"] for c in r.json()["items"]}
    fac_deps = {str(d["_id"]) for d in db.departments.find({"faculty_id": FAC})}
    assert deps <= fac_deps, deps - fac_deps
    assert requests.get(f"{API}/rc/courses/{OTHER_COURSE}/sheet", headers=h).status_code == 403
    assert requests.put(f"{API}/rc/courses/{OTHER_COURSE}/marks", headers=h, json={"field": "coursework", "marks": []}).status_code == 403
    assert requests.get(f"{API}/rc/courses/{env['A']}/sheet", headers=h).status_code == 200
    assert requests.post(f"{API}/rc/courses/{env['A']}/lock", headers=h, json={"locked": False}).status_code == 403
    assert requests.post(f"{API}/rc/publish", headers=h, json={}).status_code == 403
    db.users.update_one({"_id": sal["_id"]}, {"$set": {"custom_permissions": base + ["rc_view"]}})
    h = login("Salim", "test1234")
    assert requests.get(f"{API}/rc/courses/{env['A']}/sheet", headers=h).status_code == 200
    assert requests.put(f"{API}/rc/courses/{env['A']}/marks", headers=h, json={"field": "coursework", "marks": []}).status_code == 403
    assert requests.put(f"{API}/rc/settings", headers=h, json={"faculty_id": FAC}).status_code == 403
    db.users.update_one({"_id": sal["_id"]}, {"$set": {"custom_permissions": base}})


# ---------- publish ----------
def _my(st):
    g = requests.get(f"{API}/students/me/grades", headers=st).json()
    r = requests.get(f"{API}/students/me/results", headers=st).json()
    return g, r


def _has_test_course(g):
    return any(c["name"] == "TEST_RC_A" for s in g["semesters"] for c in s["courses"])


def test_partial_publish(env, admin):
    A, sem = env["A"], env["sem"]
    body = {"department_id": DEP, "level": 1, "semester_id": sem, "semester_no": 1, "academic_year": YEAR, "notify": False, "course_ids": [A]}
    r = requests.post(f"{API}/rc/publish", headers=admin, json=body)
    assert r.status_code == 200, r.text
    d = r.json(); env["imports"].append(d["import_id"]); env["batches"].append(d.get("results_batch_id"))
    assert d["partial"] is True and d["courses"] == 1
    sg = db.student_grades.find_one({"import_id": d["import_id"], "student_db_id": S["S1"]})
    gB = next(g for g in sg["grades"] if g["course_name"] == "TEST_RC_B")
    assert gB["letter"] == "لم تصدر بعد" and gB["total"] == ""
    assert sg["sem_gpa"] in (None, "") and sg["sem_status"].startswith("نتائج جزئية")
    pv = requests.get(f"{API}/rc/publish/preview", headers=admin, params={"department_id": DEP, "level": 1, "semester_id": sem}).json()
    assert next(c for c in pv["courses"] if c["id"] == A)["approved"] is True
    assert requests.post(f"{API}/results/batches/{d['results_batch_id']}/undo", headers=admin).status_code == 200
    pv = requests.get(f"{API}/rc/publish/preview", headers=admin, params={"department_id": DEP, "level": 1, "semester_id": sem}).json()
    assert next(c for c in pv["courses"] if c["id"] == A)["approved"] is False


def test_publish_flow(env, admin):
    A, B, sem = env["A"], env["B"], env["sem"]
    body = {"department_id": DEP, "level": 1, "semester_id": sem, "semester_no": 1, "academic_year": YEAR, "notify": False}
    r = requests.post(f"{API}/rc/publish", headers=admin, json=body)
    assert r.status_code == 400 and "TEST_RC_B" in r.json()["detail"]
    marks(admin, B, "coursework", [(k, 30) for k in S])
    assert requests.post(f"{API}/rc/courses/{B}/lock", headers=admin, json={"locked": True}).status_code == 200
    marks(admin, B, "first_exam", [(k, 40) for k in S])
    r = requests.get(f"{API}/rc/publish/preview", headers=admin, params={"department_id": DEP, "level": 1, "semester_id": sem})
    assert r.status_code == 200 and len(r.json()["courses"]) == 2 and all(c["locked"] for c in r.json()["courses"])
    r = requests.post(f"{API}/rc/publish", headers=admin, json=body)
    assert r.status_code == 200, r.text
    d = r.json(); env["imports"].append(d["import_id"]); env["batches"].append(d.get("results_batch_id"))
    assert d["students"] == 6 and d["courses"] == 2 and d.get("results_batch_id"), d
    sg = db.student_grades.find_one({"import_id": d["import_id"], "student_db_id": S["S1"]})
    gA = next(g for g in sg["grades"] if g["course_name"] == "TEST_RC_A")
    assert gA["total"] == "50" and gA["stage"] == "first"
    sg6 = db.student_grades.find_one({"import_id": d["import_id"], "student_db_id": S["S6"]})
    assert next(g for g in sg6["grades"] if g["course_name"] == "TEST_RC_A")["stage"] == "tasfiya"
    st = login("1001", "test1234")
    g, res = _my(st)
    assert not _has_test_course(g), "draft visible in /me/grades"
    assert YEAR not in str(res), "draft visible in /me/results"
    r = requests.post(f"{API}/results/batches/{d['results_batch_id']}/publish", headers=admin)
    assert r.status_code == 200, r.text
    g, res = _my(st)
    assert _has_test_course(g), g
    # republish → new draft; old remains visible
    marks(admin, B, "first_exam", [("S1", 45)])
    r = requests.post(f"{API}/rc/publish", headers=admin, json=body)
    assert r.status_code == 200
    d2 = r.json(); env["imports"].append(d2["import_id"]); env["batches"].append(d2.get("results_batch_id"))
    g, _ = _my(st)
    sem_rows = [s for s in g["semesters"] if any(c["name"] == "TEST_RC_A" for c in s["courses"])]
    assert sem_rows and next(c for c in sem_rows[0]["courses"] if c["name"] == "TEST_RC_B")["total"] == "70", sem_rows
    r = requests.post(f"{API}/results/batches/{d2['results_batch_id']}/undo", headers=admin)
    assert r.status_code == 200, r.text
    assert db.grade_imports.find_one({"_id": ObjectId(d2["import_id"])}) is None
    assert db.student_grades.count_documents({"import_id": d2["import_id"]}) == 0
    assert db.grade_imports.find_one({"_id": ObjectId(d["import_id"])}) is not None
    g, _ = _my(st)
    assert _has_test_course(g)


def test_republish_then_publish_drops_superseded(env, admin):
    body = {"department_id": DEP, "level": 1, "semester_id": env["sem"], "semester_no": 1, "academic_year": YEAR, "notify": False}
    r = requests.post(f"{API}/rc/publish", headers=admin, json=body)
    assert r.status_code == 200
    d3 = r.json(); env["imports"].append(d3["import_id"]); env["batches"].append(d3.get("results_batch_id"))
    assert requests.post(f"{API}/results/batches/{d3['results_batch_id']}/publish", headers=admin).status_code == 200
    old = env["imports"][0]
    assert db.grade_imports.find_one({"_id": ObjectId(old)}) is None, "superseded rc import not dropped"
    st = login("1001", "test1234")
    g, _ = _my(st)
    sem_rows = [s for s in g["semesters"] if any(c["name"] == "TEST_RC_A" for c in s["courses"])]
    assert len(sem_rows) == 1


# ---------- absence settings ----------
def test_faculty_settings_excused(admin):
    # NOTE: no GET /faculties/{id}/settings route exists (405) — settings are read via GET /faculties/{id}
    r = requests.get(f"{API}/faculties/{FAC}", headers=admin)
    assert r.status_code == 200 and r.json().get("max_excused_percent") == 15.9, r.json()
    r = requests.put(f"{API}/faculties/{FAC}/settings", headers=admin, json={"max_excused_percent": 15.9})
    assert r.status_code == 200, r.text
    assert db.faculties.find_one({"_id": ObjectId(FAC)})["max_excused_percent"] == 15.9


def test_classify_unit():
    import sys
    sys.path.insert(0, "/app/backend/backend"); sys.path.insert(0, "/app/backend")
    from services.absence_engine import classify
    L = {"unexcused_limit": 10.9, "excused_limit": 15.9, "total_limit": 25.9}
    assert classify(10.9, 0, 100, 10, L)["status"] != "candidate"
    assert classify(11, 0, 100, 10, L)["exceeded_unexcused"]
    assert not classify(0, 15.9, 100, 10, L)["exceeded_excused"]
    assert classify(0, 16, 100, 10, L)["exceeded_excused"]
    assert classify(10, 15.9, 100, 10, L)["exceeded_total"]  # 25.9 >= 25.9
    assert not classify(10, 15.8, 100, 10, L)["exceeded_total"]
