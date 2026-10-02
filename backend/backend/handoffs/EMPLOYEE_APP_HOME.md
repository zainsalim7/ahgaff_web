# تصميم الرئيسة الجديدة لتطبيق الموظف/الأستاذ + دليل الـ APIs الكامل

> الرابط الأساسي (إنتاج): `https://api.ahgaff.net/api` · كل الطلبات بهيدر `Authorization: Bearer <token>` (توكن تسجيل دخول المستخدم نفسه).
> كل النقاط أدناه **منفَّذة ومختبرة** على الباكند. الملفات المكمّلة: `EMPLOYEE_APP_GEOFENCING.md`، `EMPLOYEE_APP_PRESENCE_SHIFTS.md`، `EMPLOYEE_APP_CORRECTION.md`، `APPS_FORCE_UPDATE.md`.

---

## 1) الفكرة العامة

- **الأستاذ**: يبقى أعلى الرئيسة كما هو (محاضراتي / مقرراتي / إحصائياته)، ويُستبدل عنصر «بوابة الموظف» بقسم عنوانه **«خدماتي كموظف»** يحوي شبكة الأيقونات أدناه مباشرة.
- **الموظف الإداري**: الرئيسة كلها = رأس الصفحة + شبكة الأيقونات + روابط ثانوية.
- **شرط الظهور**: `GET /hr/home/summary` → إذا `has_profile === false` (أستاذ لا ملف إداري له) **لا يُعرض القسم إطلاقاً** (لا رسالة، لا أيقونات).
- طلب واحد فقط لتغذية الرئيسة كلها: `GET /hr/home/summary` (كل العدّادات الحيّة تأتي منه).

---

## 2) مخطّط الشاشة (Wireframe)

```
┌──────────────────────────────────────────────────┐
│ ▓▓ رأس كحلي داكن #0f2440 (زوايا 20، ظل خفيف) ▓▓  │
│  الاسم الكامل                          [صورة/حرف] │
│  المسمى الوظيفي · الوحدة التنظيمية               │
│  📅 الأربعاء 30 سبتمبر 2026                       │
│  ┌──────────────────────────────────────────┐    │
│  │ ⏰ لم تسجّل حضورك بعد   [ 🕐 تسجيل حضور ] │    │  ← شريحة حالة الدوام اليوم
│  │ أو: ✅ حاضر 08:02 · الفترة الأساسية         │    │
│  │      [ 🏁 تسجيل انصراف ]                   │    │
│  └──────────────────────────────────────────┘    │
├──────────────────────────────────────────────────┤
│  خدماتي                                          │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ 🕐 دوامي      │  │ 🏖️ إجازاتي   │   عمودان في   │
│  │ حاضر 18 ·     │  │ رصيدك 21 يوم │   الجوال     │
│  │ متأخر 2       │  │ 1 معلّق  🔴   │              │
│  └──────────────┘  └──────────────┘              │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ 💰 راتبي      │  │ ✅ مهامي      │              │
│  │ [قريباً] باهت │  │ 3 مفتوحة     │              │
│  └──────────────┘  └──────────────┘              │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ 📢 تعاميم     │  │ ✉️ مراسلاتي   │              │
│  │ ومراسلات      │  │ إلى الإدارة   │              │
│  │ الإدارة  🔴2  │  │ 1 قيد المعالجة│              │
│  └──────────────┘  └──────────────┘              │
├──────────────────────────────────────────────────┤
│  روابط سريعة (صف أفقي صغير قابل للتمرير):        │
│  ملفي الإداري · بطاقتي · مستنداتي · تقييمي ·      │
│  خطاباتي · طلب تعديل بياناتي                      │
└──────────────────────────────────────────────────┘
```

---

## 3) نظام الألوان والأيقونات

| الأيقونة | اللون الأساسي | خلفية دائرة الأيقونة | Ionicons | المسار/الشاشة | العدّاد من `summary` |
|---|---|---|---|---|---|
| دوامي | `#16a34a` | `#dcfce7` | `time` | شاشة الدوام | `attendance.counts.present` · `late` |
| إجازاتي | `#1565c0` | `#dbeafe` | `calendar` | شاشة الإجازات | `leaves.remaining` يوم · شارة `leaves.pending` |
| راتبي (قريباً) | `#b45309` | `#fef3c7` | `cash` | **غير قابل للضغط** (opacity 0.55 + شارة «قريباً») | — |
| مهامي | `#7c3aed` | `#ede9fe` | `checkbox` | شاشة المهام | `tasks.open` · أحمر إن `tasks.overdue > 0` |
| تعاميم ومراسلات الإدارة | `#f97316` | `#ffedd5` | `megaphone` | التعاميم الواردة | شارة حمراء = `circulars.unacknowledged` |
| مراسلاتي إلى الإدارة | `#0284c7` | `#e0f2fe` | `mail` | مراسلاتي + زر «+ جديدة» | `messages.open` قيد المعالجة · شارة إن `messages.replied > 0` |

