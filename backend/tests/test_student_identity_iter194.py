# Student personal identity fields (full_name_en, birth_date/place, id_type/number/expiry, marital_status) - iter194
import io
import os
import time
import pytest
import requests
import pandas as pd
from pymongo import MongoClient
from bson import ObjectId

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    for line in open('/app/frontend/.env'):
        if line.startswith('REACT_APP_BACKEND_URL='):
            BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
API = f"{BASE_URL}/api"
DEPT = "698f671331cfba92c49a550c"  # قسم اختبار 180155
CREATED = []
IMPORT_SIDS = []
FIELDS = ["full_name_en", "birth_date", "birth_place", "id_type", "id_number", "id_expiry_date", "marital_status"]


def _mongo():
    env = dict(l.strip().split('=', 1) for l in open('/app/backend/.env') if '=' in l)
    c = MongoClient(env['MONGO_URL'].strip('"'))
    return c[env['DB_NAME'].strip('"')]


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    r = ses.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("login failed")
    ses.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    yield ses
    db = _mongo()
    for sid in CREATED:
        ses.delete(f"{API}/students/{sid}")
        db.students.delete_one({"_id": ObjectId(sid)})
    for sid in IMPORT_SIDS:
        for d in db.students.find({"student_id": sid, "department_id": DEPT}, {"_id": 1}):
            ses.delete(f"{API}/students/{d['_id']}")
            db.students.delete_one({"_id": d["_id"]})


def _sid():
    time.sleep(0.002)
    return f"TEST_I{int(time.time()*1000) % 10**9}"


def _create(s, **extra):
    body = {"student_id": _sid(), "full_name": "TEST_هوية", "department_id": DEPT, "level": 1, "section": ""}
    body.update(extra)
    r = s.post(f"{API}/students", json=body)
    if r.status_code == 200:
        CREATED.append(r.json()["id"])
    return r


def test_create_without_identity(s):
    r = _create(s)
    assert r.status_code == 200, r.text
    g = s.get(f"{API}/students/{r.json()['id']}").json()
    for k in FIELDS:
        assert k in g
        assert not g[k]


def test_create_with_identity_and_aliases(s):
    r = _create(s, full_name_en=" Ali Ahmed ", birth_date="14/05/2003", birth_place="المكلا",
                id_type="جواز", id_number="A12345", id_expiry_date="2027-01-31", marital_status="متزوج")
    assert r.status_code == 200, r.text
    d = r.json()
    exp = {"full_name_en": "Ali Ahmed", "birth_date": "2003-05-14", "birth_place": "المكلا", "id_type": "passport",
           "id_number": "A12345", "id_expiry_date": "2027-01-31", "marital_status": "married"}
    for k, v in exp.items():
        assert d[k] == v, (k, d[k])
    g = s.get(f"{API}/students/{d['id']}").json()
    for k, v in exp.items():
        assert g[k] == v
    # list endpoint returns fields
    lst = s.get(f"{API}/students", params={"department_id": DEPT}).json()
    items = lst if isinstance(lst, list) else lst.get("items") or lst.get("students") or []
    me = [x for x in items if x.get("id") == d["id"]]
    assert me and me[0]["id_type"] == "passport" and me[0]["full_name_en"] == "Ali Ahmed"


@pytest.mark.parametrize("field,val", [("birth_date", "2003-13-40"), ("birth_date", "abc"), ("id_expiry_date", "31/02/2027"),
                                       ("id_type", "رخصة"), ("marital_status", "خاطب")])
def test_create_invalid_rejected(s, field, val):
    r = _create(s, **{field: val})
    assert r.status_code == 400, r.text


@pytest.mark.parametrize("field,raw,exp", [("id_type", "national_id", "national_id"), ("id_type", "إقامة", "residence"),
                                           ("id_type", "Passport", "passport"), ("marital_status", "عزباء", "single"),
                                           ("marital_status", "ارملة", "widowed")])
def test_code_aliases(s, field, raw, exp):
    r = _create(s, **{field: raw})
    assert r.status_code == 200, r.text
    assert r.json()[field] == exp


