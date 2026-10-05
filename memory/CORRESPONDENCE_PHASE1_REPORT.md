# تقرير تنفيذ المرحلة 1 — نظام المراسلات الرسمية (Correspondence Management System)

تاريخ: 2026-10-05 · الحالة: مكتمل ومختبر (Backend 17/17 pytest · Frontend 10/10 flows عبر وكيل الاختبار — iteration_93)

## 1) التقييم الفني قبل التنفيذ (البند 31)
| البند | النتيجة |
|---|---|
| A. المصادقة | JWT HS256 عبر `routes/deps.get_current_user` — أُعيد استخدامها كما هي |
| B. الأدوار/الصلاحيات | `roles` (نظامية/مخصصة) + `users.permissions/custom_permissions` + `models/permissions.py` — لا نطاق تنظيمي. نظام المراسلات يضيف طبقة RBAC بنطاق مستقلة دون المساس بالقديم |
| C. الهيكل التنظيمي | `org_units` (HR) هرمية `parent_id` + `type` + `code` + مزامنة مع faculties/departments — **أُعيد استخدامها كمصدر موحد** |
| D. الكيانات | `students`, `employees`(org_unit_id/user_id/teacher_id), `teachers`, `courses`, `semesters` — تُربط عبر `correspondence_entities` فقط |
| E. قاعدة البيانات | MongoDB (Motor) — فهارس فريدة + `find_one_and_update` ذري بدل FK/Transactions |
| F. المعاد استخدامه | JWT، `users`، `org_units`، `roles` (لم يُعدَّل)، `employees`، `activity_logs` (يبقى) |
| G. تعارضات | (1) `hr_correspondence` القديمة بقيت دون مساس (قرار المستخدم 2a). (2) اختلاف أسماء حقول `org_units` → تمت المعالجة بالتطبيع في طبقة API (`name→name_ar`, `type→organization_type`) دون إعادة تسمية أي حقل إنتاجي |
| تدقيق `admin` | حساب admin واحد فقط (`is_admin: True`، مدير النظام) + العمداء/رؤساء الأقسام بأدوار مستقلة (dean/department_head) → `role=admin` = SUPER_ADMIN + UNIVERSITY_WIDE مبرَّر. لا يُمنح SUPER_ADMIN لأي حساب آخر إلا من admin |

### تدقيق `org_units` (قبل الفهرس الفريد)
- المخطط الحالي: `name, type, parent_id, code, order, is_active, faculty_id?, department_id?, head_employee_id?, description, created_at, updated_at`
- التغييرات المضافة: حقل `name_en` اختياري فقط. لا إعادة تسمية/حذف.
- النتيجة: 7 وحدات · مكررة 0 · فارغة 0 · فروقات مسافات 0 · يتيمة 0 · حلقات 0 → **نظيف** → فهرس فريد جزئي `uniq_org_code` على `code` (string فقط) طُبِّق.
- في الإنتاج: التدقيق يعمل تلقائياً عند الإقلاع؛ إن وُجدت تعارضات **لا يُطبَّق الفهرس** ويُسجَّل تحذير، ويُعرض التقرير في `GET /api/correspondence/organizations/code-audit` وفي شريط صفحة الهيكل التنظيمي.

## 2) الملفات
**أُنشئت**
- `backend/backend/services/corr_policy.py` — خدمة التفويض المركزية (`CorrContext.can(permission, organizationId, resource)`, `visibility_filter()`, `orgs_with()`), الصلاحيات، بذور الأدوار.
- `backend/backend/routes/correspondence.py` — كل الـ APIs + محرك الترقيم + آلة الحالات + التدقيق + بذور/فهارس الإقلاع.
- `backend/backend/tests/test_correspondence_phase1.py` — 17 اختباراً.
- `frontend/src/services/corrAPI.ts`, `frontend/src/components/corr/CorrUI.tsx`, `CorrCreateModal.tsx`
- `frontend/app/corr-dashboard.tsx`, `corr-list.tsx`, `corr-details.tsx`, `corr-organizations.tsx`, `corr-document-types.tsx`, `corr-numbering.tsx`, `corr-roles.tsx`

**عُدِّلت**
- `backend/backend/server.py` — تسجيل الراوتر + استدعاء `correspondence_startup(db)` عند الإقلاع.
- `frontend/app/_layout.tsx` — تسجيل الشاشات. `frontend/src/components/SideMenu.tsx` — قسم "المراسلات الرسمية".

## 3) المجموعات (Collections)
**مضافة**: `org_memberships`, `org_membership_roles`, `corr_roles`, `document_types`, `numbering_schemes`, `document_sequences`, `correspondences`, `correspondence_recipients`, `correspondence_entities`, `correspondence_status_history`, `audit_logs`, `meta.org_code_audit`
**معاد استخدامها**: `org_units`, `users` (+ `employees/students/teachers/courses` كمراجع في `correspondence_entities`)

