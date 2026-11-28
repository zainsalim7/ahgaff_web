# Video Production — NEW contract flow: required hours 2/3, admin↔teacher approval, lump-sum items, pending/confirm payments,
# statement PDF, finance separation for studio-only users, per-teacher app visibility, letterheads/settings
import os
import random
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

import sys
sys.path.insert(0, os.path.dirname(__file__))
from conftest_vp import cleanup_ids  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
VP = f"{BASE_URL}/api/video-production"
TRID = "698ad3da31ab437a06176e2a"
TZ = timezone(timedelta(hours=3))
S = {"contracts": [], "sessions": [], "users": []}


def _login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p})
    assert r.status_code == 200, f"login {u}: {r.status_code} {r.text[:200]}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def H():
    h = {"admin": _login("admin", "admin123"), "teacher": _login("222222", "teacher123"), "reg": _login("test_registrar", "test1234")}
    uname = f"TEST_vpstudio_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE_URL}/api/users", json={"username": uname, "full_name": "TEST_ موظف أستوديو", "password": "test1234",
                                                     "role": "employee", "permissions": ["vp_studio"]}, headers=h["admin"])
    assert r.status_code == 200, r.text
    S["users"].append(r.json()["id"])
    h["studio"] = _login(uname, "test1234")
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=h["studio"]).json()
    print("studio perms:", me.get("permissions"))
    return h


@pytest.fixture(scope="module", autouse=True)
def cleanup(H):
    yield
    if "orig_settings" in S:
        r = requests.put(f"{VP}/settings", json=S["orig_settings"], headers=H["admin"])
        print("restore settings", r.status_code)
    cleanup_ids(S["contracts"], S["sessions"], S["users"], [TRID])


def _new(H, **kw):
    body = {"teacher_id": TRID, "course_name": "TEST_VP فقه", "weekly_hours": 3, "start_date": datetime.now(TZ).date().isoformat(), **kw}
    r = requests.post(f"{VP}/contracts", json=body, headers=H["admin"])
    assert r.status_code == 200, r.text
    S["contracts"].append(r.json()["id"])
    return r.json()["id"]


def _st(H, cid, a, note="", who="admin"):
    return requests.post(f"{VP}/contracts/{cid}/status", json={"action": a, "note": note}, headers=H[who])


def _get(H, cid, who="admin"):
    return requests.get(f"{VP}/contracts/{cid}", headers=H[who])


def _issue(H, cid):
    assert _st(H, cid, "send").status_code == 200
    assert requests.post(f"{VP}/my/contracts/{cid}/accept", headers=H["teacher"]).status_code == 200
    assert _st(H, cid, "issue").status_code == 200


def _my_ids(H):
    return [x["id"] for x in requests.get(f"{VP}/my/contracts", headers=H["teacher"]).json()["items"]]


