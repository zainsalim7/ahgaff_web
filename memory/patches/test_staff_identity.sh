#!/bin/bash
# اختبار: تفرّد الرقم الوظيفي/الجوال عبر المعلمين والموظفين + ملف إداري تلقائي + بحث الموظفين
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)/api
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
TOK=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | J "d['access_token']")
A="Authorization: Bearer $TOK"; CT="Content-Type: application/json"
DEPT=698e501d97fef774e66e93a9
echo "== 0) sync existing teachers → employee files"; curl -s -X POST $API/hr/employees/sync-teachers -H "$A" | J "d['message']"
echo "== 1) create teacher T-UNQ-1 phone 777000111"
T1=$(curl -s -X POST $API/teachers -H "$A" -H "$CT" -d "{\"teacher_id\":\"T-UNQ-1\",\"full_name\":\"معلم تفرّد\",\"department_id\":\"$DEPT\",\"phone\":\"777000111\",\"email\":\"\"}")
TID=$(echo "$T1" | J "d.get('id') or d"); echo "teacher id: $TID"
echo "-- auto employee file:"; curl -s "$API/hr/employees?search=T-UNQ-1" -H "$A" | J "[(e['employee_no'],e['category'],e['teacher_id']==\"$TID\") for e in d['employees']]"
echo "== 2) teacher with same phone (spaces) → 400"; curl -s -X POST $API/teachers -H "$A" -H "$CT" -d "{\"teacher_id\":\"T-UNQ-2\",\"full_name\":\"آخر\",\"department_id\":\"$DEPT\",\"phone\":\"777 000 111\"}" | J "d['detail']"
echo "== 3) employee with teacher's job number → 400"; curl -s -X POST $API/hr/employees -H "$A" -H "$CT" -d '{"employee_no":"T-UNQ-1","full_name":"موظف","phone":""}' | J "d['detail']"
echo "== 4) employee with teacher's phone → 400"; curl -s -X POST $API/hr/employees -H "$A" -H "$CT" -d '{"employee_no":"E-UNQ-9","full_name":"موظف","phone":"777-000-111"}' | J "d['detail']"
echo "== 5) employee E-UNQ-9 phone 777000222 OK"; E9=$(curl -s -X POST $API/hr/employees -H "$A" -H "$CT" -d '{"employee_no":"E-UNQ-9","full_name":"موظف تفرّد","phone":"777000222","job_title":"محاسب"}' | J "d.get('id') or d"); echo "emp id: $E9"
echo "== 6) teacher update to employee's phone → 400"; curl -s -X PUT $API/teachers/$TID -H "$A" -H "$CT" -d '{"phone":"777000222"}' | J "d['detail']"
echo "== 7) teacher update phone+name → syncs to employee file"; curl -s -X PUT $API/teachers/$TID -H "$A" -H "$CT" -d '{"phone":"777000333","full_name":"معلم تفرّد المعدّل"}' >/dev/null
curl -s "$API/hr/employees?search=T-UNQ-1" -H "$A" | J "[(e['full_name'],e['phone']) for e in d['employees']]"
echo "== 8) editing teacher's OWN employee file keeping same no/phone → OK"
EMP=$(curl -s "$API/hr/employees?search=T-UNQ-1" -H "$A" | J "d['employees'][0]['id']")
curl -s -X PUT $API/hr/employees/$EMP -H "$A" -H "$CT" -d "{\"employee_no\":\"T-UNQ-1\",\"full_name\":\"معلم تفرّد المعدّل\",\"phone\":\"777000333\",\"category\":\"academic\",\"teacher_id\":\"$TID\",\"job_title\":\"أستاذ\"}" | J "d['message']"
echo "== 9) global search employees"; curl -s "$API/search?q=تفرد&types=employees,teachers" -H "$A" | J "{k:[i['title'] for i in v] for k,v in d['results'].items()}"
echo "== cleanup"; curl -s -X DELETE "$API/hr/employees/$E9" -H "$A" >/dev/null; curl -s -X DELETE "$API/hr/employees/$EMP?force=true" -H "$A" >/dev/null; curl -s -X DELETE "$API/teachers/$TID" -H "$A" | J "d.get('message', d)"
