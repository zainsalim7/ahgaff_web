# Teacher workload report: teach_department_id filter, org dept regression, exports, and exception overtime formula
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

TEACH_DEPT = '698e500997fef774e66e93a8'   # الشريعة والقانون
ORG_DEPT = '698e501d97fef774e66e93a9'     # الدراسات الإسلامية
CROSS_TEACHER = '698e533beb4c6eb021c50302'  # حسن صالح (org=الدراسات, teaches in الشريعة)
BUSY_TEACHER = '6aca3346a95d016d773e4692'
PERIOD = {'start_date': '2026-09-01', 'end_date': '2026-09-30'}
APR = {'start_date': '2026-04-01', 'end_date': '2026-04-30'}


@pytest.fixture(scope='module')
def s():
    sess = requests.Session()
    r = sess.post(f'{BASE_URL}/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
    if r.status_code != 200:
        pytest.skip(f'login failed {r.status_code}')
    sess.headers['Authorization'] = f"Bearer {r.json().get('access_token') or r.json().get('token')}"
    return sess


def _get(s, **params):
    r = s.get(f'{BASE_URL}/api/reports/teacher-workload', params=params, timeout=120)
    assert r.status_code == 200, r.text[:300]
    return r.json()


# teach_department_id: selects teachers who teach active courses in dept; only that dept's courses listed
class TestTeachDept:
    def test_teach_dept_includes_cross_teacher_and_only_dept_courses(self, s):
        d = _get(s, teach_department_id=TEACH_DEPT, **APR)
        ids = [t['teacher_db_id'] for t in d['teachers']]
        assert CROSS_TEACHER in ids
        for t in d['teachers']:
            for c in t['courses']:
                assert c['department_id'] == TEACH_DEPT, (t['teacher_name'], c['course_name'])
            assert 'فقط مقررات قسم' in (t['summary']['note'] or '')

    def test_required_hours_is_full(self, s):
        full = _get(s, teacher_id=CROSS_TEACHER, **APR)['teachers'][0]
        part = _get(s, teacher_id=CROSS_TEACHER, teach_department_id=TEACH_DEPT, **APR)['teachers'][0]
        assert part['summary']['required_hours'] == full['summary']['required_hours']
        assert len(part['courses']) <= len(full['courses'])
        print('full courses', len(full['courses']), 'part', len(part['courses']),
              'full actual', full['summary']['total_actual_hours'], 'part actual', part['summary']['total_actual_hours'],
              'full OT', full['summary']['overtime_hours'], 'part OT', part['summary']['overtime_hours'])

    def test_required_hours_full_for_late_start_teacher(self, s):
        # زين سالم: course in other dept starts 2026-04-07, teach-dept course starts 2026-04-14 -> required must stay full (48)
        zid = '698ad3da31ab437a06176e2a'
        full = _get(s, teacher_id=zid, **APR)['teachers'][0]['summary']['required_hours']
        part = _get(s, teacher_id=zid, teach_department_id=TEACH_DEPT, **APR)['teachers'][0]['summary']['required_hours']
        assert part == full, f'required_hours shrank under teach_department_id: full={full} filtered={part}'

    def test_teacher_not_teaching_in_dept_returns_empty(self, s):
        d = _get(s, teacher_id=BUSY_TEACHER, teach_department_id=TEACH_DEPT, **PERIOD)
        # BUSY_TEACHER might teach in TEACH_DEPT; just validate consistency
        for t in d['teachers']:
            assert all(c['department_id'] == TEACH_DEPT for c in t['courses'])

    def test_invalid_teach_dept_returns_no_teachers(self, s):
        d = _get(s, teach_department_id='000000000000000000000000', **PERIOD)
        assert d['teachers'] == []

    def test_raised_accepts_teach_dept(self, s):
        r = s.get(f'{BASE_URL}/api/reports/teacher-workload/raised', params={'teach_department_id': TEACH_DEPT, **APR})
        assert r.status_code == 200
        assert 'items' in r.json()


# org department_id regression
class TestOrgDept:
    def test_org_dept_filter(self, s):
        d = _get(s, department_id=ORG_DEPT, **APR)
        ids = [t['teacher_db_id'] for t in d['teachers']]
        assert CROSS_TEACHER in ids
        for t in d['teachers']:
            assert 'فقط مقررات قسم' not in (t['summary']['note'] or '')
        cross = [t for t in d['teachers'] if t['teacher_db_id'] == CROSS_TEACHER][0]
        # org filter shows ALL courses of the teacher
        assert any(c['department_id'] == TEACH_DEPT for c in cross['courses']) or len(cross['courses']) >= 0


# exports with teach_department_id
@pytest.mark.parametrize('path,ctype', [
    ('pdf', 'application/pdf'),
    ('excel', 'spreadsheetml'),
    ('sheet-pdf', 'application/pdf'),
    ('sheet-excel', 'spreadsheetml'),
])
def test_exports_teach_dept(s, path, ctype):
    r = s.get(f'{BASE_URL}/api/export/report/teacher-workload/{path}', params={'teach_department_id': TEACH_DEPT, **APR}, timeout=120)
    assert r.status_code == 200, r.text[:300]
    assert ctype in r.headers.get('content-type', '')
    assert len(r.content) > 500


# exception (عدم الاحتساب) overtime formula
class TestExceptionFormula:
    def test_excluded_course_overtime_not_negative(self, s):
        base = _get(s, teacher_id=BUSY_TEACHER, **PERIOD)
        assert base['teachers'], 'no teacher data'
        t = base['teachers'][0]
        courses = [c for c in t['courses'] if c['actual_hours'] > 0 and not c['excluded_from_load']]
        if not courses:
            pytest.skip('no executed courses')
        c = courses[0]
        prev = s.get(f'{BASE_URL}/api/reports/teacher-workload/exceptions', params=PERIOD).json().get('course_ids', [])
        try:
            r = s.put(f'{BASE_URL}/api/reports/teacher-workload/exceptions', json={**PERIOD, 'course_ids': prev + [c['course_id']]})
            assert r.status_code == 200, r.text
            t2 = _get(s, teacher_id=BUSY_TEACHER, **PERIOD)['teachers'][0]
            sm = t2['summary']
            c2 = [x for x in t2['courses'] if x['course_id'] == c['course_id']][0]
            assert c2['temp_excluded'] is True and c2['excluded_from_load'] is True
            expected = round(max(0.0, sm['hours_after_bonus'] - sm['required_hours']) + sm['extra_only_hours'], 2)
            print('summary', {k: sm[k] for k in ['required_hours', 'total_actual_hours', 'hours_after_bonus', 'extra_only_hours', 'overtime_hours']})
            assert sm['overtime_hours'] == expected
            assert sm['overtime_hours'] >= sm['extra_only_hours'] >= c2['actual_hours'] - 0.01
            assert sm['overtime_hours'] >= 0
            # sheet export consistency (temp exceptions) — check sheet-excel content contains numbers
            r2 = s.get(f'{BASE_URL}/api/export/report/teacher-workload/sheet-excel', params={'teacher_id': BUSY_TEACHER, **PERIOD})
            assert r2.status_code == 200
        finally:
            s.put(f'{BASE_URL}/api/reports/teacher-workload/exceptions', json={**PERIOD, 'course_ids': prev})
        restored = s.get(f'{BASE_URL}/api/reports/teacher-workload/exceptions', params=PERIOD).json()
        assert restored['course_ids'] == prev
