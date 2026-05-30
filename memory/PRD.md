# نظام إدارة الحضور - جامعة الأحقاف

## ما تم إنجازه - جلسة 30 مايو 2026 (تكملة 3) ✅

### إدارة حالات الطلاب - 5 حالات + إجراءات جماعية (P0 - مكتمل)

**الفلسفة:** بدل اعتماد is_active فقط، نحفظ حالة واضحة للطالب لمعرفة سبب خروجه من المستوى.

#### الحالات الخمس
| الحالة | الوصف | is_active | يتم النقل لمستوى؟ |
|---|---|---|---|
| `active` | مستمر في الدراسة | true | اختياري |
| `repeat` | إعادة (راسب، ينتظر) | true | اختياري (نزول لمستوى أقل) |
| `graduated` | متخرّج | false | لا (يحفظ graduation_date) |
| `expelled` | مفصول | false | لا (يحفظ expulsion_date) |
| `frozen` | مجمَّد مؤقتاً | false | لا (يحفظ frozen_at) |

#### Backend (`routes/student_status.py`)
- [x] `GET /api/student-status/stats` - إحصائيات لكل حالة (مع فلتر قسم/كلية)
- [x] `POST /api/student-status/{student_id}/change` - تغيير فردي (new_status, new_level?, reason?, effective_date?)
- [x] `POST /api/student-status/bulk-change` - تغيير جماعي (student_ids[], new_status, new_level?, reason?)
- [x] `GET /api/student-status/{student_id}/history` - سجل التغييرات
- [x] Collection جديدة: `student_status_history` (append-only audit log)
- [x] تحديث `StudentResponse` ليشمل الحقول الجديدة (status, graduation_date, expulsion_date, frozen_at, graduated_from_level, status_reason)
- [x] RBAC: admin أو MANAGE_STUDENTS فقط

#### Frontend (`app/student-status-manager.tsx`)
- [x] 5 بطاقات إحصائية ملونة (مستمر/إعادة/متخرج/مفصول/مجمَّد)
- [x] 4 صفوف فلاتر (كلية / قسم / مستوى / حالة)
- [x] بحث بالاسم / رقم الطالب / الرقم المرجعي
- [x] Checkbox فردي + زر "تحديد كل المعروض"
- [x] شريط إجراءات سفلي ديناميكي (يظهر عند التحديد)
- [x] Modal إجراء: اختيار حالة + مستوى اختياري + سبب + تطبيق
- [x] Modal تاريخ: يعرض كل تغيير حالة سابق مع badge قبل/بعد + التاريخ + المستخدم
- [x] رابط "حالات الطلاب" في SideMenu

#### الاختبار
- [x] `testing_agent_v3_fork`: Backend **100% (16/16 pytest)** + Frontend **100%**
- [x] ملف اختبار: `/app/backend/tests/test_student_status.py`
- [x] RBAC مؤكد (teacher → 403)
- [x] is_active يُضبط تلقائياً (graduated/expelled/frozen → false، active/repeat → true)
- [x] تاريخ كامل لكل تغيير

## ما تم إنجازه - جلسة 30 مايو 2026 (تكملة 2) ✅

### رفع الخطة الدراسية عبر Excel + مسح خطة قسم (P0 - مكتمل)

**الفلسفة:** المستخدم يبني الخطة الدراسية يدوياً عبر Excel بدلاً من backfill من بيانات قديمة فوضوية (480 مقرر بشُعب مدمجة في الكود + term=None).

#### Backend (`routes/curriculum.py`)
- [x] `DELETE /api/curriculum/department/{id}/wipe` - مسح خطة قسم بالكامل (حذف ناعم، يلغي الإسنادات، يسجل في activity_logs)
- [x] `GET /api/template/curriculum` - تحميل نموذج Excel بـ 5 أعمدة (رمز، اسم، ساعات، مستوى، فصل) مع 5 صفوف أمثلة
- [x] `POST /api/curriculum/upload/preview?department_id=X` - معاينة قبل التنفيذ:
  - يفك الـ Excel ويحلل الأعمدة بمرونة (يدعم تسميات متعددة بالعربية)
  - يفحص حد المستوى من إعدادات الكلية (`levels_count`)
  - يصنف الصفوف: صالح / مكرر في الملف / موجود في DB / خارج النطاق
  - يُرجع عينة من كل تصنيف + أخطاء التحليل
