# Day Shift per-lecture exceptions — preview API tests (uses seed from seed_day_shift_exceptions.py; preview only, no DB writes)
import json
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
SEED = json.load(open("/tmp/day_shift_seed_ids.json")) if os.path.exists("/tmp/day_shift_seed_ids.json") else None
DATE = "2026-12-15"


@pytest.fixture(scope="module")
def client():
    if not SEED:
        pytest.skip("seed not present")
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get("access_token") or r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def _prev(client, exceptions=None, start="10:00"):
    body = {"date_from": DATE, "faculty_id": SEED["faculty"], "new_start_time": start, "reason": "TEST_", "notify": False}
    if exceptions is not None:
        body["exceptions"] = exceptions
    return client.post(f"{BASE_URL}/api/day-shift/preview", json=body)


def _row(d, lid):
    return next(r for r in d["lectures"] if r["id"] == lid)


class TestDayShiftExceptionsPreview:
    def test_baseline(self, client):
        r = _prev(client)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total_lectures"] == 2 and d["total_kept"] == 1 and d["total_cancelled"] == 1
        assert d["exceptions_applied"] == 0
        assert len(d["lectures"]) == 4
        L1, L2, L4, L5 = SEED["lectures"]
        assert _row(d, L1)["rule_action"] == "move" and _row(d, L1)["new_start"] == "10:00" and _row(d, L1)["new_end"] == "11:00"
        assert _row(d, L2)["new_start"] == "11:10" and _row(d, L2)["new_end"] == "12:10"
        assert _row(d, L4)["rule_action"] == "keep" and _row(d, L4)["rule_action_label"] == "تبقى بوقتها الفعلي"
        assert _row(d, L5)["rule_action"] == "cancel" and _row(d, L5)["final_action_label"] == "ستُلغى"

    def test_keep_on_morning(self, client):
        L1 = SEED["lectures"][0]
        d = _prev(client, {L1: "keep"}).json()
        assert d["total_lectures"] == 1 and d["exceptions_applied"] == 1
        r = _row(d, L1)
        assert r["final_action"] == "keep" and r["exception"] == "keep" and r["new_start"] == "08:00"

    def test_cancel_on_fourth(self, client):
        L4 = SEED["lectures"][2]
        d = _prev(client, {L4: "cancel"}).json()
        assert d["total_kept"] == 0 and d["total_cancelled"] == 2
        assert _row(d, L4)["final_action"] == "cancel"

    def test_keep_on_late(self, client):
        L5 = SEED["lectures"][3]
        d = _prev(client, {L5: "keep"}).json()
        assert d["total_cancelled"] == 0 and _row(d, L5)["final_action"] == "keep"

    def test_cancel_on_morning(self, client):
        L2 = SEED["lectures"][1]
        d = _prev(client, {L2: "cancel"}).json()
        assert d["total_lectures"] == 1 and d["total_cancelled"] == 2
        assert _row(d, L2)["final_action"] == "cancel"

    def test_combined(self, client):
        L1, L2, L4, L5 = SEED["lectures"]
        d = _prev(client, {L1: "keep", L4: "cancel", L5: "keep"}).json()
        assert d["total_lectures"] == 1 and d["total_kept"] == 0 and d["total_cancelled"] == 1
        assert d["exceptions_applied"] == 3

    def test_unknown_lecture_id_ignored(self, client):
        d = _prev(client, {"000000000000000000000000": "cancel"}).json()
        assert d["total_lectures"] == 2 and d["exceptions_applied"] == 0

    def test_invalid_action_value_behaviour(self, client):
        # invalid action is not validated; should behave like rule (documenting behaviour)
        L1 = SEED["lectures"][0]
        r = _prev(client, {L1: "bogus"})
        print("invalid action status", r.status_code)
        assert r.status_code in (200, 400, 422)
        if r.status_code == 200:
            assert r.json()["total_lectures"] == 2

    def test_no_auth(self):
        r = requests.post(f"{BASE_URL}/api/day-shift/preview", json={"date_from": DATE, "new_start_time": "10:00"})
        assert r.status_code in (401, 403)
