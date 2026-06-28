# Ahgaff University Management System – PRD

## Original Problem Statement
Comprehensive student/teacher management system for Ahgaff University with:
- Shared FastAPI backend (MongoDB Atlas)
- Admin web/Expo app
- Standalone mobile apps
- Granular RBAC, schedule management, attendance tracking
- Modern, professional Arabic UI
- Advanced academic hierarchy (Curriculum → Teaching Assignments → Semester Offerings)
- Student status management (Active, Repeat, Graduated, Expelled, Frozen)
- Verifiable digital reporting (PDF + QR)
- Parallel deployments: Railway + Google Cloud Run


## Implemented (selected, recent)
- 2026-06-26 **🛠️ صفحة "الإعدادات الأساسية" (إعادة بناء `(tabs)/admin.tsx`)**:
  - **السبب**: توحيد رابط البار السفلي مع الصفحة الرئيسية كان غير منطقي وفقد المستخدمون الوصول لكثير من الأدوات
  - أُعيد بناء `(tabs)/admin.tsx` كصفحة أدوات إدارية موحّدة باسم "الإعدادات الأساسية"
  - 7 أقسام منظّمة: الإدارة الأكاديمية / التقويم والجداول / التقارير المتقدّمة / النتائج والإشعارات / الحضور وبطاقات الطلاب / إعدادات النظام / أدوات الصيانة
  - ضمّت كل الأدوات المفقودة من القائمة الجانبية والرئيسية: `manage-study-plan`, `teacher-courses`, `student-references`, `university-calendar`, `calendar`, `availability-report`, `report-course`, `report-absent-students`, `report-teacher-summary`, `report-lesson-completion`, `report-daily`, `verify-report`, `send-final-results`, `send-department-results`, `send-notification`, `take-attendance`, `qr-scanner`, `offline-sync`, `permissions`, `student-autofill`, `backfill-*`, `cleanup-*` (≈24 أداة)
  - كل عنصر مفلتر فردياً عبر `hasAnyPermission`/`adminOnly`/`teacherOnly`/`forAll` (RBAC ثابت)
  - تم تحديث `(tabs)/_layout.tsx` (عنوان التبويب والـ header) وعنصر القائمة الجانبية في `SideMenu.tsx` بالاسم الجديد
  - أُضيفت ثوابت `MANAGE_NOTIFICATIONS` و `REPORT_LESSON_COMPLETION` في `PERMISSIONS` بـ `AuthContext.tsx`
  - **2026-06-26 تحسين تصميم**: تحويل التخطيط من قائمة عمودية (rows مع وصف) إلى **شبكة أيقونات مدمجة** (3 أعمدة على الجوال، 5+ على الديسكتوب) — أيقونة + اسم فقط لكل أداة، تمرير سلس مع `showsVerticalScrollIndicator={true}`

- 2026-06-26 **📤 إصلاح صفحة `/send-final-results` بدون courseId**:
  - **المشكلة**: الصفحة كانت تتطلب `?courseId=...` (تُفتح أصلاً من `course-students.tsx`). عند فتحها من "الإعدادات الأساسية" بدون معرف، كانت تجمد في "جارٍ التحميل" للأبد.
  - **الإصلاح**: عند غياب `courseId`، تعرض الآن **شاشة اختيار المقرر** مع بحث وقائمة مقررات (محدودة بنطاق صلاحيات المستخدم). النقر يُحدّث الـ URL ويُحمّل قائمة الطلاب.

- 2026-06-28 **🔄 ميزة نقل الطالب (Student Transfer)**:
  - **Backend** (`routes/student_transfer.py` جديد، مُسجّل في `server.py`):
    - `POST /api/students/{id}/transfer` — نقل فردي
    - `POST /api/students/bulk-transfer` — نقل دفعة
    - `GET /api/students/{id}/transfer-history` — سجل النقل
    - Collection جديد `student_transfer_history` يحفظ snapshot كامل (from/to، السبب، المنفّذ، التاريخ)
    - يحترم `manage_students` + النطاق (department_head ضمن قسمه، dean ضمن كليته)
    - يُلغي enrollments الفصل النشط تلقائياً (لأن الخطة تتغير)
    - يُرسل إشعار للطالب + يُسجّل في `activity_logs`
  - **Frontend** (`student-details.tsx`):
    - زر "نقل الطالب" برتقالي في الإجراءات السريعة (يظهر فقط لغير الخريجين)
    - مودال متكامل: Picker للكلية → Picker للقسم (مفلتر) → المستوى → الشعبة → سبب اختياري
    - عرض الوضع الحالي في الأعلى + عرض سجل النقل السابق (آخر 5)
    - معاينة تلقائية + تحقق من البيانات
  - **التحقق**: backend اختُبر بـcurl (3 سيناريوهات: نفس البيانات يرفض، نقل ناجح، عرض سجل) ✓ — مودال الفرونت يظهر صحيحاً ✓


  - **Excel** (`_export_xlsx` in `routes/curriculum.py`):
    - شريط معلومات في الترويسة (Row 3) يعرض إجمالي الساعات المعتمدة والأسبوعية
    - صف إجمالي بلون أزرق فاتح بعد كل (مستوى, فصل) مع مجموع ساعاته
    - صف إجمالي كلي بلون أخضر في نهاية الجدول
  - **PDF** (`_export_pdf`):
    - شريط totals_style أخضر قرب القمة يعرض الإجمالي الكلي
    - صف "إجمالي ..." في نهاية كل جدول فصل بخلفية زرقاء فاتحة
  - **التحقق**: تصدير Excel و PDF عبر admin token → كلاهما يحتوي الإجماليات بشكل صحيح (17 ساعة معتمدة، التحقق الحسابي 6+5+3+3=17 ✓)


  - **المشكلة**: المستخدم بصلاحية `view_curriculum` كان يرى نفس واجهة `manage_curriculum` مع كل أزرار التعديل/الحذف/الإضافة.
  - **الإصلاح في `app/curriculum.tsx`**:
    - استيراد `useAuth` و `PERMISSIONS` وحساب `canManage = isAdmin || hasPermission(MANAGE_CURRICULUM)`
    - إخفاء شرطي عبر `canManage` لـ: "إضافة مقرر"، "إضافة أول مقرر"، "تحميل نموذج Excel"، "رفع من Excel"، "استيراد من أرشيف"، "توليد للفصل النشط"، "مسح خطة القسم"، شريط الحذف المتعدد، أزرار الحذف الفردية، وخانات إدخال عدد الشُعب (تصبح للقراءة فقط)
    - إضافة شارة **"وضع العرض فقط"** (خضراء، أيقونة عين) في رأس الصفحة
    - **يبقى متاحاً**: "تصدير / طباعة الخطة"، اختيار القسم، التحديث، الإحصائيات، عرض الشبكة
  - **التحقق**: `view_curr_user` يرى 0 أزرار حذف، 0 checkboxes، زر تصدير فقط ✓

- 2026-06-23 **🏷️ إصلاح عرض القسم/الكلية لكل المقررات في صفحة العبء التدريسي**:
  - السبب الجذري: `GET /api/teaching-load/search-courses` كان يُرجع فقط `department_id`، والواجهة تبحث عن الاسم في قائمة `departments` المحلية (المقصورة على نطاق المستخدم). أي مقرر بقسم خارج النطاق أو بـ `department_id` فارغ → لا يظهر اسم القسم/الكلية
  - أُثري الـ Backend بجلب `department_name`/`faculty_id`/`faculty_name` لكل مقرر مباشرة
  - حُدِّثت الواجهة لاستخدام الأسماء من الـ API كأولوية مع fallback للقائمة المحلية
  - الآن كل المقررات تعرض القسم والكلية بشكل صحيح

- 2026-06-23 **🏷️ توحيد أسماء الأدوار العربية في الواجهة**:
  - أنشئ `/app/frontend/src/utils/roleLabels.ts` كمصدر حقيقة وحيد لـ `ROLE_LABELS`/`ROLE_COLORS`/`getRoleLabel()`
  - يدعم: admin, university_president, dean, department_head, registration_manager, registrar, teacher, employee, student, custom
  - حدِّثت الملفات: `(tabs)/profile.tsx`، `src/components/SideMenu.tsx`، `manage-users.tsx`، `verify-report.tsx`
  - الآن `registrar` يظهر "مسجِّل" بدلاً من "مستخدم"، و `employee` يظهر "موظف"، إلخ.
  - الأسماء العربية المخصَّصة من Backend (`role` كاسم بالعربية) تُعرض كما هي

- 2026-06-23 **🔍 إصلاح البحث الشامل للأدوار غير الإدارية**:
  - السبب الجذري: `routes/global_search.py` كان مقيَّداً بـ `is_admin or is_teacher` فقط → يمنع كل المسجلين/العمداء/رؤساء الأقسام/الموظفين من رؤية أي نتيجة
  - استُبدلت الفحوص الصلبة بفحوص صلاحيات دقيقة (`view_students`, `view_teachers`, `manage_enrollments`, إلخ.)
  - أُضيف نطاق الكلية/القسم لكل أنواع البحث (طلاب، معلمين، مقررات، أقسام، كليات، محاضرات)
  - أُضيفت آلية تسجيل `set_scope_filter` في `routes/deps.py` لاستيراد `get_user_scope_filter` من `server.py` بشكل آمن (الخادم يُحمَّل عبر `importlib` كـ `_actual_server`)
  - استنتاج `faculty_id` من `department_id` لرؤساء الأقسام بدون كلية مباشرة
  - مسجِّل التسجيل مع `manage_enrollments`/`view_enrollments` يحصل تلقائياً على البحث في معلمي كليته (لازم لإدارة التسجيل)

- 2026-06-21 **🏗️ توحيد المعمار (الخيار ب) + فحص شامل للصلاحيات**:
  - **صفحة الإدارة `(tabs)/admin.tsx`** أُعيد كتابتها كاملاً → Dashboard إحصائيات فقط (بدلاً من قائمة 20+ رابط مكرر)
  - **الصفحة الرئيسية** كانت تشترط دور معين (`['dean', 'department_head', ...].includes(user.role)`) لإظهار البطاقات → استُبدِل بشرط الصلاحيات: أي مستخدم لديه صلاحية إدارية يرى البطاقات
  - **السايدبار** أُصلحت أخطاء ربط:
    - "إدارة الإشعارات" مرتبطة بـ `MANAGE_USERS/MANAGE_DEPARTMENTS` ❌ → أصبحت `SEND_NOTIFICATIONS/manage_notifications` ✅
    - "الإعدادات العامة" كانت `adminOnly` فقط ❌ → أصبحت `MANAGE_SETTINGS` ✅
    - "محاضراتي" كانت `teacherOnly` ❌ → أصبحت تقبل أي مستخدم لديه `record_attendance` ✅
    - "سجلات النشاط" حذف `VIEW_REPORTS` الخادع (كان adminOnly فعلياً)
  - **`(tabs)/admin.tsx` السابقة:** زر "جدول المحاضرات" أُعيد ربطه بـ `view_schedule` بدلاً من `manage_lectures` (المحاضرات الآن فرعية)
  - **تقرير شامل** للصلاحيات الـ72 في `/app/memory/PERMISSIONS_AUDIT_REPORT.md` يوثق: المشاكل المكتشفة، الإصلاحات التي تمت، والمسائل التي تحتاج قراراً من المستخدم

- 2026-06-21 **🎯 دمج صلاحيات المحاضرات تحت `manage_courses` (الخيار ب)**:
  - 8 صلاحيات للمحاضرات (manage_lectures, view_lectures, add/edit/delete_lecture, override_lecture_status, reschedule_lecture, generate_lectures) أصبحت **مخفية** من واجهة منح الصلاحيات
  - تُمنح تلقائياً مع `manage_courses` (مدرجة في `FULL_PERMISSION_MAPPING`)
  - Backend `/permissions/available` يفلتر الصلاحيات المخفية (`hidden: True`)
  - **Migration v1 تلقائي لمرة واحدة** استعاد صلاحيات المحاضرات لـ 5 أدوار افتراضية (TEACHER, DEAN, DEPARTMENT_HEAD, ADMIN, EMPLOYEE) التي كانت قد فقدتها

