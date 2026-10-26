# Absence-teacher reminder feature (manual POST/GET + cron run endpoint)
import os
from datetime import datetime, timedelta, timezone
import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
SECRET = os.environ.get("WEBHOOK_CRON_SECRET")
COURSE_ID = "698f0000d803b27aab0120af"
TEACHER_ID = "698ad3da31ab437a06176e2a"
TEACHER_USER_ID = "698f867e9245118463b679ca"
YEMEN = timezone(timedelta(hours=3))
TITLE = "تنبيه غياب عن محاضرة"

mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        pytest.skip(f"login failed {u}: {r.status_code}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin():
    return login("admin", "admin123")


@pytest.fixture(scope="module")
def teacher():
    return login("222222", "teacher123")


def make_lecture(hours_ago_end, status="absent"):
    end = datetime.now(YEMEN) - timedelta(hours=hours_ago_end)
    start = end - timedelta(hours=1)
    doc = {"course_id": COURSE_ID, "date": end.strftime("%Y-%m-%d"), "start_time": start.strftime("%H:%M"),
           "end_time": end.strftime("%H:%M"), "room": "TEST_AR", "teacher_id": TEACHER_ID, "status": status,
           "status_override": True, "group": "TEST_AR_" + str(ObjectId())}
    if start.date() != end.date():  # avoid crossing midnight
        doc["start_time"] = "00:00"
    return str(mdb.lectures.insert_one(doc).inserted_id)


@pytest.fixture(scope="module")
def created():
    ids = []
    yield ids
    for lid in ids:
        mdb.lectures.delete_one({"_id": ObjectId(lid)})
        mdb.absence_reminders.delete_many({"lecture_id": lid})
        mdb.notifications.delete_many({"lecture_id": lid})
        mdb.absence_justifications.delete_many({"lecture_ids": lid, "reason": "TEST_AR"})


class TestManual:
    def test_manual_send_then_409(self, admin, created):
        lid = make_lecture(2); created.append(lid)
        g = requests.get(f"{BASE_URL}/api/lectures/{lid}/absence-reminder", headers=admin)
        assert g.status_code == 200 and g.json() == {"sent": False}
        r = requests.post(f"{BASE_URL}/api/lectures/{lid}/absence-reminder", headers=admin, json={})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True and d["kind"] == "manual" and isinstance(d["sent_at"], str)
        n = mdb.notifications.find_one({"lecture_id": lid})
        assert n and n["user_id"] == TEACHER_USER_ID and n["title"] == TITLE
        assert n["message"].startswith("لاحظنا غيابكم في محاضرة") and "مع تحيات الإدارة" in n["message"]
        print("MSG:", n["message"])
        assert mdb.absence_reminders.count_documents({"lecture_id": lid}) == 1
        g = requests.get(f"{BASE_URL}/api/lectures/{lid}/absence-reminder", headers=admin).json()
        assert g["sent"] is True and g["kind"] == "manual" and g["sent_at"] == d["sent_at"]
        r2 = requests.post(f"{BASE_URL}/api/lectures/{lid}/absence-reminder", headers=admin, json={})
        assert r2.status_code == 409 and d["sent_at"] in r2.json()["detail"]
        # lecture untouched
        lec = mdb.lectures.find_one({"_id": ObjectId(lid)})
        assert lec["status"] == "absent"

    def test_not_absent_409(self, admin, created):
        lid = make_lecture(2, status="completed"); created.append(lid)
        r = requests.post(f"{BASE_URL}/api/lectures/{lid}/absence-reminder", headers=admin, json={})
        assert r.status_code == 409
        assert mdb.absence_reminders.count_documents({"lecture_id": lid}) == 0

    @pytest.mark.parametrize("jstatus", ["pending", "approved"])
    def test_with_justification_409(self, admin, created, jstatus):
        lid = make_lecture(2); created.append(lid)
        mdb.absence_justifications.insert_one({"lecture_ids": [lid], "status": jstatus, "reason": "TEST_AR"})
        r = requests.post(f"{BASE_URL}/api/lectures/{lid}/absence-reminder", headers=admin, json={})
        assert r.status_code == 409
        assert mdb.absence_reminders.count_documents({"lecture_id": lid}) == 0

    def test_invalid_and_missing(self, admin):
        assert requests.post(f"{BASE_URL}/api/lectures/bad/absence-reminder", headers=admin).status_code == 404
        assert requests.post(f"{BASE_URL}/api/lectures/{ObjectId()}/absence-reminder", headers=admin).status_code == 404

    def test_teacher_forbidden(self, teacher, created):
        lid = make_lecture(2); created.append(lid)
        r = requests.post(f"{BASE_URL}/api/lectures/{lid}/absence-reminder", headers=teacher, json={})
        assert r.status_code == 403
        assert mdb.absence_reminders.count_documents({"lecture_id": lid}) == 0

    def test_unauthenticated(self):
        r = requests.post(f"{BASE_URL}/api/lectures/{ObjectId()}/absence-reminder")
        assert r.status_code in (401, 403)


class TestCron:
    def test_auth(self):
        u = f"{BASE_URL}/api/absence-reminders/run"
        assert requests.post(u).status_code == 401
        assert requests.post(u, headers={"Authorization": "Bearer wrong"}).status_code == 401
        assert requests.post(u, headers={"Authorization": SECRET}).status_code == 401

    def test_run_window_and_idempotent(self, created):
        l13 = make_lecture(13); l5 = make_lecture(5); l80 = make_lecture(80); l20 = make_lecture(20)
        created.extend([l13, l5, l80, l20])
        mdb.absence_justifications.insert_one({"lecture_ids": [l20], "status": "pending", "reason": "TEST_AR"})
        h = {"Authorization": f"Bearer {SECRET}"}
        r = requests.post(f"{BASE_URL}/api/absence-reminders/run", headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        print("RUN1:", d)
        assert l13 in d["lecture_ids"]
        for x in (l5, l80, l20):
            assert x not in d["lecture_ids"]
        rem = mdb.absence_reminders.find_one({"lecture_id": l13})
        assert rem["kind"] == "auto"
        n = mdb.notifications.find_one({"lecture_id": l13})
        assert n and n["title"] == TITLE and n["user_id"] == TEACHER_USER_ID
        r2 = requests.post(f"{BASE_URL}/api/absence-reminders/run", headers=h).json()
        print("RUN2:", r2)
        assert r2["sent"] == 0 and r2["lecture_ids"] == []
