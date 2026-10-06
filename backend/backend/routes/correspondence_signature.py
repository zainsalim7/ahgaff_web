"""المرحلة 3-ج/د — التوقيع المرئي والختم + الاقتراحات الذكية (قواعد محلية بلا LLM)
- توقيع لكل مستخدم (PNG/WebP شفاف ≤1MB) على Object Storage؛ يُلتقط في المراسلة عند SIGN مع بصمة الملف.
- الختم: أصل `seal_asset_id` في الترويسة (يُطبع مع التوقيع عند SIGNED/ISSUED).
- الاقتراحات: ترتيب القوالب حسب نوع الوثيقة/الكيانات المرتبطة/استخدام الجهة والمستخدم الأخير.
"""
import hashlib
import html as _html
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from services import corr_placeholders as ph
from services.corr_policy import CorrContext
from .deps import get_db
from .correspondence import ctx_dep, audit, _ser, P as P1

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/correspondence", tags=["المراسلات — التوقيع والاقتراحات"])
SIG_TYPES = {"image/png": "png", "image/webp": "webp"}


async def signature_startup(db):
    await db.correspondence_signatures.create_index("user_id", unique=True)


# ───────────── التوقيع الشخصي ─────────────
def _need_sign(ctx: CorrContext):
    if not ctx.has_perm_anywhere(P1["sign"]):
        raise HTTPException(status_code=403, detail="التوقيع متاح لمن يملك صلاحية توقيع المراسلات فقط")


@router.get("/signatures/me")
async def my_signature(ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    doc = await db.correspondence_signatures.find_one({"user_id": ctx.user_id})
    return {"signature": _ser(doc) if doc else None, "can_sign": ctx.has_perm_anywhere(P1["sign"])}


@router.post("/signatures/me")
async def upload_signature(request: Request, file: UploadFile = File(...), ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    _need_sign(ctx)
    if file.content_type not in SIG_TYPES:
        raise HTTPException(status_code=400, detail="صيغة التوقيع يجب أن تكون PNG أو WebP بخلفية شفافة")
    data = await file.read()
    if len(data) > 1 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="حجم التوقيع يتجاوز 1MB")
    from services.storage_service import upload_file
    res = upload_file(data, f"signature.{SIG_TYPES[file.content_type]}", file.content_type, "correspondence/signatures")
    url = f"/api/files/{res['storage_path']}"
    doc = {"user_id": ctx.user_id, "full_name": ctx.user.get("full_name", ""), "url": url, "storage_path": res["storage_path"], "sha256": hashlib.sha256(data).hexdigest(),
           "content_type": file.content_type, "size": len(data), "updated_at": datetime.now(timezone.utc)}
    await db.correspondence_signatures.update_one({"user_id": ctx.user_id}, {"$set": doc, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}}, upsert=True)
    await audit(db, ctx, "SIGNATURE_ASSET_UPDATED", "user", ctx.user_id, request, meta={"sha256": doc["sha256"], "size": len(data)})
    return _ser(await db.correspondence_signatures.find_one({"user_id": ctx.user_id}))


