"""📜 المرحلة 2 — سجل العناصر النائبة (allowlist) + المحلّلات المُسقَطة + التعقيم + الشروط التصريحية
لا eval / لا تعبيرات تنفيذية — كل مفتاح له resolver صريح وصلاحية.
"""
import re
import hashlib
import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

import bleach
from bson import ObjectId

P_CONTACT = "placeholder.contact.read"
P_ACADEMIC = "placeholder.academic.read"
P_STUDENT = "entity.student.read"
P_EMPLOYEE = "entity.employee.read"
P_FACULTY = "entity.faculty.read"

PH_RE = re.compile(r"\{\{\s*([a-z_]+\.[a-z_0-9]+)\s*\}\}")

# key -> (label_ar, label_en, data_type, source, required_permission|None)
REGISTRY: Dict[str, tuple] = {
    "student.full_name": ("اسم الطالب", "Student name", "STRING", "STUDENT", P_STUDENT),
    "student.student_id": ("الرقم الجامعي", "Student number", "STRING", "STUDENT", P_STUDENT),
    "student.college_name": ("الكلية", "College", "STRING", "STUDENT", P_STUDENT),
    "student.department_name": ("القسم", "Department", "STRING", "STUDENT", P_STUDENT),
    "student.program_name": ("البرنامج", "Program", "STRING", "STUDENT", P_STUDENT),
    "student.level_name": ("المستوى", "Level", "STRING", "STUDENT", P_STUDENT),
    "student.section": ("الشعبة", "Section", "STRING", "STUDENT", P_STUDENT),
    "student.status": ("الحالة الأكاديمية", "Status", "STRING", "STUDENT", P_STUDENT),
    "student.enrollment_year": ("سنة الالتحاق", "Enrollment year", "STRING", "STUDENT", P_STUDENT),
    "student.graduation_date": ("تاريخ التخرج", "Graduation date", "DATE", "STUDENT", P_STUDENT),
    "student.phone": ("هاتف الطالب", "Student phone", "STRING", "STUDENT", P_CONTACT),
    "student.email": ("بريد الطالب", "Student email", "STRING", "STUDENT", P_CONTACT),
    "student.gpa": ("المعدل التراكمي", "GPA", "NUMBER", "STUDENT", P_ACADEMIC),
    "student.attendance_rate": ("نسبة الحضور", "Attendance rate", "NUMBER", "STUDENT", P_ACADEMIC),
    "student.warnings_count": ("عدد الإنذارات", "Warnings count", "NUMBER", "STUDENT", P_ACADEMIC),
    "employee.full_name": ("اسم الموظف", "Employee name", "STRING", "EMPLOYEE", P_EMPLOYEE),
    "employee.employee_number": ("الرقم الوظيفي", "Employee number", "STRING", "EMPLOYEE", P_EMPLOYEE),
    "employee.job_title": ("المسمى الوظيفي", "Job title", "STRING", "EMPLOYEE", P_EMPLOYEE),
    "employee.grade": ("الدرجة", "Grade", "STRING", "EMPLOYEE", P_EMPLOYEE),
    "employee.category": ("الفئة", "Category", "STRING", "EMPLOYEE", P_EMPLOYEE),
    "employee.organization_name": ("الوحدة التنظيمية", "Organization", "STRING", "EMPLOYEE", P_EMPLOYEE),
    "employee.hire_date": ("تاريخ التعيين", "Hire date", "DATE", "EMPLOYEE", P_EMPLOYEE),
    "employee.qualification": ("المؤهل", "Qualification", "STRING", "EMPLOYEE", P_EMPLOYEE),
    "employee.phone": ("هاتف الموظف", "Employee phone", "STRING", "EMPLOYEE", P_CONTACT),
    "employee.email": ("بريد الموظف", "Employee email", "STRING", "EMPLOYEE", P_CONTACT),
    "faculty.full_name": ("اسم عضو هيئة التدريس", "Faculty name", "STRING", "FACULTY", P_FACULTY),
    "faculty.academic_title": ("اللقب الأكاديمي", "Academic title", "STRING", "FACULTY", P_FACULTY),
    "faculty.specialization": ("التخصص", "Specialization", "STRING", "FACULTY", P_FACULTY),
    "faculty.college_name": ("الكلية", "College", "STRING", "FACULTY", P_FACULTY),
    "faculty.department_name": ("القسم", "Department", "STRING", "FACULTY", P_FACULTY),
    "organization.name_ar": ("اسم الجهة (عربي)", "Organization (AR)", "STRING", "ORGANIZATION", None),
    "organization.name_en": ("اسم الجهة (إنجليزي)", "Organization (EN)", "STRING", "ORGANIZATION", None),
    "organization.code": ("كود الجهة", "Organization code", "STRING", "ORGANIZATION", None),
    "organization.parent_name": ("الجهة الأم", "Parent organization", "STRING", "ORGANIZATION", None),
    "recipient.name": ("اسم المستلم", "Recipient name", "STRING", "RECIPIENT", None),
    "recipient.organization": ("جهة المستلم", "Recipient organization", "STRING", "RECIPIENT", None),
    "recipient.title": ("صفة المستلم", "Recipient title", "STRING", "RECIPIENT", None),
    "correspondence.subject": ("موضوع الخطاب", "Subject", "STRING", "CORRESPONDENCE", None),
    "correspondence.official_number": ("الرقم الرسمي", "Official number", "STRING", "CORRESPONDENCE", None),
    "correspondence.date": ("تاريخ الخطاب (ميلادي)", "Date (Gregorian)", "DATE", "CORRESPONDENCE", None),
    "correspondence.date_hijri": ("تاريخ الخطاب (هجري)", "Date (Hijri)", "DATE", "CORRESPONDENCE", None),
    "correspondence.organization_name": ("الجهة المُصدِرة", "Issuing organization", "STRING", "CORRESPONDENCE", None),
    "correspondence.priority": ("الأولوية", "Priority", "STRING", "CORRESPONDENCE", None),
    "students.table": ("جدول الطلاب المرتبطين", "Students table", "HTML", "STUDENT", P_STUDENT),
    "students.list": ("قائمة أسماء الطلاب", "Students list", "STRING", "STUDENT", P_STUDENT),
    "students.count": ("عدد الطلاب", "Students count", "NUMBER", "STUDENT", P_STUDENT),
    "employees.table": ("جدول الموظفين المرتبطين", "Employees table", "HTML", "EMPLOYEE", P_EMPLOYEE),
    "employees.list": ("قائمة أسماء الموظفين", "Employees list", "STRING", "EMPLOYEE", P_EMPLOYEE),
    "employees.count": ("عدد الموظفين", "Employees count", "NUMBER", "EMPLOYEE", P_EMPLOYEE),
    "faculty_members.table": ("جدول أعضاء هيئة التدريس", "Faculty table", "HTML", "FACULTY", P_FACULTY),
    "faculty_members.list": ("قائمة أسماء أعضاء هيئة التدريس", "Faculty list", "STRING", "FACULTY", P_FACULTY),
    "faculty_members.count": ("عدد أعضاء هيئة التدريس", "Faculty count", "NUMBER", "FACULTY", P_FACULTY),
    "signer.name": ("اسم الموقّع", "Signer name", "STRING", "SIGNER", None),
    "signer.job_title": ("صفة الموقّع", "Signer title", "STRING", "SIGNER", None),
    "signer.signed_at": ("تاريخ التوقيع", "Signed at", "DATE", "SIGNER", None),
    "system.university_name_ar": ("اسم الجامعة (عربي)", "University (AR)", "STRING", "SYSTEM", None),
    "system.university_name_en": ("اسم الجامعة (إنجليزي)", "University (EN)", "STRING", "SYSTEM", None),
    "system.today": ("تاريخ اليوم", "Today", "DATE", "SYSTEM", None),
    "system.today_hijri": ("تاريخ اليوم (هجري)", "Today (Hijri)", "DATE", "SYSTEM", None),
}
NAMESPACE_AR = {"student": "بيانات الطالب", "employee": "بيانات الموظف", "faculty": "بيانات عضو هيئة التدريس", "organization": "بيانات الإدارة",
                "recipient": "بيانات المستلم", "correspondence": "بيانات الخطاب", "input": "مدخلات يدوية", "system": "بيانات النظام", "signer": "بيانات الموقّع",
                "students": "قوائم الطلاب (متعدد)", "employees": "قوائم الموظفين (متعدد)", "faculty_members": "قوائم هيئة التدريس (متعدد)"}
