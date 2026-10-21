# PRD — نظام إدارة الجامعة (المواظبة/الأعذار/الكشوف)

## المشكلة الأصلية
تطبيق لوائح جامعية جديدة بخصوص غياب الطلاب: احتساب الغياب حسب الساعات المنفذة (Phase 1، تم)،
مسار رسمي لطلب عذر الغياب (Phase 2، تم)، إجازة التحضير وتصنيف أسباب إلغاء المحاضرة (Phase 3)،
ومجلس الكلية لقرارات الحرمان (Phase 4). بالإضافة لتحسينات مستمرة على الجدولة، إدارة المجموعات،
عمليات الموارد البشرية، واجهة التقارير، وتوليد PDF (خطابات، نماذج، بطاقات هوية، كشوف إضافي).

## حالة الخطة
- Phase 1: محرك الغياب الموحّد — تم
- Phase 2: مسار طلب/توجيه عذر الغياب — تم
- Phase 3: إجازة التحضير + تصنيف أسباب إلغاء المحاضرة (بسبب الكلية / غير الكلية) — لم يبدأ
- Phase 4: واجهة مجلس الكلية (قرارات الحرمان) — لم يبدأ
- Phase 5: تنظيف نهائي وتوثيق — لم يبدأ
- مساعد AI: ودجت عائم يرشد المستخدمين، قراءة بيانات حيّة فقط حالياً (بدون تنفيذ إجراءات كتابة)
- تحسينات PDF: ترقيم صفحات متعدد مع رموز QR محلية — تم للخطابات، والآن تم أيضاً لكشف الساعات الإضافية والتقارير العامة (هذه الجلسة)

## آخر تحديث (هذه الجلسة)
- تم إصلاح خلل في `backend/backend/services/pdf_pages.py`: دالة `decorate_multipage` كانت مفقودة
  الاسم بسبب دمج أسطر خاطئ من الجلسة السابقة (نتج عنه `return outpdf: bytes, ...`). تم فصل الدالتين
  `number_pages_buf` و`decorate_multipage` بشكل صحيح.
- تم تطبيق ترقيم الصفحات (`n/N` + عنوان + "يُتبع…") على:
  - كشف الساعات الإضافية: `routes/teacher_overtime.py::build_sheet_pdf` (باستخدام `number_pages`)
  - مولّد التقارير العام: `routes/report_pdf.py::build_report_pdf` (مستخدم من `hr_reports.py` وغيره)
- تم التحقق عبر curl + استخراج نص PDF: كشف الساعات الإضافية وتقرير HR السنوي كلاهما بصفحتين،
  وتظهر "1/2"، "2/2"، والعنوان، و"يتبع…" بشكل صحيح على الصفحة الأولى فقط.

## المعمارية
- Frontend: `/app/frontend/app/` (Expo Router) — صفحات `report-*.tsx`
- Backend: `/app/backend/backend/routes/` و`/app/backend/backend/services/`
- قاعدة البيانات: MongoDB
- PDF: reportlab + pypdf (post-processing للترقيم) + arabic_reshaper/bidi

## الملفات المرجعية الأساسية
- `/app/backend/backend/services/pdf_pages.py` — `number_pages()` للتقارير/الكشوف، `decorate_multipage()` للخطابات
- `/app/backend/backend/routes/teacher_overtime.py` — كشف الساعات الإضافية
- `/app/backend/backend/routes/report_pdf.py` — مولّد PDF عام للتقارير (مستخدم في عدة مسارات)
- `/app/backend/backend/routes/excuse_form_pdf.py`, `services/letter_pdf.py`, `routes/hr_letter_pdf.py`

## آخر تحديث (الجدول الأسبوعي — توليد يتخطى أيام بلا تعارض حقيقي)
- 🔴 **إصلاح جذري**: عند جدولة مقررين مختلفين تماماً (بمعلمين وقاعتين مختلفين) لمجموعتين طلابيتين مختلفتين من نفس الشعبة في نفس اليوم/الفترة، كان النظام يرفضهما بخطأ "تعارض شعبة" رغم عدم وجود تعارض حقيقي (لا تشارك معلم ولا قاعة ولا طلاب) — بسبب معاملة "الشعبة" ككيان واحد غير قابل للتجزئة، ولفهرس فريد في قاعدة البيانات يمنع أكثر من سجل بلا "مجموعة" محدَّدة في نفس الخلية.
- طُبِّق إصلاح شامل (بناءً على طلب المستخدم: "اجعله أقل صرامة" بدل حقل مجموعة إلزامي) في: `create_schedule_slot`، `update_schedule_slot`، `_slots_conflict`، `/weekly-schedule/conflicts`، `_check_slot_placement` (نقل الفترات) — إن كان مقرر آخر في نفس الخلية بمعلم وقاعة مختلفين تماماً، يُسمح بالإضافة مع تحذير، ويُولَّد مفتاح "مجموعة" تلقائي (`auto-xxxxxxxx`) لتفادي تعارض الفهرس الفريد بصمت، مع إخفاء هذا المفتاح من شارة "👥" في الواجهة.
- تم الحفاظ على الحماية الحقيقية: نفس المعلم أو نفس القاعة في نفس الخلية ما زال يُرفض كما كان.
- اختبار شامل (iteration_111 ثم إعادة فحص يدوي): تأكيد النجاح + عدم رجوع في حالات التعارض الحقيقي.
- ملاحظة: تعذّر فحص بيانات الإنتاج الفعلية (deployment `schedule-hub-272` محذوف/deleted) — تم تشخيص وإصلاح السبب عبر تحليل الكود المباشر وإعادة إنتاج السيناريو في بيئة المعاينة.

