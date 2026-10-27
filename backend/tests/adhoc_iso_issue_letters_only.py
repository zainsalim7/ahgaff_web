# Ad-hoc: custom user with ONLY issue_letters (no HR perms) + hr_scope Sharia — does it see Girls-faculty general letter?
import sys
sys.path.insert(0, "/app/backend/tests")
from test_unit_isolation_hr_scope import API, MDB, H, login, GIRLS_UNIT, SHARIA_UNIT, SUFFIX
import requests
from bson import ObjectId

admin, _ = login("admin", "admin123")
made, letters = [], []
snap = {str(s["_id"]): (s.get("counters") or {}, s.get("seq")) for s in MDB.letter_series.find({}, {"counters": 1, "seq": 1})}
try:
    def mk(key, perms, unit):
        un = f"TEST_iso_{key}_{SUFFIX}"
        r = requests.post(f"{API}/users", headers=H(admin), json={"username": un, "password": "test1234", "full_name": un, "role": "custom", "permissions": perms})
        uid = r.json()["id"]; made.append(uid)
        requests.put(f"{API}/hr/users/{uid}/scope", headers=H(admin), json={"hr_scope": "UNITS", "hr_scope_unit_ids": [unit]})
        return login(un, "test1234")[0]
    issuer = mk("a", ["issue_letters", "hr_manage_employees"], GIRLS_UNIT)
    secretary = mk("b", ["issue_letters"], SHARIA_UNIT)
    r = requests.post(f"{API}/letters/issue", headers=H(issuer), json={"subject": "TEST_ISO adhoc", "body": "x", "recipient": {"name": "TEST"}, "people": []})
    lid = r.json()["id"]; letters.append(lid)
    print("issue-letters-only user GET girls letter:", requests.get(f"{API}/letters/{lid}", headers=H(secretary)).status_code)
    al = requests.get(f"{API}/activity-logs/stats", headers=H(issuer))
    print("activity-logs/stats for scoped user (no view_activity_logs):", al.status_code)
finally:
    for l in letters:
        MDB.letters.delete_one({"_id": ObjectId(l)})
    for sid, (c, s) in snap.items():
        MDB.letter_series.update_one({"_id": ObjectId(sid)}, {"$set": {"counters": c, **({"seq": s} if s is not None else {})}})
    for u in made:
        requests.delete(f"{API}/users/{u}", headers=H(admin)); MDB.users.delete_one({"_id": ObjectId(u)}); MDB.activity_logs.delete_many({"user_id": u})
