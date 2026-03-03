# طالب الأحقاف - تطبيق الطالب
## Student App - Ahgaff University

تطبيق موبايل خفيف مخصص للطلاب فقط.

### الإعداد
```bash
yarn install
```

### تشغيل محلي
```bash
npx expo start
```

### بناء APK
```bash
npx eas build --profile preview --platform android
```

### رابط الـ Backend
الـ Backend مرفوع على Railway:
`https://ahgaffweb-production-c582.up.railway.app`

### بيانات التجربة
- **طالب**: اسم المستخدم: `234` / كلمة المرور: `123456`

### الميزات
- تسجيل دخول الطالب
- لوحة القيادة مع نسبة الحضور
- سجل الحضور لكل مقرر
- جدول المحاضرات
- الإشعارات
- البطاقة الجامعية مع QR Code
- الملف الشخصي وتغيير كلمة المرور
- دعم الوضع بدون إنترنت (Offline Cache)
