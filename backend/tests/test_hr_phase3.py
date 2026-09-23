"""HR Phase 3 tests — Tasks, Appraisals, Alerts, Dashboard summary"""
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

ADMIN = ("admin", "admin123")
EMP100 = ("EMP-100", "EMP-100")
EMP200 = ("EMP-200", "EMP-200")

EMP100_ID = "6ab41cd4bee9a1cf08bef181"
EMP200_ID = "6ab41cffbee9a1cf08bef190"
EXISTING_TASK_ID = "6ab42193ce78fea2f1416d25"
EXISTING_APPRAISAL_ID = "6ab42193ce78fea2f1416d28"


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=15)
    assert r.status_code == 200, f"login failed for {u}: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def h_admin():
    return _login(*ADMIN)


@pytest.fixture(scope="session")
def h100():
    return _login(*EMP100)


@pytest.fixture(scope="session")
def h200():
    return _login(*EMP200)


# ---------------- TASKS ----------------
class TestTasks:
    def test_meta(self, h_admin):
        r = requests.get(f"{API}/hr/tasks/meta", headers=h_admin)
        assert r.status_code == 200
        d = r.json()
        assert "priorities" in d and "statuses" in d

    def test_assignable_admin(self, h_admin):
        r = requests.get(f"{API}/hr/tasks/assignable", headers=h_admin)
        assert r.status_code == 200
        assert r.json()["scope"] == "all"

    def test_assignable_emp200_team(self, h200):
        r = requests.get(f"{API}/hr/tasks/assignable", headers=h200)
        assert r.status_code == 200
        d = r.json()
        assert d["scope"] == "team"
        ids = [e["id"] for e in d["employees"]]
        assert EMP100_ID in ids

    def test_assignable_emp100_empty(self, h100):
        r = requests.get(f"{API}/hr/tasks/assignable", headers=h100)
        assert r.status_code == 200
        assert r.json()["employees"] == []

    def test_create_emp200_to_emp100_ok(self, h200):
        payload = {"title": "TEST_task_p3", "assignee_employee_id": EMP100_ID, "priority": "normal", "due_date": "2026-09-30"}
        r = requests.post(f"{API}/hr/tasks", json=payload, headers=h200)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert "id" in d
        pytest.created_task_id = d["id"]

    def test_create_emp100_to_emp200_forbidden(self, h100):
        payload = {"title": "TEST_bad", "assignee_employee_id": EMP200_ID, "priority": "normal"}
        r = requests.post(f"{API}/hr/tasks", json=payload, headers=h100)
        assert r.status_code == 403

    def test_invalid_priority(self, h_admin):
        r = requests.post(f"{API}/hr/tasks", json={"title": "TEST_bad", "assignee_employee_id": EMP100_ID, "priority": "extreme"}, headers=h_admin)
        assert r.status_code == 400

    def test_list_mine_emp100(self, h100):
        r = requests.get(f"{API}/hr/tasks?view=mine", headers=h100)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()["items"]]
        assert getattr(pytest, "created_task_id", None) in ids

    def test_list_team_emp200(self, h200):
        r = requests.get(f"{API}/hr/tasks?view=team", headers=h200)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()["items"]]
        assert getattr(pytest, "created_task_id", None) in ids

    def test_list_assigned_emp200(self, h200):
        r = requests.get(f"{API}/hr/tasks?view=assigned", headers=h200)
        assert r.status_code == 200

    def test_list_all_admin(self, h_admin):
        r = requests.get(f"{API}/hr/tasks?view=all", headers=h_admin)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_progress_50_emp100(self, h100):
        tid = pytest.created_task_id
        r = requests.post(f"{API}/hr/tasks/{tid}/progress", json={"progress": 50, "note": "x"}, headers=h100)
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"

    def test_progress_done_emp100(self, h100):
        tid = pytest.created_task_id
        r = requests.post(f"{API}/hr/tasks/{tid}/progress", json={"status": "done"}, headers=h100)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "done" and d["progress"] == 100
        g = requests.get(f"{API}/hr/tasks/{tid}", headers=h100).json()
        assert g.get("completed_on_time") is True

    def test_emp100_cannot_cancel(self, h100, h200):
        # create fresh task assigned by 200 -> 100
        r = requests.post(f"{API}/hr/tasks", json={"title": "TEST_cancel", "assignee_employee_id": EMP100_ID, "priority": "normal"}, headers=h200)
        tid = r.json()["id"]
        r2 = requests.post(f"{API}/hr/tasks/{tid}/progress", json={"status": "cancelled"}, headers=h100)
        assert r2.status_code == 403
        # assigner (EMP200) can cancel
        r3 = requests.post(f"{API}/hr/tasks/{tid}/progress", json={"status": "cancelled"}, headers=h200)
        assert r3.status_code == 200

    def test_delete_rules(self, h200):
        # create open, 0 progress
        r = requests.post(f"{API}/hr/tasks", json={"title": "TEST_del", "assignee_employee_id": EMP100_ID, "priority": "normal"}, headers=h200)
        tid = r.json()["id"]
        d = requests.delete(f"{API}/hr/tasks/{tid}", headers=h200)
        assert d.status_code == 200
        # non-open cannot be deleted (use created_task_id which is done)
        d2 = requests.delete(f"{API}/hr/tasks/{pytest.created_task_id}", headers=h_admin_headers())
        assert d2.status_code == 400


