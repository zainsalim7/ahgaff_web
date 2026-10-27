# Unit isolation (عزل الوحدات الإدارية) via hr_scope: letters / fee stats / management dashboard / activity logs
# Verifies custom-role users are isolated per faculty, while academic roles (dean/department_head/admin) are unchanged.
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId


def _env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env("/app/frontend/.env", "REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
MDB = MongoClient(_env("/app/backend/.env", "MONGO_URL"))[_env("/app/backend/.env", "DB_NAME")]

GIRLS_UNIT, SHARIA_UNIT = "6ab3ec870186d4c5e32749a6", "6ab3ec870186d4c5e32749a5"
GIRLS_FAC, SHARIA_FAC = "698e4fb497fef774e66e93a6", "698e4f9297fef774e66e93a4"
GIRLS_DEPT = "698e501d97fef774e66e93a9"
SUFFIX = uuid.uuid4().hex[:6]


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    return d["access_token"], d["user"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


def snapshot(tok):
    """Fingerprint of letters/fees/dashboard visible to a user"""
    letters = requests.get(f"{API}/letters?limit=5000", headers=H(tok), timeout=60)
    fees = requests.get(f"{API}/fees/stats", headers=H(tok), timeout=60)
    dash = requests.get(f"{API}/dashboard/management", headers=H(tok), timeout=90)
    out = {"letters_status": letters.status_code, "fees_status": fees.status_code, "dash_status": dash.status_code}
    if letters.status_code == 200:
        out["letter_ids"] = {l["id"] for l in letters.json()}
    if fees.status_code == 200:
        f = fees.json()
        out["fees_total"] = f["total_students"]
        out["fees_depts"] = sorted(d["id"] for d in f["departments"])
    if dash.status_code == 200:
        d = dash.json()
        out["dash_label"] = d["scope"]["label"]
        out["dash_depts"] = sorted(x["id"] for x in d["scope"]["departments"])
        out["dash_numbers"] = d.get("numbers")
    return out


@pytest.fixture(scope="module")
def ctx():
    admin_tok, _ = login("admin", "admin123")
    salim_tok, salim = login("Salim", "test1234")
    saeed_tok, saeed = login("Saeed", "test1234")
    c = {"admin": admin_tok, "salim": salim_tok, "salim_user": salim, "saeed": saeed_tok, "saeed_user": saeed,
         "users": [], "letters": [], "series_snap": {}}
    # baseline BEFORE creating anything
    c["salim_before"] = snapshot(salim_tok)
    c["saeed_before"] = snapshot(saeed_tok)
    c["series_snap"] = {str(s["_id"]): (s.get("counters") or {}, s.get("seq")) for s in MDB.letter_series.find({}, {"counters": 1, "seq": 1})}
    # create temp custom users
    specs = [
        ("u1", GIRLS_UNIT, ["issue_letters", "hr_manage_employees", "manage_fee_receipts", "view_activity_logs"]),
        ("u2", SHARIA_UNIT, ["issue_letters", "hr_manage_employees"]),
    ]
    for key, unit, perms in specs:
        uname = f"TEST_iso_{key}_{SUFFIX}"
        r = requests.post(f"{API}/users", headers=H(admin_tok), json={
            "username": uname, "password": "test1234", "full_name": f"TEST عزل {key}", "role": "custom", "permissions": perms}, timeout=30)
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        c["users"].append(uid)
        r = requests.put(f"{API}/hr/users/{uid}/scope", headers=H(admin_tok), json={"hr_scope": "UNITS", "hr_scope_unit_ids": [unit]}, timeout=30)
        assert r.status_code == 200, r.text
        tok, u = login(uname, "test1234")
        assert u["role"] == "custom"
        c[key], c[key + "_id"] = tok, uid
    yield c
    # ---- cleanup ----
    for lid in c["letters"]:
        MDB.letters.delete_one({"_id": ObjectId(lid)})
    for sid, (counters, seq) in c["series_snap"].items():
        MDB.letter_series.update_one({"_id": ObjectId(sid)}, {"$set": {"counters": counters, **({"seq": seq} if seq is not None else {})}})
    for uid in c["users"]:
        requests.delete(f"{API}/users/{uid}", headers=H(admin_tok), timeout=30)
        MDB.users.delete_one({"_id": ObjectId(uid)})
        MDB.activity_logs.delete_many({"user_id": uid})
        MDB.user_permissions.delete_many({"user_id": uid})


# ---------- Scope wiring ----------
def test_scope_effective(ctx):
    for key, unit in (("u1", GIRLS_UNIT), ("u2", SHARIA_UNIT)):
        r = requests.get(f"{API}/hr/users/{ctx[key + '_id']}/scope", headers=H(ctx["admin"]))
        assert r.status_code == 200
        d = r.json()
        assert d["hr_scope"] == "UNITS" and d["hr_scope_unit_ids"] == [unit]
        assert d["effective"]["scope"] == "UNIT"


# ---------- Letters isolation ----------
def test_general_letter_isolation(ctx):
    r = requests.post(f"{API}/letters/issue", headers=H(ctx["u1"]), json={
        "subject": f"TEST_ISO خطاب عام {SUFFIX}", "body": "نص اختبار عزل الوحدات", "recipient": {"name": "TEST جهة خارجية"}, "people": []}, timeout=60)
    assert r.status_code == 200, r.text
    lid = r.json()["id"]
    ctx["letters"].append(lid)
    ctx["iso_letter"] = lid
    doc = MDB.letters.find_one({"_id": ObjectId(lid)})
    assert doc["created_by_faculty_ids"] == [GIRLS_FAC]

    # u1 sees it (list + detail)
    ids = {l["id"] for l in requests.get(f"{API}/letters?limit=5000", headers=H(ctx["u1"])).json()}
    assert lid in ids
    assert requests.get(f"{API}/letters/{lid}", headers=H(ctx["u1"])).status_code == 200
    # u2 (Sharia scope) does NOT see it
    ids2 = {l["id"] for l in requests.get(f"{API}/letters?limit=5000", headers=H(ctx["u2"])).json()}
    assert lid not in ids2
    assert requests.get(f"{API}/letters/{lid}", headers=H(ctx["u2"])).status_code == 403
    # Salim (dean, academic) still sees it
    ids_s = {l["id"] for l in requests.get(f"{API}/letters?limit=5000", headers=H(ctx["salim"])).json()}
    assert lid in ids_s
    assert requests.get(f"{API}/letters/{lid}", headers=H(ctx["salim"])).status_code == 200
    # admin sees it
    assert requests.get(f"{API}/letters/{lid}", headers=H(ctx["admin"])).status_code == 200


def test_u2_sees_unstamped_legacy_general_letters(ctx):
    """Legacy general letters (no created_by_faculty_ids) remain visible to restricted users"""
    legacy = MDB.letters.count_documents({"$or": [{"people": {"$size": 0}}, {"people": {"$exists": False}}],
                                          "created_by_faculty_ids": {"$exists": False}})
    ids2 = requests.get(f"{API}/letters?limit=5000", headers=H(ctx["u2"])).json()
    assert len(ids2) >= min(legacy, 5000)


def test_u2_cannot_revoke_isolated_letter(ctx):
    lid = ctx.get("iso_letter")
    assert lid
    r = requests.post(f"{API}/letters/{lid}/revoke", headers=H(ctx["u2"]))
    assert r.status_code == 403


def test_draft_stamped_and_isolated(ctx):
    r = requests.post(f"{API}/letters/draft", headers=H(ctx["u1"]), json={
        "subject": f"TEST_ISO مسودة {SUFFIX}", "body": "مسودة", "recipient": {"name": "TEST جهة"}, "people": []}, timeout=60)
    assert r.status_code == 200, r.text
    did = r.json()["id"]
    ctx["letters"].append(did)
    assert MDB.letters.find_one({"_id": ObjectId(did)})["created_by_faculty_ids"] == [GIRLS_FAC]
    assert requests.get(f"{API}/letters/{did}", headers=H(ctx["u2"])).status_code == 403


# ---------- Fee stats isolation ----------
def test_fee_stats_u1_girls_only(ctx):
    r = requests.get(f"{API}/fees/stats", headers=H(ctx["u1"]), timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    expected = MDB.students.count_documents({"department_id": GIRLS_DEPT, "is_active": True})
    total_all = MDB.students.count_documents({"is_active": True})
    print("u1 fees total:", d["total_students"], "expected:", expected, "university:", total_all)
    assert d["total_students"] == expected == 72
    assert [x["id"] for x in d["departments"]] == [GIRLS_DEPT]


def test_fee_unpaid_students_u1_girls_only(ctx):
    r = requests.get(f"{API}/fees/unpaid-students?type_id=other", headers=H(ctx["u1"]), timeout=60)
    assert r.status_code == 200, r.text
    rows = r.json()["students"]
    assert len(rows) == 72
    # every student returned must be in girls dept
    for s in rows:
        sid = s.get("id") or s.get("student_id")
        st = MDB.students.find_one({"_id": ObjectId(sid)}, {"department_id": 1})
        assert st and st.get("department_id") == GIRLS_DEPT


def test_fee_stats_admin_unchanged(ctx):
    d = requests.get(f"{API}/fees/stats", headers=H(ctx["admin"])).json()
    assert d["total_students"] == MDB.students.count_documents({"is_active": True})


# ---------- Dashboard isolation ----------
def test_dashboard_u1_girls_only(ctx):
    r = requests.get(f"{API}/dashboard/management", headers=H(ctx["u1"]), timeout=90)
    assert r.status_code == 200, r.text
    sc = r.json()["scope"]
    assert [x["id"] for x in sc["departments"]] == [GIRLS_DEPT]
    assert [f["id"] for f in sc["faculties"]] == [GIRLS_FAC]
    # cross-scope filter must be rejected
    r2 = requests.get(f"{API}/dashboard/management?faculty_id={SHARIA_FAC}", headers=H(ctx["u1"]), timeout=90)
    assert r2.status_code == 403


def test_dashboard_u2_sharia_only(ctx):
    r = requests.get(f"{API}/dashboard/management", headers=H(ctx["u2"]), timeout=90)
    assert r.status_code == 200, r.text
    sc = r.json()["scope"]
    assert {x["faculty_id"] for x in sc["departments"]} == {SHARIA_FAC}


# ---------- Activity logs isolation ----------
def test_activity_logs_u1_girls_only(ctx):
    r = requests.get(f"{API}/activity-logs?limit=200", headers=H(ctx["u1"]), timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    logs = d.get("logs") or d.get("items") or []
    expected = MDB.activity_logs.count_documents({"faculty_id": {"$in": [GIRLS_FAC]}})
    print("u1 logs total:", d.get("total"), "expected:", expected)
    assert d.get("total") == expected
    for l in logs:
        assert l.get("faculty_id") == GIRLS_FAC


def test_activity_logs_u1_cannot_override_faculty(ctx):
    d = requests.get(f"{API}/activity-logs?limit=50&faculty_id={SHARIA_FAC}", headers=H(ctx["u1"])).json()
    for l in d.get("logs") or []:
        assert l.get("faculty_id") == GIRLS_FAC


def test_activity_logs_admin_dean_head_unchanged(ctx):
    a = requests.get(f"{API}/activity-logs?limit=5", headers=H(ctx["admin"])).json()
    assert a["total"] == pytest.approx(MDB.activity_logs.count_documents({}), abs=20)
    s = requests.get(f"{API}/activity-logs?limit=100", headers=H(ctx["salim"])).json()
    assert all(l.get("faculty_id") == ctx["salim_user"]["faculty_id"] for l in s["logs"])
    assert s["total"] == pytest.approx(MDB.activity_logs.count_documents({"faculty_id": ctx["salim_user"]["faculty_id"]}), abs=5)
    h = requests.get(f"{API}/activity-logs?limit=100", headers=H(ctx["saeed"]))
    if h.status_code == 200:
        dep = ctx["saeed_user"].get("department_id")
        assert all(l.get("department_id") == dep for l in h.json()["logs"])


# ---------- Academic roles regression ----------
def test_salim_unchanged(ctx):
    now = snapshot(ctx["salim"])
    before = ctx["salim_before"]
    assert now["fees_total"] == before["fees_total"] == 20
    assert now["fees_depts"] == before["fees_depts"]
    assert now["dash_label"] == before["dash_label"] and now["dash_depts"] == before["dash_depts"]
    assert now["dash_numbers"] == before["dash_numbers"]
    # only difference allowed: the newly issued test general letter
    assert now["letter_ids"] - before["letter_ids"] <= set(ctx["letters"])
    assert before["letter_ids"] - now["letter_ids"] == set()


def test_saeed_unchanged(ctx):
    now = snapshot(ctx["saeed"])
    before = ctx["saeed_before"]
    for k in ("letters_status", "fees_status", "dash_status", "fees_total", "fees_depts", "dash_label", "dash_depts", "dash_numbers"):
        assert now.get(k) == before.get(k), k


# ---------- RCA variant: custom user WITH academic faculty_ids (multi-faculty) + hr_scope Girls ----------
@pytest.fixture(scope="module")
def multi_fac_user():
    admin_tok, _ = login("admin", "admin123")
    uname = f"TEST_iso_u3_{SUFFIX}"
    r = requests.post(f"{API}/users", headers=H(admin_tok), json={
        "username": uname, "password": "test1234", "full_name": "TEST عزل u3", "role": "custom",
        "permissions": ["manage_fee_receipts", "hr_manage_employees"], "faculty_ids": [GIRLS_FAC, SHARIA_FAC]}, timeout=30)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    tok, _ = login(uname, "test1234")
    before = requests.get(f"{API}/fees/stats", headers=H(tok)).json()["total_students"]
    requests.put(f"{API}/hr/users/{uid}/scope", headers=H(admin_tok), json={"hr_scope": "UNITS", "hr_scope_unit_ids": [GIRLS_UNIT]})
    yield {"tok": tok, "before": before}
    requests.delete(f"{API}/users/{uid}", headers=H(admin_tok))
    MDB.users.delete_one({"_id": ObjectId(uid)})
    MDB.activity_logs.delete_many({"user_id": uid})


def test_multi_fac_custom_narrowed_to_girls(multi_fac_user):
    d = requests.get(f"{API}/fees/stats", headers=H(multi_fac_user["tok"])).json()
    print("u3 before hr_scope:", multi_fac_user["before"], "after:", d["total_students"])
    assert multi_fac_user["before"] == 92
    assert d["total_students"] == 72
    dash = requests.get(f"{API}/dashboard/management", headers=H(multi_fac_user["tok"])).json()
    assert [x["id"] for x in dash["scope"]["departments"]] == [GIRLS_DEPT]
