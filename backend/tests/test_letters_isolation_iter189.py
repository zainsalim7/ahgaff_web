# Letters module: general-letter faculty isolation (dean/department_head) + issue/draft/finalize/duplicate regression
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
SAEED_FAC = "698e4fb497fef774e66e93a6"
SALIM_FAC = "698e4f9297fef774e66e93a4"
TAG = "TEST_ISO189_" + uuid.uuid4().hex[:6]
CREATED = []  # ids of letters created (cleaned up by mongo by id at end of run)


def _login(u, p):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        pytest.skip(f"login {u} failed {r.status_code}")
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("admin", "admin123")


@pytest.fixture(scope="module")
def salim():
    return _login("Salim", "test1234")


@pytest.fixture(scope="module")
def saeed():
    return _login("Saeed", "test1234")


def _payload(subject):
    return {"subject": subject, "body": "<p><span style=\"font-family:Tajawal;color:#c00\"><b>نص</b></span> اختبار</p>",
            "recipient": {"name": "TEST_جهة", "title": "TEST"}, "people": []}


def _ids(sess, q):
    r = sess.get(f"{BASE_URL}/api/letters", params={"q": q})
    assert r.status_code == 200, r.text
    return {x["id"] for x in r.json()}, r.json()


ST = {}


# --- isolation: general letter issued by department head
def test_saeed_issue_general(saeed):
    r = saeed.post(f"{BASE_URL}/api/letters/issue", json=_payload(f"{TAG}_saeed"))
    assert r.status_code == 200, r.text
    ST["saeed"] = r.json()["id"]; CREATED.append(ST["saeed"])
    g = saeed.get(f"{BASE_URL}/api/letters/{ST['saeed']}")
    assert g.status_code == 200
    assert g.json().get("created_by_faculty_ids") == [SAEED_FAC]


def test_saeed_letter_visibility(admin, salim, saeed):
    sid = ST["saeed"]
    assert sid in _ids(saeed, f"{TAG}_saeed")[0]
    assert sid in _ids(admin, f"{TAG}_saeed")[0]
    assert sid not in _ids(salim, f"{TAG}_saeed")[0], "dean of a different faculty sees dept-head general letter"
    assert salim.get(f"{BASE_URL}/api/letters/{sid}").status_code == 403


def test_salim_issue_general_isolated(admin, salim, saeed):
    r = salim.post(f"{BASE_URL}/api/letters/issue", json=_payload(f"{TAG}_salim"))
    assert r.status_code == 200, r.text
    lid = r.json()["id"]; CREATED.append(lid); ST["salim"] = lid
    assert salim.get(f"{BASE_URL}/api/letters/{lid}").json().get("created_by_faculty_ids") == [SALIM_FAC]
    assert lid in _ids(salim, f"{TAG}_salim")[0]
    assert lid in _ids(admin, f"{TAG}_salim")[0]
    assert lid not in _ids(saeed, f"{TAG}_salim")[0]


def test_admin_general_visible_to_all(admin, salim, saeed):
    r = admin.post(f"{BASE_URL}/api/letters/issue", json=_payload(f"{TAG}_admin"))
    assert r.status_code == 200, r.text
    lid = r.json()["id"]; CREATED.append(lid)
    assert admin.get(f"{BASE_URL}/api/letters/{lid}").json().get("created_by_faculty_ids") == []
    assert lid in _ids(salim, f"{TAG}_admin")[0]
    assert lid in _ids(saeed, f"{TAG}_admin")[0]


def test_admin_sees_all(admin):
    r = admin.get(f"{BASE_URL}/api/letters", params={"limit": 1000})
    assert r.status_code == 200
    import subprocess  # noqa
    assert len(r.json()) >= 127


# --- regression: draft / finalize / duplicate for each role
@pytest.mark.parametrize("who", ["admin", "salim", "saeed"])
def test_draft_finalize_duplicate(who, admin, salim, saeed):
    s = {"admin": admin, "salim": salim, "saeed": saeed}[who]
    exp = {"admin": [], "salim": [SALIM_FAC], "saeed": [SAEED_FAC]}[who]
    r = s.post(f"{BASE_URL}/api/letters/draft", json=_payload(f"{TAG}_draft_{who}"))
    assert r.status_code == 200, r.text
    did = r.json()["id"]; CREATED.append(did)
    assert r.json()["status"] == "draft"
    assert s.get(f"{BASE_URL}/api/letters/{did}").json().get("created_by_faculty_ids") == exp
    d = s.post(f"{BASE_URL}/api/letters/{did}/duplicate")
    assert d.status_code == 200, d.text
    dup = d.json()["id"]; CREATED.append(dup)
    assert s.get(f"{BASE_URL}/api/letters/{dup}").json().get("created_by_faculty_ids") == exp
    f = s.post(f"{BASE_URL}/api/letters/{did}/finalize")
    assert f.status_code == 200, f.text
    g = s.get(f"{BASE_URL}/api/letters/{did}").json()
    assert g["status"] == "issued" and g.get("created_by_faculty_ids") == exp
    # delete duplicate draft
    assert s.delete(f"{BASE_URL}/api/letters/{dup}").status_code == 200
    CREATED.remove(dup)


def test_people_letter_regression(admin, salim):
    # find a student from Salim's faculty, issue a letter as admin with that person -> salim should see it
    from pymongo import MongoClient
    from dotenv import dotenv_values
    env = dotenv_values("/app/backend/.env")
    db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
    st = db.students.find_one({"faculty_id": SALIM_FAC}, {"_id": 1})
    if not st:
        pytest.skip("no student in Salim faculty")
    p = {"id": str(st["_id"])}
    body = _payload(f"{TAG}_people"); body["people"] = [{"kind": "student", "id": p["id"]}]
    i = admin.post(f"{BASE_URL}/api/letters/issue", json=body)
    assert i.status_code == 200, i.text
    lid = i.json()["id"]; CREATED.append(lid)
    assert lid in _ids(salim, f"{TAG}_people")[0]


def test_zz_cleanup():
    from pymongo import MongoClient
    from bson import ObjectId
    from dotenv import dotenv_values
    env = dotenv_values("/app/backend/.env")
    db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
    res = db.letters.delete_many({"_id": {"$in": [ObjectId(x) for x in CREATED]}})
    print("cleaned", res.deleted_count, "of", len(CREATED))
