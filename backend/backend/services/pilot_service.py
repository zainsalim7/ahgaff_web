"""
خدمة "التجربة التشغيلية المحدودة" (Phase 5 Pilot) لمركز الصلاحيات المتقدم — SHADOW MODE بالكامل
تُنشئ أدوارًا وتكليفات تجريبية بادئتها PILOT_ لعدد محدود من المستخدمين الحقيقيين المعتمدين من المستخدم
(Salim، Saeed، teacher180156) باستخدام نطاقاتهم التنظيمية الحقيقية (كلية/قسم/مقرر)، وتُسجِّل نتائج
فحوصات سلوكية وأمنية فعلية. لا تُستخدم أي كلمة مرور أو جلسة حقيقية لأي مستخدم — كل القرارات تُحسب
مباشرة عبر طبقة الخدمة/المسارات بتمرير معرّف المستخدم فقط (تمامًا كما يعمل المحاكي والمقارنة أصلاً).
حساب president: مقارنة بخط الأساس (صلاحياته القديمة الفعلية) فقط — بلا أي تكليف أو دور تجريبي جديد له.
"""
import random
from collections import Counter
from typing import Any, Dict, List, Optional

from bson import ObjectId

from services.advanced_access_service import (
    _now, check_permission, compute_effective_permissions, compare_decision,
    compare_summary_for_assignment, write_audit_log,
)

SALIM_ID = "698f71ba5c5620a4449eeb7e"
SALIM_FACULTY = "698e4f9297fef774e66e93a4"
OTHER_FACULTY = "698e4fb497fef774e66e93a6"

SAEED_ID = "698f79d75c5620a4449eeb89"
SAEED_DEPT = "698e501d97fef774e66e93a9"
OTHER_DEPT = "698e500997fef774e66e93a8"
UNIT_PRESIDENCY = "6ab3ec870186d4c5e32749a4"

TEACHER_ID = "698f671431cfba92c49a550e"
TEACHER_COURSE = "698f0000d803b27aab0120af"
OTHER_COURSE = "698f82b0539792f8917b7bd8"

PRESIDENT_ID = "6ab13e3709466a2b7b88502d"

SEVERITY_FOR_CATEGORY = {"both_allow": "info", "both_deny": "info", "old_allow_new_deny": "high", "new_allow_old_deny": "medium", "no_legacy_equivalent": "info"}


def _mk_case(**kw):
    status = kw.pop("status", None)
    if status is None and "expected" in kw and "actual" in kw:
        status = "pass" if kw["expected"] == kw["actual"] else "fail"
        if status == "fail" and kw.get("severity") in (None, "info"):
            kw["severity"] = "high"
    kw.setdefault("status", status)
    kw.setdefault("severity", "info")
    kw.setdefault("assignment_id", None)
    kw.setdefault("old_decision", None)
    kw.setdefault("new_decision", None)
    kw.setdefault("category", None)
    return kw


async def _username(db, user_id: str) -> str:
    u = await db.users.find_one({"_id": ObjectId(user_id)})
    return (u or {}).get("username") or user_id


async def _pick_permission_keys(db, n_with_legacy: int = 15, n_without: int = 5) -> List[str]:
    with_legacy = await db.advanced_permissions.find({"is_active": True, "legacy_permissions_detected": {"$ne": []}}).to_list(2000)
    without_legacy = await db.advanced_permissions.find({"is_active": True, "legacy_permissions_detected": []}).to_list(2000)
    random.shuffle(with_legacy)
    random.shuffle(without_legacy)
    return [p["key"] for p in with_legacy[:n_with_legacy]] + [p["key"] for p in without_legacy[:n_without]]


