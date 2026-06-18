"""
Active Semester Helper — Single source of truth for active-semester filtering.

All endpoints that aggregate teacher/course/lecture data MUST use these helpers
to ensure consistent results across the entire system.

Goals:
- One place that defines "what counts as active semester"
- Consistent lecture filter (by semester_id OR date-range fallback for legacy data)
- Unified teacher-courses union (courses.teacher_id ∪ teaching_loads.course_id)
"""
from typing import Optional
from bson import ObjectId


async def get_active_semester(db) -> Optional[dict]:
    """Return active semester dict or None.

    Returns: {"id", "name", "start_date", "end_date"} or None
    """
    sem = await db.semesters.find_one({
        "$or": [{"status": "active"}, {"is_active": True}]
    })
    if not sem:
        return None
    return {
        "id": str(sem["_id"]),
        "name": sem.get("name", ""),
        "start_date": sem.get("start_date"),
        "end_date": sem.get("end_date"),
    }


def lecture_active_semester_clauses(active_sem: Optional[dict]) -> list:
    """Build $or clauses for matching lectures in the active semester.

    Matches:
      A) lectures with explicit semester_id == active_sem.id
      B) lectures missing semester_id but whose date falls in semester window
         (covers legacy data that was created without semester_id)
    """
    if not active_sem:
        return []
    sem_id = active_sem["id"]
    clauses: list = [{"semester_id": sem_id}]
    sd = active_sem.get("start_date")
    ed = active_sem.get("end_date")
    if sd or ed:
        date_range: dict = {}
        if sd:
            date_range["$gte"] = sd
        if ed:
            date_range["$lte"] = ed
        clauses.append({
            "$and": [
                {"$or": [
                    {"semester_id": {"$exists": False}},
                    {"semester_id": None},
                    {"semester_id": ""},
                ]},
                {"date": date_range},
            ]
        })
    return clauses


def apply_lecture_active_sem(match: dict, active_sem: Optional[dict]) -> dict:
    """Inject active-semester $or clauses into an existing lecture match dict."""
    if not active_sem:
        return match
    clauses = lecture_active_semester_clauses(active_sem)
    if not clauses:
        return match
    # If match already has $or, AND-combine via $and
    if "$or" in match:
        existing = match.pop("$or")
        match.setdefault("$and", []).extend([
            {"$or": existing},
            {"$or": clauses},
        ])
    else:
        match["$or"] = clauses
    return match


async def get_teacher_active_course_ids(db, teacher_id: str, active_sem: Optional[dict]) -> set:
    """Return the UNION of course ids assigned to a teacher in the active semester
    via either (courses.teacher_id) OR (teaching_loads).

    This resolves the inconsistency where a teacher page shows 0 courses but
    the global Courses page shows them assigned (or vice versa).
    """
    course_ids: set = set()
    if not active_sem:
        # Fallback: any course where teacher_id matches (cross-sem safety)
        async for c in db.courses.find({"teacher_id": teacher_id, "is_active": True}):
            course_ids.add(str(c["_id"]))
        async for tl in db.teaching_loads.find({"teacher_id": teacher_id}):
            cid = tl.get("course_id")
            if cid:
                course_ids.add(cid)
        return course_ids

    sem_id = active_sem["id"]

    # 1) courses.teacher_id == teacher_id AND semester_id == active
    async for c in db.courses.find({
        "teacher_id": teacher_id,
        "is_active": True,
        "semester_id": sem_id,
    }):
        course_ids.add(str(c["_id"]))

    # 2) teaching_loads where teacher_id + semester_id == active
    async for tl in db.teaching_loads.find({
        "teacher_id": teacher_id,
        "semester_id": sem_id,
    }):
        cid = tl.get("course_id")
        if cid:
            course_ids.add(cid)

    return course_ids


async def get_course_lecture_stats(db, course_id: str, active_sem: Optional[dict]) -> dict:
    """Aggregate lecture stats for a single course in the active semester.

    Returns: {"total", "completed", "scheduled", "cancelled", "absent"}
    """
    stats = {"total": 0, "completed": 0, "scheduled": 0, "cancelled": 0, "absent": 0}
    match: dict = {"course_id": course_id}
    apply_lecture_active_sem(match, active_sem)
    async for row in db.lectures.aggregate([
        {"$match": match},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]):
        st = row.get("_id") or "scheduled"
        c = int(row.get("count") or 0)
        stats["total"] += c
        if st in stats:
            stats[st] = c
    return stats


async def get_courses_lecture_counts(db, course_ids: list, active_sem: Optional[dict]) -> dict:
    """Bulk count lectures per course in the active semester.

    Returns: {course_id_str: count}
    """
    if not course_ids:
        return {}
    match: dict = {"course_id": {"$in": course_ids}}
    apply_lecture_active_sem(match, active_sem)
    counts: dict = {}
    async for row in db.lectures.aggregate([
        {"$match": match},
        {"$group": {"_id": "$course_id", "count": {"$sum": 1}}},
    ]):
        counts[row["_id"]] = int(row.get("count") or 0)
    return counts
