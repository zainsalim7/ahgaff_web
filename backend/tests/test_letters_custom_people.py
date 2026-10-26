# Letters: custom/manual person feeding {جدول_الأسماء} + rich-text PDF leading-gap/left-align fixes
import os
import io
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    for line in open('/app/frontend/.env'):
        if line.startswith('REACT_APP_BACKEND_URL='):
            BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

CUSTOM = {"kind": "custom", "id": "custom-1", "fields": {"الاسم": "TEST_أحمد اليدوي", "الصفة": "رئيس اللجنة", "الجهة": "وزارة التعليم", "الرقم": "777"}}
CUSTOM2 = {"kind": "custom", "id": "custom-2", "fields": {"الاسم": "TEST_سارة اليدوية", "الصفة": "عضو", "الجهة": "", "الرقم": ""}}
REC = {"name": "TEST_جهة", "title": "المدير", "organization": "جهة", "suffix": "المحترم"}


@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    r = ss.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("login failed")
    ss.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return ss


@pytest.fixture(scope="module")
def student(s):
    for q in ["ا", "م", "محمد", "عبد"]:
        r = s.get(f"{BASE_URL}/api/letters/people", params={"kind": "student", "q": q})
        if r.status_code == 200 and r.json():
            return r.json()[0]
    pytest.skip("no student found")


@pytest.fixture(scope="module")
def created(s):
    ids = []
    yield ids
    for i in ids:
        s.delete(f"{BASE_URL}/api/letters/{i}")


# preview-body: custom only
def test_preview_body_custom_only(s):
    r = s.post(f"{BASE_URL}/api/letters/preview-body", json={"body": "<p>x {جدول_الأسماء} {قائمة_الأسماء} {عدد_الأسماء}</p>", "subject": "s", "recipient": REC, "people": [CUSTOM]})
    assert r.status_code == 200, r.text
    d = r.json()
    t = d["table"]
    assert t["default_headers"] == ["م", "الاسم", "الصفة", "الرقم", "الجهة"]
    assert t["rows"][0][:5] == ["1", "TEST_أحمد اليدوي", "رئيس اللجنة", "777", "وزارة التعليم"]
    assert "TEST_أحمد اليدوي" in d["body"] and "1" in d["body"]


# empty-name custom is dropped
def test_preview_body_custom_empty_name(s):
    r = s.post(f"{BASE_URL}/api/letters/preview-body", json={"body": "<p>{جدول_الأسماء}</p>", "people": [{"kind": "custom", "id": "c", "fields": {"الاسم": "  "}}]})
    assert r.status_code == 200
    assert r.json()["table"]["rows"] == []


# mixed custom + student
def test_preview_body_mixed(s, student):
    r = s.post(f"{BASE_URL}/api/letters/preview-body", json={"body": "<p>{جدول_الأسماء}</p>", "recipient": REC, "people": [CUSTOM, {"kind": "student", "id": student["id"]}]})
    assert r.status_code == 200, r.text
    t = r.json()["table"]
    assert t["mixed"] is True
    assert t["default_headers"] == ["م", "الاسم", "الصفة", "الرقم", "الجهة / الكلية", "القسم / الوظيفة"]
    assert t["rows"][0][:5] == ["1", "TEST_أحمد اليدوي", "رئيس اللجنة", "777", "وزارة التعليم"]
    assert t["rows"][1][2] == "طالب"


# preview-pdf with custom people renders
def test_preview_pdf_custom(s):
    r = s.post(f"{BASE_URL}/api/letters/preview-pdf?fmt=pdf", json={"subject": "TEST_s", "body": "<p>نص {جدول_الأسماء}</p>", "recipient": REC, "people": [CUSTOM]})
    assert r.status_code == 200, r.text[:300]
    import pymupdf
    txt = pymupdf.open(stream=r.content, filetype="pdf")[0].get_text()
    assert "777" in txt