- 2026-06-21 **🔑 إصلاح Backend `/roles` + صفحة إدارة المستخدمين**:
  - GET `/roles` كان يفحص `admin` فقط ❌ → أصبح يقبل `manage_users` أو `manage_roles` ✅
  - POST/PUT/DELETE `/roles` تقبل `manage_roles` للمنح المرن
  - صفحة `manage-users.tsx` استبدلت `Promise.all` بـ `Promise.allSettled` (لو فشل API واحد، البقية تكمل عملها)
  - السايدبار: "الأدوار" أُعيد ربطها بـ `manage_roles` بدلاً من `manage_users`
  - إصلاح خطأ سابق في server.py سطر 15337 (`fo(...)` بدلاً من `logging.info`)

- 2026-06-21 **🆕 صلاحيتين جديدتين للجداول الدراسية**:
  - `VIEW_SCHEDULE` و `MANAGE_SCHEDULE` كصلاحيات منفصلة عن المقررات
  - فُصِل ربط الجدول اليومي والأسبوعي عن `manage_courses` (كان خلط)

- 2026-06-21 **🔒 إصلاح RBAC شامل لصلاحيات إدارة الأقسام (Sub-Permission Awareness)**:
  - **المشكلة:** المستخدم منح صلاحيات `add_department/edit_department/delete_department` (فرعية) لكن backend/frontend كانا يتحققان فقط من `manage_departments` (الأم) → لم يستطع تحرير/إضافة الأقسام رغم وجود الصلاحيات.
  - **مشكلة إضافية:** صفحة تفاصيل القسم كانت تعرض المعلمين والمقررات وتسمح بالنقر للوصول لإسناد المقررات لأي مستخدم بدون فحص أي صلاحية.
  - **الإصلاحات:**
    1. **Backend `server.py`:** POST/PUT/DELETE `/departments` تقبل الآن `manage_departments` OR الصلاحية الفرعية المناسبة (`add_department`/`edit_department`/`delete_department`)
    2. **Backend `routes/deps.py`:** `has_permission` يوسّع `FULL_PERMISSION_MAPPING` (manage_departments → view/add/edit/delete) — كان يفتقد التوسعة
    3. **Frontend `add-department.tsx`:** أزرار الإضافة/التعديل/الحذف تستخدم `canAddDept`/`canEditDept`/`canDeleteDept` بدلاً من check واحد
    4. **Frontend `SideMenu.tsx`:** عنصر "إدارة الأقسام" يقبل أي من 5 صلاحيات (الأم + الفرعية الأربع)
    5. **Frontend `department-details.tsx`:** تبويبات المعلمين/المقررات مفلترة بـ `view_teachers`/`view_courses` — رسالة قفل واضحة إذا لا توجد صلاحية
    6. **Frontend `teacher-courses.tsx`:** زر "إسناد مقرر" و"إلغاء الإسناد" مفلتران بـ `manage_teaching_load` — النقر على المعلم في تفاصيل القسم لا يفتح صفحة الإسناد بدون صلاحية


- 2026-06-20 **🌐 تحسين "الإسناد العابر" ليشمل كل الكليات (Cross-University)**:
  - **المشكلة:** في صفحة العبء التدريسي، عند تفعيل "عابر للأقسام":
    - كل معلم يُظهر قسم واحد فقط (`department_id`) رغم أن لديه عدة أقسام (`department_ids`)
    - الكلية غير ظاهرة → المستخدم لا يعرف هل عبر لكلية أخرى أم لا
    - قائمة الأقسام المنسدلة لم تُجمَّع حسب الكلية → خلط
  - **الإصلاح في `teaching-load.tsx`:**
    - تحميل الكليات (`/api/faculties`) عند فتح الصفحة
    - `TeacherSearch` يُظهر الآن: 🏛️ الكلية + 🏢 كل الأقسام (chips ملوّنة)
    - قائمة الأقسام مُجمَّعة بصيغة `[الكلية] القسم` لإيضاح الانتماء
    - نص الـtoggle محدَّث: "عرض كل أساتذة ومقررات الجامعة (لجميع الكليات والأقسام)"
    - نتائج بحث المقررات تُظهر: 🏛️ الكلية + 🏢 القسم + المستوى + الشعبة + الكود


  - **الثغرة:** في `get_user_scope_filter` (server.py:838-855)، إذا كان رئيس قسم/عميد/مسجل بلا قسم/كلية مسنَدة، الـ query يبقى فارغاً → يرى **كل البيانات في الجامعة** (fail-open). zain و zain22 في الإنتاج كانا بلا أقسام فرأيا مقررات/طلاب كل الكليات.
  - **الإصلاح:** أُضيف Fail-safe في نهاية الدالة — إذا كان الدور محدود النطاق ولم يُطبَّق أي فلتر، الـ query يُعيّن إلى `{"_id": ObjectId("000...")}` (مستحيل التحقق) فيُحجَب كل شيء. + WARNING في اللوج.
  - **الاختبار:** `/app/backend/tests/test_rbac_failsafe.py` يُغطي 4 أدوار × 4 scope types ✅

- 2026-06-20 **🎨 تحسين مودال إسناد المعلم — معلومات سياقية كاملة**:
  - **التغيير:** في `AssignTeacherModal.tsx` تم إضافة بطاقة معلومات للمقرر تُظهر: الكلية، القسم، المستوى، الشعبة، الكود (chips ملوّنة).
  - **بطاقة المعلم:** صف كل معلم يُظهر الآن: الاسم، رقمه، **الكلية**، القسم/الأقسام، التخصص.
  - **Props جديدة:** `faculties`, `courseCode`, `courseLevel`, `courseSection`.
  - **التطبيق:** `courses.tsx` تُحمّل الكليات وتُمرّرها للـ 3 مودالات (سريع، نموذج، جماعي).

 (السبب الحقيقي اكتُشف عبر فحص الإنتاج مباشرة)**:
  - **التشخيص الفعلي عبر `api.ahgaff.net`:** zain و zain22 كانا موجودَين بشكل صحيح في DB (`role=department_head`, role_id صحيح، active=True). لكن `/api/users` بدون فلتر كان يُرجع 1000 سجل فقط.
  - **السبب الجذري الفعلي:** السطر `users = await db.users.find(query).to_list(1000)` في `server.py:1049` و `routes/users.py:90`. مع ~893 طالب + 98 معلم + 9 إداريين = 1000+، الحسابات الإدارية تقع خارج الـ limit وتختفي.
  - **الإصلاح:**
    1. عند عدم وجود فلتر، استبعاد students/teachers على مستوى DB query: `{"role": {"$nin": ["student", "teacher"]}}`
    2. رفع الحد إلى 10000 (الإداريون قليلون عادةً)
  - **التحقق:** اختبار `/app/backend/tests/test_users_limit.py` — يدخل 1100 طالب وهمي ويتأكد أن الحسابات الإدارية مرئية ✅
  - **ملاحظة:** الإصلاحات السابقة (auto-migration للأدوار، cleanup للأدوار المكررة، diagnose endpoint) محتفظ بها للحماية الإضافية لكنها لم تكن السبب الحقيقي.

- 2026-06-20 **Auto-migration للأدوار وأدوات التشخيص (طبقة حماية إضافية)**:
  - **المشكلة المُبلَّغة:** "تمت ترقية الحساب إلى رئيس قسم، لكن صفحة المستخدمين تُظهر 0 حساب في فلتر رئيس قسم".
  - **السبب الجذري:** في `PUT /api/users/{id}` و `PUT /api/users/{id}/role`، إذا كان الدور المخصص يفتقر لـ `system_key` (مثل دور أُنشئ باسم عربي فقط)، كان يُحفظ `role="custom"` بينما `role_id` يشير لدور بصلاحيات department_head. الفلتر `?role=department_head` لا يجده.
  - **الإصلاح ثلاثي الطبقات:**
    1. **Auto-migration عند كل startup** (`server.py:14918 migrate_broken_user_roles`):
       - يفحص كل مستخدم له `role_id` صالح
       - يستنتج `system_key` من الدور (أو من اسمه العربي عبر `ROLE_NAME_MAP`)
       - يُزامِن حقل `role` ليطابق — Idempotent
       - يُسجّل في اللوج: `Migration: 'zain' role: 'custom' → 'department_head'`
    2. **إصلاح المصدر في `PUT /api/users/{id}` (server.py:1230)**: يستنتج `system_key` من الاسم العربي عند الإنشاء/التحديث (نفس `ROLE_NAME_MAP`).
    3. **إصلاح المصدر في `PUT /api/users/{id}/role` (server.py:1655)**: نفس المنطق.
  - **التحقق (3 اختبارات شاملة):**
    - `/app/backend/tests/test_role_migration.py` — unit test على الـ migration ✅
    - `/tmp/test_zain_e2e.py` — E2E: إدخال مستخدم معطوب → restart → /api/users?role=department_head يجده ✅
    - تأكيد عبر curl حقيقي على API الإنتاج ✅
  - **المستخدم لا يحتاج لأي إجراء يدوي** — عند نشر الإصلاح عبر "Save to Github"، يُصلَح zain تلقائياً عند أول startup للـ backend.

- 2026-06-20 **إصلاح ثغرة RBAC حرجة: تسريب بيانات بين الكليات**:
  - **المشكلة المُبلَّغة:** "أي مستخدم لكلية معينة تظهر عنده كل أقسام الكليات الأخرى في صفحات المقررات والطلاب والمعلمين".
  - **التشخيص (عبر اختبار حسابات حقيقية):**
    - `Saeed` (department_head, كلية البنات) كان يرى **كلتا** الكليتين في `/api/faculties` (تسريب)
    - `registrar` لم يكن لديه فرع `teachers` في `get_user_scope_filter` → يرى **كل** المعلمين من كل الكليات
    - لا توجد آلية لإظهار "المعلمين العابرين" الذين يدرّسون في كليتك لكن قسمهم الأصلي مختلف
  - **الإصلاحات في `/app/backend/backend/server.py`:**
    1. **`/api/faculties`** (line 14070): إعادة كتابة كاملة. الآن:
       - `admin`: كل الكليات
       - `dean` / `registrar` / `registration_manager`: كليته فقط (faculty_id)
       - `department_head`: كلية قسمه (يُشتقّ من `department.faculty_id`)
       - `custom`: كلياته (من faculty_id + departments)
       - دور مقيَّد بلا بيانات → قائمة فارغة (بدلاً من رؤية الكل)
    2. **`get_user_scope_filter`** (line 786): أضيف فرع `teachers` للـ `registrar`/`registration_manager` (كان مفقوداً تماماً).
    3. **`/api/teachers`** (line 3926): استثناء "المعلمون العابرون للأقسام":
       - يحسب أقسام المستخدم المسموح بها (من scope_filter)
       - يجلب `course_ids` في تلك الأقسام
       - يضيف معلميها (من `teaching_loads` + `courses.teacher_id`) عبر `$or` للنتائج
       - النتيجة: تشاهد معلميك + المعلمين الذين يدرّسون عبر كليتك حتى لو قسمهم الأصلي مختلف
  - **التحقق (curl حقيقي):**
    | المستخدم | /api/faculties | /api/departments | /api/teachers |
    |---|---|---|---|
    | Saeed (dept_head) | ✅ كلية البنات فقط | ✅ الدراسات الإسلامية فقط | ✅ Saeed فقط |
    | Salim (dean) | ✅ كلية الشريعة فقط | ✅ 3 أقسام كليته | ✅ حسن + زين فقط |
    | admin | ✅ كل الكليات | ✅ كل الأقسام | ✅ كل المعلمين |
  - **الاختبارات الجديدة:**
    - `/app/backend/tests/test_rbac_scoping.py` (3 اختبارات تحققية على البنية والبيانات)
  - **حسابات تجريبية موثَّقة في `test_credentials.md`:**
    - `Salim` / `test1234` (dean)
    - `Saeed` / `test1234` (department_head)

