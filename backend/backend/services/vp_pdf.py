"""PDF عقد الإنتاج المرئي ونموذج تسجيل محاضرة في الأستوديو — بنفس صياغة نماذج كلية التعليم عن بعد"""
import io

FOOTER = ("المكلا – حضرموت ص.ب : (50341) – القبول والتسجيل: 05 370 039 – عمادة الكلية: 05 370 056 – موقع الكلية: https://ahgaff.edu.ye",
          "AlMukalla – Hadhramout – P.O.Box (50341) – Admissions: 05 370 039 – Deanship: 05 370 056 – Website: https://ahgaff.edu.ye")


def _dots(v, n=30):
    return str(v) if v not in (None, "") else "." * n


def _money(v):
    return f"{v:,.0f}"


def _img(lh: dict, key: str):
    import base64
    from reportlab.lib.utils import ImageReader
    v = (lh or {}).get(key)
    if not v:
        return None
    try:
        return ImageReader(io.BytesIO(base64.b64decode(v.split(",")[-1])))
    except Exception:
        return None


def _doc(story_fn, title: str, lh: dict = None) -> bytes:
    """يرسم بكليشة سجل الخطابات المختارة (صورة الترويسة/التذييل أو الشعار والأسماء) كما في الخطابات الرسمية"""
    import os
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm, mm
    from reportlab.lib.utils import ImageReader
    from reportlab.platypus import SimpleDocTemplate
    from .pdf_pages import _ar, _fonts
    from .letter_pdf import merge_layout
    _fonts()
    lh = lh or {}
    L = merge_layout(lh.get("layout"))
    hb = float(L["header_bottom"]) * mm
    side = float(L["margin_side"]) * mm
    buf = io.BytesIO()
    head, foot = _img(lh, "header_image_base64"), _img(lh, "footer_image_base64")
    logo = _img(lh, "logo_base64")
    if logo is None:
        d = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "university_logo.jpeg")
        logo = ImageReader(d) if os.path.exists(d) else None

    def deco(cv, doc):
        w, h = A4
        if head:
            cv.drawImage(head, 0, h - hb, w, hb, mask="auto", preserveAspectRatio=True, anchor="n")
        else:
            sz = max(12 * mm, min(28 * mm, hb - 14 * mm))
            if logo:
                cv.drawImage(logo, w / 2 - sz / 2, h - 10 * mm - sz, sz, sz, mask="auto", preserveAspectRatio=True)
            t1, t2 = h - hb + float(L["header_line1"]) * mm, h - hb + float(L["header_line2"]) * mm
            cv.setFont("Amiri", float(L["header_font_ar1"])); cv.drawRightString(w - side, t1, _ar(lh.get("org_name") or "جامعة الأحقاف"))
            cv.setFont("Amiri", float(L["header_font_ar2"])); cv.drawRightString(w - side, t2, _ar(lh.get("office_name") or "كلية التعليم عن بعد"))
            cv.setFont("Helvetica-Bold", float(L["header_font_en1"])); cv.drawString(side, t1, lh.get("org_name_en") or "AL-AHGAFF UNIVERSITY")
            cv.setFont("Helvetica", float(L["header_font_en2"])); cv.drawString(side, t2, lh.get("office_name_en") or "")
            cv.setLineWidth(1.3); cv.line(side, h - hb + 1 * mm, w - side, h - hb + 1 * mm)
            cv.setLineWidth(0.4); cv.line(side, h - hb - 0.4 * mm, w - side, h - hb - 0.4 * mm)
        if foot:
            cv.drawImage(foot, 0, 0, w, 24 * mm, mask="auto", preserveAspectRatio=True, anchor="s")
        else:
            cv.setLineWidth(0.6); cv.line(side, 22 * mm, w - side, 22 * mm)
            parts = [lh.get("address")] + [f"{l}: {lh[k]}" for k, l in (("phones", "تلفون"), ("fax", "فاكس")) if lh.get(k)] + ([f"ص.ب ({lh['po_box']})"] if lh.get("po_box") else []) + [lh.get("website")]
            txt = " — ".join(x for x in parts if x) or FOOTER[0]
            cv.setFont("Amiri", 8.5); cv.drawCentredString(w / 2, 16 * mm, _ar(txt))
        cv.setFont("Amiri", 8); cv.drawString(side, 10 * mm, f"{doc.page}")

    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=side, leftMargin=side, topMargin=hb + 6 * mm, bottomMargin=28 * mm, title=title)
    doc.build(story_fn(doc.width), onFirstPage=deco, onLaterPages=deco)
    return buf.getvalue()


