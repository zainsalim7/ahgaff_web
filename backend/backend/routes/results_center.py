"""🎓 مركز النتائج: إعدادات اللائحة · رصد السعي وإقفاله · كشف الأهلية · الدور الأول/الثاني/الاستثنائي · قرارات المجلس · الاعتماد إلى النتائج"""
import io
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from .deps import get_current_user, get_db, has_permission, log_activity
from .prep_leave import _user_scope, _target_in_scope
from ._active_semester import get_active_semester
from services.absence_engine import course_profiles
from services import rc_engine as E

router = APIRouter()
STAGE_AR = {"first": "دور أول", "second": "دور ثان", "tasfiya": "تصفية", "pending": "معلّق", "failed": "راسب"}
FIELD_PERM = {"coursework": "rc_enter_coursework", "first_exam": "rc_enter_exams", "second_exam": "rc_enter_exams", "exceptional_exam": "rc_enter_exams"}


def _need(user: dict, perm: str, label: str):
    if not has_permission(user, perm):
        raise HTTPException(status_code=403, detail=f"غير مصرح لك — تتطلب صلاحية «{label}»")


def _view(user: dict):
    if not any(has_permission(user, p) for p in ("rc_view", *set(FIELD_PERM.values()), "rc_approve", "rc_manage_settings", "rc_board_decisions")):
        raise HTTPException(status_code=403, detail="غير مصرح لك — تتطلب صلاحية «عرض مركز النتائج»")


def _now():
    return datetime.now(timezone.utc)


async def migrate_absence_limits(db) -> None:
    """مرة واحدة: حدود الغياب الجديدة 10.9% · 15.9% · 25.9% لكل الكليات"""
    if await db.migrations.find_one({"key": "absence_limits_10_9_15_9_25_9"}):
        return
    await db.faculties.update_many({}, {"$set": {"max_unexcused_percent": 10.9, "max_excused_percent": 15.9, "max_absence_percent": 25.9}})
    await db.migrations.insert_one({"key": "absence_limits_10_9_15_9_25_9", "at": _now()})


# ==================== ⚙️ إعدادات اللائحة (لكل كلية) ====================
async def _settings(db, faculty_id: Optional[str]) -> dict:
    d = await db.rc_settings.find_one({"faculty_id": faculty_id}) if faculty_id else None
    return {**E.DEFAULTS, **{k: d[k] for k in E.DEFAULTS if d and d.get(k) is not None}}


async def _course_faculty(db, course: dict) -> Optional[str]:
    if course.get("faculty_id"):
        return course["faculty_id"]
    dep = await db.departments.find_one({"_id": ObjectId(course["department_id"])}, {"faculty_id": 1}) if ObjectId.is_valid(course.get("department_id") or "") else None
    return (dep or {}).get("faculty_id")


@router.get("/rc/settings")
async def get_settings(faculty_id: str, current_user: dict = Depends(get_current_user)):
    _view(current_user)
    db = get_db()
    sc = await _user_scope(db, current_user)
    if sc is not None and faculty_id not in sc["facs"]:
        raise HTTPException(status_code=403, detail="هذه الكلية خارج نطاقك")
    cfg = await _settings(db, faculty_id)
    return {**cfg, "final_max": 100 - cfg["coursework_max"], "faculty_id": faculty_id}


