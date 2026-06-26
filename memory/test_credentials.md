# Test Credentials

## Admin
- Username: admin
- Password: admin123

## Dean
- Username: Salim
- Password: test1234  (تم إعادة التعيين 2026-06-20 لاختبار RBAC)

## Department Head
- Username: Saeed
- Password: test1234  (تم إعادة التعيين 2026-06-20 لاختبار RBAC)
- Department: الدراسات الإسلامية / كلية البنات

## View-Curriculum Test User (Added 2026-06-26)
- Username: view_curr_user
- Password: test1234
- Role: employee (with custom_permissions=['view_curriculum'])
- Faculty: كلية الشريعة والقانون · Department: الشريعة والقانون
- Purpose: اختبار ظهور رابط "الخطة الدراسية" في القائمة الجانبية لأي مستخدم يملك صلاحية view_curriculum فقط

## Teacher
- Username: teacher180156
- Password: teacher123

## Student (يدخل بأي من الخيارين)
- Username: 234   (رقم القيد)
- أو: AUB2501234   (الرقم المرجعي)
- Password: 234

## ملاحظة جديدة (2026-06-02):
الدخول الآن يدعم 3 طرق:
1. `username` (اسم المستخدم العادي)
2. `student_id` (رقم القيد) — إن كان فريداً
3. `reference_number` (الرقم المرجعي) — فريد دائماً

عند **تكرار رقم القيد**: يجب على الطالب استخدام **الرقم المرجعي**.

## Reference numbers لطلاب الاختبار (لاختبار الدخول بالرقم المرجعي):
- 1001 → AUB2501001
- 1002 → AUB2501002
- 1003 → AUB2501003
