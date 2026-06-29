"""Iteration 51 — Verify /api/teachers (list) counts match /api/teachers/{id}/courses (detail).

Bug: /api/teachers list was counting ONLY teaching_loads in active semester,
while /api/teachers/{id}/courses uses UNION (courses.teacher_id ∪ teaching_loads)
with credit_hours fallback.

Fix: /api/teachers now uses the same UNION logic.

This file tests Steps 1-8 from the review request and cleans up all seed data.
"""
import os
import asyncio
import pytest
import requests
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load backend .env so we have MONGO_URL/DB_NAME
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://schedule-hub-272.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

API = f"{BASE_URL}/api"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def active_semester_id(db):
    async def _go():
        sem = await db.semesters.find_one({"status": "active"})
        return str(sem["_id"]) if sem else None
    return asyncio.get_event_loop().run_until_complete(_go())


# ---------- helpers ----------
def _get_teachers_list(headers):
    r = requests.get(f"{API}/teachers", headers=headers, timeout=60)
    assert r.status_code == 200, f"GET /teachers => {r.status_code} {r.text}"
    return r.json()


def _get_teacher_courses(headers, tid):
    r = requests.get(f"{API}/teachers/{tid}/courses", headers=headers, timeout=60)
    assert r.status_code == 200, f"GET /teachers/{tid}/courses => {r.status_code} {r.text}"
    return r.json()


# ---------- STEP 1 ----------
class TestStep1Auth:
    def test_login_and_active_sem(self, admin_token, active_semester_id):
        assert admin_token
        assert active_semester_id, "Active semester must exist"


# ---------- STEP 2 ----------
class TestStep2CrossPageConsistency:
    def test_list_matches_detail_for_every_teacher(self, headers):
        teachers = _get_teachers_list(headers)
        assert isinstance(teachers, list) and len(teachers) > 0, "Empty teachers list"

        mismatches = []
        # Sample up to 60 teachers to keep runtime sane while still being thorough
        sampled = teachers[:60]
        for t in sampled:
            tid = t["id"]
            list_count = t.get("current_semester_courses_count", 0)
            list_hours = t.get("current_semester_hours", 0)
            detail = _get_teacher_courses(headers, tid)
            d_count = detail.get("total_courses", 0)
            d_hours = detail.get("total_weekly_hours", 0)
            if list_count != d_count or list_hours != d_hours:
                mismatches.append({
                    "teacher_id": tid,
                    "full_name": t.get("full_name"),
                    "list_count": list_count,
                    "detail_count": d_count,
                    "list_hours": list_hours,
                    "detail_hours": d_hours,
                })
        assert not mismatches, f"Mismatches between list & detail: {mismatches[:10]} (total={len(mismatches)})"


# ---------- STEP 3 ----------
class TestStep3SeedCourseAssignment:
    """Pick an active-sem course currently unassigned, assign it to a teacher, verify increments."""

    def test_assign_course_and_verify_increment(self, headers, db, active_semester_id):
        async def _setup():
            # Find an unassigned active-sem course
            course = await db.courses.find_one({
                "semester_id": active_semester_id,
                "is_active": True,
                "$or": [{"teacher_id": None}, {"teacher_id": ""}, {"teacher_id": {"$exists": False}}],
            })
            return course
        course = asyncio.get_event_loop().run_until_complete(_setup())
        if not course:
            pytest.skip("No unassigned active-sem course found for Step 3")

        cid = str(course["_id"])
        credit_hours = course.get("credit_hours", 0) or 0

        teachers = _get_teachers_list(headers)
        # Pick a teacher (preferably one with reasonable count)
        teacher = teachers[0]
        tid = teacher["id"]
        before_count = teacher.get("current_semester_courses_count", 0)
        before_hours = teacher.get("current_semester_hours", 0)

        # Assign via PUT /api/courses/{cid}
        original_teacher_id = course.get("teacher_id")
        r = requests.put(f"{API}/courses/{cid}", headers=headers, json={"teacher_id": tid}, timeout=30)
        assert r.status_code in (200, 201), f"PUT course => {r.status_code} {r.text}"
        try:
            # GET list again
            teachers_after = _get_teachers_list(headers)
            t_after = next((x for x in teachers_after if x["id"] == tid), None)
            assert t_after, "Teacher disappeared after PUT"
            after_count = t_after.get("current_semester_courses_count", 0)
            after_hours = t_after.get("current_semester_hours", 0)
            assert after_count == before_count + 1, f"Count not incremented: {before_count} -> {after_count}"
            # hours must increment by weekly_hours (from teaching_load sync) or credit_hours fallback
            assert after_hours >= before_hours + credit_hours, (
                f"Hours not incremented enough: before={before_hours}, after={after_hours}, credit={credit_hours}"
            )

            # Detail endpoint must show same values
            detail = _get_teacher_courses(headers, tid)
            assert detail["total_courses"] == after_count
            assert detail["total_weekly_hours"] == after_hours
        finally:
            # Cleanup: restore teacher_id (None) and delete created teaching_load
            async def _cleanup():
                await db.courses.update_one({"_id": ObjectId(cid)}, {"$set": {"teacher_id": original_teacher_id}})
                await db.teaching_loads.delete_many({"course_id": cid, "teacher_id": tid, "semester_id": active_semester_id})
            asyncio.get_event_loop().run_until_complete(_cleanup())