- رأس الصفحة: خلفية `#0f2440`، نص أبيض، نص ثانوي `rgba(255,255,255,0.8)`.
- خلفية الشاشة `#f1f5f9`، البطاقات بيضاء، زوايا 16، ظل `0 2px 6px rgba(0,0,0,0.05)`.
- بطاقة الأيقونة: ارتفاع ~120، دائرة أيقونة 48px، اسم الخدمة 14 عريض `#0f172a`، السطر الفرعي 11.5 `#64748b`.
- حالة الدوام في الرأس: شريحة زجاجية `rgba(255,255,255,0.12)` بحدّ `rgba(255,255,255,0.25)`؛ زر الحضور أخضر `#16a34a`، زر الانصراف `#fff` بنص `#0f2440`.
- الشارات الحمراء (`#ef4444`) دائرية في الزاوية العلوية اليسرى للبطاقة (RTL).
- حركات: ظهور البطاقات متدرّج (delay 40ms لكل بطاقة)، ضغطة = scale 0.97.

---

## 4) الـ APIs

### 4.1 ملخّص الرئيسة (طلب واحد)
`GET /hr/home/summary`
```json
{
  "has_profile": true,
  "profile": {"id": "…", "full_name": "موظف تجريبي", "job_title": "أخصائي موارد بشرية", "employee_no": "EMP-100", "org_unit_name": "رئاسة الجامعة", "photo_url": ""},
  "attendance": {
    "date": "2026-09-30", "day_name": "الأربعاء", "is_work_day": true, "holiday": "", "on_leave": null,
    "today": null,                       // أو سجل اليوم: {check_in, check_out, status, status_label, late_minutes, shift_name, auto_checkout, check_in_geo, …}
    "can_check_in": true, "can_check_out": false,
    "multi_shift": false, "next_shift": {"id": "main", "name": "الدوام الأساسي", "work_start": "08:00", "work_end": "14:00"},
    "counts": {"present": 18, "late": 2, "half_day": 0, "absent": 0, "excused": 0, "leave": 1, "mission": 0, "holiday": 0},
    "late_minutes": 35
  },
  "leaves": {"remaining": 21, "entitlement": 25, "used": 4, "pending": 1},
  "tasks": {"open": 3, "overdue": 1},
  "circulars": {"total": 6, "unacknowledged": 2, "urgent": 0},
  "messages": {"total": 4, "open": 1, "replied": 1}
}
```
- `has_profile: false` → أخفِ قسم الموظفين بالكامل.
- عرض شريحة الرأس:
  - `!is_work_day` → «عطلة — {holiday || 'عطلة أسبوعية'}» بلا أزرار.
  - `on_leave` → «أنت في إجازة {on_leave}» بلا أزرار.
  - `today == null && can_check_in` → «لم تسجّل حضورك بعد» + زر حضور (اسم الفترة من `next_shift.name` إن `multi_shift`).
  - `today && !today.check_out` → «✅ {today.status_label} {today.check_in}» + زر انصراف إن `can_check_out`.
  - `today.check_out` → «انصراف {today.check_out}» + شارة «تلقائي» إن `today.auto_checkout`.

### 4.2 دوامي (شاشة كاملة)
- `GET /hr/attendance/my?month=YYYY-MM` — يعيد كل ما في 4.1 + `records[]` للشهر (`date, status, status_label, check_in, check_out, late_minutes, note, source, shift_name, auto_checkout, check_in_geo, check_out_geo`) + `today_shifts[]` + `correction{}` + `geofence{}` + `settings{}`.
- `POST /hr/attendance/check-in` / `POST /hr/attendance/check-out` — body اختياري `{latitude, longitude, accuracy, location_id, shift_id, correction}` (التفاصيل في GEOFENCING و CORRECTION).
- **الانصراف التلقائي**: إن لم يسجّل الموظف انصرافه، يُصرِّفه النظام بعد مهلة تحددها الإدارة → `auto_checkout: true`, `check_out_source: "auto"`, `check_out_geo.status = "auto"` (أضيفوا هذا الـ status لخريطة الألوان)، و`note` يحوي الوقت وآخر موقع معروف. اعرضوا شارة **«انصراف تلقائي»**.
- التصميم: بطاقة اليوم في الأعلى (نفس شريحة الرأس مكبّرة + الورديات إن `multi_shift` + أزرار التصحيح)، ثم عدّادات الشهر (حاضر/متأخر/غائب/إجازة + مجموع التأخير)، ثم قائمة يوم-بيوم مع منتقي شهر (◂ سبتمبر 2026 ▸).

