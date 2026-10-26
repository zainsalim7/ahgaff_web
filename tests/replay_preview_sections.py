# Replays captured /letters/preview-pdf payloads (from UI) as PDF and prints word x-positions of greeting/subject lines
import json, os, requests, pymupdf
URL = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL=')][0]
tok = requests.post(f"{URL}/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
for name in ["g_right_0", "g_right_15", "g_left_0", "g_left_15", "s_left_xyz"]:
    p = f"/app/.screenshots/req_{name}.json"
    if not os.path.exists(p) or not open(p).read():
        print(name, "missing"); continue
    body = json.loads(open(p).read())
    r = requests.post(f"{URL}/api/letters/preview-pdf?fmt=pdf", json=body, headers=H)
    pg = pymupdf.open(stream=r.content, filetype="pdf")[0]
    words = pg.get_text("words")
    tgt = []
    for w in words:
        t = w[4]
        if any(k in t for k in ("ﻡﻼﺴﻟﺍ", "ﻢﻜﻴﻠﻋ", "السلام", "عليكم", "XYZ", "ﺺﻧ", "نص", "ﻲﺑﺮﻋ", "عربي")):
            tgt.append((round(w[0], 1), round(w[2], 1), round(w[1], 1), t))
    print(f"{name:12s} page_w={pg.rect.width:.0f}", sorted(tgt))
