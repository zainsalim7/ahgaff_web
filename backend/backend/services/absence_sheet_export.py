"""كشف «المحصلة النهائية للغياب» بنفس النموذج الرسمي — Excel وPDF (رؤوس مدمجة، اتجاه من اليمين)"""
import io

SUB = ["بعذر", "بدون عذر", "{u}%", "{t}%", "النتيجة"]
HEAD_ROWS = 4
FILLS = ["FCE4D6", "DDEBF7", "E4DFEC", "E2EFDA", "FBE2E6", "DDEBF7", "FFF2CC", "EDEDED"]
OUT_FILL = {"takmili": "D9D9D9", "repeat": "BFBFBF", "dismiss": "A6A6A6"}


def _h(x):
    if x is None:
        return None
    x = round(float(x), 3)
    return int(x) if x.is_integer() else x


def layout(d: dict):
    lim = d["limits"]
    u, t = f"{lim['unexcused']:g}", f"{lim['total']:g}"
    n = len(d["courses"])
    N = 2 + 5 * n
    m = [(0, 0, 3, 0, "م"), (0, 1, 3, 1, "الاسم")]
    for i, c in enumerate(d["courses"]):
        k = 2 + 5 * i
        m += [(0, k, 0, k + 4, c["name"]), (1, k, 1, k + 3, "الساعات الفعلية"), (1, k + 4, 1, k + 4, int(c["executed_hours"] + 0.5)),
              (2, k, 2, k + 1, "ساعات الغياب"), (2, k + 2, 2, k + 2, _h(round(c["h_u"], 2))), (2, k + 3, 2, k + 4, int(c["h_t"] + 0.5))]
        m += [(3, k + j, 3, k + j, x.format(u=u, t=t)) for j, x in enumerate(SUB)]
    body, marks = [], []
    for i, r in enumerate(d["rows"], 1):
        line, mk = [i, r["name"]], []
        for c in r["cells"]:
            if not c:
                line += ["", "", "", "", "—"]
                mk.append(None)
                continue
            line += [_h(c["excused"]) or "-", _h(c["unexcused"]) or "-", _h(c["excess_u"]) or 0, _h(c["excess_t"]) or 0, c["outcome_ar"]]
            mk.append(c["outcome"])
        body.append(line)
        marks.append(mk)
    return N, m, body, marks


