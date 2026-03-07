# طالب الأحقاف - Student & Teacher Management System PRD

## Hierarchy: University -> Faculties -> Departments -> Courses -> Students

## What's Been Implemented

### March 7, 2026 (Session 5) - Critical Fixes
**Delete Fixes:**
- Department delete: replaced Alert.alert with Modal dialog (web compatible)
- Department card: separated clickable areas to fix event propagation on web
- Backend: department DELETE checks ALL records (removed is_active filter)
- Backend: course DELETE checks for enrolled students before allowing deletion
- Course bulk delete: improved error handling with per-item messages

**Teacher-Department Link Fix:**
- Backend create/update teacher now accepts `department_ids` array from frontend
- Extracts first element and stores as `department_id` + auto-resolves `faculty_id`
- Course page now uses backend `teacher_name` instead of local-only lookup

**Push Notifications:**
- Verified Android enhancements: default_sound, default_vibrate_timings, visibility

### March 6, 2026 (Session 4) - faculty_id Auto-Resolution
- Auto-populate `faculty_id` on students/teachers from department
- Migration endpoint `POST /api/admin/fix-faculty-ids`

### March 6, 2026 (Session 3) - Data Integrity Fixes
- Enrollment validation, department delete protection, teacher cross-department warning

### March 6, 2026 (Session 2) - Study Plans & Reports
- Study Plan with completion tracking, Excel export, permission-based access

### March 6, 2026 (Session 1) - Attendance & Import
- Attendance timing, Teacher Excel import, Bulk student actions

## Key API Endpoints
- `POST /api/teachers` - Accepts department_ids array, stores as department_id
- `PUT /api/teachers/{id}` - Same department_ids support
- `DELETE /api/departments/{id}` - Protected: checks ALL students/teachers/courses
- `DELETE /api/courses/{id}` - Protected: checks enrollments
- `POST /api/admin/fix-faculty-ids` - Data migration for existing records

## Navigation
- App uses SideMenu (hamburger button), NOT QuickNav component

## P1 - Next
- [ ] Backend refactoring: Split server.py into APIRouter modules
- [ ] Guide user to deploy and test all new features
- [ ] Guide user to run faculty_id data migration

## P2 - Future
- [ ] Teacher app update (SEPARATE PROJECT)
- [ ] Teacher delay report
- [ ] Improve reports | Activity logs UI
- [ ] Clean up QuickNav.tsx dead code

## Test Credentials
- Admin: admin / admin123 | Teacher: teacher180156 / teacher123 | Student: 234 / 123456
