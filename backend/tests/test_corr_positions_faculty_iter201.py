# Faculty-scoped correspondence positions (general vs faculty), default signer per faculty, letters recipients/draft signer
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
FAC_SALIM = "698e4f9297fef774e66e93a4"
FAC_OTHER = "698e4fb497fef774e66e93a6"
MARK = "TEST201_" + uuid.uuid4().hex[:5]
CREATED_POS, CREATED_LETTERS = [], []


def _login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        pytest.skip(f"login {u} failed {r.status_code}")
    d = r.json()
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {d.get('access_token') or d.get('token')}"})
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


def payload(title, fac=None, default=False, **kw):
    return {"title_ar": f"{MARK}_{title}", "holder_name": f"{MARK} holder {title}", "honorific": "الدكتور", "kind": "INTERNAL",
            "is_default_signer": default, "faculty_id": fac, **kw}


def create(s, title, fac=None, default=False, expect=200):
    r = s.post(f"{BASE_URL}/api/correspondence/positions", json=payload(title, fac, default))
    assert r.status_code == expect, r.text
    if r.status_code == 200:
        CREATED_POS.append(r.json()["id"])
        return r.json()
    return None


def ids(s, kind=None):
    r = s.get(f"{BASE_URL}/api/correspondence/positions", params={"kind": kind} if kind else {})
    assert r.status_code == 200
    return {p["id"]: p for p in r.json()["items"]}


@pytest.fixture(scope="module")
def setup(admin):
    gen = create(admin, "general")
    a = create(admin, "facA", FAC_SALIM)
    b = create(admin, "facB", FAC_OTHER)
    yield {"gen": gen, "a": a, "b": b}
    for lid in CREATED_LETTERS:
        admin.delete(f"{BASE_URL}/api/letters/{lid}")
    # remove test positions entirely (direct DB cleanup by id only)
    from pymongo import MongoClient
    from bson import ObjectId
    from dotenv import dotenv_values
    env = dotenv_values("/app/backend/.env")
    db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
    db.correspondence_positions.delete_many({"_id": {"$in": [ObjectId(i) for i in CREATED_POS]}})
    # restore general default signer flag to رئيس الجامعة (in case a test touched it)
    db.correspondence_positions.update_one({"_id": ObjectId("6ac51feeb2c965d595bd6ca3")}, {"$set": {"is_default_signer": True}})


# --- visibility ---
def test_admin_sees_all(admin, setup):
    v = ids(admin)
    assert setup["gen"]["id"] in v and setup["a"]["id"] in v and setup["b"]["id"] in v
    assert v[setup["a"]["id"]]["faculty_name"]


def test_salim_sees_general_and_own_only(salim, setup):
    v = ids(salim)
    assert setup["gen"]["id"] in v and setup["a"]["id"] in v
    assert setup["b"]["id"] not in v


def test_saeed_sees_general_and_other_only(saeed, setup):
    v = ids(saeed)
    assert setup["gen"]["id"] in v and setup["b"]["id"] in v
    assert setup["a"]["id"] not in v


def test_kind_internal_filter(salim, setup):
    v = ids(salim, "INTERNAL")
    assert setup["a"]["id"] in v and setup["b"]["id"] not in v


def test_recipients_filter(salim, saeed, setup):
    r1 = {x["id"] for x in salim.get(f"{BASE_URL}/api/letters/recipients").json()}
    r2 = {x["id"] for x in saeed.get(f"{BASE_URL}/api/letters/recipients").json()}
    assert setup["a"]["id"] in r1 and setup["b"]["id"] not in r1 and setup["gen"]["id"] in r1
    assert setup["b"]["id"] in r2 and setup["a"]["id"] not in r2


# --- create/edit/disable guards ---
def test_salim_cannot_create_general(salim, setup):
    create(salim, "salim_gen", None, expect=403)


def test_salim_cannot_create_other_faculty(salim, setup):
    create(salim, "salim_other", FAC_OTHER, expect=403)


def test_salim_create_edit_disable_own(salim, setup):
    p = create(salim, "salim_own", FAC_SALIM)
    assert p["faculty_id"] == FAC_SALIM
    body = payload("salim_own_edited", FAC_SALIM)
    r = salim.put(f"{BASE_URL}/api/correspondence/positions/{p['id']}", json=body)
    assert r.status_code == 200 and r.json()["title_ar"].endswith("salim_own_edited")
    r = salim.delete(f"{BASE_URL}/api/correspondence/positions/{p['id']}")
    assert r.status_code == 200
    assert p["id"] not in ids(salim)


