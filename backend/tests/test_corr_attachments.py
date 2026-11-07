# Correspondence Attachments feature: list / upload / curriculum-attach / delete / file serve / read-only enforcement
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"
ORG_ID = "6ab3ec870186d4c5e32749a4"
DOC_TYPE_ID = "6ac389d31b4b51b1c24b715e"
FAC_SHARIA = "698e4f9297fef774e66e93a4"
FAC_GIRLS = "698e4fb497fef774e66e93a6"
ISSUED_CORR = "6ac5048305549193bba94794"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    d = r.json()
    return d.get("access_token") or d.get("token")


@pytest.fixture(scope="module")
def s(token):
    ss = requests.Session()
    ss.headers.update({"Authorization": f"Bearer {token}"})
    return ss


@pytest.fixture(scope="module")
def corr(s):
    r = s.post(f"{API}/correspondence", json={"organization_id": ORG_ID, "document_type_id": DOC_TYPE_ID, "subject": "TEST_مرفقات pytest"})
    assert r.status_code in (200, 201), r.text
    cid = r.json()["id"]
    yield cid
    s.delete(f"{API}/correspondence/{cid}")


class TestAttachments:
    state = {}

    def test_list_empty(self, s, corr):
        r = s.get(f"{API}/correspondence/{corr}/attachments")
        assert r.status_code == 200
        assert r.json() == []

    def test_upload_and_list(self, s, corr):
        r = s.post(f"{API}/correspondence/{corr}/attachments/upload", files={"file": ("TEST_att.txt", b"hello attachments", "text/plain")})
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["original_filename"] == "TEST_att.txt" and a["source"] == "UPLOAD" and a["size"] == 17
        assert "_id" not in a
        self.state["upload"] = a
        lst = s.get(f"{API}/correspondence/{corr}/attachments").json()
        assert any(x["id"] == a["id"] for x in lst)

    def test_file_download(self, token):
        a = self.state["upload"]
        r = requests.get(f"{API}/files/{a['storage_path']}", params={"auth": token})
        assert r.status_code == 200
        assert r.content == b"hello attachments"

    def test_file_download_no_auth(self):
        a = self.state["upload"]
        r = requests.get(f"{API}/files/{a['storage_path']}")
        assert r.status_code == 401

    def test_upload_too_large(self, s, corr):
        big = b"0" * (15 * 1024 * 1024 + 10)
        r = s.post(f"{API}/correspondence/{corr}/attachments/upload", files={"file": ("TEST_big.bin", big, "application/octet-stream")})
        assert r.status_code == 400
        assert "15" in r.json()["detail"]

    def test_curriculum_multi_faculty(self, s, corr, token):
        r = s.post(f"{API}/correspondence/{corr}/attachments/curriculum", json={"faculty_ids": [FAC_SHARIA, FAC_GIRLS]})
        assert r.status_code == 200, r.text
        created = r.json()
        # الشريعة: الشريعة والقانون + عقيدة ؛ البنات: الدراسات الإسلامية  (قسم بلا خطة يُتجاوز)
        assert len(created) == 3, [c["department_name"] for c in created]
        assert all(c["source"] == "CURRICULUM" and c["content_type"] == "application/pdf" for c in created)
        assert {c["faculty_id"] for c in created} == {FAC_SHARIA, FAC_GIRLS}
        pdf = requests.get(f"{API}/files/{created[0]['storage_path']}", params={"auth": token})
        assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
        self.state["curr"] = created

    def test_curriculum_empty_list(self, s, corr):
        r = s.post(f"{API}/correspondence/{corr}/attachments/curriculum", json={"faculty_ids": []})
        assert r.status_code == 400

    def test_curriculum_no_data_arabic_error(self, s, corr):
        r = s.post(f"{API}/correspondence/{corr}/attachments/curriculum", json={"faculty_ids": ["000000000000000000000000"]})
        assert r.status_code == 400
        assert "لا توجد بيانات خطة دراسية" in r.json()["detail"]

    def test_delete_attachment(self, s, corr):
        a = self.state["upload"]
        r = s.delete(f"{API}/correspondence/attachments/{a['id']}")
        assert r.status_code == 200
        lst = s.get(f"{API}/correspondence/{corr}/attachments").json()
        assert all(x["id"] != a["id"] for x in lst)
        assert len(lst) == 3
        r2 = s.delete(f"{API}/correspondence/attachments/{a['id']}")
        assert r2.status_code == 404

    def test_issued_readonly(self, s):
        r = s.get(f"{API}/correspondence/{ISSUED_CORR}/attachments")
        assert r.status_code == 200
        up = s.post(f"{API}/correspondence/{ISSUED_CORR}/attachments/upload", files={"file": ("TEST_x.txt", b"x", "text/plain")})
        assert up.status_code == 409
        cu = s.post(f"{API}/correspondence/{ISSUED_CORR}/attachments/curriculum", json={"faculty_ids": [FAC_SHARIA]})
        assert cu.status_code == 409

    def test_unauthenticated_list(self, corr):
        r = requests.get(f"{API}/correspondence/{corr}/attachments")
        assert r.status_code in (401, 403)
