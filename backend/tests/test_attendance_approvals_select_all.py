# Attendance change approvals: "select all matching filter" bulk approve/reject endpoints + scope + regression of per-id paths
import os, sys, uuid
import pytest
import requests
from bson import ObjectId

sys.path.insert(0, os.path.dirname(__file__))
import seed_acr_test_data as S  # noqa: E402


def _base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        for l in open("/app/frontend/.env"):
            if l.startswith("REACT_APP_BACKEND_URL="):
                url = l.split("=", 1)[1].strip()
    return url.rstrip("/")


BASE_URL = _base()


def _login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed for {u}")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("admin", "admin123")


@pytest.fixture(scope="module")
def dean():
    return _login("Salim", "test1234")


@pytest.fixture(scope="module", autouse=True)
def cleanup_all():
    yield
    S.cleanup()


def _prefix():
    return f"TEST_ACR{uuid.uuid4().hex[:6].upper()}"


def _statuses(ids):
    d = S.db()
    return {str(x["_id"]): x for x in d.attendance_change_requests.find({"_id": {"$in": [ObjectId(i) for i in ids]}})}


def _real_pending():
    return S.db().attendance_change_requests.count_documents({"status": "pending", "student_name": {"$not": {"$regex": "^TEST_ACR"}}})


# List endpoint: counts.pending is the TRUE total, items limited to page size
def test_list_counts_true_total(admin):
    p = _prefix(); S.seed(p, 55, 5)
    r = admin.get(f"{BASE_URL}/api/attendance-changes", params={"status": "pending", "q": p, "page": 1, "page_size": 50})
    assert r.status_code == 200
    d = r.json()
    assert len(d["items"]) == 50
    assert d["total"] == 60 and d["counts"]["pending"] == 60 and d["pages"] == 2


# Admin approve-all across pages with filter q -> approves exactly all 60 matched, nothing else
def test_admin_approve_all_matching(admin):
    p = _prefix(); ids = S.seed(p, 55, 5)
    real_before = _real_pending()
    r = admin.post(f"{BASE_URL}/api/attendance-changes/batch/approve-all", json={"q": p})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["approved"] == 60 and d["total_matched"] == 60 and d["errors"] == []
    st = _statuses(ids)
    assert all(v["status"] == "approved" for v in st.values())
    assert _real_pending() == real_before
    att = S.db().attendance.count_documents({"last_change_request_id": {"$in": ids}, "status": "present"})
    assert att == 60


# Admin reject-all with notes -> notes applied to all
def test_admin_reject_all_with_notes(admin):
    p = _prefix(); ids = S.seed(p, 3, 2)
    r = admin.post(f"{BASE_URL}/api/attendance-changes/batch/reject-all", json={"q": p, "review_notes": "TEST_note"})
    assert r.status_code == 200
    assert r.json()["rejected"] == 5
    st = _statuses(ids)
    assert all(v["status"] == "rejected" and v["review_notes"] == "TEST_note" for v in st.values())


# Reject-all with notes omitted (optional)
def test_reject_all_without_notes(admin):
    p = _prefix(); ids = S.seed(p, 2, 0)
    r = admin.post(f"{BASE_URL}/api/attendance-changes/batch/reject-all", json={"q": p})
    assert r.status_code == 200 and r.json()["rejected"] == 2
    assert all(v["review_notes"] == "" for v in _statuses(ids).values())


# exclude_ids honored
def test_approve_all_exclude_ids(admin):
    p = _prefix(); ids = S.seed(p, 4, 0)
    r = admin.post(f"{BASE_URL}/api/attendance-changes/batch/approve-all", json={"q": p, "exclude_ids": ids[:1]})
    assert r.status_code == 200 and r.json()["approved"] == 3
    assert _statuses(ids)[ids[0]]["status"] == "pending"


# Dean scope: sends other faculty_id in payload but backend must still only touch his faculty
def test_dean_approve_all_scope_enforced(dean):
    p = _prefix(); ids = S.seed(p, 6, 4)  # first 6 = FAC_A (dean), last 4 = FAC_B
    r = dean.post(f"{BASE_URL}/api/attendance-changes/batch/approve-all", json={"q": p, "faculty_id": S.FAC_B})
    assert r.status_code == 200, r.text
    assert r.json()["approved"] == 6
    st = _statuses(ids)
    assert all(st[i]["status"] == "approved" for i in ids[:6])
    assert all(st[i]["status"] == "pending" for i in ids[6:])


def test_dean_reject_all_scope_enforced(dean):
    p = _prefix(); ids = S.seed(p, 3, 3)
    r = dean.post(f"{BASE_URL}/api/attendance-changes/batch/reject-all", json={"q": p, "faculty_id": S.FAC_B, "review_notes": "x"})
    assert r.status_code == 200 and r.json()["rejected"] == 3
    st = _statuses(ids)
    assert all(st[i]["status"] == "rejected" for i in ids[:3])
    assert all(st[i]["status"] == "pending" for i in ids[3:])


# Regression: per-id batch approve affects only given ids
def test_batch_approve_explicit_ids_only(admin):
    p = _prefix(); ids = S.seed(p, 5, 0)
    r = admin.post(f"{BASE_URL}/api/attendance-changes/batch/approve", json={"request_ids": ids[:2]})
    assert r.status_code == 200 and r.json()["approved"] == 2
    st = _statuses(ids)
    assert [st[i]["status"] for i in ids] == ["approved", "approved", "pending", "pending", "pending"]


# Regression: single approve affects only one
def test_single_approve_only_one(admin):
    p = _prefix(); ids = S.seed(p, 3, 0)
    r = admin.post(f"{BASE_URL}/api/attendance-changes/{ids[1]}/approve", json={})
    assert r.status_code == 200
    st = _statuses(ids)
    assert [st[i]["status"] for i in ids] == ["pending", "approved", "pending"]


# Unauthorized
def test_approve_all_requires_auth():
    r = requests.post(f"{BASE_URL}/api/attendance-changes/batch/approve-all", json={"q": "TEST_ACR_NOPE"})
    assert r.status_code in (401, 403)


def test_teacher_forbidden():
    s = _login("teacher180156", "teacher123")
    r = s.post(f"{BASE_URL}/api/attendance-changes/batch/approve-all", json={"q": "TEST_ACR_NOPE"})
    assert r.status_code == 403
