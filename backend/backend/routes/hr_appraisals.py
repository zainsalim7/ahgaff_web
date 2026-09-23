"""⭐ شؤون الموظفين — التقييم السنوي: 6 معايير (1–5) + مؤشرات تلقائية (حضور/إجازات/مهام) → نتيجة من 100 وتقدير.
دورة: المدير المباشر يقيّم (draft → submitted) ← HR تعتمد (approved) أو تُعيد (draft) ← الموظف يطّلع ويعلّق (acknowledged)"""
from datetime import datetime, date, timedelta
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from bson import ObjectId

from .deps import get_db, get_current_user, has_permission, log_activity
from .hr_common import (P_APPRAISE, YEMEN_TZ, _now, _today, _oid, _ser, _can_view, _guard, user_id_of, get_hr_settings, is_work_day,
                        find_my_employee, employee_user_ids, notify_users, hr_manager_user_ids, enrich_employee_refs, team_of, can_act_on)

router = APIRouter(prefix="/hr/appraisals", tags=["شؤون الموظفين - التقييم السنوي"])

CRITERIA = [
    {"key": "discipline", "label": "الانضباط والحضور", "hint": "يُستأنس بمؤشر الحضور والتأخير التلقائي"},
    {"key": "quality", "label": "جودة العمل", "hint": "دقة المخرجات وقلّة الأخطاء"},
    {"key": "productivity", "label": "الإنتاجية", "hint": "حجم العمل المنجز — يُستأنس بمؤشر المهام"},
    {"key": "teamwork", "label": "التعاون والعمل الجماعي", "hint": "التواصل والمساندة"},
    {"key": "initiative", "label": "المبادرة والتطوير", "hint": "الأفكار والتحسين الذاتي"},
    {"key": "punctuality", "label": "الالتزام بالمواعيد", "hint": "يُستأنس بنسبة المهام المنجزة في وقتها"},
]
SCALE = {1: "ضعيف", 2: "مقبول", 3: "جيد", 4: "جيد جداً", 5: "ممتاز"}
STATUSES = {"draft": "مسودة (لدى المدير)", "submitted": "بانتظار اعتماد شؤون الموظفين", "approved": "معتمد", "acknowledged": "معتمد — اطّلع الموظف"}


def grade_of(score: float) -> str:
    return "ممتاز" if score >= 90 else "جيد جداً" if score >= 80 else "جيد" if score >= 70 else "مقبول" if score >= 60 else "ضعيف"


class ScoresIn(BaseModel):
    scores: dict  # key -> 1..5
    comments: Optional[dict] = {}
    evaluator_comment: Optional[str] = ""
    strengths: Optional[str] = ""
    improvements: Optional[str] = ""
    goals: Optional[str] = ""


class CreateIn(BaseModel):
    employee_id: str
    year: int


class CommentIn(BaseModel):
    comment: Optional[str] = ""


