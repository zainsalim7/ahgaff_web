"""📋 نتائج الطلاب (بلا حسابات): رفع إكسل لكل (سنة + مستوى + فصل + كلية/قسم) · بطاقة الطالب · عرض حرفي للتطبيق"""
import asyncio
import io
import re
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from .deps import get_current_user, get_db, has_permission, log_activity
from .prep_leave import _user_scope

router = APIRouter()

VALS = ["status", "gpa", "grade"]
HEADERS = ["رقم القيد", "الحالة", "المعدل", "التقدير", "اسم الطالب (للمرجع فقط)"]
REASON_AR = {
    "invalid": "بلا رقم قيد",
    "out_of_scope": "الطالب ليس من الكلية/القسم المختار أو خارج نطاقك أو غير مسجّل",
    "duplicate": "مكرر في الملف — يُعتمد آخر صف",
}


def _can_manage(user: dict) -> bool:
    return user.get("role") == "admin" or has_permission(user, "manage_grades")


def _guard(user: dict):
    if not _can_manage(user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")


def _text(v):
    """القيمة نصاً كما هي — الفارغ = None (بلا تقريب ولا تنسيق)"""
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = str(v).strip()
    return s or None


def _year_key(y) -> int:
    nums = [int(n) for n in re.findall(r"\d{4}", y or "")]
    return max(nums) if nums else 0


def _shown(c):
    """الرقم كما يظهر في الخلية (مثلاً 58.30 بتنسيق 0.00 تبقى «58.30»)"""
    v = getattr(c, "value", None)
    fmt = (getattr(c, "number_format", "") or "").split(";")[0]
    if isinstance(v, (int, float)) and not isinstance(v, bool) and fmt not in ("", "General", "@"):
        m = re.search(r"0\.(0+)", fmt)
        dec = len(m.group(1)) if m else 0
        if "%" in fmt:
            return f"{v * 100:.{dec}f}%"
        if re.fullmatch(r"[#,]*0(\.0+)?", fmt):
            return f"{v:.{dec}f}"
    return v


def _rows(content: bytes, filename: str):
    name = (filename or "").lower()
    if name.endswith(".xls"):
        import xlrd
        sh = xlrd.open_workbook(file_contents=content).sheet_by_index(0)
        return [sh.row_values(i) for i in range(sh.nrows)]
    if name.endswith(".csv"):
        import csv
        return list(csv.reader(io.StringIO(content.decode("utf-8-sig"))))
    import openpyxl
    ws = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True).active
    return [[_shown(c) for c in r] for r in ws.iter_rows()]


async def _scope_student_query(db, user: dict, faculty_id: str = "", department_id: str = "") -> dict:
    """فلتر الطلاب = نطاق المستخدم ∩ الكلية/القسم المختار"""
    q: dict = {}
    sc = await _user_scope(db, user)
    if sc is not None:
        q["department_id"] = {"$in": list(sc["deps"])}
    if department_id:
        if sc is not None and department_id not in sc["deps"]:
            raise HTTPException(status_code=403, detail="هذا القسم خارج نطاقك")
        q["department_id"] = department_id
    elif faculty_id:
        deps = [str(d["_id"]) async for d in db.departments.find({"faculty_id": faculty_id}, {"_id": 1})]
        if sc is not None:
            deps = [d for d in deps if d in sc["deps"]]
            if not deps:
                raise HTTPException(status_code=403, detail="هذه الكلية خارج نطاقك")
        q["department_id"] = {"$in": deps}
    return q


async def migrate_legacy_results(db) -> None:
    """نقل صيغة الثمانية أعمدة القديمة (student_results) إلى result_entries دون فقدان — مرة واحدة"""
    async for r in db.student_results.find({}):
        for sem in (1, 2):
            vals = {k: r.get(f"s{sem}_{k}") for k in VALS}
            if not any(vals.values()):
                continue
            await db.result_entries.update_one(
                {"reg_no": r["reg_no"], "level": r["level"], "semester": sem, "academic_year": None},
                {"$setOnInsert": {**vals, "created_at": r.get("created_at"), "updated_at": r.get("updated_at"), "legacy": True}},
                upsert=True,
            )
    if await db.student_results.count_documents({}):
        await db.student_results.rename("student_results_legacy_migrated", dropTarget=True)


