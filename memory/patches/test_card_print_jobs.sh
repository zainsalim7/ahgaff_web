#!/bin/bash
# اختبار: مهمة طباعة البطاقات المرحلية + حذف/إرجاع الدفعات + خلفية مخصّصة لكل كلية
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)/api
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
TOK=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | J "d['access_token']")
A="Authorization: Bearer $TOK"; CT="Content-Type: application/json"
DEPT=$(curl -s "$API/departments" -H "$A" | J "[d0 for d0 in (d if isinstance(d,list) else d['departments']) if d0.get('name')][0]['id']")
FAC=$(curl -s "$API/departments" -H "$A" | J "[d0 for d0 in (d if isinstance(d,list) else d['departments']) if d0['id']=='$DEPT'][0]['faculty_id']")
echo "dept=$DEPT fac=$FAC"
echo "== preview"; curl -s -X POST $API/cards/batch-preview -H "$A" -H "$CT" -d "{\"department_id\":\"$DEPT\",\"exclude_printed\":false}" | J "d['summary']"
echo "== create job"; JOB=$(curl -s -X POST $API/cards/print-jobs -H "$A" -H "$CT" -d "{\"department_id\":\"$DEPT\",\"exclude_printed\":false,\"orientation\":\"auto\",\"base_url\":\"https://x\"}"); echo "$JOB"
JID=$(echo "$JOB" | J "d['job_id']")
for i in $(seq 1 60); do R=$(curl -s -X POST $API/cards/print-jobs/$JID/step -H "$A"); S=$(echo "$R" | J "d['status']"); echo "step $i: $R"; [ "$S" = "ready" ] && break; done
BN=$(echo "$R" | J "d['batch_no']")
echo "== download"; curl -s -o /tmp/cards.pdf -w "%{http_code} %{size_download} bytes\n" -D /tmp/h.txt $API/cards/print-jobs/$JID/download -H "$A"; grep -i "x-batch\|content-disposition" /tmp/h.txt | head -3; python3 -c "
import pypdf,sys
r=pypdf.PdfReader('/tmp/cards.pdf'); print('pages:',len(r.pages))" 2>/dev/null || file /tmp/cards.pdf
echo "== batches list"; curl -s $API/cards/batches -H "$A" | J "[(b['batch_no'],b['count']) for b in d['items']][:3]"
echo "== preview after (printed excluded)"; curl -s -X POST $API/cards/batch-preview -H "$A" -H "$CT" -d "{\"department_id\":\"$DEPT\",\"exclude_printed\":true}" | J "d['summary']"
echo "== delete batch $BN with restore"; curl -s -X DELETE "$API/cards/batches/$BN?restore=true" -H "$A" | J "d['message']"
echo "== preview after restore"; curl -s -X POST $API/cards/batch-preview -H "$A" -H "$CT" -d "{\"department_id\":\"$DEPT\",\"exclude_printed\":true}" | J "d['summary']"
echo "== back settings global vs faculty"; curl -s "$API/cards/back-settings?faculty_id=$FAC" -H "$A" | J "(d['title'], d['faculty_override'], d['can_edit_faculty'])"
curl -s -X PUT "$API/cards/back-settings?faculty_id=$FAC" -H "$A" -H "$CT" -d '{"enabled":true,"title":"تعليمات بطاقة كلية الاختبار","lines":["بند خاص بالكلية 1","بند خاص بالكلية 2"],"footer_note":"عمادة الكلية","show_contact":true}' | J "(d['message'], d['faculty_override'], d['title'])"
curl -s "$API/cards/back-settings" -H "$A" | J "('global still:', d['title'], d['faculty_override'])"
curl -s -o /tmp/back.png -w "preview faculty back: %{http_code} %{size_download}\n" "$API/cards/back-preview/$FAC" -H "$A"
curl -s -X DELETE "$API/cards/back-settings?faculty_id=$FAC" -H "$A" | J "(d['message'], d['faculty_override'])"
echo "== clear batches (admin)"; curl -s -X DELETE "$API/cards/batches" -H "$A" | J "d['message']"