- [x] `POST /api/curriculum/upload?department_id=X&mode=merge|replace` - تنفيذ:
  - `merge`: إضافة الجديد فقط، تخطي الموجود
  - `replace`: يمسح القديم بالكامل ثم يضيف الجديد (مع إلغاء إسنادات قديمة)
  - يقبل: 1/2/الأول/الثاني/first/second لقيمة الفصل
- [x] دالة `_normalize_term()` تتعامل مع كل صيغ الفصل (رقم/نص/عربي/إنجليزي)
- [x] دالة `_parse_curriculum_excel()` تستخرج الأعمدة بمطابقة ذكية للكلمات المفتاحية

#### Frontend (`app/curriculum.tsx`)
- [x] استبدال شريط الأزرار بـ 5 أزرار جديدة:
  - 🟢 إضافة مقرر (يدوياً)
  - 🔵 تحميل نموذج (يحمّل xlsx)
  - 🟢 رفع من Excel (يفتح file picker → معاينة → تنفيذ)
  - 🔵 توليد للفصل النشط
  - 🔴 مسح خطة القسم (تأكيد مزدوج بكتابة اسم القسم)
- [x] Modal معاينة كامل: 4 بطاقات إحصائية (صالح/موجود/خارج النطاق/مكرر) + اختيار وضع (merge/replace) + قائمة عينة من الصالح + أخطاء التحليل + الموجود مسبقاً
- [x] إخفاء أزرار "استيراد من الأرشيف" و"بناء من المقررات النشطة" (مكتبية بدلاً من البارز - عبر modal)

#### الاختبار اليدوي (curl)
- [x] تحميل النموذج: 200 / 5233 bytes ✓
- [x] معاينة: 5 valid, 0 errors ✓
- [x] مسح القسم: 5 wiped + 2 assignments cleared ✓
- [x] رفع merge: created=5, skipped=0 ✓
- [x] إعادة الرفع: created=0, skipped=5 (idempotent) ✓

#### بيانات الإنتاج المُكتشَفة على api.ahgaff.net
- **480 مقرر إجمالاً**، جميعها بـ `semester_id=None` و `term=None`
- 9 أنماط شُعب فوضوية: أ، ب، ج، د، 1، 7، (د)، الترمذي، فارغ
- نفس الكود يظهر بدون شعبة + مع شُعب (مثل AHK2109 + AHK2109-أ/ب/ج/د)
- **القرار:** المستخدم يبني خطة جديدة عبر Excel ويتجاهل البيانات القديمة

## ما تم إنجازه - جلسة 30 مايو 2026 (تابع) ✅

### إعادة هيكلة الهيكل الأكاديمي - 3 طبقات (P0 - مكتمل 100%)

**المشكلة:** أرشفة الفصل كانت تحذف المقررات نهائياً، فيختفي تعريف المقرر مع المعلم تاريخياً.

**الحل:** فصل تعريف المقرر عن جلسات الفصل:
- **Layer 1 - `curriculum_courses`:** تعريف ثابت للمقرر (الكود، الاسم، الساعات، القسم، المستوى، الفصل 1/2)
- **Layer 2 - `teacher_assignments`:** ربط دائم بين معلم ومقرر من الخطة
- **Layer 3 - `courses` (موجود):** جلسات فعلية في فصل أكاديمي محدد، مرتبطة بـ `curriculum_course_id`

