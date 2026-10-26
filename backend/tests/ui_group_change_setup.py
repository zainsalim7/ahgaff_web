# UI helper for group-change 409 dialog test: `setup` | `check <id>` | `cleanup` (TEST_UI_GROUP lectures)
import sys, json, requests
from pymongo import MongoClient
from bson import ObjectId
BASE = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL=")][0].rstrip("/")
db = MongoClient("mongodb://localhost:27017")["test_database"]
TAG = "TEST_UI_GROUP"
DATE = "2026-11-02"
s = requests.Session()
d = s.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "admin123"}).json()
s.headers["Authorization"] = "Bearer " + (d.get("access_token") or d.get("token"))
cmd = sys.argv[1]
if cmd == "setup":
    out = {}
    for k, cid in (("eng", "6ac2c04cb031f88e942618de"), ("had", "698f0000d803b27aab0120af")):
        r = s.post(f"{BASE}/api/lectures", json={"course_id": cid, "date": "2028-01-10", "start_time": "07:00", "end_time": "07:45", "notes": TAG, "force": True})
        assert r.status_code == 200, r.text
        out[k] = r.json()["id"]
        # move inside active semester range so course-lectures lists it
        db.lectures.update_one({"_id": ObjectId(out[k])}, {"$set": {"date": DATE, "status": "scheduled"}})
    print(json.dumps(out))
    print("existing on date:", db.lectures.count_documents({"date": DATE, "course_id": {"$in": ["6ac2c04cb031f88e942618de", "698f0000d803b27aab0120af"]}}))
elif cmd == "check":
    L = db.lectures.find_one({"_id": ObjectId(sys.argv[2])})
    print({k: L.get(k) for k in ("date", "start_time", "group", "group_name", "teacher_id", "status")})
elif cmd == "cleanup":
    for x in db.lectures.find({"notes": TAG}, {"_id": 1}):
        print(x["_id"], s.delete(f"{BASE}/api/lectures/{x['_id']}").status_code)
    db.lectures.delete_many({"notes": TAG})