## 4) الفهارس والقيود الفريدة
- `org_units.code` فريد جزئي (string) — مشروط بنظافة التدقيق
- `org_memberships (user_id, organization_id)` فريد جزئي على `is_active: true` (يمنع العضوية النشطة المكررة)
- `org_membership_roles (membership_id, role_id)` فريد
- `corr_roles.code` فريد · `document_types (code, organization_id)` فريد
- `document_sequences (numbering_scheme_id, year)` فريد — أساس الترقيم الذري
- `correspondences.uuid` فريد · `correspondences.official_number` فريد جزئي (string فقط → المسودات بدون رقم لا تتعارض)
- فهارس بحث: `(organization_id,status)`, `(organization_id,numbering_year,sequence_number)`, `document_type_id`, `(created_by,status)`, `created_at`, `archived_at`, `recipient_user_ids`, `security_classification`, `priority`
- `audit_logs (entity_type, entity_id, created_at)`, `(user_id, created_at)`

## 5) الـ APIs (`/api/correspondence`)
- `GET meta`, `GET me`, `GET dashboard`
- `GET organizations`, `GET organizations/code-audit`, `POST organizations`, `PUT organizations/{id}`
- `GET/POST roles`, `PUT roles/{id}`
- `GET/POST memberships`, `PUT/DELETE memberships/{id}`, `GET users-lookup`
- `GET/POST document-types`, `PUT document-types/{id}`
- `GET/POST numbering-schemes`, `PUT numbering-schemes/{id}`
- `POST ""` (إنشاء مسودة), `GET ""` (قائمة مُرقَّمة الصفحات + فلاتر: organization/include_children/status/document_type/year/official_number/created_by/recipient_user/recipient_organization/priority/classification/date range/q/mine), `GET {id}` (ObjectId أو UUID), `PATCH {id}` (حقول مسموحة فقط + تحقق version), `DELETE {id}` (حذف منطقي للمسودات فقط)
- `POST {id}/recipients`, `DELETE {id}/recipients/{rid}`, `POST {id}/entities`, `DELETE {id}/entities/{eid}`
- الانتقالات: `POST {id}/submit|review|request-changes|approve|reject|reopen|sign|issue|archive|cancel`
- `GET {id}/history`, `GET {id}/audit`

## 6) الصلاحيات (23)
`correspondence.create/read/update_draft/delete_draft/submit/review/approve/reject/sign/issue/archive/cancel/view_archive/view_all_organization/view_child_organizations/read_confidential/read_highly_confidential`, `templates.manage`, `numbering.manage`, `organizations.manage`, `memberships.manage`, `permissions.manage`, `audit.view`
الأدوار النظامية (11): SUPER_ADMIN, UNIVERSITY_ADMIN, ORGANIZATION_ADMIN, CORRESPONDENCE_MANAGER, CORRESPONDENCE_OFFICER, DRAFTER, REVIEWER, APPROVER, SIGNER, ARCHIVIST, VIEWER — بدون منطق مُصلَّب؛ التفويض عبر الصلاحيات فقط. الأدوار قابلة للتعديل/الإضافة من الواجهة (SUPER_ADMIN يحتفظ بكل الصلاحيات دائماً).

### نموذج التقييم
`User + Membership(org, scope) + Role → permissions + Resource(org, classification, owner)`
- النطاقات: SELF (موارد المستخدم فقط)، ORGANIZATION، ORGANIZATION_AND_CHILDREN (أحفاد عبر شجرة `parent_id`)، UNIVERSITY_WIDE.
- `correspondence.read` وحدها = مراسلاتي (منشئ/مالك حالي/مستلم). `view_all_organization` = كل مراسلات النطاق. `view_child_organizations` يوسّع ORGANIZATION للأحفاد.
- التصنيف: CONFIDENTIAL يتطلب `read_confidential`، HIGHLY_CONFIDENTIAL يتطلب `read_highly_confidential` (المنشئ مستثنى). قابل للتوسع بقواعد تصريح لاحقاً.
- `role=admin` النظامي = SUPER_ADMIN بنطاق الجامعة (مدقق).

## 7) آلة الحالات
DRAFT→SUBMITTED (submit) · SUBMITTED→UNDER_REVIEW (review) · UNDER_REVIEW→APPROVED/CHANGES_REQUESTED/REJECTED · CHANGES_REQUESTED→DRAFT (reopen) · APPROVED→SIGNED · SIGNED→ISSUED · ISSUED→ARCHIVED/CANCELLED
- خدمة واحدة `transition_correspondence()`؛ لا يُقبل تعديل `status` من العميل (PATCH يتجاهله — مُختبر).
- التحديث مشروط بالحالة الأصلية (`update_one({_id, status: from})`) → يمنع الانتقال المزدوج المتزامن (409).
- request-changes/reject/cancel تتطلب سبباً. submit يتطلب مستلماً واحداً على الأقل.
- كل انتقال يُسجَّل في `correspondence_status_history` (دائم) + `audit_logs`.

