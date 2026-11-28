# PRD - نظام إدارة جامعي (React Native Web + FastAPI + MongoDB)

## نظرة عامة
تطبيق إدارة جامعي شامل بالعربية (RTL) يغطي: الحضور، الجداول، المعلمين، الطلاب، شؤون الموظفين، المراسلات، التقارير.

## إصلاح أمني واسع: عزل الصلاحيات في وحدات التقارير (16 نوفمبر 2026 - تحديث 6)
**البلاغ:** بعد إصلاح عزل الخطابات، طلب المستخدم فحص باقي وحدات لوحة المهام للتأكد من التزامها بالعزل حسب الكلية/القسم.

**الاكتشاف:** فحص شامل كشف أن ~9 نقاط API في `server.py` (مونوليث 20K+ سطر) كانت تتحقق فقط من **الصلاحية** (permission كـ boolean) دون التحقق من كون البيانات المطلوبة ضمن **نطاق المستخدم الفعلي** (عميد/رئيس قسم). تم تأكيد الثغرة عملياً: `Saeed` (رئيس قسم، كلية البنات فقط) كان يستطيع فعلاً جلب تقرير كامل لطالب من كلية الشريعة والقانون عبر `GET /reports/student/{id}` بمجرد تمرير الـ ID — بلا أي رفض.

**الإصلاح (`server.py` + `routes/teacher_overtime.py`):**
- دالة غلاف جديدة `_report_scope_guard()` تُعيد نطاق المستخدم عبر الآلية المركزية المُختبرة `get_user_scope_filter` (نفس الآلية المستخدمة في `fee_receipts.py`/`management_dashboard.py`)، وتتجاوز الفحص لمستخدمي "الإنفاذ الفعلي" (لهم فحصهم الخاص المنفصل أصلاً).
- طُبِّقت على: `reports/lesson-completion`, `reports/department/{id}`, `reports/attendance-overview`, `reports/absent-students`, `reports/student/{id}`, `reports/daily`, `reports/warnings`, `reports/course/{id}/detailed`, `reports/teacher-summary`, `reports/teacher-delays`, `reports/teacher-attendance` (+ تصديراتها PDF/Excel جميعاً ترث الإصلاح تلقائياً لأنها تستدعي نفس الدوال)، و`select_teachers()` في `teacher_overtime.py` (تُغذّي `reports/teacher-workload`).
- **لم يُغيَّر أي دور/مستخدم/صلاحية** — فقط فلترة البيانات المرتجعة، تماماً كما طلب المستخدم. تحقق بصمة DB (md5 لحقول role/permissions/scope) متطابقة قبل وبعد.
- **تحقق شامل عبر `testing_agent`**: 28/28 اختبار pytest ناجح (403 صحيح لكل وصول خارج النطاق، 200 طبيعي للأدمن وللنطاق الذاتي، لا كسر لأي من أدوار TEACHER الحالية). لا توجد مشاكل حرجة.
- ⚠️ **هذا الإصلاح حرج أمنياً مثل سابقه** — سيُطبَّق تلقائياً فور النشر القادم (لا يحتاج backfill بيانات، فقط كود).
- **ملاحظات اختيارية (غير حرجة، من الاختبار)**: (1) تناقض بسيط في منطق النطاق بين teacher-summary (نطاق قسم المعلم) وteacher-attendance/delays (نطاق قسم المقرر الذي يُدرّسه) — قد يظهر معلم في تقرير ولا يظهر بآخر؛ (2) عند تعديل مسودة خطاب ساعات إضافية أنشأها مستخدم أوسع نطاقاً، قد تتضيّق قائمة المعلمين المُعاد بناؤها لنطاق المُحرِّر الأضيق. كلاهما غير أمنيين (لا تسريب بيانات)، محفوظان في Backlog أدناه.

## تطبيق منطق "العبء الأكاديمي" على الملاحظتين السابقتين (16 نوفمبر 2026 - تحديث 7)
طلب المستخدم مراجعة طريقة احتساب العبء الأكاديمي (التي تعترف بعلاقتي "ينتمي للقسم" و"يُدرّس في القسم" معاً عبر `department_id`/`teach_department_id`) وتطبيق نفس المنطق على الملاحظتين السابقتين:
1. **توحيد نطاق «ملخص أداء المعلم»**: كان يعتمد فقط على القسم الرسمي للمعلم (علاقة الانتماء)، بينما تقارير التأخر/الحضور تعتمد على القسم الذي يُدرّس فيه فعلياً (علاقة التدريس) — بالضبط كما يفعل العبء الأكاديمي عبر `teach_department_id`. أُضيفت دالة `_teacher_identity_scope_guard()` تجمع العلاقتين بـ `$or` (انتماء رسمي + يُدرّس مقرراً ضمن النطاق)، وطُبِّقت على `reports/teacher-summary` وعلى النطاق الافتراضي لـ `select_teachers()` (تقرير نصاب المدرس نفسه) لتوحيد المنطق تماماً. تحقق فعلي: معلم "زائر" رسمياً من كلية أخرى لكنه يُدرّس مقرراً ضمن قسم رئيس القسم → أصبح يظهر الآن في ملخصه وفي قائمة نصاب المدرس الافتراضية لرئيس القسم، بينما معلم لا علاقة له إطلاقاً لا يزال 403/غير ظاهر (الحدود الأمنية سليمة).
2. **إصلاح تضييق مسودة خطاب الساعات عند التعديل**: أُضيف باراميتر `skip_scope=True` لدالة `select_teachers()`، ويُستخدم حصرياً في `rebuild_overtime_table()` (إعادة بناء جدول خطاب موجود بفلاتره الأصلية المخزّنة) — فلا يُعاد فحص نطاق من يُعدّل المسودة الآن، بل تُحترم نية مُصدرها الأصلي، تماماً مثل إصلاح `created_by_faculty_ids` في نظام الخطابات العامة سابقاً.
- **لم تُمَسّ الأدوار/المستخدمين/الصلاحيات** — توسيع منطقي للعلاقة المعترف بها فقط، بدون أي تغيير صلاحيات.



## إصلاح أمني/عزل: الخطابات العامة كانت تظهر لكل العمداء/رؤساء الأقسام بلا عزل (16 نوفمبر 2026 - تحديث 5)
**البلاغ:** "القوالب لا تحتفظ بالتنسيق المسبق" + "لا يوجد عزل حسب الكلية/القسم — الرسائل تظهر للجميع".