@router.put("/rc/settings")
async def put_settings(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    _need(current_user, "rc_manage_settings", "إعدادات لائحة الدرجات")
    db = get_db()
    fid = data.get("faculty_id") or ""
    if not await _target_in_scope(db, await _user_scope(db, current_user), "faculty", fid):
        raise HTTPException(status_code=403, detail="هذه الكلية خارج نطاقك")
    try:
        cfg = {k: float(data[k]) for k in ("coursework_max", "coursework_pass_pct", "pass_mark", "second_cap", "exceptional_cap")}
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="أكمل كل الحقول بأرقام صحيحة")
    cfg = {k: int(v) if v.is_integer() else v for k, v in cfg.items()}
    if not (0 < cfg["coursework_max"] < 100) or not (0 < cfg["coursework_pass_pct"] <= 100) or not (0 < cfg["pass_mark"] <= 100):
        raise HTTPException(status_code=400, detail="قيم غير صحيحة: درجة السعي بين 1 و99، والنسب بين 1 و100")
    if not (0 < cfg["second_cap"] <= 100) or not (0 < cfg["exceptional_cap"] <= 100):
        raise HTTPException(status_code=400, detail="السقف بين 1 و100")
    scale = data.get("grade_scale") or E.DEFAULT_SCALE
    try:
        scale = sorted([{"min": float(g["min"]), "label": str(g["label"]).strip()} for g in scale if str(g.get("label", "")).strip()], key=lambda g: -g["min"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="سلم التقديرات غير صحيح")
    cfg["grade_scale"] = scale
    old = await _settings(db, fid)
    dep_ids = [str(d["_id"]) async for d in db.departments.find({"faculty_id": fid}, {"_id": 1})]
    cids = [str(c["_id"]) async for c in db.courses.find({"$or": [{"faculty_id": fid}, {"department_id": {"$in": dep_ids}}]}, {"_id": 1})]
    if old["coursework_max"] != cfg["coursework_max"] and await db.rc_marks.find_one(
            {"course_id": {"$in": cids}, "$or": [{"coursework": {"$ne": None}}, {"first_exam": {"$ne": None}}]}):
        raise HTTPException(status_code=400, detail="لا يمكن تغيير درجة السعي بعد بدء رصد الدرجات في مقررات هذه الكلية")
    rules = ("coursework_pass_pct", "pass_mark", "second_cap", "exceptional_cap")
    if any(old[k] != cfg[k] for k in rules) and await db.rc_sheets.find_one({"course_id": {"$in": cids}, "coursework_locked": True}):
        raise HTTPException(status_code=400, detail="لا يمكن تغيير نسب النجاح أو السقوف بعد إقفال السعي في مقررات هذه الكلية — افتح السعي أولاً")
    await db.rc_settings.update_one({"faculty_id": fid}, {"$set": {**cfg, "updated_at": _now(), "updated_by_name": current_user.get("full_name", "")}}, upsert=True)
    await log_activity(current_user, "rc_update_settings", "rc_settings", fid, "", cfg)
    return {"message": "تم حفظ إعدادات اللائحة", **cfg, "final_max": 100 - cfg["coursework_max"]}


# ==================== 📚 المقررات ====================
async def _course_scoped(db, user: dict, course_id: str) -> dict:
    c = await db.courses.find_one({"_id": ObjectId(course_id)}) if ObjectId.is_valid(course_id) else None
    if not c:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    sc = await _user_scope(db, user)
    if sc is not None and c.get("department_id") not in sc["deps"]:
        raise HTTPException(status_code=403, detail="هذا المقرر خارج نطاقك")
    return c


@router.get("/rc/courses")
async def list_courses(faculty_id: str = "", department_id: str = "", level: int = 0, semester_id: str = "",
                       current_user: dict = Depends(get_current_user)):
    _view(current_user)
    db = get_db()
    sc = await _user_scope(db, current_user)
    if not semester_id:
        sem = await get_active_semester(db)
        semester_id = (sem or {}).get("id", "")
    q: dict = {"semester_id": semester_id} if semester_id else {}
    if department_id:
        q["department_id"] = department_id
    elif faculty_id:
        q["department_id"] = {"$in": [str(d["_id"]) async for d in db.departments.find({"faculty_id": faculty_id}, {"_id": 1})]}
    if level:
        q["level"] = level
    if sc is not None:
        q = {"$and": [q, {"department_id": {"$in": list(sc["deps"])}}]}
    courses = await db.courses.find(q, {"name": 1, "code": 1, "level": 1, "section": 1, "department_id": 1}).sort([("level", 1), ("name", 1)]).to_list(500)
    ids = [str(c["_id"]) for c in courses]
    sheets = {s["course_id"]: s async for s in db.rc_sheets.find({"course_id": {"$in": ids}})}
    enr: dict = {}
    async for e in db.enrollments.aggregate([{"$match": {"course_id": {"$in": ids}}},
                                             {"$addFields": {"sid": {"$convert": {"input": "$student_id", "to": "objectId", "onError": None, "onNull": None}}}},
                                             {"$lookup": {"from": "students", "localField": "sid", "foreignField": "_id", "as": "s"}},
                                             {"$match": {"s.0": {"$exists": True}}}, {"$group": {"_id": "$course_id", "n": {"$sum": 1}}}]):
        enr[e["_id"]] = e["n"]
    cw: dict = {}
    async for e in db.rc_marks.aggregate([{"$match": {"course_id": {"$in": ids}, "coursework": {"$ne": None}}}, {"$group": {"_id": "$course_id", "n": {"$sum": 1}}}]):
        cw[e["_id"]] = e["n"]
    deps = {str(d["_id"]): d.get("name", "") async for d in db.departments.find({"_id": {"$in": [ObjectId(c["department_id"]) for c in courses if ObjectId.is_valid(c.get("department_id") or "")]}}, {"name": 1})}
    return {"semester_id": semester_id, "items": [{
        "id": str(c["_id"]), "name": c.get("name", ""), "code": c.get("code", ""), "level": c.get("level"), "section": c.get("section", ""),
        "department_id": c.get("department_id"), "department_name": deps.get(c.get("department_id"), ""),
        "students": enr.get(str(c["_id"]), 0), "coursework_entered": cw.get(str(c["_id"]), 0),
        "locked": bool((sheets.get(str(c["_id"])) or {}).get("coursework_locked")),
    } for c in courses]}


# ==================== 📋 كشف المقرر ====================
async def _decisions(db, cid: str) -> dict:
    out: dict = {}
    async for d in db.rc_decisions.find({"course_id": cid}):
        out.setdefault(d["student_db_id"], {})[d["kind"]] = {
            "id": str(d["_id"]), "capped": d.get("capped", True), "reason": d.get("reason", ""), "session_label": d.get("session_label", ""),
            "decided_by_name": d.get("decided_by_name", ""), "decided_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at")}
    return out


