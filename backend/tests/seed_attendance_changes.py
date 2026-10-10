"""Seed demo attendance change requests for local testing."""
import asyncio, os, random
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')


async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    if await db.attendance_change_requests.count_documents({"seed": True}):
        print("already seeded"); return
    courses = await db.courses.find({}).to_list(100)
    teachers = await db.users.find({"role": "teacher"}).to_list(50)
    statuses = ["present", "absent", "late", "excused"]
    now = datetime.now(timezone.utc)
    docs = []
    for ci, course in enumerate(courses[:10]):
        dept = await db.departments.find_one({"_id": ObjectId(course["department_id"])}) if course.get("department_id") else None
        fac_id = course.get("faculty_id") or (dept or {}).get("faculty_id") or ""
        students = await db.students.find({"department_id": course.get("department_id")}).to_list(8)
        if not students:
            students = await db.students.find({}).to_list(5)
        teacher = teachers[ci % len(teachers)] if teachers else {"_id": ObjectId(), "full_name": "مدرّس تجريبي"}
        for li in range(3):
            lecture_id = str(ObjectId())
            ldate = (now - timedelta(days=random.randint(0, 40))).strftime("%Y-%m-%d")
            req_at = now - timedelta(days=random.randint(0, 12), hours=random.randint(0, 20))
            st = random.choice(["pending", "pending", "pending", "approved", "rejected", "cancelled"])
            for s in students[: random.randint(1, 5)]:
                old, new = random.sample(statuses, 2)
                d = {
                    "seed": True, "attendance_id": None, "lecture_id": lecture_id, "course_id": str(course["_id"]),
                    "course_name": course.get("name", ""), "course_code": course.get("code", ""),
                    "lecture_date": ldate, "lecture_start_time": f"{8 + li * 2:02d}:00",
                    "student_id": str(s["_id"]), "student_name": s.get("full_name", ""),
                    "faculty_id": fac_id, "department_id": course.get("department_id") or "",
                    "old_status": old, "new_status": new, "reason": random.choice([None, "خطأ في التسجيل", "الطالب حضر متأخراً", "عذر طبي"]),
                    "requested_by": str(teacher["_id"]), "requested_by_name": teacher.get("full_name", ""), "requested_by_role": "teacher",
                    "requested_at": req_at, "status": st,
                    "reviewed_by": None if st in ("pending", "cancelled") else "admin", "reviewed_by_name": None if st in ("pending", "cancelled") else "المدير",
                    "reviewed_at": None if st == "pending" else req_at + timedelta(hours=5),
                    "review_notes": "مرفوض لعدم وجود مبرر" if st == "rejected" else None,
                }
                docs.append(d)
    await db.attendance_change_requests.insert_many(docs)
    print("inserted", len(docs))

asyncio.run(main())