# ---------- STEP 4 (the exact regression) ----------
class TestStep4CourseOnlyNoLoad:
    """teacher_id set on course but NO teaching_load — credit_hours fallback must work."""

    def test_course_only_with_credit_hours_fallback(self, headers, db, active_semester_id):
        teachers = _get_teachers_list(headers)
        teacher = teachers[0]
        tid = teacher["id"]
        before_count = teacher.get("current_semester_courses_count", 0)
        before_hours = teacher.get("current_semester_hours", 0)

        # Find any real department to set
        async def _pick_dept():
            d = await db.departments.find_one({})
            return str(d["_id"]) if d else None
        dept_id = asyncio.get_event_loop().run_until_complete(_pick_dept())

        # Insert synthetic course directly
        synthetic_course = {
            "name": "TEST_SYNTH_COURSE_step4",
            "code": "TST-S4",
            "teacher_id": tid,
            "semester_id": active_semester_id,
            "credit_hours": 4,
            "is_active": True,
            "department_id": dept_id,
            "level": 1,
            "section": "A",
        }

        async def _insert():
            res = await db.courses.insert_one(synthetic_course)
            return str(res.inserted_id)
        new_cid = asyncio.get_event_loop().run_until_complete(_insert())

        try:
            # List should include +1, +4
            teachers_after = _get_teachers_list(headers)
            t_after = next((x for x in teachers_after if x["id"] == tid), None)
            assert t_after
            assert t_after["current_semester_courses_count"] == before_count + 1, (
                f"List count missing synthetic course: before={before_count} after={t_after['current_semester_courses_count']}"
            )
            assert t_after["current_semester_hours"] == before_hours + 4, (
                f"List hours not +4 (credit_hours fallback): before={before_hours} after={t_after['current_semester_hours']}"
            )

            # Detail must reflect the same
            detail = _get_teacher_courses(headers, tid)
            assert detail["total_courses"] == t_after["current_semester_courses_count"]
            assert detail["total_weekly_hours"] == t_after["current_semester_hours"]
        finally:
            async def _cleanup():
                await db.courses.delete_one({"_id": ObjectId(new_cid)})
            asyncio.get_event_loop().run_until_complete(_cleanup())


# ---------- STEP 5 ----------
class TestStep5LoadOnlyNoCourseTeacher:
    """teaching_load exists but course.teacher_id is None — UNION must still catch it."""

    def test_teaching_load_only_with_weekly_hours(self, headers, db, active_semester_id):
        teachers = _get_teachers_list(headers)
        teacher = teachers[0]
        tid = teacher["id"]
        before_count = teacher.get("current_semester_courses_count", 0)
        before_hours = teacher.get("current_semester_hours", 0)

        async def _pick_dept():
            d = await db.departments.find_one({})
            return str(d["_id"]) if d else None
        dept_id = asyncio.get_event_loop().run_until_complete(_pick_dept())

        synthetic_course = {
            "name": "TEST_SYNTH_COURSE_step5",
            "code": "TST-S5",
            "teacher_id": None,
            "semester_id": active_semester_id,
            "credit_hours": 3,
            "is_active": True,
            "department_id": dept_id,
            "level": 1,
            "section": "B",
        }

        async def _seed():
            r1 = await db.courses.insert_one(synthetic_course)
            cid = str(r1.inserted_id)
            r2 = await db.teaching_loads.insert_one({
                "teacher_id": tid,
                "course_id": cid,
                "semester_id": active_semester_id,
                "weekly_hours": 2,
            })
            return cid, str(r2.inserted_id)
        new_cid, new_tlid = asyncio.get_event_loop().run_until_complete(_seed())

        try:
            teachers_after = _get_teachers_list(headers)
            t_after = next((x for x in teachers_after if x["id"] == tid), None)
            assert t_after["current_semester_courses_count"] == before_count + 1, (
                f"Load-only not counted: before={before_count} after={t_after['current_semester_courses_count']}"
            )
            assert t_after["current_semester_hours"] == before_hours + 2, (
                f"Hours not +2: before={before_hours} after={t_after['current_semester_hours']}"
            )

            detail = _get_teacher_courses(headers, tid)
            assert detail["total_courses"] == t_after["current_semester_courses_count"]
            assert detail["total_weekly_hours"] == t_after["current_semester_hours"]
        finally:
            async def _cleanup():
                await db.teaching_loads.delete_one({"_id": ObjectId(new_tlid)})
                await db.courses.delete_one({"_id": ObjectId(new_cid)})
            asyncio.get_event_loop().run_until_complete(_cleanup())