### 4.3 إجازاتي
- `GET /hr/leaves/my?year=2026` → `{profile, balance: {entitlement, carried_over, used, pending, remaining}, requests: [...], team_pending: [...]}`.
- `POST /hr/leaves/my` body: `{type, start_date, end_date, reason?, substitute_employee_id?, contact_during_leave?}`.
  - `type`: `annual` سنوية · `sick` مرضية · `emergency` اضطرارية · `unpaid` بدون راتب · `maternity` وضع/أمومة · (باقي الأنواع من `GET /hr/leaves/meta`).
- `POST /hr/leaves/{id}/cancel` — إلغاء طلب معلّق.
- `team_pending` غير فارغ = الموظف مدير مباشر → أظهر قسم «طلبات فريقك» مع `POST /hr/leaves/{id}/decide {action: "approve"|"reject", note}`.
- حالات الطلب: `pending` (بانتظار المدير) `#f97316` · `hr_pending` (بانتظار HR) `#0284c7` · `approved` `#16a34a` · `rejected` `#dc2626` · `cancelled` `#64748b`.

### 4.4 راتبي
- **لا يوجد API** — أيقونة «قريباً» فقط، غير قابلة للضغط.

### 4.5 مهامي
- `GET /hr/tasks?view=mine&status=open,in_progress` → `{items: [{id, title, description, priority, priority_label, status, status_label, due_date, overdue, progress, assigner_name, updates[]}], stats: {open, overdue, done, due_week}}`.
- `POST /hr/tasks/{id}/progress` body: `{progress: 0-100, status?: "in_progress"|"done", note?}`.
- الحالات: `open` جديدة · `in_progress` قيد التنفيذ · `done` مُنجزة · `cancelled` ملغاة. الأولوية: `low/normal/high/urgent`.

### 4.6 تعاميم ومراسلات الإدارة (وارد من الإدارة إلى الموظف)
- `GET /hr/correspondence/my` → `{items: [{id, ref_no, subject, body, direction ("internal"|"circular"), direction_label, priority, priority_label, date, from_party, attachment_url, acknowledged}]}`.
- `POST /hr/correspondence/{id}/ack` — تأكيد الاستلام (الشارة الحمراء = عدد `acknowledged === false`).
- تصميم القائمة: تبويبان «الكل / غير المؤكَّدة»، كل عنصر: شارة النوع (تعميم برتقالي `#f97316` · مذكرة `#0f766e`)، الموضوع، `ref_no · date`، شارة «عاجلة» إن `priority === "urgent"`، وزر «تأكيد الاستلام» أو ✓.

### 4.7 مراسلاتي إلى الإدارة (من الموظف إلى شؤون الموظفين) — جديد
- `GET /hr/correspondence/my/sent`
```json
{"profile": {...}, "categories": {"request": "طلب", "complaint": "شكوى", "inquiry": "استفسار", "suggestion": "اقتراح"},
 "stats": {"total": 4, "open": 1, "replied": 1, "closed": 2},
 "items": [{"id": "…", "ref_no": "HR-EMP-2026-0001", "subject": "طلب شهادة راتب", "body": "…", "category": "request", "category_label": "طلب",
            "priority": "normal", "status": "replied", "employee_status_label": "تم الرد", "date": "2026-09-30", "created_at": "…",
            "has_attachment": true, "attachment_name": "a.pdf", "replies_count": 1,
            "replies": [{"body": "تم إصدار الشهادة، استلمها من مكتب شؤون الموظفين", "by_name": "مدير النظام", "at": "2026-09-30T20:15:00"}]}]}
```
- `POST /hr/correspondence/my/send` — **multipart/form-data**:
  - `subject` (مطلوب) · `category` = `request|complaint|inquiry|suggestion` · `body` · `priority` = `normal|urgent` · `file` اختياري (PDF / JPG / PNG / WEBP / DOC / DOCX ≤ 8MB).
  - الرد: `{"id", "ref_no": "HR-EMP-2026-0001", "message": "تم إرسال مراسلتك برقم HR-EMP-2026-0001"}` — يُشعَر مسؤولو المراسلات فوراً.
- `GET /hr/correspondence/{id}/attachment` — يعيد الملف نفسه (يحتاج التوكن؛ ليس رابطاً عاماً).
- الحالات كما تُعرض للموظف (`employee_status_label`): `registered` **جديدة** `#0284c7` · `in_progress` **قيد المعالجة** `#f97316` · `replied` **تم الرد** `#16a34a` · `closed` **مغلقة** `#64748b`.
- التصميم: زر «+ مراسلة جديدة» ثابت أسفل الشاشة؛ نموذج: نوع (4 شرائح قابلة للاختيار)، الموضوع، النص، مفتاح «عاجلة»، إرفاق ملف؛ قائمة المراسلات مع شارة الحالة، وعند الفتح تظهر الردود كفقاعات محادثة (ردود الإدارة بلون `#e0f2fe`).

