import os, sys, requests, json
BASE = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') + '/api'
s = requests.Session()
s.headers['Authorization'] = 'Bearer ' + s.post(f"{BASE}/auth/login", json={"username": "admin", "password": "admin123"}).json()['access_token']
TID = sys.argv[1]
t = s.get(f"{BASE}/teachers/{TID}").json()
print(json.dumps({k: t.get(k) for k in ['teacher_id','full_name','email','specialization','academic_title','weekly_hours','department_ids','user_id','is_active']}, ensure_ascii=False))
if len(sys.argv) > 2 and sys.argv[2] == 'activate':
    r = s.post(f"{BASE}/teachers/{TID}/activate"); print('activate', r.status_code, r.text[:150])
if len(sys.argv) > 2 and sys.argv[2] == 'fraction':
    r = s.put(f"{BASE}/teachers/{TID}", json={"weekly_hours": 12.5}); print('put 12.5', r.status_code, r.text[:200])
