# طالب الأحقاف - Student & Teacher Management System PRD

## Hierarchy: University -> Faculties -> Departments -> Courses -> Students

## What's Been Implemented

### March 7, 2026 (Session 5) - Push Notifications & QuickNav Fix
- Verified push notification enhancements already in place (default_sound, default_vibrate_timings, visibility)
- Fixed QuickNav.tsx event propagation bug (View -> Pressable with stopPropagation)
- Fixed broken QuickNav routes (/add-student -> /students, /add-teacher -> /manage-teachers)
- Note: QuickNav component is NOT used in the app - SideMenu handles all navigation

### March 6, 2026 (Session 4) - faculty_id Auto-Resolution
- Auto-populate `faculty_id` on students and teachers from their department
- Added `_resolve_faculty_id()` helper used in: create_student, create_teacher, import_students, import_teachers
- Migration endpoint `POST /api/admin/fix-faculty-ids` to fix existing 72 students + 3 teachers
- `faculty_id` now returned in both student and teacher API responses

### March 6, 2026 (Session 3) - Data Integrity Fixes
- Enrollment: blocked if student from different department
- Department delete protection (has students/teachers/courses)
- Teacher cross-department warning on course create/update
- Courses auto-linked to active semester + fix endpoint

### March 6, 2026 (Session 2) - Study Plans & Reports
- Study Plan with completion tracking, Excel export, permission-based access

### March 6, 2026 (Session 1) - Attendance & Import
- Attendance timing (configurable per-faculty), Teacher Excel import, Bulk student actions

## Key Admin Endpoints
- `POST /api/admin/fix-faculty-ids` - Fix students/teachers without faculty_id
- `POST /api/admin/fix-courses-semester` - Fix courses without semester
- `GET /api/template/teachers` - Download Excel template for teacher import
- `POST /api/import/teachers` - Import teachers from Excel
- `GET /api/courses/{course_id}/study-plan` - Fetch study plan with completion
- `PUT /api/courses/{course_id}/study-plan` - Create/update study plan
- `GET /api/reports/lesson-completion` - Lesson completion report data
- `GET /api/reports/lesson-completion/export` - Export report to Excel

## Navigation
- App uses SideMenu (hamburger button) for navigation, NOT QuickNav component
- QuickNav.tsx exists but is dead code (never imported/rendered)

## P0 - Completed
- [x] Push notification reliability enhancement
- [x] QuickNav code fix (though unused)

## P1 - Next
- [ ] Backend refactoring: Split server.py into APIRouter modules
- [ ] Guide user to deploy and test all new features
- [ ] Guide user to run faculty_id data migration

## P2 - Future
- [ ] Teacher app update (SEPARATE PROJECT)
- [ ] User builds APKs
- [ ] Teacher delay report
- [ ] Improve reports | Activity logs UI
- [ ] Remove/integrate QuickNav.tsx (dead code cleanup)

## Test Credentials
- Admin: admin / admin123 | Teacher: teacher180156 / teacher123 | Student: 234 / 123456

## Tech Stack
- Backend: FastAPI + MongoDB
- Frontend: Expo (React Native Web)
- Push Notifications: Firebase Cloud Messaging (FCM)
- Deployment: Railway
