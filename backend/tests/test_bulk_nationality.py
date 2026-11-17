# Bulk student nationality: approved list, stats, bulk-set (scope/perm/validation)
import os
import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv('/app/frontend/.env')
load_dotenv('/app/backend/.env')
BASE = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/') + '/api'
FAC_A4 = '698e4f9297fef774e66e93a4'   # 20 students يمني
FAC_A6 = '698e4fb497fef774e66e93a6'   # 72 students إندونيسية
DEPT_A9 = '698e501d97fef774e66e93a9'  # dept of FAC_A6 (Saeed's dept)
DEPT_A8 = '698e500997fef774e66e93a8'  # dept of FAC_A4

db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]


def _q(fac):
    deps = [str(d['_id']) for d in db.departments.find({'faculty_id': fac})]
    return {'$or': [{'faculty_id': fac}, {'department_id': {'$in': deps}}]}


@pytest.fixture(scope='module', autouse=True)
def restore():
    yield
    db.students.update_many(_q(FAC_A4), {'$set': {'nationality': 'يمني'}})
    db.students.update_many(_q(FAC_A6), {'$set': {'nationality': 'إندونيسية'}})
    db.settings.delete_one({'type': 'student_nationalities'})


def login(u, p):
    r = requests.post(f"{BASE}/auth/login", json={"username": u, "password": p})
    assert r.status_code == 200, r.text
    d = r.json()
    s = requests.Session()
    s.headers['Authorization'] = 'Bearer ' + (d.get('access_token') or d.get('token'))
    return s


@pytest.fixture(scope='module')
def admin():
    return login('admin', 'admin123')


@pytest.fixture(scope='module')
def saeed():
    return login('Saeed', 'test1234')


class TestList:
    def test_get_default_list(self, admin):
        r = admin.get(f"{BASE}/admin/students/nationalities")
        assert r.status_code == 200
        items = r.json()['items']
        assert 'يمني' in items and 'إندونيسية' not in items and len(items) >= 30

    def test_saeed_put_forbidden(self, saeed):
        r = saeed.put(f"{BASE}/admin/students/nationalities", json={"items": ["يمني"]})
        assert r.status_code == 403

    def test_saeed_can_read_list(self, saeed):
        assert saeed.get(f"{BASE}/admin/students/nationalities").status_code == 200

    def test_put_empty_rejected(self, admin):
        r = admin.put(f"{BASE}/admin/students/nationalities", json={"items": ["  ", ""]})
        assert r.status_code == 400

    def test_put_add_dedupe_and_persist(self, admin):
        items = admin.get(f"{BASE}/admin/students/nationalities").json()['items']
        r = admin.put(f"{BASE}/admin/students/nationalities", json={"items": items + ['TEST_نات', ' TEST_نات ', 'يمني']})
        assert r.status_code == 200
        got = admin.get(f"{BASE}/admin/students/nationalities").json()['items']
        assert got.count('TEST_نات') == 1 and got.count('يمني') == 1
        # restore
        db.settings.delete_one({'type': 'student_nationalities'})


class TestStats:
    def test_stats_faculty_a6(self, admin):
        r = admin.get(f"{BASE}/admin/students/nationality-stats", params={'faculty_id': FAC_A6})
        assert r.status_code == 200
        d = r.json()
        assert d['total'] == 72
        st = {x['nationality']: x for x in d['stats']}
        assert st['إندونيسية']['count'] == 72 and st['إندونيسية']['in_list'] is False

    def test_stats_dept_a8(self, admin):
        d = admin.get(f"{BASE}/admin/students/nationality-stats", params={'department_id': DEPT_A8}).json()
        assert d['total'] == 20 and d['stats'][0]['nationality'] == 'يمني' and d['stats'][0]['in_list'] is True

    def test_saeed_stats_out_of_scope_empty(self, saeed):
        r = saeed.get(f"{BASE}/admin/students/nationality-stats", params={'faculty_id': FAC_A4})
        assert r.status_code == 200 and r.json()['total'] == 0

    def test_saeed_stats_own_dept(self, saeed):
        r = saeed.get(f"{BASE}/admin/students/nationality-stats", params={'department_id': DEPT_A9})
        assert r.status_code == 200 and r.json()['total'] == 72


