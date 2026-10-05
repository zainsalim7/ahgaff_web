"""بوابة التحقق للمرحلة 2 — السيناريو F (الإصدارات)، اللقطة المجمّدة (المستوى 3→4)، الحل الخادمي الموثوق، التزامن التفاؤلي،
العزل التنظيمي، الأمن (XSS/حقن/IDOR/Mass assignment/العبث باللقطة)، تحقق التقديم، سلامة الحفظ التلقائي.
pytest backend/backend/tests/test_correspondence_phase2_gate.py -q
"""
import os
import uuid
import datetime
import concurrent.futures as cf

import pytest
import requests
import pymongo
from bson import ObjectId
from dotenv import load_dotenv
from passlib.context import CryptContext

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
DB = pymongo.MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
PWD = CryptContext(schemes=["bcrypt"], deprecated="auto")
TAG = f"G{uuid.uuid4().hex[:6]}".upper()
PASSWORD = "Gate@12345"


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def make_user(name):
    uname = f"gate_{TAG}_{name}"
    r = DB.users.insert_one({"username": uname, "password": PWD.hash(PASSWORD), "full_name": f"{name} {TAG}", "role": "employee", "is_active": True, "permissions": [], "created_at": datetime.datetime.utcnow()})
    return str(r.inserted_id), login(uname, PASSWORD)


class Env:
    pass


@pytest.fixture(scope="module")
def env():
    e = Env()
    e.admin = login("admin", "admin123")
    e.pres_id = str(DB.org_units.find_one({"type": "presidency"})["_id"])
    mk = lambda code, name: requests.post(f"{API}/correspondence/organizations", headers=e.admin, json={"name_ar": name, "code": code, "organization_type": "deanship", "parent_id": e.pres_id}).json()["id"]
    e.orgA = mk(f"GA{TAG}", f"جهة أ {TAG}")
    e.orgB = mk(f"GB{TAG}", f"جهة ب {TAG}")
    for org, pre in ((e.orgA, "GA"), (e.orgB, "GB")):
        assert requests.post(f"{API}/correspondence/numbering-schemes", headers=e.admin, json={"organization_id": org, "name": pre, "prefix": pre + TAG, "separator": "-", "padding_length": 4}).status_code == 200
    roles = {r["code"]: r["id"] for r in requests.get(f"{API}/correspondence/roles", headers=e.admin).json()}
    e.users = {}
    for name, org, rcodes in [("adminA", e.orgA, ["ORGANIZATION_ADMIN"]), ("drafterA", e.orgA, ["DRAFTER"]), ("adminB", e.orgB, ["ORGANIZATION_ADMIN"]),
                              ("reviewerA", e.orgA, ["REVIEWER"]), ("approverA", e.orgA, ["APPROVER"]), ("signerA", e.orgA, ["SIGNER"]), ("managerA", e.orgA, ["CORRESPONDENCE_MANAGER"]), ("viewerA", e.orgA, ["VIEWER"])]:
        uid, hdr = make_user(name)
        e.users[name] = (uid, hdr)
        r = requests.post(f"{API}/correspondence/memberships", headers=e.admin, json={"user_id": uid, "organization_id": org, "scope_type": "ORGANIZATION", "role_ids": [roles[c] for c in rcodes], "is_primary": True})
        assert r.status_code == 200, r.text
    dts = {d["code"]: d["id"] for d in requests.get(f"{API}/correspondence/document-types", headers=e.admin).json()}
    e.dt = dts["STUDENT_CERTIFICATE"]
    e.dt_letter = dts["OFFICIAL_LETTER"]
    # طالب تجريبي مملوك للاختبار (المستوى 3) — لا نلمس طلاباً حقيقيين
    fac = DB.faculties.find_one({})
    dep = DB.departments.find_one({"faculty_id": str(fac["_id"])}) or DB.departments.find_one({})
    e.student_id = str(DB.students.insert_one({"full_name": f"طالب البوابة {TAG}", "student_id": f"GATE{TAG}", "faculty_id": str(fac["_id"]), "department_id": str(dep["_id"]), "level": 3, "section": "1", "status": "active", "is_active": True,
                                                "phone": "777000000", "email": f"gate{TAG}@x.y", "password": "secret-hash", "created_at": datetime.datetime.utcnow()}).inserted_id)
    yield e
    # تنظيف
    for org in (e.orgA, e.orgB):
        ids = [c["_id"] for c in DB.correspondences.find({"organization_id": org}, {"_id": 1})]
        sids = [str(i) for i in ids]
        DB.correspondences.delete_many({"_id": {"$in": ids}})
        for col in ("correspondence_recipients", "correspondence_entities", "correspondence_status_history", "correspondence_contents", "correspondence_data_snapshots"):
            DB[col].delete_many({"correspondence_id": {"$in": sids}})
        DB.audit_logs.delete_many({"entity_id": {"$in": sids}})
        tids = [str(t["_id"]) for t in DB.correspondence_templates.find({"organization_id": org})]
        DB.correspondence_template_versions.delete_many({"template_id": {"$in": tids}})
        DB.correspondence_templates.delete_many({"organization_id": org})
        DB.correspondence_letterheads.delete_many({"organization_id": org})
        mids = [str(m["_id"]) for m in DB.org_memberships.find({"organization_id": org})]
        DB.org_membership_roles.delete_many({"membership_id": {"$in": mids}})
        DB.org_memberships.delete_many({"organization_id": org})
        for s in DB.numbering_schemes.find({"organization_id": org}):
            DB.document_sequences.delete_many({"numbering_scheme_id": str(s["_id"])})
        DB.numbering_schemes.delete_many({"organization_id": org})
    DB.org_units.delete_many({"code": {"$in": [f"GA{TAG}", f"GB{TAG}"]}})
    DB.users.delete_many({"username": {"$regex": f"^gate_{TAG}_"}})
    DB.students.delete_one({"_id": ObjectId(e.student_id)})