async def _make_pilot_role(db, label_ar: str, keys: List[str]) -> str:
    doc = {
        "key": f"pilot_{label_ar}_{ObjectId()}",
        "name_ar": f"PILOT_{label_ar}",
        "description": "دور تجريبي لمرحلة التجربة التشغيلية المحدودة (SHADOW MODE) — يُعاد إنشاؤه وحذفه مع كل تشغيل للتجربة",
        "permission_keys": keys, "status": "draft", "is_system": False,
        "created_at": _now(), "updated_at": _now(),
    }
    res = await db.advanced_roles.insert_one(doc)
    return str(res.inserted_id)


async def _make_pilot_assignment(db, user_id: str, role_id: str, label_ar: str, assignment_type: str, scope_type: str, scope_ref_ids: List[str]) -> str:
    doc = {
        "user_id": user_id, "assignment_type": assignment_type, "advanced_role_id": role_id,
        "context_label_ar": f"PILOT_{label_ar}", "scope": {"scope_type": scope_type, "scope_ref_ids": scope_ref_ids},
        "direct_permissions": [], "status": "active", "started_at": _now(), "ended_at": None,
        "created_by": "pilot_runner", "created_at": _now(),
    }
    res = await db.advanced_user_assignments.insert_one(doc)
    return str(res.inserted_id)


async def _run_scope_cases(db, user_key: str, user_id: str, assignment_id: str, keys: List[str], scope_type: str, in_ref: str, out_ref: str) -> List[dict]:
    username = await _username(db, user_id)
    out = []
    test_perm = keys[0]

    r_in = await check_permission(db, user_id, assignment_id, test_perm, scope_type, in_ref)
    out.append(_mk_case(user_key=user_key, username=username, assignment_id=assignment_id, test_type="scope_isolation_in",
                         permission_key=test_perm, target_scope_type=scope_type, target_ref_id=in_ref,
                         expected=True, actual=r_in["allowed"], reason=r_in["reason"]))

    r_out = await check_permission(db, user_id, assignment_id, test_perm, scope_type, out_ref)
    out.append(_mk_case(user_key=user_key, username=username, assignment_id=assignment_id, test_type="scope_isolation_out",
                         permission_key=test_perm, target_scope_type=scope_type, target_ref_id=out_ref,
                         expected=False, actual=r_out["allowed"], reason=r_out["reason"],
                         severity="critical" if r_out["allowed"] else "info"))

    missing_doc = await db.advanced_permissions.find_one({"is_active": True, "key": {"$nin": keys}})
    if missing_doc:
        r_missing = await check_permission(db, user_id, assignment_id, missing_doc["key"])
        out.append(_mk_case(user_key=user_key, username=username, assignment_id=assignment_id, test_type="permission_denial",
                             permission_key=missing_doc["key"], expected=False, actual=r_missing["allowed"], reason=r_missing["reason"]))
    return out


async def _run_multi_role_isolation_cases(db, user_id: str, roles_info: List[tuple]) -> List[dict]:
    """roles_info: [(label, assignment_id, keys), ...] لنفس المستخدم — يتأكد أن كل تكليف لا يرى صلاحيات غيره"""
    username = await _username(db, user_id)
    out = []
    for label_i, aid_i, keys_i in roles_info:
        own_perm = keys_i[0]
        r_own = await check_permission(db, user_id, aid_i, own_perm)
        out.append(_mk_case(user_key="saeed", username=username, assignment_id=aid_i, test_type="multi_role_own_permission",
                             permission_key=own_perm, expected=True, actual=r_own["allowed"], reason=f"[{label_i}] {r_own['reason']}"))
        for label_j, aid_j, keys_j in roles_info:
            if aid_i == aid_j:
                continue
            foreign_perm = next((k for k in keys_j if k not in keys_i), None)
            if not foreign_perm:
                continue
            r_cross = await check_permission(db, user_id, aid_i, foreign_perm)
            out.append(_mk_case(user_key="saeed", username=username, assignment_id=aid_i, test_type="multi_role_cross_isolation",
                                 permission_key=foreign_perm, expected=False, actual=r_cross["allowed"],
                                 reason=f"[{label_i}] محاولة استخدام صلاحية من [{label_j}]: {r_cross['reason']}",
                                 severity="critical" if r_cross["allowed"] else "info"))
    return out


