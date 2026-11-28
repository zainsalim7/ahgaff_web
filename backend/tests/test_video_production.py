# Video Production module (/api/video-production) — dynamic pipeline steps, advance/back, progress %, contracts, payments, PDF, isolation
import os
import random
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
VP = f"{BASE_URL}/api/video-production"
TEACHER_RID = "698ad3da31ab437a06176e2a"
TZ = timezone(timedelta(hours=3))
S = {}  # shared state across ordered tests
DEFAULT_KEYS = ["filmed", "editing", "cloud", "published"]


def _login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        pytest.skip(f"login failed for {u}: {r.status_code}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def H():
    return {"admin": _login("admin", "admin123"), "teacher": _login("222222", "teacher123"), "reg": _login("test_registrar", "test1234")}


def _default_steps(st):
    return [x for x in st["pipeline_steps"] if x["key"] in DEFAULT_KEYS]


@pytest.fixture(scope="module", autouse=True)
def cleanup(H):
    yield
    a = H["admin"]
    # sessions/contracts are hard-deleted by the runner via DB (ids in S); restore 4 default steps
    if "orig_settings" in S:
        body = {**S["orig_settings"], "pipeline_steps": _default_steps(S["orig_settings"])}
        r = requests.put(f"{VP}/settings", json=body, headers=a)
        print("restore settings:", r.status_code, r.text[:200])
    import sys
    sys.path.insert(0, os.path.dirname(__file__))
    from conftest_vp import cleanup_ids
    cleanup_ids(S.get("contracts", []), S.get("sessions", []))


def _slot():
    d = (datetime.now(TZ) + timedelta(days=random.randint(200, 300))).date().isoformat()
    return d, f"{random.randint(8, 17):02d}:{random.choice([0, 30]):02d}"


def _sess(H, who, cid, lec, part, parts=1, studio="", date=None, start=None, mins=20, path="/sessions"):
    if date is None:
        date, start = _slot()
    body = {"contract_id": cid, "lecture_no": lec, "lecture_title": f"TEST_VP L{lec}", "parts_count": parts, "part_no": part,
            "est_minutes": mins, "studio_id": studio, "date": date, "start": start}
    r = requests.post(f"{VP}{path}", json=body, headers=H[who])
    if r.status_code == 200:
        S.setdefault("sessions", []).append(r.json()["id"])
    return r


def _act(H, sid, action, **kw):
    return requests.post(f"{VP}/sessions/{sid}/action", json={"action": action, **kw}, headers=H["admin"])


def _get_s(H, sid):
    return requests.get(f"{VP}/sessions/{sid}", headers=H["admin"]).json()


class TestVideoProduction:
    # Settings: dynamic pipeline_steps validation
    def test_01_settings_steps(self, H):
        st = requests.get(f"{VP}/settings", headers=H["admin"]).json()
        S["orig_settings"] = st
        S["studios"] = [x["id"] for x in st["studios"]]
        assert st["max_part_minutes"] == 60
        base = _default_steps(st)
        assert [x["key"] for x in base] == DEFAULT_KEYS
        assert base[0]["is_filming"] and base[2]["requires_link"] and base[3]["requires_link"]
        put = lambda steps, h="admin": requests.put(f"{VP}/settings", json={**st, "pipeline_steps": steps}, headers=H[h])
        # validations
        r = put([{**base[0]}, {**base[1], "name": "  "}, base[2], base[3]])
        assert r.status_code == 400 and "اسم المرحلة" in r.json()["detail"]
        r = put([{**base[0], "is_filming": False}, base[1], base[2], base[3]])
        assert r.status_code == 400 and "التصوير" in r.json()["detail"]
        r = put([base[0], {**base[1], "is_filming": True}, base[2], base[3]])
        assert r.status_code == 400
        r = put([base[0], base[0], base[2], base[3]])
        assert r.status_code == 400  # duplicate key
        assert put(base + [{"name": "x"}], "reg").status_code == 403
        # add custom step requiring link, notify on, after filming
        custom = {"name": "TEST_مراجعة علمية", "is_filming": False, "requires_link": True, "link_label": "", "notify": True}
        r = put([base[0], custom, base[1], base[2], base[3]])
        assert r.status_code == 200, r.text
        steps = r.json()["pipeline_steps"]
        assert len(steps) == 5 and steps[1]["name"] == "TEST_مراجعة علمية"
        assert steps[1]["key"] and steps[1]["key"] not in DEFAULT_KEYS
        assert steps[1]["link_label"] == "رابط TEST_مراجعة علمية"  # auto label
        S["ck"] = steps[1]["key"]
        S["steps"] = steps
        # GET persists
        assert [x["key"] for x in requests.get(f"{VP}/settings", headers=H["admin"]).json()["pipeline_steps"]] == [x["key"] for x in steps]

    # Contract creation + issue
    def test_02_contract(self, H):
        body = {"teacher_id": TEACHER_RID, "course_name": "TEST_VP رياضيات", "weekly_hours": 3, "semester_weeks": 16, "start_date": datetime.now(TZ).date().isoformat()}
        r = requests.post(f"{VP}/contracts", json=body, headers=H["admin"])
        assert r.status_code == 200, r.text
        S["cid"] = r.json()["id"]
        S.setdefault("contracts", []).append(S["cid"])
        c = requests.get(f"{VP}/contracts/{S['cid']}", headers=H["admin"]).json()
        assert c["status"] == "draft" and c["total_amount"] == 450000
        assert c["progress"]["production_percent"] == 0 and c["progress"]["percent"] == 0
        assert _sess(H, "admin", S["cid"], 1, 1).status_code == 400  # draft
        assert c["course_hours"] == 48 and c["required_hours"] == 32
        st = lambda a: requests.post(f"{VP}/contracts/{S['cid']}/status", json={"action": a}, headers=H["admin"])
        assert st("issue").status_code == 400  # new flow: cannot issue from draft
        assert st("send").status_code == 200
        assert requests.post(f"{VP}/my/contracts/{S['cid']}/accept", headers=H["teacher"]).status_code == 200
        assert st("issue").status_code == 200
        assert requests.put(f"{VP}/contracts/{S['cid']}/items/spec", json={"status": "accepted"}, headers=H["admin"]).status_code == 200

    # est_minutes up to max (60)
    def test_03_minutes(self, H):
        cid = S["cid"]
        r = _sess(H, "admin", cid, 1, 1, mins=61)
        assert r.status_code == 400 and "60" in r.json()["detail"]
        r = _sess(H, "admin", cid, 1, 1, parts=2, studio=S["studios"][0], mins=60)
        assert r.status_code == 200, r.text
        S["s11"] = r.json()["id"]
        s = _get_s(H, S["s11"])
        assert s["status"] == "requested" and s["pct"] == 0
        assert _mins(s["end"]) - _mins(s["start"]) == 60
        r = _sess(H, "admin", cid, 1, 2, parts=2, studio=S["studios"][1], mins=45)
        assert r.status_code == 200, r.text
        S["s12"] = r.json()["id"]

    # advance/back pipeline with link requirements
    def test_04_advance_back(self, H):
        sid, ck = S["s11"], S["ck"]
        assert _act(H, sid, "advance").status_code == 400  # requested -> must confirm first
        assert _act(H, sid, "back").status_code == 400
        assert _act(H, sid, "stall", note="x").status_code == 400  # stall on requested not allowed
        assert _act(H, sid, "confirm").status_code == 200
        s = _get_s(H, sid)
        assert s["status"] == "confirmed" and s["pct"] == 0
        assert _act(H, sid, "advance", actual_minutes=55).status_code == 200
        s = _get_s(H, sid)
        assert s["status"] == "filmed" and s["pct"] == 20.0 and s["actual_minutes"] == 55
        assert _act(H, sid, "confirm").status_code == 400  # after production started
        assert _act(H, sid, "cancel").status_code == 400
        # back from first step -> confirmed
        assert _act(H, sid, "back").status_code == 200
        assert _get_s(H, sid)["status"] == "confirmed"
        assert _act(H, sid, "advance").status_code == 200
        # next = custom step requiring link
        r = _act(H, sid, "advance")
        assert r.status_code == 400 and "رابط" in r.json()["detail"]
        assert _act(H, sid, "advance", link="https://review.example/TEST").status_code == 200
        s = _get_s(H, sid)
        assert s["status"] == ck and s["pct"] == 40.0 and s["links"][ck] == "https://review.example/TEST"
        assert s["status_ar"] == "TEST_مراجعة علمية"
        assert _act(H, sid, "back").status_code == 200
        assert _get_s(H, sid)["status"] == "filmed"
        assert _act(H, sid, "advance", link="https://review.example/TEST2").status_code == 200
        assert _act(H, sid, "advance").status_code == 200  # editing (no link)
        assert _get_s(H, sid)["pct"] == 60.0
        assert _act(H, sid, "stall", note="TEST stall").status_code == 200
        assert _get_s(H, sid)["stalled"]["stage"] == "editing"
        assert _act(H, sid, "advance").status_code == 400  # cloud requires link
        assert _act(H, sid, "advance", link="https://cloud.example/TEST").status_code == 200
        s = _get_s(H, sid)
        assert s["status"] == "cloud" and s["pct"] == 80.0 and s["stalled"] is None
        assert _act(H, sid, "advance", link="https://lms.example/TEST").status_code == 200
        s = _get_s(H, sid)
        assert s["status"] == "published" and s["pct"] == 100.0
        assert set(s["links"]) >= {ck, "cloud", "published"}
        assert _act(H, sid, "advance", link="x").status_code == 400  # last step
        assert _act(H, sid, "stall", note="x").status_code == 400  # stall on last step

    # progress: percent / production_percent / lectures_published
    def test_05_progress(self, H):
        cid = S["cid"]
        get = lambda: requests.get(f"{VP}/contracts/{cid}", headers=H["admin"]).json()["progress"]
        p = get()
        # lecture1: parts_count=2 -> (100 + 0)/2 = 50 ; production = 50/2 = 25
        L1 = next(L for L in p["lectures"] if L["lecture_no"] == 1)
        assert L1["pct"] == 50.0 and p["production_percent"] == round(100 * 55 / 1920, 1)
        assert {x["id"]: x["pct"] for x in L1["parts"]}[S["s11"]] == 100.0
        assert p["lectures_completed"] == 0 and p["lectures_published"] == 0
        assert requests.put(f"{VP}/sessions/{S['s11']}", json={"materials_delivered": True}, headers=H["admin"]).status_code == 200
        assert _act(H, S["s12"], "confirm").status_code == 200
        assert _act(H, S["s12"], "advance").status_code == 200  # filmed
        assert requests.put(f"{VP}/sessions/{S['s12']}", json={"materials_delivered": True}, headers=H["admin"]).status_code == 200
        p = get()
        # hours-based: recorded=(55 actual + 45 est)/60 ; required=32h=1920min
        assert p["lectures_completed"] == 1 and p["recorded_hours"] == round(100 / 60, 2)
        assert p["percent"] == round(100 * 100 / 1920, 1)
        assert p["production_percent"] == round(100 * (55 + 45 * 0.2) / 1920, 1)
        assert p["lectures_published"] == 0
        assert p["accrued"] == 50000  # lump-sum: only accepted items accrue
        for _ in range(3):
            pass
        assert _act(H, S["s12"], "advance", link="https://r.example/T").status_code == 200
        assert _act(H, S["s12"], "advance").status_code == 200
        assert _act(H, S["s12"], "advance", link="https://c.example/T").status_code == 200
        assert _act(H, S["s12"], "advance", link="https://p.example/T").status_code == 200
        p = get()
        assert p["lectures_published"] == 1 and p["production_percent"] == round(100 * 100 / 1920, 1)

    # removing a step in use blocked; reorder allowed
    def test_06_remove_in_use_and_reorder(self, H):
        st = requests.get(f"{VP}/settings", headers=H["admin"]).json()
        steps = st["pipeline_steps"]
        ck = S["ck"]
        # put a session at custom step, then try removing it
        r = _sess(H, "admin", S["cid"], 2, 1, studio=S["studios"][0])
        assert r.status_code == 200, r.text
        S["s21"] = r.json()["id"]
        assert _act(H, S["s21"], "confirm").status_code == 200
        assert _act(H, S["s21"], "advance").status_code == 200
        assert _act(H, S["s21"], "advance", link="https://r.example/X").status_code == 200
        assert _get_s(H, S["s21"])["status"] == ck
        r = requests.put(f"{VP}/settings", json={**st, "pipeline_steps": [x for x in steps if x["key"] != ck]}, headers=H["admin"])
        assert r.status_code == 400 and "لا يمكن حذف مرحلة" in r.json()["detail"] and "TEST_مراجعة" in r.json()["detail"]
        # reorder / moving the filming step is blocked while sessions sit in production steps (protects accrual)
        new = [steps[0], steps[2], steps[1], steps[3], steps[4]]
        r = requests.put(f"{VP}/settings", json={**st, "pipeline_steps": new}, headers=H["admin"])
        assert r.status_code == 400 and "ترتيب المراحل" in r.json()["detail"]
        moved = [{**x, "is_filming": i == 1} for i, x in enumerate(steps)]
        assert requests.put(f"{VP}/settings", json={**st, "pipeline_steps": moved}, headers=H["admin"]).status_code == 400
        renamed = [{**x, "name": x["name"] + " "} if x["key"] == "editing" else x for x in steps]
        assert requests.put(f"{VP}/settings", json={**st, "pipeline_steps": renamed}, headers=H["admin"]).status_code == 200
        assert _act(H, S["s21"], "back").status_code == 200
        assert _get_s(H, S["s21"])["status"] == steps[0]["key"] if steps[1]["key"] == ck else True
        assert _act(H, S["s21"], "unstall").status_code == 400

    # teacher notifications only for notify=true steps
    def test_07_teacher_my_contracts_steps(self, H):
        d = requests.get(f"{VP}/my/contracts", headers=H["teacher"]).json()
        assert d["settings"]["max_part_minutes"] == 60
        assert S["ck"] in [x["key"] for x in d["settings"]["steps"]]
        c = next(x for x in d["items"] if x["id"] == S["cid"])
        assert "production_percent" in c["progress"]

    # payments + PDFs regression
    def test_08_payments_pdfs(self, H):
        cid = S["cid"]
        pay = lambda amt, h="admin": requests.post(f"{VP}/contracts/{cid}/payments", json={"amount": amt, "stage": "TEST"}, headers=H[h])
        assert pay(50001).status_code == 400
        assert pay(100, "reg").status_code == 403
        r = pay(30000)
        assert r.status_code == 200 and r.json()["status"] == "pending"
        pr = requests.get(f"{VP}/contracts/{cid}", headers=H["admin"]).json()["progress"]
        assert pr["balance"] == 20000 and pr["pending"] == 30000 and pr["paid"] == 0
        assert requests.delete(f"{VP}/contracts/{cid}/payments/{r.json()['id']}", headers=H["admin"]).status_code == 200
        for url, who in ((f"{VP}/contracts/{cid}/pdf", "admin"), (f"{VP}/sessions/{S['s11']}/pdf", "admin"), (f"{VP}/contracts/{cid}/pdf", "teacher")):
            r = requests.get(url, headers=H[who])
            assert r.status_code == 200 and r.content[:4] == b"%PDF"

    # isolation regression
    def test_09_isolation(self, H):
        for h in (H["teacher"], H["reg"]):
            assert requests.get(f"{VP}/contracts", headers=h).status_code == 403
            assert requests.post(f"{VP}/sessions/{S['s21']}/action", json={"action": "advance"}, headers=h).status_code == 403
        lst = requests.get(f"{VP}/sessions", params={"contract_id": S["cid"]}, headers=H["admin"]).json()
        assert all("pct" in x for x in lst["items"])


def _mins(t):
    h, m = t.split(":")[:2]
    return int(h) * 60 + int(m)
