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

### March 6, 2026
- **Attendance Timing System Overhaul**: 
  - Configurable per-faculty: `attendance_duration_minutes` (default 15) and `max_attendance_delay_minutes` (default 30)
  - Timer starts when teacher opens attendance (not lecture start time)
  - Records `attendance_started_at` on lecture for monitoring teacher delays
  - Max delay limit: teacher can't open attendance after configured minutes
  - Settings UI added to faculty settings page
- **Teacher Import from Excel**: Import with auto-account activation
- **Bulk Student Actions**: Activate/deactivate in selection mode

### Previous Sessions
- Full app: login, dashboard, courses, lectures, attendance, enrollment, notifications, reports, profile
- Teacher/Student apps with offline sync
- Push Notifications (FCM)
- Standalone packages for separate repos

## P1 - Next
- [ ] User builds APKs (verification pending)
- [ ] Fix QuickNav.tsx click handler
- [ ] Teacher delay report (future)

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
