"""كشف الدور الأول للمستوى بنفس النموذج الورقي: رؤوس مدمجة متعددة المستويات — Excel وPDF"""
import io

LEVELS = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن"]
GROUPS = [("sem", "التحصيل الفصلي الحالي", "المعدل الفصلي"), ("prev", "التحصيل التراكمي السابق", "المعدل التراكمي السابق"),
          ("cum", "التحصيل التراكمي الحالي", "المعدل التراكمي")]
SUB = ["المعدل بالنقاط", "التقدير", "النقاط المرجحة"]
HEAD_ROWS = 4
BROWN = "9C4A00"


def title_of(level: int, dept: str) -> str:
    lv = LEVELS[level] if 0 < level < len(LEVELS) else str(level)
    return f"المستوى {lv} تخصص ({dept}) الدور الأول"


def _n(x):
    return round(float(x), 2) if isinstance(x, (int, float)) else None


def layout(d: dict):
    """merges: (r0, c0, r1, c1, text) بإحداثيات منطقية (العمود 0 = أقصى اليمين)، body: صفوف القيم"""
    n = len(d["courses"])
    S = 3 + 3 * n
    m = [(0, 0, 3, 0, "م"), (0, 1, 3, 1, "الاسم"), (0, 2, 3, 2, "رقم القيد")]
    if n:
        m.append((0, 3, 0, S - 1, "المقررات الدراسية"))
    for i, c in enumerate(d["courses"]):
        k = 3 + 3 * i
        m += [(1, k, 1, k + 2, c["name"]), (2, k, 2, k + 1, "الوحدات الدراسية"), (2, k + 2, 2, k + 2, str(c["credits"] or "-"))]
        m += [(3, k + j, 3, k + j, SUB[j]) for j in range(3)]
    for g, (_, t, avg) in enumerate(GROUPS):
        k = S + 3 * g
        m.append((0, k, 2, k + 2, t))
        m += [(3, k + j, 3, k + j, s) for j, s in enumerate(["مجموع النقاط المرجحة", "مجموع الوحدات الدراسية", avg])]
    body = []
    for i, r in enumerate(d["rows"], 1):
        line = [i, r["name"], r["reg_no"]]
        for c in r["cells"]:
            c = c or {}
            line += [_n(c.get("points")), c.get("letter") or "", _n(c.get("weighted"))]
        for key, _, _ in GROUPS:
            x = r[key]
            lab = x.get("label")
            u = _n(x.get("units"))
            line += [None if lab else _n(x.get("points")), int(u) if u is not None and u.is_integer() else u, lab or _n(x.get("gpa"))]
        body.append(line)
    return S + 9, m, body, {3 + 3 * i for i in range(n)}


