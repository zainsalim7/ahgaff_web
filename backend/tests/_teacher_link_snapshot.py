# Read-only snapshot: teacher records / teacher-user linkage / fcm token duplicates
import os, asyncio, json
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
load_dotenv('/app/backend/.env'); load_dotenv('/app/backend/backend/.env')

async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    out = {}
    out['teachers_total'] = await db.teachers.count_documents({})
    out['teachers_auto'] = await db.teachers.count_documents({'teacher_id': {'$regex': '^AUTO-'}})
    out['teacher_users_total'] = await db.users.count_documents({'role': 'teacher'})
    out['teacher_users_unlinked'] = await db.users.count_documents({'role': 'teacher', '$or': [{'teacher_record_id': {'$exists': False}}, {'teacher_record_id': None}, {'teacher_record_id': ''}]})
    dup = [d async for d in db.teachers.aggregate([{'$match': {'user_id': {'$nin': [None, '']}}}, {'$group': {'_id': '$user_id', 'n': {'$sum': 1}}}, {'$match': {'n': {'$gt': 1}}}])]
    out['teachers_dup_user_id'] = dup
    fdup = [d async for d in db.fcm_tokens.aggregate([{'$group': {'_id': '$token', 'n': {'$sum': 1}, 'users': {'$addToSet': '$user_id'}}}, {'$match': {'n': {'$gt': 1}}}])]
    out['fcm_dup_tokens'] = len(fdup)
    out['fcm_dup_sample'] = [{'n': d['n'], 'users': d['users']} for d in fdup[:5]]
    for u in ['teacher180156', '9999', '222222']:
        doc = await db.users.find_one({'username': u}, {'teacher_record_id': 1, 'full_name': 1})
        out[u] = {'id': str(doc['_id']), 'trid': doc.get('teacher_record_id'), 'name': doc.get('full_name')} if doc else None
    print(json.dumps(out, ensure_ascii=False, default=str, indent=1))

asyncio.run(main())
