# نظام إدارة الحضور - جامعة الأحقاف

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
