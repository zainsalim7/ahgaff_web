# Letters: per-person values for EMPTY custom table columns (manual persons) — preview/issue/PDF/DOCX/draft/batch
import os
import io
import zipfile
import re
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    for line in open('/app/frontend/.env'):
        if line.startswith('REACT_APP_BACKEND_URL='):
            BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

LBL = "التوقيع"
P_OLD = {"kind": "custom", "id": "custom-old", "fields": {"الاسم": "TEST_قديم", "الصفة": "عضو", "الجهة": "", "الرقم": "11"}}
P_NEW = {"kind": "custom", "id": "custom-new", "fields": {"الاسم": "TEST_جديد", "الصفة": "رئيس", "الجهة": "جهة", "الرقم": "22", LBL: "XSIG77"}}
REC = {"name": "TEST_جهة", "title": "المدير", "organization": "جهة", "suffix": "المحترم"}
COLS = ["م", "الاسم", {"label": LBL, "text": ""}, {"label": "ثابت", "text": "CONST55"}]
BODY = "<p>نص الخطاب</p><p>{جدول_الأسماء}</p>"


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
    for q in ["ا", "م", "محمد"]:
        r = s.get(f"{BASE_URL}/api/letters/people", params={"kind": "student", "q": q})
        if r.status_code == 200 and r.json():
            p = r.json()[0]
            return {"kind": "student", "id": p["id"]}
    pytest.skip("no student")


@pytest.fixture(scope="module")
def created(s):
    ids = []
    yield ids
    for i in ids:
        s.delete(f"{BASE_URL}/api/letters/{i}")


def _pdf_text(b: bytes) -> str:
    import pymupdf
    doc = pymupdf.open(stream=b, filetype="pdf")
    return "\n".join(p.get_text() for p in doc)


def _docx_text(b: bytes) -> str:
    z = zipfile.ZipFile(io.BytesIO(b))
    return re.sub(r"<[^>]+>", " ", z.read("word/document.xml").decode("utf-8"))


def _payload(people, **kw):
    return {"subject": "TEST_اختبار عمود مخصص", "body": BODY, "recipient": REC, "people": people, "layout": {"table_columns": COLS}, **kw}


# preview-body: raw_fields carries extra key only for the new manual person
def test_preview_body_raw_fields(s, student):
    r = s.post(f"{BASE_URL}/api/letters/preview-body", json={"body": BODY, "subject": "x", "recipient": REC, "people": [P_OLD, P_NEW, student]})
    assert r.status_code == 200, r.text
    t = r.json()["table"]
    assert len(t["raw_fields"]) == 3
    assert t["raw_fields"][1].get(LBL) == "XSIG77"
    assert LBL not in t["raw_fields"][0] and LBL not in t["raw_fields"][2]
    assert t["mixed"] is True


# filter_table unit: per-row manual vs constant
def test_filter_table_unit():
    import sys
    sys.path.insert(0, "/app/backend/backend")
    sys.path.insert(0, "/app/backend")
    try:
        from services.letter_pdf import filter_table
    except Exception:
        from backend.services.letter_pdf import filter_table
    tbl = {"headers": ["م", "الاسم"], "default_headers": ["م", "الاسم"], "rows": [["1", "a"], ["2", "b"]], "raw_fields": [{}, {LBL: "v2"}]}
    out = filter_table(tbl, COLS)
    assert out["headers"] == ["م", "الاسم", LBL, "ثابت"]
    assert out["rows"] == [["1", "a", "", "CONST55"], ["2", "b", "v2", "CONST55"]]
    # legacy table without raw_fields → blank cells, no crash
    legacy = {k: v for k, v in tbl.items() if k != "raw_fields"}
    assert filter_table(legacy, COLS)["rows"][0][2] == ""


# preview-pdf: value appears once; constant appears per row
def test_preview_pdf_text(s, student):
    r = s.post(f"{BASE_URL}/api/letters/preview-pdf", params={"fmt": "pdf"}, json=_payload([P_OLD, P_NEW, student]))
    assert r.status_code == 200, r.text[:300]
    txt = _pdf_text(r.content)
    assert txt.count("XSIG77") == 1, txt
    assert txt.count("CONST55") == 3


