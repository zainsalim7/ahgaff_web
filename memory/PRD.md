# طالب الأحقاف - Student & Teacher Management System PRD

## Hierarchy: University -> Faculties -> Departments -> Courses -> Students

## Role-Based Access Control (RBAC)

### Roles and Permissions:
- **Admin/Dean/Dept Head**: Full management (students, teachers, courses, reports, settings). NO direct attendance-taking.
- **Teacher** (separate app): Take attendance, manage lectures, view own courses/students.
- **Student** (separate app): View own attendance, schedule.

### Teacher-Only Permissions (admin does NOT auto-inherit):
- `record_attendance` - Take attendance
- `take_attendance` - Start attendance session  
- `manage_lectures` - Create/edit lectures

### Admin Auto-Inherits Everything Else:
- `manage_users`, `manage_departments`, `manage_courses`, `manage_students`
- `view_attendance`, `view_reports`, `export_reports`, etc.

## What's Been Implemented

### March 8, 2026 (Session 5 continued) - Role Separation
- **hasPermission**: Admin no longer auto-gets teacher-only permissions (record_attendance, take_attendance, manage_lectures)
- **Courses tab**: "محاضرات اليوم" hidden from admin (teacher-only)
- **SideMenu**: "محاضراتي" hidden from admin (teacherOnly flag)
- **Course card**: Attendance-taking button hidden from admin

### March 7-8, 2026 - Bug Fixes
- Department delete: Modal dialog, better error messages
- Teacher-Department link: Backend accepts department_ids array
- Search: Prioritized results, max height dropdown, min 2 chars
- Faculty display: faculty_name on department cards, departments under faculties
- Attendance API: start_time/end_time from lectures
- Push notification Android enhancements verified

### Previous Sessions
- Session 4: faculty_id auto-resolution, migration endpoint
- Session 3: Data integrity (enrollment validation, delete protection)
- Session 2: Study Plans & Reports with Excel export
- Session 1: Attendance timing, Teacher Excel import, Bulk student actions

## P1 - Next
- [ ] Backend refactoring: Split server.py into APIRouter modules
- [ ] Guide user to deploy and test
- [ ] Run faculty_id data migration

## P2 - Future
- [ ] Teacher app update (SEPARATE PROJECT)
- [ ] Teacher delay report
- [ ] Activity logs UI improvements

## Test Credentials
- Admin: admin / admin123 | Teacher: teacher180156 / teacher123 | Student: 234 / 123456