**التحقيق والسبب الجذري:**
1. **التنسيق:** نظام الخطابات الفعلي هو `routes/letters.py` + `services/letter_pdf.py` (ReportLab + `services/rich_text_pdf.py`) — تم التحقق عملياً (PNG فعلي) أن الخط/اللون/العريض تُحفظ وتُعرض بشكل صحيح في PDF الفعلي. السبب الحقيقي للشكوى: عند فشل توليد صورة المعاينة الحيّة (`previewImg`) لأي سبب عابر، كانت الواجهة تتراجع صامتة لعرض نصي بلا أي HTML (`preview.replace(/<[^>]+>/g,' ')`) بخط أميري ثابت — فتبدو وكأن التنسيق "ضاع". **الإصلاح**: الآن يُعرض fallback بالـ HTML الفعلي (`dangerouslySetInnerHTML`) محافظاً على التنسيق الحقيقي، + تسجيل خطأ preview-pdf في console بدل الكتم الصامت الكامل، لتشخيص أي تكرار مستقبلاً. (ملاحظة: كان هناك أيضاً ثغرة @font-face ناقصة لخطوط كوفي/تجوّل/المرعي في نظام `correspondence_pdf.py` المنفصل — أُصلحت أيضاً احتياطاً رغم أنه غير مستخدم حالياً في واجهة "الخطابات الرسمية".)
2. **🔴 عزل الكليات/الأقسام (الأهم):** `hr_scope_isolation_faculty_ids()` تُعيد عمداً `None` (= "غير مقيَّد") لأدوار dean/department_head/admin/university_president بافتراض أن لديهم نطاقاً أكاديمياً خاصاً بهم يُطبَّق في مكان آخر. لكن فلتر رؤية الخطابات **«العامة» (بلا أشخاص مرفقين)** في `_visible_filter()` كان يعتمد **فقط** على هذه الدالة، فيُعامل أي عميد/رئيس قسم كأنه **غير مقيَّد إطلاقاً** لرؤية/وسم الخطابات العامة — فتظهر خطاباته العامة لكل عمداء الجامعة بلا استثناء، والعكس. تم التحقق عملياً (قبل الإصلاح) ثم إصلاحه وإعادة التحقق.
   - **الإصلاح (`routes/letters.py`)**: دالة جديدة `_isolation_scope()` تجمع بين عزل hr_scope ونطاق المستخدم الأكاديمي الخاص (`faculty_id`/`department_id` مع حلّ القسم إلى كليته الأم عبر `db.departments`) — تُستخدم في `_visible_filter` وفي الدوال الثلاث التي تسم الخطاب عند الإصدار/الحفظ كمسودة/النسخ (`_finalize_fields`, إنشاء مسودة, `/duplicate`).
   - **إصلاح تراجعي للبيانات القديمة**: `backfill_letters_isolation_scope()` في `server.py` (خطوة إقلاع تلقائية idempotent) تُعيد وسم الخطابات القديمة المُصدرة من عميد/رئيس قسم بنطاقه الصحيح.
   - **تحقق فعلي (عبر API حقيقي حسابي Saeed=رئيس قسم بكلية البنات، Salim=عميد كلية الشريعة)**: بعد الإصلاح، خطاب عام صادر من Saeed يظهر له ولـ admin فقط، ولا يظهر لـ Salim (كلية مختلفة) — ✅ العزل يعمل الآن بشكل صحيح.
- **تحديث بعد الاختبار (`testing_agent`)**: اكتشف السبب الجذري الحقيقي والأدق لمشكلة التنسيق — قاعدة CSS عامة في `app/_layout.tsx` تفرض `* { font-family: Cairo !important }` على كامل التطبيق (لأسباب تصميم متعمدة)، وهذا كان يُبطل أي خط يختاره المستخدم داخل محرر الخطابات (Tiptap inline style) ويُظهره دائماً كـ Cairo — هذا تحديداً سبب شعور المستخدم بأن "التنسيق يعود للوضع العادي". **الإصلاح**: أُضيفت قواعد CSS أكثر تحديداً (selector بالخاصية `[style*="font-family: X"]`) لكل من الخطوط الخمسة (Amiri/Noto Kufi Arabic/Cairo/Tajawal/Almarai)، فتفوز على القاعدة العامة بفضل التحديد الأعلى دون إلغاء فرض Cairo في باقي التطبيق. تم التحقق عبر `getComputedStyle` فعلياً: الخط المختار (تجوّل) أصبح يُطبَّق بشكل صحيح.
- **إصلاح حافة إضافية اكتشفها الاختبار**: عند اعتماد (`finalize`) مسودة أنشأها عميد/رئيس قسم من قِبل مستخدم آخر (مثل admin)، كان نطاق العزل `created_by_faculty_ids` يُعاد حسابه بنطاق **اعتماد المسودة** (admin = غير مقيَّد) فيُمحى العزل الأصلي. تم الإصلاح بالحفاظ على نطاق مؤلف المسودة الأصلي عند الاعتماد. تحقق فعلي: مسودة من Saeed يعتمدها admin → يبقى نطاق Saeed محفوظاً.
- إصلاح إضافي بسيط: تضييق نطاق فحص `_isolation_scope` ليقتصر فقط على أدوار dean/department_head (بدل أي مستخدم لديه faculty_id/department_id بالصدفة) لمنع عزل أوسع من المقصود.
- ⚠️ **هذا الإصلاح حرج أمنياً**: سيُطبَّق تلقائياً على بيانات الإنتاج (app.ahgaff.net) فور أول نشر قادم (الإصلاح التراجعي يعمل تلقائياً عند إقلاع الباكند).

**الطلب:** في تقرير نصاب المدرسين، عند تنفيذ التقرير بحسب القسم (يدرّس فيه أو ينتمي إليه)، يجب السماح للمستخدم باختيار من يريد ظهوره فعلياً في "خطاب الساعات" المرفوع رسمياً، بدلاً من رفع كل من يظهر في نتيجة التقرير تلقائياً.