#### Backend (`routes/curriculum.py` - 750+ سطر)
- [x] `GET /api/curriculum/courses` - قائمة مع فلاتر (قسم، كلية، مستوى، فصل)
- [x] `GET /api/curriculum/by-department/{id}` - شبكة (مستوى × فصل) مع المعلمين المُسنَدين
- [x] `GET /api/curriculum/courses/{id}` - تفاصيل + معلمون + إحصائيات
- [x] `POST /api/curriculum/courses` - إنشاء (admin) مع فحص تكرار الكود
- [x] `PUT /api/curriculum/courses/{id}` - تحديث
- [x] `DELETE /api/curriculum/courses/{id}` - حذف ناعم (is_active=False)
- [x] `GET /api/curriculum/assignments` - قائمة الإسنادات
- [x] `POST /api/curriculum/assignments` - إسناد معلم لمقرر (مع فحص تكرار)
- [x] `DELETE /api/curriculum/assignments/{id}` - إلغاء ناعم
- [x] `POST /api/curriculum/generate-offerings?semester_id=X` - توليد Layer 3 من الخطة
- [x] `POST /api/curriculum/backfill-from-active` - بناء الخطة من المقررات النشطة (idempotent، يربط `curriculum_course_id`)
- [x] `POST /api/curriculum/import-from-archive/{semester_id}` - استيراد من فصل مؤرشف
- [x] `server.py` - تعديل `activate_semester` لاستقبال `?auto_generate_from_curriculum=true` للتوليد التلقائي عند التفعيل

#### Frontend
- [x] `/curriculum` - شبكة (مستوى × فصل) لكل قسم، إضافة/حذف/توليد/استيراد/بناء من النشط
- [x] `/teacher-assignments` - عرض الإسنادات مجمعة حسب المعلم، فلتر بالقسم، إسناد جديد بواجهة بحث
- [x] روابط SideMenu: "الخطة الدراسية" + "إسناد المعلمين" مع صلاحيات MANAGE_COURSES / VIEW_COURSES

#### الاختبار
- [x] `testing_agent_v3_fork`: Backend 100% (19/19) + Frontend 100%
- [x] ملف اختبار: `/app/backend/tests/test_curriculum.py` (19 حالة pytest)
- [x] RBAC مؤكد: المعلم يحصل على 403 لكل POST/PUT/DELETE
- [x] Backfill idempotent (المحاولة الثانية: created=0, skipped=8)

## ما تم إنجازه - جلسة 30 مايو 2026 ✅

### نظام الأرشيف الدراسي الشامل (P0 - مكتمل)

**الفلسفة:** فصل البيانات إلى نوعين:
- **بيانات ثابتة (Master Data):** students, teachers, departments, faculties, users — تبقى دائماً في المجموعات الحية بغض النظر عن الفصل.
- **بيانات تشغيلية (Operational Data):** courses, lectures, attendance, enrollments, study_plans — تنتمي لفصل معيّن.

عند أرشفة فصل:
- ✅ يتم نسخ كل العمليات التشغيلية للفصل إلى `semester_archives` مع snapshot للأسماء (denormalized) لحماية الأرشيف من أي تعديلات لاحقة على الأسماء.
- ✅ يتم **حذف** فقط العمليات التشغيلية الخاصة بالفصل من المجموعات الحية.
- ❌ **لا يُحذف أبداً:** students, teachers, departments, faculties, users.

#### Backend
- [x] إعادة كتابة `POST /api/semesters/{id}/archive` في `server.py` بشكل شامل:
  - يجمع courses + lectures + attendance + enrollments + study_plans
  - يحسب summary (total_courses, total_students, total_teachers, total_lectures, completed_lectures, overall_attendance_rate)
  - يأخذ snapshots للأسماء (students_snapshot, teachers_snapshot, departments_snapshot, faculties_snapshot)
  - يثري المقررات بـ teacher_name + department_name + lectures stats + completion_pct
  - يحذف البيانات التشغيلية بعد النسخ
  - يحدّث الفصل إلى status=ARCHIVED