- 2026-06-19 **دليل المستخدم المصور داخل المنصة (`/help`)**:
  - **الطلب:** "نويت اعمل دليل مصور لاستخدام المنصة على شكل خطوات منطقية وكل خطوة مبنية على الأخرى... من بداية فتح الموقع إلى أسس بناء المعلومات والاستخدام".
  - **التنفيذ:**
    - صفحة كاملة `/app/frontend/app/help.tsx` بتصميم شريط جانبي (Sidebar) + محتوى مفصّل.
    - بحث مباشر في عناوين/خطوات الأقسام (`testID=help-search-input`).
    - تنقّل سابق/تالي بين الأقسام أسفل كل صفحة (`testID=help-prev-btn` / `help-next-btn`).
    - مكوّن `StepCard` يعرض: رقم الخطوة، عنوان، مسار في المنصة (path chip)، شرح، نقاط، نصائح (أصفر)، تحذيرات (أحمر).
    - صناديق Intro/Warning على مستوى القسم نفسه.
    - روابط سريعة (Quick Links) لصفحات المنصة الفعلية في نهاية كل قسم.
  - **المحتوى (`/app/frontend/src/data/helpContent.ts`):** منظَّم على 7 مراحل متسلسلة + 3 ملاحق:
    1. **البداية: التعريف والدخول** — تسجيل دخول، جولة، البحث، الأدوار والصلاحيات.
    2. **البنية الأكاديمية** — الفصل ← الكلية ← القسم ← المستوى ← المنهج ← المقرر (إلزامي).
    3. **الأشخاص** — معلمون، طلاب، حالات الطالب، استيراد Excel.
    4. **الربط والتشغيل** — إسناد فردي/جماعي/عابر للقسم، تسجيل طلاب، خطة دراسية، جدول أسبوعي.
    5. **التشغيل اليومي** — حضور، تعديل، تأخّر المعلم، تطبيق الجوال.
    6. **التقارير والإحصاءات** — العبء، حضور الطالب/المقرر، التحقق بـ QR.
    7. **الصيانة والإدارة** — ترحيل لفصل جديد، أرشفة، صلاحيات، سجل نشاط، نسخ احتياطي.
    + ملاحق: تطبيق المعلم، تطبيق الطالب، حل المشاكل الشائعة (FAQ).
  - **الوصول:** زر "دليل استخدام المنصة" في صفحة الحساب الشخصي (`(tabs)/profile.tsx`) — أيقونة كتاب خضراء بـ `testID=help-guide-btn`.
  - **التحقق:** Screenshots أكدّت ظهور الصفحة بـ 10 أقسام في الـ sidebar، تصفّح سلس بين الأقسام، تصميم RTL نظيف بدون عناصر مكسورة.

- 2026-06-18 **الإسناد الجماعي (Bulk Teacher Assignment) — P1 + P2**:
  - **المتطلب:** تسهيل إسناد معلم واحد لعدة مقررات دفعة واحدة في بداية الفصل، مع تحذيرات ذكية لتجنّب تجاوز عبء المعلم أو الإسناد العابر غير المقصود.
  - **آلية العمل:**
    - استخدام البنية الموجودة `selectionMode + selectedIds` في `/(tabs)/courses.tsx` (إعادة استخدام بدون تكرار).
    - زر جديد في شريط أدوات وضع التحديد: **"إسناد جماعي (N)"** (testID=`open-bulk-assign-btn`) بجانب زر "حذف".
    - يفتح نفس `<AssignTeacherModal>` لكن في **نمط `bulkCourses`**.
  - **مميزات النمط الجماعي:**
    - **حساب العبء التلقائي:** يجمع credit_hours من المقررات المعروضة لكل معلم → `teacherCurrentLoadMap` (useMemo) → يُمرَّر للمودال.
    - **بطاقة ملخّص مباشرة عند اختيار المعلم:**
      - "سيتم إسنادها: X" (بعد تطبيق فلتر التجاوز)
      - Badges: "X نفس القسم" (أخضر) / "X عابر للقسم" (برتقالي)
      - تحذير "⚠️ X مقرر مُسند سلفاً" + كم منها لنفس المعلم
      - "عبء المعلم بعد الإسناد: X / MAX ساعة" (مع تحذير أحمر عند التجاوز)
    - **خيار "تجاوز المُسندة سلفاً":** toggle (testID=`skip-assigned-toggle`) — يستثني المقررات المُسندة لمعلم آخر.
    - **حقل "ساعات أسبوعية مخصصة":** اختياري (testID=`custom-weekly-hours-input`) — يُمرَّر للخادم كـ `weekly_hours` بدلاً من `credit_hours` الافتراضية.
    - **وضع "إلغاء الإسناد الجماعي":** عند ترك "إزالة الإسناد" مختاراً، زر الحفظ يصبح "إلغاء إسناد N مقرر" → يرسل `{teacher_id: null}` للجميع.
  - **التنفيذ:**
    - `Promise.allSettled` للطلبات بالتوازي → كل طلب `PUT /api/courses/{id}` → الخادم يقوم تلقائياً بمزامنة `teaching_loads`.
    - **عرض النتائج:** بعد الحفظ، المودال يتحول لعرض ملخّص "نجح: N/N" مع قائمة لكل مقرر (✓ أو ✗ مع رسالة الخطأ).
    - تحديث محلي فوري للجدول للمقررات التي نجحت.
    - عند ضغط "إغلاق": يخرج المستخدم من وضع التحديد ويُمسح selectedIds.
  - **التكامل مع جدول العبء التدريسي:** لا تعارض — الخادم يحدّث `teaching_loads` تلقائياً عبر `PUT /api/courses/{id}` (نفس المسار المختبر). تقرير `/teaching-load/report/advanced` يعكس النتائج فوراً.
  - **الاختبار:** 10/10 تدفقات نجحت (testing agent iteration_35):
    - زر `إسناد جماعي` يظهر/يُعطّل حسب `selectedIds.size`
    - حساب العبء (6/12 ساعة) صحيح للحالة المختبرة
    - حقل الساعات المخصصة يعيد الحساب فوراً (10/12 بـ 5 ساعات)
    - PUT متوازي بقيم teacher_id صحيحة (200 OK في backend logs)
    - تنظيف وضع التحديد بعد الإغلاق
  - **الملفات:**
    - `/app/frontend/src/components/AssignTeacherModal.tsx` (موسّع: bulkCourses, onBulkSaved, teacherCurrentLoadMap, handleBulkSave, bulk results view)
    - `/app/frontend/app/(tabs)/courses.tsx` (useMemo import, teacherLoadMap، زر `open-bulk-assign-btn`، مودال bulk)

- 2026-06-18 **إسناد معلم سريع من صف المقرر + بحث متقدم في التعديل**: 
  - **المشكلة المُبلَّغة:** "في تعديل المقرر يتم تحديد الاستاذ لكن لا يوجد بحث، اعمل لنا امكانية بحث، واعمللنا تسهيل ربط المقرر لمعلم في الصفحة مباشر ظاهرة".
  - **الحل:** إنشاء مكوّن قابل لإعادة الاستخدام `<AssignTeacherModal>` في `/app/frontend/src/components/AssignTeacherModal.tsx` يدعم نمطين:
    - **نمط الإسناد المباشر (افتراضي):** يحفظ على الخادم عبر `PUT /api/courses/{id}` ثم يستدعي `onSaved`.
    - **نمط النموذج (formMode):** لا يستدعي الخادم — يُرجع الاختيار فقط للنموذج (مستخدم في مودال تعديل المقرر).
  - **مميزات المودال:**
    - بحث فوري بالاسم/رقم المعلم (`testID=teacher-search-input`).
    - Badge أخضر "نفس القسم" / برتقالي "عابر للقسم" بناءً على `course.department_id` مقابل `teacher.department_ids`.
    - فلتر toggle "إظهار معلمي القسم فقط" (`testID=same-dept-toggle`).
    - خيار "إزالة الإسناد (بدون معلم)" أحمر بارز.
    - تأكيد الإسناد عند العبور لقسم آخر (`window.confirm` على الويب).
    - فرز ذكي: معلمو نفس القسم أولاً ثم بقية المعلمين.
  - **التطبيق في `/(tabs)/courses.tsx`:**
    - خلية المعلم في كل صف أصبحت تفاعلية: زر "إسناد معلم" أزرق (`testID=assign-teacher-{id}`) عندما لا يوجد معلم، أو chip بأيقونة قلم (`testID=change-teacher-{id}`) للتغيير.
    - استبدال `<TeacherSearchPicker>` القديم في مودال إضافة/تعديل المقرر بزر يفتح نفس `<AssignTeacherModal>` في `formMode` — يوفّر البحث على الويب وتطبيق الجوال معاً.
    - تحديث محلي فوري للجدول بعد الحفظ (`setCourses(prev => prev.map(...))`).
  - **تكامل مع الخادم:** `PUT /api/courses/{id}` يقوم تلقائياً بـ:
    - مزامنة `teaching_loads`: حذف عبء المعلم القديم وإنشاء عبء جديد بساعات `credit_hours`.
    - إصدار تنبيه عند الإسناد العابر للقسم.
  - **الاختبار:** 9/9 تدفقات فرونت إند نجحت (testing agent iteration_34) — الإسناد المباشر، البحث، الفلتر، الـ badges، الحفظ نفس القسم/عابر، الإزالة، وضع النموذج.

- 2026-06-18 **إصلاح جذري لتضارب بيانات الفصل النشط عبر كل النظام (Active Semester Consistency)**: المشكلة المُبلَّغة: "مقررات المعلم تعرض 0، بينما صفحة المقررات تعرضه مسؤولاً عن مقررات أخرى وبعدد محاضرات مختلف عن صفحة تفاصيل المقرر — نظام ملخبط".
  - **التشخيص:** 5 endpoints كانت تطبّق فلتر الفصل النشط بطرق مختلفة:
    - `/api/courses` lecture_count: بلا فلتر → كل المحاضرات تاريخياً
    - `/api/lectures/{course_id}`: فلتر الفصل النشط
    - `/api/courses/{id}/full-details`: فلتر الفصل النشط
    - `/api/courses/{id}/lecture-stats`: لا فلتر افتراضي
    - `/api/teachers/{id}/courses`: يعتمد على `teaching_loads` فقط (يخفي مقرراً مرتبطاً بـ `courses.teacher_id` بلا teaching_load)
    - `/api/teachers/{id}/full-profile`: يستخدم `courses.teacher_id` فقط (بلا فلتر فصل) → يختلف عن أخوه `/courses`
  - **الإصلاح:** إنشاء `/app/backend/backend/routes/_active_semester.py` كمصدر وحيد للحقيقة:
    - `get_active_semester(db)` → جلب الفصل النشط مع التواريخ
    - `lecture_active_semester_clauses(sem)` → بناء $or clauses (matches `semester_id` OR fallback date-range for legacy lectures with no semester_id)
    - `apply_lecture_active_sem(match, sem)` → دمج آمن مع `$or` موجود (يحوّل إلى `$and` تلقائياً)
    - `get_teacher_active_course_ids(db, teacher_id, sem)` → UNION (`courses.teacher_id` ∪ `teaching_loads.course_id`) في الفصل المستهدف
    - `get_courses_lecture_counts(db, course_ids, sem)` → عدّ المحاضرات لجميع المقررات بنفس الفلتر
  - **تغيير الـ Endpoints:**
    - `/api/courses` (server.py:4852): lecture_count يستخدم نفس نطاق المقررات (لو فلتر فصل → نفس الفصل، لو all_semesters → بلا فلتر)
    - `/api/lectures/{course_id}` (server.py:6813): يفلتر بـ **فصل المقرر نفسه** (وليس الفصل النشط العام) — UX أفضل: فتح مقرر مؤرشف يعرض محاضراته
    - `/api/courses/{id}/lecture-stats` (server.py:5054): نفس منطق "فصل المقرر"
    - `/api/courses/{id}/full-details` (entity_details.py): نفس منطق "فصل المقرر"
    - `/api/teachers/{id}/courses` (server.py:4143): يستخدم UNION + lecture_count موحّد
    - `/api/teachers/{id}/full-profile` (entity_details.py): UNION + lectures_total/completed موحّد + يدعم `?all_semesters=true`
  - **الفرونت إند:**
    - `/app/frontend/app/teacher-courses.tsx`: زر تبديل جديد (testID=toggle-all-semesters-btn) لعرض "الفصل النشط فقط" ↔ "كل الفصول (أرشيف)".
    - `/app/frontend/src/services/api.ts`: `teachersAPI.getCourses(teacherId, params?)` يدعم `include_all` و `semester_id`.
  - **التحقق:** Course `698f0000d803b27aab0120af` (دراسات حضرموت، 9 محاضرات في الفصل المغلق):
    - `/api/courses?semester_id=ClosedSem` → 9 ✓
    - `/api/courses/{id}/full-details` → 9 ✓
    - `/api/courses/{id}/lecture-stats` → 9 ✓
    - `/api/lectures/{id}` → 9 ✓
    - **كل الأرقام متطابقة الآن!**
    - Teacher `698e533beb4c6eb021c50302` (حسن صالح): default = 0 / include_all = 3 (`/courses` و `/full-profile` يتفقان).
  - **الاختبارات:**
    - `/app/backend/tests/test_active_semester_consistency.py` (8 اختبارات helper) — جميعها ✓
    - `/app/backend/tests/test_active_sem_endpoint_consistency.py` (15 HTTP tests كتبها testing agent) — جميعها ✓
    - Regression: `test_teaching_load_cross_dept.py`, `test_teaching_load_auto_sync.py` — جميعها ✓
    - **25/25 backend tests pass.**