H = lambda env, n: env.users[n][1]
SECS = lambda body: [
    {"id": "s1", "type": "REFERENCE", "order": 1, "title": "الرقم", "content": "<p>الرقم: {{correspondence.official_number}}</p>", "editable": "SYSTEM"},
    {"id": "s2", "type": "RECIPIENT", "order": 2, "title": "المستلم", "content": "<p>إلى {{recipient.title}} {{recipient.name}}</p>", "editable": "STRUCTURED"},
    {"id": "s4", "type": "SUBJECT", "order": 4, "title": "الموضوع", "content": "<p>{{correspondence.subject}}</p>", "editable": "SYSTEM", "required": True},
    {"id": "s5", "type": "BODY", "order": 5, "title": "المتن", "content": body, "editable": "DEFAULT_EDITABLE", "required": True},
]


def mk_template(env, hdr, org, code, body, req=("STUDENT",), inputs=(), publish=True, lh=None):
    r = requests.post(f"{API}/correspondence/templates", headers=hdr, json={"organization_id": org, "document_type_id": env.dt, "code": code, "name_ar": code, "required_entities": list(req), "sections": SECS(body), "input_fields": list(inputs), "letterhead_id": lh})
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    if publish:
        r = requests.post(f"{API}/correspondence/templates/{tid}/publish", headers=hdr)
        assert r.status_code == 200, r.text
    return tid


def mk_draft(env, hdr, org, title="سعادة", with_student=True, recipients=True):
    body = {"organization_id": org, "document_type_id": env.dt, "subject": f"خطاب {TAG}", "recipients": [{"recipient_type": "INTERNAL_ORGANIZATION", "organization_id": env.pres_id, "recipient_role": "TO", "is_primary": True, "recipient_title": title}] if recipients else [],
            "entities": [{"entity_type": "STUDENT", "entity_id": env.student_id, "relationship_type": "SUBJECT"}] if with_student else []}
    r = requests.post(f"{API}/correspondence", headers=hdr, json=body)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def apply(env, hdr, cid, tid):
    r = requests.post(f"{API}/correspondence/{cid}/apply-template", headers=hdr, json={"template_id": tid})
    assert r.status_code == 200, r.text
    return r.json()


def act(hdr, cid, a):
    return requests.post(f"{API}/correspondence/{cid}/{a}", headers=hdr, json={"reason": "x"})


def body_html(prev):
    return next(s["html"] for s in prev["sections"] if s["type"] == "BODY")