- [x] إنشاء `routes/archives.py` بـ **6 endpoints جديدة** للقراءة + بحث:
  - `GET /api/archives` - قائمة الفصول المؤرشفة
  - `GET /api/archives/search?q=&type=&semester_id=` - بحث في الأرشيف
  - `GET /api/archives/{semester_id}` - ملخص فصل مؤرشف
  - `GET /api/archives/{semester_id}/courses` - قائمة المقررات
  - `GET /api/archives/{semester_id}/courses/{course_id}` - تفاصيل مقرر + طلابه + نسب حضور
  - `GET /api/archives/{semester_id}/students` - الطلاب وحضورهم العام
  - `GET /api/archives/{semester_id}/teachers` - عبء المعلمين
- [x] إضافة 3 صلاحيات في `models/permissions.py`: `VIEW_ARCHIVE`, `SEARCH_ARCHIVE`, `EXPORT_ARCHIVE`
- [x] منحها افتراضياً لـ `Admin` و `Dean` فقط
- [x] دعم Smart Arabic regex في البحث

#### Frontend
- [x] 3 صفحات جديدة:
  - `/archives` - قائمة الفصول المؤرشفة مع 4 بطاقات إحصائيات سريعة لكل فصل
  - `/archive-details?semesterId=...` - 4 تبويبات (نظرة عامة, مقررات, طلاب, معلمون) + بانر تحذيري بنفسجي "أنت تتصفح فصلاً مؤرشفاً"
  - `/archive-search` - بحث شامل في كل الفصول المؤرشفة + فلاتر (الكل/طلاب/معلمون/مقررات) + فحص استباقي للصلاحية مع locked-state للمحظورين
- [x] رابطان جديدان في SideMenu تحت قسم "الأرشيف الدراسي" مع التحقق من الصلاحية
- [x] ثوابت الصلاحيات في `AuthContext.tsx`

#### الاختبار
- [x] `testing_agent_v3_fork`: Backend 95% (17/18) + Frontend 100%
- [x] الصلاحيات تعمل: Admin 200، Teacher 403 (RBAC مُحكم)
- [x] رسائل ودية بالعربية للمحظورين
- [x] ملف اختبار pytest: `/app/backend/tests/test_archives.py`

## ما تم إنجازه - جلسة 29 مايو 2026 ✅

### صفحات تفاصيل الكيانات للبحث الشامل (P0 - مكتمل)
- [x] إنشاء `routes/entity_details.py` مع 4 endpoints جديدة (لا تمس endpoints التطبيقات الموجودة):
  - `GET /api/teachers/{id}/full-profile` — ملف المعلم الكامل: بيانات + مقررات + إحصائيات
  - `GET /api/courses/{id}/full-details` — تفاصيل المقرر: بيانات + معلم + قسم + طلاب مع نسب حضور + إحصائيات محاضرات + ملخص خطة دراسية
  - `GET /api/departments/{id}/summary` — ملخص القسم: بيانات + كلية + رئيس + معلمين + مقررات + إحصائيات
  - `GET /api/faculties/{id}/summary` — ملخص الكلية: بيانات + عميد + أقسام + إحصائيات مجمّعة
- [x] تسجيل router في `server.py`
- [x] تحديث `routes/global_search.py` ليوجّه نتائج البحث إلى الصفحات الجديدة:
  - teachers → `/teacher-details?teacherId=...` (بدلاً من `/manage-teachers?focus=...`)
  - courses → `/course-details?courseId=...` (بدلاً من `/course-lectures`)
  - departments → `/department-details?departmentId=...`
  - faculties → `/faculty-details?facultyId=...` (كان `/add-department` خطأ)
- [x] إنشاء 4 صفحات frontend في `/app/frontend/app/`:
  - `teacher-details.tsx` — ملف ملوّن بنفسجي + 3 بطاقات إحصائيات + قسم بيانات + قائمة مقررات قابلة للنقر
  - `course-details.tsx` — header أخضر + 3 بطاقات + 3 تبويبات (نظرة عامة/الطلاب/المحاضرات) + روابط داخلية للمعلم والقسم + بار تقدّم الخطة الدراسية + بحث طلاب
  - `department-details.tsx` — header برتقالي + 3 بطاقات + قسم معلمين + قسم مقررات
  - `faculty-details.tsx` — header أحمر + 3 بطاقات + قائمة أقسام مع mini-stats
