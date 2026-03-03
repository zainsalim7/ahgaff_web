# طالب الأحقاف - Student App PRD

## Original Problem Statement
Building a student/teacher management system for Ahgaff University. The latest phase involves creating separate, lightweight mobile apps:
1. **Student App (APK)** - Simple, student-only - CURRENT FOCUS
2. **Teacher App (APK)** - Simple, teacher-only - UPCOMING
3. **Admin Panel (Web)** - Full administration - EXISTS (Railway)

All three apps connect to the same FastAPI backend.

## Architecture
```
/app/
├── backend/          # FastAPI backend (shared by all apps)
│   ├── backend/server.py  # Main server (~8800 lines)
│   ├── routes/
│   ├── models/
│   └── services/
├── frontend/         # Student App (React Native / Expo)
│   ├── app/          # Expo Router screens
│   │   ├── (tabs)/   # Tab-based navigation
│   │   │   ├── index.tsx       # Student Dashboard
│   │   │   ├── my-attendance.tsx # Attendance Records
│   │   │   ├── my-schedule.tsx  # Lecture Schedule
│   │   │   └── profile.tsx     # Profile & Settings
│   │   ├── login.tsx           # Student-only login
│   │   ├── notifications.tsx   # Notifications
│   │   ├── change-password.tsx # Password Change
│   │   └── student-card.tsx    # Student ID Card with QR
│   ├── src/
│   │   ├── services/api.ts    # API service with offline caching
│   │   ├── store/authStore.ts # Auth state management
│   │   ├── components/        # Reusable components
│   │   ├── types/             # TypeScript types
│   │   └── utils/             # Date utils, navigation
│   ├── app.json              # App config (name: طالب الأحقاف)
│   └── eas.json              # EAS build profiles
```

## What's Been Implemented (March 3, 2026)

### Student App Features
- Login screen (student-only, rejects admin/teacher roles)
- Student dashboard with:
  - Welcome card with student info
  - Notifications badge
  - Overall attendance rate
  - QR code quick access
  - Course count
  - Per-course attendance breakdown with status indicators
- Attendance records page (per course, detailed history)
- Lecture schedule page (calendar view)
- Profile page with:
  - Student info display
  - Notifications link with unread count
  - Student card link
  - Password change
  - Logout
- Notifications page with read/unread management
- Student card with QR code and sharing
- Offline login support (remember me + cached credentials)
- API response caching for offline viewing
- RTL Arabic layout support

### Backend APIs (All Tested - 100% Pass Rate)
- POST /api/auth/login
- GET /api/auth/me
- GET /api/students/me
- GET /api/courses
- GET /api/departments
- GET /api/settings
- GET /api/notifications/count
- GET /api/notifications/my
- GET /api/attendance/stats/student/{id}
- GET /api/attendance/student/{id}
- GET /api/lectures/{courseId}

## P0 - Current
- [x] Student app implementation
- [x] Backend API testing (15/15 pass)
- [ ] User builds APK using `eas build --profile preview --platform android`

## P1 - Next
- [ ] Teacher app (separate, lightweight)
- [ ] Push notifications integration (requires new APK build)
- [ ] Offline data caching verification

## P2 - Future
- [ ] Improve reports
- [ ] Activity logs UI
- [ ] Backend refactoring (split server.py into modules)
- [ ] Railway deployment fixes

## Test Credentials
- Student: username=234, password=123456
- Admin: username=admin, password=admin123

## Build Instructions
```bash
cd frontend
npx eas build --profile preview --platform android
```