- 2026-06-18 **مزامنة تلقائية لـ teaching_loads مع المقررات (إصلاح أرقام العبء غير المتطابقة)**: لكل مقرر له `teacher_id` وليس له entry في `teaching_loads` يُنشَأ entry تلقائياً بساعات = `credit_hours` (أو 3 افتراضياً). المزامنة تُنفّذ داخل `/api/teaching-load/report/advanced` قبل الحساب (تخطّى الفصول المؤرشفة لحماية الأرشيف). تمت إضافة endpoint يدوي: `POST /api/teaching-load/sync` يدعم فلاتر `teacher_id` و `department_id` و `semester_id`. النتيجة المُختبرة: `حسن صالح` كان يعرض 3 مقررات بـ 3 ساعات → الآن 9 ساعات (3 × credit_hours). idempotent: استدعاء ثانٍ ينشئ 0 سجل. اختبار: `/app/backend/tests/test_teaching_load_auto_sync.py`.
- 2026-06-18 **إصلاح باغ تقرير العبء التدريسي (مقررات المعلم في أقسام أخرى لا تظهر)**: في `/api/teaching-load/report/advanced`، عند فلترة التقرير بقسم، كانت مقررات المعلم في أقسام أخرى تُحذف من القائمة لأن `course_query["department_id"] = department_id` كان يقصر المقررات على القسم المختار، ثم `assigned_courses = [c for c in all_courses if c.get("teacher_id") == tid]` يستخدم نفس القائمة. الإصلاح: تم فصل قائمتين — `dept_courses` (لإحصائيات القسم) و `teacher_courses_list` (لعرض مقررات كل معلم من جميع الأقسام). الآن إذا كان "زين سالم" له 6 مقررات في 3 أقسام، التقرير يعرضها كلها بـ `department_id` للمقرر مع كل courses entry. تم تعزيز ذلك باختبار regression: `/app/backend/tests/test_teaching_load_cross_dept.py`.
- 2026-06-17 **توحيد صفحات المقرر في 4 تبويبات + تعديل/حذف**: إنشاء `<CourseTabBar>` كمكوّن مشترك (/src/components/CourseTabBar.tsx) يعرض في رأس course-details, course-lectures, course-students, manage-study-plan. يحوي: Breadcrumb + بطاقة معلومات المقرر + شريط تبويبات (نظرة عامة/المحاضرات/الطلاب/الخطة) + زرّا تعديل/حذف مع modals. النقر على تبويب يستدعي router.replace للمسار المقابل. النتيجة المختبرة: التبويبات الأربعة تعمل بسلاسة مع الحفاظ على كامل وظائف كل صفحة.
- 2026-06-17 **إعادة تصميم `/schedule` و `/take-attendance` بالنمط الحديث**:
  - **`/schedule.tsx` (380 سطر):** Header + Breadcrumb + 4 stat cards (إجمالي/منعقدة/مجدولة/ملغاة) + Date picker card (مع semester chip + native date overlay) + active semester badge + List card مع timeline cards محسّنة (بطاقات محاضرات بألوان مميزة + status badge + meta chips + action buttons).
  - **`/take-attendance.tsx`:** أُجريت جراحة دقيقة: تم استبدال JSX الرندر والـ styles فقط مع الحفاظ على 100% من المنطق (offline cache, network monitoring, error handling, attendance status, lesson modal, PDF export, study plan integration, تبديل الحالة بنقرة، حفظ أوفلاين/أونلاين). التصميم الجديد: Header + Breadcrumb (الرئيسية ← الجدول ← اسم المقرر) + Course info card مع meta chips (تاريخ ميلادي/هجري/وقت/قاعة) + status bar ديناميكي + 4 stat cards + Action toolbar (QR + PDF) + List card للطلاب + Bottom action bar للحفظ + Error card حديث.
  - **التحقق:** schedule يعرض stat cards وdate picker بشكل صحيح؛ take-attendance error state يظهر بتصميم حديث (المحاضرة غير موجودة → بطاقة بيضاء مع أيقونة حمراء + زرّان).
- 2026-06-17 **إعادة تصميم `/curriculum` بالنمط الحديث - حفظ كامل للوظائف**:
  - **الهدف:** تطبيق النمط الحديث الموحد على صفحة الخطة الدراسية مع الحفاظ على جميع الوظائف.
  - **التحسينات البصرية:**
    - Header حديث + Breadcrumb ديناميكي (الرئيسية ← الخطة الدراسية ← اسم القسم).
    - 4 بطاقات إحصائية: إجمالي مقررات الخطة، المستويات، الأقسام المتاحة، الفصل النشط.
    - بطاقة اختيار القسم مع شريط بحث وchips حديثة.
    - شريط أدوات منظم في بطاقة منفصلة بـ 5 إجراءات ملونة: تحميل نموذج / رفع من Excel / استيراد من أرشيف / توليد للفصل النشط / مسح خطة القسم.
    - بطاقة الشبكة بترويسة المستوى مع badge + chip لعدد المقررات.
    - أعمدة الفصول بألوان مميزة (أزرق/بنفسجي/برتقالي) ودوائر مؤشر + عداد.
    - بطاقات المقررات محسّنة: code chip + credit hours + teacher row + sections input + delete button.
  - **الوظائف المحفوظة بالكامل:**
    - اختيار القسم (chips قابلة للبحث).
    - إضافة مقرر (Modal).
    - تحميل نموذج Excel (تم إصلاح a.click بإضافة DOM attach).
    - رفع من Excel (Modal معاينة مع stats + sample + mode merge/replace).
    - استيراد من فصل مؤرشف (Modal).
    - توليد جلسات للفصل النشط مع sections_map.
    - مسح خطة القسم (Double confirm).
    - حذف مقرر فردي مع تأكيد.
    - مدخلات `sectionsMap` لكل مقرر.
  - **اختبار:** الصفحة تعرض 6 مقررات في 5 مستويات للقسم النشط؛ جميع البطاقات والأزرار تظهر بشكل صحيح؛ التمرير الداخلي يعمل (clientH<scrollH).
- 2026-06-17 **إعادة تصميم `/add-department` بالنمط الحديث + توحيد روابط الأقسام**:
  - **المشكلة:** صفحة إدارة الأقسام (`/add-department`) كانت تستخدم النمط القديم (تبويبات modal للتفاصيل + قائمة بسيطة)، بينما البحث السريع يربط إلى النمط الجديد (`/department-details`). كان هناك تناقض في تجربة المستخدم.
  - **الإصلاح:**
    - إعادة كتابة `/app/frontend/app/add-department.tsx` كاملاً بالنمط الحديث: SafeAreaView + ScrollView (flex:1 + flexGrow:1) + Header مع breadcrumb + 4 stat cards + filter card + table card مع pagination.
    - النقر على أي قسم في الجدول (الاسم أو زر العين) يفتح `/department-details?departmentId={id}` بدلاً من modal قديم.
    - إزالة modal التفاصيل القديم نهائياً.
    - تحديث الفلاتر: dropdown للكلية + بحث نصي + reset.
    - تصحيح breadcrumb في `/department-details.tsx`: كان يربط إلى `/departments` (مسار غير موجود) → الآن يربط إلى `/add-department` (المسار الصحيح).
  - **النتيجة المُختبَرة:**
    - `/add-department` تعرض 4 أقسام في جدول حديث مع 4 بطاقات إحصائية (4 أقسام، 4 معروض، 92 طالب، 12 مقرر).
    - النقر على breadcrumb "الأقسام" من `/department-details` يعود بنجاح إلى `/add-department` الجديدة.
    - زر "إضافة قسم" يفتح نموذج بتصميم متّسق مع باقي الصفحات.
- 2026-06-17 **إرجاع صفحة المقررات إلى `(tabs)/courses.tsx` مع إصلاح التمرير**:
  - **الطلب:** المستخدم طلب إعادة محتوى صفحة المقررات الكامل إلى ملف `(tabs)/courses.tsx` بدلاً من إعادة التوجيه إلى `/manage-courses`، وإصلاح مشكلة التمرير بنفس النمط المستخدم في الشاشات العاملة (SafeAreaView flex:1 → ScrollView flex:1 → contentContainerStyle flexGrow:1).
  - **الإصلاح:**
    - دمج محتوى `/manage-courses.tsx` (2046 سطر) داخل `(tabs)/courses.tsx`.
    - تحديث مسارات الاستيراد من `../src/...` إلى `../../src/...`.
    - حذف `dataSet={{ responsiveScrollRoot: "true" }}` من الـ ScrollView (هذا الـ attribute كان يطبق قاعدة CSS عالمية تجبر `overflow: visible` على الـ ScrollView وتمنعه من scrolling).
    - إضافة `flexGrow: 1` إلى `contentContainerStyle` ليضمن أن المحتوى يتمدد لملء الـ ScrollView.
    - تحديث 3 مراجع من `/manage-courses` إلى `/(tabs)/courses` في: `(tabs)/index.tsx` (×2) و `course-details.tsx`.
    - حذف ملف `manage-courses.tsx` نهائياً.
  - **النتيجة المُختبَرة:**
    - قبل: `dataAttr="true", overflowY=visible, scrollableElements=0` (المحتوى مقصوص داخل tabs container)
    - بعد: `dataAttr=null, overflowY=auto, clientH=1020, scrollH=1366` (التمرير الداخلي للـ ScrollView يعمل، شريط التبويب السفلي يبقى ثابت).
- 2026-06-17 **حل نهائي لـ scroll في صفحة المقررات: نقلها خارج Tabs navigator** (تم استبداله بالحل أعلاه):
  - **السبب الجذري:** React Navigation Tabs يحبس المحتوى داخل container بارتفاع ثابت وflex constraint، مما يمنع الـ body من التمدد طبيعياً. كل محاولات CSS/JS كانت تكسر التخطيط أو لا تعمل بسبب hashed class names المتغيرة بين builds.
  - **الإصلاح:** إنشاء صفحة جديدة `/app/frontend/app/manage-courses.tsx` (re-export من `(tabs)/courses.tsx`) خارج tab navigator — مثل `/students` و `/manage-teachers` العاملتين. الـ DOM tree لها أبسط بكثير ولا يحوي tabs container constraints.
  - **تحديث الروابط:** بطاقات "المقررات" في الصفحة الرئيسية `(tabs)/index.tsx` تشير الآن إلى `/manage-courses` بدلاً من `/courses`.
  - **النتيجة:** body يتمدد إلى 1430px (قبل: 720px) — يضمن ظهور scrollbar الطبيعي للمتصفح.
- 2026-06-17 **تراجع عن CSS العدواني الذي كسر التخطيط (P0)**:
  - **المشكلة:** الـ CSS السابق طبَّق `overflow: visible` على كل عناصر RN-Web بما فيها الـ Tab navigator والـ floating header buttons — مما سبب: (1) اختفاء شريط التبويب السفلي، (2) انزلاق زر القائمة والبحث إلى وسط الصفحة، (3) كسر سلوك التمرير.
  - **الإصلاح:** التراجع إلى CSS آمن يستهدف فقط:
    - `body` + `html` (تنسيق scrollbar الجميل بلون داكن)
    - `[data-responsive-scroll-root="true"]` فقط (الصفحات التي اختارت explicit opt-in)
    - تنسيق scrollbar للـ inner ScrollViews دون تعطيل overflow.
  - **النتيجة:** التخطيط استعاد طبيعته في كل الصفحات (الرئيسية، المقررات، الطلاب، المعلمين).
  - **خطوة لاحقة آمنة:** إضافة `responsiveScrollRoot="true"` يدوياً لكل صفحة فرعية (مثل course-students, course-details) عند الحاجة — بدون CSS عدواني.