def to_xlsx(d: dict, title: str, subtitle: str) -> io.BytesIO:
    import openpyxl
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter as L
    N, merges, body, marks = layout(d)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "المحصلة النهائية للغياب"
    ws.sheet_view.rightToLeft = True
    thin, thick = Side(style="thin"), Side(style="medium")
    box = Border(left=thin, right=thin, top=thin, bottom=thin)
    mid = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for r, (txt, size) in enumerate([(title, 18), (subtitle, 12)], 1):
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=N)
        ws.cell(r, 1, txt).font = Font(bold=True, size=size)
        ws.cell(r, 1).alignment = Alignment(horizontal="center", vertical="center")
    top = 3
    for r0, c0, r1, c1, t in merges:
        fill = PatternFill("solid", fgColor=FILLS[((c0 - 2) // 5) % len(FILLS)] if c0 >= 2 else "F1F5F9")
        for rr in range(r0, r1 + 1):
            for cc in range(c0, c1 + 1):
                cell = ws.cell(top + rr, cc + 1)
                cell.border, cell.fill, cell.alignment, cell.font = box, fill, mid, Font(bold=True, size=10 if rr else 12)
        if (r0, c0) != (r1, c1):
            ws.merge_cells(start_row=top + r0, start_column=c0 + 1, end_row=top + r1, end_column=c1 + 1)
        ws.cell(top + r0, c0 + 1, t)
    for i, line in enumerate(body):
        row = top + HEAD_ROWS + i
        for j, v in enumerate(line):
            cell = ws.cell(row, j + 1, v)
            cell.border, cell.alignment, cell.font = box, mid, Font(bold=j != 1, size=10)
            if j == 1:
                cell.alignment = Alignment(horizontal="right", vertical="center")
            if j >= 2 and (j - 2) % 5 == 4 and marks[i][(j - 2) // 5] in OUT_FILL:
                cell.fill = PatternFill("solid", fgColor=OUT_FILL[marks[i][(j - 2) // 5]])
    ws.column_dimensions["A"].width = 5
    ws.column_dimensions["B"].width = 34
    for j in range(3, N + 1):
        ws.column_dimensions[L(j)].width = 8 if (j - 3) % 5 != 4 else 9.5
    last = top + HEAD_ROWS + len(body) - 1
    for k in range(2, N, 5):
        for rr in range(top, max(last, top + HEAD_ROWS - 1) + 1):
            c = ws.cell(rr, k + 1)
            c.border = Border(left=c.border.left, right=thick, top=c.border.top, bottom=c.border.bottom)
    ws.freeze_panes = ws.cell(top + HEAD_ROWS, 3)
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
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from .pdf_pages import _ar, _fonts
    _fonts()
    N, merges, body, marks = layout(d)
    page = landscape(A3 if N > 32 else A4)
    base = [0.7, 4.6] + [1.0, 1.05, 1.0, 1.0, 1.25] * ((N - 2) // 5)
    k = (page[0] - 1.6 * cm) / (sum(base) * cm)
    widths = [w * cm * k for w in base][::-1]
    fs = max(5.0, min(8.0, 8 * k))
    X = lambda c: N - 1 - c
    grid = [[""] * N for _ in range(HEAD_ROWS)]
    st = [("FONTNAME", (0, 0), (-1, -1), "Amiri-Bold"), ("FONTSIZE", (0, 0), (-1, -1), fs), ("LEADING", (0, 0), (-1, -1), fs * 1.15),
          ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("GRID", (0, 0), (-1, -1), 0.4, colors.black),
          ("TOPPADDING", (0, 0), (-1, -1), 1.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2), ("LEFTPADDING", (0, 0), (-1, -1), 1), ("RIGHTPADDING", (0, 0), (-1, -1), 1)]
    for r0, c0, r1, c1, t in merges:
        grid[r0][X(c1)] = _ar(str(t)) if isinstance(t, str) else str(t)
        if (r0, c0) != (r1, c1):
            st.append(("SPAN", (X(c1), r0), (X(c0), r1)))
        st.append(("BACKGROUND", (X(c1), r0), (X(c0), r1), colors.HexColor("#" + (FILLS[((c0 - 2) // 5) % len(FILLS)] if c0 >= 2 else "F1F5F9"))))
    for i, line in enumerate(body):
        grid.append([""] * N)
        for j, v in enumerate(line):
            grid[-1][X(j)] = _ar(v) if isinstance(v, str) else str(v)
            if j >= 2 and (j - 2) % 5 == 4 and marks[i][(j - 2) // 5] in OUT_FILL:
                st.append(("BACKGROUND", (X(j), HEAD_ROWS + i), (X(j), HEAD_ROWS + i), colors.HexColor("#" + OUT_FILL[marks[i][(j - 2) // 5]])))
    st.append(("ALIGN", (X(1), HEAD_ROWS), (X(1), -1), "RIGHT"))
    for c in range(2, N, 5):
        st.append(("LINEAFTER", (X(c), 0), (X(c), -1), 1.3, colors.black))
    t = Table(grid, colWidths=widths, repeatRows=HEAD_ROWS)
    t.setStyle(TableStyle(st))
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=page, leftMargin=0.8 * cm, rightMargin=0.8 * cm, topMargin=1 * cm, bottomMargin=0.8 * cm, title=title)
    ts = ParagraphStyle("t", fontName="Amiri-Bold", fontSize=17, leading=22, alignment=1)
    ss = ParagraphStyle("s", fontName="Amiri-Bold", fontSize=11, leading=15, alignment=1, textColor=colors.HexColor("#334155"))
    doc.build([Paragraph(_ar(title), ts), Paragraph(_ar(subtitle), ss), Spacer(1, 6), t])
    buf.seek(0)
    return buf


def summary_rows(d: dict, outcome=None):
    """صف لكل طالب: النتيجة الأشد + المقررات حسب كل نتيجة"""
    order = ["dismiss", "repeat", "takmili"]
    names = [c["name"] for c in d["courses"]]
    out = []
    for r in d["rows"]:
        by = {k: [names[j] for j, c in enumerate(r["cells"]) if c and c["outcome"] == k] for k in order}
        worst = next((k for k in order if by[k]), "first")
        if outcome and outcome != "first":
            worst = outcome
        out.append([r["name"], r["reg_no"], r["section"], {"first": "دور أول", "takmili": "تكميلي", "repeat": "إعادة", "dismiss": "فصل"}[worst],
                    "، ".join(by["takmili"]) or "-", "، ".join(by["repeat"]) or "-", "، ".join(by["dismiss"]) or "-"])
    return ["م", "الاسم", "رقم القيد", "الشعبة", "النتيجة", "مقررات التكميلي", "مقررات الإعادة", "مقررات الفصل"], out


def _counts_line(d):
    c = d["counts"]
    return f"عدد الطلاب: {d['students']} · دور أول (كل المقررات): {c['first']} · تكميلي: {c['takmili']} · إعادة: {c['repeat']} · فصل: {c['dismiss']}"


def summary_xlsx(d, title, subtitle, outcome=None) -> io.BytesIO:
    import openpyxl
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    head, rows = summary_rows(d, outcome)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "الملخص"
    ws.sheet_view.rightToLeft = True
    box = Border(*(Side(style="thin"),) * 4)
    for r, (txt, size) in enumerate([(title, 16), (subtitle, 11), (_counts_line(d), 11)], 1):
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=len(head))
        ws.cell(r, 1, txt).font = Font(bold=True, size=size)
        ws.cell(r, 1).alignment = Alignment(horizontal="center")
    for j, h in enumerate(head, 1):
        c = ws.cell(5, j, h)
        c.font, c.border, c.fill = Font(bold=True), box, PatternFill("solid", fgColor="F1F5F9")
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for i, line in enumerate(rows, 1):
        for j, v in enumerate([i] + line, 1):
            c = ws.cell(5 + i, j, v)
            c.border = box
            c.alignment = Alignment(horizontal="right" if j in (2, 6, 7, 8) else "center", vertical="center", wrap_text=True)
            if j == 5 and v in ("تكميلي", "إعادة", "فصل"):
                c.fill = PatternFill("solid", fgColor={"تكميلي": "FDE7C8", "إعادة": "F8C9C9", "فصل": "E6A3A3"}[v])
    for col, w in zip("ABCDEFGH", [5, 32, 13, 8, 10, 34, 34, 34]):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "C6"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def _wrap(text, cap, ar):
    out, cur = [], ""
    for w in str(text).split():
        if cur and len(cur) + 1 + len(w) > cap:
            out.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    out.append(cur)
    return "\n".join(ar(x) for x in out)


def summary_pdf(d, title, subtitle, outcome=None) -> io.BytesIO:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import cm
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from .pdf_pages import _ar, _fonts
    _fonts()
    head, rows = summary_rows(d, outcome)
    widths = [0.8, 5.2, 2.2, 1.2, 1.6, 5.6, 5.6, 5.6]
    data = [[_ar(h) for h in head][::-1]]
    st = [("FONTNAME", (0, 0), (-1, -1), "Amiri-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8.5), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
          ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEADING", (0, 0), (-1, -1), 11), ("GRID", (0, 0), (-1, -1), 0.4, colors.black), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F5F9"))]
    fills = {"تكميلي": "#FDE7C8", "إعادة": "#F8C9C9", "فصل": "#E6A3A3"}
    for i, line in enumerate(rows, 1):
        vals = [str(i), _ar(line[0]), line[1], _ar(line[2]), _ar(line[3])] + [_wrap(x, 34, _ar) for x in line[4:]]
        data.append(vals[::-1])
        if line[3] in fills:
            st.append(("BACKGROUND", (3, i), (3, i), colors.HexColor(fills[line[3]])))
    t = Table(data, colWidths=[w * cm for w in widths][::-1], repeatRows=1)
    t.setStyle(TableStyle(st))
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=cm, rightMargin=cm, topMargin=cm, bottomMargin=cm, title=title)
    ps = lambda size: ParagraphStyle("p", fontName="Amiri-Bold", fontSize=size, leading=size * 1.35, alignment=1)
    c = d["counts"]
    kp = Table([[_ar(x) for x in [f"عدد الطلاب: {d['students']}", f"دور أول في كل المقررات: {c['first']}", f"تكميلي: {c['takmili']}", f"إعادة: {c['repeat']}", f"فصل: {c['dismiss']}"]][::-1]],
               colWidths=[5 * cm] * 5)
    kp.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "Amiri-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 10), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                            ("BOX", (0, 0), (-1, -1), 0.4, colors.grey), ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.grey)]))
    doc.build([Paragraph(_ar(title), ps(16)), Paragraph(_ar(subtitle), ps(11)), Spacer(1, 4), kp, Spacer(1, 8), t])
    buf.seek(0)
    return buf
