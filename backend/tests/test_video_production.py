# Video Production module (/api/video-production) — contracts, items, progress/accrual, payments, sessions pipeline, PDF, isolation
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


def _login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        pytest.skip(f"login failed for {u}: {r.status_code}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def H():
    return {"admin": _login("admin", "admin123"), "teacher": _login("222222", "teacher123"), "reg": _login("test_registrar", "test1234")}


@pytest.fixture(scope="module", autouse=True)
def cleanup(H):
    yield
    a = H["admin"]
    for sid in S.get("sessions", []):
        requests.post(f"{VP}/sessions/{sid}/action", json={"action": "cancel"}, headers=a)
    for cid in S.get("contracts", []):
        requests.post(f"{VP}/contracts/{cid}/status", json={"action": "terminate", "note": "TEST cleanup"}, headers=a)
    if "orig_settings" in S:
        requests.put(f"{VP}/settings", json=S["orig_settings"], headers=a)


def _slot():
    # far-future date + random time to avoid clashing with sample data
    d = (datetime.now(TZ) + timedelta(days=random.randint(200, 300))).date().isoformat()
    return d, f"{random.randint(8, 18):02d}:{random.choice([0, 30]):02d}"


def _sess(H, who, cid, lec, part, parts=1, studio="", date=None, start=None, mins=20, path="/sessions"):
    if date is None:
        date, start = _slot()
    body = {"contract_id": cid, "lecture_no": lec, "lecture_title": f"TEST_VP L{lec}", "parts_count": parts, "part_no": part,
            "est_minutes": mins, "studio_id": studio, "date": date, "start": start}
    return requests.post(f"{VP}{path}", json=body, headers=H[who])


def _act(H, sid, action, **kw):
    return requests.post(f"{VP}/sessions/{sid}/action", json={"action": action, **kw}, headers=H["admin"])


class TestVideoProduction:
    def test_01_settings(self, H):
        r = requests.get(f"{VP}/settings", headers=H["admin"])
        assert r.status_code == 200
        st = r.json()
        S["orig_settings"] = st
        assert len(st["studios"]) >= 2 and st["min_notice_hours"] == 2
        S["studios"] = [x["id"] for x in st["studios"]]
        # PUT with empty default_items -> GET falls back to 4 defaults
        body = {**st, "default_items": []}
        r = requests.put(f"{VP}/settings", json=body, headers=H["admin"])
        assert r.status_code == 200
        assert [i["key"] for i in r.json()["default_items"]] == ["spec", "content", "recording", "qbank"]
        assert [x["id"] for x in r.json()["studios"]] == S["studios"]
        # registrar cannot PUT
        assert requests.put(f"{VP}/settings", json=body, headers=H["reg"]).status_code == 403
        # restore
        assert requests.put(f"{VP}/settings", json=st, headers=H["admin"]).status_code == 200

    def test_02_create_contract(self, H):
        body = {"teacher_id": TEACHER_RID, "course_name": "TEST_VP رياضيات", "lectures_required": 2, "start_date": datetime.now(TZ).date().isoformat()}
        r = requests.post(f"{VP}/contracts", json=body, headers=H["admin"])
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ref_no"].startswith(f"VC-{datetime.now(TZ).year}-") and len(d["ref_no"]) == 12
        S["cid"] = d["id"]
        S.setdefault("contracts", []).append(d["id"])
        c = requests.get(f"{VP}/contracts/{d['id']}", headers=H["admin"]).json()
        assert c["status"] == "draft" and c["total_amount"] == 450000
        assert {i["key"]: i["amount"] for i in c["items"]} == {"spec": 50000, "content": 100000, "recording": 250000, "qbank": 50000}
        assert c["duration_days"] == 60 and c["teacher_name"]
        # validation
        assert requests.post(f"{VP}/contracts", json={**body, "lectures_required": 0}, headers=H["admin"]).status_code == 400
        assert requests.post(f"{VP}/contracts", json={**body, "teacher_id": "bad"}, headers=H["admin"]).status_code == 400

    def test_03_draft_restrictions(self, H):
        cid = S["cid"]
        # teacher must not see draft
        assert requests.get(f"{VP}/contracts/{cid}", headers=H["teacher"]).status_code == 403
        assert cid not in [c["id"] for c in requests.get(f"{VP}/my/contracts", headers=H["teacher"]).json()["items"]]
        # payment on draft rejected, booking on draft rejected
        assert requests.post(f"{VP}/contracts/{cid}/payments", json={"amount": 1}, headers=H["admin"]).status_code == 400
        assert _sess(H, "admin", cid, 1, 1).status_code == 400

    def test_04_edit_and_transitions(self, H):
        cid = S["cid"]
        c = requests.get(f"{VP}/contracts/{cid}", headers=H["admin"]).json()
        body = {k: c[k] for k in ("teacher_id", "course_name", "start_date", "items")}
        body.update(lectures_required=2, notes="TEST edited")
        r = requests.put(f"{VP}/contracts/{cid}", json=body, headers=H["admin"])
        assert r.status_code == 200
        assert requests.get(f"{VP}/contracts/{cid}", headers=H["admin"]).json()["notes"] == "TEST edited"
        st = lambda a, n="": requests.post(f"{VP}/contracts/{cid}/status", json={"action": a, "note": n}, headers=H["admin"])
        assert st("complete").status_code == 400  # draft -> complete invalid
        assert st("reopen").status_code == 400
        assert st("bogus").status_code == 400
        assert st("issue").status_code == 200
        assert st("issue").status_code == 400
        assert st("terminate").status_code == 400  # requires note
        assert requests.get(f"{VP}/contracts/{cid}", headers=H["admin"]).json()["status"] == "issued"

    def test_05_items(self, H):
        cid = S["cid"]
        put = lambda k, s: requests.put(f"{VP}/contracts/{cid}/items/{k}", json={"status": s}, headers=H["admin"])
        assert put("recording", "accepted").status_code == 400
        assert put("spec", "bogus").status_code == 400
        assert put("spec", "delivered").status_code == 200
        p = requests.get(f"{VP}/contracts/{cid}", headers=H["admin"]).json()["progress"]
        assert p["accrued"] == 0
        assert put("spec", "accepted").status_code == 200
        c = requests.get(f"{VP}/contracts/{cid}", headers=H["admin"]).json()
        assert c["progress"]["accrued"] == 50000 and c["progress"]["items_accepted"] == 1
        assert put("spec", "bogus").status_code == 400
        assert requests.put(f"{VP}/contracts/{cid}/items/spec", json={"status": "pending"}, headers=H["teacher"]).status_code == 403

    def test_06_session_validation(self, H):
        cid, s1 = S["cid"], S["studios"][0]
        assert _sess(H, "admin", cid, 1, 1, mins=31).status_code == 400  # > max_part_minutes
        assert _sess(H, "admin", cid, 1, 3, parts=2).status_code == 400  # part_no > parts_count
        date, start = _slot()
        S["slot"] = (date, start)
        r = _sess(H, "admin", cid, 1, 1, parts=2, studio=s1, date=date, start=start)
        assert r.status_code == 200, r.text
        S["s11"] = r.json()["id"]
        S.setdefault("sessions", []).append(S["s11"])
        assert r.json()["ref_no"].startswith("VS-")
        assert _sess(H, "admin", cid, 1, 1, parts=2).status_code == 400  # duplicate lecture/part
        # requested (not BUSY) does not block; confirm it then overlap must conflict
        assert _act(H, S["s11"], "confirm").status_code == 200
        r = _sess(H, "admin", cid, 1, 2, parts=2, studio=s1, date=date, start=start)
        assert r.status_code == 400 and "محجوز" in r.json()["detail"]
        av = requests.get(f"{VP}/availability", params={"date": date, "start": start, "minutes": 20}, headers=H["admin"]).json()
        ids = [x["id"] for x in av["studios"]]
        assert s1 not in ids and S["studios"][1] in ids
        # second part in studio 2
        r = _sess(H, "admin", cid, 1, 2, parts=2, studio=S["studios"][1], date=date, start=start)
        assert r.status_code == 200, r.text
        S["s12"] = r.json()["id"]
        S["sessions"].append(S["s12"])

    def test_07_teacher_min_notice_and_booking(self, H):
        cid = S["cid"]
        soon = datetime.now(TZ) + timedelta(hours=1)
        r = _sess(H, "teacher", cid, 2, 1, date=soon.date().isoformat(), start=soon.strftime("%H:%M"), path="/my/sessions")
        assert r.status_code == 400, r.text
        r = _sess(H, "teacher", cid, 2, 1, path="/my/sessions")
        assert r.status_code == 200, r.text
        S["s21"] = r.json()["id"]
        S["sessions"].append(S["s21"])
        mine = requests.get(f"{VP}/my/sessions", headers=H["teacher"]).json()["items"]
        assert S["s21"] in [x["id"] for x in mine]
        assert cid in [c["id"] for c in requests.get(f"{VP}/my/contracts", headers=H["teacher"]).json()["items"]]

    def test_08_session_actions(self, H):
        sid = S["s11"]
        assert _act(H, sid, "editing").status_code == 400  # skip order
        assert _act(H, sid, "reject", note="x").status_code == 400  # reject only from requested
        assert _act(H, sid, "filmed", actual_minutes=18).status_code == 200
        assert _act(H, sid, "confirm").status_code == 400
        assert _act(H, sid, "back").status_code == 400  # can't go back from filmed
        assert _act(H, sid, "editing").status_code == 200
        assert _act(H, sid, "back").status_code == 200
        assert requests.get(f"{VP}/sessions/{sid}", headers=H["admin"]).json()["status"] == "filmed"
        assert _act(H, sid, "editing").status_code == 200
        assert _act(H, sid, "cloud").status_code == 400  # requires cloud_url
        assert _act(H, sid, "cloud", cloud_url="https://cloud.example/TEST").status_code == 200
        assert _act(H, sid, "stall").status_code == 400
        assert _act(H, sid, "stall", note="TEST stall").status_code == 200
        lst = requests.get(f"{VP}/sessions", params={"status": "stalled", "contract_id": S["cid"]}, headers=H["admin"]).json()
        assert sid in [x["id"] for x in lst["items"]] and lst["counts"]["stalled"] >= 1
        assert _act(H, sid, "unstall").status_code == 200
        assert _act(H, sid, "published").status_code == 400
        assert _act(H, sid, "published", platform_url="https://lms.example/TEST").status_code == 200
        s = requests.get(f"{VP}/sessions/{sid}", headers=H["admin"]).json()
        assert s["status"] == "published" and s["cloud_url"] and s["platform_url"] and s["actual_minutes"] == 18 and not s["stalled"]
        # reject/cancel on teacher's requested session
        assert _act(H, S["s21"], "reject").status_code == 400  # note required
        assert _act(H, sid, "cancel").status_code == 400  # after filming
        # reschedule conflict: move s12 into studio1 at s11's slot? s11 published (BUSY) -> conflict
        date, start = S["slot"]
        assert _act(H, S["s12"], "confirm", studio_id=S["studios"][0], date=date, start=start).status_code == 400
        assert _act(H, S["s12"], "confirm").status_code == 200

    def test_09_progress_and_accrual(self, H):
        cid = S["cid"]
        get = lambda: requests.get(f"{VP}/contracts/{cid}", headers=H["admin"]).json()["progress"]
        # s11 published but no materials, s12 confirmed -> 0 lectures
        assert get()["lectures_completed"] == 0
        assert requests.put(f"{VP}/sessions/{S['s11']}", json={"materials_delivered": True, "photographer_notes": "TEST"}, headers=H["admin"]).status_code == 200
        assert get()["lectures_completed"] == 0  # part 2 not filmed
        assert _act(H, S["s12"], "filmed").status_code == 200
        assert get()["lectures_completed"] == 0  # part 2 materials not delivered
        assert requests.put(f"{VP}/sessions/{S['s12']}", json={"materials_delivered": True}, headers=H["admin"]).status_code == 200
        p = get()
        assert p["lectures_completed"] == 1 and p["percent"] == 50.0
        assert p["accrued"] == 50000 + 125000  # spec accepted + 250000*1/2
        assert requests.get(f"{VP}/sessions/{S['s11']}", headers=H["admin"]).json()["photographer_notes"] == "TEST"

    def test_10_payments(self, H):
        cid = S["cid"]
        pay = lambda amt, h="admin": requests.post(f"{VP}/contracts/{cid}/payments", json={"amount": amt, "stage": "TEST"}, headers=H[h])
        assert pay(175001).status_code == 400
        assert pay(0).status_code == 400
        assert pay(100, "reg").status_code == 403
        r = pay(100000)
        assert r.status_code == 200
        pid = r.json()["id"]
        p = requests.get(f"{VP}/contracts/{cid}", headers=H["admin"]).json()["progress"]
        assert p["paid"] == 100000 and p["balance"] == 75000
        assert pay(75001).status_code == 400
        assert requests.delete(f"{VP}/contracts/{cid}/payments/{pid}", headers=H["admin"]).status_code == 200
        assert requests.get(f"{VP}/contracts/{cid}", headers=H["admin"]).json()["progress"]["paid"] == 0

    def test_11_pdfs(self, H):
        for url, who in ((f"{VP}/contracts/{S['cid']}/pdf", "admin"), (f"{VP}/sessions/{S['s11']}/pdf", "admin"), (f"{VP}/contracts/{S['cid']}/pdf", "teacher")):
            r = requests.get(url, headers=H[who])
            assert r.status_code == 200 and r.headers["content-type"].startswith("application/pdf") and r.content[:4] == b"%PDF"

    def test_12_isolation(self, H):
        t, g = H["teacher"], H["reg"]
        for h in (t, g):
            assert requests.get(f"{VP}/contracts", headers=h).status_code == 403
            assert requests.get(f"{VP}/sessions", headers=h).status_code == 403
            assert requests.post(f"{VP}/sessions/{S['s21']}/action", json={"action": "confirm"}, headers=h).status_code == 403
            assert requests.post(f"{VP}/contracts", json={"teacher_id": TEACHER_RID, "course_name": "TEST_VP", "lectures_required": 1, "start_date": "2026-11-01"}, headers=h).status_code == 403
            assert requests.post(f"{VP}/contracts/{S['cid']}/status", json={"action": "complete"}, headers=h).status_code == 403
        assert requests.get(f"{VP}/contracts/{S['cid']}", headers=g).status_code == 403
        assert requests.get(f"{VP}/my/contracts", headers=g).json()["items"] == []
        mine = requests.get(f"{VP}/my/contracts", headers=t).json()["items"]
        assert all(c["status"] != "draft" and c["teacher_id"] == TEACHER_RID for c in mine)

    def test_13_terminate_reopen(self, H):
        st = lambda a, n="": requests.post(f"{VP}/contracts/{S['cid']}/status", json={"action": a, "note": n}, headers=H["admin"])
        assert st("complete").status_code == 200
        assert st("terminate", "x").status_code == 400  # completed -> terminate invalid
        assert st("reopen").status_code == 200
        assert st("terminate", "TEST_VP done").status_code == 200
        assert requests.get(f"{VP}/contracts/{S['cid']}", headers=H["admin"]).json()["status"] == "terminated"
