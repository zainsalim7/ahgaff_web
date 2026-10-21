"""🏛️ مجلس الكلية — قرارات الحرمان/الاستثناء للطلاب المرشّحين (المرحلة 4)"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .deps import get_current_user, get_db, log_activity, get_scope_filter
from ._active_semester import get_active_semester
from models.permissions import UserRole
from services.absence_engine import course_profiles, student_profile

router = APIRouter(prefix="/faculty-board", tags=["مجلس الكلية"])
YEMEN_TZ = timezone(timedelta(hours=3))
DECISIONS = {"deprived": "حرمان", "exempted": "استثناء"}


def _now() -> datetime:
    return datetime.now(YEMEN_TZ)


def _can_decide(user: dict) -> bool:
    return user.get("role") in (UserRole.ADMIN, UserRole.DEAN, UserRole.DEPARTMENT_HEAD)


async def _scope_department_ids(db, user: dict) -> Optional[List[str]]:
    """None = غير مقيّد (Admin) · قائمة = الأقسام المسموح بها فقط (العميد/رئيس القسم)"""
    if user.get("role") == UserRole.ADMIN:
        return None
    scope = await get_scope_filter(user, "departments")
    if not scope:
        return None
    return [str(d["_id"]) async for d in db.departments.find(scope, {"_id": 1})]


def _valid_date(s: str) -> bool:
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return True
    except Exception:
        return False


async def _student_info(db, sid: str) -> dict:
    s = await db.students.find_one({"_id": ObjectId(sid)}, {"full_name": 1, "student_id": 1}) if ObjectId.is_valid(sid) else None
    return {"full_name": (s or {}).get("full_name", ""), "student_number": (s or {}).get("student_id", "")}


class SessionCreate(BaseModel):
    meeting_number: str
    meeting_date: str
    title: Optional[str] = ""


class DecisionCreate(BaseModel):
    student_id: str
    scope: str  # course | general
    course_id: Optional[str] = None
    decision: str  # deprived | exempted
    reason: Optional[str] = ""
    session_id: Optional[str] = None


class BulkDecisionsCreate(BaseModel):
    decisions: List[DecisionCreate]


def _serialize_decision(d: dict) -> dict:
    return {
        "id": str(d["_id"]), "student_id": d.get("student_id"), "student_name": d.get("student_name", ""),
        "student_number": d.get("student_number", ""), "scope": d.get("scope"), "course_id": d.get("course_id"),
        "course_name": d.get("course_name", ""), "course_code": d.get("course_code", ""), "decision": d.get("decision"),
        "decision_label": DECISIONS.get(d.get("decision"), d.get("decision")), "reason": d.get("reason", ""),
        "session_id": d.get("session_id"), "session_title": d.get("session_title", ""), "meeting_number": d.get("meeting_number", ""),
        "pct_unexcused": d.get("pct_unexcused"), "pct_total": d.get("pct_total"),
        "decided_by_name": d.get("decided_by_name", ""), "created_at": d.get("created_at"),
    }


@router.get("/candidates")
async def list_candidates(course_id: Optional[str] = None, department_id: Optional[str] = None, faculty_id: Optional[str] = None,
                           current_user: dict = Depends(get_current_user)):
    if not _can_decide(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    scoped_dep_ids = await _scope_department_ids(db, current_user)
    query = {}
    if course_id:
        if not ObjectId.is_valid(course_id):
            raise HTTPException(status_code=400, detail="مقرر غير صالح")
        query["_id"] = ObjectId(course_id)
    else:
        sem = await get_active_semester(db)
        if sem:
            query["semester_id"] = sem["id"]
        if department_id:
            query["department_id"] = department_id
        elif faculty_id:
            fac_dep_ids = [str(d["_id"]) async for d in db.departments.find({"faculty_id": faculty_id}, {"_id": 1})]
            query["$or"] = [{"faculty_id": faculty_id}, {"department_id": {"$in": fac_dep_ids}}]
    if scoped_dep_ids is not None:
        query = {"$and": [query, {"department_id": {"$in": scoped_dep_ids}}]} if query else {"department_id": {"$in": scoped_dep_ids}}
    courses = await db.courses.find(query).to_list(300)
    if course_id and not courses:
        raise HTTPException(status_code=403, detail="هذا المقرر خارج نطاق صلاحيتك")
    out = []
    for course in courses:
        cid = str(course["_id"])
        profiles = await course_profiles(db, course)
        for sid, pr in profiles.items():
            if pr["status"] != "candidate":
                continue
            info = await _student_info(db, sid)
            out.append({
                "student_id": sid, "student_name": info["full_name"], "student_number": info["student_number"],
                "course_id": cid, "course_name": course.get("name", ""), "course_code": course.get("code", ""),
                "pct_unexcused": pr["pct_unexcused"], "pct_total": pr["pct_total"],
                "limit_unexcused": pr["limit_unexcused"], "limit_total": pr["limit_total"],
                "unexcused_hours": pr["unexcused_hours"], "excused_hours": pr["excused_hours"], "executed_hours": pr["executed_hours"],
            })
    out.sort(key=lambda x: x["pct_total"], reverse=True)
    return {"items": out, "total": len(out)}


@router.get("/sessions")
async def list_sessions(current_user: dict = Depends(get_current_user)):
    if not _can_decide(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    out = []
    async for s in db.faculty_board_sessions.find({}).sort("meeting_date", -1):
        cnt = await db.faculty_board_decisions.count_documents({"session_id": str(s["_id"])})
        out.append({
            "id": str(s["_id"]), "meeting_number": s.get("meeting_number", ""), "meeting_date": s.get("meeting_date", ""),
            "title": s.get("title", ""), "decisions_count": cnt, "created_by_name": s.get("created_by_name", ""),
        })
    return {"items": out}


@router.post("/sessions")
async def create_session(data: SessionCreate, current_user: dict = Depends(get_current_user)):
    if not _can_decide(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    if not data.meeting_number.strip():
        raise HTTPException(status_code=400, detail="رقم الجلسة مطلوب")
    if not _valid_date(data.meeting_date):
        raise HTTPException(status_code=400, detail="صيغة تاريخ الجلسة غير صحيحة (YYYY-MM-DD)")
    db = get_db()
    doc = {
        "meeting_number": data.meeting_number.strip(), "meeting_date": data.meeting_date, "title": (data.title or "").strip(),
        "created_by": current_user.get("id"), "created_by_name": current_user.get("full_name", ""), "created_at": _now(),
    }
    res = await db.faculty_board_sessions.insert_one(doc)
    await log_activity(current_user, "create_faculty_board_session", "faculty_board_session", str(res.inserted_id), doc["title"] or doc["meeting_number"])
    return {"id": str(res.inserted_id), "meeting_number": doc["meeting_number"], "meeting_date": doc["meeting_date"], "title": doc["title"], "decisions_count": 0}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, current_user: dict = Depends(get_current_user)):
    if not _can_decide(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    db = get_db()
    doc = await db.faculty_board_sessions.find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    cnt = await db.faculty_board_decisions.count_documents({"session_id": session_id})
    if cnt:
        raise HTTPException(status_code=400, detail=f"لا يمكن حذف الجلسة — تحتوي {cnt} قرار. احذف القرارات أولاً")
    await db.faculty_board_sessions.delete_one({"_id": ObjectId(session_id)})
    await log_activity(current_user, "delete_faculty_board_session", "faculty_board_session", session_id, doc.get("title") or doc.get("meeting_number", ""))
    return {"message": "تم حذف الجلسة"}


async def _resolve_decision_context(db, data: DecisionCreate, dep_scope: Optional[List[str]] = None):
    if data.decision not in DECISIONS:
        raise HTTPException(status_code=400, detail="نوع القرار غير صالح")
    if data.scope not in ("course", "general"):
        raise HTTPException(status_code=400, detail="نطاق غير صالح")
    if data.scope == "course" and not data.course_id:
        raise HTTPException(status_code=400, detail="حدد المقرر عند نطاق «لكل مقرر»")
    if not ObjectId.is_valid(data.student_id):
        raise HTTPException(status_code=400, detail="طالب غير صالح")
    student = await db.students.find_one({"_id": ObjectId(data.student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    course = None
    if data.course_id:
        if not ObjectId.is_valid(data.course_id):
            raise HTTPException(status_code=400, detail="مقرر غير صالح")
        course = await db.courses.find_one({"_id": ObjectId(data.course_id)})
        if not course:
            raise HTTPException(status_code=404, detail="المقرر غير موجود")
    dep_id = (course or {}).get("department_id") if course else student.get("department_id")
    if dep_scope is not None and dep_id not in dep_scope:
        raise HTTPException(status_code=403, detail="هذا الطالب/المقرر خارج نطاق صلاحيتك")
    return student, course, dep_id


async def _build_decision_doc(db, item: DecisionCreate, current_user: dict, session: Optional[dict], dep_scope: Optional[List[str]] = None) -> dict:
    student, course, dep_id = await _resolve_decision_context(db, item, dep_scope)
    snapshot = {}
    if course:
        pr = await student_profile(db, item.student_id, course)
        snapshot = {"pct_unexcused": pr["pct_unexcused"], "pct_total": pr["pct_total"]}
    return {
        "student_id": item.student_id, "student_name": student.get("full_name", ""), "student_number": student.get("student_id", ""),
        "scope": item.scope, "course_id": item.course_id if item.scope == "course" else None, "department_id": dep_id,
        "course_name": course.get("name", "") if course else "", "course_code": course.get("code", "") if course else "",
        "decision": item.decision, "reason": (item.reason or "").strip(),
        "session_id": item.session_id, "session_title": session.get("title", "") if session else "",
        "meeting_number": session.get("meeting_number", "") if session else "",
        **snapshot,
        "decided_by": current_user.get("id"), "decided_by_name": current_user.get("full_name", ""), "created_at": _now(),
    }


async def _save_decision(db, doc: dict) -> dict:
    dup_q = {"student_id": doc["student_id"], "scope": doc["scope"]}
    if doc["scope"] == "course":
        dup_q["course_id"] = doc["course_id"]
    await db.faculty_board_decisions.delete_many(dup_q)
    res = await db.faculty_board_decisions.insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc


@router.post("/decisions")
async def create_decision(data: DecisionCreate, current_user: dict = Depends(get_current_user)):
    if not _can_decide(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك باتخاذ قرارات المجلس")
    db = get_db()
    dep_scope = await _scope_department_ids(db, current_user)
    session = None
    if data.session_id:
        if not ObjectId.is_valid(data.session_id):
            raise HTTPException(status_code=400, detail="جلسة غير صالحة")
        session = await db.faculty_board_sessions.find_one({"_id": ObjectId(data.session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    doc = await _build_decision_doc(db, data, current_user, session, dep_scope)
    doc = await _save_decision(db, doc)
    await log_activity(current_user, "create_faculty_board_decision", "faculty_board_decision", str(doc["_id"]),
                        f"{DECISIONS[data.decision]} — {doc.get('student_name', '')}")
    return _serialize_decision(doc)


@router.post("/sessions/{session_id}/decisions")
async def bulk_create_decisions(session_id: str, payload: BulkDecisionsCreate, current_user: dict = Depends(get_current_user)):
    if not _can_decide(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    db = get_db()
    dep_scope = await _scope_department_ids(db, current_user)
    session = await db.faculty_board_sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    created = []
    for item in payload.decisions:
        item.session_id = session_id
        doc = await _build_decision_doc(db, item, current_user, session, dep_scope)
        doc = await _save_decision(db, doc)
        created.append(_serialize_decision(doc))
    await log_activity(current_user, "bulk_create_faculty_board_decisions", "faculty_board_session", session_id, f"{len(created)} قرار")
    return {"items": created, "count": len(created)}


@router.get("/decisions")
async def list_decisions(student_id: Optional[str] = None, course_id: Optional[str] = None, session_id: Optional[str] = None,
                          current_user: dict = Depends(get_current_user)):
    if not _can_decide(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    dep_scope = await _scope_department_ids(db, current_user)
    q = {}
    if student_id:
        q["student_id"] = student_id
    if course_id:
        q["course_id"] = course_id
    if session_id:
        q["session_id"] = session_id
    if dep_scope is not None:
        q["department_id"] = {"$in": dep_scope}
    items = await db.faculty_board_decisions.find(q).sort("created_at", -1).to_list(1000)
    return {"items": [_serialize_decision(d) for d in items]}


@router.delete("/decisions/{decision_id}")
async def delete_decision(decision_id: str, current_user: dict = Depends(get_current_user)):
    if not _can_decide(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    if not ObjectId.is_valid(decision_id):
        raise HTTPException(status_code=404, detail="القرار غير موجود")
    db = get_db()
    doc = await db.faculty_board_decisions.find_one({"_id": ObjectId(decision_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="القرار غير موجود")
    dep_scope = await _scope_department_ids(db, current_user)
    if dep_scope is not None and doc.get("department_id") not in dep_scope:
        raise HTTPException(status_code=403, detail="هذا القرار خارج نطاق صلاحيتك")
    await db.faculty_board_decisions.delete_one({"_id": ObjectId(decision_id)})
    await log_activity(current_user, "delete_faculty_board_decision", "faculty_board_decision", decision_id, doc.get("student_name", ""))
    return {"message": "تم إلغاء القرار — سيعود الطالب مرشَّحاً تلقائياً إن ظل متجاوزاً للحد"}


@router.get("/sessions/{session_id}/minutes-pdf")
async def session_minutes_pdf(session_id: str, current_user: dict = Depends(get_current_user)):
    if not _can_decide(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    db = get_db()
    session = await db.faculty_board_sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    decisions = await db.faculty_board_decisions.find({"session_id": session_id}).sort("student_name", 1).to_list(1000)
    rows = [["#", "اسم الطالب", "الرقم الجامعي", "المقرر/النطاق", "نسبة الغياب", "القرار", "السبب"]]
    for i, d in enumerate(decisions, 1):
        scope_label = f"{d.get('course_name', '')} ({d.get('course_code', '')})" if d.get("scope") == "course" else "عام (كل المقررات)"
        pct = f"{d.get('pct_total')}%" if d.get("pct_total") is not None else "-"
        rows.append([str(i), d.get("student_name", ""), d.get("student_number", ""), scope_label, pct, DECISIONS.get(d.get("decision"), ""), d.get("reason", "") or "-"])
    depr = sum(1 for d in decisions if d.get("decision") == "deprived")
    exem = sum(1 for d in decisions if d.get("decision") == "exempted")
    from .report_pdf import build_report_pdf
    buf = build_report_pdf(
        title=f"محضر جلسة مجلس الكلية رقم {session.get('meeting_number', '')}",
        subtitle=session.get("title", ""),
        kpis=[("تاريخ الجلسة", session.get("meeting_date", "")), ("عدد الطلاب", str(len(decisions))), ("حرمان", str(depr)), ("استثناء", str(exem))],
        sections=[{"title": "قرارات الجلسة", "rows": rows, "widths_mm": [10, 35, 25, 45, 20, 20, 50]}],
        generated_by=current_user.get("full_name", ""),
    )
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=faculty_board_session_{session_id}.pdf"})


@router.get("/decisions/{decision_id}/letter-pdf")
async def decision_letter_pdf(decision_id: str, current_user: dict = Depends(get_current_user)):
    if not _can_decide(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    if not ObjectId.is_valid(decision_id):
        raise HTTPException(status_code=404, detail="القرار غير موجود")
    db = get_db()
    d = await db.faculty_board_decisions.find_one({"_id": ObjectId(decision_id)})
    if not d:
        raise HTTPException(status_code=404, detail="القرار غير موجود")
    scope_label = f"{d.get('course_name', '')} ({d.get('course_code', '')})" if d.get("scope") == "course" else "جميع مقررات الفصل الحالي"
    rows = [
        ["البيان", "التفاصيل"],
        ["اسم الطالب", d.get("student_name", "")],
        ["الرقم الجامعي", d.get("student_number", "")],
        ["النطاق", scope_label],
        ["نسبة الغياب", f"{d.get('pct_total')}%" if d.get("pct_total") is not None else "-"],
        ["القرار", DECISIONS.get(d.get("decision"), "")],
        ["السبب", d.get("reason", "") or "-"],
        ["رقم محضر الجلسة", d.get("meeting_number", "") or "—"],
        ["اعتماد", d.get("decided_by_name", "")],
    ]
    from .report_pdf import build_report_pdf
    buf = build_report_pdf(
        title="إشعار قرار مجلس الكلية",
        subtitle=f"بخصوص الطالب/ة: {d.get('student_name', '')}",
        sections=[{"title": "", "rows": rows, "widths_mm": [50, 110]}],
        generated_by=current_user.get("full_name", ""),
    )
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=faculty_board_decision_{decision_id}.pdf"})
