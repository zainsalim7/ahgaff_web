# تقرير المرحلة 2 — نظام المراسلات الرسمية (بوابة التحقق) — 2026-10-05

## 1) ربط البيانات — النماذج الجامعية القائمة المُعاد استخدامها (لا تكرار بيانات)
| الكيان | المجموعة المصدر | المعرّف | الحقول المكشوفة للمراسلات | الحقول المحجوبة صراحةً | فحص الصلاحية | فحص النطاق التنظيمي |
|---|---|---|---|---|---|---|
| الطلاب | `students` (+ `faculties`, `departments` للأسماء؛ `student_grades`/`attendance` للأكاديمي) | `students._id` (ObjectId كنص) | أساسي: full_name, student_id, college_name, department_name, program_name, level_name, section, status, enrollment_year, graduation_date · تواصل (خلف `placeholder.contact.read`): phone, email · أكاديمي (خلف `placeholder.academic.read`): gpa, attendance_rate, warnings_count | كل ما عدا ذلك: password/hashed_password, user_id, reference_number, national_id, photo*, fees, device/tokens, notes… (resolver يبني DTO صريحاً — لا `{**doc}`) | `entity.student.read` للبحث والربط والحل؛ التواصل/الأكاديمي بصلاحيتيهما | المراسلة نفسها محكومة بنطاق `correspondence.read/update_draft`؛ الربط يتطلب أن تكون المراسلة قابلة للتحرير ضمن نطاق المستخدم. ملاحظة: البحث في الطلاب جامعي (لا يُقيَّد بكلية الكاتب) — قيد معروف (§ القيود) |
| الموظفون | `employees` (+ `org_units` لاسم الوحدة) | `employees._id` | full_name, employee_number(=employee_no), job_title, grade, category, organization_name, hire_date, qualification · تواصل خلف `placeholder.contact.read`: phone, email | national_id, salary/grade details, contract_end, device_id, manager, status history, documents… | `entity.employee.read` | كما أعلاه |
| هيئة التدريس | `teachers` (+ faculties/departments) | `teachers._id` (entity_type `TEACHER` أو `FACULTY`) | full_name, academic_title, specialization, college_name, department_name | user_id, phone/email (غير مكشوفة أصلاً), teacher_id, loads… | `entity.faculty.read` | كما أعلاه |
| المنظمات | `org_units` | `org_units._id` | name_ar(=name), name_en, code, parent_name | كل ما عدا ذلك | لا صلاحية خاصة (بيانات عامة) | — |
- البحث `GET /correspondence/entities/{kind}` مُسقَط (id, label, code, meta, status) ومُرقَّم (≤50) — لا يُرجع السجلات الكاملة (مُختبر `test_entity_search_projection`).
- الربط `POST /{id}/entities` يتحقق من الصلاحية **ووجود السجل فعلاً** (404 لمعرّف عشوائي) — أُضيف في البوابة.

## 2) سجل العناصر النائبة (allowlist مركزي واحد)
`services/corr_placeholders.REGISTRY` — المصدر الوحيد؛ أي مفتاح خارجه يُرفض خادمياً (400 في المحتوى، 422 عند نشر القالب)، بما فيها `{{student.password}}`, `{{employee.private_notes}}`, `{{unknown.field}}`, `{{student.__class__}}` (مُختبر). `input.*` يُقبل فقط إن كان المفتاح معرّفاً في `input_fields` لإصدار القالب.
- **student.***: full_name, student_id, college_name, department_name, program_name, level_name, section, status, enrollment_year, graduation_date, phone†, email†, gpa‡, attendance_rate‡, warnings_count‡
- **employee.***: full_name, employee_number, job_title, grade, category, organization_name, hire_date, qualification, phone†, email†
- **faculty.***: full_name, academic_title, specialization, college_name, department_name
- **organization.***: name_ar, name_en, code, parent_name
- **recipient.***: name, organization, title (مساحة «ليّنة»: الفارغ يُعرض فارغاً ولا يحجب التقديم)
- **correspondence.***: subject, official_number, date, date_hijri, organization_name, priority
- **system.***: university_name_ar, university_name_en, today, today_hijri
- **input.***: مفاتيح القالب فقط (TEXT/TEXTAREA/DATE/NUMBER/SELECT مع max_length/options)
† `placeholder.contact.read` · ‡ `placeholder.academic.read`. المحجوب بالصلاحية يُعرض `[غير مصرح]` ويُحسب غير محلول (يحجب التقديم). `GET /placeholders` يرجع للمستخدم المسموح له فقط.