async def _build(db, course: dict) -> dict:
    cid = str(course["_id"])
    fid = await _course_faculty(db, course)
    cfg = await _settings(db, fid)
    sids = [e["student_id"] async for e in db.enrollments.find({"course_id": cid}, {"student_id": 1}) if e.get("student_id")]
    studs = {str(s["_id"]): s async for s in db.students.find({"_id": {"$in": [ObjectId(x) for x in sids if ObjectId.is_valid(x)]}},
                                                                {"full_name": 1, "student_id": 1, "section": 1, "user_id": 1, "department_id": 1, "level": 1})}
    profiles = await course_profiles(db, course, list(studs)) if studs else {}
    marks = {m["student_db_id"]: m async for m in db.rc_marks.find({"course_id": cid})}
    decs = await _decisions(db, cid)
    rows = []
    for sid, st in studs.items():
        m = marks.get(sid) or {}
        att = profiles.get(sid) or {}
        r = E.compute(m, cfg, att, decs.get(sid) or {})
        rows.append({
            "student_db_id": sid, "name": st.get("full_name", ""), "reg_no": str(st.get("student_id") or ""), "section": st.get("section", ""),
            **{k: m.get(k) for k in E.FIELDS},
            "att": {k: att.get(k) for k in ("pct_unexcused", "pct_excused", "pct_total", "status", "status_ar", "exceeded_unexcused", "exceeded_excused", "exceeded_total")},
            "decisions": decs.get(sid) or {}, **r, "stage_label": STAGE_AR.get(r["stage"], ""),
        })
    rows.sort(key=lambda x: x["name"])
    sheet = await db.rc_sheets.find_one({"course_id": cid}) or {}
    counts = {"students": len(rows), "eligible": sum(r["eligible"] for r in rows), "not_eligible": sum(1 for r in rows if r["eligibility"] == "غير مؤهل"),
              "pass1": sum(1 for r in rows if r["pass1"]), "in_second": sum(r["in_second"] for r in rows),
              "pass2": sum(1 for r in rows if r["pass2"]), "in_exc": sum(r["in_exc"] for r in rows), "passed": sum(1 for r in rows if r["result"] == "ناجح"),
              "failed": sum(1 for r in rows if r["result"] == "راسب"), "pending": sum(1 for r in rows if r["stage"] == "pending")}
    return {"course": {"id": cid, "name": course.get("name", ""), "code": course.get("code", ""), "level": course.get("level"), "department_id": course.get("department_id"),
                       "faculty_id": fid}, "settings": {**cfg, "final_max": 100 - cfg["coursework_max"]}, "rows": rows, "counts": counts,
            "sheet": {"coursework_locked": bool(sheet.get("coursework_locked")), "locked_by_name": sheet.get("locked_by_name", ""),
                      "locked_at": sheet["locked_at"].isoformat() if isinstance(sheet.get("locked_at"), datetime) else None}}


@router.get("/rc/courses/{course_id}/sheet")
async def get_sheet(course_id: str, current_user: dict = Depends(get_current_user)):
    _view(current_user)
    db = get_db()
    return await _build(db, await _course_scoped(db, current_user, course_id))


def _allowed(field: str, row: dict, locked: bool) -> Optional[str]:
    """None = مسموح · وإلا سبب المنع"""
    if field == "coursework":
        return "السعي مقفل — يلزم فتحه بصلاحية أعلى" if locked else None
    if row.get("coursework") is None and not (field == "second_exam" and row["in_second"]):
        return "ارصد سعي الطالب أولاً لتحديد أهليته"
    if field == "first_exam":
        return None if row["eligible"] else "الطالب غير مؤهل للدور الأول"
    if field == "second_exam":
        return None if row["in_second"] else "الطالب ليس من طلاب الدور الثاني"
    return None if row["in_exc"] else "لا يوجد قرار مجلس بدخول الطالب الدور الاستثنائي (أو لم يرسب في الثاني)"


