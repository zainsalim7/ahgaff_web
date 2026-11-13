# Upcoming-semester isolation: generate-offerings tags courses with target semester; manual lectures must carry the COURSE's semester_id
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
DEPT_ID = "698e500997fef774e66e93a8"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def upcoming(client):
    r = client.post(f"{BASE_URL}/api/semesters", json={
        "name": "الفصل الثاني", "academic_year": "TEST_2030-2031", "term": 2,
        "start_date": "2030-09-01", "end_date": "2031-01-15"})
    assert r.status_code in (200, 201), r.text
    sem_id = r.json().get("id") or r.json().get("_id")
    created = {"courses": [], "lectures": []}
    yield sem_id, created
    for lid in created["lectures"]:
        client.delete(f"{BASE_URL}/api/lectures/{lid}")
    for cid in created["courses"]:
        client.delete(f"{BASE_URL}/api/courses/{cid}")
    client.delete(f"{BASE_URL}/api/semesters/{sem_id}")


def _dept_courses(client):
    d = client.get(f"{BASE_URL}/api/courses").json()
    d = d.get("items", d) if isinstance(d, dict) else d
    return [c for c in d if c.get("department_id") == DEPT_ID]


def test_generate_offerings_isolated(client, upcoming):
    sem_id, created = upcoming
    active = client.get(f"{BASE_URL}/api/semesters/current").json()["id"]
    before_active = len([c for c in _dept_courses(client) if c.get("semester_id") == active])
    r = client.post(f"{BASE_URL}/api/curriculum/generate-offerings",
                    params={"semester_id": sem_id, "department_id": DEPT_ID},
                    json={"sections_map": {}, "default_sections": 1})
    assert r.status_code == 200, r.text
    assert r.json()["created"] > 0
    courses = _dept_courses(client)
    new = [c for c in courses if c.get("semester_id") == sem_id]
    created["courses"].extend(c["id"] for c in new)
    assert len(new) == r.json()["created"]
    assert len([c for c in courses if c.get("semester_id") == active]) == before_active


def test_manual_lecture_uses_course_semester(client, upcoming):
    sem_id, created = upcoming
    assert created["courses"], "depends on previous test"
    r = client.post(f"{BASE_URL}/api/lectures", json={
        "course_id": created["courses"][0], "date": "2030-12-08",
        "start_time": "08:00", "end_time": "09:30", "room": "TEST_ROOM_ISO", "notes": "TEST_"})
    assert r.status_code in (200, 201), r.text
    lid = r.json()["id"]
    created["lectures"].append(lid)
    data = client.get(f"{BASE_URL}/api/lectures/{created['courses'][0]}").json()
    items = data.get("lectures", data) if isinstance(data, dict) else data
    lec = next((l for l in items if (l.get("id") or l.get("_id")) == lid), {})  # empty => lecture invisible on its own course (scoped by course semester)
    # BUG (iteration_182): backend tags manual lectures with ACTIVE semester instead of course's semester
    assert lec.get("semester_id") == sem_id, f"lecture semester_id={lec.get('semester_id')} expected {sem_id}"
