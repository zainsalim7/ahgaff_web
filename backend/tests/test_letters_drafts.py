"""اختبار الخطابات: تخطيط + أعمدة الجدول + المسودات (حفظ/تحديث/PDF/اعتماد/حذف)"""
import json
import sys
import urllib.request

API = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL")][0]
STUDENT, EMP = "698e57518cfb2f14627a285e", "6ab3ec880186d4c5e32749af"


def call(method, path, token=None, body=None, raw=False):
    req = urllib.request.Request(f"{API}/api{path}", method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json"); req.add_header("User-Agent", "Mozilla/5.0 letters-test")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as r:
            data = r.read()
            return r.status, (data if raw else json.loads(data or b"{}")), r.headers.get("content-type", "")
    except urllib.error.HTTPError as e:
        raw_b = e.read()
        try:
            return e.code, json.loads(raw_b or b"{}"), ""
        except ValueError:
            return e.code, {"detail": raw_b[:200]}, ""


ok = True


def check(name, cond, detail=""):
    global ok
    print(("✅" if cond else "❌"), name, detail)
    ok = ok and cond


def main():
    s, d, _ = call("POST", "/auth/login", body={"username": "admin", "password": "admin123"})
    tok = d["access_token"]
    s, defaults, _ = call("GET", "/letters/layout-defaults", tok)
    check("layout-defaults", s == 200 and "gap_subject" in defaults, str(list(defaults)[:4]))
    before = call("GET", "/letters?status=issued&limit=1", tok)[1]
    payload = {"subject": "اختبار المسودات", "body": "<p style=\"text-align: right\"><strong>نص منسّق</strong> {قائمة_الأسماء}</p><p>{جدول_الأسماء}</p>",
               "recipient": {"title": "عميد الكلية", "name": "د. اختبار", "suffix": "المحترم"},
               "people": [{"kind": "student", "id": STUDENT}, {"kind": "employee", "id": EMP}],
               "layout": {"gap_subject": 4, "table_font": 9, "table_columns": ["م", "الاسم", "الصفة"], "header_bottom": 36}}
    # preview with layout
    s, png, ct = call("POST", "/letters/preview-pdf?fmt=png", tok, payload, raw=True)
    check("preview png with layout", s == 200 and ct.startswith("image/png") and len(png) > 10000, f"{len(png)} bytes")
    # draft
    s, dr, _ = call("POST", "/letters/draft", tok, payload)
    check("save draft", s == 200 and dr.get("status") == "draft" and dr["number"].startswith("م-"), dr.get("number"))
    did = dr["id"]
    s, dr2, _ = call("POST", "/letters/draft", tok, {**payload, "subject": "اختبار المسودات (محدث)", "draft_id": did})
    check("update draft keeps id/number", s == 200 and dr2["id"] == did and dr2["number"] == dr["number"])
    s, full, _ = call("GET", f"/letters/{did}", tok)
    check("get draft full", s == 200 and full["subject"].endswith("(محدث)") and full["inputs"]["body"] == payload["body"] and full["layout"]["table_font"] == 9)
    s, pdf, ct = call("GET", f"/letters/{did}/pdf", tok, raw=True)
    check("draft pdf", s == 200 and ct.startswith("application/pdf") and len(pdf) > 5000, f"{len(pdf)} bytes")
    s, lst, _ = call("GET", "/letters?status=draft", tok)
    check("list drafts", s == 200 and any(x["id"] == did and x["status"] == "draft" for x in lst))
    # finalize
    s, fin, _ = call("POST", f"/letters/{did}/finalize?base_url=https://x.test", tok)
    check("finalize", s == 200 and fin["id"] == did and not fin["number"].startswith("م-") and fin.get("token"), fin.get("number"))
    s, full2, _ = call("GET", f"/letters/{did}", tok)
    check("finalized doc", full2["status"] == "issued" and full2["draft_number"] == dr["number"] and full2["verify_token"] == fin["token"] and (full2["table"] or {}).get("headers"))
    s, v, _ = call("GET", f"/verify/letter/{fin['token']}")
    check("verify issued", s == 200 and v["valid"] is True, v.get("number"))
    s, _, _ = call("POST", f"/letters/{did}/finalize", tok)
    check("re-finalize → 400", s == 400)
    s, _, _ = call("DELETE", f"/letters/{did}", tok)
    check("delete issued → 400", s == 400)
    # delete a fresh draft
    s, dr3, _ = call("POST", "/letters/draft", tok, {**payload, "subject": "للحذف"})
    s, _, _ = call("DELETE", f"/letters/{dr3['id']}", tok)
    check("delete draft", s == 200)
    s, _, _ = call("GET", f"/letters/{dr3['id']}", tok)
    check("deleted gone", s == 404)
    # settings layout persisted
    s, st, _ = call("GET", "/letters/settings", tok)
    s, _, _ = call("PUT", "/letters/settings", tok, {**{k: v for k, v in st.items() if k != "variables"}, "layout": {"gap_signature": 12}})
    s, st2, _ = call("GET", "/letters/settings", tok)
    check("settings layout saved", (st2.get("layout") or {}).get("gap_signature") == 12)
    call("PUT", "/letters/settings", tok, {**{k: v for k, v in st.items() if k != "variables"}, "layout": st.get("layout")})
    # regression: direct issue
    s, iss, _ = call("POST", "/letters/issue", tok, {**payload, "subject": "إصدار مباشر"})
    check("direct issue", s == 200 and iss.get("token"), iss.get("number"))
    call("POST", f"/letters/{iss['id']}/revoke", tok)
    print("\nRESULT:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
