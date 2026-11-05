# Iter158 edge: faculty-scoped real-enforcement user whose faculty has ZERO departments -> must see nothing (not everything)
import os
import requests
from bson import ObjectId
from pymongo import MongoClient

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
USER = "TEST_emptyfac158"


def mongo():
    env = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
    return MongoClient(env["MONGO_URL"].strip('"'))[env["DB_NAME"].strip('"')]


def login(u, p):
    t = requests.post(f"{API}/auth/login", json={"username": u, "password": p}).json()
    return {"Authorization": f"Bearer {t.get('token') or t.get('access_token')}"}


def test_empty_faculty_scope_sees_nothing():
    h = login("admin", "admin123")
    db = mongo()
    ids = {}
    try:
        f = requests.post(f"{API}/faculties", headers=h, json={"name": "TEST_كلية فارغة 158", "code": "TEST158"})
        assert f.status_code in (200, 201), f.text[:200]
        ids["fac"] = f.json().get("id") or f.json().get("_id")
        keys = [p["key"] for p in requests.get(f"{API}/advanced-access/permissions", headers=h).json() if p.get("is_active", True)]
        ids["user"] = requests.post(f"{API}/advanced-access/users/quick-find-or-create", headers=h,
                                    json={"username": USER, "full_name": "TEST_ empty fac"}).json()["id"]
        ids["role"] = requests.post(f"{API}/advanced-access/roles", headers=h,
                                    json={"name_ar": "TEST_role_emptyfac158", "permission_keys": keys}).json()["id"]
        ids["asg"] = requests.post(f"{API}/advanced-access/assignments", headers=h, json={
            "user_id": ids["user"], "assignment_type": "academic", "advanced_role_id": ids["role"],
            "context_label_ar": "TEST_", "scope": {"scope_type": "faculty", "scope_ref_ids": [ids["fac"]]}}).json()["id"]
        uh = login(USER, USER)
        requests.get(f"{API}/auth/me", headers=uh)  # trigger sync
        t = requests.get(f"{API}/teachers", params={"faculty_id": ids["fac"]}, headers=uh)
        s = requests.get(f"{API}/students", headers=uh)
        c = requests.get(f"{API}/courses", headers=uh)
        nt = len(t.json()) if t.status_code == 200 else t.status_code
        ns = len(s.json()) if s.status_code == 200 else s.status_code
        nc = len(c.json()) if c.status_code == 200 else c.status_code
        print("empty-faculty user -> teachers:", nt, "students:", ns, "courses:", nc)
        assert nt in (0, 403), f"LEAK teachers: {nt}"
        assert ns in (0, 403), f"LEAK students: {ns}"
        assert nc in (0, 403), f"LEAK courses: {nc}"
    finally:
        if ids.get("asg"):
            db.advanced_user_assignments.delete_one({"_id": ObjectId(ids["asg"])})
        if ids.get("role"):
            db.advanced_roles.delete_one({"_id": ObjectId(ids["role"])})
        if ids.get("user"):
            db.users.delete_one({"_id": ObjectId(ids["user"]), "username": USER})
        if ids.get("fac"):
            r = requests.delete(f"{API}/faculties/{ids['fac']}", headers=h)
            print("faculty delete:", r.status_code)
            db.faculties.delete_one({"_id": ObjectId(ids["fac"]), "name": "TEST_كلية فارغة 158"})