def h_admin_headers():
    return _login(*ADMIN)


# ---------------- APPRAISALS ----------------
class TestAppraisals:
    def test_meta(self, h_admin):
        r = requests.get(f"{API}/hr/appraisals/meta", headers=h_admin)
        assert r.status_code == 200
        assert len(r.json()["criteria"]) == 6

    def test_metrics_emp200(self, h200):
        r = requests.get(f"{API}/hr/appraisals/metrics/{EMP100_ID}?year=2026", headers=h200)
        assert r.status_code == 200

    def test_metrics_emp100_forbidden(self, h100):
        r = requests.get(f"{API}/hr/appraisals/metrics/{EMP100_ID}?year=2026", headers=h100)
        assert r.status_code == 403

    def test_create_returns_existing(self, h200):
        r = requests.post(f"{API}/hr/appraisals", json={"employee_id": EMP100_ID, "year": 2026}, headers=h200)
        assert r.status_code == 200
        d = r.json()
        assert d["existing"] is True
        assert d["id"] == EXISTING_APPRAISAL_ID

    def test_put_scores_all_5(self, h200):
        scores = {k: 5 for k in ["discipline", "quality", "productivity", "teamwork", "initiative", "punctuality"]}
        r = requests.put(f"{API}/hr/appraisals/{EXISTING_APPRAISAL_ID}", json={"scores": scores}, headers=h200)
        assert r.status_code == 200
        d = r.json()
        assert d["total_score"] == 100
        assert d["grade"] == "ممتاز"

    def test_put_invalid_score(self, h200):
        bad = {"discipline": 6, "quality": 3, "productivity": 3, "teamwork": 3, "initiative": 3, "punctuality": 3}
        r = requests.put(f"{API}/hr/appraisals/{EXISTING_APPRAISAL_ID}", json={"scores": bad}, headers=h200)
        assert r.status_code == 400

    def test_emp100_get_draft_forbidden(self, h100):
        # ensure it's currently draft
        r = requests.get(f"{API}/hr/appraisals/{EXISTING_APPRAISAL_ID}", headers=h100)
        assert r.status_code == 403

    def test_submit_by_emp200(self, h200):
        r = requests.post(f"{API}/hr/appraisals/{EXISTING_APPRAISAL_ID}/submit", headers=h200)
        assert r.status_code == 200

    def test_put_after_submit_400(self, h200):
        scores = {k: 4 for k in ["discipline", "quality", "productivity", "teamwork", "initiative", "punctuality"]}
        r = requests.put(f"{API}/hr/appraisals/{EXISTING_APPRAISAL_ID}", json={"scores": scores}, headers=h200)
        assert r.status_code == 400

    def test_return_by_admin(self, h_admin):
        r = requests.post(f"{API}/hr/appraisals/{EXISTING_APPRAISAL_ID}/return", json={"comment": "TEST return"}, headers=h_admin)
        assert r.status_code == 200

    def test_resubmit_and_approve(self, h200, h_admin):
        r = requests.post(f"{API}/hr/appraisals/{EXISTING_APPRAISAL_ID}/submit", headers=h200)
        assert r.status_code == 200
        r2 = requests.post(f"{API}/hr/appraisals/{EXISTING_APPRAISAL_ID}/approve", json={"comment": "ok"}, headers=h_admin)
        assert r2.status_code == 200

    def test_emp100_my_shows_approved(self, h100):
        r = requests.get(f"{API}/hr/appraisals/my", headers=h100)
        assert r.status_code == 200
        ids = [a["id"] for a in r.json()["items"]]
        assert EXISTING_APPRAISAL_ID in ids

    def test_acknowledge_by_emp100(self, h100):
        r = requests.post(f"{API}/hr/appraisals/{EXISTING_APPRAISAL_ID}/acknowledge", json={"comment": "شكراً"}, headers=h100)
        assert r.status_code == 200

    def test_acknowledge_by_emp200_forbidden(self, h200):
        r = requests.post(f"{API}/hr/appraisals/{EXISTING_APPRAISAL_ID}/acknowledge", json={"comment": "no"}, headers=h200)
        assert r.status_code == 403

    def test_overview_all_admin(self, h_admin):
        r = requests.get(f"{API}/hr/appraisals/overview?view=all&year=2026", headers=h_admin)
        assert r.status_code == 200
        assert r.json()["stats"]["approved"] >= 1

    def test_overview_team_emp200(self, h200):
        r = requests.get(f"{API}/hr/appraisals/overview?view=team&year=2026", headers=h200)
        assert r.status_code == 200
        ids = [row["employee_id"] for row in r.json()["rows"]]
        assert EMP100_ID in ids


