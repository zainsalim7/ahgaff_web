"""📋 نتائج الطلاب (جدول بسيط بلا حسابات): رفع إكسل حرفي + عرضه للطالب كما كُتب تماماً"""
import asyncio
import io
import re
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from .deps import get_current_user, get_db, has_permission, log_activity, get_own_department_ids

router = APIRouter()

COLS = ["s1_status", "s1_gpa", "s1_grade", "s2_status", "s2_gpa", "s2_grade"]
HEADERS = ["رقم القيد", "المستوى", "حالة الفصل1", "معدل الفصل1", "تقدير الفصل1", "حالة الفصل2", "معدل الفصل2", "تقدير الفصل2"]
LEVEL_WORDS = {"الأول": 1, "الاول": 1, "الثاني": 2, "الثالث": 3, "الرابع": 4, "الخامس": 5, "السادس": 6, "السابع": 7}


def _can_manage(user: dict) -> bool:
    return user.get("role") == "admin" or has_permission(user, "manage_grades")


async def _scope_regs(db, user: dict):
    """🔒 None = غير مقيَّد · وإلا مجموعة أرقام قيد طلاب أقسام نطاق المستخدم"""
    deps = await get_own_department_ids(user)
    if deps is None:
        return None
    return {_text(r) for r in await db.students.distinct("student_id", {"department_id": {"$in": list(deps)}}) if _text(r)}


def _text(v):
    """القيمة نصاً كما هي — الفارغ = None (بلا تقريب ولا تنسيق)"""
    if v is None:
        return None
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = str(v).strip()
    return s or None


def _level(v):
    s = _text(v)
    if not s:
        return None
    if re.fullmatch(r"\d+", s):
        return int(s)
    return LEVEL_WORDS.get(s.replace("المستوى", "").strip())


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


def _cell(c):
    return {"status": c[0], "gpa": c[1], "grade": c[2]}


@router.get("/students/me/results")
async def get_my_results(current_user: dict = Depends(get_current_user)):
    """نتيجة الطالب كما رُفعت حرفياً — مرتبة بالمستوى"""
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="هذا الـ endpoint للطلاب فقط")
    db = get_db()
    student = await db.students.find_one({"user_id": current_user["id"]}, {"student_id": 1})
    reg = _text((student or {}).get("student_id"))
    if not reg:
        return {"levels": []}
    rows = await db.student_results.find({"reg_no": reg}).sort("level", 1).to_list(50)
    return {"levels": [{
        "level": r["level"],
        "first_semester": _cell([r.get(k) for k in COLS[:3]]),
        "second_semester": _cell([r.get(k) for k in COLS[3:]]),
    } for r in rows]}