## 3) إصدارات القوالب — السيناريو F ✅ (`test_scenario_f_template_versioning`)
1. `PUT /templates/{id}/draft` على إصدار منشور → **409**. 2. `POST /versions` → v2 مسودة (published_version يبقى 1). 3. مراسلة جديدة تُربط بآخر **منشور** (v1) لا بالمسودة. 4. نشر v2 → وثيقة v1 في `correspondence_template_versions` لم تتغير (is_published=true، محتواها الأصلي). 5. المراسلة القديمة تبقى على `template_version_id` الخاص بـ v1 ومعاينتها من v1. 6. مراسلة جديدة بعد النشر تُربط بـ v2.

## 4) اللقطة المجمّدة ✅ (`test_snapshot_level3_then_level4`, `test_snapshot_tampering_detected`)
- المجموعة: `correspondence_data_snapshots` (فهرس فريد `(correspondence_id, snapshot_stage)`).
- مرحلة التجميد: `templates.freeze_stage` ∈ {APPROVED, SIGNED, ISSUED} — الافتراضي **ISSUED**؛ تُنشأ داخل `transition_correspondence` بعد الانتقال (مرة واحدة).
- الحقول المخزنة: `resolved_data` **مُقلَّل** للمفاتيح المستخدمة فعلاً في الأقسام/الشروط فقط (+`id` للمرجعية، + correspondence/organization الأساسية، + input)، `section_values`, `template_id`, `template_version_id`, `letterhead_id`, `entity_references`, `snapshot_stage`, `generated_by`, `created_at`, `checksum`.
- الاختبار: طالب تجريبي مستوى 3 → المعاينة LIVE «المستوى 3» → إصدار → تغيير السجل الرئيسي إلى مستوى 4 واسم آخر → المعاينة `source=SNAPSHOT` ما زالت «المستوى 3» والاسم الأصلي والرقم الرسمي. اللقطة احتوت `{id, full_name, level_name}` فقط — لا هاتف/بريد/كلمة مرور.
- checksum: SHA-256 على JSON مرتَّب لـ (resolved_data, section_values, template_version_id, letterhead_id). `GET /{id}/snapshot/verify` يعيد الحساب؛ المعاينة بعد التجميد تتحقق أولاً وترفض **409** مع حدث تدقيق `SNAPSHOT_INTEGRITY_FAILED` إن تغيّرت اللقطة (مُختبر بتعديل مباشر في Mongo ثم إعادته).
- الثبات: لا يوجد أي endpoint لتعديل/حذف اللقطة (PATCH/PUT/DELETE/POST → 404/405)؛ المحتوى بعد التقديم 409؛ لقطة واحدة لكل مرحلة (الإنشاء يتجاهل الموجود).

## 5) الحل الخادمي الموثوق ✅ (`test_client_resolved_values_ignored`)
المعاينة والتجميد يبنيان البيانات من **المعرّفات** المرتبطة فقط (`build_data` من `correspondence_entities`) — لا قيم من العميل. إرسال `resolved_data`/قيم «محلولة» في PATCH يُتجاهل (حقول غير معرّفة في النموذج) أو يُرفض (`input_values` بمفتاح غير معرّف → 400). النتيجة: الاسم الحقيقي من `students` لا "FAKE NAME". Mass assignment على المراسلة (status/official_number/organization_id/version) يُتجاهل.

## 6) التزامن التفاؤلي ✅ (`test_optimistic_concurrency`)
A يحفظ v5→6 (200)، B يحفظ بـ v5 → **409** ولا تُمس تغييرات A. سباق 6 طلبات متزامنة بنفس الإصدار → 1×200 و5×409 (التحديث مشروط `{_id, content_version}` ذرياً).

## 7) العزل التنظيمي ✅ (`test_org_isolation`) — مستخدم ORGANIZATION_ADMIN في الجهة أ ضد الجهة ب
قراءة قالب ب الخاص 403 · تعديل مسودته 403 · نشره 403 · إصدار جديد 403 · إيقافه 403 · تعديل ترويسة ب 403 · تعيينها افتراضية 403 · إنشاء ترويسة/قالب داخل ب 403 · قوائم القوالب/الترويسات لا تُسرّب عناصر ب · استخدام ترويسة ب الخاصة في مراسلة أ → 400 · تطبيق قالب ب على مراسلة أ → 400 · مستخدم ب يقرأ/يعاين/يعدّل محتوى مراسلة أ → 403 (IDOR) · DRAFTER لا ينشر/ينشئ قوالب ولا يعدّل ترويسات جهته (403) · VIEWER لا يبحث في الكيانات (403).

