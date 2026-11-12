# Offline Sync window contract — POST /api/attendance/session with offline_recorded_at (window / max-hours / future rules)
import os
import pytest
import requests
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
API = f"{BASE_URL.rstrip('/')}/api"

_env = {}
with open("/app/backend/.env") as f:
    for line in f:
        if "=" in line:
            k, v = line.strip().split("=", 1)
            _env[k] = v.strip('"')
mdb = MongoClient(_env["MONGO_URL"])[_env["DB_NAME"]]

COURSE_ID = "698f0000d803b27aab0120af"  # owned by teacher180156
TEST_STUDENT = "TESTSTUDENT1"
YEMEN = timezone(timedelta(hours=3))
CREATED = []
MAX_DELAY_DEFAULT = 30  # إعداد max_attendance_delay_minutes الافتراضي (لا يوجد تجاوز على مستوى كلية هذا المقرر)
GRACE_MINUTES = 5  # ATTENDANCE_OPEN_GRACE_MINUTES في server.py (تحديث 12 نوفمبر 2026)


def _now():
    return datetime.now(YEMEN)


def _max_hours():
    s = mdb.settings.find_one({"_id": "system_settings"}, {"offline_sync_max_hours": 1}) or {}
    v = s.get("offline_sync_max_hours")
    return v if isinstance(v, (int, float)) and v > 0 else 72


def _mk_lecture(day: datetime, start="08:00", end="09:00"):
    lid = str(mdb.lectures.insert_one({"course_id": COURSE_ID, "date": day.strftime("%Y-%m-%d"),
                                       "start_time": start, "end_time": end, "room": "TEST_OWC",
                                       "status": "scheduled"}).inserted_id)
    CREATED.append(lid)
    return lid


def _at(day: datetime, hhmm: str):
    h, m = map(int, hhmm.split(":"))
    return day.replace(hour=h, minute=m, second=0, microsecond=0)


def _post(h, lid, ts):
    return requests.post(f"{API}/attendance/session", headers=h, json={
        "lecture_id": lid, "records": [{"student_id": TEST_STUDENT, "status": "present"}],
        "notes": "TEST_offline_window", "offline_recorded_at": ts})


@pytest.fixture(scope="module")
def teacher_h():
    r = requests.post(f"{API}/auth/login", json={"username": "teacher180156", "password": "teacher123"})
    if r.status_code != 200:
        pytest.skip("teacher login failed")
    yield {"Authorization": f"Bearer {r.json()['access_token']}"}
    for lid in CREATED:
        mdb.attendance.delete_many({"lecture_id": lid})
        mdb.attendance_operations.delete_many({"lecture_id": lid})
        mdb.offline_sync_log.delete_many({"lecture_id": lid})
        mdb.lectures.delete_one({"_id": ObjectId(lid)})


