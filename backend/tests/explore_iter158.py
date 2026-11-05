import os, requests
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
t = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()
h = {"Authorization": f"Bearer {t.get('token') or t.get('access_token')}"}
facs = requests.get(f"{API}/faculties", headers=h).json()
depts = requests.get(f"{API}/departments", headers=h).json()
teachers = requests.get(f"{API}/teachers", headers=h).json()
print("teachers total", len(teachers))
for f in facs:
    fid = f["id"]
    s = requests.get(f"{API}/students", params={"faculty_id": fid}, headers=h)
    sj = s.json()
    n = len(sj) if isinstance(sj, list) else (sj.get("total") or len(sj.get("items") or sj.get("students") or []))
    fd = [d["id"] for d in depts if d.get("faculty_id") == fid]
    nt = len([x for x in teachers if x.get("department_id") in fd])
    tf = requests.get(f"{API}/teachers", params={"faculty_id": fid}, headers=h)
    print(fid, f.get("name"), "depts", len(fd), "students", n, "teachers(dept)", nt, "admin /teachers?faculty_id", tf.status_code, len(tf.json()) if tf.ok else tf.text[:80])
print(type(sj), list(sj.keys())[:10] if isinstance(sj, dict) else "")
