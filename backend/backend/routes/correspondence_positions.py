"""📇 المراسلات — دليل المناصب والأسماء (رئيس الجامعة، عميد كلية…، وزير…)
يُستخدم كمرسَل إليه (داخلي/خارجي) أو كموقِّع/مرسِل، ويُحفظ الاسم الكامل مع اللقب والصفة ليُستخدم في الخطاب تلقائياً."""
import html as _html
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from bson import ObjectId

from services.corr_policy import CorrContext, P
from .deps import get_db
from .correspondence import ctx_dep, audit, _ser

router = APIRouter(prefix="/correspondence", tags=["المراسلات — المناصب"])


class PositionIn(BaseModel):
    title_ar: str
    holder_name: str
    honorific: Optional[str] = ""
    kind: str = "INTERNAL"
    organization_id: Optional[str] = None
    external_organization: Optional[str] = ""
    recipient_suffix: Optional[str] = "المحترم"
    is_default_signer: bool = False
    is_active: bool = True
    sort_order: int = 50
    notes: Optional[str] = ""


def position_display(p: dict) -> dict:
    """الصيغ الجاهزة للعرض: name = اللقب/ الاسم · title = المنصب · full = سطران"""
    if not p:
        return {}
    hon = (p.get("honorific") or "").strip()
    name = f"{hon}/ {p['holder_name']}" if hon else p["holder_name"]
    org = p.get("organization_name") or p.get("external_organization") or ""
    return {"name": name, "holder": p["holder_name"], "honorific": hon, "title": p["title_ar"], "organization": org,
            "suffix": p.get("recipient_suffix") or "", "full": f"{name} — {p['title_ar']}" + (f" — {org}" if org and p.get("kind") == "EXTERNAL" else "")}


async def load_position(db, pid: Optional[str]) -> Optional[dict]:
    if not pid or not ObjectId.is_valid(pid):
        return None
    p = await db.correspondence_positions.find_one({"_id": ObjectId(pid), "is_active": {"$ne": False}})
    if p and p.get("organization_id") and ObjectId.is_valid(p["organization_id"]):
        org = await db.org_units.find_one({"_id": ObjectId(p["organization_id"])}, {"name": 1})
        p["organization_name"] = (org or {}).get("name", "")
    return p


def _guard(ctx: CorrContext):
    if not (ctx.is_super or ctx.has_perm_anywhere(P["organizations"])):
        raise HTTPException(status_code=403, detail="إدارة المناصب تتطلب صلاحية إدارة الهيكل التنظيمي للمراسلات")


async def _view(db, p: dict) -> dict:
    out = _ser(p)
    if p.get("organization_id") and ObjectId.is_valid(p["organization_id"]):
        org = await db.org_units.find_one({"_id": ObjectId(p["organization_id"])}, {"name": 1})
        out["organization_name"] = (org or {}).get("name", "")
    out["display"] = position_display({**p, "organization_name": out.get("organization_name", "")})
    return out


@router.get("/positions")
async def list_positions(kind: Optional[str] = None, include_inactive: bool = False, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    q: dict = {}
    if kind:
        q["kind"] = kind
    if not include_inactive:
        q["is_active"] = {"$ne": False}
    rows = await db.correspondence_positions.find(q).sort([("kind", 1), ("sort_order", 1), ("title_ar", 1)]).to_list(500)
    return {"items": [await _view(db, p) for p in rows]}


@router.post("/positions")
async def create_position(data: PositionIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    _guard(ctx)
    db = get_db()
    if data.kind not in ("INTERNAL", "EXTERNAL"):
        raise HTTPException(status_code=400, detail="النوع داخلي أو خارجي فقط")
    if not data.title_ar.strip() or not data.holder_name.strip():
        raise HTTPException(status_code=400, detail="المنصب واسم شاغله مطلوبان")
    doc = {**data.dict(), "title_ar": data.title_ar.strip(), "holder_name": data.holder_name.strip(), "created_at": datetime.now(timezone.utc), "created_by": ctx.user_id}
    if data.is_default_signer:
        await db.correspondence_positions.update_many({"is_default_signer": True}, {"$set": {"is_default_signer": False}})
    r = await db.correspondence_positions.insert_one(doc)
    await audit(db, ctx, "POSITION_CREATED", "position", str(r.inserted_id), request, meta={"title": data.title_ar})
    return await _view(db, {**doc, "_id": r.inserted_id})


@router.put("/positions/{pid}")
async def update_position(pid: str, data: PositionIn, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    _guard(ctx)
    db = get_db()
    if not ObjectId.is_valid(pid):
        raise HTTPException(status_code=404, detail="غير موجود")
    if data.is_default_signer:
        await db.correspondence_positions.update_many({"is_default_signer": True, "_id": {"$ne": ObjectId(pid)}}, {"$set": {"is_default_signer": False}})
    upd = {**data.dict(), "title_ar": data.title_ar.strip(), "holder_name": data.holder_name.strip(), "updated_at": datetime.now(timezone.utc)}
    p = await db.correspondence_positions.find_one_and_update({"_id": ObjectId(pid)}, {"$set": upd}, return_document=True)
    if not p:
        raise HTTPException(status_code=404, detail="غير موجود")
    await audit(db, ctx, "POSITION_UPDATED", "position", pid, request, meta={"title": data.title_ar, "holder": data.holder_name})
    return await _view(db, p)


@router.delete("/positions/{pid}")
async def delete_position(pid: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    _guard(ctx)
    db = get_db()
    if not ObjectId.is_valid(pid):
        raise HTTPException(status_code=404, detail="غير موجود")
    await db.correspondence_positions.update_one({"_id": ObjectId(pid)}, {"$set": {"is_active": False, "is_default_signer": False}})
    await audit(db, ctx, "POSITION_DISABLED", "position", pid, request)
    return {"ok": True}


def sender_html(c: dict) -> str:
    """كتلة المرسِل (المنصب + الاسم) تُلحق بقسم التوقيع قبل التوقيع الفعلي"""
    sp = c.get("signatory_position")
    if not sp:
        return ""
    d = position_display(sp)
    return (f'<div class="sender-block" style="margin-top:10px"><div style="font-weight:700">{_html.escape(d["name"])}</div>'
            f'<div style="font-size:.95em;color:#334155">{_html.escape(d["title"])}</div></div>')
