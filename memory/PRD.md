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