- 2026-06-17 **حل جذري لـ scrollbar في كل صفحات RN-Web (P0)**:
  - **السبب الجذري المُكتشَف:** RN-Web يضع `overflow: hidden auto` على كل ScrollView/FlatList مع ارتفاع داخلي ثابت (مثلاً `296px`). الـ body له `scrollHeight === clientHeight === 720` → لا يحتاج scrollbar. المحتوى الفعلي محبوس داخل container داخلي صغير بـ scroll مخفي يعمل لكنه غير مرئي.
  - **الإصلاح:** CSS قوي في `responsiveStyles.ts` يجبر كل `[class*="r-WebkitOverflowScrolling"]` و `[class*="r-overflowY"]` على `overflow: visible !important + max-height: none !important + height: auto !important`. مع استثناء `[role="dialog"]` (الـ modals تحافظ على scroll الداخلي).
  - **النتيجة المُختبَرة في `/course-students` بـ21 طالب:**
    - قبل: `bodyScrollH=720`, `bodyClientH=720` (لا scroll)
    - بعد: `bodyScrollH=2338`, `bodyClientH=720` (scroll طبيعي للمتصفح يعمل)
    - `computedOverflowY` تحوّل من `auto` إلى `visible` (تأكيد تطبيق CSS).
  - **شريط التمرير المُنسَّق:** `*::-webkit-scrollbar { width: 14px }` بلون داكن `#6b7d99` وحدّ خارجي. يظهر في كل صفحات admin/student/teacher عند المحتوى الطويل.
  - **قيد بصري:** Playwright headless screenshots لا تُظهر scrollbars (قيد معروف للأداة) — في متصفح المستخدم العادي ستظهر بوضوح.
- 2026-06-16 **شريط تمرير مرئي شامل في كل صفحات RN-Web**:
  - **المشكلة:** صفحات المقررات (والصفحات الفرعية الأخرى) لم تكن تُظهر scrollbar حتى عندما يكون المحتوى أطول من النافذة.
  - **الإصلاح:** توسيع CSS العالمي في `responsiveStyles.ts` ليستهدف كل ScrollView/FlatList في RN-Web عبر:
    - `[class*="r-overflow"]`, `[class*="OverflowScrolling"]`, `[class*="WebkitOverflow"]`, `[class*="r-overflowY"]`, `[class*="r-overflowX"]` — يطابق كل classes RN-Web الفعلية.
    - `*::-webkit-scrollbar` كتجاوز قوي + `*::-webkit-scrollbar-thumb` بلون داكن (`#6b7d99`) وحدّ خارجي للوضوح.
    - `scrollbar-width: auto` و `appearance: auto` لإجبار المتصفحات على إظهار الشريط دائماً (بدلاً من overlay-only).
  - **إضافة `dataSet={{ responsiveScrollRoot: "true" }}`** لصفحتين كانتا تفتقدانها: `course-details.tsx` و `archive-course-history.tsx`.
  - **التحقق:** عبر JS evaluation داخل المتصفح: `pseudo_width=14px`, `display=block`, `scrollbar-width=auto` (CSS مُطبَّق فعلاً). screenshot tool لا يُظهر الـ scrollbar بصرياً لأن Playwright Chromium headless يخفي الـ scrollbars تلقائياً في screenshots — لكن متصفح المستخدم العادي سيعرضها.
- 2026-06-16 **إصلاح ثانٍ لفلترة `/courses` — endpoint مزدوج (P0)**:
  - **المشكلة:** التعديل السابق طُبِّق على `routes/courses.py` لكن FastAPI كان يستخدم `server.py:4818` (مسجَّل أولاً) — لذا بقي تطبيق المعلم يعرض الفصل الماضي.
  - **الإصلاح:** نقل نفس منطق الفلترة الذكية إلى `server.py::get_courses`: تُفعَّل تلقائياً للمعلم/الطالب أو عند تمرير `?teacher_id`، الإداريون يرون كل المقررات، ودعم `?all_semesters=true` للتجاوز.
  - **التحقق (بتوكن معلم حقيقي):** قبل=1 مقرر بـsemester_id قديم؛ بعد=0 (صحيح، المعلم لا يدرّس في الصيفي). Admin بدون params = 13 (كل المقررات). Admin مع `teacher_id` = مفلتر. `all_semesters=true` = escape hatch يعمل.
- 2026-06-16 **إصلاح فلترة المقررات في تطبيقات المعلم والطالب بالفصل النشط (P0)**:
  - **المشكلة:** تطبيقات الطالب والمعلم كانت تعرض مقررات الفصل السابق (الفصل الأول) لأن endpoints `/students/me/courses` و `/students/{id}/courses` و `/courses?teacher_id=X` لم تفلتر بالفصل النشط.
  - **الإصلاح (3 endpoints):**
    - **`GET /students/me/courses`**: فلترة `enrollments` و الاستعلام الاحتياطي للقسم/المستوى بـ `semester_id == active_semester._id`.
    - **`GET /students/{id}/courses`** (للإدارة): نفس الفلترة.
    - **`GET /courses`**: فلترة تلقائية ذكية — تُطبّق للمعلم/الطالب (role=teacher|student) أو عند تمرير `?teacher_id`. الإداريون يرون كل المقررات افتراضياً. أضيف parameter `?all_semesters=true` و`?semester_id=X` للتحكم اليدوي.
  - **التحقق:** البيانات تؤكد فاعلية الإصلاح — من أصل 13 مقرر في النظام، فقط 1 مقرر ("تدريب ميداني صيفي") في الفصل النشط الصيفي. بقية المقررات (الفصل الأول) لن تظهر للطلاب/المعلمين، وستظهر للإداريين فقط.
- 2026-06-16 **إضافة "تغيير المستوى" + سجل الحضور Inline للمقرر**:
  - **زر "تغيير المستوى"** أُضيف للإجراءات السريعة (أيقونة طبقات نيلية) + مودال بسيط لاختيار م1–م5 + يستدعي `studentsAPI.update({level})`.
  - **سجل الحضور Inline:** النقر على صف مقرر يفتح/يطوي سجل حضور الطالب في **هذا المقرر تحديداً** داخل نفس البطاقة (cache في الذاكرة، أيقونة chevron تدور)، يعرض كل محاضرة بحالتها (حاضر/غائب/متأخر/بعذر) والتاريخ والوقت وطريقة الرصد. كان النقر سابقاً ينقل لصفحة `/course-lectures` (سجل حضور الفصل كاملاً) بينما المستخدم أراد سجل الطالب المحدد في هذا المقرر.
- 2026-06-16 **تحسين صفحة `/student-details` بناءً على ملاحظات المستخدم**:
  - **تصميم مدمج:** استبدال المربعات الكبيرة (3 stat cards) بشرائح أفقية صغيرة (compact chips) — توفير ~40% من المساحة الرأسية. تصغير بطاقة الطالب والـavatar.
  - **شارة نسبة الحضور الإجمالية:** badge ملوّن (أخضر≥75% / برتقالي≥50% / أحمر<50%) بجانب عنوان الصفحة مباشرة.
  - **نسبة الحضور لكل مقرر:** chip ملوّن داخل صف المقرر يعرض النسبة + `حاضر/إجمالي` — يُحمَّل تلقائياً بالتوازي لكل المقررات.
  - **تصدير PDF جديد:** Backend endpoint جديد `GET /api/export/report/student/{id}/pdf` يولد PDF عربي احترافي (ReportLab + Amiri) يعرض بطاقة معلومات الطالب + جدول المقررات مع نسب الحضور والإجمالي. اختُبر عبر curl (22KB، content-type=pdf).
  - **إصلاح Excel:** كان `exportAPI.exportStudentReportExcel` غير موجود (السبب الحقيقي للفشل) — صُحّح إلى `reportsAPI.exportStudentReportExcel`.
  - **رابط المقرر:** التوجيه من `/course-details` (القديمة) إلى `/course-lectures` (الحديثة المتسقة مع `/teacher-courses`).
  - **حذف CTA "عرض ملخص الحضور":** الملخص يُحمَّل تلقائياً الآن، يبقى فقط زر "تحميل السجلات" للسجل التفصيلي (للحفاظ على سرعة التحميل).
- 2026-06-16 **توحيد عرض حمل المعلم بين `/manage-teachers` و `/teacher-courses`**:
  - **المشكلة:** كان عمود "النصاب" يعرض السقف الأسبوعي المخزن للمعلم (12 افتراضياً) وعمود "المقررات" يحسب كل المقررات النشطة عبر **كل الفصول**. بينما `/teacher-courses` يعرض ساعات ومقررات **الفصل النشط فقط** — مما أدى إلى تباين في الأرقام (مثلاً 9 س / 3 مقررات في القائمة مقابل 3 س / 1 مقرر في الصفحة المخصصة).
  - **الحل (Backend):** أضيف لـ `GET /api/teachers` الحقول `current_semester_id`, `current_semester_hours`, `current_semester_courses_count` — تُحسب دفعة واحدة من `db.teaching_loads` المُفلتَر بالفصل النشط (`semesters.status='active'`).
  - **الحل (Frontend):** صفحة `/manage-teachers` تستخدم الحقول الجديدة (مع fallback للحقول القديمة) في عمودي "النصاب" و"المقررات" — صار العرض متطابقاً 100% مع `/teacher-courses`.
- 2026-06-16 **Student Details page (`/student-details`) — full redesign replacing modal**:
  - **Replaced 39-line redirect-shim** with a 1360-line full-featured page mimicking `/teacher-courses` design system.
  - **Sections:** page header (title + status badge + breadcrumb + actions), student profile card (avatar/name/student_id/reference_number/department/level/section/phone/email), 3 stat cards (مقررات / ساعات معتمدة / حالة الحساب), quick-actions row (تغيير الحالة / تفعيل أو إلغاء تفعيل الحساب / إعادة تعيين كلمة المرور / التقرير المفصّل), courses list with rich metadata badges, and an attendance section.
  - **CRITICAL UX (per user request): Attendance does NOT load on mount.** A "عرض ملخص الحضور" button triggers GET `/api/attendance/stats/student/{id}` and shows 5 summary cards (حاضر/غائب/متأخر/معذور/إجمالي) + معدل الحضور chip. After that, an "عرض التفاصيل" button fetches `/api/attendance/student/{id}` and renders the detailed records (capped at 100).
  - **Modals:** Edit info (PUT `/api/students/{id}`) and Change Status (POST `/api/student-status/{id}/change`) — both inline, fully styled, RTL.
  - **Excel export:** `/api/export/report/student/{id}/excel`.
  - **`/students.tsx` updated:** `handleViewDetails` now routes to `/student-details?studentId=ID` (was opening modal); the `?openStudent=ID` query param now redirects to the new page (legacy compatibility for global search results).
  - **Verified:** iteration_31 backend pytest 6/6 PASS · iteration_32 frontend 100% PASS (all 22 testIDs reachable, attendance-empty-on-mount network invariant verified, edit/status modals exercised).
