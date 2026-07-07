"""
اختبار منع تكرار/تداخل محاضرات المقرر الواحد
Tests strict conflict prevention for lectures (same course, same date/time)
- POST /api/lectures: exact duplicate + overlap must be rejected (even with force=true)
- PUT /api/lectures/{id}: editing into an overlap must be rejected
- DB-level: unique index uniq_course_date_start must exist
"""
import os
import requests
import pytest
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://schedule-hub-272.preview.emergentagent.com')


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def course_id(admin_token):
    r = requests.get(f"{BASE_URL}/api/courses", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    courses = data if isinstance(data, list) else data.get("courses", [])
    for c in courses:
        if c.get("teacher_id"):
            return c["id"]
    pytest.skip("لا يوجد مقرر له أستاذ للاختبار")


@pytest.fixture(scope="module")
def future_date():
    return (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")


class TestLectureDuplicatePrevention:
    created_ids = []

    def _headers(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_01_create_first_lecture(self, admin_token, course_id, future_date):
        r = requests.post(f"{BASE_URL}/api/lectures", headers=self._headers(admin_token), json={
            "course_id": course_id, "date": future_date,
            "start_time": "10:00", "end_time": "11:30", "room": "المختبر",
        })
        assert r.status_code == 200, r.text
        TestLectureDuplicatePrevention.created_ids.append(r.json()["id"])

    def test_02_exact_duplicate_rejected_even_with_force(self, admin_token, course_id, future_date):
        r = requests.post(f"{BASE_URL}/api/lectures", headers=self._headers(admin_token), json={
            "course_id": course_id, "date": future_date,
            "start_time": "10:00", "end_time": "11:30", "room": "المدرسة", "force": True,
        })
        assert r.status_code in (400, 409), f"Expected rejection, got {r.status_code}: {r.text}"
        assert "تعارض" in r.json()["detail"] or "مطابقة" in r.json()["detail"]

    def test_03_partial_overlap_rejected(self, admin_token, course_id, future_date):
        r = requests.post(f"{BASE_URL}/api/lectures", headers=self._headers(admin_token), json={
            "course_id": course_id, "date": future_date,
            "start_time": "10:30", "end_time": "12:00", "room": "المدرسة", "force": True,
        })
        assert r.status_code in (400, 409), f"Expected rejection, got {r.status_code}: {r.text}"

    def test_04_non_overlapping_allowed(self, admin_token, course_id, future_date):
        r = requests.post(f"{BASE_URL}/api/lectures", headers=self._headers(admin_token), json={
            "course_id": course_id, "date": future_date,
            "start_time": "12:00", "end_time": "13:00", "room": "المدرسة",
        })
        assert r.status_code == 200, r.text
        TestLectureDuplicatePrevention.created_ids.append(r.json()["id"])

    def test_05_edit_into_overlap_rejected(self, admin_token):
        assert len(self.created_ids) >= 2
        r = requests.put(
            f"{BASE_URL}/api/lectures/{self.created_ids[1]}",
            headers=self._headers(admin_token),
            json={"start_time": "10:00", "end_time": "11:30"},
        )
        assert r.status_code in (400, 409), f"Expected rejection, got {r.status_code}: {r.text}"

    def test_06_cleanup(self, admin_token):
        for lid in self.created_ids:
            requests.delete(f"{BASE_URL}/api/lectures/{lid}", headers=self._headers(admin_token))


class TestRoomConflictPrevention:
    """🏛️ منع تعارض القاعات: قاعة واحدة لا تستقبل محاضرتين متداخلتين لمعلمين/مقررين مختلفين"""
    created_ids = []
    ROOM = "قاعة اختبار تعارض"
    DATE = (datetime.now() + timedelta(days=35)).strftime("%Y-%m-%d")

    def _headers(self, token):
        return {"Authorization": f"Bearer {token}"}

    @pytest.fixture(scope="class")
    def two_courses(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/courses", headers=self._headers(admin_token))
        data = r.json()
        courses = data if isinstance(data, list) else data.get("courses", [])
        seen = {}
        for c in courses:
            t = c.get("teacher_id")
            if t and t not in seen:
                seen[t] = c["id"]
            if len(seen) >= 2:
                break
        if len(seen) < 2:
            pytest.skip("يلزم مقرران بمعلمين مختلفين")
        return list(seen.values())[:2]

    def test_01_first_lecture_in_room(self, admin_token, two_courses):
        r = requests.post(f"{BASE_URL}/api/lectures", headers=self._headers(admin_token), json={
            "course_id": two_courses[0], "date": self.DATE,
            "start_time": "10:00", "end_time": "11:30", "room": self.ROOM,
        })
        assert r.status_code == 200, r.text
        TestRoomConflictPrevention.created_ids.append(r.json()["id"])

    def test_02_other_course_same_room_overlap_rejected(self, admin_token, two_courses):
        r = requests.post(f"{BASE_URL}/api/lectures", headers=self._headers(admin_token), json={
            "course_id": two_courses[1], "date": self.DATE,
            "start_time": "10:30", "end_time": "12:00", "room": self.ROOM, "force": True,
        })
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        assert "تعارض قاعة" in r.json()["detail"]

    def test_03_other_course_same_room_non_overlap_allowed(self, admin_token, two_courses):
        r = requests.post(f"{BASE_URL}/api/lectures", headers=self._headers(admin_token), json={
            "course_id": two_courses[1], "date": self.DATE,
            "start_time": "12:00", "end_time": "13:00", "room": self.ROOM,
        })
        assert r.status_code == 200, r.text
        TestRoomConflictPrevention.created_ids.append(r.json()["id"])

    def test_04_cleanup(self, admin_token):
        for lid in self.created_ids:
            requests.delete(f"{BASE_URL}/api/lectures/{lid}", headers=self._headers(admin_token))
