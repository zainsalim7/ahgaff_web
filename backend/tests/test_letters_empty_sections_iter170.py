# Letters: intentionally-emptied template sections (recipient/greeting/subject) must vanish from PDF/DOCX; regression for no-section letters
import io
import os
import unicodedata
import uuid

import fitz
import pytest
import requests
from docx import Document

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as fh:
        for ln in fh:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")

BODY = "<p>TEST_BODY_MARKER نص اتفاقية حر للاختبار</p>"
SUBJ = "TEST_SUBJ_MARKER"
REC = {"name": "TESTRECNAME", "title": "TESTRECTITLE", "organization": "", "suffix": "المحترم"}


def norm(t: str) -> str:
    t = unicodedata.normalize("NFKC", t)
    return "".join(ch for ch in t if not unicodedata.category(ch).startswith("M")).replace("\u0640", "")


def has_word(text: str, word: str) -> bool:
    t = norm(text).replace(" ", "").replace("\n", "")
    w = norm(word).replace(" ", "")
    return w in t or w[::-1] in t


@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    r = ss.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code} {r.text[:200]}")
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    ss.headers.update({"Authorization": f"Bearer {tok}"})
    return ss


@pytest.fixture(scope="module")
def created(s):
    store = {"templates": [], "letters": []}
    yield store
    for t in store["templates"]:
        s.delete(f"{BASE_URL}/api/letter-templates/{t}")
    for l in store["letters"]:
        s.post(f"{BASE_URL}/api/letters/{l}/revoke", json={"reason": "TEST cleanup"})


def pdf_text(s, lid):
    r = s.get(f"{BASE_URL}/api/letters/{lid}/pdf")
    assert r.status_code == 200, r.text[:300]
    doc = fitz.open(stream=r.content, filetype="pdf")
    return "\n".join(p.get_text() for p in doc)


def docx_text(s, lid):
    r = s.get(f"{BASE_URL}/api/letters/{lid}/docx")
    assert r.status_code == 200, r.text[:300]
    d = Document(io.BytesIO(r.content))
    parts = [p.text for p in d.paragraphs]
    for tb in d.tables:
        for row in tb.rows:
            for c in row.cells:
                parts.append(c.text)
    return "\n".join(parts)


class TestEmptySections:
    def test_template_empty_sections_persist_in_defaults(self, s, created):
        name = f"TEST_empty_{uuid.uuid4().hex[:6]}"
        r = s.post(f"{BASE_URL}/api/letter-templates", json={"name": name, "subject": SUBJ, "body": BODY, "sections": {"recipient": "", "greeting": "", "subject": ""}})
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        created["templates"].append(tid)
        created["tid"] = tid
        r = s.get(f"{BASE_URL}/api/letters/section-defaults", params={"template_id": tid})
        assert r.status_code == 200
        secs = r.json()["sections"]
        assert secs["recipient"] == ""
        assert secs["greeting"] == ""
        assert secs["subject"] == ""
        assert secs.get("closing")  # closing from letterhead still present
        assert secs.get("signature")

    def test_issue_with_template_id_only_hides_sections(self, s, created):
        tid = created["tid"]
        r = s.post(f"{BASE_URL}/api/letters/issue", json={"template_id": tid, "subject": SUBJ, "body": BODY, "recipient": REC})
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        created["letters"].append(lid)
        g = s.get(f"{BASE_URL}/api/letters/{lid}").json()
        assert g["sections"]["recipient"] == "" and g["sections"]["greeting"] == "" and g["sections"]["subject"] == ""
        txt = pdf_text(s, lid)
        assert "TEST_BODY_MARKER" in txt
        assert "TESTRECNAME" not in txt
        assert not has_word(txt, "إلى:")
        assert not has_word(txt, "السلام عليكم")
        assert not has_word(txt, "الموضوع:")
        assert has_word(txt, "وتفضلوا")  # closing

    def test_issue_with_explicit_empty_sections(self, s, created):
        r = s.post(f"{BASE_URL}/api/letters/issue", json={"subject": SUBJ, "body": BODY, "recipient": REC,
                                                          "sections": {"recipient": "", "greeting": "<p></p>", "subject": ""}})
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        created["letters"].append(lid)
        txt = pdf_text(s, lid)
        assert "TEST_BODY_MARKER" in txt
        assert "TESTRECNAME" not in txt and SUBJ not in txt
        assert not has_word(txt, "السلام عليكم")
        dt = docx_text(s, lid)
        assert "TEST_BODY_MARKER" in dt
        assert "TESTRECNAME" not in dt and "إلى:" not in dt and "السلام عليكم" not in dt and "الموضوع:" not in dt

    def test_regression_no_template_no_sections(self, s, created):
        r = s.post(f"{BASE_URL}/api/letters/issue", json={"subject": SUBJ, "body": BODY, "recipient": REC})
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        created["letters"].append(lid)
        txt = pdf_text(s, lid)
        assert "TESTRECNAME" in txt and "TESTRECTITLE" in txt
        assert SUBJ in txt
        assert has_word(txt, "إلى")
        assert has_word(txt, "السلام عليكم ورحمة")
        assert has_word(txt, "الموضوع")
        dt = docx_text(s, lid)
        assert "TESTRECNAME" in dt and SUBJ in dt and "السلام عليكم" in dt

    def test_template_update_empty_persists(self, s, created):
        tid = created["tid"]
        lst = [t for t in s.get(f"{BASE_URL}/api/letter-templates").json() if t["id"] == tid][0]
        lst.pop("id", None)
        lst["sections"] = {"recipient": "", "greeting": "<p>تحية TEST</p>", "subject": ""}
        r = s.put(f"{BASE_URL}/api/letter-templates/{tid}", json=lst)
        assert r.status_code == 200, r.text
        secs = s.get(f"{BASE_URL}/api/letters/section-defaults", params={"template_id": tid}).json()["sections"]
        assert secs["recipient"] == "" and "TEST" in secs["greeting"]