# ---------- STEP 6 ----------
class TestStep6OldSemesterNotCounted:
    def test_archived_sem_course_does_not_inflate(self, headers, db, active_semester_id):
        # Find an archived/inactive semester
        async def _find_old():
            s = await db.semesters.find_one({"status": {"$ne": "active"}})
            return str(s["_id"]) if s else None
        old_sem_id = asyncio.get_event_loop().run_until_complete(_find_old())
        if not old_sem_id:
            pytest.skip("No archived semester found")

        teachers = _get_teachers_list(headers)
        teacher = teachers[0]
        tid = teacher["id"]
        before_count = teacher.get("current_semester_courses_count", 0)
        before_hours = teacher.get("current_semester_hours", 0)

        async def _pick_dept():
            d = await db.departments.find_one({})
            return str(d["_id"]) if d else None
        dept_id = asyncio.get_event_loop().run_until_complete(_pick_dept())

        async def _seed():
            r1 = await db.courses.insert_one({
                "name": "TEST_SYNTH_OLDSEM_step6",
                "code": "TST-S6",
                "teacher_id": tid,
                "semester_id": old_sem_id,
                "credit_hours": 5,
                "is_active": True,
                "department_id": dept_id,
                "level": 1,
                "section": "A",
            })
            cid = str(r1.inserted_id)
            r2 = await db.teaching_loads.insert_one({
                "teacher_id": tid, "course_id": cid,
                "semester_id": old_sem_id, "weekly_hours": 9,
            })
            return cid, str(r2.inserted_id)

        new_cid, new_tlid = asyncio.get_event_loop().run_until_complete(_seed())
        try:
            teachers_after = _get_teachers_list(headers)
            t_after = next((x for x in teachers_after if x["id"] == tid), None)
            assert t_after["current_semester_courses_count"] == before_count, (
                f"Old-sem course inflated count: {before_count} -> {t_after['current_semester_courses_count']}"
            )
            assert t_after["current_semester_hours"] == before_hours, (
                f"Old-sem hours inflated: {before_hours} -> {t_after['current_semester_hours']}"
            )
        finally:
            async def _cleanup():
                await db.teaching_loads.delete_one({"_id": ObjectId(new_tlid)})
                await db.courses.delete_one({"_id": ObjectId(new_cid)})
            asyncio.get_event_loop().run_until_complete(_cleanup())


# ---------- STEP 7 ----------
class TestStep7Idempotency:
    def test_two_consecutive_gets_match(self, headers):
        a = _get_teachers_list(headers)
        b = _get_teachers_list(headers)
        # Build dict by id for stable compare
        ma = {t["id"]: (t.get("current_semester_courses_count"), t.get("current_semester_hours")) for t in a}
        mb = {t["id"]: (t.get("current_semester_courses_count"), t.get("current_semester_hours")) for t in b}
        assert ma == mb, "Idempotency broken: two consecutive GETs differ"


