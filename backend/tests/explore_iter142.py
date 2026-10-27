import sys, requests, pymupdf
sys.path.insert(0, "/app/backend/tests")
from test_letters_bottom_safe_iter139 import API, MM, body, payload, preview
ss = requests.Session()
r = ss.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
ss.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
for k in [int(x) for x in sys.argv[1:]]:
    r, d, _ = preview(ss, body(k))
    print("k", k, "pages", d.page_count, "sigpage", r.headers.get("X-Sig-Page"))
    for i, pg in enumerate(d):
        H = pg.rect.height
        print(f" page {i+1}")
        for b in pg.get_text("blocks"):
            print(f"   y={(H-b[3])/MM:6.1f}-{(H-b[1])/MM:6.1f} x={b[0]/MM:5.1f}-{b[2]/MM:5.1f} {b[4][:50]!r}")
        for ii in pg.get_image_info():
            q = ii["bbox"]; print(f"   IMG y={(H-q[3])/MM:6.1f}-{(H-q[1])/MM:6.1f} x={q[0]/MM:5.1f}-{q[2]/MM:5.1f}")
        pg.get_pixmap(dpi=60).save(f"/tmp/i142_k{k}_p{i+1}.png")