def test_salim_cannot_edit_general_or_other(salim, setup):
    r = salim.put(f"{BASE_URL}/api/correspondence/positions/{setup['gen']['id']}", json=payload("x", None))
    assert r.status_code == 403
    r = salim.put(f"{BASE_URL}/api/correspondence/positions/{setup['b']['id']}", json=payload("x", FAC_OTHER))
    assert r.status_code == 403
    r = salim.delete(f"{BASE_URL}/api/correspondence/positions/{setup['b']['id']}")
    assert r.status_code == 403
    r = salim.delete(f"{BASE_URL}/api/correspondence/positions/{setup['gen']['id']}")
    assert r.status_code == 403


def test_salim_cannot_move_scope(salim, setup):
    r = salim.put(f"{BASE_URL}/api/correspondence/positions/{setup['a']['id']}", json=payload("moved", FAC_OTHER))
    assert r.status_code == 403
    r = salim.put(f"{BASE_URL}/api/correspondence/positions/{setup['a']['id']}", json=payload("moved", None))
    assert r.status_code == 403
    r = salim.put(f"{BASE_URL}/api/correspondence/positions/{setup['b']['id']}", json=payload("moved", FAC_SALIM))
    assert r.status_code == 403


def test_saeed_guard(saeed, setup):
    create(saeed, "saeed_a", FAC_SALIM, expect=403)
    create(saeed, "saeed_gen", None, expect=403)
    p = create(saeed, "saeed_own", FAC_OTHER)
    assert p["faculty_id"] == FAC_OTHER


def test_admin_manage_general(admin, setup):
    r = admin.put(f"{BASE_URL}/api/correspondence/positions/{setup['gen']['id']}", json=payload("general_edited", None))
    assert r.status_code == 200 and r.json()["faculty_id"] is None


# --- default signer per faculty ---
def _draft(s, **kw):
    r = s.post(f"{BASE_URL}/api/letters/draft", json={"subject": f"{MARK} subj", "body": "<p>نص</p>", "recipient": {}, **kw})
    assert r.status_code == 200, r.text
    lid = r.json()["id"]
    CREATED_LETTERS.append(lid)
    g = s.get(f"{BASE_URL}/api/letters/{lid}")
    assert g.status_code == 200
    return g.json()


def test_default_signer_unique_per_faculty(admin, setup):
    d1 = create(admin, "defA1", FAC_SALIM, default=True)
    d2 = create(admin, "defA2", FAC_SALIM, default=True)
    v = ids(admin)
    assert v[d2["id"]]["is_default_signer"] is True
    assert v[d1["id"]]["is_default_signer"] is False
    # general default untouched
    assert v["6ac51feeb2c965d595bd6ca3"]["is_default_signer"] is True
    setup["defA"] = d2


def test_salim_draft_uses_faculty_default(salim, setup):
    d = _draft(salim)
    assert d.get("signatory_position_id") == setup["defA"]["id"], d.get("signatory_position_id")
    assert "defA2" in d.get("signatory_title", "")


def test_saeed_draft_falls_back_general(saeed, setup):
    d = _draft(saeed)
    assert d.get("signatory_position_id") == "6ac51feeb2c965d595bd6ca3"
    assert "رئيس الجامعة" in d.get("signatory_title", "")


def test_salim_explicit_signatory(salim, setup):
    d = _draft(salim, signatory_position_id="6ac51feeb2c965d595bd6ca3")
    assert d.get("signatory_position_id") == "6ac51feeb2c965d595bd6ca3"
    assert "رئيس الجامعة" in d.get("signatory_title", "")


def test_salim_cannot_use_other_faculty_position_as_signatory(salim, setup):
    """Isolation: Salim passes other faculty's position id as signatory — ideally rejected/ignored"""
    d = _draft(salim, signatory_position_id=setup["b"]["id"])
    assert setup["b"]["id"] != d.get("signatory_position_id") or "facB" not in d.get("signatory_title", ""), \
        "Salim can sign with other faculty's isolated position (leak)"
