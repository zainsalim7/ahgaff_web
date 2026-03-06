# طالب الأحقاف - Student & Teacher Management System PRD

## Original Problem Statement
Student/teacher management system for Ahgaff University with 3 apps (Student, Teacher, Admin) sharing one backend.

## Architecture
```
/app/
├── backend/                    # FastAPI backend (shared)
├── frontend/                   # Admin Web App (React Native / Expo)
├── student-app-standalone/     # Standalone Student App
└── teacher-app-standalone/     # Standalone Teacher App
```

## What's Been Implemented

### March 6, 2026 (Session 2)
- **Study Plan & Lesson Completion System**:
  - `study_plans` collection: semester plans per course (divided by weeks, with topics)
  - `lesson_title` and `plan_topic_id` on lectures (saved during attendance)
  - `GET/PUT /api/courses/{id}/study-plan` endpoints
  - `GET /api/reports/lesson-completion` - completion report with permission check
  - `GET /api/export/report/lesson-completion/excel` - Excel export with full details
  - New permission: `REPORT_LESSON_COMPLETION` - assignable to dept heads/employees
  - Frontend report page with stats, progress bars, plan viewer modal, Excel export button
  - Department filter for the report
- **Attendance Timing System**: Configurable per-faculty, timer starts when teacher opens
- **Teacher Import from Excel**: Import with auto-account activation
- **Bulk Student Actions**: Activate/deactivate in selection mode

### Previous Sessions
- Full app: login, dashboard, courses, lectures, attendance, enrollment, notifications, reports, profile
- Teacher/Student apps with offline sync, Push Notifications (FCM), Standalone packages

## Key New Endpoints
- `GET/PUT /api/courses/{id}/study-plan`
- `GET /api/reports/lesson-completion`
- `GET /api/export/report/lesson-completion/excel`
- `GET /api/template/teachers` | `POST /api/import/teachers`
- `POST /api/students/bulk-activate` | `bulk-deactivate`

## Permissions
- `report_lesson_completion`: View lesson completion report (assignable to dept heads)

## P1 - Next
- [ ] Teacher app: Add study plan UI + lesson title during attendance (SEPARATE PROJECT)
- [ ] User builds APKs
- [ ] Fix QuickNav.tsx
- [ ] Teacher delay report

## P2 - Future
- [ ] Improve reports | Activity logs UI | Backend refactoring

## Test Credentials
- Admin: admin / admin123 | Teacher: teacher180156 / teacher123 | Student: 234 / 123456