async def _run_compare_cases(db, user_key: str, user_id: str, assignment_id: str, keys: List[str], label_suffix: str = "") -> List[dict]:
    username = await _username(db, user_id)
    out = []
    summary = await compare_summary_for_assignment(db, user_id, assignment_id)
    for d in summary.get("details", []):
        cat = d.get("category")
        out.append({
            "user_key": user_key, "username": username, "assignment_id": assignment_id,
            "test_type": f"compare_{label_suffix}" if label_suffix else "compare",
            "permission_key": d["permission_key"], "old_decision": d.get("old_decision"), "new_decision": d.get("new_decision"),
            "category": cat, "severity": SEVERITY_FOR_CATEGORY.get(cat, "info"),
            "reason": d.get("new_reason") or "", "status": "pass" if cat in ("both_allow", "both_deny") else "diff",
        })
    # حالة توضيحية: صلاحية بلا مكافئ قديم مكتشف كوديًا (no_legacy_equivalent) — لا تظهر ضمن compare_summary
    no_legacy_doc = await db.advanced_permissions.find_one({"key": {"$in": keys}, "legacy_permissions_detected": []})
    if no_legacy_doc:
        r = await compare_decision(db, user_id, assignment_id, no_legacy_doc["key"])
        out.append({
            "user_key": user_key, "username": username, "assignment_id": assignment_id,
            "test_type": f"compare_{label_suffix}" if label_suffix else "compare",
            "permission_key": no_legacy_doc["key"], "old_decision": r.get("old_decision"), "new_decision": r.get("new_decision"),
            "category": r.get("category"), "severity": "info", "reason": r.get("reason") or r.get("new_reason") or "", "status": "info",
        })
    return out


async def _run_end_assignment_case(db, user_id: str, throwaway_assignment_id: str, keep_active_ids: List[str]) -> List[dict]:
    username = await _username(db, user_id)
    out = []
    before_checks = []
    for aid in keep_active_ids:
        a = await db.advanced_user_assignments.find_one({"_id": ObjectId(aid)})
        perms = await compute_effective_permissions(db, a) if a else set()
        if perms:
            before_checks.append((aid, next(iter(perms))))

    await db.advanced_user_assignments.update_one({"_id": ObjectId(throwaway_assignment_id)}, {"$set": {"status": "ended", "ended_at": _now()}})

    r_ended = await check_permission(db, user_id, throwaway_assignment_id, "لا يوجد")
    out.append(_mk_case(user_key="saeed", username=username, assignment_id=throwaway_assignment_id, test_type="end_assignment_self_blocked",
                         permission_key="(أي صلاحية بعد الإنهاء)", expected=False, actual=r_ended["allowed"], reason=r_ended["reason"]))

    for aid, perm in before_checks:
        r_other = await check_permission(db, user_id, aid, perm)
        out.append(_mk_case(user_key="saeed", username=username, assignment_id=aid, test_type="end_assignment_others_unaffected",
                             permission_key=perm, expected=True, actual=r_other["allowed"], reason=r_other["reason"],
                             severity="high" if not r_other["allowed"] else "info"))
    return out


