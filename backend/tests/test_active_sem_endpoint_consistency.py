"""End-to-end HTTP consistency tests for active-semester filtering.

Per review_request:
- 4 lecture-count endpoints MUST agree for course 698f0000d803b27aab0120af (9 lectures, closed sem)
- Teacher 698e533beb4c6eb021c50302: default → 0, all_semesters/include_all → 3
- /api/teachers/{id}/courses must UNION courses.teacher_id + teaching_loads
- /api/lectures/{course_id}?all_semesters=true still filters by course's own sem
- /api/courses?semester_id=<id> & ?all_semesters=true lecture counts behaviour
- /api/teaching-load/report/advanced smoke test (no regression)
"""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

COURSE_CLOSED_SEM = "698f0000d803b27aab0120af"  # دراسات حضرموت — 9 lectures
TEACHER_HASSAN = "698e533beb4c6eb021c50302"     # حسن صالح
ACTIVE_SEM_ID = "6a21bee0ddb8d04530cf65f4"      # الصيفي 2024-2025
CLOSED_SEM_ID = "698e5cc524745fb79482e099"      # الفصل الثاني


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "admin", "password": "admin123"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- LECTURE-COUNT CONSISTENCY (4 endpoints) ----------

def _count_from_courses_list(auth, course_id, all_semesters=True):
    r = requests.get(
        f"{BASE_URL}/api/courses",
        headers=auth,
        params={"all_semesters": str(all_semesters).lower()},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    for c in r.json():
        if str(c.get("id") or c.get("_id")) == course_id:
            return c.get("lectures_count", c.get("lecture_count"))
    return None


def test_courses_list_reports_lecture_count_for_closed_sem_course(auth):
    cnt = _count_from_courses_list(auth, COURSE_CLOSED_SEM, all_semesters=True)
    assert cnt is not None, f"Course {COURSE_CLOSED_SEM} missing from /api/courses?all_semesters=true"
    assert cnt == 9, f"Expected 9 lectures, got {cnt}"


def test_course_full_details_lecture_count(auth):
    r = requests.get(
        f"{BASE_URL}/api/courses/{COURSE_CLOSED_SEM}/full-details",
        headers=auth, timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    # full-details exposes lectures list or stats
    lectures = data.get("lectures") or []
    stats = data.get("lecture_stats") or data.get("stats") or {}
    total = stats.get("total") if isinstance(stats, dict) else None
    actual = total if total is not None else len(lectures)
    assert actual == 9, f"full-details reports {actual} lectures (lectures={len(lectures)}, stats.total={total})"


def test_course_lecture_stats_endpoint(auth):
    r = requests.get(
        f"{BASE_URL}/api/courses/{COURSE_CLOSED_SEM}/lecture-stats",
        headers=auth, timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("total") == 9, f"lecture-stats reports total={data.get('total')}, expected 9. Full: {data}"


def test_lectures_by_course_endpoint(auth):
    r = requests.get(
        f"{BASE_URL}/api/lectures/{COURSE_CLOSED_SEM}",
        headers=auth, timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    lst = data if isinstance(data, list) else data.get("lectures") or data.get("data") or []
    assert len(lst) == 9, f"/api/lectures/{{course_id}} returned {len(lst)} lectures, expected 9"


def test_lectures_by_course_with_all_semesters_flag(auth):
    """Per review_request: ?all_semesters=true should still filter by course's own sem (9)."""
    r = requests.get(
        f"{BASE_URL}/api/lectures/{COURSE_CLOSED_SEM}",
        headers=auth, params={"all_semesters": "true"}, timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    lst = data if isinstance(data, list) else data.get("lectures") or data.get("data") or []
    assert len(lst) == 9, f"all_semesters=true returned {len(lst)}, expected 9"


def test_four_endpoints_agree(auth):
    """All 4 endpoints MUST report identical count for the same course."""
    c1 = _count_from_courses_list(auth, COURSE_CLOSED_SEM, all_semesters=True)

    r2 = requests.get(f"{BASE_URL}/api/courses/{COURSE_CLOSED_SEM}/full-details", headers=auth, timeout=20).json()
    lectures = r2.get("lectures") or []
    stats = r2.get("lecture_stats") or r2.get("stats") or {}
    c2 = stats.get("total") if isinstance(stats, dict) and stats.get("total") is not None else len(lectures)

    c3 = requests.get(f"{BASE_URL}/api/courses/{COURSE_CLOSED_SEM}/lecture-stats", headers=auth, timeout=20).json().get("total")

    r4 = requests.get(f"{BASE_URL}/api/lectures/{COURSE_CLOSED_SEM}", headers=auth, timeout=20).json()
    lst = r4 if isinstance(r4, list) else r4.get("lectures") or r4.get("data") or []
    c4 = len(lst)

    print(f"Counts: courses-list={c1}, full-details={c2}, lecture-stats={c3}, lectures-by-course={c4}")
    assert c1 == c2 == c3 == c4, f"INCONSISTENT: {c1=} {c2=} {c3=} {c4=}"


# ---------- TEACHER ENDPOINT CONSISTENCY ----------

def test_teacher_courses_default_active_semester(auth):
    """Default (active sem) → 0 courses for حسن صالح."""
    r = requests.get(f"{BASE_URL}/api/teachers/{TEACHER_HASSAN}/courses", headers=auth, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    lst = data if isinstance(data, list) else data.get("courses") or []
    assert len(lst) == 0, f"Expected 0 courses (active sem), got {len(lst)}: {[c.get('name') for c in lst]}"


def test_teacher_full_profile_default_active_semester(auth):
    r = requests.get(f"{BASE_URL}/api/teachers/{TEACHER_HASSAN}/full-profile", headers=auth, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    cc = data.get("courses_count")
    if cc is None:
        cc = len(data.get("courses") or [])
    assert cc == 0, f"full-profile default expected courses_count=0, got {cc}"


def test_teacher_courses_include_all(auth):
    r = requests.get(
        f"{BASE_URL}/api/teachers/{TEACHER_HASSAN}/courses",
        headers=auth, params={"include_all": "true"}, timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    lst = data if isinstance(data, list) else data.get("courses") or []
    assert len(lst) == 3, f"Expected 3 courses with include_all=true, got {len(lst)}"


def test_teacher_full_profile_all_semesters(auth):
    r = requests.get(
        f"{BASE_URL}/api/teachers/{TEACHER_HASSAN}/full-profile",
        headers=auth, params={"all_semesters": "true"}, timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    cc = data.get("courses_count")
    if cc is None:
        cc = len(data.get("courses") or [])
    assert cc == 3, f"full-profile all_semesters=true expected 3, got {cc}"


def test_teacher_courses_and_full_profile_agree_default(auth):
    cs = requests.get(f"{BASE_URL}/api/teachers/{TEACHER_HASSAN}/courses", headers=auth, timeout=20).json()
    fp = requests.get(f"{BASE_URL}/api/teachers/{TEACHER_HASSAN}/full-profile", headers=auth, timeout=20).json()
    c1 = len(cs) if isinstance(cs, list) else len(cs.get("courses") or [])
    c2 = fp.get("courses_count")
    if c2 is None:
        c2 = len(fp.get("courses") or [])
    assert c1 == c2, f"Default-sem mismatch: /courses={c1}, /full-profile.courses_count={c2}"


def test_teacher_courses_and_full_profile_agree_all_semesters(auth):
    cs = requests.get(f"{BASE_URL}/api/teachers/{TEACHER_HASSAN}/courses",
                      headers=auth, params={"include_all": "true"}, timeout=20).json()
    fp = requests.get(f"{BASE_URL}/api/teachers/{TEACHER_HASSAN}/full-profile",
                      headers=auth, params={"all_semesters": "true"}, timeout=20).json()
    c1 = len(cs) if isinstance(cs, list) else len(cs.get("courses") or [])
    c2 = fp.get("courses_count")
    if c2 is None:
        c2 = len(fp.get("courses") or [])
    assert c1 == c2 == 3, f"all_semesters mismatch: /courses={c1}, /full-profile.courses_count={c2}"


# ---------- /api/courses semester filter behaviour ----------

def test_courses_semester_id_filter_returns_lecture_count(auth):
    r = requests.get(f"{BASE_URL}/api/courses", headers=auth,
                     params={"semester_id": CLOSED_SEM_ID}, timeout=20)
    assert r.status_code == 200, r.text
    found = [c for c in r.json() if str(c.get("id") or c.get("_id")) == COURSE_CLOSED_SEM]
    assert found, f"Course {COURSE_CLOSED_SEM} should appear when filtering by its sem {CLOSED_SEM_ID}"
    cnt = found[0].get("lectures_count", found[0].get("lecture_count"))
    assert cnt == 9, f"Expected 9 lectures when filtering by course's sem, got {cnt}"


def test_courses_all_semesters_returns_lecture_count(auth):
    r = requests.get(f"{BASE_URL}/api/courses", headers=auth,
                     params={"all_semesters": "true"}, timeout=20)
    assert r.status_code == 200, r.text
    found = [c for c in r.json() if str(c.get("id") or c.get("_id")) == COURSE_CLOSED_SEM]
    assert found
    cnt = found[0].get("lectures_count", found[0].get("lecture_count"))
    assert cnt == 9, f"all_semesters=true: expected 9 lectures, got {cnt}"


# ---------- REGRESSION: teaching-load advanced report ----------

def test_teaching_load_report_advanced_smoke(auth):
    r = requests.get(f"{BASE_URL}/api/teaching-load/report/advanced", headers=auth, timeout=30)
    assert r.status_code == 200, f"Advanced report regressed: {r.status_code} {r.text[:300]}"
    # must be JSON
    assert isinstance(r.json(), (list, dict))
