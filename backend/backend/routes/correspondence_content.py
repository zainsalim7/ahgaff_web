"""📜 المرحلة 2 — الترويسات، القوالب (إصدارات/نشر/استنساخ)، سجل العناصر النائبة، منتقي الكيانات، محتوى الوثيقة، المعاينة، اللقطات"""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Request, Query, UploadFile, File
from pydantic import BaseModel
from bson import ObjectId

from .deps import get_db
from .correspondence import ctx_dep, audit, _ser, _oid, _forbid, P as P1
from services.corr_policy import CorrContext, ALL, PERMISSION_KEYS
from services import corr_placeholders as ph

router = APIRouter(prefix="/correspondence", tags=["المراسلات الرسمية - المحتوى"])

LP = {"read": "letterhead.read", "create": "letterhead.create", "update": "letterhead.update", "activate": "letterhead.activate", "default": "letterhead.set_default", "org": "letterhead.manage_organization"}
TP = {"read": "template.read", "create": "template.create", "update": "template.update_draft", "publish": "template.publish", "deactivate": "template.deactivate", "clone": "template.clone", "global": "template.manage_global", "org": "template.manage_organization", "use": "template.use"}
PHASE2_PERMS = [
    (LP["read"], "عرض الترويسات"), (LP["create"], "إنشاء ترويسة"), (LP["update"], "تعديل ترويسة"), (LP["activate"], "تفعيل/إيقاف ترويسة"), (LP["default"], "تعيين الترويسة الافتراضية"), (LP["org"], "إدارة ترويسات المنظمة"),
    (TP["read"], "عرض القوالب"), (TP["create"], "إنشاء قالب"), (TP["update"], "تعديل مسودة قالب"), (TP["publish"], "نشر إصدار قالب"), (TP["deactivate"], "إيقاف قالب"), (TP["clone"], "استنساخ قالب"), (TP["global"], "إدارة القوالب العامة"), (TP["org"], "إدارة قوالب المنظمة"), (TP["use"], "استخدام القوالب في المراسلات"),
    (ph.P_STUDENT, "اختيار الطلاب وقراءة بياناتهم الأساسية"), (ph.P_EMPLOYEE, "اختيار الموظفين وقراءة بياناتهم الأساسية"), (ph.P_FACULTY, "اختيار أعضاء هيئة التدريس"),
    (ph.P_CONTACT, "عناصر نائبة: بيانات التواصل (هاتف/بريد)"), (ph.P_ACADEMIC, "عناصر نائبة: بيانات أكاديمية موسّعة (معدل/حضور/إنذارات)"),
]
SECTION_TYPES = ("HEADER", "REFERENCE", "DATE", "RECIPIENT", "SALUTATION", "SUBJECT", "INTRODUCTION", "BODY", "STRUCTURED_DATA", "CLOSING", "SIGNATURE_BLOCK", "CC", "ATTACHMENTS", "FOOTER", "CUSTOM")
EDITABILITY = ("LOCKED", "SYSTEM", "STRUCTURED", "EDITABLE", "DEFAULT_EDITABLE")
INPUT_TYPES = ("TEXT", "TEXTAREA", "DATE", "NUMBER", "SELECT")
ASSET_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg", "image/webp": "webp"}


def _now():
    return datetime.now(timezone.utc)


def _uni_wide(ctx: CorrContext, perm: str) -> bool:
    return ctx.is_super or any(g.scope_type == "UNIVERSITY_WIDE" and perm in g.perms for g in ctx.grants)


def _ancestors(ctx: CorrContext, org_id: str) -> List[str]:
    out, cur, seen = [], org_id, set()
    while cur and cur not in seen:
        out.append(cur)
        seen.add(cur)
        cur = ctx.tree.get(cur)
    return out


# ───────────────────────── Models ─────────────────────────
class LetterheadIn(BaseModel):
    organization_id: str
    name_ar: str
    name_en: Optional[str] = ""
    code: str
    description: Optional[str] = ""
    header_config: Dict[str, Any] = {}
    footer_config: Dict[str, Any] = {}
    branding_config: Dict[str, Any] = {}
    page_config: Dict[str, Any] = {}
    is_default: bool = False
    is_active: bool = True


class LetterheadPatch(BaseModel):
    name_ar: Optional[str] = None
    name_en: Optional[str] = None
    description: Optional[str] = None
    header_config: Optional[Dict[str, Any]] = None
    footer_config: Optional[Dict[str, Any]] = None
    branding_config: Optional[Dict[str, Any]] = None
    page_config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class Section(BaseModel):
    id: str
    type: str
    order: int = 0
    title: Optional[str] = ""
    content: Optional[str] = ""
    editable: str = "EDITABLE"
    required: bool = False
    visibility_condition: Optional[Dict[str, Any]] = None
    style_config: Dict[str, Any] = {}
    config: Dict[str, Any] = {}


class InputField(BaseModel):
    key: str
    label_ar: str
    label_en: Optional[str] = ""
    type: str = "TEXT"
    required: bool = False
    max_length: Optional[int] = None
    options: List[str] = []
    default_value: Optional[str] = ""


class TemplateIn(BaseModel):
    organization_id: Optional[str] = None
    document_type_id: str
    letterhead_id: Optional[str] = None
    code: str
    name_ar: str
    name_en: Optional[str] = ""
    description: Optional[str] = ""
    template_category: Optional[str] = "GENERAL"
    freeze_stage: str = "ISSUED"
    required_entities: List[str] = []
    sections: List[Section] = []
    input_fields: List[InputField] = []
    change_note: Optional[str] = ""


class VersionIn(BaseModel):
    sections: List[Section]
    input_fields: List[InputField] = []
    required_entities: List[str] = []
    letterhead_id: Optional[str] = None
    change_note: Optional[str] = ""


class ContentPatch(BaseModel):
    section_values: Optional[Dict[str, str]] = None
    input_values: Optional[Dict[str, Any]] = None
    letterhead_id: Optional[str] = None
    content_version: int


class ApplyTemplateIn(BaseModel):
    template_id: str


# ───────────────────────── Letterheads ─────────────────────────
async def resolve_letterhead(db, ctx: CorrContext, org_id: str, document_type_id: Optional[str] = None) -> Optional[dict]:
    """ترويسة المنظمة الافتراضية → الأم → … → الجذر"""
    for oid in _ancestors(ctx, org_id):
        lh = await db.correspondence_letterheads.find_one({"organization_id": oid, "is_default": True, "is_active": True, "deleted_at": None}) or \
            await db.correspondence_letterheads.find_one({"organization_id": oid, "is_active": True, "deleted_at": None})
        if lh:
            return lh
    return None