# ─────────── إعداد مشترك ───────────
def test_setup_letterhead_and_template(env):
    r = requests.post(f"{API}/correspondence/letterheads", headers=H(env, "adminA"), json={"organization_id": env.orgA, "name_ar": "ترويسة أ", "code": f"LHA{TAG}", "is_default": True})
    assert r.status_code == 200, r.text
    env.lhA = r.json()["id"]
    r = requests.post(f"{API}/correspondence/letterheads", headers=H(env, "adminB"), json={"organization_id": env.orgB, "name_ar": "ترويسة ب", "code": f"LHB{TAG}", "is_default": True})
    env.lhB = r.json()["id"]
    env.tplA = mk_template(env, H(env, "adminA"), env.orgA, f"TA{TAG}", "<p>الطالب {{student.full_name}} في {{student.level_name}}.</p>")
    env.tplB = mk_template(env, H(env, "adminB"), env.orgB, f"TB{TAG}", "<p>{{student.full_name}}</p>", publish=False)


# ─────────── السيناريو F: الإصدارات ───────────
def test_scenario_f_template_versioning(env):
    a = H(env, "adminA")
    cid = mk_draft(env, H(env, "drafterA"), env.orgA)
    b1 = apply(env, H(env, "drafterA"), cid, env.tplA)
    v1_id = b1["content"]["template_version_id"]
    assert b1["content"]["template_version_number"] == 1
    v1 = {"sections": SECS("<p>v1</p>"), "input_fields": [], "required_entities": ["STUDENT"]}
    # 1) المنشور غير قابل للتعديل
    assert requests.put(f"{API}/correspondence/templates/{env.tplA}/draft", headers=a, json=v1).status_code == 409
    # 2) التعديل = إصدار جديد v2 (مسودة)
    r = requests.post(f"{API}/correspondence/templates/{env.tplA}/versions", headers=a, json={"sections": SECS("<p>نص v2 {{student.full_name}}</p>"), "input_fields": [], "required_entities": ["STUDENT"], "change_note": "v2"})
    assert r.status_code == 200 and r.json()["current_version"] == 2 and r.json()["published_version"] == 1
    # 3) مراسلة جديدة الآن تستخدم آخر منشور = v1 (لا المسودة v2)
    cid2 = mk_draft(env, H(env, "drafterA"), env.orgA)
    assert apply(env, H(env, "drafterA"), cid2, env.tplA)["content"]["template_version_number"] == 1
    # 4) نشر v2
    r = requests.post(f"{API}/correspondence/templates/{env.tplA}/publish", headers=a)
    assert r.status_code == 200 and r.json()["published_version"] == 2
    v1_doc = DB.correspondence_template_versions.find_one({"_id": ObjectId(v1_id)})
    assert v1_doc["is_published"] is True and "level_name" in v1_doc["sections"][3]["content"], "v1 لم يتغير بعد نشر v2"
    # 5) المراسلة القديمة باقية على v1
    c = requests.get(f"{API}/correspondence/{cid}/content", headers=H(env, "drafterA")).json()
    assert c["content"]["template_version_id"] == v1_id and c["template_version"]["version_number"] == 1
    assert "level_name" in body_html(requests.post(f"{API}/correspondence/{cid}/preview", headers=H(env, "drafterA"), params={"mode": "edit"}).json()) or "المستوى" in body_html(requests.post(f"{API}/correspondence/{cid}/preview", headers=H(env, "drafterA")).json())
    # 6) مراسلة جديدة تستخدم v2
    cid3 = mk_draft(env, H(env, "drafterA"), env.orgA)
    assert apply(env, H(env, "drafterA"), cid3, env.tplA)["content"]["template_version_number"] == 2
    env.cid_v1 = cid


