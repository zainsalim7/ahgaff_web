# Probe script for Advanced Access phase 4 UI testing (data discovery)
import os, requests, json
BASE = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') + '/api'

def login(u, p):
    r = requests.post(f"{BASE}/auth/login", json={"username": u, "password": p})
    r.raise_for_status()
    return r.json().get('access_token') or r.json().get('token')

t = login('admin', 'admin123')
H = {"Authorization": f"Bearer {t}"}
users = requests.get(f"{BASE}/advanced-access/users", headers=H).json()
for u in users:
    if u.get('username') in ('Saeed', 'Salim', 'teacher180156', 'admin'):
        print('USER', u)
print('users count', len(users))
roles = requests.get(f"{BASE}/advanced-access/roles", headers=H).json()
print('roles', len(roles), [(r['id'], r['name_ar'], r['status'], len(r.get('permission_keys', []))) for r in roles if 'TEST' in r['name_ar']])
for st in ('faculty', 'unit'):
    o = requests.get(f"{BASE}/advanced-access/scope-options/{st}", headers=H).json()
    print(st, len(o), o[:4])
print('testers', requests.get(f"{BASE}/advanced-access/testers", headers=H).json())
a = requests.get(f"{BASE}/advanced-access/assignments", headers=H).json()
print('assignments', len(a), [(x['id'], x['context_label_ar'], x.get('user_name'), x['status']) for x in a if x['status'] == 'active'])
print('groups', [(g['key'], g['name_ar']) for g in requests.get(f"{BASE}/advanced-access/permission-groups", headers=H).json()][:6])
