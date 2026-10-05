"""المرحلة 3-أ/ب — PDF النهائي (Chromium headless من HTML معاينة A4) + رمز QR وصفحة تحقق عامة
- PDF المسودة: علامة مائية «مسودة — غير رسمية» بلا QR ولا يُخزَّن.
- PDF النهائي: يُولَّد مرة واحدة عند الإصدار من اللقطة المجمّدة، يُخزَّن (Object Storage) مع sha256، وكل تنزيل لاحق يعيد الملف نفسه.
"""
import asyncio
import base64
import hashlib
import html as _html
import io
import logging
import os
import secrets
import tempfile
from datetime import datetime, timezone
from typing import Optional

import qrcode
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from services import corr_placeholders as ph
from services.corr_policy import CorrContext
from .deps import get_db
from .correspondence import ctx_dep, audit, _ser
from .correspondence_content import _corr_editable, build_preview

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/correspondence", tags=["المراسلات — PDF"])
public_router = APIRouter(prefix="/correspondence/public", tags=["المراسلات — تحقق عام"])

FONTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fonts")
CHROMIUM = next((p for p in ("/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome") if os.path.exists(p)), None)
VALID_STATUSES = ("ISSUED", "ARCHIVED")
_pdf_locks: dict = {}


async def pdf_startup(db):
    await db.correspondence_documents.create_index([("correspondence_id", 1), ("kind", 1)], unique=True)
    await db.correspondences.create_index("verify_token", sparse=True)


# ───────────── أدوات ─────────────
def _asset_data_uri(url: Optional[str]) -> str:
    if not url:
        return ""
    if url.startswith("data:") or url.startswith("http"):
        return url
    try:
        from services.storage_service import get_object
        path = url.split("/api/files/", 1)[1].split("?")[0] if "/api/files/" in url else url.lstrip("/")
        data, ctype = get_object(path)
        return f"data:{ctype};base64,{base64.b64encode(data).decode()}"
    except Exception as e:
        logger.warning(f"letterhead asset unavailable: {e}")
        return ""


def _qr_data_uri(text: str) -> str:
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=6, border=1)
    qr.add_data(text)
    qr.make(fit=True)
    buf = io.BytesIO()
    qr.make_image(fill_color="#0f2440", back_color="white").save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


async def verify_base(db, request: Request) -> str:
    from .statements import get_verify_base
    base = await get_verify_base(db)
    if base:
        return base
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    return f"https://{host}" if host else ""


def _esc(s) -> str:
    return _html.escape(str(s or ""))


async def _org_name(db, c: dict) -> str:
    o = await db.org_units.find_one({"_id": ObjectId(c["organization_id"])}, {"name": 1, "name_ar": 1}) if ObjectId.is_valid(c.get("organization_id", "")) else None
    return (o or {}).get("name_ar") or (o or {}).get("name") or ""


