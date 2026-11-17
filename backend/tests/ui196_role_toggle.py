# Helper: grant perms / revert role 'رئيس قسم' for UI test (iteration 196). usage: grant view_schedule [manage_schedule] | revert
import sys, json, os, requests
B = open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0].rstrip('/') + "/api"
RID = "698c93119a944c07ac7f80c3"
t = requests.post(f"{B}/auth/login", json={"username": "admin", "password": "admin123"}).json()
h = {"Authorization": f"Bearer {t.get('access_token') or t.get('token')}"}
perms = requests.get(f"{B}/roles/{RID}", headers=h).json()["permissions"]
F = "/tmp/role196_orig.json"
if sys.argv[1] == "grant":
    if not os.path.exists(F):
        json.dump(perms, open(F, "w"))
    orig = json.load(open(F))
    r = requests.put(f"{B}/roles/{RID}", json={"permissions": orig + sys.argv[2:]}, headers=h)
else:
    orig = json.load(open(F))
    r = requests.put(f"{B}/roles/{RID}", json={"permissions": orig}, headers=h)
    after = requests.get(f"{B}/roles/{RID}", headers=h).json()["permissions"]
    print("restored equal:", sorted(after) == sorted(orig))
    os.remove(F)
print(sys.argv[1:], r.status_code)
s = requests.post(f"{B}/auth/login", json={"username": "Saeed", "password": "test1234"}).json()
sh = {"Authorization": f"Bearer {s.get('access_token') or s.get('token')}"}
me = requests.get(f"{B}/auth/me", headers=sh).json()
print("Saeed has view_schedule:", "view_schedule" in me.get("permissions", []), "manage_schedule:", "manage_schedule" in me.get("permissions", []))
print("drafts:", requests.get(f"{B}/weekly-schedule/drafts", headers=sh).status_code)
fac = me.get("faculty_id")
print("faculty", fac, "dept", me.get("department_id"))
print("master-view:", requests.get(f"{B}/weekly-schedule/master-view", params={"faculty_id": fac}, headers=sh).json().get("can_manage", "n/a") if fac else "no fac")
