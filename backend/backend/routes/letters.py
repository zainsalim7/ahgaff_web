"""✉️ الخطابات الرسمية البسيطة — بنفس تجربة الإفادات: قالب → متن بمتغيرات → مرسَل إليه → PDF بترقيم تسلسلي + QR + سجل.
مستقلة تماماً عن وحدة المراسلات المتقدمة."""
import io
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from bson import ObjectId

from .deps import get_db, get_current_user, log_activity, export_stamp
from .statements import _apply_vars, _var_ctx, _safe_dept, _academic_year_display, get_verify_base, student_gender, GENDER_VARS

router = APIRouter(tags=["الخطابات"])
SETTINGS_ID = "letters"
DEFAULT_REF = "{seq}/خ/{yy}"
LETTER_VARS = ["اسم_المرسل_إليه", "صفة_المرسل_إليه", "جهة_المرسل_إليه", "تكريم", "الموضوع", "التاريخ", "التاريخ_الهجري", "العام_الجامعي",
               "اسم_الطالب", "رقم_القيد", "الكلية", "القسم", "المستوى", "الجنسية", "اسم_الموظف", "الوظيفة", "وحدة_الموظف", "اسم_المدرس", "جدول_الأسماء", "قائمة_الأسماء", "عدد_الأسماء"]


def _can(user: dict) -> bool:
    return user.get("role") not in ("teacher", "student")


def _guard(user: dict):
    if not _can(user):
        raise HTTPException(status_code=403, detail="غير مصرح لك بإصدار الخطابات")


def _oid(v):
    return ObjectId(v) if v and ObjectId.is_valid(str(v)) else None


# ───────── الإعدادات (كليشة واحدة للخطابات) ─────────
class LetterSettings(BaseModel):
    org_name: Optional[str] = "جامعة الأحقاف"
    office_name: Optional[str] = ""
    office_name_en: Optional[str] = ""
    logo_base64: Optional[str] = ""
    signature_base64: Optional[str] = ""
    default_signatory_name: Optional[str] = ""
    default_signatory_title: Optional[str] = ""
    phones: Optional[str] = ""
    fax: Optional[str] = ""
    address: Optional[str] = ""
    po_box: Optional[str] = ""
    website: Optional[str] = ""
    reference_format: Optional[str] = DEFAULT_REF
    closing: Optional[str] = "وتفضلوا بقبول فائق الاحترام والتقدير،"