def to_xlsx(d: dict, title: str, subtitle: str) -> io.BytesIO:
    import openpyxl
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter as L
    N, merges, body, brown = layout(d)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "كشف الدور الأول"
    ws.sheet_view.rightToLeft = True
    thin, thick = Side(style="thin", color="000000"), Side(style="medium", color="000000")
    box = Border(left=thin, right=thin, top=thin, bottom=thin)
    mid = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=N)
    ws.cell(1, 1, title).font = Font(bold=True, size=20)
    ws.cell(1, 1).alignment = Alignment(horizontal="center", vertical="center")
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=N)
    ws.cell(2, 1, subtitle).font = Font(bold=True, size=12, color="334155")
    ws.cell(2, 1).alignment = Alignment(horizontal="right", vertical="center")
    ws.row_dimensions[1].height = 34
    top = 3
    fill = PatternFill("solid", fgColor="F1F5F9")
    for r0, c0, r1, c1, t in merges:
        for rr in range(r0, r1 + 1):
            for cc in range(c0, c1 + 1):
                cell = ws.cell(top + rr, cc + 1)
                cell.border, cell.fill, cell.alignment = box, fill, mid
                cell.font = Font(bold=True, size=10)
        if (r0, c0) != (r1, c1):
            ws.merge_cells(start_row=top + r0, start_column=c0 + 1, end_row=top + r1, end_column=c1 + 1)
        ws.cell(top + r0, c0 + 1, t)
    for rr in range(HEAD_ROWS):
        ws.row_dimensions[top + rr].height = 22 if rr < 3 else 34
    for i, line in enumerate(body):
        row = top + HEAD_ROWS + i
        for j, v in enumerate(line):
            cell = ws.cell(row, j + 1, v if v is not None else "-")
            cell.border, cell.alignment = box, mid
            cell.font = Font(bold=True, size=10, color=BROWN if j in brown else "000000")
            if isinstance(v, float):
                cell.number_format = "0.00"
        ws.row_dimensions[row].height = 20
    ws.column_dimensions["A"].width = 5
    ws.column_dimensions["B"].width = 28
    ws.column_dimensions["C"].width = 12
    for j in range(4, N + 1):
        ws.column_dimensions[L(j)].width = 8.5
    # فواصل سميكة بين مجموعات المقررات والتحصيل
    last = top + HEAD_ROWS + len(body) - 1
    for k in list(range(3, N, 3)) + [N]:
        for rr in range(top, max(last, top + HEAD_ROWS - 1) + 1):
            c = ws.cell(rr, k)
            c.border = Border(left=thick, right=c.border.right, top=c.border.top, bottom=c.border.bottom)
    ws.freeze_panes = ws.cell(top + HEAD_ROWS, 4)
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = f"{top}:{top + HEAD_ROWS - 1}"
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def to_pdf(d: dict, title: str, subtitle: str) -> io.BytesIO:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A3, A4, landscape
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from reportlab.lib.styles import ParagraphStyle
    from .pdf_pages import _ar, _fonts
    _fonts()
    N, merges, body, brown = layout(d)
    page = landscape(A3 if N > 27 else A4)
    avail = page[0] - 2 * cm
    base = [0.8, 4.2, 1.8] + [1.25] * (N - 3)
    k = avail / (sum(base) * cm)
    widths = [w * cm * k for w in base][::-1]
    fs = max(5.5, min(8.5, 8.5 * k))
    X = lambda c: N - 1 - c

    def lines(t, width):
        words, out, cur = str(t).split(), [], ""
        cap = max(4, int(width / (fs * 0.5)))
        for w in words:
            if cur and len(cur) + 1 + len(w) > cap:
                out.append(cur)
                cur = w
            else:
                cur = f"{cur} {w}".strip()
        out.append(cur)
        return "\n".join(_ar(x) for x in out)

    grid = [[""] * N for _ in range(HEAD_ROWS)]
    st = [("FONTNAME", (0, 0), (-1, -1), "Amiri-Bold"), ("FONTSIZE", (0, 0), (-1, -1), fs), ("LEADING", (0, 0), (-1, -1), fs * 1.15),
          ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
          ("GRID", (0, 0), (-1, -1), 0.5, colors.black), ("BACKGROUND", (0, 0), (-1, HEAD_ROWS - 1), colors.HexColor("#F1F5F9")),
          ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5), ("LEFTPADDING", (0, 0), (-1, -1), 1), ("RIGHTPADDING", (0, 0), (-1, -1), 1)]
    for r0, c0, r1, c1, t in merges:
        w = sum(widths[X(c)] for c in range(c0, c1 + 1))
        grid[r0][X(c1)] = lines(t, w)
        if (r0, c0) != (r1, c1):
            st.append(("SPAN", (X(c1), r0), (X(c0), r1)))
    for line in body:
        row = [""] * N
        for j, v in enumerate(line):
            row[X(j)] = "-" if v is None or v == "" and j != 2 else (f"{v:.2f}" if isinstance(v, float) else _ar(v) if isinstance(v, str) else str(v))
        grid.append(row)
    for b in brown:
        st.append(("TEXTCOLOR", (X(b), HEAD_ROWS), (X(b), -1), colors.HexColor("#" + BROWN)))
    for c in range(3, N, 3):
        st.append(("LINEAFTER", (X(c), 0), (X(c), -1), 1.4, colors.black))
    st.append(("ALIGN", (X(1), HEAD_ROWS), (X(1), -1), "RIGHT"))
    t = Table(grid, colWidths=widths, repeatRows=HEAD_ROWS)
    t.setStyle(TableStyle(st + [("ROWBACKGROUNDS", (0, HEAD_ROWS), (-1, -1), [colors.white, colors.HexColor("#FAFAFA")])]))
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=page, leftMargin=cm, rightMargin=cm, topMargin=1.2 * cm, bottomMargin=cm, title=title)
    ts = ParagraphStyle("t", fontName="Amiri-Bold", fontSize=18, leading=24, alignment=1)
    ss = ParagraphStyle("s", fontName="Amiri-Bold", fontSize=11, leading=15, alignment=2, textColor=colors.HexColor("#334155"))
    doc.build([Paragraph(_ar(subtitle), ss), Paragraph(_ar(title), ts), Spacer(1, 6), t])
    buf.seek(0)
    return buf
