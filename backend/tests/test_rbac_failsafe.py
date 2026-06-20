"""Regression test: RBAC fail-safe for scoped users without scope data.

Critical security test: a department_head with no assigned department must NOT
see all courses/students/teachers. They should see nothing until admin assigns
a department.

Run: cd /app/backend/backend && python ../tests/test_rbac_failsafe.py
"""
import asyncio, os, sys
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

sys.path.insert(0, '/app/backend/backend')
load_dotenv('/app/backend/.env')

async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    test_username = "_rbac_failsafe_test"
    await db.users.delete_one({"username": test_username})

    # Insert a department_head WITHOUT any department/faculty
    result = await db.users.insert_one({
        "username": test_username,
        "full_name": "FailSafe Test",
        "password": "x",
        "role": "department_head",
        "is_active": True,
        "created_at": "2026-01-01",
        # 🚨 intentionally NO department_id / department_ids / faculty_id
    })

    try:
        from server import get_user_scope_filter
        user_doc = await db.users.find_one({"_id": result.inserted_id})
        user_dict = {"id": str(result.inserted_id), "role": "department_head",
                     "username": test_username}

        for scope in ["students", "courses", "teachers", "departments"]:
            f = await get_user_scope_filter(user_dict, scope)
            assert f != {}, f"FAIL-OPEN: empty filter for {scope}! User would see all data!"
            # Must contain the impossible ObjectId
            assert "_id" in f and str(f["_id"]) == "000000000000000000000000", \
                f"Expected fail-safe block for {scope}, got: {f}"

        # Same for dean / registrar / custom without faculty
        for role in ["dean", "registrar", "registration_manager", "custom"]:
            user_dict["role"] = role
            for scope in ["students", "courses", "teachers"]:
                f = await get_user_scope_filter(user_dict, scope)
                assert f != {}, f"FAIL-OPEN: {role} with no scope sees all {scope}!"

        print("PASS: scoped users without scope data are blocked (fail-safe)")
    finally:
        await db.users.delete_one({"username": test_username})

asyncio.run(main())
