# Phase 4: Faculty Board (مجلس الكلية) — candidates, sessions, decisions (de-dup, bulk), status override, PDFs, role-based 403
import os
import pytest
import requests
from datetime import datetime
from bson import ObjectId
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

STUDENT_ID = "698e57518cfb2f14627a285e"  # student 1001
COURSE_ID = "6ab3a8ad447a8c2cd67c801c"   # مقرر اختبار الاستعادة (test course, 1001 enrolled)
MARK = "TEST_FB_PHASE4"

mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        pytest.skip(f"login failed for {u}: {r.status_code}")
    d = r.json()
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {d.get('access_token') or d.get('token')}"})
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


@pytest.fixture(scope="module", autouse=True)
def seed_candidate():
    """Seed 2 completed lectures with explicit 'absent' records for 1001 -> pushes to candidate"""
    lec_ids = []
    for d in ("2026-01-05", "2026-01-06"):
        res = mdb.lectures.insert_one({"course_id": COURSE_ID, "date": d, "start_time": "08:00", "end_time": "09:00",
                                       "status": "completed", "room": MARK, "created_at": datetime.utcnow()})
        lec_ids.append(str(res.inserted_id))
        mdb.attendance.insert_one({"course_id": COURSE_ID, "lecture_id": str(res.inserted_id), "student_id": STUDENT_ID,
                                   "status": "absent", "note": MARK})
    yield lec_ids
    mdb.attendance.delete_many({"note": MARK})
    mdb.lectures.delete_many({"room": MARK})
    mdb.faculty_board_decisions.delete_many({"student_id": STUDENT_ID})
    mdb.faculty_board_sessions.delete_many({"title": {"$regex": "^TEST_"}})


def _status(admin):
    r = admin.get(f"{API}/reports/student/{STUDENT_ID}/detailed")
    assert r.status_code == 200, r.text
    for c in r.json()["courses"]:
        if c["course_id"] == COURSE_ID:
            return c["rule"]
    raise AssertionError("course not in student report")


# --- Role gate (regression of Phase 3 permission-leak bug) ---
class TestRoleGate:
    @pytest.mark.parametrize("who", ["teacher", "student"])
    def test_forbidden_all_endpoints(self, who, request):
        s = request.getfixturevalue(who)
        fake = str(ObjectId())
        calls = [
            s.get(f"{API}/faculty-board/candidates"),
            s.get(f"{API}/faculty-board/sessions"),
            s.post(f"{API}/faculty-board/sessions", json={"meeting_number": "1", "meeting_date": "2026-01-10", "title": "TEST_x"}),
            s.get(f"{API}/faculty-board/decisions"),
            s.post(f"{API}/faculty-board/decisions", json={"student_id": STUDENT_ID, "scope": "general", "decision": "deprived"}),
            s.post(f"{API}/faculty-board/sessions/{fake}/decisions", json={"decisions": []}),
            s.delete(f"{API}/faculty-board/decisions/{fake}"),
            s.get(f"{API}/faculty-board/sessions/{fake}/minutes-pdf"),
            s.get(f"{API}/faculty-board/decisions/{fake}/letter-pdf"),
        ]
        assert [c.status_code for c in calls] == [403] * len(calls)


# --- Candidates ---
class TestCandidates:
    def test_candidate_listed(self, admin):
        r = admin.get(f"{API}/faculty-board/candidates", params={"course_id": COURSE_ID})
        assert r.status_code == 200
        items = [i for i in r.json()["items"] if i["student_id"] == STUDENT_ID]
        assert len(items) == 1
        it = items[0]
        assert it["pct_unexcused"] > it["limit_unexcused"] or it["pct_total"] > it["limit_total"]
        assert it["limit_unexcused"] == 10.0 and it["limit_total"] == 25.0

    def test_invalid_course(self, admin):
        assert admin.get(f"{API}/faculty-board/candidates", params={"course_id": "bad"}).status_code == 400

    def test_status_candidate_before_decision(self, admin):
        assert _status(admin)["status"] == "candidate"


# --- Sessions ---
class TestSessions:
    def test_validation(self, admin):
        assert admin.post(f"{API}/faculty-board/sessions", json={"meeting_number": "1", "meeting_date": "10-01-2026"}).status_code == 400
        assert admin.post(f"{API}/faculty-board/sessions", json={"meeting_number": "  ", "meeting_date": "2026-01-10"}).status_code == 400

    def test_create_and_list(self, admin):
        r = admin.post(f"{API}/faculty-board/sessions", json={"meeting_number": "T-1", "meeting_date": "2026-01-10", "title": "TEST_session"})
        assert r.status_code == 200
        sid = r.json()["id"]
        lst = admin.get(f"{API}/faculty-board/sessions").json()["items"]
        found = [s for s in lst if s["id"] == sid]
        assert found and found[0]["decisions_count"] == 0 and found[0]["meeting_number"] == "T-1"


