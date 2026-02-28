"""
Routes Package - مسارات API
تم استخراجها من server.py لتسهيل الصيانة والتطوير

الاستخدام المستقبلي في server.py:
    from routes import auth_router, users_router, ...
    app.include_router(auth_router.router, prefix="/api")

ملاحظة: حالياً الـ routes معرّفة في server.py
هذه الملفات جاهزة للتكامل في المستقبل
"""

# قائمة الملفات المتاحة:
# - auth.py: مسارات المصادقة (login, me)
# - users.py: إدارة المستخدمين
# - roles.py: إدارة الأدوار والصلاحيات
# - departments.py: إدارة الأقسام والكليات
# - students.py: إدارة الطلاب
# - teachers.py: إدارة المعلمين
# - courses.py: إدارة المقررات
# - lectures.py: إدارة المحاضرات
# - attendance.py: تسجيل ومتابعة الحضور
# - reports.py: التقارير والإحصائيات
# - notifications.py: الإشعارات
# - enrollments.py: تسجيل الطلاب في المقررات
# - semesters.py: إدارة الفصول الدراسية
# - settings.py: إعدادات النظام
# - deps.py: الدوال المشتركة والتبعيات