class TestFlow:
    # settings: letterheads list, semester_weeks + letterhead_id persist
    def test_01_settings_letterheads(self, H):
        st = requests.get(f"{VP}/settings", headers=H["admin"]).json()
        S["orig_settings"] = st
        assert len(st["studios"]) >= 2 and len(st["pipeline_steps"]) == 4 and "default_items" in st
        lh = requests.get(f"{VP}/letterheads", headers=H["admin"])
        assert lh.status_code == 200 and isinstance(lh.json(), list)
        assert requests.get(f"{VP}/letterheads", headers=H["reg"]).status_code == 403
        lid = lh.json()[0]["id"] if lh.json() else ""
        S["lid"] = lid
        r = requests.put(f"{VP}/settings", json={**st, "semester_weeks": 15, "letterhead_id": lid}, headers=H["admin"])
        assert r.status_code == 200, r.text
        g = requests.get(f"{VP}/settings", headers=H["admin"]).json()
        assert g["semester_weeks"] == 15 and g["letterhead_id"] == lid

    # required_hours = weekly_hours * semester_weeks * 2/3 (default weeks from settings)
    def test_02_required_hours(self, H):
        c1 = _get(H, _new(H, weekly_hours=3)).json()
        assert c1["semester_weeks"] == 15 and c1["course_hours"] == 45 and c1["required_hours"] == 30
        assert c1["progress"]["required_hours"] == 30 and "lectures_required" not in c1
        c2 = _get(H, _new(H, weekly_hours=2, semester_weeks=12)).json()
        assert c2["course_hours"] == 24 and c2["required_hours"] == 16
        r = requests.post(f"{VP}/contracts", json={"teacher_id": TRID, "course_name": "TEST_x", "weekly_hours": 0, "start_date": "2026-11-01"}, headers=H["admin"])
        assert r.status_code == 400
        S["c2"] = c2["id"]

    # status flow + invalid transitions + teacher visibility
    def test_03_status_flow(self, H):
        cid = _new(H, weekly_hours=4, semester_weeks=16)
        S["cid"] = cid
        assert _st(H, cid, "issue").status_code == 400
        assert _st(H, cid, "complete").status_code == 400
        assert _st(H, cid, "bogus").status_code == 400
        assert cid not in _my_ids(H)
        assert _get(H, cid, "teacher").status_code == 403  # draft hidden from teacher
        assert requests.post(f"{VP}/my/contracts/{cid}/accept", headers=H["teacher"]).status_code == 404
        assert _st(H, cid, "send").status_code == 200
        assert cid in _my_ids(H)
        assert _st(H, cid, "send").status_code == 400  # already sent
        r = requests.put(f"{VP}/contracts/{cid}", json={"teacher_id": TRID, "course_name": "TEST_VP فقه", "weekly_hours": 4, "start_date": "2026-11-01"}, headers=H["admin"])
        assert r.status_code == 400  # edit blocked while sent
        assert requests.post(f"{VP}/my/contracts/{cid}/return", json={"note": ""}, headers=H["teacher"]).status_code == 400
        assert requests.post(f"{VP}/my/contracts/{cid}/return", json={"note": "TEST_ عدّل المبلغ"}, headers=H["teacher"]).status_code == 200
        c = _get(H, cid).json()
        assert c["status"] == "returned" and c["teacher_note"] == "TEST_ عدّل المبلغ"
        assert _st(H, cid, "issue").status_code == 400
        r = requests.put(f"{VP}/contracts/{cid}", json={"teacher_id": TRID, "course_name": "TEST_VP فقه معدل", "weekly_hours": 4, "semester_weeks": 16, "start_date": "2026-11-01"}, headers=H["admin"])
        assert r.status_code == 200, r.text
        c = _get(H, cid).json()
        assert c["status"] == "draft" and c["course_name"] == "TEST_VP فقه معدل" and c["required_hours"] == round(64 * 2 / 3, 2)
        assert _st(H, cid, "send").status_code == 200
        assert _st(H, cid, "recall").status_code == 200 and _get(H, cid).json()["status"] == "draft"
        assert _st(H, cid, "send").status_code == 200
        assert requests.post(f"{VP}/my/contracts/{cid}/accept", headers=H["teacher"]).status_code == 200
        c = _get(H, cid).json()
        assert c["status"] == "teacher_accepted" and c["teacher_accepted_at"]
        assert requests.post(f"{VP}/my/contracts/{cid}/accept", headers=H["teacher"]).status_code == 400
        assert _st(H, cid, "recall").status_code == 200 and _get(H, cid).json()["teacher_accepted_at"] is None
        _issue(H, cid)
        assert _get(H, cid).json()["status"] == "issued"
        assert _st(H, cid, "recall").status_code == 400
        assert _st(H, cid, "send", who="reg").status_code == 403
        # terminate requires note
        t = _new(H)
        assert _st(H, t, "terminate").status_code == 400
        assert _st(H, t, "terminate", "TEST_ سبب").status_code == 200
        assert _get(H, t).json()["status"] == "terminated"

    # booking only when issued
    def test_04_booking_only_issued(self, H):
        d = (datetime.now(TZ) + timedelta(days=random.randint(320, 360))).date().isoformat()
        body = {"contract_id": S["c2"], "lecture_no": 1, "lecture_title": "TEST_L", "est_minutes": 30, "date": d, "start": "09:00", "studio_id": ""}
        assert requests.post(f"{VP}/sessions", json=body, headers=H["admin"]).status_code == 400  # draft
        r = requests.post(f"{VP}/sessions", json={**body, "contract_id": S["cid"]}, headers=H["admin"])
        assert r.status_code == 200, r.text
        S["sessions"].append(r.json()["id"])
        S["s1"] = r.json()["id"]
        r = requests.post(f"{VP}/sessions", json={**body, "contract_id": S["cid"], "part_no": 1, "lecture_no": 2, "est_minutes": 40, "start": "11:00"}, headers=H["admin"])
        assert r.status_code == 200
        S["sessions"].append(r.json()["id"])
        S["s2"] = r.json()["id"]

    # progress hours: recorded = actual/est minutes of parts at/after filming / 60
    def test_05_progress_hours(self, H):
        studio = S["orig_settings"]["studios"][0]["id"]
        act = lambda sid, a, **kw: requests.post(f"{VP}/sessions/{sid}/action", json={"action": a, **kw}, headers=H["admin"])
        assert act(S["s1"], "confirm", studio_id=studio).status_code == 200
        assert act(S["s2"], "confirm", studio_id=studio).status_code == 200
        p = _get(H, S["cid"]).json()["progress"]
        assert p["recorded_hours"] == 0 and p["percent"] == 0
        assert act(S["s1"], "advance", actual_minutes=50).status_code == 200  # filmed
        p = _get(H, S["cid"]).json()["progress"]
        req_min = round(64 * 2 / 3, 2) * 60
        assert p["recorded_hours"] == round(50 / 60, 2)
        assert p["percent"] == round(100 * 50 / req_min, 1)
        assert p["production_percent"] == round(100 * 50 * 0.25 / req_min, 1)
        assert act(S["s2"], "advance").status_code == 200  # filmed w/o actual -> est 40
        p = _get(H, S["cid"]).json()["progress"]
        assert p["recorded_hours"] == round(90 / 60, 2)

    # items: lump-sum accrual, partial validation, only on issued
    def test_06_items(self, H):
        cid = S["cid"]
        it = lambda k, st, amt=None, cc=cid: requests.put(f"{VP}/contracts/{cc}/items/{k}", json={"status": st, "accepted_amount": amt}, headers=H["admin"])
        assert it("spec", "accepted", cc=S["c2"]).status_code == 400  # draft contract
        assert it("nope", "accepted").status_code == 404
        assert it("spec", "weird").status_code == 400
        assert it("content", "partial").status_code == 400
        assert it("content", "partial", 100000).status_code == 400  # must be < amount
        assert it("content", "partial", 0).status_code == 400
        assert it("recording", "delivered").status_code == 200
        p = _get(H, cid).json()["progress"]
        assert p["accrued"] == 0  # delivered does not accrue (no hour-based pay)
        assert it("spec", "accepted").status_code == 200
        assert it("content", "partial", 40000).status_code == 200
        c = _get(H, cid).json()
        items = {x["key"]: x for x in c["items"]}
        assert items["content"]["accrued"] == 40000 and items["spec"]["accrued"] == 50000 and items["recording"]["accrued"] == 0
        assert c["progress"]["accrued"] == 90000 and c["progress"]["total"] == 450000 and c["progress"]["items_accepted"] == 1
        assert it("content", "accepted").status_code == 200
        assert {x["key"]: x for x in _get(H, cid).json()["items"]}["content"]["accepted_amount"] is None
        assert it("content", "partial", 40000).status_code == 200

    # payments: pending → confirm (receipt VR-) / dispute; cap; delete rules
    def test_07_payments(self, H):
        cid = S["cid"]
        pay = lambda amt, who="admin": requests.post(f"{VP}/contracts/{cid}/payments", json={"amount": amt, "stage": "TEST_دفعة"}, headers=H[who])
        assert requests.post(f"{VP}/contracts/{S['c2']}/payments", json={"amount": 1}, headers=H["admin"]).status_code == 400  # not issued
        assert pay(100, "studio").status_code == 403
        assert pay(0).status_code == 400
        assert pay(90001).status_code == 400
        r = pay(60000)
        assert r.status_code == 200 and r.json()["status"] == "pending"
        p1 = r.json()["id"]
        pr = _get(H, cid).json()["progress"]
        assert pr["paid"] == 0 and pr["pending"] == 60000 and pr["balance"] == 30000
        assert pay(30001).status_code == 400  # pending counts against cap
        # teacher sees pending payment & notification
        tc = next(x for x in requests.get(f"{VP}/my/contracts", headers=H["teacher"]).json()["items"] if x["id"] == cid)
        assert any(p["id"] == p1 and p["status"] == "pending" for p in tc["payments"])
        r = requests.post(f"{VP}/my/contracts/{cid}/payments/{p1}", json={"action": "confirm"}, headers=H["teacher"])
        assert r.status_code == 200 and r.json()["receipt_no"].startswith(f"VR-{datetime.now(TZ).year}-")
        S["receipt"] = r.json()["receipt_no"]
        assert requests.post(f"{VP}/my/contracts/{cid}/payments/{p1}", json={"action": "confirm"}, headers=H["teacher"]).status_code == 400
        c = _get(H, cid).json()
        p = next(x for x in c["payments"] if x["id"] == p1)
        assert p["status"] == "received" and p["receipt_no"] == S["receipt"]
        assert c["progress"]["paid"] == 60000 and c["progress"]["pending"] == 0 and c["progress"]["balance"] == 30000
        assert requests.delete(f"{VP}/contracts/{cid}/payments/{p1}", headers=H["admin"]).status_code == 400
        r = pay(20000)
        p2 = r.json()["id"]
        assert requests.post(f"{VP}/my/contracts/{cid}/payments/{p2}", json={"action": "dispute", "note": ""}, headers=H["teacher"]).status_code == 400
        assert requests.post(f"{VP}/my/contracts/{cid}/payments/{p2}", json={"action": "xx"}, headers=H["teacher"]).status_code == 400
        assert requests.post(f"{VP}/my/contracts/{cid}/payments/{p2}", json={"action": "dispute", "note": "TEST_لم أستلم"}, headers=H["teacher"]).status_code == 200
        c = _get(H, cid).json()
        p = next(x for x in c["payments"] if x["id"] == p2)
        assert p["status"] == "disputed" and p["teacher_note"] == "TEST_لم أستلم"
        assert c["progress"]["paid"] == 60000
        S["p2"] = p2

    # statement + contract PDF: admin & teacher OK; studio-only 403
    def test_08_pdfs(self, H):
        cid = S["cid"]
        for path in ("statement", "pdf"):
            for who in ("admin", "teacher"):
                r = requests.get(f"{VP}/contracts/{cid}/{path}", headers=H[who])
                assert r.status_code == 200 and r.headers["content-type"].startswith("application/pdf") and r.content[:4] == b"%PDF", (path, who, r.status_code)
            assert requests.get(f"{VP}/contracts/{cid}/{path}", headers=H["studio"]).status_code == 403
            assert requests.get(f"{VP}/contracts/{cid}/{path}", headers=H["reg"]).status_code == 403
        r = requests.get(f"{VP}/sessions/{S['s1']}/pdf", headers=H["admin"])
        assert r.status_code == 200 and r.content[:4] == b"%PDF"

    # finance separation for studio-only user
    def test_09_studio_money_strip(self, H):
        h = H["studio"]
        lst = requests.get(f"{VP}/contracts", headers=h)
        assert lst.status_code == 200, lst.text
        d = lst.json()
        assert d["can_finance"] is False and "accrued" not in d["kpis"] and "paid" not in d["kpis"]
        c = next(x for x in d["items"] if x["id"] == S["cid"])
        for k in ("items", "payments", "total_amount"):
            assert k not in c
        for k in ("total", "accrued", "paid", "pending", "balance"):
            assert k not in c["progress"]
        full = _get(H, S["cid"], "studio").json()
        for k in ("items", "payments", "total_amount"):
            assert k not in full, k
        for k in ("total", "accrued", "paid", "pending", "balance"):
            assert k not in full["progress"], k
        assert not any("دفع" in x["action"] or "استلام" in x["action"] for x in full["history"])
        assert full["required_hours"] and "recorded_hours" in full["progress"]
        st = requests.get(f"{VP}/settings", headers=h).json()
        assert "default_items" not in st
        # PUT settings by studio cannot wipe default items
        r = requests.put(f"{VP}/settings", json={**st, "default_items": []}, headers=h)
        assert r.status_code == 200, r.text
        assert "default_items" not in r.json() or r.json()["default_items"]  # response itself should not leak money ideally
        S["studio_put_leak"] = "default_items" in r.json()
        a = requests.get(f"{VP}/settings", headers=H["admin"]).json()
        assert [x["amount"] for x in a["default_items"]] == [x["amount"] for x in S["orig_settings"]["default_items"]]
        assert requests.post(f"{VP}/contracts", json={"teacher_id": TRID, "course_name": "x", "start_date": "2026-11-01"}, headers=h).status_code == 403
        assert requests.put(f"{VP}/contracts/{S['cid']}/items/spec", json={"status": "accepted"}, headers=h).status_code == 403
        # finance user sees money
        assert requests.get(f"{VP}/contracts", headers=H["admin"]).json()["can_finance"] is True

    def test_10_studio_put_settings_leak(self, H):
        assert not S.get("studio_put_leak"), "PUT /settings response returns default_items (money) to studio-only user"

    # per-teacher app visibility flag
    def test_11_app_visibility(self, H):
        cid = S["cid"]
        url = f"{VP}/teachers/{TRID}/flags"
        assert requests.put(url, json={"app_visible": False}, headers=H["studio"]).status_code == 403
        assert requests.put(url, json={"app_visible": False}, headers=H["admin"]).status_code == 200
        assert requests.get(url, headers=H["admin"]).json()["app_visible"] is False
        assert _get(H, cid).json()["app_visible"] is False
        assert requests.get(f"{VP}/my/contracts", headers=H["teacher"]).json()["items"] == []
        assert _get(H, cid, "teacher").status_code == 403
        assert requests.get(f"{VP}/contracts/{cid}/statement", headers=H["teacher"]).status_code == 403
        assert requests.get(f"{VP}/contracts/{cid}/pdf", headers=H["teacher"]).status_code == 403
        assert requests.post(f"{VP}/my/contracts/{cid}/payments/{S['p2']}", json={"action": "confirm"}, headers=H["teacher"]).status_code == 404
        assert requests.get(f"{VP}/my/sessions", headers=H["teacher"]).json()["items"] == []
        assert requests.put(url, json={"app_visible": True}, headers=H["admin"]).status_code == 200
        assert cid in _my_ids(H)
        # complete + reopen
        assert _st(H, cid, "complete").status_code == 200
        assert _st(H, cid, "reopen").status_code == 200 and _get(H, cid).json()["status"] == "issued"
