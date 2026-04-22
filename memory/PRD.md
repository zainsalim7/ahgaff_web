# نظام إدارة الحضور - جامعة الأحقاف

## ما تم إنجازه - جلسة 22 أبريل 2026

### العبء التدريسي
- [x] جدول العبء التدريسي + بحث + RTL + مزامنة ثنائية
- [x] تقارير متقدمة (مقارنة + مقررات بدون معلم + معلمين بدون مقررات)
- [x] تصدير Excel/PDF

### الجدول الأسبوعي (Backend مكتمل)
- [x] إدارة القاعات CRUD (`/api/rooms`)
- [x] إعدادات الفترات الزمنية وأيام العمل (`/api/schedule-settings`)
- [x] تفضيلات المعلمين (`/api/teacher-preferences/{id}`)
- [x] خانات الجدول CRUD (`/api/weekly-schedule`)
- [x] كشف 4 أنواع تعارضات (شعبة/معلم/قاعة/تفضيلات)
- [x] التوليد شبه التلقائي (`/api/weekly-schedule/auto-generate`)
- [ ] **واجهة الجدول الأسبوعي (Frontend)** ← المهمة القادمة

### تحسينات عامة
- [x] صلاحيات المدير الكاملة
- [x] التسجيل التلقائي للطلاب عند إنشاء مقرر + زر "تسجيل تلقائي للكل"
- [x] حقل الساعات المعتمدة + شريط معلومات المقرر
- [x] إصلاح تقرير تأخر المعلمين + عرض مقررات المعلم

## المهام المعلقة
- [ ] **Frontend الجدول الأسبوعي** (P0)
- [ ] إرسال النتائج عبر الإشعارات (P1)
- [ ] تقسيم server.py (P2)

## Collections الجديدة
- `rooms`: القاعات (name, capacity, building, floor)
- `schedule_settings`: إعدادات (time_slots, working_days)
- `teacher_preferences`: تفضيلات المعلمين (unavailable_days, unavailable_slots, max_daily)
- `weekly_schedule`: خانات الجدول (day, slot_number, course_id, teacher_id, room_id, dept, level, section)

## بيانات الاختبار
- مدير: admin / admin123
- عميد: Salim / 123456
- معلم: teacher180156 / teacher123