- [x] تنقّل داخلي بين الصفحات (المقرر → المعلم/القسم، القسم → الكلية/المعلم/المقرر، الكلية → القسم)
- [x] **اختبار شامل بـ testing_agent_v3_fork:** Backend 100% (18/18 pytest cases), Frontend 100% (login + كل الصفحات + التنقل + البحث الشامل). ملف الاختبار: `/app/backend/tests/test_entity_details.py`
- [x] **لم يتم لمس أي endpoint قديم** (تطبيقات المعلم والطالب آمنة)

## ما تم إنجازه - جلسة 9 مايو 2026 ✅

### إصلاح Bug نسبة إكمال الخطة الدراسية (P0 - مكتمل)
- [x] `update_lecture` (server.py): عند مسح `lesson_title`، تُعاد حالة المحاضرة إلى SCHEDULED ويُمسح `plan_topic_id` وتُلغى التأكيدات اليدوية المرتبطة
- [x] `delete_lecture` (server.py): عند حذف محاضرة مرتبطة بموضوع، يُلغى التأكيد اليدوي تلقائياً (إن لم تكن هناك محاضرة مكتملة أخرى مرتبطة بنفس الموضوع)
- [x] Endpoint جديد `GET /api/admin/cleanup-ghost-completions/preview`: معاينة الإنجازات الوهمية
- [x] Endpoint جديد `POST /api/admin/cleanup-ghost-completions`: إصلاح بأمان (يلمس المحاضرات فقط، لا يلمس التأكيدات اليدوية المشروعة)
- [x] شاشة UI `/cleanup-ghost-completions` مع بطاقات إحصائية وإضافتها لقائمة الأدمن
- [x] اختبار: تم اكتشاف 2 محاضرة بحالة "مكتملة" بدون عنوان وإصلاحها بنجاح


## ما تم إنجازه - جلسة 29 أبريل 2026 (تابع)

### Phase 1.8 - تسريع الأداء (Performance Pass #1) ✅
- [x] `routes/dashboard.py` جديد: 3 endpoints موحّدة تجمع كل بيانات الصفحة الرئيسية في نداء واحد
  - `GET /api/dashboard/admin` (1 نداء بدل 2) — ~100ms
  - `GET /api/dashboard/student` (1 نداء بدل 6+) — ~130ms (مقابل 600ms+ قديماً = **4-5x أسرع**)
  - `GET /api/dashboard/teacher` (1 نداء بدل 4) — ~140ms
- [x] استخدام `asyncio.gather` للتوازي على مستوى DB داخل كل endpoint
- [x] فهارس MongoDB إضافية: `attendance(student_id,course_id)`, `notifications(recipient_id,is_read)`, `students.user_id`, `teachers.user_id`, `courses(department_id,level)`
- [x] `(tabs)/index.tsx`: إعادة كتابة `fetchData` لاستخدام dashboardAPI الموحّدة
- [x] `src/services/api.ts`: in-memory cache (3 دقائق TTL) للبيانات الثابتة (`/faculties`, `/departments`, `/university`, `/settings`, `/my-scope`, `/roles`, `/permissions/*`)
  - إبطال تلقائي عند POST/PUT/DELETE/PATCH على نفس الـ prefix
  - إبطال كامل عند logout (`clearMemCache`)
- [x] `src/services/cache.ts`: أداة عامة `getOrFetch()` / `getCached()` / `invalidate()` للاستخدام في صفحات أخرى عند الحاجة

### إصلاحات صغيرة (نفس الجلسة)
- [x] حقل "الرمز الرقمي للكلية" (`numeric_code`) — كان موجوداً في state لكن لم يُضَف كحقل إدخال في `general-settings.tsx`
- [x] استجابة `/api/departments/stats` أصبحت تُعيد `default_program_code` (كانت تُحفظ ولا تُرجَع فيبدو في Edit كـ "غير محدد")

## ما تم إنجازه - جلسة 28-29 أبريل 2026