# ─────────── اللقطة المجمّدة: المستوى 3 → 4 ───────────
def test_snapshot_level3_then_level4(env):
    d = H(env, "drafterA")
    cid = env.cid_v1
    p = requests.post(f"{API}/correspondence/{cid}/preview", headers=d).json()
    assert p["source"] == "LIVE" and "المستوى 3" in body_html(p) and f"طالب البوابة {TAG}" in body_html(p)
    for a, u in (("submit", "drafterA"), ("review", "reviewerA"), ("approve", "approverA"), ("sign", "signerA")):
        r = act(H(env, u), cid, a)
        assert r.status_code == 200, f"{a}: {r.text}"
    assert DB.correspondence_data_snapshots.count_documents({"correspondence_id": cid}) == 0
    r = act(H(env, "managerA"), cid, "issue")
    assert r.status_code == 200, r.text
    num = r.json()["official_number"]
    snap = DB.correspondence_data_snapshots.find_one({"correspondence_id": cid})
    assert snap["snapshot_stage"] == "ISSUED"
    st = snap["resolved_data"]["student"]
    assert st["level_name"] == "المستوى 3" and st["full_name"] == f"طالب البوابة {TAG}"
    # تقليل الحقول: لا هاتف/بريد/كلية … ولا كلمة مرور
    assert set(st) == {"id", "full_name", "level_name"}, st
    assert "password" not in str(snap["resolved_data"])
    # تغيير السجل الرئيسي → المستوى 4
    DB.students.update_one({"_id": ObjectId(env.student_id)}, {"$set": {"level": 4, "full_name": f"اسم معدّل {TAG}"}})
    p = requests.post(f"{API}/correspondence/{cid}/preview", headers=d).json()
    assert p["source"] == "SNAPSHOT" and p["frozen"] is True
    assert "المستوى 3" in body_html(p) and f"طالب البوابة {TAG}" in body_html(p) and "المستوى 4" not in body_html(p)
    assert num in next(s["html"] for s in p["sections"] if s["type"] == "REFERENCE")
    v = requests.get(f"{API}/correspondence/{cid}/snapshot/verify", headers=d).json()
    assert v["valid"] is True and v["checksum"] == snap["checksum"]
    env.issued = cid


def test_snapshot_tampering_detected(env):
    d = H(env, "drafterA")
    cid = env.issued
    snap = DB.correspondence_data_snapshots.find_one({"correspondence_id": cid})
    DB.correspondence_data_snapshots.update_one({"_id": snap["_id"]}, {"$set": {"resolved_data.student.level_name": "المستوى 9"}})
    assert requests.get(f"{API}/correspondence/{cid}/snapshot/verify", headers=d).json()["valid"] is False
    r = requests.post(f"{API}/correspondence/{cid}/preview", headers=d)
    assert r.status_code == 409, "المعاينة ترفض لقطة معدّلة"
    assert DB.audit_logs.find_one({"entity_id": cid, "action": "SNAPSHOT_INTEGRITY_FAILED"})
    DB.correspondence_data_snapshots.update_one({"_id": snap["_id"]}, {"$set": {"resolved_data": snap["resolved_data"]}})
    assert requests.get(f"{API}/correspondence/{cid}/snapshot/verify", headers=d).json()["valid"] is True
    # لا واجهة API لتعديل/حذف اللقطة
    for m in ("patch", "put", "delete", "post"):
        assert getattr(requests, m)(f"{API}/correspondence/{cid}/snapshot", headers=d, json={}).status_code in (404, 405)
    # لا تعديل محتوى بعد الإصدار
    cv = requests.get(f"{API}/correspondence/{cid}/content", headers=d).json()["content"]["content_version"]
    assert requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": "<p>x</p>"}, "content_version": cv}).status_code == 409


# ─────────── الحل الخادمي الموثوق ───────────
def test_client_resolved_values_ignored(env):
    d = H(env, "drafterA")
    cid = mk_draft(env, d, env.orgA)
    cv = apply(env, d, cid, env.tplA)["content"]["content_version"]
    # قيم "محلولة" مرسلة من العميل في المحتوى والمدخلات — تُتجاهل أو تُرفض
    r = requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": "<p>الطالب FAKE NAME في المستوى 9</p>"}, "input_values": {"student.full_name": "FAKE"}, "content_version": cv})
    assert r.status_code == 400, "مفتاح مدخل غير معرّف مرفوض"
    r = requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": "<p>{{student.full_name}} — {{student.level_name}}</p>"}, "content_version": cv, "resolved_data": {"student": {"full_name": "FAKE NAME"}}})
    assert r.status_code == 200
    p = requests.post(f"{API}/correspondence/{cid}/preview", headers=d).json()
    assert "FAKE" not in body_html(p) and f"اسم معدّل {TAG}" in body_html(p) and "المستوى 4" in body_html(p), body_html(p)
    # Mass assignment على المراسلة
    r = requests.patch(f"{API}/correspondence/{cid}", headers=d, json={"status": "ISSUED", "official_number": "HACK", "organization_id": env.orgB, "version": 99})
    c = DB.correspondences.find_one({"_id": ObjectId(cid)})
    assert c["status"] == "DRAFT" and c["official_number"] is None and c["organization_id"] == env.orgA
    env.cid_live = cid


