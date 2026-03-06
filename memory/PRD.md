# طالب الأحقاف - Student & Teacher Management System PRD

## Original Problem Statement
Building a student/teacher management system for Ahgaff University with three separate applications:
1. **Student App (APK)** - Lightweight, student-only - COMPLETED
2. **Teacher App (APK)** - Lightweight, teacher-only with offline attendance - COMPLETED
3. **Admin Panel (Web)** - Full administration - EXISTS (Railway)

All three apps connect to the same FastAPI backend.

## Architecture
```
/app/
├── backend/                    # FastAPI backend (shared by all apps)
├── frontend/                   # Admin Web App (React Native / Expo)
├── student-app/                # Student App source
├── teacher-app/                # Teacher App source
├── student-app-standalone/     # Standalone Student App (for separate repo)
└── teacher-app-standalone/     # Standalone Teacher App (for separate repo)
```

## What's Been Implemented

### March 6, 2026
- **Teacher Import from Excel**: Added import functionality with auto-account activation.
  - Backend: `GET /api/template/teachers` (download template), `POST /api/import/teachers` (import with auto-activate)
  - Frontend: Import modal with department selector, template download, result display
  - Auto-creates user accounts (username=employee_id, password=employee_id)
  - Validates required columns, rejects duplicates
- **Bulk Student Actions in Selection Mode**: Moved activate/deactivate into selection bar with change level and delete

### Previous Sessions
- Completed Teacher App with offline attendance
- Fixed schedule.tsx, backend endpoints, standalone packages
- Push Notifications (FCM) - fully configured
- Workload Report based on weekly_hours
- Admin UI/UX fixes (web-compatible dialogs)

### Completed Features
- Login (admin/teacher/student role-based)
- Dashboard with stats
- Courses management (CRUD + lectures)
- Lectures page (view + delete/cancel)
- Attendance recording
- Enrollment management
- Notifications with FCM
- Reports
- Profile + change password
- Student/Teacher Apps (complete)
- Bulk student actions via selection mode
- **Teacher import from Excel with auto-activation**

## P1 - Next
- [ ] User builds Student/Teacher APKs (verification pending)
- [ ] Fix QuickNav.tsx click handler (low priority)

## P2 - Future
- [ ] Improve reports (Admin Web)
- [ ] Activity logs UI
- [ ] Backend refactoring (split server.py into modules)

## Test Credentials
- Student: username=234, password=123456
- Teacher: username=teacher180156, password=teacher123
- Admin: username=admin, password=admin123

## Railway Backend
`https://ahgaffweb-production-c582.up.railway.app`
