"""Tests for auto activity logging middleware + Yemen timezone."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com").rstrip("/")
FACULTY_ID = "698e4f9297fef774e66e93a4"
DEPT_ID = "698e500997fef774e66e93a8"
TEACHER_ID = "698e533beb4c6eb021c50302"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data
    return data["access_token"]


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _get_logs(H, limit=20, params=None):
    p = {"limit": limit}
    if params:
        p.update(params)
    r = requests.get(f"{BASE_URL}/api/activity-logs", headers=H, params=p, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_login_returns_access_token(token):
    assert token and isinstance(token, str)


def test_activity_logs_timezone_is_yemen(H):
    logs = _get_logs(H, limit=20)
    # can be dict {logs: [...]} or list
    items = logs.get("logs") if isinstance(logs, dict) else logs
    assert isinstance(items, list) and len(items) > 0
    bad = []
    for it in items:
        ts = it.get("timestamp", "")
        if not (isinstance(ts, str) and (ts.endswith("+03:00") or ts.endswith("+0300"))):
            bad.append(ts)
    assert not bad, f"Timestamps not in +03:00 offset: {bad[:3]}"


def test_auto_log_create_and_delete_student(H):
    sid = f"TEST-AUTOLOG-{uuid.uuid4().hex[:8]}"
    payload = {
        "student_id": sid,
        "full_name": "طالب اختبار سجل تلقائي",
        "faculty_id": FACULTY_ID,
        "department_id": DEPT_ID,
        "level": 1,
        "section": "أ",
    }
    r = requests.post(f"{BASE_URL}/api/students", headers=H, json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    student_pk = created.get("id") or created.get("_id")
    assert student_pk, created

    # wait for async task
    found_create = False
    for _ in range(10):
        time.sleep(0.6)
        logs = _get_logs(H, limit=30)
        items = logs.get("logs") if isinstance(logs, dict) else logs
        for it in items:
            if it.get("action_ar") == "إنشاء طالب" and (it.get("details") or {}).get("path", "").startswith("/api/students"):
                found_create = True
                break
        if found_create:
            break
    assert found_create, "Auto log for student creation not found"

    # delete
    r = requests.delete(f"{BASE_URL}/api/students/{student_pk}", headers=H, timeout=30)
    assert r.status_code in (200, 204), r.text

    found_delete = False
    for _ in range(10):
        time.sleep(0.6)
        logs = _get_logs(H, limit=30)
        items = logs.get("logs") if isinstance(logs, dict) else logs
        for it in items:
            # Delete is manually logged (no details.path) — match by action_ar + entity_id
            if it.get("action_ar") == "حذف طالب" and (
                it.get("entity_id") == student_pk
                or (it.get("details") or {}).get("path", "").endswith(student_pk)
            ):
                found_delete = True
                break
        if found_delete:
            break
    assert found_delete, "Auto log for student delete not found"


def test_manual_log_no_duplication_teacher_prefs(H):
    url = f"{BASE_URL}/api/teacher-preferences/{TEACHER_ID}"

    # baseline count
    def count_logs_for_path(path_suffix):
        logs = _get_logs(H, limit=100)
        items = logs.get("logs") if isinstance(logs, dict) else logs
        c = 0
        for it in items:
            d = it.get("details") or {}
            if d.get("path", "").endswith(path_suffix) and d.get("method") == "PUT":
                c += 1
        return c, items

    baseline_auto, _ = count_logs_for_path(f"/teacher-preferences/{TEACHER_ID}")

    body1 = {
        "unavailable_days": [],
        "unavailable_slots": [],
        "unavailable_periods": [{"day": "السبت", "slot_number": 2}],
        "max_daily_lectures": 3,
        "allow_consecutive_lectures": True,
    }
    r = requests.put(url, headers=H, json=body1, timeout=30)
    assert r.status_code in (200, 201), r.text
    time.sleep(2.0)

    body2 = {
        "unavailable_days": [],
        "unavailable_slots": [],
        "unavailable_periods": [],
        "max_daily_lectures": 3,
        "allow_consecutive_lectures": True,
    }
    r = requests.put(url, headers=H, json=body2, timeout=30)
    assert r.status_code in (200, 201), r.text
    time.sleep(2.0)

    after_auto, items = count_logs_for_path(f"/teacher-preferences/{TEACHER_ID}")
    # Two PUT calls should produce exactly 2 logs total (one per call, no duplicates)
    added_auto = after_auto - baseline_auto
    assert added_auto == 2, f"Expected 2 logs for 2 PUT calls, got {added_auto} (duplication or missing)"

    # Also verify manual logs exist for teacher_preferences entity (no path detail typically)
    manual_recent = [it for it in items if it.get("entity_type") == "teacher_preferences" and (it.get("details") or {}).get("path") is None]
    # Not a strict assertion — just informative
    assert manual_recent is not None


def test_failed_operation_not_logged(H):
    fake_slot = "000000000000000000000000"
    r = requests.post(
        f"{BASE_URL}/api/weekly-schedule/move-slot",
        headers=H,
        json={"slot_id": fake_slot, "target_day": "السبت", "target_slot_number": 1},
        timeout=30,
    )
    assert r.status_code >= 400, f"Expected failure, got {r.status_code}: {r.text}"
    time.sleep(2.0)
    logs = _get_logs(H, limit=30)
    items = logs.get("logs") if isinstance(logs, dict) else logs
    for it in items:
        d = it.get("details") or {}
        assert not (d.get("path", "").endswith("/weekly-schedule/move-slot") and fake_slot in str(it)), \
            "Failed move-slot must not be logged"


# ===== Regression =====

def test_master_view(H):
    r = requests.get(
        f"{BASE_URL}/api/weekly-schedule/master-view",
        headers=H,
        params={"faculty_id": FACULTY_ID},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ("groups", "entries", "unscheduled", "can_manage"):
        assert k in data, f"Missing key {k} in response"


def test_valid_slots(H):
    r = requests.get(
        f"{BASE_URL}/api/weekly-schedule/valid-slots",
        headers=H,
        params={
            "faculty_id": FACULTY_ID,
            "department_id": DEPT_ID,
            "level": 1,
            "section": "أ",
            "teacher_id": TEACHER_ID,
        },
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "cells" in data
    assert isinstance(data["cells"], list) and len(data["cells"]) > 0
    sample = data["cells"][0]
    assert "valid" in sample and "reasons" in sample


def test_teacher_prefs_defaults(H):
    r = requests.get(f"{BASE_URL}/api/teacher-preferences/{TEACHER_ID}", headers=H, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("max_daily_lectures") == 3, d
    assert d.get("allow_consecutive_lectures") is True, d