ENTITY_FOR_NS = {"student": "STUDENT", "employee": "EMPLOYEE", "faculty": "FACULTY", "organization": "ORGANIZATION", "students": "STUDENT", "employees": "EMPLOYEE", "faculty_members": "FACULTY"}
LIST_COLUMNS = {"students": [("full_name", "الاسم"), ("student_id", "الرقم الجامعي"), ("college_name", "الكلية"), ("department_name", "القسم"), ("level_name", "المستوى")],
                "employees": [("full_name", "الاسم"), ("employee_number", "الرقم الوظيفي"), ("job_title", "المسمى الوظيفي"), ("organization_name", "الوحدة")],
                "faculty_members": [("full_name", "الاسم"), ("academic_title", "اللقب"), ("specialization", "التخصص"), ("college_name", "الكلية")]}


def _list_ns(ns: str, rows: List[dict]) -> dict:
    import html as _h
    cols = LIST_COLUMNS[ns]
    head = "".join(f"<th>{c[1]}</th>" for c in cols)
    body = "".join("<tr><td>" + str(i + 1) + "</td>" + "".join(f"<td>{_h.escape(str(r.get(k) or ''))}</td>" for k, _ in cols) + "</tr>" for i, r in enumerate(rows))
    table = f'<table class="ph-table" style="width:100%;border-collapse:collapse"><thead><tr><th>م</th>{head}</tr></thead><tbody>{body}</tbody></table>' if rows else ""
    return {"table": table, "list": "، ".join(_h.escape(str(r.get("full_name") or "")) for r in rows), "count": str(len(rows)) if rows else ""}
