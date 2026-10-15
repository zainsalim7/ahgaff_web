#!/bin/bash
# اختبار: طلب تغيير جهاز تلقائي عند رفض تحضير من جهاز مختلف
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)/api
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
TOK=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | J "d['access_token']")
ETOK=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"username":"EMP-100","password":"EMP-100"}' | J "d['access_token']")
A="Authorization: Bearer $TOK"; E="Authorization: Bearer $ETOK"; CT="Content-Type: application/json"
EID=$(curl -s $API/hr/attendance/my -H "$E" | J "d['profile']['id']")
TODAY=$(TZ=Asia/Aden date +%F)
echo "== reset device + clear today + clear pending requests"
curl -s -X POST $API/hr/attendance/devices/$EID/reset -H "$A" | J "d['message']"
curl -s -X DELETE "$API/hr/attendance/record/$EID/$TODAY?shift_id=main" -H "$A" >/dev/null
for R in $(curl -s "$API/hr/attendance/devices/requests?status=pending" -H "$A" | J "' '.join(i['id'] for i in d['items'] if i['employee_id']=='$EID')"); do curl -s -X POST $API/hr/attendance/devices/requests/$R/reject -H "$A" -H "$CT" -d '{"reason":"تنظيف اختبار"}' >/dev/null; done
echo "== check-in from device A (registers)"; curl -s -X POST $API/hr/attendance/check-in -H "$E" -H "$CT" -d '{"device_id":"306FD7C4-TEST","device_name":"iPhone 13"}' | J "d.get('status') or d"
echo "== check-out from DEV-x1 (403 + auto request)"; curl -s -X POST $API/hr/attendance/check-out -H "$E" -H "$CT" -d '{"device_id":"DEV-x1","device_name":"iPhone 13"}' | J "d['detail']"
echo "== pending requests (auto)"; curl -s "$API/hr/attendance/devices/requests?status=pending" -H "$A" | J "[(i['new_device_id'], i.get('source'), i.get('attempts')) for i in d['items'] if i['employee_id']=='$EID']"
echo "== check-out from DEV-x2 (403 pending msg, request updated to x2)"; curl -s -X POST $API/hr/attendance/check-out -H "$E" -H "$CT" -d '{"device_id":"DEV-x2"}' | J "d['detail']"
curl -s "$API/hr/attendance/devices/requests?status=pending" -H "$A" | J "[(i['new_device_id'], i.get('source'), i.get('attempts')) for i in d['items'] if i['employee_id']=='$EID']"
echo "== my device shows pending"; curl -s $API/hr/attendance/devices/my -H "$E" | J "d['pending_request']['status_label'], d['pending_request']['new_device_id']"
RID=$(curl -s "$API/hr/attendance/devices/requests?status=pending" -H "$A" | J "[i['id'] for i in d['items'] if i['employee_id']=='$EID'][0]")
echo "== approve → DEV-x2 active"; curl -s -X POST $API/hr/attendance/devices/requests/$RID/approve -H "$A" | J "d['message']"
echo "== check-out from DEV-x2 now OK"; curl -s -X POST $API/hr/attendance/check-out -H "$E" -H "$CT" -d '{"device_id":"DEV-x2"}' | J "d.get('check_out') or d"
echo "== HR notifications (auto request)"; curl -s "$API/notifications?limit=3" -H "$A" | J "[n['title'] for n in (d if isinstance(d,list) else d.get('notifications', d.get('items', [])))[:3]]"