@router.delete("/signatures/me")
async def delete_signature(request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    r = await db.correspondence_signatures.delete_one({"user_id": ctx.user_id})
    if r.deleted_count:
        await audit(db, ctx, "SIGNATURE_ASSET_DELETED", "user", ctx.user_id, request)
    return {"ok": True}


async def capture_signature(db, ctx: CorrContext, c: dict, request: Request):
    """يُستدعى عند الانتقال إلى SIGNED: يلتقط بيانات الموقّع وصورة توقيعه (إن وُجدت) داخل المراسلة — غير قابل للتغيير لاحقاً."""
    if c.get("signature"):
        return
    sig = await db.correspondence_signatures.find_one({"user_id": ctx.user_id})
    mem = await db.org_memberships.find_one({"user_id": ctx.user_id, "organization_id": c["organization_id"], "is_active": True}) or await db.org_memberships.find_one({"user_id": ctx.user_id, "is_active": True, "is_primary": True}) or {}
    now = datetime.now(timezone.utc)
    block = {"user_id": ctx.user_id, "name": ctx.user.get("full_name") or ctx.user.get("username", ""), "job_title": mem.get("job_title") or "", "signed_at": now,
             "asset_url": sig["url"] if sig else None, "asset_sha256": sig["sha256"] if sig else None, "method": "VISIBLE_IMAGE" if sig else "NAME_ONLY"}
    block["hash"] = hashlib.sha256(f"{str(c['_id'])}|{block['user_id']}|{now.isoformat()}|{block['asset_sha256'] or ''}".encode()).hexdigest()
    await db.correspondences.update_one({"_id": c["_id"], "signature": {"$exists": False}}, {"$set": {"signature": block}})
    await audit(db, ctx, "CORRESPONDENCE_SIGNATURE_CAPTURED", "correspondence", str(c["_id"]), request, meta={"method": block["method"], "hash": block["hash"]}, organization_id=c["organization_id"])


def signature_html(c: dict, letterhead: dict | None) -> str:
    """كتلة التوقيع المرئي + الختم — تُلحق بقسم SIGNATURE_BLOCK عند SIGNED/ISSUED/ARCHIVED فقط"""
    if c.get("status") not in ("SIGNED", "ISSUED", "ARCHIVED") or not c.get("signature"):
        return ""
    s = dict(c["signature"])
    sp = c.get("signatory_position") or {}
    if sp.get("holder_name"):
        hon = (sp.get("honorific") or "").strip()
        s["name"] = f"{hon}/ {sp['holder_name']}" if hon else sp["holder_name"]
        s["job_title"] = sp.get("title_ar") or s.get("job_title", "")
    seal = ((letterhead or {}).get("branding_config") or {}).get("seal_asset_url")
    sig_img = f'<img class="sig-img" src="{s["asset_url"]}" alt="signature" style="height:60px;max-width:180px;object-fit:contain;display:block"/>' if s.get("asset_url") else ""
    seal_img = f'<img class="seal-img" src="{seal}" alt="seal" style="height:80px;width:80px;object-fit:contain;opacity:.9"/>' if seal else ""
    when = ph.greg_str(s.get("signed_at")) if s.get("signed_at") else ""
    return (f'<div class="sig-block" style="display:flex;gap:14px;align-items:flex-end;justify-content:flex-start;margin-top:6px">'
            f'{seal_img}<div>{sig_img}<div style="font-weight:700">{_html.escape(str(s.get("name", "")))}</div>'
            f'<div style="font-size:.9em;color:#334155">{_html.escape(str(s.get("job_title", "")))}</div><div style="font-size:.8em;color:#64748b">وُقّع إلكترونياً {when} · {s["hash"][:10]}</div></div></div>')


# ───────────── الاقتراحات الذكية ─────────────
@router.get("/suggestions")
async def suggestions(correspondence_id: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    from .correspondence import _get_readable
    from .correspondence_content import _allowed_perms
    c = await _get_readable(db, ctx, correspondence_id, request)
    org_id = c["organization_id"]
    from .correspondence_content import _ancestors
    anc = _ancestors(ctx, org_id)
    entities = await db.correspondence_entities.find({"correspondence_id": str(c["_id"])}).to_list(50)
    linked = {("FACULTY" if e["entity_type"] == "TEACHER" else e["entity_type"]) for e in entities}
    since = datetime.now(timezone.utc) - timedelta(days=90)
    usage_org = {}
    usage_me = {}
    async for row in db.correspondence_contents.aggregate([{"$match": {"created_at": {"$gte": since}}}, {"$lookup": {"from": "correspondences", "let": {"cid": "$correspondence_id"}, "pipeline": [{"$addFields": {"sid": {"$toString": "$_id"}}}, {"$match": {"$expr": {"$eq": ["$sid", "$$cid"]}}}, {"$project": {"organization_id": 1, "created_by": 1}}], "as": "c"}}, {"$unwind": "$c"},
                                                           {"$group": {"_id": {"t": "$template_id", "org": "$c.organization_id", "by": "$c.created_by"}, "n": {"$sum": 1}}}]):
        k = row["_id"]
        if k["org"] == org_id:
            usage_org[k["t"]] = usage_org.get(k["t"], 0) + row["n"]
        if k["by"] == ctx.user_id:
            usage_me[k["t"]] = usage_me.get(k["t"], 0) + row["n"]
    tpls = await db.correspondence_templates.find({"status": "PUBLISHED", "deleted_at": None, "$or": [{"is_global": True}, {"organization_id": {"$in": anc}}]}).to_list(300)
    out = []
    for t in tpls:
        tid = str(t["_id"])
        v = await db.correspondence_template_versions.find_one({"template_id": tid, "is_published": True}, sort=[("version_number", -1)]) or {}
        req = set(v.get("required_entities") or [])
        score, reasons = 0.0, []
        if t.get("document_type_id") == c.get("document_type_id"):
            score += 3; reasons.append("نفس نوع الوثيقة")
        if req and req <= linked:
            score += 2; reasons.append("يطابق الكيانات المرتبطة")
        elif req and not (req <= linked):
            score -= 1.5
        if not t.get("is_global"):
            score += 1; reasons.append("قالب جهتك")
        if usage_org.get(tid):
            score += min(2, usage_org[tid] / 3); reasons.append(f"استُخدم {usage_org[tid]}× في جهتك مؤخراً")
        if usage_me.get(tid):
            score += 1; reasons.append("استخدمته مؤخراً")
        out.append({"id": tid, "code": t["code"], "name_ar": t["name_ar"], "description": t.get("description", ""), "is_global": t.get("is_global", False), "document_type_id": t.get("document_type_id"), "current_version": t.get("published_version") or t.get("current_version"), "required_entities": sorted(req), "score": round(score, 2), "reasons": reasons})
    out.sort(key=lambda x: (-x["score"], x["name_ar"]))
    # عناصر نائبة مقترحة: حسب الكيانات المرتبطة والصلاحيات
    allowed = _allowed_perms(ctx)
    ns_pref = [ns for ns, ent in ph.ENTITY_FOR_NS.items() if ent in linked] + ["correspondence", "recipient", "system"]
    phs = [p for p in ph.registry_list(ctx) if p["namespace"] in ns_pref and (not p["required_permission"] or p["required_permission"] in allowed)]
    phs.sort(key=lambda p: ns_pref.index(p["namespace"]))
    return {"templates": out[:12], "placeholders": phs[:14], "linked_entities": sorted(linked)}