async def _run_security_cases(db, saeed_id: str, teacher_id: str, salim_assignment_id: str) -> List[dict]:
    from routes.advanced_access import create_assignment, update_advanced_role, get_assignment_context
    from models.advanced_access import AssignmentCreate, AdvancedRoleUpdate, AssignmentScope
    from fastapi import HTTPException

    out = []
    saeed_username = await _username(db, saeed_id)
    teacher_username = await _username(db, teacher_id)

    r_imp = await check_permission(db, teacher_id, salim_assignment_id, "لا يوجد")
    out.append(_mk_case(user_key="teacher", username=teacher_username, assignment_id=salim_assignment_id, test_type="security_impersonation",
                         permission_key="(انتحال تكليف Salim)", expected=False, actual=r_imp["allowed"], reason=r_imp["reason"],
                         severity="critical" if r_imp["allowed"] else "info"))

    saeed_user_doc = await db.users.find_one({"_id": ObjectId(saeed_id)})
    saeed_dict = {"id": saeed_id, "username": saeed_user_doc.get("username"), "role": saeed_user_doc.get("role")}
    admin_role_doc = await db.advanced_roles.find_one({"imported_from_legacy_role_id": {"$ne": None}, "name_ar": {"$regex": "مدير النظام"}})

    if admin_role_doc:
        for target_label, target_id in [("self", saeed_id), ("other_user", teacher_id)]:
            blocked = None
            try:
                res = await create_assignment(AssignmentCreate(
                    user_id=target_id, assignment_type="administrative", advanced_role_id=str(admin_role_doc["_id"]),
                    context_label_ar=f"PILOT_escalation_probe_{target_label}", scope=AssignmentScope(scope_type="university", scope_ref_ids=[]),
                ), current_user=saeed_dict)
                blocked = False
                await db.advanced_user_assignments.update_one({"_id": ObjectId(res["id"])}, {"$set": {"status": "ended", "ended_at": _now()}})
            except HTTPException as e:
                blocked = (e.status_code == 403)
            out.append(_mk_case(user_key="saeed", username=saeed_username, test_type=f"security_escalation_{target_label}",
                                 permission_key="(إسناد دور مدير النظام المستورد)", expected=True, actual=blocked,
                                 reason="تم الحظر بنجاح" if blocked else "⚠️ لم يُحظَر — تصعيد صلاحيات محتمل",
                                 severity="critical" if not blocked else "info"))

        try:
            await update_advanced_role(str(admin_role_doc["_id"]), AdvancedRoleUpdate(description="PILOT probe"), current_user=saeed_dict)
            role_blocked = False
        except HTTPException as e:
            role_blocked = (e.status_code == 403)
        out.append(_mk_case(user_key="saeed", username=saeed_username, test_type="security_imported_role_edit_block",
                             permission_key="(تعديل دور مستورد من النظام القديم)", expected=True, actual=role_blocked,
                             reason="تم الحظر بنجاح" if role_blocked else "⚠️ لم يُحظَر", severity="critical" if not role_blocked else "info"))

    teacher_dict = {"id": teacher_id, "username": teacher_username, "role": "teacher"}
    try:
        await get_assignment_context(salim_assignment_id, current_user=teacher_dict)
        idor_blocked = False
    except HTTPException as e:
        idor_blocked = (e.status_code == 403)
    out.append(_mk_case(user_key="teacher", username=teacher_username, assignment_id=salim_assignment_id, test_type="security_idor_context",
                         permission_key="(قراءة سياق عمل Salim)", expected=True, actual=idor_blocked,
                         reason="تم الحظر بنجاح" if idor_blocked else "⚠️ لم يُحظَر", severity="critical" if not idor_blocked else "info"))
    return out


async def _run_president_baseline(db) -> List[dict]:
    from routes.deps import build_user_context, has_permission as legacy_has_permission
    user_doc = await db.users.find_one({"_id": ObjectId(PRESIDENT_ID)})
    if not user_doc:
        return []
    built = await build_user_context(db, user_doc)
    sample = await db.advanced_permissions.find({"is_active": True, "legacy_permissions_detected": {"$ne": []}}).to_list(2000)
    random.shuffle(sample)
    sample = sample[:20]
    out = []
    for p in sample:
        legacy_keys = p.get("legacy_permissions_detected") or []
        old_decision = any(legacy_has_permission(built, lk) for lk in legacy_keys)
        out.append({
            "user_key": "president", "username": user_doc.get("username"), "assignment_id": None,
            "test_type": "legacy_baseline_only", "permission_key": p["key"],
            "old_decision": old_decision, "new_decision": None, "category": "legacy_baseline_only",
            "severity": "info", "status": "baseline",
            "reason": "لم يُسنَد أي دور أو تكليف تجريبي لهذا الحساب بناءً على تعليمات المستخدم — هذه قراءة لصلاحياته الحالية في النظام القديم فقط كخط أساس",
        })
    return out


