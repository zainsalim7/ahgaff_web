# Lecture swap/cover (إنابة) -> substitute teacher surfaced on read endpoints
# Covers: /lectures/all-schedule, /lectures/{course_id}, /lectures/today (teacher), cancel/revert
import os
import datetime
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0].rstrip('/')

COURSE_ID = "6ac2c04cb031f88e942618de"        # لغة إنجليزية - اختبار (teacher: حسن صالح)
ORIG_TID = "698e533beb4c6eb021c50302"          # حسن صالح (login 9999)
SUB_TID = "698f671431cfba92c49a550e"           # أستاذ اختبار 180156 (login teacher180156)
TODAY = (datetime.datetime.utcnow() + datetime.timedelta(hours=3)).strftime("%Y-%m-%d")


def _lst(d):
    return d if isinstance(d, list) else d.get("lectures", [])


def _login(u, p):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login {u} failed {r.status_code}")
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("admin", "admin123")


@pytest.fixture(scope="module")
def ctx(admin):
    """create TEST lectures today (swapped + control), cover swap, yield, cancel + delete"""
    state = {"lectures": [], "swap_id": None}
    for st, et in (("21:00", "21:45"), ("22:00", "22:45")):
        r = admin.post(f"{BASE_URL}/api/lectures", json={"course_id": COURSE_ID, "date": TODAY, "start_time": st, "end_time": et,
                                                       "room": "TEST_ROOM", "notes": "TEST_swap_display", "force": True}, timeout=30)
        assert r.status_code in (200, 201), r.text
        state["lectures"].append(r.json().get("id") or r.json().get("lecture", {}).get("id"))
    yield state
    if state["swap_id"]:
        admin.post(f"{BASE_URL}/api/lecture-swaps/{state['swap_id']}/cancel", json={"note": "TEST cleanup"}, timeout=30)
    for lid in state["lectures"]:
        admin.delete(f"{BASE_URL}/api/lectures/{lid}", timeout=30)


class TestSwapDisplay:
    def test_teacher_lectures_lists_eligible(self, admin, ctx):
        r = admin.get(f"{BASE_URL}/api/lecture-swaps/teacher-lectures", params={"teacher_id": ORIG_TID}, timeout=30)
        assert r.status_code == 200
        ids = {l["id"]: l for l in r.json()["lectures"]}
        assert ctx["lectures"][0] in ids and ids[ctx["lectures"][0]]["eligible"] is True

    def test_candidates_include_substitute(self, admin, ctx):
        r = admin.get(f"{BASE_URL}/api/lecture-swaps/candidates", params={"lecture_id": ctx["lectures"][0], "type": "cover"}, timeout=60)
        assert r.status_code == 200
        t = [x for x in r.json()["teachers"] if x["teacher_id"] == SUB_TID]
        assert t and t[0]["available"], t

    def test_create_cover_swap(self, admin, ctx):
        r = admin.post(f"{BASE_URL}/api/lecture-swaps", json={"type": "cover", "lecture_a_id": ctx["lectures"][0],
                                                            "counterpart_teacher_id": SUB_TID, "reason": "TEST_swap"}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        ctx["swap_id"] = d["id"]
        ctx["orig_name"], ctx["sub_name"] = d["teacher_a_name"], d["teacher_b_name"]
        assert d["status"] == "approved"
        lst = admin.get(f"{BASE_URL}/api/lecture-swaps", timeout=30).json()
        items = lst if isinstance(lst, list) else lst.get("swaps", lst.get("items", []))
        assert any(x["id"] == d["id"] for x in items)

    def test_all_schedule_shows_substitute(self, admin, ctx):
        r = admin.get(f"{BASE_URL}/api/lectures/all-schedule", params={"date": TODAY}, timeout=60)
        assert r.status_code == 200
        by = {l["id"]: l for l in _lst(r.json())}
        sw, ctl = by[ctx["lectures"][0]], by[ctx["lectures"][1]]
        assert sw["teacher_name"] == ctx["sub_name"] and sw["is_swapped"] is True
        assert sw["original_teacher_name"] == ctx["orig_name"] and sw["swap_type"] == "cover"
        assert ctl["is_swapped"] is False and ctl["teacher_name"] == ctx["orig_name"]

    def test_course_lectures_shows_substitute(self, admin, ctx):
        r = admin.get(f"{BASE_URL}/api/lectures/{COURSE_ID}", params={"status": "scheduled"}, timeout=60)
        assert r.status_code == 200
        data = r.json()
        lst = data if isinstance(data, list) else data.get("lectures", [])
        by = {l["id"]: l for l in lst}
        sw, ctl = by[ctx["lectures"][0]], by[ctx["lectures"][1]]
        assert sw["teacher_name"] == ctx["sub_name"] and sw["is_swapped"] is True and sw["original_teacher_name"] == ctx["orig_name"]
        assert ctl["is_swapped"] is False and ctl["teacher_name"] == ctx["orig_name"]

    def test_today_substitute_teacher(self, ctx):
        s = _login("teacher180156", "teacher123")
        r = s.get(f"{BASE_URL}/api/lectures/today", timeout=60)
        assert r.status_code == 200
        by = {l["id"]: l for l in r.json()}
        assert ctx["lectures"][0] in by, "substitute does not see covered lecture"
        sw = by[ctx["lectures"][0]]
        assert sw["teacher_name"] == ctx["sub_name"] and sw["is_swapped"] is True and sw["original_teacher_name"] == ctx["orig_name"]
        assert ctx["lectures"][1] not in by  # control lecture not leaked

    def test_today_original_teacher(self, ctx):
        s = _login("9999", "teacher123")
        r = s.get(f"{BASE_URL}/api/lectures/today", timeout=60)
        assert r.status_code == 200
        by = {l["id"]: l for l in r.json()}
        ctl = by[ctx["lectures"][1]]
        assert ctl["is_swapped"] is False and ctl["teacher_name"] == ctx["orig_name"]
        # informational: does original teacher still see covered lecture?
        print("ORIGINAL_SEES_COVERED:", ctx["lectures"][0] in by, by.get(ctx["lectures"][0], {}).get("teacher_name"))

    def test_cancel_reverts(self, admin, ctx):
        r = admin.post(f"{BASE_URL}/api/lecture-swaps/{ctx['swap_id']}/cancel", json={"note": "TEST"}, timeout=30)
        assert r.status_code == 200 and r.json()["status"] == "cancelled"
        ctx["swap_id"] = None
        by = {l["id"]: l for l in _lst(admin.get(f"{BASE_URL}/api/lectures/all-schedule", params={"date": TODAY}, timeout=60).json())}
        sw = by[ctx["lectures"][0]]
        assert sw["is_swapped"] is False and sw["teacher_name"] == ctx["orig_name"] and not sw["original_teacher_name"]
