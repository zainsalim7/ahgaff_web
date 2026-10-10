"""Seed demo data mirroring the overtime sheet (2 teachers, period 2026-08-15 → 2026-09-24)."""
import asyncio, os
from datetime import date, timedelta, datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
START = date(2026, 8, 15)  # السبت


async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    if await db.teachers.count_documents({"seed_ot": True}):
        print("already seeded"); return
    fac = await db.faculties.find_one({})
    dep = await db.departments.find_one({"faculty_id": str(fac["_id"])}) or await db.departments.find_one({})
    sem = await db.semesters.find_one({"is_active": True}) or await db.semesters.find_one({})
    students = await db.students.find({}).limit(3).to_list(3)

    async def teacher(name, title, wh):
        r = await db.teachers.insert_one({"full_name": name, "academic_title": title, "weekly_hours": wh, "faculty_id": str(fac["_id"]),
                                          "department_id": str(dep["_id"]), "department_ids": [str(dep["_id"])], "is_active": True, "seed_ot": True, "teacher_id": f"T-{name[:3]}"})
        return str(r.inserted_id)

    async def course(name, code, level, section, tid, start_week, missed, excused=0, dur_h=1.5):
        r = await db.courses.insert_one({"name": name, "code": code, "level": level, "section": section, "department_id": str(dep["_id"]), "faculty_id": str(fac["_id"]),
                                         "teacher_id": tid, "semester_id": str(sem["_id"]), "credit_hours": 3, "is_active": True, "seed_ot": True})
        cid = str(r.inserted_id)
        await db.teaching_loads.insert_one({"teacher_id": tid, "course_id": cid, "weekly_hours": 3, "semester_id": str(sem["_id"]), "seed_ot": True})
        k = 0
        for w in range(start_week - 1, 6):
            for dow in (0, 2):  # السبت والاثنين
                d = START + timedelta(days=w * 7 + dow)
                k += 1
                status = "completed"
                if k <= missed:
                    status = "absent"
                elif k <= missed + excused:
                    status = "absent_excused"
                lr = await db.lectures.insert_one({"course_id": cid, "teacher_id": tid, "date": d.isoformat(), "start_time": "08:00",
                                                   "end_time": f"{8 + int(dur_h):02d}:{int((dur_h % 1) * 60):02d}", "status": status, "seed_ot": True,
                                                   "status_override": status == "absent_excused"})
                if status == "completed":
                    for s in students:
                        await db.attendance.insert_one({"lecture_id": str(lr.inserted_id), "student_id": str(s["_id"]), "status": "present", "seed_ot": True, "created_at": datetime.utcnow()})
        return cid

    t1 = await teacher("د. عبدالله باوزير", "أستاذ مساعد", 8)
    await course("فقه العبادات", "FQ101", 1, "أ", t1, 3, 0)          # 4 أسابيع × 3 = 12 منجز 12
    await course("أصول الفقه", "USL201", 2, "أ", t1, 1, 2)          # 18 افتراضي، منجز 15
    await course("القواعد الفقهية", "QWF301", 3, "أ", t1, 1, 1)     # 16.5
    await course("مقاصد الشريعة", "MQS401", 4, "ب", t1, 1, 1, excused=1)  # افتراضي 16.5، منجز 15
    t2 = await teacher("أ.م. أحمد بن سميط", "أستاذ مشارك", 9)
    for i, sec in enumerate(["أ", "ب", "ج", "د", "سنة", "قانون"]):
        await course("بلاغة-2", "BLG402", 4, sec, t2, 1, 1 if i < 2 else 0)
    print("seeded", t1, t2, "faculty", str(fac["_id"]))

asyncio.run(main())