## القادم (Backlog مرتب)
- P0: Phase 3 — إجازة التحضير وتصنيف إلغاء المحاضرات (بسبب الكلية / غير الكلية)
- P1: Phase 4 — واجهة مجلس الكلية لقرارات الحرمان
- P2: توسيع مساعد AI لتنفيذ إجراءات كتابة مع معاينة/تأكيد
- P2: Phase 5 تنظيف وتوثيق
- P2: إرسال الخطابات الصادرة خارجياً عبر البريد/واتساب
- P2: سجل المراسلات الواردة

## آخر تحديث (جلسة لاحقة — وحدة الخطابات الرسمية)
- 🔴 **إصلاح حرج**: خطابات بمتن HTML طويل (فقرات كثيرة) كانت تفقد المحتوى (الفقرات من رقم 12 فصاعداً) وتتداخل مع الذيل بسبب أن `ensure_y` في `services/letter_pdf.py` كانت تقارن بـ`y` قديمة بدل الموضع الفعلي أثناء الرسم داخل `draw_rich` (`services/rich_text_pdf.py`). تم الإصلاح بتمرير `y` الحالية إلى `ensure(space, y)`. تحقق بصري بخطاب 45 فقرة: كل الفقرات ظاهرة على 5 صفحات صحيحة.
- إصلاح فراغ كبير أسفل خطابات PDF قصيرة المحتوى على صفحة جديدة: موضع QR والتوقيع أصبح نسبياً لموضع نهاية المتن بدل موضع ثابت، وقُلّص الحد الأدنى المحجوز فوق الذيل من 60مم إلى 54مم (صفحة جديدة فقط عند الاقتراب الفعلي من التذييل).
- إضافة ترقيم الصفحات (n/N) لكشوف الساعات الإضافية (`teacher_overtime.py`) والتقارير العامة (`report_pdf.py`) بنفس أسلوب الخطابات.
- إضافة إعدادات QR قابلة للتخصيص لكل خطاب (إظهار/إخفاء، الموضع: بجانب التوقيع أو صغير في الذيل، الحجم بالمليمتر) في لوحة "تخطيط الصفحة".
- إصلاح: الخاتمة والتوقيع يأتيان دائماً من الكليشة بغض النظر عن القالب المختار (كانا يتجمّدان داخل القالب عند "⭐ حفظ كقالب" ويتجاهلان تحديثات الكليشة لاحقاً).
- إصلاح تسرّب أقسام القالب (مثل التحية) إلى افتراضي الكليشة عند "💾 حفظ كافتراضي للكليشة" — الآن يُستخدم ما هو محفوظ فعلياً في الكليشة (GET /letterheads/{id}) كأساس، لا الدمج الكامل مع افتراضيات النظام/القالب.
- إضافة تحقق من تفرّد اسم القالب (400 عند التكرار) + التحقق من صحة ObjectId في PUT/DELETE /letter-templates/{tid} (404 بدل 500).
- إعادة تصميم "سجل الخطابات": بحث سريع بارز، شرائح حالة قابلة للنقر، قسم "تصفية متقدمة" بحقول معنونة، ونافذة "عرض سريع" (👁️) لكل خطاب تعرض التفاصيل + أزرار PDF/Word/تعديل دون مغادرة السجل. نطاق الرؤية (صلاحيات/دور) مطبّق مسبقاً في الباك إند عبر `_visible_filter` (لم يتغيّر).
- إصلاح بحث رقم الخطاب في السجل ليطابق حتى لو كُتب بالاتجاه المعكوس بصرياً (RTL).
- اختبار شامل (iteration_109 ثم iteration_110): نجاح 100% باك إند وفرونت إند بعد الإصلاحات.

## بيانات الدخول للاختبار
- Admin: admin / admin123
- Student: 1001 / test1234
- Teacher: teacher180156 / teacher123

## Phase 3 (DONE — 2026-08-21)
- Lecture cancellation classification: `cancellation_reason_type` ('college'|'non_college') on lectures, settable ONLY when status→cancelled (not absent), ONLY by admin/dean/department_head (role-based, teachers always stripped). Endpoints: PUT /api/lectures/{id}/status and PUT /api/lectures/{id}.
- Effect: 'college' reason reduces the course's expected hours in teacher_overtime.py (no shortfall, no overtime inflation); 'non_college' behaves as before.
- New "إجازة التحضير" (Preparation Leave) feature: admin/dean/department_head manually declare date-range periods (scope: all/faculty/department/course) via new `prep_leave_periods` collection + `/api/prep-leave-periods` CRUD (routes/prep_leave.py) + frontend screen `/prep-leave-periods`. Lectures inside an active matching period are excluded from `services/absence_engine.course_profiles` (both numerator/denominator) for ALL students — forgiving absence, not tied to exams automatically.
- UI: new shared `CancelLectureModal` component used in schedule.tsx and course-lectures.tsx; cancellation_reason_type badge shown on both screens; admin menu + side menu entries restricted via `roles` field (admin/dean/department_head only).
- Tested via testing_agent (iteration_112): 14/15 pytest cases pass (tests/test_phase3_cancel_type_prep_leave.py). Remaining 1 failure is pre-existing unrelated behavior (teacher access to /status endpoint, not in scope).

## Next: Phase 4 — Faculty Board (مجلس الكلية) module for deprivation decisions.
