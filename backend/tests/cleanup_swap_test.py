import asyncio
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
env = dict(l.strip().split('=', 1) for l in open('/app/backend/.env') if '=' in l)
db = AsyncIOMotorClient(env['MONGO_URL'].strip('"'))[env['DB_NAME'].strip('"')]
SWAPS = ["6af965f0f8a12b2e752f4c7c", "6af965fc6fd8000525c14c20", "6af966369b02a858c8ffebe1"]
LECS = ["6af965f0f8a12b2e752f4be6", "6af965fc6fd8000525c14b8a", "6af9661c9b02a858c8ffeb4a"]

async def main():
    sample = await db.notifications.find_one({"type": "lecture_swap"})
    print("sample notif keys:", sample and {k: sample[k] for k in sample if k not in ('_id',)})
    ors = [{"swap_id": {"$in": SWAPS}}, {"lecture_id": {"$in": LECS}}, {"data.swap_id": {"$in": SWAPS}}, {"data.lecture_id": {"$in": LECS}}]
    print("notifs matching:", await db.notifications.count_documents({"type": "lecture_swap", "$or": ors}))
    r = await db.notifications.delete_many({"type": "lecture_swap", "$or": ors})
    print("deleted notifs:", r.deleted_count)
    r = await db.lecture_swaps.delete_many({"_id": {"$in": [ObjectId(s) for s in SWAPS]}, "status": "cancelled"})
    print("deleted swaps:", r.deleted_count)
    print("TEST lectures left:", await db.lectures.count_documents({"notes": {"$in": ["TEST_swap_display", "TEST_swap_ui"]}}))
    print("swaps left:", await db.lecture_swaps.count_documents({}))
asyncio.run(main())