class TestBulkSet:
    def test_reject_not_in_list(self, admin):
        r = admin.post(f"{BASE}/admin/students/bulk-set-nationality", json={'nationality': 'إندونيسية', 'faculty_id': FAC_A6})
        assert r.status_code == 400

    def test_reject_no_scope(self, admin):
        r = admin.post(f"{BASE}/admin/students/bulk-set-nationality", json={'nationality': 'يمني'})
        assert r.status_code == 400

    def test_from_nationality_filter(self, admin):
        r = admin.post(f"{BASE}/admin/students/bulk-set-nationality",
                       json={'nationality': 'سعودي', 'faculty_id': FAC_A4, 'from_nationality': 'مصري'})
        assert r.status_code == 200 and r.json()['updated'] == 0
        assert db.students.count_documents({'$and': [_q(FAC_A4), {'nationality': 'يمني'}]}) == 20

    def test_faculty_apply_and_persist(self, admin):
        r = admin.post(f"{BASE}/admin/students/bulk-set-nationality",
                       json={'nationality': 'إندونيسي', 'faculty_id': FAC_A6, 'from_nationality': 'إندونيسية'})
        assert r.status_code == 200 and r.json()['updated'] == 72
        d = admin.get(f"{BASE}/admin/students/nationality-stats", params={'faculty_id': FAC_A6}).json()
        assert d['stats'] == [{'nationality': 'إندونيسي', 'count': 72, 'in_list': True}]
        # other faculty untouched
        assert db.students.count_documents({'$and': [_q(FAC_A4), {'nationality': 'يمني'}]}) == 20

    def test_student_ids(self, admin):
        ids = [str(s['_id']) for s in db.students.find(_q(FAC_A4), {'_id': 1}).limit(3)]
        r = admin.post(f"{BASE}/admin/students/bulk-set-nationality", json={'nationality': 'عماني', 'student_ids': ids + ['bad']})
        assert r.status_code == 200 and r.json()['updated'] == 3
        assert db.students.count_documents({'_id': {'$in': [ObjectId(i) for i in ids]}, 'nationality': 'عماني'}) == 3

    def test_saeed_out_of_scope_no_update(self, saeed):
        r = saeed.post(f"{BASE}/admin/students/bulk-set-nationality", json={'nationality': 'مصري', 'faculty_id': FAC_A4})
        assert r.status_code == 200 and r.json()['updated'] == 0
        assert db.students.count_documents({'$and': [_q(FAC_A4), {'nationality': 'مصري'}]}) == 0

    def test_saeed_out_of_scope_ids_no_update(self, saeed):
        ids = [str(s['_id']) for s in db.students.find(_q(FAC_A4), {'_id': 1}).limit(2)]
        r = saeed.post(f"{BASE}/admin/students/bulk-set-nationality", json={'nationality': 'مصري', 'student_ids': ids})
        assert r.status_code == 200 and r.json()['updated'] == 0

    def test_saeed_own_dept(self, saeed):
        r = saeed.post(f"{BASE}/admin/students/bulk-set-nationality", json={'nationality': 'ماليزي', 'department_id': DEPT_A9})
        assert r.status_code == 200 and r.json()['updated'] == 72

    def test_no_perm_user_forbidden(self):
        s = login('teacher180156', 'teacher123')
        assert s.post(f"{BASE}/admin/students/bulk-set-nationality", json={'nationality': 'يمني', 'faculty_id': FAC_A4}).status_code == 403
        assert s.get(f"{BASE}/admin/students/nationality-stats", params={'faculty_id': FAC_A4}).status_code == 403