@router.get("/letterheads")
async def list_letterheads(organization_id: Optional[str] = None, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    allowed = ctx.orgs_with(LP["read"])
    if allowed is not ALL and not allowed and not ctx.has_perm_anywhere(P1["create"]):
        raise HTTPException(status_code=403, detail="غير مصرح")
    q: dict = {"deleted_at": None}
    if organization_id:
        q["organization_id"] = {"$in": _ancestors(ctx, organization_id)}
    elif allowed is not ALL and allowed:
        q["organization_id"] = {"$in": sorted(set(sum([_ancestors(ctx, o) for o in allowed], [])))}
    rows = await db.correspondence_letterheads.find(q).sort("created_at", -1).to_list(500)
    orgs = {str(o["_id"]): o.get("name", "") for o in await db.org_units.find({}, {"name": 1}).to_list(5000)}
    return [{**_ser(r), "organization_name": orgs.get(r["organization_id"], "")} for r in rows]


@router.get("/letterheads/resolve")
async def resolve_letterhead_api(organization_id: str, ctx: CorrContext = Depends(ctx_dep)):
    lh = await resolve_letterhead(get_db(), ctx, organization_id)
    return _ser(lh) if lh else None


@router.post("/letterheads")
async def create_letterhead(data: LetterheadIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    if not ctx.can(LP["create"], data.organization_id):
        raise _forbid(ctx, db, request, "create_letterhead", data.organization_id)
    if not await db.org_units.find_one({"_id": _oid(data.organization_id, "المنظمة")}):
        raise HTTPException(status_code=404, detail="المنظمة غير موجودة")
    if await db.correspondence_letterheads.find_one({"organization_id": data.organization_id, "code": data.code.strip().upper(), "deleted_at": None}):
        raise HTTPException(status_code=409, detail="كود الترويسة مستخدم في هذه المنظمة")
    if data.is_default:
        await db.correspondence_letterheads.update_many({"organization_id": data.organization_id, "is_default": True}, {"$set": {"is_default": False}})
    doc = {**data.dict(), "code": data.code.strip().upper(), "version": 1, "created_by": ctx.user_id, "created_at": _now(), "updated_at": _now(), "deleted_at": None}
    r = await db.correspondence_letterheads.insert_one(doc)
    await audit(db, ctx, "LETTERHEAD_CREATED", "letterhead", str(r.inserted_id), request, new={"code": doc["code"], "name_ar": doc["name_ar"]}, organization_id=data.organization_id)
    return _ser({**doc, "_id": r.inserted_id})


@router.patch("/letterheads/{lh_id}")
async def update_letterhead(lh_id: str, data: LetterheadPatch, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    cur = await db.correspondence_letterheads.find_one({"_id": _oid(lh_id), "deleted_at": None})
    if not cur:
        raise HTTPException(status_code=404, detail="الترويسة غير موجودة")
    if not ctx.can(LP["update"], cur["organization_id"]):
        raise _forbid(ctx, db, request, "update_letterhead", cur["organization_id"], lh_id)
    upd = {k: v for k, v in data.dict().items() if v is not None}
    if "is_active" in upd and upd["is_active"] != cur.get("is_active") and not ctx.can(LP["activate"], cur["organization_id"]):
        raise _forbid(ctx, db, request, "activate_letterhead", cur["organization_id"], lh_id)
    upd.update({"updated_at": _now(), "version": int(cur.get("version", 1)) + 1})
    await db.correspondence_letterheads.update_one({"_id": cur["_id"]}, {"$set": upd})
    await audit(db, ctx, "LETTERHEAD_ACTIVATED" if "is_active" in upd else "LETTERHEAD_UPDATED", "letterhead", lh_id, request, old={k: cur.get(k) for k in upd}, new=upd, organization_id=cur["organization_id"])
    return _ser(await db.correspondence_letterheads.find_one({"_id": cur["_id"]}))


@router.post("/letterheads/{lh_id}/set-default")
async def set_default_letterhead(lh_id: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    cur = await db.correspondence_letterheads.find_one({"_id": _oid(lh_id), "deleted_at": None})
    if not cur:
        raise HTTPException(status_code=404, detail="الترويسة غير موجودة")
    if not ctx.can(LP["default"], cur["organization_id"]):
        raise _forbid(ctx, db, request, "set_default_letterhead", cur["organization_id"], lh_id)
    await db.correspondence_letterheads.update_many({"organization_id": cur["organization_id"], "is_default": True}, {"$set": {"is_default": False}})
    await db.correspondence_letterheads.update_one({"_id": cur["_id"]}, {"$set": {"is_default": True, "is_active": True, "updated_at": _now()}})
    await audit(db, ctx, "LETTERHEAD_DEFAULT_CHANGED", "letterhead", lh_id, request, organization_id=cur["organization_id"])
    return {"message": "تم تعيين الترويسة الافتراضية"}


@router.post("/letterheads/{lh_id}/assets/{slot}")
async def upload_letterhead_asset(lh_id: str, slot: str, request: Request, file: UploadFile = File(...), ctx: CorrContext = Depends(ctx_dep)):
    """رفع شعار/خلفية عبر تخزين Emergent الحالي (files) — PNG/JPG/SVG/WebP ≤ 2MB"""
    db = get_db()
    if slot not in ("logo_asset_id", "secondary_logo_asset_id", "header_background_asset_id", "footer_background_asset_id", "accreditation_asset_id"):
        raise HTTPException(status_code=400, detail="موضع الأصل غير صالح")
    cur = await db.correspondence_letterheads.find_one({"_id": _oid(lh_id), "deleted_at": None})
    if not cur:
        raise HTTPException(status_code=404, detail="الترويسة غير موجودة")
    if not ctx.can(LP["update"], cur["organization_id"]):
        raise _forbid(ctx, db, request, "upload_letterhead_asset", cur["organization_id"], lh_id)
    if file.content_type not in ASSET_TYPES:
        raise HTTPException(status_code=400, detail="نوع الملف غير مسموح (PNG/JPG/SVG/WebP)")
    data = await file.read()
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="حجم الملف يتجاوز 2MB")
    from services.storage_service import upload_file
    res = upload_file(data, file.filename or f"asset.{ASSET_TYPES[file.content_type]}", file.content_type, "letterheads")
    await db.files.insert_one({**res, "folder": "letterheads", "uploaded_by": ctx.user_id, "is_deleted": False, "created_at": _now()})
    url = f"/api/files/{res['storage_path']}"
    await db.correspondence_letterheads.update_one({"_id": cur["_id"]}, {"$set": {f"branding_config.{slot}": res["file_id"], f"branding_config.{slot.replace('_id', '_url')}": url, "updated_at": _now()}, "$inc": {"version": 1}})
    await audit(db, ctx, "LETTERHEAD_UPDATED", "letterhead", lh_id, request, new={slot: res["file_id"]}, organization_id=cur["organization_id"])
    return {"file_id": res["file_id"], "url": url}


# ───────────────────────── Templates ─────────────────────────
def _tpl_scope_ok(ctx: CorrContext, tpl: dict, perm: str) -> bool:
    if tpl.get("organization_id"):
        return ctx.can(perm, tpl["organization_id"])
    return _uni_wide(ctx, TP["global"]) or (perm == TP["read"] and ctx.has_perm_anywhere(perm))


async def _validate_version(db, ctx: CorrContext, data: VersionIn, tpl: dict) -> List[str]:
    errors = []
    input_keys = [f.key for f in data.input_fields]
    seen_ids = set()
    for s in data.sections:
        if s.type not in SECTION_TYPES:
            errors.append(f"نوع قسم غير معروف: {s.type}")
        if s.editable not in EDITABILITY:
            errors.append(f"نمط تحرير غير معروف: {s.editable}")
        if s.id in seen_ids:
            errors.append(f"معرّف قسم مكرر: {s.id}")
        seen_ids.add(s.id)
        if ph.is_unsafe(s.content or ""):
            errors.append(f"محتوى غير آمن في القسم {s.id}")
        for k in ph.validate_keys(ph.extract_keys(s.content or ""), input_keys):
            errors.append(f"عنصر نائب غير مسجل: {{{{{k}}}}}")
        for k in ph.extract_keys(s.content or ""):
            ns = k.split(".")[0]
            if ns in ph.ENTITY_FOR_NS and ph.ENTITY_FOR_NS[ns] not in data.required_entities and ns != "organization":
                errors.append(f"العنصر {k} يتطلب إعلان الكيان {ph.ENTITY_FOR_NS[ns]} ضمن required_entities")
        if s.visibility_condition and s.visibility_condition.get("operator") not in (None, "EQUALS", "NOT_EQUALS", "EXISTS", "NOT_EXISTS", "IN"):
            errors.append(f"معامل شرط غير مسموح في القسم {s.id}")
    for f in data.input_fields:
        if f.type not in INPUT_TYPES:
            errors.append(f"نوع مدخل غير معروف: {f.key}")
    types = {s.type for s in data.sections}
    for req in ("SUBJECT", "BODY"):
        if req not in types:
            errors.append(f"القسم الإلزامي {req} مفقود")
    if data.letterhead_id:
        lh = await db.correspondence_letterheads.find_one({"_id": ObjectId(data.letterhead_id)}) if ObjectId.is_valid(data.letterhead_id) else None
        if not lh or lh.get("deleted_at"):
            errors.append("الترويسة المرجعية غير صالحة")
    return errors


async def _tpl_view(db, t: dict, with_version=True) -> dict:
    out = _ser(t)
    if with_version:
        v = await db.correspondence_template_versions.find_one({"template_id": str(t["_id"]), "version_number": t.get("current_version")})
        pub = await db.correspondence_template_versions.find_one({"template_id": str(t["_id"]), "is_published": True}, sort=[("version_number", -1)])
        out["current"] = _ser(v) if v else None
        out["published_version"] = pub.get("version_number") if pub else None
        out["versions"] = [{"version_number": x["version_number"], "is_published": x.get("is_published", False), "created_at": str(x.get("created_at")), "change_note": x.get("change_note", "")}
                           for x in await db.correspondence_template_versions.find({"template_id": str(t["_id"])}, {"content": 0}).sort("version_number", -1).to_list(100)]
    return out


@router.get("/templates")
async def list_templates(organization_id: Optional[str] = None, document_type_id: Optional[str] = None, status: Optional[str] = None, for_use: bool = False,
                         page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200), ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    q: dict = {"deleted_at": None}
    if document_type_id:
        q["document_type_id"] = document_type_id
    if status:
        q["status"] = status
    if for_use:
        q["status"] = "PUBLISHED"
        orgs = _ancestors(ctx, organization_id) if organization_id else None
        q["$or"] = [{"is_global": True}] + ([{"organization_id": {"$in": orgs}}] if orgs else [])
    else:
        allowed = ctx.orgs_with(TP["read"])
        if allowed is ALL or _uni_wide(ctx, TP["global"]):
            if organization_id:
                q["$or"] = [{"is_global": True}, {"organization_id": {"$in": _ancestors(ctx, organization_id)}}]
        elif allowed:
            q["$or"] = [{"is_global": True}, {"organization_id": {"$in": sorted(allowed)}}]
        else:
            raise HTTPException(status_code=403, detail="غير مصرح")
    total = await db.correspondence_templates.count_documents(q)
    rows = await db.correspondence_templates.find(q).sort("name_ar", 1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return {"items": [await _tpl_view(db, t, with_version=False) for t in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/templates/{tpl_id}")
async def get_template(tpl_id: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    t = await db.correspondence_templates.find_one({"_id": _oid(tpl_id), "deleted_at": None})
    if not t:
        raise HTTPException(status_code=404, detail="القالب غير موجود")
    if not (_tpl_scope_ok(ctx, t, TP["read"]) or (t.get("is_global") and ctx.has_perm_anywhere(TP["use"]))):
        raise _forbid(ctx, db, request, "read_template", t.get("organization_id"), tpl_id)
    return await _tpl_view(db, t)


@router.post("/templates")
async def create_template(data: TemplateIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    if data.organization_id:
        if not ctx.can(TP["create"], data.organization_id):
            raise _forbid(ctx, db, request, "create_template", data.organization_id)
    elif not _uni_wide(ctx, TP["global"]):
        raise _forbid(ctx, db, request, "create_global_template")
    if data.freeze_stage not in ("APPROVED", "SIGNED", "ISSUED"):
        raise HTTPException(status_code=400, detail="مرحلة التجميد غير صالحة")
    if not await db.document_types.find_one({"_id": _oid(data.document_type_id, "نوع الوثيقة")}):
        raise HTTPException(status_code=404, detail="نوع الوثيقة غير موجود")
    code = data.code.strip().upper()
    if await db.correspondence_templates.find_one({"code": code, "organization_id": data.organization_id, "deleted_at": None}):
        raise HTTPException(status_code=409, detail="كود القالب مستخدم")
    tpl = {"organization_id": data.organization_id, "document_type_id": data.document_type_id, "letterhead_id": data.letterhead_id, "code": code, "name_ar": data.name_ar,
           "name_en": data.name_en, "description": data.description, "template_category": data.template_category, "freeze_stage": data.freeze_stage,
           "current_version": 1, "status": "DRAFT", "is_global": not data.organization_id, "is_active": True, "created_by": ctx.user_id, "created_at": _now(), "updated_at": _now(), "deleted_at": None}
    r = await db.correspondence_templates.insert_one(tpl)
    tid = str(r.inserted_id)
    v = VersionIn(sections=data.sections, input_fields=data.input_fields, required_entities=data.required_entities, letterhead_id=data.letterhead_id, change_note=data.change_note)
    await db.correspondence_template_versions.insert_one({"template_id": tid, "version_number": 1, "sections": [s.dict() for s in v.sections], "input_fields": [f.dict() for f in v.input_fields],
                                                          "required_entities": v.required_entities, "letterhead_id": v.letterhead_id, "change_note": v.change_note, "is_published": False, "created_by": ctx.user_id, "created_at": _now()})
    await audit(db, ctx, "TEMPLATE_CREATED", "template", tid, request, new={"code": code, "name_ar": data.name_ar}, organization_id=data.organization_id)
    return await _tpl_view(db, await db.correspondence_templates.find_one({"_id": r.inserted_id}))


async def _tpl_for_write(db, ctx, tpl_id, request, perm):
    t = await db.correspondence_templates.find_one({"_id": _oid(tpl_id), "deleted_at": None})
    if not t:
        raise HTTPException(status_code=404, detail="القالب غير موجود")
    if not _tpl_scope_ok(ctx, t, perm):
        raise _forbid(ctx, db, request, f"template:{perm}", t.get("organization_id"), tpl_id)
    return t


@router.put("/templates/{tpl_id}/draft")
async def update_template_draft(tpl_id: str, data: VersionIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    """تعديل الإصدار الحالي غير المنشور فقط — الإصدارات المنشورة غير قابلة للتغيير"""
    db = get_db()
    t = await _tpl_for_write(db, ctx, tpl_id, request, TP["update"])
    v = await db.correspondence_template_versions.find_one({"template_id": tpl_id, "version_number": t["current_version"]})
    if not v or v.get("is_published"):
        raise HTTPException(status_code=409, detail="الإصدار الحالي منشور — أنشئ إصداراً جديداً")
    await db.correspondence_template_versions.update_one({"_id": v["_id"]}, {"$set": {"sections": [s.dict() for s in data.sections], "input_fields": [f.dict() for f in data.input_fields],
                                                                                    "required_entities": data.required_entities, "letterhead_id": data.letterhead_id, "change_note": data.change_note, "updated_at": _now()}})
    await db.correspondence_templates.update_one({"_id": t["_id"]}, {"$set": {"updated_at": _now(), "letterhead_id": data.letterhead_id}})
    await audit(db, ctx, "TEMPLATE_UPDATED", "template", tpl_id, request, meta={"version": t["current_version"]}, organization_id=t.get("organization_id"))
    return await _tpl_view(db, await db.correspondence_templates.find_one({"_id": t["_id"]}))


@router.post("/templates/{tpl_id}/versions")
async def create_version(tpl_id: str, data: VersionIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    t = await _tpl_for_write(db, ctx, tpl_id, request, TP["update"])
    last = await db.correspondence_template_versions.find_one({"template_id": tpl_id}, sort=[("version_number", -1)])
    n = int((last or {}).get("version_number", 0)) + 1
    await db.correspondence_template_versions.insert_one({"template_id": tpl_id, "version_number": n, "sections": [s.dict() for s in data.sections], "input_fields": [f.dict() for f in data.input_fields],
                                                          "required_entities": data.required_entities, "letterhead_id": data.letterhead_id, "change_note": data.change_note, "is_published": False, "created_by": ctx.user_id, "created_at": _now()})
    await db.correspondence_templates.update_one({"_id": t["_id"]}, {"$set": {"current_version": n, "updated_at": _now()}})
    await audit(db, ctx, "TEMPLATE_VERSION_CREATED", "template", tpl_id, request, new={"version": n}, organization_id=t.get("organization_id"))
    return await _tpl_view(db, await db.correspondence_templates.find_one({"_id": t["_id"]}))


@router.post("/templates/{tpl_id}/validate")
async def validate_template(tpl_id: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    t = await _tpl_for_write(db, ctx, tpl_id, request, TP["read"])
    v = await db.correspondence_template_versions.find_one({"template_id": tpl_id, "version_number": t["current_version"]})
    errors = await _validate_version(db, ctx, VersionIn(**{k: v.get(k) or ([] if k != "letterhead_id" else None) for k in ("sections", "input_fields", "required_entities", "letterhead_id")}), t)
    return {"valid": not errors, "errors": errors}


@router.post("/templates/{tpl_id}/publish")
async def publish_template(tpl_id: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    t = await _tpl_for_write(db, ctx, tpl_id, request, TP["publish"])
    v = await db.correspondence_template_versions.find_one({"template_id": tpl_id, "version_number": t["current_version"]})
    if v.get("is_published"):
        raise HTTPException(status_code=409, detail="هذا الإصدار منشور بالفعل")
    errors = await _validate_version(db, ctx, VersionIn(sections=v.get("sections") or [], input_fields=v.get("input_fields") or [], required_entities=v.get("required_entities") or [], letterhead_id=v.get("letterhead_id")), t)
    if errors:
        await audit(db, ctx, "TEMPLATE_VALIDATION_FAILED", "template", tpl_id, request, meta={"errors": errors}, organization_id=t.get("organization_id"))
        raise HTTPException(status_code=422, detail={"message": "فشل التحقق من القالب", "errors": errors})
    await db.correspondence_template_versions.update_one({"_id": v["_id"]}, {"$set": {"is_published": True, "published_at": _now(), "published_by": ctx.user_id}})
    await db.correspondence_templates.update_one({"_id": t["_id"]}, {"$set": {"status": "PUBLISHED", "is_active": True, "updated_at": _now()}})
    await audit(db, ctx, "TEMPLATE_PUBLISHED", "template", tpl_id, request, new={"version": t["current_version"]}, organization_id=t.get("organization_id"))
    return await _tpl_view(db, await db.correspondence_templates.find_one({"_id": t["_id"]}))


@router.post("/templates/{tpl_id}/deactivate")
async def deactivate_template(tpl_id: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    t = await _tpl_for_write(db, ctx, tpl_id, request, TP["deactivate"])
    await db.correspondence_templates.update_one({"_id": t["_id"]}, {"$set": {"status": "INACTIVE", "is_active": False, "updated_at": _now()}})
    await audit(db, ctx, "TEMPLATE_DEACTIVATED", "template", tpl_id, request, organization_id=t.get("organization_id"))
    return {"message": "تم إيقاف القالب"}


@router.post("/templates/{tpl_id}/clone")
async def clone_template(tpl_id: str, request: Request, target_organization_id: Optional[str] = None, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    t = await db.correspondence_templates.find_one({"_id": _oid(tpl_id), "deleted_at": None})
    if not t or not (_tpl_scope_ok(ctx, t, TP["read"]) or t.get("is_global")):
        raise _forbid(ctx, db, request, "clone_template", (t or {}).get("organization_id"), tpl_id)
    target = target_organization_id or t.get("organization_id")
    if target and not ctx.can(TP["clone"], target):
        raise _forbid(ctx, db, request, "clone_template_target", target, tpl_id)
    if not target and not _uni_wide(ctx, TP["global"]):
        raise _forbid(ctx, db, request, "clone_global_template", None, tpl_id)
    v = await db.correspondence_template_versions.find_one({"template_id": tpl_id, "version_number": t["current_version"]})
    code = f"{t['code']}_COPY_{_now().strftime('%H%M%S')}"
    new = {**{k: t[k] for k in ("document_type_id", "letterhead_id", "name_en", "description", "template_category", "freeze_stage")}, "organization_id": target, "code": code,
           "name_ar": f"{t['name_ar']} (نسخة)", "current_version": 1, "status": "DRAFT", "is_global": not target, "is_active": True, "created_by": ctx.user_id, "created_at": _now(), "updated_at": _now(), "deleted_at": None, "cloned_from": tpl_id}
    r = await db.correspondence_templates.insert_one(new)
    await db.correspondence_template_versions.insert_one({"template_id": str(r.inserted_id), "version_number": 1, "sections": v.get("sections", []), "input_fields": v.get("input_fields", []),
                                                          "required_entities": v.get("required_entities", []), "letterhead_id": v.get("letterhead_id"), "change_note": f"مستنسخ من {t['code']} v{t['current_version']}", "is_published": False, "created_by": ctx.user_id, "created_at": _now()})
    await audit(db, ctx, "TEMPLATE_CLONED", "template", str(r.inserted_id), request, meta={"source": tpl_id}, organization_id=target)
    return await _tpl_view(db, await db.correspondence_templates.find_one({"_id": r.inserted_id}))


# ───────────────────────── Placeholders / Entities ─────────────────────────
@router.get("/placeholders")
async def placeholders(ctx: CorrContext = Depends(ctx_dep)):
    return {"items": ph.registry_list(ctx), "namespaces": ph.NAMESPACE_AR, "section_types": SECTION_TYPES, "editability": EDITABILITY, "input_types": INPUT_TYPES}


def _allowed_perms(ctx: CorrContext) -> set:
    return {p for p in (ph.P_STUDENT, ph.P_EMPLOYEE, ph.P_FACULTY, ph.P_CONTACT, ph.P_ACADEMIC) if ctx.has_perm_anywhere(p)}


@router.get("/entities/{kind}")
async def search_entities(kind: str, q: str = "", request: Request = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50), ctx: CorrContext = Depends(ctx_dep)):
    """بحث مُرقَّم ومُسقَط — لا يُرجع السجلات الكاملة"""
    db = get_db()
    qs = q.strip()
    rx = {"$regex": qs, "$options": "i"} if qs else None
    if kind == "students":
        if not ctx.has_perm_anywhere(ph.P_STUDENT):
            raise _forbid(ctx, db, request, "search_students")
        f: dict = {"is_active": {"$ne": False}}
        if rx:
            f["$or"] = [{"full_name": rx}, {"student_id": rx}]
        total = await db.students.count_documents(f)
        rows = await db.students.find(f, {"full_name": 1, "student_id": 1, "faculty_id": 1, "department_id": 1, "level": 1, "status": 1}).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
        items = []
        for s in rows:
            fac, dep, _ = await ph._names(db, s.get("faculty_id"), s.get("department_id"))
            items.append({"id": str(s["_id"]), "label": s.get("full_name", ""), "code": s.get("student_id", ""), "meta": f"{fac} · {dep} · م{s.get('level', '')}", "status": s.get("status", "")})
    elif kind == "employees":
        if not ctx.has_perm_anywhere(ph.P_EMPLOYEE):
            raise _forbid(ctx, db, request, "search_employees")
        f = {"status": {"$ne": "terminated"}}
        if rx:
            f["$or"] = [{"full_name": rx}, {"employee_no": rx}, {"job_title": rx}]
        total = await db.employees.count_documents(f)
        rows = await db.employees.find(f, {"full_name": 1, "employee_no": 1, "job_title": 1, "org_unit_id": 1}).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
        orgs = {str(o["_id"]): o.get("name", "") for o in await db.org_units.find({}, {"name": 1}).to_list(5000)}
        items = [{"id": str(e["_id"]), "label": e.get("full_name", ""), "code": e.get("employee_no", ""), "meta": f"{e.get('job_title', '')} · {orgs.get(e.get('org_unit_id', ''), '')}"} for e in rows]
    elif kind == "faculty":
        if not ctx.has_perm_anywhere(ph.P_FACULTY):
            raise _forbid(ctx, db, request, "search_faculty")
        f = {"is_active": {"$ne": False}}
        if rx:
            f["$or"] = [{"full_name": rx}, {"academic_title": rx}, {"teacher_id": rx}]
        total = await db.teachers.count_documents(f)
        rows = await db.teachers.find(f, {"full_name": 1, "academic_title": 1, "faculty_id": 1, "department_id": 1, "teacher_id": 1}).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
        items = []
        for t in rows:
            fac, dep, _ = await ph._names(db, t.get("faculty_id"), t.get("department_id"))
            items.append({"id": str(t["_id"]), "label": t.get("full_name", ""), "code": t.get("teacher_id", ""), "meta": f"{t.get('academic_title', '')} · {fac} · {dep}"})
    elif kind == "organizations":
        f = {"is_active": {"$ne": False}}
        if rx:
            f["$or"] = [{"name": rx}, {"code": rx}]
        total = await db.org_units.count_documents(f)
        rows = await db.org_units.find(f, {"name": 1, "code": 1, "type": 1}).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
        items = [{"id": str(o["_id"]), "label": (o.get("name") or "").strip(), "code": o.get("code", ""), "meta": o.get("type", "")} for o in rows]
    else:
        raise HTTPException(status_code=404, detail="نوع كيان غير معروف")
    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ───────────────────────── Content / Preview / Snapshot ─────────────────────────
async def _corr_editable(db, ctx, corr_id, request):
    from .correspondence import _get_readable
    c = await _get_readable(db, ctx, corr_id, request)
    return c


async def _load_bundle(db, ctx: CorrContext, c: dict) -> tuple:
    cid = str(c["_id"])
    content = await db.correspondence_contents.find_one({"correspondence_id": cid})
    version = await db.correspondence_template_versions.find_one({"_id": ObjectId(content["template_version_id"])}) if content and ObjectId.is_valid(content.get("template_version_id", "")) else None
    letterhead = await db.correspondence_letterheads.find_one({"_id": ObjectId(content["letterhead_id"])}) if content and content.get("letterhead_id") and ObjectId.is_valid(content["letterhead_id"]) else None
    if not letterhead:
        letterhead = await resolve_letterhead(db, ctx, c["organization_id"])
    entities = await db.correspondence_entities.find({"correspondence_id": cid}).to_list(100)
    recipients = await db.correspondence_recipients.find({"correspondence_id": cid}).to_list(100)
    for r in recipients:
        if r.get("organization_id") and ObjectId.is_valid(r["organization_id"]):
            o = await db.org_units.find_one({"_id": ObjectId(r["organization_id"])}, {"name": 1})
            r["organization_name"] = (o or {}).get("name", "")
        if r.get("user_id") and ObjectId.is_valid(r["user_id"]):
            u = await db.users.find_one({"_id": ObjectId(r["user_id"])}, {"full_name": 1})
            r["user_name"] = (u or {}).get("full_name", "")
    return content, version, letterhead, entities, recipients


def _render_sections(version: dict, content: dict, data: dict, allowed: set, mode: str) -> tuple:
    out, unresolved, missing_required = [], [], []
    values = (content or {}).get("section_values") or {}
    for s in sorted(version.get("sections", []), key=lambda x: x.get("order", 0)):
        if not ph.eval_condition(s.get("visibility_condition"), data):
            continue
        raw = values.get(s["id"]) if s.get("editable") in ("EDITABLE", "DEFAULT_EDITABLE", "STRUCTURED") and s["id"] in values else (s.get("content") or "")
        if s.get("required") and not ph.plain_text(raw).strip():
            missing_required.append(s["id"])
        text, un = ph.render_text(ph.sanitize_html(raw), data, allowed, mode)
        unresolved += un
        out.append({"id": s["id"], "type": s["type"], "title": s.get("title", ""), "editable": s.get("editable"), "required": s.get("required", False), "html": text, "style_config": s.get("style_config", {}), "config": s.get("config", {})})
    return out, sorted(set(unresolved)), missing_required


@router.post("/{corr_id}/apply-template")
async def apply_template(corr_id: str, data: ApplyTemplateIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    """ربط مسودة بقالب منشور (يُثبّت template_version_id والترويسة) — لا يعدّل القالب"""
    db = get_db()
    c = await _corr_editable(db, ctx, corr_id, request)
    if c["status"] not in ("DRAFT", "CHANGES_REQUESTED"):
        raise HTTPException(status_code=409, detail="لا يمكن تغيير القالب بعد التقديم")
    if not ctx.can(P1["update_draft"], c["organization_id"], c) or not ctx.has_perm_anywhere(TP["use"]):
        raise _forbid(ctx, db, request, "apply_template", c["organization_id"], str(c["_id"]))
    t = await db.correspondence_templates.find_one({"_id": _oid(data.template_id, "القالب"), "deleted_at": None, "status": "PUBLISHED"})
    if not t or not (t.get("is_global") or t.get("organization_id") in _ancestors(ctx, c["organization_id"])):
        raise HTTPException(status_code=400, detail="القالب غير متاح لهذه المنظمة أو غير منشور")
    if t.get("document_type_id") != c.get("document_type_id"):
        await db.correspondences.update_one({"_id": c["_id"]}, {"$set": {"document_type_id": t["document_type_id"]}})
    v = await db.correspondence_template_versions.find_one({"template_id": str(t["_id"]), "is_published": True}, sort=[("version_number", -1)])
    lh = await db.correspondence_letterheads.find_one({"_id": ObjectId(v["letterhead_id"])}) if v.get("letterhead_id") and ObjectId.is_valid(v["letterhead_id"]) else await resolve_letterhead(db, ctx, c["organization_id"])
    cid = str(c["_id"])
    prev = await db.correspondence_contents.find_one({"correspondence_id": cid})
    doc = {"correspondence_id": cid, "template_id": str(t["_id"]), "template_version_id": str(v["_id"]), "template_version_number": v["version_number"], "letterhead_id": str(lh["_id"]) if lh else None,
           "letterhead_version": (lh or {}).get("version"), "section_values": {}, "input_values": {}, "content_version": int((prev or {}).get("content_version", 0)) + 1,
           "last_modified_by": ctx.user_id, "last_modified_at": _now(), "created_at": (prev or {}).get("created_at") or _now(), "updated_at": _now()}
    await db.correspondence_contents.replace_one({"correspondence_id": cid}, doc, upsert=True)
    await db.correspondences.update_one({"_id": c["_id"]}, {"$set": {"template_id": str(t["_id"]), "template_version_id": str(v["_id"]), "letterhead_id": doc["letterhead_id"], "updated_at": _now()}, "$inc": {"version": 1}})
    await audit(db, ctx, "CORRESPONDENCE_TEMPLATE_SELECTED", "correspondence", cid, request, new={"template_id": str(t["_id"]), "version": v["version_number"]}, organization_id=c["organization_id"])
    return await get_content(corr_id, request, ctx)


@router.get("/{corr_id}/content")
async def get_content(corr_id: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    c = await _corr_editable(db, ctx, corr_id, request)
    content, version, letterhead, entities, recipients = await _load_bundle(db, ctx, c)
    snap = await db.correspondence_data_snapshots.find_one({"correspondence_id": str(c["_id"])}, sort=[("created_at", -1)])
    from .correspondence import _enrich, TRANSITIONS
    cv = await _enrich(db, c)
    cv["allowed_actions"] = [a for a, (frm, _to, perm) in TRANSITIONS.items() if c["status"] == frm and ctx.can(perm, c["organization_id"], c) and (a not in ("submit", "reopen") or ctx.owns(c) or ctx.can(P1["update_draft"], c["organization_id"], c))]
    cv["can_edit"] = c["status"] in ("DRAFT", "CHANGES_REQUESTED") and (ctx.owns(c) and ctx.can(P1["update_draft"], c["organization_id"], c) or ctx.is_super)
    return {"correspondence": cv, "content": _ser(content) if content else None, "template_version": _ser(version) if version else None,
            "letterhead": _ser(letterhead) if letterhead else None, "entities": [_ser(e) for e in entities], "recipients": [_ser(r) for r in recipients],
            "snapshot": {"id": str(snap["_id"]), "stage": snap["snapshot_stage"], "created_at": str(snap["created_at"]), "checksum": snap["checksum"]} if snap else None,
            "frozen": bool(snap)}


@router.patch("/{corr_id}/content")
async def patch_content(corr_id: str, data: ContentPatch, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    c = await _corr_editable(db, ctx, corr_id, request)
    if c["status"] not in ("DRAFT", "CHANGES_REQUESTED"):
        raise HTTPException(status_code=409, detail="المحتوى قابل للتعديل في حالة المسودة فقط")
    if not ctx.can(P1["update_draft"], c["organization_id"], c):
        raise _forbid(ctx, db, request, "update_content", c["organization_id"], str(c["_id"]))
    cid = str(c["_id"])
    content = await db.correspondence_contents.find_one({"correspondence_id": cid})
    if not content:
        raise HTTPException(status_code=400, detail="اختر قالباً أولاً")
    if int(content.get("content_version", 1)) != data.content_version:
        raise HTTPException(status_code=409, detail=f"تعارض إصدار المحتوى: الإصدار الحالي {content.get('content_version')} — أعد التحميل")
    version = await db.correspondence_template_versions.find_one({"_id": ObjectId(content["template_version_id"])})
    secs = {s["id"]: s for s in version.get("sections", [])}
    upd: dict = {}
    if data.section_values is not None:
        clean = dict(content.get("section_values") or {})
        for sid, html in data.section_values.items():
            s = secs.get(sid)
            if not s:
                raise HTTPException(status_code=400, detail=f"قسم غير معروف: {sid}")
            if s.get("editable") not in ("EDITABLE", "DEFAULT_EDITABLE", "STRUCTURED"):
                raise HTTPException(status_code=403, detail=f"القسم '{s.get('title') or sid}' مقفل ولا يمكن تعديله")
            if ph.is_unsafe(html):
                raise HTTPException(status_code=400, detail="محتوى غير آمن مرفوض")
            keys = ph.extract_keys(html)
            bad = ph.validate_keys(keys, [f["key"] for f in version.get("input_fields", [])])
            if bad:
                raise HTTPException(status_code=400, detail=f"عناصر نائبة غير مسجلة: {', '.join(bad)}")
            clean[sid] = ph.sanitize_html(html)
        upd["section_values"] = clean
    if data.input_values is not None:
        allowed_inputs = {f["key"]: f for f in version.get("input_fields", [])}
        vals = {}
        for k, v in data.input_values.items():
            f = allowed_inputs.get(k)
            if not f:
                raise HTTPException(status_code=400, detail=f"مدخل غير معرّف في القالب: {k}")
            sv = "" if v is None else str(v)
            if f.get("max_length") and len(sv) > int(f["max_length"]):
                raise HTTPException(status_code=400, detail=f"المدخل {f.get('label_ar') or k} يتجاوز الطول المسموح")
            if f.get("type") == "SELECT" and sv and sv not in (f.get("options") or []):
                raise HTTPException(status_code=400, detail=f"قيمة غير مسموحة للمدخل {f.get('label_ar') or k}")
            if f.get("type") == "NUMBER" and sv:
                try:
                    float(sv)
                except ValueError:
                    raise HTTPException(status_code=400, detail=f"المدخل {f.get('label_ar') or k} يجب أن يكون رقماً")
            vals[k] = ph.sanitize_html(sv) if f.get("type") == "TEXTAREA" else bleach_text(sv)
        upd["input_values"] = vals
    if data.letterhead_id is not None:
        lh = await db.correspondence_letterheads.find_one({"_id": _oid(data.letterhead_id, "الترويسة"), "deleted_at": None, "is_active": True})
        if not lh or lh["organization_id"] not in _ancestors(ctx, c["organization_id"]):
            raise HTTPException(status_code=400, detail="الترويسة غير متاحة لهذه المنظمة")
        upd["letterhead_id"] = data.letterhead_id
        upd["letterhead_version"] = lh.get("version")
    upd.update({"content_version": data.content_version + 1, "last_modified_by": ctx.user_id, "last_modified_at": _now(), "updated_at": _now()})
    res = await db.correspondence_contents.update_one({"_id": content["_id"], "content_version": data.content_version}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=409, detail="تعارض إصدار المحتوى — أعد التحميل")
    await db.correspondences.update_one({"_id": c["_id"]}, {"$set": {"updated_at": _now()}, "$inc": {"version": 1}})
    await audit(db, ctx, "CORRESPONDENCE_CONTENT_UPDATED", "correspondence", cid, request, meta={"content_version": upd["content_version"], "sections": list((data.section_values or {}).keys())}, organization_id=c["organization_id"])
    return _ser(await db.correspondence_contents.find_one({"_id": content["_id"]}))


def bleach_text(s: str) -> str:
    import bleach
    return bleach.clean(s or "", tags=[], strip=True)


@router.post("/{corr_id}/preview")
async def preview(corr_id: str, request: Request, mode: str = "preview", ctx: CorrContext = Depends(ctx_dep)):
    """المعاينة الخادمية: بعد التجميد من اللقطة؛ قبله من البيانات الحيّة المصرّح بها. لا تستهلك رقماً ولا تعدّل القالب."""
    db = get_db()
    c = await _corr_editable(db, ctx, corr_id, request)
    content, version, letterhead, entities, recipients = await _load_bundle(db, ctx, c)
    if not content or not version:
        raise HTTPException(status_code=400, detail="لا يوجد قالب مرتبط بهذه المراسلة")
    allowed = _allowed_perms(ctx)
    snap = await db.correspondence_data_snapshots.find_one({"correspondence_id": str(c["_id"])}, sort=[("created_at", -1)])
    if snap:
        data = snap["resolved_data"]
        data.setdefault("correspondence", {})["official_number"] = c.get("official_number") or data.get("correspondence", {}).get("official_number", "")
        source = "SNAPSHOT"
        allowed = set(allowed) | {ph.P_STUDENT, ph.P_EMPLOYEE, ph.P_FACULTY, ph.P_CONTACT, ph.P_ACADEMIC}
    else:
        data = await ph.build_data(db, ctx, c, entities, recipients, content.get("input_values") or {}, allowed)
        source = "LIVE"
        if any(e.get("entity_type") in ("STUDENT", "EMPLOYEE", "FACULTY", "TEACHER") for e in entities):
            await audit(db, ctx, "PLACEHOLDER_RESOLVED", "correspondence", str(c["_id"]), request, meta={"entities": [e.get("entity_type") for e in entities]}, organization_id=c["organization_id"])
    sections, unresolved, missing_required = _render_sections(version, content, data, allowed, mode if mode in ("edit", "preview") else "preview")
    required_entities = version.get("required_entities") or []
    have = {("FACULTY" if e.get("entity_type") == "TEACHER" else e.get("entity_type")) for e in entities}
    missing_entities = [e for e in required_entities if e not in have]
    missing_inputs = [f["key"] for f in version.get("input_fields", []) if f.get("required") and not str((content.get("input_values") or {}).get(f["key"], "")).strip()]
    return {"source": source, "sections": sections, "letterhead": _ser(letterhead) if letterhead else None, "unresolved": unresolved, "missing_entities": missing_entities,
            "missing_inputs": missing_inputs, "missing_required_sections": missing_required, "data_preview": {k: v for k, v in data.items() if k != "input"} if mode == "preview" else {},
            "content_version": content.get("content_version"), "frozen": bool(snap)}


# ───────────────────────── Hooks (تُستدعى من آلة الحالات في المرحلة 1) ─────────────────────────
async def validate_before_submit(db, ctx: CorrContext, c: dict) -> List[str]:
    """تحقق إلزامي قبل DRAFT→SUBMITTED — يعيد قائمة أخطاء حقلية"""
    errors: List[str] = []
    content, version, letterhead, entities, recipients = await _load_bundle(db, ctx, c)
    if not content or not version:
        return ["اختر قالباً للمراسلة قبل التقديم"]
    if not letterhead:
        errors.append("لا توجد ترويسة متاحة لهذه المنظمة")
    if not (c.get("subject") or "").strip():
        errors.append("الموضوع مطلوب")
    if not recipients:
        errors.append("أضف مستلماً واحداً على الأقل")
    have = {("FACULTY" if e.get("entity_type") == "TEACHER" else e.get("entity_type")) for e in entities}
    for e in version.get("required_entities") or []:
        if e not in have:
            errors.append(f"الكيان المطلوب غير محدد: {e}")
    for f in version.get("input_fields", []):
        if f.get("required") and not str((content.get("input_values") or {}).get(f["key"], "")).strip():
            errors.append(f"المدخل المطلوب فارغ: {f.get('label_ar') or f['key']}")
    allowed = _allowed_perms(ctx)
    data = await ph.build_data(db, ctx, c, entities, recipients, content.get("input_values") or {}, allowed)
    _, unresolved, missing_required = _render_sections(version, content, data, allowed, "preview")
    titles = {s["id"]: s.get("title") or s["id"] for s in version.get("sections", [])}
    for sid in missing_required:
        errors.append(f"قسم إلزامي فارغ: {titles.get(sid, sid)}")
    for k in unresolved:
        if k != "correspondence.official_number":
            errors.append(f"عنصر نائب غير محلول: {k}")
    for sid, html in (content.get("section_values") or {}).items():
        if ph.is_unsafe(html):
            errors.append(f"محتوى غير آمن في القسم {sid}")
    return errors


async def create_snapshot_if_due(db, ctx: CorrContext, c: dict, to_status: str, request: Request) -> Optional[str]:
    """ينشئ لقطة مجمَّدة عند بلوغ freeze_stage (ISSUED افتراضياً) — مرة واحدة، لا تُعاد ولا تُعدَّل"""
    content, version, letterhead, entities, recipients = await _load_bundle(db, ctx, c)
    if not content or not version:
        return None
    tpl = await db.correspondence_templates.find_one({"_id": ObjectId(content["template_id"])}) if ObjectId.is_valid(content.get("template_id", "")) else None
    stage = (tpl or {}).get("freeze_stage") or "ISSUED"
    if to_status != stage:
        return None
    cid = str(c["_id"])
    if await db.correspondence_data_snapshots.find_one({"correspondence_id": cid, "snapshot_stage": stage}):
        return None
    full = set((ph.P_STUDENT, ph.P_EMPLOYEE, ph.P_FACULTY, ph.P_CONTACT, ph.P_ACADEMIC))
    data = await ph.build_data(db, ctx, c, entities, recipients, content.get("input_values") or {}, full)
    used: List[str] = []
    values = content.get("section_values") or {}
    for s in version.get("sections", []):
        used += ph.extract_keys(values.get(s["id"]) or s.get("content") or "")
        if s.get("visibility_condition", {}) and s["visibility_condition"].get("field"):
            used.append(s["visibility_condition"]["field"])
    resolved = ph.minimize(data, sorted(set(used)))
    resolved["correspondence"] = {**resolved.get("correspondence", {}), **data["correspondence"], "official_number": c.get("official_number") or ""}
    resolved["organization"] = {**resolved.get("organization", {}), "id": data["organization"].get("id"), "name_ar": data["organization"].get("name_ar"), "code": data["organization"].get("code")}
    resolved["input"] = data.get("input", {})
    doc = {"correspondence_id": cid, "template_id": content["template_id"], "template_version_id": content["template_version_id"], "letterhead_id": content.get("letterhead_id"),
           "snapshot_stage": stage, "resolved_data": resolved, "section_values": values, "entity_references": [{"entity_type": e.get("entity_type"), "entity_id": e.get("entity_id"), "relationship_type": e.get("relationship_type")} for e in entities],
           "generated_by": ctx.user_id, "created_at": _now()}
    doc["checksum"] = ph.checksum({k: doc[k] for k in ("resolved_data", "section_values", "template_version_id", "letterhead_id")})
    r = await db.correspondence_data_snapshots.insert_one(doc)
    await audit(db, ctx, "SNAPSHOT_CREATED", "correspondence", cid, request, new={"snapshot_id": str(r.inserted_id), "stage": stage, "checksum": doc["checksum"]}, organization_id=c["organization_id"])
    return str(r.inserted_id)


# ───────────────────────── Startup: indexes + seeds ─────────────────────────
def _sec(i, typ, title, content, editable, required=False, cfg=None):
    return {"id": f"s{i}", "type": typ, "order": i, "title": title, "content": content, "editable": editable, "required": required, "visibility_condition": None, "style_config": {}, "config": cfg or {}}


def _std(body_title, body_html, extra_required=(), opening="السلام عليكم ورحمة الله وبركاته،"):
    return [
        _sec(1, "REFERENCE", "الرقم والتاريخ", "<p>الرقم: {{correspondence.official_number}}<br/>التاريخ: {{correspondence.date}} الموافق {{correspondence.date_hijri}}</p>", "SYSTEM"),
        _sec(2, "RECIPIENT", "المستلم", "<p>إلى: {{recipient.title}} {{recipient.name}}<br/>{{recipient.organization}}</p>", "STRUCTURED"),
        _sec(3, "SALUTATION", "التحية", f"<p>{opening}</p>", "DEFAULT_EDITABLE"),
        _sec(4, "SUBJECT", "الموضوع", "<p><strong>الموضوع: {{correspondence.subject}}</strong></p>", "SYSTEM", True),
        _sec(5, "BODY", body_title, body_html, "DEFAULT_EDITABLE", True),
        _sec(6, "CLOSING", "الخاتمة", "<p>وتفضلوا بقبول فائق الاحترام والتقدير،</p>", "DEFAULT_EDITABLE"),
        _sec(7, "SIGNATURE_BLOCK", "التوقيع", "<p>{{organization.name_ar}}</p>", "SYSTEM", cfg={"signer_source": "WORKFLOW_SIGNER", "show_name": True, "show_title": True, "signature_asset": None, "seal_asset": None}),
        _sec(8, "CC", "نسخة إلى", "<p></p>", "EDITABLE"),
    ]


SEED_TEMPLATES = [
    ("STUDENT_ENROLLMENT_CERTIFICATE", "شهادة قيد طالب", "STUDENT_CERTIFICATE", ["STUDENT"], "نص الإفادة",
     "<p>نفيدكم بأن الطالب {{student.full_name}}، صاحب الرقم الجامعي {{student.student_id}}، مقيد في {{student.program_name}} بكلية {{student.college_name}} — {{student.level_name}}، وذلك للعام الجامعي الحالي.</p><p>وقد أُعطيت له هذه الإفادة بناءً على طلبه لتقديمها إلى {{input.destination}}.</p>",
     [{"key": "destination", "label_ar": "الجهة الموجه إليها", "label_en": "Destination", "type": "TEXT", "required": True, "max_length": 200, "options": [], "default_value": ""}]),
    ("STUDENT_STATUS_LETTER", "إفادة حالة طالب", "STUDENT_CERTIFICATE", ["STUDENT"], "نص الإفادة",
     "<p>نفيدكم بأن الطالب {{student.full_name}} ({{student.student_id}}) حالته الأكاديمية: {{student.status}}، قسم {{student.department_name}}، {{student.level_name}}.</p><p>{{input.notes}}</p>",
     [{"key": "notes", "label_ar": "ملاحظات", "label_en": "Notes", "type": "TEXTAREA", "required": False, "max_length": 1000, "options": [], "default_value": ""}]),
    ("FACULTY_ASSIGNMENT", "تكليف عضو هيئة تدريس", "FACULTY_LETTER", ["FACULTY"], "نص التكليف",
     "<p>يُكلَّف {{faculty.academic_title}} {{faculty.full_name}} — قسم {{faculty.department_name}} بكلية {{faculty.college_name}} — بـ {{input.assignment}} اعتباراً من {{input.start_date}}.</p>",
     [{"key": "assignment", "label_ar": "موضوع التكليف", "label_en": "Assignment", "type": "TEXTAREA", "required": True, "max_length": 1000, "options": [], "default_value": ""},
      {"key": "start_date", "label_ar": "تاريخ البدء", "label_en": "Start date", "type": "DATE", "required": True, "max_length": None, "options": [], "default_value": ""}]),
    ("EMPLOYEE_CERTIFICATE", "شهادة موظف", "EMPLOYEE_LETTER", ["EMPLOYEE"], "نص الشهادة",
     "<p>تشهد {{organization.name_ar}} بأن {{employee.full_name}}، الرقم الوظيفي {{employee.employee_number}}، يعمل لديها بوظيفة {{employee.job_title}} في {{employee.organization_name}} منذ {{employee.hire_date}}.</p><p>وقد أُعطيت له هذه الشهادة لتقديمها إلى {{input.destination}}.</p>",
     [{"key": "destination", "label_ar": "الجهة الموجه إليها", "label_en": "Destination", "type": "TEXT", "required": True, "max_length": 200, "options": [], "default_value": ""}]),
    ("OFFICIAL_EXTERNAL_LETTER", "خطاب خارجي رسمي", "OFFICIAL_LETTER", [], "نص الخطاب", "<p></p>", []),
    ("INTERNAL_MEMO", "مذكرة داخلية", "INTERNAL_MEMO", [], "نص المذكرة", "<p></p>", []),
    ("ADMINISTRATIVE_DECISION", "قرار إداري", "ADMINISTRATIVE_DECISION", [], "نص القرار", "<p><strong>قرر ما يلي:</strong></p><ol><li></li></ol>", []),
    ("STUDENT_WARNING", "إنذار طالب", "OFFICIAL_LETTER", ["STUDENT"], "نص الإنذار",
     "<p>إلى الطالب {{student.full_name}} ({{student.student_id}}) — {{student.department_name}}:</p><p>نظراً لـ {{input.reason}}، يُوجَّه إليكم هذا الإنذار، وعليكم مراجعة {{organization.name_ar}} خلال {{input.deadline_days}} أيام.</p>",
     [{"key": "reason", "label_ar": "سبب الإنذار", "label_en": "Reason", "type": "TEXTAREA", "required": True, "max_length": 500, "options": [], "default_value": ""},
      {"key": "deadline_days", "label_ar": "مهلة المراجعة (أيام)", "label_en": "Deadline days", "type": "NUMBER", "required": True, "max_length": None, "options": [], "default_value": "7"}]),
    ("ACADEMIC_CERTIFICATE", "شهادة أكاديمية", "STUDENT_CERTIFICATE", ["STUDENT"], "نص الشهادة",
     "<p>تشهد {{system.university_name_ar}} بأن الطالب {{student.full_name}}، الرقم الجامعي {{student.student_id}}، قد أتمّ متطلبات {{student.program_name}} بكلية {{student.college_name}} بتاريخ {{student.graduation_date}}.</p>", []),
    ("GENERAL_CORRESPONDENCE", "مراسلة عامة", "OFFICIAL_LETTER", [], "نص المراسلة", "<p></p>", []),
]


async def correspondence_content_startup(db):
    try:
        await db.correspondence_letterheads.create_index([("organization_id", 1), ("code", 1)])
        await db.correspondence_letterheads.create_index([("organization_id", 1), ("is_default", 1), ("is_active", 1)])
        await db.correspondence_templates.create_index([("code", 1), ("organization_id", 1)])
        await db.correspondence_templates.create_index([("status", 1), ("is_global", 1), ("organization_id", 1)])
        await db.correspondence_template_versions.create_index([("template_id", 1), ("version_number", 1)], unique=True)
        await db.correspondence_contents.create_index("correspondence_id", unique=True)
        await db.correspondence_data_snapshots.create_index([("correspondence_id", 1), ("snapshot_stage", 1)], unique=True)
        root = await db.org_units.find_one({"parent_id": None, "is_active": {"$ne": False}}, sort=[("order", 1)])
        if root and not await db.correspondence_letterheads.find_one({"code": "UNIVERSITY_GENERAL"}):
            uni = await db.university.find_one({}) or {}
            await db.correspondence_letterheads.insert_one({
                "organization_id": str(root["_id"]), "name_ar": "الترويسة الجامعية العامة", "name_en": "University General Letterhead", "code": "UNIVERSITY_GENERAL", "description": "ترويسة افتراضية موروثة لكل الجهات",
                "header_config": {"show_logo": True, "university_name_ar": uni.get("name_ar") or uni.get("name") or "", "university_name_en": uni.get("name_en", ""), "show_organization_name": True, "header_text": "", "height_mm": 35, "align": "center"},
                "footer_config": {"footer_text": "", "address": uni.get("address", ""), "phone": uni.get("phone", ""), "email": uni.get("email", ""), "website": uni.get("website", ""), "height_mm": 20},
                "branding_config": {"logo_asset_id": None, "logo_asset_url": uni.get("logo_url") or "", "secondary_logo_asset_id": None, "primary_color": "#0f2440"},
                "page_config": {"size": "A4", "orientation": "portrait", "margins_mm": {"top": 15, "right": 20, "bottom": 15, "left": 20}, "direction": "rtl", "font_size_pt": 12, "line_height": 1.7},
                "is_default": True, "is_active": True, "version": 1, "created_by": "system", "created_at": _now(), "updated_at": _now(), "deleted_at": None})
        dts = {d["code"]: str(d["_id"]) for d in await db.document_types.find({"is_global": True}).to_list(100)}
        for code, name, dt_code, req, body_title, body, inputs in SEED_TEMPLATES:
            if await db.correspondence_templates.find_one({"code": code, "organization_id": None}):
                continue
            r = await db.correspondence_templates.insert_one({"organization_id": None, "document_type_id": dts.get(dt_code), "letterhead_id": None, "code": code, "name_ar": name, "name_en": code.replace("_", " ").title(),
                                                              "description": "قالب عام مبذور", "template_category": "GENERAL" if not req else req[0], "freeze_stage": "ISSUED", "current_version": 1, "status": "PUBLISHED",
                                                              "is_global": True, "is_active": True, "created_by": "system", "created_at": _now(), "updated_at": _now(), "deleted_at": None})
            await db.correspondence_template_versions.insert_one({"template_id": str(r.inserted_id), "version_number": 1, "sections": _std(body_title, body), "input_fields": inputs, "required_entities": req,
                                                                  "letterhead_id": None, "change_note": "الإصدار الأول (بذرة)", "is_published": True, "published_at": _now(), "created_by": "system", "created_at": _now()})
    except Exception as e:
        import logging
        logging.getLogger("correspondence").error(f"content startup failed: {e}")
