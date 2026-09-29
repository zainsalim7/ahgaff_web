# لوكيلَي تطبيق الطالب وتطبيق الأستاذ — التحديث الإجباري

> نقطة عامة (بلا توكن): `GET https://api.ahgaff.net/api/app-version/{app}?current={الإصدار الحالي}` حيث `app` = `student` أو `teacher`.
> الإدارة تضبط القيم من لوحة الإدارة → «إعدادات تحديث التطبيقات».

## الطلب
```
GET /api/app-version/teacher?current=2.0.5
```
`current` = إصدار التطبيق المثبَّت (من `expo-constants` → `Constants.expoConfig.version` أو `Application.nativeApplicationVersion`). يقبل `v2.0.5` أيضاً.

## الرد
```json
{
  "app": "teacher", "app_label": "تطبيق الأستاذ",
  "min_supported_version": "2.1.0",
  "latest_version": "2.2.0",
  "ios_url": "https://apps.apple.com/app/id123",
  "android_url": "https://play.google.com/store/apps/details?id=net.ahgaff.teacher",
  "message": "يرجى تحديث تطبيق الأستاذ للمتابعة",
  "force_enabled": true,
  "force_update": true,          // current < min_supported_version && force_enabled  → شاشة حجب
  "update_available": true,      // current < latest_version                          → تنبيه قابل للتجاوز
  "current_version": "2.0.5",
  "security": {"offline_window_hours": 12, "lecture_window_check": true, "patch": "attendance-time-guard-v1"},
  "server_time": "2026-09-29T20:05:00+03:00",
  "updated_at": "2026-09-29T17:05:00+00:00"
}
```
> الحقول القديمة `min_supported_version` و`latest_version` و`security` بقيت كما هي — التوافق كامل مع النسخ الحالية.

## السلوك المطلوب في التطبيق
1. عند الإقلاع (وعند الرجوع للمقدمة بعد فترة) استدعِ النقطة مع `current`. عند فشل الشبكة تجاوز الفحص ولا تحجب.
2. `force_update == true` → شاشة كاملة غير قابلة للإغلاق: `message` + زر «تحديث الآن» يفتح `ios_url` على iOS و`android_url` على Android (إن كان الرابط فارغاً افتح صفحة المتجر العامة أو أخفِ الزر). لا تسمح بالمتابعة.
3. `force_update == false && update_available == true` → تنبيه بسيط قابل للتجاوز («لاحقاً» / «تحديث») — أظهره مرة واحدة لكل إصدار.
4. لا تقارن الإصدارات محلياً؛ اعتمد على `force_update` و`update_available` من الباكند.
