"""اختبارات المرحلة 1 — نظام المراسلات الرسمية (تعمل ضد الخادم الحي عبر REACT_APP_BACKEND_URL)
pytest backend/backend/tests/test_correspondence_phase1.py -q
"""
import os
import re
import uuid
import concurrent.futures as cf

import pytest
import requests
import pymongo
from dotenv import load_dotenv
from passlib.context import CryptContext

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
DB = pymongo.MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
PWD = CryptContext(schemes=["bcrypt"], deprecated="auto")
TAG = f"T{uuid.uuid4().hex[:6]}"
PASSWORD = "Test@12345"


def login(username, password):
    r = requests.post(f"{API}/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def make_user(name):
    uname = f"corr_{TAG}_{name}"
    r = DB.users.insert_one({"username": uname, "password": PWD.hash(PASSWORD), "full_name": f"{name} {TAG}", "role": "employee", "is_active": True, "permissions": [],
                             "created_at": __import__("datetime").datetime.utcnow()})
    return str(r.inserted_id), login(uname, PASSWORD)


class Env:
    pass


@pytest.fixture(scope="module")
def env():
    e = Env()
    e.admin = login("admin", "admin123")
    pres = DB.org_units.find_one({"type": "presidency"})
    e.pres_id = str(pres["_id"])
    e.dl = requests.post(f"{API}/correspondence/organizations", headers=e.admin, json={"name_ar": f"عمادة التعليم عن بعد {TAG}", "code": f"DL{TAG}", "organization_type": "deanship", "parent_id": e.pres_id}).json()["id"]
    e.dl_child = requests.post(f"{API}/correspondence/organizations", headers=e.admin, json={"name_ar": f"وحدة فرعية {TAG}", "code": f"DLU{TAG}", "organization_type": "unit", "parent_id": e.dl}).json()["id"]
    e.csl = requests.post(f"{API}/correspondence/organizations", headers=e.admin, json={"name_ar": f"كلية الشريعة {TAG}", "code": f"CSL{TAG}", "organization_type": "faculty", "parent_id": e.pres_id}).json()["id"]
    roles = {r["code"]: r["id"] for r in requests.get(f"{API}/correspondence/roles", headers=e.admin).json()}
    e.roles = roles
    e.users = {}
    for name, org, rcodes, scope in [
        ("drafter", e.dl, ["DRAFTER"], "ORGANIZATION"), ("reviewer", e.dl, ["REVIEWER"], "ORGANIZATION"),
        ("approver", e.dl, ["APPROVER"], "ORGANIZATION"), ("signer", e.dl, ["SIGNER"], "ORGANIZATION"),
        ("manager", e.dl, ["CORRESPONDENCE_MANAGER"], "ORGANIZATION_AND_CHILDREN"), ("cslviewer", e.csl, ["VIEWER"], "ORGANIZATION"),
        ("cslmanager", e.csl, ["CORRESPONDENCE_MANAGER"], "ORGANIZATION"), ("outsider", None, [], None)]:
        uid, hdr = make_user(name)
        e.users[name] = (uid, hdr)
        if org:
            r = requests.post(f"{API}/correspondence/memberships", headers=e.admin, json={"user_id": uid, "organization_id": org, "scope_type": scope, "role_ids": [roles[c] for c in rcodes], "is_primary": True})
            assert r.status_code == 200, r.text
    e.doc_type = next(d["id"] for d in requests.get(f"{API}/correspondence/document-types", headers=e.admin).json() if d["code"] == "OFFICIAL_LETTER")
    r = requests.post(f"{API}/correspondence/numbering-schemes", headers=e.admin, json={"organization_id": e.dl, "name": "DL", "prefix": "DL", "separator": "-", "padding_length": 6})
    assert r.status_code == 200, r.text
    e.scheme = r.json()
    yield e
    # تنظيف
    ids = [c["_id"] for c in DB.correspondences.find({"organization_id": {"$in": [e.dl, e.dl_child, e.csl]}}, {"_id": 1})]
    sids = [str(i) for i in ids]
    DB.correspondences.delete_many({"_id": {"$in": ids}})
    for col in ("correspondence_recipients", "correspondence_entities", "correspondence_status_history"):
        DB[col].delete_many({"correspondence_id": {"$in": sids}})
    DB.audit_logs.delete_many({"entity_id": {"$in": sids}})
    mids = [str(m["_id"]) for m in DB.org_memberships.find({"organization_id": {"$in": [e.dl, e.dl_child, e.csl]}})]
    DB.org_membership_roles.delete_many({"membership_id": {"$in": mids}})
    DB.org_memberships.delete_many({"organization_id": {"$in": [e.dl, e.dl_child, e.csl]}})
    DB.document_sequences.delete_many({"numbering_scheme_id": e.scheme["id"]})
    DB.numbering_schemes.delete_many({"organization_id": e.dl})
    DB.org_units.delete_many({"code": {"$in": [f"DL{TAG}", f"DLU{TAG}", f"CSL{TAG}"]}})
    DB.users.delete_many({"username": {"$regex": f"^corr_{TAG}_"}})


def new_draft(env, hdr=None, org=None, cls="INTERNAL", recipients=True):
    body = {"organization_id": org or env.dl, "document_type_id": env.doc_type, "subject": f"خطاب اختبار {TAG}", "summary": "ملخص", "priority": "NORMAL",
            "security_classification": cls, "recipients": ([{"recipient_type": "INTERNAL_ORGANIZATION", "organization_id": env.pres_id, "recipient_role": "TO", "is_primary": True}] if recipients else [])}
    r = requests.post(f"{API}/correspondence", headers=hdr or env.users["drafter"][1], json=body)
    return r


def act(env, cid, action, hdr, reason=""):
    return requests.post(f"{API}/correspondence/{cid}/{action}", headers=hdr, json={"reason": reason})


def to_signed(env, cid):
    for a, u in [("submit", "drafter"), ("review", "reviewer"), ("approve", "approver"), ("sign", "signer")]:
        r = act(env, cid, a, env.users[u][1])
        assert r.status_code == 200, f"{a}: {r.text}"


# ─── المصادقة والصلاحيات ───
def test_auth_required():
    assert requests.get(f"{API}/correspondence").status_code in (401, 403)
    assert requests.get(f"{API}/correspondence/dashboard").status_code in (401, 403)


def test_outsider_cannot_create(env):
    r = new_draft(env, hdr=env.users["outsider"][1])
    assert r.status_code == 403


def test_viewer_cannot_create(env):
    assert new_draft(env, hdr=env.users["cslviewer"][1], org=env.csl).status_code == 403


def test_drafter_cannot_create_in_other_org(env):
    assert new_draft(env, org=env.csl).status_code == 403


# ─── السيناريو A: دورة الحياة الكاملة ───
def test_scenario_a_full_lifecycle(env):
    r = new_draft(env)
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["status"] == "DRAFT" and c["official_number"] is None and c["uuid"]
    cid = c["id"]
    # تعديل المسودة
    r = requests.patch(f"{API}/correspondence/{cid}", headers=env.users["drafter"][1], json={"subject": f"خطاب معدل {TAG}", "version": c["version"]})
    assert r.status_code == 200 and r.json()["subject"].startswith("خطاب معدل") and r.json()["version"] == c["version"] + 1
    # محاولة تعيين الحالة مباشرة (mass assignment) تُتجاهل
    r = requests.patch(f"{API}/correspondence/{cid}", headers=env.users["drafter"][1], json={"status": "ISSUED", "official_number": "HACK-1"})
    assert r.status_code == 200 and r.json()["status"] == "DRAFT" and r.json()["official_number"] is None
    to_signed(env, cid)
    r = requests.get(f"{API}/correspondence/{cid}", headers=env.users["drafter"][1]).json()
    assert r["status"] == "SIGNED" and r["official_number"] is None
    r = act(env, cid, "issue", env.users["manager"][1])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ISSUED"
    assert re.fullmatch(r"DL-\d{4}-\d{6}", r.json()["official_number"]), r.json()["official_number"]
    assert r.json()["official_number"].endswith("-000001")
    env.first_issued = cid
    hist = requests.get(f"{API}/correspondence/{cid}/history", headers=env.users["drafter"][1]).json()
    assert [h["to_status"] for h in hist] == ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "SIGNED", "ISSUED"]
    actions = {a["action"] for a in DB.audit_logs.find({"entity_id": cid})}
    assert {"CORRESPONDENCE_CREATED", "DRAFT_UPDATED", "STATUS_SUBMITTED", "STATUS_ISSUED", "NUMBER_GENERATED"} <= actions