### Phase 1.7 - الرقم المرجعي + الملء الذكي للطلاب (مكتمل)
- [x] Backend models: `program_code`, `enrollment_year`, `reference_number` على الطالب، `default_program_code` على القسم
- [x] صيغة: `AUB2501001` (جامعة+برنامج+سنة+كلية+تسلسل)
- [x] 4 Endpoints في `routes/admin_tools.py` (references + autofill)
- [x] `create_student`: ملء تلقائي للبرنامج من القسم، السنة من المستوى، توليد الرقم
- [x] حساب enrollment_year = بداية الفصل المُفعَّل - (المستوى - 1)
- [x] Frontend: شاشتا أدمن جديدتان + حقول جديدة في تعديل الطالب والقسم
- [x] اختبار E2E: إنشاء طالب بدون حقول → كل شيء يُملأ تلقائياً + رقم مرجعي

### Phase 1.6 - فلترة المحاضرات حسب الفصل المُفعَّل (مكتمل)
- [x] helper `get_active_semester_with_dates()` يدعم status='active' و is_active=True
- [x] `normalize_semester_date()` لتحويل D-M-YYYY إلى YYYY-MM-DD
- [x] إحصائيات `GET /api/lectures/{id}` مفلترة بالفصل المفعل
- [x] `POST /api/lectures` يحفظ semester_id + semester_name تلقائياً
- [x] أداة Backfill للمحاضرات القديمة (`/admin/backfill-lecture-semesters`)
- [x] بانر "إحصائيات الفصل الثاني (من ... إلى ...)" في شاشة محاضرات المقرر

## ما تم إنجازه - جلسة 28 أبريل 2026

### Phase 1 - تقسيم server.py (مرحلة 1 - مكتملة)
- [x] إنشاء `/app/backend/backend/routes/study_plans.py` (594 سطر)
- [x] نقل 10 endpoints للخطة الدراسية من server.py:
  - GET/PUT `/courses/{id}/study-plan`
  - GET `/template/study-plan`
  - POST `/courses/{id}/study-plan/upload`
  - POST `/courses/{id}/study-plan/clone-from`
  - POST `/courses/{id}/study-plan/approve` / `unapprove` / `reject-pending` / `confirm-topics`
- [x] تسجيل الـ router في server.py
- [x] حذف 543 سطر من server.py: **12895 → 12589 سطر**
- [x] اختبار regression بعد التقسيم: 7 سيناريوهات نجحت 100% (template, GET, approve, teacher PUT pending, reject, confirm-topics, unapprove)
- [x] إصلاح bug إضافي: `$ne` مكرر استبدل بـ `$nin` (كان bug أصلي في server.py)

### Phase 1.5 - نظام اعتماد الخطة الدراسية (مكتمل Backend + Frontend)
- [x] Backend — حقول جديدة في `study_plans`:
  - `approved`, `approved_by`, `approved_date`
  - `pending_weeks`, `pending_submitted_by`, `pending_submitted_at`, `pending_mode`
  - على كل topic: `confirmed`, `confirmed_date`, `was_taught`, `confirmed_by`
- [x] Backend — Endpoints جديدة:
  - `POST /api/courses/{id}/study-plan/approve` (admin) — يعتمد ويستبدل بالـ pending إن وُجد
  - `POST /api/courses/{id}/study-plan/unapprove` (admin)
  - `POST /api/courses/{id}/study-plan/reject-pending` (admin)
  - `POST /api/courses/{id}/study-plan/confirm-topics` (teacher) — تأكيد قائمة `[{topic_id, was_taught}]`
