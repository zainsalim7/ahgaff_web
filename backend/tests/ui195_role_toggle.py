# Helper: grant/revert view_schedule on role 'رئيس قسم' for UI test (iteration 195)
import sys, json, requests
B = "https://schedule-hub-272.preview.emergentagent.com/api"
RID = "698c93119a944c07ac7f80c3"
t = requests.post(f"{B}/auth/login", json={"username": "admin", "password": "admin123"}).json()
h = {"Authorization": f"Bearer {t.get('access_token') or t.get('token')}"}
perms = requests.get(f"{B}/roles/{RID}", headers=h).json()["permissions"]
if sys.argv[1] == "grant":
    json.dump(perms, open("/tmp/role195_orig.json", "w"))
    r = requests.put(f"{B}/roles/{RID}", json={"permissions": perms + ["view_schedule"]}, headers=h)
else:
    orig = json.load(open("/tmp/role195_orig.json"))
    r = requests.put(f"{B}/roles/{RID}", json={"permissions": orig}, headers=h)
    after = requests.get(f"{B}/roles/{RID}", headers=h).json()["permissions"]
    print("restored equal:", sorted(after) == sorted(orig))
print(sys.argv[1], r.status_code)
