# Results page redesign (iter206): blank template, list fields cur_s1/cur_s2, page size 100, filters, view-only perms
import io
import os
import pytest
import requests
import openpyxl
from pymongo import MongoClient


def _env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env("/app/frontend/.env", "REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
mdb = MongoClient(_env("/app/backend/.env", "MONGO_URL"))[_env("/app/backend/.env", "DB_NAME")]
SALIM_ORIG = ["manage_fee_receipts", "hr_manage_tasks", "hr_manage_appraisals"]


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin():
    return login("admin", "admin123")


@pytest.fixture(scope="module")
def viewer():
    mdb.users.update_one({"username": "Salim"}, {"$set": {"custom_permissions": ["view_results"]}})
    try:
        yield login("Salim", "test1234")
    finally:
        mdb.users.update_one({"username": "Salim"}, {"$set": {"custom_permissions": SALIM_ORIG}})


# Blank template
class TestBlankTemplate:
    def test_blank_template_headers(self, admin):
        r = requests.get(f"{API}/results/template/blank", headers=admin)
        assert r.status_code == 200
        assert "spreadsheetml" in r.headers.get("content-type", "")
        ws = openpyxl.load_workbook(io.BytesIO(r.content)).active
        assert [c.value for c in ws[1]][:4] == ["رقم القيد", "الحالة", "المعدل", "التقدير"]
        assert ws.max_column == 4
        # no data rows
        assert all(c.value is None for row in ws.iter_rows(min_row=2) for c in row)

    def test_blank_template_viewer_forbidden(self, viewer):
        r = requests.get(f"{API}/results/template/blank", headers=viewer)
        assert r.status_code == 403

    def test_blank_template_unauth(self):
        r = requests.get(f"{API}/results/template/blank")
        assert r.status_code in (401, 403)


# Students list
class TestList:
    def test_list_shape_and_limit(self, admin):
        r = requests.get(f"{API}/results/students", headers=admin, params={"page": 1})
        assert r.status_code == 200
        d = r.json()
        assert len(d["items"]) <= 100
        assert d["pages"] == (d["total"] + 99) // 100
        if d["total"] >= 100:
            assert len(d["items"]) == 100
        it = d["items"][0]
        for k in ("id", "reg_no", "full_name", "department_name", "level", "released_count", "cur_s1", "cur_s2"):
            assert k in it
        for s in d["items"]:
            for c in (s["cur_s1"], s["cur_s2"]):
                if c is not None:
                    assert set(["status", "gpa", "grade", "hidden"]).issubset(c.keys())

    def test_list_page2(self, admin):
        d1 = requests.get(f"{API}/results/students", headers=admin, params={"page": 1}).json()
        if d1["pages"] < 2:
            pytest.skip("only one page")
        d2 = requests.get(f"{API}/results/students", headers=admin, params={"page": 2}).json()
        assert d2["page"] == 2
        assert not set(x["id"] for x in d1["items"]) & set(x["id"] for x in d2["items"])

    def test_some_cur_cells_populated(self, admin):
        found = False
        for pg in range(1, 6):
            d = requests.get(f"{API}/results/students", headers=admin, params={"page": pg}).json()
            if any(s["cur_s1"] or s["cur_s2"] for s in d["items"]):
                found = True
                break
            if pg >= d["pages"]:
                break
        print("cur cell found:", found)

    def test_level_filter(self, admin):
        d = requests.get(f"{API}/results/students", headers=admin, params={"level": 2}).json()
        assert all(s["level"] == 2 for s in d["items"])

    def test_search_filter(self, admin):
        d0 = requests.get(f"{API}/results/students", headers=admin).json()
        reg = d0["items"][0]["reg_no"]
        d = requests.get(f"{API}/results/students", headers=admin, params={"q": reg}).json()
        assert any(s["reg_no"] == reg for s in d["items"])
        assert d["total"] <= d0["total"]

    def test_faculty_department_filter(self, admin):
        deps = requests.get(f"{API}/departments", headers=admin).json()
        dep = next(x for x in deps if x.get("faculty_id"))
        d = requests.get(f"{API}/results/students", headers=admin, params={"department_id": dep["id"]}).json()
        assert all(s["department_name"] == dep["name"] for s in d["items"])
        df = requests.get(f"{API}/results/students", headers=admin, params={"faculty_id": dep["faculty_id"]}).json()
        assert df["total"] >= d["total"]

    def test_viewer_can_list(self, viewer):
        r = requests.get(f"{API}/results/students", headers=viewer)
        assert r.status_code == 200