# ─── انتقالات غير صالحة / صلاحيات غير مصرح بها ───
def test_invalid_transitions(env):
    cid = new_draft(env).json()["id"]
    assert act(env, cid, "approve", env.users["approver"][1]).status_code == 409  # DRAFT → APPROVED غير مسموح
    assert act(env, cid, "archive", env.users["manager"][1]).status_code == 409
    assert act(env, cid, "issue", env.users["manager"][1]).status_code == 409
    assert act(env, cid, "submit", env.users["drafter"][1]).status_code == 200
    assert act(env, cid, "approve", env.users["drafter"][1]).status_code == 403  # المعدّ لا يعتمد
    assert act(env, cid, "review", env.users["reviewer"][1]).status_code == 200
    assert act(env, cid, "approve", env.users["reviewer"][1]).status_code == 403
    assert act(env, cid, "request-changes", env.users["reviewer"][1], "").status_code == 400  # السبب مطلوب
    assert act(env, cid, "request-changes", env.users["reviewer"][1], "أكمل البيانات").status_code == 200
    assert requests.get(f"{API}/correspondence/{cid}", headers=env.users["drafter"][1]).json()["status"] == "CHANGES_REQUESTED"
    assert act(env, cid, "reopen", env.users["drafter"][1]).status_code == 200
    assert act(env, cid, "submit", env.users["drafter"][1]).status_code == 200
    assert act(env, cid, "review", env.users["reviewer"][1]).status_code == 200
    assert act(env, cid, "approve", env.users["approver"][1]).status_code == 200
    assert act(env, cid, "issue", env.users["manager"][1]).status_code == 409  # APPROVED → ISSUED يحتاج توقيعاً أولاً
    assert act(env, cid, "sign", env.users["approver"][1]).status_code == 403
    assert act(env, cid, "sign", env.users["signer"][1]).status_code == 200
    assert act(env, cid, "issue", env.users["drafter"][1]).status_code == 403  # إصدار غير مصرح
    assert act(env, cid, "issue", env.users["manager"][1]).status_code == 200


