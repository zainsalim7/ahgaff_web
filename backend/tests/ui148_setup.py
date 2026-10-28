# Helper: setup/teardown/snapshot for iteration_148 UI retest of /permissions
import sys, json, requests
BASE = open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0].rstrip('/')
API = f"{BASE}/api"
tok = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()
tok = tok.get("access_token") or tok.get("token")
H = {"Authorization": f"Bearer {tok}"}
cmd = sys.argv[1]
users = requests.get(f"{API}/users", headers=H).json()
if cmd == "setup":
    r = requests.post(f"{API}/users", headers=H, json={"username": "TEST_ui148", "password": "test1234", "full_name": "TEST واجهة 148",
        "role": "dean", "role_id": "698c93119a944c07ac7f80c2", "faculty_id": "698e4f9297fef774e66e93a4"})
    print(r.status_code, r.text[:200])
    uid = r.json()["id"]
    print(requests.put(f"{API}/users/{uid}/custom-permissions", headers=H, json={"custom_permissions": ["manage_fee_receipts"]}).text)
elif cmd == "snap":
    for u in users:
        if u["username"] in ("Salim", "Saeed", "TEST_ui148"):
            print(json.dumps({k: u.get(k) for k in ("id", "username", "role", "role_id", "permissions", "custom_permissions")}, ensure_ascii=False))
elif cmd == "teardown":
    for u in users:
        if u["username"] == "TEST_ui148":
            print(requests.delete(f"{API}/users/{u['id']}", headers=H).status_code)