# ─────────── التزامن التفاؤلي ───────────
def test_optimistic_concurrency(env):
    d = H(env, "drafterA")
    cid = mk_draft(env, d, env.orgA)
    cv = apply(env, d, cid, env.tplA)["content"]["content_version"]
    r = requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": "<p>A</p>"}, "content_version": cv})
    assert r.status_code == 200 and r.json()["content_version"] == cv + 1
    r = requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": "<p>B</p>"}, "content_version": cv})
    assert r.status_code == 409
    assert DB.correspondence_contents.find_one({"correspondence_id": cid})["section_values"]["s5"] == "<p>A</p>"
    # سباق حقيقي: 6 طلبات بنفس الإصدار → واحد فقط ينجح
    cv = cv + 1
    with cf.ThreadPoolExecutor(6) as ex:
        res = list(ex.map(lambda i: requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": f"<p>R{i}</p>"}, "content_version": cv}).status_code, range(6)))
    assert res.count(200) == 1 and res.count(409) == 5, res


# ─────────── العزل التنظيمي ───────────
def test_org_isolation(env):
    a = H(env, "adminA")
    assert requests.get(f"{API}/correspondence/templates/{env.tplB}", headers=a).status_code == 403
    assert requests.put(f"{API}/correspondence/templates/{env.tplB}/draft", headers=a, json={"sections": SECS("<p>x</p>"), "required_entities": ["STUDENT"]}).status_code == 403
    assert requests.post(f"{API}/correspondence/templates/{env.tplB}/publish", headers=a).status_code == 403
    assert requests.post(f"{API}/correspondence/templates/{env.tplB}/versions", headers=a, json={"sections": SECS("<p>x</p>")}).status_code == 403
    assert requests.post(f"{API}/correspondence/templates/{env.tplB}/deactivate", headers=a).status_code == 403
    assert requests.patch(f"{API}/correspondence/letterheads/{env.lhB}", headers=a, json={"name_ar": "hack"}).status_code == 403
    assert requests.post(f"{API}/correspondence/letterheads/{env.lhB}/set-default", headers=a).status_code == 403
    assert requests.post(f"{API}/correspondence/letterheads", headers=a, json={"organization_id": env.orgB, "name_ar": "x", "code": f"HX{TAG}"}).status_code == 403
    assert requests.post(f"{API}/correspondence/templates", headers=a, json={"organization_id": env.orgB, "document_type_id": env.dt, "code": f"HT{TAG}", "name_ar": "x"}).status_code == 403
    # قائمة القوالب لا تُسرّب قالب ب الخاص
    codes = {t["code"] for t in requests.get(f"{API}/correspondence/templates", headers=a, params={"page_size": 200}).json()["items"]}
    assert f"TB{TAG}" not in codes, "تسريب قالب ب"
    assert f"TA{TAG}" in codes, f"قالب أ غائب: {sorted(codes)}"
    lhs = {l["code"] for l in requests.get(f"{API}/correspondence/letterheads", headers=a).json()}
    assert f"LHB{TAG}" not in lhs and f"LHA{TAG}" in lhs
    # استخدام ترويسة ب الخاصة داخل مراسلة أ
    d = H(env, "drafterA")
    cid = mk_draft(env, d, env.orgA)
    cv = apply(env, d, cid, env.tplA)["content"]["content_version"]
    assert requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"letterhead_id": env.lhB, "content_version": cv}).status_code == 400
    # قالب ب (غير منشور/خاص) لا يُطبّق على مراسلة أ
    assert requests.post(f"{API}/correspondence/{cid}/apply-template", headers=d, json={"template_id": env.tplB}).status_code == 400
    # IDOR: مستخدم ب يقرأ محتوى/معاينة مراسلة أ
    b = H(env, "adminB")
    assert requests.get(f"{API}/correspondence/{cid}/content", headers=b).status_code == 403
    assert requests.post(f"{API}/correspondence/{cid}/preview", headers=b).status_code == 403
    assert requests.patch(f"{API}/correspondence/{cid}/content", headers=b, json={"section_values": {"s5": "<p>x</p>"}, "content_version": cv}).status_code == 403
    assert requests.get(f"{API}/correspondence/{cid}/snapshot/verify", headers=b).status_code == 403
    # الكاتب (DRAFTER) لا يملك نشر/إنشاء قوالب ولا تعديل ترويسات في جهته
    assert requests.post(f"{API}/correspondence/templates/{env.tplA}/publish", headers=d).status_code in (403, 409)
    assert requests.post(f"{API}/correspondence/templates", headers=d, json={"organization_id": env.orgA, "document_type_id": env.dt, "code": f"DX{TAG}", "name_ar": "x"}).status_code == 403
    assert requests.patch(f"{API}/correspondence/letterheads/{env.lhA}", headers=d, json={"name_ar": "hack"}).status_code == 403
    # المشاهد (VIEWER) لا يبحث في الكيانات
    assert requests.get(f"{API}/correspondence/entities/students", headers=H(env, "viewerA"), params={"q": "a"}).status_code == 403
    assert requests.get(f"{API}/correspondence/entities/employees", headers=H(env, "viewerA")).status_code == 403
    assert requests.get(f"{API}/correspondence/entities/students", headers=H(env, "drafterA"), params={"q": TAG}).status_code == 200