def render_html(c: dict, prev: dict, org_name: str, *, watermark: str = "", qr_uri: str = "", verify_url: str = "", sha_short: str = "", issued_label: str = "") -> str:
    lh = prev.get("letterhead") or {}
    h, f, b, pc = lh.get("header_config", {}), lh.get("footer_config", {}), lh.get("branding_config", {}), lh.get("page_config", {})
    m = pc.get("margins_mm") or {"top": 15, "right": 20, "bottom": 15, "left": 20}
    color = b.get("primary_color") or "#0f2440"
    fs = pc.get("font_size_pt") or 12
    lhgt = pc.get("line_height") or 1.7
    logo = _asset_data_uri(b.get("logo_asset_url"))
    logo2 = _asset_data_uri(b.get("secondary_logo_asset_url"))
    bg = _asset_data_uri(b.get("header_background_asset_url"))
    split = (h.get("align") or "center") != "center"
    show_logo = h.get("show_logo", True)
    logo_img = f'<img class="logo" src="{logo}"/>' if (show_logo and logo) else ""
    header_inner = "".join([
        f'<div class="uni-ar">{_esc(h.get("university_name_ar"))}</div>' if h.get("university_name_ar") else "",
        f'<div class="uni-en">{_esc(h.get("university_name_en"))}</div>' if h.get("university_name_en") else "",
        f'<div class="org">{_esc(org_name)}</div>' if (h.get("show_organization_name", True) and org_name) else "",
        f'<div class="htext">{_esc(h.get("header_text"))}</div>' if h.get("header_text") else "",
    ])
    header = (f'<div class="header split">{logo_img}<div class="hc">{header_inner}</div>{f"<img class=logo src={logo2!r}/>" if logo2 else "<div class=logo></div>"}</div>' if split
              else f'<div class="header center">{logo_img}<div class="hc">{header_inner}</div></div>')
    footer_parts = [x for x in (f.get("address"), f"هاتف: {f['phone']}" if f.get("phone") else "", f.get("email"), f.get("website")) if x]
    footer_txt = (f'<div class="ftext">{_esc(f.get("footer_text"))}</div>' if f.get("footer_text") else "") + (f'<div class="fparts">{_esc(" · ".join(footer_parts))}</div>' if footer_parts else "")
    verify_block = ""
    if qr_uri:
        verify_block = (f'<div class="verify"><img src="{qr_uri}"/><div class="vtext"><div><b>للتحقق من صحة هذه الوثيقة</b> امسح الرمز أو زر الرابط:</div>'
                        f'<div class="vurl">{_esc(verify_url)}</div><div class="vmeta">{_esc(issued_label)}{(" · رمز التحقق: " + _esc(sha_short)) if sha_short else ""}</div></div></div>')
    import re as _re
    def _inline(mt):
        return f'src="{_asset_data_uri(mt.group(1))}"'
    for s_ in prev.get("sections", []):
        s_["html"] = _re.sub(r'src="(/api/files/[^"]+)"', _inline, s_.get("html") or "")
    secs = "".join(
        f'<section class="sec {s["type"].lower()}" style="text-align:{(s.get("style_config") or {}).get("align") or ("left" if s["type"] == "SIGNATURE_BLOCK" else "right")}">{s.get("html") or ""}</section>'
        for s in prev.get("sections", []))
    wm = f'<div class="wm">{_esc(watermark)}</div>' if watermark else ""
    footer_mm = (30 if qr_uri else 14) + (4 if footer_txt else 0)
    bg_css = f'background-image:url("{bg}");background-size:cover;' if bg else ""
    return f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>{_esc(c.get("official_number") or c.get("subject"))}</title>
