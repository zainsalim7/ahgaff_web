"""
خدمة منظومة التحكم والتراجع الآمن (Feature Flags + Emergency Kill Switch) — Phase 6B
«إنشاء منظومة التحكم والتراجع الآمن لنظام الصلاحيات المتقدم»

مستقلة تمامًا عن services/advanced_access_service.py (محرك حساب الصلاحيات نفسه) وعن
routes/deps.py (النظام القديم) — لا تُستدعى من أي منهما، ولا تُستدعى من أي مسار قديم.
هذا الملف لا يُغيّر سلوك أي API قديم ولا يُفعِّل أي وصول فعلي.

⚠️ القفل البرمجي (ACTIVATION_LOCKED_PHASE6B): طالما قيمته True، فإن evaluate_rollback_decision
تُعيد "legacy" دائمًا بصرف النظر عن أي مفتاح في قاعدة البيانات — هذا هو الدليل العملي أن النظام
الجديد لا يزال غير قادر على فرض أي قرار حقيقي في الإنتاج. لا يُزال هذا القفل إلا بتعديل صريح لهذا
الثابت في الكود، بعد موافقة منفصلة لاحقة (المرحلة 7) — وليس عبر أي واجهة إدارية أو قيمة في القاعدة.
"""
import os
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

# 🔒 القفل البرمجي الصريح لهذه المرحلة — لا تفعيل فعلي لأي مستخدم/وحدة مهما كانت قيم المفاتيح أدناه
ACTIVATION_LOCKED_PHASE6B = True

DEFAULT_FLAGS: Dict[str, Any] = {
    "master_enabled": False,
    "scoped_activations": [],
    "updated_by": None,
    "updated_by_username": None,
    "updated_at": None,
    "last_reason": None,
}


def _now():
    return datetime.now(timezone.utc)


def kill_switch_engaged() -> bool:
    """مفتاح إيقاف طارئ مستقل تمامًا عن قاعدة البيانات — يُضبط فقط عبر متغير بيئة الخادم.
    الأولوية المطلقة: إن كان مفعَّلاً، يُفرض القرار القديم فورًا دون أي قراءة لقاعدة البيانات أو المحرك."""
    return os.environ.get("ADV_ACCESS_EMERGENCY_KILL_SWITCH", "false").strip().lower() in ("1", "true", "yes", "on")


async def ensure_rollback_indexes(db):
    """فهارس مجموعات هذه المنظومة فقط — لا تمس أي فهرس قديم أو فهرس محرك الصلاحيات الجديد."""
    await db.advanced_rollback_audit_logs.create_index([("timestamp", -1)])
    await db.advanced_access_feature_flags.create_index("_id")


async def ensure_flags_doc(db):
    await db.advanced_access_feature_flags.update_one(
        {"_id": "singleton"}, {"$setOnInsert": {**DEFAULT_FLAGS, "_id": "singleton"}}, upsert=True
    )


async def get_flags_doc(db) -> dict:
    """قراءة مستند المفاتيح (تضمن وجوده أولاً). قد ترفع استثناءً إن تعطّلت قاعدة البيانات —
    استخدم _get_flags_doc_safe عندما يجب ألا يفشل القرار أبدًا."""
    await ensure_flags_doc(db)
    doc = await db.advanced_access_feature_flags.find_one({"_id": "singleton"})
    return doc or {**DEFAULT_FLAGS, "_id": "singleton"}


async def _get_flags_doc_safe(db) -> dict:
    """فشل آمن: أي استثناء (تعطّل اتصال قاعدة البيانات مثلاً) يُعيد الحالة الافتراضية الآمنة
    (master_enabled=False) بدل رفع الاستثناء — لا يُفعَّل أي شيء تلقائيًا عند الفشل."""
    try:
        return await get_flags_doc(db)
    except Exception:
        return {**DEFAULT_FLAGS, "_id": "singleton", "_read_error": True}


def _scope_activated(flags: dict, user_id: Optional[str], department_id: Optional[str],
                      faculty_id: Optional[str], unit_id: Optional[str]) -> bool:
    for s in (flags.get("scoped_activations") or []):
        if user_id and s.get("scope_type") == "user" and s.get("ref_id") == user_id:
            return True
        if department_id and s.get("scope_type") == "department" and s.get("ref_id") == department_id:
            return True
        if faculty_id and s.get("scope_type") == "faculty" and s.get("ref_id") == faculty_id:
            return True
        if unit_id and s.get("scope_type") == "unit" and s.get("ref_id") == unit_id:
            return True
    return False


async def evaluate_rollback_decision(db, *, user_id: Optional[str] = None, department_id: Optional[str] = None,
                                      faculty_id: Optional[str] = None, unit_id: Optional[str] = None,
                                      _bypass_lock_for_test: bool = False) -> Dict[str, Any]:
    """القرار الفعلي لمصدر الصلاحية — غير مُستدعاة من أي مسار قديم حاليًا (غير مُفعَّلة في الإنتاج بعد).
    كل طبقة مستقلة ومُختبَرة على حدة. _bypass_lock_for_test غير مُعرَّضة عبر أي API — تُستخدم فقط
    من اختبارات pytest الداخلية لإثبات أن الطبقات 3-5 تفشل آمنًا بذاتها، وليس فقط بسبب القفل أعلاها."""
    trace: List[str] = []

    if kill_switch_engaged():
        trace.append("emergency_kill_switch_engaged")
        return {"decision": "legacy", "stopped_at": "emergency_kill_switch", "trace": trace}

    if ACTIVATION_LOCKED_PHASE6B and not _bypass_lock_for_test:
        trace.append("activation_locked_phase6b")
        return {"decision": "legacy", "stopped_at": "activation_locked", "trace": trace}

    flags = await _get_flags_doc_safe(db)
    if flags.get("_read_error"):
        trace.append("db_read_failure_failsafe")
        return {"decision": "legacy", "stopped_at": "db_read_failure", "trace": trace}

    if not flags.get("master_enabled"):
        trace.append("master_flag_off")
        return {"decision": "legacy", "stopped_at": "master_flag_off", "trace": trace}

    if not _scope_activated(flags, user_id, department_id, faculty_id, unit_id):
        trace.append("scope_not_activated")
        return {"decision": "legacy", "stopped_at": "scope_not_activated", "trace": trace}

    # ⚠️ غير قابل للوصول فعليًا في هذه المرحلة (activation مقفلة دائمًا أعلاه) — محجوز لمرحلة مستقبلية
    trace.append("would_call_new_engine_unreachable_in_this_phase")
    return {"decision": "new_engine_placeholder_unreachable", "stopped_at": "none", "trace": trace}


async def write_rollback_audit_log(db, actor: dict, action: str, reason: Optional[str] = None,
                                    before: Any = None, after: Any = None):
    """سجل تدقيق مستقل لعمليات هذه المنظومة فقط — لا يُظهر أي قيمة لمفتاح/سر حساس (قيم env لا تُسجَّل أبدًا)."""
    await db.advanced_rollback_audit_logs.insert_one({
        "actor_user_id": str(actor.get("id") or actor.get("_id")),
        "actor_username": actor.get("username"),
        "action": action,
        "reason": reason,
        "before": before,
        "after": after,
        "timestamp": _now(),
    })