# ─────────── XSS / الحقن / العناصر النائبة ───────────
def test_xss_and_injection(env):
    a, d = H(env, "adminA"), H(env, "drafterA")
    cid = mk_draft(env, d, env.orgA)
    cv = apply(env, d, cid, env.tplA)["content"]["content_version"]
    for payload in ("<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "<a href='javascript:alert(1)'>x</a>", "<iframe src='//evil'></iframe>", "<p onclick=\"steal()\">x</p>"):
        r = requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": payload}, "content_version": cv})
        assert r.status_code == 400, payload
    # محتوى بوسوم غير مسموحة يُعقَّم (وسوم غريبة تُزال) ويبقى آمناً؛ وأي javascript: داخل style يُرفض كلياً
    assert requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": "<p style=\"background:url(javascript:x)\">x</p>"}, "content_version": cv}).status_code == 400
    r = requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": "<p style=\"color:red\">نص <svg><animate attributeName=x/></svg><form action='/x'><input name=a></form> <b>سليم</b></p>"}, "content_version": cv})
    assert r.status_code == 200
    saved = r.json()["section_values"]["s5"]
    assert "svg" not in saved and "<form" not in saved and "<input" not in saved and "color:red" not in saved and "<b>سليم</b>" in saved, saved
    cv = r.json()["content_version"]
    # حقن عناصر نائبة غير مسجلة
    for k in ("student.password", "employee.private_notes", "unknown.field", "student.__class__"):
        r = requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": f"<p>{{{{{k}}}}}</p>"}, "content_version": cv})
        assert r.status_code == 400, k
    # حقن قوالب (Jinja/تعبيرات) تُعامل كنص عادي
    r = requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": "<p>{{ 7*7 }} {% if 1 %}x{% endif %} ${7*7} {{student.full_name|upper}}</p>"}, "content_version": cv})
    assert r.status_code == 200
    p = requests.post(f"{API}/correspondence/{cid}/preview", headers=d).json()
    assert "49" not in body_html(p) and "{{ 7*7 }}" in body_html(p)
    # قالب بعنصر غير مسجل أو سكربت لا يُنشر
    tid = mk_template(env, a, env.orgA, f"TX{TAG}", "<p>{{student.password}}</p>", publish=False)
    r = requests.post(f"{API}/correspondence/templates/{tid}/publish", headers=a)
    assert r.status_code == 422 and any("student.password" in x for x in r.json()["detail"]["errors"])
    tid = mk_template(env, a, env.orgA, f"TS{TAG}", "<p><script>x()</script>{{student.full_name}}</p>", publish=False)
    r = requests.post(f"{API}/correspondence/templates/{tid}/publish", headers=a)
    assert r.status_code == 422 and any("غير آمن" in x for x in r.json()["detail"]["errors"])
    # عنصر محجوب بالصلاحية (الهاتف يتطلب placeholder.contact.read) — الكاتب لا يملكها → [غير مصرح] ويُحجب التقديم؛ المدير التنظيمي يملكها
    tid = mk_template(env, a, env.orgA, f"TP{TAG}", "<p>{{student.full_name}} {{student.phone}}</p>")
    cid2 = mk_draft(env, d, env.orgA)
    apply(env, d, cid2, tid)
    p = requests.post(f"{API}/correspondence/{cid2}/preview", headers=d).json()
    assert "[غير مصرح]" in body_html(p) and "777000000" not in body_html(p) and "student.phone" in p["unresolved"]
    assert "777000000" in body_html(requests.post(f"{API}/correspondence/{cid2}/preview", headers=a).json())
    # سجل العناصر النائبة للكاتب لا يحوي الهاتف/المعدل، وللمدير يحويها
    assert "student.phone" not in {x["key"] for x in requests.get(f"{API}/correspondence/placeholders", headers=d).json()["items"]}
    assert {"student.phone", "student.gpa"} <= {x["key"] for x in requests.get(f"{API}/correspondence/placeholders", headers=a).json()["items"]}
    # ربط كيان غير موجود / بلا صلاحية
    assert requests.post(f"{API}/correspondence/{cid}/entities", headers=d, json={"entity_type": "STUDENT", "entity_id": str(ObjectId()), "relationship_type": "SUBJECT"}).status_code == 404
    assert requests.post(f"{API}/correspondence/{cid}/entities", headers=d, json={"entity_type": "STUDENT", "entity_id": "not-an-id", "relationship_type": "SUBJECT"}).status_code == 404


