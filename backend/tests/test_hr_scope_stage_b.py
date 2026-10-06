"""اختبار نطاق HR (المرحلة ب): مهام/مستندات/تقارير/تنبيهات/تقييمات/خطابات — Salim (UNITS) مقابل admin"""
import os
import sys
import json
import urllib.request

API = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL")][0]


def call(method, path, token=None, body=None):
    req = urllib.request.Request(f"{API}/api{path}", method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) hr-scope-test")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except ValueError:
            return e.code, {"detail": raw.decode(errors="ignore")[:200]}


def login(u, p):
    s, d = call("POST", "/auth/login", body={"username": u, "password": p})
    assert s == 200, d
    return d.get("access_token") or d.get("token")


def main():
    admin = login("admin", "admin123")
    dean = login("Salim", "test1234")
    _, scope = call("GET", "/hr/my-scope", dean)
    print("dean scope:", scope["label"], "| units:", len(scope["unit_ids"] or []))
    allowed = set(scope["unit_ids"] or [])
    _, emps_admin = call("GET", "/hr/employees?per_page=200", admin)
    all_emps = emps_admin["employees"]
    inside = [e for e in all_emps if e.get("org_unit_id") in allowed]
    outside = [e for e in all_emps if e.get("org_unit_id") not in allowed]
    print(f"employees: total={len(all_emps)} inside={len(inside)} outside={len(outside)}")
    assert inside and outside, "need both inside and outside employees to test"
    out_id, in_id = outside[0]["id"], inside[0]["id"]
    ok = True

    def check(name, cond, detail=""):
        nonlocal ok
        print(("✅" if cond else "❌"), name, detail)
        ok = ok and cond

    # 1) tasks assignable
    _, a = call("GET", "/hr/tasks/assignable", dean)
    ids = {e["id"] for e in a["employees"]}
    check("tasks/assignable scoped", a["scope"] == "all" and out_id not in ids and in_id in ids, f"{len(ids)} emps")
    # 2) tasks list all (admin creates task for outside employee; dean must not see it)
    s, t = call("POST", "/hr/tasks", admin, {"title": "مهمة خارج النطاق (اختبار)", "assignee_employee_id": out_id})
    tid = t.get("id")
    _, lst = call("GET", "/hr/tasks?view=all&per_page=200", dean)
    check("tasks list all excludes outside", all(x["assignee_employee_id"] != out_id for x in lst["items"]), f"{lst['total']} items")
    s, _ = call("GET", f"/hr/tasks/{tid}", dean)
    check("tasks get outside → 403", s == 403, str(s))
    s, d = call("POST", "/hr/tasks", dean, {"title": "x", "assignee_employee_id": out_id})
    check("tasks create outside → 403", s == 403, d.get("detail", ""))
    s, _ = call("POST", "/hr/tasks", dean, {"title": "مهمة داخل النطاق (اختبار)", "assignee_employee_id": in_id})
    check("tasks create inside → 200", s == 200, str(s))
    if tid:
        call("DELETE", f"/hr/tasks/{tid}", admin)
    # 3) documents
    s, _ = call("GET", f"/hr/documents/{out_id}", dean)
    check("documents list outside → 403", s == 403, str(s))
    s, _ = call("GET", f"/hr/documents/{in_id}", dean)
    check("documents list inside → 200", s == 200, str(s))
    _, ex = call("GET", "/hr/documents/expiring?days=3650", dean)
    check("documents expiring scoped", all(x["employee_id"] != out_id for x in ex["items"]), f"{len(ex['items'])} items")
    # 4) reports
    _, r = call("GET", "/hr/reports/annual", dean)
    check("reports annual scoped", r["workforce"]["total"] == len(inside) and r["unit_name"] == "نطاق صلاحيتي", f"total={r['workforce']['total']}")
    s, _ = call("GET", f"/hr/reports/annual?org_unit_id={outside[0]['org_unit_id']}", dean)
    check("reports outside unit → 403", s == 403, str(s))
    _, ra = call("GET", "/hr/reports/annual", admin)
    check("admin reports unscoped", ra["workforce"]["total"] == len(all_emps), f"total={ra['workforce']['total']}")
    # 5) alerts summary
    _, al = call("GET", "/hr/alerts/summary", dean)
    check("alerts summary scoped", al["employees_active"] <= len(inside), f"active={al['employees_active']}")
    # 6) appraisals
    _, ov = call("GET", "/hr/appraisals/overview?view=all", dean)
    check("appraisals overview scoped", all(x["employee_id"] != out_id for x in ov["rows"]), f"{len(ov['rows'])} rows")
    s, d = call("GET", f"/hr/appraisals/metrics/{out_id}", dean)
    check("appraisals metrics outside → 403", s == 403, str(s))
    # 7) letters
    s, d = call("POST", "/hr/letters", dean, {"employee_id": out_id, "type": "employment", "language": "ar", "addressed_to": "", "purpose": ""})
    check("letters issue outside → 403", s == 403, d.get("detail", ""))
    _, ll = call("GET", "/hr/letters", dean)
    check("letters list scoped", all(x["employee_id"] != out_id for x in ll["items"]), f"{len(ll['items'])} items")
    # admin unaffected
    _, aa = call("GET", "/hr/tasks/assignable", admin)
    check("admin assignable all", out_id in {e["id"] for e in aa["employees"]})
    print("\nRESULT:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
