# إصلاح عاجل لوكيل تطبيق الموظفين — معرّف الجهاز غير ثابت (`DEV-…`) يُفشل التحضير

> الباكند: `https://api.ahgaff.net/api` · التحضير `POST /hr/attendance/check-in` و`/check-out` بهيدر `Authorization: Bearer <token>`.

## المشكلة المرصودة على الإنتاج (2026-10-15)
| الموظف | الجهاز المسجّل (أول تحضير) | محاولات مرفوضة لاحقاً |
|---|---|---|
| د. حامد السقاف | `DEV-4jg4y3pj4f9muw8em7b` (06-10) — حضّر به حتى 07-10 | `DEV-iac43d4ly5smv4smk82` (12-10) ×4 |
| زين سالم بن عقيل | `306FD7C4-46DD-4404-8D9C-FB85ECF41C10` (iOS identifierForVendor، 05-10) | `DEV-az4psnyye9bmv9cqoib` (15-10) ×3 |

**الاستنتاج**: التطبيق يرسل أحياناً معرّفاً احتياطياً عشوائياً يبدأ بـ `DEV-` بدل معرّف الجهاز الأصلي، وهذا المعرّف **لا يُحفظ بشكل دائم** (يتغيّر بعد التحديث/إعادة التشغيل/مسح البيانات) — فيرفضه الباكند لأنه يختلف عن المسجّل. في حالة iOS نجح المعرّف الأصلي أولاً ثم فشلت قراءته لاحقاً فعاد التطبيق للاحتياطي العشوائي.

الباكند يعمل كما صُمّم: `device_id` مختلف ⇒ `403` + تنبيه HR. **الإصلاح مطلوب في التطبيق.**

## المطلوب (إلزامي)
1. **معرّف ثابت واحد لكل تثبيت، لا يتغيّر أبداً خلال عمر التطبيق على الجهاز**:
   - Android: `Application.getAndroidId()` من `expo-application` (ثابت لكل جهاز/مستخدم).
   - iOS: `await Application.getIosIdForVendorAsync()` (ثابت ما دام تطبيق واحد من المطوّر مثبتاً).
   - احتياطي (فقط إن أعاد الأعلى `null`): **UUID يُولَّد مرة واحدة ويُحفظ في `expo-secure-store`** (Keychain/Keystore — يصمد بعد تحديثات التطبيق، وعلى iOS يصمد غالباً حتى بعد إعادة التثبيت).
2. **ترتيب القراءة**: SecureStore أولاً (إن وُجد معرّف محفوظ فاستخدمه دائماً) → وإلا اقرأ المعرّف الأصلي → وإلا ولّد UUID — **ثم احفظ الناتج في SecureStore** في كل الحالات. هكذا لا يتغيّر المعرّف حتى لو فشلت قراءة المعرّف الأصلي في تشغيل لاحق.
3. **لا تولّد معرّفاً جديداً في كل تشغيل/طلب** ولا تستخدم `AsyncStorage` وحده (يُمسح مع بيانات التطبيق) ولا `Math.random()` دون حفظ.
4. أرسل `device_name` دائماً (مثل `${Device.brand} ${Device.modelName}`) لمساعدة HR على التمييز.
5. عند استلام `403` من التحضير اعرض `detail` كما هو — الباكند صار يُنشئ **طلب تغيير جهاز تلقائياً** (انظر أدناه) فلا داعي لإجبار الموظف على طلب يدوي، لكن أبقِ زر «طلب تغيير الجهاز» (`POST /hr/attendance/devices/my/change-request`) للحالات الأخرى.

## كود مرجعي (TypeScript / Expo)
```ts
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const KEY = 'ahgaff_device_id_v1';
let cached: string | null = null;

export async function getStableDeviceId(): Promise<string> {
  if (cached) return cached;
  const saved = await SecureStore.getItemAsync(KEY);
  if (saved) return (cached = saved);
  let id: string | null = null;
  try {
    id = Platform.OS === 'android' ? Application.getAndroidId() : await Application.getIosIdForVendorAsync();
  } catch {}
  if (!id) id = `UUID-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  await SecureStore.setItemAsync(KEY, id, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
  return (cached = id);
}

export const getDeviceName = () => `${Device.brand ?? ''} ${Device.modelName ?? ''}`.trim() || Platform.OS;
```
الاستخدام: `api.post('/hr/attendance/check-in', { latitude, longitude, accuracy, device_id: await getStableDeviceId(), device_name: getDeviceName() })`.

> ملاحظة انتقالية: الموظفون المسجّلون حالياً بمعرّف `DEV-…` سيُرفضون مرة واحدة بعد التحديث (لأن المعرّف الجديد الثابت يختلف) → سيُنشأ طلب تغيير جهاز تلقائياً وتوافق عليه HR بنقرة، وبعدها يستقر الوضع نهائياً.

## ما تغيّر في الباكند (2026-10-15) — لا يحتاج تعديلاً منك لكن اعرف سلوكه
- عند رفض تحضير من جهاز مختلف (`403`) يُنشئ الباكند تلقائياً **طلب تغيير جهاز** `source: "auto"` بالمعرّف الجديد (أو يحدّث الطلب المعلّق بآخر معرّف حاول منه الموظف) ويُنبّه HR. رسالة الـ`detail`:
  - أول مرة: «هذا الجهاز غير مسجّل لحسابك — أُرسل تلقائياً طلب تغيير الجهاز إلى شؤون الموظفين، وسيُفعَّل جهازك فور الموافقة»
  - وطلب معلّق: «هذا الجهاز غير مسجّل لحسابك — طلب تغيير جهازك بانتظار موافقة شؤون الموظفين»
- `GET /hr/attendance/devices/my` يعيد `pending_request` ليعرضه التطبيق (⏳ بانتظار الموافقة).
- يمكن للإدارة تعطيل الإنشاء التلقائي بمفتاح `device_auto_request` في إعدادات الدوام.
