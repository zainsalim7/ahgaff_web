# Probe: does a bogus teacher_id bypass view filter (teacher_id exception) for Salim?
import requests
B = open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0].rstrip('/') + "/api"
def lg(u, p):
    j = requests.post(f"{B}/auth/login", json={"username": u, "password": p}).json()
    return {"Authorization": f"Bearer {j.get('access_token') or j.get('token')}"}
s = lg("Salim", "test1234"); a = lg("admin", "admin123")
me = requests.get(f"{B}/auth/me", headers=s).json()
print("salim perms:", sorted(me.get("permissions", [])))
deps = requests.get(f"{B}/departments", headers=a).json()
deps = deps if isinstance(deps, list) else deps.get("items", [])
d = next(x for x in deps if x.get("faculty_id"))
f = d["faculty_id"]
for tid in ["zzz", " "]:
    for ep, p in [("weekly-schedule", {"faculty_id": f}), ("weekly-schedule/conflicts", {"faculty_id": f}),
                  ("weekly-schedule/export-visual/excel", {"faculty_id": f}),
                  ("weekly-schedule/valid-slots", {"faculty_id": f, "department_id": d["id"], "level": 1})]:
        r = requests.get(f"{B}/{ep}", params={**p, "teacher_id": tid}, headers=s)
        body = r.text
        print(repr(tid), ep, r.status_code, len(body), body[:120] if 'excel' not in ep else '')
ra = requests.get(f"{B}/weekly-schedule", params={"faculty_id": f}, headers=a)
print("admin full len", len(ra.text))
