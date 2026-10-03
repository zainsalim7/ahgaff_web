#!/bin/bash
# اختبار: استثناء مؤقت + تنبيه تلقائي اليوم + ملخص يومي + رد المراسلات + طلب تغيير بلا معرّف (ويب)
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)/api
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
TOK=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | J "d['access_token']")
ETOK=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"username":"EMP-100","password":"EMP-100"}' | J "d['access_token']")
A="Authorization: Bearer $TOK"; E="Authorization: Bearer $ETOK"; CT="Content-Type: application/json"
EID=$(curl -s $API/hr/attendance/my -H "$E" | J "d['profile']['id']")
TODAY=$(TZ=Asia/Aden date +%F); YEST=$(TZ=Asia/Aden date -d yesterday +%F); TMR=$(TZ=Asia/Aden date -d tomorrow +%F)
echo "== (2) temp exemption: to_date in past → 400"; curl -s -X PUT $API/hr/locations/exemptions/$EID -H "$A" -H "$CT" -d "{\"exempt\":true,\"to_date\":\"2020-01-01\"}" | J "d['detail']"
echo "== upcoming (from tomorrow)"; curl -s -X PUT $API/hr/locations/exemptions/$EID -H "$A" -H "$CT" -d "{\"exempt\":true,\"reason\":\"مهمة\",\"from_date\":\"$TMR\",\"to_date\":\"$TMR\"}" | J "d['message']"
curl -s $API/hr/locations/exemptions -H "$A" | J "[(i['employee_no'],i['state'],i['permanent'],i['from_date'],i['to_date']) for i in d['items'] if i['employee_id']=='$EID'], d['can_manage']"
echo "== /my geofence.exempt should be False (upcoming)"; curl -s $API/hr/attendance/my -H "$E" | J "d['geofence']['exempt']"
echo "== active (today..tomorrow)"; curl -s -X PUT $API/hr/locations/exemptions/$EID -H "$A" -H "$CT" -d "{\"exempt\":true,\"reason\":\"مهمة\",\"from_date\":\"$TODAY\",\"to_date\":\"$TMR\"}" | J "d['message']"
curl -s $API/hr/attendance/my -H "$E" | J "'exempt now:', d['geofence']['exempt']"
curl -s $API/hr/locations/exemptions -H "$A" | J "[i['state_label'] for i in d['items'] if i['employee_id']=='$EID']"
echo "== check-in far away while exempt → accepted"; curl -s -X DELETE "$API/hr/attendance/record/$EID/$TODAY?shift_id=main" -H "$A" >/dev/null
LOC=$(curl -s -X POST $API/hr/locations -H "$A" -H "$CT" -d '{"name":"موقع اختبار","latitude":14.5,"longitude":49.1,"radius_meters":100}' | J "d.get('id')")
curl -s -X POST $API/hr/attendance/check-in -H "$E" -H "$CT" -d '{"latitude":14.9,"longitude":49.9,"accuracy":5}' | J "d.get('status'), d.get('location',{}).get('status'), d.get('detail')"
echo "== remove exemption + unexempted check-in far → 403"; curl -s -X PUT $API/hr/locations/exemptions/$EID -H "$A" -H "$CT" -d '{"exempt":false}' | J "d['message']"
curl -s -X DELETE "$API/hr/attendance/record/$EID/$TODAY?shift_id=main" -H "$A" >/dev/null
curl -s -X POST $API/hr/attendance/check-in -H "$E" -H "$CT" -d '{"latitude":14.9,"longitude":49.9,"accuracy":5}' | J "d.get('detail','OK?')[:40]"
echo "== employee cannot set exemption (403)"; curl -s -X PUT $API/hr/locations/exemptions/$EID -H "$E" -H "$CT" -d '{"exempt":true}' | J "d['detail']"
echo "== (1) dashboard alert hr_auto_today"; curl -s -X POST $API/hr/attendance/check-in -H "$E" -H "$CT" -d '{"latitude":14.5,"longitude":49.1}' >/dev/null
curl -s -X POST $API/hr/attendance/check-out -H "$E" -H "$CT" -d '{"latitude":14.9,"longitude":49.9}' | J "d['out_of_range']"
curl -s "$API/dashboard/management?period=day" -H "$A" | python3 -c "
import sys,json;d=json.load(sys.stdin);hr=d.get('hr') or {}
a=[x for x in (hr.get('alerts') or []) if x['key']=='hr_auto_today']
print('alert:', a[0]['count'] if a else 'MISSING', [(i.get('employee_name'),i.get('kind')) for i in (a[0]['items'] if a else [])][:5], a[0]['route'] if a else '')"
echo "== details warnings_only"; curl -s "$API/hr/attendance/details?date_from=$TODAY&date_to=$TODAY&warnings_only=true" -H "$A" | J "d['total'], [i['warnings'] for i in d['items']][:3]"
echo "== daily summary notification (yesterday seed)"
cd /app/backend && python3 - <<EOF
import os,asyncio
from dotenv import load_dotenv; load_dotenv('backend/.env')
from motor.motor_asyncio import AsyncIOMotorClient
import sys; sys.path.insert(0,'backend')
async def m():
    db=AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    await db.hr_attendance.insert_one({"employee_id":"$EID","date":"$YEST","status":"present","check_in":"08:00","check_out":"14:00","auto_checkout":True,"source":"self","shift_id":"main","_test":True})
    from routes.hr_alerts import auto_events_summary_alert
    n=await auto_events_summary_alert(db,"$YEST"); print("summary recs:",n)
    async for x in db.notifications.find({"type":"hr_auto_summary"}): print(x["title"],"|",x["message"][:100],"|",x.get("data"))
    print("cleanup:", (await db.hr_attendance.delete_many({"_test":True})).deleted_count, (await db.notifications.delete_many({"type":"hr_auto_summary"})).deleted_count)
