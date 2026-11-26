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
from .prep_leave import _user_scope, _target_in_scope

router = APIRouter()

VALS = ["status", "gpa", "grade"]
HEADERS = ["رقم القيد", "الحالة", "المعدل", "التقدير", "اسم الطالب (للمرجع فقط)"]
REASON_AR = {
    "invalid": "بلا رقم قيد",
    "out_of_scope": "الطالب ليس من الكلية/القسم/الشعبة المختارة أو خارج نطاقك أو غير مسجّل",
    "duplicate": "مكرر في الملف — يُعتمد آخر صف",
}


def _guard(user: dict):
    """إدارة: رفع/تعديل/إخفاء/تراجع"""
    if not has_permission(user, "manage_results"):
        raise HTTPException(status_code=403, detail="غير مصرح لك — تتطلب صلاحية «إدارة النتائج»")


def _guard_view(user: dict):
    if not (has_permission(user, "view_results") or has_permission(user, "manage_results")):
        raise HTTPException(status_code=403, detail="غير مصرح لك — تتطلب صلاحية «عرض النتائج»")


SNAP = VALS + ["hidden", "batch_id", "batch_hidden", "draft_batch_id", "student_db_id", "department_id"]


async def _snapshot(db, key: dict):
    e = await db.result_entries.find_one(key)
    return {k: e.get(k) for k in SNAP} if e else None


DRAFT = {"draft": True, "hidden": True}


async def _new_batch(db, user: dict, kind: str, meta: dict, department_ids: list) -> str:
    r = await db.result_batches.insert_one({
        "kind": kind, "hidden": False, **meta, "department_ids": [d for d in department_ids if d], "changes": [],
        "undone": False, "created_at": datetime.now(timezone.utc),
        "created_by": user.get("id"), "created_by_name": user.get("full_name", ""),
    })
    return str(r.inserted_id)


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
    student = await db.students.find_one({"user_id": current_user["id"]}, {"student_id": 1, "department_id": 1})
    reg = _text((student or {}).get("student_id"))
    if not reg:
        return {"levels": []}
    if await _student_paused(db, student):
        return {"levels": [], "paused": True, "message": PAUSED_MSG}
    groups: dict = {}
    async for e in db.result_entries.find({"reg_no": reg}):
        groups.setdefault(e["level"], {}).setdefault(e["semester"], []).append(e)

    def pick(lvl, sem):
        e = _pick_latest(groups[lvl][sem]) if sem in groups[lvl] else None
        return None if (e and (e.get("hidden") or e.get("batch_hidden"))) else e

    out = [{"level": lvl, "first_semester": _cell(pick(lvl, 1)), "second_semester": _cell(pick(lvl, 2))} for lvl in sorted(groups)]
    return {"levels": [x for x in out if any(x["first_semester"].values()) or any(x["second_semester"].values())]}


