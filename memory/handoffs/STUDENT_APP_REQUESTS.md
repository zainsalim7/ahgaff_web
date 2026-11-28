# 📝 تطبيق الطلاب — شاشة «طلباتي» (نماذج الطلاب + تبرير الغياب)

> الخادم جاهز على نفس الـ API (`https://api.ahgaff.net/api`) — كل الطلبات بترويسة `Authorization: Bearer <token>` لحساب الطالب.
> لا تكسر شاشة السندات المالية ولا زر «برر غيابك» الحالي؛ هذه شاشة إضافية.

## 1) قائمة النماذج المتاحة
`GET /student-requests/types` →
```json
{"items": [
  {"id": "absence_excuse", "kind": "absence_excuse", "name": "تبرير غياب", "description": "...", "fields": [], "require_attachment": true},
  {"id": "6b0a...", "kind": "form", "name": "إفادة قيد", "description": "لجهة العمل",
   "fields": [{"key": "f1", "label": "الجهة الموجه إليها", "type": "text", "required": true, "options": []},
              {"key": "f2", "label": "عدد النسخ", "type": "select", "required": true, "options": ["1","2","3"]}],
   "require_attachment": false, "attachment_label": ""}
]}
```
- النماذج تُضاف وتُعدّل من البوابة (لا تثبّتها في التطبيق)، وتظهر للطالب حسب كليته فقط.
- `kind = "absence_excuse"` ⇒ افتح **نفس شاشة تبرير الغياب الحالية** (`GET /absence-excuses/eligible` ثم `POST /absence-excuses`) بدون الحاجة لزر الغياب.
- `kind = "form"` ⇒ ابنِ النموذج ديناميكياً من `fields`:
  - `text` حقل سطر · `textarea` متعدد الأسطر · `number` لوحة أرقام · `date` منتقي تاريخ (أرسل `YYYY-MM-DD`) · `select` قائمة من `options`.
  - `required: true` ⇒ إلزامي (الخادم يتحقق أيضاً ويعيد رسالة عربية في `detail`).
  - `require_attachment` ⇒ مرفق إلزامي، ووصفه في `attachment_label`.

## 2) إرسال طلب
`POST /student-requests`
```json
{"type_id": "6b0a...", "values": {"f1": "وزارة التربية", "f2": "2"}, "notes": "اختياري",
 "attachments": [{"name": "card.jpg", "data_base64": "<base64 بدون أو مع data:...;base64,>"}]}
```
- حتى 3 مرفقات، كل ملف ≤ 5MB، الأنواع: JPG/PNG/WEBP/PDF.
- الرد: `{"id", "ref_no": "SR-2026-00001", "status": "pending", "message": "تم إرسال الطلب إلى مسجل الكلية"}`.
- الأخطاء: HTTP 400/404 مع `detail` عربي — اعرضه كما هو.

## 3) «طلباتي»
`GET /student-requests/my` → `items[]` بها: `id, ref_no, type_name, fields, values, status, status_ar, last_note, attachments[], created_at, history[]`.
- اعرض أيضاً طلبات تبرير الغياب من `GET /absence-excuses/my` في نفس القائمة (بعلامة «تبرير غياب»).
- الحالات وألوانها المقترحة: `pending` قيد المراجعة (برتقالي) · `needs_info` مطلوب استكمال (بني) · `approved` مقبول (أخضر) · `completed` منجز/جاهز للاستلام (أزرق) · `rejected` مرفوض (أحمر) · `cancelled` ملغى (رمادي).
- `last_note` = ملاحظة المسجل (سبب الرفض أو المطلوب استكماله) — اعرضها بوضوح.

## 4) إجراءات الطالب
- إلغاء (فقط `pending` أو `needs_info`): `POST /student-requests/{id}/cancel`
- استكمال (فقط `needs_info`): `POST /student-requests/{id}/reply` بجسم `{"values": {...}, "notes": "...", "attachments": [...]}` ⇒ يعود الطلب `pending`.
- تفاصيل: `GET /student-requests/{id}` · مرفق: `GET /student-requests/{id}/attachments/{idx}` (يعيد الملف).

## 5) الإشعارات
عند كل قرار يصل إشعار بـ `data = {"type": "student_request", "id": "<id>", "route": "/student-requests", "status": "..."}` ⇒ افتح تفاصيل الطلب.

## 6) اختبار سريع
1. من البوابة: «طلبات الطلاب» ← «النماذج وحقولها» ← أنشئ نموذجاً.
2. من التطبيق: قدّم الطلب ⇒ يظهر في البوابة «قيد المراجعة» ⇒ «طلب استكمال» ⇒ يصل إشعار ⇒ استكمل من التطبيق ⇒ «منجز».
