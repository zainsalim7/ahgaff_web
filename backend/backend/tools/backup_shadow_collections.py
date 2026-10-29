"""نسخة احتياطية كاملة لمجموعات النظام التجريبي (Shadow Mode) قبل المرحلة 7-د — قراءة فقط، لا تمس النظام القديم."""
import asyncio
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))
from motor.motor_asyncio import AsyncIOMotorClient

COLLECTIONS = [
    "advanced_permissions", "advanced_permission_groups", "advanced_roles",
    "advanced_user_assignments", "advanced_access_testers", "advanced_permission_audit_logs",
    "advanced_role_reviews", "advanced_role_review_audit_logs", "advanced_sensitive_permission_reviews",
    "advanced_access_feature_flags", "advanced_rollback_audit_logs",
    "advanced_pilot_runs", "advanced_pilot_results",
]


def _default(o):
    if hasattr(o, "isoformat"):
        return o.isoformat()
    return str(o)


async def main():
    client = AsyncIOMotorClient(os.environ.get("MONGO_URL"))
    db = client[os.environ.get("DB_NAME")]
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = f"/app/backups/pre_phase7d_{ts}"
    os.makedirs(out_dir, exist_ok=True)

    manifest = {}
    for coll in COLLECTIONS:
        docs = await db[coll].find({}).to_list(100000)
        path = os.path.join(out_dir, f"{coll}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(docs, f, ensure_ascii=False, indent=2, default=_default)
        manifest[coll] = len(docs)

    with open(os.path.join(out_dir, "_manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"timestamp": ts, "collections": manifest, "purpose": "Phase 7-D pre-rebuild backup"}, f, ensure_ascii=False, indent=2)

    print(f"BACKUP_DIR={out_dir}")
    for k, v in manifest.items():
        print(f"  {k}: {v} docs")

    # تحقق من سلامة النسخة: إعادة قراءة كل ملف والتأكد من تطابق العدد
    ok = True
    for coll in COLLECTIONS:
        with open(os.path.join(out_dir, f"{coll}.json"), "r", encoding="utf-8") as f:
            loaded = json.load(f)
        if len(loaded) != manifest[coll]:
            print(f"  ❌ VERIFY FAILED: {coll}")
            ok = False
    print("VERIFY_OK=" + str(ok))
    client.close()

asyncio.run(main())
