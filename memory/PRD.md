# نظام إدارة الحضور - جامعة الأحقاف

## المتطلبات الأساسية
- تطبيق ويب إداري كامل مع نظام صلاحيات دقيق (RBAC)
- إدارة الكليات والأقسام والمقررات والمعلمين والطلاب
- جدولة المحاضرات وإعادة الجدولة وكشف التعارضات
- أداء سريع: حالة فارغة افتراضياً + ترقيم صفحات (10/صفحة)
- حظر وصول المعلمين والطلاب لتطبيق الويب (موبايل فقط)
- واجهة عربية حديثة ونظيفة وبديهية

## البنية التقنية
- **Backend**: FastAPI + MongoDB Atlas
- **Frontend**: React Native Web (Expo)
- **Auth**: JWT + RBAC دقيق
- **Deployment**: Railway (production)

## ما تم إنجازه

### جلسة 15 أبريل 2026
- [x] ميزة جدول العبء التدريسي (Teaching Load Management)
  - Backend route: `/app/backend/backend/routes/teaching_load.py`
  - Collection: `teaching_loads` في MongoDB
  - CRUD Endpoints: GET/POST/PUT/DELETE `/api/teaching-load`
  - Bulk save: `POST /api/teaching-load/bulk`
  - Teacher courses: `GET /api/teaching-load/teacher/{id}/courses`
  - Frontend: صفحة `/teaching-load` (تعيين الساعات + عرض الجدول)
  - صلاحيات: `MANAGE_TEACHING_LOAD`, `VIEW_TEACHING_LOAD`
- [x] تصدير العبء التدريسي Excel و PDF
  - `GET /api/export/teaching-load/excel` - تصدير Excel
  - `GET /api/export/teaching-load/pdf` - تصدير PDF (خط Amiri عربي)
  - دعم فلترة بالقسم + فترة زمنية (تاريخ بداية/نهاية)
  - حساب إجمالي الساعات = ساعات أسبوعية × عدد الأسابيع
  - بدون تحديد فترة: يُحسب على أساس فصل دراسي (16 أسبوع)
  - واجهة تصدير مع اختيار التواريخ في تبويب "عرض الجدول"
- [x] إصلاح خطأ تعريف متغير مكرر في `take-attendance.tsx`

### جلسة 9 أبريل 2026
- [x] إضافة عمود "الشعبة" في قالب استيراد المحاضرات Excel
- [x] استيراد الطلاب + التسجيل التلقائي في المقررات
- [x] إصلاح نافذة تعديل الحضور (attendance_edit_minutes)
- [x] إصلاح عدم تحديث شعبة الطالب عند النقل

### جلسة 8 أبريل 2026
- [x] إصلاحات عرض المقررات، التحديد المتعدد، نقل الطلاب
- [x] تحسين كشف تعارض المحاضرات

### جلسات سابقة
- [x] نظام RBAC شامل (78 endpoint)
- [x] كشف تعارضات المحاضرات
- [x] توليد شُعب المقررات تلقائياً

## المهام المعلقة
- [ ] (P1) تقسيم server.py (11000+ سطر) إلى routes/ منفصلة
- [ ] (P2) تقارير العبء التدريسي المتقدمة (رسوم بيانية)
- [ ] (P3) تحسين واجهة التقارير الأخرى
- [ ] تحسينات سجلات النشاط

## بيانات الاختبار
- مدير النظام: `admin` / `admin123`
- عميد: `Salim` / `123456`
- معلم: `teacher180156` / `teacher123`