def test_submit_requires_recipient(env):
    cid = new_draft(env, recipients=False).json()["id"]
    assert act(env, cid, "submit", env.users["drafter"][1]).status_code == 400
    r = requests.post(f"{API}/correspondence/{cid}/recipients", headers=env.users["drafter"][1], json={"recipient_type": "EXTERNAL_ORGANIZATION", "external_organization": "وزارة التعليم العالي", "recipient_role": "TO"})
    assert r.status_code == 200
    rid = r.json()["id"]
    assert act(env, cid, "submit", env.users["drafter"][1]).status_code == 200
    # لا يمكن إزالة مستلم بعد التقديم
    assert requests.delete(f"{API}/correspondence/{cid}/recipients/{rid}", headers=env.users["drafter"][1]).status_code == 409


# ─── السيناريو B: التزامن ───
def test_scenario_b_concurrent_issuing(env):
    cids = []
    for _ in range(8):
        cid = new_draft(env).json()["id"]
        to_signed(env, cid)
        cids.append(cid)
    hdr = env.users["manager"][1]
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(lambda c: act(env, c, "issue", hdr), cids))
    assert all(r.status_code == 200 for r in results), [r.text for r in results]
    numbers = [r.json()["official_number"] for r in results]
    assert len(set(numbers)) == len(numbers), numbers
    seqs = sorted(int(n.split("-")[-1]) for n in numbers)
    assert seqs == list(range(seqs[0], seqs[0] + len(seqs))), seqs
    assert DB.correspondences.count_documents({"official_number": {"$in": numbers}}) == len(numbers)
    env.last_seq = seqs[-1]


