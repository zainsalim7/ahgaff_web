# P0 regression: unified resolve_teacher_ids — /courses vs /lectures consistency, ownership 403s, offline sync per-record errors, FCM token single-owner
import os
from datetime import datetime, timedelta, timezone
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

_env = {}
with open("/app/backend/.env") as f:
    for line in f:
        if "=" in line:
            k, v = line.strip().split("=", 1)
            _env[k] = v.strip('"')
mdb = MongoClient(_env["MONGO_URL"])[_env["DB_NAME"]]
YEMEN = timezone(timedelta(hours=3))

_TOK = {}


def _login(u, p):
    if u in _TOK:
        return _TOK[u]
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login {u} failed {r.status_code}: {r.text[:120]}")
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    _TOK[u] = {"Authorization": f"Bearer {tok}"}
    return _TOK[u]


@pytest.fixture(scope="module")
def t180():
    return _login("teacher180156", "teacher123")


@pytest.fixture(scope="module")
def t9999():
    return _login("9999", "teacher123")


@pytest.fixture(scope="module")
def t222():
    return _login("222222", "teacher123")


def _course_ids(h, all_sem=False):
    r = requests.get(f"{API}/courses", headers=h, params={"all_semesters": "true"} if all_sem else None, timeout=60)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    items = data if isinstance(data, list) else data.get("items") or data.get("courses") or []
    return {c.get("id") or c.get("_id") for c in items}


def _lectures_list(resp_json):
    if isinstance(resp_json, list):
        return resp_json
    return resp_json.get("lectures") or resp_json.get("items") or []


def _unused_owned_lecture(username, *, past=True):
    """Find a non-group, non-swap lecture of a course owned by the user (via resolved ids)."""
    u = mdb.users.find_one({"username": username})
    tids = [i for i in {str(u["_id"]), u.get("teacher_record_id")} if i]
    cids = [str(c["_id"]) for c in mdb.courses.find({"teacher_id": {"$in": tids}, "is_active": True}, {"_id": 1})]
    today = datetime.now(YEMEN).strftime("%Y-%m-%d")
    q = {"course_id": {"$in": cids}, "group": {"$in": [None, ""]}, "swap_id": {"$in": [None, ""]},
         "status": {"$ne": "cancelled"}}
    q["date"] = {"$lt": (datetime.now(YEMEN) - timedelta(days=5)).strftime("%Y-%m-%d")} if past else {"$gt": today}
    return mdb.lectures.find_one(q, sort=[("date", -1 if past else 1)])


