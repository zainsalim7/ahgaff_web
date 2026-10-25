# HR employees list: sort_dir param (asc default / desc) + filters/pagination regression
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')


@pytest.fixture(scope='module')
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get('access_token') or r.json().get('token')
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def names(r):
    assert r.status_code == 200, r.text
    return [e.get('full_name') for e in r.json()['employees']]


def test_default_is_asc(client):
    d = names(client.get(f"{BASE_URL}/api/hr/employees", params={"per_page": 200}))
    a = names(client.get(f"{BASE_URL}/api/hr/employees", params={"per_page": 200, "sort_dir": "asc"}))
    assert d == a
    assert len(d) > 1


def test_desc_is_reverse(client):
    a = names(client.get(f"{BASE_URL}/api/hr/employees", params={"per_page": 200, "sort_dir": "asc"}))
    d = names(client.get(f"{BASE_URL}/api/hr/employees", params={"per_page": 200, "sort_dir": "desc"}))
    total = client.get(f"{BASE_URL}/api/hr/employees", params={"per_page": 200}).json()['total']
    if total <= 200:
        assert d == list(reversed(a))
    assert a[0] != d[0]


def test_pagination_with_desc(client):
    p1 = client.get(f"{BASE_URL}/api/hr/employees", params={"per_page": 5, "page": 1, "sort_dir": "desc"}).json()
    p2 = client.get(f"{BASE_URL}/api/hr/employees", params={"per_page": 5, "page": 2, "sort_dir": "desc"}).json()
    full = names(client.get(f"{BASE_URL}/api/hr/employees", params={"per_page": 10, "sort_dir": "desc"}))
    got = [e['full_name'] for e in p1['employees']] + [e['full_name'] for e in p2['employees']]
    assert got == full[:len(got)]
    assert p1['page'] == 1 and p2['page'] == 2


def test_filter_with_sort(client):
    r = client.get(f"{BASE_URL}/api/hr/employees", params={"per_page": 200}).json()
    cats = {e.get('category') for e in r['employees'] if e.get('category')}
    if not cats:
        pytest.skip("no categories")
    c = sorted(cats)[0]
    a = client.get(f"{BASE_URL}/api/hr/employees", params={"per_page": 200, "category": c, "sort_dir": "asc"}).json()
    d = client.get(f"{BASE_URL}/api/hr/employees", params={"per_page": 200, "category": c, "sort_dir": "desc"}).json()
    assert a['total'] == d['total']
    assert all(e['category'] == c for e in a['employees'])
    assert [e['full_name'] for e in d['employees']] == list(reversed([e['full_name'] for e in a['employees']]))


def test_invalid_sort_dir_falls_back_to_asc(client):
    a = names(client.get(f"{BASE_URL}/api/hr/employees", params={"per_page": 50, "sort_dir": "asc"}))
    x = names(client.get(f"{BASE_URL}/api/hr/employees", params={"per_page": 50, "sort_dir": "garbage"}))
    assert a == x


def test_no_mongo_id_leak(client):
    r = client.get(f"{BASE_URL}/api/hr/employees", params={"per_page": 5, "sort_dir": "desc"}).json()
    for e in r['employees']:
        assert '_id' not in e


def test_alumni_endpoint_ok(client):
    r = client.get(f"{BASE_URL}/api/alumni")
    assert r.status_code == 200
    assert 'items' in r.json()
