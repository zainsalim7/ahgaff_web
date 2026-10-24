# Seed / cleanup TEST data for UI check of custom-slots column (iteration_115). Usage: python3 seed_ui_custom_slots.py seed|clean
import os, sys, json, requests
from bson import ObjectId
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv('/app/frontend/.env'); load_dotenv('/app/backend/.env')
BASE = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
FAC = "698e4fb497fef774e66e93a6"
F = "/tmp/ui_seed.json"

if sys.argv[1] == "seed":
    d = str(db.departments.insert_one({"name": "TEST_UI_DEPT", "faculty_id": FAC, "is_active": True}).inserted_id)
    t = str(db.teachers.insert_one({"full_name": "TEST_UI_Teacher", "is_active": True}).inserted_id)
    base = {"department_id": d, "faculty_id": FAC, "level": 6, "section": "", "groups": [], "credit_hours": 3, "is_active": True, "semester_id": "698e5cc524745fb79482e099"}
    c1 = str(db.courses.insert_one({**base, "name": "TEST_UI_Course", "code": "TUI1", "teacher_id": t}).inserted_id)
    c2 = str(db.courses.insert_one({**base, "name": "TEST_UI_NoTeacher", "code": "TUI2", "teacher_id": None}).inserted_id)
    tok = requests.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "admin123"}).json()
    h = {"Authorization": f"Bearer {tok.get('access_token') or tok.get('token')}"}
    for day, s, e in [("wednesday", "20:10", "20:55"), ("tuesday", "08:00", "09:30"), ("wednesday", "07:00", "07:40")]:
        r = requests.post(f"{BASE}/api/lectures/generate-semester", headers=h, json={"course_id": c1, "room": "", "start_date": "2027-03-01", "end_date": "2027-03-07", "schedule": [{"day": day, "slots": [{"start_time": s, "end_time": e}]}]})
        print(r.status_code, r.json().get("weekly_notes"))
    json.dump({"dept": d, "teacher": t, "c1": c1, "c2": c2}, open(F, "w"))
    print(json.load(open(F)))
else:
    s = json.load(open(F))
    cids = [s["c1"], s["c2"]]
    db.weekly_schedule.delete_many({"course_id": {"$in": cids}})
    db.lectures.delete_many({"course_id": {"$in": cids}})
    db.courses.delete_many({"_id": {"$in": [ObjectId(x) for x in cids]}})
    db.departments.delete_one({"_id": ObjectId(s["dept"])})
    db.teachers.delete_one({"_id": ObjectId(s["teacher"])})
    print("cleaned")
