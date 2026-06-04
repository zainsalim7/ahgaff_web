# Ahgaff University Management System – PRD

## Original Problem Statement
Comprehensive student/teacher management system for Ahgaff University with:
- Shared FastAPI backend (MongoDB Atlas)
- Admin web/Expo app
- Standalone mobile apps
- Granular RBAC, schedule management, attendance tracking
- Modern, professional Arabic UI
- Advanced academic hierarchy (Curriculum → Teaching Assignments → Semester Offerings)
- Student status management (Active, Repeat, Graduated, Expelled, Frozen)
- Verifiable digital reporting (PDF + QR)
- Parallel deployments: Railway + Google Cloud Run

## Implemented (selected, recent)
- 2026-02 Term field added to Semester create/edit (UI + backend)
- 2026-02 Multi-section curriculum offering generator (sections_map)
- 2026-02 Teaching Load Report redesigned (filters: semester/department/teacher) + reads from `semester_archives` for archived semesters
- 2026-02 GCP Cloud Run parallel deployment with Kaniko cache + GitHub Actions CI
- 2026-02 MongoDB Atlas downgraded M30 → M10 (cost optimization)
- 2026-02-26 **Student Level Change with Section Reassignment**:
  - Edit modal: inline notice when level changes AND student has a section; quick actions (keep / clear) + suggested chips from existing sections at the new level + manual input.
  - Bulk modal: 2-step flow – pick level → choose section action (keep current per-student / set unified section / clear). Suggestion chips at new level.
  - Backend `POST /api/students/bulk-change-level` now accepts `section_mode` ("keep" | "set" | "clear") + optional `new_section`. Backward-compatible default = "keep".
- 2026-06-02 **Multi-Identifier Login + Duplicate student_id Support**:
  - Login accepts: `username` (default), `reference_number`, or `student_id` (if unique).
  - When `student_id` is duplicated across students, login by student_id returns 409 — user must use reference_number.
  - `POST /api/students` and Excel import: allow duplicate `student_id` only if `department_id` differs (rejects same-dept duplicates).
  - `PUT /api/students/{id}` and restore endpoints: same scoped duplicate rule.
  - `POST /api/students/{id}/activate`: if `student_id` is already taken in `users.username`, fallback to `reference_number` as username automatically.
  - `POST /api/students` (with password): same fallback.
  - Login screen placeholder updated: "اسم المستخدم / رقم القيد / الرقم المرجعي".
- 2026-06-02 **Active Semester Scoping for Teaching Load**:
  - `GET /api/teaching-load/search-courses` defaults to active semester (excludes archived). Accepts `semester_id` override.
  - `GET /api/teaching-load/teacher/{id}/courses` same default + override + existing-loads also scoped.
  - `GET /api/teaching-load` defaults to active semester. Accepts `semester_id` or `all_semesters=true`.
  - `POST /api/teaching-load/bulk` "course assigned to other teacher" check now scoped to same `semester_id` (a course can be reassigned in a new semester without conflict with archived assignment).
  - Frontend: active-semester badge displayed at top of `teaching-load` page with green accent ("الفصل النشط: ...").
- 2026-06-02 **Teaching Load Templates** (نسخ الإسنادات بين الفصول):
  - New collection `teaching_load_templates` storing snapshots.
  - Endpoints: `GET/POST /api/teaching-load/templates`, `POST /api/teaching-load/templates/{id}/apply`, `DELETE /api/teaching-load/templates/{id}`.
  - Snapshot stores: course_code/level/section/dept + curriculum_course_id + teacher_employee_id + full_name + weekly_hours + notes.
  - Apply matches courses by curriculum_course_id (primary) → code+level+section+dept (fallback) → code+level+section. Teachers matched by employee_id → full_name.
  - Returns detailed stats: created/updated/skipped + unmatched courses + unmatched teachers.
  - Frontend: 2 buttons in teaching-load header (Save Template / Apply Previous Template) + 2 modals. Save modal: name + term selection. Apply modal: template picker + target semester + overwrite checkbox + results dashboard.
- 2026-06-04 **Weekly Schedule Drafts + Visual Export**:
  - New collection `weekly_schedule_drafts` (capped to last 10 per scope) — lightweight snapshots, not archived.
  - Endpoints: `GET/POST /api/weekly-schedule/drafts`, `POST /drafts/{id}/restore`, `GET /drafts/{id}/compare`, `DELETE /drafts/{id}`.
  - Visual export endpoints: `GET /weekly-schedule/export-visual/pdf` + `/excel` with filters (faculty/dept/level/section/teacher/room/semester).
  - PDF: A4 landscape, Arabic-shaped text via arabic-reshaper + bidi, colored cells (header blue, time slots light blue, empty grey).
  - Excel: openpyxl with RTL layout, merged title row, colored fills, bordered cells.
  - Frontend: 3 new buttons in weekly-schedule (Save Draft / Drafts List / Export) + 3 modals using HTML-native dialogs on web.
  - Drafts modal shows side-by-side comparison stats (teachers/rooms/courses/by_day) between draft and current schedule.
  - Export modal: format toggle (PDF/Excel) + scope picker (all/department/section/teacher/room).
- 2026-06-04 **Availability Report (تقارير الفراغ/الإشغال)**:
  - Backend endpoints: `GET /api/weekly-schedule/availability/rooms` and `/teachers` — given day_of_week + slot_number (+ optional faculty/department/semester), returns lists of free/busy rooms or teachers.
  - Rooms response: `{filter, total, free_count, busy_count, rooms: [{id, name, code, capacity, type, status, details}]}` where `details` shows the occupying course/teacher/section.
  - Teachers response adds preference status (preferred / neutral / non_preferred_day / unavailable) based on teacher schedule preferences, plus `free_preferred / free_neutral / free_unavailable` counts.
  - Frontend page `/availability-report` (linked from weekly-schedule via `availability-report-btn`): toggle rooms/teachers, day chips, slot chips, optional faculty/department filters, summary cards, and color-coded list with preference badges.
  - Validated end-to-end via screenshot tool: rooms tab returns 3 free rooms, teachers tab shows 3 available teachers with neutral preference badges.

## P0 / Next
- (P1) Digital Student Card with QR + Photo
- (P2) QR scanner in Teacher App (read Student Cards)
- (P2) "Copy assignments from previous semester" in teaching-load page
- (P2) Automatic Teaching Load templates during curriculum generation
- (P2) Fix orphaned `teaching_loads` cleanup on semester archive

## P3 / Backlog
- server.py modularization (Phase 2: Reports; Phase 3+: Templates, Courses, Lectures…)
- Migrate Atlas cluster AWS Oregon → GCP Doha (latency)

## Architecture (key)
- Backend: `/app/backend/backend/server.py` (~14k lines) + routes/
- Frontend: `/app/frontend/app/*.tsx` (Expo)
- Dual deploy: Railway (native) + GCP Cloud Run (GitHub Actions)
- DB: MongoDB Atlas M10 (AWS Oregon)

## Credentials
See `/app/memory/test_credentials.md`
