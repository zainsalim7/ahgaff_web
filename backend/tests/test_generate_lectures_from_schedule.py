"""
🗓️ اختبار توليد المحاضرات الفعلية من الجدول الأسبوعي
POST /api/weekly-schedule/generate-lectures
- dry_run: معاينة دون إنشاء
- توليد الناقص فقط (احترام المحاضرات الموجودة)
- تخطي العطلات
"""
import os
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://schedule-hub-272.preview.emergentagent.com')
START, END = "2026-10-01", "2026-10-14"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def faculty_id(headers):
    r = requests.get(f"{BASE_URL}/api/faculties", headers=headers)
    facs = r.json()
    # نبحث عن كلية لديها جدول أسبوعي
    for f in facs:
        pv = requests.post(f"{BASE_URL}/api/weekly-schedule/generate-lectures", headers=headers, json={
            "faculty_id": f["id"], "start_date": START, "end_date": END, "dry_run": True,
        })
        if pv.status_code == 200 and pv.json().get("schedule_slots", 0) > 0:
            return f["id"]
    pytest.skip("لا توجد كلية لديها جدول أسبوعي")


class TestGenerateLecturesFromSchedule:
    preview_count = None

    def test_01_dry_run_preview(self, headers, faculty_id):
        r = requests.post(f"{BASE_URL}/api/weekly-schedule/generate-lectures", headers=headers, json={
            "faculty_id": faculty_id, "start_date": START, "end_date": END, "dry_run": True,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["dry_run"] is True
        assert d["to_create"] > 0
        TestGenerateLecturesFromSchedule.preview_count = d["to_create"]

    def test_02_holidays_reduce_count(self, headers, faculty_id):
        # تعطيل كل أيام الفترة → صفر
        import datetime as dt
        s = dt.date(2026, 10, 1)
        all_days = [(s + dt.timedelta(days=i)).strftime("%Y-%m-%d") for i in range(14)]
        r = requests.post(f"{BASE_URL}/api/weekly-schedule/generate-lectures", headers=headers, json={
            "faculty_id": faculty_id, "start_date": START, "end_date": END,
            "holidays": all_days, "dry_run": True,
        })
        assert r.status_code == 200
        assert r.json()["to_create"] == 0

    def test_03_execute_creates(self, headers, faculty_id):
        r = requests.post(f"{BASE_URL}/api/weekly-schedule/generate-lectures", headers=headers, json={
            "faculty_id": faculty_id, "start_date": START, "end_date": END, "dry_run": False,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["created"] == self.preview_count

    def test_04_rerun_skips_all_existing(self, headers, faculty_id):
        """توليد الناقص فقط: إعادة التنفيذ لا تنشئ أي تكرار"""
        r = requests.post(f"{BASE_URL}/api/weekly-schedule/generate-lectures", headers=headers, json={
            "faculty_id": faculty_id, "start_date": START, "end_date": END, "dry_run": False,
        })
        assert r.status_code == 200
        d = r.json()
        assert d["created"] == 0
        assert d["already_exist"] == self.preview_count

    def test_05_invalid_dates_rejected(self, headers, faculty_id):
        r = requests.post(f"{BASE_URL}/api/weekly-schedule/generate-lectures", headers=headers, json={
            "faculty_id": faculty_id, "start_date": END, "end_date": START, "dry_run": True,
        })
        assert r.status_code == 400

    def test_06_cleanup(self, headers):
        # حذف المحاضرات المولدة في هذا الاختبار مباشرة من القاعدة عبر API غير متاح — نستخدم فلاغ التوليد
        import pymongo, os as _os
        from dotenv import load_dotenv
        load_dotenv('/app/backend/.env')
        client = pymongo.MongoClient(_os.environ['MONGO_URL'])
        db = client[_os.environ['DB_NAME']]
        res = db.lectures.delete_many({"generated_from_schedule": True, "date": {"$gte": START, "$lte": END}})
        assert res.deleted_count >= 0
