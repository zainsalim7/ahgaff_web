# helper for UI test of reschedule 409 dialog: `setup` creates lectures, `check <id>` prints, `cleanup` deletes TEST_UI_RESCHED lectures
import sys, requests, json
BASE = [l.split("=",1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL=")][0].rstrip("/")
s = requests.Session()
d = s.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "admin123"}).json()
s.headers["Authorization"] = "Bearer " + (d.get("access_token") or d.get("token"))
cmd = sys.argv[1]
if cmd == "setup":
    a = s.post(f"{BASE}/api/lectures", json={"course_id": "69cd1f0b12f04e7c1d6a4991", "date": "2027-06-07", "start_time": "08:00", "end_time": "09:30", "notes": "TEST_UI_RESCHED"}).json()
    b = s.post(f"{BASE}/api/lectures", json={"course_id": "6a1b3f41b319b9f2bee0be23", "date": "2027-06-08", "start_time": "10:00", "end_time": "11:30", "notes": "TEST_UI_RESCHED"}).json()
    print(json.dumps({"a": a.get("id"), "b": b.get("id"), "raw": [a, b]}))
elif cmd == "check":
    print(s.get(f"{BASE}/api/lectures/{sys.argv[2]}/details").json()["lecture"])
elif cmd == "cleanup":
    from pymongo import MongoClient
    db = MongoClient("mongodb://localhost:27017")["test_database"]
    ids = [str(x["_id"]) for x in db.lectures.find({"notes": {"$in": ["TEST_UI_RESCHED", "TEST_RESCHED_P0"]}}, {"_id": 1})]
    for i in ids:
        print(i, s.delete(f"{BASE}/api/lectures/{i}").status_code)
