"""E2E: تبادل محاضرة بين أستاذين كعملية إدارية — الأستاذ ممنوع، رئيس القسم يطبّق فوراً، ثم يلغي ويُرجع"""
import asyncio
import os
from datetime import datetime, timedelta

import requests
from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
API = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL")][0]
DEPT = "698e501d97fef774e66e93a9"


def login(u, p):
    d = requests.post(f"{API}/api/auth/login", json={"username": u, "password": p}).json()
    return {"Authorization": f"Bearer {d.get('access_token') or d.get('token')}"}


async def seed():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    t1 = await db.users.find_one({"username": "teacher180156"})
    t2u = await db.users.find_one({"username": "9999"})
    t1_id = t1.get("teacher_record_id") or str(t1["_id"])
    t2_id = t2u.get("teacher_record_id") or str(t2u["_id"])
    dept = await db.departments.find_one({"_id": ObjectId(DEPT)})
    for tid, u in ((t1_id, t1), (t2_id, t2u)):
        await db.teachers.update_one({"_id": ObjectId(tid)}, {"$setOnInsert": {"full_name": u.get("full_name") or u["username"], "user_id": str(u["_id"]), "is_active": True},
                                                              "$set": {"faculty_id": dept["faculty_id"], "department_id": DEPT}}, upsert=True)
    courses = await db.courses.find({"department_id": DEPT, "is_active": True}).limit(2).to_list(2)
    assert len(courses) >= 2, "يلزم مقرران في القسم"
    for c in courses:
        await db.courses.update_one({"_id": c["_id"]}, {"$set": {"faculty_id": dept["faculty_id"]}})
    today = datetime.utcnow()
    sat = today + timedelta(days=(5 - today.weekday()) % 7 + 7)
    mon = sat + timedelta(days=2)
    await db.lectures.delete_many({"swap_test": True})
    la = {"course_id": str(courses[0]["_id"]), "course_name": courses[0]["name"], "teacher_id": t1_id, "teacher_name": t1.get("full_name"), "date": sat.strftime("%Y-%m-%d"), "start_time": "08:00", "end_time": "09:15", "status": "scheduled", "room": "قاعة اختبار", "swap_test": True, "created_at": datetime.utcnow().isoformat()}
    lb = {"course_id": str(courses[1]["_id"]), "course_name": courses[1]["name"], "teacher_id": t2_id, "teacher_name": t2u.get("full_name"), "date": mon.strftime("%Y-%m-%d"), "start_time": "10:00", "end_time": "11:15", "status": "scheduled", "room": "قاعة اختبار", "swap_test": True, "created_at": datetime.utcnow().isoformat()}
    ra, rb = await db.lectures.insert_one(la), await db.lectures.insert_one(lb)
    return str(ra.inserted_id), str(rb.inserted_id), t1_id, t2_id, db


async def main():
    la, lb, t1_id, t2_id, db = await seed()
    HT, HH = login("teacher180156", "teacher123"), login("Saeed", "test1234")
    # 1) الأستاذ ممنوع
    for path in ("", "/teachers", "/report"):
        r = requests.get(f"{API}/api/lecture-swaps{path}", headers=HT)
        assert r.status_code == 403, (path, r.status_code, r.text)
    r = requests.post(f"{API}/api/lecture-swaps", json={"type": "cover", "lecture_a_id": la, "counterpart_teacher_id": t2_id}, headers=HT)
    assert r.status_code == 403, r.text
    print("✓ teacher forbidden (403) on list/teachers/report/create")
    # 2) رئيس القسم: الأساتذة ومحاضراتهم
    r = requests.get(f"{API}/api/lecture-swaps/teachers", headers=HH).json()
    assert any(t["teacher_id"] == t1_id for t in r["teachers"]), r
    r = requests.get(f"{API}/api/lecture-swaps/teacher-lectures", params={"teacher_id": t1_id}, headers=HH).json()
    assert any(l["id"] == la and l["eligible"] for l in r["lectures"]), r
    print("✓ head: teachers + teacher-lectures eligible")
    c = requests.get(f"{API}/api/lecture-swaps/candidates", params={"lecture_id": la, "type": "swap"}, headers=HH).json()
    cand = next(t for t in c["teachers"] if t["teacher_id"] == t2_id)
    assert cand["available"] and any(s["id"] == lb and s["ok"] for s in cand["swappable"]), cand
    print("✓ candidates: colleague available with swappable lecture")
    bad = requests.post(f"{API}/api/lecture-swaps", json={"type": "swap", "lecture_a_id": la, "counterpart_teacher_id": t1_id, "lecture_b_id": lb}, headers=HH)
    assert bad.status_code == 400, bad.text
    # 3) التطبيق الفوري
    s = requests.post(f"{API}/api/lecture-swaps", json={"type": "swap", "lecture_a_id": la, "counterpart_teacher_id": t2_id, "lecture_b_id": lb, "reason": "تكليف إداري"}, headers=HH)
    assert s.status_code == 200 and s.json()["status"] == "approved", s.text
    sid = s.json()["id"]
    A = await db.lectures.find_one({"_id": ObjectId(la)})
    B = await db.lectures.find_one({"_id": ObjectId(lb)})
    assert A["teacher_id"] == t2_id and A["original_teacher_id"] == t1_id and A["swap_id"] == sid, A
    assert B["teacher_id"] == t1_id and B["original_teacher_id"] == t2_id, B
    print("✓ applied immediately: A→T2, B→T1, original kept")
    dup = requests.post(f"{API}/api/lecture-swaps", json={"type": "cover", "lecture_a_id": la, "counterpart_teacher_id": t2_id}, headers=HH)
    assert dup.status_code == 400, dup.text
    print("✓ duplicate blocked:", dup.json()["detail"][:50])
    again = requests.get(f"{API}/api/lecture-swaps/teacher-lectures", params={"teacher_id": t2_id}, headers=HH).json()
    la_item = next((l for l in again["lectures"] if l["id"] == la), None)
    assert la_item and not la_item["eligible"], la_item
    print("✓ swapped lecture not eligible again")
    lst = requests.get(f"{API}/api/lecture-swaps", headers=HH).json()
    item = next(i for i in lst["items"] if i["id"] == sid)
    assert item["can_cancel"] and item["teacher_a_name"] and item["history"][0]["step"] == "apply", item
    n = await db.notifications.count_documents({"type": "lecture_swap", "data.swap_id": sid})
    print("✓ list ok, teacher notifications:", n)
    # 4) الإلغاء والإرجاع
    r = requests.post(f"{API}/api/lecture-swaps/{sid}/cancel", json={"note": "اختبار"}, headers=HH)
    assert r.status_code == 200, r.text
    A = await db.lectures.find_one({"_id": ObjectId(la)})
    B = await db.lectures.find_one({"_id": ObjectId(lb)})
    assert A["teacher_id"] == t1_id and "swap_id" not in A and B["teacher_id"] == t2_id, (A, B)
    print("✓ cancel reverted both lectures")
    rep = requests.get(f"{API}/api/lecture-swaps/report", headers=HH).json()
    print("✓ report:", {k: rep[k] for k in ("total", "swaps", "covers")})
    await db.lectures.delete_many({"swap_test": True})
    await db.lecture_swaps.delete_many({"lecture_a.id": la})
    print("ALL OK")


asyncio.run(main())
