"""📋 نتائج الطلاب (جدول بسيط بلا حسابات): رفع إكسل حرفي + عرضه للطالب كما كُتب تماماً"""
import io
import re
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from .deps import get_current_user, get_db, has_permission, log_activity

router = APIRouter()

COLS = ["s1_status", "s1_gpa", "s1_grade", "s2_status", "s2_gpa", "s2_grade"]
HEADERS = ["رقم القيد", "المستوى", "حالة الفصل1", "معدل الفصل1", "تقدير الفصل1", "حالة الفصل2", "معدل الفصل2", "تقدير الفصل2"]
LEVEL_WORDS = {"الأول": 1, "الاول": 1, "الثاني": 2, "الثالث": 3, "الرابع": 4, "الخامس": 5, "السادس": 6, "السابع": 7}


def _can_manage(user: dict) -> bool:
    return user.get("role") == "admin" or has_permission(user, "manage_grades")


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


@router.post("/student-results/import")
async def import_results(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """رفع إكسل: رقم القيد | المستوى | حالة1 | معدل1 | تقدير1 | حالة2 | معدل2 | تقدير2 — upsert بمفتاح (رقم القيد + المستوى)"""
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    try:
        rows = _rows(await file.read(), file.filename)
    except Exception:
        raise HTTPException(status_code=400, detail="تعذّرت قراءة الملف — استخدم ملف Excel (xlsx/xls) أو CSV")
    now = datetime.now(timezone.utc)
    inserted = updated = 0
    skipped = []
    for i, row in enumerate(rows, start=1):
        row = list(row) + [None] * (8 - len(row))
        reg, lvl = _text(row[0]), _level(row[1])
        if not reg and not _text(row[1]):
            continue
        if not reg or lvl is None:
            if i > 1:
                skipped.append(i)
            continue
        vals = {k: _text(row[2 + j]) for j, k in enumerate(COLS)}
        res = await db.student_results.update_one(
            {"reg_no": reg, "level": lvl},
            {"$set": {**vals, "updated_at": now, "updated_by": current_user.get("id")},
             "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        if res.upserted_id:
            inserted += 1
        else:
            updated += 1
    if not inserted and not updated:
        raise HTTPException(status_code=400, detail="لم يُعثر على أي صف صالح (رقم القيد + المستوى) في الملف")
    await log_activity(current_user, "import_student_results", "student_results", "", file.filename or "",
                       {"inserted": inserted, "updated": updated, "skipped": len(skipped)})
    msg = f"تم الرفع: {inserted} صف جديد · {updated} صف مُستبدل"
    if skipped:
        msg += f" · تُجاهل {len(skipped)} صف بلا رقم قيد/مستوى صحيح (الصفوف: {', '.join(map(str, skipped[:15]))})"
    return {"inserted": inserted, "updated": updated, "skipped_rows": skipped, "message": msg}


@router.get("/student-results")
async def list_results(q: str = "", current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    query = {"reg_no": {"$regex": re.escape(q.strip())}} if q.strip() else {}
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
    r = await db.student_results.find_one_and_delete({"_id": ObjectId(row_id)})
    if not r:
        raise HTTPException(status_code=404, detail="غير موجود")
    await log_activity(current_user, "delete_student_result", "student_results", row_id, f"{r.get('reg_no')} / {r.get('level')}")
    return {"message": "تم الحذف"}
