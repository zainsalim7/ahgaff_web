"""Student excuses: registrar-first routing, forward to dean/board, faculty/department scoping, mobile endpoint (iteration 167)"""
import asyncio
import base64
import io
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests
from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image

load_dotenv("/app/backend/.env")
BASE_URL = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0].rstrip("/")
API = f"{BASE_URL}/api"
TZ = timezone(timedelta(hours=3))
FAC_SHARIA = "698e4f9297fef774e66e93a4"
FAC_GIRLS = "698e4fb497fef774e66e93a6"
DEPT_ISLAMIC = "698e501d97fef774e66e93a9"  # Saeed's dept (girls faculty)
CREATED = []


LOOP = asyncio.new_event_loop()
_CLIENT = {}


def _db():
    if "c" not in _CLIENT:
        asyncio.set_event_loop(LOOP)
        _CLIENT["c"] = AsyncIOMotorClient(os.environ["MONGO_URL"], io_loop=LOOP)[os.environ["DB_NAME"]]
    return _CLIENT["c"]


def run(coro):
    return LOOP.run_until_complete(coro)


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        pytest.skip(f"login failed {u}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def png():
    buf = io.BytesIO(); Image.effect_noise((60, 60), 80).convert("RGB").save(buf, "PNG")
    return buf.getvalue()


async def _sid(no):
    s = await _db().students.find_one({"student_id": no}, {"_id": 1})
    return str(s["_id"])


def create(headers, student_no, etype, fd, td):
    sid = run(_sid(student_no))
    r = requests.post(f"{API}/student-excuses", headers=headers,
                      data={"from_date": fd, "to_date": td, "excuse_type": etype, "description": "TEST_excuse forwarding", "student_db_id": sid},
                      files=[("files", ("TEST.png", png(), "image/png"))])
    if r.status_code == 200:
        CREATED.append(r.json()["request"]["id"])
    return r


@pytest.fixture(scope="module")
def H():
    return {"admin": login("admin", "admin123"), "reg": login("test_registrar", "test1234"),
            "dean": login("Salim", "test1234"), "head": login("Saeed", "test1234")}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    async def c():
        if CREATED:
            await _db().student_excuses.delete_many({"_id": {"$in": [ObjectId(i) for i in CREATED]}})
    run(c())


@pytest.fixture(scope="module")
def flow(H):
    """registrar submits exam-type excuse on behalf of student 1002 (sharia faculty)"""
    r = create(H["reg"], "1002", "exam", "2031-03-01", "2031-03-01")
    assert r.status_code == 200, r.text
    return r.json()["request"]


# --- create always routes to registration
class TestRegistrarFirst:
    def test_exam_type_routes_to_registration(self, flow):
        assert flow["route"] == "registration" and flow["route_label"] == "التسجيل"
        assert flow["status"] == "pending" and flow["forwarded_to"] is None

    def test_registrar_can_decide_and_forward(self, H, flow):
        d = requests.get(f"{API}/student-excuses/{flow['id']}", headers=H["reg"]).json()
        assert d["can_decide"] is True and d["can_forward"] is True

    def test_dean_cannot_decide_or_forward_registration_item(self, H, flow):
        d = requests.get(f"{API}/student-excuses/{flow['id']}", headers=H["dean"]).json()
        assert d["can_decide"] is False and d["can_forward"] is False
        r = requests.post(f"{API}/student-excuses/{flow['id']}/decide", headers=H["dean"], json={"decision": "approved", "board_session_no": "1", "board_session_date": "2031-03-02"})
        assert r.status_code == 403
        r = requests.post(f"{API}/student-excuses/{flow['id']}/forward", headers=H["dean"], json={"to": "board"})
        assert r.status_code == 403

    def test_other_types_also_registration(self, H):
        for i, t in enumerate(["family", "official", "sick"]):
            d = f"2031-04-{10 * (i + 1):02d}"
            r = create(H["reg"], "1002", t, d, d)
            assert r.status_code == 200, r.text
            assert r.json()["request"]["route"] == "registration"

    def test_registrar_can_decide_exam_type_directly(self, H):
        r = create(H["reg"], "1002", "exam", "2031-05-01", "2031-05-05")
        eid = r.json()["request"]["id"]
        r = requests.post(f"{API}/student-excuses/{eid}/decide", headers=H["reg"], json={"decision": "rejected", "note": "TEST reject"})
        assert r.status_code == 200, r.text
        d = requests.get(f"{API}/student-excuses/{eid}", headers=H["reg"]).json()
        assert d["status"] == "rejected" and d["can_forward"] is False


# --- forward flow
class TestForwardFlow:
    def test_forward_invalid_target(self, H, flow):
        r = requests.post(f"{API}/student-excuses/{flow['id']}/forward", headers=H["reg"], json={"to": "registration"})
        assert r.status_code == 400

    def test_forward_to_board(self, H, flow):
        r = requests.post(f"{API}/student-excuses/{flow['id']}/forward", headers=H["reg"], json={"to": "board", "note": "TEST note"})
        assert r.status_code == 200 and "مجلس الكلية" in r.json()["message"]
        d = requests.get(f"{API}/student-excuses/{flow['id']}", headers=H["reg"]).json()
        assert d["route"] == "board" and d["forwarded_to"] == "board" and d["forwarded_to_label"] == "مجلس الكلية"
        assert d["forwarded_by_name"] and d["forwarded_at"]
        assert d["can_decide"] is False and d["can_forward"] is False
        assert any(h["action"] == "forwarded" and "TEST note" in (h.get("note") or "") for h in d["history"])

    def test_forward_twice_rejected(self, H, flow):
        r = requests.post(f"{API}/student-excuses/{flow['id']}/forward", headers=H["reg"], json={"to": "dean"})
        assert r.status_code == 403

    def test_registrar_still_sees_in_list(self, H, flow):
        items = requests.get(f"{API}/student-excuses", headers=H["reg"]).json()["items"]
        row = next((i for i in items if i["id"] == flow["id"]), None)
        assert row and row["forwarded_to"] == "board" and row["can_decide"] is False

    def test_dean_board_requires_session(self, H, flow):
        d = requests.get(f"{API}/student-excuses/{flow['id']}", headers=H["dean"]).json()
        assert d["can_decide"] is True
        r = requests.post(f"{API}/student-excuses/{flow['id']}/decide", headers=H["dean"], json={"decision": "approved"})
        assert r.status_code == 400

    def test_dean_approves_and_registrar_sees_outcome(self, H, flow):
        r = requests.post(f"{API}/student-excuses/{flow['id']}/decide", headers=H["dean"], json={"decision": "approved", "board_session_no": "TEST-7", "board_session_date": "2031-03-03"})
        assert r.status_code == 200, r.text
        items = requests.get(f"{API}/student-excuses?status=approved", headers=H["reg"]).json()["items"]
        row = next((i for i in items if i["id"] == flow["id"]), None)
        assert row and row["status"] == "approved" and row["forwarded_to_label"] == "مجلس الكلية" and row["board_session_no"] == "TEST-7"

    def test_forward_to_dean_then_dean_decides(self, H):
        r = create(H["reg"], "1003", "family", "2031-06-01", "2031-06-01")
        assert r.status_code == 200, r.text
        eid = r.json()["request"]["id"]
        assert requests.post(f"{API}/student-excuses/{eid}/forward", headers=H["reg"], json={"to": "dean"}).status_code == 200
        r = requests.post(f"{API}/student-excuses/{eid}/decide", headers=H["dean"], json={"decision": "approved"})
        assert r.status_code == 200, r.text


# --- faculty / department scoping
class TestScoping:
    @pytest.fixture(scope="class")
    def girls_item(self, H):
        r = create(H["admin"], "12345", "sick", "2031-07-01", "2031-07-01")
        assert r.status_code == 200, r.text
        it = r.json()["request"]
        assert it["faculty_id"] == FAC_GIRLS and it["department_id"] == DEPT_ISLAMIC
        return it

    def test_registrar_list_only_own_faculty(self, H, girls_item):
        items = requests.get(f"{API}/student-excuses", headers=H["reg"]).json()["items"]
        assert items and all(i["faculty_id"] == FAC_SHARIA for i in items)
        assert girls_item["id"] not in [i["id"] for i in items]

    def test_dean_list_only_own_faculty(self, H, girls_item):
        items = requests.get(f"{API}/student-excuses", headers=H["dean"]).json()["items"]
        assert all(i["faculty_id"] == FAC_SHARIA for i in items)

    def test_registrar_cannot_get_decide_forward_other_faculty(self, H, girls_item):
        eid = girls_item["id"]
        assert requests.get(f"{API}/student-excuses/{eid}", headers=H["reg"]).status_code == 403
        assert requests.post(f"{API}/student-excuses/{eid}/decide", headers=H["reg"], json={"decision": "approved"}).status_code == 403
        assert requests.post(f"{API}/student-excuses/{eid}/forward", headers=H["reg"], json={"to": "dean"}).status_code == 403

    def test_list_faculty_param_cannot_bypass_scope(self, H, girls_item):
        """registrar passing ?faculty_id=<other faculty> must NOT see other faculty's items"""
        items = requests.get(f"{API}/student-excuses?faculty_id={FAC_GIRLS}", headers=H["reg"]).json()["items"]
        assert girls_item["id"] not in [i["id"] for i in items]

    def test_dept_head_sees_own_department(self, H, girls_item):
        items = requests.get(f"{API}/student-excuses", headers=H["head"]).json()["items"]
        ids = [i["id"] for i in items]
        assert girls_item["id"] in ids
        assert all(i["department_id"] == DEPT_ISLAMIC for i in items)
        row = next(i for i in items if i["id"] == girls_item["id"])
        assert row["can_decide"] is False and row["can_forward"] is False

    def test_dept_head_cannot_see_other_department(self, H, flow):
        assert requests.get(f"{API}/student-excuses/{flow['id']}", headers=H["head"]).status_code == 403

    def test_dept_head_param_cannot_bypass_scope(self, H, flow):
        items = requests.get(f"{API}/student-excuses?department_id=698e500997fef774e66e93a8", headers=H["head"]).json()["items"]
        assert flow["id"] not in [i["id"] for i in items]

    def test_registrar_student_search_scoped(self, H):
        r = requests.get(f"{API}/student-excuses/students/search", headers=H["reg"], params={"q": "12345"})
        assert r.status_code == 200 and all(s["student_id"] != "12345" for s in r.json())


# --- mobile app endpoint
class TestMobileEndpoint:
    def test_app_submit_routes_registration_and_forwarded_flag(self):
        db = _db()
        async def seed():
            st = await db.students.find_one({"student_id": "1001"})
            sid = str(st["_id"])
            enr = await db.enrollments.find_one({"student_id": sid})
            d = (datetime.now(TZ).date() - timedelta(days=1)).isoformat()
            lec = await db.lectures.insert_one({"course_id": enr["course_id"], "date": d, "start_time": "07:00", "status": "completed", "title": "TEST-FWD", "created_at": datetime.now(TZ)})
            rec = await db.attendance.insert_one({"lecture_id": str(lec.inserted_id), "course_id": enr["course_id"], "student_id": sid, "status": "absent", "date": datetime.now(TZ), "recorded_by": "test", "method": "manual"})
            return lec.inserted_id, rec.inserted_id
        lec_id, rec_id = run(seed())
        try:
            S = login("1001", "test1234")
            b64 = "data:image/png;base64," + base64.b64encode(png()).decode()
            r = requests.post(f"{API}/absence-excuses", headers=S, json={"message": "TEST_ exam", "image_base64": b64, "record_ids": [str(rec_id)], "excuse_type": "exam"})
            assert r.status_code == 200, r.text
            CREATED.append(r.json()["id"])
            assert r.json()["full"]["route"] == "registration"
            assert r.json()["request"]["forwarded"] is False
            my = requests.get(f"{API}/absence-excuses/my", headers=S).json()
            row = next(i for i in my if i["id"] == r.json()["id"])
            assert "forwarded" in row and row["forwarded"] is False
            R = login("test_registrar", "test1234")
            assert requests.post(f"{API}/student-excuses/{row['id']}/forward", headers=R, json={"to": "dean"}).status_code == 200
            my = requests.get(f"{API}/absence-excuses/my", headers=S).json()
            row = next(i for i in my if i["id"] == r.json()["id"])
            assert row["forwarded"] is True and row["route_label"] == "عميد الكلية"
        finally:
            async def c():
                await db.attendance.delete_one({"_id": rec_id}); await db.lectures.delete_one({"_id": lec_id})
            run(c())
