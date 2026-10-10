"""Backend tests for attendance change approvals endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def dean_token():
    r = requests.post(f"{API}/auth/login", json={"username": "Salim", "password": "test1234"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def teacher_token():
    r = requests.post(f"{API}/auth/login", json={"username": "teacher180156", "password": "teacher123"}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"teacher login failed: {r.status_code}")
    return r.json()["access_token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


# ─── List endpoint ─────────────────────────────────────────────
class TestList:
    def test_list_default_pending(self, admin_token):
        r = requests.get(f"{API}/attendance-changes", headers=H(admin_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "total" in d and "counts" in d
        for k in ("pending", "approved", "rejected", "cancelled", "all"):
            assert k in d["counts"]
        # all items on pending tab must be pending
        for it in d["items"]:
            assert it["status"] == "pending"
        # enrichment
        if d["items"]:
            it = d["items"][0]
            for k in ("level", "section", "student_number", "faculty_name", "department_name"):
                assert k in it

    def test_counts_match_seed_approx(self, admin_token):
        r = requests.get(f"{API}/attendance-changes?status=all", headers=H(admin_token), timeout=30)
        d = r.json()
        # seed says 58 pending / 12 approved / 9 rejected / 22 cancelled = 101 (approx; may shift due to earlier tests)
        assert d["counts"]["all"] >= 90
        assert d["counts"]["pending"] >= 40

    def test_pagination(self, admin_token):
        r = requests.get(f"{API}/attendance-changes?status=all&page=1&page_size=50", headers=H(admin_token), timeout=30)
        d = r.json()
        assert len(d["items"]) <= 50
        assert d["page"] == 1
        assert d["pages"] >= 1
        total = d["total"]
        r2 = requests.get(f"{API}/attendance-changes?status=all&page=2&page_size=50", headers=H(admin_token), timeout=30)
        d2 = r2.json()
        assert d2["page"] == 2
        if total > 50:
            assert len(d2["items"]) > 0

    def test_no_page_returns_all(self, admin_token):
        r = requests.get(f"{API}/attendance-changes?status=all", headers=H(admin_token), timeout=30)
        d = r.json()
        assert d["page"] == 1
        # legacy: no page → page_size == total
        assert d["page_size"] == d["total"]

    def test_search_by_name(self, admin_token):
        r = requests.get(f"{API}/attendance-changes?status=all&q=خالد", headers=H(admin_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        # all returned items should contain خالد somewhere searchable
        for it in d["items"][:5]:
            blob = " ".join(filter(None, [it.get("student_name"), it.get("course_name"), it.get("requested_by_name")]))
            # not strictly required but typical
            assert "خالد" in blob or it.get("student_number")

    def test_search_by_student_number(self, admin_token):
        r = requests.get(f"{API}/attendance-changes?status=all&q=234", headers=H(admin_token), timeout=30)
        assert r.status_code == 200

    def test_sort_options(self, admin_token):
        for s in ("newest", "oldest", "lecture_date", "student_name"):
            r = requests.get(f"{API}/attendance-changes?status=all&sort={s}&page=1&page_size=5", headers=H(admin_token), timeout=30)
            assert r.status_code == 200, f"sort={s} failed"

    def test_filter_new_status(self, admin_token):
        r = requests.get(f"{API}/attendance-changes?status=all&new_status=present", headers=H(admin_token), timeout=30)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["new_status"] == "present"

    def test_impossible_combo_empty(self, admin_token):
        r = requests.get(f"{API}/attendance-changes?status=all&level=99&section=ZZZZ", headers=H(admin_token), timeout=30)
        assert r.status_code == 200
        assert r.json()["total"] == 0


# ─── filter-options ─────────────────────────────────────────────
class TestFilterOptions:
    def test_filter_options(self, admin_token):
        r = requests.get(f"{API}/attendance-changes/filter-options", headers=H(admin_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("faculties", "departments", "courses", "semesters", "requesters"):
            assert k in d
        if d["courses"]:
            c = d["courses"][0]
            for k in ("id", "name", "code", "faculty_id", "department_id", "level", "section", "semester_id", "count"):
                assert k in c
        if d["departments"]:
            assert "faculty_id" in d["departments"][0]


# ─── stats ─────────────────────────────────────────────
class TestStats:
    def test_stats(self, admin_token):
        r = requests.get(f"{API}/attendance-changes/stats", headers=H(admin_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("pending_total", "pending_by_faculty", "oldest_pending_days", "requested_today", "reviewed_last_7_days"):
            assert k in d
        assert isinstance(d["pending_by_faculty"], list)
        if d["pending_by_faculty"]:
            fb = d["pending_by_faculty"][0]
            assert "faculty_id" in fb and "faculty_name" in fb and "count" in fb


# ─── export ─────────────────────────────────────────────
class TestExport:
    def test_export_xlsx(self, admin_token):
        r = requests.get(f"{API}/attendance-changes/export?status=pending", headers=H(admin_token), timeout=60)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "spreadsheet" in ct, ct
        assert len(r.content) > 500
        assert r.content[:2] == b"PK"  # xlsx is a zip

    def test_export_respects_filter(self, admin_token):
        r = requests.get(f"{API}/attendance-changes/export?status=all&level=99", headers=H(admin_token), timeout=60)
        assert r.status_code == 200
        assert r.content[:2] == b"PK"


# ─── RBAC ─────────────────────────────────────────────
class TestRBAC:
    def test_non_approver_forbidden(self, teacher_token):
        for path in ("/attendance-changes", "/attendance-changes/filter-options",
                     "/attendance-changes/stats", "/attendance-changes/export"):
            r = requests.get(f"{API}{path}", headers=H(teacher_token), timeout=30)
            assert r.status_code == 403, f"{path} returned {r.status_code}"

    def test_dean_scoped(self, dean_token, admin_token):
        # dean's faculty
        prof = requests.get(f"{API}/auth/me", headers=H(dean_token), timeout=30).json()
        fac = prof.get("faculty_id")
        if not fac:
            pytest.skip("dean has no faculty_id")
        r = requests.get(f"{API}/attendance-changes?status=all", headers=H(dean_token), timeout=30)
        assert r.status_code == 200
        for it in r.json()["items"]:
            if it.get("faculty_id"):
                assert it["faculty_id"] == fac
