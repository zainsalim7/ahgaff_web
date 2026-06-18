"""Regression tests for active semester consistency across endpoints.

Issue: Different endpoints (teacher pages, course list, course details, lectures)
were returning inconsistent counts/data because they applied active-semester
filtering differently.

Fix: All endpoints now use the shared _active_semester helper module,
and lecture-related endpoints filter by the course's OWN semester for
intuitive UX (when opening a closed-semester course, you see its lectures).
"""
import asyncio
import os
import sys

import pytest
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend/backend")

from routes._active_semester import (  # noqa: E402
    apply_lecture_active_sem,
    get_active_semester,
    get_teacher_active_course_ids,
    lecture_active_semester_clauses,
)


def test_lecture_clauses_no_active_sem():
    """No active sem → empty clauses."""
    assert lecture_active_semester_clauses(None) == []


def test_lecture_clauses_no_dates():
    """Active sem with no dates → only semester_id match."""
    clauses = lecture_active_semester_clauses({
        "id": "sem1", "name": "T", "start_date": None, "end_date": None,
    })
    assert clauses == [{"semester_id": "sem1"}]


def test_lecture_clauses_with_dates():
    """Active sem with dates → semester_id OR (no-sem-id AND date-in-range)."""
    clauses = lecture_active_semester_clauses({
        "id": "sem2", "name": "T2",
        "start_date": "2026-01-01", "end_date": "2026-06-30",
    })
    assert len(clauses) == 2
    assert clauses[0] == {"semester_id": "sem2"}
    assert "$and" in clauses[1]


def test_apply_lecture_active_sem_preserves_existing_or():
    """apply_lecture_active_sem must not silently overwrite an existing $or."""
    match = {"course_id": "c1", "$or": [{"status": "scheduled"}]}
    apply_lecture_active_sem(match, {
        "id": "sem1", "name": "T", "start_date": None, "end_date": None,
    })
    assert "$and" in match
    assert "$or" not in match  # collapsed into $and


def test_apply_lecture_active_sem_adds_or_when_no_existing():
    match = {"course_id": "c1"}
    apply_lecture_active_sem(match, {
        "id": "sem1", "name": "T", "start_date": None, "end_date": None,
    })
    assert match["$or"] == [{"semester_id": "sem1"}]


def test_apply_lecture_active_sem_no_sem_is_noop():
    match = {"course_id": "c1"}
    apply_lecture_active_sem(match, None)
    assert match == {"course_id": "c1"}


def _run(coro):
    """Helper to run async db coroutines without pytest-asyncio."""
    return asyncio.get_event_loop().run_until_complete(coro)


def test_get_active_semester_returns_dict_or_none():
    async def _go():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        try:
            db = client[os.environ["DB_NAME"]]
            sem = await get_active_semester(db)
            if sem is not None:
                assert "id" in sem and "name" in sem
        finally:
            client.close()
    _run(_go())


def test_teacher_course_ids_union_returns_set():
    async def _go():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        try:
            db = client[os.environ["DB_NAME"]]
            sem = await get_active_semester(db)
            teacher = await db.teachers.find_one()
            if teacher and sem:
                ids = await get_teacher_active_course_ids(db, str(teacher["_id"]), sem)
                assert isinstance(ids, set)
        finally:
            client.close()
    _run(_go())
