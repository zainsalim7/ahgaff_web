# Seed/cleanup helper for day-shift per-lecture exceptions testing (TEST_ data on 2026-12-15)
import sys, json, asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
TEST_DATE = "2026-12-15"
IDS_FILE = "/tmp/day_shift_seed_ids.json"


async def main(mode):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    if mode == "cleanup":
        ids = json.load(open(IDS_FILE))
        r = await db.lectures.delete_many({"_id": {"$in": [ObjectId(i) for i in ids["lectures"]]}})
        r2 = await db.day_shifts.delete_many({"date_from": TEST_DATE, "_id": {"$in": [ObjectId(i) for i in ids.get("shifts", [])]}}) if ids.get("shifts") else None
        print("deleted lectures", r.deleted_count, "shifts", r2.deleted_count if r2 else 0)
        return
    if mode == "show":
        ids = json.load(open(IDS_FILE))
        for l in await db.lectures.find({"_id": {"$in": [ObjectId(i) for i in ids["lectures"]]}}).to_list(20):
            print(str(l["_id"]), l["start_time"], l["end_time"], l.get("status"), l.get("day_shift_id"))
        print("existing lectures on date:", await db.lectures.count_documents({"date": TEST_DATE}))
        return
    existing = await db.lectures.count_documents({"date": TEST_DATE})
    print("existing lectures on date before seed:", existing)
    # find a faculty with slot settings
    course = None
    for c in await db.courses.find({"department_id": {"$exists": True, "$ne": ""}}).to_list(500):
        if not ObjectId.is_valid(c.get("department_id", "")):
            continue
        dep = await db.departments.find_one({"_id": ObjectId(c["department_id"])})
        if not dep or not dep.get("faculty_id"):
            continue
        s = await db.schedule_settings.find_one({"_id": f"faculty_{dep['faculty_id']}"}) or await db.schedule_settings.find_one({"_id": "global"})
        slots = {x["slot_number"]: (x["start_time"], x["end_time"]) for x in (s or {}).get("time_slots", [])}
        if all(k in slots for k in (1, 2, 4, 5)):
            course, fac, sl = c, dep["faculty_id"], slots
            break
    print("course", course["name"], str(course["_id"]), "faculty", fac, "slots", sl)
    lec_ids = []
    for sn in (1, 2, 4, 5):
        st, en = sl[sn]
        r = await db.lectures.insert_one({"course_id": str(course["_id"]), "date": TEST_DATE, "start_time": st, "end_time": en,
                                          "status": "scheduled", "room": f"TEST_room_{sn}", "notes": "TEST_day_shift_exc"})
        lec_ids.append(str(r.inserted_id))
    json.dump({"lectures": lec_ids, "faculty": fac, "course": str(course["_id"]), "slots": {str(k): v for k, v in sl.items()}}, open(IDS_FILE, "w"))
    print("seeded", lec_ids)


asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "seed"))