class TestOfflineWindowContract:
    def test_inside_window_accepted_hours_later(self, teacher_h):
        # lecture yesterday 08:00-09:00, device time 08:30 yesterday, submitted now (many hours later)
        day = _now() - timedelta(days=1)
        lid = _mk_lecture(day)
        ts = _at(day, "08:30").isoformat()
        r = _post(teacher_h, lid, ts)
        print("inside:", r.status_code, r.text[:200])
        assert r.status_code == 200, r.text
        att = list(mdb.attendance.find({"lecture_id": lid}))
        assert len(att) == 1 and att[0]["status"] == "present"
        lec = mdb.lectures.find_one({"_id": ObjectId(lid)})
        assert lec["status"] == "completed"
        assert lec["attendance_started_at"].startswith(_at(day, "08:30").strftime("%Y-%m-%dT%H:%M"))
        op = mdb.attendance_operations.find_one({"lecture_id": lid})
        assert op and op["offline_recorded_at"] == ts

    def test_inside_window_utc_z_format_accepted(self, teacher_h):
        # frontend sends new Date(ts).toISOString() -> UTC 'Z'
        day = _now() - timedelta(days=1)
        lid = _mk_lecture(day, "10:00", "11:00")
        ts = _at(day, "10:15").astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        r = _post(teacher_h, lid, ts)
        print("Z:", ts, r.status_code, r.text[:200])
        assert r.status_code == 200, r.text

    def test_naive_timestamp_treated_as_yemen(self, teacher_h):
        day = _now() - timedelta(days=1)
        lid = _mk_lecture(day, "12:00", "13:00")
        r = _post(teacher_h, lid, _at(day, "12:20").strftime("%Y-%m-%dT%H:%M:%S"))
        assert r.status_code == 200, r.text

    def test_before_start_rejected(self, teacher_h):
        day = _now() - timedelta(days=1)
        lid = _mk_lecture(day, "18:00", "19:00")
        r = _post(teacher_h, lid, _at(day, "17:00").isoformat())
        assert r.status_code == 400
        assert "خارج نافذة المحاضرة" in r.json()["detail"]
        assert mdb.attendance.count_documents({"lecture_id": lid}) == 0
        log = mdb.offline_sync_log.find_one({"lecture_id": lid, "status": "failed"})
        assert log and "قبل بداية المحاضرة" in log["diagnosis"]

    def test_after_grace_rejected(self, teacher_h):
        # submission time (offline_recorded_at) = 6h after end — the OLD buggy behaviour (sending submit time)
        day = _now() - timedelta(days=1)
        lid = _mk_lecture(day, "16:00", "17:00")
        r = _post(teacher_h, lid, _at(day, "23:00").isoformat())
        assert r.status_code == 400
        d = r.json()["detail"]
        assert "خارج نافذة المحاضرة" in d and day.strftime("%Y-%m-%d") in d and "16:00-17:00" in d
        assert mdb.attendance.count_documents({"lecture_id": lid}) == 0

    def test_at_max_delay_boundary_accepted_but_after_rejected(self, teacher_h):
        # 🔒 تحديث 12 نوفمبر 2026: أُضيف هامش سماح ATTENDANCE_OPEN_GRACE_MINUTES (افتراضياً 5 دقائق) فوق
        # max_delay الافتراضي (30) لقبول الحفظ الأول/الأوفلاين فقط — الحد الفعلي الجديد = 35 دقيقة من بداية
        # المحاضرة (30+5). GET /attendance-status تبقى تُظهر "منتهية" بعد 30 دقيقة فقط دون أي تغيير (اختبار منفصل أدناه).
        day = _now() - timedelta(days=1)
        effective = MAX_DELAY_DEFAULT + GRACE_MINUTES  # 35
        lid = _mk_lecture(day, "14:00", "15:00")
        # عند الحد الفعلي الجديد بالضبط (بداية+35) → مقبول
        r_ok = _post(teacher_h, lid, (_at(day, "14:00") + timedelta(minutes=effective)).isoformat())
        assert r_ok.status_code == 200, r_ok.text
        # دقيقة واحدة بعد الحد الفعلي الجديد لمحاضرة أخرى → مرفوض
        lid2 = _mk_lecture(day, "14:05", "15:05")
        r_bad = _post(teacher_h, lid2, (_at(day, "14:05") + timedelta(minutes=effective + 1)).isoformat())
        assert r_bad.status_code == 400
        assert "خارج نافذة المحاضرة" in r_bad.json()["detail"]
        assert mdb.attendance.count_documents({"lecture_id": lid2}) == 0

    def test_grace_window_previously_rejected_now_accepted(self, teacher_h):
        # 🆕 يختبر تحديداً هامش السماح الجديد: وقت كان سيُرفض بالقاعدة القديمة (بعد max_delay=30 مباشرة)
        # يجب أن يُقبل الآن طالما داخل هامش الـ5 دقائق الإضافي (بين 30 و35 دقيقة من بداية المحاضرة)
        day = _now() - timedelta(days=1)
        lid = _mk_lecture(day, "09:00", "10:00")
        ts = (_at(day, "09:00") + timedelta(minutes=MAX_DELAY_DEFAULT + 2)).isoformat()  # +32 دقيقة
        r = _post(teacher_h, lid, ts)
        assert r.status_code == 200, r.text
        assert mdb.attendance.count_documents({"lecture_id": lid}) == 1

    def test_attendance_status_window_unchanged_still_expires_at_30(self, teacher_h):
        # 🔒 يتحقّق أن GET /lectures/{id}/attendance-status لم يتأثر بهامش السماح الجديد — تبقى تُظهر
        # "منتهية" بعد max_delay (30) دقيقة بالضبط من بداية المحاضرة، رغم أن POST يقبل حتى 35
        day = _now() - timedelta(days=1)
        lid = _mk_lecture(day, "11:00", "12:00")
        r = requests.get(f"{API}/lectures/{lid}/attendance-status", headers=teacher_h)
        assert r.status_code == 200, r.text
        data = r.json()
        # المحاضرة بالأمس ومرَّ عليها أكثر من 30 دقيقة بكثير → يجب أن تكون منتهية (لم يتغيّر بهامش السماح)
        assert data["can_take_attendance"] is False
        assert data.get("status") in ("expired", "completed")

    def test_older_than_max_hours_rejected(self, teacher_h):
        mh = _max_hours()
        day = _now() - timedelta(hours=mh + 30)
        lid = _mk_lecture(day)
        r = _post(teacher_h, lid, _at(day, "08:30").isoformat())
        print("max_hours", mh, r.status_code, r.text[:200])
        assert r.status_code == 400
        assert f"أقدم من {mh} ساعة" in r.json()["detail"]
        assert mdb.attendance.count_documents({"lecture_id": lid}) == 0

    def test_within_max_hours_and_window_accepted(self, teacher_h):
        mh = _max_hours()
        # lecture roughly (mh - 12)h ago but keep at least 24h old
        back = max(24, mh - 12)
        day = _now() - timedelta(hours=back)
        lid = _mk_lecture(day, day.strftime("%H:00"), (day.replace(minute=0) + timedelta(hours=1)).strftime("%H:%M")) \
            if day.hour < 23 else _mk_lecture(day, "08:00", "09:00")
        lec = mdb.lectures.find_one({"_id": ObjectId(lid)})
        ts = _at(day, lec["start_time"]) + timedelta(minutes=10)
        if (_now() - ts).total_seconds() > mh * 3600:
            pytest.skip("computed timestamp exceeds max hours")
        r = _post(teacher_h, lid, ts.isoformat())
        print("within max:", back, r.status_code, r.text[:200])
        assert r.status_code == 200, r.text

    def test_future_rejected(self, teacher_h):
        day = _now() - timedelta(days=1)
        lid = _mk_lecture(day, "06:00", "07:00")
        r = _post(teacher_h, lid, (_now() + timedelta(minutes=30)).isoformat())
        assert r.status_code == 400
        assert "وقت التسجيل الأوفلاين في المستقبل" in r.json()["detail"]

    def test_slightly_future_within_tolerance_not_future_error(self, teacher_h):
        # +5 min is within 10-min tolerance -> must not hit future error (falls to window check -> rejected for old lecture)
        day = _now() - timedelta(days=1)
        lid = _mk_lecture(day, "05:00", "06:00")
        r = _post(teacher_h, lid, (_now() + timedelta(minutes=5)).isoformat())
        assert r.status_code == 400
        assert "المستقبل" not in r.json()["detail"] and "خارج نافذة المحاضرة" in r.json()["detail"]