UNISSUED_NUMBER = "[سيتم إنشاء الرقم عند الإصدار]"
SOFT_NS = {"recipient", "signer", "input"}


def registry_list(ctx) -> List[dict]:
    """العناصر النائبة المتاحة للمستخدم (المسموحة بصلاحياته فقط)"""
    out = []
    for k, (ar, en, dt, src, perm) in REGISTRY.items():
        if perm and not ctx.has_perm_anywhere(perm):
            continue
        out.append({"key": k, "label_ar": ar, "label_en": en, "data_type": dt, "source": src, "required_permission": perm, "namespace": k.split(".")[0], "namespace_ar": NAMESPACE_AR[k.split(".")[0]]})
    return out


def extract_keys(text: str) -> List[str]:
    return sorted(set(PH_RE.findall(text or "")))


def validate_keys(keys: List[str], input_keys: List[str]) -> List[str]:
    """يعيد المفاتيح غير المسجلة (بما فيها input.* غير المعرّفة)"""
    bad = []
    for k in keys:
        if k.startswith("input."):
            if k.split(".", 1)[1] not in input_keys:
                bad.append(k)
        elif k not in REGISTRY:
            bad.append(k)
    return bad


# ───────── التعقيم (منع XSS المخزّن) ─────────
ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "span", "div", "hr", "mark"]
ALLOWED_ATTRS = {"*": ["style", "dir", "class"], "td": ["colspan", "rowspan"], "th": ["colspan", "rowspan"], "span": ["data-placeholder"]}
try:
    from bleach.css_sanitizer import CSSSanitizer
    _css = CSSSanitizer(allowed_css_properties=["text-align", "font-weight", "font-style", "text-decoration", "direction", "margin", "padding", "line-height", "font-size", "width"])
except Exception:
    _css = None


def sanitize_html(html: str) -> str:
    if not html:
        return ""
    kw = {"tags": ALLOWED_TAGS, "attributes": ALLOWED_ATTRS, "protocols": ["http", "https", "mailto"], "strip": True}
    if _css:
        kw["css_sanitizer"] = _css
    return bleach.clean(html, **kw)


def is_unsafe(html: str) -> bool:
    low = (html or "").lower()
    return any(x in low for x in ("<script", "<iframe", "javascript:", "onerror=", "onload=", "onclick=", "<object", "<embed"))


def plain_text(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html or "").replace("&nbsp;", " ")


# ───────── الشروط التصريحية ─────────
def eval_condition(cond: Optional[dict], data: Dict[str, Any]) -> bool:
    if not cond:
        return True
    field, op, val = cond.get("field", ""), cond.get("operator", "EXISTS"), cond.get("value")
    ns, _, key = field.partition(".")
    cur = (data.get(ns) or {}).get(key)
    if op == "EQUALS":
        return cur == val
    if op == "NOT_EQUALS":
        return cur != val
    if op == "EXISTS":
        return cur not in (None, "")
    if op == "NOT_EXISTS":
        return cur in (None, "")
    if op == "IN":
        return cur in (val or [])
    return False


# ───────── التواريخ ─────────
def hijri_str(d: Optional[datetime]) -> str:
    if not d:
        return ""
    try:
        from hijridate import Gregorian
        h = Gregorian(d.year, d.month, d.day).to_hijri()
        return f"{h.day} {h.month_name('ar')} {h.year}هـ"
    except Exception:
        return ""


def greg_str(d: Optional[datetime]) -> str:
    return d.strftime("%Y/%m/%d") if d else ""