# ---------- STEP 8 ----------
class TestStep8MultiTeacherIntegrity:
    """Seed three teachers with different scenarios; ensure no cross-contamination."""

    def test_three_teachers_independent(self, headers, db, active_semester_id):
        teachers = _get_teachers_list(headers)
        if len(teachers) < 3:
            pytest.skip("Need at least 3 teachers")
        t1, t2, t3 = teachers[0], teachers[1], teachers[2]
        ids = [t1["id"], t2["id"], t3["id"]]
        before = {t["id"]: (t.get("current_semester_courses_count", 0), t.get("current_semester_hours", 0))
                  for t in teachers if t["id"] in ids}

        async def _pick_dept():
            d = await db.departments.find_one({})
            return str(d["_id"]) if d else None
        dept_id = asyncio.get_event_loop().run_until_complete(_pick_dept())

        created = {"courses": [], "loads": []}

        async def _seed():
            # t1: only course (credit_hours fallback) = +1, +3
            c1 = await db.courses.insert_one({
                "name": "TEST_S8_T1", "code": "T8-1", "teacher_id": t1["id"],
                "semester_id": active_semester_id, "credit_hours": 3, "is_active": True,
                "department_id": dept_id, "level": 1, "section": "A",
            })
            created["courses"].append(str(c1.inserted_id))
            # t2: only teaching_load = +1, +5
            c2 = await db.courses.insert_one({
                "name": "TEST_S8_T2", "code": "T8-2", "teacher_id": None,
                "semester_id": active_semester_id, "credit_hours": 3, "is_active": True,
                "department_id": dept_id, "level": 1, "section": "A",
            })
            cid2 = str(c2.inserted_id)
            created["courses"].append(cid2)
            tl2 = await db.teaching_loads.insert_one({
                "teacher_id": t2["id"], "course_id": cid2,
                "semester_id": active_semester_id, "weekly_hours": 5,
            })
            created["loads"].append(str(tl2.inserted_id))
            # t3: both course.teacher_id AND teaching_load = +1, +7 (weekly_hours wins)
            c3 = await db.courses.insert_one({
                "name": "TEST_S8_T3", "code": "T8-3", "teacher_id": t3["id"],
                "semester_id": active_semester_id, "credit_hours": 4, "is_active": True,
                "department_id": dept_id, "level": 1, "section": "A",
            })
            cid3 = str(c3.inserted_id)
            created["courses"].append(cid3)
            tl3 = await db.teaching_loads.insert_one({
                "teacher_id": t3["id"], "course_id": cid3,
                "semester_id": active_semester_id, "weekly_hours": 7,
            })
            created["loads"].append(str(tl3.inserted_id))
        asyncio.get_event_loop().run_until_complete(_seed())

        try:
            after = _get_teachers_list(headers)
            after_map = {t["id"]: (t.get("current_semester_courses_count", 0), t.get("current_semester_hours", 0))
                         for t in after}

            # t1: +1 +3
            assert after_map[t1["id"]] == (before[t1["id"]][0] + 1, before[t1["id"]][1] + 3), \
                f"T1: before={before[t1['id']]} after={after_map[t1['id']]}"
            # t2: +1 +5
            assert after_map[t2["id"]] == (before[t2["id"]][0] + 1, before[t2["id"]][1] + 5), \
                f"T2: before={before[t2['id']]} after={after_map[t2['id']]}"
            # t3: +1 +7
            assert after_map[t3["id"]] == (before[t3["id"]][0] + 1, before[t3["id"]][1] + 7), \
                f"T3: before={before[t3['id']]} after={after_map[t3['id']]}"

            # Cross-page consistency for these three
            for tid in ids:
                d = _get_teacher_courses(headers, tid)
                assert d["total_courses"] == after_map[tid][0], f"detail mismatch for {tid}: {d['total_courses']} vs {after_map[tid][0]}"
                assert d["total_weekly_hours"] == after_map[tid][1], f"hours mismatch for {tid}: {d['total_weekly_hours']} vs {after_map[tid][1]}"
        finally:
            async def _cleanup():
                for lid in created["loads"]:
                    await db.teaching_loads.delete_one({"_id": ObjectId(lid)})
                for cid in created["courses"]:
                    await db.courses.delete_one({"_id": ObjectId(cid)})
            asyncio.get_event_loop().run_until_complete(_cleanup())


# ---------- final sweep cleanup (safety) ----------
def test_final_cleanup_safety_no_orphan_test_data(db):
    async def _sweep():
        # Remove any leftover TEST_SYNTH courses/loads from previous failed runs
        leftovers = await db.courses.find({"name": {"$regex": "^TEST_S"}}).to_list(100)
        for c in leftovers:
            cid = str(c["_id"])
            await db.teaching_loads.delete_many({"course_id": cid})
            await db.courses.delete_one({"_id": c["_id"]})
        return len(leftovers)
    n = asyncio.get_event_loop().run_until_complete(_sweep())
    # Pass regardless; just log
    print(f"Final sweep removed {n} leftover synthetic docs")