# ---------- Courses vs lectures consistency ----------
class TestCoursesLecturesConsistency:
    @pytest.mark.parametrize("who", ["teacher180156", "9999", "222222"])
    def test_month_lecture_courses_subset_of_courses(self, who):
        h = _login(who, "teacher123")
        courses = _course_ids(h)
        now = datetime.now(YEMEN)
        missing_all = {}
        months = [(now.year, now.month)]
        prev = now.replace(day=1) - timedelta(days=1)
        months.append((prev.year, prev.month))
        total = 0
        for y, m in months:
            r = requests.get(f"{API}/lectures/month/{y}/{m}", headers=h, timeout=60)
            assert r.status_code == 200, r.text[:300]
            lecs = _lectures_list(r.json())
            total += len(lecs)
            lc = {l.get("course_id") for l in lecs if l.get("course_id")}
            miss = lc - courses
            if miss:
                missing_all[f"{y}-{m}"] = list(miss)
        print(f"{who}: courses={len(courses)} month_lectures={total}")
        assert not missing_all, f"{who}: courses in /lectures/month not in /courses: {missing_all}"

    @pytest.mark.parametrize("who", ["teacher180156", "9999", "222222"])
    def test_today_lecture_courses_subset_of_courses(self, who):
        h = _login(who, "teacher123")
        courses = _course_ids(h)
        r = requests.get(f"{API}/lectures/today", headers=h, timeout=60)
        assert r.status_code == 200, r.text[:300]
        lc = {l.get("course_id") for l in _lectures_list(r.json()) if l.get("course_id")}
        assert lc <= courses, f"{who}: today lecture courses not in /courses: {lc - courses}"

    @pytest.mark.parametrize("who", ["teacher180156", "9999", "222222"])
    def test_month_lecture_courses_subset_of_all_semester_courses(self, who):
        """identity-only check (semester filter removed): every month-lecture course must be in /courses?all_semesters"""
        h = _login(who, "teacher123")
        courses = _course_ids(h, all_sem=True)
        now = datetime.now(YEMEN)
        prev = now.replace(day=1) - timedelta(days=1)
        for y, m in [(now.year, now.month), (prev.year, prev.month)]:
            lecs = _lectures_list(requests.get(f"{API}/lectures/month/{y}/{m}", headers=h, timeout=60).json())
            lc = {l.get("course_id") for l in lecs if l.get("course_id")}
            assert lc <= courses, f"{who} {y}-{m}: {lc - courses}"

    def test_teacher180156_sees_hadramout_course(self, t180):
        r = requests.get(f"{API}/courses", headers=t180, params={"all_semesters": "true"}, timeout=60)
        names = [c.get("name") for c in r.json()] if isinstance(r.json(), list) else []
        assert any("حضرموت" in (n or "") for n in names), names

    def test_9999_courses_include_teacher_record_courses(self, t9999):
        u = mdb.users.find_one({"username": "9999"})
        expected = {str(c["_id"]) for c in mdb.courses.find(
            {"teacher_id": {"$in": [str(u["_id"]), u["teacher_record_id"]]}, "is_active": True}, {"_id": 1})}
        got = _course_ids(t9999)
        # semester filter may narrow results; at least non-empty if DB has active courses
        assert got, "9999 /courses empty"
        assert got & expected, f"no overlap expected={len(expected)} got={len(got)}"

    def test_all_schedule_ok(self, t9999):
        r = requests.get(f"{API}/lectures/all-schedule", headers=t9999, timeout=60)
        assert r.status_code == 200, r.text[:300]


# ---------- Per-course lectures + enrollments ----------
class TestCourseEndpoints:
    def test_lectures_by_course_and_enrollments(self, t180):
        cids = list(_course_ids(t180, all_sem=True))
        assert cids
        for cid in cids[:3]:
            r = requests.get(f"{API}/lectures/{cid}", headers=t180, timeout=60)
            assert r.status_code == 200, f"lectures/{cid}: {r.status_code} {r.text[:200]}"
            assert isinstance(_lectures_list(r.json()), list)
            r2 = requests.get(f"{API}/enrollments/{cid}", headers=t180, timeout=60)
            assert r2.status_code == 200, f"enrollments/{cid}: {r2.status_code} {r2.text[:200]}"


# ---------- Test fixtures: own TEST lectures (yesterday 08:00-09:00) in each teacher's course ----------
CREATED_LECS, CREATED_COURSES = [], []


def _tids(username):
    u = mdb.users.find_one({"username": username})
    return u, [i for i in {str(u["_id"]), u.get("teacher_record_id")} if i]


def _mk_lec(course_id):
    day = datetime.now(YEMEN) - timedelta(days=1)
    lid = str(mdb.lectures.insert_one({"course_id": course_id, "date": day.strftime("%Y-%m-%d"),
                                       "start_time": "08:00", "end_time": "09:00", "room": "TEST_RTI",
                                       "status": "scheduled",
                                       "semester_id": str(mdb.semesters.find_one({"status": "active"})["_id"])}).inserted_id)
    CREATED_LECS.append(lid)
    return lid, day.replace(hour=8, minute=10, second=0, microsecond=0).isoformat()


