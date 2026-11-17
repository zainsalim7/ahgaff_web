# Nationality unification: create/update validation + normalization, Excel import nationality_msg (iter193)
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
    for sid in CREATED:
        ses.delete(f"{API}/students/{sid}")
    db = _mongo()
    for sid in CREATED:
        db.students.delete_one({"_id": ObjectId(sid)})


def _sid():
    return f"TEST_N{int(time.time()*1000) % 10**9}"


def _create(s, nat):
    return s.post(f"{API}/students", json={"student_id": _sid(), "full_name": "TEST_جنسية", "department_id": DEPT,
                                            "level": 1, "section": "", "nationality": nat})


# --- create validation
def test_create_unknown_rejected(s):
    r = _create(s, "مريخي")
    assert r.status_code == 400
    assert r.json()["detail"] == "اختر الجنسية من القائمة المعتمدة"


@pytest.mark.parametrize("raw,exp", [("يمنية", "يمني"), ("إندونيسية", "إندونيسي"), ("يمنى", "يمني"), ("اليمني", "يمني"), ("سعودي", "سعودي")])
def test_create_variant_normalized(s, raw, exp):
    r = _create(s, raw)
    assert r.status_code == 200, r.text
    CREATED.append(r.json()["id"])
    assert r.json()["nationality"] == exp
    g = s.get(f"{API}/students/{r.json()['id']}")
    assert g.status_code == 200 and g.json()["nationality"] == exp


def test_create_empty_allowed(s):
    r = _create(s, "")
    assert r.status_code == 200, r.text
    CREATED.append(r.json()["id"])


# --- update validation
def test_update_unknown_rejected_and_variant_normalized(s):
    r = _create(s, "يمني")
    sid = r.json()["id"]; CREATED.append(sid)
    u = s.put(f"{API}/students/{sid}", json={"nationality": "مريخي"})
    assert u.status_code == 400
    assert u.json()["detail"] == "اختر الجنسية من القائمة المعتمدة"
    u = s.put(f"{API}/students/{sid}", json={"nationality": "مصرية"})
    assert u.status_code == 200 and u.json()["nationality"] == "مصري"


def test_update_unchanged_legacy_allowed(s):
    db = _mongo()
    r = _create(s, "يمني")
    sid = r.json()["id"]; CREATED.append(sid)
    db.students.update_one({"_id": ObjectId(sid)}, {"$set": {"nationality": "قمري"}})  # legacy unknown
    u = s.put(f"{API}/students/{sid}", json={"nationality": "قمري", "full_name": "TEST_جنسية2"})
    assert u.status_code == 200, u.text
    assert u.json()["nationality"] == "قمري"
    db.students.update_one({"_id": ObjectId(sid)}, {"$set": {"nationality": "إندونيسية"}})  # legacy variant
    u = s.put(f"{API}/students/{sid}", json={"nationality": "إندونيسية"})
    assert u.status_code == 200 and u.json()["nationality"] == "إندونيسي"


# --- Excel import
def test_import_nationality_msg(s):
    ids = [_sid() + str(i) for i in range(4)]
    df = pd.DataFrame({"رقم القيد": ids, "اسم الطالب": ["TEST_imp"] * 4,
                       "الجنسية": ["إندونيسية", "يمنى", "مريخي", "سعودي"]})
    buf = io.BytesIO(); df.to_excel(buf, index=False); buf.seek(0)
    r = s.post(f"{API}/import/students?department_id={DEPT}&level=1",
               files={"file": ("t.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert r.status_code == 200, r.text
    d = r.json()
    CREATED.extend(d.get("imported_ids", []))
    print(d.get("nationality_msg"))
    assert len(d["imported_ids"]) == 4
    msg = d["nationality_msg"]
    assert "إندونيسية ← إندونيسي" in msg and "يمنى ← يمني" in msg
    assert "مريخي" in msg and "غير موجودة" in msg
    assert "سعودي ←" not in msg
    db = _mongo()
    nats = {x["student_id"]: x.get("nationality") for x in db.students.find({"student_id": {"$in": ids}, "department_id": DEPT})}
    assert nats[ids[0]] == "إندونيسي" and nats[ids[1]] == "يمني" and nats[ids[2]] == "مريخي" and nats[ids[3]] == "سعودي"


def test_import_no_nationality_column_empty_msg(s):
    df = pd.DataFrame({"رقم القيد": [_sid() + "x"], "اسم الطالب": ["TEST_imp"]})
    buf = io.BytesIO(); df.to_excel(buf, index=False); buf.seek(0)
    r = s.post(f"{API}/import/students?department_id={DEPT}&level=1",
               files={"file": ("t.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert r.status_code == 200, r.text
    CREATED.extend(r.json().get("imported_ids", []))
    assert not r.json().get("nationality_msg")