async def compute_metrics(db, employee_id: str, year: int) -> dict:
    """مؤشرات تلقائية من النظام لسنة التقييم"""
    settings = await get_hr_settings(db)
    y0, y1 = f"{year}-01-01", f"{year}-12-31"
    end = min(date(year, 12, 31), datetime.now(YEMEN_TZ).date())
    start = date(year, 1, 1)
    emp = await db.employees.find_one({"_id": ObjectId(employee_id)}, {"hire_date": 1}) if ObjectId.is_valid(employee_id) else None
    if emp and emp.get("hire_date") and emp["hire_date"][:10] > y0:
        try:
            start = max(start, datetime.strptime(emp["hire_date"][:10], "%Y-%m-%d").date())
        except ValueError:
            pass
    work_days = sum(1 for i in range((end - start).days + 1) if is_work_day(start + timedelta(days=i), settings)) if end >= start else 0
    c = {"present": 0, "late": 0, "half_day": 0, "absent": 0, "excused": 0, "mission": 0}
    late_min = 0
    async for r in db.hr_attendance.find({"employee_id": employee_id, "date": {"$gte": y0, "$lte": y1}}, {"status": 1, "late_minutes": 1}):
        c[r["status"]] = c.get(r["status"], 0) + 1
        late_min += int(r.get("late_minutes") or 0)
    leave_days = 0
    async for l in db.leave_requests.find({"employee_id": employee_id, "status": "approved", "start_date": {"$lte": y1}, "end_date": {"$gte": y0}}, {"days": 1}):
        leave_days += l.get("days", 0)
    present = c["present"] + c["late"] + c["half_day"] + c["mission"]
    due = max(0, work_days - leave_days - c["excused"])
    tasks = await db.hr_tasks.find({"assignee_employee_id": employee_id, "created_at": {"$gte": y0}}, {"status": 1, "completed_on_time": 1, "due_date": 1}).to_list(5000)
    done = [t for t in tasks if t["status"] == "done"]
    on_time = sum(1 for t in done if t.get("completed_on_time") is not False)
    overdue = sum(1 for t in tasks if t["status"] in ("open", "in_progress") and t.get("due_date") and t["due_date"] < _today())
    return {"year": year, "work_days": work_days, "present": present, "late": c["late"], "late_minutes": late_min, "absent": c["absent"], "excused": c["excused"], "leave_days": leave_days,
            "attendance_rate": round(present / due * 100, 1) if due else None, "recorded_days": present + c["absent"] + c["excused"],
            "tasks_total": len(tasks), "tasks_done": len(done), "tasks_on_time": on_time, "tasks_overdue": overdue,
            "tasks_done_rate": round(len(done) / len(tasks) * 100, 1) if tasks else None, "tasks_on_time_rate": round(on_time / len(done) * 100, 1) if done else None}


def _view(a: dict) -> dict:
    d = _ser(a)
    d["status_label"] = STATUSES.get(d.get("status"), d.get("status"))
    return d


async def _load(db, aid: str) -> dict:
    a = await db.hr_appraisals.find_one({"_id": _oid(aid)})
    if not a:
        raise HTTPException(status_code=404, detail="التقييم غير موجود")
    return a


async def _access(db, user: dict, a: dict) -> dict:
    me = await find_my_employee(db, user)
    return {"hr": has_permission(user, P_APPRAISE), "manager": await can_act_on(db, user, a["employee_id"], "__none__"),
            "owner": bool(me) and str(me["_id"]) == a["employee_id"], "viewer": _can_view(user)}


@router.get("/meta")
async def appraisals_meta(current_user: dict = Depends(get_current_user)):
    return {"criteria": CRITERIA, "scale": SCALE, "statuses": STATUSES, "grades": ["ممتاز ≥90", "جيد جداً ≥80", "جيد ≥70", "مقبول ≥60", "ضعيف <60"]}


