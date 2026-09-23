# مواصفة تكامل «شعار إزاحة اليوم الدراسي» لتطبيقَي الطالب والمعلم

> الباكند جاهز ومُختبَر. هذه المواصفة موجّهة لوكيل/مطوّر التطبيقات (student-app / teacher-app).

## 1) النقطة الأساسية
`GET /api/day-shift/my-today` — تتطلب `Authorization: Bearer <token>` (طالب أو معلم).
- اختياري: `?date=YYYY-MM-DD` لعرض الشعار عند تصفح يوم آخر في «جدولي» (الافتراضي: اليوم بتوقيت اليمن).
- تُعيد `shifted:false` إن لم يكن **للمستخدم نفسه** محاضرات مُزاحة في ذلك اليوم (حتى لو كانت كلية أخرى مُزاحة).

### الرد عند وجود إزاحة
```json
{
  "shifted": true,
  "date": "2026-10-05",
  "offset_minutes": 120,
  "offset_label": "تأخير 2 ساعات",
  "old_first": "08:00",
  "new_first": "10:00",
  "new_last_end": "18:30",
  "reason": "تأخير رسمي بسبب الأحوال الجوية",
  "shift_id": "6ab3...",
  "my_lectures": [
    { "id": "...", "course_id": "...", "course_name": "عقيدة", "start_time": "10:00", "end_time": "11:30", "original_start_time": "08:00", "room": "ق3" }
  ]
}
```
### الرد بلا إزاحة
```json
{ "shifted": false, "date": "2026-10-05" }
```

## 2) حقول إضافية في `GET /api/lectures/today` (موجودة الآن)
كل محاضرة تحوي: `day_shifted: boolean` و `day_shift_offset: number` (بالدقائق) — لعرض شارة صغيرة «مؤخَّرة +120 د» بجانب وقت المحاضرة دون طلب إضافي.

## 3) السلوك المقترح في التطبيقات
- **الشاشة الرئيسية (طالب/معلم)**: استدعِ `my-today` مع `getToday()` وعند السحب للتحديث. إن `shifted=true` اعرض شعاراً برتقالياً أعلى قائمة «محاضرات اليوم»:
  - العنوان: `⏰ {offset_label} لبداية اليوم الدراسي`
  - السطر 2: `يبدأ اليوم {new_first} بدلاً من {old_first}` + `({reason})` إن وُجد
  - السطر 3: `محاضراتك: ` + `my_lectures.map(l => "${l.course_name} ${l.start_time}").join(" · ")`
- **تبويب «جدولي»**: عند تغيير اليوم استدعِ `my-today?date=` واعرض الشعار نفسه؛ وميّز المحاضرات ذات `day_shifted=true` بشارة «مؤخَّرة».
- **تخزين مؤقت**: خزّن آخر رد لليوم الحالي للعمل بلا اتصال (نفس آلية cache الموجودة لـ `/lectures/today`).
- **الاختفاء**: إن تراجع الأدمن عن الإزاحة يعود `shifted:false` تلقائياً — لا حالة محلية مطلوبة.
- إشعار Push بعنوان `⏰ تغيير مواعيد اليوم الدراسي` يُرسل من الباكند عند التنفيذ (نوع `reschedule`) — فتحه يوجّه للرئيسية.

## 4) اختبار سريع
```bash
TOKEN=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"username":"1001","password":"test1234"}' | jq -r .access_token)
curl -s $API/api/day-shift/my-today -H "Authorization: Bearer $TOKEN"
```
لإنشاء إزاحة تجريبية: من الويب الإداري → الجدول اليومي → «إزاحة اليوم الدراسي» (أو `POST /api/day-shift/apply` بحساب admin مع `{"date_from":"YYYY-MM-DD","new_start_time":"10:00","notify":false}`) ثم «تراجع» من شارة اليوم.
