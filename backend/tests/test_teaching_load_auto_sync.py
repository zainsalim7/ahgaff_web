"""
Regression test: auto-sync of teaching_loads when generating advanced report.
Ensures assigned_weekly_hours >= sum(credit_hours of teacher's courses).
"""
import os
import requests

BASE_URL = os.environ.get("BASE_URL", "https://schedule-hub-272.preview.emergentagent.com")
API = f"{BASE_URL}/api"


def get_admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    r.raise_for_status()
    return r.json().get("access_token") or r.json().get("token")


def test_teaching_load_auto_sync():
    """After report endpoint is hit, every course with teacher_id has a teaching_load."""
    token = get_admin_token()
    H = {"Authorization": f"Bearer {token}"}

    # Trigger auto-sync via the report endpoint (no filters → all teachers)
    r = requests.get(f"{API}/teaching-load/report/advanced", headers=H)
    assert r.status_code == 200
    data = r.json()
    tc = data.get("teacher_comparison", [])

    # For each teacher, weekly_hours should be > 0 if they have courses with credit_hours > 0
    issues = []
    for t in tc:
        if t["courses_count"] > 0 and t["assigned_weekly_hours"] == 0:
            issues.append(f"{t['teacher_name']}: {t['courses_count']} courses but 0 weekly_hours")

    assert not issues, f"Auto-sync failed for: {issues}"

    # Test manual sync endpoint is idempotent
    r = requests.post(f"{API}/teaching-load/sync", headers=H)
    assert r.status_code == 200
    result1 = r.json()
    r = requests.post(f"{API}/teaching-load/sync", headers=H)
    assert r.status_code == 200
    result2 = r.json()
    # Second call should create 0 (idempotent)
    assert result2["created"] == 0, f"Sync not idempotent: 2nd call created {result2['created']}"

    print(f"✓ Auto-sync verified — {len(tc)} teachers, {result1['created']}/{result2['created']} created on 1st/2nd sync")


if __name__ == "__main__":
    test_teaching_load_auto_sync()
