# Seed/cleanup helper for attendance-approval "select all matching" tests (TEST_ACR_ prefixed records only)
import os, sys, json
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from bson import ObjectId

FAC_A = "698e4f9297fef774e66e93a4"  # Salim's faculty
FAC_B = "698e4fb497fef774e66e93a6"
IDS_FILE = "/tmp/acr_test_ids.json"


def db():
    env = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
    c = MongoClient(env["MONGO_URL"].strip('"'))
    return c[env["DB_NAME"].strip('"')]


def seed(prefix="TEST_ACR", n_a=55, n_b=5):
    d = db()
    now = datetime.now(timezone.utc)
    ids = []
    for fac, n in ((FAC_A, n_a), (FAC_B, n_b)):
        for i in range(n):
            doc = {
                "attendance_id": None, "lecture_id": f"{prefix}_LEC_{fac[-2:]}_{i // 10}",
                "course_id": f"{prefix}_COURSE_{fac[-2:]}", "course_name": f"{prefix}_COURSE", "course_code": f"{prefix}C",
                "lecture_date": "2026-01-10", "lecture_start_time": "08:00",
                "student_id": f"{prefix}_STU_{fac[-2:]}_{i}", "student_name": f"{prefix}_STUDENT_{fac[-2:]}_{i}",
                "faculty_id": fac, "department_id": "", "old_status": "absent", "new_status": "present",
                "reason": "TEST", "requested_by": "TEST_ACR_USER", "requested_by_name": f"{prefix}_REQUESTER",
                "requested_by_role": "teacher", "requested_at": now - timedelta(seconds=i),
                "status": "pending", "reviewed_by": None, "reviewed_by_name": None, "reviewed_at": None, "review_notes": None,
            }
            ids.append(str(d.attendance_change_requests.insert_one(doc).inserted_id))
    prev = json.load(open(IDS_FILE)) if os.path.exists(IDS_FILE) else []
    json.dump(prev + ids, open(IDS_FILE, "w"))
    print(f"seeded {len(ids)}")
    return ids


def cleanup():
    d = db()
    ids = json.load(open(IDS_FILE)) if os.path.exists(IDS_FILE) else []
    oids = [ObjectId(i) for i in ids]
    r1 = d.attendance_change_requests.delete_many({"_id": {"$in": oids}})
    r2 = d.attendance.delete_many({"last_change_request_id": {"$in": ids}})
    os.remove(IDS_FILE) if os.path.exists(IDS_FILE) else None
    print(f"deleted requests={r1.deleted_count} attendance={r2.deleted_count}")


if __name__ == "__main__":
    {"seed": lambda: seed(), "cleanup": cleanup}[sys.argv[1]]()
