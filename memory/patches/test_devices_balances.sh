#!/bin/bash
# اختبار: تنبيه الأجهزة + طلب تغيير الجهاز + تقرير الأرصدة السنوي
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)/api
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
TOK=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | J "d['access_token']")
ETOK=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"username":"EMP-100","password":"EMP-100"}' | J "d['access_token']")
A="Authorization: Bearer $TOK"; E="Authorization: Bearer $ETOK"; CT="Content-Type: application/json"
EID=$(curl -s $API/hr/attendance/my -H "$E" | J "d['profile']['id']")
TODAY=$(TZ=Asia/Aden date +%F)
echo "== reset device + clear today"; curl -s -X POST $API/hr/attendance/devices/$EID/reset -H "$A" | J "d['message']"
curl -s -X DELETE "$API/hr/attendance/record/$EID/$TODAY?shift_id=main" -H "$A" >/dev/null
echo "== my device (none)"; curl -s $API/hr/attendance/devices/my -H "$E" | J "d['device_id'], d['can_request']"
echo "== change-request without device (400)"; curl -s -X POST $API/hr/attendance/devices/my/change-request -H "$E" -H "$CT" -d '{"device_id":"NEW-1"}' | J "d['detail']"
echo "== check-in from device A (registers)"; curl -s -X POST $API/hr/attendance/check-in -H "$E" -H "$CT" -d '{"device_id":"DEV-A","device_name":"Phone A"}' | J "d.get('status') or d"
NBEF=$(curl -s "$API/notifications" -H "$A" | python3 -c "import sys,json;d=json.load(sys.stdin);l=d if isinstance(d,list) else d.get('notifications',d.get('items',[]));print(len([n for n in l if n.get('type')=='hr_device']))")
echo "== check-out from device B (403 + HR alert)"; curl -s -X POST $API/hr/attendance/check-out -H "$E" -H "$CT" -d '{"device_id":"DEV-B","device_name":"Phone B"}' | J "d['detail']"
sleep 1
curl -s "$API/notifications" -H "$A" | python3 -c "
import sys,json;d=json.load(sys.stdin);l=d if isinstance(d,list) else d.get('notifications',d.get('items',[]))
x=[n for n in l if n.get('type')=='hr_device']; print('hr_device notifs before',$NBEF,'after',len(x)); print(x[0]['title'],'|',x[0]['message'][:120]) if x else print('NONE')"
echo "== second rejection within 10 min → throttled (no new alert)"; curl -s -X POST $API/hr/attendance/check-out -H "$E" -H "$CT" -d '{"device_id":"DEV-B"}' >/dev/null
curl -s "$API/notifications" -H "$A" | python3 -c "
import sys,json;d=json.load(sys.stdin);l=d if isinstance(d,list) else d.get('notifications',d.get('items',[]));print('after 2nd:',len([n for n in l if n.get('type')=='hr_device']))"
echo "== same device (400 same)"; curl -s -X POST $API/hr/attendance/devices/my/change-request -H "$E" -H "$CT" -d '{"device_id":"DEV-A"}' | J "d['detail']"
echo "== change-request DEV-B"; RID=$(curl -s -X POST $API/hr/attendance/devices/my/change-request -H "$E" -H "$CT" -d '{"device_id":"DEV-B","device_name":"Phone B","reason":"غيّرت هاتفي"}' | J "d['request']['id']"); echo rid=$RID
echo "== duplicate pending (400)"; curl -s -X POST $API/hr/attendance/devices/my/change-request -H "$E" -H "$CT" -d '{"device_id":"DEV-C"}' | J "d['detail']"
echo "== my device shows pending"; curl -s $API/hr/attendance/devices/my -H "$E" | J "d['pending_request']['status_label'], d['can_request']"
echo "== HR list pending"; curl -s "$API/hr/attendance/devices/requests?status=pending" -H "$A" | J "d['pending'], [(i['employee_no'],i['new_device_id']) for i in d['items']]"
echo "== devices endpoint pending count"; curl -s "$API/hr/attendance/devices" -H "$A" | J "d['pending_requests']"
echo "== employee cannot approve (403)"; curl -s -X POST $API/hr/attendance/devices/requests/$RID/approve -H "$E" | J "d['detail']"
echo "== approve"; curl -s -X POST $API/hr/attendance/devices/requests/$RID/approve -H "$A" | J "d['message']"
echo "== approve again (400)"; curl -s -X POST $API/hr/attendance/devices/requests/$RID/approve -H "$A" | J "d['detail']"
echo "== check-out from DEV-B now OK"; curl -s -X POST $API/hr/attendance/check-out -H "$E" -H "$CT" -d '{"device_id":"DEV-B"}' | J "d.get('check_out') or d"
echo "== reject flow"; curl -s -X POST $API/hr/attendance/devices/$EID/reset -H "$A" >/dev/null
curl -s -X DELETE "$API/hr/attendance/record/$EID/$TODAY?shift_id=main" -H "$A" >/dev/null
curl -s -X POST $API/hr/attendance/check-in -H "$E" -H "$CT" -d '{"device_id":"DEV-A"}' >/dev/null
RID2=$(curl -s -X POST $API/hr/attendance/devices/my/change-request -H "$E" -H "$CT" -d '{"device_id":"DEV-Z"}' | J "d['request']['id']")
curl -s -X POST $API/hr/attendance/devices/requests/$RID2/reject -H "$A" -H "$CT" -d '{"reason":"غير مبرر"}' | J "d['message']"
curl -s $API/hr/attendance/devices/my -H "$E" | J "d['pending_request'], d['last_request']['status_label'], d['last_request']['reject_reason']"
echo "== balances export"; curl -s "$API/hr/leaves/balances/export?year=2026" -H "$A" -o /tmp/bal.xlsx -D /tmp/h.txt; grep -i "x-filename" /tmp/h.txt | python3 -c "import sys,urllib.parse;print(urllib.parse.unquote(sys.stdin.read().split(':',1)[1].strip()))"
python3 -c "
from openpyxl import load_workbook; wb=load_workbook('/tmp/bal.xlsx'); print(wb.sheetnames); ws=wb[wb.sheetnames[0]]
print([c.value for c in ws[2]]); print([c.value for c in ws[3]]); print([c.value for c in ws[4]]); print('rows', ws.max_row)
ws2=wb['تفصيلي']; print([c.value for c in ws2[2]])"
echo "== employee export (403)"; curl -s "$API/hr/leaves/balances/export" -H "$E" | J "d['detail']"
echo "== cleanup"; curl -s -X POST $API/hr/attendance/devices/$EID/reset -H "$A" >/dev/null; curl -s -X DELETE "$API/hr/attendance/record/$EID/$TODAY?shift_id=main" -H "$A" | J "d['message']"
cd /app/backend && python3 - <<EOF
import os,asyncio
from dotenv import load_dotenv; load_dotenv('backend/.env')
from motor.motor_asyncio import AsyncIOMotorClient
async def m():
    db=AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    print("requests removed:", (await db.hr_device_requests.delete_many({"employee_id":"$EID"})).deleted_count)
    print("notifs removed:", (await db.notifications.delete_many({"type":"hr_device"})).deleted_count)
    await db.employees.update_one({"_id":__import__('bson').ObjectId("$EID")},{"\$unset":{"device_last_alert_at":""}})
asyncio.run(m())
EOF