# ───────── المحلّلات المُسقَطة (DTO) ─────────
async def _names(db, faculty_id, department_id):
    f = await db.faculties.find_one({"_id": ObjectId(faculty_id)}, {"name": 1}) if faculty_id and ObjectId.is_valid(faculty_id) else None
    d = await db.departments.find_one({"_id": ObjectId(department_id)}, {"name": 1, "program_name": 1}) if department_id and ObjectId.is_valid(department_id) else None
    return (f or {}).get("name", ""), (d or {}).get("name", ""), (d or {}).get("program_name", "")


async def resolve_student(db, sid: str, allowed: set) -> Optional[dict]:
    s = await db.students.find_one({"_id": ObjectId(sid)}) if ObjectId.is_valid(sid) else None
    if not s:
        return None
    fac, dep, prog = await _names(db, s.get("faculty_id"), s.get("department_id"))
    base = {"id": sid, "full_name": s.get("full_name", ""), "student_id": s.get("student_id", ""), "college_name": fac, "department_name": dep,
            "program_name": prog or s.get("program_code") or dep, "level_name": f"المستوى {s.get('level')}" if s.get("level") else "", "section": s.get("section", ""),
            "status": s.get("status", ""), "enrollment_year": str(s.get("enrollment_year") or ""), "graduation_date": str(s.get("graduation_date") or "")[:10]}
    if P_CONTACT in allowed:
        base.update({"phone": s.get("phone", ""), "email": s.get("email", "")})
    if P_ACADEMIC in allowed:
        g = await db.student_grades.find_one({"student_id": sid}, {"cgpa": 1, "gpa": 1})
        att = await db.attendance.count_documents({"student_id": sid})
        pres = await db.attendance.count_documents({"student_id": sid, "status": {"$in": ["present", "late"]}})
        base.update({"gpa": (g or {}).get("cgpa") or (g or {}).get("gpa") or "", "attendance_rate": round(pres / att * 100, 1) if att else "",
                     "warnings_count": await db.notification_history.count_documents({"student_id": sid, "type": "warning"})})
    return base


async def resolve_employee(db, eid: str, allowed: set) -> Optional[dict]:
    e = await db.employees.find_one({"_id": ObjectId(eid)}) if ObjectId.is_valid(eid) else None
    if not e:
        return None
    org = await db.org_units.find_one({"_id": ObjectId(e["org_unit_id"])}, {"name": 1}) if e.get("org_unit_id") and ObjectId.is_valid(e["org_unit_id"]) else None
    base = {"id": eid, "full_name": e.get("full_name", ""), "employee_number": e.get("employee_no", ""), "job_title": e.get("job_title", ""), "grade": e.get("grade", ""),
            "category": e.get("category", ""), "organization_name": (org or {}).get("name", ""), "hire_date": str(e.get("hire_date") or "")[:10], "qualification": e.get("qualification", "")}
    if P_CONTACT in allowed:
        base.update({"phone": e.get("phone", ""), "email": e.get("email", "")})
    return base


async def resolve_faculty(db, tid: str, allowed: set) -> Optional[dict]:
    t = await db.teachers.find_one({"_id": ObjectId(tid)}) if ObjectId.is_valid(tid) else None
    if not t:
        return None
    fac, dep, _ = await _names(db, t.get("faculty_id"), t.get("department_id"))
    return {"id": tid, "full_name": t.get("full_name", ""), "academic_title": t.get("academic_title", ""), "specialization": t.get("specialization", ""), "college_name": fac, "department_name": dep}


async def resolve_organization(db, oid: str) -> Optional[dict]:
    o = await db.org_units.find_one({"_id": ObjectId(oid)}) if ObjectId.is_valid(oid) else None
    if not o:
        return None
    p = await db.org_units.find_one({"_id": ObjectId(o["parent_id"])}, {"name": 1}) if o.get("parent_id") and ObjectId.is_valid(o["parent_id"]) else None
    return {"id": oid, "name_ar": (o.get("name") or "").strip(), "name_en": o.get("name_en", ""), "code": (o.get("code") or "").strip(), "parent_name": (p or {}).get("name", "")}