def _styles():
    from reportlab.lib.styles import ParagraphStyle
    return {"t": ParagraphStyle("t", fontName="Amiri-Bold", fontSize=15, leading=22, alignment=1, spaceAfter=6),
            "h": ParagraphStyle("h", fontName="Amiri-Bold", fontSize=11.5, leading=18, alignment=2, spaceBefore=6, spaceAfter=2),
            "p": ParagraphStyle("p", fontName="Amiri", fontSize=10.5, leading=17, alignment=2),
            "c": ParagraphStyle("c", fontName="Amiri-Bold", fontSize=11, leading=17, alignment=1)}


def _para(text: str, style, width: float):
    """تقسيم يدوي للأسطر قبل عكس الاتجاه لكي يبقى ترتيب الأسطر صحيحاً"""
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.platypus import Paragraph
    from .pdf_pages import _ar
    out = []
    for raw in str(text).split("\n"):
        cur = ""
        for w in raw.split():
            t = f"{cur} {w}".strip()
            if cur and stringWidth(_ar(t), style.fontName, style.fontSize) > width - 4:
                out.append(cur)
                cur = w
            else:
                cur = t
        out.append(cur)
    return Paragraph("<br/>".join(_ar(x).replace("&", "&amp;").replace("<", "&lt;") for x in out), style)


