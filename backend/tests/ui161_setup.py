# UI setup/cleanup for iter161 (python ui161_setup.py setup|cleanup)
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
import test_real_enforce_guard_or_iter161 as t

STATE = "/tmp/ui161_state.json"
admin = t._login("admin", "admin123")[1]
DEPT_A = "698e500997fef774e66e93a8"
FAC_A = "698e4f9297fef774e66e93a4"
EXTRA = ["academic_structure_ser_get_faculties", "academic_structure_ser_get_departments",
         "schedule_weekly_schedule_get_schedule_settings", "teachers_ser_get_teachers"]

if sys.argv[1] == "setup":
    t.KEYS = list(dict.fromkeys(t.KEYS + EXTRA))
    try:
        t._make_user(admin, "TEST_uidept161", {"scope_type": "department", "scope_ref_ids": [DEPT_A]})
        t._make_user(admin, "TEST_uifac161", {"scope_type": "faculty", "scope_ref_ids": [FAC_A]})
    except AssertionError as e:
        print("setup err", e)
    json.dump(t.CREATED, open(STATE, "w"))
    for un in ["TEST_uidept161", "TEST_uifac161"]:
        d, _ = t._login(un, un)
        u = d.get("user") or {}
        print(un, {k: u.get(k) for k in ["advanced_access_real_enforcement", "department_ids", "faculty_ids", "department_id", "faculty_id", "role"]})
else:
    c = json.load(open(STATE))
    for aid in c["assignments"]:
        print("end", t.requests.post(f"{t.API}/advanced-access/assignments/{aid}/end", headers=admin, json={}).status_code)
    for uid in c["users"]:
        print("del", t.requests.delete(f"{t.API}/users/{uid}", headers=admin).status_code)