def _pick_latest(entries: list) -> dict:
    return max(entries, key=lambda e: (_year_key(e.get("academic_year")), str(e.get("updated_at") or "")))


def _cell(e: Optional[dict]) -> dict:
    return {k: (e or {}).get(k) for k in VALS}


# ==================== تطبيق الطالب ====================
@router.get("/students/me/results")
async def get_my_results(current_user: dict = Depends(get_current_user)):
    """نتيجة الطالب كما رُفعت حرفياً — لكل مستوى وفصل يُعرض الأحدث سنةً (المعيد تبقى نتيجته القديمة محفوظة)"""
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="هذا الـ endpoint للطلاب فقط")
    db = get_db()
    student = await db.students.find_one({"user_id": current_user["id"]}, {"student_id": 1})
    reg = _text((student or {}).get("student_id"))
    if not reg:
        return {"levels": []}
    groups: dict = {}
    async for e in db.result_entries.find({"reg_no": reg}):
        groups.setdefault(e["level"], {}).setdefault(e["semester"], []).append(e)
    return {"levels": [{
        "level": lvl,
        "first_semester": _cell(_pick_latest(groups[lvl][1]) if 1 in groups[lvl] else None),
        "second_semester": _cell(_pick_latest(groups[lvl][2]) if 2 in groups[lvl] else None),
    } for lvl in sorted(groups)]}


# ==================== جدول النتائج (الإدارة) ====================
@router.get("/results/students")
async def list_result_students(faculty_id: str = "", department_id: str = "", level: Optional[int] = None,
                               academic_year: str = "", q: str = "", page: int = 1,
                               current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    query = await _scope_student_query(db, current_user, faculty_id, department_id)
    if level:
        query["level"] = level
    if q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"full_name": rx}, {"student_id": rx}]
    total = await db.students.count_documents(query)
    limit = 50
    studs = await db.students.find(query, {"student_id": 1, "full_name": 1, "department_id": 1, "level": 1}) \
        .sort([("level", 1), ("full_name", 1)]).skip((max(page, 1) - 1) * limit).limit(limit).to_list(limit)
    regs = [s.get("student_id") for s in studs if s.get("student_id")]
    eq = {"reg_no": {"$in": regs}, **({"academic_year": academic_year} if academic_year else {})}
    released: dict = {}
    async for e in db.result_entries.find(eq, {"reg_no": 1, "level": 1, "semester": 1}):
        released.setdefault(e["reg_no"], set()).add((e["level"], e["semester"]))
    dep_ids = list({s.get("department_id") for s in studs if s.get("department_id")})
    deps = {str(d["_id"]): d.get("name", "") async for d in db.departments.find(
        {"_id": {"$in": [ObjectId(x) for x in dep_ids if ObjectId.is_valid(x)]}}, {"name": 1})}
    return {"total": total, "page": page, "pages": (total + limit - 1) // limit, "items": [{
        "id": str(s["_id"]), "reg_no": s.get("student_id", ""), "full_name": s.get("full_name", ""),
        "department_name": deps.get(s.get("department_id"), ""), "level": s.get("level"),
        "released_count": len(released.get(s.get("student_id"), ())),
    } for s in studs]}


async def _student_in_scope(db, user: dict, student_db_id: str) -> dict:
    if not ObjectId.is_valid(student_db_id):
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    st = await db.students.find_one({"_id": ObjectId(student_db_id)})
    if not st:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    sc = await _user_scope(db, user)
    if sc is not None and st.get("department_id") not in sc["deps"]:
        raise HTTPException(status_code=403, detail="هذا الطالب خارج نطاقك")
    return st


