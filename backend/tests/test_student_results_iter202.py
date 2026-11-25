# Student results (literal Excel import) — import/upsert/list/delete/template + /students/me/results
import io
import os
import csv
import pytest
import requests
import openpyxl

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/') or open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0].rstrip('/')
API = f"{BASE_URL}/api"
REG_A = "TEST_R9901"
REG_B = "TEST_R9902"


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin():
    return login("admin", "admin123")


@pytest.fixture(scope="module")
def student():
    return login("1001", "test1234")


def xlsx(rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


HEAD = ["رقم القيد", "المستوى", "حالة الفصل1", "معدل الفصل1", "تقدير الفصل1", "حالة الفصل2", "معدل الفصل2", "تقدير الفصل2"]


def upload(h, content, name="t.xlsx"):
    return requests.post(f"{API}/student-results/import", headers=h, files={"file": (name, content)})


def rows_for(h, reg):
    r = requests.get(f"{API}/student-results", headers=h, params={"q": reg})
    assert r.status_code == 200
    return [i for i in r.json()["items"] if i["reg_no"] == reg]


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin):
    yield
    for reg in (REG_A, REG_B):
        for i in rows_for(admin, reg):
            requests.delete(f"{API}/student-results/{i['id']}", headers=admin)


class TestImport:
    def test_insert_literal_values(self, admin):
        c = xlsx([HEAD,
                  [REG_A, 1, "ناجح", 88.4, "جيد جداً", "راسب", "58.30", "ضعيف"],
                  [REG_A, "2", "ناجح", "3.93", "ممتاز", "دور ثان", None, None],
                  [None] * 8,
                  ["", "", "", "", "", "", "", ""],
                  [REG_B, None, "x", None, None, None, None, None],
                  [None, 3, "x", None, None, None, None, None]])
        r = upload(admin, c)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["inserted"] == 2 and d["updated"] == 0
        assert d["skipped_rows"] == [6, 7]
        rows = sorted(rows_for(admin, REG_A), key=lambda x: x["level"])
        assert [x["level"] for x in rows] == [1, 2]
        assert rows[0]["s1_gpa"] == "88.4" and rows[0]["s2_gpa"] == "58.30"
        assert rows[0]["s1_grade"] == "جيد جداً"
        assert rows[1]["s1_gpa"] == "3.93" and rows[1]["s2_status"] == "دور ثان"
        assert rows[1]["s2_gpa"] is None and rows[1]["s2_grade"] is None

    def test_reupload_upserts_no_duplicate(self, admin):
        c = xlsx([HEAD, [REG_A, 1, "ناجح", "90", "ممتاز", None, None, None]])
        r = upload(admin, c)
        assert r.status_code == 200, r.text
        assert r.json()["inserted"] == 0 and r.json()["updated"] == 1
        rows = rows_for(admin, REG_A)
        assert len(rows) == 2
        l1 = [x for x in rows if x["level"] == 1][0]
        assert l1["s1_gpa"] == "90" and l1["s2_status"] is None  # replaced, cleared

    def test_level_words_and_csv(self, admin):
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(HEAD)
        w.writerow([REG_B, "الثالث", "ناجح", "77.50", "جيد", "", "", ""])
        r = upload(admin, buf.getvalue().encode("utf-8-sig"), "t.csv")
        assert r.status_code == 200, r.text
        rows = rows_for(admin, REG_B)
        assert len(rows) == 1 and rows[0]["level"] == 3 and rows[0]["s1_gpa"] == "77.50"
        assert rows[0]["s2_status"] is None

    def test_no_valid_rows_400(self, admin):
        r = upload(admin, xlsx([HEAD, [None] * 8]))
        assert r.status_code == 400

    def test_garbage_file_400(self, admin):
        r = upload(admin, b"not an excel", "x.xlsx")
        assert r.status_code == 400


class TestPermissions:
    def test_student_forbidden(self, student):
        assert requests.get(f"{API}/student-results", headers=student).status_code == 403
        assert requests.get(f"{API}/student-results/template", headers=student).status_code == 403
        assert upload(student, xlsx([HEAD, [REG_A, 5, "a"]])).status_code == 403
        assert requests.delete(f"{API}/student-results/000000000000000000000000", headers=student).status_code == 403

    def test_admin_template(self, admin):
        r = requests.get(f"{API}/student-results/template", headers=admin)
        assert r.status_code == 200
        ws = openpyxl.load_workbook(io.BytesIO(r.content)).active
        assert [c.value for c in ws[1]] == HEAD

    def test_me_results_non_student_403(self, admin):
        assert requests.get(f"{API}/students/me/results", headers=admin).status_code == 403

    def test_unauth(self):
        assert requests.get(f"{API}/student-results").status_code in (401, 403)


class TestMe:
    def test_student_1001_results(self, student):
        r = requests.get(f"{API}/students/me/results", headers=student)
        assert r.status_code == 200, r.text
        lv = r.json()["levels"]
        assert [x["level"] for x in lv] == sorted(x["level"] for x in lv)
        assert set(lv[0].keys()) == {"level", "first_semester", "second_semester"}
        assert set(lv[0]["first_semester"].keys()) == {"status", "gpa", "grade"}
        print(lv)


class TestDelete:
    def test_delete_and_404(self, admin):
        rows = rows_for(admin, REG_B)
        rid = rows[0]["id"]
        assert requests.delete(f"{API}/student-results/{rid}", headers=admin).status_code == 200
        assert rows_for(admin, REG_B) == []
        assert requests.delete(f"{API}/student-results/{rid}", headers=admin).status_code == 404
        assert requests.delete(f"{API}/student-results/bad-id", headers=admin).status_code == 404
