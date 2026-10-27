import sys, asyncio, os
sys.path.insert(0, "/app/backend/backend"); sys.path.insert(0, "/app/backend/tests")
from dotenv import load_dotenv; load_dotenv("/app/backend/.env")
from test_letters_bottom_safe_iter139 import body, payload
from test_letters_page_chip_iter140 import footer_png
import services.letter_pdf as lp

orig = lp._build_letter_pdf_once
def wrapped(s, settings, draft=False, letterhead=True, meta=None):
    out = orig(s, settings, draft, letterhead, meta=meta)
    print("  trial leading", (s.get("layout") or {}).get("body_leading"), {k: meta.get(k) for k in ("sig_page", "body_end_page_idx", "sig_y_mm")})
    return out
lp._build_letter_pdf_once = wrapped

async def main():
    from routes import letters as R
    from routes.deps import get_db
    from motor.motor_asyncio import AsyncIOMotorClient
    from routes.deps import set_database
    set_database(AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']])
    db = get_db()
    data = R.IssueIn(**payload(body(int(sys.argv[1])), letterhead_override={"signature_base64": footer_png()}))
    user = await db.users.find_one({"username": "admin"})
    settings, series = await R._lh_series(db, user, data)
    settings = {**settings, **data.letterhead_override}
    doc = {**(await R._compose(db, data, settings)), "number_display": "X", "verify_url": "D", "issued_at": "2026-01-01"}
    doc["layout"] = {**(doc.get("layout") or {}), "watermark": "w"}
    print("doc layout", doc.get("layout"))
    m = {}
    lp.build_letter_pdf(doc, settings, draft=True, meta=m)
    print("final", m)

async def m2():
    from routes import letters as R
    from motor.motor_asyncio import AsyncIOMotorClient
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    data = R.IssueIn(**payload(body(10), letterhead_override={"signature_base64": footer_png()}, layout={"body_leading": 1.0}))
    user = await db.users.find_one({"username": "admin"})
    settings, series = await R._lh_series(db, user, data)
    print("settings layout", settings.get("layout"))
    settings = {**settings, **data.letterhead_override}
    doc = {**(await R._compose(db, data, settings)), "number_display": "X", "verify_url": "D", "issued_at": "2026-01-01"}
    print("doc keys", list(doc.keys())[:40]); print("doc layout", doc.get("layout"))
    m = {}; orig(doc, settings, True, True, meta=m); print("explicit1.0", m)
    doc2 = {**doc, "layout": {"body_leading": 1.0}}
    m = {}; orig(doc2, settings, True, True, meta=m); print("explicit1.0 b", m)

async def m3():
    from routes import letters as R
    from motor.motor_asyncio import AsyncIOMotorClient
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    data = R.IssueIn(**payload(body(10), letterhead_override={"signature_base64": footer_png()}))
    user = await db.users.find_one({"username": "admin"})
    settings, series = await R._lh_series(db, user, data)
    settings = {**settings, **data.letterhead_override}
    doc = {**(await R._compose(db, data, settings)), "number_display": "X", "verify_url": "D", "issued_at": "2026-01-01"}
    import copy
    s0 = copy.deepcopy(settings)
    m = {}; orig({**doc, "layout": {"body_leading": 1.5}}, settings, True, True, meta=m); print("1.5", m)
    print("settings changed keys", [k for k in settings if settings[k] != s0.get(k)])
    m = {}; orig({**doc, "layout": {"body_leading": 1.0}}, settings, True, True, meta=m); print("1.0 after", m)
    for lay in ({"body_leading": 1.425}, {"body_leading": 1.05}, {"body_leading": 1.0, "watermark": "w"}, {"body_leading": 1.05, "watermark": "w"}, {"body_leading": 1.01}):
        m = {}; pdf = orig({**doc, "layout": lay}, s0, True, True, meta=m); print(lay, m)
        import pymupdf
        dd = pymupdf.open(stream=pdf, filetype="pdf"); H = dd[0].rect.height
        print("   pages", dd.page_count, [round((H - b[3]) / 2.8346, 1) for b in dd[0].get_text("blocks")][6:30])
asyncio.run(m3())
