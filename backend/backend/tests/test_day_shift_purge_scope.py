"""اختبار منع تجاوز النطاق في إزاحة اليوم الدراسي ومسح المحاضرات (الثغرة المُبلَّغ عنها)."""
import os, re, requests

env = open(os.path.join(os.path.dirname(__file__), '..', '.env')).read()
# استخدام المنفذ المحلي مباشرة (الاختبار من داخل الحاوية)
BASE = "http://localhost:8001/api"

def login(username, password):
    r = requests.post(f"{BASE}/auth/login", json={"username": username, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]

admin_tok = login("admin", "admin123")
salim_tok = login("Salim", "test1234")   # dean — faculty_id=698e4f9297fef774e66e93a4
saeed_tok = login("Saeed", "test1234")   # department_head — dept_id=698e501d97fef774e66e93a9

SALIM_FACULTY = "698e4f9297fef774e66e93a4"
SAEED_DEPT = "698e501d97fef774e66e93a9"

def h(tok):
    return {"Authorization": f"Bearer {tok}"}

results = []

def check(name, cond):
    results.append((name, cond))
    print(("✅ نجح" if cond else "❌ فشل"), "|", name)

# 1) عميد (Salim) يحاول إزاحة «كل الجامعة» (faculty_id=None) → يجب رفض 403
r = requests.post(f"{BASE}/day-shift/preview", headers=h(salim_tok), json={
    "date_from": "2026-11-10", "faculty_id": None, "new_start_time": "10:00",
})
check("عميد يحاول إزاحة كل الجامعة → 403", r.status_code == 403)

# 2) عميد (Salim) يحاول إزاحة كلية أخرى (ليست كليته) → يجب رفض 403
other_fac = requests.get(f"{BASE}/faculties", headers=h(admin_tok)).json()
other_fac_id = next((f["id"] for f in other_fac if f["id"] != SALIM_FACULTY), None)
if other_fac_id:
    r = requests.post(f"{BASE}/day-shift/preview", headers=h(salim_tok), json={
        "date_from": "2026-11-10", "faculty_id": other_fac_id, "new_start_time": "10:00",
    })
    check("عميد يحاول إزاحة كلية أخرى → 403", r.status_code == 403)

# 3) عميد (Salim) يُزيح كليته الخاصة → يجب قبول (200)
r = requests.post(f"{BASE}/day-shift/preview", headers=h(salim_tok), json={
    "date_from": "2026-11-10", "faculty_id": SALIM_FACULTY, "new_start_time": "10:00",
})
check("عميد يُزيح كليته الخاصة → 200", r.status_code == 200)

# 4) أدمن يختار «كل الجامعة» → يجب قبول (200) — لم يتأثر الأدمن
r = requests.post(f"{BASE}/day-shift/preview", headers=h(admin_tok), json={
    "date_from": "2026-11-10", "faculty_id": None, "new_start_time": "10:00",
})
check("أدمن يختار كل الجامعة → 200 (غير متأثر)", r.status_code == 200)

# 5) مسح المحاضرات: رئيس قسم (Saeed) يحاول مسح كلية كاملة خارج نطاقه → 403
r = requests.post(f"{BASE}/lectures/purge/preview", headers=h(saeed_tok), json={
    "scope": "faculty", "faculty_id": SALIM_FACULTY,
})
check("رئيس قسم يحاول مسح كلية (نطاق أوسع من قسمه) → 403", r.status_code == 403)

# 6) مسح المحاضرات: رئيس قسم (Saeed) يحاول مسح قسم آخر (ليس قسمه) → 403
other_dept = requests.get(f"{BASE}/departments", headers=h(admin_tok)).json()
other_dept_id = next((d["id"] for d in other_dept if d["id"] != SAEED_DEPT), None)
if other_dept_id:
    r = requests.post(f"{BASE}/lectures/purge/preview", headers=h(saeed_tok), json={
        "scope": "department", "department_id": other_dept_id,
    })
    check("رئيس قسم يحاول مسح قسم آخر → 403", r.status_code == 403)

# 7) مسح المحاضرات: رئيس قسم (Saeed) يمسح قسمه الخاص → 200
r = requests.post(f"{BASE}/lectures/purge/preview", headers=h(saeed_tok), json={
    "scope": "department", "department_id": SAEED_DEPT,
})
check("رئيس قسم يُعاين مسح قسمه الخاص → 200", r.status_code == 200)

# 8) أدمن يمسح كلية كاملة → 200 (غير متأثر)
r = requests.post(f"{BASE}/lectures/purge/preview", headers=h(admin_tok), json={
    "scope": "faculty", "faculty_id": SALIM_FACULTY,
})
check("أدمن يُعاين مسح كلية → 200 (غير متأثر)", r.status_code == 200)

ok = all(c for _, c in results)
print("\nالنتيجة النهائية:", "كل الاختبارات نجحت ✅" if ok else "هناك اختبارات فاشلة ❌")