# ---------------- DASHBOARD / ALERTS ----------------
class TestDashboardAlerts:
    def test_management_dashboard_hr(self, h_admin):
        r = requests.get(f"{API}/dashboard/management?period=day", headers=h_admin)
        assert r.status_code == 200
        hr = r.json().get("hr")
        assert hr is not None, "hr key missing"
        for k in ["employees_active", "present_today", "absent_today", "on_leave_today",
                 "pending_leaves", "pending_leaves_count", "overdue_tasks",
                 "pending_appraisals", "expiring_contracts"]:
            assert k in hr, f"missing {k}"

    def test_alerts_summary_admin(self, h_admin):
        r = requests.get(f"{API}/hr/alerts/summary", headers=h_admin)
        assert r.status_code == 200

    def test_alerts_summary_emp100_forbidden(self, h100):
        r = requests.get(f"{API}/hr/alerts/summary", headers=h100)
        assert r.status_code == 403

    def test_run_now_daily(self, h_admin):
        r = requests.post(f"{API}/hr/alerts/run-now?kind=daily", headers=h_admin)
        assert r.status_code == 200
        d = r.json()
        assert "tasks_due_tomorrow" in d

    def test_run_now_weekly(self, h_admin):
        r = requests.post(f"{API}/hr/alerts/run-now?kind=weekly", headers=h_admin)
        assert r.status_code == 200

    def test_run_now_emp100_forbidden(self, h100):
        r = requests.post(f"{API}/hr/alerts/run-now?kind=daily", headers=h100)
        assert r.status_code == 403
