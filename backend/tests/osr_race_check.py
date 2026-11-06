# Race check: two concurrent overrides on the same failed offline_sync_log (expects exactly one 200)
import json, requests, concurrent.futures as cf
from pymongo import MongoClient
from bson import ObjectId
env = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
db = MongoClient(env["MONGO_URL"].strip('"'))[env["DB_NAME"].strip('"')]
URL = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL=")][0] + "/api"
s = json.load(open("/tmp/osr_ui_state.json"))
tok = requests.post(f"{URL}/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
for trial in range(3):
    lid = str(db.offline_sync_log.insert_one({"lecture_id": s["lecture_id"], "status": "failed", "lecture_date": "2026-11-03",
        "synced_at": "2026-11-06T01:00:00", "pending_payload": {"records": [{"student_id": "TESTSTUDENT1", "status": "absent"}]}}).inserted_id)
    with cf.ThreadPoolExecutor(5) as ex:
        codes = list(ex.map(lambda _: requests.post(f"{URL}/reports/offline-sync/{lid}/override", headers=H, json={"reason": "TEST_race"}).status_code, range(5)))
    ops = db.attendance_operations.count_documents({"lecture_id": s["lecture_id"], "manual_override_reason": "TEST_race"})
    att = db.attendance.count_documents({"lecture_id": s["lecture_id"]})
    print(f"trial {trial}: codes={codes} override_ops_total={ops} attendance_rows={att}")
