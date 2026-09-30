# وثيقة تكامل: مزامنة بيانات الطلاب من نظام الحضور (جامعة الأحقاف) إلى الموقع التعليمي

> موجّهة إلى وكيل/مطوّر الموقع الآخر (المنصة التعليمية / نظام النتائج).
> **مصدر الحقيقة** لبيانات الطلاب والكليات والأقسام والمستويات والشعب هو نظام الحضور. الموقع الآخر **يقرأ فقط** ولا يكتب.

## 1) الاتصال
| البند | القيمة |
|---|---|
| الرابط الأساسي (إنتاج) | `https://api.ahgaff.net/api/integration` |
| المصادقة | هيدر `Authorization: Bearer <SERVICE_API_KEY>` (يُسلَّم لك من إدارة النظام — لا تضعه في كود الواجهة أبداً، خزّنه في متغير بيئة على السيرفر فقط) |
| الصيغة | JSON · UTF-8 · GET فقط (أي POST/PUT/DELETE → 405) |
| حد الطلبات | 120 طلب/دقيقة لكل مفتاح (→ 429 عند التجاوز) |
| فحص الاتصال (بلا مفتاح) | `GET /health` → `{"status":"ok","system_name":"Ahgaff Attendance System","api_version":"1.0"}` |

**أكواد الأخطاء**: 401 بلا هيدر · 403 مفتاح خاطئ · 404 سجل غير موجود · 422 معامل خاطئ (مثل updated_since) · 429 تجاوز الحد · 503 المفتاح غير مضبوط في السيرفر.

## 2) المعاملات المشتركة (لكل نقاط القوائم)
| المعامل | النوع | الوصف |
|---|---|---|
| `page` | int ≥1 | رقم الصفحة (افتراضي 1) |
| `page_size` | int 1..500 | حجم الصفحة (افتراضي 100) |
| `updated_since` | ISO-8601 | يرجع السجلات المُنشأة/المحدَّثة بعد هذا الوقت فقط — للمزامنة التزايدية |
| `active_only` | bool | النشط فقط |

شكل الاستجابة لكل قائمة:
```json
{ "items": [...], "page": 1, "page_size": 100, "total": 1697, "has_more": true }
```

## 3) النقاط المتاحة

### الهيكل التنظيمي
| النقطة | تُرجع |
|---|---|
| `GET /colleges` | الكليات: `external_college_id, code, name` |
| `GET /departments` | الأقسام: `external_department_id, college_id, code, name` |
| `GET /programs` | البرامج (مشتقة من الأقسام): `external_program_id = "prog-{department_id}", program_code, name` |
| `GET /levels` | المستويات: `external_level_id = "level-{n}", level_number, name` |
| `GET /sections` ⭐ | الشعب الفعلية (مشتقة من الطلاب): `external_section_id = "sec-{dept}-{level}-{section}", department_id, department_name, college_id, college_name, level_number, section, students_count` |
| `GET /academic-years` | الأعوام: `external_academic_year_id = "ay-{year}", name, is_active` |
| `GET /semesters` | الفصول: `external_semester_id, name, academic_year, status (active/…), start_date, end_date` |

### الطلاب
`GET /students?active_only=true&page=1&page_size=500` — عنصر واحد:
```json
{
  "external_student_id": "698e50c797fef774e66e93aa",
  "student_number": "234",              // رقم القيد — المعرّف الموحّد للطالب بين النظامين
  "reference_number": "AUB2301001",     // الرقم المرجعي (قد يكون فارغاً)
  "full_name": "خالد أحمد",
  "gender": "male",
  "email": "", "phone": "",
  "status": "active",                   // active | suspended | frozen | dismissed | graduated | repeat ...
  "is_active": true,
  "college_id": "698e4f92...", "college_name": "كلية الشريعة والقانون",
  "department_id": "698e5009...", "department_name": "الشريعة والقانون",
  "program_id": "prog-698e5009...", "program_code": "B",
  "level_id": "level-1", "level_number": 1,
  "section": "أ",
  "admission_year": "23",
  "is_alumni": false,
  "created_at": "2026-02-12T22:14:31", "updated_at": "2026-06-23T21:08:59+00:00"
}
```

