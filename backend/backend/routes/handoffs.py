"""📚 وثائق التسليم لمطوّري التطبيقات — صفحات HTML عامة من ملفات Markdown"""
import html
import re
from pathlib import Path

import markdown
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

router = APIRouter(prefix="/handoffs", tags=["وثائق التسليم"])

DOCS_DIR = Path(__file__).resolve().parent.parent / "handoffs"

CSS = """
*{box-sizing:border-box}body{margin:0;background:#f1f5f9;font-family:Tajawal,Cairo,'Segoe UI',Tahoma,sans-serif;color:#0f172a;direction:rtl}
.wrap{max-width:980px;margin:0 auto;padding:24px 16px 60px}.hero{background:#0f2440;color:#fff;border-radius:18px;padding:22px 26px;margin-bottom:18px}
.hero h1{margin:0 0 6px;font-size:22px}.hero a{color:#93c5fd;text-decoration:none;font-size:13px}.card{background:#fff;border-radius:16px;padding:26px 30px;box-shadow:0 2px 8px rgba(0,0,0,.05);line-height:1.9;font-size:15px}
h1,h2,h3{color:#0f2440}h2{border-bottom:2px solid #e2e8f0;padding-bottom:6px;margin-top:34px}h3{margin-top:26px}
code{background:#f1f5f9;padding:2px 6px;border-radius:6px;font-size:13px;direction:ltr;unicode-bidi:embed;font-family:Menlo,Consolas,monospace}
pre{background:#0f2440;color:#e2e8f0;padding:16px;border-radius:12px;overflow:auto;direction:ltr;text-align:left;font-size:12.5px;line-height:1.6}pre code{background:none;color:inherit;padding:0}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:13.5px}th{background:#0f2440;color:#fff;padding:9px 10px;text-align:right}td{padding:8px 10px;border-bottom:1px solid #eef2f7;vertical-align:top}tr:nth-child(even) td{background:#f8fafc}
blockquote{border-right:4px solid #f97316;background:#fff7ed;margin:12px 0;padding:10px 14px;border-radius:8px;color:#7c2d12}
ul.docs{list-style:none;padding:0;margin:0}ul.docs li{padding:12px 14px;border-bottom:1px solid #eef2f7}ul.docs a{color:#1565c0;font-weight:800;text-decoration:none;font-size:16px}ul.docs small{color:#64748b;display:block;margin-top:3px}
a{color:#1565c0}
"""

TITLES = {
    "EMPLOYEE_APP_HOME": "🏠 تصميم الرئيسة الجديدة لتطبيق الموظف/الأستاذ + كل الـ APIs",
    "EMPLOYEE_APP_GEOFENCING": "📍 التحقق الجغرافي للحضور (Geofencing)",
    "EMPLOYEE_APP_PRESENCE_SHIFTS": "🔔 تأكيد التواجد العشوائي + فترات الدوام المتعددة",
    "EMPLOYEE_APP_CORRECTION": "↩️ تصحيح الحضور/الانصراف + 🤖 الانصراف التلقائي",
    "APPS_FORCE_UPDATE": "📲 التحديث الإجباري لتطبيقات الطالب والمعلم",
    "EXTERNAL_LMS_INTEGRATION": "🔗 تكامل نظام النتائج الخارجي (قراءة فقط)",
    "STUDENT_APP_ATTENDANCE_REPORT_TASK": "🎓 تطبيق الطالب — تقرير الحضور",
}


def _page(title: str, body: str, back: bool = True) -> str:
    nav = '<a href="/api/handoffs">← كل الوثائق</a>' if back else ""
    return f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap" rel="stylesheet"><style>{CSS}</style></head>
<body><div class="wrap"><div class="hero"><div style="font-size:18px;font-weight:800">جامعة الأحقاف — وثائق التسليم لمطوّري التطبيقات</div>{nav}</div><div class="card">{body}</div></div></body></html>"""


@router.get("", response_class=HTMLResponse)
async def index():
    items = []
    for p in sorted(DOCS_DIR.glob("*.md")):
        name = p.stem
        items.append(f'<li><a href="/api/handoffs/{name}">{html.escape(TITLES.get(name, name))}</a><small>/api/handoffs/{name} · <a href="/api/handoffs/{name}.md">Markdown خام</a></small></li>')
    return _page("وثائق التسليم", f'<h1>📚 وثائق التسليم</h1><ul class="docs">{"".join(items)}</ul>', back=False)


def _file(name: str) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9_\-]+", name):
        raise HTTPException(status_code=404, detail="الوثيقة غير موجودة")
    p = DOCS_DIR / f"{name}.md"
    if not p.exists():
        raise HTTPException(status_code=404, detail="الوثيقة غير موجودة")
    return p


@router.get("/{name}.md")
async def raw(name: str):
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(_file(name).read_text(encoding="utf-8"), media_type="text/markdown; charset=utf-8")


@router.get("/{name}", response_class=HTMLResponse)
async def doc(name: str):
    text = _file(name).read_text(encoding="utf-8")
    body = markdown.markdown(text, extensions=["tables", "fenced_code", "toc"])
    return _page(TITLES.get(name, name), body)