@router.get("/student-results/template")
async def results_template(current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "النتائج"
    ws.sheet_view.rightToLeft = True
    ws.append(HEADERS)
    ws.append(["127050", 1, "ناجح", "88.4", "جيد جداً", "ناجح", "91.2", "ممتاز"])
    for col in "ABCDEFGH":
        ws.column_dimensions[col].width = 16
        for c in ws[col]:
            c.number_format = "@"
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=student_results_template.xlsx"})


REASON_AR = {"invalid": "بلا رقم قيد أو مستوى صحيح", "out_of_scope": "طالب خارج نطاقك أو غير مسجّل في النظام", "duplicate": "مكرر في الملف — يُعتمد آخر صف"}


async def _analyze(db, rows: list, allowed) -> list:
    """تصنيف كل صف: new / changed / unchanged / invalid / out_of_scope / duplicate — دون أي كتابة"""
    out, last = [], {}
    for i, row in enumerate(rows, start=1):
        row = list(row) + [None] * (8 - len(row))
        reg, lvl = _text(row[0]), _level(row[1])
        if not reg and not _text(row[1]):
            continue
        item = {"row": i, "reg_no": reg, "level": lvl if lvl is not None else _text(row[1]),
                **{k: _text(row[2 + j]) for j, k in enumerate(COLS)}}
        if not reg or lvl is None:
            if i == 1:
                continue
            item["status"] = "invalid"
        elif allowed is not None and reg not in allowed:
            item["status"] = "out_of_scope"
        else:
            if (reg, lvl) in last:
                last[(reg, lvl)]["status"] = "duplicate"
            last[(reg, lvl)] = item
            old = await db.student_results.find_one({"reg_no": reg, "level": lvl})
            item["status"] = "new" if not old else ("unchanged" if all(old.get(k) == item[k] for k in COLS) else "changed")
            if old and item["status"] == "changed":
                item["old"] = {k: old.get(k) for k in COLS}
        if item["status"] in REASON_AR:
            item["reason"] = REASON_AR[item["status"]]
        out.append(item)
    regs = list({r["reg_no"] for r in out if r["reg_no"]})
    names = {s["student_id"]: s.get("full_name", "") async for s in db.students.find({"student_id": {"$in": regs}}, {"student_id": 1, "full_name": 1})}
    for r in out:
        r["student_name"] = names.get(r["reg_no"], "")
    return out


async def _notify_students(db, regs: list) -> None:
    from services.firebase_service import send_notification_to_many
    uids = [s["user_id"] async for s in db.students.find({"student_id": {"$in": regs}, "user_id": {"$nin": [None, ""]}}, {"user_id": 1})]
    if not uids:
        return
    title, body = "📢 صدرت نتيجتك", "تم نشر نتيجتك الدراسية — افتح التطبيق لعرضها"
    now = datetime.now(timezone.utc).isoformat()
    await db.notifications.insert_many([{"user_id": u, "title": title, "message": body, "type": "results", "is_read": False, "created_at": now} for u in uids])
    tokens = list({t["token"] for t in await db.fcm_tokens.find({"user_id": {"$in": uids}}).to_list(20000)})
    if tokens:
        try:
            await send_notification_to_many(tokens, title, body, {"type": "results", "route": "/results"})
        except Exception:
            pass


@router.post("/student-results/import")
async def import_results(file: UploadFile = File(...), commit: str = Form("true"), notify: str = Form("true"),
                         current_user: dict = Depends(get_current_user)):
    """commit=false: معاينة دون حفظ · commit=true: حفظ (upsert رقم القيد + المستوى) + إشعار من أُضيفت/تغيّرت نتيجتهم إن notify=true"""
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    try:
        rows = _rows(await file.read(), file.filename)
    except Exception:
        raise HTTPException(status_code=400, detail="تعذّرت قراءة الملف — استخدم ملف Excel (xlsx/xls) أو CSV")
    items = await _analyze(db, rows, await _scope_regs(db, current_user))
    counts = {k: sum(1 for r in items if r["status"] == k) for k in ("new", "changed", "unchanged", "invalid", "out_of_scope", "duplicate")}
    if not counts["new"] and not counts["changed"] and not counts["unchanged"]:
        if counts["out_of_scope"]:
            raise HTTPException(status_code=403, detail="كل أرقام القيد في الملف لطلاب خارج نطاقك أو غير مسجّلين في النظام")
        raise HTTPException(status_code=400, detail="لم يُعثر على أي صف صالح (رقم القيد + المستوى) في الملف")
    if commit.lower() != "true":
        return {"preview": True, "counts": counts, "rows": items}

    now = datetime.now(timezone.utc)
    changed_regs = set()
    for r in items:
        if r["status"] not in ("new", "changed"):
            continue
        await db.student_results.update_one(
            {"reg_no": r["reg_no"], "level": r["level"]},
            {"$set": {**{k: r[k] for k in COLS}, "updated_at": now, "updated_by": current_user.get("id")},
             "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        changed_regs.add(r["reg_no"])
    notified = 0
    if notify.lower() == "true" and changed_regs:
        notified = await db.students.count_documents({"student_id": {"$in": list(changed_regs)}, "user_id": {"$nin": [None, ""]}})
        asyncio.create_task(_notify_students(db, list(changed_regs)))
    await log_activity(current_user, "import_student_results", "student_results", "", file.filename or "", {**counts, "notified": notified})
    msg = f"تم الحفظ: {counts['new']} جديد · {counts['changed']} مُحدَّث · {counts['unchanged']} بلا تغيير"
    rejected = counts["invalid"] + counts["out_of_scope"]
    if rejected:
        msg += f" · رُفض {rejected} صف"
    if notified:
        msg += f" · أُرسل إشعار صدور النتيجة إلى {notified} طالب"
    return {"preview": False, "counts": counts, "notified": notified, "inserted": counts["new"], "updated": counts["changed"], "message": msg}


@router.get("/student-results")
async def list_results(q: str = "", current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    query = {"reg_no": {"$regex": re.escape(q.strip())}} if q.strip() else {}
    allowed = await _scope_regs(db, current_user)
    if allowed is not None:
        query = {"$and": [query, {"reg_no": {"$in": list(allowed)}}]}
    total = await db.student_results.count_documents(query)
    rows = await db.student_results.find(query).sort([("updated_at", -1), ("reg_no", 1), ("level", 1)]).to_list(200)
    regs = list({r["reg_no"] for r in rows})
    names = {s["student_id"]: s.get("full_name", "") async for s in db.students.find({"student_id": {"$in": regs}}, {"student_id": 1, "full_name": 1})}
    return {"total": total, "items": [{
        "id": str(r["_id"]), "reg_no": r["reg_no"], "level": r["level"], "student_name": names.get(r["reg_no"], ""),
        **{k: r.get(k) for k in COLS},
    } for r in rows]}


@router.delete("/student-results/{row_id}")
async def delete_result(row_id: str, current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    if not ObjectId.is_valid(row_id):
        raise HTTPException(status_code=404, detail="غير موجود")
    db = get_db()
    r = await db.student_results.find_one({"_id": ObjectId(row_id)})
    if not r:
        raise HTTPException(status_code=404, detail="غير موجود")
    allowed = await _scope_regs(db, current_user)
    if allowed is not None and r.get("reg_no") not in allowed:
        raise HTTPException(status_code=403, detail="هذا الطالب خارج نطاقك")
    await db.student_results.delete_one({"_id": r["_id"]})
    await log_activity(current_user, "delete_student_result", "student_results", row_id, f"{r.get('reg_no')} / {r.get('level')}")
    return {"message": "تم الحذف"}