asyncio.run(m())
EOF
cd /app
echo "== (3) correspondence reply: employee sends → HR replies"
CID=$(curl -s -X POST $API/hr/correspondence/my/send -H "$E" -F "subject=طلب اختبار رد" -F "category=request" -F "body=نص الطلب" | J "d.get('id') or d.get('correspondence',{}).get('id') or d")
echo cid=$CID
curl -s -X POST $API/hr/correspondence/$CID/reply -H "$A" -H "$CT" -d '{"body":"تم استلام طلبك وسيُنفَّذ","close":false}' | J "d['message']"
curl -s $API/hr/correspondence/$CID -H "$A" | J "d['status'], len(d['replies']), d['replies'][0]['body'], d.get('sender_employee_name')"
curl -s $API/hr/correspondence/my -H "$E" | J "[(c['ref_no'], c['status'], c.get('replies_count') or len(c.get('replies') or [])) for c in d['items'] if c['id']=='$CID']"
curl -s -X POST $API/hr/correspondence/$CID/reply -H "$A" -H "$CT" -d '{"body":"أُغلق","close":true}' | J "d['message']"
curl -s -X DELETE $API/hr/correspondence/$CID -H "$A" | J "d.get('message',d)"
echo "== (4) web change-request without device_id → approve = reset"
curl -s -X POST $API/hr/attendance/devices/$EID/reset -H "$A" >/dev/null
curl -s -X DELETE "$API/hr/attendance/record/$EID/$TODAY?shift_id=main" -H "$A" >/dev/null
curl -s -X POST $API/hr/attendance/check-in -H "$E" -H "$CT" -d '{"device_id":"DEV-A","latitude":14.5,"longitude":49.1}' | J "d.get('status') or d"
RID=$(curl -s -X POST $API/hr/attendance/devices/my/change-request -H "$E" -H "$CT" -d '{"device_id":"","reason":"هاتف جديد"}' | J "d['request']['id']"); echo rid=$RID
curl -s $API/hr/attendance/devices/my -H "$E" | J "d['pending_request']['new_device_id'], d['can_request']"
curl -s -X POST $API/hr/attendance/devices/requests/$RID/approve -H "$A" | J "d['message']"
curl -s $API/hr/attendance/devices/my -H "$E" | J "'device after approve:', d['device_id'], d['last_request']['status_label']"
curl -s -X POST $API/hr/attendance/check-out -H "$E" -H "$CT" -d '{"device_id":"DEV-NEW","latitude":14.5,"longitude":49.1}' | J "d.get('check_out') or d"
curl -s $API/hr/attendance/devices/my -H "$E" | J "'registered now:', d['device_id']"
echo "== cleanup"; curl -s -X POST $API/hr/attendance/devices/$EID/reset -H "$A" >/dev/null; curl -s -X DELETE "$API/hr/attendance/record/$EID/$TODAY?shift_id=main" -H "$A" | J "d['message']"; curl -s -X DELETE $API/hr/locations/$LOC -H "$A" | J "d['message']"
cd /app/backend && python3 - <<EOF
import os,asyncio
from dotenv import load_dotenv; load_dotenv('backend/.env')
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
async def m():
    db=AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    print("req:", (await db.hr_device_requests.delete_many({"employee_id":"$EID"})).deleted_count, "notifs:", (await db.notifications.delete_many({"type":{"\$in":["hr_device","hr_correspondence"]}})).deleted_count)
    await db.employees.update_one({"_id":ObjectId("$EID")},{"\$unset":{"device_last_alert_at":""}})
asyncio.run(m())
EOF