@pytest.fixture(scope="module")
def lecs():
    u180, t180ids = _tids("teacher180156")
    c180 = mdb.courses.find_one({"teacher_id": {"$in": t180ids}, "is_active": True, "name": {"$regex": "حضرموت"}}) \
        or mdb.courses.find_one({"teacher_id": {"$in": t180ids}, "is_active": True})
    u99, _ = _tids("9999")
    c99 = mdb.courses.find_one({"teacher_id": u99["teacher_record_id"], "is_active": True})
    # TEST course assigned via user_id (NOT teacher_record_id) for 9999 — must also be recognised
    c99u = mdb.courses.insert_one({"name": "TEST_RTI_userid_course", "code": "TEST_RTI", "teacher_id": str(u99["_id"]),
                                   "department_id": (c99 or {}).get("department_id"), "level": (c99 or {}).get("level"),
                                   "section": (c99 or {}).get("section"), "semester_id": str(mdb.semesters.find_one({"status": "active"})["_id"]),
                                   "is_active": True}).inserted_id
    CREATED_COURSES.append(c99u)
    d = {"c180": str(c180["_id"]), "c99": str(c99["_id"]), "c99u": str(c99u)}
    d["l180"], d["ts180"] = _mk_lec(d["c180"])
    d["l99"], d["ts99"] = _mk_lec(d["c99"])
    d["l99u"], d["ts99u"] = _mk_lec(d["c99u"])
    yield d
    for lid in CREATED_LECS:
        mdb.attendance.delete_many({"lecture_id": lid})
        mdb.attendance_operations.delete_many({"lecture_id": lid})
        mdb.offline_sync_log.delete_many({"lecture_id": lid})
        mdb.lectures.delete_one({"_id": ObjectId(lid)})
    for cid in CREATED_COURSES:
        mdb.courses.delete_one({"_id": cid})


# ---------- user_id-assigned course visible in /courses ----------
class TestUserIdAssignedCourse:
    def test_userid_course_visible_in_courses_and_month(self, t9999, lecs):
        assert lecs["c99u"] in _course_ids(t9999), "course with teacher_id=user_id missing from /courses"
        y = datetime.now(YEMEN) - timedelta(days=1)
        r = requests.get(f"{API}/lectures/month/{y.year}/{y.month}", headers=t9999, timeout=60)
        assert r.status_code == 200
        assert lecs["l99u"] in {l.get("id") or l.get("_id") for l in _lectures_list(r.json())}

    def test_userid_course_lectures_and_details(self, t9999, lecs):
        r = requests.get(f"{API}/lectures/{lecs['c99u']}", headers=t9999, timeout=60)
        assert r.status_code == 200, r.text[:200]
        r = requests.get(f"{API}/lectures/{lecs['l99u']}/details", headers=t9999, timeout=60)
        assert r.status_code == 200, r.text[:200]


# ---------- Lecture details ownership ----------
class TestLectureDetailsOwnership:
    def test_owner_200(self, t180, t9999, lecs):
        r = requests.get(f"{API}/lectures/{lecs['l180']}/details", headers=t180, timeout=60)
        assert r.status_code == 200, r.text[:300]
        r = requests.get(f"{API}/lectures/{lecs['l99']}/details", headers=t9999, timeout=60)
        assert r.status_code == 200, r.text[:300]

    def test_non_owner_403(self, t180, t9999, t222, lecs):
        assert requests.get(f"{API}/lectures/{lecs['l180']}/details", headers=t9999, timeout=60).status_code == 403
        assert requests.get(f"{API}/lectures/{lecs['l99']}/details", headers=t180, timeout=60).status_code == 403
        # 222222 is group leader in hadramout course but this lecture is non-group -> expect 403
        r = requests.get(f"{API}/lectures/{lecs['l180']}/details", headers=t222, timeout=60)
        print("222222 on non-group lecture of hadramout:", r.status_code)
        assert r.status_code == 403