**التنفيذ (`src/components/reports/RaiseLetterBar.tsx`, `app/report-teacher-workload.tsx`):**
- أُضيف للمودال "رفع كخطاب رسمي" قسم جديد "👥 من يشمله هذا الخطاب؟" يعرض قائمة بكل الأساتذة الظاهرين حالياً في التقرير (نفس قائمة `rows` المعروضة على الشاشة، تُمرَّر كـ prop جديد `reportTeachers`)، مع checkbox لكل أستاذ.
- **الافتراضي: الجميع محدَّدون (مشمولون)**. يمكن للمستخدم إلغاء تحديد من لا يريد ظهوره في هذا الخطاب تحديداً، مع زر "تحديد الكل / إلغاء تحديد الكل".
- عند الرفع، تُدمج قائمة الاستبعاد اليدوي الجديدة مع آلية الاستبعاد القديمة الخاصة بـ"الأساتذة المكررين سابقاً" (`dupMode`) — **لم يتم تغيير تلك الآلية القديمة إطلاقاً**، فقط أُضيف استبعاد إضافي اختياري بجانبها، ويُرسلان معاً إلى الباكند عبر نفس حقل `exclude_teacher_ids` الموجود مسبقاً في `/reports/teacher-workload/raise-letter` (لم يتطلب أي تعديل بالباكند).
- تم التحقق بصرياً عبر السكرينشوت: المودال يعرض القائمة، إلغاء تحديد أستاذ يُحدّث العداد (1/1 → 0/1) بشكل صحيح، وبقية خيارات المودال (نوع الخطاب، الجهة، الملاحظة) تعمل كما كانت دون أي كسر.

**المشكلة المُبلّغ عنها:** معلم لديه 6 مقررات و94 محاضرة لكن معاينة "الجدول الأسبوعي" في صفحة تفاصيله تُظهر "لا يوجد جدول أسبوعي مُسجَّل لهذا المعلم".

**السبب الجذري:** عند إسناد مقرر لمعلم عبر "العبء التدريسي" (`teaching-load` / زر "إسناد مقرر")، كان الكود يُحدّث `courses.teacher_id` فقط، لكنه **لا يُزامن** حقل `teacher_id` في خلايا `weekly_schedule` (الجدول الأسبوعي الفعلي). فيبقى الجدول الأسبوعي يشير للمعلم **القديم**، بينما تقرير "الجدول الأسبوعي" يفلتر حسب معلم المقرر **الحالي** → نتيجة فارغة رغم وجود مقررات ومحاضرات فعلية. (مسار "تعديل المقرر" المباشر كان يُزامن هذا بالفعل، لكن مسار العبء التدريسي لم يكن يفعل ذلك.)

**الإصلاح (`/app/backend/backend/routes/teaching_load.py`):**
- أُضيفت دالة مشتركة `_sync_weekly_schedule_teacher()` تُزامن `weekly_schedule.teacher_id` مع المعلم الجديد (أو تُلغيه) عند كل عملية إسناد/إلغاء إسناد — في `create_teaching_load` (مسارين) و`bulk_save_teaching_load` و`delete_teaching_load`. تحترم المجموعات ذات القائد الخاص (`group.teacher_id`) ولا تغيّرها.
- **إصلاح تراجعي للبيانات القديمة**: أُضيفت `backfill_weekly_schedule_teacher_sync()` في `server.py` كخطوة إقلاع تلقائية (idempotent)، تُزامن كل خلايا الجدول الأسبوعي القديمة مع المعلم الحالي الصحيح للمقرر عند كل تشغيل للباكند. تم التحقق أنها أصلحت 3 سجلات قديمة في بيئة المعاينة فوراً بعد إعادة التشغيل.
- تم التحقق من الإصلاح عملياً عبر API حقيقي (إعادة إسناد مقرر لمعلم آخر ثم التأكد من تزامن الجدول الأسبوعي تلقائياً، ثم إعادة الوضع لحالته الأصلية).
- ⚠️ **مهم**: هذا الإصلاح سيُطبَّق تلقائياً على بيانات الإنتاج (app.ahgaff.net) عند أول عملية **نشر/إعادة نشر (Deploy)** قادمة، لأن خطوة الإصلاح التراجعي تعمل تلقائياً عند إقلاع الباكند في أي بيئة.

- أُضيف تبديل عرض شبكي/قائمة للمقررات في صفحة "تفاصيل الطالب" (`student-details.tsx`) بنفس نمط صفحة الأستاذ.
- العرض الافتراضي لمقررات كل من صفحة الأستاذ وصفحة الطالب أصبح **شبكي** مع إمكانية التبديل لقائمة (الحالة محلية في الصفحة، لا تُحفظ بعد التنقل).
- جرى التحقق يدوياً بالسكرينشوت أن كل الروابط والإجراءات الحالية (الإجراءات السريعة، تعديل، تصدير PDF/Excel، إلغاء تفعيل...) ما زالت تعمل بدون أي كسر.

## آخر الإنجازات (16 نوفمبر 2026)
- إضافة إجراءات إدارية كاملة لصفحة "تفاصيل الأستاذ" (`teacher-courses.tsx`):
  - قائمة "إجراءات الأستاذ": تعديل البيانات، تفعيل/إلغاء تفعيل الحساب، إعادة تعيين كلمة المرور، حذف المعلم (مع نسخة احتياطية تلقائية).
  - قائمة "عرض وتصدير آخر": معاينة وتصدير (Excel/PDF) للعبء التدريسي، تقرير الساعات، الجدول الأسبوعي — دون مغادرة الصفحة.
  - تبديل عرض شبكي/قائمة للمقررات المسندة.
  - تصدير Excel/PDF مباشر للعبء التدريسي من رأس الصفحة.
- تم إصلاح الأخطاء التالية بعد المراجعة والاختبار:
  - متغير `totalHours` غير معرّف كان يسبب Crash عند فتح معاينة "العبء التدريسي" → تم ربطه بـ `data.total_weekly_hours`.
  - أنماط CSS مفقودة (viewToggle, menuCard, fieldLabel, deptChip, reportStatRow...) → تمت إضافتها.
  - **إصلاح حرج**: منطق "تفعيل/إلغاء تفعيل الحساب" كان يعتمد على `teacherFull.is_active` (دائماً true من الباكند) بدل `!!teacherFull.user_id` — كان يمنع إعادة تفعيل أي حساب مُعطَّل من هذه الصفحة. تم إصلاحه ليطابق منطق `manage-teachers.tsx`.
  - إصلاح 500 عند إدخال ساعات أسبوعية عشرية (8.5) في نموذج التعديل: `weekly_hours` في `TeacherBase/TeacherUpdate` كان `Optional[int]` → أصبح `Optional[float]`.
  - إصلاح تخطيط العرض الشبكي (RTL): كان يملأ من اليسار ويترك عموداً فارغاً؛ أصبح `row-reverse` بعرض صحيح 3 أعمدة.
  - إضافة padding/border للحقول والمعاينات (نموذج التعديل، معاينة التقارير).
  - توحيد تسمية ملفات تصدير "تقرير الساعات" و"الجدول الأسبوعي" باستخدام `filenameFromResponse` (مع الطابع الزمني) بدل اسم ثابت.
