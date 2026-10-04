"""Tests for Course Groups feature (المجموعات الدراسية داخل المقرر)"""
import os
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://schedule-hub-272.preview.emergentagent.com").rstrip("/")
COURSE_ID = "698f0000d803b27aab0120af"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def teacher_id(h):
    r = requests.get(f"{BASE_URL}/api/teachers", headers=h)
    assert r.status_code == 200
    arr = r.json()
    if isinstance(arr, dict):
        arr = arr.get("teachers") or arr.get("items") or []
    return str(arr[0]["id"] if "id" in arr[0] else arr[0].get("_id"))


class TestCourseGroupsCore:
    def test_get_groups_shape(self, h):
        r = requests.get(f"{BASE_URL}/api/courses/{COURSE_ID}/groups", headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["course_id", "course_name", "groups", "unassigned", "total"]:
            assert k in d, f"missing {k}"
        assert isinstance(d["groups"], list)
        assert isinstance(d["total"], int)
        for g in d["groups"]:
            assert set(["key", "name", "teacher_id", "teacher_name", "count", "students"]).issubset(g.keys())

    def test_auto_distribute_bad_count(self, h):
        r = requests.post(f"{BASE_URL}/api/courses/{COURSE_ID}/groups/auto-distribute",
                          headers=h, json={"count": 1, "method": "name"})
        assert r.status_code == 400
        r = requests.post(f"{BASE_URL}/api/courses/{COURSE_ID}/groups/auto-distribute",
                          headers=h, json={"count": 21, "method": "name"})
        assert r.status_code == 400

    def test_auto_distribute_3_equal(self, h):
        r = requests.post(f"{BASE_URL}/api/courses/{COURSE_ID}/groups/auto-distribute",
                          headers=h, json={"count": 3, "method": "name", "only_unassigned": False})
        assert r.status_code == 200, r.text
        d = r.json()
        keys = {g["key"] for g in d["groups"]}
        assert {"1", "2", "3"}.issubset(keys)
        totals = {g["key"]: g["count"] for g in d["groups"] if g["key"] in {"1", "2", "3"}}
        total = sum(totals.values())
        assert total == d["total"], f"expected all assigned, got {totals} total={d['total']}"
        # roughly equal — max diff <=1
        vals = list(totals.values())
        assert max(vals) - min(vals) <= 1

    def test_put_groups_with_teacher_and_duplicate_key(self, h, teacher_id):
        # First get current
        r = requests.get(f"{BASE_URL}/api/courses/{COURSE_ID}/groups", headers=h)
        d = r.json()
        groups = [{"key": g["key"], "name": g["name"], "teacher_id": g.get("teacher_id")} for g in d["groups"]]
        # assign teacher to group 1
        for g in groups:
            if g["key"] == "1":
                g["teacher_id"] = teacher_id
                g["name"] = "مجموعة 1 معدلة"
        r = requests.put(f"{BASE_URL}/api/courses/{COURSE_ID}/groups", headers=h, json={"groups": groups})
        assert r.status_code == 200, r.text
        d = r.json()
        g1 = next(g for g in d["groups"] if g["key"] == "1")
        assert g1["teacher_id"] == teacher_id
        assert g1["name"] == "مجموعة 1 معدلة"
        assert g1["teacher_name"]

        # duplicate key
        bad = groups + [{"key": "1", "name": "dup", "teacher_id": None}]
        r = requests.put(f"{BASE_URL}/api/courses/{COURSE_ID}/groups", headers=h, json={"groups": bad})
        assert r.status_code == 400

    def test_put_remove_group_moves_students_to_unassigned(self, h):
        r = requests.get(f"{BASE_URL}/api/courses/{COURSE_ID}/groups", headers=h)
        d = r.json()
        g3 = next((g for g in d["groups"] if g["key"] == "3"), None)
        assert g3 and g3["count"] > 0
        # remove group 3
        new_groups = [{"key": g["key"], "name": g["name"], "teacher_id": g.get("teacher_id")}
                      for g in d["groups"] if g["key"] != "3"]
        r = requests.put(f"{BASE_URL}/api/courses/{COURSE_ID}/groups", headers=h, json={"groups": new_groups})
        assert r.status_code == 200
        d2 = r.json()
        assert all(g["key"] != "3" for g in d2["groups"])
        assert len(d2["unassigned"]) >= g3["count"]

    def test_assign_endpoint_invalid_and_valid(self, h):
        r = requests.get(f"{BASE_URL}/api/courses/{COURSE_ID}/groups", headers=h)
        d = r.json()
        assert d["unassigned"], "need unassigned students"
        sid = d["unassigned"][0]["student_id"]
        # invalid group
        r = requests.post(f"{BASE_URL}/api/courses/{COURSE_ID}/groups/assign",
                          headers=h, json={"student_ids": [sid], "group": "99"})
        assert r.status_code == 400
        # assign to group 2
        r = requests.post(f"{BASE_URL}/api/courses/{COURSE_ID}/groups/assign",
                          headers=h, json={"student_ids": [sid], "group": "2"})
        assert r.status_code == 200
        assert r.json()["updated"] == 1
        # verify via GET
        d2 = requests.get(f"{BASE_URL}/api/courses/{COURSE_ID}/groups", headers=h).json()
        g2 = next(g for g in d2["groups"] if g["key"] == "2")
        assert any(s["student_id"] == sid for s in g2["students"])
        # remove (empty group)
        r = requests.post(f"{BASE_URL}/api/courses/{COURSE_ID}/groups/assign",
                          headers=h, json={"student_ids": [sid], "group": ""})
        assert r.status_code == 200
        d3 = requests.get(f"{BASE_URL}/api/courses/{COURSE_ID}/groups", headers=h).json()
        assert any(s["student_id"] == sid for s in d3["unassigned"])

    def test_student_groups_endpoint(self, h):
        d = requests.get(f"{BASE_URL}/api/courses/{COURSE_ID}/groups", headers=h).json()
        g = next((g for g in d["groups"] if g["count"] > 0), None)
        assert g
        sid = g["students"][0]["student_id"]
        r = requests.get(f"{BASE_URL}/api/students/{sid}/groups", headers=h)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        rec = next((x for x in arr if x["course_id"] == COURSE_ID), None)
        assert rec, "course should appear"
        assert rec["group"] == g["key"]
        assert rec["group_name"]

    def test_enrollments_contain_group_field(self, h):
        r = requests.get(f"{BASE_URL}/api/enrollments/{COURSE_ID}", headers=h)
        assert r.status_code == 200
        rows = r.json()
        if isinstance(rows, dict):
            rows = rows.get("enrollments") or rows.get("items") or []
        assert rows
        assert all("group" in e for e in rows), "every enrollment must have 'group' field"

    def test_course_contains_groups(self, h):
        r = requests.get(f"{BASE_URL}/api/courses/{COURSE_ID}", headers=h)
        assert r.status_code == 200
        c = r.json()
        assert "groups" in c
        assert isinstance(c["groups"], list)


class TestGroupLectures:
    """Lectures for a specific group"""

    @pytest.fixture(scope="class")
    def future_date(self):
        return (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%d")

    @pytest.fixture(scope="class")
    def created_lectures(self):
        return []

    def _lecture_payload(self, date, start, end, group):
        return {
            "course_id": COURSE_ID,
            "date": date,
            "start_time": start,
            "end_time": end,
            "lecture_type": "عملي",
            "group": group,
            "room_id": "",
            "notes": "TEST_group_lecture"
        }

    def test_create_group_lecture(self, h, future_date, created_lectures):
        # Ensure groups 1 and 2 have DIFFERENT teachers so parallel group lectures don't conflict
        tr = requests.get(f"{BASE_URL}/api/teachers", headers=h).json()
        teachers = tr if isinstance(tr, list) else (tr.get("teachers") or tr.get("items") or [])
        t1 = str(teachers[0].get("id") or teachers[0].get("_id"))
        t2 = str(teachers[1].get("id") or teachers[1].get("_id"))
        gr = requests.get(f"{BASE_URL}/api/courses/{COURSE_ID}/groups", headers=h).json()
        new_groups = []
        for g in gr["groups"]:
            new_groups.append({"key": g["key"], "name": g["name"],
                               "teacher_id": t1 if g["key"] == "1" else (t2 if g["key"] == "2" else g.get("teacher_id"))})
        requests.put(f"{BASE_URL}/api/courses/{COURSE_ID}/groups", headers=h, json={"groups": new_groups})

        r = requests.post(f"{BASE_URL}/api/lectures", headers=h,
                          json=self._lecture_payload(future_date, "10:00", "11:00", "1"))
        assert r.status_code in (200, 201), r.text
        lec = r.json()
        lec_id = lec.get("id") or lec.get("_id") or lec.get("lecture_id")
        assert lec_id
        created_lectures.append(lec_id)
        # Verify stored group via details
        d = requests.get(f"{BASE_URL}/api/lectures/{lec_id}/details", headers=h).json()
        lec_full = d.get("lecture") or d
        assert lec_full.get("group") == "1"
        assert lec_full.get("group_name")

    def test_parallel_group2_same_time_ok(self, h, future_date, created_lectures):
        r = requests.post(f"{BASE_URL}/api/lectures", headers=h,
                          json=self._lecture_payload(future_date, "10:00", "11:00", "2"))
        assert r.status_code in (200, 201), r.text
        lec = r.json()
        lec_id = lec.get("id") or lec.get("_id") or lec.get("lecture_id")
        created_lectures.append(lec_id)

    def test_overlap_same_group_rejected(self, h, future_date):
        r = requests.post(f"{BASE_URL}/api/lectures", headers=h,
                          json=self._lecture_payload(future_date, "10:30", "11:30", "1"))
        assert r.status_code == 400, f"expected conflict 400, got {r.status_code}: {r.text}"

    def test_invalid_group_rejected(self, h, future_date):
        r = requests.post(f"{BASE_URL}/api/lectures", headers=h,
                          json=self._lecture_payload(future_date, "12:00", "13:00", "999"))
        assert r.status_code == 400

    def test_lecture_details_shows_group_students_only(self, h, created_lectures):
        assert created_lectures
        lec_id = created_lectures[0]
        r = requests.get(f"{BASE_URL}/api/lectures/{lec_id}/details", headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        lec = d.get("lecture") or d
        students = d.get("students") or []
        assert lec.get("group") == "1"
        # count equals group 1 count
        g = requests.get(f"{BASE_URL}/api/courses/{COURSE_ID}/groups", headers=h).json()
        g1 = next(x for x in g["groups"] if x["key"] == "1")
        assert len(students) == g1["count"], f"students {len(students)} != group count {g1['count']}"

    def test_cleanup(self, h, created_lectures):
        for lid in created_lectures:
            requests.delete(f"{BASE_URL}/api/lectures/{lid}", headers=h)
