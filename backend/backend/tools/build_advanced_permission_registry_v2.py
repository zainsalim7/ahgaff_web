"""
🏗️ بناء سجل الصلاحيات المتقدم من نتائج الفحص - الإصدار 2 (المرحلة 7-د)
يقرأ tools/generated/api_endpoints_scan_v2.json (ناتج scan_api_endpoints_v2.py - ماسح AST يتتبّع
متغيرات الاختصار والاستيراد بين الملفات) بدل ملف الإصدار 1.
يُعيد استخدام نفس منطق التصنيف (المجموعة/نوع العملية/الخطورة) من الإصدار 1 دون أي تغيير فيه - التحسين
الوحيد هنا هو مصدر اكتشاف الصلاحيات القديمة (legacy_permissions_detected) + حقول جديدة (تفاصيل الحل،
المراجع غير القابلة للحل، عمليات النطاق الإداري/الأكاديمي المكتشفة عبر assert_in_scope).
+ تصحيح معتمَد صراحة من المستخدم (المرحلة 7-ب ← فجوة تنفيذ اكتُشفت في 7-ج ← طُبِّقت فعليًا هنا 7-د):
  ترقية خطورة صلاحيتي "تعديل درجة" و"حذف دفعة استيراد درجات" إلى "عالية" (كانتا "متوسطة" خطأً).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_advanced_permission_registry import (  # noqa: E402
    GEN_DIR, FILE_GROUP_MAP, DEFAULT_GROUP, _server_group, _operation_type, _sensitivity, _label_ar,
)
import re

SCAN_PATH_V2 = GEN_DIR + "/api_endpoints_scan_v2.json"

# 🔒 تصحيح معتمَد صراحة من المستخدم في جولة الموافقة على المرحلة 7-د (29 أكتوبر 2026):
# الصلاحيتان كانتا مُصنَّفتين "عالية" في تقرير 7-ب (نص فقط) لكن التصنيف الفعلي في قاعدة البيانات لم
# يُحدَّث فعليًا (فجوة تنفيذ اكتُشفت في تقرير 7-ج) وعاد "متوسط" بعد أي إعادة توليد لاحقة. هذا التصحيح الآن
# جزء من مصدر التوليد نفسه (وليس تعديلاً عابرًا على قاعدة البيانات) كي يبقى ثابتًا عبر أي إعادة بناء مستقبلية.
SENSITIVITY_OVERRIDES = {
    ("routes/grades.py", "update_grade_record"): "high",
    ("routes/grades.py", "delete_grade_import"): "high",
}


def build():
    with open(SCAN_PATH_V2, "r", encoding="utf-8") as f:
        endpoints = json.load(f)

    authed = [e for e in endpoints if e["auth_kind"] == "user_auth"]
    excluded_public = [e for e in endpoints if e["auth_kind"] == "public"]
    excluded_service = [e for e in endpoints if e["auth_kind"] == "service_key_auth"]

    groups_seen = {}
    permissions = []
    key_counts = {}
    overrides_applied = []
    for e in authed:
        if e["file"] == "server":
            group_key, group_name = _server_group(e["path"])
        else:
            group_key, group_name = FILE_GROUP_MAP.get(e["file"], DEFAULT_GROUP)
        groups_seen[group_key] = group_name
        op = _operation_type(e["method"], e["path"])
        sensitivity = _sensitivity(e["method"], e["path"], op)
        override_id = (e["file"], e["function"])
        if override_id in SENSITIVITY_OVERRIDES and sensitivity != SENSITIVITY_OVERRIDES[override_id]:
            overrides_applied.append({"file": e["file"], "function": e["function"], "from": sensitivity, "to": SENSITIVITY_OVERRIDES[override_id]})
            sensitivity = SENSITIVITY_OVERRIDES[override_id]
        label = _label_ar(e["function"], op, e["path"])
        raw_key = re.sub(r"[^a-z0-9_]", "_", f"{group_key}.{e['file'].split('/')[-1][:-3]}.{e['function']}".lower())
        n = key_counts.get(raw_key, 0)
        key_counts[raw_key] = n + 1
        final_key = raw_key if n == 0 else f"{raw_key}_{n+1}"
        requires_scope = any(u["gate_function"] == "assert_in_scope" for u in e.get("unresolved_dynamic_refs", [])) or \
            any(d["gate_function"] == "assert_in_scope" for d in e.get("resolution_detail", []))
        permissions.append({
            "key": final_key,
            "label_ar": label,
            "group_key": group_key,
            "operation_type": op,
            "sensitivity": sensitivity,
            "linked_api": f"{e['method']} {e['path']}",
            "linked_api_method": e["method"],
            "linked_api_path": e["path"],
            "source_file": e["file"],
            "source_function": e["function"],
            "legacy_permissions_detected": e["legacy_permissions_detected"],
            "admin_only_detected": e["admin_only_detected"],
            "resolution_detail": e.get("resolution_detail", []),
            "unresolved_dynamic_refs": e.get("unresolved_dynamic_refs", []),
            "requires_admin_scope": requires_scope,
            "is_active": True,
        })

    groups = [{"key": k, "name_ar": v, "count": sum(1 for p in permissions if p["group_key"] == k)} for k, v in sorted(groups_seen.items())]

    with open(GEN_DIR + "/advanced_permissions.json", "w", encoding="utf-8") as f:
        json.dump(permissions, f, ensure_ascii=False, indent=2)
    with open(GEN_DIR + "/advanced_permission_groups.json", "w", encoding="utf-8") as f:
        json.dump(groups, f, ensure_ascii=False, indent=2)
    with open(GEN_DIR + "/excluded_endpoints.json", "w", encoding="utf-8") as f:
        json.dump({
            "public_no_auth": [{"method": e["method"], "path": e["path"], "file": e["file"], "reason": "عام بلا تسجيل دخول بالتصميم (تحقق/تسجيل دخول/صحة النظام)"} for e in excluded_public],
            "service_key_auth": [{"method": e["method"], "path": e["path"], "file": e["file"], "reason": "مصادقة خادم-لخادم بمفتاح خدمة، ليست صلاحية مستخدم بشري"} for e in excluded_service],
        }, f, ensure_ascii=False, indent=2)

    print(f"TOTAL_ENDPOINTS_SCANNED={len(endpoints)}")
    print(f"PERMISSIONS_CREATED={len(permissions)}")
    print(f"GROUPS_CREATED={len(groups)}")
    print(f"EXCLUDED_PUBLIC={len(excluded_public)}")
    print(f"EXCLUDED_SERVICE_KEY={len(excluded_service)}")
    coverage = len(permissions) / len(endpoints) * 100
    print(f"COVERAGE_PCT={coverage:.1f}")
    by_sensitivity = {}
    for p in permissions:
        by_sensitivity[p["sensitivity"]] = by_sensitivity.get(p["sensitivity"], 0) + 1
    print("BY_SENSITIVITY=", by_sensitivity)
    sensitive_total = by_sensitivity.get("critical", 0) + by_sensitivity.get("high", 0)
    print(f"SENSITIVE_TOTAL(critical+high)={sensitive_total}")
    with_legacy_link = sum(1 for p in permissions if p["legacy_permissions_detected"] or p["admin_only_detected"])
    print(f"WITH_LEGACY_PERMISSION_TRACE={with_legacy_link}")
    print(f"WITH_ADMIN_SCOPE_REQUIRED={sum(1 for p in permissions if p['requires_admin_scope'])}")
    print("SENSITIVITY_OVERRIDES_APPLIED=", overrides_applied)


if __name__ == "__main__":
    build()
