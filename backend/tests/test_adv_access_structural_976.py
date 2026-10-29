# اختبار بنيوي (Structural) شامل لكل الصلاحيات الـ976 — يتحقق من ارتباط كل صلاحية بدالة/مسار API حقيقي
# في الكود الفعلي (ليس فقط وجودها في قاعدة البيانات). لا يُجري أي استدعاء HTTP ولا يلمس أي بيانات —
# قراءة من MongoDB (pymongo متزامن) + فحص ملفات المصدر فقط. هذا لا يثبت وجود حماية فعلية (ذلك اختبار
# سلوكي منفصل، انظر test_adv_access_phase4_behavioral.py)، بل فقط أن سجل الصلاحيات دقيق ومطابق للكود الحقيقي.
import os
import re
import pytest
from pymongo import MongoClient
from dotenv import load_dotenv

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))


def _db():
    client = MongoClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def all_permissions():
    return list(_db().advanced_permissions.find({}))


@pytest.fixture(scope="module")
def all_groups():
    return list(_db().advanced_permission_groups.find({}))


def test_exactly_1026_active_permissions_in_31_groups(all_permissions, all_groups):
    """العدد 976 (المرحلة 2) أصبح 1026 بعد المرحلة 7-د: نمو حقيقي في عدد الـ Endpoints منذ ذلك الحين
    (1021→1071 إجمالي الآن)، وليس خطأ في الماسح. هذا الاختبار يُحدَّث عمدًا عند أي إعادة بناء مستقبلية
    للسجل — العدد الثابت هنا ليس افتراضًا بل قيمة مُتحقَّق منها وقت هذا التحديث (29 أكتوبر 2026)."""
    active = [p for p in all_permissions if p.get("is_active")]
    assert len(active) == 1026, f"متوقَّع 1026 صلاحية نشطة، الفعلي: {len(active)}"
    assert len(all_groups) == 31, f"متوقَّع 31 مجموعة، الفعلي: {len(all_groups)}"


def test_every_permission_has_valid_group(all_permissions, all_groups):
    group_keys = {g["key"] for g in all_groups}
    orphans = [p["key"] for p in all_permissions if p.get("group_key") not in group_keys]
    assert not orphans, f"صلاحيات بمجموعة غير موجودة: {orphans[:10]}"


def test_all_1026_permissions_linked_to_real_source_function(all_permissions):
    """لكل صلاحية نشطة: source_file موجود فعليًا + source_function معرّفة فعليًا داخله (regex مباشر على الكود)."""
    perms = [p for p in all_permissions if p.get("is_active")]
    assert len(perms) == 1026

    file_cache = {}
    broken = []
    checked = 0
    for p in perms:
        key = p["key"]
        src_file = p.get("source_file")
        src_func = p.get("source_function")
        if not src_file or not src_func:
            broken.append((key, "missing source_file/source_function in record"))
            continue
        # اتفاقية الماسح الأصلي (scan_api_endpoints.py): "server" يعني server.py (بلا امتداد)، بعكس routes/*.py
        candidate = "server.py" if src_file == "server" else src_file
        full_path = os.path.join(BACKEND_DIR, candidate)
        if not os.path.isfile(full_path):
            broken.append((key, f"source_file not found: {src_file}"))
            continue
        if full_path not in file_cache:
            with open(full_path, "r", encoding="utf-8") as f:
                file_cache[full_path] = f.read()
        content = file_cache[full_path]
        pattern = re.compile(r"(async\s+)?def\s+" + re.escape(src_func) + r"\s*\(")
        if not pattern.search(content):
            broken.append((key, f"function '{src_func}' not found in {src_file}"))
            continue
        checked += 1

    coverage_pct = round(checked / len(perms) * 100, 2)
    print(f"\nStructural linkage verified: {checked}/{len(perms)} ({coverage_pct}%)")
    if broken:
        print(f"Broken links ({len(broken)}):")
        for b in broken[:30]:
            print(" -", b)
    assert checked == len(perms), f"{len(broken)} صلاحية غير مرتبطة فعليًا بدالة حقيقية في الكود"


def test_every_permission_has_linked_api_path_and_method(all_permissions):
    perms = [p for p in all_permissions if p.get("is_active")]
    missing = [p["key"] for p in perms if not p.get("linked_api_path") or not p.get("linked_api_method")]
    assert not missing, f"صلاحيات بلا مسار/طريقة API مرتبطة: {missing[:10]}"


def test_permissions_per_group_sample_distribution(all_permissions, all_groups):
    """كل مجموعة من الـ30 يجب أن تحتوي صلاحية واحدة على الأقل (لا مجموعة فارغة)."""
    from collections import Counter
    counts = Counter(p.get("group_key") for p in all_permissions if p.get("is_active"))
    empty_groups = [g["key"] for g in all_groups if counts.get(g["key"], 0) == 0]
    assert not empty_groups, f"مجموعات بلا أي صلاحية نشطة: {empty_groups}"
    print("\nتوزيع الصلاحيات على المجموعات الثلاثين:")
    for g in all_groups:
        print(f"  {g['key']}: {counts.get(g['key'], 0)}")
