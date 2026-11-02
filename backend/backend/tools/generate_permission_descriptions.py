"""
توليد تعريف عربي دقيق لكل صلاحية في advanced_permissions (طلب المستخدم 2 نوفمبر 2026).
يقرأ كل الصلاحيات من Mongo، يستخرج أول سطر docstring للدالة المصدر (إن وُجد) كسياق إضافي،
يُرسلها دفعات لـ Claude لتوليد description_ar مميّز لكل صلاحية (ليس تكرار label_ar العام)،
ثم يكتبها مباشرة في advanced_permissions. آمن لإعادة التشغيل (يتخطى ما لديه description_ar مسبقاً
إلا مع --force).
"""
import asyncio
import ast
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from motor.motor_asyncio import AsyncIOMotorClient
from emergentintegrations.llm.chat import LlmChat, UserMessage

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
BATCH_SIZE = 18

OP_LABELS = {
    "view_list": "عرض قائمة", "view_detail": "عرض تفاصيل", "add": "إضافة",
    "edit": "تعديل", "delete": "حذف", "export": "تصدير", "import": "استيراد",
    "print": "طباعة", "approve": "اعتماد/مراجعة", "publish": "نشر/إرسال",
    "restore": "استعادة", "bulk": "عملية جماعية", "clone": "نسخ", "reset": "إعادة تعيين",
    "sync": "مزامنة/ترحيل", "verify": "تحقق", "generate": "توليد", "other": "عملية",
}

_docstring_cache: dict = {}


def _resolve_source_path(source_file: str) -> str:
    if source_file == "server":
        return os.path.join(BACKEND_ROOT, "server.py")
    return os.path.join(BACKEND_ROOT, source_file)


def _first_line(doc: str) -> str:
    doc = (doc or "").strip()
    if not doc:
        return ""
    line = doc.splitlines()[0].strip()
    return line[:160]


def get_docstring(source_file: str, function_name: str) -> str:
    """ترجع أول سطر من docstring الدالة (داخل دالة async def أو def، بما فيها الدوال المتداخلة)، أو ''."""
    if source_file not in _docstring_cache:
        mapping: dict = {}
        path = _resolve_source_path(source_file)
        try:
            with open(path, "r", encoding="utf-8") as f:
                tree = ast.parse(f.read(), filename=path)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    doc = ast.get_docstring(node)
                    if doc and node.name not in mapping:
                        mapping[node.name] = _first_line(doc)
        except Exception:
            pass
        _docstring_cache[source_file] = mapping
    return _docstring_cache[source_file].get(function_name, "")


async def generate_batch(chat: LlmChat, items: list) -> dict:
    lines = []
    for p in items:
        op_label = OP_LABELS.get(p["operation_type"], p["operation_type"])
        doc = get_docstring(p["source_file"], p["source_function"])
        lines.append(
            f"- المفتاح: {p['key']}\n"
            f"  الدالة في الكود: {p['source_function']}\n"
            f"  الواجهة: {p['linked_api']}\n"
            f"  نوع العملية: {op_label}\n"
            f"  تعليق/شرح من الكود المصدري: {doc if doc else 'لا يوجد'}"
        )
    prompt = (
        "لكل صلاحية أدناه، اكتب وصفًا عربيًا دقيقًا وموجزًا (سطر واحد، 8-18 كلمة تقريبًا) يشرح "
        "بالضبط ماذا تفعل هذه الصلاحية تحديدًا داخل نظام جامعي (حضور/طلاب/مراسلات/مالية...الخ). "
        "لا تكرر فقط نوع العملية + اسم المجموعة بشكل عام (مثل 'إضافة سجل' أو 'تعديل بيانات') — "
        "اشرح الغرض الحقيقي المحدد مستعينًا باسم الدالة والمسار وتعليق الكود إن وُجد. "
        "أعد النتيجة بصيغة JSON فقط بلا أي نص قبله أو بعده، بالشكل التالي بالضبط:\n"
        '{"المفتاح1": "الوصف", "المفتاح2": "الوصف"}\n\n' + "\n".join(lines)
    )
    resp = await chat.send_message(UserMessage(text=prompt))
    text = resp if isinstance(resp, str) else str(resp)
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {}


async def main():
    force = "--force" in sys.argv
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    q = {} if force else {"description_ar": {"$exists": False}}
    perms = await db.advanced_permissions.find(q, {"_id": 0}).to_list(2000)
    print(f"TO_PROCESS={len(perms)}")

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id="perm-desc-gen",
        system_message="أنت مساعد تقني متخصص في توثيق أنظمة الصلاحيات الجامعية باللغة العربية الفصحى الواضحة والمباشرة.",
    ).with_model("anthropic", "claude-sonnet-5-5")

    ok = 0
    failed_batches = []
    for i in range(0, len(perms), BATCH_SIZE):
        batch = perms[i:i + BATCH_SIZE]
        try:
            result = await generate_batch(chat, batch)
        except Exception as e:
            print(f"BATCH_ERROR idx={i} err={e}")
            failed_batches.append(batch)
            continue
        ops = []
        for p in batch:
            desc = result.get(p["key"])
            if desc and isinstance(desc, str) and desc.strip():
                ops.append((p["key"], desc.strip()))
        for key, desc in ops:
            await db.advanced_permissions.update_one({"key": key}, {"$set": {"description_ar": desc}})
        ok += len(ops)
        print(f"BATCH_DONE idx={i} got={len(ops)}/{len(batch)} total_ok={ok}")

    # إعادة محاولة واحدة للدفعات الفاشلة بالكامل (دفعة أصغر)
    for batch in failed_batches:
        for j in range(0, len(batch), 6):
            sub = batch[j:j + 6]
            try:
                result = await generate_batch(chat, sub)
            except Exception as e:
                print(f"RETRY_ERROR err={e}")
                continue
            for p in sub:
                desc = result.get(p["key"])
                if desc and isinstance(desc, str) and desc.strip():
                    await db.advanced_permissions.update_one({"key": p["key"]}, {"$set": {"description_ar": desc.strip()}})
                    ok += 1
            print(f"RETRY_BATCH_DONE total_ok={ok}")

    remaining = await db.advanced_permissions.count_documents({"description_ar": {"$exists": False}})
    print(f"FINAL_OK={ok} REMAINING_WITHOUT_DESC={remaining}")


if __name__ == "__main__":
    asyncio.run(main())
