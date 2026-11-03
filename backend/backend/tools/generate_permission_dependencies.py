"""
توليد depends_on لكل صلاحية (طلب المستخدم 3 نوفمبر 2026): اقتراح صلاحيات مرتبطة يُسأل عنها
المسؤول عند تفعيل صلاحية جديدة — استشاري بحت (لا يُفعَّل تلقائيًا، لا يُغيّر أي حقل أصلي).
1) روابط عالية الثقة: عملية (تعديل/حذف/اعتماد/تصدير/طباعة/نشر/استعادة/نسخ/إعادة تعيين/تحقق) على
   نفس المورد (أول جزء من المسار) داخل نفس المجموعة → تعتمد على عرض القائمة/التفاصيل لنفس المورد.
2) اقتراحات AI داخل نفس المجموعة فقط (محافظة، تُرجع فارغة عند عدم الثقة).
آمن لإعادة التشغيل؛ لا يلمس أي حقل غير depends_on. يكتب لـ Mongo وملف JSON معًا (نفس الخطأ السابق
في المزامنة بين البيئتين لن يتكرر).
"""
import asyncio
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

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools", "generated", "advanced_permissions.json")

VIEW_OPS = {"view_list", "view_detail"}
DEPENDENT_OPS = {"edit", "delete", "approve", "export", "print", "publish", "restore", "clone", "reset", "verify"}


def resource_of(path: str) -> str:
    """مفتاح مورد دقيق: يُطابق فقط الصلاحيات التي تتشارك نفس المسار الثابت فعليًا (مع تطبيع أي
    معرّف ديناميكي {id}/{course_id}.. إلى {} وحذف المعرّفات الزائدة من نهاية المسار فقط)،
    بعكس استخدام أول جزء من المسار فقط الذي كان يجمع أدوات غير مترابطة إطلاقًا تحت نفس "المورد"."""
    if not path:
        return ""
    segs = path.strip("/").split("/")
    norm = ["{}" if (s.startswith("{") and s.endswith("}")) else s for s in segs]
    while norm and norm[-1] == "{}":
        norm.pop()
    return "/".join(norm)


def build_rule_based(perms: list) -> dict:
    """روابط نفس المورد+المجموعة: عملية تعديل/حذف/... تعتمد على عرض القائمة/التفاصيل لنفس المورد."""
    rule_deps: dict = {}
    clusters: dict = {}
    for p in perms:
        res = resource_of(p.get("linked_api_path", ""))
        clusters.setdefault((p["group_key"], res), []).append(p)
    for (_gk, _res), items in clusters.items():
        view_keys = [p["key"] for p in items if p["operation_type"] in VIEW_OPS]
        if not view_keys:
            continue
        for p in items:
            if p["operation_type"] in DEPENDENT_OPS:
                deps = [k for k in view_keys if k != p["key"]]
                if deps:
                    rule_deps[p["key"]] = deps
    return rule_deps


async def ai_group_suggestions(chat: LlmChat, group_key: str, items: list) -> dict:
    """اقتراحات روابط إضافية داخل نفس المجموعة فقط (محافظة — فارغة عند الشك)."""
    lines = [f"- {p['key']}: {p['label_ar']} — {p.get('description_ar', '')}" for p in items]
    prompt = (
        f"لديك كل صلاحيات مجموعة '{group_key}' في نظام جامعي:\n" + "\n".join(lines) + "\n\n"
        "لكل صلاحية فيها علاقة اعتماد واضحة ومنطقية على صلاحية أخرى من نفس القائمة (غير روابط "
        "عرض القائمة/التفاصيل البديهية التي عولجت مسبقًا)، أعد خريطة JSON: "
        '{"مفتاح_الصلاحية": ["مفتاح الصلاحية المعتمد عليها", ...]}. '
        "كن محافظًا جدًا: إن لم تكن واثقًا تمامًا من الربط، لا تذكره. "
        "لا تُدرج أي صلاحية ضمن قائمة اعتمادها الخاصة. أعد JSON فقط بلا أي نص آخر، وإن لم توجد أي روابط إضافية أعد {}."
    )
    try:
        resp = await chat.send_message(UserMessage(text=prompt))
        text = resp if isinstance(resp, str) else str(resp)
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return {}
        data = json.loads(m.group(0))
        valid_keys = {p["key"] for p in items}
        out = {}
        for k, v in data.items():
            if k in valid_keys and isinstance(v, list):
                clean = [x for x in v if x in valid_keys and x != k]
                if clean:
                    out[k] = clean
        return out
    except Exception as e:
        print(f"AI_GROUP_ERROR group={group_key} err={e}")
        return {}


async def main():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    perms = await db.advanced_permissions.find({}, {"_id": 0}).to_list(2000)
    print(f"TOTAL_PERMS={len(perms)}")

    rule_deps = build_rule_based(perms)
    print(f"RULE_BASED_COUNT={len(rule_deps)}")

    by_group: dict = {}
    for p in perms:
        by_group.setdefault(p["group_key"], []).append(p)

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id="perm-deps-gen",
        system_message="أنت خبير تصميم أنظمة صلاحيات. مهمتك اقتراح روابط اعتماد منطقية بين الصلاحيات، بحذر شديد وعدم التخمين.",
    ).with_model("anthropic", "claude-sonnet-5-5")

    ai_deps: dict = {}
    for gk, items in by_group.items():
        for i in range(0, len(items), 35):
            chunk = items[i:i + 35]
            result = await ai_group_suggestions(chat, gk, chunk)
            for k, v in result.items():
                ai_deps.setdefault(k, set()).update(v)
            print(f"AI_GROUP_DONE group={gk} chunk={i} suggestions={len(result)}")

    final_deps: dict = {}
    for p in perms:
        key = p["key"]
        merged = set(rule_deps.get(key, [])) | ai_deps.get(key, set())
        merged.discard(key)
        if merged:
            final_deps[key] = sorted(merged)

    print(f"FINAL_DEPS_COUNT={len(final_deps)}")

    for key, deps in final_deps.items():
        await db.advanced_permissions.update_one({"key": key}, {"$set": {"depends_on": deps}})
    # تنظيف: إزالة depends_on من أي صلاحية لم تعد لها روابط (إعادة تشغيل آمنة)
    no_dep_keys = [p["key"] for p in perms if p["key"] not in final_deps]
    if no_dep_keys:
        await db.advanced_permissions.update_many({"key": {"$in": no_dep_keys}}, {"$unset": {"depends_on": ""}})

    # 🆕 كتابة مباشرة لملف السجل المصدري (الدرس المستفاد من مشكلة التعريفات السابقة):
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        json_perms = json.load(f)
    for jp in json_perms:
        deps = final_deps.get(jp["key"])
        if deps:
            jp["depends_on"] = deps
        elif "depends_on" in jp:
            del jp["depends_on"]
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(json_perms, f, ensure_ascii=False, indent=2)
    print("JSON_FILE_UPDATED")


if __name__ == "__main__":
    asyncio.run(main())
