# UI setup/cleanup for attendance-lookup lecture_change_history check. Usage: python ui183_lookup_setup.py setup|cleanup
import json, sys
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from pymongo import MongoClient

env = {}
for l in open("/app/backend/.env"):
    if "=" in l:
        k, v = l.strip().split("=", 1); env[k] = v.strip('"')
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
F = "/tmp/ui183_ids.json"
Y = timezone(timedelta(hours=3))

if sys.argv[1] == "setup":
    cid = str(db.courses.insert_one({"name": "TEST_UI183Course", "code": "TEST_UI183"}).inserted_id)
    sid = str(db.students.insert_one({"full_name": "TEST_UI183Student", "student_id": "TEST_UI183"}).inserted_id)
    d1 = datetime(2026, 10, 17, 8, 0, tzinfo=Y); d2 = datetime(2026, 10, 18, 8, 0, tzinfo=Y)
    l1 = str(db.lectures.insert_one({"course_id": cid, "date": "2026-10-17", "start_time": "08:00", "end_time": "09:00", "status": "completed"}).inserted_id)
    l2 = str(db.lectures.insert_one({"course_id": cid, "date": "2026-10-18", "start_time": "08:00", "end_time": "09:00", "status": "completed"}).inserted_id)
    a1 = str(db.attendance.insert_one({"lecture_id": l1, "course_id": cid, "student_id": sid, "status": "absent", "date": d1, "method": "manual", "created_at": d1}).inserted_id)
    a2 = str(db.attendance.insert_one({"lecture_id": l2, "course_id": cid, "student_id": sid, "status": "present", "date": d2, "method": "manual", "created_at": d2}).inserted_id)
    lg = str(db.lecture_change_log.insert_one({"lecture_id": l1, "course_id": cid, "action": "TEST_reschedule", "changes": {"date": {"from": "2026-10-10", "to": "2026-10-17"}}, "reason": "TEST_UI_reason", "by_name": "TEST_UI_by", "at": datetime.now(timezone.utc)}).inserted_id)
    ids = dict(cid=cid, sid=sid, l1=l1, l2=l2, a1=a1, a2=a2, lg=lg)
    json.dump(ids, open(F, "w")); print(json.dumps(ids))
else:
    ids = json.load(open(F))
    db.attendance.delete_many({"_id": {"$in": [ObjectId(ids["a1"]), ObjectId(ids["a2"])]}})
    db.lecture_change_log.delete_one({"_id": ObjectId(ids["lg"])})
    db.lectures.delete_many({"_id": {"$in": [ObjectId(ids["l1"]), ObjectId(ids["l2"])]}})
    db.students.delete_one({"_id": ObjectId(ids["sid"])})
    db.courses.delete_one({"_id": ObjectId(ids["cid"])})
    print("cleaned")