# ─────────── تحقق التقديم ───────────
def test_submission_validation_matrix(env):
    a, d = H(env, "adminA"), H(env, "drafterA")
    inputs = [{"key": "dest", "label_ar": "الجهة", "type": "TEXT", "required": True}]
    tid = mk_template(env, a, env.orgA, f"TV{TAG}", "<p>{{student.full_name}} إلى {{input.dest}}</p>", inputs=inputs)

    def errors_of(cid):
        r = requests.post(f"{API}/correspondence/{cid}/submit", headers=d, json={"reason": ""})
        assert r.status_code in (400, 422), r.text
        det = r.json()["detail"]
        return det["errors"] if isinstance(det, dict) else [det]

    # بلا مستلم
    cid = mk_draft(env, d, env.orgA, recipients=False)
    apply(env, d, cid, tid)
    assert any("مستلم" in x for x in errors_of(cid))
    # بلا كيان + بلا مدخل إلزامي
    cid = mk_draft(env, d, env.orgA, with_student=False)
    cv = apply(env, d, cid, tid)["content"]["content_version"]
    errs = errors_of(cid)
    assert any("STUDENT" in x for x in errs) and any("الجهة" in x for x in errs)
    # الموضوع فارغ
    DB.correspondences.update_one({"_id": ObjectId(cid)}, {"$set": {"subject": "  "}})
    assert any("الموضوع" in x for x in errors_of(cid))
    DB.correspondences.update_one({"_id": ObjectId(cid)}, {"$set": {"subject": "عنوان"}})
    # القسم الإلزامي فارغ (المتن <p></p>)
    r = requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": "<p></p>"}, "input_values": {"dest": "X"}, "content_version": cv})
    cv = r.json()["content_version"]
    requests.post(f"{API}/correspondence/{cid}/entities", headers=d, json={"entity_type": "STUDENT", "entity_id": env.student_id, "relationship_type": "SUBJECT"})
    assert any("قسم إلزامي فارغ: المتن" in x for x in errors_of(cid))
    # عنصر غير محلول (معدل أكاديمي بلا صلاحية)
    r = requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": "<p>{{student.full_name}} {{student.gpa}}</p>"}, "content_version": cv})
    cv = r.json()["content_version"]
    assert any("student.gpa" in x for x in errors_of(cid))
    # إصدار قالب غير صالح (محذوف) / ترويسة غير صالحة
    requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": "<p>{{student.full_name}}</p>"}, "content_version": cv})
    content = DB.correspondence_contents.find_one({"correspondence_id": cid})
    DB.correspondence_contents.update_one({"_id": content["_id"]}, {"$set": {"template_version_id": str(ObjectId())}})
    assert any("قالب" in x for x in errors_of(cid))
    DB.correspondence_contents.update_one({"_id": content["_id"]}, {"$set": {"template_version_id": content["template_version_id"]}})
    DB.correspondence_letterheads.update_many({"organization_id": {"$in": [env.orgA, env.pres_id]}}, {"$set": {"is_active": False}})
    root_lhs = list(DB.correspondence_letterheads.find({"is_active": True, "deleted_at": None}, {"_id": 1}))
    DB.correspondence_letterheads.update_many({"_id": {"$in": [x["_id"] for x in root_lhs]}}, {"$set": {"is_active": False}})
    try:
        assert any("ترويسة" in x for x in errors_of(cid))
    finally:
        DB.correspondence_letterheads.update_many({"_id": {"$in": [x["_id"] for x in root_lhs]}}, {"$set": {"is_active": True}})
        DB.correspondence_letterheads.update_many({"organization_id": {"$in": [env.orgA, env.pres_id]}}, {"$set": {"is_active": True}})
    # حقول المستلم الاختيارية الفارغة (بلا صفة) لا تحجب — ينجح التقديم
    cid = mk_draft(env, d, env.orgA, title="")
    cv = apply(env, d, cid, tid)["content"]["content_version"]
    requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"input_values": {"dest": "X"}, "content_version": cv})
    r = requests.post(f"{API}/correspondence/{cid}/submit", headers=d, json={"reason": ""})
    assert r.status_code == 200, r.text
    assert "{{" not in next(s["html"] for s in requests.post(f"{API}/correspondence/{cid}/preview", headers=d).json()["sections"] if s["type"] == "RECIPIENT")