- تم اختبار الصفحة بالكامل عبر `testing_agent` (تسجيل دخول admin، فتح /manage-teachers، فتح تفاصيل أستاذ، جميع الإجراءات، التصدير، الحذف الآمن لمعلم تجريبي) — جميع التدفقات تعمل بنجاح بعد الإصلاحات.

## إنجازات الجلسة السابقة
- لوحة التحكم (Concept 2): شبكة بطاقات المقاييس (`DashModulesGrid.tsx`) + شبكة "مهام إضافية" قابلة للإخفاء (`DashExtraTasksGrid.tsx`) محفوظة في `hidden_tasks` بقاعدة البيانات.
- إصلاح ظهور تبادل/إنابة المحاضرات للمعلم البديل في الباكند (`server.py`) + شارة بنفسجية "🔁 تبادل/إنابة" في الواجهة.

## قائمة المهام المتبقية (Backlog)

### P0 - معلّق (بانتظار تفاصيل من المستخدم)
- مشكلة "قائمة الطلاب فارغة عند أخذ الحضور من قبل الأستاذ البديل" — تم تأجيلها بطلب المستخدم. بانتظار تفاصيل إضافية (اسم المقرر، مكان الخطأ بالضبط) قبل المتابعة.

### P1
- إشعار للعميد عند محاولة إجراء متكرر خارج الصلاحية (403 متكرر).
- ترتيب أبجدي (A-Z) لقائمة الكليات/الأقسام في `study-plans-overview.tsx`.
- منتقي ألوان حر (hex/rgb) لخلفيات خلايا الجداول في المحرر.
- تحذير عند مغادرة الصفحة بوجود خطاب مكرر غير محفوظ/غير صادر.
- أمان: كلمة المرور بنص صريح في localStorage (وجدها testing_agent سابقاً، لم تُصلح بعد) — يجب فحص `AuthContext.tsx`.

### P2
- ميزة "تثبيت ⭐" للمهام الإضافية في اللوحة (تثبيت 2-3 عناصر مفضلة أعلى القائمة).
- شارات "🔁 إنابة" في تقرير الحضور الشهري لتوضيح من درّس المحاضرة فعلياً.

## الملفات الرئيسية
- `/app/backend/backend/server.py` — المنطق الأساسي (ضخم، تعديلات دقيقة فقط).
- `/app/backend/backend/models/teachers.py` — نماذج المعلمين.
- `/app/backend/backend/routes/teacher_overtime.py` — حساب تقرير النصاب/الساعات الإضافية.
- `/app/backend/backend/routes/weekly_schedule.py` — تصدير الجدول الأسبوعي المرئي.
- `/app/frontend/app/teacher-courses.tsx` — صفحة تفاصيل الأستاذ (كبيرة ~1480 سطر، يُنصح مستقبلاً بتقسيمها إلى مكونات: TeacherActionsMenu, EditTeacherModal, DeleteTeacherModal, ReportsPreviewModal).
- `/app/frontend/app/manage-teachers.tsx` — قائمة المعلمين (مصدر نمط hasAccount/user_id الصحيح).
- `/app/frontend/src/services/api.ts` — جميع استدعاءات الـ API.

## ملاحظات فنية
- اللغة: **العربية فقط في كل التواصل**.
- `teacher-courses.tsx` تجاوزت 700 سطر — يُنصح بالفصل لمكونات عند أي تعديل كبير قادم.
- حالة الحساب (مُفعّل/غير مُفعّل) تُحدَّد دائماً بوجود `user_id`، وليس حقل `is_active` (الذي لا يُغيّره الباكند أبداً).

## 2026-11-16: إصلاح "تسريب المهام الإضافية" — إزالة كل الصلاحيات الافتراضية الضمنية بالدور
**البلاغ:** مستخدم بدور مخصص (custom/employee) كان يرى بطاقات في "مهام إضافية" (الدرجات، سجل الإفادات، اعتماد صور الطلاب، طباعة/تصميم البطاقات...) رغم أن دوره لا يملك هذه الصلاحية — توجيه المستخدم الصريح: "لا أريد صلاحيات افتراضية لأي دور، كل دور نضيف الصلاحيات إليه صراحة حتى لو كان رسمياً".
**السبب الجذري:** عدة دوال Backend كانت تمنح الوصول تلقائياً لأي مستخدم "دوره ليس teacher/student" دون تحقق من صلاحية صريحة: `statements.py::_can_issue/_can_manage_templates/list_statements`, `grades.py::_can_manage`, `student_cards.py` (كل نقاط النهاية)، `faculty_board.py::_can_decide`, `prep_leave.py::_can_manage`. والواجهة استخدمت `alwaysVisible: true` أو `roles: [...]` بدل صلاحية فعلية لـ 9 بطاقات في `DashExtraTasksGrid.tsx`.
**الإصلاح:**
- صلاحيات جديدة قابلة للمنح من "إدارة الأدوار": `manage_grades`, `approve_student_photos`, `print_student_cards`, `manage_faculty_board`, `manage_prep_leave`.
- كل الدوال أعلاه الآن تتطلب `has_permission(user, perm)` صراحة (admin دائماً كامل الوصول، ونطاق الكلية محفوظ).
- **لم تُضف** أي صلاحية جديدة إلى `DEFAULT_PERMISSIONS` لأي دور — بطلب المستخدم؛ من يحتاجها يُمنحها يدوياً.
- الواجهة: 9 بطاقات أصبحت تستخدم `perms` مطابقة للـ Backend. بقيت `verify-report` فقط عامة (بلا بيانات حساسة).
- **أثر جانبي مقصود:** dean/department_head/registrar/registration_manager فقدوا الوصول الضمني لهذه الميزات ما لم تُمنح الصلاحية صراحة الآن.
- تحقق عبر testing_agent (iteration_191) + إصلاح 6 ثغرات إضافية اكتُشفت (print-report, batches, batch-count, list statements, templates, verify-base-url) + إعادة تحقق curl كاملة (admin=200، dean بلا صلاحية=403، teacher=403).
**ملفات محدّثة:** `models/permissions.py`, `routes/statements.py`, `routes/grades.py`, `routes/student_cards.py`, `routes/faculty_board.py`, `routes/prep_leave.py`, `frontend/.../DashExtraTasksGrid.tsx`.