def contract_pdf(c: dict, st: dict, lh: dict = None) -> bytes:
    from reportlab.platypus import Spacer, Table, TableStyle
    from reportlab.lib import colors
    S = _styles()
    items = c.get("items", [])
    rec = next((i for i in items if i["kind"] == "recording"), None)
    cur = st.get("currency", "ريال يمني")
    cd = c.get("contract_date") or c.get("issued_at", "")[:10]

    def story(W):
        P = lambda t, s="p": _para(t, S[s], W)
        y, m, d = (cd.split("-") + ["", "", ""])[:3] if cd else ("", "", "")
        s = [P("عقد عمل — تدريس وإنتاج مرئي", "t"), P(f"رقم العقد: {c['ref_no']}", "c"),
             P(f"أنه في يوم : {_dots(d, 10)} من شهر : {_dots(m, 10)} عام : {_dots(y, 6)}م تم الاتفاق بين كلٍ من:"),
             P("الطرف الأول:", "h"),
             P(f"{st.get('first_party_org') or 'كلية التعليم عن بعد جامعة الأحقاف'}، ويمثلها {_dots(c.get('first_party_name') or st.get('first_party_name'))} بصفته: {c.get('first_party_title') or st.get('first_party_title') or 'القائم بأعمال العميد'} ويشار إليه فيما بعد بـ الطرف الأول."),
             P("الطرف الثاني:", "h"),
             P(f"الاسم: {_dots(c.get('teacher_name'))}    المؤهل العلمي: {_dots(c.get('qualification'), 15)}    التخصص: {_dots(c.get('specialization'), 15)}"),
             P(f"الدرجة العلمية: {_dots(c.get('academic_degree'), 15)}    رقم التواصل: {_dots(c.get('phone'), 15)}    ويشار إليه فيما بعد بـ الطرف الثاني."),
             P("تمهيد", "h"),
             P("نظرًا لرغبة الطرف الأول في الاستفادة من خبرة الطرف الثاني في التدريس ضمن كلية التعليم عن بعد، ورغبة الطرف الثاني في العمل لدى الطرف الأول، فقد تم الاتفاق بين الطرفين على ما يلي:"),
             P("مادة (1): طبيعة العمل", "h"),
             P(f"يُكلّف الطرف الثاني بالتدريس في كلية التعليم عن بعد – قسم {_dots(c.get('department_name'), 20)} مادة {_dots(c.get('course_name'), 20)} بواقع {c.get('weekly_hours') or 3:g} ساعات أسبوعية، ويشمل عمله إعداد وتوصيف المقرر العلمي، وبناء بنك الأسئلة، وتسجيل المحاضرات المرئية (بما يعادل {c.get('required_hours', 0):g} ساعة)، وتنفيذ اللقاءات التفاعلية مع الطلاب."),
             P("مادة (2): التزامات الطرف الثاني", "h")]
        ob = ["الالتزام بلوائح وأنظمة جامعة الأحقاف، وتنفيذ التعليمات الصادرة من الكلية.",
              "إعداد توصيف المادة العلمية وفق نموذج وزارة التعليم العالي وتسليمها في الموعد المحدد.",
              "إعداد المحتوى العلمي الكامل للمقرر بشكل متكامل وواضح، خالٍ من الأخطاء اللغوية والإملائية، ومناسب لشرائح الباوربوينت.",
              f"تسجيل المحاضرات المرئية بما يعادل ثلثي الساعات الدراسية المقررة، أي {c.get('required_hours', 0):g} ساعة مرئية من أصل {c.get('course_hours', 0):g} ساعة للمادة بواقع {c.get('weekly_hours', 3):g} ساعات أسبوعياً لمدة {c.get('semester_weeks', 16)} أسبوعاً، والثلث الباقي للقاءات التفاعلية عبر الحضور المباشر أو البرامج المعتمدة.",
              "إعداد بنك أسئلة لا يقل عن (250) سؤالًا متنوعًا (صح أو خطأ – اختر – أكمل – مقالي) مع الإجابات النموذجية، وتسليمه في ملف Word أو Excel.",
              f"الالتزام بتنفيذ العمل خلال المدة المحددة (لا تتجاوز {c.get('duration_days')} يومًا من تاريخ توقيع العقد) — من {c.get('start_date')} إلى {c.get('end_date')}.",
              "الالتزام بعدم إفشاء أسرار العمل، والتنازل للطرف الأول عن جميع المواد المنتجة ضمن هذا العقد باعتبارها ملكًا له."]
        s += [P(f"{i}. {t}") for i, t in enumerate(ob, 1)]
        s += [P("مادة (3): التزامات الطرف الأول", "h"), P("1. تهيئة البيئة التعليمية اللازمة للتنفيذ."),
              P(f"2. دفع مبلغ إجمالي قدره ({_money(c.get('total_amount', 0))} {cur}) فقط، مقسّمًا كما يلي:")]
        s += [P(f"    ({_money(i['amount'])}) مقابل {i['name']}" + ".") for i in items]
        s += [P("مادة (4): إنهاء التعاقد", "h"), P("يحق للطرف الأول إلغاء العقد دون إشعار في الحالات التالية:"),
              P("1. تقديم بيانات أو وثائق مزورة.  2. الإخلال الجسيم بالمهام أو عدم تنفيذ الالتزامات الجوهرية.  3. الغياب أو التقصير دون مبرر بعد إنذاره رسميًا."),
              P("مادة (5): تسوية النزاعات", "h"),
              P("يُحل أي خلاف بين الطرفين وديًا، وفي حال تعذر ذلك يُحال إلى جهة تحكيم يتفق عليها الطرفان، أو إلى المحكمة المختصة."),
              P("مادة (6): المراسلات", "h"),
              P("تتم المراسلات الرسمية عبر البريد الإلكتروني أو رقم الجوال المعتمد، وتُعد أي رسالة واردة عبرهما إشعارًا رسميًا. وعلى كل طرف إشعار الآخر بأي تغيير في بيانات التواصل."),
              P("مادة (7): النسخ", "h"), P("حرّر هذا العقد من ثلاث نسخ: نسخة للطرف الأول، ونسخة للطرف الثاني، ونسخة للشؤون القانونية بالجامعة."),
              Spacer(1, 8), P("والله ولي التوفيق", "c"), Spacer(1, 10)]
        from .pdf_pages import _ar
        sig = Table([[_ar("توقيع الطرف الثاني: ......................"), _ar("توقيع الطرف الأول: ...................... الختم:")],
                     [_ar(f"التاريخ: {_dots('', 18)}"), _ar("تعميد الأمين العام — التوقيع: ......................")]], colWidths=[W / 2, W / 2])
        sig.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "Amiri-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 10.5),
                                 ("ALIGN", (0, 0), (-1, -1), "RIGHT"), ("TOPPADDING", (0, 0), (-1, -1), 10), ("TEXTCOLOR", (0, 0), (-1, -1), colors.black)]))
        return s + [sig]

    return _doc(story, c["ref_no"], lh)


