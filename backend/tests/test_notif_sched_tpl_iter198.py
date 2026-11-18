# Iter198: level/section audience, scheduled notifications (+cron run), notification templates
import os, time, asyncio
import pytest, requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

load_dotenv('/app/frontend/.env')
load_dotenv('/app/backend/.env')
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
CRON = os.environ.get('WEBHOOK_CRON_SECRET')
DEPT = '698e500997fef774e66e93a8'
FAC = '698e4f9297fef774e66e93a4'
P = 'TEST_IT198_'


def mongo(coro_fn):
    async def run():
        db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
        return await coro_fn(db)
    return asyncio.get_event_loop().run_until_complete(run()) if False else asyncio.run(run())


@pytest.fixture(scope='module')
def s():
    se = requests.Session()
    r = se.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip('login failed')
    se.headers['Authorization'] = f"Bearer {r.json().get('access_token') or r.json().get('token')}"
    return se


def prev(s, **kw):
    r = s.post(f"{BASE_URL}/api/notifications/preview", json={"title": "-", "body": "-", **kw})
    assert r.status_code == 200, r.text
    return r.json()


# --- level / section audience ---
class TestAudience:
    def test_level_all(self, s):
        d = prev(s, target_type='level', department_id=DEPT, level=1, audience='all')
        print(d); assert d['users'] == 22

    def test_level_teachers(self, s):
        d = prev(s, target_type='level', department_id=DEPT, level=1, audience='teachers')
        print(d); assert d['users'] == 2

    def test_level_students(self, s):
        d = prev(s, target_type='level', department_id=DEPT, level=1, audience='students')
        print(d); assert d['users'] == 20

    def test_section(self, s):
        for a in ('all', 'teachers', 'students'):
            print(a, prev(s, target_type='section', department_id=DEPT, level=1, section='أ', audience=a))

    def test_level_faculty_only(self, s):
        d = prev(s, target_type='level', faculty_id=FAC, level=1, audience='teachers')
        print(d); assert d['users'] >= 2

    def test_regression_faculty_and_role(self, s):
        assert prev(s, target_type='faculty', faculty_id=FAC, audience='all')['users'] == 30
        assert prev(s, target_type='role', target_role='teacher', faculty_id=FAC)['users'] == 10


# --- templates ---
class TestTemplates:
    def test_crud_upsert(self, s):
        name = P + 'tpl'
        r = s.post(f"{BASE_URL}/api/notifications/templates", json={"name": name, "title": "T1", "body": "B1"})
        assert r.status_code == 200
        r = s.post(f"{BASE_URL}/api/notifications/templates", json={"name": name, "title": "T2", "body": "B2"})
        assert r.status_code == 200
        lst = [t for t in s.get(f"{BASE_URL}/api/notifications/templates").json() if t['name'] == name]
        assert len(lst) == 1 and lst[0]['title'] == 'T2' and lst[0]['body'] == 'B2'
        assert s.delete(f"{BASE_URL}/api/notifications/templates/{lst[0]['id']}").status_code == 200
        assert not [t for t in s.get(f"{BASE_URL}/api/notifications/templates").json() if t['name'] == name]

    def test_validation(self, s):
        r = s.post(f"{BASE_URL}/api/notifications/templates", json={"name": " ", "title": "x", "body": "y"})
        assert r.status_code == 400
        r = s.post(f"{BASE_URL}/api/notifications/templates", json={"name": P + "x", "title": "", "body": "y"})
        assert r.status_code == 400

    def test_no_auth(self):
        assert requests.get(f"{BASE_URL}/api/notifications/templates").status_code in (401, 403)


# --- scheduling ---
class TestSchedule:
    def test_past_rejected(self, s):
        r = s.post(f"{BASE_URL}/api/notifications/send", json={"title": P + "past", "body": "b", "target_type": "level",
                   "department_id": DEPT, "level": 1, "audience": "teachers", "scheduled_at": "2020-01-01T08:00"})
        assert r.status_code == 400 and 'المستقبل' in r.json()['detail']

    def test_bad_format(self, s):
        r = s.post(f"{BASE_URL}/api/notifications/send", json={"title": P + "bad", "body": "b", "target_type": "all", "scheduled_at": "xyz"})
        assert r.status_code == 400

    def test_cron_unauthorized(self):
        assert requests.post(f"{BASE_URL}/api/notifications/scheduled/run").status_code == 401
        assert requests.post(f"{BASE_URL}/api/notifications/scheduled/run", headers={"Authorization": "Bearer wrong"}).status_code == 401

    def test_schedule_run_and_cancel(self, s):
        title = P + 'sched'
        r = s.post(f"{BASE_URL}/api/notifications/send", json={"title": title, "body": "b", "target_type": "level",
                   "department_id": DEPT, "level": 1, "audience": "teachers", "scheduled_at": "2030-01-01T08:30"})
        assert r.status_code == 200, r.text
        j = r.json(); assert j['scheduled'] is True; sid = j['id']; print(j['message'])
        assert 'تمت جدولة' in j['message']
        # cancelled item
        r2 = s.post(f"{BASE_URL}/api/notifications/send", json={"title": title + '_c', "body": "b", "target_type": "level",
                    "department_id": DEPT, "level": 1, "audience": "teachers", "scheduled_at": "2030-01-01T08:30"})
        cid = r2.json()['id']
        lst = {x['id']: x for x in s.get(f"{BASE_URL}/api/notifications/scheduled").json()}
        assert lst[sid]['status'] == 'pending' and lst[sid]['users_estimate'] == 2
        assert lst[sid]['scheduled_at'].startswith('2030-01-01T05:30')
        assert s.delete(f"{BASE_URL}/api/notifications/scheduled/{cid}").status_code == 200
        assert s.delete(f"{BASE_URL}/api/notifications/scheduled/{cid}").status_code == 400
        # move both to the past
        async def past(db):
            await db.scheduled_notifications.update_many({"_id": {"$in": [ObjectId(sid), ObjectId(cid)]}},
                                                         {"$set": {"scheduled_at": "2020-01-01T00:00:00+00:00"}})
        mongo(past)
        r = requests.post(f"{BASE_URL}/api/notifications/scheduled/run", headers={"Authorization": f"Bearer {CRON}"})
        assert r.status_code == 200 and r.json() == {"accepted": True}
        time.sleep(4)
        lst = {x['id']: x for x in s.get(f"{BASE_URL}/api/notifications/scheduled").json()}
        print(lst[sid], lst[cid])
        assert lst[sid]['status'] == 'sent' and lst[sid]['users_sent'] == 2
        assert lst[cid]['status'] == 'cancelled'
        async def counts(db):
            return (await db.notifications.count_documents({"title": title}),
                    await db.notifications.count_documents({"title": title + '_c'}),
                    await db.notification_history.count_documents({"title": title}))
        assert mongo(counts) == (2, 0, 1)


def teardown_module(_):
    async def clean(db):
        import re
        rx = {"$regex": "^" + P}
        a = await db.notifications.delete_many({"title": rx})
        b = await db.notification_history.delete_many({"title": rx})
        c = await db.scheduled_notifications.delete_many({"payload.title": rx})
        d = await db.notification_templates.delete_many({"name": rx})
        print('cleanup', a.deleted_count, b.deleted_count, c.deleted_count, d.deleted_count)
    mongo(clean)
