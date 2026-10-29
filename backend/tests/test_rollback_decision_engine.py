# اختبار محرك قرار التراجع (Feature Flags + Emergency Kill Switch) — Phase 6B
# لا يُستدعى عبر HTTP؛ يستورد services.feature_flag_service مباشرة ويختبر كل طبقة أمان على حدة.
# يثبت: فشل قراءة قاعدة البيانات، تعطّل المحرك (غير قابل للوصول أصلاً بسبب القفل)، طلبات متزامنة،
# وأن القرار الفعلي يبقى "legacy" دائمًا في هذه المرحلة.
import asyncio
import os
import sys

from dotenv import load_dotenv

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from services import feature_flag_service as ffs  # noqa: E402

ok = fail = 0


def check(name, cond, info=""):
    global ok, fail
    ok += cond
    fail += (not cond)
    print(("✅" if cond else "❌"), name, "" if cond else info)


class _BrokenDB:
    """محاكاة تعطّل قاعدة البيانات: أي عملية تُثار استثناءً"""
    def __getattr__(self, name):
        raise ConnectionError("simulated DB outage")


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    try:
        # 1) القفل البرمجي ACTIVATION_LOCKED_PHASE6B يفرض legacy دائمًا، حتى لو المفتاح المركزي ON
        await db.advanced_access_feature_flags.update_one(
            {"_id": "singleton"}, {"$set": {"master_enabled": True, "scoped_activations": [
                {"scope_type": "user", "ref_id": "any_user"}
            ]}}, upsert=True,
        )
        r = await ffs.evaluate_rollback_decision(db, user_id="any_user")
        check("القفل البرمجي يفرض legacy حتى مع master_enabled=True ونطاق مطابق", r["decision"] == "legacy" and r["stopped_at"] == "activation_locked", r)

        # 2) تجاوز القفل للاختبار الداخلي فقط (غير مُعرَّض عبر أي API) — يثبت أن الطبقات الأعمق تعمل بذاتها
        r2 = await ffs.evaluate_rollback_decision(db, user_id="any_user", _bypass_lock_for_test=True)
        check("مع تجاوز القفل (اختبار داخلي فقط) ونطاق مفعَّل فعليًا، يصل المنطق لمرحلة المحرك", r2["stopped_at"] == "none" and r2["decision"] == "new_engine_placeholder_unreachable", r2)

        # 3) مفتاح الإيقاف الطارئ (env) له أولوية مطلقة فوق كل شيء، حتى مع تجاوز القفل
        os.environ["ADV_ACCESS_EMERGENCY_KILL_SWITCH"] = "true"
        r3 = await ffs.evaluate_rollback_decision(db, user_id="any_user", _bypass_lock_for_test=True)
        check("مفتاح الإيقاف الطارئ يفرض legacy حتى مع تجاوز القفل", r3["decision"] == "legacy" and r3["stopped_at"] == "emergency_kill_switch", r3)
        del os.environ["ADV_ACCESS_EMERGENCY_KILL_SWITCH"]
        check("kill_switch_engaged() ترجع False عند عدم ضبط المتغير (الحالة الافتراضية)", ffs.kill_switch_engaged() is False)

        # 4) فشل قراءة قاعدة البيانات (تعطّل) → فشل آمن إلى legacy، وليس رفع استثناء
        r4 = await ffs.evaluate_rollback_decision(_BrokenDB(), user_id="any_user", _bypass_lock_for_test=True)
        check("تعطّل قاعدة البيانات → فشل آمن إلى legacy بلا استثناء", r4["decision"] == "legacy" and r4["stopped_at"] == "db_read_failure", r4)

        # 5) المفتاح المركزي OFF (بعد تجاوز القفل) → legacy
        await db.advanced_access_feature_flags.update_one({"_id": "singleton"}, {"$set": {"master_enabled": False}})
        r5 = await ffs.evaluate_rollback_decision(db, user_id="any_user", _bypass_lock_for_test=True)
        check("المفتاح المركزي OFF (حتى مع تجاوز القفل) → legacy", r5["decision"] == "legacy" and r5["stopped_at"] == "master_flag_off", r5)

        # 6) المفتاح المركزي ON لكن النطاق غير مُفعَّل → legacy
        await db.advanced_access_feature_flags.update_one({"_id": "singleton"}, {"$set": {"master_enabled": True, "scoped_activations": []}})
        r6 = await ffs.evaluate_rollback_decision(db, user_id="any_user", _bypass_lock_for_test=True)
        check("النطاق غير مُفعَّل (قائمة فارغة) → legacy", r6["decision"] == "legacy" and r6["stopped_at"] == "scope_not_activated", r6)

        # 7) طلبات متزامنة لا تُفسد مستند المفاتيح ولا سجل التدقيق
        actor = {"id": "sim_actor", "username": "sim_tester"}
        before_count = await db.advanced_rollback_audit_logs.count_documents({"actor_user_id": "sim_actor"})
        await asyncio.gather(*[
            ffs.write_rollback_audit_log(db, actor, "concurrency_test", reason=f"run-{i}", before=i, after=i + 1)
            for i in range(20)
        ])
        after_count = await db.advanced_rollback_audit_logs.count_documents({"actor_user_id": "sim_actor"})
        check("20 كتابة متزامنة لسجل التدقيق تصل كلها بلا فقدان", after_count - before_count == 20, after_count - before_count)

        # 8) القرار الفعلي (بلا تجاوز القفل) يبقى legacy دومًا بصرف النظر عن أي تضارب في الحالة أعلاه
        r8 = await ffs.evaluate_rollback_decision(db, user_id="any_user")
        check("القرار الحقيقي (بدون تجاوز اختباري) = legacy دائمًا في هذه المرحلة", r8["decision"] == "legacy")
    finally:
        await db.advanced_rollback_audit_logs.delete_many({"actor_user_id": "sim_actor"})
        await db.advanced_access_feature_flags.update_one(
            {"_id": "singleton"}, {"$set": {**ffs.DEFAULT_FLAGS}}, upsert=True,
        )
        os.environ.pop("ADV_ACCESS_EMERGENCY_KILL_SWITCH", None)

    print(f"\n{ok} passed, {fail} failed")
    sys.exit(1 if fail else 0)


asyncio.run(main())