# draft save + reload preserves custom persons
def test_draft_roundtrip(s, created):
    r = s.post(f"{BASE_URL}/api/letters/draft", json={"subject": "TEST_draft_custom", "body": "<p>{جدول_الأسماء}</p>", "recipient": REC, "people": [CUSTOM, CUSTOM2]})
    assert r.status_code == 200, r.text
    lid = r.json()["id"]
    created.append(lid)
    g = s.get(f"{BASE_URL}/api/letters/{lid}").json()
    ppl = g["people"]
    assert len(ppl) == 2
    assert ppl[0]["kind"] == "custom" and ppl[0]["fields"]["الصفة"] == "رئيس اللجنة"
    # inputs keep the raw ids
    assert [p["id"] for p in g["inputs"]["people"]] == ["custom-1", "custom-2"]
    # Frontend loadDraft uses d.people ids -> must be unique & non-empty for chips/removal to work
    ids = [p["id"] for p in ppl]
    assert all(ids) and len(set(ids)) == 2, f"custom people ids lost after reload: {ids}"


# issue + PDF with custom person
def test_issue_and_pdf(s, created):
    r = s.post(f"{BASE_URL}/api/letters/draft", json={"subject": "TEST_issue_custom", "body": "<p>{جدول_الأسماء}</p>", "recipient": REC, "people": [CUSTOM]})
    lid = r.json()["id"]
    created.append(lid)
    p = s.get(f"{BASE_URL}/api/letters/{lid}/pdf")
    assert p.status_code == 200 and p.content[:4] == b"%PDF"


# rich_text_pdf leading gap + left align (python-level)
class _Cap:
    def __init__(self): self.calls = []
    def setFont(self, *a): pass
    def setFillColor(self, *a): pass
    def setLineWidth(self, *a): pass
    def line(self, *a): pass
    def drawString(self, x, y, s): self.calls.append(x)


def _xs(html):
    import sys
    sys.path.insert(0, "/app/backend")
    from backend.services.rich_text_pdf import parse_rich, draw_rich
    c = _Cap()
    draw_rich(c, parse_rich(html, default_size=14, default_font="amiri", default_align="center"), 56.7, 538.6, 700)
    return min(c.calls), max(c.calls)


def test_rich_leading_gap_right():
    base = _xs('<p style="text-align: right;">السلام عليكم</p>')
    ind = _xs('<p style="text-align: right;">' + ' ' * 15 + 'السلام عليكم</p>')
    assert ind[1] < base[1] - 10, (base, ind)


def test_rich_leading_gap_left():
    lb = _xs('<p style="text-align: left;">السلام عليكم</p>')
    li = _xs('<p style="text-align: left;">' + ' ' * 15 + 'السلام عليكم</p>')
    assert li[0] > lb[0] + 10, (lb, li)


def test_rich_left_gap_latin():
    lx = _xs('<p style="text-align: left;">نص عربي' + ' ' * 25 + 'XYZ</p>')
    assert abs(lx[0] - 56.7) < 1, lx


def _calls(html):
    import sys
    sys.path.insert(0, "/app/backend")
    from backend.services.rich_text_pdf import parse_rich, draw_rich
    c = _Cap2()
    draw_rich(c, parse_rich(html, default_size=14, default_font="amiri", default_align="center"), 56.7, 538.6, 700)
    return sorted(c.calls)


class _Cap2(_Cap):
    def drawString(self, x, y, s): self.calls.append((x, s))


# Multi-space gap must survive at a bidi run boundary when the run has >=2 words (KNOWN FAILING: _apply_draw_gaps)
@pytest.mark.parametrize("align,text", [("left", "نص عربي" + " " * 25 + "XYZ"), ("right", "نص عربي" + " " * 25 + "ABC DEF")])
def test_rich_gap_preserved_at_run_boundary(align, text):
    calls = _calls(f'<p style="text-align: {align};">{text}</p>')
    xs = [x for x, _ in calls]
    # 25 spaces at 14pt ~ 95pt; without gap the whole line spans < 60pt
    assert max(xs) - min(xs) > 120, f"gap lost: {calls}"
