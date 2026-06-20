"""Regression test: cross_university=true must require admin OR cross_university_assignment permission."""
import asyncio, os, sys
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

sys.path.insert(0, '/app/backend/backend')
load_dotenv('/app/backend/.env')

API_URL = "https://schedule-hub-272.preview.emergentagent.com"

async def main():
    import requests
    # 1) login as admin
    r = requests.post(f"{API_URL}/api/auth/login",
                      json={"username":"admin","password":"admin123"})
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}

    # 2) admin + cross_university=true → should return all teachers
    r = requests.get(f"{API_URL}/api/teachers?cross_university=true", headers=h)
    assert r.status_code == 200, r.text
    n_cross = len(r.json())
    print(f"admin + cross_university=true → {n_cross} teachers")

    # 3) admin without cross_university → also all (admin returns {})
    r = requests.get(f"{API_URL}/api/teachers", headers=h)
    n_normal = len(r.json())
    print(f"admin + normal → {n_normal} teachers")
    assert n_cross == n_normal, "admin must get same data with/without flag"

    # 4) Simulate a department_head WITHOUT permission
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    dh_role = await db.roles.find_one({"system_key": "department_head"})
    dept = await db.departments.find_one({})
    test_user = "_xfac_test_dh"
    await db.users.delete_one({"username": test_user})
    from passlib.context import CryptContext
    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto").hash("test1234")
    await db.users.insert_one({
        "username": test_user, "full_name": "X-Fac Test", "password": pwd,
        "role": "department_head", "role_id": str(dh_role["_id"]),
        "department_id": str(dept["_id"]), "department_ids": [str(dept["_id"])],
        "faculty_id": dept.get("faculty_id"),
        "permissions": ["view_teaching_load", "view_teachers"],
        "is_active": True, "created_at": "2026-01-01",
    })
    r = requests.post(f"{API_URL}/api/auth/login",
                      json={"username": test_user, "password": "test1234"})
    print(f"Login as DH without perm: {r.status_code}")
    dh_token = r.json().get("access_token")
    if dh_token:
        dh_h = {"Authorization": f"Bearer {dh_token}"}
        r = requests.get(f"{API_URL}/api/teachers?cross_university=true", headers=dh_h)
        n_dh_cross = len(r.json())
        print(f"DH without perm + cross_university=true → {n_dh_cross} teachers")
        assert n_dh_cross < n_normal, f"FAIL: DH without permission got {n_dh_cross} == all {n_normal} (should be limited!)"
        print("  ✓ DH without permission IS still limited (no privilege escalation)")

    # 5) Now grant cross_university_assignment to the DH and retry
    await db.users.update_one(
        {"username": test_user},
        {"$set": {"permissions": ["view_teaching_load", "view_teachers", "cross_university_assignment"]}}
    )
    r = requests.post(f"{API_URL}/api/auth/login",
                      json={"username": test_user, "password": "test1234"})
    dh_token2 = r.json().get("access_token")
    if dh_token2:
        dh_h2 = {"Authorization": f"Bearer {dh_token2}"}
        r = requests.get(f"{API_URL}/api/teachers?cross_university=true", headers=dh_h2)
        n_dh_cross2 = len(r.json())
        print(f"DH WITH permission + cross_university=true → {n_dh_cross2} teachers")
        assert n_dh_cross2 == n_normal, f"FAIL: DH WITH permission should see all ({n_normal}), got {n_dh_cross2}"
        print("  ✓ DH WITH permission sees ALL teachers")

    await db.users.delete_one({"username": test_user})
    print("\n✅ PASS — cross_university properly gated by permission")

asyncio.run(main())
