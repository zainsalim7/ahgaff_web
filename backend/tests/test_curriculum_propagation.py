"""
Tests for curriculum -> courses -> teaching_loads propagation fix
in POST /api/curriculum/generate-offerings.

Verifies that when curriculum_course.credit_hours (or weekly_hours/name/code)
is edited and generate-offerings runs again for the active semester,
the existing linked courses in that semester get UPDATED (not silently
skipped), and teaching_loads.weekly_hours for assigned teachers are also
updated.

Strategy: this test SEEDS a linked course via generate-offerings itself
(since that endpoint sets `curriculum_course_id`), modifies the cc, and
re-runs generate-offerings. Cleanup restores original cc value and deletes
auto-generated courses created by the test.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    'REACT_APP_BACKEND_URL',
    'https://schedule-hub-272.preview.emergentagent.com'
).rstrip('/')


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "admin", "password": "admin123"}, timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def active_semester(headers):
    r = requests.get(f"{BASE_URL}/api/semesters", headers=headers, timeout=30)
    assert r.status_code == 200
    sems = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    active = next(
        (s for s in sems if s.get("status") == "active" or s.get("is_active")),
        None,
    )
    assert active, f"no active semester among {len(sems)}"
    return active


@pytest.fixture(scope="module")
def cc_and_seeded_course(headers, active_semester):
    """Find a curriculum_course matching the active semester's term,
    run generate-offerings to seed a linked course (default_sections=1 → section=''),
    and return ids."""
    sem = active_semester
    sem_id = sem.get("id") or sem.get("_id")
    sem_term = sem.get("term")

    # list all departments
    r = requests.get(f"{BASE_URL}/api/departments", headers=headers, timeout=30)
    assert r.status_code == 200
    depts = r.json() if isinstance(r.json(), list) else r.json().get("items", [])

    # find a dept with a curriculum_course matching the active term
    cc, dept_id = None, None
    for d in depts:
        did = d.get("id") or d.get("_id")
        params = {"department_id": did}
        if sem_term in (1, 2, 3):
            params["term"] = sem_term
        rr = requests.get(
            f"{BASE_URL}/api/curriculum/courses",
            headers=headers, params=params, timeout=30,
        )
        if rr.status_code == 200:
            items = rr.json().get("items", [])
            if items:
                cc = items[0]
                dept_id = did
                break
    assert cc, f"no curriculum_course found matching active sem term={sem_term}"
    cc_id = cc.get("id") or cc.get("_id")

    # Seed: run generate-offerings (default_sections=1 → section='')
    r = requests.post(
        f"{BASE_URL}/api/curriculum/generate-offerings",
        headers=headers,
        params={"semester_id": sem_id, "department_id": dept_id, "skip_existing": True},
        json={"default_sections": 1},
        timeout=60,
    )
    assert r.status_code == 200, f"seed generate-offerings failed: {r.status_code} {r.text}"

    # find the seeded course via auto-generated-courses (it exposes curriculum_course_id)
    rc = requests.get(
        f"{BASE_URL}/api/curriculum/auto-generated-courses",
        headers=headers,
        params={"semester_id": sem_id, "department_id": dept_id},
        timeout=30,
    )
    assert rc.status_code == 200, rc.text
    cs = rc.json().get("items", [])
    seeded = next(
        (c for c in cs if c.get("curriculum_course_id") == cc_id
         and (c.get("section") or "") == ""),
        None,
    )
    assert seeded, (
        f"seed didn't create linked course. cc={cc_id}, auto-gen={len(cs)}, "
        f"sample={cs[:2]}"
    )

    info = {
        "cc": cc,
        "cc_id": cc_id,
        "course_id": seeded.get("id") or seeded.get("_id"),
        "dept_id": dept_id,
        "sem_id": sem_id,
        "original_credit": int(cc.get("credit_hours") or 3),
        "original_weekly": cc.get("weekly_hours"),
        "seeded_course": seeded,
    }
    yield info

    # ---------- cleanup ----------
    try:
        # restore original credit/weekly
        restore = {"credit_hours": info["original_credit"]}
        if info["original_weekly"] is not None:
            restore["weekly_hours"] = info["original_weekly"]
        requests.put(
            f"{BASE_URL}/api/curriculum/courses/{cc_id}",
            headers=headers, json=restore, timeout=30,
        )
        # propagate restore
        requests.post(
            f"{BASE_URL}/api/curriculum/generate-offerings",
            headers=headers,
            params={"semester_id": sem_id, "department_id": dept_id, "skip_existing": True},
            json={"default_sections": 1}, timeout=60,
        )
    except Exception:
        pass


# ---------- helpers ----------

def _put_cc(headers, cc_id, payload):
    return requests.put(
        f"{BASE_URL}/api/curriculum/courses/{cc_id}",
        headers=headers, json=payload, timeout=30,
    )


def _gen(headers, sem_id, dept_id):
    return requests.post(
        f"{BASE_URL}/api/curriculum/generate-offerings",
        headers=headers,
        params={"semester_id": sem_id, "department_id": dept_id, "skip_existing": True},
        json={"default_sections": 1},
        timeout=60,
    )


# ---------- tests ----------

class TestPropagation:

    def test_response_includes_updated_field(self, headers, cc_and_seeded_course):
        info = cc_and_seeded_course
        r = _gen(headers, info["sem_id"], info["dept_id"])
        assert r.status_code == 200, r.text
        data = r.json()
        assert "updated" in data, f"missing 'updated' in {data.keys()}"
        assert "created" in data
        assert "skipped" in data
        assert isinstance(data["updated"], int)
        assert isinstance(data["created"], int)
        assert isinstance(data["skipped"], int)

    def test_no_diff_is_skipped_not_updated(self, headers, cc_and_seeded_course):
        info = cc_and_seeded_course
        # 2nd call right after seed — nothing changed → updated should be 0
        r = _gen(headers, info["sem_id"], info["dept_id"])
        assert r.status_code == 200
        data = r.json()
        assert data["updated"] == 0, (
            f"expected updated=0 with no diff, got {data}"
        )
        # created should be 0 too (course already exists)
        assert data["created"] == 0, f"unexpected create: {data}"
        # skipped should be >= 1
        assert data["skipped"] >= 1, f"expected skipped>=1, got {data}"

    def test_credit_hours_change_propagates_to_course_and_teaching_load(
        self, headers, cc_and_seeded_course
    ):
        info = cc_and_seeded_course
        cc_id = info["cc_id"]
        course_id = info["course_id"]
        original = info["original_credit"]
        new_credit = 5 if original != 5 else 4

        # 1) edit cc
        r = _put_cc(headers, cc_id, {"credit_hours": new_credit})
        assert r.status_code == 200, f"PUT cc: {r.status_code} {r.text}"

        # 2) generate-offerings
        r = _gen(headers, info["sem_id"], info["dept_id"])
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["updated"] >= 1, f"expected updated>=1, got {data}"
        # message should reflect the update
        msg = data.get("message", "")
        assert "تحديث" in msg or "update" in msg.lower(), f"msg lacks update mention: {msg}"

        # 3) verify the course reflects new credit_hours
        rc = requests.get(f"{BASE_URL}/api/courses/{course_id}", headers=headers, timeout=30)
        assert rc.status_code == 200, rc.text
        course = rc.json()
        assert course.get("credit_hours") == new_credit, (
            f"course.credit_hours not propagated: expected {new_credit}, "
            f"got {course.get('credit_hours')} (full={course})"
        )

        # 4) verify teaching_loads if any (filter by exact course_id on client side
        #    because the API may ignore the course_id query param)
        rl = requests.get(
            f"{BASE_URL}/api/teaching-load",
            headers=headers,
            params={"all_semesters": "true"},
            timeout=30,
        )
        if rl.status_code == 200:
            tls = rl.json() if isinstance(rl.json(), list) else rl.json().get("items", [])
            matching = [tl for tl in tls if tl.get("course_id") == course_id]
            for tl in matching:
                expected = course.get("weekly_hours") or new_credit
                assert tl.get("weekly_hours") == expected, (
                    f"teaching_load weekly_hours mismatch for course {course_id}: "
                    f"got {tl.get('weekly_hours')}, expected {expected}, tl={tl}"
                )


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v", "-s"]))
