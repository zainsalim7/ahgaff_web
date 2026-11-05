# Iter158 UI setup/cleanup helper: python3 ui158_setup.py setup|cleanup
import json, os, sys, requests
from bson import ObjectId
from pymongo import MongoClient

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
FAC_A = "698e4f9297fef774e66e93a4"
USER = "TEST_facscope158ui"
STATE_FILE = "/tmp/ui158_state.json"


def mongo():
    env = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
    return MongoClient(env["MONGO_URL"].strip('"'))[env["DB_NAME"].strip('"')]


t = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()
h = {"Authorization": f"Bearer {t.get('token') or t.get('access_token')}"}
if sys.argv[1] == "setup":
    keys = [p["key"] for p in requests.get(f"{API}/advanced-access/permissions", headers=h).json() if p.get("is_active", True)]
    uid = requests.post(f"{API}/advanced-access/users/quick-find-or-create", headers=h,
                        json={"username": USER, "full_name": "TEST_ faculty UI 158"}).json()["id"]
    rid = requests.post(f"{API}/advanced-access/roles", headers=h, json={"name_ar": "TEST_role_ui158", "permission_keys": keys}).json()["id"]
    aid = requests.post(f"{API}/advanced-access/assignments", headers=h, json={
        "user_id": uid, "assignment_type": "academic", "advanced_role_id": rid, "context_label_ar": "TEST_ كلية واحدة UI",
        "scope": {"scope_type": "faculty", "scope_ref_ids": [FAC_A]}}).json()["id"]
    mongo().users.update_one({"_id": ObjectId(uid)}, {"$set": {"must_change_password": False}})
    json.dump({"user_id": uid, "role_id": rid, "assignment_id": aid}, open(STATE_FILE, "w"))
    print("created", uid, rid, aid, "keys", len(keys))
else:
    s = json.load(open(STATE_FILE))
    db = mongo()
    print(db.advanced_user_assignments.delete_one({"_id": ObjectId(s["assignment_id"])}).deleted_count,
          db.advanced_roles.delete_one({"_id": ObjectId(s["role_id"])}).deleted_count,
          db.users.delete_one({"_id": ObjectId(s["user_id"]), "username": USER}).deleted_count)
