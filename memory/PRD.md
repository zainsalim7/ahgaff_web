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

### March 5, 2026
- **Bulk Student Activation/Deactivation**: Added "Activate All" and "Deactivate All" buttons to the students management page (`/students`). Backend endpoints were already implemented; UI buttons with confirmation dialogs and loading states added.

### March 4, 2026
- **Completed Teacher App** with offline attendance, sync mechanism, all screens
- **Fixed schedule.tsx (Admin)**: Removed add/generate from lectures page, fixed delete/cancel (web-compatible)
- **Fixed backend**: Course update endpoint, mark-all-read for teachers
- **Created standalone packages** for student/teacher apps with Railway API integration
- **Fixed EAS Build**: Added package-lock.json, removed packageManager from package.json
- **Cleaned dependencies**: Removed 18 unused libraries from student/teacher apps
- **Push Notifications (FCM)**: Full end-to-end fix with Firebase credentials, AndroidConfig, device registration
- **Workload Report**: Changed logic to use `weekly_hours` field on teacher profile
- **Admin UI Fixes**: window.confirm for web, notification confirmations, removed duplicate workload field

### Completed Features
- Login (admin/teacher/student role-based)
- Dashboard with stats
- Courses management (CRUD + lectures from inside course)
- Lectures page (view + delete/cancel only, no add/generate)
- Attendance recording
- Enrollment management
- Notifications
- Reports
- Profile + change password
- Student App (complete)
- Teacher App (complete with offline sync)
- Bulk student account activation/deactivation

## P0 - Current (Completed)
- [x] Bulk student activation/deactivation UI buttons
- [x] Teacher app implementation
- [x] Schedule page: remove add/generate, fix delete/cancel
- [x] Standalone packages for separate repos
- [x] Push notifications (FCM)

## P1 - Next
- [ ] User builds Student APK (verification pending)
- [ ] User builds Teacher APK (verification pending)
- [ ] Fix QuickNav.tsx click handler (low priority UI bug)

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
