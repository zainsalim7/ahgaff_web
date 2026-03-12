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

### API: Edit Attendance
- `PUT /api/attendance/{record_id}/status`
- Body: `{"status": "present|absent|late|excused", "reason": "optional"}`
- Requires: `edit_attendance` permission

### API: Reschedule Lecture
- `PUT /api/lectures/{lecture_id}/reschedule`
- Body: `{"date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM"}`
- Requires: `reschedule_lecture` permission or admin role

## What's Been Implemented

### March 12, 2026 (Session 7)
- **Reschedule Lecture Feature (Complete)**: Fixed frontend AsyncStorage bug, uses api.put() now
- **Date/Day Mismatch Fix**: Removed day-selection buttons from AddLectureModal. Now uses only date picker (calendar) to avoid timezone-related day mismatches. Shows day name automatically after date selection.

### March 8, 2026 (Session 6)
- Teacher Delays Report, Reports integration, Side menu integration
- Bug fixes: TypeError, course report 500, formatDate crash, hooks crash, Excel import, RBAC
- Calendar update: Added Friday, expanded time slots
- Reschedule Lecture Backend: Created endpoint and permission

### March 8, 2026 (Session 5)
- Role separation, Attendance edit API, Edit UI, Permission enforcement
- Default roles updated, Search improvements, Faculty display, Delete fixes

### Previous Sessions
- Session 4: faculty_id auto-resolution
- Session 3: Data integrity fixes
- Session 2: Study Plans & Reports
- Session 1: Attendance timing, Teacher Excel import

## P0 - Next
- [x] Complete Reschedule Lecture feature (DONE)
- [x] Fix date/day mismatch in AddLectureModal (DONE)
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