### بحث طالب واحد برقم القيد ⭐
`GET /students/by-number/{student_number}` — يقبل رقم القيد **أو** الرقم المرجعي. يرجع نفس حقول الطالب أعلاه + مصفوفة `courses` (كل المقررات المسجَّل فيها):
```json
"courses": [{
  "external_course_id": "698f6714...",
  "course_code": "TFS201", "course_name_ar": "أصول التفسير (1)",
  "credit_hours": 3, "level_number": 2, "section": "أ",
  "teacher_id": "698ad3da...", "teacher_name": "زين سالم",
  "semester_id": "698e5cc5...", "semester_name": "الفصل الأول",
  "academic_year": "2025-2026", "semester_is_active": true,
  "status": "active"
}]
```
> للفصل الحالي فقط: فلتر `semester_is_active == true`. غير موجود → 404 `{"detail":"student_not_found"}`.

### المقررات والتسجيلات
| النقطة | تُرجع |
|---|---|
| `GET /courses?active_only=true` | `external_course_id, course_code, course_name_ar, course_name_en, credit_hours, department_id, program_id, level_id, level_number, section, semester_id, academic_year, teacher_id, status` |
| `GET /enrollments?active_only=true` | `external_enrollment_id, student_id (= external_student_id), course_id (= external_course_id), semester_id, academic_year_id, registration_status` |

## 4) خطة المزامنة الموصى بها (للموقع الآخر)

**أ) المزامنة الكاملة الأولى (مرة واحدة):**
1. `/colleges` → `/departments` → `/levels` → `/sections` → `/semesters` (بناء الهيكل).
2. `/students?page_size=500` مع تكرار الصفحات حتى `has_more=false` — احفظ `student_number` كمفتاح فريد، و`external_student_id` كمعرّف خارجي.
3. (اختياري) `/courses?active_only=true` ثم `/enrollments?active_only=true` لربط الطلاب بمقرراتهم.

**ب) المزامنة الليلية (Cron كل ليلة مثلاً 02:00):**
- استدعِ نفس النقاط مع `updated_since=<وقت آخر مزامنة ناجحة>` (خزّنه عندك بصيغة ISO مع المنطقة الزمنية).
- طبّق **Upsert** على `student_number`: تحديث الاسم/الكلية/القسم/المستوى/الشعبة/الحالة.
- الطالب بـ `is_active=false` أو `status ∈ {dismissed, graduated, suspended, frozen, repeat}` → عطّله عندك ولا تحذفه.
- بعد اكتمال المزامنة احفظ وقت البداية كـ `last_sync` (وليس وقت النهاية، لتفادي فقدان السجلات المحدَّثة أثناء التشغيل).

**ج) عند دخول الطالب أو فتح ملفه في موقعك (Lookup فوري):**
- `/students/by-number/{رقم القيد}` لجلب كليته/مستواه/شعبته ومقرراته الحالية مباشرة (يمكنك تخزينه محلياً بذاكرة مؤقتة 24 ساعة).

**د) قواعد الربط:**
- المعرّف الموحّد بين النظامين = **رقم القيد `student_number`** (نصّي، لا تحوّله إلى رقم).
- المستوى: `level_number` (1..N). الشعبة: نص عربي مثل `"أ"`, `"ب"` وقد تكون فارغة.
- الكلية/القسم: استخدم `external_college_id` / `external_department_id` للربط، والأسماء للعرض فقط (قد تُعدَّل).
- لا تعتمد على البريد/الهاتف كمفاتيح — قد تكون فارغة.

## 5) أمثلة سريعة
```bash
# فحص
curl https://api.ahgaff.net/api/integration/health

# الطلاب النشطون (صفحة 1)
curl -H "Authorization: Bearer $SERVICE_API_KEY" \
  "https://api.ahgaff.net/api/integration/students?active_only=true&page=1&page_size=500"

# تزايدي
curl -H "Authorization: Bearer $SERVICE_API_KEY" \
  "https://api.ahgaff.net/api/integration/students?updated_since=2026-09-26T00:00:00Z"

# طالب برقم القيد
curl -H "Authorization: Bearer $SERVICE_API_KEY" \
  "https://api.ahgaff.net/api/integration/students/by-number/20231045"
```

## 6) ملاحظات أمنية
- المفتاح للسيرفر فقط (Backend-to-Backend). لا تستدعِ الـ API من متصفح المستخدم.
- لا تسجّل المفتاح في اللوجات. عند الشك بتسرّبه اطلب تجديده من إدارة نظام الحضور.
- الـ API للقراءة فقط؛ أي تعديل على بيانات الطلاب يتم من نظام الحضور نفسه.
