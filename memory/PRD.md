# طالب الأحقاف - Student & Teacher Management System PRD

## Hierarchy: University -> Faculties -> Departments -> Courses -> Students

## Role-Based Access Control (RBAC)

### Teacher-Only Permissions (NOT auto-inherited by admin):
| Permission | Description |
|------------|-------------|
| `record_attendance` | تسجيل الحضور المباشر |
| `take_attendance` | بدء جلسة التحضير |
| `manage_lectures` | إدارة المحاضرات |
| `edit_attendance` | تعديل حالة حضور طالب بعد التحضير |

### How to Grant `edit_attendance`:
1. Admin → إدارة المستخدمين → اختيار المستخدم → إضافة صلاحية `edit_attendance`
2. OR: assign the "عميد كلية" role which includes `edit_attendance`

### API: Edit Attendance
- `PUT /api/attendance/{record_id}/status`
- Body: `{"status": "present|absent|late|excused", "reason": "optional"}`
- Requires: `edit_attendance` permission
- Tracks: original_status, edited_by, edited_at, edit_reason

## What's Been Implemented

### March 8, 2026 (Session 5)
- **Role separation**: Admin no longer auto-inherits teacher-only permissions
- **Attendance edit API**: PUT endpoint with permission check + activity logging
- **Edit UI**: Modal in course-students page with status options (present/absent/late/excused) + reason
- **Permission enforcement**: Backend has_permission() + Frontend hasPermission() both check TEACHER_ONLY_PERMISSIONS
- **Default roles updated**: Admin role excludes teacher-only perms; Dean keeps edit_attendance
- **Search improvements**: Prioritized results, max height dropdown
- **Faculty display**: department cards show faculty_name, faculties show departments
- **Delete fixes**: Modal dialogs, enrollment protection, better error messages
- **Teacher-department link**: Backend accepts department_ids array

### Previous Sessions
- Session 4: faculty_id auto-resolution
- Session 3: Data integrity fixes
- Session 2: Study Plans & Reports
- Session 1: Attendance timing, Teacher Excel import

### March 8, 2026 (Session 6)
- **Teacher Delays Report**: Complete frontend page at `/report-teacher-delays` with summary cards, department filter, expandable teacher details, and Excel export
- **Reports page integration**: Added "تأخر المعلمين" card to reports grid
- **Side menu integration**: Added teacher delays link in side menu under reports section
- **New permission**: `REPORT_TEACHER_DELAYS` added to permissions system
- **Bug fix**: Fixed TypeError when user permissions is None (server.py line 390-393)
- **Bug fix**: Fixed course report 500 error - added robust error handling for invalid enrollments/lectures data in `/reports/course/{id}/detailed`
- **Bug fix**: Frontend course report now shows error message with retry button instead of blank page on API failure
- **Bug fix**: Fixed URL param reading in report-course.tsx (`courseId` param now supported alongside `id`)
- **Bug fix**: Hardened ALL report endpoints (attendance-overview, absent-students, student-report, daily, warnings) with safe .get() access and try-except around ObjectId conversions to prevent 500 errors from corrupted data

## P0 - Next
- [ ] Deploy and test all features on production
- [ ] Run faculty_id data migration from admin panel

## P1 - Future
- [ ] Backend refactoring: Split server.py into APIRouter modules
- [ ] Improve Reports UI/UX

## P2 - Backlog
- [ ] Teacher app update (SEPARATE PROJECT)
- [ ] Activity logs UI improvements

## Test Credentials
- Admin: admin / admin123 | Teacher: teacher180156 / teacher123 | Student: 234 / 123456
