import os, requests, json
BASE = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') + '/api'
s = requests.Session()
r = s.post(f"{BASE}/auth/login", json={"username": "admin", "password": "admin123"})
tok = r.json().get('access_token') or r.json().get('token')
s.headers['Authorization'] = f'Bearer {tok}'
TID = '698e533beb4c6eb021c50302'
t = s.get(f"{BASE}/teachers/{TID}").json()
print('teacher', {k: t.get(k) for k in ['teacher_id', 'full_name', 'user_id', 'is_active', 'weekly_hours', 'department_ids']})
c = s.get(f"{BASE}/teachers/{TID}/courses").json()
print('courses keys', list(c.keys()), 'total_weekly_hours', c.get('total_weekly_hours'), len(c.get('courses', [])))
w = s.get(f"{BASE}/reports/teacher-workload", params={"teacher_id": TID})
print('workload', w.status_code, type(w.json()).__name__, json.dumps(w.json(), ensure_ascii=False)[:700])
ws = s.get(f"{BASE}/weekly-schedule", params={"teacher_id": TID})
j = ws.json()
print('weekly', ws.status_code, type(j).__name__, json.dumps(j, ensure_ascii=False)[:500])
b = s.get(f"{BASE}/teachers/{TID}/backup-info")
print('backup', b.status_code, json.dumps(b.json(), ensure_ascii=False)[:400])
for path in ['/export/report/teacher-workload/excel', '/export/report/teacher-workload/pdf', '/weekly-schedule/export-visual/excel', '/weekly-schedule/export-visual/pdf']:
    e = s.get(f"{BASE}{path}", params={"teacher_id": TID})
    print(path, e.status_code, e.headers.get('content-type'), len(e.content))
t0 = w.json()['teachers'][0]
print('t0 keys', list(t0.keys()))
print('summary', t0.get('summary'))
print('course0 keys', list(t0['courses'][0].keys()) if t0.get('courses') else None)