## 8) الاختبارات الأمنية (كل بند على حدة)
| الاختبار | النتيجة | الدليل |
|---|---|---|
| Stored XSS (`<script>`, `onerror`, `javascript:`, `<iframe>`, `onclick`, `javascript:` داخل style) | PASS — 400 رفض كامل | `test_xss_and_injection` |
| تعقيم الوسوم غير المسموحة (svg/form/input) وCSS غير المسموح (color) مع إبقاء النص | PASS — bleach + CSSSanitizer (تم تفعيل tinycss2 في البوابة) | نفسه |
| Template injection (`{{7*7}}`, `{% %}`, `${}`, فلاتر) | PASS — تُعامل كنص حرفي؛ لا تقييم | نفسه |
| Placeholder injection (student.password, employee.private_notes, unknown.field, __class__) | PASS — 400 محتوى / 422 نشر قالب | نفسه + `test_template_versioning_validation_publish` |
| IDOR (مستخدم جهة ب على محتوى/معاينة/تحقق مراسلة أ) | PASS — 403 | `test_org_isolation` |
| Cross-organization access (قوالب/ترويسات/قوائم) | PASS — 403/400 ولا تسريب في القوائم | `test_org_isolation` |
| Mass assignment (status/official_number/organization_id/version على المراسلة؛ status/official_number عبر PATCH المحتوى) | PASS — تُتجاهل | `test_client_resolved_values_ignored`, `test_autosave_safety` |
| نشر قالب غير مصرح (DRAFTER في جهته / أدمن أ على ب) | PASS — 403 | `test_org_isolation` |
| تعديل ترويسة غير مصرح | PASS — 403 | نفسه |
| وصول غير مصرح للكيانات (VIEWER يبحث، ربط كيان غير موجود/غير مصرح، هاتف الطالب بلا صلاحية) | PASS — 403 / 404 / `[غير مصرح]` + حجب التقديم | `test_org_isolation`, `test_xss_and_injection` |
| Snapshot tampering (تعديل resolved_data في القاعدة) | PASS — verify=false، المعاينة 409، تدقيق SNAPSHOT_INTEGRITY_FAILED؛ لا API للتعديل | `test_snapshot_tampering_detected` |
| التلاعب بالقيم المحلولة من العميل | PASS — تُتجاهل، الحل من بيانات الجامعة | `test_client_resolved_values_ignored` |
| تعارض التحرير المتزامن | PASS — 409، سباق 1/6 | `test_optimistic_concurrency` |

## 9) تحقق التقديم (DRAFT→SUBMITTED) ✅ (`test_submission_validation_matrix`, `test_apply_template_blocked_after_submit`)
محجوب عند: غياب الكيان المطلوب · غياب المستلم · الموضوع فارغ · مدخل يدوي إلزامي فارغ · قسم إلزامي فارغ (حتى `<p></p>`) · عنصر نائب غير محلول/غير مصرح · إصدار قالب غير صالح · ترويسة غير متاحة أو موقوفة/محذوفة أو من جهة أخرى (أُضيف في البوابة) · عدم اختيار قالب. **غير محجوب**: حقول المستلم الاختيارية الفارغة (الصفة/الاسم) — التقديم ينجح والمعاينة بلا `{{`. (صفة المستلم ليست إلزامية بتصميم المرحلة — لا تُحجب إلا إذا طلب القالب ذلك مستقبلاً.)

## 10) سلامة الحفظ التلقائي ✅ (`test_autosave_safety` + الواجهة)
5 حفظات متتالية: الحالة تبقى DRAFT، لا رقم رسمي/تسلسل، لا لقطة، سجل الحالات لم يتغير · يحترم `content_version` (409 للأقدم ولا يكتب فوق الأحدث) · لا يتجاوز التفويض (جهة ب 403، VIEWER 403) · في الواجهة: الحفظ التلقائي يستخدم آخر إصدار معروف (`cvRef`)، وعند الفشل يبقى النص في المحرر مع مؤشر «تغييرات غير محفوظة» ورسالة الخطأ (409 يعيد التحميل بعد 0.8ث).

## 11) الأعداد النهائية
- Backend (pytest): **34 passed / 0 failed** — المرحلة 1: 17، المرحلة 2: 6، بوابة التحقق: 11 (`tests/test_correspondence_phase2_gate.py`).
- Frontend critical flows (وكيل الاختبار iteration_94 + تحقق ذاتي): **10 passed / 0 failed** (3 ملاحظات ثانوية أُصلحت: مؤشر الحفظ التلقائي، testIDs المستلم الخارجي، تكرار امتداد Underline).
- Security (البنود الـ13 أعلاه): **13 passed / 0 failed**.
- Integration (دورة حياة كاملة UI+API: قالب→كيان→مدخلات→تقديم→مراجعة→اعتماد→توقيع→إصدار→لقطة→معاينة مجمّدة؛ السيناريو F؛ المستوى 3→4): **4 passed / 0 failed**.
- مراسلة الاختبار `PRES-2026-000001`: محفوظة، لم تُحذف ولم يُعد استخدام رقمها، وُسمت بـ `metadata.test_generated=true` + حدث تدقيق `TEST_DATA_MARKED` (مُتحقق منه في الاختبار).

