# Seed/cleanup helper for Faculty Board UI testing: python3 fb_seed.py seed|clean
import os, sys
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
STUDENT_ID, COURSE_ID, MARK = "698e57518cfb2f14627a285e", "6ab3a8ad447a8c2cd67c801c", "TEST_FB_UI"
if sys.argv[1] == "seed":
    for d in ("2026-01-05", "2026-01-06"):
        r = db.lectures.insert_one({"course_id": COURSE_ID, "date": d, "start_time": "08:00", "end_time": "09:00", "status": "completed", "room": MARK, "created_at": datetime.utcnow()})
        db.attendance.insert_one({"course_id": COURSE_ID, "lecture_id": str(r.inserted_id), "student_id": STUDENT_ID, "status": "absent", "note": MARK})
    print("seeded")
else:
    print(db.attendance.delete_many({"note": MARK}).deleted_count, db.lectures.delete_many({"room": MARK}).deleted_count,
          db.faculty_board_decisions.delete_many({"student_id": STUDENT_ID}).deleted_count,
          db.faculty_board_sessions.delete_many({"title": {"$regex": "^TEST_"}}).deleted_count)
