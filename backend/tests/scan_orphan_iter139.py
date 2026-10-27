"""Iteration 139 scan: orphan window with BOTTOM_SAFE=28mm (short ~12-word paragraphs and ~17-word paragraphs)"""
import pymupdf
import requests

BASE = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL")][0].rstrip("/")
API = f"{BASE}/api"
MM = 72 / 25.4
s = requests.Session()
s.headers["Authorization"] = "Bearer " + s.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
TXT = {"short": "نص تجريبي طويل لاختبار تعدد الصفحات في الخطابات الرسمية وتكرار الترقيم.",
       "long": "نص تجريبي طويل لاختبار تعدد الصفحات في الخطابات الرسمية وتكرار الترقيم وضمان عدم التداخل مع التذييل وإضافة كلمات."}
for kind, t in TXT.items():
    for k in range(6, 32):
        body = "".join(f"<p>PARA{i} {t}</p>" for i in range(k))
        r = s.post(f"{API}/letters/preview-pdf", params={"fmt": "pdf"}, json={"subject": "TEST", "body": body, "recipient": {"name": "TEST"}, "signatory_title": "TEST_SIGT", "signatory_name": "TEST_SIGN"})
        d = pymupdf.open(stream=r.content, filetype="pdf")
        last_para_page = max(i for i, pg in enumerate(d) if "PARA" in pg.get_text())
        sp = int(r.headers["X-Sig-Page"])
        H = d[0].rect.height
        low = min((H - b[3]) / MM for b in d[0].get_text("blocks") if "PARA" in b[4])
        flag = "ORPHAN" if sp > last_para_page else ""
        print(f"{kind} k={k} pages={d.page_count} sig_page={sp} last_body_page={last_para_page} p1_body_bottom={low:.1f}mm {flag}")