@router.get("/letters/settings")
async def get_settings(current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    s = await get_db().letter_settings.find_one({"_id": SETTINGS_ID}) or {}
    s.pop("_id", None)
    return {**LetterSettings().dict(), **s, "variables": LETTER_VARS}


@router.put("/letters/settings")
async def put_settings(data: LetterSettings, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    await get_db().letter_settings.update_one({"_id": SETTINGS_ID}, {"$set": {**data.dict(), "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"ok": True}


# ───────── القوالب ─────────
class LetterTemplate(BaseModel):
    name: str
    subject: Optional[str] = ""
    body: str
    signatory_name: Optional[str] = ""
    signatory_title: Optional[str] = ""
    concerns: Optional[str] = "none"  # none | student | employee | teacher | many
    is_active: bool = True


def _ser(d: dict) -> dict:
    d = dict(d); d["id"] = str(d.pop("_id")); return d


@router.get("/letter-templates")
async def list_templates(current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    return [_ser(t) for t in await get_db().letter_templates.find({"is_active": {"$ne": False}}).sort("name", 1).to_list(300)]


@router.post("/letter-templates")
async def create_template(data: LetterTemplate, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    if not data.name.strip() or not data.body.strip():
        raise HTTPException(status_code=400, detail="اسم القالب والمتن مطلوبان")
    r = await get_db().letter_templates.insert_one({**data.dict(), "created_at": datetime.now(timezone.utc).isoformat(), "created_by": current_user.get("id")})
    return {"id": str(r.inserted_id)}


@router.put("/letter-templates/{tid}")
async def update_template(tid: str, data: LetterTemplate, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    await get_db().letter_templates.update_one({"_id": ObjectId(tid)}, {"$set": data.dict()})
    return {"ok": True}


@router.delete("/letter-templates/{tid}")
async def delete_template(tid: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    await get_db().letter_templates.update_one({"_id": ObjectId(tid)}, {"$set": {"is_active": False}})
    return {"ok": True}


# ───────── المرسَل إليهم (دليل المناصب) والأشخاص ─────────
@router.get("/letters/recipients")
async def recipients(current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    out = []
    for p in await db.correspondence_positions.find({"is_active": {"$ne": False}}).sort([("kind", 1), ("sort_order", 1)]).to_list(500):
        org = ""
        if p.get("organization_id") and ObjectId.is_valid(p["organization_id"]):
            org = ((await db.org_units.find_one({"_id": ObjectId(p["organization_id"])}, {"name": 1})) or {}).get("name", "")
        hon = (p.get("honorific") or "").strip()
        out.append({"id": str(p["_id"]), "kind": p.get("kind", "INTERNAL"), "title": p["title_ar"], "name": f"{hon}/ {p['holder_name']}" if hon else p["holder_name"],
                    "organization": org or p.get("external_organization") or "", "suffix": p.get("recipient_suffix") or "المحترم"})
    return out


@router.get("/letters/people")
async def people(kind: str = Query(...), q: str = Query("", min_length=0), current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    rx = {"$regex": re.escape(q.strip()), "$options": "i"}
    if kind == "student":
        rows = await db.students.find({"$or": [{"full_name": rx}, {"student_id": rx}]}, {"full_name": 1, "student_id": 1, "level": 1}).limit(15).to_list(15)
        return [{"id": str(r["_id"]), "kind": "student", "label": r.get("full_name", ""), "sub": f"قيد {r.get('student_id', '')} · م{r.get('level', '')}"} for r in rows]
    if kind == "employee":
        rows = await db.employees.find({"$or": [{"full_name": rx}, {"employee_no": rx}]}, {"full_name": 1, "employee_no": 1, "job_title": 1}).limit(15).to_list(15)
        return [{"id": str(r["_id"]), "kind": "employee", "label": r.get("full_name", ""), "sub": f"{r.get('employee_no', '')} · {r.get('job_title', '')}"} for r in rows]
    rows = await db.teachers.find({"$or": [{"full_name": rx}, {"name": rx}]}, {"full_name": 1, "name": 1, "academic_title": 1}).limit(15).to_list(15)
    return [{"id": str(r["_id"]), "kind": "teacher", "label": r.get("full_name") or r.get("name", ""), "sub": r.get("academic_title", "")} for r in rows]


# ───────── بناء سياق المتغيرات ─────────
async def _person_row(db, kind: str, pid: str) -> Optional[dict]:
    oid = _oid(pid)
    if not oid:
        return None
    if kind == "student":
        s = await db.students.find_one({"_id": oid})
        if not s:
            return None
        dept = await _safe_dept(db, s)
        fac = await db.faculties.find_one({"_id": _oid(s.get("faculty_id") or (dept or {}).get("faculty_id"))}) if (s.get("faculty_id") or (dept or {}).get("faculty_id")) else None
        return {"kind": "student", "name": s.get("full_name", ""), "code": s.get("student_id", ""), "c1": (fac or {}).get("name", ""), "c2": (dept or {}).get("name", ""), "c3": f"المستوى {s.get('level', '')}", "_doc": s, "_dept": dept, "_fac": fac}
    if kind == "employee":
        e = await db.employees.find_one({"_id": oid})
        if not e:
            return None
        unit = await db.org_units.find_one({"_id": _oid(e.get("org_unit_id"))}, {"name": 1}) if e.get("org_unit_id") else None
        return {"kind": "employee", "name": e.get("full_name", ""), "code": e.get("employee_no", ""), "c1": e.get("job_title", ""), "c2": (unit or {}).get("name", ""), "c3": "", "_doc": e}
    t = await db.teachers.find_one({"_id": oid})
    if not t:
        return None
    fac = await db.faculties.find_one({"_id": _oid(t.get("faculty_id"))}, {"name": 1}) if t.get("faculty_id") else None
    return {"kind": "teacher", "name": t.get("full_name") or t.get("name", ""), "code": t.get("academic_title", ""), "c1": (fac or {}).get("name", ""), "c2": "", "c3": "", "_doc": t}


TABLE_HEADERS = {"student": ["م", "الاسم", "رقم القيد", "الكلية", "القسم", "المستوى"], "employee": ["م", "الاسم", "الرقم الوظيفي", "الوظيفة", "الوحدة"], "teacher": ["م", "الاسم", "اللقب", "الكلية"],
                 "mixed": ["م", "الاسم", "الصفة", "الرقم", "الجهة / الكلية", "القسم / الوظيفة"]}
KIND_AR = {"student": "طالب", "employee": "موظف", "teacher": "مدرّس"}


def _table_rows(rows: List[dict]) -> dict:
    """جدول الأسماء: أعمدة حسب الصفة إن كانت موحّدة، وجدول مختلط (طلاب + موظفون + مدرّسون) إن تنوّعت"""
    if not rows:
        return {"headers": [], "rows": []}
    kinds = {r["kind"] for r in rows}
    if len(kinds) > 1:
        data = []
        for i, r in enumerate(rows):
            if r["kind"] == "student":
                data.append([str(i + 1), r["name"], KIND_AR["student"], r["code"], r["c1"], f"{r['c2']} — {r['c3']}".strip(" —")])
            elif r["kind"] == "employee":
                data.append([str(i + 1), r["name"], KIND_AR["employee"], r["code"], r["c2"], r["c1"]])
            else:
                data.append([str(i + 1), r["name"], KIND_AR["teacher"], r["code"], r["c1"], ""])
        return {"headers": TABLE_HEADERS["mixed"], "rows": data, "mixed": True}
    k = rows[0]["kind"]
    if k == "student":
        data = [[str(i + 1), r["name"], r["code"], r["c1"], r["c2"], r["c3"]] for i, r in enumerate(rows)]
    elif k == "employee":
        data = [[str(i + 1), r["name"], r["code"], r["c1"], r["c2"]] for i, r in enumerate(rows)]
    else:
        data = [[str(i + 1), r["name"], r["code"], r["c1"]] for i, r in enumerate(rows)]
    return {"headers": TABLE_HEADERS[k], "rows": data}


async def _build_ctx(db, rec: dict, subject: str, people_in: List[dict]) -> tuple:
    from hijridate import Gregorian
    now = datetime.now(timezone.utc)
    hj = Gregorian(now.year, now.month, now.day).to_hijri()
    ctx = {"اسم_المرسل_إليه": rec.get("name", ""), "صفة_المرسل_إليه": rec.get("title", ""), "جهة_المرسل_إليه": rec.get("organization", ""), "تكريم": rec.get("suffix", ""),
           "الموضوع": subject or "", "التاريخ": now.strftime("%Y/%m/%d") + "م", "التاريخ_الهجري": f"{hj.year}/{hj.month:02d}/{hj.day:02d}هـ", "العام_الجامعي": await _academic_year_display(db),
           "اسم_الطالب": "", "رقم_القيد": "", "الكلية": "", "القسم": "", "المستوى": "", "الجنسية": "", "اسم_الموظف": "", "الوظيفة": "", "وحدة_الموظف": "", "اسم_المدرس": "", "جدول_الأسماء": "", "قائمة_الأسماء": "", "عدد_الأسماء": ""}
    rows = [r for r in [await _person_row(db, p.get("kind", "student"), p.get("id", "")) for p in people_in] if r]
    if rows:
        first = rows[0]
        if first["kind"] == "student":
            s, dept, fac = first["_doc"], first["_dept"], first["_fac"]
            sc = _var_ctx(s, dept, fac, ctx["العام_الجامعي"])
            for k in ("اسم_الطالب", "رقم_القيد", "الجنسية", "المستوى"):
                ctx[k] = sc.get(k, "")
            ctx["الكلية"], ctx["القسم"] = (fac or {}).get("name", ""), (dept or {}).get("name", "")
            g = student_gender(s, fac)
            for k, (m, f) in GENDER_VARS.items():
                ctx[k] = f if g == "female" else m
        elif first["kind"] == "employee":
            ctx["اسم_الموظف"], ctx["الوظيفة"], ctx["وحدة_الموظف"] = first["name"], first["c1"], first["c2"]
        else:
            ctx["اسم_المدرس"], ctx["الكلية"] = first["name"], first["c1"]
        ctx["قائمة_الأسماء"] = "، ".join(r["name"] for r in rows)
        ctx["عدد_الأسماء"] = str(len(rows))
        ctx["جدول_الأسماء"] = "{جدول_الأسماء}"  # يبقى علامة يرسمها مولّد PDF كجدول
    table = _table_rows([{k: v for k, v in r.items() if not k.startswith("_")} for r in rows])
    return ctx, table, [{"kind": r["kind"], "id": str(r["_doc"]["_id"]), "name": r["name"]} for r in rows]


class PreviewIn(BaseModel):
    body: str
    subject: Optional[str] = ""
    recipient: dict = {}
    people: List[dict] = []


@router.post("/letters/preview-body")
async def preview_body(data: PreviewIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    ctx, table, _ = await _build_ctx(get_db(), data.recipient, data.subject or "", data.people)
    return {"body": _apply_vars(data.body, ctx), "table": table}


# ───────── الإصدار ─────────
class IssueIn(BaseModel):
    template_id: Optional[str] = None
    template_name: Optional[str] = ""
    subject: str
    body: str
    recipient: dict
    people: List[dict] = []
    signatory_name: Optional[str] = ""
    signatory_title: Optional[str] = ""
    valid_days: Optional[int] = None
    base_url: Optional[str] = None
    notes: Optional[str] = ""


@router.post("/letters/issue")
async def issue_letter(data: IssueIn, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    if not data.subject.strip() or not data.body.strip() or not (data.recipient or {}).get("name") and not (data.recipient or {}).get("title"):
        raise HTTPException(status_code=400, detail="الموضوع والمتن والمرسَل إليه مطلوبة")
    settings = await db.letter_settings.find_one({"_id": SETTINGS_ID}) or {}
    ctx, table, people = await _build_ctx(db, data.recipient, data.subject, data.people)
    body = _apply_vars(data.body.strip(), ctx)
    year = datetime.now(timezone.utc).year
    counter = await db.letter_counters.find_one_and_update({"_id": str(year)}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    seq = counter["seq"]
    fmt = (settings.get("reference_format") or "").strip() or DEFAULT_REF
    number = fmt.replace("{seq}", str(seq)).replace("{year}", str(year)).replace("{yy}", str(year % 100))
    token = uuid.uuid4().hex
    verify_base = (await get_verify_base(db)) or (data.base_url or "").rstrip("/")
    doc = {"serial": seq, "number_display": number, "year": year, "subject": data.subject.strip(), "body": body, "table": table, "people": people,
           "recipient": {k: (data.recipient or {}).get(k, "") for k in ("id", "name", "title", "organization", "suffix")},
           "template_id": data.template_id, "template_name": data.template_name or "", "notes": data.notes or "",
           "signatory_name": (data.signatory_name or settings.get("default_signatory_name") or "").strip(), "signatory_title": (data.signatory_title or settings.get("default_signatory_title") or "").strip(),
           "verify_token": token, "verify_url": f"{verify_base}/verify-letter?token={token}" if verify_base else token,
           "issued_by": current_user.get("id", ""), "issued_by_name": current_user.get("full_name", ""), "issued_at": datetime.now(timezone.utc).isoformat(),
           "expires_at": (datetime.now(timezone.utc) + timedelta(days=data.valid_days)).isoformat() if data.valid_days and data.valid_days > 0 else None, "is_revoked": False}
    r = await db.letters.insert_one(doc)
    await log_activity(current_user, "issue_letter", "letter", str(r.inserted_id), data.subject.strip(), {"number": number, "to": doc["recipient"].get("name") or doc["recipient"].get("title")})
    return {"id": str(r.inserted_id), "number": number, "verify_url": doc["verify_url"], "token": token}


@router.get("/letters")
async def list_letters(q: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None, limit: int = 200, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    query: dict = {}
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"subject": rx}, {"number_display": rx}, {"recipient.name": rx}, {"recipient.title": rx}, {"people.name": rx}, {"template_name": rx}]
    if date_from:
        query.setdefault("issued_at", {})["$gte"] = date_from
    if date_to:
        query.setdefault("issued_at", {})["$lte"] = date_to + "T23:59:59"
    rows = await get_db().letters.find(query, {"body": 0, "table": 0}).sort("issued_at", -1).limit(limit).to_list(limit)
    return [_ser(r) for r in rows]


@router.post("/letters/{lid}/revoke")
async def revoke(lid: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    await get_db().letters.update_one({"_id": ObjectId(lid)}, {"$set": {"is_revoked": True, "revoked_at": datetime.now(timezone.utc).isoformat(), "revoked_by": current_user.get("full_name", "")}})
    return {"ok": True}


@router.post("/letters/{lid}/restore")
async def restore(lid: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    await get_db().letters.update_one({"_id": ObjectId(lid)}, {"$set": {"is_revoked": False}})
    return {"ok": True}


@router.get("/verify/letter/{token}")
async def verify_letter(token: str):
    s = await get_db().letters.find_one({"verify_token": token})
    if not s:
        return {"valid": False, "message": "لا يوجد خطاب بهذا الرمز — قد تكون الوثيقة غير صحيحة"}
    base = {"number": s.get("number_display"), "issued_at": (s.get("issued_at") or "")[:10], "subject": s.get("subject"), "recipient": (s.get("recipient") or {}).get("title") or (s.get("recipient") or {}).get("name")}
    if s.get("is_revoked"):
        return {"valid": False, "message": "هذا الخطاب ملغى من الجهة المصدرة ولا يُعتد به", **base}
    if s.get("expires_at") and s["expires_at"] < datetime.now(timezone.utc).isoformat():
        return {"valid": False, "message": f"انتهت صلاحية هذا الخطاب بتاريخ {s['expires_at'][:10]}", **base}
    return {"valid": True, "message": "خطاب صحيح صادر رسمياً من جامعة الأحقاف", **base, "signatory": s.get("signatory_title", ""), "template": s.get("template_name", "")}


@router.get("/letters/{lid}/pdf")
async def letter_pdf(lid: str, current_user: dict = Depends(get_current_user)):
    _guard(current_user)
    db = get_db()
    s = await db.letters.find_one({"_id": ObjectId(lid)})
    if not s:
        raise HTTPException(status_code=404, detail="الخطاب غير موجود")
    settings = await db.letter_settings.find_one({"_id": SETTINGS_ID}) or {}
    from services.letter_pdf import build_letter_pdf
    pdf = build_letter_pdf(s, settings)
    from urllib.parse import quote
    fname = quote(f"خطاب {s.get('number_display', '')} - {export_stamp()}.pdf")
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename*=UTF-8''{fname}", "X-Filename": fname})
