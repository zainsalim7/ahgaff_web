"""Diag: long (17-word) paragraphs — which explicit leading resolves orphan; and leading actually applied (para y gap)"""
import sys
sys.path.insert(0, "/app/backend/tests")
import requests
from test_letters_autoshrink_leading_iter138 import API, payload, analyze, SIG_IMG
s = requests.Session(); s.headers["User-Agent"] = "Mozilla/5.0"
s.headers["Authorization"] = "Bearer " + s.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
for n in (7, 8, 9):
    for lead in (None, 1.4, 1.3, 1.2, 1.05, 0.9):
        kw = {"layout": {"body_leading": lead}} if lead else {}
        r = s.post(f"{API}/letters/preview-pdf", params={"fmt": "pdf"}, json=payload(n, **kw))
        pages, tp, np_, lb, paras, ys = analyze(r.content)
        gap = round((ys[-1] - ys[0]) / max(1, len(ys) - 1), 1) if len(ys) > 1 else None
        print(n, lead, "pages", pages, "sig", tp, "body_last", lb, "ORPHAN" if tp and tp[0] > lb else "", "para_gap_pt", gap, "sig_y", r.headers.get("X-Sig-Y-Mm"))
