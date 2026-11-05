# UI setup/cleanup for iter162 (python ui162_setup.py setup|cleanup) — dept-scoped real-enforcement user
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
import test_real_enforce_exclusive_iter162 as t

STATE = "/tmp/ui162_state.json"
admin = t._login("admin", "admin123")[1]
EXTRA = ["reports_ser_get_teacher_workload_report", "schedule_weekly_schedule_get_rooms",
         "courses_ser_get_courses", "teaching_load_overtime_letter_raised_teachers", "teaching_load_teacher_overtime_get_workload_exceptions", "schedule_weekly_schedule_get_schedule_conflicts", "schedule_weekly_schedule_get_schedule_sections"]

if sys.argv[1] == "setup":
    t.KEYS = list(dict.fromkeys(t.KEYS + EXTRA))
    try:
        t._make_user(admin, "TEST_uidept162", {"scope_type": "department", "scope_ref_ids": [t.DEPT_A]})
    except AssertionError as e:
        print("setup err", e)
    json.dump(t.CREATED, open(STATE, "w"))
    d, _ = t._login("TEST_uidept162", "TEST_uidept162")
    u = d.get("user") or {}
    print({k: u.get(k) for k in ["advanced_access_real_enforcement", "department_ids", "faculty_ids", "role"]})
else:
    c = json.load(open(STATE))
    for aid in c["assignments"]:
        print("end", t.requests.post(f"{t.API}/advanced-access/assignments/{aid}/end", headers=admin, json={}).status_code)
    for uid in c["users"]:
        print("del", t.requests.delete(f"{t.API}/users/{uid}", headers=admin).status_code)
