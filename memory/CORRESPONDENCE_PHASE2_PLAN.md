# المرحلة 2 — قرارات المستخدم المعتمدة وخطة التنفيذ (2026-10-05)

## القرارات
1. المحرر: **TipTap (ProseMirror)** عبر yarn (@tiptap/react, starter-kit, text-align, underline, table) — RTL.
2. الأصول: إعادة استخدام `services/storage_service.upload_file` (Emergent Object Storage) + مجموعة `files` + `GET /api/files/{path}`؛ تحقق PNG/JPG/SVG/WebP ≤ 2MB.
3. التجميد: افتراضي **ISSUED**؛ حقل `freeze_stage` على القالب (APPROVED/SIGNED/ISSUED).
4. سجل العناصر النائبة: الحد الأدنى + تواصل خلف `placeholder.contact.read` + أكاديمي موسّع خلف `placeholder.academic.read`.
5. البذور: ترويسة جامعية عامة على جذر `presidency` + 10 قوالب عامة منشورة v1 (STUDENT_ENROLLMENT_CERTIFICATE, STUDENT_STATUS_LETTER, FACULTY_ASSIGNMENT, EMPLOYEE_CERTIFICATE, OFFICIAL_EXTERNAL_LETTER, INTERNAL_MEMO, ADMINISTRATIVE_DECISION, STUDENT_WARNING, ACADEMIC_CERTIFICATE, GENERAL_CORRESPONDENCE). الإنشاء من الصفر = GENERAL_CORRESPONDENCE خلف `template.use`.

## الملفات المخطط لها
- `backend/backend/services/corr_placeholders.py` — Registry + resolvers (student/employee/faculty/organization/recipient/correspondence/input/system) + sanitize (bleach) + conditions (EQUALS/NOT_EQUALS/EXISTS/NOT_EXISTS/IN).
- `backend/backend/routes/correspondence_content.py` — letterheads, templates(+versions/publish/clone), placeholders, entities search, content, preview, snapshots; hooks في `transition_correspondence` (تحقق قبل SUBMITTED + Snapshot عند freeze_stage).
- Frontend: `app/corr-letterheads.tsx`, `app/corr-templates.tsx` (builder), `app/corr-compose.tsx` (A4 composer TipTap), مكوّنات `src/components/corr/` (EntityPicker, TipTapEditor, A4Preview).
- Tests: `backend/backend/tests/test_correspondence_phase2.py`.

## المجموعات
correspondence_letterheads, correspondence_templates, correspondence_template_versions, correspondence_contents, correspondence_data_snapshots (+ reuse correspondence_entities, files).

## الصلاحيات الجديدة
letterhead.read/create/update/activate/set_default/manage_organization · template.read/create/update_draft/publish/deactivate/clone/manage_global/manage_organization/use · placeholder.contact.read · placeholder.academic.read · entity.student.read · entity.employee.read · entity.faculty.read