# ─────────── سلامة الحفظ التلقائي ───────────
def test_autosave_safety(env):
    d = H(env, "drafterA")
    cid = mk_draft(env, d, env.orgA)
    cv = apply(env, d, cid, env.tplA)["content"]["content_version"]
    for i in range(5):
        r = requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": f"<p>مسودة {i}</p>"}, "content_version": cv + i, "status": "ISSUED", "official_number": "X"})
        assert r.status_code == 200
    c = DB.correspondences.find_one({"_id": ObjectId(cid)})
    assert c["status"] == "DRAFT" and c["official_number"] is None and c["sequence_number"] is None
    assert DB.correspondence_data_snapshots.count_documents({"correspondence_id": cid}) == 0
    assert DB.correspondence_status_history.count_documents({"correspondence_id": cid}) == 1
    # لا يتجاوز الصلاحية ولا يكتب فوق إصدار أحدث
    assert requests.patch(f"{API}/correspondence/{cid}/content", headers=H(env, "adminB"), json={"section_values": {"s5": "<p>x</p>"}, "content_version": cv + 5}).status_code == 403
    assert requests.patch(f"{API}/correspondence/{cid}/content", headers=H(env, "viewerA"), json={"section_values": {"s5": "<p>x</p>"}, "content_version": cv + 5}).status_code == 403
    assert requests.patch(f"{API}/correspondence/{cid}/content", headers=d, json={"section_values": {"s5": "<p>قديم</p>"}, "content_version": cv + 2}).status_code == 409
    assert DB.correspondence_contents.find_one({"correspondence_id": cid})["section_values"]["s5"] == "<p>مسودة 4</p>"


def test_mark_test_correspondence_metadata():
    """PRES-2026-000001 تبقى؛ تُوسم كبيانات اختبار دون المساس بالرقم"""
    c = DB.correspondences.find_one({"official_number": "PRES-2026-000001"})
    if not c:
        pytest.skip("غير موجودة في هذه البيئة")
    assert c["status"] == "ISSUED" and c.get("metadata", {}).get("test_generated") is True
    assert DB.audit_logs.find_one({"entity_id": str(c["_id"]), "action": "TEST_DATA_MARKED"})