- [x] Backend — منطق PUT/Upload للمعلم بعد الاعتماد: يُحفظ في `pending_weeks` (لا يستبدل)
- [x] Frontend `manage-study-plan.tsx`:
  - شارة "الخطة معتمدة" خضراء
  - بانر "تعديلات بانتظار المراجعة" (للأدمن) مع زر "عرض التفاصيل"
  - بانر "بانتظار اعتماد الأدمن" (للمعلم بعد تقديم تعديلات)
  - بانر "الخطة معتمدة" (للمعلم - توضيح القفل)
  - أزرار: "اعتماد الخطة" / "اعتماد التعديلات الجديدة" / "إلغاء الاعتماد" (للأدمن)
  - Modal مراجعة الـ pending (عرض الأسابيع/المواضيع المقترحة + اعتماد/رفض)
  - **قفل تلقائي للمواضيع الموجودة** للمعلم بعد الاعتماد (read-only + lock icon بدل trash)
- [x] اختبار E2E عبر curl لـ7 سيناريوهات:
  ✓ approve مباشر | ✓ teacher PUT بعد الاعتماد → pending | ✓ approve مع pending → استبدال
  ✓ teacher upload Excel بعد الاعتماد → pending | ✓ reject-pending | ✓ unapprove | ✓ confirm-topics
- [x] TypeScript: 0 أخطاء

### Phase 1 - استيراد ونسخ الخطة الدراسية (مكتمل Backend + Frontend)
- [x] Backend (موجود مسبقاً من جلسة سابقة):
  - `GET /api/template/study-plan` — تحميل قالب Excel (متاح للأدمن والمعلم)
  - `POST /api/courses/{course_id}/study-plan/upload?replace=bool` — رفع/استيراد Excel (متاح للمعلم على مقرراته فقط)
  - `POST /api/courses/{course_id}/study-plan/clone-from` — نسخ من مقرر مصدر (أدمن فقط)
- [x] Frontend جديد: `/app/frontend/app/manage-study-plan.tsx`
  - Header مع اسم المقرر + إحصائيات (أسابيع/مواضيع/% الإنجاز)
  - شريط أدوات: تحميل القالب + استيراد Excel + نسخ من مقرر (مخفي للمعلم) + إضافة أسبوع
  - محرر يدوي للأسابيع والمواضيع (إضافة/تعديل/حذف) + زر "حفظ الخطة"
  - Modal الاستيراد: toggle استبدال/دمج + رفع ملف
  - Modal النسخ: قائمة مقررات قابلة للبحث + radio + toggle استبدال/دمج + تأكيد
- [x] زر أخضر بأيقونة كتاب في بطاقة المقرر بـ `/(tabs)/courses.tsx` (للأدمن) ينقل لشاشة الإدارة
- [x] زر "الخطة الدراسية" (أخضر) في بطاقة المعلم بـ `my-courses-teacher.tsx` ينقل لنفس الشاشة
- [x] صلاحيات Backend للمعلم: تحرير + رفع Excel على مقرراته فقط (الإمكانيات تُتحقق على مستوى الـ API)
- [x] إخفاء زر "نسخ من مقرر" تلقائياً عند تسجيل دخول المعلم
- [x] اختبار E2E بواسطة testing agent v3 (success_rate frontend: 100% functional)
- [x] اختبار Backend بـ curl: المعلم يرفع على مقرراته (200) ويُرفض على مقرر آخر (403)
- [x] إصلاح: استبدال `data-testid` بـ `testID` لتوافق React Native Web

## ما تم إنجازه - جلسة 26 فبراير 2026

### إصلاح bug سجلات الحضور للمحاضرات المحذوفة (مكتمل)
- [x] تحديث `delete_lecture` في `server.py` (سطر 5371) لحذف سجلات الحضور المرتبطة بالـ lecture_id
- [x] تحديث `get_course_attendance` (سطر 6211) لتجاهل سجلات الحضور للمحاضرات الملغاة/المحذوفة
- [x] اختبار آلي: `/app/backend/tests/test_lecture_deletion.py` (PASS)

