# 🎬 تطبيق المدرس — تبويب «الإنتاج المرئي» (عقدي · حجز الأستوديو · مسيرة التسجيل · مستحقاتي)

> نفس الـ API (`https://api.ahgaff.net/api`) وبترويسة `Authorization: Bearer <token>` لحساب المدرس.
> هذا التبويب **مستقل تماماً** عن المحاضرات والحضور والنصاب — لا تربطه بأي منها.
> **اعرض التبويب فقط إذا أعاد `GET /video-production/my/contracts` عنصراً واحداً على الأقل** (أي أن للمدرس عقداً معتمداً).

## 1) عقودي
`GET /video-production/my/contracts` →
```json
{"items": [{
  "id": "...", "ref_no": "VC-2026-0001", "status": "issued", "status_ar": "معتمد / ساري",
  "course_name": "رياضيات 1", "department_name": "...", "start_date": "2026-11-28", "end_date": "2027-01-27", "duration_days": 60,
  "lectures_required": 28, "teacher_accepted_at": null, "total_amount": 450000,
  "items": [{"key": "spec", "name": "توصيف المادة العلمية", "amount": 50000, "kind": "fixed", "status": "accepted", "status_ar": "مقبول", "accrued": 50000},
            {"key": "recording", "name": "التسجيل المرئي للمحاضرات", "amount": 250000, "kind": "recording", "accrued": 125000}],
  "payments": [{"amount": 100000, "date": "2026-12-10", "stage": "الدفعة 1", "note": "..."}],
  "progress": {"lectures_completed": 14, "lectures_required": 28, "lectures_published": 10, "percent": 50.0,
               "production_percent": 42.5, "accrued": 175000, "paid": 100000, "balance": 75000, "days_left": 30, "stalled": 1,
               "lectures": [{"lecture_no": 1, "title": "مقدمة", "parts_count": 2, "completed": true, "published": false,
                             "pct": 50.0, "parts": [{"id": "...", "part_no": 1, "status": "editing", "status_ar": "قيد المونتاج", "pct": 50.0, "materials_delivered": true, "stalled": null}]}]}
}],
 "settings": {"min_notice_hours": 2, "max_part_minutes": 60, "currency": "ريال يمني", "studios": [{"id": "...", "name": "أستوديو 1", "location": ""}],
              "steps": [{"key": "filmed", "name": "تم التصوير", "is_filming": true}, {"key": "editing", "name": "قيد المونتاج"}, {"key": "cloud", "name": "مرفوع للسحابة"}, {"key": "published", "name": "منشور على المنصة"}]}}
```
**الشاشة:**
- بطاقة لكل عقد: المقرر، والمهلة (`days_left`، أحمر إذا كانت سالبة = متأخر)، وشريطان:
  - **المحاضرات المكتملة** (`percent`) و«14 / 28 محاضرة».
  - **مؤشر الإنجاز في مراحل الإنتاج** (`production_percent`).
- **ما عليّ:** البنود (`items`) بحالتها، والمحاضرات المتبقية = `lectures_required - lectures_completed`.
- **ما لي:** المستحق `accrued` · المصروف `paid` · المتبقي `balance`، وقائمة الدفعات `payments`.
- قائمة المحاضرات `progress.lectures` وأجزاؤها بألوان المراحل.
- PDF العقد: `GET /video-production/contracts/{id}/pdf`.
- إذا كان `teacher_accepted_at = null` اعرض زر **«أوافق على بنود العقد»** ← `POST /video-production/my/contracts/{id}/accept`.

> قاعدة الاحتساب (للعرض فقط): تُحسب المحاضرة **مكتملة** عند تصوير جميع أجزائها **واستلام ملحقاتها** (النص والمصادر). مبلغ التسجيل يُستحق بالتناسب مع المكتمل، ويُصرف على دفعات.

