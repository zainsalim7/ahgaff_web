# UI setup/cleanup for iter163 (python ui163_setup.py setup|cleanup)
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
import test_dashboard_scope_iter163 as t
STATE = "/tmp/ui163_state.json"
admin = t._login("admin", "admin123")[1]
if sys.argv[1] == "setup":
    t._make_user(admin, "TEST_uihr163", ["hr_core_hr_my_scope"], {"scope_type": "faculty", "scope_ref_ids": [t.FAC_A]})
    t._make_user(admin, "TEST_uidash163", ["dashboard_management_dashboard_management_dashboard_hr"], {"scope_type": "department", "scope_ref_ids": [t.DEPT_A]})
    json.dump(t.CREATED, open(STATE, "w")); print(t.CREATED)
else:
    c = json.load(open(STATE))
    for aid in c["assignments"]:
        print("end", t.requests.post(f"{t.API}/advanced-access/assignments/{aid}/end", headers=admin, json={}).status_code)
    for uid in c["users"]:
        print("del", t.requests.delete(f"{t.API}/users/{uid}", headers=admin).status_code)
