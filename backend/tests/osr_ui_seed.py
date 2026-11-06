# Seed/cleanup helper for Offline Sync Report UI tests (TEST lecture + failed logs). Usage: python osr_ui_seed.py seed|clean
import sys, json
from bson import ObjectId
from pymongo import MongoClient
env = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
db = MongoClient(env["MONGO_URL"].strip('"'))[env["DB_NAME"].strip('"')]
STATE = "/tmp/osr_ui_state.json"
if sys.argv[1] == "seed":
    lid = str(db.lectures.insert_one({"course_id": "698f0000d803b27aab0120af", "date": "2026-11-03", "start_time": "08:00",
                                      "end_time": "09:00", "room": "TEST_OSR_UI", "status": "scheduled"}).inserted_id)
    base = {"teacher_id": "698f671431cfba92c49a550e", "teacher_name": "أستاذ اختبار 180156", "course_id": "698f0000d803b27aab0120af",
            "course_name": "TEST_دراسات حضرموت", "lecture_id": lid, "lecture_date": "2026-11-03", "lecture_start_time": "08:00",
            "lecture_end_time": "09:00", "offline_recorded_at": "2026-11-05T10:00:00+03:00", "synced_at": "2026-11-06T01:00:00+00:00",
            "delay_seconds": 86400 * 2, "status": "failed", "reason": "TEST_reason_generic", "records_count": 1}
    a = str(db.offline_sync_log.insert_one({**base, "diagnosis": "TEST_DIAG تشخيص تجريبي: ساعة الجهاز",
                                             "pending_payload": {"records": [{"student_id": "TESTSTUDENT1", "status": "present"}], "notes": "test",
                                                                 "lesson_title": None, "plan_topic_id": None, "location": None}}).inserted_id)
    b = str(db.offline_sync_log.insert_one({**base, "reason": "TEST_old_no_payload"}).inserted_id)
    json.dump({"lecture_id": lid, "with": a, "without": b}, open(STATE, "w")); print(json.load(open(STATE)))
else:
    s = json.load(open(STATE))
    for c in ("attendance", "attendance_operations", "offline_sync_log"):
        print(c, db[c].delete_many({"lecture_id": s["lecture_id"]}).deleted_count)
    print("lecture", db.lectures.delete_one({"_id": ObjectId(s["lecture_id"])}).deleted_count)