## 12) الملخص المعماري
- **الترويسات**: `correspondence_letterheads` {organization_id, code (فريد داخل الجهة), name_ar/en, header_config, footer_config, branding_config (أصول عبر Emergent Object Storage → `files` + `/api/files/{path}?auth=`), page_config (A4/هوامش/خط), is_default, is_active, version}. الوراثة: جهة → الأم → … → الجذر (`resolve_letterhead`). رفع الأصول PNG/JPG/SVG/WebP ≤2MB.
- **القوالب**: `correspondence_templates` (رأس: organization_id|null=عام, document_type_id, code, freeze_stage, status DRAFT/PUBLISHED/INACTIVE, current_version) + `correspondence_template_versions` (sections[] بأنواع 15 وأنماط تحرير LOCKED/SYSTEM/STRUCTURED/EDITABLE/DEFAULT_EDITABLE وشروط ظهور تصريحية، input_fields[], required_entities[], letterhead_id, is_published). النشر يثبّت الإصدار؛ التعديل = إصدار جديد؛ استنساخ؛ إيقاف لا يمس المراسلات.
- **المحتوى**: `correspondence_contents` {correspondence_id (فريد), template_id, template_version_id, letterhead_id/version, section_values (معقَّمة), input_values, content_version}. 
- **المحرر/المعاينة**: TipTap (RTL، محاذاة، قوائم، جداول، إدراج عناصر نائبة من السجل المسموح)، معاينة A4 (210×297مم بالهوامش وخط الترويسة) تُصيَّر من HTML الخادم (`/preview`) — القيم أو التسميات؛ تتكدس أسفل المحرر <1100px.
- **APIs** (prefix `/api/correspondence`): letterheads (GET/POST/PATCH, resolve, set-default, assets/{slot}) · templates (GET/POST, {id} GET, draft PUT, versions POST, validate, publish, deactivate, clone) · placeholders · entities/{kind} · {id}/apply-template · {id}/content GET/PATCH · {id}/preview?mode · {id}/snapshot/verify.
- **الصلاحيات الجديدة**: letterhead.{read,create,update,activate,set_default,manage_organization} · template.{read,create,update_draft,publish,deactivate,clone,manage_global,manage_organization,use} · entity.{student,employee,faculty}.read · placeholder.{contact,academic}.read — موزعة على الأدوار النظامية (SUPER/UNIVERSITY_ADMIN كاملة، ORGANIZATION_ADMIN إدارة جهته، DRAFTER/OFFICER/MANAGER استخدام فقط).
- **أحداث التدقيق**: LETTERHEAD_CREATED/UPDATED/ACTIVATED/DEFAULT_CHANGED · TEMPLATE_CREATED/UPDATED/VERSION_CREATED/VALIDATION_FAILED/PUBLISHED/DEACTIVATED/CLONED · CORRESPONDENCE_TEMPLATE_SELECTED · CORRESPONDENCE_CONTENT_UPDATED · PLACEHOLDER_RESOLVED · SNAPSHOT_CREATED · SNAPSHOT_INTEGRITY_FAILED · ACCESS_DENIED (+ أحداث المرحلة 1).

## 13) القيود المعروفة
1. بحث الكيانات (طلاب/موظفون/هيئة تدريس) على مستوى الجامعة لحامل الصلاحية — لا تقييد بكلية الكاتب (مقترح للمرحلة 3: تقييد النطاق بـ org_units الأكاديمية).
2. لا PDF نهائي ولا QR ولا توقيع/ختم (المرحلة 3).
3. `recipient.title` اختياري — لا يُلزم إلا إذا طلبه القالب (غير مدعوم بعد كخاصية قالب).
4. اللقطة تُنشأ عند مرحلة التجميد فقط؛ إن أُلغيت المراسلة قبلها لا لقطة (بالتصميم).
5. حقول `student.gpa/attendance_rate/warnings_count` تعتمد على مجموعات موجودة قد تكون فارغة في بيئة المعاينة (تُحل كفارغة ⇒ تحجب التقديم إن استُخدمت).
