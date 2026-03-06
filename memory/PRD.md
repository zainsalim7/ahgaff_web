# طالب الأحقاف - Student & Teacher Management System PRD

## Hierarchy: University → Faculties → Departments → Courses → Students

## What's Been Implemented

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

## P1 - Next
- [ ] Teacher app update (SEPARATE PROJECT)
- [ ] User builds APKs
- [ ] Teacher delay report

## P2 - Future
- [ ] Improve reports | Activity logs UI | Backend refactoring

## Test Credentials
- Admin: admin / admin123 | Teacher: teacher180156 / teacher123 | Student: 234 / 123456
