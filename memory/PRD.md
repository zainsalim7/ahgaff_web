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

- 2026-06-15 **إصلاح: فتح تفاصيل الطالب من البحث السريع (Quick Search)**:
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