## 2026-11-16 (تكملة): تبويب "تدقيق الصلاحيات" داخل شاشة إدارة الأدوار
**الطلب:** تقرير يقارن لكل دور/مستخدم الصلاحيات الممنوحة فعلياً مقابل الميزات الظاهرة له — مع الحفاظ التام على الأدوار والصلاحيات الحالية بلا أي تعديل، وعدم إسناد أي صلاحية جديدة لأي دور تلقائياً.
**التنفيذ:**
- صُدِّرت قائمة `EXTRA_TASKS` من `DashExtraTasksGrid.tsx` (مصدر واحد للحقيقة — نفس القائمة التي تحدد بطاقات لوحة التحكم) مع إضافة حقل `category` لكل عنصر (أكاديمي/تقارير/إداري/نظام وصيانة).
- أُضيف تبويب جديد "تدقيق الصلاحيات" داخل `manage-roles.tsx` (بجانب تبويب "الأدوار" الحالي، دون أي تغيير على منطق إنشاء/تعديل الأدوار).
- عند اختيار دور (أو "المدير العام admin")، يعرض التبويب كل الميزات مجمّعة حسب التصنيف مع شارة حالة: ممنوحة ✓ (أخضر) / غير ممنوحة (رمادي) / عامة (أزرق، لا تحتاج صلاحية أصلاً) / للأدمن فقط (بنفسجي) / ⚠️ بلا صلاحية فردية (أصفر تحذيري، لاكتشاف أي ميزة مستقبلية تُضاف بلا صلاحية).
- **مسح شامل إضافي** وُجد أثناء البناء: نفس ثغرة "أي دور ليس معلم/طالب = وصول تلقائي" كانت موجودة أيضاً في `certificates.py::list_certificates` (شهادات التخرج) — أُصلحت بنفس نمط `issue_statements`.
- تم التحقق بصرياً (Playwright): admin يُظهر كل الميزات "متاحة"، ودور "عميد كلية" (القالب النظامي) يُظهر فقط ما يملكه فعلاً (view_reports/manage_schedule) والباقي "غير ممنوحة" أو "عامة" بدقة — مطابق تماماً لسلوك الـ Backend الحقيقي.
**ملفات محدّثة:** `frontend/src/components/dashboard/DashExtraTasksGrid.tsx` (تصدير + category)، `frontend/app/manage-roles.tsx` (تبويب جديد)، `backend/backend/routes/certificates.py` (إصلاح ثغرة مماثلة).



## 2026-11-16 (تصحيح): توسيع سجل الميزات في تبويب "تدقيق الصلاحيات" ليكون شاملاً
**البلاغ:** لدور "مدير شؤون الموظفين" (12 صلاحية حقيقية) ظهر "2 من 45" فقط في التدقيق رغم أن الدور يملك وصولاً فعلياً لعشرات الشاشات — لأن السجل المستخدم (`EXTRA_TASKS`) كان يغطي فقط بطاقات "مهام إضافية" بالصفحة الرئيسية، ولا يشمل شاشات الموارد البشرية (HR) ولا الشاشات الأساسية (الطلاب، المعلمين، المقررات، التسجيلات، المستخدمين...) الموجودة في `SideMenu.tsx`.
**الإصلاح:**
- صُدِّرت `MENU_ITEMS` من `SideMenu.tsx` (القائمة الأكمل والمرجعية الحقيقية لكل شاشات التطبيق — نفس القائمة المستخدمة في القائمة الجانبية الفعلية).
- تبويب التدقيق يدمج الآن `MENU_ITEMS` + أي عنصر من `EXTRA_TASKS` غير موجود بالفعل في `MENU_ITEMS` (بالمقارنة بالمسار/route) → الآن يغطي **103 ميزة/شاشة** بدل 45.
- أُضيفت حالات تصنيف جديدة دقيقة: `للمعلم فقط` (teacherOnly)، `🧪 نظام متقدم` (ميزات تعمل عبر نظام الصلاحيات المتقدم الأحدث advPermissionKeys وليس القائمة القديمة) — لتفادي تصنيفها خطأً كـ"⚠️ بلا صلاحية فردية".
- **إصلاح تبعي مهم**: عنصرا "إجازة التحضير" و"مجلس الكلية" في `SideMenu.tsx` كانا لا يزالان يستخدمان `roles: ['admin','dean','department_head']` القديمة رغم أن الـ Backend تم إصلاحه في الجلسة السابقة ليتطلب `manage_prep_leave`/`manage_faculty_board` صراحة — تم توحيدهما الآن ليطابقا الـ Backend تماماً.
**ملفات محدّثة:** `frontend/src/components/SideMenu.tsx` (تصدير MENU_ITEMS + إصلاح عنصرين)، `frontend/app/manage-roles.tsx` (دمج السجلّين).


## 2026-11-16 (تكملة 2): إدارة الصلاحيات مباشرة من تبويب "تدقيق الصلاحيات" + قائمة منسدلة للأدوار
**الطلب:** السماح بمنح/سحب صلاحية بالضغط مباشرة على حالة الميزة داخل تبويب التدقيق، ورؤية الأثر في تبويب "الأدوار" فوراً — مع استبدال شريط اختيار الأدوار الأفقي بقائمة منسدلة أنيقة. شرط صريح: عدم المساس بصفحة/منطق "الأدوار" القديم.
**التنفيذ:**
- استُبدل شريط الأدوار الأفقي (chips) بقائمة منسدلة (`Picker` من `@react-native-picker/picker`).
- كل عنصر بحالة "ممنوحة"/"غير ممنوحة" أصبح قابلاً للضغط: يعرض تأكيداً يوضح ماذا سيتغيّر (وأي ميزات أخرى قد تتأثر) قبل التنفيذ.
- يستخدم **نفس نقطة نهاية الحفظ الحالية** `PUT /api/roles/{id}` — لا نقطة نهاية جديدة ولا تعديل على `roles.py` أو منطق التحرير القديم.
- حماية من "الخلط": لا يُسمح بسحب صلاحية إلا إذا كانت موجودة حرفياً في قائمة صلاحيات الدور (وليست ممنوحة ضمنياً عبر صلاحية أشمل) — تظهر رسالة توجّه لتعديلها من تبويب "الأدوار" بدل كسرها هنا.
- **تحقق فعلي**: دور اختبار مؤقت مُنح/سُحب منه صلاحية عبر التدقيق وانعكس فوراً في تبويب "الأدوار"، ثم حُذف. تأكد أن دور "عميد كلية" الحقيقي (30 صلاحية) لم يتأثر.
**ملفات محدّثة:** `frontend/app/manage-roles.tsx` فقط (تبويب التدقيق) — تبويب "الأدوار" ومنطقه لم يُلمسا.

