"""تنظيف سجلات الحضور المرتبطة بمحاضرات محذوفة (orphans)"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # IDs of all existing lectures (active or cancelled - just exists)
    existing_lecture_ids = set()
    async for lec in db.lectures.find({}, {"_id": 1}):
        existing_lecture_ids.add(str(lec["_id"]))

    print(f"Total lectures in DB: {len(existing_lecture_ids)}")

    # Find attendance records whose lecture_id no longer exists
    orphans = []
    total_attendance = 0
    no_lecture_id = 0
    async for r in db.attendance.find({}):
        total_attendance += 1
        lec_id = r.get("lecture_id")
        if not lec_id:
            no_lecture_id += 1
            continue
        if str(lec_id) not in existing_lecture_ids:
            orphans.append(r["_id"])

    print(f"Total attendance records: {total_attendance}")
    print(f"Records with no lecture_id (legacy): {no_lecture_id}")
    print(f"Orphan records (lecture deleted): {len(orphans)}")

    if orphans:
        result = await db.attendance.delete_many({"_id": {"$in": orphans}})
        print(f"Deleted {result.deleted_count} orphan attendance records")
    else:
        print("No orphans to clean up")


if __name__ == "__main__":
    asyncio.run(main())
