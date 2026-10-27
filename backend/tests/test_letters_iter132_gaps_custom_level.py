# Iter132: gap preservation at Arabic/Latin run boundaries, custom-person draft roundtrip ids, empty level label
import os, re, sys, pytest, requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL=")][0]
BASE_URL = BASE_URL.rstrip("/")
sys.path.insert(0, "/app/backend")
REC = {"name": "TEST_جهة", "title": "", "organization": "", "suffix": "المحترم"}
C1 = {"kind": "custom", "id": "custom-a1", "label": "TEST_يدوي1", "fields": {"الاسم": "TEST_يدوي1", "الصفة": "رئيس اللجنة", "الرقم": "11", "الجهة": "جهة1"}}
C2 = {"kind": "custom", "id": "custom-b2", "label": "TEST_يدوي2", "fields": {"الاسم": "TEST_يدوي2", "الصفة": "عضو", "الرقم": "22", "الجهة": "جهة2"}}


@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    t = ss.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    ss.headers["Authorization"] = f"Bearer {t}"
    return ss


@pytest.fixture(scope="module")
def created(s):
    ids = []
    yield ids
    db = MongoClient("mongodb://localhost:27017")["test_database"]
    from bson import ObjectId
    for i in ids:
        db.letters.delete_one({"_id": ObjectId(i)})


# --- custom person draft roundtrip keeps id + fields
def test_custom_draft_roundtrip_ids(s, created):
    r = s.post(f"{BASE_URL}/api/letters/draft", json={"subject": "TEST_iter132", "body": "<p>{جدول_الأسماء}</p>", "recipient": REC, "people": [C1, C2]})
    assert r.status_code == 200, r.text
    created.append(r.json()["id"])
    g = s.get(f"{BASE_URL}/api/letters/{r.json()['id']}").json()
    assert [p["id"] for p in g["people"]] == ["custom-a1", "custom-b2"]
    assert g["people"][0]["fields"]["الصفة"] == "رئيس اللجنة"
    assert g["people"][1]["name"] == "TEST_يدوي2"


# --- student without level: no dangling 'المستوى'
def test_student_empty_level_no_dangling_label(s):
    db = MongoClient("mongodb://localhost:27017")["test_database"]
    st = db.students.find_one({"level": {"$nin": [None, ""]}})
    old = st["level"]
    db.students.update_one({"_id": st["_id"]}, {"$set": {"level": ""}})
    try:
        for people in ([{"kind": "student", "id": str(st["_id"])}], [C1, {"kind": "student", "id": str(st["_id"])}]):
            r = s.post(f"{BASE_URL}/api/letters/preview-body", json={"body": "<p>{جدول_الأسماء} [{المستوى}]</p>", "recipient": REC, "people": people})
            assert r.status_code == 200, r.text
            txt = str(r.json())
            print("OUT:", txt[:3000])
            # dangling = 'المستوى' immediately followed by whitespace then a cell/line end, or bare value 'المستوى' in a data cell
            assert not re.search(r"المستوى\s+(<|\]|—|$)", txt), txt[:2000]
            assert "— المستوى" not in txt and "[المستوى" not in txt
    finally:
        db.students.update_one({"_id": st["_id"]}, {"$set": {"level": old}})


# --- gap preserved at bidi run boundaries (matrix)
class _Cap:
    def __init__(self): self.calls = []
    def setFont(self, *a): pass
    def setFillColor(self, *a): pass
    def setLineWidth(self, *a): pass
    def line(self, *a): pass
    def drawString(self, x, y, t): self.calls.append(x)


def _span(html):
    from backend.services.rich_text_pdf import parse_rich, draw_rich
    c = _Cap()
    draw_rich(c, parse_rich(html, default_size=14, default_font="amiri", default_align="center"), 56.7, 538.6, 700)
    return max(c.calls) - min(c.calls)


CASES = [(al, a, b) for al in ("right", "left", "center") for a, b in [
    ("نص", "XYZ"), ("نص عربي", "XYZ"), ("نص عربي", "ABC DEF"), ("الموضوع: طلب ترشيح", "ABC"),
    ("XYZ", "نص عربي"), ("ABC DEF", "نص عربي"), ("ABC DEF", "نص")]]


@pytest.mark.parametrize("align,a,b", CASES)
def test_gap_preserved(align, a, b):
    extra = _span(f'<p style="text-align: {align};">{a}{" " * 25}{b}</p>') - _span(f'<p style="text-align: {align};">{a} {b}</p>')
    assert extra > 70, f"gap lost ({extra:.1f}pt)"