## 8) محرك الترقيم
- المخطط: `prefix, separator, year_format(YYYY|YY), padding_length, reset_frequency(YEARLY|NEVER), pattern` (متغيرات `{prefix}{sep}{year}{seq}`) + `trigger_status` (ISSUED افتراضياً، أو SIGNED/APPROVED) — لا صيغة مُصلَّبة. أمثلة ممكنة: `DL-2026-000087`, `DL/2026/000087`, `AU-DL-26-0087`, `2026/DL/000087`.
- الحلّ: مخطط (منظمة+نوع) → مخطط عام للمنظمة → صعوداً في المنظمات الأم.
- **الذرية**: `document_sequences.find_one_and_update($inc, upsert, AFTER)` + فهرس فريد (scheme, year) + إعادة محاولة عند سباق upsert + فهرس فريد على `official_number`. لا `MAX+1`.
- لا يُولَّد رقم للمسودات؛ الإلغاء لا يُعيد الرقم (مُختبر: الرقم التالي بعد إلغاء = آخر+1).

## 9) التدقيق
`audit_logs`: user_id, organization_id, action, entity_type, entity_id, old_values, new_values, metadata, ip_address, user_agent, created_at.
أحداث: CORRESPONDENCE_CREATED, DRAFT_UPDATED, DRAFT_DELETED, RECIPIENT_ADDED/REMOVED, ENTITY_LINKED/UNLINKED, STATUS_*, NUMBER_GENERATED, SENSITIVE_READ (سري/سري للغاية), ACCESS_DENIED (محاولات 403), ORGANIZATION_/ROLE_/MEMBERSHIP_/DOCUMENT_TYPE_/NUMBERING_SCHEME_ CREATED/UPDATED. عرض السجل يتطلب `audit.view`.

## 10) الاختبارات
`pytest backend/backend/tests/test_correspondence_phase1.py` → **17 passed** (~20s):
المصادقة · منع الإنشاء للغرباء/VIEWER/خارج المنظمة · السيناريو A (دورة كاملة + الرقم 000001 + تاريخ 6 انتقالات + تدقيق) · انتقالات غير صالحة (409) ومحاولات اعتماد/توقيع/إصدار غير مصرح (403) · تقديم بدون مستلم (400) · السيناريو B تزامن 8 إصدارات بالتوازي = 8 أرقام فريدة متتالية · السيناريو C عزل تنظيمي (403 + ACCESS_DENIED مسجَّل + القوائم لا تسرّب) · نطاق الفروع · فرض التصنيف الأمني · السيناريو D إلغاء مع بقاء الرقم وعدم إعادة استخدامه · قيود الأرشفة · حذف منطقي للمسودات فقط · لوحة بالأرقام حسب النطاق · حراسة SUPER_ADMIN/الأدوار/الترقيم · فريدية الكود + منع الحلقات.
الواجهة: وكيل الاختبار — 10/10 تدفقات ناجحة (`/app/test_reports/iteration_93.json`).

## 11) اختبارات الأمان المنفذة
IDOR (قراءة مراسلة منظمة أخرى → 403) · تصعيد أفقي (مدير CSL يلغي مراسلة DL → 403) · تصعيد رأسي (DRAFTER يعتمد/يوقّع/يصدر → 403؛ منح SUPER_ADMIN من غير admin → 403) · تجاوز حدود المنظمة (إنشاء في منظمة خارج النطاق → 403) · تغيير حالة غير مصرح (PATCH status يُتجاهل) · أرقام مكررة (تزامن) · Mass assignment (official_number/status في PATCH تُتجاهل) · انتقالات غير صالحة (409).

## 12) مشكلات معروفة
- تحذير وحدة التحكم في RN-web "Unexpected text node" على صفحات corr-* (غير مرئي للمستخدم).
- رقائق الأدوار في نموذج العضوية تحتاج `force click` في Playwright (سلوك RN-web، تعمل للمستخدم).
- لا يوجد حذف لوحدات `org_units` من واجهة المراسلات (إيقاف فقط) — مقصود.

## 13) مؤجَّل للمرحلة 2
محرر الخطاب والقوالب/العناصر النائبة · الترويسات · PDF وQR والتحقق العام · التوقيع الإلكتروني والأختام · سلاسل اعتماد متعددة · المرفقات · الوارد/الخارجي · الإشعارات · لقطات المستند (snapshots) والإصدارات · بحث أرشيفي متقدم · ربط تطبيقات الطلاب/الأساتذة · إدارة التصاريح الأمنية (clearance) · تصدير سجل التدقيق.

## 14) توصيات معمارية قبل المتابعة
1. تحديد سياسة `trigger_status` الموحدة على مستوى الجامعة قبل بدء الإصدار الفعلي.
2. مزامنة `org_units` مع `faculties/departments` تبقى من شاشة HR (`/hr/org-units/sync-academic`) — يُنصح بتشغيلها قبل منح العضويات.
3. عند المرحلة 2 (لقطات المستند) اعتمد `uuid` كمرجع عام في QR، لا `_id`.
4. دمج `hr_correspondence` القديمة لاحقاً كـ "وارد" داخل النظام الجديد بدل الإبقاء على نظامين.
