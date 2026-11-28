# Helper: delete only the VP test records created by a test run (by id) — never by prefix
import os

from bson import ObjectId
from pymongo import MongoClient


def _db():
    env = {}
    with open("/app/backend/.env") as f:
        for line in f:
            if "=" in line:
                k, v = line.strip().split("=", 1)
                env[k] = v.strip('"')
    return MongoClient(os.environ.get("MONGO_URL") or env["MONGO_URL"])[os.environ.get("DB_NAME") or env["DB_NAME"]]


def cleanup_ids(contracts=(), sessions=(), users=(), flag_tids=()):
    db = _db()
    c = [ObjectId(x) for x in contracts if ObjectId.is_valid(x)]
    s = [ObjectId(x) for x in sessions if ObjectId.is_valid(x)]
    u = [ObjectId(x) for x in users if ObjectId.is_valid(x)]
    r1 = db.vp_contracts.delete_many({"_id": {"$in": c}}) if c else None
    r2 = db.vp_sessions.delete_many({"$or": [{"_id": {"$in": s}}, {"contract_id": {"$in": [str(x) for x in c]}}]}) if (s or c) else None
    r3 = db.users.delete_many({"_id": {"$in": u}}) if u else None
    if contracts:
        db.notifications.delete_many({"id": {"$in": list(contracts)}, "type": {"$in": ["video_contract", "video_payment"]}})
    if sessions:
        db.notifications.delete_many({"id": {"$in": list(sessions)}, "type": "video_session"})
    for t in flag_tids:
        db.vp_teacher_flags.delete_one({"_id": t})
    print("cleanup:", r1 and r1.deleted_count, r2 and r2.deleted_count, r3 and r3.deleted_count)