async def _save(db, user: dict, course: dict, field: str, items: list, via: str) -> dict:
    if field not in E.FIELDS:
        raise HTTPException(status_code=400, detail="حقل غير معروف")
    _need(user, FIELD_PERM[field], "رصد السعي" if field == "coursework" else "رصد درجات الأدوار")
    data = await _build(db, course)
    cfg, locked = data["settings"], data["sheet"]["coursework_locked"]
    by_id = {r["student_db_id"]: r for r in data["rows"]}
    mx = E.field_max(field, cfg)
    saved, errors, now = 0, [], _now()
    for it in items:
        row = by_id.get(it.get("student_db_id") or "")
        if not row:
            errors.append({"student_db_id": it.get("student_db_id"), "error": "الطالب غير مسجّل في المقرر"})
            continue
        val, err = E.parse_mark(it.get("value"), mx, field != "coursework")
        old = row.get(field)
        if err:
            errors.append({"student_db_id": row["student_db_id"], "name": row["name"], "error": err})
            continue
        if val == old:
            continue
        block = _allowed(field, row, locked)
        if not block and field == "coursework" and any(row.get(k) is not None for k in ("first_exam", "second_exam", "exceptional_exam")):
            m2 = {k: row.get(k) for k in E.FIELDS}
            m2["coursework"] = val
            n = E.compute(m2, cfg, {"status": row["att"].get("status")}, row.get("decisions") or {})
            if val is None or any(n[k] != row[k] for k in ("eligible", "in_second", "in_exc")):
                block = "تعديل السعي يغيّر أهلية الطالب وقد رُصدت له درجة دور — احذف درجة الدور أولاً"
        if block:
            errors.append({"student_db_id": row["student_db_id"], "name": row["name"], "error": block})
            continue
        await db.rc_marks.update_one({"course_id": str(course["_id"]), "student_db_id": row["student_db_id"]},
                                     {"$set": {field: val, "updated_at": now, "updated_by_name": user.get("full_name", "")},
                                      "$setOnInsert": {"created_at": now}}, upsert=True)
        await db.rc_log.insert_one({"course_id": str(course["_id"]), "student_db_id": row["student_db_id"], "reg_no": row["reg_no"], "name": row["name"],
                                    "field": field, "old": old, "new": val, "via": via, "by_name": user.get("full_name", ""), "by": user.get("id"), "at": now})
        saved += 1
    if saved:
        await log_activity(user, "rc_save_marks", "rc_marks", str(course["_id"]), course.get("name", ""), {"field": field, "saved": saved, "via": via})
    msg = f"تم حفظ {saved} درجة ({E.FIELDS[field]})"
    if errors:
        msg += f" · لم تُحفظ {len(errors)}"
    return {"saved": saved, "errors": errors, "message": msg}


@router.put("/rc/courses/{course_id}/marks")
async def put_marks(course_id: str, data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    db = get_db()
    course = await _course_scoped(db, current_user, course_id)
    return await _save(db, current_user, course, data.get("field", ""), data.get("marks") or [], "manual")


@router.post("/rc/courses/{course_id}/import")
async def import_marks(course_id: str, file: UploadFile = File(...), field: str = Form(...), commit: str = Form("false"),
                       current_user: dict = Depends(get_current_user)):
    """Excel: رقم القيد | الدرجة — commit=false معاينة"""
    from .student_results import _rows, _text
    db = get_db()
    course = await _course_scoped(db, current_user, course_id)
    if field not in E.FIELDS:
        raise HTTPException(status_code=400, detail="حقل غير معروف")
    _need(current_user, FIELD_PERM[field], "رصد السعي" if field == "coursework" else "رصد درجات الأدوار")
    try:
        rows = _rows(await file.read(), file.filename)
    except Exception:
        raise HTTPException(status_code=400, detail="تعذّرت قراءة الملف — استخدم Excel (xlsx/xls) أو CSV")
    data = await _build(db, course)
    by_reg = {r["reg_no"]: r for r in data["rows"]}
    mx, locked = E.field_max(field, data["settings"]), data["sheet"]["coursework_locked"]
    out, seen = [], set()
    for x in rows:
        x = list(x) + [None, None]
        reg, raw = _text(x[0]), x[1]
        if not reg or not any(ch.isdigit() for ch in reg):
            continue
        row = by_reg.get(reg)
        item = {"reg_no": reg, "name": (row or {}).get("name", ""), "value": _text(raw), "old": (row or {}).get(field)}
        val, err = E.parse_mark(raw, mx, field != "coursework")
        if not row:
            item["status"], item["reason"] = "rejected", "ليس مسجّلاً في هذا المقرر"
        elif reg in seen:
            item["status"], item["reason"] = "rejected", "مكرر في الملف"
        elif err:
            item["status"], item["reason"] = "rejected", err
        elif val == row.get(field):
            item["status"] = "unchanged"
        elif row.get(field) is not None:
            item["status"], item["reason"] = "exists", "له درجة مرصودة (عدّلها يدوياً إن لزم)"
        elif _allowed(field, row, locked):
            item["status"], item["reason"] = "rejected", _allowed(field, row, locked)
        else:
            item["status"], item["student_db_id"], item["parsed"] = "ok", row["student_db_id"], val
        seen.add(reg)
        out.append(item)
    counts = {k: sum(1 for i in out if i["status"] == k) for k in ("ok", "unchanged", "exists", "rejected")}
    if commit.lower() != "true":
        return {"preview": True, "rows": out, "counts": counts}
    res = await _save(db, current_user, course, field, [{"student_db_id": i["student_db_id"], "value": i["parsed"]} for i in out if i["status"] == "ok"], "excel")
    return {**res, "counts": counts}


def _xlsx(title: str, head: list, body: list, fname: str) -> StreamingResponse:
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = title[:30]
    ws.sheet_view.rightToLeft = True
    ws.append(head)
    for r in body:
        ws.append(r)
    for i in range(1, len(head) + 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = 18
    ws.column_dimensions["A"].number_format = "@"
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})


