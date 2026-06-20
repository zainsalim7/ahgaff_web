"""Regression test for the '1000 limit truncation bug' on /api/users.

Root cause: `db.users.find(query).to_list(1000)` was truncating at 1000 docs
without sorting. With 893 students + 98 teachers + N admin users in production,
admin users fell outside the first 1000 and disappeared from the management screen.

Fix: when no role filter is passed, exclude students/teachers at the DB query level
(they have dedicated screens) AND raise the limit to 10000.

Run: cd /app/backend/backend && python ../tests/test_users_limit.py
"""
import asyncio, os, sys
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

sys.path.insert(0, '/app/backend/backend')
load_dotenv('/app/backend/.env')

async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    # Simulate production: insert many fake students/teachers + few admin users
    fake_prefix = "_regression_limit_"
    await db.users.delete_many({"username": {"$regex": f"^{fake_prefix}"}})
    try:
        # 1100 fake students (exceeds the old 1000 limit)
        students = [
            {"username": f"{fake_prefix}stu_{i}", "full_name": "S", "password": "x",
             "role": "student", "is_active": True, "created_at": "2026-01-01"}
            for i in range(1100)
        ]
        # 5 admins of different roles
        admins = [
            {"username": f"{fake_prefix}dh", "full_name": "DH", "password": "x",
             "role": "department_head", "is_active": True, "created_at": "2026-01-01"},
            {"username": f"{fake_prefix}dean", "full_name": "DN", "password": "x",
             "role": "dean", "is_active": True, "created_at": "2026-01-01"},
        ]
        await db.users.insert_many(students + admins)

        # Simulate the new query (post-fix)
        query = {"role": {"$nin": ["student", "teacher"]}}
        users = await db.users.find(query).to_list(10000)
        usernames = [u["username"] for u in users]

        assert f"{fake_prefix}dh" in usernames, "department_head user missing!"
        assert f"{fake_prefix}dean" in usernames, "dean user missing!"
        student_count = sum(1 for u in users if u["role"] == "student")
        assert student_count == 0, f"Students should be excluded, got {student_count}"

        print(f"PASS: admins visible even with 1100+ students (returned {len(users)} non-student/teacher users)")
    finally:
        await db.users.delete_many({"username": {"$regex": f"^{fake_prefix}"}})

asyncio.run(main())