### 4.8 الروابط الثانوية
| الرابط | API |
|---|---|
| ملفي الإداري | `GET /hr/employees/me` → `{profile: {...كل البيانات الوظيفية والشخصية, status_label, alerts[]}}` |
| بطاقتي الرقمية | `GET /hr/employees/me/card` (+ `POST /hr/employees/me/photo` لرفع صورة تحتاج اعتماد) |
| مستنداتي | `GET /hr/documents/my` · الملف: `GET /hr/documents/file/{id}` |
| تقييمي السنوي | `GET /hr/appraisals/my` |
| خطاباتي الرسمية | `GET /hr/letters/my` · `POST /hr/letters/my` · `GET /hr/letters/{id}/pdf` |
| طلب تعديل بياناتي | `GET/POST /hr/profile-requests/my` · `POST /{id}/cancel` |

---

## 5) الإشعارات (FCM + داخل التطبيق)
- `GET /notifications` — كل إشعار يحوي `type` و`data` إضافية:
  - `type: "hr_correspondence"` + `correspondence_id` → افتح المراسلة: إن كانت في `my/sent` فهي ردّ/تغيير حالة من الإدارة، وإلا فهي تعميم/مذكرة في `my`.
  - `type: "hr"` عام (إجازة اعتُمدت/رُفضت، مهمة جديدة، …) → افتح الشاشة المناسبة حسب النص أو الرئيسة.
  - `presence_check` → راجع `EMPLOYEE_APP_PRESENCE_SHIFTS.md` (تأكيد التواجد بالبصمة + GPS).
- التحديث الإجباري للتطبيق: `APPS_FORCE_UPDATE.md`.

---

## 6) ملاحظات تنفيذية
1. جلب `summary` عند فتح الرئيسة وعند العودة إليها (focus) وبعد أي حضور/انصراف/إرسال مراسلة.
2. كل نقاط `/my` تعمل بنفس التوكن دون صلاحيات إضافية؛ إن رجعت `404 لا يوجد ملف إداري مرتبط بحسابك` فهذا يعادل `has_profile: false`.
3. الأخطاء دائماً `{"detail": "نص عربي جاهز للعرض"}` — اعرضوه كما هو.
4. الأوقات بصيغة `HH:MM` والتواريخ `YYYY-MM-DD` بتوقيت اليمن.
5. حساب تجريبي للاختبار: `EMP-100 / EMP-100` (موظف) · `EMP-200 / EMP-200` (مدير مباشر يرى طلبات فريقه).

---

## 7) 📸 صورة البطاقة بعد الاعتماد — تصحيح مهم (2026-10-01)
- `GET /hr/employees/me/card` → `photo_url` أصبح يُبنى على **مضيف الـ API الذي طلبت منه** (مثل `https://api.ahgaff.net/api/hr/public/employee-photo/{token}?v=…`) بدل نطاق التحقق `ahgaff.net` الذي يعيد صفحة HTML (كان هذا سبب عدم ظهور الصورة في التطبيق).
- الرابط عام (لا يحتاج توكن) ويحمل معامل `?v=` يتغيّر مع كل اعتماد جديد → **استخدم `photo_url` كما هو** حرفياً (لا تبنِه يدوياً) حتى يتجاوز الكاش.
- أعِد جلب `me/card` عند فتح شاشة البطاقة وعند وصول إشعار `type: "hr_photo"` (اعتماد/رفض).
- الحقول: `has_photo` (معتمدة) · `pending_photo` (بانتظار الاعتماد — اعرض «قيد المراجعة») · `can_upload_photo` · `photo_approved_at`.

## 8) 🏖️ أرصدة الإجازات لكل نوع (2026-10-02)
- `GET /hr/leaves/my` أصبح يعيد إضافةً إلى `balance` (السنوية): `balances[]` = `[{type, type_label, color, entitlement, carried_over, used, pending, remaining, unlimited}]` لكل نوع له رصيد محدد لفئة الموظف (سنوية/مرضية/اضطرارية… حسب إعدادات الإدارة). اعرضها كشرائح تحت الرصيد السنوي.
- `GET /hr/leaves/meta` → `types` (المفعّلة فقط) + `type_defs[]` (name, color, deducts_balance, requires_attachment, paid) — استخدم `requires_attachment` لإظهار حقل المرفق، و`deducts_balance` لعرض الرصيد المتبقي بجانب النوع في نموذج الطلب.
- `GET /hr/home/summary` → `leaves.remaining` ما زال رصيد السنوية.
