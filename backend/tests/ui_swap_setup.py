import requests, datetime, sys
BASE = open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0].rstrip('/')
s = requests.Session()
s.headers["Authorization"] = "Bearer " + s.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
TODAY = (datetime.datetime.utcnow() + datetime.timedelta(hours=3)).strftime("%Y-%m-%d")
if sys.argv[1] == "setup":
    for st, et in (("21:00", "21:45"), ("22:00", "22:45")):
        r = s.post(f"{BASE}/api/lectures", json={"course_id": "6ac2c04cb031f88e942618de", "date": TODAY, "start_time": st, "end_time": et, "room": "TEST_ROOM", "notes": "TEST_swap_ui", "force": True})
        print(st, r.status_code, r.json().get("id"))
else:
    for lid in sys.argv[2:]:
        print(lid, s.delete(f"{BASE}/api/lectures/{lid}").status_code)
