"""📜 نظام المراسلات الرسمية — المرحلة 1
الهيكل التنظيمي (org_units المعاد استخدامها) + العضويات + RBAC بنطاق + أنواع الوثائق + محرك الترقيم الذري + آلة الحالات + التدقيق
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Request, Query
from pydantic import BaseModel, Field
from bson import ObjectId
from pymongo import ReturnDocument, ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

from .deps import get_db, get_current_user
from services.corr_policy import (load_context, CorrContext, P, ALL, ALL_CORR_PERMISSIONS, PERMISSION_KEYS, ROLE_PRESETS,
                                  SCOPE_TYPES, SCOPE_ORG, CLASSIFICATIONS)

router = APIRouter(prefix="/correspondence", tags=["المراسلات الرسمية"])
log = logging.getLogger("correspondence")

STATUSES = ("DRAFT", "SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "SIGNED", "ISSUED", "ARCHIVED", "CANCELLED")
PRIORITIES = ("NORMAL", "IMPORTANT", "URGENT", "IMMEDIATE")
RECIPIENT_TYPES = ("INTERNAL_ORGANIZATION", "INTERNAL_USER", "EXTERNAL_ORGANIZATION", "EXTERNAL_PERSON")
RECIPIENT_ROLES = ("TO", "CC", "BCC")
# action -> (from_status, to_status, permission)
TRANSITIONS = {
    "submit": ("DRAFT", "SUBMITTED", P["submit"]),
    "review": ("SUBMITTED", "UNDER_REVIEW", P["review"]),
    "request-changes": ("UNDER_REVIEW", "CHANGES_REQUESTED", P["review"]),
    "approve": ("UNDER_REVIEW", "APPROVED", P["approve"]),
    "reject": ("UNDER_REVIEW", "REJECTED", P["reject"]),
    "reopen": ("CHANGES_REQUESTED", "DRAFT", P["update_draft"]),
    "sign": ("APPROVED", "SIGNED", P["sign"]),
    "issue": ("SIGNED", "ISSUED", P["issue"]),
    "archive": ("ISSUED", "ARCHIVED", P["archive"]),
    "cancel": ("ISSUED", "CANCELLED", P["cancel"]),
}
DEFAULT_DOC_TYPES = [
    ("OFFICIAL_LETTER", "خطاب رسمي", "Official Letter"), ("INTERNAL_MEMO", "مذكرة داخلية", "Internal Memo"),
    ("ADMINISTRATIVE_DECISION", "قرار إداري", "Administrative Decision"), ("CIRCULAR", "تعميم", "Circular"),
    ("STUDENT_CERTIFICATE", "شهادة طالب", "Student Certificate"), ("FACULTY_LETTER", "خطاب عضو هيئة تدريس", "Faculty Letter"),
    ("EMPLOYEE_LETTER", "خطاب موظف", "Employee Letter"),
]


def _now():
    return datetime.now(timezone.utc)


def _oid(v: str, what: str = "المعرف") -> ObjectId:
    if not v or not ObjectId.is_valid(v):
        raise HTTPException(status_code=400, detail=f"{what} غير صالح")
    return ObjectId(v)


def _ser(doc: dict) -> dict:
    if not doc:
        return doc
    out = {}
    for k, v in doc.items():
        if k == "_id":
            out["id"] = str(v)
        elif isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def _org_view(u: dict) -> dict:
    """تطبيع org_units إلى عقد API للمراسلات (name→name_ar، type→organization_type)"""
    return {"id": str(u["_id"]), "name_ar": (u.get("name") or "").strip(), "name_en": u.get("name_en") or "",
            "code": (u.get("code") or "").strip(), "organization_type": u.get("type") or "", "parent_id": u.get("parent_id") or None,
            "is_active": u.get("is_active", True) is not False, "created_at": str(u.get("created_at") or ""), "updated_at": str(u.get("updated_at") or "")}


async def ctx_dep(current_user: dict = Depends(get_current_user)) -> CorrContext:
    return await load_context(get_db(), current_user)


async def audit(db, ctx: CorrContext, action: str, entity_type: str, entity_id: str, request: Optional[Request] = None,
                old: dict = None, new: dict = None, meta: dict = None, organization_id: str = None):
    try:
        await db.audit_logs.insert_one({
            "user_id": ctx.user_id, "username": ctx.user.get("username"), "organization_id": organization_id,
            "action": action, "entity_type": entity_type, "entity_id": entity_id,
            "old_values": old, "new_values": new, "metadata": meta or {},
            "ip_address": (request.client.host if request and request.client else None),
            "user_agent": (request.headers.get("user-agent") if request else None), "created_at": _now(),
        })
    except Exception as e:
        log.error(f"audit failed: {e}")


def _forbid(ctx: CorrContext, db, request, what: str, org_id: str = None, entity_id: str = None):
    """403 مع تسجيل محاولة الوصول الحساسة"""
    import asyncio
    asyncio.ensure_future(audit(db, ctx, "ACCESS_DENIED", "correspondence", entity_id or "", request, meta={"attempt": what}, organization_id=org_id))
    return HTTPException(status_code=403, detail="غير مصرح لك بهذا الإجراء ضمن نطاقك التنظيمي")


# ───────────────────────── Startup: indexes / seeds / audit ─────────────────────────
async def org_code_audit(db) -> dict:
    units = await db.org_units.find({}, {"name": 1, "code": 1, "parent_id": 1, "is_active": 1}).to_list(5000)
    ids = {str(u["_id"]) for u in units}
    norm, empties, orphans, cycles = {}, [], [], []
    for u in units:
        c = (u.get("code") or "")
        if not c.strip():
            empties.append({"id": str(u["_id"]), "name": u.get("name")})
        else:
            norm.setdefault(c.strip().upper(), []).append({"id": str(u["_id"]), "name": u.get("name"), "code": c, "is_active": u.get("is_active", True)})
        p = u.get("parent_id")
        if p and p not in ids:
            orphans.append({"id": str(u["_id"]), "name": u.get("name"), "parent_id": p})
        seen, cur = set(), str(u["_id"])
        parent = {str(x["_id"]): x.get("parent_id") for x in units}
        while cur and cur in parent:
            if cur in seen:
                cycles.append(str(u["_id"]))
                break
            seen.add(cur)
            cur = parent.get(cur)
    dups = {k: v for k, v in norm.items() if len(v) > 1}
    whitespace = [v[0] for v in norm.values() if any(x["code"] != x["code"].strip() for x in v)]
    return {"total": len(units), "duplicates": dups, "empty_codes": empties, "whitespace_codes": whitespace,
            "orphans": orphans, "cycles": sorted(set(cycles)), "clean": not dups and not empties}


async def correspondence_startup(db):
    """فهارس + بذور + تدقيق أكواد org_units (الفهرس الفريد يُطبَّق فقط إن كانت البيانات نظيفة)"""
    try:
        await db.org_memberships.create_index([("user_id", ASCENDING), ("organization_id", ASCENDING)], unique=True,
                                              partialFilterExpression={"is_active": True}, name="uniq_active_membership")
        await db.org_membership_roles.create_index([("membership_id", ASCENDING), ("role_id", ASCENDING)], unique=True)
        await db.corr_roles.create_index("code", unique=True)
        await db.document_types.create_index([("code", ASCENDING), ("organization_id", ASCENDING)], unique=True)
        await db.numbering_schemes.create_index([("organization_id", ASCENDING), ("document_type_id", ASCENDING), ("is_active", ASCENDING)])
        await db.document_sequences.create_index([("numbering_scheme_id", ASCENDING), ("year", ASCENDING)], unique=True)
        await db.correspondences.create_index("uuid", unique=True)
        await db.correspondences.create_index("official_number", unique=True, partialFilterExpression={"official_number": {"$type": "string"}})
        for ix in (["organization_id", "status"], ["organization_id", "numbering_year", "sequence_number"], ["document_type_id"], ["created_by", "status"],
                   ["created_at"], ["archived_at"], ["recipient_user_ids"], ["security_classification"], ["priority"]):
            await db.correspondences.create_index([(f, ASCENDING) for f in ix])
        await db.correspondence_recipients.create_index("correspondence_id")
        await db.correspondence_entities.create_index([("correspondence_id", ASCENDING), ("entity_type", ASCENDING), ("entity_id", ASCENDING)])
        await db.correspondence_status_history.create_index([("correspondence_id", ASCENDING), ("created_at", ASCENDING)])
        await db.audit_logs.create_index([("entity_type", ASCENDING), ("entity_id", ASCENDING), ("created_at", DESCENDING)])
        await db.audit_logs.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
        # بذور الأدوار (إدراج فقط — لا تُستبدل تعديلات المدير)
        for r in ROLE_PRESETS:
            await db.corr_roles.update_one({"code": r["code"]}, {"$setOnInsert": {**r, "is_system": True, "is_active": True, "created_at": _now()}}, upsert=True)
            await db.corr_roles.update_one({"code": r["code"], "is_system": True}, {"$addToSet": {"permissions": {"$each": r["permissions"]}}})
        for code, ar, en in DEFAULT_DOC_TYPES:
            await db.document_types.update_one({"code": code, "organization_id": None}, {"$setOnInsert": {
                "code": code, "name_ar": ar, "name_en": en, "description": "", "organization_id": None, "is_global": True, "is_active": True, "created_at": _now(), "updated_at": _now()}}, upsert=True)
        # تدقيق أكواد الوحدات التنظيمية
        rep = await org_code_audit(db)
        await db.meta.update_one({"_id": "org_code_audit"}, {"$set": {"report": rep, "at": _now()}}, upsert=True)
        if rep["clean"]:
            await db.org_units.create_index("code", unique=True, partialFilterExpression={"code": {"$type": "string"}}, name="uniq_org_code")
            log.info("org_units.code unique index applied")
        else:
            log.warning(f"org_units.code unique index SKIPPED — conflicts: dups={len(rep['duplicates'])} empty={len(rep['empty_codes'])}")
    except Exception as e:
        log.error(f"correspondence_startup failed: {e}")


# ───────────────────────── Models ─────────────────────────
class OrgIn(BaseModel):
    name_ar: str
    name_en: Optional[str] = ""
    code: str
    organization_type: str = "administration"
    parent_id: Optional[str] = None
    is_active: bool = True


class MembershipIn(BaseModel):
    user_id: str
    organization_id: str
    job_title: Optional[str] = ""
    is_primary: bool = False
    scope_type: str = SCOPE_ORG
    role_ids: List[str] = []
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: bool = True


class RoleIn(BaseModel):
    code: str
    name_ar: str
    name_en: Optional[str] = ""
    permissions: List[str] = []
    is_active: bool = True


class DocTypeIn(BaseModel):
    code: str
    name_ar: str
    name_en: Optional[str] = ""
    description: Optional[str] = ""
    organization_id: Optional[str] = None
    is_active: bool = True


class SchemeIn(BaseModel):
    organization_id: str
    document_type_id: Optional[str] = None
    name: str
    prefix: str
    separator: str = "-"
    year_format: str = "YYYY"
    padding_length: int = Field(6, ge=1, le=12)
    reset_frequency: str = "YEARLY"
    pattern: str = "{prefix}{sep}{year}{sep}{seq}"
    trigger_status: str = "ISSUED"
    is_active: bool = True


class RecipientIn(BaseModel):
    recipient_type: str
    organization_id: Optional[str] = None
    user_id: Optional[str] = None
    external_name: Optional[str] = None
    external_organization: Optional[str] = None
    external_contact: Optional[str] = None
    recipient_title: Optional[str] = None
    recipient_role: str = "TO"
    is_primary: bool = False


class EntityIn(BaseModel):
    entity_type: str
    entity_id: str
    relationship_type: str = "SUBJECT"


class CorrIn(BaseModel):
    organization_id: str
    document_type_id: str
    subject: str
    summary: Optional[str] = ""
    priority: str = "NORMAL"
    security_classification: str = "INTERNAL"
    sender_organization_id: Optional[str] = None
    recipients: List[RecipientIn] = []
    entities: List[EntityIn] = []


class CorrPatch(BaseModel):
    subject: Optional[str] = None
    summary: Optional[str] = None
    priority: Optional[str] = None
    security_classification: Optional[str] = None
    document_type_id: Optional[str] = None
    sender_organization_id: Optional[str] = None
    version: Optional[int] = None


class TransitionIn(BaseModel):
    reason: Optional[str] = ""


# ───────────────────────── Meta / Me ─────────────────────────
@router.get("/meta")
async def meta(ctx: CorrContext = Depends(ctx_dep)):
    return {"statuses": STATUSES, "priorities": PRIORITIES, "classifications": CLASSIFICATIONS, "recipient_types": RECIPIENT_TYPES,
            "recipient_roles": RECIPIENT_ROLES, "scope_types": SCOPE_TYPES, "permissions": ALL_CORR_PERMISSIONS,
            "transitions": {k: {"from": v[0], "to": v[1], "permission": v[2]} for k, v in TRANSITIONS.items()}}


@router.get("/me")
async def my_access(ctx: CorrContext = Depends(ctx_dep)):
    """صلاحيات المستخدم الحالي حسب العضويات (للواجهة فقط — الأمن في الخادم)"""
    return {"user_id": ctx.user_id, "is_super": ctx.is_super,
            "grants": [{"organization_id": g.org_id, "scope_type": g.scope_type, "permissions": sorted(g.perms), "membership_id": g.membership_id} for g in ctx.grants],
            "can_create_in": sorted(ctx.orgs_with(P["create"])) if ctx.orgs_with(P["create"]) is not ALL else "ALL"}


# ───────────────────────── Organizations (org_units reuse) ─────────────────────────
@router.get("/organizations")
async def list_organizations(include_inactive: bool = False, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    q = {} if include_inactive else {"is_active": {"$ne": False}}
    units = await db.org_units.find(q).sort([("order", 1), ("name", 1)]).to_list(5000)
    return [_org_view(u) for u in units]


@router.get("/organizations/code-audit")
async def organizations_code_audit(ctx: CorrContext = Depends(ctx_dep)):
    if not ctx.has_perm_anywhere(P["organizations"]):
        raise HTTPException(status_code=403, detail="غير مصرح")
    return await org_code_audit(get_db())


@router.post("/organizations")
async def create_organization(data: OrgIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    code = data.code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="الكود مطلوب")
    scope_org = data.parent_id
    if not ctx.is_super and (not scope_org or not ctx.can(P["organizations"], scope_org)):
        raise _forbid(ctx, db, request, "create_organization", scope_org)
    if data.parent_id and not await db.org_units.find_one({"_id": _oid(data.parent_id, "الوحدة الأم")}):
        raise HTTPException(status_code=404, detail="الوحدة الأم غير موجودة")
    if await db.org_units.find_one({"code": {"$regex": f"^{__import__('re').escape(code)}$", "$options": "i"}}):
        raise HTTPException(status_code=409, detail="الكود مستخدم مسبقاً")
    doc = {"name": data.name_ar.strip(), "name_en": (data.name_en or "").strip(), "code": code, "type": data.organization_type,
           "parent_id": data.parent_id or None, "is_active": data.is_active, "order": 50, "created_at": _now().isoformat(), "updated_at": _now().isoformat()}
    try:
        r = await db.org_units.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="الكود مستخدم مسبقاً")
    await audit(db, ctx, "ORGANIZATION_CREATED", "org_unit", str(r.inserted_id), request, new=_org_view({**doc, "_id": r.inserted_id}), organization_id=str(r.inserted_id))
    return _org_view({**doc, "_id": r.inserted_id})


@router.put("/organizations/{org_id}")
async def update_organization(org_id: str, data: OrgIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    oid = _oid(org_id)
    cur = await db.org_units.find_one({"_id": oid})
    if not cur:
        raise HTTPException(status_code=404, detail="الوحدة غير موجودة")
    if not ctx.can(P["organizations"], org_id):
        raise _forbid(ctx, db, request, "update_organization", org_id)
    code = data.code.strip()
    if data.parent_id == org_id:
        raise HTTPException(status_code=400, detail="لا يمكن أن تكون الوحدة أماً لنفسها")
    if data.parent_id and data.parent_id in ctx.descendants(org_id):
        raise HTTPException(status_code=400, detail="لا يمكن نقل الوحدة تحت إحدى وحداتها الفرعية (حلقة)")
    dup = await db.org_units.find_one({"_id": {"$ne": oid}, "code": {"$regex": f"^{__import__('re').escape(code)}$", "$options": "i"}})
    if dup:
        raise HTTPException(status_code=409, detail="الكود مستخدم مسبقاً")
    upd = {"name": data.name_ar.strip(), "name_en": (data.name_en or "").strip(), "code": code, "parent_id": data.parent_id or None,
           "is_active": data.is_active, "updated_at": _now().isoformat()}
    if not cur.get("faculty_id") and not cur.get("department_id"):
        upd["type"] = data.organization_type
    await db.org_units.update_one({"_id": oid}, {"$set": upd})
    await audit(db, ctx, "ORGANIZATION_UPDATED", "org_unit", org_id, request, old=_org_view(cur), new=upd, organization_id=org_id)
    return _org_view(await db.org_units.find_one({"_id": oid}))


# ───────────────────────── Roles ─────────────────────────
@router.get("/roles")
async def list_roles(ctx: CorrContext = Depends(ctx_dep)):
    if not (ctx.has_perm_anywhere(P["permissions"]) or ctx.has_perm_anywhere(P["memberships"])):
        raise HTTPException(status_code=403, detail="غير مصرح")
    return [_ser(r) for r in await get_db().corr_roles.find().sort("code", 1).to_list(500)]


@router.post("/roles")
async def create_role(data: RoleIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    if not ctx.has_perm_anywhere(P["permissions"]):
        raise _forbid(ctx, db, request, "create_role")
    bad = [p for p in data.permissions if p not in PERMISSION_KEYS]
    if bad:
        raise HTTPException(status_code=400, detail=f"صلاحيات غير معروفة: {', '.join(bad)}")
    doc = {**data.dict(), "code": data.code.strip().upper(), "is_system": False, "created_at": _now()}
    try:
        r = await db.corr_roles.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="كود الدور مستخدم")
    await audit(db, ctx, "ROLE_CREATED", "corr_role", str(r.inserted_id), request, new=data.dict())
    return _ser({**doc, "_id": r.inserted_id})


@router.put("/roles/{role_id}")
async def update_role(role_id: str, data: RoleIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    if not ctx.has_perm_anywhere(P["permissions"]):
        raise _forbid(ctx, db, request, "update_role")
    oid = _oid(role_id)
    cur = await db.corr_roles.find_one({"_id": oid})
    if not cur:
        raise HTTPException(status_code=404, detail="الدور غير موجود")
    bad = [p for p in data.permissions if p not in PERMISSION_KEYS]
    if bad:
        raise HTTPException(status_code=400, detail=f"صلاحيات غير معروفة: {', '.join(bad)}")
    upd = {"name_ar": data.name_ar, "name_en": data.name_en, "permissions": data.permissions, "is_active": data.is_active, "updated_at": _now()}
    if cur.get("code") == "SUPER_ADMIN":
        upd["permissions"] = sorted(PERMISSION_KEYS)
    await db.corr_roles.update_one({"_id": oid}, {"$set": upd})
    await audit(db, ctx, "ROLE_UPDATED", "corr_role", role_id, request, old={"permissions": cur.get("permissions")}, new={"permissions": data.permissions})
    return _ser(await db.corr_roles.find_one({"_id": oid}))


# ───────────────────────── Memberships ─────────────────────────
async def _membership_view(db, m: dict) -> dict:
    links = await db.org_membership_roles.find({"membership_id": str(m["_id"])}).to_list(100)
    rids = [ObjectId(l["role_id"]) for l in links if ObjectId.is_valid(l["role_id"])]
    roles = [_ser(r) for r in await db.corr_roles.find({"_id": {"$in": rids}}, {"code": 1, "name_ar": 1}).to_list(100)] if rids else []
    user = await db.users.find_one({"_id": ObjectId(m["user_id"])}, {"full_name": 1, "username": 1}) if ObjectId.is_valid(m["user_id"]) else None
    org = await db.org_units.find_one({"_id": ObjectId(m["organization_id"])}, {"name": 1, "code": 1}) if ObjectId.is_valid(m["organization_id"]) else None
    return {**_ser(m), "roles": roles, "user_name": (user or {}).get("full_name", ""), "username": (user or {}).get("username", ""),
            "organization_name": (org or {}).get("name", ""), "organization_code": (org or {}).get("code", "")}


@router.get("/memberships")
async def list_memberships(organization_id: Optional[str] = None, user_id: Optional[str] = None, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    allowed = ctx.orgs_with(P["memberships"])
    if allowed is not ALL and not allowed:
        raise HTTPException(status_code=403, detail="غير مصرح")
    q = {}
    if organization_id:
        if allowed is not ALL and organization_id not in allowed:
            raise HTTPException(status_code=403, detail="خارج نطاقك")
        q["organization_id"] = organization_id
    elif allowed is not ALL:
        q["organization_id"] = {"$in": sorted(allowed)}
    if user_id:
        q["user_id"] = user_id
    mems = await db.org_memberships.find(q).sort("created_at", -1).to_list(2000)
    return [await _membership_view(db, m) for m in mems]


@router.post("/memberships")
async def create_membership(data: MembershipIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    if not ctx.can(P["memberships"], data.organization_id):
        raise _forbid(ctx, db, request, "create_membership", data.organization_id)
    if data.scope_type not in SCOPE_TYPES:
        raise HTTPException(status_code=400, detail="نوع النطاق غير صالح")
    if data.scope_type == "UNIVERSITY_WIDE" and not ctx.is_super and not any(g.scope_type == "UNIVERSITY_WIDE" and P["memberships"] in g.perms for g in ctx.grants):
        raise HTTPException(status_code=403, detail="منح نطاق الجامعة يتطلب صلاحية بنطاق الجامعة")
    if not await db.users.find_one({"_id": _oid(data.user_id, "المستخدم")}):
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    if not await db.org_units.find_one({"_id": _oid(data.organization_id, "المنظمة")}):
        raise HTTPException(status_code=404, detail="المنظمة غير موجودة")
    roles = await db.corr_roles.find({"_id": {"$in": [_oid(r, "الدور") for r in data.role_ids]}}).to_list(100)
    if len(roles) != len(set(data.role_ids)):
        raise HTTPException(status_code=400, detail="بعض الأدوار غير موجودة")
    if any(r.get("code") == "SUPER_ADMIN" for r in roles) and not ctx.is_super:
        raise HTTPException(status_code=403, detail="منح SUPER_ADMIN مقصور على مدير النظام")
    if data.is_primary:
        await db.org_memberships.update_many({"user_id": data.user_id, "is_primary": True}, {"$set": {"is_primary": False}})
    doc = {"user_id": data.user_id, "organization_id": data.organization_id, "job_title": data.job_title or "", "is_primary": data.is_primary,
           "scope_type": data.scope_type, "is_active": data.is_active, "start_date": data.start_date, "end_date": data.end_date,
           "created_by": ctx.user_id, "created_at": _now(), "updated_at": _now()}
    try:
        r = await db.org_memberships.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="للمستخدم عضوية نشطة في هذه المنظمة بالفعل")
    mid = str(r.inserted_id)
    if data.role_ids:
        await db.org_membership_roles.insert_many([{"membership_id": mid, "role_id": rid, "created_at": _now()} for rid in set(data.role_ids)])
    await audit(db, ctx, "MEMBERSHIP_CREATED", "org_membership", mid, request, new={**data.dict()}, organization_id=data.organization_id)
    return await _membership_view(db, await db.org_memberships.find_one({"_id": r.inserted_id}))


@router.put("/memberships/{membership_id}")
async def update_membership(membership_id: str, data: MembershipIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    oid = _oid(membership_id)
    cur = await db.org_memberships.find_one({"_id": oid})
    if not cur:
        raise HTTPException(status_code=404, detail="العضوية غير موجودة")
    if not ctx.can(P["memberships"], cur["organization_id"]) or not ctx.can(P["memberships"], data.organization_id):
        raise _forbid(ctx, db, request, "update_membership", cur["organization_id"], membership_id)
    if data.scope_type not in SCOPE_TYPES:
        raise HTTPException(status_code=400, detail="نوع النطاق غير صالح")
    if data.scope_type == "UNIVERSITY_WIDE" and not ctx.is_super and not any(g.scope_type == "UNIVERSITY_WIDE" and P["memberships"] in g.perms for g in ctx.grants):
        raise HTTPException(status_code=403, detail="منح نطاق الجامعة يتطلب صلاحية بنطاق الجامعة")
    roles = await db.corr_roles.find({"_id": {"$in": [_oid(r, "الدور") for r in data.role_ids]}}).to_list(100)
    if any(r.get("code") == "SUPER_ADMIN" for r in roles) and not ctx.is_super:
        raise HTTPException(status_code=403, detail="منح SUPER_ADMIN مقصور على مدير النظام")
    if data.is_primary:
        await db.org_memberships.update_many({"user_id": cur["user_id"], "is_primary": True, "_id": {"$ne": oid}}, {"$set": {"is_primary": False}})
    upd = {"organization_id": data.organization_id, "job_title": data.job_title or "", "is_primary": data.is_primary, "scope_type": data.scope_type,
           "is_active": data.is_active, "start_date": data.start_date, "end_date": data.end_date, "updated_at": _now()}
    try:
        await db.org_memberships.update_one({"_id": oid}, {"$set": upd})
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="عضوية نشطة مكررة")
    await db.org_membership_roles.delete_many({"membership_id": membership_id})
    if data.role_ids:
        await db.org_membership_roles.insert_many([{"membership_id": membership_id, "role_id": rid, "created_at": _now()} for rid in set(data.role_ids)])
    await audit(db, ctx, "MEMBERSHIP_UPDATED", "org_membership", membership_id, request, old=_ser(cur), new={**upd, "role_ids": data.role_ids}, organization_id=data.organization_id)
    return await _membership_view(db, await db.org_memberships.find_one({"_id": oid}))


@router.delete("/memberships/{membership_id}")
async def deactivate_membership(membership_id: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    oid = _oid(membership_id)
    cur = await db.org_memberships.find_one({"_id": oid})
    if not cur:
        raise HTTPException(status_code=404, detail="العضوية غير موجودة")
    if not ctx.can(P["memberships"], cur["organization_id"]):
        raise _forbid(ctx, db, request, "deactivate_membership", cur["organization_id"], membership_id)
    await db.org_memberships.update_one({"_id": oid}, {"$set": {"is_active": False, "end_date": _now().date().isoformat(), "updated_at": _now()}})
    await audit(db, ctx, "MEMBERSHIP_DEACTIVATED", "org_membership", membership_id, request, organization_id=cur["organization_id"])
    return {"message": "تم إيقاف العضوية"}


@router.get("/users-lookup")
async def users_lookup(q: str = "", ctx: CorrContext = Depends(ctx_dep)):
    """بحث مختصر عن المستخدمين لإسناد العضويات/المستلمين (اسم + معرف فقط)"""
    if not (ctx.has_perm_anywhere(P["memberships"]) or ctx.has_perm_anywhere(P["create"])):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_db()
    f = {"is_active": {"$ne": False}, "role": {"$ne": "student"}}
    if q.strip():
        f["$or"] = [{"full_name": {"$regex": q.strip(), "$options": "i"}}, {"username": {"$regex": q.strip(), "$options": "i"}}]
    return [{"id": str(u["_id"]), "full_name": u.get("full_name", ""), "username": u.get("username", "")} for u in await db.users.find(f, {"full_name": 1, "username": 1}).limit(30).to_list(30)]


# ───────────────────────── Document types ─────────────────────────
@router.get("/document-types")
async def list_document_types(organization_id: Optional[str] = None, include_inactive: bool = False, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    q = {"$or": [{"is_global": True}, {"organization_id": organization_id}]} if organization_id else {}
    if not include_inactive:
        q["is_active"] = True
    return [_ser(d) for d in await db.document_types.find(q).sort("code", 1).to_list(1000)]


@router.post("/document-types")
async def create_document_type(data: DocTypeIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    if data.organization_id:
        if not ctx.can(P["templates"], data.organization_id):
            raise _forbid(ctx, db, request, "create_document_type", data.organization_id)
    elif not ctx.is_super and not any(g.scope_type == "UNIVERSITY_WIDE" and P["templates"] in g.perms for g in ctx.grants):
        raise _forbid(ctx, db, request, "create_global_document_type")
    doc = {**data.dict(), "code": data.code.strip().upper(), "is_global": not data.organization_id, "created_at": _now(), "updated_at": _now()}
    try:
        r = await db.document_types.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="كود النوع مستخدم ضمن هذه المنظمة")
    await audit(db, ctx, "DOCUMENT_TYPE_CREATED", "document_type", str(r.inserted_id), request, new=data.dict(), organization_id=data.organization_id)
    return _ser({**doc, "_id": r.inserted_id})


@router.put("/document-types/{dt_id}")
async def update_document_type(dt_id: str, data: DocTypeIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    oid = _oid(dt_id)
    cur = await db.document_types.find_one({"_id": oid})
    if not cur:
        raise HTTPException(status_code=404, detail="النوع غير موجود")
    if cur.get("organization_id"):
        if not ctx.can(P["templates"], cur["organization_id"]):
            raise _forbid(ctx, db, request, "update_document_type", cur["organization_id"], dt_id)
    elif not ctx.is_super and not any(g.scope_type == "UNIVERSITY_WIDE" and P["templates"] in g.perms for g in ctx.grants):
        raise _forbid(ctx, db, request, "update_global_document_type", None, dt_id)
    upd = {"name_ar": data.name_ar, "name_en": data.name_en, "description": data.description, "is_active": data.is_active, "updated_at": _now()}
    await db.document_types.update_one({"_id": oid}, {"$set": upd})
    await audit(db, ctx, "DOCUMENT_TYPE_UPDATED", "document_type", dt_id, request, old=_ser(cur), new=upd, organization_id=cur.get("organization_id"))
    return _ser(await db.document_types.find_one({"_id": oid}))


# ───────────────────────── Numbering schemes + engine ─────────────────────────
def _format_number(scheme: dict, year: int, seq: int) -> str:
    y = str(year) if (scheme.get("year_format") or "YYYY") == "YYYY" else str(year)[-2:]
    return (scheme.get("pattern") or "{prefix}{sep}{year}{sep}{seq}").format(
        prefix=scheme.get("prefix", ""), sep=scheme.get("separator", "-"), year=y, seq=str(seq).zfill(int(scheme.get("padding_length") or 6)))


async def _resolve_scheme(db, ctx: CorrContext, org_id: str, doc_type_id: str) -> Optional[dict]:
    """مخطط نوع الوثيقة في المنظمة → المخطط العام للمنظمة → المنظمات الأم صعوداً"""
    cur = org_id
    seen = set()
    while cur and cur not in seen:
        seen.add(cur)
        s = await db.numbering_schemes.find_one({"organization_id": cur, "document_type_id": doc_type_id, "is_active": True}) or \
            await db.numbering_schemes.find_one({"organization_id": cur, "document_type_id": None, "is_active": True})
        if s:
            return s
        cur = ctx.tree.get(cur)
    return None


async def generate_official_number(db, scheme: dict) -> tuple:
    """ذري: $inc على document_sequences (فهرس فريد scheme+year؛ إعادة المحاولة عند سباق upsert)"""
    year = _now().year if (scheme.get("reset_frequency") or "YEARLY") == "YEARLY" else 0
    for _ in range(5):
        try:
            seq = await db.document_sequences.find_one_and_update(
                {"numbering_scheme_id": str(scheme["_id"]), "year": year},
                {"$inc": {"current_sequence": 1}, "$set": {"updated_at": _now()}},
                upsert=True, return_document=ReturnDocument.AFTER)
            n = int(seq["current_sequence"])
            return _format_number(scheme, _now().year, n), n, _now().year
        except DuplicateKeyError:
            continue
    raise HTTPException(status_code=500, detail="تعذر توليد الرقم الرسمي")


@router.get("/numbering-schemes")
async def list_schemes(organization_id: Optional[str] = None, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    allowed = ctx.orgs_with(P["numbering"])
    if allowed is not ALL and not allowed:
        raise HTTPException(status_code=403, detail="غير مصرح")
    q = {}
    if organization_id:
        q["organization_id"] = organization_id
    elif allowed is not ALL:
        q["organization_id"] = {"$in": sorted(allowed)}
    out = []
    for s in await db.numbering_schemes.find(q).sort("created_at", -1).to_list(1000):
        seqs = await db.document_sequences.find({"numbering_scheme_id": str(s["_id"])}).to_list(50)
        out.append({**_ser(s), "preview": _format_number(s, _now().year, 1), "sequences": [{"year": x["year"], "current_sequence": x["current_sequence"]} for x in seqs]})
    return out


@router.post("/numbering-schemes")
async def create_scheme(data: SchemeIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    if not ctx.can(P["numbering"], data.organization_id):
        raise _forbid(ctx, db, request, "create_scheme", data.organization_id)
    if data.trigger_status not in ("APPROVED", "SIGNED", "ISSUED"):
        raise HTTPException(status_code=400, detail="مرحلة الترقيم يجب أن تكون APPROVED أو SIGNED أو ISSUED")
    try:
        _format_number(data.dict(), 2026, 1)
    except (KeyError, IndexError, ValueError):
        raise HTTPException(status_code=400, detail="النمط غير صالح — المتغيرات المسموحة: {prefix} {sep} {year} {seq}")
    doc = {**data.dict(), "created_by": ctx.user_id, "created_at": _now(), "updated_at": _now()}
    r = await db.numbering_schemes.insert_one(doc)
    await audit(db, ctx, "NUMBERING_SCHEME_CREATED", "numbering_scheme", str(r.inserted_id), request, new=data.dict(), organization_id=data.organization_id)
    return {**_ser({**doc, "_id": r.inserted_id}), "preview": _format_number(doc, _now().year, 1)}


@router.put("/numbering-schemes/{scheme_id}")
async def update_scheme(scheme_id: str, data: SchemeIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    oid = _oid(scheme_id)
    cur = await db.numbering_schemes.find_one({"_id": oid})
    if not cur:
        raise HTTPException(status_code=404, detail="المخطط غير موجود")
    if not ctx.can(P["numbering"], cur["organization_id"]):
        raise _forbid(ctx, db, request, "update_scheme", cur["organization_id"], scheme_id)
    if data.trigger_status not in ("APPROVED", "SIGNED", "ISSUED"):
        raise HTTPException(status_code=400, detail="مرحلة الترقيم غير صالحة")
    try:
        _format_number(data.dict(), 2026, 1)
    except (KeyError, IndexError, ValueError):
        raise HTTPException(status_code=400, detail="النمط غير صالح")
    upd = {k: v for k, v in data.dict().items() if k != "organization_id"}
    upd["updated_at"] = _now()
    await db.numbering_schemes.update_one({"_id": oid}, {"$set": upd})
    await audit(db, ctx, "NUMBERING_SCHEME_UPDATED", "numbering_scheme", scheme_id, request, old=_ser(cur), new=upd, organization_id=cur["organization_id"])
    s = await db.numbering_schemes.find_one({"_id": oid})
    return {**_ser(s), "preview": _format_number(s, _now().year, 1)}


# ───────────────────────── Dashboard ─────────────────────────
@router.get("/dashboard")
async def dashboard(ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    vis = ctx.visibility_filter()
    base = {"deleted_at": None}
    if vis is None:
        return {"my_drafts": 0, "waiting_review": 0, "waiting_approval": 0, "waiting_signature": 0, "issued": 0, "archived": 0, "cancelled": 0, "total_visible": 0}

    async def cnt(extra):
        return await db.correspondences.count_documents({**base, **vis, **extra} if vis else {**base, **extra})
    return {
        "my_drafts": await db.correspondences.count_documents({**base, "created_by": ctx.user_id, "status": {"$in": ["DRAFT", "CHANGES_REQUESTED"]}}),
        "waiting_review": await cnt({"status": "SUBMITTED"}),
        "waiting_approval": await cnt({"status": "UNDER_REVIEW"}),
        "waiting_signature": await cnt({"status": "APPROVED"}),
        "issued": await cnt({"status": "ISSUED"}),
        "archived": await cnt({"status": "ARCHIVED"}),
        "cancelled": await cnt({"status": "CANCELLED"}),
        "total_visible": await cnt({}),
    }


# ───────────────────────── Correspondence CRUD ─────────────────────────
async def _enrich(db, c: dict) -> dict:
    out = _ser(c)
    org = await db.org_units.find_one({"_id": ObjectId(c["organization_id"])}, {"name": 1, "code": 1}) if ObjectId.is_valid(c.get("organization_id", "")) else None
    dt = await db.document_types.find_one({"_id": ObjectId(c["document_type_id"])}, {"name_ar": 1, "code": 1}) if ObjectId.is_valid(c.get("document_type_id", "")) else None
    cr = await db.users.find_one({"_id": ObjectId(c["created_by"])}, {"full_name": 1}) if ObjectId.is_valid(c.get("created_by", "")) else None
    out["organization_name"] = (org or {}).get("name", "")
    out["organization_code"] = (org or {}).get("code", "")
    out["document_type_name"] = (dt or {}).get("name_ar", "")
    out["document_type_code"] = (dt or {}).get("code", "")
    out["created_by_name"] = (cr or {}).get("full_name", "")
    return out


def _validate_recipient(r: RecipientIn):
    if r.recipient_type not in RECIPIENT_TYPES or r.recipient_role not in RECIPIENT_ROLES:
        raise HTTPException(status_code=400, detail="نوع/دور المستلم غير صالح")
    if r.recipient_type == "INTERNAL_ORGANIZATION" and not r.organization_id:
        raise HTTPException(status_code=400, detail="المنظمة المستلمة مطلوبة")
    if r.recipient_type == "INTERNAL_USER" and not r.user_id:
        raise HTTPException(status_code=400, detail="المستخدم المستلم مطلوب")
    if r.recipient_type in ("EXTERNAL_ORGANIZATION", "EXTERNAL_PERSON") and not (r.external_name or r.external_organization):
        raise HTTPException(status_code=400, detail="اسم الجهة/الشخص الخارجي مطلوب")


async def _sync_recipient_users(db, corr_id: str):
    ids = [r["user_id"] for r in await db.correspondence_recipients.find({"correspondence_id": corr_id, "user_id": {"$ne": None}}).to_list(500)]
    await db.correspondences.update_one({"_id": ObjectId(corr_id)}, {"$set": {"recipient_user_ids": sorted(set(ids))}})


@router.post("")
async def create_correspondence(data: CorrIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    if not ctx.can(P["create"], data.organization_id):
        raise _forbid(ctx, db, request, "create_correspondence", data.organization_id)
    if not await db.org_units.find_one({"_id": _oid(data.organization_id, "المنظمة"), "is_active": {"$ne": False}}):
        raise HTTPException(status_code=404, detail="المنظمة غير موجودة")
    dt = await db.document_types.find_one({"_id": _oid(data.document_type_id, "نوع الوثيقة"), "is_active": True})
    if not dt or (dt.get("organization_id") and dt["organization_id"] != data.organization_id):
        raise HTTPException(status_code=400, detail="نوع الوثيقة غير متاح لهذه المنظمة")
    if data.priority not in PRIORITIES or data.security_classification not in CLASSIFICATIONS:
        raise HTTPException(status_code=400, detail="الأولوية أو التصنيف الأمني غير صالح")
    if not data.subject.strip():
        raise HTTPException(status_code=400, detail="الموضوع مطلوب")
    for r in data.recipients:
        _validate_recipient(r)
    for e in data.entities:
        await _check_entity(db, ctx, e, request, data.organization_id)
    now = _now()
    doc = {
        "uuid": str(uuid.uuid4()), "organization_id": data.organization_id, "document_type_id": data.document_type_id,
        "official_number": None, "sequence_number": None, "numbering_year": None, "numbering_scheme_id": None,
        "sender_organization_id": data.sender_organization_id or data.organization_id,
        "subject": data.subject.strip(), "summary": (data.summary or "").strip(), "status": "DRAFT",
        "priority": data.priority, "security_classification": data.security_classification,
        "created_by": ctx.user_id, "current_owner_user_id": ctx.user_id, "current_owner_organization_id": data.organization_id,
        "issued_at": None, "archived_at": None, "cancelled_at": None, "deleted_at": None, "deleted_by": None,
        "recipient_user_ids": [], "version": 1, "created_at": now, "updated_at": now,
    }
    r = await db.correspondences.insert_one(doc)
    cid = str(r.inserted_id)
    if data.recipients:
        await db.correspondence_recipients.insert_many([{**x.dict(), "correspondence_id": cid, "created_at": now} for x in data.recipients])
        await _sync_recipient_users(db, cid)
    if data.entities:
        await db.correspondence_entities.insert_many([{**x.dict(), "correspondence_id": cid, "created_at": now} for x in data.entities])
    await db.correspondence_status_history.insert_one({"correspondence_id": cid, "from_status": None, "to_status": "DRAFT", "performed_by": ctx.user_id,
                                                        "organization_id": data.organization_id, "reason": "", "metadata": {}, "created_at": now})
    await audit(db, ctx, "CORRESPONDENCE_CREATED", "correspondence", cid, request, new={"subject": doc["subject"], "document_type_id": doc["document_type_id"]}, organization_id=data.organization_id)
    return await _enrich(db, await db.correspondences.find_one({"_id": r.inserted_id}))


@router.get("")
async def list_correspondence(
    organization_id: Optional[str] = None, include_children: bool = False, status: Optional[str] = None, document_type_id: Optional[str] = None,
    year: Optional[int] = None, official_number: Optional[str] = None, created_by: Optional[str] = None, recipient_user_id: Optional[str] = None,
    recipient_organization_id: Optional[str] = None, priority: Optional[str] = None, security_classification: Optional[str] = None,
    date_from: Optional[str] = None, date_to: Optional[str] = None, q: Optional[str] = None, mine: bool = False,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    vis = ctx.visibility_filter()
    if vis is None:
        return {"items": [], "total": 0, "page": page, "page_size": page_size}
    f = {"deleted_at": None}
    if organization_id:
        f["organization_id"] = {"$in": sorted(ctx.descendants(organization_id))} if include_children else organization_id
    if status:
        f["status"] = {"$in": [s for s in status.split(",") if s in STATUSES]}
    if document_type_id:
        f["document_type_id"] = document_type_id
    if year:
        f["numbering_year"] = year
    if official_number:
        f["official_number"] = {"$regex": official_number.strip(), "$options": "i"}
    if created_by:
        f["created_by"] = created_by
    if mine:
        f["created_by"] = ctx.user_id
    if recipient_user_id:
        f["recipient_user_ids"] = recipient_user_id
    if recipient_organization_id:
        ids = [r["correspondence_id"] for r in await db.correspondence_recipients.find({"organization_id": recipient_organization_id}, {"correspondence_id": 1}).to_list(5000)]
        f["_id"] = {"$in": [ObjectId(i) for i in ids]}
    if priority:
        f["priority"] = priority
    if security_classification:
        f["security_classification"] = security_classification
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        if date_to:
            rng["$lte"] = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
        f["created_at"] = rng
    if q and q.strip():
        f["$or"] = [{"subject": {"$regex": q.strip(), "$options": "i"}}, {"official_number": {"$regex": q.strip(), "$options": "i"}}, {"uuid": q.strip()}]
    query = {"$and": [f, vis]} if vis else f
    total = await db.correspondences.count_documents(query)
    rows = await db.correspondences.find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return {"items": [await _enrich(db, c) for c in rows], "total": total, "page": page, "page_size": page_size}


async def _get_readable(db, ctx: CorrContext, corr_id: str, request: Request) -> dict:
    q = {"uuid": corr_id} if not ObjectId.is_valid(corr_id) else {"_id": ObjectId(corr_id)}
    c = await db.correspondences.find_one({**q, "deleted_at": None})
    if not c:
        raise HTTPException(status_code=404, detail="المراسلة غير موجودة")
    if not ctx.can(P["read"], c["organization_id"], c):
        raise _forbid(ctx, db, request, "read_correspondence", c["organization_id"], str(c["_id"]))
    return c


@router.get("/{corr_id}")
async def get_correspondence(corr_id: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    c = await _get_readable(db, ctx, corr_id, request)
    cid = str(c["_id"])
    out = await _enrich(db, c)
    out["recipients"] = [_ser(r) for r in await db.correspondence_recipients.find({"correspondence_id": cid}).to_list(500)]
    for r in out["recipients"]:
        if r.get("organization_id") and ObjectId.is_valid(r["organization_id"]):
            o = await db.org_units.find_one({"_id": ObjectId(r["organization_id"])}, {"name": 1})
            r["organization_name"] = (o or {}).get("name", "")
        if r.get("user_id") and ObjectId.is_valid(r["user_id"]):
            u = await db.users.find_one({"_id": ObjectId(r["user_id"])}, {"full_name": 1})
            r["user_name"] = (u or {}).get("full_name", "")
    out["entities"] = [_ser(e) for e in await db.correspondence_entities.find({"correspondence_id": cid}).to_list(500)]
    out["allowed_actions"] = [a for a, (frm, _to, perm) in TRANSITIONS.items() if c["status"] == frm and ctx.can(perm, c["organization_id"], c)
                              and (a not in ("submit", "reopen") or ctx.owns(c) or ctx.can(P["update_draft"], c["organization_id"], c))]
    out["can_edit"] = c["status"] in ("DRAFT", "CHANGES_REQUESTED") and (ctx.owns(c) and ctx.can(P["update_draft"], c["organization_id"], c) or ctx.is_super)
    if (c.get("security_classification") or "") in ("CONFIDENTIAL", "HIGHLY_CONFIDENTIAL"):
        await audit(db, ctx, "SENSITIVE_READ", "correspondence", cid, request, meta={"classification": c["security_classification"]}, organization_id=c["organization_id"])
    return out


@router.patch("/{corr_id}")
async def patch_correspondence(corr_id: str, data: CorrPatch, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    c = await _get_readable(db, ctx, corr_id, request)
    if c["status"] not in ("DRAFT", "CHANGES_REQUESTED"):
        raise HTTPException(status_code=409, detail="لا يمكن تعديل المراسلة إلا في حالة المسودة أو طلب التعديلات")
    if not ctx.can(P["update_draft"], c["organization_id"], c):
        raise _forbid(ctx, db, request, "update_draft", c["organization_id"], str(c["_id"]))
    if data.version is not None and data.version != c.get("version"):
        raise HTTPException(status_code=409, detail="تم تعديل المراسلة من مستخدم آخر — أعد التحميل")
    upd = {}
    if data.subject is not None:
        if not data.subject.strip():
            raise HTTPException(status_code=400, detail="الموضوع مطلوب")
        upd["subject"] = data.subject.strip()
    if data.summary is not None:
        upd["summary"] = data.summary.strip()
    if data.priority is not None:
        if data.priority not in PRIORITIES:
            raise HTTPException(status_code=400, detail="الأولوية غير صالحة")
        upd["priority"] = data.priority
    if data.security_classification is not None:
        if data.security_classification not in CLASSIFICATIONS:
            raise HTTPException(status_code=400, detail="التصنيف غير صالح")
        upd["security_classification"] = data.security_classification
    if data.document_type_id is not None:
        dt = await db.document_types.find_one({"_id": _oid(data.document_type_id, "نوع الوثيقة"), "is_active": True})
        if not dt or (dt.get("organization_id") and dt["organization_id"] != c["organization_id"]):
            raise HTTPException(status_code=400, detail="نوع الوثيقة غير متاح")
        upd["document_type_id"] = data.document_type_id
    if data.sender_organization_id is not None:
        upd["sender_organization_id"] = data.sender_organization_id or c["organization_id"]
    if not upd:
        return await _enrich(db, c)
    upd["updated_at"] = _now()
    await db.correspondences.update_one({"_id": c["_id"], "version": c.get("version", 1)}, {"$set": upd, "$inc": {"version": 1}})
    await audit(db, ctx, "DRAFT_UPDATED", "correspondence", str(c["_id"]), request, old={k: c.get(k) for k in upd if k != "updated_at"}, new={k: v for k, v in upd.items() if k != "updated_at"}, organization_id=c["organization_id"])
    return await _enrich(db, await db.correspondences.find_one({"_id": c["_id"]}))


@router.delete("/{corr_id}")
async def soft_delete_draft(corr_id: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    c = await _get_readable(db, ctx, corr_id, request)
    if c["status"] != "DRAFT":
        raise HTTPException(status_code=409, detail="الحذف المنطقي متاح للمسودات فقط — المراسلات الصادرة تُلغى ولا تُحذف")
    if not ctx.can(P["delete_draft"], c["organization_id"], c):
        raise _forbid(ctx, db, request, "delete_draft", c["organization_id"], str(c["_id"]))
    await db.correspondences.update_one({"_id": c["_id"]}, {"$set": {"deleted_at": _now(), "deleted_by": ctx.user_id}})
    await audit(db, ctx, "DRAFT_DELETED", "correspondence", str(c["_id"]), request, organization_id=c["organization_id"])
    return {"message": "تم حذف المسودة"}


# ───────────────────────── Recipients / Entities ─────────────────────────
async def _editable(db, ctx, corr_id, request):
    c = await _get_readable(db, ctx, corr_id, request)
    if c["status"] not in ("DRAFT", "CHANGES_REQUESTED"):
        raise HTTPException(status_code=409, detail="التعديل متاح للمسودات فقط")
    if not ctx.can(P["update_draft"], c["organization_id"], c):
        raise _forbid(ctx, db, request, "update_draft", c["organization_id"], str(c["_id"]))
    return c


@router.post("/{corr_id}/recipients")
async def add_recipient(corr_id: str, data: RecipientIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    c = await _editable(db, ctx, corr_id, request)
    _validate_recipient(data)
    cid = str(c["_id"])
    r = await db.correspondence_recipients.insert_one({**data.dict(), "correspondence_id": cid, "created_at": _now()})
    await _sync_recipient_users(db, cid)
    await db.correspondences.update_one({"_id": c["_id"]}, {"$inc": {"version": 1}, "$set": {"updated_at": _now()}})
    await audit(db, ctx, "RECIPIENT_ADDED", "correspondence", cid, request, new=data.dict(), organization_id=c["organization_id"])
    return _ser(await db.correspondence_recipients.find_one({"_id": r.inserted_id}))


@router.delete("/{corr_id}/recipients/{recipient_id}")
async def remove_recipient(corr_id: str, recipient_id: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    c = await _editable(db, ctx, corr_id, request)
    cid = str(c["_id"])
    rec = await db.correspondence_recipients.find_one({"_id": _oid(recipient_id), "correspondence_id": cid})
    if not rec:
        raise HTTPException(status_code=404, detail="المستلم غير موجود")
    await db.correspondence_recipients.delete_one({"_id": rec["_id"]})
    await _sync_recipient_users(db, cid)
    await db.correspondences.update_one({"_id": c["_id"]}, {"$inc": {"version": 1}, "$set": {"updated_at": _now()}})
    await audit(db, ctx, "RECIPIENT_REMOVED", "correspondence", cid, request, old=_ser(rec), organization_id=c["organization_id"])
    return {"message": "تم حذف المستلم"}


_ENT_SOURCES = {"STUDENT": ("students", "entity.student.read"), "EMPLOYEE": ("employees", "entity.employee.read"), "TEACHER": ("teachers", "entity.faculty.read"), "FACULTY": ("teachers", "entity.faculty.read")}


async def _check_entity(db, ctx, data, request, org_id, cid=None):
    """ربط كيان جامعي: صلاحية القراءة + وجود السجل فعلاً (لا معرّفات عشوائية)"""
    if data.entity_type not in _ENT_SOURCES:
        return
    col, perm = _ENT_SOURCES[data.entity_type]
    if not ctx.has_perm_anywhere(perm):
        raise _forbid(ctx, db, request, f"link_entity:{data.entity_type}", org_id, cid)
    if not ObjectId.is_valid(data.entity_id) or not await db[col].find_one({"_id": ObjectId(data.entity_id)}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="الكيان غير موجود في بيانات الجامعة")


@router.post("/{corr_id}/entities")
async def add_entity(corr_id: str, data: EntityIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    c = await _editable(db, ctx, corr_id, request)
    cid = str(c["_id"])
    await _check_entity(db, ctx, data, request, c["organization_id"], cid)
    r = await db.correspondence_entities.insert_one({**data.dict(), "correspondence_id": cid, "created_at": _now()})
    await audit(db, ctx, "ENTITY_LINKED", "correspondence", cid, request, new=data.dict(), organization_id=c["organization_id"])
    return _ser(await db.correspondence_entities.find_one({"_id": r.inserted_id}))


@router.delete("/{corr_id}/entities/{entity_link_id}")
async def remove_entity(corr_id: str, entity_link_id: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    c = await _editable(db, ctx, corr_id, request)
    cid = str(c["_id"])
    res = await db.correspondence_entities.delete_one({"_id": _oid(entity_link_id), "correspondence_id": cid})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="الرابط غير موجود")
    await audit(db, ctx, "ENTITY_UNLINKED", "correspondence", cid, request, old={"entity_link_id": entity_link_id}, organization_id=c["organization_id"])
    return {"message": "تم فك الربط"}


# ───────────────────────── State machine ─────────────────────────
async def transition_correspondence(db, ctx: CorrContext, corr_id: str, action: str, reason: str, request: Request) -> dict:
    """transitionCorrespondence(correspondenceId, targetStatus, user, reason) — التحقق + الترقيم + التاريخ + التدقيق"""
    if action not in TRANSITIONS:
        raise HTTPException(status_code=400, detail="إجراء غير معروف")
    frm, to, perm = TRANSITIONS[action]
    c = await _get_readable(db, ctx, corr_id, request)
    cid = str(c["_id"])
    if not ctx.can(perm, c["organization_id"], c):
        raise _forbid(ctx, db, request, f"transition:{action}", c["organization_id"], cid)
    if c["status"] != frm:
        raise HTTPException(status_code=409, detail=f"انتقال غير مسموح: {c['status']} → {to}")
    if action in ("submit", "reopen") and not (ctx.owns(c) or ctx.is_super or ctx.can(P["update_draft"], c["organization_id"], c)):
        raise _forbid(ctx, db, request, f"transition:{action}", c["organization_id"], cid)
    if action in ("request-changes", "reject", "cancel") and not (reason or "").strip():
        raise HTTPException(status_code=400, detail="السبب مطلوب لهذا الإجراء")
    if action == "submit" and not await db.correspondence_recipients.find_one({"correspondence_id": cid}):
        raise HTTPException(status_code=400, detail="أضف مستلماً واحداً على الأقل قبل التقديم")
    # 📜 المرحلة 2: تحقق المحتوى قبل التقديم (إن كانت المراسلة مرتبطة بقالب)
    if action == "submit" and await db.correspondence_contents.find_one({"correspondence_id": cid}):
        from .correspondence_content import validate_before_submit
        _errs = await validate_before_submit(db, ctx, c)
        if _errs:
            await audit(db, ctx, "TEMPLATE_VALIDATION_FAILED", "correspondence", cid, request, meta={"errors": _errs}, organization_id=c["organization_id"])
            raise HTTPException(status_code=422, detail={"message": "لا يمكن التقديم — أكمل المتطلبات", "errors": _errs})
    now = _now()
    upd = {"status": to, "updated_at": now}
    meta = {}
    if to == "ISSUED":
        upd["issued_at"] = now
    elif to == "ARCHIVED":
        upd["archived_at"] = now
    elif to == "CANCELLED":
        upd["cancelled_at"] = now
        upd["cancel_reason"] = reason
    # 🔢 الترقيم الرسمي عند المرحلة المهيأة (الافتراضي ISSUED) — مرة واحدة فقط ولا يُعاد استخدامه
    if not c.get("official_number"):
        scheme = await _resolve_scheme(db, ctx, c["organization_id"], c["document_type_id"])
        trigger = (scheme or {}).get("trigger_status") or "ISSUED"
        if to == trigger or (to == "ISSUED"):
            if not scheme:
                raise HTTPException(status_code=400, detail="لا يوجد مخطط ترقيم فعّال لهذه المنظمة — أنشئ مخططاً أولاً")
            number, seq, year = await generate_official_number(db, scheme)
            upd.update({"official_number": number, "sequence_number": seq, "numbering_year": year, "numbering_scheme_id": str(scheme["_id"])})
            meta["official_number"] = number
    try:
        res = await db.correspondences.update_one({"_id": c["_id"], "status": frm}, {"$set": upd, "$inc": {"version": 1}})
    except DuplicateKeyError:
        raise HTTPException(status_code=500, detail="تعارض في الرقم الرسمي — أعد المحاولة")
    if res.matched_count == 0:
        raise HTTPException(status_code=409, detail="تغيرت حالة المراسلة أثناء المعالجة — أعد التحميل")
    await db.correspondence_status_history.insert_one({"correspondence_id": cid, "from_status": frm, "to_status": to, "performed_by": ctx.user_id,
                                                        "performed_by_name": ctx.user.get("full_name", ""), "organization_id": c["organization_id"],
                                                        "reason": reason or "", "metadata": meta, "created_at": now})
    await audit(db, ctx, f"STATUS_{to}", "correspondence", cid, request, old={"status": frm}, new={"status": to, **meta}, meta={"reason": reason or "", "action": action}, organization_id=c["organization_id"])
    if meta.get("official_number"):
        await audit(db, ctx, "NUMBER_GENERATED", "correspondence", cid, request, new=meta, organization_id=c["organization_id"])
    # 📜 المرحلة 2: لقطة البيانات المجمَّدة عند مرحلة التجميد (ISSUED افتراضياً)
    try:
        from .correspondence_content import create_snapshot_if_due
        await create_snapshot_if_due(db, ctx, await db.correspondences.find_one({"_id": c["_id"]}), to, request)
    except HTTPException:
        raise
    except Exception as _e:
        log.error(f"snapshot failed for {cid}: {_e}")
    if to == "SIGNED":
        from .correspondence_signature import capture_signature
        try:
            await capture_signature(db, ctx, await db.correspondences.find_one({"_id": c["_id"]}), request)
        except Exception as _e:
            log.error(f"signature capture failed for {cid}: {_e}")
    if to == "ISSUED":
        from .correspondence_pdf import on_issued
        await on_issued(db, ctx, await db.correspondences.find_one({"_id": c["_id"]}), request)
    return await _enrich(db, await db.correspondences.find_one({"_id": c["_id"]}))


def _make_transition_route(action: str):
    async def _route(corr_id: str, request: Request, data: TransitionIn = TransitionIn(), ctx: CorrContext = Depends(ctx_dep)):
        return await transition_correspondence(get_db(), ctx, corr_id, action, data.reason or "", request)
    _route.__name__ = f"transition_{action.replace('-', '_')}"
    return _route


for _action in TRANSITIONS:
    router.add_api_route(f"/{{corr_id}}/{_action}", _make_transition_route(_action), methods=["POST"], name=f"correspondence_{_action}")


@router.get("/{corr_id}/history")
async def history(corr_id: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    c = await _get_readable(db, ctx, corr_id, request)
    rows = await db.correspondence_status_history.find({"correspondence_id": str(c["_id"])}).sort("created_at", 1).to_list(1000)
    uids = {r["performed_by"] for r in rows if ObjectId.is_valid(r.get("performed_by", ""))}
    names = {str(u["_id"]): u.get("full_name", "") for u in await db.users.find({"_id": {"$in": [ObjectId(x) for x in uids]}}, {"full_name": 1}).to_list(500)}
    return [{**_ser(r), "performed_by_name": r.get("performed_by_name") or names.get(r.get("performed_by"), "")} for r in rows]


@router.get("/{corr_id}/audit")
async def correspondence_audit(corr_id: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    c = await _get_readable(db, ctx, corr_id, request)
    if not ctx.can(P["audit"], c["organization_id"]):
        raise _forbid(ctx, db, request, "view_audit", c["organization_id"], str(c["_id"]))
    return [_ser(a) for a in await db.audit_logs.find({"entity_type": "correspondence", "entity_id": str(c["_id"])}).sort("created_at", -1).limit(500).to_list(500)]