# ==================== جدول النتائج (الإدارة) ====================
@router.get("/results/students")
async def list_result_students(faculty_id: str = "", department_id: str = "", level: Optional[int] = None,
                               section: str = "", academic_year: str = "", q: str = "", page: int = 1,
                               current_user: dict = Depends(get_current_user)):
    _guard_view(current_user)
    db = get_db()
    query = await _scope_student_query(db, current_user, faculty_id, department_id)
    if level:
        query["level"] = level
    avail_sections = sorted(x for x in await db.students.distinct("section", query) if x)
    if section:
        query["section"] = section
    if q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"full_name": rx}, {"student_id": rx}]
    total = await db.students.count_documents(query)
    limit = 100
    studs = await db.students.find(query, {"student_id": 1, "full_name": 1, "department_id": 1, "level": 1}) \
        .sort([("level", 1), ("full_name", 1)]).skip((max(page, 1) - 1) * limit).limit(limit).to_list(limit)
    regs = [s.get("student_id") for s in studs if s.get("student_id")]
    eq = {"reg_no": {"$in": regs}, **({"academic_year": academic_year} if academic_year else {})}
    released: dict = {}
    cur: dict = {}
    lvl_of = {s.get("student_id"): s.get("level") for s in studs}
    async for e in db.result_entries.find(eq):
        released.setdefault(e["reg_no"], set()).add((e["level"], e["semester"]))
        if e["level"] == lvl_of.get(e["reg_no"]):
            cur.setdefault((e["reg_no"], e["semester"]), []).append(e)

    def cur_cell(reg, sem):
        lst = cur.get((reg, sem))
        if not lst:
            return None
        e = _pick_latest(lst)
        return {**_cell(e), "hidden": bool(e.get("hidden") or e.get("batch_hidden"))}
    dep_ids = list({s.get("department_id") for s in studs if s.get("department_id")})
    deps = {str(d["_id"]): d.get("name", "") async for d in db.departments.find(
        {"_id": {"$in": [ObjectId(x) for x in dep_ids if ObjectId.is_valid(x)]}}, {"name": 1})}
    return {"total": total, "page": page, "pages": (total + limit - 1) // limit, "sections": avail_sections, "items": [{
        "id": str(s["_id"]), "reg_no": s.get("student_id", ""), "full_name": s.get("full_name", ""),
        "department_name": deps.get(s.get("department_id"), ""), "level": s.get("level"),
        "released_count": len(released.get(s.get("student_id"), ())),
        "cur_s1": cur_cell(s.get("student_id"), 1), "cur_s2": cur_cell(s.get("student_id"), 2),
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
            **{k: e.get(k) for k in VALS}, "hidden": bool(e.get("hidden") or e.get("batch_hidden")),
            "hidden_by_batch": bool(e.get("batch_hidden")), "updated_by_name": e.get("updated_by_name", ""),
            "updated_at": e["updated_at"].isoformat() if isinstance(e.get("updated_at"), datetime) else e.get("updated_at")}


@router.get("/results/students/{student_db_id}")
async def student_results_card(student_db_id: str, current_user: dict = Depends(get_current_user)):
    """بطاقة الطالب: كل المستويات × الفصلين — الأحدث سنةً أولاً + السجل السابق (المعيد)"""
    _guard_view(current_user)
    db = get_db()
    st = await _student_in_scope(db, current_user, student_db_id)
    entries = [_entry_out(e) async for e in db.result_entries.find({"reg_no": st.get("student_id")})]
    entries.sort(key=lambda e: (e["level"], e["semester"], -_year_key(e["academic_year"]), str(e["updated_at"] or "")), reverse=False)
    dep = await db.departments.find_one({"_id": ObjectId(st["department_id"])}, {"name": 1, "faculty_id": 1}) if ObjectId.is_valid(st.get("department_id") or "") else None
    fac = await db.faculties.find_one({"_id": ObjectId(dep["faculty_id"])}, {"levels_count": 1}) if dep and ObjectId.is_valid(dep.get("faculty_id") or "") else None
    max_lvl = max([st.get("level") or 1, int((fac or {}).get("levels_count") or 4)] + [e["level"] for e in entries])
    return {"student": {"id": student_db_id, "reg_no": st.get("student_id"), "full_name": st.get("full_name"),
                        "level": st.get("level"), "department_name": (dep or {}).get("name", "")},
            "max_level": max_lvl, "entries": entries}


async def _push_change(db, batch_id: str, key: dict, before, after_exists: bool):
    await db.result_batches.update_one({"_id": ObjectId(batch_id)}, {"$push": {"changes": {"key": key, "before": before, "after_exists": after_exists}}})


def _who(st: dict) -> str:
    return f"{st.get('full_name', '')} ({st.get('student_id')})"


