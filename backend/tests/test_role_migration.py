"""Regression test: ensures the auto-migration on startup fixes the 'zain' bug.

Scenario: A user gets upgraded to Department Head — role_id is updated but the
string `role` field stays stale (e.g. 'custom'). After running the migration,
the user must be findable by `role=department_head` filter.

Run: cd /app/backend/backend && python ../tests/test_role_migration.py
"""
import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

sys.path.insert(0, '/app/backend/backend')
load_dotenv('/app/backend/.env')

async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    dh_role = await db.roles.find_one({"system_key": "department_head"})
    assert dh_role, "department_head role missing in roles collection"
    role_id_str = str(dh_role["_id"])

    test_username = "_test_role_migration_user"
    await db.users.delete_one({"username": test_username})
    try:
        await db.users.insert_one({
            "username": test_username,
            "full_name": "Migration Test",
            "password": "x",
            "role": "custom",
            "role_id": role_id_str,
            "is_active": True,
            "created_at": "2026-01-01",
        })

        from server import migrate_broken_user_roles
        await migrate_broken_user_roles()

        after = await db.users.find_one({"username": test_username})
        assert after["role"] == "department_head", f"Expected department_head, got {after['role']}"

        count = await db.users.count_documents({"role": "department_head", "username": test_username})
        assert count == 1, f"User not findable by role filter, got count={count}"

        print("PASS: role migration correctly syncs role with role_id")
    finally:
        await db.users.delete_one({"username": test_username})

asyncio.run(main())
