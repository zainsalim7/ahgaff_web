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

### April 1, 2026 (Session 10)
- **Performance Optimizations**: Added GZip compression, MongoDB indexes (20+ indexes), server-side caching (5min TTL)
- **RBAC Fix**: Added DEFAULT_PERMISSIONS for dean, department_head, registrar, registration_manager roles
- **sync_default_roles**: Now auto-creates missing role documents in DB on startup (8 roles total)
- **University Logo Upload**: Added file upload via Emergent Object Storage
- **Teaching Load Fix**: Changed weekly calculation to use full weeks only (// instead of /)
- **Course Import**: Added Excel import for courses with template download. Supports multi-section courses (أ، ب، ج...)
- **Teacher Template Update**: Enhanced teacher template with specialization, phone, email fields
- **Multi-Course Student Copy**: Updated bulk-copy endpoint to accept multiple target_course_ids
- **Import Courses Moved**: Moved Excel import feature from /courses to /add-course page

## P0 - Next
- [x] Fix ALL permission checks (DONE - 78 endpoints)
- [x] Fix Generate Lectures time UI (DONE - dropdown + all hours)
- [x] Maintenance buttons accessible without faculty selection (DONE)
- [x] Add default permissions for all roles (DONE - dean, dept_head, registrar, reg_manager)
- [x] Performance optimizations (DONE - GZip, indexes, caching)
- [x] University logo upload (DONE - Emergent Object Storage)
- [x] Fix teaching load calculation (DONE - full weeks only)
- [x] Move import courses from /courses to /add-course (DONE - April 1, 2026)
- [x] Fix teacher department_ids and academic_title not persisting on edit (DONE - April 1, 2026)
- [x] Add Cairo Arabic web font for Chrome compatibility (DONE - April 1, 2026)
- [x] Add students_count to courses API and display in UI (DONE - April 1, 2026)
- [x] Add lectures_count to courses API and display in UI (DONE - April 2, 2026)
- [x] Fix bulk delete courses (use safe-delete) (DONE - April 2, 2026)
- [x] Fix bulk delete lectures (window.confirm for web) (DONE - April 2, 2026)
- [x] Add search bar + section label in copy/move students modal (DONE - April 2, 2026)
- [x] Import lectures from Excel (template + import endpoint + UI) (DONE - April 2, 2026)
- [x] Security improvements: Rate Limiting, Security Headers, CORS, Token expiry (DONE - April 3, 2026)
- [ ] Deploy and test all features on production
- [ ] Run faculty_id data migration

## P1 - Future
- [ ] Backend refactoring: Split server.py into APIRouter modules
- [ ] Improve Reports UI/UX

## P2 - Backlog
- [ ] Teacher app update (SEPARATE PROJECT)

## Test Credentials
- Admin: admin / admin123 | Dean (Salim): Salim / 123456 | Teacher: teacher180156 / teacher123 | Student: 234 / 123456