@router.post("/results/entries")
async def upsert_entry(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """إضافة/تعديل نتيجة فصل لطالب واحد يدوياً (قابل للتراجع)"""
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
    key = {"reg_no": st["student_id"], "level": level, "semester": sem, "academic_year": year}
    before = await _snapshot(db, key)
    meta = {"academic_year": year, "level": level, "semester": sem, "student_name": _who(st)}
    if not any(vals.values()):
        if not before:
            raise HTTPException(status_code=400, detail="أدخل الحالة أو المعدل أو التقدير")
        bid = await _new_batch(db, current_user, "manual_delete", meta, [st.get("department_id")])
        await _push_change(db, bid, key, before, False)
        await db.result_entries.delete_one(key)
        return {"message": "تم حذف النتيجة (كل الحقول فارغة)", "batch_id": bid}
    bid = await _new_batch(db, current_user, "manual", meta, [st.get("department_id")])
    await _push_change(db, bid, key, before, True)
    now = datetime.now(timezone.utc)
    draft_of = None
    if before and ObjectId.is_valid(before.get("batch_id") or ""):
        pb = await db.result_batches.find_one({"_id": ObjectId(before["batch_id"])}, {"draft": 1, "undone": 1})
        draft_of = before["batch_id"] if pb and pb.get("draft") and not pb.get("undone") else before.get("draft_batch_id")
    await db.result_entries.update_one(key, {
        "$set": {**vals, "student_db_id": str(st["_id"]), "department_id": st.get("department_id"), "batch_id": bid,
                 "batch_hidden": bool(draft_of), "draft_batch_id": draft_of, "updated_at": now, "updated_by": current_user.get("id"), "updated_by_name": current_user.get("full_name", "")},
        "$setOnInsert": {"created_at": now}}, upsert=True)
    await log_activity(current_user, "edit_student_result", "result_entries", str(st["_id"]), f"{st['student_id']} م{level} ف{sem} {year or ''}", vals)
    return {"message": "تم الحفظ", "batch_id": bid}


async def _entry_scoped(db, user: dict, entry_id: str) -> dict:
    e = await db.result_entries.find_one({"_id": ObjectId(entry_id)}) if ObjectId.is_valid(entry_id) else None
    if not e:
        raise HTTPException(status_code=404, detail="غير موجود")
    sc = await _user_scope(db, user)
    if sc is not None and not await db.students.find_one({"student_id": e["reg_no"], "department_id": {"$in": list(sc["deps"])}}):
        raise HTTPException(status_code=403, detail="هذا الطالب خارج نطاقك")
    return e


@router.delete("/results/entries/{entry_id}")
async def delete_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    e = await _entry_scoped(db, current_user, entry_id)
    key = {k: e.get(k) for k in ("reg_no", "level", "semester", "academic_year")}
    st = await db.students.find_one({"student_id": e["reg_no"]}, {"full_name": 1, "student_id": 1}) or {"student_id": e["reg_no"]}
    bid = await _new_batch(db, current_user, "manual_delete", {"academic_year": e.get("academic_year"), "level": e["level"],
                                                                 "semester": e["semester"], "student_name": _who(st)}, [e.get("department_id")])
    await _push_change(db, bid, key, {k: e.get(k) for k in SNAP}, False)
    await db.result_entries.delete_one({"_id": e["_id"]})
    await log_activity(current_user, "delete_student_result", "result_entries", entry_id, f"{e['reg_no']} م{e['level']} ف{e['semester']}")
    return {"message": "تم الحذف", "batch_id": bid}


@router.post("/results/entries/{entry_id}/visibility")
async def entry_visibility(entry_id: str, data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """👁 إخفاء/إظهار نتيجة طالب واحد في التطبيق"""
    _guard(current_user)
    db = get_db()
    e = await _entry_scoped(db, current_user, entry_id)
    hidden = bool(data.get("hidden"))
    await db.result_entries.update_one({"_id": e["_id"]}, {"$set": {"hidden": hidden}})
    await log_activity(current_user, "hide_student_result" if hidden else "show_student_result", "result_entries", entry_id, e["reg_no"])
    return {"message": "تم إخفاء النتيجة عن الطالب" if hidden else "النتيجة ظاهرة للطالب الآن", "hidden": hidden}


# ==================== سجل الرفعات: إخفاء رفعة كاملة · التراجع ====================
async def _batch_scoped(db, user: dict, batch_id: str) -> dict:
    b = await db.result_batches.find_one({"_id": ObjectId(batch_id)}) if ObjectId.is_valid(batch_id) else None
    if not b:
        raise HTTPException(status_code=404, detail="الرفعة غير موجودة")
    sc = await _user_scope(db, user)
    if sc is not None and (not b.get("department_ids") or not set(b["department_ids"]) <= sc["deps"]):
        raise HTTPException(status_code=403, detail="هذه الرفعة خارج نطاقك")
    return b


KIND_AR = {"import": "رفع ملف", "manual": "تعديل يدوي", "manual_delete": "حذف يدوي", "pause": "⏸ إيقاف عرض النتائج", "resume": "▶ استئناف عرض النتائج"}


@router.get("/results/batches")
async def list_batches(current_user: dict = Depends(get_current_user)):
    _guard_view(current_user)
    db = get_db()
    sc = await _user_scope(db, current_user)
    q = {} if sc is None else {"department_ids": {"$not": {"$elemMatch": {"$nin": list(sc["deps"])}}}, "department_ids.0": {"$exists": True}}
    items = []
    async for b in db.result_batches.find(q, {"changes": 0}).sort("created_at", -1).limit(200):
        items.append({
            "id": str(b["_id"]), "kind": b["kind"], "kind_name": KIND_AR.get(b["kind"], b["kind"]),
            "academic_year": b.get("academic_year"), "level": b.get("level"), "semester": b.get("semester"),
            "scope_name": (b.get("scope_name", "") + (f" · شعبة {b['section']}" if b.get("section") else "")), "student_name": b.get("student_name", ""), "file_name": b.get("file_name", ""),
            "counts": b.get("counts") or {}, "notified": b.get("notified", 0), "hidden": b.get("hidden", False), "draft": b.get("draft", False),
            "notify_pending": len(b.get("notify_uids") or []) if b.get("draft") and b.get("notify_on_publish") else 0,
            "published_by_name": b.get("published_by_name", ""),
            "undone": b.get("undone", False), "event_only": b.get("event_only", False), "undone_by_name": b.get("undone_by_name", ""),
            "created_by_name": b.get("created_by_name", ""),
            "created_at": b["created_at"].isoformat() if isinstance(b.get("created_at"), datetime) else b.get("created_at"),
        })
    return {"items": items}


@router.post("/results/batches/{batch_id}/visibility")
async def batch_visibility(batch_id: str, data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """👁 إخفاء/إظهار رفعة كاملة في تطبيق الطلاب"""
    _guard(current_user)
    db = get_db()
    b = await _batch_scoped(db, current_user, batch_id)
    if b.get("event_only"):
        raise HTTPException(status_code=400, detail="هذا سجل حدث وليس رفعة")
    if b.get("undone"):
        raise HTTPException(status_code=400, detail="تم التراجع عن هذه الرفعة")
    if b.get("draft"):
        raise HTTPException(status_code=400, detail="هذه الرفعة مسودة — استخدم زر «نشر للطلاب»")
    hidden = bool(data.get("hidden"))
    r = await db.result_entries.update_many({"batch_id": batch_id}, {"$set": {"batch_hidden": hidden}})
    await db.result_batches.update_one({"_id": b["_id"]}, {"$set": {"hidden": hidden}})
    await log_activity(current_user, "hide_results_batch" if hidden else "show_results_batch", "result_batches", batch_id, b.get("scope_name", ""))
    return {"hidden": hidden, "affected": r.modified_count,
            "message": f"تم إخفاء {r.modified_count} نتيجة عن الطلاب" if hidden else f"أصبحت {r.matched_count} نتيجة ظاهرة للطلاب"}


@router.post("/results/batches/{batch_id}/publish")
async def publish_batch(batch_id: str, data: dict = Body(default={}), current_user: dict = Depends(get_current_user)):
    """📢 نشر مسودة للطلاب + إرسال الإشعار لحظة النشر"""
    _guard(current_user)
    db = get_db()
    b = await _batch_scoped(db, current_user, batch_id)
    if b.get("event_only") or b.get("kind") != "import":
        raise HTTPException(status_code=400, detail="هذا السجل ليس رفعة نتائج")
    if b.get("undone"):
        raise HTTPException(status_code=400, detail="تم التراجع عن هذه الرفعة")
    if not b.get("draft"):
        raise HTTPException(status_code=400, detail="هذه الرفعة منشورة مسبقاً")
    r = await db.result_entries.update_many({"$or": [{"batch_id": batch_id}, {"draft_batch_id": batch_id}]},
                                            {"$set": {"batch_hidden": False, "draft_batch_id": None}})
    send = bool(data.get("notify", b.get("notify_on_publish", True)))
    uids = []
    if send and b.get("notify_uids"):
        uids = [d["user_id"] async for d in db.students.find(
            {"user_id": {"$in": b["notify_uids"]}, "department_id": {"$in": b.get("department_ids") or []}}, {"user_id": 1}) if d.get("user_id")]
        uids = list(set(uids))
    await db.result_batches.update_one({"_id": b["_id"]}, {"$set": {
        "draft": False, "hidden": False, "notified": len(uids), "published_at": datetime.now(timezone.utc),
        "published_by": current_user.get("id"), "published_by_name": current_user.get("full_name", "")}})
    if uids:
        asyncio.create_task(_notify_students(db, uids))
    await log_activity(current_user, "publish_results_batch", "result_batches", batch_id, b.get("scope_name", ""), {"notified": len(uids)})
    msg = f"تم النشر: أصبحت {r.matched_count} نتيجة ظاهرة للطلاب"
    if uids:
        msg += f" · أُرسل إشعار «صدرت نتيجتك» إلى {len(uids)} طالب"
    return {"published": r.matched_count, "notified": len(uids), "message": msg}


async def _undo_batch(db, current_user: dict, b: dict, batch_id: str):
    restored = skipped = 0
    for ch in reversed(b.get("changes") or []):
        key, before = ch["key"], ch.get("before")
        cur = await db.result_entries.find_one(key)
        if ch.get("after_exists") and (not cur or cur.get("batch_id") != batch_id):
            skipped += 1
            continue
        if not ch.get("after_exists") and cur:
            skipped += 1
            continue
        if before is None:
            await db.result_entries.delete_one(key)
        else:
            if before.get("batch_id") and ObjectId.is_valid(before["batch_id"]):
                pb = await db.result_batches.find_one({"_id": ObjectId(before["batch_id"])}, {"hidden": 1})
                before = {**before, "batch_hidden": bool((pb or {}).get("hidden"))}
            await db.result_entries.update_one(key, {"$set": {**before, "updated_at": datetime.now(timezone.utc)},
                                                     "$setOnInsert": {"created_at": datetime.now(timezone.utc)}}, upsert=True)
        restored += 1
    await db.result_batches.update_one({"_id": b["_id"]}, {"$set": {
        "undone": True, "undone_at": datetime.now(timezone.utc), "undone_by_name": current_user.get("full_name", ""),
        "undo_result": {"restored": restored, "skipped": skipped}}})
    await log_activity(current_user, "undo_results_batch", "result_batches", batch_id, b.get("scope_name", ""), {"restored": restored, "skipped": skipped})
    return restored, skipped


async def unlink_grades_import(db, user: dict, import_id: str) -> int:
    """عند حذف/استبدال كشف درجات: التراجع عن رفعات النتائج المرتبطة به"""
    n = 0
    async for b in db.result_batches.find({"grade_import_id": import_id, "undone": {"$ne": True}}).sort("created_at", -1):
        await _undo_batch(db, user, b, str(b["_id"]))
        n += 1
    return n


@router.post("/results/batches/{batch_id}/undo")
async def undo_batch(batch_id: str, current_user: dict = Depends(get_current_user)):
    """↩️ التراجع: تعود النتائج كما كانت قبل الرفعة/التعديل (دون إشعار) — يُتخطّى ما عُدِّل بعدها"""
    _guard(current_user)
    db = get_db()
    b = await _batch_scoped(db, current_user, batch_id)
    if b.get("event_only"):
        raise HTTPException(status_code=400, detail="هذا سجل حدث وليس رفعة")
    if b.get("undone"):
        raise HTTPException(status_code=400, detail="تم التراجع عن هذه الرفعة مسبقاً")
    restored, skipped = await _undo_batch(db, current_user, b, batch_id)
    msg = f"تم التراجع: أُعيدت {restored} نتيجة إلى ما كانت عليه"
    if skipped:
        msg += f" · تُخطّيت {skipped} نتيجة لأنها عُدّلت بعد هذه الرفعة"
    return {"restored": restored, "skipped": skipped, "message": msg}


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


@router.get("/results/template/blank")
async def results_template_blank(current_user: dict = Depends(get_current_user)):
    """نموذج إكسل فارغ: رقم القيد | الحالة | المعدل | التقدير"""
    _guard(current_user)
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "النتائج"
    ws.sheet_view.rightToLeft = True
    ws.append(HEADERS[:4])
    for col in "ABCD":
        ws.column_dimensions[col].width = 16
        for row in range(1, 501):
            ws[f"{col}{row}"].number_format = "@"
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=results_blank_template.xlsx"})


@router.get("/results/template")
async def results_template(academic_year: str, level: int, semester: int, scope: str, scope_id: str, section: str = "",
                           current_user: dict = Depends(get_current_user)):
    """نموذج إكسل بأسماء وأرقام قيد طلاب النطاق والمستوى المختار — يُملأ الحالة/المعدل/التقدير فقط"""
    _guard(current_user)
    db = get_db()
    year, level, semester = _params(academic_year, level, semester, scope, scope_id)
    q = await _scope_student_query(db, current_user, scope_id if scope == "faculty" else "", scope_id if scope == "department" else "")
    q["level"] = level
    if section:
        q["section"] = section
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
                         semester: str = Form(...), scope: str = Form(...), scope_id: str = Form(...), section: str = Form(""),
                         commit: str = Form("false"), notify: str = Form("true"),
                         current_user: dict = Depends(get_current_user)):
    """الملف: رقم القيد | الحالة | المعدل | التقدير · commit=false معاينة دون حفظ · commit=true حفظ الجديد/المتغيّر + إشعار"""
    _guard(current_user)
    db = get_db()
    year, lvl, sem = _params(academic_year, level, semester, scope, scope_id)
    q = await _scope_student_query(db, current_user, scope_id if scope == "faculty" else "", scope_id if scope == "department" else "")
    if section:
        q["section"] = section
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
    scope_doc = await db[("faculties" if scope == "faculty" else "departments")].find_one({"_id": ObjectId(scope_id)}, {"name": 1}) if ObjectId.is_valid(scope_id) else None
    dep_ids = q["department_id"]["$in"] if isinstance(q.get("department_id"), dict) else [q.get("department_id")]
    bid = await _new_batch(db, current_user, "import", {**key, "scope": scope, "scope_id": scope_id, "scope_name": (scope_doc or {}).get("name", ""),
                                                        "section": section or None, "file_name": file.filename or "", "counts": counts, **DRAFT}, dep_ids)
    for r in items:
        if r["status_code"] not in ("new", "changed"):
            continue
        st = students_by_reg[r["reg_no"]]
        ekey = {"reg_no": r["reg_no"], **key}
        await _push_change(db, bid, ekey, await _snapshot(db, ekey), True)
        await db.result_entries.update_one(
            ekey,
            {"$set": {**{k: r[k] for k in VALS}, "student_db_id": str(st["_id"]), "department_id": st.get("department_id"),
                      "batch_id": bid, "batch_hidden": True, "updated_at": now, "updated_by": current_user.get("id"), "updated_by_name": current_user.get("full_name", "")},
             "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        if st.get("user_id"):
            notify_uids.append(st["user_id"])
    await db.result_batches.update_one({"_id": ObjectId(bid)}, {"$set": {"notify_uids": list(set(notify_uids)), "notify_on_publish": notify.lower() == "true"}})
    await log_activity(current_user, "import_student_results", "result_entries", "", file.filename or "",
                       {**counts, **key, "scope": scope, "scope_id": scope_id, "draft": True})
    msg = f"تم الحفظ ({year} · المستوى {lvl} · الفصل {'الأول' if sem == 1 else 'الثاني'}): {counts['new']} جديد · {counts['changed']} مُحدَّث · {counts['unchanged']} بلا تغيير"
    rejected = counts["invalid"] + counts["out_of_scope"]
    if rejected:
        msg += f" · رُفض {rejected} صف"
    msg += " · حُفظت كمسودة مخفية عن الطلاب — انشرها من «سجل العمليات»"
    return {"preview": False, "counts": counts, "notified": 0, "draft": True, "batch_id": bid, "message": msg}


# ==================== 🔗 ربط كشف الدرجات بالنتائج + بيان الدرجات في التطبيق ====================
async def link_grades_import(db, user: dict, import_id: str, imp: dict, students: list, by_id: dict, notify: bool) -> dict:
    """نتيجة الفصل من الكشف ← result_entries (الحالة · المعدل الفصلي · «تراكمي X» مكان التقدير) كرفعة قابلة للإخفاء/التراجع"""
    if not has_permission(user, "manage_results"):
        return {"linked": 0, "notified": 0, "link_skipped": "لم تُنشر نتيجة الفصل في «النتائج» — تتطلب صلاحية «إدارة النتائج»"}
    if int(imp["semester_no"]) not in (1, 2):
        return {"linked": 0, "notified": 0, "link_skipped": "صفحة النتائج تدعم الفصلين الأول والثاني فقط"}
    key = {"level": int(imp["level"]), "semester": int(imp["semester_no"]), "academic_year": _text(imp.get("academic_year"))}
    rows = []
    for s in students:
        st = by_id.get(s.get("student_db_id") or "")
        if not st or not s.get("sem_status"):
            continue
        vals = {"status": _text(s.get("sem_status")), "gpa": _text(s.get("sem_gpa")),
                "grade": f"تراكمي {s['cum_gpa']}" if _text(s.get("cum_gpa")) else None}
        ekey = {"reg_no": st["student_id"], **key}
        before = await _snapshot(db, ekey)
        if not (before and all(before.get(k) == vals[k] for k in VALS)):
            rows.append((st, vals, ekey, before))
    if not rows:
        return {"linked": 0, "notified": 0}
    dep = await db.departments.find_one({"_id": ObjectId(imp["department_id"])}, {"name": 1}) if ObjectId.is_valid(imp.get("department_id") or "") else None
    bid = await _new_batch(db, user, "import", {**key, "scope": "department", "scope_id": imp.get("department_id"),
                                                "scope_name": (dep or {}).get("name", ""), "file_name": f"كشف درجات: {imp.get('filename', '')}",
                                                "grade_import_id": import_id, **DRAFT}, [imp.get("department_id")])
    now = datetime.now(timezone.utc)
    linked, uids = 0, set()
    counts = {"new": 0, "changed": 0, "unchanged": len(students) - len(rows)}
    for st, vals, ekey, before in rows:
        counts["changed" if before else "new"] += 1
        await _push_change(db, bid, ekey, before, True)
        await db.result_entries.update_one(ekey, {
            "$set": {**vals, "student_db_id": str(st["_id"]), "department_id": st.get("department_id"), "batch_id": bid,
                     "batch_hidden": True, "updated_at": now, "updated_by": user.get("id"), "updated_by_name": user.get("full_name", "")},
            "$setOnInsert": {"created_at": now}}, upsert=True)
        linked += 1
        if st.get("user_id"):
            uids.add(st["user_id"])
    await db.result_batches.update_one({"_id": ObjectId(bid)}, {"$set": {"counts": counts, "notify_uids": list(uids), "notify_on_publish": bool(notify)}})
    return {"linked": linked, "notified": 0, "draft": True, "results_batch_id": bid}


@router.get("/students/me/grades")
async def get_my_grades(current_user: dict = Depends(get_current_user)):
    """📑 بيان درجات الطالب: لكل فصل مقرراته (المجموع · التقدير · شارة الدور) — حرفياً من الكشف؛ الفصل المخفي لا يظهر"""
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="هذا الـ endpoint للطلاب فقط")
    db = get_db()
    student = await db.students.find_one({"user_id": current_user["id"]}, {"student_id": 1, "department_id": 1})
    if not student:
        return {"semesters": []}
    if await _student_paused(db, student):
        return {"semesters": [], "paused": True, "message": PAUSED_MSG}
    sid, reg = str(student["_id"]), _text(student.get("student_id"))
    recs = await db.student_grades.find({"$or": [{"student_db_id": sid}] + ([{"student_db_id": {"$in": ["", None]}, "reg_no": reg}] if reg else [])}).to_list(100)
    latest: dict = {}
    for r in recs:
        k = (r.get("level"), r.get("semester_no"))
        if k not in latest or _year_key(r.get("academic_year")) >= _year_key(latest[k].get("academic_year")):
            latest[k] = r
    out = []
    for (lvl, sem), r in sorted(latest.items(), key=lambda x: (x[0][0] or 0, x[0][1] or 0)):
        e = await db.result_entries.find_one({"reg_no": reg, "level": lvl, "semester": sem, "academic_year": r.get("academic_year")})
        if e and (e.get("hidden") or e.get("batch_hidden")):
            continue
        out.append({
            "level": lvl, "semester": sem,
            "status": _text(r.get("sem_status")), "gpa": _text(r.get("sem_gpa")), "cumulative_gpa": _text(r.get("cum_gpa")),
            "courses": [{"name": g.get("course_name"), "credits": _text(g.get("credits")), "total": _text(g.get("total")),
                         "grade": _text(g.get("letter")), "stage": g.get("stage") or "first",
                         "stage_label": {"first": "دور أول", "second": "دور ثان", "tasfiya": "تصفية", "exceptional": "استثنائي"}.get(g.get("stage") or "first")}
                        for g in r.get("grades", [])],
        })
    return {"semesters": out}


# ==================== ⏸ إيقاف عرض النتائج في التطبيق (جامعة / كلية / قسم) ====================
PAUSED_MSG = "النتائج غير متاحة حالياً"


async def _student_paused(db, student: dict) -> bool:
    dep_id = (student or {}).get("department_id")
    dep = await db.departments.find_one({"_id": ObjectId(dep_id)}, {"faculty_id": 1}) if ObjectId.is_valid(dep_id or "") else None
    ors = [{"scope": "all"}, {"scope": "department", "scope_id": dep_id}]
    if dep and dep.get("faculty_id"):
        ors.append({"scope": "faculty", "scope_id": dep["faculty_id"]})
    return bool(await db.results_pauses.find_one({"$or": ors}))


async def _scope_label(db, scope: str, scope_id) -> str:
    if scope == "all":
        return "الجامعة بالكامل"
    coll = "faculties" if scope == "faculty" else "departments"
    d = await db[coll].find_one({"_id": ObjectId(scope_id)}, {"name": 1}) if ObjectId.is_valid(scope_id or "") else None
    return (d or {}).get("name", "")


@router.get("/results/pauses")
async def list_pauses(current_user: dict = Depends(get_current_user)):
    _guard_view(current_user)
    db = get_db()
    sc = await _user_scope(db, current_user)
    items = []
    async for p in db.results_pauses.find({}).sort("paused_at", -1):
        mine = await _target_in_scope(db, sc, p["scope"], p.get("scope_id"))
        visible = sc is None or p["scope"] == "all" or mine or (p["scope"] == "faculty" and p.get("scope_id") in sc["facs"])
        if visible:
            items.append({"id": str(p["_id"]), "scope": p["scope"], "scope_id": p.get("scope_id"), "scope_name": p.get("scope_name", ""),
                          "paused_by_name": p.get("paused_by_name", ""), "can_resume": mine and has_permission(current_user, "manage_results"),
                          "paused_at": p["paused_at"].isoformat() if isinstance(p.get("paused_at"), datetime) else p.get("paused_at")})
    return {"items": items, "can_pause_all": sc is None}


@router.post("/results/pauses")
async def set_pause(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """paused=true يوقف العرض للنطاق · paused=false يستأنفه — لا يُحذف أي شيء"""
    _guard(current_user)
    db = get_db()
    scope, scope_id, paused = data.get("scope"), data.get("scope_id") or None, bool(data.get("paused"))
    if scope not in ("all", "faculty", "department") or (scope != "all" and not scope_id):
        raise HTTPException(status_code=400, detail="اختر النطاق")
    sc = await _user_scope(db, current_user)
    if not await _target_in_scope(db, sc, scope, scope_id):
        raise HTTPException(status_code=403, detail="هذا النطاق خارج صلاحيتك")
    key = {"scope": scope, "scope_id": None if scope == "all" else scope_id}
    name = await _scope_label(db, scope, scope_id)
    if paused:
        await db.results_pauses.update_one(key, {"$set": {"scope_name": name, "paused_at": datetime.now(timezone.utc),
                                                          "paused_by": current_user.get("id"), "paused_by_name": current_user.get("full_name", "")}}, upsert=True)
    else:
        r = await db.results_pauses.delete_one(key)
        if not r.deleted_count:
            raise HTTPException(status_code=404, detail="العرض غير موقوف لهذا النطاق")
    if scope == "all":
        deps = []
    elif scope == "faculty":
        deps = [str(d["_id"]) async for d in db.departments.find({"faculty_id": scope_id}, {"_id": 1})]
    else:
        deps = [scope_id]
    bid = await _new_batch(db, current_user, "pause" if paused else "resume", {"scope": scope, "scope_id": scope_id, "scope_name": name}, deps)
    await db.result_batches.update_one({"_id": ObjectId(bid)}, {"$set": {"event_only": True}})
    await log_activity(current_user, "pause_results" if paused else "resume_results", "results_pauses", scope_id or "all", name)
    return {"paused": paused, "message": f"تم إيقاف عرض النتائج في التطبيق: {name}" if paused else f"عاد عرض النتائج في التطبيق: {name}"}