async def build_data(db, ctx, corr: dict, entities: List[dict], recipients: List[dict], inputs: dict, allowed_perms: set) -> Dict[str, Any]:
    """يبني قاموس البيانات لكل مساحات الأسماء (المسموحة فقط) من المعرّفات الموثوقة فقط — لا قيم من العميل"""
    data: Dict[str, Any] = {"input": {k: v for k, v in (inputs or {}).items()}}
    for e in entities:
        et, eid = e.get("entity_type"), e.get("entity_id")
        if et == "STUDENT" and "student" not in data and P_STUDENT in allowed_perms:
            data["student"] = await resolve_student(db, eid, allowed_perms) or {}
        elif et == "EMPLOYEE" and "employee" not in data and P_EMPLOYEE in allowed_perms:
            data["employee"] = await resolve_employee(db, eid, allowed_perms) or {}
        elif et in ("FACULTY", "TEACHER") and "faculty" not in data and P_FACULTY in allowed_perms:
            data["faculty"] = await resolve_faculty(db, eid, allowed_perms) or {}
        elif et == "ORGANIZATION" and "organization" not in data:
            data["organization"] = await resolve_organization(db, eid) or {}
    if "organization" not in data:
        data["organization"] = await resolve_organization(db, corr["organization_id"]) or {}
    # قوائم متعددة: كل الكيانات المرتبطة من كل نوع (بنفس الصلاحيات)
    for ns, et_set, perm, resolver in (("students", {"STUDENT"}, P_STUDENT, resolve_student), ("employees", {"EMPLOYEE"}, P_EMPLOYEE, resolve_employee), ("faculty_members", {"FACULTY", "TEACHER"}, P_FACULTY, resolve_faculty)):
        ids = [e.get("entity_id") for e in entities if e.get("entity_type") in et_set]
        if ids and perm in allowed_perms:
            rows = [r for r in [await resolver(db, i, allowed_perms) for i in ids] if r]
            data[ns] = _list_ns(ns, rows)
    prim = next((r for r in recipients if r.get("is_primary")), recipients[0] if recipients else {})
    rname = prim.get("external_name") or prim.get("user_name") or prim.get("person_name") or ""
    rorg = prim.get("organization_name") or prim.get("external_organization") or prim.get("person_organization") or ""
    if not rname:
        rname, rorg = rorg, ""
    data["recipient"] = {"name": rname, "organization": rorg, "title": prim.get("recipient_title") or ""}
    issued = corr.get("issued_at")
    doc_date = issued if isinstance(issued, datetime) else datetime.now(timezone.utc)
    data["correspondence"] = {"subject": corr.get("subject", ""), "official_number": corr.get("official_number") or UNISSUED_NUMBER, "date": greg_str(doc_date),
                              "date_hijri": hijri_str(doc_date), "organization_name": data["organization"].get("name_ar", ""), "priority": corr.get("priority", "")}
    uni = await db.university.find_one({}) or {}
    now = datetime.now(timezone.utc)
    sg = corr.get("signature") or {}
    data["signer"] = {"name": sg.get("name", ""), "job_title": sg.get("job_title", ""), "signed_at": greg_str(sg.get("signed_at")) if sg.get("signed_at") else ""}
    data["system"] = {"university_name_ar": uni.get("name_ar") or uni.get("name") or "", "university_name_en": uni.get("name_en", ""), "today": greg_str(now), "today_hijri": hijri_str(now)}
    return data


def render_text(text: str, data: Dict[str, Any], allowed_perms: set, mode: str = "preview") -> tuple:
    """يستبدل {{ns.key}} بالقيم — mode=edit يعرض [التسمية]. يعيد (النص، المفاتيح غير المحلولة)"""
    unresolved: List[str] = []

    def rep(m):
        key = m.group(1)
        ns, _, k = key.partition(".")
        if mode == "edit":
            label = REGISTRY.get(key, (k,))[0] if key in REGISTRY else k
            return f"[{label}]"
        if key in REGISTRY and REGISTRY[key][4] and REGISTRY[key][4] not in allowed_perms:
            unresolved.append(key)
            return "[غير مصرح]"
        val = (data.get(ns) or {}).get(k)
        if val in (None, ""):
            if ns in SOFT_NS:
                return ""
            unresolved.append(key)
            return f"[{REGISTRY.get(key, ('؟',))[0] if key in REGISTRY else k}]"
        return str(val)
    return PH_RE.sub(rep, text or ""), unresolved


def minimize(data: Dict[str, Any], used_keys: List[str]) -> Dict[str, Any]:
    """تقليل الحقول: فقط المفاتيح المستخدمة فعلاً في الوثيقة (+ id للمرجعية)"""
    out: Dict[str, Any] = {}
    for key in used_keys:
        ns, _, k = key.partition(".")
        if ns in data and k in data[ns]:
            out.setdefault(ns, {})[k] = data[ns][k]
            if "id" in data[ns]:
                out[ns]["id"] = data[ns]["id"]
    return out


def checksum(obj: Any) -> str:
    return hashlib.sha256(json.dumps(obj, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()
