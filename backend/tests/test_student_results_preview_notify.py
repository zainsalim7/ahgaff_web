# Student results: preview (commit=false), commit only new/changed, duplicates/invalid reasons, notify toggle, dean scope
import io
import os
import time
import asyncio
from datetime import datetime, timezone

import pytest
import requests
import openpyxl
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0]).rstrip('/')
API = f"{BASE_URL}/api"
REG_T = "TEST_PN01"
STU = "1001"
LVL = 7  # level not used by real data of 1001
HEAD = ["رقم القيد", "المستوى", "حالة الفصل1", "معدل الفصل1", "تقدير الفصل1", "حالة الفصل2", "معدل الفصل2", "تقدير الفصل2"]
SALIM_ID = "698f71ba5c5620a4449eeb7e"
SALIM_ORIG = ['manage_fee_receipts', 'hr_manage_tasks', 'hr_manage_appraisals']
START = datetime.now(timezone.utc).isoformat()


def mongo(coro_fn):
    async def run():
        c = AsyncIOMotorClient(os.environ['MONGO_URL'])
        try:
            return await coro_fn(c[os.environ['DB_NAME']])
        finally:
            c.close()
    return asyncio.run(run())


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def xlsx(rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


def imp(h, content, commit, notify="true"):
    return requests.post(f"{API}/student-results/import", headers=h, files={"file": ("t.xlsx", content)},
                         data={"commit": commit, "notify": notify})


def snapshot():
    return mongo(lambda db: db.student_results.find({}, {"_id": 0, "updated_at": 0, "created_at": 0, "updated_by": 0}).sort([("reg_no", 1), ("level", 1)]).to_list(1000))


def results_notifs():
    async def f(db):
        return await db.notifications.find({"user_id": "69a99544650b31fa86440da2", "type": "results", "created_at": {"$gte": START}}).to_list(100)
    return mongo(f)


@pytest.fixture(scope="module")
def admin():
    return login("admin", "admin123")


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    async def f(db):
        await db.student_results.delete_many({"reg_no": {"$in": [REG_T, "TEST_PN02"]}})
        await db.student_results.delete_one({"reg_no": STU, "level": LVL})
        await db.notifications.delete_many({"user_id": {"$in": ["69a99544650b31fa86440da2", "69a99545650b31fa86440da5"]}, "type": "results", "created_at": {"$gte": START}})
        from bson import ObjectId
        await db.users.update_one({"_id": ObjectId(SALIM_ID)}, {"$set": {"custom_permissions": SALIM_ORIG}})
    mongo(f)


class TestPreview:
    def test_preview_writes_nothing_and_classifies(self, admin):
        before = snapshot()
        content = xlsx([HEAD,
                        [REG_T, 1, "ناجح", "80", "جيد", None, None, None],        # row2 new (dup -> earlier)
                        [REG_T, 1, "ناجح", "81", "جيد", None, None, None],        # row3 new (last wins)
                        [None, 2, "ناجح", "70", None, None, None, None],         # row4 invalid (no reg)
                        ["TEST_PN02", "xyz", "ناجح", None, None, None, None, None],  # row5 invalid level
                        [STU, 1, "ناجح", "88.4", "جيد جداً", "راسب", "58.30", "ضعيف"],  # row6 unchanged
                        ])
        r = imp(admin, content, "false")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["preview"] is True
        print(d["counts"])
        by = {x["row"]: x for x in d["rows"]}
        assert set(by) == {2, 3, 4, 5, 6}
        assert by[2]["status"] == "duplicate"
        assert by[3]["status"] == "new" and by[3]["s1_gpa"] == "81"
        assert by[4]["status"] == "invalid" and by[4].get("reason")
        assert by[5]["status"] == "invalid" and by[5].get("reason")
        assert by[6]["status"] == "unchanged" and by[6]["student_name"]
        assert d["counts"] == {"new": 1, "changed": 0, "unchanged": 1, "invalid": 2, "out_of_scope": 0, "duplicate": 1}
        assert snapshot() == before

    def test_duplicate_row_has_reason(self, admin):
        content = xlsx([HEAD, [REG_T, 1, "a"], [REG_T, 1, "b"]])
        d = imp(admin, content, "false").json()
        dup = [x for x in d["rows"] if x["status"] == "duplicate"]
        assert dup, d
        assert dup[0].get("reason"), f"duplicate row missing reason: {dup[0]}"


class TestCommitNotify:
    def test_commit_new_notify(self, admin):
        content = xlsx([HEAD, [STU, LVL, "ناجح", "77.70", "جيد", None, None, None], [REG_T, 1, "x"], [REG_T, 1, "ناجح", "81"]])
        n0 = len(results_notifs())
        r = imp(admin, content, "true", "true")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["preview"] is False and d["counts"]["new"] == 2 and d["counts"]["duplicate"] == 1
        assert d["notified"] == 1
        assert "صدور النتيجة" in d["message"]
        time.sleep(1.5)
        assert len(results_notifs()) == n0 + 1
        rows = mongo(lambda db: db.student_results.find({"reg_no": REG_T}).to_list(10))
        assert len(rows) == 1 and rows[0]["s1_status"] == "ناجح" and rows[0]["s1_gpa"] == "81"

    def test_student_sees_notification_and_literal(self):
        h = login("1001", "test1234")
        n = requests.get(f"{API}/notifications/my", headers=h).json()
        res = [x for x in n["notifications"] if x["type"] == "results"]
        assert res and "صدرت نتيجتك" in res[0]["title"]
        lv = {x["level"]: x for x in requests.get(f"{API}/students/me/results", headers=h).json()["levels"]}
        assert lv[LVL]["first_semester"] == {"status": "ناجح", "gpa": "77.70", "grade": "جيد"}
        assert lv[1]["second_semester"]["gpa"] == "58.30"

    def test_reupload_identical_notifies_zero(self, admin):
        content = xlsx([HEAD, [STU, LVL, "ناجح", "77.70", "جيد", None, None, None]])
        n0 = len(results_notifs())
        d = imp(admin, content, "true", "true").json()
        assert d["counts"]["unchanged"] == 1 and d["notified"] == 0
        time.sleep(1)
        assert len(results_notifs()) == n0

    def test_changed_notify_false(self, admin):
        content = xlsx([HEAD, [STU, LVL, "ناجح", "79", "جيد", None, None, None]])
        p = imp(admin, content, "false").json()
        assert p["rows"][0]["status"] == "changed" and p["rows"][0]["old"]["s1_gpa"] == "77.70"
        n0 = len(results_notifs())
        d = imp(admin, content, "true", "false").json()
        assert d["counts"]["changed"] == 1 and d["notified"] == 0
        time.sleep(1)
        assert len(results_notifs()) == n0

    def test_changed_notify_true(self, admin):
        content = xlsx([HEAD, [STU, LVL, "ناجح", "80", "جيد", None, None, None]])
        n0 = len(results_notifs())
        d = imp(admin, content, "true", "true").json()
        assert d["counts"]["changed"] == 1 and d["notified"] == 1
        time.sleep(1.5)
        assert len(results_notifs()) == n0 + 1


class TestDeanScope:
    def test_dean_out_of_scope(self):
        from bson import ObjectId
        mongo(lambda db: db.users.update_one({"_id": ObjectId(SALIM_ID)}, {"$set": {"custom_permissions": SALIM_ORIG + ["manage_grades"]}}))
        h = login("Salim", "test1234")
        before = snapshot()
        content = xlsx([HEAD, ["12345", 1, "OOS"], [STU, LVL, "ناجح", "80", "جيد", None, None, None], ["TEST_PN02", 1, "x"]])
        d = imp(h, content, "false")
        assert d.status_code == 200, d.text
        d = d.json()
        by = {x["row"]: x for x in d["rows"]}
        assert by[2]["status"] == "out_of_scope" and by[2]["reason"]
        assert by[3]["status"] == "unchanged"
        assert by[4]["status"] == "out_of_scope"
        # commit with only out_of_scope + changed row
        content2 = xlsx([HEAD, ["12345", 1, "OOS"], [STU, LVL, "ناجح", "82", "جيد", None, None, None]])
        c = imp(h, content2, "true", "false").json()
        assert c["counts"]["changed"] == 1 and c["counts"]["out_of_scope"] == 1
        r12345 = mongo(lambda db: db.student_results.find_one({"reg_no": "12345", "level": 1}))
        assert r12345["s1_status"] != "OOS"
        # all out-of-scope -> 403
        only = imp(h, xlsx([HEAD, ["12345", 1, "OOS"]]), "false")
        assert only.status_code == 403
        lst = requests.get(f"{API}/student-results", headers=h).json()
        assert all(i["reg_no"] != "12345" for i in lst["items"])
        mongo(lambda db: db.users.update_one({"_id": ObjectId(SALIM_ID)}, {"$set": {"custom_permissions": SALIM_ORIG}}))