@router.get("/overview")
async def overview(year: Optional[int] = None, view: str = "team", current_user: dict = Depends(get_current_user)):
    """قائمة الموظفين مع حالة تقييم السنة: view=team (فريقي) | all (HR/عرض)"""
    db = get_db()
    year = year or datetime.now(YEMEN_TZ).year
    me = await find_my_employee(db, current_user)
    if view == "all":
        if not (_can_view(current_user) or has_permission(current_user, P_APPRAISE)):
            raise HTTPException(status_code=403, detail="غير مصرح")
        emps = [_ser(e) for e in await db.employees.find({"status": {"$ne": "ended"}}, {"full_name": 1, "employee_no": 1, "job_title": 1, "org_unit_id": 1, "manager_employee_id": 1}).sort("full_name", 1).to_list(5000)]
    else:
        emps = await team_of(db, me)
    ids = [e["id"] for e in emps]
    apps = {a["employee_id"]: a for a in await db.hr_appraisals.find({"employee_id": {"$in": ids}, "year": year}).to_list(5000)}
    rows = []
    for e in emps:
        eid = e["id"]
        a = apps.get(eid)
        rows.append({"employee_id": eid, "appraisal_id": str(a["_id"]) if a else None, "status": a["status"] if a else None, "status_label": STATUSES.get(a["status"]) if a else "لم يبدأ",
                     "total_score": a.get("total_score") if a else None, "grade": a.get("grade") if a else None, "evaluator_name": a.get("evaluator_name", "") if a else ""})
    await enrich_employee_refs(db, rows)
    dist = {}
    for r in rows:
        if r["grade"] and r["status"] in ("approved", "acknowledged"):
            dist[r["grade"]] = dist.get(r["grade"], 0) + 1
    scores = [r["total_score"] for r in rows if r["total_score"] is not None and r["status"] in ("approved", "acknowledged")]
    return {"year": year, "view": view, "rows": rows, "stats": {"total": len(rows), "not_started": sum(1 for r in rows if not r["status"]), "draft": sum(1 for r in rows if r["status"] == "draft"),
            "submitted": sum(1 for r in rows if r["status"] == "submitted"), "approved": sum(1 for r in rows if r["status"] in ("approved", "acknowledged")),
            "avg": round(sum(scores) / len(scores), 1) if scores else None, "grades": dist}, "can_manage_all": has_permission(current_user, P_APPRAISE)}


@router.get("/my")
async def my_appraisals(current_user: dict = Depends(get_current_user)):
    db = get_db()
    me = await find_my_employee(db, current_user)
    if not me:
        return {"profile": None, "items": []}
    items = [_view(a) for a in await db.hr_appraisals.find({"employee_id": str(me["_id"]), "status": {"$in": ["approved", "acknowledged"]}}).sort("year", -1).to_list(50)]
    return {"profile": {"id": str(me["_id"]), "full_name": me.get("full_name", "")}, "items": items}


