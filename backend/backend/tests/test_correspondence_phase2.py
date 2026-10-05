"""اختبارات المرحلة 2 — الترويسات، القوالب، العناصر النائبة، المحتوى، اللقطة المجمّدة (ضد الخادم الحي)
pytest backend/backend/tests/test_correspondence_phase2.py -q
"""
import os
import uuid

import pytest
import requests
import pymongo
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
DB = pymongo.MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
TAG = f"P2{uuid.uuid4().hex[:6]}"


def login(username, password):
    r = requests.post(f"{API}/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


class Env:
    pass


@pytest.fixture(scope="module")
def env():
    e = Env()
    e.admin = login("admin", "admin123")
    pres = DB.org_units.find_one({"type": "presidency"})
    e.pres_id = str(pres["_id"])
    e.org = requests.post(f"{API}/correspondence/organizations", headers=e.admin, json={"name_ar": f"عمادة القبول {TAG}", "code": f"ADM{TAG}", "organization_type": "deanship", "parent_id": e.pres_id}).json()["id"]
    r = requests.post(f"{API}/correspondence/numbering-schemes", headers=e.admin, json={"organization_id": e.org, "name": "ADM", "prefix": "ADM", "separator": "-", "padding_length": 5})
    assert r.status_code == 200, r.text
    e.scheme = r.json()
    dts = {d["code"]: d["id"] for d in requests.get(f"{API}/correspondence/document-types", headers=e.admin).json()}
    e.dt_cert = dts["STUDENT_CERTIFICATE"]
    e.dt_letter = dts["OFFICIAL_LETTER"]
    e.student = DB.students.find_one({"is_active": {"$ne": False}, "full_name": {"$exists": True}})
    assert e.student, "لا يوجد طالب في قاعدة البيانات"
    yield e
    ids = [c["_id"] for c in DB.correspondences.find({"organization_id": e.org}, {"_id": 1})]
    sids = [str(i) for i in ids]
    DB.correspondences.delete_many({"_id": {"$in": ids}})
    for col in ("correspondence_recipients", "correspondence_entities", "correspondence_status_history", "correspondence_contents", "correspondence_data_snapshots"):
        DB[col].delete_many({"correspondence_id": {"$in": sids}})
    tids = [str(t["_id"]) for t in DB.correspondence_templates.find({"organization_id": e.org})]
    DB.correspondence_template_versions.delete_many({"template_id": {"$in": tids}})
    DB.correspondence_templates.delete_many({"organization_id": e.org})
    DB.correspondence_letterheads.delete_many({"organization_id": e.org})
    DB.document_sequences.delete_many({"numbering_scheme_id": e.scheme["id"]})
    DB.numbering_schemes.delete_many({"organization_id": e.org})
    DB.org_units.delete_many({"code": f"ADM{TAG}"})
    DB.audit_logs.delete_many({"entity_id": {"$in": sids + tids}})


def test_seed_letterhead_and_templates(env):
    r = requests.get(f"{API}/correspondence/letterheads", headers=env.admin)
    assert r.status_code == 200 and any(x["code"] == "UNIVERSITY_GENERAL" for x in r.json())
    r = requests.get(f"{API}/correspondence/letterheads/resolve", headers=env.admin, params={"organization_id": env.org})
    assert r.status_code == 200 and r.json()["code"] == "UNIVERSITY_GENERAL", "الوراثة من الجذر"
    r = requests.get(f"{API}/correspondence/templates", headers=env.admin, params={"for_use": True, "organization_id": env.org})
    codes = {t["code"] for t in r.json()["items"]}
    assert {"STUDENT_ENROLLMENT_CERTIFICATE", "GENERAL_CORRESPONDENCE", "INTERNAL_MEMO"} <= codes
    r = requests.get(f"{API}/correspondence/placeholders", headers=env.admin)
    keys = {p["key"] for p in r.json()["items"]}
    assert {"student.full_name", "recipient.name", "correspondence.official_number", "system.today"} <= keys


def test_letterhead_crud(env):
    body = {"organization_id": env.org, "name_ar": f"ترويسة العمادة {TAG}", "code": f"LH{TAG}", "header_config": {"show_logo": True, "header_text": "عمادة القبول"}, "footer_config": {"footer_text": "هاتف 123"}, "is_default": True}
    r = requests.post(f"{API}/correspondence/letterheads", headers=env.admin, json=body)
    assert r.status_code == 200, r.text
    env.lh = r.json()
    assert env.lh["version"] == 1 and env.lh["is_default"]
    assert requests.post(f"{API}/correspondence/letterheads", headers=env.admin, json=body).status_code == 409
    r = requests.patch(f"{API}/correspondence/letterheads/{env.lh['id']}", headers=env.admin, json={"footer_config": {"footer_text": "هاتف 999"}})
    assert r.status_code == 200 and r.json()["version"] == 2 and r.json()["footer_config"]["footer_text"] == "هاتف 999"
    r = requests.get(f"{API}/correspondence/letterheads/resolve", headers=env.admin, params={"organization_id": env.org})
    assert r.json()["id"] == env.lh["id"], "ترويسة المنظمة تسبق الموروثة"
    assert requests.get(f"{API}/correspondence/letterheads").status_code in (401, 403)


def test_template_versioning_validation_publish(env):
    secs = [
        {"id": "s1", "type": "SUBJECT", "order": 1, "title": "الموضوع", "content": "<p>{{correspondence.subject}}</p>", "editable": "SYSTEM", "required": True},
        {"id": "s2", "type": "BODY", "order": 2, "title": "المتن", "content": "<p>الطالب {{student.full_name}} ({{student.student_id}}) — {{input.purpose}}</p>", "editable": "DEFAULT_EDITABLE", "required": True},
        {"id": "s3", "type": "CLOSING", "order": 3, "title": "الخاتمة", "content": "<p>مع التحية</p>", "editable": "LOCKED"},
    ]
    inputs = [{"key": "purpose", "label_ar": "الغرض", "type": "TEXT", "required": True, "max_length": 100}]
    body = {"organization_id": env.org, "document_type_id": env.dt_cert, "code": f"TPL{TAG}", "name_ar": f"قالب اختبار {TAG}", "freeze_stage": "ISSUED", "required_entities": [], "sections": secs, "input_fields": inputs}
    r = requests.post(f"{API}/correspondence/templates", headers=env.admin, json=body)
    assert r.status_code == 200, r.text
    t = r.json()
    env.tpl = t["id"]
    assert t["status"] == "DRAFT" and t["current_version"] == 1 and t["is_global"] is False
    # النشر يفشل: student.* بلا إعلان الكيان STUDENT
    r = requests.post(f"{API}/correspondence/templates/{env.tpl}/publish", headers=env.admin)
    assert r.status_code == 422 and any("STUDENT" in x for x in r.json()["detail"]["errors"]), r.text
    # تعديل المسودة: إعلان الكيان + محتوى غير آمن يُرفض
    bad = {"sections": secs + [{"id": "s4", "type": "CUSTOM", "order": 4, "content": "<script>alert(1)</script>", "editable": "EDITABLE"}], "input_fields": inputs, "required_entities": ["STUDENT"]}
    requests.put(f"{API}/correspondence/templates/{env.tpl}/draft", headers=env.admin, json=bad)
    r = requests.post(f"{API}/correspondence/templates/{env.tpl}/validate", headers=env.admin)
    assert not r.json()["valid"] and any("غير آمن" in x for x in r.json()["errors"])
    good = {"sections": secs, "input_fields": inputs, "required_entities": ["STUDENT"], "letterhead_id": env.lh["id"], "change_note": "v1"}
    assert requests.put(f"{API}/correspondence/templates/{env.tpl}/draft", headers=env.admin, json=good).status_code == 200
    r = requests.post(f"{API}/correspondence/templates/{env.tpl}/publish", headers=env.admin)
    assert r.status_code == 200 and r.json()["status"] == "PUBLISHED" and r.json()["published_version"] == 1
    # الإصدار المنشور غير قابل للتعديل → إصدار جديد
    assert requests.put(f"{API}/correspondence/templates/{env.tpl}/draft", headers=env.admin, json=good).status_code == 409
    r = requests.post(f"{API}/correspondence/templates/{env.tpl}/versions", headers=env.admin, json={**good, "change_note": "v2"})
    assert r.status_code == 200 and r.json()["current_version"] == 2 and r.json()["published_version"] == 1
    # استنساخ
    r = requests.post(f"{API}/correspondence/templates/{env.tpl}/clone", headers=env.admin)
    assert r.status_code == 200 and r.json()["status"] == "DRAFT" and r.json()["cloned_from"] == env.tpl
    # عنصر نائب غير مسجل
    r = requests.post(f"{API}/correspondence/templates", headers=env.admin, json={**body, "code": f"BAD{TAG}", "sections": [{"id": "x", "type": "BODY", "content": "{{hacker.secret}}", "editable": "EDITABLE"}, {"id": "y", "type": "SUBJECT", "content": "", "editable": "SYSTEM"}]})
    tid = r.json()["id"]
    r = requests.post(f"{API}/correspondence/templates/{tid}/publish", headers=env.admin)
    assert r.status_code == 422 and any("hacker.secret" in x for x in r.json()["detail"]["errors"])


def test_entity_search_projection(env):
    r = requests.get(f"{API}/correspondence/entities/students", headers=env.admin, params={"q": env.student["full_name"][:4], "page_size": 5})
    assert r.status_code == 200 and r.json()["total"] >= 1
    item = r.json()["items"][0]
    assert set(item) <= {"id", "label", "code", "meta", "status"}, "إسقاط فقط — لا سجلات كاملة"
    assert requests.get(f"{API}/correspondence/entities/unknown", headers=env.admin).status_code == 404


def _draft(env, with_recipient=True):
    body = {"organization_id": env.org, "document_type_id": env.dt_cert, "subject": f"شهادة قيد {TAG}", "priority": "NORMAL", "security_classification": "INTERNAL",
            "recipients": [{"recipient_type": "INTERNAL_ORGANIZATION", "organization_id": env.pres_id, "recipient_role": "TO", "is_primary": True, "recipient_title": "سعادة"}] if with_recipient else []}
    r = requests.post(f"{API}/correspondence", headers=env.admin, json=body)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_full_phase2_lifecycle_with_snapshot(env):
    cid = _draft(env)
    # الربط بقالب منشور (عام: شهادة قيد)
    tpl = next(t for t in requests.get(f"{API}/correspondence/templates", headers=env.admin, params={"for_use": True, "organization_id": env.org}).json()["items"] if t["code"] == "STUDENT_ENROLLMENT_CERTIFICATE")
    r = requests.post(f"{API}/correspondence/{cid}/apply-template", headers=env.admin, json={"template_id": tpl["id"]})
    assert r.status_code == 200, r.text
    bundle = r.json()
    assert bundle["content"]["template_version_number"] == 1 and bundle["letterhead"]["id"] == env.lh["id"] and bundle["frozen"] is False
    cv = bundle["content"]["content_version"]
    # التقديم قبل اكتمال المتطلبات → 422 بأخطاء حقلية
    r = requests.post(f"{API}/correspondence/{cid}/submit", headers=env.admin, json={"reason": ""})
    assert r.status_code == 422, r.text
    errs = r.json()["detail"]["errors"]
    assert any("STUDENT" in x for x in errs) and any("destination" in x or "الجهة" in x for x in errs)
    # ربط الطالب + المدخلات
    r = requests.post(f"{API}/correspondence/{cid}/entities", headers=env.admin, json={"entity_type": "STUDENT", "entity_id": str(env.student["_id"]), "relationship_type": "SUBJECT"})
    assert r.status_code == 200, r.text
    r = requests.patch(f"{API}/correspondence/{cid}/content", headers=env.admin, json={"input_values": {"destination": "السفارة"}, "content_version": cv})
    assert r.status_code == 200, r.text
    cv = r.json()["content_version"]
    # تعارض الإصدار
    assert requests.patch(f"{API}/correspondence/{cid}/content", headers=env.admin, json={"input_values": {"destination": "x"}, "content_version": cv - 1}).status_code == 409
    # تعديل قسم مقفل مرفوض، ومحتوى غير آمن مرفوض، وعنصر غير مسجل مرفوض
    assert requests.patch(f"{API}/correspondence/{cid}/content", headers=env.admin, json={"section_values": {"s4": "<p>x</p>"}, "content_version": cv}).status_code == 403
    assert requests.patch(f"{API}/correspondence/{cid}/content", headers=env.admin, json={"section_values": {"s5": "<img src=x onerror=alert(1)>"}, "content_version": cv}).status_code == 400
    assert requests.patch(f"{API}/correspondence/{cid}/content", headers=env.admin, json={"section_values": {"s5": "<p>{{student.password}}</p>"}, "content_version": cv}).status_code == 400
    # تعديل المتن (DEFAULT_EDITABLE) مع تعقيم
    html = "<p>نفيد بأن الطالب <strong>{{student.full_name}}</strong> مقيد لدينا.<span onclick=\"x()\">!</span></p>"
    r = requests.patch(f"{API}/correspondence/{cid}/content", headers=env.admin, json={"section_values": {"s5": html}, "content_version": cv})
    assert r.status_code == 400  # onclick → غير آمن
    r = requests.patch(f"{API}/correspondence/{cid}/content", headers=env.admin, json={"section_values": {"s5": "<p>نفيد بأن الطالب <strong>{{student.full_name}}</strong> مقيد لدينا لتقديمها إلى {{input.destination}}.</p>"}, "content_version": cv})
    assert r.status_code == 200, r.text
    cv = r.json()["content_version"]
    # المعاينة الحيّة
    r = requests.post(f"{API}/correspondence/{cid}/preview", headers=env.admin)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["source"] == "LIVE" and p["frozen"] is False
    body_html = next(s["html"] for s in p["sections"] if s["type"] == "BODY")
    assert env.student["full_name"] in body_html and "السفارة" in body_html
    ref = next(s["html"] for s in p["sections"] if s["type"] == "REFERENCE")
    assert "سيتم إنشاء الرقم عند الإصدار" in ref
    rec = next(s["html"] for s in p["sections"] if s["type"] == "RECIPIENT")
    assert "سعادة" in rec and "{{" not in rec
    assert p["unresolved"] == [] and p["missing_entities"] == [] and p["missing_inputs"] == []
    # وضع التحرير يعرض التسميات
    r = requests.post(f"{API}/correspondence/{cid}/preview", headers=env.admin, params={"mode": "edit"})
    assert "[اسم الطالب]" in next(s["html"] for s in r.json()["sections"] if s["type"] == "BODY")
    # التقديم → … → الإصدار
    for a in ("submit", "review", "approve", "sign"):
        r = requests.post(f"{API}/correspondence/{cid}/{a}", headers=env.admin, json={"reason": ""})
        assert r.status_code == 200, f"{a}: {r.text}"
    assert requests.patch(f"{API}/correspondence/{cid}/content", headers=env.admin, json={"input_values": {"destination": "y"}, "content_version": cv}).status_code == 409, "لا تعديل بعد التقديم"
    assert DB.correspondence_data_snapshots.count_documents({"correspondence_id": cid}) == 0, "لا لقطة قبل ISSUED"
    r = requests.post(f"{API}/correspondence/{cid}/issue", headers=env.admin, json={"reason": ""})
    assert r.status_code == 200, r.text
    num = r.json()["official_number"]
    assert num.startswith("ADM-")
    snap = DB.correspondence_data_snapshots.find_one({"correspondence_id": cid})
    assert snap and snap["snapshot_stage"] == "ISSUED" and snap["resolved_data"]["correspondence"]["official_number"] == num
    assert snap["resolved_data"]["student"]["full_name"] == env.student["full_name"]
    assert "phone" not in snap["resolved_data"]["student"], "تقليل الحقول — فقط المستخدمة"
    # بعد التجميد: المعاينة من اللقطة حتى لو تغيّر الطالب
    DB.students.update_one({"_id": env.student["_id"]}, {"$set": {"full_name_backup_p2": env.student["full_name"]}})
    r = requests.post(f"{API}/correspondence/{cid}/preview", headers=env.admin)
    assert r.json()["source"] == "SNAPSHOT" and r.json()["frozen"] is True and num in next(s["html"] for s in r.json()["sections"] if s["type"] == "REFERENCE")
    DB.students.update_one({"_id": env.student["_id"]}, {"$unset": {"full_name_backup_p2": ""}})
    r = requests.get(f"{API}/correspondence/{cid}/content", headers=env.admin)
    assert r.json()["snapshot"]["checksum"] == snap["checksum"]
    actions = {a["action"] for a in DB.audit_logs.find({"entity_id": cid})}
    assert {"CORRESPONDENCE_TEMPLATE_SELECTED", "CORRESPONDENCE_CONTENT_UPDATED", "PLACEHOLDER_RESOLVED", "SNAPSHOT_CREATED", "TEMPLATE_VALIDATION_FAILED"} <= actions


def test_apply_template_blocked_after_submit(env):
    cid = _draft(env)
    tpl = next(t for t in requests.get(f"{API}/correspondence/templates", headers=env.admin, params={"for_use": True}).json()["items"] if t["code"] == "GENERAL_CORRESPONDENCE")
    assert requests.post(f"{API}/correspondence/{cid}/apply-template", headers=env.admin, json={"template_id": tpl["id"]}).status_code == 200
    r = requests.post(f"{API}/correspondence/{cid}/submit", headers=env.admin, json={"reason": ""})
    assert r.status_code == 422 and any("إلزامي" in x for x in r.json()["detail"]["errors"]), "المتن الفارغ إلزامي"
    cv = requests.get(f"{API}/correspondence/{cid}/content", headers=env.admin).json()["content"]["content_version"]
    assert requests.patch(f"{API}/correspondence/{cid}/content", headers=env.admin, json={"section_values": {"s5": "<p>نص المراسلة</p>"}, "content_version": cv}).status_code == 200
    assert requests.post(f"{API}/correspondence/{cid}/submit", headers=env.admin, json={"reason": ""}).status_code == 200
    assert requests.post(f"{API}/correspondence/{cid}/apply-template", headers=env.admin, json={"template_id": tpl["id"]}).status_code == 409
    # قالب المنظمة غير منشور لا يُطبّق
    cid2 = _draft(env)
    assert requests.post(f"{API}/correspondence/{cid2}/apply-template", headers=env.admin, json={"template_id": env.tpl}).status_code == 200  # منشور v1
    r = requests.get(f"{API}/correspondence/{cid2}/content", headers=env.admin).json()
    assert r["content"]["template_version_number"] == 1, "يُستخدم آخر إصدار منشور (v1) لا المسودة v2"