def session_pdf(s: dict, studio_name: str, max_minutes: int = 60, lh: dict = None) -> bytes:
    from reportlab.platypus import Spacer, Table, TableStyle
    from reportlab.lib import colors
    from .pdf_pages import _ar
    S = _styles()

    def story(W):
        P = lambda t, st="p": _para(t, S[st], W)

        def box(label, val, h=1):
            t = Table([[_para(f"{label}: {val or ''}" if label else (val or " "), S["p"], W - 12)]], colWidths=[W], rowHeights=[None])
            t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#94a3b8")), ("TOPPADDING", (0, 0), (-1, -1), 5),
                                   ("BOTTOMPADDING", (0, 0), (-1, -1), 5 + (h - 1) * 16)]))
            return t

        rows = [[_ar(f"{s.get('course_name', '')}"), _ar("اسم المقرر")], [_ar(s.get("lecture_title", "")), _ar("عنوان المحاضرة")],
                [_ar(s.get("topic", "")), _ar("الموضوع (حسب التوصيف)")], [f"{s.get('lecture_no')}", _ar("رقم المحاضرة")],
                [f"{s.get('parts_count')}", _ar("عدد أجزاء المحاضرة")], [f"{s.get('part_no')}", _ar("الجزء")],
                [_ar(f"{s.get('est_minutes')} دقيقة"), _ar(f"المدة التقديرية للجزء (لا تتعدى {max_minutes} دقيقة)")],
                [_ar(f"{studio_name or '—'} — {s.get('date')} من {s.get('start')} إلى {s.get('end')}"), _ar("الأستوديو والموعد")]]
        t = Table(rows, colWidths=[W * 0.62, W * 0.38])
        t.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "Amiri"), ("FONTNAME", (1, 0), (1, -1), "Amiri-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 10.5),
                               ("ALIGN", (0, 0), (-1, -1), "RIGHT"), ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
                               ("BACKGROUND", (1, 0), (1, -1), colors.HexColor("#F1F5F9"))]))
        return [P("نموذج تسجيل محاضرة في الاستوديو التعليمي", "t"), P(f"رقم النموذج: {s.get('ref_no')}", "c"),
                P("يرجى من الأستاذ تعبئة النموذج التالي قبل البدء بجدولة تسجيل المحاضرة. تُسهم هذه المعلومات في تنظيم عملية التصوير والمونتاج ورفع الجودة العامة للمحتوى."),
                P("بيانات المقرر", "h"), t, P("بيانات المحتوى", "h"), box("1. ملخص مختصر لما سيتم شرحه", s.get("summary"), 3),
                Spacer(1, 4), box("2. المرفق", s.get("attachment_note") or s.get("materials_note")), P("ملاحظات الأستاذ (إن وجدت)", "h"),
                box("", s.get("teacher_notes"), 2), P("ملاحظات المصور (إن وجدت)", "h"), box("", s.get("photographer_notes"), 2), Spacer(1, 10),
                P(f"اسم الأستاذ: {s.get('teacher_name', '')}      القسم العلمي: {s.get('department_name', '')}"),
                P(f"تاريخ تعبئة النموذج: {(s.get('created_at') or '')[:10]}      التوقيع: ................................")]

    return _doc(story, s.get("ref_no", ""), lh)


