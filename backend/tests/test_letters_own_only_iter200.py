# Letters module: "own letters only" isolation for non-admin (issued_by/created_by == user id); admin sees all; people search unscoped
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
TAG = "TEST_OWN200_" + uuid.uuid4().hex[:6]
ST = {}
CREATED = []


def _login(u, p):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        pytest.skip(f"login {u} failed {r.status_code}")
    d = r.json()
    s.headers.update({"Authorization": f"Bearer {d.get('access_token') or d.get('token')}"})
    s.me = s.get(f"{BASE_URL}/api/auth/me").json()
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


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin):
    yield
    for lid in CREATED:
        r = admin.delete(f"{BASE_URL}/api/letters/{lid}")
        if r.status_code != 200:
            admin.post(f"{BASE_URL}/api/letters/{lid}/revoke")
            print("could not delete", lid, r.status_code, r.text[:100])


def _payload(subject):
    return {"subject": subject, "body": "<p>نص اختبار</p>", "recipient": {"name": "TEST_جهة", "title": "TEST"}, "people": []}


# --- list scoping baseline
def test_lists_scoped(admin, salim, saeed):
    a = admin.get(f"{BASE_URL}/api/letters", params={"limit": 1000}); assert a.status_code == 200
    ST["admin_total"] = len(a.json()); print("admin total", ST["admin_total"])
    for s in (salim, saeed):
        r = s.get(f"{BASE_URL}/api/letters", params={"limit": 1000}); assert r.status_code == 200
        uid = s.me["id"]
        for x in r.json():
            assert x.get("issued_by") == uid or x.get("created_by") == uid, x
        print(s.me.get("username"), "sees", len(r.json()))
    assert ST["admin_total"] > 0


# --- draft by Salim: owner sees, Saeed forbidden everywhere, admin sees
def test_salim_draft_isolation(admin, salim, saeed):
    r = salim.post(f"{BASE_URL}/api/letters/draft", json=_payload(f"{TAG}_d"))
    assert r.status_code == 200, r.text
    lid = r.json()["id"]; CREATED.append(lid); ST["d"] = lid
    assert lid in {x["id"] for x in salim.get(f"{BASE_URL}/api/letters", params={"q": TAG}).json()}
    assert lid not in {x["id"] for x in saeed.get(f"{BASE_URL}/api/letters", params={"q": TAG}).json()}
    assert lid not in {x["id"] for x in saeed.get(f"{BASE_URL}/api/letters", params={"limit": 1000}).json()}
    assert lid in {x["id"] for x in admin.get(f"{BASE_URL}/api/letters", params={"q": TAG}).json()}
    assert salim.get(f"{BASE_URL}/api/letters/{lid}").status_code == 200
    assert salim.get(f"{BASE_URL}/api/letters/{lid}/pdf").status_code == 200
    assert admin.get(f"{BASE_URL}/api/letters/{lid}").status_code == 200
    codes = {
        "get": saeed.get(f"{BASE_URL}/api/letters/{lid}").status_code,
        "pdf": saeed.get(f"{BASE_URL}/api/letters/{lid}/pdf").status_code,
        "docx": saeed.get(f"{BASE_URL}/api/letters/{lid}/docx").status_code,
        "dup": saeed.post(f"{BASE_URL}/api/letters/{lid}/duplicate").status_code,
        "delete": saeed.delete(f"{BASE_URL}/api/letters/{lid}").status_code,
        "finalize": saeed.post(f"{BASE_URL}/api/letters/{lid}/finalize").status_code,
        "revoke": saeed.post(f"{BASE_URL}/api/letters/{lid}/revoke").status_code,
        "restore": saeed.post(f"{BASE_URL}/api/letters/{lid}/restore").status_code,
        "edit_draft": saeed.post(f"{BASE_URL}/api/letters/draft", json={**_payload("hack"), "draft_id": lid}).status_code,
    }
    print(codes)
    assert all(c == 403 for c in codes.values()), codes
    # still intact
    g = salim.get(f"{BASE_URL}/api/letters/{lid}").json()
    assert g["status"] == "draft" and not g.get("is_revoked") and g["subject"] == f"{TAG}_d"


# --- Salim duplicate + finalize own draft, then Saeed still can't see issued letter
def test_salim_finalize_own(salim, saeed):
    d = salim.post(f"{BASE_URL}/api/letters/{ST['d']}/duplicate"); assert d.status_code == 200, d.text
    CREATED.append(d.json()["id"])
    f = salim.post(f"{BASE_URL}/api/letters/{ST['d']}/finalize"); assert f.status_code == 200, f.text
    ST["token"] = f.json()["token"]
    assert saeed.get(f"{BASE_URL}/api/letters/{ST['d']}").status_code == 403
    assert salim.get(f"{BASE_URL}/api/letters/{ST['d']}/docx").status_code == 200
    v = requests.get(f"{BASE_URL}/api/verify/letter/{ST['token']}"); assert v.status_code == 200 and v.json()["valid"] is True
    assert salim.post(f"{BASE_URL}/api/letters/{ST['d']}/revoke").status_code == 200
    v = requests.get(f"{BASE_URL}/api/verify/letter/{ST['token']}").json(); assert v["valid"] is False


# --- admin letter invisible to Salim
def test_admin_issue_invisible(admin, salim):
    r = admin.post(f"{BASE_URL}/api/letters/issue", json=_payload(f"{TAG}_adm")); assert r.status_code == 200, r.text
    lid = r.json()["id"]; ST["adm"] = lid
    assert admin.get(f"{BASE_URL}/api/letters/{lid}/pdf").status_code == 200
    assert salim.get(f"{BASE_URL}/api/letters/{lid}").status_code == 403
    assert lid not in {x["id"] for x in salim.get(f"{BASE_URL}/api/letters", params={"q": TAG}).json()}
    admin.post(f"{BASE_URL}/api/letters/{lid}/revoke")


# --- people search unscoped
@pytest.mark.parametrize("kind", ["student", "teacher", "employee"])
def test_people_unscoped(admin, salim, kind):
    a = admin.get(f"{BASE_URL}/api/letters/people", params={"kind": kind, "q": ""}).json()
    s = salim.get(f"{BASE_URL}/api/letters/people", params={"kind": kind, "q": ""})
    assert s.status_code == 200
    print(kind, len(a), len(s.json()))
    assert {x["id"] for x in s.json()} == {x["id"] for x in a}


# --- overtime register
def test_overtime_register(admin, salim, saeed):
    a = admin.get(f"{BASE_URL}/api/reports/teacher-workload/letters"); assert a.status_code == 200
    print("admin overtime", a.json()["count"])
    for s in (salim, saeed):
        r = s.get(f"{BASE_URL}/api/reports/teacher-workload/letters")
        print(s.me.get("username"), r.status_code, r.text[:150])
        assert r.status_code in (200, 403)
        if r.status_code == 200:
            assert r.json()["count"] == 0 or all(x["created_by"] == s.me.get("full_name") for x in r.json()["items"])
