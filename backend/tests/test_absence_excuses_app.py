"""E2E: تبرير غياب الطلاب من التطبيق (/api/absence-excuses) — يزرع محاضرتين وسجلي غياب مؤقتين ثم ينظف"""
import asyncio, base64, io, os, sys
from datetime import datetime, timedelta, timezone

import requests
from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image

load_dotenv("/app/backend/.env")
API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0] + "/api"
TZ = timezone(timedelta(hours=3))
ok = fail = 0


def check(name, cond, info=""):
    global ok, fail
    ok += cond; fail += (not cond)
    print(("✅" if cond else "❌"), name, info if not cond else "")


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}); r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def png_b64():
    buf = io.BytesIO(); Image.new("RGB", (40, 40), (200, 30, 30)).save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    st = await db.students.find_one({"student_id": "1001"})
    sid = str(st["_id"])
    enr = await db.enrollments.find_one({"student_id": sid})
    course = await db.courses.find_one({"_id": ObjectId(enr["course_id"])})
    today = datetime.now(TZ).date()
    d_ok, d_old = (today - timedelta(days=2)).isoformat(), (today - timedelta(days=6)).isoformat()
    lec_ok = await db.lectures.insert_one({"course_id": enr["course_id"], "date": d_ok, "start_time": "08:00", "end_time": "09:30", "status": "completed", "title": "TEST-AE", "created_at": datetime.now(TZ)})
    lec_old = await db.lectures.insert_one({"course_id": enr["course_id"], "date": d_old, "start_time": "08:00", "end_time": "09:30", "status": "completed", "title": "TEST-AE", "created_at": datetime.now(TZ)})
    rec_ok = await db.attendance.insert_one({"lecture_id": str(lec_ok.inserted_id), "course_id": enr["course_id"], "student_id": sid, "status": "absent", "date": datetime.now(TZ), "recorded_by": "test", "method": "manual"})
    rec_old = await db.attendance.insert_one({"lecture_id": str(lec_old.inserted_id), "course_id": enr["course_id"], "student_id": sid, "status": "absent", "date": datetime.now(TZ), "recorded_by": "test", "method": "manual"})
    rid_ok, rid_old = str(rec_ok.inserted_id), str(rec_old.inserted_id)
    created = []
    try:
        H = login("1001", "test1234")
        A = login("admin", "admin123")
        m = requests.get(f"{API}/absence-excuses/meta", headers=H).json()
        check("meta window_days=3", m.get("window_days") == 3, m)
        e = requests.get(f"{API}/absence-excuses/eligible", headers=H).json()
        by = {i["record_id"]: i for i in e["items"]}
        check("eligible: الحديث قابل", by.get(rid_ok, {}).get("can_excuse") is True)
        check("eligible: القديم غير قابل", by.get(rid_old, {}).get("can_excuse") is False and by.get(rid_old, {}).get("in_window") is False)
        r = requests.post(f"{API}/absence-excuses", headers=H, json={"message": "مرض", "image_base64": "", "record_ids": [rid_ok]})
        check("بدون صورة → 400", r.status_code == 400 and "إجباري" in r.text, r.text)
        r = requests.post(f"{API}/absence-excuses", headers=H, json={"message": "مرض", "image_base64": png_b64(), "record_ids": [rid_old]})
        check("غياب 6 أيام → 400 انتهت المهلة", r.status_code == 400 and "انتهت مهلة" in r.text, r.text)
        r = requests.post(f"{API}/absence-excuses", headers=H, json={"message": "", "image_base64": png_b64(), "record_ids": [rid_ok]})
        check("رسالة فارغة → 400", r.status_code == 400, r.text)
        r = requests.post(f"{API}/absence-excuses", headers=H, json={"message": "كنت مريضاً", "image_base64": png_b64(), "record_ids": [rid_ok]})
        check("إنشاء الطلب 200", r.status_code == 200, r.text)
        eid = r.json()["id"]; created.append(eid)
        check("route = registration (مرضي)", r.json()["full"]["route"] == "registration")
        r2 = requests.post(f"{API}/absence-excuses", headers=H, json={"message": "تكرار", "image_base64": png_b64(), "record_ids": [rid_ok]})
        check("تكرار نفس السجل → 400 طلب سابق", r2.status_code == 400 and "طلب سابق" in r2.text, r2.text)
        my = requests.get(f"{API}/absence-excuses/my", headers=H).json()
        check("my: قائمة تحوي الطلب pending", isinstance(my, list) and my and my[0]["id"] == eid and my[0]["status"] == "pending" and my[0]["items"][0]["record_id"] == rid_ok, my[:1])
        r = requests.get(f"{API}/absence-excuses/my", headers=A)
        check("my بتوكن أدمن → 403", r.status_code == 403)
        det = requests.get(f"{API}/student-excuses/{eid}", headers=A).json()
        check("شاشة المراجعة ترى items", det.get("source") == "app" and len(det.get("items", [])) == 1 and det["items"][0]["course_name"] == course.get("name"), det.get("items"))
        att = requests.get(f"{API}/student-excuses/{eid}/attachments/0", headers=A)
        check("مرفق الصورة يُفتح", att.status_code == 200 and att.headers.get("content-type", "").startswith("image/png"), att.status_code)
        r = requests.post(f"{API}/student-excuses/{eid}/decide", headers=A, json={"decision": "approved", "note": ""})
        check("قبول من الأدمن 200", r.status_code == 200, r.text)
        rec = await db.attendance.find_one({"_id": rec_ok.inserted_id})
        check("السجل تحوّل إلى excused", rec["status"] == "excused" and rec.get("excuse_id") == eid, rec)
        old = await db.attendance.find_one({"_id": rec_old.inserted_id})
        check("السجل القديم لم يُمس", old["status"] == "absent")
        my = requests.get(f"{API}/absence-excuses/my", headers=H).json()
        check("my: approved", my[0]["status"] == "approved")
        n = await db.notifications.find_one({"user_id": st["user_id"], "title": "✅ تم قبول تبرير الغياب"}, sort=[("created_at", -1)])
        check("إشعار القبول بالصيغة المطلوبة + route", n is not None and n["data"]["route"] == "/absence-excuse" and n["data"]["kind"] == "absence_excuse_decision", n)
        # رفض: سجل جديد ثم رفض
        await db.attendance.update_one({"_id": rec_ok.inserted_id}, {"$set": {"status": "absent"}, "$unset": {"excuse_id": ""}})
        await db.student_excuses.update_one({"_id": ObjectId(eid)}, {"$set": {"status": "cancelled"}})
        r = requests.post(f"{API}/absence-excuses", headers=H, json={"message": "ظرف", "image_base64": png_b64(), "record_ids": [rid_ok]})
        check("بعد إلغاء الأول يمكن طلب جديد", r.status_code == 200, r.text)
        eid2 = r.json()["id"]; created.append(eid2)
        r = requests.post(f"{API}/student-excuses/{eid2}/decide", headers=A, json={"decision": "rejected", "note": "الصورة غير واضحة"})
        check("رفض 200", r.status_code == 200, r.text)
        my = requests.get(f"{API}/absence-excuses/my", headers=H).json()
        check("my: reject_reason ظاهر", my[0]["status"] == "rejected" and my[0]["reject_reason"] == "الصورة غير واضحة", my[0])
        n = await db.notifications.find_one({"user_id": st["user_id"], "title": "❌ تم رفض تبرير الغياب"}, sort=[("created_at", -1)])
        check("إشعار الرفض بالسبب", n is not None and "الصورة غير واضحة" in n["message"], n)
        rec = await db.attendance.find_one({"_id": rec_ok.inserted_id})
        check("الرفض لا يغيّر السجل", rec["status"] == "absent")
    finally:
        await db.lectures.delete_many({"title": "TEST-AE"})
        await db.attendance.delete_many({"_id": {"$in": [rec_ok.inserted_id, rec_old.inserted_id]}})
        await db.student_excuses.delete_many({"_id": {"$in": [ObjectId(x) for x in created]}})
        await db.notifications.delete_many({"user_id": st["user_id"], "title": {"$in": ["✅ تم قبول تبرير الغياب", "❌ تم رفض تبرير الغياب"]}})
        await db.notifications.delete_many({"title": "طلب تبرير غياب جديد (من التطبيق)"})
    print(f"\n{ok} passed, {fail} failed")
    sys.exit(1 if fail else 0)


asyncio.run(main())
