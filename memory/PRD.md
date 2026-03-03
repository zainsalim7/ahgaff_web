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
├── backend/          # FastAPI backend (shared by all apps)
│   └── backend/server.py  # Main server (~8800 lines)
├── frontend/         # Admin Web App (React Native / Expo) - DO NOT MODIFY
├── student-app/      # Student App (React Native / Expo) - COMPLETED
│   ├── app/(tabs)/   # Dashboard, Attendance, Schedule, Profile
│   └── src/          # API, Store, Utils
└── teacher-app/      # Teacher App (React Native / Expo) - COMPLETED
    ├── app/(tabs)/   # Dashboard, My Courses, Take Attendance, Profile
    ├── app/          # Login, Notifications, Change Password, Course Students
    └── src/          # API, Store (Auth + OfflineSync), Utils
```

## What's Been Implemented

### Student App (Completed - March 3, 2026)
- Login (student-only, rejects admin/teacher)
- Dashboard with attendance rate, courses, notifications
- Attendance records per course
- Lecture schedule (calendar view)
- Profile with settings
- Notifications with read/unread
- Student card with QR code
- Offline login + API caching

### Teacher App (Completed - March 4, 2026)
- Login (teacher-only, rejects admin/student)
- Dashboard with:
  - Welcome card, notification badge
  - Offline sync indicator + sync button
  - Quick stats (courses, today's lectures, pending sync)
  - Today's lectures list
  - My courses list
- My Courses page with attendance stats per course
- Take Attendance (offline-capable):
  - Course selection
  - Student list with present/absent/excused toggle
  - Mark all present/absent
  - Local save to Zustand store + AsyncStorage
  - Pending count badge on tab
- Profile with sync status, notifications link, password change
- Notifications with mark as read
- Course Students view
- Lecture Attendance History
- Offline sync mechanism:
  - Records saved locally when offline
  - Batch sync to `/api/sync/attendance` when online
  - Uses `attendance_records` format with `local_id` dedup

### Backend APIs (All Tested - 100% Pass Rate)
Teacher-specific:
- POST /api/auth/login (teacher validation)
- GET /api/auth/me
- GET /api/courses (scoped to teacher)
- GET /api/enrollments/{courseId}/students
- GET /api/lectures/today
- POST /api/lectures
- POST /api/attendance/session
- POST /api/sync/attendance (offline sync)
- GET /api/attendance/stats/course/{courseId}
- GET /api/notifications/count
- GET /api/notifications/my
- PUT /api/notifications/{id}/read
- PUT /api/notifications/read-all (fixed for teachers)
- POST /api/auth/change-password

## P0 - Current (Completed)
- [x] Student app implementation
- [x] Teacher app implementation
- [x] Offline attendance system
- [x] Backend API testing (16/16 pass)

## P1 - Next
- [ ] User builds Student APK: `cd student-app && npx eas build --profile preview --platform android`
- [ ] User builds Teacher APK: `cd teacher-app && npx eas build --profile preview --platform android`
- [ ] Push notifications (requires APK build first)

## P2 - Future
- [ ] Improve reports (Admin Web)
- [ ] Activity logs UI
- [ ] Backend refactoring (split server.py into modules)
- [ ] Railway deployment fixes

## Test Credentials
- Student: username=234, password=123456
- Teacher: username=teacher180156, password=teacher123
- Admin: username=admin, password=admin123

## Build Instructions
### Student App
```bash
cd student-app
npx eas build --profile preview --platform android
```

### Teacher App
```bash
cd teacher-app
npx eas build --profile preview --platform android
```