## 2026-11-17 — تعديل الجنسيات جماعياً
- قائمة جنسيات معتمدة (settings.type=student_nationalities، افتراضية 39 جنسية بصيغة المذكر) — تعديلها يتطلب manage_settings.
- صفحة /bulk-nationality: اختيار كلية/قسم → إحصائية الجنسيات الحالية (تمييز غير المعتمدة بالأحمر) → تطبيق على الكل أو على أصحاب جنسية معينة فقط (توحيد الكتابات).
- زر «تعيين الجنسية» في شريط التحديد بصفحة الطلاب (اختيار من القائمة).
- APIs: GET/PUT /api/admin/students/nationalities, GET /api/admin/students/nationality-stats, POST /api/admin/students/bulk-set-nationality (صلاحية students_bulk_ops أو manage_students + نطاق المستخدم).
- Backlog: تحويل حقل الجنسية في إضافة/تعديل طالب إلى قائمة منسدلة من نفس القائمة.
- 2026-11-17: الجنسية أصبحت قائمة منسدلة (NationalityPicker) في: إضافة طالب (الطلاب + طلاب المقرر)، تعديل طالب (الطلاب + تفاصيل الطالب)، نافذة الإفادة. الخادم يوحّد الصيغ (_nat_key: ال/ة/ى/الهمزات) ويرفض غير المعتمد في الإضافة/التعديل؛ استيراد Excel يصحّح المعروف ويُرجع nationality_msg بغير المعروف.
- Backlog: استيراد طلاب من صفحة المقرر (/students/import/{course_id}) لا يقرأ عمود الجنسية.
- 2026-11-17: حقول الهوية الشخصية للطالب (اختيارية): full_name_en, birth_date, birth_place, id_type(national_id/passport/residence/other), id_number, id_expiry_date, marital_status(single/married/divorced/widowed). مكوّن موحّد StudentIdentityFields في كل نماذج الإضافة/التعديل؛ ملخص + تنبيه انتهاء الوثيقة (<90 يوم) في تفاصيل الطالب؛ مدعومة في استيراد/قالب/تصدير Excel. التحقق في admin_tools.clean_identity.
- Backlog: إضافة متغيرات الهوية (الاسم الإنجليزي، الميلاد، رقم الوثيقة) لقوالب الإفادات والخطابات؛ تقرير الوثائق المنتهية/القريبة من الانتهاء.
- 2026-11-17 (RBAC الجدول): السبب الجذري للتسرّب: FULL_PERMISSION_MAPPING['manage_courses'] كانت تتضمن manage_schedule (→ view_schedule) ضمنياً — أُزيلت. can_manage_schedule صار صريحاً (manage_schedule فقط؛ أُلغي منح dean/department_head/registrar/manage_settings/manage_courses). assert_view_schedule يحرس كل GET للجدول الأسبوعي؛ /lectures/all-schedule يتطلب view/manage_schedule أو manage_attendance أو المعلم لنفسه. الواجهة: حراسة صفحتي /schedule و/weekly-schedule، إخفاء زر «الجدول» السفلي، بطاقة «محاضرات اليوم»، وأزرار الإدارة للعرض فقط. manage-roles يزامن خريطة التوسيع من /permissions/available (full_mapping).
- 2026-11-17: فُصلت manage_semesters و manage_academic_years عن manage_courses (صلاحيات مستقلة صريحة). أُزيل بديل manage_courses من نقاط الفصول/الأعوام و PUT /settings (manage_settings فقط) و admin_tools._ensure_admin.
- 2026-11-18: إعادة تصميم تبويب الأدوار في /manage-roles: شريط أدوات مضغوط (رجوع/تبويبات/بحث/دور جديد)، شبكة بطاقات مضغوطة، حذف بطاقة المعلومات وبطاقتي إنشاء الأدوار الجاهزة (endpoints الخلفية بقيت دون استخدام من الواجهة). لا تغيير على الأدوار أو الصلاحيات.
- 2026-11-18: إرسال الإشعارات: نطاق للدور (كل الجامعة/كلية/قسم)، واختيار المستلمين للكلية/القسم (الطلاب والمعلمون/المعلمون/الطلاب)، ومعاينة حيّة لعدد المستلمين (POST /api/notifications/preview). منطق موحّد _resolve_targets في routes/notifications.py.
- 2026-11-18: الإشعارات: مستلمو المستوى/الشعبة (طلاب/معلمو مقررات المستوى/الكل)، قوالب مشتركة (notification_templates)، جدولة (scheduled_notifications + cron scheduled-notifs كل 15 دقيقة → POST /api/notifications/scheduled/run بسر WEBHOOK_CRON_SECRET)، قائمة المجدولة مع الإلغاء.
- 2026-11-18: نطاق المستخدم المقيَّد: GET /api/me/academic-scope + hook useAcademicScope. الإشعارات: _enforce_scope يرفض الإرسال خارج النطاق (all/role بلا نطاق/كلية أخرى/طالب أو معلم أو مقرر خارجه)، البحث والمقررات والسجل والمجدولة مقيَّدة. تقرير النصاب: كليته فقط مختارة تلقائياً؛ فلتر الكلية/القسم يشمل المعلمين الزائرين الذين يدرّسون فيها (بنصابهم الكامل حسب طلب المستخدم). سجل الخطابات بلا تغيير (العامة ظاهرة).
- 2026-11-18: سجل الخطابات (letters._visible_filter) وسجل خطابات الساعات الإضافية: غير المدير يرى ما أصدره/أنشأه فقط (قرار المستخدم الصريح). البحث عن الأشخاص لإضافتهم للخطاب غير مقيَّد.
- 2026-11-18: دليل المناصب والأسماء: faculty_id (عام/كلية)، عزل الرؤية visible_query (القوائم والمرسَل إليهم والموقّع)، إدارة مناصب الكلية لمن لديه issue_letters ضمن نطاقه، موقّع افتراضي لكل كلية (default_signer_for) مع الرجوع للعام؛ رفض موقّع خارج النطاق. زر 📇 في صفحة الخطابات.
- 2026-11-22: إصلاح: صفحتا إجازة التحضير ومجلس الكلية كانتا تفحصان الدور (admin/dean/department_head) في الواجهة بدل الصلاحية — صارتا manage_prep_leave / manage_faculty_board.
- 2026-11-22: إجازة التحضير: حقل mode (exclude|present). exclude = استبعاد من حساب الطالب، present = حضور معتمد لكل الطلاب (حتى الغائب/المعذور) في محرك الغياب absence_engine.course_profiles. كلا الوضعين يُستبعدان من نصاب تنفيذ المدرس (compute_workload: تُخصم من الافتراضية ولا تُضاف للمنفَّذ). تأكيد قبل التنفيذ في الواجهة.

