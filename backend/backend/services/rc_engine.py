"""🎓 محرّك مركز النتائج — السعي ← الأهلية ← الدور الأول ← الثاني ← الاستثنائي (دوال خالصة بلا قاعدة بيانات)"""
from typing import Optional

ABSENT = "غ"
DEFAULT_SCALE = [{"min": 90, "label": "ممتاز"}, {"min": 80, "label": "جيد جداً"}, {"min": 65, "label": "جيد"},
                 {"min": 50, "label": "مقبول"}, {"min": 0, "label": "راسب"}]
DEFAULTS = {"coursework_max": 40, "coursework_pass_pct": 40, "exam_pass_pct": 50, "pass_mark": 50, "second_cap": 50, "exceptional_cap": 50,
            "grade_scale": DEFAULT_SCALE}
FIELDS = {"coursework": "السعي", "first_exam": "الدور الأول", "second_exam": "الدور الثاني", "exceptional_exam": "الدور الاستثنائي"}
ATT_BLOCK = ("candidate", "deprived")


def field_max(field: str, cfg: dict) -> float:
    return {"coursework": cfg["coursework_max"], "first_exam": 100 - cfg["coursework_max"]}.get(field, 100)


def parse_mark(v, mx: float, allow_absent: bool):
    """→ (القيمة, خطأ) · فارغ = None · «غ» = غائب عن الامتحان"""
    if v is None or str(v).strip() in ("", "-", "—", "–", "ـ"):
        return None, None
    s = str(v).strip().replace("٫", ".").translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))
    if s in (ABSENT, "غائب", "غ."):
        return (ABSENT, None) if allow_absent else (None, "السعي لا يقبل «غ»")
    try:
        n = float(s)
    except ValueError:
        return None, "قيمة غير رقمية"
    if n < 0 or n > mx:
        return None, f"الدرجة خارج المدى (0 – {mx:g})"
    return (int(n) if n.is_integer() else round(n, 2)), None


def letter(v, cfg: dict) -> Optional[str]:
    if not isinstance(v, (int, float)):
        return None
    for g in sorted(cfg.get("grade_scale") or DEFAULT_SCALE, key=lambda x: -x["min"]):
        if v >= g["min"]:
            return g["label"]
    return None


def _num(v):
    return v if isinstance(v, (int, float)) else None


def fmt(v) -> Optional[str]:
    if not isinstance(v, (int, float)):
        return None
    return str(int(v)) if float(v).is_integer() else f"{v:.2f}".rstrip("0").rstrip(".")


def compute(m: dict, cfg: dict, att: dict, decs: dict) -> dict:
    """m: درجات الطالب · att: ملف الغياب من absence_engine · decs: {second_uncapped, exceptional}"""
    pm, cwm = cfg["pass_mark"], cfg["coursework_max"]
    cw, f1, s2, x3 = (m.get(k) for k in ("coursework", "first_exam", "second_exam", "exceptional_exam"))
    cw_need = round(cwm * cfg["coursework_pass_pct"] / 100, 2)
    cw_ok = _num(cw) is not None and cw >= cw_need
    att_status = (att or {}).get("status", "excellent")
    att_ok = att_status not in ATT_BLOCK
    reasons = []
    if cw is None:
        if att_ok:
            reasons.append("لم يُرصد السعي")
    elif not cw_ok:
        reasons.append(f"السعي أقل من {fmt(cw_need)}")
    if not att_ok:
        reasons.append("محروم بقرار المجلس" if att_status == "deprived" else "تجاوز حد الغياب")
    eligible = cw_ok and att_ok
    r = {"cw_need": cw_need, "cw_ok": cw_ok, "att_ok": att_ok, "att_status": att_status, "eligible": eligible,
         "att_eligibility": "مؤهل بالحضور" if att_ok else "غير مؤهل بالغياب",
         "eligibility": "مؤهل" if eligible else ("بانتظار السعي" if cw is None and att_ok else "غير مؤهل"), "reasons": reasons,
         "need_first": None, "total1": None, "pass1": None,
         "in_second": False, "pass2": None, "final2": None, "in_exc": False, "pass3": None, "final3": None}
    if eligible:
        # النجاح في الأول: نصف درجة الامتحان + تعويض ما نقص السعي عن نصف درجته
        p = cfg.get("exam_pass_pct", 50) / 100
        r["need_first"] = round((100 - cwm) * p + max(0, cwm * p - cw), 2)
    if eligible and f1 is not None:
        r["total1"] = round(cw + (_num(f1) or 0), 2)
        r["pass1"] = _num(f1) is not None and f1 >= r["need_first"]
    r["in_second"] = not att_ok or (cw is not None and not cw_ok) or r["pass1"] is False
    unc = bool(decs.get("second_uncapped"))
    if r["in_second"] and s2 is not None:
        r["pass2"] = _num(s2) is not None and s2 >= pm
        r["final2"] = (s2 if unc else min(s2, cfg["second_cap"])) if r["pass2"] else 0
    exc = decs.get("exceptional")
    r["in_exc"] = bool(exc) and r["pass2"] is False
    if r["in_exc"] and x3 is not None:
        r["pass3"] = _num(x3) is not None and x3 >= pm
        capped = exc.get("capped", True)
        r["final3"] = (min(x3, cfg["exceptional_cap"]) if capped else x3) if _num(x3) is not None else 0
    if r["pass1"]:
        r.update(final=r["total1"], stage="first", result="ناجح")
    elif r["pass2"]:
        r.update(final=r["final2"], stage="second", result="ناجح")
    elif r["pass3"]:
        r.update(final=r["final3"], stage="tasfiya", result="ناجح")
    elif cw is None and att_ok:
        r.update(final=None, stage="pending", result="بانتظار السعي")
    elif eligible and f1 is None:
        r.update(final=None, stage="pending", result="بانتظار الدور الأول")
    elif r["in_second"] and s2 is None:
        r.update(final=None, stage="pending", result="بانتظار الدور الثاني")
    elif r["in_exc"] and x3 is None:
        r.update(final=None, stage="pending", result="بانتظار الدور الاستثنائي")
    else:
        last = r["final3"] if r["in_exc"] else r["final2"]
        r.update(final=last if last is not None else r["total1"], stage="failed", result="راسب")
    r["letter"] = letter(r["final"], cfg) if r["stage"] != "pending" else None
    return r