## 2) طلب حجز تسجيل (نموذج تسجيل محاضرة في الأستوديو)
1. قبل الإرسال، اعرض الأستوديوهات المتاحة: `GET /video-production/availability?date=2026-12-01&start=10:00&minutes=30` → `{"studios": [...المتاح فقط], "end": "10:30"}`.
2. `POST /video-production/my/sessions`
```json
{"contract_id": "...", "lecture_no": 3, "lecture_title": "عنوان المحاضرة", "topic": "الموضوع حسب التوصيف",
 "parts_count": 2, "part_no": 1, "est_minutes": 30, "summary": "ملخص ما سيتم شرحه", "attachment_note": "الشرائح/المصادر",
 "teacher_notes": "", "studio_id": "<اختياري>", "date": "2026-12-01", "start": "10:00"}
```
- `est_minutes` لا يتجاوز `settings.max_part_minutes` (افتراضياً 60 دقيقة، ويُعدَّل من البوابة).
- **يجوز الطلب قبل الموعد بوقت قصير**، بشرط ألا يقل عن `settings.min_notice_hours` ساعة.
- الأخطاء تعود HTTP 400 مع `detail` عربي (أستوديو محجوز، مهلة قصيرة، جزء مكرر...). اعرضه كما هو.
- الطلب يصل لموظف الأستوديو الذي يؤكده، أو ينقله لأستوديو/وقت آخر، أو يعتذر مع اقتراح بديل.

## 3) حجوزاتي ومسيرة التسجيل
`GET /video-production/my/sessions` → `items[]`: `id, ref_no, lecture_no, lecture_title, part_no, parts_count, date, start, end, studio_id, status, status_ar, pct, stalled{reason,at}, materials_delivered, materials_note, links{step_key: url}, photographer_notes, history[]`.
- **المراحل ديناميكية** وتُعرَّف من البوابة. لا تثبّتها في التطبيق، بل خذها بالترتيب من `settings.steps`.
  - الخط الزمني = `requested` طلب حجز ← `confirmed` حجز مؤكد ← ثم `settings.steps` بالترتيب. أضف `rejected` مرفوض و`cancelled` ملغى كحالتين جانبيتين.
  - `pct` = مؤشر إنجاز الجزء (0–100). اعرضه كشريط بجانب المرحلة.
  - `links` روابط بعض المراحل (السحابة/المنصة...) مفتاحها `key` المرحلة. اعرض اسم المرحلة من `settings.steps`.
- اعرضها كخط زمني (stepper). إذا كان `stalled` غير فارغ اعرض **«متوقف: السبب»** بالأحمر.
- `history[].note` تتضمن ملاحظة الأستوديو (سبب الاعتذار/الموعد البديل).
- تفاصيل جزء: `GET /video-production/sessions/{id}` · PDF النموذج: `GET /video-production/sessions/{id}/pdf`.

## 4) إجراءات المدرس
- **إلغاء** (فقط `requested` أو `confirmed`): `POST /video-production/my/sessions/{id}/cancel` بجسم `{"note": "السبب"}`.
- **الملحقات/الملاحظات:** `PUT /video-production/my/sessions/{id}` بجسم `{"materials_note": "رابط الشرائح والمصادر...", "teacher_notes": "..."}`.
  - تأكيد الاستلام (`materials_delivered`) يتم من الأستوديو فقط. اعرض «📎 مستلمة» أو «بانتظار تسليم الملحقات».

## 5) الإشعارات
- `data.type = "video_session"` (`id` = الجزء، و`status`) ← افتح تفاصيل الجزء. يصل عند: تأكيد، أو نقل موعد، أو اعتذار، أو إلغاء، أو تم التصوير، أو نُشر، أو توقف.
- `data.type = "video_contract"` (`id` = العقد) ← افتح العقد. يصل عند: اعتماد العقد، أو إلغائه، أو صرف دفعة.

## 6) اختبار سريع
1. من البوابة: «الإنتاج المرئي» ← «الإعدادات»: أضف أستوديوهين ← «العقود»: أنشئ عقداً للمدرس ← «اعتماد وإصدار».
2. من التطبيق: يظهر التبويب ← وافق على البنود ← اطلب حجزاً.
3. من البوابة («الأستوديو ومسيرة التسجيل»): أكّد الحجز ← تم التصوير ← علّم «استُلمت الملحقات» ← ستزيد المحاضرات المكتملة والمستحق في التطبيق.