def test_update_and_clear(s):
    r = _create(s, full_name_en="X Y", id_type="passport", id_number="P1", marital_status="single", birth_date="2000-01-01")
    sid = r.json()["id"]
    u = s.put(f"{API}/students/{sid}", json={"full_name_en": "New Name", "id_type": "residence", "id_expiry_date": "01/02/2026"})
    assert u.status_code == 200, u.text
    g = s.get(f"{API}/students/{sid}").json()
    assert g["full_name_en"] == "New Name" and g["id_type"] == "residence" and g["id_expiry_date"] == "2026-02-01"
    assert g["id_number"] == "P1" and g["birth_date"] == "2000-01-01"
    # clear
    u = s.put(f"{API}/students/{sid}", json={"full_name_en": "", "marital_status": "", "birth_date": "", "id_type": ""})
    assert u.status_code == 200, u.text
    g = s.get(f"{API}/students/{sid}").json()
    assert not g["full_name_en"] and not g["marital_status"] and not g["birth_date"] and not g["id_type"]
    assert g["id_number"] == "P1"
    # invalid on update
    assert s.put(f"{API}/students/{sid}", json={"birth_date": "99/99/2000"}).status_code == 400
    assert s.put(f"{API}/students/{sid}", json={"marital_status": "zzz"}).status_code == 400


def test_template_columns(s):
    r = s.get(f"{API}/template/students")
    assert r.status_code == 200
    df = pd.read_excel(io.BytesIO(r.content))
    for c in ["الاسم بالإنجليزية", "تاريخ الميلاد", "مكان الميلاد", "نوع الوثيقة", "رقم الوثيقة", "تاريخ انتهاء الوثيقة", "الحالة الاجتماعية"]:
        assert c in df.columns, (c, list(df.columns))


def test_import_identity_lenient(s):
    a, b = _sid(), _sid()
    IMPORT_SIDS.extend([a, b])
    df = pd.DataFrame({"رقم القيد": [a, b], "اسم الطالب": ["TEST_استيراد1", "TEST_استيراد2"],
                       "الاسم بالإنجليزية": ["Imp One", ""], "تاريخ الميلاد": ["14/05/2003", "bad-date"],
                       "مكان الميلاد": ["سيئون", ""], "نوع الوثيقة": ["جواز سفر", "رخصة"], "رقم الوثيقة": [12345, ""],
                       "تاريخ انتهاء الوثيقة": ["2028-01-31", ""], "الحالة الاجتماعية": ["أعزب", "غير"]})
    buf = io.BytesIO(); df.to_excel(buf, index=False); buf.seek(0)
    r = s.post(f"{API}/import/students", params={"department_id": DEPT, "level": 1},
               files={"file": ("t.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert r.status_code == 200, r.text
    db = _mongo()
    d1 = db.students.find_one({"student_id": a, "department_id": DEPT})
    d2 = db.students.find_one({"student_id": b, "department_id": DEPT})
    assert d1 and d2, r.text
    assert d1["full_name_en"] == "Imp One" and d1["birth_date"] == "2003-05-14" and d1["birth_place"] == "سيئون"
    assert d1["id_type"] == "passport" and str(d1["id_number"]) == "12345" and d1["id_expiry_date"] == "2028-01-31"
    assert d1["marital_status"] == "single"
    assert not d2.get("birth_date") and not d2.get("id_type") and not d2.get("marital_status")


def test_export_includes_identity(s):
    r = _create(s, full_name_en="Export Guy", id_type="passport", id_number="EXP9", marital_status="divorced")
    r2 = s.get(f"{API}/export/students", params={"department_id": DEPT})
    assert r2.status_code == 200
    df = pd.read_excel(io.BytesIO(r2.content))
    cols = list(df.columns)
    if "الاسم بالإنجليزية" not in cols:
        # header row may be offset
        for i in range(min(6, len(df))):
            if "الاسم بالإنجليزية" in [str(x) for x in df.iloc[i].tolist()]:
                df.columns = [str(x) for x in df.iloc[i].tolist()]; df = df.iloc[i + 1:]; break
    assert "الاسم بالإنجليزية" in df.columns and "الحالة الاجتماعية" in df.columns
    row = df[df["الاسم بالإنجليزية"] == "Export Guy"]
    assert len(row) == 1
    assert row.iloc[0]["الحالة الاجتماعية"] == "مطلق"