@router.get("/metrics/{employee_id}")
async def metrics_preview(employee_id: str, year: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    db = get_db()
    if not (await can_act_on(db, current_user, employee_id, P_APPRAISE) or _can_view(current_user)):
        raise HTTPException(status_code=403, detail="غير مصرح")
    return await compute_metrics(db, employee_id, year or datetime.now(YEMEN_TZ).year)


@router.post("")
async def create_appraisal(data: CreateIn, current_user: dict = Depends(get_current_user)):
    """بدء تقييم (مسودة) لموظف — المدير المباشر أو HR"""
    db = get_db()
    emp = await db.employees.find_one({"_id": _oid(data.employee_id, "الموظف")})
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    if not await can_act_on(db, current_user, data.employee_id, P_APPRAISE):
        raise HTTPException(status_code=403, detail="التقييم من صلاحية المدير المباشر أو شؤون الموظفين")
    ex = await db.hr_appraisals.find_one({"employee_id": data.employee_id, "year": data.year})
    if ex:
        return {"id": str(ex["_id"]), "existing": True, "message": "يوجد تقييم لهذه السنة"}
    me = await find_my_employee(db, current_user)
    doc = {"employee_id": data.employee_id, "year": data.year, "status": "draft", "scores": {}, "comments": {}, "total_score": None, "grade": None,
           "evaluator_user_id": user_id_of(current_user), "evaluator_name": current_user.get("full_name", ""), "evaluator_employee_id": str(me["_id"]) if me else None,
           "evaluator_comment": "", "strengths": "", "improvements": "", "goals": "", "hr_comment": "", "employee_comment": "",
           "metrics": await compute_metrics(db, data.employee_id, data.year), "history": [{"action": "created", "by_name": current_user.get("full_name", ""), "at": _now(), "note": ""}], "created_at": _now()}
    r = await db.hr_appraisals.insert_one(doc)
    return {"id": str(r.inserted_id), "existing": False, "message": "تم إنشاء مسودة التقييم"}


@router.get("/{aid}")
async def get_appraisal(aid: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    a = await _load(db, aid)
    acc = await _access(db, current_user, a)
    if not any(acc.values()):
        raise HTTPException(status_code=403, detail="غير مصرح")
    if acc["owner"] and not (acc["hr"] or acc["manager"] or acc["viewer"]) and a["status"] in ("draft", "submitted"):
        raise HTTPException(status_code=403, detail="التقييم لم يُعتمد بعد")
    d = _view(a)
    await enrich_employee_refs(db, [d])
    d["criteria"] = CRITERIA
    d["can_edit"] = (acc["hr"] or acc["manager"]) and a["status"] == "draft"
    d["can_submit"] = d["can_edit"]
    d["can_approve"] = acc["hr"] and a["status"] == "submitted"
    d["can_acknowledge"] = acc["owner"] and a["status"] == "approved"
    return d


def _score(scores: dict) -> float:
    vals = [int(scores[c["key"]]) for c in CRITERIA if c["key"] in scores]
    return round(sum(vals) / (5 * len(CRITERIA)) * 100, 1) if len(vals) == len(CRITERIA) else None


@router.put("/{aid}")
async def save_scores(aid: str, data: ScoresIn, current_user: dict = Depends(get_current_user)):
    db = get_db()
    a = await _load(db, aid)
    acc = await _access(db, current_user, a)
    if not (acc["hr"] or acc["manager"]):
        raise HTTPException(status_code=403, detail="غير مصرح")
    if a["status"] != "draft":
        raise HTTPException(status_code=400, detail="التقييم مُرسل — لا يمكن تعديله إلا بإعادته من شؤون الموظفين")
    for k, v in data.scores.items():
        if k not in {c["key"] for c in CRITERIA} or not (isinstance(v, int) and 1 <= v <= 5):
            raise HTTPException(status_code=400, detail=f"درجة غير صحيحة للمعيار {k} (1–5)")
    total = _score(data.scores)
    upd = {"scores": data.scores, "comments": data.comments or {}, "evaluator_comment": data.evaluator_comment or "", "strengths": data.strengths or "", "improvements": data.improvements or "",
           "goals": data.goals or "", "total_score": total, "grade": grade_of(total) if total is not None else None, "metrics": await compute_metrics(db, a["employee_id"], a["year"]), "updated_at": _now()}
    await db.hr_appraisals.update_one({"_id": a["_id"]}, {"$set": upd})
    return {"total_score": total, "grade": upd["grade"], "message": "تم حفظ التقييم"}


@router.post("/{aid}/submit")
async def submit(aid: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    a = await _load(db, aid)
    acc = await _access(db, current_user, a)
    if not (acc["hr"] or acc["manager"]) or a["status"] != "draft":
        raise HTTPException(status_code=403, detail="غير مصرح أو التقييم ليس مسودة")
    if a.get("total_score") is None:
        raise HTTPException(status_code=400, detail="أكمل تقييم المعايير الستة أولاً")
    await db.hr_appraisals.update_one({"_id": a["_id"]}, {"$set": {"status": "submitted", "submitted_at": _now()}, "$push": {"history": {"action": "submitted", "by_name": current_user.get("full_name", ""), "at": _now(), "note": ""}}})
    emp = await db.employees.find_one({"_id": ObjectId(a["employee_id"])}, {"full_name": 1})
    await notify_users(db, await hr_manager_user_ids(db, P_APPRAISE), "تقييم سنوي بانتظار الاعتماد", f"{(emp or {}).get('full_name', '')} — {a['year']} · {a.get('grade')} ({a.get('total_score')}) من {current_user.get('full_name', '')}", "hr_appraisal", {"appraisal_id": aid})
    await log_activity(current_user, "hr_appraisal_submit", "appraisal", aid, (emp or {}).get("full_name", ""), {"score": a.get("total_score")})
    return {"message": "تم إرسال التقييم لاعتماد شؤون الموظفين"}


@router.post("/{aid}/approve")
async def approve(aid: str, data: CommentIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_APPRAISE)
    db = get_db()
    a = await _load(db, aid)
    if a["status"] != "submitted":
        raise HTTPException(status_code=400, detail="التقييم ليس بانتظار الاعتماد")
    await db.hr_appraisals.update_one({"_id": a["_id"]}, {"$set": {"status": "approved", "hr_comment": data.comment or "", "approved_at": _now(), "approved_by_name": current_user.get("full_name", "")}, "$push": {"history": {"action": "approved", "by_name": current_user.get("full_name", ""), "at": _now(), "note": data.comment or ""}}})
    uid = (await employee_user_ids(db, [a["employee_id"]])).get(a["employee_id"])
    if uid:
        await notify_users(db, [uid], f"صدر تقييمك السنوي {a['year']} ⭐", f"التقدير: {a.get('grade')} ({a.get('total_score')}/100) — اطّلع عليه وأضف تعليقك", "hr_appraisal", {"appraisal_id": aid})
    if a.get("evaluator_user_id"):
        await notify_users(db, [a["evaluator_user_id"]], "تم اعتماد تقييم قدّمته", f"تقييم {a['year']} — {a.get('grade')}", "hr_appraisal", {"appraisal_id": aid})
    await log_activity(current_user, "hr_appraisal_approve", "appraisal", aid, "", {"score": a.get("total_score")})
    return {"message": "تم اعتماد التقييم وإشعار الموظف"}


@router.post("/{aid}/return")
async def return_to_draft(aid: str, data: CommentIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_APPRAISE)
    db = get_db()
    a = await _load(db, aid)
    if a["status"] not in ("submitted", "approved"):
        raise HTTPException(status_code=400, detail="لا يمكن إعادة هذا التقييم")
    await db.hr_appraisals.update_one({"_id": a["_id"]}, {"$set": {"status": "draft", "hr_comment": data.comment or ""}, "$push": {"history": {"action": "returned", "by_name": current_user.get("full_name", ""), "at": _now(), "note": data.comment or ""}}})
    if a.get("evaluator_user_id"):
        await notify_users(db, [a["evaluator_user_id"]], "أُعيد تقييم للمراجعة", f"تقييم {a['year']}: {data.comment or 'يرجى المراجعة'}", "hr_appraisal", {"appraisal_id": aid})
    return {"message": "أُعيد التقييم إلى المسودة"}


@router.post("/{aid}/acknowledge")
async def acknowledge(aid: str, data: CommentIn, current_user: dict = Depends(get_current_user)):
    db = get_db()
    a = await _load(db, aid)
    acc = await _access(db, current_user, a)
    if not acc["owner"]:
        raise HTTPException(status_code=403, detail="الإقرار من الموظف نفسه")
    if a["status"] != "approved":
        raise HTTPException(status_code=400, detail="التقييم غير معتمد أو تم الإقرار به سابقاً")
    await db.hr_appraisals.update_one({"_id": a["_id"]}, {"$set": {"status": "acknowledged", "employee_comment": (data.comment or "").strip(), "acknowledged_at": _now()}, "$push": {"history": {"action": "acknowledged", "by_name": current_user.get("full_name", ""), "at": _now(), "note": (data.comment or "").strip()}}})
    if a.get("evaluator_user_id"):
        await notify_users(db, [a["evaluator_user_id"]], "اطّلع الموظف على تقييمه", f"تقييم {a['year']}" + (f" — تعليقه: {data.comment}" if data.comment else ""), "hr_appraisal", {"appraisal_id": aid})
    return {"message": "تم تسجيل اطّلاعك على التقييم"}


@router.delete("/{aid}")
async def delete_appraisal(aid: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user, P_APPRAISE)
    db = get_db()
    a = await _load(db, aid)
    if a["status"] != "draft":
        raise HTTPException(status_code=400, detail="تُحذف المسودات فقط")
    await db.hr_appraisals.delete_one({"_id": a["_id"]})
    return {"message": "تم حذف المسودة"}