## 2026-06 — Fix: Prep Leave «present» mode
- Root cause: mode only adjusted absence_engine on the fly; lecture screen/reports/student pages read raw attendance & lectures auto-marked "absent" by cron.
- Fix: routes/prep_leave.py apply_present_period writes real "present" attendance (method=prep_leave, tagged prep_present_period_id) and sets lecture completed (prev status saved); delete reverts; sync runs on create, list, and hourly absence-reminders cron. Teacher workload still excludes these dates (teacher_overtime).

## 2026-06 — Student Results (literal Excel, no calculations)
- Collection `student_results` (unique reg_no+level): s1_status/s1_gpa/s1_grade/s2_status/s2_gpa/s2_grade as raw text, empty=null.
- routes/student_results.py: POST /api/student-results/import (xlsx/xls/csv, upsert), GET /api/student-results?q, DELETE /{id}, GET /template (perm manage_grades); GET /api/students/me/results returns rows by student's student_id literally (old computed version removed from grades.py).
- Frontend page /student-results + dashboard tile "نتائج الطلاب (التطبيق)". Prep-leave «present» now materializes whole period on save.
- 2026-06: Scope isolation added: student_results (import rejects out-of-scope/unknown reg_nos, list/delete scoped via get_own_department_ids) and prep_leave (scoped users cannot use scope=all or targets outside scope; faculty only if they own all its departments; list hides other scopes; can_delete flag). Frontend prep page hides «الجامعة بالكامل» and filters options via useAcademicScope.
- 2026-06: Student results import now 2-step: commit=false preview (statuses new/changed/unchanged/invalid/out_of_scope/duplicate + reasons, no writes) → commit=true saves new/changed only; notify=true (UI checkbox default on) sends in-app + push "صدرت نتيجتك" only to students with new/changed rows. Note: notification templates already exist in routes/notifications.py (/notifications/templates).
- 2026-06: Results v2 — collection `result_entries` (reg_no, level, semester 1|2, academic_year, status/gpa/grade literal; unique key incl. year → repeaters keep history; app shows latest year). Legacy student_results auto-migrated on startup (renamed student_results_legacy_migrated). Endpoints: GET /api/results/students (filters+scope), GET /api/results/students/{id} (card), POST/DELETE /api/results/entries, GET /api/results/template, POST /api/results/import (year+level+semester+faculty|department, 4 cols, preview/commit/notify). Old /api/student-results/* removed. Page /student-results (tile «النتائج») with tabs table/upload.
- 2026-06: Results permissions view_results / manage_results (manage implies view; manage_grades no longer grants). Hide: per batch (POST /api/results/batches/{id}/visibility → entries.batch_hidden) and per entry (POST /api/results/entries/{id}/visibility → hidden); hidden latest = null cell in app. Undo: every import/manual edit/manual delete creates a `result_batches` doc with change snapshots; POST /api/results/batches/{id}/undo restores prior state (skips entries changed later), no notification. History tab «سجل العمليات».
- 2026-06: Results page redesigned to site style (header+breadcrumb+actions, stat cards, dropdown Picker filters, dense 100-row table with current-level S1/S2 results, horizontal scroll <1000px). Upload & history are modals. Blank template GET /api/results/template/blank. Sidebar link «النتائج» after «تقارير العبء» (perms view_results/manage_results).
- 2026-06: Results levels/sections follow faculty settings: /api/faculties now returns levels_count & sections; filters/upload/card use faculty levels_count; section filter (faculty sections ∪ actual student sections via `sections` in /results/students); optional section in template/import (stored on batch).
- 2026-06: Grades (multi-sheet Excel) ↔ Results/app: services/grade_stages.py reads stage sheets (الأول/الثاني/التصفية) → per-course letter + stage badge (first/second/tasfiya from r2/tas columns) + sem_status/sem_gpa/cum_gpa (as displayed). On grades import commit (needs manage_results to publish) → result_entries batch (status, gpa, "تراكمي X") with notify for changed only; delete/replace import undoes/re-targets linked batches. GET /api/students/me/grades for app (hidden batch hides semester). grades.py now scope-isolated (_deps/_check_dep/_check_import), matching only inside chosen department, duplicate names not auto-matched. Real sample: backend/tests/sample_grades_L3S2.xls. Exceptional round (استثنائي) pending user sample.
- 2026-06: Results pause switch: collection results_pauses (scope all/faculty/department); GET/POST /api/results/pauses (scope-validated via prep_leave._target_in_scope); /me/results & /me/grades return paused:true + message when student's dept/faculty/all paused; pause/resume logged as event_only batches. UI: header button + modal + inline banner. App option A chosen (results screen, tap semester → course details).
- 2026-06: Results DRAFT→PUBLISH (always default): every /results/import and grades-linked import creates batch draft:true hidden:true, entries batch_hidden:true + prev_visible (old published values shown to student meanwhile). POST /api/results/batches/{id}/publish unhides + sends notification (notify_on_publish stored at upload). Manual edit on a draft entry keeps it hidden (draft_batch_id). Undo of draft releases draft_batch_id entries. /me/grades hides records whose grade import has an un-published draft batch. UI: wizard «حفظ كمسودة», history badge «مسودة — غير منشورة» + «نشر للطلاب». Tests: backend/tests/test_results_draft_publish_iter209.py (iteration_209).
- 2026-11: 🎓 مركز النتائج (/results-center): rc_settings per faculty (coursework_max, coursework_pass_pct, pass_mark, second_cap, exceptional_cap, grade_scale); rc_marks per course/student (coursework, first_exam, second_exam, exceptional_exam, 'غ'=absent); rc_sheets lock; rc_decisions (second_uncapped, exceptional capped/uncapped, reason, board session); rc_log audit. Engine services/rc_engine.py. Publish POST /api/rc/publish → grade_imports(source results_center)+student_grades → link_grades_import DRAFT batch → publish from history (supersedes old rc import). Perms: rc_view, rc_manage_settings, rc_enter_coursework, rc_unlock_coursework, rc_enter_exams, rc_board_decisions, rc_approve (+manage_results to publish). Absence limits system-wide 10.9 unexcused / 15.9 excused (new max_excused_percent) / 25.9 total (>=), one-time migration. Tests: backend/tests/test_results_center_iter210.py (iteration_210). Deferred: teacher-app entry with monthly items.
- 2026-11: RC rule change: exam marks enterable per student before lock (needs that student's coursework); coursework edit blocked if it changes eligible/in_second/in_exc or clears it while exam marks exist; Excel import add-only (existing marks status 'exists', never overwritten); course list search + page size (12/24/48/all) + pager. Tests iteration_211, tests/test_results_center_iter210.py self-seeding (20 pass).
- 2026-11: Coursework tab renamed «السعي والدورين»: inline inputs for first (eligible) & second (in_second) rounds + المجموع/الأهلية/النتيجة; multi-field save sequential coursework→first→second.
- 2026-11: Second round failing (<pass_mark or غ) records final2 = 0.
- 2026-11: RC eligibility by attendance precedes coursework (att_eligibility; absence-ineligible → in_second without coursework; lock requires coursework only for att_ok); per-mark undo POST /api/rc/courses/{id}/log/{log_id}/undo (only latest change, once) + clear-to-delete; tabs reordered (eligibility first, default).
- 2026-11: student-results page size chips (24/48/100/all → /results/students?limit, 0=all) + live debounced search; RC course sheet student search (name/reg).
- 2026-11: RC bulk undo POST /api/rc/courses/{id}/undo-bulk {op_id|log_ids} (clear pass exams→coursework, restore pass coursework→exams); reset POST /api/rc/courses/{id}/reset {fields} (op, undoable); log grouped by op_id with select/undo-op; «تفريغ الدرجات» button.
- 2026-11: RC simplification: '-' = un-record (parse_mark), multi-select rows + bulk bar (fill value / '-' per field), save order clears exams→coursework then sets; log modal read-only «سجل العمليات»; reset button removed (backend endpoints kept).
- 2026-11: First-round pass rule: exam >= exam_pass_pct(50%) of exam max + compensation max(0, cw_max*50% - cw) (cw17/40 → needs 33). New setting exam_pass_pct. Eligibility tab = attendance only. Coursework tab columns: الأهلية box (att_ok ✓/✗ read-only) | السعي | الأول | الثاني | الملاحظات (دور ثان + reason).
- 2026-11: Level first-round sheet GET /api/rc/level-sheet (+/export): per course points=total1/20, letter scale أ4.5 ب4 ج3.25 د2.5 هـ, weighted=points×credits; semester/prev/cumulative totals; 'دور ثان' label if any course in second; prev cumulative from rc_prev_totals (Excel POST /api/rc/prev-totals/import, perm rc_approve) else published rc imports. UI RcLevelSheet via «كشف الدور الأول للمستوى» button.
- 2026-11: ScrollBox (src/components/ScrollBox.tsx): web div overflow:auto maxHeight 70vh, direction rtl, sticky headers; level sheet rewritten as HTML <table dir=rtl> (fixes LTR flip in prod), used in RcMarksTable & ResultsTable.
- 2026-11: Second-round cell now shows 'المعتمد: X' under raw exam mark (engine already caps at 50/0).
- 2026-11: Scroll box (70vh, sticky header, RTL) applied to DenseTable (all attendance reports), OvertimeSheet, teacher workload list. Master schedule already had it (72vh sticky).
- 2026-11: Level sheet export (Excel+PDF) in paper-form layout with merged multi-row headers: services/level_sheet_export.py, GET /rc/level-sheet/export?fmt=xlsx|pdf
- 2026-11: ResultsNav (src/components/results/ResultsNav.tsx): shared breadcrumb + tabs (النتائج/مركز النتائج/الدرجات) on student-results, results-center, grades; returns to existing stack instance (state kept). results-center course/level views are URL params (view, course) pushed to history; filters persisted in URL on both pages.
- 2026-11: Level sheet excludes students from other levels/departments enrolled to repeat a course (listed in 'excluded'); publish unaffected.
- 2026-11: Notifications: FCM sent in chunks of 100 (FCM multicast limit) via asyncio.to_thread; push delivery moved to background task (_push_bg) updating notification_history status; API returns immediately. Fixes failures for role/faculty/department/all audiences.
- 2026-11: Notifications send waits up to 25s for push (3 parallel FCM chunks of 100), then continues in background (Cloud Run-safe). Prod backend is Cloud Run api.ahgaff.net (not Emergent deploy).
- 2026-11: Dead push tokens (FCM Unregistered/SenderIdMismatch/invalid token, Expo DeviceNotRegistered) auto-deleted after each send; history stores removed_devices. Prod had 2465 registered devices (>500 FCM cap) — root cause of bulk send failures.
- 2026-11: Results publish notification (_notify_students) awaited in publish request, push via task with 25s bounded wait; dead-token purge centralized in firebase_service._purge_dead (applies to all senders).
- 2026-11: result_batches.push {status,devices,students_with_device,success,failure,removed} recorded on publish; shown in ResultsHistory (PushLine) with 5s auto-refresh while sending.
- 2026-11: Partial publish: POST /rc/publish accepts course_ids; previously approved courses (grade_imports.course_ids, latest per dept/level/semester_id) auto-included; non-approved courses appear as 'لم تصدر بعد'; no GPA until complete. Preview returns approved flag. UI: course checklist in RcPublishModal + 'اعتماد هذا المقرر ← النتائج' button inside course sheet (needs rc_approve+manage_results). Test test_partial_publish added.
- 2026-11: report-warnings: filters level (server), section + student search (client + export), row checkboxes; exports (PDF/Excel) honor level/section/q/student_ids; /reports/warnings accepts section,q,student_ids; scope guard unchanged. Excel columns cleaned.
- 2026-11: Absence final outcome (university rule): absence_engine.outcome_of → first/takmili/repeat/dismiss with excess hours; faculty setting dismiss_absence_percent (default 50) in general-settings; rc_engine blocks rounds for repeat/dismiss, takmili=second round; council decision second_uncapped has deduct_pct (default 10%). New report /report-absence-summary (GET /api/reports/absence-summary?fmt=json|pdf|xlsx) replicating official 'المحصلة النهائية للغياب' sheet (services/absence_sheet_export.py). Tests: tests/test_absence_outcomes.py (official sheet numbers). Note: tests/test_absence_engine.py has 2 pre-existing failures (excused-limit era).
- 2026-11: Dismiss default 50.9%. ResultsNav on results-center: hides /grades (إفادات) link, adds /report-absence-summary link.
- 2026-11: Students with status 'repeat' excluded from results-center sheets (_build) and absence summary.
- 2026-11: Absence summary KPIs now count students (counts) + course cells (cell_counts); clickable outcome filter (param outcome); summary export view=summary (PDF/Excel brief: student, worst outcome, course lists).
- 2026-11: Student requests system: routes/student_requests.py (/api/student-requests: types CRUD [manage_request_types], student submit/my/cancel/reply, staff list/detail/decide [manage_student_requests], attachments via storage_service, scope via student_excuses._in_scope). Builtin type absence_excuse listed for students. Portal page /student-requests (tabs: الطلبات / النماذج وحقولها). Student app handoff: /app/memory/handoffs/STUDENT_APP_REQUESTS.md.
