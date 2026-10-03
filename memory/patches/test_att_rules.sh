#!/bin/bash
# اختبار قواعد التحضير حسب الموقع: انصراف خارج النطاق / غياب تلقائي / انصراف تلقائي
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)/api
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
TOK=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | J "d['access_token']")
ETOK=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"username":"EMP-100","password":"EMP-100"}' | J "d['access_token']")
A="Authorization: Bearer $TOK"; E="Authorization: Bearer $ETOK"; CT="Content-Type: application/json"
echo "== settings"; curl -s $API/hr/work-settings -H "$A" | J "{k:d.get(k) for k in ('auto_absent_enabled','auto_checkout_enabled','auto_checkout_after_minutes','geofence_required','work_days')}"
TODAY=$(TZ=Asia/Aden date +%F); echo "today=$TODAY now=$(TZ=Asia/Aden date +%H:%M)"
echo "== clean today's EMP-100 records"; curl -s -X DELETE "$API/hr/attendance/record/$(curl -s $API/hr/attendance/my -H "$E" | J "d['profile']['id']")/$TODAY" -H "$A" | J "d.get('message',d)"
echo "== run auto-absent"; curl -s -X POST $API/hr/attendance/auto-absent/run -H "$A" | J "d"
echo "== my (expect absent auto)"; curl -s $API/hr/attendance/my -H "$E" | J "{k:(d.get('today') or {}).get(k) for k in ('status','auto_absent','note','check_in')}, d['can_check_in']"
echo "== create far location"; LOC=$(curl -s -X POST $API/hr/locations -H "$A" -H "$CT" -d '{"name":"موقع اختبار بعيد","latitude":14.5,"longitude":49.1,"radius_meters":100}' | J "d.get('id') or d.get('location',{}).get('id') or d")
echo "loc=$LOC"
echo "== check-in in range (expect converted → late, was_auto_absent)"; curl -s -X POST $API/hr/attendance/check-in -H "$E" -H "$CT" -d '{"latitude":14.5,"longitude":49.1,"accuracy":5}' | J "{k:d.get(k) for k in ('status','was_auto_absent','late_minutes','message')} if 'status' in d else d"
echo "== check-out OUT of range (expect accepted + warning)"; curl -s -X POST $API/hr/attendance/check-out -H "$E" -H "$CT" -d '{"latitude":14.6,"longitude":49.3,"accuracy":5}' | J "{k:d.get(k) for k in ('check_out','out_of_range','warning','message')} if 'check_out' in d else d"
echo "== details (warnings + summary)"; curl -s "$API/hr/attendance/details?date_from=$TODAY&date_to=$TODAY&search=EMP-100" -H "$A" | J "[ (i['status'],i['warnings'],i['note'][:80]) for i in d['items']], d['summary']"
echo "== daily row warnings"; curl -s "$API/hr/attendance/daily?date=$TODAY" -H "$A" | J "[(r['employee_no'],r['status'],r.get('warnings')) for r in d['rows'] if r.get('employee_no')=='EMP-100']"
echo "== excel export has warnings col"; curl -s "$API/hr/attendance/details/export?date_from=$TODAY&date_to=$TODAY&search=EMP-100" -H "$A" -o /tmp/det.xlsx && python3 -c "
from openpyxl import load_workbook; ws=load_workbook('/tmp/det.xlsx').active; print([c.value for c in ws[2]][10:12]); print([c.value for c in ws[3]][10:12])"
echo "== auto-checkout note: seed yesterday open record via mongo"
EID=$(curl -s $API/hr/attendance/my -H "$E" | J "d['profile']['id']")
cd /app/backend && python3 - <<EOF
import os,asyncio
from dotenv import load_dotenv; load_dotenv('backend/.env')
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import date,timedelta
async def m():
    db=AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    y=(date.today()-timedelta(days=1)).isoformat()
    await db.hr_attendance.delete_many({"employee_id":"$EID","date":y})
    await db.hr_attendance.insert_one({"employee_id":"$EID","date":y,"status":"present","check_in":"08:05","check_out":None,"late_minutes":0,"note":"","source":"self","shift_id":"main","_test":True})
    print("seeded",y)
asyncio.run(m())
EOF
echo "== run auto-checkout"; curl -s -X POST $API/hr/attendance/auto-checkout/run -H "$A" | J "d"
cd /app/backend && python3 - <<EOF
import os,asyncio
from dotenv import load_dotenv; load_dotenv('backend/.env')
from motor.motor_asyncio import AsyncIOMotorClient
async def m():
    db=AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    r=await db.hr_attendance.find_one({"_test":True}); print("auto:",r.get("auto_checkout"),r.get("check_out"),"|",r.get("note"))
    # cleanup
    print("cleanup test rec:", (await db.hr_attendance.delete_many({"_test":True})).deleted_count)
    print("cleanup auto-absent today:", (await db.hr_attendance.delete_many({"auto_absent":True,"date":"$TODAY"})).deleted_count)
    print("cleanup EMP-100 today:", (await db.hr_attendance.delete_many({"employee_id":"$EID","date":"$TODAY"})).deleted_count)
asyncio.run(m())
EOF
echo "== delete loc"; curl -s -X DELETE $API/hr/locations/$LOC -H "$A" | J "d.get('message',d)"
