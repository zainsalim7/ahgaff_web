# Visual check of long-letter PDF (45 paragraphs) - renders pages to PNG for inspection
import os, re, sys, requests, pymupdf
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 45
s = requests.Session()
tok = s.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
s.headers["Authorization"] = f"Bearer {tok}"
body = "".join(f"<p>P{i:02d} فقرة رقم {i} — هذا نص تجريبي طويل لاختبار انتقال الصفحات وترقيمها في الخطاب الرسمي مع التأكد من عدم وجود فراغ كبير أسفل الصفحة.</p>" for i in range(N))
r = s.post(f"{API}/letters/preview-pdf", params={"fmt": "pdf"}, json={"subject": "TEST_long", "body": body, "recipient": {"name": "TEST", "title": "عميد"}})
print("status", r.status_code)
d = pymupdf.open(stream=r.content, filetype="pdf")
print("pages", d.page_count)
found = {}
os.makedirs("/tmp/longpdf", exist_ok=True)
for pi, p in enumerate(d):
    words = p.get_text("words")
    for w in words:
        m = re.search(r"P(\d\d)|(\d\d)P", w[4])
        if m:
            k = int(m.group(1) or m.group(2)[::-1])
            found.setdefault(k, []).append((pi + 1, round(w[1], 1), round(w[3], 1)))
    p.get_pixmap(dpi=60).save(f"/tmp/longpdf/page{pi+1}.png")
    print("page", pi + 1, "height", p.rect.height, "max text y", max((w[3] for w in words), default=0))
missing = [i for i in range(N) if i not in found]
print("missing paragraphs:", missing)
for k in sorted(found):
    print(k, found[k])
