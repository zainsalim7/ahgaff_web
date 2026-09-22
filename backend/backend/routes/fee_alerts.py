"""🔔 إشعارات السندات للموظفين المسؤولين: سند جديد (مجمَّع خلال 10 دقائق) + ملخص يومي 08:00 للسندات المعلقة >24 ساعة"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from .deps import get_db

logger = logging.getLogger("fee_alerts")
YEMEN_TZ = timezone(timedelta(hours=3))
BATCH_MINUTES = 10
DAILY_HOUR = 8
ROUTE = "/fee-receipts"
_pending_batches: dict = {}  # user_id -> {"count", "type_name", "student", "task"}


async def _push_user(db, user_id: str, title: str, body: str, data: dict) -> int:
    try:
        from services.firebase_service import send_notification
    except Exception:
        return 0
    sent = 0
    for t in await db.fcm_tokens.find({"user_id": user_id}).to_list(20):
        try:
            if await send_notification(t["token"], title, body, {k: str(v) for k, v in data.items()}):
                sent += 1
        except Exception as e:
            logger.warning(f"fee push failed {user_id}: {e}")
    return sent


async def _fee_staff_ids(db, exclude_leadership: bool = True) -> set:
    """كل الموظفين الذين يملكون manage_fee_receipts (من الدور أو المخصصة أو المباشرة)"""
    roles = {str(r["_id"]): (r.get("permissions") or []) for r in await db.roles.find({}, {"permissions": 1}).to_list(300)}
    out = set()
    q = {"is_active": {"$ne": False}, "role": {"$nin": ["student", "teacher"]}}
    async for u in db.users.find(q, {"role": 1, "role_id": 1, "custom_permissions": 1, "permissions": 1, "faculty_id": 1, "department_id": 1}):
        if exclude_leadership and u.get("role") in ("admin", "university_president", "dean", "department_head"):
            continue
        perms = set(roles.get(str(u.get("role_id")), [])) | set(u.get("custom_permissions") or []) | set(u.get("permissions") or [])
        if "manage_fee_receipts" in perms:
            out.add(str(u["_id"]))
    return out


async def recipients_for_type(db, type_id: str, student: dict) -> list:
    """المسؤولون عن النوع؛ وإلا كل موظفي السندات ضمن كلية الطالب؛ وإلا رئيس قسم الطالب كخيار احتياطي"""
    t = await db.fee_types.find_one({"_id": ObjectId(type_id)}, {"responsible_user_ids": 1}) if ObjectId.is_valid(type_id) else None
    resp = (t or {}).get("responsible_user_ids") or []
    if resp:
        return resp
    staff = await _fee_staff_ids(db)
    if staff:
        fac = student.get("faculty_id")
        if not fac and student.get("department_id"):
            dep = await db.departments.find_one({"_id": ObjectId(student["department_id"])}, {"faculty_id": 1}) if ObjectId.is_valid(student["department_id"]) else None
            fac = (dep or {}).get("faculty_id")
        scoped = []
        async for u in db.users.find({"_id": {"$in": [ObjectId(i) for i in staff]}}, {"faculty_id": 1, "faculty_ids": 1}):
            fids = set(u.get("faculty_ids") or ([u["faculty_id"]] if u.get("faculty_id") else []))
            if not fids or not fac or fac in fids:
                scoped.append(str(u["_id"]))
        if scoped:
            return scoped
    heads = await db.users.find({"role": "department_head", "is_active": {"$ne": False}, "$or": [{"department_id": student.get("department_id")}, {"department_ids": student.get("department_id")}]}, {"_id": 1}).to_list(10)
    return [str(h["_id"]) for h in heads]


async def _flush(user_id: str):
    await asyncio.sleep(BATCH_MINUTES * 60)
    b = _pending_batches.pop(user_id, None)
    if not b:
        return
    db = get_db()
    if b["count"] == 1:
        title, body = f"🧾 سند جديد — {b['type_name']}", f"الطالب {b['student']} بانتظار التعميد"
    else:
        title, body = "🧾 سندات جديدة بانتظار التعميد", f"{b['count']} سندات جديدة (آخرها: {b['student']} — {b['type_name']})"
    await _push_user(db, user_id, title, body, {"type": "fee_receipt_new", "route": ROUTE, "tab": "pending", "type_id": b.get("type_id", "")})


async def notify_new_receipt(db, receipt: dict, student: dict):
    """يُستدعى بعد حفظ السند — يجمّع الإشعارات لكل مستلم خلال 10 دقائق"""
    try:
        users = await recipients_for_type(db, receipt.get("type_id", ""), student)
        label = f"{student.get('full_name', '')} ({student.get('student_id', '')})"
        for uid in users:
            b = _pending_batches.get(uid)
            if b:
                b["count"] += 1; b["student"] = label; b["type_name"] = receipt.get("type_name", "")
            else:
                _pending_batches[uid] = {"count": 1, "student": label, "type_name": receipt.get("type_name", ""), "type_id": receipt.get("type_id", "")}
                asyncio.create_task(_flush(uid))
    except Exception as e:
        logger.error(f"notify_new_receipt failed: {e}")


async def send_daily_pending_summary(db) -> dict:
    """ملخص يومي: لكل مسؤول عدد السندات المعلقة منذ >24 ساعة ضمن أنواعه"""
    from .fee_receipts import _allowed_type_ids
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    staff = await _fee_staff_ids(db)
    sent = 0
    for uid in staff:
        u = await db.users.find_one({"_id": ObjectId(uid)})
        if not u:
            continue
        allowed = await _allowed_type_ids(db, {**u, "id": uid, "role": u.get("role")})
        q = {"status": "pending", "uploaded_at": {"$lte": cutoff}}
        if allowed is not None:
            q["type_id"] = {"$in": list(allowed)}
        n = await db.fee_receipts.count_documents(q)
        if n:
            sent += await _push_user(db, uid, "⏰ سندات معلقة تنتظرك", f"لديك {n} سنداً معلقاً منذ أكثر من 24 ساعة", {"type": "fee_pending_summary", "route": ROUTE, "tab": "pending"})
    await db.digest_state.update_one({"_id": "fee_daily"}, {"$set": {"last_day": datetime.now(YEMEN_TZ).date().isoformat(), "last_run_at": datetime.now(timezone.utc)}}, upsert=True)
    return {"staff": len(staff), "pushes": sent}


async def fee_daily_loop():
    await asyncio.sleep(40)
    while True:
        try:
            now = datetime.now(YEMEN_TZ)
            if now.hour == DAILY_HOUR:
                db = get_db()
                st = await db.digest_state.find_one({"_id": "fee_daily"}) or {}
                if st.get("last_day") != now.date().isoformat():
                    await send_daily_pending_summary(db)
        except Exception as e:
            logger.error(f"fee daily loop error: {e}")
        await asyncio.sleep(60)
