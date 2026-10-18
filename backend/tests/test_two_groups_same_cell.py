"""فحص منطق «محاضرتان في خلية واحدة» لمقررين مختلفين بمجموعتين من نفس المستوى — الشامل (weekly_schedule) والمقررات (lectures)"""
import asyncio
import os

import requests
from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
API = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL")][0] + "/api"
CX, CY = "698f0000d803b27aab0120af", "6ac2c04cb031f88e942618de"  # دراسات حضرموت / لغة إنجليزية — نفس القسم والمستوى 3
DEPT, LEVEL = "698e501d97fef774e66e93a9", 3


def login(u, p):
    d = requests.post(f"{API}/auth/login", json={"username": u, "password": p}).json()
    return {"Authorization": f"Bearer {d['access_token']}"}


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    H = login("admin", "admin123")
    # توحيد توزيع المجموعات بين المقررين (مقرر الاختبار Y يتبع توزيع X) حتى تكون المجموعتان 1 و2 منفصلتين
    async for e in db.enrollments.find({"course_id": CX, "group": {"$in": ["1", "2"]}}, {"student_id": 1, "group": 1}):
        await db.enrollments.update_many({"course_id": CY, "student_id": e["student_id"]}, {"$set": {"group": e["group"]}})
    gx = {e["student_id"] async for e in db.enrollments.find({"course_id": CX, "group": "1"}, {"student_id": 1})}
    gy1 = {e["student_id"] async for e in db.enrollments.find({"course_id": CY, "group": "1"}, {"student_id": 1})}
    gy2 = {e["student_id"] async for e in db.enrollments.find({"course_id": CY, "group": "2"}, {"student_id": 1})}
    print(f"X g1={len(gx)}  Y g1={len(gy1)} (shared with X g1: {len(gx & gy1)})  Y g2={len(gy2)} (shared with X g1: {len(gx & gy2)})")
    cx = await db.courses.find_one({"_id": ObjectId(CX)}); cy = await db.courses.find_one({"_id": ObjectId(CY)})
    rooms = await db.rooms.find({"is_active": True}).limit(2).to_list(2)
    tx, ty = cx["teacher_id"], cy["teacher_id"]
    dept_doc = await db.departments.find_one({"_id": ObjectId(DEPT)})
    DAY, SLOT = "الأربعاء", 6
    await db.weekly_schedule.delete_many({"day": DAY, "slot_number": SLOT, "department_id": DEPT, "level": LEVEL})

    def slot(course, group, teacher, room):
        return {"course_id": course, "teacher_id": teacher, "room_id": str(room["_id"]), "faculty_id": dept_doc["faculty_id"], "day": DAY, "slot_number": SLOT, "department_id": DEPT, "level": LEVEL, "section": "", "group": group, "slot_type": "theory"}
    # === الشامل ===
    r = requests.post(f"{API}/weekly-schedule", json=slot(CX, "1", tx, rooms[0]), headers=H); assert r.status_code == 200, r.text
    print("✓ weekly: X g1 added")
    disjoint = "2" if not (gx & gy2) else ("1" if not (gx & gy1) else None)
    overlap = "1" if (gx & gy1) else ("2" if (gx & gy2) else None)
    if overlap:
        r = requests.post(f"{API}/weekly-schedule", json=slot(CY, overlap, ty, rooms[1]), headers=H)
        assert r.status_code == 409, r.text
        print(f"✓ weekly: Y g{overlap} (shares students) REJECTED:", str(r.json()["detail"])[:90])
    if disjoint:
        r = requests.post(f"{API}/weekly-schedule", json=slot(CY, disjoint, ty, rooms[1]), headers=H)
        assert r.status_code == 200, r.text
        print(f"✓ weekly: Y g{disjoint} (no shared students) ALLOWED in same cell — same group key as X? {disjoint == '1'}")
    r = requests.post(f"{API}/weekly-schedule", json={**slot(CY, None, ty, rooms[1]), "group": None}, headers=H)
    assert r.status_code == 409, r.text
    print("✓ weekly: Y whole-class in same cell REJECTED")
    conf = requests.get(f"{API}/weekly-schedule/conflicts", params={"department_id": DEPT}, headers=H).json()
    sec = [c for c in conf.get("section_conflicts", []) if c["day"] == DAY and c["slot_number"] == SLOT]
    print("✓ conflicts report for this cell:", "none" if not sec else sec)
    await db.weekly_schedule.delete_many({"day": DAY, "slot_number": SLOT, "department_id": DEPT, "level": LEVEL})
    # === المقررات (محاضرات يومية) ===
    DATE = "2026-11-18"
    await db.lectures.delete_many({"date": DATE, "course_id": {"$in": [CX, CY]}})
    rm = rooms[0]["name"]
    r = requests.post(f"{API}/lectures", json={"course_id": CX, "date": DATE, "start_time": "08:00", "end_time": "09:30", "room": rm, "group": "1"}, headers=H); assert r.status_code == 200, r.text
    print("✓ lectures: X g1 created")
    if overlap:
        r = requests.post(f"{API}/lectures", json={"course_id": CY, "date": DATE, "start_time": "08:00", "end_time": "09:30", "room": rooms[1]["name"], "group": overlap}, headers=H)
        assert r.status_code == 409, r.text; print(f"✓ lectures: Y g{overlap} (shared students) → 409 warning:", r.json()["detail"][:80])
        r = requests.post(f"{API}/lectures", json={"course_id": CY, "date": DATE, "start_time": "08:00", "end_time": "09:30", "room": rooms[1]["name"], "group": overlap, "force": True}, headers=H)
        assert r.status_code == 200, r.text; print("✓ lectures: with force → created")
        await db.lectures.delete_many({"date": DATE, "course_id": CY})
    if disjoint:
        r = requests.post(f"{API}/lectures", json={"course_id": CY, "date": DATE, "start_time": "08:00", "end_time": "09:30", "room": rooms[1]["name"], "group": disjoint}, headers=H)
        assert r.status_code == 200, r.text; print(f"✓ lectures: Y g{disjoint} (no shared students) created without warning")
        await db.lectures.delete_many({"date": DATE, "course_id": CY})
    r = requests.post(f"{API}/lectures", json={"course_id": CY, "date": DATE, "start_time": "08:00", "end_time": "09:30", "room": rooms[1]["name"]}, headers=H)
    assert r.status_code == 409, r.text; print("✓ lectures: Y whole-class same time → 409 warning:", r.json()["detail"][:70])
    await db.lectures.delete_many({"date": DATE, "course_id": {"$in": [CX, CY]}})
    print("ALL OK")


asyncio.run(main())