# --- Decisions ---
class TestDecisions:
    def test_validation(self, admin):
        u = f"{API}/faculty-board/decisions"
        assert admin.post(u, json={"student_id": STUDENT_ID, "scope": "x", "decision": "deprived"}).status_code == 400
        assert admin.post(u, json={"student_id": STUDENT_ID, "scope": "general", "decision": "x"}).status_code == 400
        assert admin.post(u, json={"student_id": STUDENT_ID, "scope": "course", "decision": "deprived"}).status_code == 400
        assert admin.post(u, json={"student_id": str(ObjectId()), "scope": "general", "decision": "deprived"}).status_code == 404
        assert admin.post(u, json={"student_id": STUDENT_ID, "scope": "course", "course_id": str(ObjectId()), "decision": "deprived"}).status_code == 404
        assert admin.post(u, json={"student_id": STUDENT_ID, "scope": "general", "decision": "deprived", "session_id": str(ObjectId())}).status_code == 404

    def test_course_decision_override_dedup_delete_revert(self, admin):
        u = f"{API}/faculty-board/decisions"
        r1 = admin.post(u, json={"student_id": STUDENT_ID, "scope": "course", "course_id": COURSE_ID, "decision": "deprived", "reason": "TEST_r1"})
        assert r1.status_code == 200, r1.text
        assert r1.json()["pct_total"] is not None
        st = _status(admin)
        assert st["status"] == "deprived" and st["status_ar"] == "محروم بقرار المجلس"
        # no longer candidate
        c = admin.get(f"{API}/faculty-board/candidates", params={"course_id": COURSE_ID}).json()["items"]
        assert not [i for i in c if i["student_id"] == STUDENT_ID]
        # de-dup
        r2 = admin.post(u, json={"student_id": STUDENT_ID, "scope": "course", "course_id": COURSE_ID, "decision": "exempted", "reason": "TEST_r2"})
        assert r2.status_code == 200
        ds = [d for d in admin.get(u, params={"student_id": STUDENT_ID}).json()["items"] if d["scope"] == "course"]
        assert len(ds) == 1 and ds[0]["decision"] == "exempted" and ds[0]["reason"] == "TEST_r2"
        assert _status(admin)["status"] == "exempted"
        # letter pdf
        p = admin.get(f"{u}/{r2.json()['id']}/letter-pdf")
        assert p.status_code == 200 and p.headers["content-type"].startswith("application/pdf") and p.content[:4] == b"%PDF" and len(p.content) > 2000
        # delete -> revert
        assert admin.delete(f"{u}/{r2.json()['id']}").status_code == 200
        assert admin.delete(f"{u}/{r2.json()['id']}").status_code == 404
        assert admin.delete(f"{u}/invalid").status_code == 404
        assert _status(admin)["status"] == "candidate"

    def test_general_decision_and_course_precedence(self, admin):
        u = f"{API}/faculty-board/decisions"
        g = admin.post(u, json={"student_id": STUDENT_ID, "scope": "general", "decision": "exempted", "reason": "TEST_g"})
        assert g.status_code == 200 and g.json()["course_id"] is None
        assert _status(admin)["status"] == "exempted"
        c = admin.post(u, json={"student_id": STUDENT_ID, "scope": "course", "course_id": COURSE_ID, "decision": "deprived", "reason": "TEST_c"})
        assert _status(admin)["status"] == "deprived"  # course-scope beats general
        ds = admin.get(u, params={"student_id": STUDENT_ID}).json()["items"]
        assert len(ds) == 2
        admin.delete(f"{u}/{c.json()['id']}")
        assert _status(admin)["status"] == "exempted"
        admin.delete(f"{u}/{g.json()['id']}")
        assert _status(admin)["status"] == "candidate"

    def test_bulk_session_decisions_and_minutes_pdf(self, admin):
        s = admin.post(f"{API}/faculty-board/sessions", json={"meeting_number": "T-2", "meeting_date": "2026-01-11", "title": "TEST_bulk"}).json()
        sid = s["id"]
        r = admin.post(f"{API}/faculty-board/sessions/{sid}/decisions", json={"decisions": [
            {"student_id": STUDENT_ID, "scope": "course", "course_id": COURSE_ID, "decision": "deprived", "reason": "TEST_b1"},
            {"student_id": STUDENT_ID, "scope": "general", "decision": "exempted", "reason": "TEST_b2"},
        ]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["count"] == 2 and len(d["items"]) == 2 and all(i["session_id"] == sid and i["meeting_number"] == "T-2" for i in d["items"])
        lst = [x for x in admin.get(f"{API}/faculty-board/sessions").json()["items"] if x["id"] == sid]
        assert lst[0]["decisions_count"] == 2
        assert len(admin.get(f"{API}/faculty-board/decisions", params={"session_id": sid}).json()["items"]) == 2
        p = admin.get(f"{API}/faculty-board/sessions/{sid}/minutes-pdf")
        assert p.status_code == 200 and p.headers["content-type"].startswith("application/pdf") and p.content[:4] == b"%PDF" and len(p.content) > 2000
        assert admin.get(f"{API}/faculty-board/sessions/{ObjectId()}/minutes-pdf").status_code == 404
        assert admin.post(f"{API}/faculty-board/sessions/{ObjectId()}/decisions", json={"decisions": []}).status_code == 404
        for i in d["items"]:
            admin.delete(f"{API}/faculty-board/decisions/{i['id']}")