def _summarize(results: List[dict]) -> Dict[str, Any]:
    total = len(results)
    pass_count = sum(1 for r in results if r.get("status") == "pass")
    fail_count = sum(1 for r in results if r.get("status") == "fail")
    by_user: Dict[str, Dict[str, int]] = {}
    for r in results:
        u = r.get("username") or "?"
        by_user.setdefault(u, {"total": 0, "pass": 0, "fail": 0, "diff": 0, "baseline": 0, "info": 0})
        by_user[u]["total"] += 1
        st = r.get("status")
        if st in by_user[u]:
            by_user[u][st] += 1
    return {
        "total_cases": total, "pass_count": pass_count, "fail_count": fail_count,
        "success_rate": round(pass_count / (pass_count + fail_count) * 100, 1) if (pass_count + fail_count) else 0,
        "security_issues_count": sum(1 for r in results if r.get("severity") == "critical" and r.get("status") == "fail"),
        "divergence_count": sum(1 for r in results if r.get("category") in ("old_allow_new_deny", "new_allow_old_deny")),
        "by_severity": dict(Counter(r.get("severity") for r in results)),
        "by_category": dict(Counter(r.get("category") for r in results if r.get("category"))),
        "by_test_type": dict(Counter(r.get("test_type") for r in results)),
        "by_user": by_user,
    }


async def reset_pilot(db) -> Dict[str, Any]:
    """إيقاف فوري للتجربة: حذف كل التكليفات والأدوار والنتائج التجريبية — لا يلمس النظام القديم إطلاقًا"""
    await db.advanced_user_assignments.delete_many({"context_label_ar": {"$regex": "^PILOT_"}})
    deleted = await db.advanced_roles.delete_many({"name_ar": {"$regex": "^PILOT_"}})
    await db.advanced_pilot_results.delete_many({})
    await db.advanced_pilot_runs.delete_many({})
    return {"message": "تم إيقاف التجربة وحذف كل البيانات التجريبية فورًا — النظام القديم لم يتأثر", "roles_deleted": deleted.deleted_count}


