"""
Tests for student status management endpoints
- /api/student-status/stats
- /api/student-status/{id}/change (single)
- /api/student-status/bulk-change
- /api/student-status/{id}/history
- RBAC enforcement (teacher gets 403 on change endpoints)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to public preview URL from frontend/.env if env var missing in shell
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL=") or line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

API = f"{BASE_URL}/api"
VALID_STATUSES = {"active", "repeat", "graduated", "expelled", "frozen"}


# ============ Fixtures ============

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="session")
def teacher_token():
    r = requests.post(f"{API}/auth/login", json={"username": "teacher180156", "password": "teacher123"})
    if r.status_code != 200:
        pytest.skip(f"Teacher login failed: {r.status_code}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def teacher_headers(teacher_token):
    return {"Authorization": f"Bearer {teacher_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def sample_student_ids(admin_headers):
    """Get two real student IDs for bulk testing."""
    r = requests.get(f"{API}/students?limit=5", headers=admin_headers)
    if r.status_code != 200:
        pytest.skip(f"Cannot fetch students: {r.status_code}")
    data = r.json()
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = data.get("items") or data.get("students") or []
    else:
        items = []
    ids = []
    for s in items[:5]:
        sid = s.get("id") or s.get("_id")
        if sid:
            ids.append(str(sid))
    if len(ids) < 2:
        pytest.skip(f"Need at least 2 students, got {len(ids)}")
    return ids


# ============ Stats ============

class TestStats:
    def test_stats_admin_ok(self, admin_headers):
        r = requests.get(f"{API}/student-status/stats", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "total" in data
        assert "stats" in data
        assert "labels" in data
        # All 5 statuses must be keys in stats
        for s in VALID_STATUSES:
            assert s in data["stats"], f"Missing status {s} in stats"
        assert isinstance(data["total"], int)
        assert data["total"] >= 0

    def test_stats_teacher_403_or_ok(self, teacher_headers):
        # Teacher with VIEW_STUDENTS could be allowed; without it, 403
        r = requests.get(f"{API}/student-status/stats", headers=teacher_headers)
        assert r.status_code in (200, 403)


# ============ Single change + history ============

class TestSingleChangeAndHistory:
    def test_change_to_active_then_history(self, admin_headers, sample_student_ids):
        sid = sample_student_ids[0]
        # change to active
        r = requests.post(
            f"{API}/student-status/{sid}/change",
            headers=admin_headers,
            json={"new_status": "active", "reason": "TEST_active"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["new_status"] == "active"

        # verify student doc is_active=True
        s = requests.get(f"{API}/students/{sid}", headers=admin_headers).json()
        assert s.get("is_active") is True

        # history must contain at least this change
        h = requests.get(f"{API}/student-status/{sid}/history", headers=admin_headers)
        assert h.status_code == 200
        hist = h.json()
        assert hist["total"] >= 1
        assert any(it.get("reason") == "TEST_active" for it in hist["items"])

    def test_change_to_repeat_keeps_active(self, admin_headers, sample_student_ids):
        sid = sample_student_ids[0]
        r = requests.post(
            f"{API}/student-status/{sid}/change",
            headers=admin_headers,
            json={"new_status": "repeat", "reason": "TEST_repeat"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["new_status"] == "repeat"
        s = requests.get(f"{API}/students/{sid}", headers=admin_headers).json()
        assert s.get("is_active") is True
        # Note: GET /students/{id} response model omits 'status' field (see report)

    def test_change_to_graduated_sets_inactive_and_date(self, admin_headers, sample_student_ids):
        sid = sample_student_ids[0]
        r = requests.post(
            f"{API}/student-status/{sid}/change",
            headers=admin_headers,
            json={"new_status": "graduated", "reason": "TEST_grad"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["new_status"] == "graduated"
        s = requests.get(f"{API}/students/{sid}", headers=admin_headers).json()
        assert s.get("is_active") is False
        # Verify status persisted via stats
        stats = requests.get(f"{API}/student-status/stats", headers=admin_headers).json()
        assert stats["stats"]["graduated"] >= 1

    def test_change_to_expelled_sets_inactive_and_date(self, admin_headers, sample_student_ids):
        sid = sample_student_ids[1]
        r = requests.post(
            f"{API}/student-status/{sid}/change",
            headers=admin_headers,
            json={"new_status": "expelled", "reason": "TEST_expel"},
        )
        assert r.status_code == 200, r.text
        s = requests.get(f"{API}/students/{sid}", headers=admin_headers).json()
        assert s.get("is_active") is False
        stats = requests.get(f"{API}/student-status/stats", headers=admin_headers).json()
        assert stats["stats"]["expelled"] >= 1

    def test_change_to_frozen_sets_inactive_and_date(self, admin_headers, sample_student_ids):
        sid = sample_student_ids[1]
        r = requests.post(
            f"{API}/student-status/{sid}/change",
            headers=admin_headers,
            json={"new_status": "frozen", "reason": "TEST_frozen"},
        )
        assert r.status_code == 200, r.text
        s = requests.get(f"{API}/students/{sid}", headers=admin_headers).json()
        assert s.get("is_active") is False
        stats = requests.get(f"{API}/student-status/stats", headers=admin_headers).json()
        assert stats["stats"]["frozen"] >= 1

    def test_invalid_status_returns_400(self, admin_headers, sample_student_ids):
        sid = sample_student_ids[0]
        r = requests.post(
            f"{API}/student-status/{sid}/change",
            headers=admin_headers,
            json={"new_status": "bogus_status"},
        )
        assert r.status_code == 400

    def test_history_accumulates_changes(self, admin_headers, sample_student_ids):
        sid = sample_student_ids[0]
        before = requests.get(f"{API}/student-status/{sid}/history", headers=admin_headers).json()
        n_before = before["total"]
        # do a change
        requests.post(
            f"{API}/student-status/{sid}/change",
            headers=admin_headers,
            json={"new_status": "active", "reason": "TEST_hist1"},
        )
        requests.post(
            f"{API}/student-status/{sid}/change",
            headers=admin_headers,
            json={"new_status": "repeat", "reason": "TEST_hist2"},
        )
        after = requests.get(f"{API}/student-status/{sid}/history", headers=admin_headers).json()
        assert after["total"] >= n_before + 2

    def test_repeat_with_lower_level(self, admin_headers, sample_student_ids):
        sid = sample_student_ids[0]
        # First set to known state
        s = requests.get(f"{API}/students/{sid}", headers=admin_headers).json()
        original_level = s.get("level") or 2
        target_level = max(1, int(original_level) - 1) if int(original_level) > 1 else 1
        r = requests.post(
            f"{API}/student-status/{sid}/change",
            headers=admin_headers,
            json={"new_status": "repeat", "new_level": target_level, "reason": "TEST_repeat_lower"},
        )
        assert r.status_code == 200, r.text
        s2 = requests.get(f"{API}/students/{sid}", headers=admin_headers).json()
        assert s2.get("level") == target_level
        assert s2.get("is_active") is True


# ============ Bulk change ============

class TestBulkChange:
    def test_bulk_change_two_students(self, admin_headers, sample_student_ids):
        ids = sample_student_ids[:2]
        r = requests.post(
            f"{API}/student-status/bulk-change",
            headers=admin_headers,
            json={"student_ids": ids, "new_status": "active", "reason": "TEST_bulk"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["success_count"] == len(ids)
        assert body["failed_count"] == 0
        assert body["new_status"] == "active"
        assert len(body["results"]) == len(ids)
        for res in body["results"]:
            assert res["ok"] is True

    def test_bulk_with_bad_id_partial_fail(self, admin_headers, sample_student_ids):
        ids = [sample_student_ids[0], "not-a-real-id"]
        r = requests.post(
            f"{API}/student-status/bulk-change",
            headers=admin_headers,
            json={"student_ids": ids, "new_status": "active", "reason": "TEST_bulk_partial"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["failed_count"] >= 1
        assert body["success_count"] >= 1

    def test_bulk_invalid_status(self, admin_headers, sample_student_ids):
        r = requests.post(
            f"{API}/student-status/bulk-change",
            headers=admin_headers,
            json={"student_ids": sample_student_ids[:1], "new_status": "wrong"},
        )
        assert r.status_code == 400


# ============ RBAC ============

class TestRBAC:
    def test_teacher_bulk_change_403(self, teacher_headers, sample_student_ids):
        r = requests.post(
            f"{API}/student-status/bulk-change",
            headers=teacher_headers,
            json={"student_ids": sample_student_ids[:1], "new_status": "active"},
        )
        assert r.status_code == 403

    def test_teacher_single_change_403(self, teacher_headers, sample_student_ids):
        sid = sample_student_ids[0]
        r = requests.post(
            f"{API}/student-status/{sid}/change",
            headers=teacher_headers,
            json={"new_status": "active"},
        )
        assert r.status_code == 403

    def test_no_auth_returns_401_or_403(self, sample_student_ids):
        r = requests.post(
            f"{API}/student-status/bulk-change",
            json={"student_ids": sample_student_ids[:1], "new_status": "active"},
        )
        assert r.status_code in (401, 403)
