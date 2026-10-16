# الدخول الموحّد (SSO) — تطبيق الأستاذ ⇄ منصة الأحقاف (المكتبة الرقمية)

> الهدف: الأستاذ يضغط «المكتبة» في تطبيق الأستاذ فتُفتح `https://platform.ahgaff.net/admin/repository` **مسجّلاً دخوله تلقائياً** بحسابه الجامعي (نفس اسم المستخدم في النظامين).
> الآلية: JWT قصير العمر (3 دقائق) موقّع بسر مشترك `SSO_SHARED_SECRET` بين الخادمين.

## الطرف 1 — باك إند الجامعة `api.ahgaff.net` ✅ منفّذ (`backend/sso_platform.py`)
`GET /api/sso/platform-token?redirect=/admin/repository` (Bearer token المستخدم)
```json
{ "token": "<JWT>", "expires_in": 180,
  "sso_url": "https://platform.ahgaff.net/sso?token=<JWT>&redirect=%2Fadmin%2Frepository" }
```
**JWT (HS256، السر: `SSO_SHARED_SECRET`)** — claims:
```
iss="api.ahgaff.net"  aud="platform.ahgaff.net"  sub=<username>  jti=<uuid hex>  iat  exp(+180s)
name, role (teacher|employee|admin|…), email, phone, teacher_record_id, department_id, faculty_id, redirect
```
- الطلاب (`role=student`) والحسابات المعطّلة تُرفض بـ `403`. بلا سر مهيأ: `503`.
- `redirect` يُقبل فقط إن بدأ بـ `/` (ولا يبدأ بـ `//`) وإلا يُستبدل بـ `/admin/repository`.
- متغيرات البيئة على خادم الجامعة: `SSO_SHARED_SECRET` (مهيأ)، `PLATFORM_URL` (افتراضي `https://platform.ahgaff.net`).

## الطرف 2 — منصة الأحقاف `platform.ahgaff.net` ⏳ المطلوب تنفيذه
### أ) Backend: `POST /api/auth/sso`
Body: `{ "token": "<JWT>", "device_fingerprint": "<fp>" }`
1. تحقق من JWT: التوقيع بـ `SSO_SHARED_SECRET` **نفسه** (HS256)، و`iss == "api.ahgaff.net"`، و`aud == "platform.ahgaff.net"`، و`exp`. وارفض أي `jti` استُعمل سابقاً (خزّنه 5 دقائق — منع إعادة الاستخدام).
2. ابحث عن المستخدم بـ `username == sub`. إن لم يوجد: أنشئه تلقائياً (name/role/email من الـ claims) أو ارفض `404` حسب سياستكم.
3. **ربط الجهاز**: لا تطبّق فحص `device_fingerprint` الصارم على دخول SSO (المستخدم موثّق أصلاً من نظام الجامعة الذي يطبّق ربط الجهاز بنفسه). إن أردتم التسجيل: سجّل البصمة إن لم تكن مسجّلة، ولا ترفض إن اختلفت.
4. أرجع نفس استجابة `/api/auth/login` (access_token + user).

مثال تحقق (Python / python-jose):
```python
from jose import jwt, JWTError
try:
    claims = jwt.decode(token, SSO_SHARED_SECRET, algorithms=["HS256"], audience="platform.ahgaff.net", issuer="api.ahgaff.net")
except JWTError:
    raise HTTPException(401, "رابط الدخول غير صالح أو منتهي")
if await redis.get(f"sso_jti:{claims['jti']}"): raise HTTPException(401, "رابط الدخول مستعمل")
await redis.setex(f"sso_jti:{claims['jti']}", 300, "1")
```

### ب) Web (Expo Router): صفحة `/sso`
تقرأ `token` و`redirect` من الرابط → تستدعي `POST /api/auth/sso` (مع `device_fingerprint` كما تفعل صفحة الدخول) → تخزّن الجلسة كما يفعل الدخول العادي → `router.replace(redirect || '/admin/repository')`.
عند الفشل: رسالة «انتهت صلاحية رابط الدخول» + زر يذهب لصفحة الدخول العادية.
> ملاحظة: الرابط `/sso` يعيد 200 حالياً (صفحة SPA عامة) — لا يوجد تنفيذ بعد.

## التطبيق (تطبيق الأستاذ) ✅ منفّذ
- زر «المكتبة» في الرئيسية → شاشة `library.tsx` → زر **فتح المكتبة**: يطلب `GET /api/sso/platform-token` ويفتح `sso_url` في المتصفح.
- Fallback: إن أعاد الخادم 404/501/503 يفتح `https://platform.ahgaff.net/admin/repository` بدخول عادي.

## أمن
- السر المشترك لا يُرسل أبداً للتطبيق؛ التطبيق يحمل الرمز الموقّع فقط.
- مدة الرمز 3 دقائق + `jti` لمرة واحدة.
- `redirect` يُقيَّد بمسارات داخلية تبدأ بـ `/`.
