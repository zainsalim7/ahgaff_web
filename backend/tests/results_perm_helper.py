# Helper: set/restore Salim custom_permissions for results permission tests
import sys
from pymongo import MongoClient
import os
from dotenv import load_dotenv
from bson import ObjectId
load_dotenv('/app/backend/.env')
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
ORIG = ['manage_fee_receipts', 'hr_manage_tasks', 'hr_manage_appraisals']
cmd = sys.argv[1]
u = db.users.find_one({'username': 'Salim'})
if cmd == 'show':
    print({k: u.get(k) for k in ('role', 'role_id', 'custom_permissions', 'permissions', 'faculty_id', 'department_id', 'advanced_access_real_enforcement')})
    r = db.roles.find_one({'_id': ObjectId(u['role_id'])}) if u.get('role_id') else db.roles.find_one({'system_key': u['role']})
    perms = (r or {}).get('permissions', [])
    print('role perms has results:', [p for p in perms if 'result' in p or 'grade' in p])
elif cmd == 'set':
    perms = sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] else []
    db.users.update_one({'_id': u['_id']}, {'$set': {'custom_permissions': perms}})
    print('set', perms)
elif cmd == 'restore':
    db.users.update_one({'_id': u['_id']}, {'$set': {'custom_permissions': ORIG}})
    print('restored')