- 2026-06-15 **Teacher Courses page (`/teacher-courses`) redesigned + course assignment**:
  - Applied new design system: page header with breadcrumb (الرئيسية > المعلمون > المقررات), teacher info card with avatar, 3 colorful stat cards (إجمالي المقررات / الطلاب / المحاضرات), course list cards with rich metadata badges.
  - **NEW: Assign Courses flow** — primary "إسناد مقرر" button opens modal with debounced course search (`/api/teaching-load/search-courses`), multi-select with checkboxes, per-course weekly-hours input, "إخفاء المقررات المسندة لمعلمين آخرين" filter, batch save via `POST /api/teaching-load/bulk`.
  - **NEW: Unassign flow** — per-course "إلغاء الإسناد" button + confirmation modal calls `PUT /api/courses/{id}` with `teacher_id: null`.
  - **Backend fix**: `update_course` in `server.py` (line 5617) switched from `{k:v for k,v in data.dict().items() if v is not None}` (which silently dropped null values) to `data.dict(exclude_unset=True)` so explicit `teacher_id: null` now clears the field AND removes the matching `teaching_loads` row.
  - **Frontend fix**: replaced all `data-testid` JSX attributes with `testID` for proper RN-Web bridging (data-testid props weren't reaching the DOM on TouchableOpacity/View/TextInput).
  - Verified end-to-end (iteration_29): 4/4 backend pytest cases pass, all testIDs discoverable, assign + unassign flows persist correctly in DB.
- 2026-06-15 **Responsive design system for all redesigned admin pages**:
  - Added `/app/frontend/src/utils/responsiveStyles.ts` — injects CSS Media Queries once at app boot (web only) via `_layout.tsx`.
  - Breakpoints: Desktop (>1024px) · Tablet (≤1024px → 2x2 stats grid) · Mobile (≤768px → 1-col stacks, table rows become vertical) · Small mobile (≤480px → action buttons stack).
  - Hook applied to 5 pages via `dataSet={{ responsive: '...' }}` attributes which map to `[data-responsive="..."]` CSS selectors. Keys: `page-scroll`, `page-header`, `page-header-actions`, `page-title`, `stats-grid`, `course-header`, `filter-row`, `table-row`, `table-header-row`, `lecture-card`, `lecture-status-abs`, `table-footer`.
  - On mobile: page header stacks vertically, stat cards become 1-per-row, filters become full-width, table rows transform to vertical card style, lecture cards stack, page title shrinks 26px→18px.
  - Course Lectures (`/course-lectures`): added 4th stat card "إجمالي المحاضرات" (الكل) showing total lecture count, before the scheduled/completed/absent cards.
- 2026-06-15 **Course Lectures page redesigned (`/course-lectures`)** — Applied new design system:
  - Top course header card: book icon + course name + code + meta chips (hours / department / level / students count).
  - Action buttons (top-left): "إضافة محاضرة" (green) · "توليد تلقائي" (purple) · "تحديد متعدد" (outline).
  - 4 stats cards: Total students · Scheduled · Completed · Absent.
  - Filter bar: search + status dropdown + day dropdown + date-range (from–to) + "تصفية" reset.
  - Lecture rows as cards (one per row) with: numbered badge · day name · date · time · room · 4 mini counters (total/scheduled/completed/absent) · action buttons (التفاصيل / إعادة الجدولة / تسجيل الحضور / 3-dot) · status badge.
  - Pagination footer: page numbers + per-page selector + Prev/Next.
  - 3-dot action Modal: View details · Reschedule · Cancel lecture · Delete (with proper permission checks).
  - All existing logic preserved (selection mode, bulk delete, reschedule modal, generate semester, attendance, etc.).
- 2026-06-15 **Unified Design System across admin pages (students, teachers, courses, faculty-details)**:
  - Applied consistent new SaaS-style design to `/students`, `/manage-teachers`, `/(tabs)/courses`, and `/faculty-details`.
  - **Pattern:** Light bg (`#f4f6fb`), white rounded cards with thin borders, colorful circular stat icons, clean table layout with avatar/badge cells, centered Modal action menus.
  - **Common building blocks:** Page header (title + breadcrumb + action buttons), 4 colored stat cards (green/cyan/orange/purple), filter card (search + dropdowns + reset/apply), tabular list with pill badges, 3-dot row menu opening as centered Modal, footer with per-page selector + numbered pagination.
  - **Per-page specifics:**
    - `/students`: 8-column table (student/uni ID/inner ID/program/level/status/date/actions) + bulk selection bar + status-history menu item.
    - `/manage-teachers`: 8-column table (teacher/phone/dept/specialization/load/courses/account/actions) with avatar initials and account pill.
    - `/courses`: 7-column table (course/dept/level/teacher/students/lectures/actions) + active semester badge + "المزيد" menu (templates, lectures import, auto-enroll, restore).
    - `/faculty-details`: 4 stat cards + "البيانات الأساسية" info card + departments table with student/course chips.
  - All existing logic preserved (CRUD, Excel import/export, bulk operations, status/level changes, safe delete with backup, warnings, history, auto-enroll, etc.).
- 2026-02 Term field added to Semester create/edit (UI + backend)
- 2026-02 Multi-section curriculum offering generator (sections_map)
- 2026-02 Teaching Load Report redesigned (filters: semester/department/teacher) + reads from `semester_archives` for archived semesters
- 2026-02 GCP Cloud Run parallel deployment with Kaniko cache + GitHub Actions CI
- 2026-02 MongoDB Atlas downgraded M30 → M10 (cost optimization)
- 2026-02-26 **Student Level Change with Section Reassignment**:
  - Edit modal: inline notice when level changes AND student has a section; quick actions (keep / clear) + suggested chips from existing sections at the new level + manual input.
  - Bulk modal: 2-step flow – pick level → choose section action (keep current per-student / set unified section / clear). Suggestion chips at new level.
  - Backend `POST /api/students/bulk-change-level` now accepts `section_mode` ("keep" | "set" | "clear") + optional `new_section`. Backward-compatible default = "keep".
- 2026-06-02 **Multi-Identifier Login + Duplicate student_id Support**:
  - Login accepts: `username` (default), `reference_number`, or `student_id` (if unique).
  - When `student_id` is duplicated across students, login by student_id returns 409 — user must use reference_number.
  - `POST /api/students` and Excel import: allow duplicate `student_id` only if `department_id` differs (rejects same-dept duplicates).
  - `PUT /api/students/{id}` and restore endpoints: same scoped duplicate rule.
  - `POST /api/students/{id}/activate`: if `student_id` is already taken in `users.username`, fallback to `reference_number` as username automatically.
  - `POST /api/students` (with password): same fallback.
  - Login screen placeholder updated: "اسم المستخدم / رقم القيد / الرقم المرجعي".
- 2026-06-02 **Active Semester Scoping for Teaching Load**:
  - `GET /api/teaching-load/search-courses` defaults to active semester (excludes archived). Accepts `semester_id` override.
  - `GET /api/teaching-load/teacher/{id}/courses` same default + override + existing-loads also scoped.
  - `GET /api/teaching-load` defaults to active semester. Accepts `semester_id` or `all_semesters=true`.
  - `POST /api/teaching-load/bulk` "course assigned to other teacher" check now scoped to same `semester_id` (a course can be reassigned in a new semester without conflict with archived assignment).
  - Frontend: active-semester badge displayed at top of `teaching-load` page with green accent ("الفصل النشط: ...").
- 2026-06-02 **Teaching Load Templates** (نسخ الإسنادات بين الفصول):
  - New collection `teaching_load_templates` storing snapshots.
  - Endpoints: `GET/POST /api/teaching-load/templates`, `POST /api/teaching-load/templates/{id}/apply`, `DELETE /api/teaching-load/templates/{id}`.
  - Snapshot stores: course_code/level/section/dept + curriculum_course_id + teacher_employee_id + full_name + weekly_hours + notes.
  - Apply matches courses by curriculum_course_id (primary) → code+level+section+dept (fallback) → code+level+section. Teachers matched by employee_id → full_name.
  - Returns detailed stats: created/updated/skipped + unmatched courses + unmatched teachers.
  - Frontend: 2 buttons in teaching-load header (Save Template / Apply Previous Template) + 2 modals. Save modal: name + term selection. Apply modal: template picker + target semester + overwrite checkbox + results dashboard.
- 2026-06-04 **Weekly Schedule Drafts + Visual Export**:
  - New collection `weekly_schedule_drafts` (capped to last 10 per scope) — lightweight snapshots, not archived.
  - Endpoints: `GET/POST /api/weekly-schedule/drafts`, `POST /drafts/{id}/restore`, `GET /drafts/{id}/compare`, `DELETE /drafts/{id}`.
  - Visual export endpoints: `GET /weekly-schedule/export-visual/pdf` + `/excel` with filters (faculty/dept/level/section/teacher/room/semester).
  - PDF: A4 landscape, Arabic-shaped text via arabic-reshaper + bidi, colored cells (header blue, time slots light blue, empty grey).
  - Excel: openpyxl with RTL layout, merged title row, colored fills, bordered cells.
  - Frontend: 3 new buttons in weekly-schedule (Save Draft / Drafts List / Export) + 3 modals using HTML-native dialogs on web.
  - Drafts modal shows side-by-side comparison stats (teachers/rooms/courses/by_day) between draft and current schedule.
  - Export modal: format toggle (PDF/Excel) + scope picker (all/department/section/teacher/room).
- 2026-06-04 **Availability Report (تقارير الفراغ/الإشغال)**:
  - Backend endpoints: `GET /api/weekly-schedule/availability/rooms` and `/teachers` — given day_of_week + slot_number (+ optional faculty/department/semester), returns lists of free/busy rooms or teachers.
  - Rooms response: `{filter, total, free_count, busy_count, rooms: [{id, name, code, capacity, type, status, details}]}` where `details` shows the occupying course/teacher/section.
  - Teachers response adds preference status (preferred / neutral / non_preferred_day / unavailable) based on teacher schedule preferences, plus `free_preferred / free_neutral / free_unavailable` counts.
  - Frontend page `/availability-report` (linked from weekly-schedule via `availability-report-btn`): toggle rooms/teachers, day chips, slot chips, optional faculty/department filters, summary cards, and color-coded list with preference badges.
  - Validated end-to-end via screenshot tool: rooms tab returns 3 free rooms, teachers tab shows 3 available teachers with neutral preference badges.
- 2026-06-04 **Restore Auto-Backup + Real Slot-by-Slot Compare**:
  - `POST /weekly-schedule/drafts/{id}/restore?backup_current=true` (default) — قبل استبدال الجدول الحالي بالنسخة المختارة يتم تلقائياً حفظ الجدول الحالي كنسخة احتياطية باسم وصفي (`نسخة تلقائية قبل استعادة "..."`), فلا تُفقد البيانات الحالية أبداً.
  - الاستجابة تتضمن `backup_id`, `backup_slots_count`, `backup_created` للتأكيد.
  - `GET /weekly-schedule/drafts/{id}/compare` تم توسيعها إلى **مقارنة حقيقية slot-by-slot**: مفتاح الهوية (course_id + day + slot_number + section + level) لتحديد "نفس الخانة"، ومقارنة قيم (teacher_id, teacher_name, room_id, room_name, notes) للكشف عن التعديلات.
  - تُرجع `diff: { added[], removed[], changed[ {..., diffs: {field: {draft, current}}}], added_count, removed_count, changed_count, unchanged_count }` مع إثراء الأسماء (course/teacher/room/department) من lookup batched.
  - واجهة `weekly-schedule.tsx`: تنبيه استعادة محدّث ("سيتم حفظ الجدول الحالي تلقائياً..."), modal مقارنة موسّعة لعرض 4 بطاقات إحصائية ملونة + 3 أقسام قابلة للطي (مضاف/محذوف/معدّل) مع تفاصيل كل slot وتمييز قبل/بعد للحقول المتغيرة بألوان (أحمر شطب → أخضر سميك).
- 2026-06-04 **Summer Term Support (term=3) في الخطة الدراسية**:
  - Backend: `CurriculumCourseCreate/Update` يقبل الآن `term ∈ {1,2,3}` (كان 1-2 فقط) — `term=3` للفصل الصيفي.
  - `GET /curriculum/by-department/{id}` يُرجع الآن `grid[level].term3` بجانب `term1` و `term2`.
  - `POST /curriculum/generate-offerings?term=3` يجلب فقط مقررات الخطة المرتبطة بـ `term=3` (سابقاً: كان يأخذ كل المقررات بدون فلترة عند term=3).
  - Frontend `curriculum.tsx`: عمود ثالث "الفصل الصيفي" بلون برتقالي مميز (#ef6c00) داخل كل مستوى، زر `form-term-3` "الفصل الصيفي" في فورم إضافة مقرر، رسالة "تم توليد X جلسة" تعرض "الفصل الصيفي" بدلاً من "كل الفصول".
  - E2E مختبر: إنشاء فصل صيفي → تفعيله → إضافة "تدريب ميداني صيفي SUMM101 (term=3)" → ظهر في عمود الفصل الصيفي للمستوى 2 → توليد جلسات للفصل الصيفي ولّد محاضرة واحدة فقط (المقرر الصيفي الوحيد، وليس كل الخطة).
- 2026-06-11 **`/students` Page Frontend Performance Fix (P0)**:
  - Wrapped all 9 heavy modals (`Import`, `Details`, `Edit`, `Warning`, `Level`, `BulkSection`, `Status`, `History`, `SafeDelete`) with conditional rendering (`{showXModal && (<Modal>…</Modal>)}`) so their full JSX subtrees (forms, pickers, scrollviews, hundreds of nodes) are no longer constructed on initial mount. Saves the majority of first-render React work.
  - Converted `getDepartmentName` from O(n) `Array.find` per row to O(1) `Map.get` lookup via memoized `departmentMap`.
  - Wrapped `renderStudent` in `useCallback` with proper deps (`selectedIds`, `selectionMode`, `canManageStudents`, `getDepartmentName`) — stable identity helps `FlatList` skip needless row re-renders.
  - Backend `GET /api/students` already optimized in earlier session (376ms, no enrollments). API + UI are now both fast.
- 2026-06-11 **FCM Push Notifications Critical Bug Fix (P0)**:
  - **السبب الجذري (تأكّد لاحقاً)**: في الـ Backend في Cloud Run، متغيرات Firebase (`FIREBASE_SERVICE_ACCOUNT_JSON` أو `FIREBASE_SERVICE_ACCOUNT_PATH`) **لم تكن مُعرَّفة** بعد ترحيل Railway → Google Cloud Run. النتيجة: `firebase_admin` لم يُهيَّأ على الإنتاج → كل `messaging.send_each_for_multicast()` يفشل صامتاً.
  - **النتيجة قبل الإصلاح**: 100% من إشعارات Push تفشل على Cloud Run. الإشعارات داخل التطبيق تعمل لأنها قراءة من MongoDB مباشرة (مسار منفصل).
  - **الإصلاح**:
    1. رُفع `firebase-service-account.json` من مشروع `ahgaff-attendance` إلى GCP Secret Manager باسم `firebase-service-account` (في مشروع `ahgaff-university` GCP)
    2. مُنحت Cloud Run compute service account صلاحية `roles/secretmanager.secretAccessor`
    3. تحديث `/app/cloudbuild-backend.yaml`: إضافة `FIREBASE_SERVICE_ACCOUNT_JSON=firebase-service-account:latest` إلى `--update-secrets`
    4. الكود يقرأ `os.environ['FIREBASE_SERVICE_ACCOUNT_JSON']` تلقائياً (موجود في `services/firebase_service.py:17`)
  - **تحسينات إضافية**:
    - Logging مفصّل لكل توكن فشل: `FCM send failed [token=...] [code=...] [msg=...]`
    - Endpoint تشخيصي جديد: `POST /api/notifications/debug-send` يُرجع `success_count`, `failure_count`, `failed_details[]` مع `error_code` (مثل `INVALID_ARGUMENT`, `UNREGISTERED`, `SENDER_ID_MISMATCH`)
    - إصلاح ثانوي: استبدال `WebpushFCMOptions.link="/"` بـ `"https://app.ahgaff.net/"` في `send_notification()` (دالة أقل استخداماً)
  - **معلومات معمارية مؤكَّدة**:
    - Firebase project: `ahgaff-attendance` (Spark plan)
    - يحوي ٣ تطبيقات: `com.ahgaff.teacher`, `com.ahgaff.student`, web app
    - ملف واحد فقط `firebase-service-account.json` يخدم كل التطبيقات (Best practice)
  - **النتيجة المؤكَّدة**: ✅ المستخدم اختبر فعلياً → الإشعارات وصلت لكلا تطبيقَي المعلم والطالب

- 2026-06-12 **Wafideen Domain Migration (Railway → Cloud Run) — مكتمل ✅**:
  - **النطاقات المُرحَّلة**: `wafideen.ahgaff.net` (Frontend) و `api.wafideen.ahgaff.net` (Backend)
  - **Cloud Run targets**: `wafideen-frontend-3pzknh7knq-ww.a.run.app` و `wafideen-backend-872667841290.me-central1.run.app`
  - **Cloudflare Workers**: `wafideen-api-proxy` و `wafideen-frontend-proxy` (Code محفوظ في `/app/cloudflare-workers/`)
  - **النمط**: Custom Domain على كل Worker (يُنشئ DNS records تلقائياً)
  - **اختبار E2E**: ✅ Backend `HTTP/2 404` + `x-proxied-by: Cloudflare-Worker-Wafideen` / Frontend `HTTP/2 200`

- 2026-06-15 **🔧 إعادة ميزة "إضافة طالب موجود" + توحيد نمط النافذة في صفحة المقرر**:
  - **بلاغ المستخدم**: 
    1. كنت قد ألغيت ميزة "إضافة طالب موجود إلى المقرر" بالخطأ عند الـ refactor السابق — كانت موجودة قبل ذلك
    2. نافذة "إنشاء طالب جديد" في صفحة المقرر كانت بنمط slide-up (`pageSheet`) — المستخدم يريدها بنفس نمط Popup منبثق المركَّز كما في صفحة `/students`
  - **الإصلاح في `/app/frontend/app/course-students.tsx`**:
    - **state جديد**: `addTab: 'existing' | 'new'` (يحدد التبويب النشط)
    - **نافذة موحَّدة بـ Modal منبثق** (transparent + fade animation + overlay شبه شفاف) — نفس نمط `/students` ✅
    - **تبويبان أعلى النافذة**:
      - **"من القائمة"**: عرض FlatList بالطلاب غير المسجَّلين في المقرر + بحث + اختيار متعدد + زر تسجيل
      - **"إنشاء طالب جديد"**: مكوّن `AddStudentForm` المشترك (mode="course")
    - **التبويب الأول يعرض العداد**: "من القائمة (45)" — عدد الطلاب المتاحين
    - يستخدم الـ handlers الموجودة مسبقاً: `handleEnrollStudents` للطلاب الموجودين، `handleCreateAndEnroll` للطلاب الجدد
    - حالات فارغة واضحة: "لا يوجد طالب يطابق البحث" / "لا يوجد طلاب متاحون لإضافتهم"
  - **الفائدة**:
    - استعادة الوظيفة المحذوفة بالخطأ ✅
    - تجربة موحَّدة ١٠٠٪ بين `/students` و `/course-students` (نمط Popup، fade، overlay)
    - حرية المستخدم بالتبديل بين تسجيل طالب موجود أو إنشاء طالب جديد بنفس النافذة


  - **الهدف**: منع أي اختلاف مستقبلي بين نموذجَي إضافة الطالب في `/students` و `/course-students` — أي حقل جديد يُضاف مرة واحدة في المكوّن وينعكس فوراً في كلا الصفحتين.
  - **الملف الجديد**: `/app/frontend/src/components/AddStudentForm.tsx` (~210 سطر) يصدّر:
    - `AddStudentForm` (المكوّن نفسه)
    - `StudentFormValues` (TypeScript type للحالة)
    - `emptyStudentForm` (قيم ابتدائية موحَّدة)
  - **Props**:
    - `mode`: `'standalone'` (يُظهر القسم/المستوى/الشعبة كحقول) أو `'course'` (يخفيها لأنها مأخوذة من المقرر)
    - `values`, `onChange`, `onSubmit`, `onCancel`, `submitting`
    - `departments` (مطلوب فقط في standalone)
    - `contextLabel` (نص ملخّص في الرأس مثل اسم المقرر)
    - `submitLabel` (مخصّص: "إضافة" أو "إنشاء وتسجيل")
  - **الحقول الموحَّدة**: رقم القيد، الاسم، القسم (standalone فقط)، المستوى (standalone فقط)، الشعبة (standalone فقط)، رمز البرنامج، عام الالتحاق، الجوال، البريد، كلمة المرور
  - **الاستخدام في `students.tsx`**: `mode="standalone"` + قائمة الأقسام
  - **الاستخدام في `course-students.tsx`**: `mode="course"` + `contextLabel="سيُسجَّل في: {اسم المقرر}"`
  - **حذف الكود المكرَّر**: ~145 سطراً من `students.tsx` + ~120 سطراً من `course-students.tsx` (إجمالي ~265 سطر مكرَّر استُبدلت بـ ~210 سطر مشترك قابل للصيانة).
  - **الفائدة**: تجربة موحَّدة + صيانة سهلة + اتساق بين الواجهات + اختبار من نقطة واحدة.


  - **بلاغ المستخدم**: نموذج إضافة طالب في `course-students` يفتقد لحقول رمز البرنامج وعام الالتحاق الموجودة في صفحة الطلاب الرئيسية.
  - **الإصلاح في `/app/frontend/app/course-students.tsx`** (`handleCreateAndEnroll` + النموذج):
    - **حقل "رمز البرنامج"** (TextInput, auto-uppercase, max=3 أحرف) — اختياري، افتراضي من القسم
    - **حقل "عام الالتحاق"** (TextInput رقمي يقبل 25 أو 2025، يُطبَّع لرقمين) — اختياري، افتراضي محسوب من المستوى
    - **رسالة تنبيه** تشرح آلية توليد الرقم المرجعي بنفس صياغة صفحة الطلاب
    - رسالة النجاح تعرض الرقم المرجعي للطالب فور إنشائه
    - تنظيف الـ state بعد الإرسال (يشمل الحقلين الجديدين)
  - **الفائدة**: تجربة موحّدة بين صفحة `/students` وصفحة `/course-students` — نفس الحقول، نفس السلوك، نفس آلية توليد الرقم المرجعي.

- 2026-06-15 **➕ تحسينات نافذة إضافة طالب — حقول رمز البرنامج وعام الالتحاق + إزالة الـ default للشعبة**:
  - **بلاغ المستخدم**: الشعبة لا يجب أن تكون افتراضياً "أ" (يجب السماح بفراغها) + الرقم المرجعي يحتاج رمز برنامج وعام التحاق
  - **الإصلاح**:
    - **الشعبة**: إزالة الـ default value "أ" — يُرسل فارغاً للـ backend (placeholder تغيّر إلى "اتركها فارغة لو لا توجد")
    - **حقل رمز البرنامج**: TextInput جديد (auto-uppercase) — اختياري، الافتراضي من `default_program_code` الخاص بالقسم
    - **حقل عام الالتحاق**: TextInput رقمي (يقبل 25 أو 2025 ويُطبَّع لرقمين) — اختياري، الافتراضي يُحسب من المستوى
    - **رسالة تنبيه ذكية** في النموذج تشرح كيف يُولَّد الرقم المرجعي (= رمز البرنامج + عام الالتحاق + كلية)
    - رسالة النجاح أصبحت تعرض الرقم المرجعي للطالب فور إنشائه
  - **الاختبار**: ✅ مع `{program_code:"M", enrollment_year:"23", section:""}` → reference_number = `AUM2301001` (يحوي M و 23 بنجاح، والشعبة فارغة).

- 2026-06-15 **➕ زر "إضافة طالب مفرد" في صفحة إدارة الطلاب**:
  - **الطلب**: المستخدم لاحظ أن صفحة إدارة الطلاب فيها زر **استيراد** (Excel) فقط، بلا طريقة لإضافة طالب واحد بسرعة
  - **الإصلاح** (`/app/frontend/app/students.tsx`):
    - زر جديد (أيقونة 👤+) بجانب زر الاستيراد — يفتح نافذة مدمجة
    - نافذة فيها حقول: رقم القيد *، الاسم *، القسم * (Picker)، المستوى * (Picker)، الشعبة (افتراضياً "أ")، الجوال، البريد، كلمة المرور
    - الحقول الإلزامية (*): رقم القيد + الاسم + القسم (المستوى افتراضي 1)
    - **ذكاء UX**: الفلاتر الحالية (قسم/مستوى/شعبة) تُعبّأ تلقائياً في النموذج عند فتحه — لو كنت تتصفّح قسم معيّن، يأتيك القسم محدّداً مسبقاً
    - الفرونت يستخدم `POST /api/students` الموجود مسبقاً (لا حاجة لـ endpoint جديد)
  - **الباك إند**: يعبّئ تلقائياً faculty_id، program_code، enrollment_year، reference_number، qr_code من القسم/المستوى — المستخدم لا يحتاج إدخالها
  - **الاختبار**: ✅ `POST /api/students` اختُبر بـ curl وأنشأ طالباً بنجاح مع كل الحقول المعبَّأة تلقائياً.


  - **بلاغ المستخدم**: 
    1. تغيير حالة طالب إلى "إعادة" — لم يتغيّر شيء في الواجهة
    2. تغيير حالة إلى "متخرج" — الطالب اختفى من **كل** القوائم (الكل، المتخرجين، النشطين)
  - **السبب الجذري** (3 مشاكل متراكبة في `GET /api/students` في `server.py:3057`):
    1. الـ Query: `query = {"is_active": True}` كان يفلتر بشكل صارم — الطلاب المتخرّجون/المفصولون/المجمَّدون لديهم `is_active=False` فيختفون **تماماً** من الـ API
    2. الـ Response: لا يحوي حقل `status` نهائياً — الـ Frontend يستنتجها من `is_active` فقط، فحالة "repeat" تبدو "active" وحالة "graduated" تبدو "inactive"
    3. حقول إضافية مفقودة: `status_changed_at`, `status_reason`, `graduation_date`, `graduated_from_level`, `expulsion_date`, `frozen_at`
  - **الإصلاح** (`/app/backend/backend/server.py`):
    - إزالة `"is_active": True` من الـ query (يُرجع كل الطلاب)
    - إضافة query params اختيارية: `status` و `is_active` للفلترة من الـ Frontend
    - إضافة كل حقول الحالة في dict الـ response
    - الـ Pydantic model `StudentResponse` يدعم هذه الحقول مسبقاً
  - **الاختبار**: ✅ `GET /api/students` يُرجع الآن:
    - **92 طالب** (بدلاً من 91 — الطالب المتخرّج عاد!)
    - حقل `status` يحوي القيمة الفعلية: "graduated", "active", "repeat", إلخ
  - **الفائدة**: تغيير الحالة سيظهر فوراً في UI + الطلاب المتخرّجون/المفصولون/المجمَّدون يظهرون في فلتر "كل الحالات".


  - **المشكلة**: عند البحث عن طالب من البحث الشامل (GlobalSearch) والنقر على نتيجة الطالب، الصفحة "لا تفتح شيئاً" — كانت `/app/frontend/app/student-details.tsx` مجرد placeholder يعرض أيقونة + رقم الطالب فقط (٤٤ سطر فقط، بدون أي جلب لبيانات حقيقية).
  - **الإصلاح**:
    1. **`student-details.tsx`** أُعيد بناؤها: تُعرض حالة تحميل ("جاري فتح بيانات الطالب...") ثم تُحوّل إلى `/students?openStudent={id}` بعد 500ms (لضمان تركيب Root Layout)
    2. **`students.tsx`** أُضيف:
       - `useLocalSearchParams<{ openStudent?: string }>` لقراءة الـ query param
       - `useEffect` جديد يفتح نافذة تفاصيل الطالب تلقائياً عند توفّر `openStudent` + تحميل قائمة الطلاب
       - رسالة خطأ واضحة لو الطالب غير موجود ("غير موجود")
  - **الفائدة**: إعادة استخدام كاملة لنافذة تفاصيل الطالب الموجودة في `students.tsx` (مع كل الوظائف: التعديل، الحذف، تغيير الحالة، إلخ) بدلاً من بناء صفحة منفصلة.
  - **الاختبار**: ✅ JSX يجمَّع بدون أخطاء؛ الصفحة الوسيطة تُحمَّل بسلام.


  - **Endpoint جديد في Backend** (`/app/backend/backend/routes/weekly_schedule.py`):
    - `GET /api/weekly-schedule/conflicts` — يفحص كل الجدول الحالي ويُرجع 3 أنواع من التعارضات:
      1. **تعارض شعبة**: نفس (department + level + section + day + slot_number) لأكثر من مقرر
      2. **تعارض معلم**: نفس teacher_id في نفس اليوم والفترة في مكانَين مختلفَين
      3. **تعارض قاعة**: نفس room_id محجوزة لمقررَين في نفس الوقت
    - يقبل نفس فلاتر `/weekly-schedule` (faculty/dept/level/section/teacher/semester)
    - يُرجع: `total_conflicts`, `total_conflicting_slots`, `conflicting_slot_ids[]`, `section_conflicts[]`, `teacher_conflicts[]`, `room_conflicts[]`, `all_conflicts[]`
    - كل تعارض غني بالتفاصيل: `day, slot_number, slot_ids[], count, department_name/teacher_name/room_name`
  - **Frontend** (`/app/frontend/app/weekly-schedule.tsx`):
    - يجلب التعارضات تلقائياً مع كل `loadSchedule` (بنفس الفلاتر)
    - **مؤشر بصري لكل خلية متعارضة**: حدود حمراء سميكة + خلفية وردية باهتة + شارة `!` حمراء دائرية في الزاوية + ظل أحمر خفيف
    - **لافتة تحذير علوية**: تظهر فوق الجدول مع عدد التعارضات + عدد الخلايا المتأثرة + قابلة للضغط لفتح نافذة التفاصيل
    - **نافذة تفاصيل**: تُصنّف التعارضات إلى ٣ مجموعات ملوّنة (شعبة/معلم/قاعة) مع عدّاد لكل نوع، ثم قائمة كاملة فيها اليوم + الفترة + الاسم/القسم/المستوى/الشعبة المتعارضة
  - **التحقق**: ✅ Endpoint اختُبر بـ curl → يُرجع 0 تعارضات (لأن DB المحلية لا تحوي تعارضات)
  - **القيمة**: المستخدم يستطيع الآن رؤية كل التعارضات بنظرة واحدة بدلاً من اكتشافها يدوياً بالمقارنة بين الخلايا.


  - **Endpoints جديدة في Backend** (`/app/backend/backend/server.py`):
    - `GET /api/departments/{id}/distinct-levels` → يُرجع المستويات الموجودة فعلياً في القسم (من `db.students.distinct`)
    - `GET /api/departments/{id}/distinct-sections?level=N` → يُرجع الشعب الموجودة فعلياً (اختيارياً مع فلتر المستوى)
  - **Backend** `send_department_final_results_upload`: يقبل query params اختيارية `level: int` و `section: str` ويفلتر طلاب القسم وفقاً لها
  - عنوان الإشعار يعكس الفلاتر: "النتيجة النهائية - {القسم} - المستوى {N} - الشعبة {X}"
  - **Frontend** (`/app/frontend/app/send-department-results.tsx`):
    - **حُذِفت** القوائم الثابتة (`LEVELS = [1..8]` و `SECTIONS = ['A'..'E']`) — كانت غير دقيقة (الشعب الفعلية بحروف عربية!)
    - State جديد: `availableLevels`, `availableSections`, `loadingLevels`, `loadingSections`
    - `useEffect` يجلب المستويات تلقائياً عند تغيير القسم + إعادة تعيين فلتر المستوى/الشعبة
    - `useEffect` آخر يجلب الشعب عند تغيير القسم أو المستوى
    - Pickers تعرض عدد الخيارات المتاحة وحالة التحميل
    - رسائل واضحة عند عدم وجود بيانات: "-- لا يوجد طلاب في هذا القسم --" و "-- لا توجد شعب في هذا المستوى --"
    - الـ Pickers معطّلة (`enabled={false}`) عند التحميل أو عدم وجود خيارات
  - **التحقق**: ✅ Endpoints اختُبرت بـ curl وأرجعت بيانات حقيقية (Levels: [1, 2], Sections: ["أ"]).
  - **الهدف**: ترحيل `wafideen.ahgaff.net` و `api.wafideen.ahgaff.net` من Railway إلى Google Cloud Run me-central1 عبر Cloudflare Workers (نفس النمط المستخدم لـ api/app.ahgaff.net).
  - **Cloud Run targets**:
    - Frontend: `https://wafideen-frontend-3pzknh7knq-ww.a.run.app/`
    - Backend: `https://wafideen-backend-872667841290.me-central1.run.app/`
  - **Cloudflare Workers تم إنشاؤهما**:
    - `wafideen-api-proxy` (الكود محفوظ في `/app/cloudflare-workers/wafideen-api-proxy.js`)
    - `wafideen-frontend-proxy` (الكود محفوظ في `/app/cloudflare-workers/wafideen-frontend-proxy.js`)
  - **حالة DNS الحالية في Cloudflare** (آخر screenshot):
    - ✅ سجلَا AAAA منشآن: `api.wafideen.ahgaff.net → 100::` و `wafideen.ahgaff.net → 100::` (Proxied)
    - ⚠️ **مشكلة**: المستخدم أنشأ Custom Domains خاطئة في الـ Workers:
      - الموجود: `wafideen-api-proxy.ahgaff.net` (خطأ - اسم الـ Worker كاملاً + ahgaff.net)
      - الموجود: `wafideen-frontend-proxy.ahgaff.net` (خطأ)
    - 🎯 **الخطوة التالية المطلوبة عند العودة**:
      1. حذف Custom Domains الخاطئة من إعدادات كل Worker (Settings → Triggers → Custom Domains)
      2. حذف سجلَي AAAA `100::` من DNS Records (لأن Custom Domain سيُنشئها تلقائياً)
      3. إضافة Custom Domain صحيح في كل Worker:
         - `wafideen-api-proxy` → Custom Domain: **`api.wafideen.ahgaff.net`**
         - `wafideen-frontend-proxy` → Custom Domain: **`wafideen.ahgaff.net`**
      4. اختبار: `curl -i https://api.wafideen.ahgaff.net/` و `curl -I https://wafideen.ahgaff.net/`
  - **بدائل لو لم ينجح Custom Domains**: استخدام Workers Routes بدلاً (في ahgaff.net → Workers Routes):
    - `api.wafideen.ahgaff.net/*` → `wafideen-api-proxy`
    - `wafideen.ahgaff.net/*` → `wafideen-frontend-proxy`
  - **بعد نجاح ترحيل wafideen**: نُحدّث CORS على wafideen-backend ليقبل `https://wafideen.ahgaff.net`.

## P0 / Next
- (P1) Digital Student Card with QR + Photo
- (P2) QR scanner in Teacher App (read Student Cards)
- (P2) "Copy assignments from previous semester" in teaching-load page
- (P2) Automatic Teaching Load templates during curriculum generation
- (P2) Fix orphaned `teaching_loads` cleanup on semester archive

## Recently completed (2026-02)
- ✅ **Teaching Load Export — Notes column (cross-dept/cross-faculty flag)**: Added a "ملاحظات" column to Excel + PDF that flags courses assigned from outside the teacher's home department/faculty. Indicators: `↻ من قسم آخر` (cross-dept) and `⚑ من كلية أخرى` (cross-faculty). Cells highlighted in orange/red. Resolves faculty via `department.faculty_id` when missing on the course itself.
- ✅ **Teaching Load Export — Block-per-teacher + Level column + Teacher heading text**: Restructured department-wide teaching load exports to render one mini-table per teacher with: teacher info as bold heading text (`المعلم : ...   الرقم الوظيفي : ...`), course header row (blue) + course rows (with new `المستوى` column) + total row (light blue). Top header now shows الكلية + القسم side-by-side. PDF switched from landscape to portrait. Single-teacher mode inherits dept/faculty from teacher record. File: `/app/backend/backend/routes/teaching_load.py` (`_get_export_data`, `export_teaching_load_excel`, `export_teaching_load_pdf`). Tests pass: `tests/test_teaching_load_report.py` (6/6).
- ✅ Global Search subtitles polished: dept/faculty names stripped of trailing whitespace; Departments now include parent `كلية` in subtitle; Lectures now display `قسم/كلية` context. RBAC scoping verified intact for Saeed (dept head). File: `/app/backend/backend/routes/global_search.py`.

## P3 / Backlog
- server.py modularization (Phase 2: Reports; Phase 3+: Templates, Courses, Lectures…)
- Migrate Atlas cluster AWS Oregon → GCP Doha (latency)

## Architecture (key)
- Backend: `/app/backend/backend/server.py` (~14k lines) + routes/
- Frontend: `/app/frontend/app/*.tsx` (Expo)
- Dual deploy: Railway (native) + GCP Cloud Run (GitHub Actions)
- DB: MongoDB Atlas M10 (AWS Oregon)

## Credentials
See `/app/memory/test_credentials.md`