def statement_pdf(c: dict, st: dict, lh: dict = None) -> bytes:
    """كشف حساب المدرس: ما له (البنود المقبولة) وما استلمه (سندات الاستلام المؤكدة من المدرس) والرصيد"""
    from reportlab.lib import colors
    from reportlab.platypus import Spacer, Table, TableStyle
    from .pdf_pages import _ar
    S = _styles()
    cur = st.get("currency", "ريال يمني")
    p = c["progress"]
    rows = []
    for it in c.get("items", []):
        if it.get("accrued"):
            rows.append(((it.get("accepted_at") or it.get("delivered_at") or "")[:10], f"استحقاق: {it['name']}" + (" (جزئي)" if it.get("status") == "partial" else ""), it["accrued"], 0, ""))
    for x in c.get("payments", []):
        if x.get("status", "received") == "received":
            rows.append((x.get("date", ""), f"دفعة مستلمة{(' — ' + x['stage']) if x.get('stage') else ''}", 0, x["amount"], x.get("receipt_no", "")))
    rows.sort(key=lambda r: (r[0] or "9999", 0 if r[2] else 1))

    def story(W):
        P = lambda t, s_="p": _para(t, S[s_], W)
        head = [_ar(h) for h in ("الرصيد", "رقم السند", "عليه (مستلم)", "له (مستحق)", "البيان", "التاريخ")]
        data, bal = [head], 0.0
        for d, desc, cr, db_, rno in rows:
            bal += cr - db_
            data.append([_money(bal), rno, _money(db_) if db_ else "", _money(cr) if cr else "", _ar(desc), d])
        data.append([_money(bal), "", _money(p["paid"]), _money(p["accrued"]), _ar("الإجمالي"), ""])
        t = Table(data, colWidths=[W * .14, W * .14, W * .14, W * .14, W * .30, W * .14], repeatRows=1)
        t.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "Amiri"), ("FONTNAME", (0, 0), (-1, 0), "Amiri-Bold"), ("FONTNAME", (0, -1), (-1, -1), "Amiri-Bold"),
                               ("FONTSIZE", (0, 0), (-1, -1), 10), ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("ALIGN", (4, 1), (4, -1), "RIGHT"),
                               ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
                               ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F1F5F9"))]))
        pend = [x for x in c.get("payments", []) if x.get("status") in ("pending", "disputed")]
        out = [P("كشف حساب — عقد إنتاج مرئي", "t"), P(f"رقم العقد: {c['ref_no']}", "c"),
               P(f"المدرس: {c.get('teacher_name', '')}    المقرر: {c.get('course_name', '')}    القسم: {c.get('department_name', '') or '—'}"),
               P(f"مدة العقد: من {c.get('start_date')} إلى {c.get('end_date')}    إجمالي العقد: {_money(p['total'])} {cur}"),
               P(f"الإنجاز: ساعات مسجلة {p.get('recorded_hours', 0):g} من {p.get('required_hours', 0):g} ساعة ({p.get('percent', 0)}%)"),
               Spacer(1, 6), t, Spacer(1, 8),
               P(f"المستحق: {_money(p['accrued'])}    المستلم: {_money(p['paid'])}    الرصيد المتبقي للمدرس: {_money(p['accrued'] - p['paid'])} {cur}", "h")]
        if pend:
            out.append(P("دفعات صُرفت ولم يؤكد المدرس استلامها بعد: " + "، ".join(f"{_money(x['amount'])} ({x.get('date', '')})" for x in pend)))
        out += [Spacer(1, 6), P("الدفعات المستلمة أعلاه مؤكدة إلكترونياً من المدرس عبر تطبيقه، ويُعد تأكيده سند استلام برقمه الموضح."), Spacer(1, 16)]
        sig = Table([[_ar("المدرس: ......................"), _ar("المحاسب: ......................"), _ar("يعتمد: ......................")]], colWidths=[W / 3] * 3)
        sig.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "Amiri-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 10.5), ("ALIGN", (0, 0), (-1, -1), "CENTER")]))
        return out + [sig]

    return _doc(story, f"statement-{c['ref_no']}", lh)
