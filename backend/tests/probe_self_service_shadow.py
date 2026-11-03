# Probe: are SELF_SERVICE_EXCLUDE_KEYS paths shadowed by parametrized guarded routes (enforcement user)?
import json, sys, requests, re
sys.path.insert(0, "/app/backend/backend")
from routes.real_enforcement_guard import SELF_SERVICE_EXCLUDE_KEYS as S
BASE = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL=")][0]
tok = requests.post(f"{BASE}/api/auth/login", json={"username": "layer2_test_emp", "password": "test1234"}).json()["access_token"]
h = {"Authorization": f"Bearer {tok}"}
m = json.load(open("/app/backend/backend/tools/generated/advanced_permissions.json"))
for p in m:
    if p["key"] not in S:
        continue
    path = p.get("linked_api_path") or ""
    path = re.sub(r"\{[^}]+\}", "x", path)
    if not path.startswith("/api"):
        path = "/api" + path
    meth = p["linked_api_method"]
    if meth != "GET":
        r = requests.request(meth, BASE + path, headers=h, json={}, timeout=30)
    else:
        r = requests.get(BASE + path, headers=h, timeout=30)
    guard = "غير مصرح لك بهذا الإجراء" in r.text and r.status_code == 403
    print(("GUARD-BLOCKED " if guard else "ok            "), meth, path, r.status_code)
