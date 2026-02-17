# 🚀 دليل نشر نظام الحضور EduAnalytic

## المتطلبات

### للسيرفر (VPS):
- Ubuntu 20.04+ أو أي Linux distribution
- Docker و Docker Compose
- 2GB RAM على الأقل
- 20GB مساحة تخزين

### للبناء المحلي:
- Node.js 18+
- EAS CLI
- حساب Expo

---

## 1️⃣ النشر على سيرفر خاص (VPS)

### الخطوة 1: تثبيت Docker
```bash
# تحديث النظام
sudo apt update && sudo apt upgrade -y

# تثبيت Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# تثبيت Docker Compose
sudo apt install docker-compose-plugin -y

# إضافة المستخدم لمجموعة Docker
sudo usermod -aG docker $USER
```

### الخطوة 2: نسخ ملفات المشروع
```bash
# إنشاء مجلد المشروع
mkdir -p /opt/eduanalytic
cd /opt/eduanalytic

# نسخ الملفات (أو استخدم git clone)
# تأكد من وجود:
# - backend/
# - docker-compose.yml
# - nginx/
# - .env
```

### الخطوة 3: إعداد المتغيرات البيئية
```bash
# نسخ ملف المثال
cp .env.example .env

# تعديل المتغيرات
nano .env
```

**المتغيرات المطلوبة:**
```env
MONGO_USER=admin
MONGO_PASSWORD=كلمة_مرور_قوية_هنا
JWT_SECRET=مفتاح_سري_طويل_عشوائي
ADMIN_EMAIL=admin@yourdomain.com
DOMAIN=attendance.yourdomain.com
```

### الخطوة 4: إنشاء شهادة SSL ذاتية (للاختبار)
```bash
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/nginx.key \
  -out nginx/ssl/nginx.crt \
  -subj "/CN=localhost"
```

### الخطوة 5: تشغيل التطبيق
```bash
# تشغيل كل الخدمات
docker compose up -d

# مراقبة السجلات
docker compose logs -f

# التحقق من حالة الخدمات
docker compose ps
```

### الخطوة 6: إعداد SSL حقيقي (للإنتاج)
```bash
# إيقاف nginx مؤقتاً
docker compose stop nginx

# الحصول على شهادة Let's Encrypt
docker run -it --rm \
  -v ./certbot/conf:/etc/letsencrypt \
  -v ./certbot/www:/var/www/certbot \
  -p 80:80 \
  certbot/certbot certonly --standalone \
  -d yourdomain.com -d www.yourdomain.com

# تعديل nginx.conf لاستخدام الشهادة الحقيقية
# ثم إعادة تشغيل
docker compose up -d nginx
```

---

## 2️⃣ بناء تطبيق الموبايل (APK/IPA)

### الخطوة 1: تثبيت EAS CLI
```bash
npm install -g eas-cli
```

### الخطوة 2: تسجيل الدخول لـ Expo
```bash
eas login
```

### الخطوة 3: إعداد EAS Build
```bash
cd frontend
eas build:configure
```

### الخطوة 4: تحديث عنوان الـ API
**تعديل `frontend/.env`:**
```env
EXPO_PUBLIC_BACKEND_URL=https://yourdomain.com
```

### الخطوة 5: بناء APK (Android)
```bash
# بناء للاختبار (APK مباشر)
eas build --platform android --profile preview

# بناء للنشر (AAB لـ Play Store)
eas build --platform android --profile production
```

### الخطوة 6: بناء IPA (iOS)
```bash
# يتطلب حساب Apple Developer ($99/سنة)
eas build --platform ios --profile production
```

---

## 3️⃣ إعداد EAS (eas.json)

أنشئ ملف `frontend/eas.json`:
```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "android": {
        "buildType": "apk"
      },
      "distribution": "internal"
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

---

## 4️⃣ تحديث app.json للنشر

**تعديل `frontend/app.json`:**
```json
{
  "expo": {
    "name": "نظام الحضور",
    "slug": "eduanalytic-attendance",
    "version": "1.0.0",
    "android": {
      "package": "com.yourcompany.attendance",
      "versionCode": 1
    },
    "ios": {
      "bundleIdentifier": "com.yourcompany.attendance",
      "buildNumber": "1.0.0"
    },
    "extra": {
      "eas": {
        "projectId": "your-project-id"
      }
    }
  }
}
```

---

## 🔧 الصيانة والمراقبة

### مراقبة السجلات
```bash
# جميع السجلات
docker compose logs -f

# سجلات Backend فقط
docker compose logs -f backend

# سجلات MongoDB
docker compose logs -f mongodb
```

### النسخ الاحتياطي
```bash
# نسخ قاعدة البيانات
docker compose exec mongodb mongodump --out /backup

# نسخ من الحاوية للمضيف
docker cp eduanalytic-mongodb:/backup ./backup-$(date +%Y%m%d)
```

### تحديث التطبيق
```bash
# سحب التحديثات
git pull

# إعادة بناء وتشغيل
docker compose up -d --build
```

---

## ❓ استكشاف الأخطاء

### مشكلة: لا يمكن الاتصال بقاعدة البيانات
```bash
# تحقق من تشغيل MongoDB
docker compose ps mongodb

# تحقق من السجلات
docker compose logs mongodb
```

### مشكلة: خطأ 502 Bad Gateway
```bash
# تحقق من تشغيل Backend
docker compose ps backend
docker compose logs backend
```

### مشكلة: شهادة SSL غير صالحة
```bash
# تجديد الشهادة
docker compose run --rm certbot renew
docker compose restart nginx
```

---

## 📞 الدعم

للمساعدة أو الاستفسارات، تواصل معنا.