# ---------- Online attendance session (offline_recorded_at inside 30-min window) ----------
class TestAttendanceSessionOwnership:
    def _post(self, h, lid, ts):
        return requests.post(f"{API}/attendance/session", headers=h, timeout=60, json={
            "lecture_id": lid, "records": [{"student_id": "TESTSTUDENT1", "status": "present"}],
            "notes": "TEST_RTI", "offline_recorded_at": ts})

    def test_non_owner_403(self, t9999, t180, lecs):
        assert self._post(t9999, lecs["l180"], lecs["ts180"]).status_code == 403
        assert self._post(t180, lecs["l99"], lecs["ts99"]).status_code == 403

    def test_owner_teacher180156_success(self, t180, lecs):
        r = self._post(t180, lecs["l180"], lecs["ts180"])
        assert r.status_code == 200, r.text[:300]
        assert mdb.attendance.count_documents({"lecture_id": lecs["l180"]}) == 1

    def test_owner_9999_record_id_course_success(self, t9999, lecs):
        r = self._post(t9999, lecs["l99"], lecs["ts99"])
        assert r.status_code == 200, r.text[:300]

    def test_owner_9999_userid_course_success(self, t9999, lecs):
        r = self._post(t9999, lecs["l99u"], lecs["ts99u"])
        assert r.status_code == 200, r.text[:300]

    def test_outside_30min_window_rejected_400(self, t180, lecs):
        day = datetime.fromisoformat(lecs["ts180"]).replace(hour=8, minute=45)
        r = self._post(t180, lecs["l180"], day.isoformat())
        print("outside window:", r.status_code, r.text[:200])
        assert r.status_code == 400


# ---------- Offline sync ownership: per-record errors ----------
class TestOfflineSyncOwnership:
    def test_mixed_batch(self, t9999, lecs):
        def rec(lid, cid, ts, n):
            return {"local_id": f"TEST_RTI_{n}", "course_id": cid, "lecture_id": lid,
                    "student_id": "TESTSTUDENT2", "status": "present", "date": ts, "recorded_at": ts}
        body = {"attendance_records": [rec(lecs["l180"], lecs["c180"], lecs["ts180"], "foreign"),
                                       rec(lecs["l99"], lecs["c99"], lecs["ts99"], "own_rid"),
                                       rec(lecs["l99u"], lecs["c99u"], lecs["ts99u"], "own_uid")]}
        r = requests.post(f"{API}/sync/attendance", json=body, headers=t9999, timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        print("sync resp:", d)
        errs = d.get("errors") or []
        assert any("غير مصرح" in e and lecs["c180"] in e for e in errs), errs
        assert not any("غير مصرح" in e and (lecs["c99"] in e or lecs["c99u"] in e) for e in errs), errs
        assert d.get("synced", 0) >= 2, d
        assert mdb.attendance.count_documents({"local_id": "TEST_RTI_foreign"}) == 0
        assert mdb.attendance.count_documents({"local_id": {"$in": ["TEST_RTI_own_rid", "TEST_RTI_own_uid"]}}) == 2


# ---------- FCM token single active owner ----------
class TestFcmTokenSingleOwner:
    TOKEN = "TEST_rt_fcm_shared_device_token_001"

    def test_shared_token_moves_to_last_user(self, t9999, t222):
        try:
            for h in (t9999, t222):
                r = requests.post(f"{API}/notifications/register-token",
                                  json={"token": self.TOKEN, "device_type": "android"}, headers=h, timeout=30)
                assert r.status_code == 200, r.text[:200]
            docs = list(mdb.fcm_tokens.find({"token": self.TOKEN}))
            u222 = str(mdb.users.find_one({"username": "222222"})["_id"])
            assert len(docs) == 1, f"duplicates: {len(docs)}"
            assert docs[0]["user_id"] == u222
            # switch back: owner becomes 9999
            r = requests.post(f"{API}/notifications/register-token",
                              json={"token": self.TOKEN, "device_type": "android"}, headers=t9999, timeout=30)
            assert r.status_code == 200
            docs = list(mdb.fcm_tokens.find({"token": self.TOKEN}))
            u9999 = str(mdb.users.find_one({"username": "9999"})["_id"])
            assert len(docs) == 1 and docs[0]["user_id"] == u9999
        finally:
            mdb.fcm_tokens.delete_many({"token": self.TOKEN})