async def run_pilot(db, triggered_by: dict) -> Dict[str, Any]:
    await reset_pilot(db)
    run_id = str(ObjectId())
    started_at = _now()
    results: List[dict] = []

    # ── Salim: عميد كلية — نطاق أكاديمي كلية حقيقية ──
    salim_keys = await _pick_permission_keys(db)
    salim_role = await _make_pilot_role(db, "عميد_كلية", salim_keys)
    salim_assignment = await _make_pilot_assignment(db, SALIM_ID, salim_role, "عميد كلية الشريعة والقانون", "academic", "faculty", [SALIM_FACULTY])
    results += await _run_scope_cases(db, "salim", SALIM_ID, salim_assignment, salim_keys, "faculty", SALIM_FACULTY, OTHER_FACULTY)
    results += await _run_compare_cases(db, "salim", SALIM_ID, salim_assignment, salim_keys)

    # ── Saeed: 3 مناصب متزامنة (أكاديمي + إداري + لجنة) + تكليف رابع مؤقت لاختبار الإنهاء ──
    saeed_academic_keys = await _pick_permission_keys(db)
    saeed_academic_role = await _make_pilot_role(db, "رئيس_قسم", saeed_academic_keys)
    saeed_academic = await _make_pilot_assignment(db, SAEED_ID, saeed_academic_role, "رئيس قسم الدراسات الإسلامية", "academic", "department", [SAEED_DEPT])

    saeed_admin_keys = await _pick_permission_keys(db)
    saeed_admin_role = await _make_pilot_role(db, "عضو_إداري", saeed_admin_keys)
    saeed_admin = await _make_pilot_assignment(db, SAEED_ID, saeed_admin_role, "عضو إداري — رئاسة الجامعة", "administrative", "unit", [UNIT_PRESIDENCY])

    saeed_committee_keys = await _pick_permission_keys(db, n_with_legacy=5, n_without=2)
    saeed_committee_role = await _make_pilot_role(db, "عضو_لجنة", saeed_committee_keys)
    saeed_committee = await _make_pilot_assignment(db, SAEED_ID, saeed_committee_role, "عضو لجنة جامعية", "administrative", "university", [])

    results += await _run_multi_role_isolation_cases(db, SAEED_ID, [
        ("رئيس قسم", saeed_academic, saeed_academic_keys),
        ("عضو إداري", saeed_admin, saeed_admin_keys),
        ("عضو لجنة", saeed_committee, saeed_committee_keys),
    ])
    results += await _run_scope_cases(db, "saeed", SAEED_ID, saeed_academic, saeed_academic_keys, "department", SAEED_DEPT, OTHER_DEPT)
    results += await _run_compare_cases(db, "saeed", SAEED_ID, saeed_academic, saeed_academic_keys, "رئيس_قسم")
    results += await _run_compare_cases(db, "saeed", SAEED_ID, saeed_admin, saeed_admin_keys, "عضو_إداري")
    results += await _run_compare_cases(db, "saeed", SAEED_ID, saeed_committee, saeed_committee_keys, "عضو_لجنة")

    throwaway_role = await _make_pilot_role(db, "تكليف_مؤقت_للإنهاء", saeed_committee_keys[:2])
    throwaway_assignment = await _make_pilot_assignment(db, SAEED_ID, throwaway_role, "تكليف مؤقت لاختبار الإنهاء", "administrative", "university", [])
    results += await _run_end_assignment_case(db, SAEED_ID, throwaway_assignment, [saeed_academic, saeed_admin, saeed_committee])

    # ── teacher180156: أستاذ — نطاق مقرر حقيقي ──
    teacher_keys = await _pick_permission_keys(db)
    teacher_role = await _make_pilot_role(db, "أستاذ_مقرر", teacher_keys)
    teacher_assignment = await _make_pilot_assignment(db, TEACHER_ID, teacher_role, "أستاذ مقرر دراسات حضرموت", "academic", "course", [TEACHER_COURSE])
    results += await _run_scope_cases(db, "teacher", TEACHER_ID, teacher_assignment, teacher_keys, "course", TEACHER_COURSE, OTHER_COURSE)
    results += await _run_compare_cases(db, "teacher", TEACHER_ID, teacher_assignment, teacher_keys)

    # ── أمان (بتمرير معرّفات المستخدمين فقط — بلا أي تسجيل دخول أو كلمة مرور حقيقية) ──
    results += await _run_security_cases(db, SAEED_ID, TEACHER_ID, salim_assignment)

    # ── president: خط أساس من النظام القديم فقط — لا تكليف ولا دور تجريبي له ──
    results += await _run_president_baseline(db)

    for r in results:
        r["run_id"] = run_id
        r["created_at"] = _now()
    if results:
        await db.advanced_pilot_results.insert_many(results)

    summary = _summarize(results)
    await db.advanced_pilot_runs.insert_one({
        "_id": ObjectId(run_id), "started_at": started_at, "finished_at": _now(),
        "triggered_by_user_id": triggered_by.get("id"), "triggered_by_username": triggered_by.get("username"),
        **summary,
    })
    await write_audit_log(db, triggered_by, "pilot_run_executed", after={k: v for k, v in summary.items() if k not in ("by_user",)})
    return {"run_id": run_id, **summary}
