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
- Requires: `edit_attendance` permission

### API: Reschedule Lecture
- `PUT /api/lectures/{lecture_id}/reschedule`
- Body: `{"date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM"}`
- Requires: `reschedule_lecture` permission or admin role
- Validates: future date only, no time conflicts with teacher's other lectures

## What's Been Implemented

### March 13, 2026 (Session 7 continued)
- **Date/Day Mismatch Fix**: Removed day-selection buttons from AddLectureModal. Uses date picker only. Shows day name automatically after selection.
- **Teacher Lecture Conflict Detection**: Added `check_teacher_lecture_conflict()` to prevent overlapping lectures for the same teacher across all their courses. Applied to:
  - `POST /api/lectures` (single lecture creation) - rejects with conflict message
  - `POST /api/lectures/generate-semester` (bulk generation) - skips conflicting slots
  - `PUT /api/lectures/{id}/reschedule` - rejects with conflict message
- **Reschedule date restriction**: Both frontend (min date on date picker) and backend reject past dates
- **Reschedule modal day name**: Shows day name after selecting date in reschedule modal

### March 12, 2026 (Session 7)
- **Reschedule Lecture Feature (Complete)**: Fixed frontend AsyncStorage bug, uses api.put() now

### March 8, 2026 (Session 6)
- Teacher Delays Report, Bug fixes (TypeError, course report 500, formatDate crash, hooks crash, Excel import, RBAC)
- Calendar update: Added Friday, expanded time slots
- Reschedule Lecture Backend

### Previous Sessions
- Session 5: Role separation, Attendance edit API, Search improvements
- Session 4: faculty_id auto-resolution
- Session 3: Data integrity fixes
- Session 2: Study Plans & Reports
- Session 1: Attendance timing, Teacher Excel import

## P0 - Next
- [x] Complete Reschedule Lecture feature (DONE)
- [x] Fix date/day mismatch (DONE)
- [x] Teacher lecture conflict detection (DONE)
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
