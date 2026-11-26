"""📑 قراءة صفحات النتيجة المرحلية (الأول/الثاني/التصفية) من كشف الدرجات + ربطها بالنتائج والتطبيق — قيم حرفية كما تظهر في الإكسل"""
import io
import re

STAGE_SHEETS = [("التصفية", "tasfiya"), ("الثاني", "second"), ("الأول", "first")]
STAGE_AR = {"first": "دور أول", "second": "دور ثان", "tasfiya": "تصفية", "exceptional": "استثنائي"}


def _norm(s) -> str:
    s = re.sub(r"[\u0640\u064B-\u0652]", "", str(s or ""))
    s = s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ة", "ه").replace("ى", "ي")
    return re.sub(r"\s+", " ", s).strip()


def _disp(v, fmt: str):
    """القيمة كما تُعرض في الخلية (عدد المنازل حسب التنسيق) — بلا تقريب إضافي"""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        m = re.search(r"0\.(0+)", (fmt or "").split(";")[0])
        if m:
            return f"{v:.{len(m.group(1))}f}"
        return str(int(v)) if float(v).is_integer() else str(v)
    s = str(v).strip()
    return s or None


def _sheets_display(content: bytes, filename: str) -> dict:
    """{اسم الصفحة: مصفوفة قيم معروضة}"""
    out = {}
    if (filename or "").lower().endswith(".xls"):
        import xlrd
        try:
            wb = xlrd.open_workbook(file_contents=content, formatting_info=True)
            fmt_of = lambda sh, r, c: wb.format_map[wb.xf_list[sh.cell_xf_index(r, c)].format_key].format_str
        except Exception:
            wb = xlrd.open_workbook(file_contents=content)
            fmt_of = lambda sh, r, c: ""
        for sh in wb.sheets():
            if sh.name.strip() in dict(STAGE_SHEETS):
                out[sh.name.strip()] = [[_disp(sh.cell_value(r, c), fmt_of(sh, r, c)) for c in range(sh.ncols)] for r in range(sh.nrows)]
    else:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        for ws in wb.worksheets:
            if ws.title.strip() in dict(STAGE_SHEETS):
                out[ws.title.strip()] = [[_disp(c.value, c.number_format) for c in row] for row in ws.iter_rows()]
    return out


def _parse_stage(rows: list, course_names: list) -> dict:
    """{اسم_مطبَّع: {letters:{مقرر: تقدير}, status, gpa, cum}}"""
    hr = nc = None
    for r, row in enumerate(rows[:25]):
        for c, v in enumerate(row[:10]):
            if _norm(v) == "الاسم":
                hr, nc = r, c
                break
        if hr is not None:
            break
    if hr is None or hr < 1 or hr + 1 >= len(rows):
        return {}
    names_row, labels = rows[hr - 1], rows[hr + 1]
    letter_cols = {}
    for cn in course_names:
        for c, v in enumerate(names_row):
            if v and _norm(v)[:12] == _norm(cn)[:12]:
                cands = [cc for cc in range(max(0, c - 2), min(len(labels), c + 3)) if _norm(labels[cc]) == "التقدير"]
                if cands:
                    letter_cols[cn] = min(cands, key=lambda cc: (abs(cc - c), cc < c))
                break
    sem_c = next((c for c, v in enumerate(labels) if _norm(v) == "الفصلي"), None)
    cum_c = next((c for c, v in enumerate(labels) if _norm(v) == "التراكمي"), None)
    out = {}
    for row in rows[hr + 2:]:
        nm = row[nc] if nc < len(row) else None
        if not nm or re.fullmatch(r"[\d.]+", str(nm)):
            continue
        g = lambda c: row[c] if c is not None and c < len(row) else None
        sem = g(sem_c)
        numeric = bool(sem and re.fullmatch(r"-?[\d.]+", sem))
        out[_norm(nm)] = {
            "letters": {cn: g(cc) for cn, cc in letter_cols.items()},
            "status": "ناجح" if numeric else sem, "gpa": sem if numeric else None, "cum": g(cum_c) if numeric else None,
        }
    return out


def enrich_with_stages(parsed: dict, content: bytes, filename: str) -> None:
    """يضيف لكل طالب: تقدير كل مقرر + شارة الدور + حالة/معدل فصلي/تراكمي من أحدث صفحة مرحلية"""
    try:
        sheets = _sheets_display(content, filename)
    except Exception:
        return
    names = [c["name"] for c in parsed.get("courses", [])]
    stages = [(key, _parse_stage(sheets[n], names)) for n, key in STAGE_SHEETS if n in sheets]
    for st in parsed.get("students", []):
        nm = _norm(st.get("name"))
        hit = next(((k, d[nm]) for k, d in stages if nm in d), None)
        for g in st.get("grades", []):
            g["stage"] = "tasfiya" if str(g.get("tas") or "").strip() else ("second" if str(g.get("r2") or "").strip() else "first")
            if hit:
                g["letter"] = hit[1]["letters"].get(g["course_name"])
        if hit:
            st["sem_stage"], st["sem_status"], st["sem_gpa"], st["cum_gpa"] = hit[0], hit[1]["status"], hit[1]["gpa"], hit[1]["cum"]
