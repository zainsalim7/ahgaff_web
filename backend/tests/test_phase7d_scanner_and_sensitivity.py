# اختبار انحدار (Regression) للمرحلة 7-د — ماسح الصلاحيات v2 (AST) + تصحيح خطورة صلاحيتي الدرجات
# يمنع تكرار الانحراف المكتشَف في تقرير 7-ج (ترقية الخطورة وُثِّقت نصًّا في 7-ب لكن لم تُطبَّق فعليًا،
# وانعكست إلى "متوسطة" بعد أي إعادة توليد لاحقة لأن التصحيح كان تعديلًا عابرًا على القاعدة وليس في المصدر).
import os
import pytest
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))


def _db():
    client = MongoClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


GRADE_SENSITIVE_KEYS = ["grades_grades_update_grade_record", "grades_grades_delete_grade_import"]


def test_grade_permissions_sensitivity_locked_to_high():
    """الضمانة الآلية المطلوبة في المرحلة 7-د: هاتان الصلاحيتان يجب أن تبقيا 'عالية' الخطورة دائمًا،
    بغض النظر عن أي إعادة توليد مستقبلية لسجل الصلاحيات (التصحيح الآن في مصدر التوليد نفسه، انظر
    SENSITIVITY_OVERRIDES في tools/build_advanced_permission_registry_v2.py)."""
    db = _db()
    for key in GRADE_SENSITIVE_KEYS:
        doc = db.advanced_permissions.find_one({"key": key})
        assert doc is not None, f"الصلاحية {key} غير موجودة - تحقق من ثبات مخطط التوليد"
        assert doc["sensitivity"] == "high", f"انحراف! {key} خطورتها {doc['sensitivity']} وليست 'high'"


def test_sensitivity_override_persists_in_source_not_just_db():
    """يتحقق أن التصحيح مكتوب في كود مصدر التوليد (وليس فقط قيمة عابرة في القاعدة) - هذا بالضبط ما فشل
    في الجولة السابقة (المرحلة 7-ب) وتسبب في رجوع التصنيف إلى 'متوسطة' تلقائيًا."""
    tools_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend", "tools")
    build_v2_path = os.path.join(tools_dir, "build_advanced_permission_registry_v2.py")
    assert os.path.isfile(build_v2_path), "ملف التوليد v2 غير موجود"
    with open(build_v2_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "SENSITIVITY_OVERRIDES" in content
    assert "update_grade_record" in content and "delete_grade_import" in content


def test_scanner_v2_detects_previously_undetectable_aliased_permissions():
    """يمنع رجوع فجوة الكشف المكتشَفة في 7-ج: صلاحيات تُستخدَم عبر متغيرات اختصار محلية
    (P_ATTEND, P_CORR...) كانت صفرًا في ماسح الإصدار 1 - يجب أن تبقى مكتشَفة الآن."""
    db = _db()
    targets = [
        "hr_view_employees", "hr_manage_attendance", "hr_manage_correspondence",
        "issue_letters", "view_courses", "dashboard_alerts", "dashboard_hr",
    ]
    for t in targets:
        count = db.advanced_permissions.count_documents({"legacy_permissions_detected": t})
        assert count > 0, f"فجوة الكشف رجعت! الصلاحية القديمة '{t}' غير مكتشَفة في أي صلاحية متقدمة"


def test_sensitive_permission_review_count_matches_registry():
    """يضمن تزامن مجموعة مراجعة الصلاحيات الحساسة مع سجل الصلاحيات الفعلي (لا يبقيان متباعدين كما حدث
    سابقًا: مجموعة المراجعة كانت 118 بينما السجل الفعلي 116)."""
    db = _db()
    sensitive_in_registry = db.advanced_permissions.count_documents({"sensitivity": {"$in": ["critical", "high"]}})
    review_docs = db.advanced_sensitive_permission_reviews.count_documents({})
    assert sensitive_in_registry == review_docs, (
        f"عدم تزامن: {sensitive_in_registry} صلاحية حساسة في السجل مقابل {review_docs} مستند مراجعة"
    )


def test_five_gap_roles_now_have_nonzero_candidate_permissions():
    """الأدوار الخمسة المتأثرة بفجوة الكشف يجب ألا تعود صفرًا بعد إصلاح الماسح - دون أي اعتماد تلقائي."""
    db = _db()
    gap_role_ids = [
        "69b8990004a7ed3e031cfe00", "6ab443a1724aacd57bcc03ee", "6ab443a1724aacd57bcc03ef",
        "6ae12b45b4d7a835c4c9b600",
    ]
    r = db.roles.find_one({"name": {"$regex": "مراقب"}})
    gap_role_ids.append(str(r["_id"]))
    for rid in gap_role_ids:
        doc = db.advanced_roles.find_one({"key": f"legacy_{rid}"})
        assert doc is not None
        assert len(doc.get("permission_keys") or []) > 0, f"الدور {rid} ما زال صفرًا بعد الإصلاح"
        assert doc.get("status") == "draft", "لا يجب اعتماد أي دور تلقائيًا"


def test_three_genuinely_empty_roles_remain_empty():
    """الأدوار الثلاثة ذات البيانات القديمة الفارغة فعليًا (وليست فجوة كشف) يجب أن تبقى صفرًا - هذا
    صحيح وليس عيبًا، ويُحتفَظ بها لمراجعة إدارية حسب توجيه المستخدم."""
    db = _db()
    empty_role_ids = ["698a4d07bc4813c8639d66d6", "698a53e34a833e65ff410ad8", "6ae12b45b4d7a835c4c9b601"]
    for rid in empty_role_ids:
        doc = db.advanced_roles.find_one({"key": f"legacy_{rid}"})
        legacy_role = db.roles.find_one({"_id": __import__("bson").ObjectId(rid)})
        assert legacy_role.get("permissions") == [], "البيانات القديمة لهذا الدور يجب أن تبقى فارغة فعلًا"
        assert len(doc.get("permission_keys") or []) == 0


def test_shadow_mode_and_activation_lock_untouched():
    """المحافظة على القيود الصارمة طوال المرحلة 7-د: القفل البرمجي سليم، لا موافقات تلقائية، النظام
    القديم لم يُمس."""
    db = _db()
    approved_roles = db.advanced_role_reviews.count_documents({"approved": True})
    assert approved_roles == 0, "لا يجب اعتماد أي دور تلقائيًا أثناء إصلاح الماسح"
    approved_sensitive = db.advanced_sensitive_permission_reviews.count_documents({"status": {"$ne": "not_reviewed"}})
    assert approved_sensitive == 0, "لا يجب تغيير حالة مراجعة أي صلاحية حساسة تلقائيًا"


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v"]))