# issue → PDF + DOCX
def test_issue_pdf_docx(s, created):
    r = s.post(f"{BASE_URL}/api/letters/issue", json=_payload([P_OLD, P_NEW]))
    assert r.status_code == 200, r.text
    lid = r.json()["id"]
    created.append(lid)
    g = s.get(f"{BASE_URL}/api/letters/{lid}").json()
    assert g["table"]["raw_fields"][1][LBL] == "XSIG77"
    assert g["people"][1]["fields"][LBL] == "XSIG77"
    pdf = s.get(f"{BASE_URL}/api/letters/{lid}/pdf")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    t = _pdf_text(pdf.content)
    assert t.count("XSIG77") == 1 and t.count("CONST55") == 2
    dx = s.get(f"{BASE_URL}/api/letters/{lid}/docx")
    assert dx.status_code == 200
    dt = _docx_text(dx.content)
    assert dt.count("XSIG77") == 1 and dt.count("CONST55") == 2


# draft save → load → finalize keeps per-person extra fields
def test_draft_roundtrip_finalize(s, created):
    r = s.post(f"{BASE_URL}/api/letters/draft", json=_payload([P_OLD, P_NEW]))
    assert r.status_code == 200, r.text
    did = r.json()["id"]
    created.append(did)
    d = s.get(f"{BASE_URL}/api/letters/{did}").json()
    assert d["status"] == "draft"
    assert d["inputs"]["people"][1]["fields"][LBL] == "XSIG77"
    assert d["layout"]["table_columns"][2] == {"label": LBL, "text": ""}
    # update draft (re-save with draft_id)
    r2 = s.post(f"{BASE_URL}/api/letters/draft", json={**_payload([P_NEW]), "draft_id": did})
    assert r2.status_code == 200
    assert s.get(f"{BASE_URL}/api/letters/{did}").json()["table"]["raw_fields"][0][LBL] == "XSIG77"
    f = s.post(f"{BASE_URL}/api/letters/{did}/finalize")
    assert f.status_code == 200, f.text
    fin = s.get(f"{BASE_URL}/api/letters/{did}").json()
    assert fin["status"] == "issued"
    assert fin["table"]["raw_fields"][0][LBL] == "XSIG77"
    t = _pdf_text(s.get(f"{BASE_URL}/api/letters/{did}/pdf").content)
    assert "XSIG77" in t
    created.remove(did)  # issued letters can't be deleted
    s.post(f"{BASE_URL}/api/letters/{did}/revoke")


# non-string / empty extra values are dropped, not crashing
def test_extra_value_sanitized(s):
    p = {"kind": "custom", "id": "c3", "fields": {"الاسم": "TEST_x", LBL: "", "num": 5, "obj": {"a": 1}}}
    r = s.post(f"{BASE_URL}/api/letters/preview-body", json={"body": BODY, "people": [p]})
    assert r.status_code == 200, r.text
    rf = r.json()["table"]["raw_fields"][0]
    assert LBL not in rf and "num" not in rf and "obj" not in rf


# regression: default columns (no table_columns) unaffected
def test_default_columns_regression(s, student):
    r = s.post(f"{BASE_URL}/api/letters/preview-pdf", params={"fmt": "pdf"}, json={"subject": "x", "body": BODY, "recipient": REC, "people": [P_NEW]})
    assert r.status_code == 200
    t = _pdf_text(r.content)
    assert "XSIG77" not in t  # extra field hidden w/o column
    r2 = s.post(f"{BASE_URL}/api/letters/preview-body", json={"body": BODY, "people": [student]})
    assert r2.json()["table"]["default_headers"] == ["م", "الاسم", "رقم القيد", "الكلية", "القسم", "المستوى"]


# batch (per-person) issue: each letter's table shows only that person's own manual value
def test_issue_batch_per_person(s):
    r = s.post(f"{BASE_URL}/api/letters/issue-batch", json=_payload([P_OLD, P_NEW], per_person=True))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["count"] == 2
    texts = [_pdf_text(s.get(f"{BASE_URL}/api/letters/{l['id']}/pdf").content) for l in d["letters"]]
    assert "XSIG77" not in texts[0] and texts[1].count("XSIG77") == 1
    for l in d["letters"]:
        s.post(f"{BASE_URL}/api/letters/{l['id']}/revoke")
