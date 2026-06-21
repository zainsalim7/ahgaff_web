# 📋 جدول اختبار الصلاحيات (72 صلاحية)

> **كيفية الاستخدام:** أنشئ مستخدماً تجريبياً، أزل كل صلاحياته، ثم امنحه صلاحية واحدة في المرة لاختبار تأثيرها.

---

## 🔧 طريقة الاختبار العملية
1. سجّل دخولاً كأدمن → أنشئ دوراً جديداً اسمه "اختبار" بلا أي صلاحية
2. أنشئ مستخدماً واسنده هذا الدور (مع تعيين قسم وكلية لتجنب fail-safe block)
3. سجّل خروج → سجّل دخول بالحساب التجريبي
4. لاحظ: لا تستطيع فتح أي صفحة (طبيعي — fail-safe يحجبه)
5. عُد للأدمن → امنح صلاحية واحدة فقط → سجّل دخول بالحساب التجريبي → اختبر النتيجة

---

## ⚠️ ملاحظات مهمة قبل الاختبار
- **الـ admin يتجاوز كل الصلاحيات** بتصميم — لا تختبر به
- **manage_X** هي umbrella: من له `manage_courses` يستطيع add/edit/delete كلها بدون الحاجة لصلاحيات منفصلة
- **الصلاحيات التفصيلية** (add/edit/delete_X) تعمل **بدون** الحاجة لـ manage_X
- بعض الصفحات تحتاج **fail-safe scope** أيضاً (مثل /students يحتاج للموظف قسم محدد)

---

## 📁 المستخدمون والأدوار
| الصلاحية | الاسم العربي | الصفحة/الإجراء |
|---|---|---|
| `manage_users` | إدارة المستخدمين | `/manage-users` (كامل) |
| `view_users` | عرض المستخدمين | `/manage-users` (قراءة فقط) |
| `add_user` | إضافة مستخدم | زر "+" في `/manage-users` |
| `edit_user` | تعديل مستخدم | تعديل صف في `/manage-users` |
| `delete_user` | حذف مستخدم | حذف صف في `/manage-users` |
| `reset_password` | إعادة تعيين كلمة المرور | في تفاصيل المستخدم |
| `manage_roles` | إدارة الأدوار | `/roles` |

## 📁 الطلاب
| الصلاحية | الإجراء |
|---|---|
| `manage_students` | `/students` كامل |
| `view_students` | `/students` للقراءة فقط |
| `add_student` | زر "+" |
| `edit_student` | تعديل |
| `delete_student` | حذف |
| `import_students` | استيراد Excel |

## 📁 المعلمون
| الصلاحية | الإجراء |
|---|---|
| `manage_teachers` | `/teachers` كامل |
| `view_teachers` | `/teachers` للقراءة فقط |
| `add_teacher` / `edit_teacher` / `delete_teacher` | الأزرار المعنية |

## 📁 المقررات
| الصلاحية | الإجراء |
|---|---|
| `manage_courses` | `/(tabs)/courses` كامل |
| `view_courses` | عرض فقط |
| `add_course` / `edit_course` / `delete_course` | الأزرار المعنية |

## 📁 الأقسام والكليات
| الصلاحية | الإجراء |
|---|---|
| `manage_departments` / `manage_faculties` | `/departments` `/faculties` كامل |
| `add_department` / `edit_department` / `delete_department` | الأزرار |
| `add_faculty` / `edit_faculty` / `delete_faculty` | الأزرار |

## 📁 المحاضرات والحضور
| الصلاحية | الإجراء |
|---|---|
| `manage_lectures` / `view_lectures` | داخل المقرر → تبويب المحاضرات |
| `add_lecture` / `edit_lecture` / `delete_lecture` | الأزرار |
| `generate_lectures` | زر "توليد المحاضرات" |
| `reschedule_lecture` | زر "إعادة جدولة" |
| `override_lecture_status` | تغيير حالة المحاضرة |
| `record_attendance` / `take_attendance` | تسجيل الحضور (تطبيق المدرس) |
| `view_attendance` / `edit_attendance` / `manage_attendance` | عرض/تعديل سجلات الحضور |

## 📁 التسجيل (Enrollments)
| الصلاحية | الإجراء |
|---|---|
| `manage_enrollments` | كامل |
| `view_enrollments` | عرض فقط |
| `add_enrollment` / `delete_enrollment` | تسجيل/إلغاء تسجيل طالب في مقرر |

## 📁 العبء التدريسي والخطة الدراسية
| الصلاحية | الإجراء |
|---|---|
| `manage_teaching_load` | `/teaching-load` كامل |
| `view_teaching_load` | عرض فقط |
| `cross_university_assignment` | إسناد أساتذة من خارج الكلية |
| `manage_curriculum` | `/curriculum` كامل |

## 📁 التقارير والإحصائيات
| الصلاحية | الإجراء |
|---|---|
| `view_reports` | `/reports` فتح الصفحة |
| `export_reports` | تصدير PDF |
| `view_statistics` | الإحصائيات الرئيسية |
| `report_attendance_overview` | تقرير الحضور الشامل |
| `report_absent_students` | تقرير المتغيبين |
| `report_warnings` | تقرير الإنذارات |
| `report_daily` | تقرير يومي |
| `report_student` | تقرير طالب فردي |
| `report_course` | تقرير مقرر |
| `report_teacher_workload` | نصاب المعلمين |
| `report_lesson_completion` | إنجاز الدروس |

## 📁 الأرشيف
| الصلاحية | الإجراء |
|---|---|
| `view_archive` | `/archive` |
| `search_archive` | البحث |
| `export_archive` | التصدير |

## 📁 النظام والإعدادات
| الصلاحية | الإجراء |
|---|---|
| `manage_settings` | `/settings` |
| `manage_semesters` | إدارة الفصول الدراسية |
| `send_notifications` | إرسال إشعار جماعي |
| `import_data` | استيراد بيانات |

---

## 🐛 كيفية الإبلاغ عن خلل في صلاحية

أبلغ بهذه الصيغة:
```
الصلاحية: <key>
الإجراء المتوقع: <ما المفترض حدوثه>
الإجراء الفعلي: <ما حدث فعلاً>
الصفحة/URL: <رابط>
الدور المختبَر: <اسم الدور>
```

مثال:
```
الصلاحية: edit_student
الإجراء المتوقع: المستخدم يستطيع تعديل بيانات طالب فقط
الإجراء الفعلي: زر "تعديل" غير ظاهر / يظهر 403 / يحذف بدلاً من يعدّل
الصفحة: /students
الدور: موظف_اختبار
```
