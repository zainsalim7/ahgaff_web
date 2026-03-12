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

### API: Reschedule Lecture
- `PUT /api/lectures/{lecture_id}/reschedule`
- Body: `{"date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM"}`
- Requires: `reschedule_lecture` permission or admin role
- Sends push notifications to teacher and enrolled students
- Updates lecture date/time and marks as rescheduled

## What's Been Implemented

### March 12, 2026 (Session 7)
- **Reschedule Lecture Feature (Complete)**: Fixed frontend implementation by replacing broken AsyncStorage+fetch with api.put() service. Added HTML date picker for web platform. Full end-to-end feature now working.

### March 8, 2026 (Session 6)
- **Teacher Delays Report**: Complete frontend page at `/report-teacher-delays` with summary cards, department filter, expandable teacher details, and Excel export
- **Reports page integration**: Added "تأخر المعلمين" card to reports grid
- **Side menu integration**: Added teacher delays link in side menu under reports section
- **New permission**: `REPORT_TEACHER_DELAYS` added to permissions system
- **Bug fixes**: Fixed TypeError when user permissions is None, course report 500 error, formatDate crash, hooks crash, Excel import whitespace, RBAC issues, time validation, date localization
- **Calendar update**: Added Friday, expanded time slots to 1:00-0:00 with 15-min intervals
- **Reschedule Lecture Backend**: Created endpoint and RESCHEDULE_LECTURE permission

### March 8, 2026 (Session 5)
- **Role separation**: Admin no longer auto-inherits teacher-only permissions
- **Attendance edit API**: PUT endpoint with permission check + activity logging
- **Edit UI**: Modal in course-students page with status options + reason
- **Permission enforcement**: Backend + Frontend permission checks
- **Default roles updated**: Admin role excludes teacher-only perms; Dean keeps edit_attendance
- **Search improvements**: Prioritized results, max height dropdown
- **Faculty display**: department cards show faculty_name
- **Delete fixes**: Modal dialogs, enrollment protection
- **Teacher-department link**: Backend accepts department_ids array

### Previous Sessions
- Session 4: faculty_id auto-resolution
- Session 3: Data integrity fixes
- Session 2: Study Plans & Reports
- Session 1: Attendance timing, Teacher Excel import

## P0 - Next
- [x] Complete Reschedule Lecture feature (DONE - Session 7)
- [ ] Deploy and test all features on production
- [ ] Run faculty_id data migration from admin panel

## P1 - Future
- [ ] Backend refactoring: Split server.py into APIRouter modules
- [ ] Improve Reports UI/UX

## P2 - Backlog
- [ ] Teacher app update (SEPARATE PROJECT)
- [ ] Activity logs UI improvements

## Test Credentials
- Admin: admin / admin123 | Dean: dean / dean123 | Teacher: teacher180156 / teacher123 | Student: 234 / 123456
