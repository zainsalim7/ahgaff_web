"""PDF عقد الإنتاج المرئي ونموذج تسجيل محاضرة في الأستوديو — بنفس صياغة نماذج كلية التعليم عن بعد"""
import io

FOOTER = ("المكلا – حضرموت ص.ب : (50341) – القبول والتسجيل: 05 370 039 – عمادة الكلية: 05 370 056 – موقع الكلية: https://ahgaff.edu.ye",
          "AlMukalla – Hadhramout – P.O.Box (50341) – Admissions: 05 370 039 – Deanship: 05 370 056 – Website: https://ahgaff.edu.ye")


def _dots(v, n=30):
    return str(v) if v not in (None, "") else "." * n


def _money(v):
    return f"{v:,.0f}"


def _doc(story_fn, title: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate
    from .pdf_pages import _ar, _fonts
    _fonts()
    buf = io.BytesIO()

    def deco(cv, doc):
        w, h = A4
        cv.setFont("Amiri-Bold", 13)
        cv.drawRightString(w - 1.6 * cm, h - 1.3 * cm, _ar("جامعة الأحقاف"))
        cv.setFont("Amiri", 10)
        cv.drawRightString(w - 1.6 * cm, h - 1.8 * cm, _ar("كلية التعليم عن بعد"))
        cv.setLineWidth(0.8)
        cv.line(1.5 * cm, h - 2.1 * cm, w - 1.5 * cm, h - 2.1 * cm)
        cv.line(1.5 * cm, 1.6 * cm, w - 1.5 * cm, 1.6 * cm)
        cv.setFont("Amiri", 7)
        cv.drawCentredString(w / 2, 1.2 * cm, _ar(FOOTER[0]))
        cv.drawCentredString(w / 2, 0.85 * cm, FOOTER[1])

    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=1.8 * cm, leftMargin=1.8 * cm, topMargin=2.5 * cm, bottomMargin=2 * cm, title=title)
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


def contract_pdf(c: dict, st: dict) -> bytes:
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
             P(f"يُكلّف الطرف الثاني بالتدريس في كلية التعليم عن بعد – قسم {_dots(c.get('department_name'), 20)} مادة {_dots(c.get('course_name'), 20)} بواقع {c.get('weekly_hours') or 3:g} ساعات أسبوعية، ويشمل عمله إعداد وتوصيف المقرر العلمي، وبناء بنك الأسئلة، وتسجيل المحاضرات المرئية ({c.get('lectures_required')} محاضرة)، وتنفيذ اللقاءات التفاعلية مع الطلاب."),
             P("مادة (2): التزامات الطرف الثاني", "h")]
        ob = ["الالتزام بلوائح وأنظمة جامعة الأحقاف، وتنفيذ التعليمات الصادرة من الكلية.",
              "إعداد توصيف المادة العلمية وفق نموذج وزارة التعليم العالي وتسليمها في الموعد المحدد.",
              "إعداد المحتوى العلمي الكامل للمقرر بشكل متكامل وواضح، خالٍ من الأخطاء اللغوية والإملائية، ومناسب لشرائح الباوربوينت.",
              f"تسجيل المحاضرات المرئية بما يعادل ثلثي الساعات الدراسية المقررة ({c.get('lectures_required')} محاضرة مرئية)، والثلث الباقي للقاءات التفاعلية عبر الحضور المباشر أو البرامج المعتمدة.",
              "إعداد بنك أسئلة لا يقل عن (250) سؤالًا متنوعًا (صح أو خطأ – اختر – أكمل – مقالي) مع الإجابات النموذجية، وتسليمه في ملف Word أو Excel.",
              f"الالتزام بتنفيذ العمل خلال المدة المحددة (لا تتجاوز {c.get('duration_days')} يومًا من تاريخ توقيع العقد) — من {c.get('start_date')} إلى {c.get('end_date')}.",
              "الالتزام بعدم إفشاء أسرار العمل، والتنازل للطرف الأول عن جميع المواد المنتجة ضمن هذا العقد باعتبارها ملكًا له."]
        s += [P(f"{i}. {t}") for i, t in enumerate(ob, 1)]
        s += [P("مادة (3): التزامات الطرف الأول", "h"), P("1. تهيئة البيئة التعليمية اللازمة للتنفيذ."),
              P(f"2. دفع مبلغ إجمالي قدره ({_money(c.get('total_amount', 0))} {cur}) فقط، مقسّمًا كما يلي:")]
        s += [P(f"    ({_money(i['amount'])}) مقابل {i['name']}" + (" — يُستحق بالتناسب مع المحاضرات المكتملة ويُصرف على مراحل." if i is rec else ".")) for i in items]
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

    return _doc(story, c["ref_no"])


def session_pdf(s: dict, studio_name: str) -> bytes:
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
                [_ar(f"{s.get('est_minutes')} دقيقة"), _ar("المدة التقديرية للجزء (لا تتعدى 30 دقيقة)")],
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

    return _doc(story, s.get("ref_no", ""))
