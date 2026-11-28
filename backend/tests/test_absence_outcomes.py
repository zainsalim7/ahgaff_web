"""المحصلة النهائية للغياب — أرقام الكشف الرسمي (الثاني شريعة أ) بحدود 10% / 25% / فصل 50%"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from services.absence_engine import classify  # noqa: E402
from services import rc_engine as E  # noqa: E402

L = {"unexcused_limit": 10, "excused_limit": 15.9, "total_limit": 25, "dismiss_limit": 50, "min_executed": 4}
CASES = [  # (بعذر, بدون عذر, الساعات الفعلية) → (تجاوز 10%, تجاوز 25%, النتيجة)
    (0, 8, 67, 1.3, 0, "تكميلي"), (3.5, 33.5, 67, 26.8, 20.25, "فصل"), (1.5, 26, 56.5, 20.35, 13.375, "إعادة"),
    (3, 21, 42, 16.8, 13.5, "فصل"), (1.5, 16.5, 39, 12.6, 8.25, "إعادة"), (1.5, 16.5, 40.5, 12.45, 7.875, "إعادة"),
    (1, 14.5, 30, 11.5, 8, "فصل"), (0, 6.5, 56.5, 0.85, 0, "تكميلي"), (0, 0, 67, 0, 0, "دور أول"),
]


def test_official_sheet_numbers():
    for e, u, h, xu, xt, out in CASES:
        p = classify(u, e, h, 20, L)
        assert (p["excess_unexcused_hours"], p["excess_total_hours"], p["outcome_ar"]) == (xu, xt, out), (e, u, h, p)


def test_excused_only_limit_is_takmili():
    p = classify(0, 11, 67, 20, L)  # 16.4% بعذر وحده > 15.9 · الإجمالي < 25
    assert p["outcome"] == "takmili"


def test_rc_blocks_repeat_and_dismiss():
    cfg = dict(E.DEFAULTS)
    for e, u, h, out in [(1.5, 16.5, 39, "إعادة المقرر"), (3, 21, 42, "فصل")]:
        r = E.compute({"coursework": 30, "second_exam": 80}, cfg, classify(u, e, h, 20, L), {})
        assert r["in_second"] is False and r["eligible"] is False and r["letter"] == out and r["final"] == 0


def test_takmili_second_round_and_council_deduct():
    cfg = dict(E.DEFAULTS)
    att = classify(8, 0, 67, 20, L)
    assert E.compute({"coursework": 30, "second_exam": 84}, cfg, att, {})["final2"] == 50
    assert E.compute({"coursework": 30, "second_exam": 84}, cfg, att, {"second_uncapped": {"deduct_pct": 10}})["final2"] == 75.6
    assert E.compute({"coursework": 30, "second_exam": 84}, cfg, att, {"second_uncapped": {"deduct_pct": 0}})["final2"] == 84


def test_exempted_decision_restores_first():
    from services.absence_engine import apply_decision_outcome
    p = classify(8, 0, 67, 20, L)
    p["status"] = "exempted"
    apply_decision_outcome(p)
    assert p["outcome"] == "first"