def _entry_out(e: dict) -> dict:
    return {"id": str(e["_id"]), "level": e["level"], "semester": e["semester"], "academic_year": e.get("academic_year"),
            **{k: e.get(k) for k in VALS}, "updated_by_name": e.get("updated_by_name", ""),
            "updated_at": e["updated_at"].isoformat() if isinstance(e.get("updated_at"), datetime) else e.get("updated_at")}


@router.get("/results/students/{student_db_id}")
async def student_results_card(student_db_id: str, current_user: dict = Depends(get_current_user)):
    """بطاقة الطالب: كل المستويات × الفصلين — الأحدث سنةً أولاً + السجل السابق (المعيد)"""
    _guard(current_user)
    db = get_db()
    st = await _student_in_scope(db, current_user, student_db_id)
    entries = [_entry_out(e) async for e in db.result_entries.find({"reg_no": st.get("student_id")})]
    entries.sort(key=lambda e: (e["level"], e["semester"], -_year_key(e["academic_year"]), str(e["updated_at"] or "")), reverse=False)
    dep = await db.departments.find_one({"_id": ObjectId(st["department_id"])}, {"name": 1}) if ObjectId.is_valid(st.get("department_id") or "") else None
    max_lvl = max([st.get("level") or 1, 4] + [e["level"] for e in entries])
    return {"student": {"id": student_db_id, "reg_no": st.get("student_id"), "full_name": st.get("full_name"),
                        "level": st.get("level"), "department_name": (dep or {}).get("name", "")},
            "max_level": max_lvl, "entries": entries}


