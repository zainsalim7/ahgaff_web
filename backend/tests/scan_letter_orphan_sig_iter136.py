"""Scan: does the ensure(38mm) reserve push the signature onto an otherwise empty page? + render footer crops"""
import requests, pymupdf
BASE = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL")][0].rstrip("/")
API = f"{BASE}/api"
s = requests.Session(); s.headers["User-Agent"] = "Mozilla/5.0"
s.headers["Authorization"] = "Bearer " + s.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
for k in range(8, 30):
    body = "".join(f"<p>PARA{i} نص تجريبي طويل لاختبار تعدد الصفحات في الخطابات الرسمية وتكرار الترقيم.</p>" for i in range(k))
    r = s.post(f"{API}/letters/preview-pdf", params={"fmt": "pdf"}, json={"subject": "TEST", "body": body, "recipient": {"name": "TEST"}, "signatory_title": "SIGT", "signatory_name": "SIGN"})
    d = pymupdf.open(stream=r.content, filetype="pdf")
    last = d[d.page_count - 1].get_text()
    paras_on_last = last.count("PARA")
    print(k, "pages", d.page_count, "sig_page", r.headers.get("X-Sig-Page"), "sig_y", r.headers.get("X-Sig-Y-Mm"), "paras_on_last", paras_on_last, "ORPHAN" if d.page_count > 1 and paras_on_last == 0 else "")
    if k == 29:
        for i, pg in enumerate(d):
            H = pg.rect.height
            pg.get_pixmap(dpi=90, clip=pymupdf.Rect(0, H - 90, pg.rect.width, H)).save(f"/tmp/foot_{i}.png")
        d[d.page_count - 1].get_pixmap(dpi=60).save("/tmp/last_full.png")