<style>
@font-face{{font-family:"Amiri";src:url("file://{FONTS_DIR}/Amiri-Regular.ttf");font-weight:400}}
@font-face{{font-family:"Amiri";src:url("file://{FONTS_DIR}/Amiri-Bold.ttf");font-weight:700}}
@font-face{{font-family:"Cairo";src:url("file://{FONTS_DIR}/Cairo-Regular.ttf");font-weight:400}}
@font-face{{font-family:"Cairo";src:url("file://{FONTS_DIR}/Cairo-Bold.ttf");font-weight:700}}
@page{{size:A4;margin:{m.get("top", 15)}mm {m.get("right", 20)}mm {m.get("bottom", 15)}mm {m.get("left", 20)}mm}}
*{{box-sizing:border-box}} html,body{{margin:0;padding:0}}
body{{font-family:"Amiri","Cairo",serif;font-size:{fs}pt;line-height:{lhgt};color:#111827;direction:rtl}}
.header{{display:flex;align-items:center;gap:14px;border-bottom:2px solid {color};padding:4px 0 8px;min-height:{h.get("height_mm", 35)}mm;{bg_css}}}
.header.center{{flex-direction:column;justify-content:center;text-align:center}} .header.split{{justify-content:space-between}}
.hc{{text-align:center;color:{color};flex:1}} .logo{{width:64px;height:64px;object-fit:contain}}
.uni-ar{{font-weight:700;font-size:{fs + 4}pt}} .uni-en{{font-size:{fs - 3}pt;direction:ltr;letter-spacing:.5px}} .org{{font-weight:700;font-size:{fs + 0.5}pt;margin-top:2px}} .htext{{font-size:{fs - 1}pt}}
.body{{padding-top:10px}} .sec{{margin:3px 0}} .sec p{{margin:0 0 .35em}} .sec table{{border-collapse:collapse;width:100%}} .sec td,.sec th{{border:1px solid #94a3b8;padding:3px 6px}} .sec ul,.sec ol{{margin:.2em 1.2em .2em 0;padding:0}}
.sec.signature_block{{margin-top:28px;padding-left:10px;page-break-inside:avoid}}
.footer{{position:fixed;bottom:0;left:0;right:0;height:{footer_mm}mm;border-top:1.5px solid {color};padding-top:4px;text-align:center;font-size:{fs - 3}pt;color:#475569;background:#fff}}
.page{{width:100%;border-collapse:collapse}} .page td{{padding:0}} .page tfoot td{{height:{footer_mm + 2}mm}}
.ftext{{font-weight:700;color:{color}}}
.verify{{display:flex;align-items:center;gap:10px;direction:rtl;text-align:right;margin-top:4px}} .verify img{{width:22mm;height:22mm}} .vtext{{font-size:{fs - 4}pt;color:#334155;line-height:1.5}} .vurl{{direction:ltr;text-align:right;font-family:monospace;font-size:{fs - 5}pt;word-break:break-all}} .vmeta{{color:#64748b}}
.wm{{position:fixed;top:40%;left:0;right:0;text-align:center;transform:rotate(-30deg);font-size:64pt;font-weight:700;color:rgba(185,28,28,.10);pointer-events:none;z-index:0}}
</style></head><body>{wm}<table class="page"><thead><tr><td>{header}</td></tr></thead><tbody><tr><td><div class="body">{secs}</div></td></tr></tbody><tfoot><tr><td></td></tr></tfoot></table><div class="footer">{footer_txt}{verify_block}</div></body></html>"""


async def html_to_pdf(html: str) -> bytes:
    if not CHROMIUM:
        raise HTTPException(status_code=503, detail="محرك PDF غير متاح على الخادم")
    with tempfile.TemporaryDirectory() as d:
        src, out = os.path.join(d, "letter.html"), os.path.join(d, "letter.pdf")
        with open(src, "w", encoding="utf-8") as fh:
            fh.write(html)
        proc = await asyncio.create_subprocess_exec(
            CHROMIUM, "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-pdf-header-footer",
            "--allow-file-access-from-files", "--run-all-compositor-stages-before-draw", "--virtual-time-budget=4000",
            f"--print-to-pdf={out}", f"file://{src}", stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
        try:
            await asyncio.wait_for(proc.wait(), timeout=60)
        except asyncio.TimeoutError:
            proc.kill()
            raise HTTPException(status_code=504, detail="انتهت مهلة توليد PDF")
        if not os.path.exists(out):
            raise HTTPException(status_code=500, detail="فشل توليد PDF")
        with open(out, "rb") as fh:
            return fh.read()


def _pdf_headers(filename: str, sha: str = "", inline: bool = True) -> dict:
    from urllib.parse import quote
    hd = {"Content-Disposition": f"{'inline' if inline else 'attachment'}; filename*=UTF-8''{quote(filename)}", "Cache-Control": "private, no-store"}
    if sha:
        hd["X-Document-SHA256"] = sha
    return hd


# ───────────── التوليد ─────────────
async def _ensure_verify_token(db, c: dict) -> str:
    if c.get("verify_token"):
        return c["verify_token"]
    tok = secrets.token_urlsafe(24)
    await db.correspondences.update_one({"_id": c["_id"], "verify_token": {"$exists": False}}, {"$set": {"verify_token": tok}})
    fresh = await db.correspondences.find_one({"_id": c["_id"]}, {"verify_token": 1})
    return fresh.get("verify_token") or tok


async def generate_final_pdf(db, ctx: CorrContext, c: dict, request: Request) -> dict:
    """مرة واحدة لكل مراسلة صادرة — idempotent وآمنة ضد التزامن (قفل داخل العملية + فهرس فريد)."""
    cid = str(c["_id"])
    existing = await db.correspondence_documents.find_one({"correspondence_id": cid, "kind": "FINAL"})
    if existing:
        return existing
    lock = _pdf_locks.setdefault(cid, asyncio.Lock())
    async with lock:
        existing = await db.correspondence_documents.find_one({"correspondence_id": cid, "kind": "FINAL"})
        if existing:
            return existing
        token = await _ensure_verify_token(db, c)
        base = await verify_base(db, request)
        verify_url = f"{base}/verify-correspondence?token={token}"
        prev = await build_preview(db, ctx, c, request, "preview")
        if prev.get("source") != "SNAPSHOT":
            raise HTTPException(status_code=409, detail="لا توجد لقطة مجمّدة — لا يمكن إصدار PDF نهائي")
        snap = await db.correspondence_data_snapshots.find_one({"correspondence_id": cid}, sort=[("created_at", -1)])
        issued_at = c.get("issued_at") or datetime.now(timezone.utc)
        issued_label = f"صدر بتاريخ {ph.greg_str(issued_at)} الموافق {ph.hijri_str(issued_at)}"
        # الدورة الأولى بلا بصمة (البصمة تُحسب على الملف النهائي وتُعرض في صفحة التحقق)
        html = render_html(c, prev, await _org_name(db, c), qr_uri=_qr_data_uri(verify_url), verify_url=verify_url, sha_short=token[:8], issued_label=issued_label)
        pdf = await html_to_pdf(html)
        sha = hashlib.sha256(pdf).hexdigest()
        from services.storage_service import upload_file
        res = upload_file(pdf, f"{(c.get('official_number') or cid).replace('/', '-')}.pdf", "application/pdf", "correspondence/final")
        doc = {"correspondence_id": cid, "kind": "FINAL", "storage_path": res["storage_path"], "sha256": sha, "size": len(pdf), "official_number": c.get("official_number"),
               "verify_token": token, "verify_url": verify_url, "snapshot_checksum": snap.get("checksum") if snap else None, "template_version_id": prev.get("template_version_id"),
               "generated_by": ctx.user_id, "generated_at": datetime.now(timezone.utc)}
        try:
            r = await db.correspondence_documents.insert_one(doc)
            doc["_id"] = r.inserted_id
        except Exception:
            return await db.correspondence_documents.find_one({"correspondence_id": cid, "kind": "FINAL"})
        await audit(db, ctx, "FINAL_PDF_GENERATED", "correspondence", cid, request, meta={"sha256": sha, "size": len(pdf), "storage_path": res["storage_path"]}, organization_id=c["organization_id"])
        return doc


async def on_issued(db, ctx: CorrContext, c: dict, request: Request):
    """يُستدعى بعد الانتقال إلى ISSUED: يثبّت رمز التحقق ويولّد PDF النهائي (الفشل لا يُفشل الإصدار — يُولَّد عند أول تنزيل)."""
    try:
        await _ensure_verify_token(db, c)
        fresh = await db.correspondences.find_one({"_id": c["_id"]})
        await generate_final_pdf(db, ctx, fresh, request)
    except Exception as e:
        logger.error(f"final pdf generation deferred for {c.get('_id')}: {e}")


# ───────────── واجهات ─────────────
@router.get("/{corr_id}/pdf")
async def get_pdf(corr_id: str, request: Request, download: bool = False, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    c = await _corr_editable(db, ctx, corr_id, request)
    if c["status"] in VALID_STATUSES or c["status"] == "CANCELLED" and await db.correspondence_documents.find_one({"correspondence_id": str(c["_id"]), "kind": "FINAL"}):
        doc = await generate_final_pdf(db, ctx, c, request)
        from services.storage_service import get_object
        data, _ = get_object(doc["storage_path"])
        if hashlib.sha256(data).hexdigest() != doc["sha256"]:
            await audit(db, ctx, "FINAL_PDF_INTEGRITY_FAILED", "correspondence", str(c["_id"]), request, organization_id=c["organization_id"])
            raise HTTPException(status_code=409, detail="فشل التحقق من سلامة ملف PDF المخزّن")
        await audit(db, ctx, "FINAL_PDF_DOWNLOADED", "correspondence", str(c["_id"]), request, organization_id=c["organization_id"])
        return Response(content=data, media_type="application/pdf", headers=_pdf_headers(f"{c.get('official_number') or corr_id}.pdf", doc["sha256"], inline=not download))
    prev = await build_preview(db, ctx, c, request, "preview")
    html = render_html(c, prev, await _org_name(db, c), watermark="مسودة — غير رسمية")
    pdf = await html_to_pdf(html)
    return Response(content=pdf, media_type="application/pdf", headers={**_pdf_headers(f"DRAFT-{c.get('subject', corr_id)[:40]}.pdf", inline=not download), "X-Document-Draft": "1"})


@router.get("/{corr_id}/pdf/info")
async def pdf_info(corr_id: str, request: Request, ctx: CorrContext = Depends(ctx_dep)):
    db = get_db()
    c = await _corr_editable(db, ctx, corr_id, request)
    doc = await db.correspondence_documents.find_one({"correspondence_id": str(c["_id"]), "kind": "FINAL"})
    return {"final": _ser(doc) if doc else None, "verify_token": c.get("verify_token"), "verify_url": doc.get("verify_url") if doc else None, "status": c["status"]}


@public_router.get("/verify/{token}")
async def public_verify(token: str, request: Request):
    """تحقق عام بلا تسجيل دخول — بيانات محدودة فقط، لا محتوى ولا بيانات شخصية."""
    db = get_db()
    if not token or len(token) < 16 or len(token) > 64:
        raise HTTPException(status_code=404, detail="رمز غير صالح")
    c = await db.correspondences.find_one({"verify_token": token})
    if not c:
        await db.audit_logs.insert_one({"action": "PUBLIC_VERIFY_FAILED", "entity_type": "correspondence", "entity_id": None, "metadata": {"token_prefix": token[:6]}, "ip_address": request.client.host if request.client else None, "created_at": datetime.now(timezone.utc)})
        return {"valid": False, "message": "لم يُعثر على وثيقة مطابقة لهذا الرمز — قد تكون الوثيقة غير صادرة من النظام"}
    doc = await db.correspondence_documents.find_one({"correspondence_id": str(c["_id"]), "kind": "FINAL"})
    org = await db.org_units.find_one({"_id": ObjectId(c["organization_id"])}, {"name": 1, "name_ar": 1}) if ObjectId.is_valid(c["organization_id"]) else None
    dt = await db.document_types.find_one({"_id": ObjectId(c["document_type_id"])}, {"name_ar": 1}) if ObjectId.is_valid(c.get("document_type_id", "")) else None
    valid = c["status"] in VALID_STATUSES and bool(c.get("official_number"))
    issued_at = c.get("issued_at")
    await db.audit_logs.insert_one({"action": "PUBLIC_VERIFY", "entity_type": "correspondence", "entity_id": str(c["_id"]), "metadata": {"valid": valid}, "ip_address": request.client.host if request.client else None, "created_at": datetime.now(timezone.utc)})
    return {"valid": valid, "message": "وثيقة رسمية صادرة من جامعة الأحقاف ✓" if valid else ("هذه الوثيقة مُلغاة ولم تعد سارية" if c["status"] == "CANCELLED" else "الوثيقة غير صادرة بعد"),
            "official_number": c.get("official_number"), "document_type": (dt or {}).get("name_ar"), "organization": (org or {}).get("name_ar") or (org or {}).get("name"),
            "subject": c.get("subject"), "issued_at": ph.greg_str(issued_at) if issued_at else None, "issued_at_hijri": ph.hijri_str(issued_at) if issued_at else None,
            "status": c["status"], "pdf_sha256": doc.get("sha256") if doc else None, "pdf_size": doc.get("size") if doc else None, "verified_at": datetime.now(timezone.utc).isoformat()}