# ─── السيناريو C: العزل التنظيمي ───
def test_scenario_c_cross_org_isolation(env):
    cid = env.first_issued
    r = requests.get(f"{API}/correspondence/{cid}", headers=env.users["cslviewer"][1])
    assert r.status_code == 403
    assert requests.get(f"{API}/correspondence/{cid}", headers=env.users["cslmanager"][1]).status_code == 403
    assert requests.get(f"{API}/correspondence/{cid}", headers=env.users["outsider"][1]).status_code == 403
    assert act(env, cid, "cancel", env.users["cslmanager"][1], "محاولة").status_code == 403
    assert DB.audit_logs.count_documents({"action": "ACCESS_DENIED", "entity_id": cid}) >= 3
    # القائمة لا تسرّب مراسلات DL لمستخدم CSL
    lst = requests.get(f"{API}/correspondence", headers=env.users["cslmanager"][1]).json()
    assert all(i["organization_id"] != env.dl for i in lst["items"])
    # المعدّ يرى مسوداته فقط (ليس له view_all_organization)؛ المدير يرى كل مراسلات DL
    mine = requests.get(f"{API}/correspondence", headers=env.users["drafter"][1]).json()
    assert mine["total"] >= 1 and all(i["created_by"] == env.users["drafter"][0] for i in mine["items"])
    allv = requests.get(f"{API}/correspondence", headers=env.users["manager"][1], params={"organization_id": env.dl, "page_size": 5}).json()
    assert allv["total"] >= mine["total"] and len(allv["items"]) <= 5 and allv["page"] == 1


def test_child_org_scope(env):
    # مستخدم بنطاق ORGANIZATION_AND_CHILDREN في DL يرى مراسلة الوحدة الفرعية؛ المعدّ (ORGANIZATION) لا ينشئ فيها
    assert new_draft(env, org=env.dl_child).status_code == 403
    r = new_draft(env, hdr=env.users["manager"][1], org=env.dl_child)
    assert r.status_code == 200, r.text
    assert requests.get(f"{API}/correspondence/{r.json()['id']}", headers=env.users["manager"][1]).status_code == 200
    assert requests.get(f"{API}/correspondence/{r.json()['id']}", headers=env.users["reviewer"][1]).status_code == 403


def test_classification_enforced(env):
    cid = new_draft(env, cls="HIGHLY_CONFIDENTIAL").json()["id"]
    assert requests.get(f"{API}/correspondence/{cid}", headers=env.users["drafter"][1]).status_code == 200  # المنشئ
    assert requests.get(f"{API}/correspondence/{cid}", headers=env.users["manager"][1]).status_code == 403  # read_confidential لا يكفي
    assert requests.get(f"{API}/correspondence/{cid}", headers=env.admin).status_code == 200