@router.get("/rc/courses/{course_id}/template")
async def template(course_id: str, field: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    course = await _course_scoped(db, current_user, course_id)
    if field not in E.FIELDS:
        raise HTTPException(status_code=400, detail="حقل غير معروف")
    _need(current_user, FIELD_PERM[field], "رصد الدرجات")
    data = await _build(db, course)
    rows = [r for r in data["rows"] if field == "coursework" or not _allowed(field, r, True)]
    mx = E.field_max(field, data["settings"])
    return _xlsx(E.FIELDS[field], ["رقم القيد", f"{E.FIELDS[field]} (من {E.fmt(mx)})", "اسم الطالب (للمرجع فقط)"],
                 [[r["reg_no"], E.fmt(r.get(field)) if isinstance(r.get(field), (int, float)) else (r.get(field) or ""), r["name"]] for r in rows], f"rc_{field}.xlsx")


@router.get("/rc/courses/{course_id}/export")
async def export_sheet(course_id: str, current_user: dict = Depends(get_current_user)):
    _view(current_user)
    db = get_db()
    d = await _build(db, await _course_scoped(db, current_user, course_id))
    v = lambda x: E.fmt(x) if isinstance(x, (int, float)) else (x or "")
    head = ["رقم القيد", "الاسم", "الشعبة", "السعي", "غياب بلا عذر %", "غياب بعذر %", "الإجمالي %", "الأهلية", "سبب عدم الأهلية",
            "الدور الأول", "مجموع الدور الأول", "الدور الثاني", "المعتمد في الثاني", "الاستثنائي", "المعتمد في الاستثنائي", "الدرجة النهائية", "التقدير", "النتيجة", "الدور"]
    body = [[r["reg_no"], r["name"], r["section"], v(r["coursework"]), v(r["att"]["pct_unexcused"]), v(r["att"]["pct_excused"]), v(r["att"]["pct_total"]),
             r["eligibility"], "، ".join(r["reasons"]), v(r["first_exam"] if r["eligible"] else None), v(r["total1"]),
             v(r["second_exam"] if r["in_second"] else None), v(r["final2"]), v(r["exceptional_exam"] if r["in_exc"] else None), v(r["final3"]), v(r["final"]), r["letter"] or "", r["result"], r["stage_label"]] for r in d["rows"]]
    return _xlsx("كشف المقرر", head, body, "rc_sheet.xlsx")


@router.post("/rc/courses/{course_id}/lock")
async def lock(course_id: str, data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    db = get_db()
    course = await _course_scoped(db, current_user, course_id)
    locked = bool(data.get("locked"))
    if locked:
        _need(current_user, "rc_enter_coursework", "رصد السعي")
        d = await _build(db, course)
        missing = sum(1 for r in d["rows"] if r["coursework"] is None and r["att_ok"])
        if missing:
            raise HTTPException(status_code=400, detail=f"لا يمكن الإقفال: {missing} طالب مؤهل بالحضور بلا درجة سعي")
    else:
        _need(current_user, "rc_unlock_coursework", "فتح السعي بعد إقفاله")
    now = _now()
    await db.rc_sheets.update_one({"course_id": course_id}, {"$set": {"coursework_locked": locked, "locked_at": now if locked else None,
                                                                      "locked_by_name": current_user.get("full_name", "") if locked else ""}}, upsert=True)
    await db.rc_log.insert_one({"course_id": course_id, "field": "lock", "new": locked, "by_name": current_user.get("full_name", ""), "by": current_user.get("id"), "at": now})
    await log_activity(current_user, "rc_lock_coursework" if locked else "rc_unlock_coursework", "rc_sheets", course_id, course.get("name", ""))
    return {"locked": locked, "message": "تم إقفال السعي واعتماد كشف الأهلية" if locked else "تم فتح السعي للتعديل"}


@router.get("/rc/courses/{course_id}/log")
async def course_log(course_id: str, current_user: dict = Depends(get_current_user)):
    _view(current_user)
    db = get_db()
    await _course_scoped(db, current_user, course_id)
    items = []
    async for x in db.rc_log.find({"course_id": course_id}).sort("at", -1).limit(300):
        items.append({"id": str(x["_id"]), "undone": bool(x.get("undone")), "field": x.get("field"), "field_name": E.FIELDS.get(x.get("field"), {"lock": "إقفال/فتح السعي", "decision": "قرار مجلس"}.get(x.get("field"), "")),
                      "name": x.get("name", ""), "reg_no": x.get("reg_no", ""), "old": x.get("old"), "new": x.get("new"), "via": x.get("via", ""),
                      "note": x.get("note", ""), "by_name": x.get("by_name", ""), "at": x["at"].isoformat() if isinstance(x.get("at"), datetime) else x.get("at")})
    return {"items": items}


@router.post("/rc/courses/{course_id}/log/{log_id}/undo")
async def undo_mark(course_id: str, log_id: str, current_user: dict = Depends(get_current_user)):
    """↩️ التراجع عن رصد درجة: تعود القيمة السابقة (ضمن نفس قواعد الرصد والصلاحيات)"""
    db = get_db()
    course = await _course_scoped(db, current_user, course_id)
    x = await db.rc_log.find_one({"_id": ObjectId(log_id), "course_id": course_id}) if ObjectId.is_valid(log_id) else None
    if not x or x.get("field") not in E.FIELDS:
        raise HTTPException(status_code=404, detail="السجل غير موجود")
    if x.get("undone"):
        raise HTTPException(status_code=400, detail="تم التراجع عن هذا الرصد مسبقاً")
    m = await db.rc_marks.find_one({"course_id": course_id, "student_db_id": x["student_db_id"]}) or {}
    if m.get(x["field"]) != x.get("new"):
        raise HTTPException(status_code=400, detail="تغيّرت الدرجة بعد هذا الرصد — تراجع عن آخر تعديل أولاً")
    res = await _save(db, current_user, course, x["field"], [{"student_db_id": x["student_db_id"], "value": x.get("old")}], "undo")
    if res["errors"]:
        raise HTTPException(status_code=400, detail=res["errors"][0]["error"])
    await db.rc_log.update_one({"_id": x["_id"]}, {"$set": {"undone": True, "undone_by_name": current_user.get("full_name", "")}})
    return {"message": f"تم التراجع: {E.FIELDS[x['field']]} لـ {x.get('name', '')} عادت إلى {E.fmt(x.get('old')) if isinstance(x.get('old'), (int, float)) else (x.get('old') or 'فارغ')}"}


# ==================== 🏛️ قرارات مجلس الكلية (درجات) ====================
@router.get("/rc/board-sessions")
async def board_sessions(current_user: dict = Depends(get_current_user)):
    _need(current_user, "rc_board_decisions", "قرارات المجلس في الدرجات")
    db = get_db()
    return {"items": [{"id": str(s["_id"]), "label": f"جلسة {s.get('meeting_number', '')} · {s.get('meeting_date', '')}" + (f" · {s['title']}" if s.get("title") else "")}
                      async for s in db.faculty_board_sessions.find({}).sort("meeting_date", -1).limit(100)]}


@router.post("/rc/courses/{course_id}/decisions")
async def add_decision(course_id: str, data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    _need(current_user, "rc_board_decisions", "قرارات المجلس في الدرجات")
    db = get_db()
    course = await _course_scoped(db, current_user, course_id)
    kind, sid, reason = data.get("kind"), data.get("student_db_id") or "", (data.get("reason") or "").strip()
    if kind not in ("second_uncapped", "exceptional"):
        raise HTTPException(status_code=400, detail="نوع القرار غير معروف")
    if not reason:
        raise HTTPException(status_code=400, detail="اكتب سبب القرار")
    d = await _build(db, course)
    row = next((r for r in d["rows"] if r["student_db_id"] == sid), None)
    if not row:
        raise HTTPException(status_code=404, detail="الطالب غير مسجّل في المقرر")
    if kind == "second_uncapped" and not row["in_second"]:
        raise HTTPException(status_code=400, detail="الطالب ليس من طلاب الدور الثاني")
    if kind == "exceptional" and row["pass2"] is not False:
        raise HTTPException(status_code=400, detail="الدور الاستثنائي لمن رسب في الدور الثاني فقط (بعد رصد درجته)")
    label = ""
    if data.get("session_id") and ObjectId.is_valid(data["session_id"]):
        s = await db.faculty_board_sessions.find_one({"_id": ObjectId(data["session_id"])})
        label = f"جلسة {s.get('meeting_number', '')} · {s.get('meeting_date', '')}" if s else ""
    capped = bool(data.get("capped", True)) if kind == "exceptional" else False
    now = _now()
    await db.rc_decisions.update_one({"course_id": course_id, "student_db_id": sid, "kind": kind}, {"$set": {
        "capped": capped, "reason": reason, "session_id": data.get("session_id") or None, "session_label": label,
        "decided_by": current_user.get("id"), "decided_by_name": current_user.get("full_name", ""), "created_at": now}}, upsert=True)
    note = {"second_uncapped": "احتساب درجة الدور الثاني كاملة", "exceptional": "دخول الدور الاستثنائي" + ("" if capped else " بلا سقف")}[kind]
    await db.rc_log.insert_one({"course_id": course_id, "student_db_id": sid, "reg_no": row["reg_no"], "name": row["name"], "field": "decision",
                                "new": note, "note": reason, "by_name": current_user.get("full_name", ""), "by": current_user.get("id"), "at": now})
    await log_activity(current_user, "rc_board_decision", "rc_decisions", course_id, row["name"], {"kind": kind, "capped": capped, "reason": reason})
    return {"message": f"تم تسجيل القرار: {note}"}


@router.delete("/rc/courses/{course_id}/decisions/{student_db_id}/{kind}")
async def delete_decision(course_id: str, student_db_id: str, kind: str, current_user: dict = Depends(get_current_user)):
    _need(current_user, "rc_board_decisions", "قرارات المجلس في الدرجات")
    db = get_db()
    await _course_scoped(db, current_user, course_id)
    if kind == "exceptional" and await db.rc_marks.find_one({"course_id": course_id, "student_db_id": student_db_id, "exceptional_exam": {"$ne": None}}):
        raise HTTPException(status_code=400, detail="احذف درجة الدور الاستثنائي أولاً")
    r = await db.rc_decisions.delete_one({"course_id": course_id, "student_db_id": student_db_id, "kind": kind})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="القرار غير موجود")
    await db.rc_log.insert_one({"course_id": course_id, "student_db_id": student_db_id, "field": "decision", "new": "إلغاء قرار", "note": kind,
                                "by_name": current_user.get("full_name", ""), "by": current_user.get("id"), "at": _now()})
    await log_activity(current_user, "rc_board_decision_delete", "rc_decisions", course_id, student_db_id, {"kind": kind})
    return {"message": "تم إلغاء القرار"}


# ==================== ✅ الاعتماد ← النتائج (مسودة) ====================
async def _collect(db, user: dict, department_id: str, level: int, semester_id: str):
    sc = await _user_scope(db, user)
    if sc is not None and department_id not in sc["deps"]:
        raise HTTPException(status_code=403, detail="هذا القسم خارج نطاقك")
    courses = await db.courses.find({"department_id": department_id, "level": level, "semester_id": semester_id}).sort("name", 1).to_list(200)
    if not courses:
        raise HTTPException(status_code=400, detail="لا توجد مقررات لهذا القسم والمستوى في الفصل المختار")
    cc = {c.get("curriculum_course_id"): c for c in courses if c.get("curriculum_course_id")}
    credits = {str(x["_id"]): x.get("credit_hours") async for x in db.curriculum_courses.find({"_id": {"$in": [ObjectId(k) for k in cc if ObjectId.is_valid(k)]}}, {"credit_hours": 1})}
    sheets = []
    for c in courses:
        d = await _build(db, c)
        d["credits"] = c.get("credit_hours") or credits.get(c.get("curriculum_course_id") or "") or ""
        sheets.append(d)
    return courses, sheets


@router.get("/rc/publish/preview")
async def publish_preview(department_id: str, level: int, semester_id: str, current_user: dict = Depends(get_current_user)):
    _need(current_user, "rc_approve", "اعتماد الكشوف")
    db = get_db()
    _, sheets = await _collect(db, current_user, department_id, level, semester_id)
    return {"courses": [{"id": s["course"]["id"], "name": s["course"]["name"], "credits": s["credits"], "locked": s["sheet"]["coursework_locked"], **s["counts"]} for s in sheets]}


@router.post("/rc/publish")
async def publish(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """يبني بيان درجات الفصل لكل طالب من كشوف المقررات ← «النتائج» كمسودة (تُنشر من سجل العمليات)"""
    from .student_results import link_grades_import, _text
    _need(current_user, "rc_approve", "اعتماد الكشوف")
    _need(current_user, "manage_results", "إدارة النتائج")
    db = get_db()
    dep_id, sem_id, year = data.get("department_id") or "", data.get("semester_id") or "", _text(data.get("academic_year"))
    try:
        level, sem_no = int(data.get("level")), int(data.get("semester_no"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="اختر المستوى والفصل")
    if sem_no not in (1, 2) or not year:
        raise HTTPException(status_code=400, detail="اختر الفصل الدراسي (الأول/الثاني) والسنة الدراسية")
    courses, sheets = await _collect(db, current_user, dep_id, level, sem_id)
    unlocked = [s["course"]["name"] for s in sheets if not s["sheet"]["coursework_locked"]]
    if unlocked:
        raise HTTPException(status_code=400, detail="أقفل السعي أولاً في: " + "، ".join(unlocked))
    dep = await db.departments.find_one({"_id": ObjectId(dep_id)}, {"faculty_id": 1}) if ObjectId.is_valid(dep_id) else None
    fid = (dep or {}).get("faculty_id")
    per: dict = {}
    for s in sheets:
        for r in s["rows"]:
            p = per.setdefault(r["student_db_id"], {"name": r["name"], "reg_no": r["reg_no"], "grades": [], "rows": []})
            p["grades"].append({"course_name": s["course"]["name"], "credits": str(s["credits"] or ""), "total": E.fmt(r["final"]) or "",
                                "letter": r["letter"] or r["result"], "grade_letter": r["letter"] or r["result"],
                                "stage": r["stage"] if r["stage"] in ("first", "second", "tasfiya") else "first"})
            p["rows"].append((r, s["credits"], s["settings"]))
    olds = [str(o["_id"]) async for o in db.grade_imports.find({"source": "results_center", "department_id": dep_id, "level": level,
                                                                 "semester_no": sem_no, "academic_year": year}, {"_id": 1})]
    imp = {"source": "results_center", "filename": "مركز النتائج", "faculty_id": fid, "department_id": dep_id, "level": level,
           "semester_no": sem_no, "academic_year": year, "batch_no": "", "courses": [{"name": s["course"]["name"], "credits": s["credits"]} for s in sheets],
           "students_count": len(per), "supersedes": olds, "imported_by": current_user.get("username", ""), "imported_at": _now().isoformat()}
    iid = str((await db.grade_imports.insert_one(imp)).inserted_id)
    docs, students = [], []
    for sid, p in per.items():
        failed = sum(1 for r, _, _ in p["rows"] if r["result"] == "راسب")
        sec = sum(1 for r, _, _ in p["rows"] if r["stage"] == "pending")
        sec2 = sum(1 for r, _, _ in p["rows"] if r["result"] in ("بانتظار الدور الثاني", "بانتظار الدور الاستثنائي"))
        status = ("ناجح" if not failed and not sec else f"راسب في {failed} مقرر" if failed and not sec else
                  f"دور ثانٍ في {sec2} مقرر" if sec == sec2 and not failed else "النتيجة غير مكتملة")
        gpa = None
        if not sec:
            w = [(r["final"], float(c)) for r, c, _ in p["rows"] if isinstance(r["final"], (int, float)) and str(c).replace(".", "", 1).isdigit() and float(c) > 0]
            if w and sum(c for _, c in w):
                gpa = round(sum(v * c for v, c in w) / sum(c for _, c in w), 2)
        cfg = p["rows"][0][2]
        s = {"student_db_id": sid, "sem_status": status, "sem_gpa": E.fmt(gpa), "cum_gpa": None, "sem_grade": E.letter(gpa, cfg) if gpa is not None else None}
        students.append(s)
        docs.append({"import_id": iid, "student_db_id": sid, "student_name": p["name"], "reg_no": p["reg_no"], "faculty_id": fid, "department_id": dep_id,
                     "level": level, "semester_no": sem_no, "academic_year": year, "batch_no": "", "grades": p["grades"], "result": E.fmt(gpa) or "",
                     "note": "", "sem_stage": None, "sem_status": status, "sem_gpa": s["sem_gpa"], "cum_gpa": None, "created_at": _now().isoformat()})
    if docs:
        await db.student_grades.insert_many(docs)
    by_id = {str(x["_id"]): x async for x in db.students.find({"_id": {"$in": [ObjectId(k) for k in per if ObjectId.is_valid(k)]}},
                                                              {"student_id": 1, "department_id": 1, "user_id": 1, "full_name": 1})}
    linked = await link_grades_import(db, current_user, iid, imp, students, by_id, bool(data.get("notify", True)))
    await log_activity(current_user, "rc_publish", "grade_imports", iid, f"م{level} ف{sem_no} {year}", {"students": len(docs), "courses": len(sheets)})
    return {"import_id": iid, "students": len(docs), "courses": len(sheets), **linked,
            "message": f"تم الاعتماد: {len(docs)} طالب و{len(sheets)} مقرر · حُفظت في «النتائج» كمسودة مخفية — انشرها من «سجل العمليات»"}
