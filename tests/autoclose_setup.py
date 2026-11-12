# Helper for auto-close attendance testing: create/cleanup/inspect test lectures (created_by='autoclose_test_script')
import sys, os
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from bson import ObjectId

client = MongoClient("mongodb://localhost:27017")
db = client[open('/app/backend/.env').read().split('DB_NAME="')[1].split('"')[0]]
CREATED_BY = 'autoclose_test_script'
COURSE_ID = '698f0000d803b27aab0120af'


def create(seconds_to_deadline: int):
    now = datetime.now(timezone.utc) + timedelta(hours=3)
    # deadline = start + 30min ; start minute-aligned
    target_deadline = now + timedelta(seconds=seconds_to_deadline)
    start = (target_deadline - timedelta(minutes=30)).replace(second=0, microsecond=0)
    if start + timedelta(minutes=30) < target_deadline:
        start += timedelta(minutes=1)
    end = start + timedelta(hours=1)
    doc = {
        'course_id': COURSE_ID, 'date': start.strftime('%Y-%m-%d'),
        'start_time': start.strftime('%H:%M'), 'end_time': end.strftime('%H:%M'),
        'room': 'TEST-ROOM', 'status': 'scheduled', 'created_by': CREATED_BY,
        'semester_id': '698e5cc524745fb79482e099', 'semester_name': 'الفصل الثاني',
        'created_at': datetime.now(timezone.utc),
    }
    r = db.lectures.insert_one(doc)
    real_deadline = start + timedelta(minutes=30)
    print(f"LECTURE_ID={r.inserted_id} date={doc['date']} start={doc['start_time']} secs_to_deadline={(real_deadline-now).total_seconds():.0f}")


def inspect(lid):
    lec = db.lectures.find_one({'_id': ObjectId(lid)})
    print('lecture status:', lec and lec.get('status'), 'started_at:', lec and lec.get('attendance_started_at'))
    recs = list(db.attendance.find({'lecture_id': lid}))
    print('attendance count:', len(recs))
    for a in recs:
        print('  ', a.get('student_id'), a.get('status'), a.get('method'), a.get('date') or a.get('created_at'))


def cleanup():
    ids = [str(l['_id']) for l in db.lectures.find({'created_by': CREATED_BY})]
    a = db.attendance.delete_many({'lecture_id': {'$in': ids}})
    l = db.lectures.delete_many({'_id': {'$in': [ObjectId(i) for i in ids]}, 'created_by': CREATED_BY})
    print('deleted lectures', l.deleted_count, 'attendance', a.deleted_count, ids)


def info():
    c = db.courses.find_one({'_id': ObjectId(COURSE_ID)})
    print('course', c.get('name'), 'dept', c.get('department_id'))
    print('enrollments', db.enrollments.count_documents({'course_id': COURSE_ID}))
    print('existing test lectures', [str(l['_id']) for l in db.lectures.find({'created_by': CREATED_BY})])


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'create': create(int(sys.argv[2]))
    elif cmd == 'inspect': inspect(sys.argv[2])
    elif cmd == 'cleanup': cleanup()
    elif cmd == 'info': info()