@router.post("/results/entries")
async def upsert_entry(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """إضافة/تعديل خلية يدوياً من بطاقة الطالب"""
    _guard(current_user)
    db = get_db()
    st = await _student_in_scope(db, current_user, data.get("student_id", ""))
    try:
        level, sem = int(data.get("level")), int(data.get("semester"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="المستوى والفصل مطلوبان")
    if sem not in (1, 2) or level < 1:
        raise HTTPException(status_code=400, detail="مستوى أو فصل غير صحيح")
    year = _text(data.get("academic_year"))
    vals = {k: _text(data.get(k)) for k in VALS}
    if not any(vals.values()):
        r = await db.result_entries.delete_one({"reg_no": st["student_id"], "level": level, "semester": sem, "academic_year": year})
        if not r.deleted_count:
            raise HTTPException(status_code=400, detail="أدخل الحالة أو المعدل أو التقدير")
        return {"message": "تم حذف النتيجة (كل الحقول فارغة)"}
    now = datetime.now(timezone.utc)
    await db.result_entries.update_one(
        {"reg_no": st["student_id"], "level": level, "semester": sem, "academic_year": year},
        {"$set": {**vals, "student_db_id": str(st["_id"]), "department_id": st.get("department_id"), "updated_at": now,
                  "updated_by": current_user.get("id"), "updated_by_name": current_user.get("full_name", "")},
         "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    await log_activity(current_user, "edit_student_result", "result_entries", str(st["_id"]),
                       f"{st['student_id']} م{level} ف{sem} {year or ''}", vals)
    return {"message": "تم الحفظ"}


@router.delete("/results/entries/{entry_id}")
async def delete_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    e = await db.result_entries.find_one({"_id": ObjectId(entry_id)}) if ObjectId.is_valid(entry_id) else None
    if not e:
        raise HTTPException(status_code=404, detail="غير موجود")
    sc = await _user_scope(db, current_user)
    if sc is not None and not await db.students.find_one({"student_id": e["reg_no"], "department_id": {"$in": list(sc["deps"])}}):
        raise HTTPException(status_code=403, detail="هذا الطالب خارج نطاقك")
    await db.result_entries.delete_one({"_id": e["_id"]})
    await log_activity(current_user, "delete_student_result", "result_entries", entry_id, f"{e['reg_no']} م{e['level']} ف{e['semester']}")
    return {"message": "تم الحذف"}


# ==================== الرفع: سنة + مستوى + فصل + كلية/قسم ====================
def _params(academic_year, level, semester, scope, scope_id):
    year = _text(academic_year)
    if not year:
        raise HTTPException(status_code=400, detail="اختر السنة الدراسية")
    try:
        level, semester = int(level), int(semester)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="اختر المستوى والفصل")
    if semester not in (1, 2) or level < 1:
        raise HTTPException(status_code=400, detail="مستوى أو فصل غير صحيح")
    if scope not in ("faculty", "department") or not scope_id:
        raise HTTPException(status_code=400, detail="اختر الكلية أو القسم")
    return year, level, semester


@router.get("/results/template")
async def results_template(academic_year: str, level: int, semester: int, scope: str, scope_id: str,
                           current_user: dict = Depends(get_current_user)):
    """نموذج إكسل بأسماء وأرقام قيد طلاب النطاق والمستوى المختار — يُملأ الحالة/المعدل/التقدير فقط"""
    _guard(current_user)
    db = get_db()
    year, level, semester = _params(academic_year, level, semester, scope, scope_id)
    q = await _scope_student_query(db, current_user, scope_id if scope == "faculty" else "", scope_id if scope == "department" else "")
    q["level"] = level
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"م{level} ف{semester}"
    ws.sheet_view.rightToLeft = True
    ws.append(HEADERS)
    async for s in db.students.find({**q, "status": {"$nin": ["graduated", "expelled", "withdrawn"]}}, {"student_id": 1, "full_name": 1}).sort("full_name", 1):
        if s.get("student_id"):
            ws.append([s["student_id"], None, None, None, s.get("full_name", "")])
    for col, w in zip("ABCDE", (16, 14, 12, 14, 34)):
        ws.column_dimensions[col].width = w
        for c in ws[col]:
            c.number_format = "@"
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename=results_L{level}_S{semester}.xlsx"})


async def _analyze(db, rows: list, students_by_reg: dict, key: dict) -> list:
    out, last = [], {}
    for i, row in enumerate(rows, start=1):
        row = list(row) + [None] * (4 - len(row))
        reg = _text(row[0])
        vals = {k: _text(row[1 + j]) for j, k in enumerate(VALS)}
        if not reg and not any(vals.values()):
            continue
        if i == 1 and reg and not re.search(r"\d", reg):
            continue
        item = {"row": i, "reg_no": reg, **vals}
        st = students_by_reg.get(reg) if reg else None
        if not reg:
            item["status_code"] = "invalid"
        elif not st:
            item["status_code"] = "out_of_scope"
        else:
            item["student_name"] = st.get("full_name", "")
            if st.get("level") != key["level"]:
                item["warning"] = f"المستوى الحالي للطالب في النظام: {st.get('level') or '—'}"
            if reg in last:
                last[reg]["status_code"] = "duplicate"
                last[reg].pop("old", None)
            last[reg] = item
            old = await db.result_entries.find_one({"reg_no": reg, **key})
            item["status_code"] = "new" if not old else ("unchanged" if all(old.get(k) == vals[k] for k in VALS) else "changed")
            if item["status_code"] == "changed":
                item["old"] = {k: old.get(k) for k in VALS}
        out.append(item)
    for r in out:
        if r["status_code"] in REASON_AR:
            r["reason"] = REASON_AR[r["status_code"]]
    return out


async def _notify_students(db, user_ids: list) -> None:
    from services.firebase_service import send_notification_to_many
    if not user_ids:
        return
    title, body = "📢 صدرت نتيجتك", "تم نشر نتيجتك الدراسية — افتح التطبيق لعرضها"
    data = {"type": "results", "route": "/results"}
    now = datetime.now(timezone.utc).isoformat()
    await db.notifications.insert_many([{"user_id": u, "title": title, "message": body, "type": "results", "data": data,
                                         "is_read": False, "created_at": now} for u in user_ids])
    tokens = list({t["token"] for t in await db.fcm_tokens.find({"user_id": {"$in": user_ids}}).to_list(20000)})
    if tokens:
        try:
            await send_notification_to_many(tokens, title, body, data)
        except Exception:
            pass


@router.post("/results/import")
async def import_results(file: UploadFile = File(...), academic_year: str = Form(...), level: str = Form(...),
                         semester: str = Form(...), scope: str = Form(...), scope_id: str = Form(...),
                         commit: str = Form("false"), notify: str = Form("true"),
                         current_user: dict = Depends(get_current_user)):
    """الملف: رقم القيد | الحالة | المعدل | التقدير · commit=false معاينة دون حفظ · commit=true حفظ الجديد/المتغيّر + إشعار"""
    _guard(current_user)
    db = get_db()
    year, lvl, sem = _params(academic_year, level, semester, scope, scope_id)
    q = await _scope_student_query(db, current_user, scope_id if scope == "faculty" else "", scope_id if scope == "department" else "")
    try:
        rows = _rows(await file.read(), file.filename)
    except Exception:
        raise HTTPException(status_code=400, detail="تعذّرت قراءة الملف — استخدم ملف Excel (xlsx/xls) أو CSV")
    regs = [r for r in {_text((list(x) + [None])[0]) for x in rows} if r]
    students_by_reg = {s["student_id"]: s async for s in db.students.find(
        {**q, "student_id": {"$in": regs}}, {"student_id": 1, "full_name": 1, "level": 1, "user_id": 1, "department_id": 1})}
    key = {"level": lvl, "semester": sem, "academic_year": year}
    items = await _analyze(db, rows, students_by_reg, key)
    counts = {k: sum(1 for r in items if r["status_code"] == k) for k in ("new", "changed", "unchanged", "invalid", "out_of_scope", "duplicate")}
    counts["warnings"] = sum(1 for r in items if r.get("warning") and r["status_code"] in ("new", "changed", "unchanged"))
    if not counts["new"] and not counts["changed"] and not counts["unchanged"]:
        raise HTTPException(status_code=400, detail="لا يوجد في الملف أي صف لطالب من الكلية/القسم المختار")
    if commit.lower() != "true":
        return {"preview": True, "counts": counts, "rows": items}

    now = datetime.now(timezone.utc)
    notify_uids = []
    for r in items:
        if r["status_code"] not in ("new", "changed"):
            continue
        st = students_by_reg[r["reg_no"]]
        await db.result_entries.update_one(
            {"reg_no": r["reg_no"], **key},
            {"$set": {**{k: r[k] for k in VALS}, "student_db_id": str(st["_id"]), "department_id": st.get("department_id"),
                      "updated_at": now, "updated_by": current_user.get("id"), "updated_by_name": current_user.get("full_name", "")},
             "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        if st.get("user_id"):
            notify_uids.append(st["user_id"])
    notified = len(set(notify_uids)) if notify.lower() == "true" else 0
    if notified:
        asyncio.create_task(_notify_students(db, list(set(notify_uids))))
    await log_activity(current_user, "import_student_results", "result_entries", "", file.filename or "",
                       {**counts, **key, "scope": scope, "scope_id": scope_id, "notified": notified})
    msg = f"تم الحفظ ({year} · المستوى {lvl} · الفصل {'الأول' if sem == 1 else 'الثاني'}): {counts['new']} جديد · {counts['changed']} مُحدَّث · {counts['unchanged']} بلا تغيير"
    rejected = counts["invalid"] + counts["out_of_scope"]
    if rejected:
        msg += f" · رُفض {rejected} صف"
    if notified:
        msg += f" · أُرسل إشعار صدور النتيجة إلى {notified} طالب"
    return {"preview": False, "counts": counts, "notified": notified, "message": msg}
