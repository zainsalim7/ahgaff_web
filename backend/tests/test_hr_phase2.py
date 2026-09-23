"""HR Phase 2 backend tests: Leaves, Attendance, Correspondence (iteration_75)."""
import os
import io
import time
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"

ADMIN = ("admin", "admin123")
EMP100 = ("EMP-100", "EMP-100")
EMP200 = ("EMP-200", "EMP-200")
EMP100_ID = "6ab41cd4bee9a1cf08bef181"
EMP200_ID = "6ab41cffbee9a1cf08bef190"


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    assert r.status_code == 200, f"login {u}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login(*ADMIN)


@pytest.fixture(scope="session")
def emp100_token():
    return _login(*EMP100)


@pytest.fixture(scope="session")
def emp200_token():
    return _login(*EMP200)


def H(t):
    return {"Authorization": f"Bearer {t}"}


# ────────────── LEAVES ──────────────
class TestLeavesAdmin:
    def test_meta(self, admin_token):
        r = requests.get(f"{API}/hr/leaves/meta", headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "annual" in d["types"] and "pending" in d["statuses"]

    def test_list_with_stats(self, admin_token):
        r = requests.get(f"{API}/hr/leaves", headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "stats" in d
        assert set(d["stats"]).issuperset({"pending", "on_leave_today", "approved_year", "rejected_year"})

    def test_balances_and_override(self, admin_token):
        r = requests.get(f"{API}/hr/leaves/balances?year=2026", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json()["items"], list)
        # override entitlement for EMP-100
        r2 = requests.put(f"{API}/hr/leaves/balances/{EMP100_ID}", headers=H(admin_token),
                          json={"year": 2026, "entitlement": 25, "carried_over": 2, "note": "TEST"})
        assert r2.status_code == 200, r2.text
        bal = r2.json()["balance"]
        assert bal["entitlement"] == 25 and bal["carried_over"] == 2

    def test_register_leave_bad_dates(self, admin_token):
        r = requests.post(f"{API}/hr/leaves", headers=H(admin_token),
                          json={"employee_id": EMP100_ID, "type": "annual", "start_date": "2026-12-20", "end_date": "2026-12-15"})
        assert r.status_code == 400

    def test_register_leave_and_get(self, admin_token):
        # Use non-overlapping dates in future
        r = requests.post(f"{API}/hr/leaves", headers=H(admin_token),
                          json={"employee_id": EMP200_ID, "type": "annual", "start_date": "2026-12-19", "end_date": "2026-12-21", "reason": "TEST"})
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        # verify GET shows it approved
        g = requests.get(f"{API}/hr/leaves/{lid}", headers=H(admin_token))
        assert g.status_code == 200
        assert g.json()["status"] == "approved"
        # overlap
        r2 = requests.post(f"{API}/hr/leaves", headers=H(admin_token),
                           json={"employee_id": EMP200_ID, "type": "annual", "start_date": "2026-12-20", "end_date": "2026-12-22"})
        assert r2.status_code == 400


class TestLeavesApprovalChain:
    def test_flow(self, emp100_token, emp200_token, admin_token):
        # EMP-100 submits my leave
        r = requests.post(f"{API}/hr/leaves/my", headers=H(emp100_token),
                          json={"type": "annual", "start_date": "2026-12-06", "end_date": "2026-12-08", "reason": "TEST chain"})
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        assert r.json()["status"] == "pending"

        # EMP-100 cannot decide on own
        rd = requests.post(f"{API}/hr/leaves/{lid}/decide", headers=H(emp100_token), json={"action": "approve"})
        assert rd.status_code == 403

        # EMP-200 sees in team_pending
        mine = requests.get(f"{API}/hr/leaves/my", headers=H(emp200_token))
        assert mine.status_code == 200
        assert any(x["id"] == lid for x in mine.json().get("team_pending", []))

        # EMP-200 approves → hr_pending
        rd2 = requests.post(f"{API}/hr/leaves/{lid}/decide", headers=H(emp200_token), json={"action": "approve"})
        assert rd2.status_code == 200, rd2.text
        assert rd2.json()["status"] == "hr_pending"

        # Admin approves → approved
        rd3 = requests.post(f"{API}/hr/leaves/{lid}/decide", headers=H(admin_token), json={"action": "approve"})
        assert rd3.status_code == 200, rd3.text
        assert rd3.json()["status"] == "approved"

    def test_reject_and_cancel(self, emp100_token, emp200_token):
        # Submit another
        r = requests.post(f"{API}/hr/leaves/my", headers=H(emp100_token),
                          json={"type": "annual", "start_date": "2026-12-13", "end_date": "2026-12-14", "reason": "TEST reject"})
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        # Manager rejects
        rd = requests.post(f"{API}/hr/leaves/{lid}/decide", headers=H(emp200_token), json={"action": "reject", "note": "no"})
        assert rd.status_code == 200
        assert rd.json()["status"] == "rejected"

        # Submit and cancel
        r2 = requests.post(f"{API}/hr/leaves/my", headers=H(emp100_token),
                           json={"type": "annual", "start_date": "2026-12-16", "end_date": "2026-12-17", "reason": "TEST cancel"})
        assert r2.status_code == 200, r2.text
        lid2 = r2.json()["id"]
        c = requests.post(f"{API}/hr/leaves/{lid2}/cancel", headers=H(emp100_token))
        assert c.status_code == 200


# ────────────── ATTENDANCE ──────────────
class TestAttendance:
    def test_settings_get_put(self, admin_token):
        r = requests.get(f"{API}/hr/attendance/settings", headers=H(admin_token))
        assert r.status_code == 200
        s = r.json()
        # Invalid: end before start
        bad = {**{k: s[k] for k in ["work_days", "work_start", "work_end", "late_grace_minutes", "early_leave_grace_minutes", "allow_self_checkin", "annual_leave_days", "holidays"]},
               "work_start": "14:00", "work_end": "08:00"}
        r2 = requests.put(f"{API}/hr/attendance/settings", headers=H(admin_token), json=bad)
        assert r2.status_code == 400

    def test_daily_and_mark(self, admin_token):
        d = "2026-09-22"  # past workday
        r = requests.get(f"{API}/hr/attendance/daily?date={d}", headers=H(admin_token))
        assert r.status_code == 200
        rows = r.json()["rows"]
        assert isinstance(rows, list) and len(rows) > 0
        # mark first with late check-in
        eid = next((row["employee_id"] for row in rows if row.get("status") is None), rows[0]["employee_id"])
        m = requests.post(f"{API}/hr/attendance/mark", headers=H(admin_token),
                         json={"date": d, "entries": [{"employee_id": eid, "status": "present", "check_in": "09:00", "check_out": "14:00", "note": "TEST"}]})
        assert m.status_code == 200, m.text
        # verify auto-late
        g = requests.get(f"{API}/hr/attendance/daily?date={d}", headers=H(admin_token))
        row = next(x for x in g.json()["rows"] if x["employee_id"] == eid)
        assert row["status"] == "late"
        assert row["late_minutes"] > 0

    def test_future_date_400(self, admin_token):
        m = requests.post(f"{API}/hr/attendance/mark", headers=H(admin_token),
                         json={"date": "2027-01-01", "entries": [{"employee_id": EMP100_ID, "status": "present"}]})
        assert m.status_code == 400

    def test_monthly_and_export(self, admin_token):
        r = requests.get(f"{API}/hr/attendance/monthly?month=2026-09", headers=H(admin_token))
        assert r.status_code == 200
        assert "items" in r.json() and "totals" in r.json()
        e = requests.get(f"{API}/hr/attendance/monthly/export?month=2026-09", headers=H(admin_token))
        assert e.status_code == 200
        assert "sheet" in e.headers.get("content-type", "").lower() or e.content[:2] == b"PK"

    def test_self_service_checkin(self, emp200_token):
        # get my
        r = requests.get(f"{API}/hr/attendance/my", headers=H(emp200_token))
        assert r.status_code == 200
        # If already checked in today, ensure second returns 400
        already = r.json().get("today") is not None
        ci = requests.post(f"{API}/hr/attendance/check-in", headers=H(emp200_token))
        if already:
            assert ci.status_code == 400
        else:
            assert ci.status_code == 200, ci.text
            ci2 = requests.post(f"{API}/hr/attendance/check-in", headers=H(emp200_token))
            assert ci2.status_code == 400
        co = requests.post(f"{API}/hr/attendance/check-out", headers=H(emp200_token))
        assert co.status_code in (200, 400)

    def test_delete_record(self, admin_token):
        d = "2026-09-22"
        # Ensure a record exists
        m = requests.post(f"{API}/hr/attendance/mark", headers=H(admin_token),
                         json={"date": d, "entries": [{"employee_id": EMP100_ID, "status": "present", "check_in": "08:00"}]})
        assert m.status_code == 200, m.text
        dl = requests.delete(f"{API}/hr/attendance/record/{EMP100_ID}/{d}", headers=H(admin_token))
        assert dl.status_code == 200
        assert dl.json()["deleted"] == 1


# ────────────── CORRESPONDENCE ──────────────
class TestCorrespondence:
    corr_id = None
    circ_id = None

    def test_meta(self, admin_token):
        r = requests.get(f"{API}/hr/correspondence/meta", headers=H(admin_token))
        assert r.status_code == 200
        assert "circular" in r.json()["directions"]

    def test_create_and_ref(self, admin_token):
        subj = f"TEST subject {uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/hr/correspondence", headers=H(admin_token),
                         json={"direction": "internal", "subject": subj, "body": "test body", "status": "registered"})
        assert r.status_code == 200, r.text
        ref = r.json()["ref_no"]
        assert ref.startswith("HR-INT-2026-")
        TestCorrespondence.corr_id = r.json()["id"]

        # circular for employees
        r2 = requests.post(f"{API}/hr/correspondence", headers=H(admin_token),
                          json={"direction": "circular", "subject": f"TEST circ {uuid.uuid4().hex[:6]}", "body": "everyone", "status": "registered", "to_all_employees": True})
        assert r2.status_code == 200
        assert r2.json()["ref_no"].startswith("HR-CIR-2026-")
        TestCorrespondence.circ_id = r2.json()["id"]

    def test_list_filter(self, admin_token):
        r = requests.get(f"{API}/hr/correspondence?direction=internal", headers=H(admin_token))
        assert r.status_code == 200

    def test_get_update_status(self, admin_token):
        cid = TestCorrespondence.corr_id
        g = requests.get(f"{API}/hr/correspondence/{cid}", headers=H(admin_token))
        assert g.status_code == 200
        cur = g.json()
        u = requests.put(f"{API}/hr/correspondence/{cid}", headers=H(admin_token),
                        json={"direction": cur["direction"], "subject": cur["subject"] + " upd", "body": cur.get("body", ""), "status": cur["status"], "priority": cur["priority"]})
        assert u.status_code == 200
        s = requests.post(f"{API}/hr/correspondence/{cid}/status", headers=H(admin_token), json={"status": "in_progress"})
        assert s.status_code == 200

    def test_delete_only_draft(self, admin_token):
        cid = TestCorrespondence.corr_id
        # Currently in_progress → delete blocked
        dl = requests.delete(f"{API}/hr/correspondence/{cid}", headers=H(admin_token))
        assert dl.status_code == 400
        # Create a draft and delete
        r = requests.post(f"{API}/hr/correspondence", headers=H(admin_token),
                         json={"direction": "outgoing", "subject": "TEST draft", "status": "draft"})
        assert r.status_code == 200
        did = r.json()["id"]
        dl2 = requests.delete(f"{API}/hr/correspondence/{did}", headers=H(admin_token))
        assert dl2.status_code == 200

    def test_my_and_ack(self, emp100_token, admin_token):
        cid = TestCorrespondence.circ_id
        my = requests.get(f"{API}/hr/correspondence/my", headers=H(emp100_token))
        assert my.status_code == 200
        items = my.json()["items"]
        assert any(x["id"] == cid for x in items), "circular not visible to EMP-100"
        ack = requests.post(f"{API}/hr/correspondence/{cid}/ack", headers=H(emp100_token))
        assert ack.status_code == 200
        # admin sees ack count
        g = requests.get(f"{API}/hr/correspondence/{cid}", headers=H(admin_token))
        assert g.json()["ack_count"] >= 1
