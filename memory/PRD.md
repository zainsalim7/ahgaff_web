# طالب الأحقاف - Student & Teacher Management System PRD

## Hierarchy: University -> Faculties -> Departments -> Courses -> Students

## RBAC - Permission-Based Access (Fixed March 14, 2026)

### ALL 78 endpoints now check actual permissions, not just admin role
- Users: manage_users
- Students: manage_students
- Teachers: manage_teachers
- Courses: manage_courses, add_course, edit_course, delete_course
- Enrollments: manage_enrollments, manage_courses
- Departments: manage_departments
- Faculties: manage_faculties
- Lectures: manage_lectures, view_lectures
- Reports: view_reports, export_reports
- Import/Export: import_data, export_reports
- Schedule: manage_courses
- Settings: manage_courses
- Trash: manage_courses, manage_students, manage_teachers

### Multi-Section Course Creation
- Optional "عدد الشعب" field (1-10) creates: أ, ب, ج, د, ه, و, ز, ح, ط, ي

## What's Been Implemented

### March 14, 2026 (Session 8)
- **COMPREHENSIVE Permission fix**: Fixed 78 endpoints that only checked admin role. Now all check actual permissions
- **Course permissions**: add_course, edit_course, delete_course, manage_courses
- **Multi-section creation**: Added section count field to AddCourseModal
- **Route conflict fix**: Renamed standalone courses.tsx to avoid conflict with (tabs)/courses.tsx
- **Day buttons removed**: AddLectureModal uses date picker only
- **Friday added**: schedule.tsx DAYS array includes Friday
- **Schedule redesign**: Complete UI overhaul with timeline-style cards
- **Reschedule improvements**: Future dates only + manual time input
- **Teacher conflict detection**: Prevents overlapping lectures
- **Status change removed**: Only reschedule + cancel + delete remain

### Previous Sessions (1-7)
- Reschedule Feature, Teacher Delays Report, Role separation, Attendance edit
- Study Plans, Reports, Data integrity, Excel import, Faculty management

### March 26, 2026 (Session 9)
- **Generate Lectures UI Fix**: Replaced horizontal scroll time buttons with `<select>` dropdown menus for web. All 93 time slots now available (was previously limited to 20 via `.slice(0,20)`).
- **Maintenance Buttons Fix**: Made maintenance tools (fix roles, fix faculty IDs, fix courses semester) always visible for admin users without requiring faculty selection.

## P0 - Next
- [x] Fix ALL permission checks (DONE - 78 endpoints)
- [x] Fix Generate Lectures time UI (DONE - dropdown + all hours)
- [x] Maintenance buttons accessible without faculty selection (DONE)
- [ ] Deploy and test all features on production
- [ ] Run faculty_id data migration

## P1 - Future
- [ ] Backend refactoring: Split server.py into APIRouter modules
- [ ] Improve Reports UI/UX

## P2 - Backlog
- [ ] Teacher app update (SEPARATE PROJECT)

## Test Credentials
- Admin: admin / admin123 | Dean (Salim): Salim / 123456 | Teacher: teacher180156 / teacher123 | Student: 234 / 123456