# ─── السيناريو D: الإلغاء دون إعادة استخدام الرقم ───
def test_scenario_d_cancel_keeps_number(env):
    cid = env.first_issued
    before = requests.get(f"{API}/correspondence/{cid}", headers=env.admin).json()
    assert act(env, cid, "cancel", env.users["manager"][1], "").status_code == 400
    r = act(env, cid, "cancel", env.users["manager"][1], "صدر بالخطأ")
    assert r.status_code == 200 and r.json()["status"] == "CANCELLED" and r.json()["official_number"] == before["official_number"]
    assert requests.delete(f"{API}/correspondence/{cid}", headers=env.admin).status_code == 409  # لا حذف بعد الإصدار
    assert DB.correspondences.find_one({"_id": __import__("bson").ObjectId(cid)})["official_number"] == before["official_number"]
    hist = requests.get(f"{API}/correspondence/{cid}/history", headers=env.admin).json()
    assert hist[-1]["to_status"] == "CANCELLED" and hist[-1]["reason"] == "صدر بالخطأ"
    # الرقم التالي يتجاوز ولا يعيد الاستخدام
    cid2 = new_draft(env).json()["id"]
    to_signed(env, cid2)
    n = act(env, cid2, "issue", env.users["manager"][1]).json()["official_number"]
    assert int(n.split("-")[-1]) == env.last_seq + 1


def test_archive_restrictions(env):
    cid = new_draft(env).json()["id"]
    to_signed(env, cid)
    assert act(env, cid, "archive", env.users["manager"][1]).status_code == 409  # SIGNED → ARCHIVED غير مسموح
    assert act(env, cid, "issue", env.users["manager"][1]).status_code == 200
    assert act(env, cid, "archive", env.users["drafter"][1]).status_code == 403
    assert act(env, cid, "archive", env.users["manager"][1]).status_code == 200
    assert act(env, cid, "cancel", env.users["manager"][1], "x").status_code == 409


def test_soft_delete_draft(env):
    cid = new_draft(env).json()["id"]
    assert requests.delete(f"{API}/correspondence/{cid}", headers=env.users["cslmanager"][1]).status_code == 403
    assert requests.delete(f"{API}/correspondence/{cid}", headers=env.users["drafter"][1]).status_code == 200
    assert requests.get(f"{API}/correspondence/{cid}", headers=env.users["drafter"][1]).status_code == 404
    assert DB.correspondences.find_one({"_id": __import__("bson").ObjectId(cid)})["deleted_at"] is not None


def test_dashboard_scoped(env):
    d = requests.get(f"{API}/correspondence/dashboard", headers=env.users["cslviewer"][1]).json()
    assert d["issued"] == 0 and d["total_visible"] == 0
    d2 = requests.get(f"{API}/correspondence/dashboard", headers=env.users["manager"][1]).json()
    assert d2["issued"] >= 8 and d2["cancelled"] >= 1


def test_membership_and_role_admin_guard(env):
    uid, hdr = env.users["drafter"]
    assert requests.post(f"{API}/correspondence/memberships", headers=hdr, json={"user_id": uid, "organization_id": env.dl, "role_ids": [env.roles["SUPER_ADMIN"]]}).status_code == 403
    assert requests.post(f"{API}/correspondence/roles", headers=hdr, json={"code": "X", "name_ar": "x", "permissions": []}).status_code == 403
    assert requests.post(f"{API}/correspondence/numbering-schemes", headers=hdr, json={"organization_id": env.dl, "name": "n", "prefix": "X"}).status_code == 403
    # عضوية نشطة مكررة ترفض
    assert requests.post(f"{API}/correspondence/memberships", headers=env.admin, json={"user_id": uid, "organization_id": env.dl, "role_ids": [env.roles["VIEWER"]]}).status_code == 409


def test_org_code_unique_and_cycle_guard(env):
    assert requests.post(f"{API}/correspondence/organizations", headers=env.admin, json={"name_ar": "x", "code": f"dl{TAG}", "parent_id": env.pres_id}).status_code == 409
    r = requests.put(f"{API}/correspondence/organizations/{env.dl}", headers=env.admin, json={"name_ar": "x", "code": f"DL{TAG}", "parent_id": env.dl_child})
    assert r.status_code == 400
