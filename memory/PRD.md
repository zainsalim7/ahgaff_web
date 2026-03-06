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
  - New collection `study_plans` for semester study plans per course (divided by weeks)
  - Teacher creates plan gradually (not mandatory to complete at semester start)
  - `lesson_title` and `plan_topic_id` fields added to lectures (saved during attendance)
  - Teacher can choose topic from plan OR write custom title during attendance
  - Attendance NOT blocked without a study plan
  - `GET /api/courses/{id}/study-plan` and `PUT /api/courses/{id}/study-plan` endpoints
  - `GET /api/reports/lesson-completion` endpoint with department filtering
  - New admin report page `/report-lesson-completion` with:
    - Stats cards (total courses, with/without plan, avg completion)
    - Progress bars per course
    - Detail badges (planned, completed, lectures count)
    - Modal to view study plan content

### March 6, 2026 (Session 1)
- **Attendance Timing System**: Configurable per-faculty, timer starts when teacher opens attendance
- **Teacher Import from Excel**: Import with auto-account activation
- **Bulk Student Actions**: Activate/deactivate in selection mode

### Previous Sessions
- Full app: login, dashboard, courses, lectures, attendance, enrollment, notifications, reports, profile
- Teacher/Student apps with offline sync
- Push Notifications (FCM)
- Standalone packages for separate repos

## Key DB Collections
- `study_plans`: {course_id, weeks: [{week_number, topics: [{id, title}]}], updated_at, updated_by}
- `lectures`: Added fields: `lesson_title`, `plan_topic_id`, `attendance_started_at`
- `faculties`: Added: `attendance_duration_minutes`, `max_attendance_delay_minutes`

## Key API Endpoints (New)
- `GET/PUT /api/courses/{id}/study-plan` - CRUD for study plans
- `GET /api/reports/lesson-completion` - Lesson completion report
- `GET /api/template/teachers` - Download Excel template
- `POST /api/import/teachers` - Import teachers from Excel
- `POST /api/students/bulk-activate` / `bulk-deactivate`

## P1 - Next
- [ ] Teacher app update: Add study plan management UI + lesson title during attendance (SEPARATE PROJECT)
- [ ] User builds APKs (verification pending)
- [ ] Fix QuickNav.tsx click handler
- [ ] Teacher delay report (attendance_started_at vs scheduled time)

## P2 - Future
- [ ] Improve reports
- [ ] Activity logs UI
- [ ] Backend refactoring (split server.py)

## Test Credentials
- Admin: admin / admin123
- Teacher: teacher180156 / teacher123
- Student: 234 / 123456

## Railway Backend
`https://ahgaffweb-production-c582.up.railway.app`