### ميزة إرسال النتائج النهائية للطلاب عبر الإشعارات (مكتمل Backend + Frontend)
- [x] `POST /api/courses/{course_id}/send-final-results` — إرسال نتائج JSON
- [x] `POST /api/courses/{course_id}/send-final-results/upload` — رفع Excel/CSV
- [x] `GET /api/template/final-results` — تحميل نموذج Excel
- [x] دعم النتائج بالعربية (ناجح/راسب) وبالإنجليزية (pass/fail)
- [x] أعمدة Excel بالعربية: رقم القيد، النتيجة، الدرجة (اختيارية)، ملاحظات (اختيارية)
- [x] إنشاء إشعار in-app + إرسال Firebase Push للطالب
- [x] التحقق من الصلاحيات: admin / send_notifications / manage_courses / manage_grades
- [x] التحقق من صحة ObjectId — يُرجع 404 للمعرفات غير الصالحة
- [x] واجهة جديدة `/send-final-results?courseId=X` مع:
  - قائمة طلاب المقرر مع pills "ناجح/راسب" + حقل درجة لكل طالب
  - أزرار "تحديد الكل ناجح/راسب/مسح"
  - تحميل نموذج Excel + رفع نتائج من Excel
  - بحث + عدادات + زر إرسال سفلي
- [x] زر تنقل بنفسجي "إرسال النتائج النهائية" في صفحة `course-students.tsx`
- [x] اختبارات آلية: `/app/backend/tests/test_final_results.py` (PASS)
- [x] اختبارات pytest الشاملة: `/app/backend/tests/test_lecture_and_final_results_pytest.py` (12/12 PASS)
- [x] التحقق E2E بواسطة testing agent v3 (success_rate: backend 100%, frontend 95%)

## ما تم إنجازه - الجلسات السابقة

### الجدول الأسبوعي (مكتمل)
- إدارة القاعات + الفترات + تفضيلات المعلمين + توليد تلقائي + كشف تعارضات

### العبء التدريسي (مكتمل)
- جدول + بحث + RTL + مزامنة ثنائية + تقارير + Excel/PDF

### PWA + الوصول للويب
- manifest.json + service worker + PWA icons + Vercel student app whitelist

### تحسينات عامة
- صلاحيات المدير الكاملة | التسجيل التلقائي | Excel imports (xlsx/xls/csv)

## المهام المعلقة

### P1
- [ ] **Phase 2-4 من تكامل الخطة الدراسية**: مطالبة المعلم بتحديد الموضوع بعد المحاضرة، تقارير أسبوعية للمواضيع غير المغطاة، توصيات ذكية
- [ ] **توليد الرقم المرجعي للطالب تلقائياً** — بانتظار قواعد العمل من المستخدم (مثلاً FAC-DEPT-XXXX)
- [ ] تقسيم `server.py` (>12.8k سطر) إلى `/app/backend/backend/routes/`
- [ ] إصلاح خطأ `lecturesList is not iterable` في `course-students.tsx > calculateStudentStats`

### P2/P3
- [ ] تحسين واجهة التقارير بصرياً
- [ ] تحسينات واجهة سجلات النشاط

## API Endpoints المضافة في هذه الجلسة
- `POST /api/courses/{course_id}/send-final-results`
- `POST /api/courses/{course_id}/send-final-results/upload`
- `GET /api/template/final-results`
- `POST /api/departments/{department_id}/send-final-results/upload` (نتائج على مستوى القسم)
- `GET /api/template/department-final-results` (نموذج عمودين فقط: رقم القيد + النتيجة)

### القيم المسموحة في عمود "النتيجة" لنتائج القسم
- `ناجح`
- `دور ثان` (أو `دور ثاني`)
- `راجع التسجيل`

## بيانات الاختبار
- مدير: admin / admin123
- عميد: Salim / 123456
- معلم: teacher180156 / teacher123

## ملفات مرجعية
- Backend: `/app/backend/backend/server.py` (Lines: delete_lecture 5371, get_course_attendance 6211, final-results 2133-2350)
- Frontend: `/app/frontend/app/send-final-results.tsx`, `/app/frontend/app/course-students.tsx`
- Tests: `/app/backend/tests/test_lecture_deletion.py`, `/app/backend/tests/test_final_results.py`, `/app/backend/tests/test_lecture_and_final_results_pytest.py`
- Test report: `/app/test_reports/iteration_19.json`
