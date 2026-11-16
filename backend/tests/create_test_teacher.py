import os, requests, random, json
BASE = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') + '/api'
s = requests.Session()
tok = s.post(f"{BASE}/auth/login", json={"username": "admin", "password": "admin123"}).json()['access_token']
s.headers['Authorization'] = f'Bearer {tok}'
tid = f"TEST_T{random.randint(10000,99999)}"
r = s.post(f"{BASE}/teachers", json={"teacher_id": tid, "full_name": f"TEST_معلم {tid}", "department_ids": ["698e501d97fef774e66e93a9"], "phone": f"7{random.randint(10000000,99999999)}"})
print(r.status_code, r.text[:300])
t = r.json()
a = s.post(f"{BASE}/teachers/{t['id']}/activate")
print('activate', a.status_code, a.text[:200])
print(json.dumps({"id": t['id'], "teacher_id": tid}))
