# طالب الأحقاف - Student & Teacher Management System PRD

## Original Problem Statement
Student/teacher management system for Ahgaff University with 3 apps (Student, Teacher, Admin) sharing one backend.

## Hierarchy: University → Faculties → Departments → Courses → Students

## What's Been Implemented

### March 6, 2026 (Session 3) - Data Integrity Fixes
1. **Enrollment Validation**: Block students from enrolling in courses outside their department. Level mismatch shows warning but doesn't block.
2. **Semester Linking**: All courses linked to active semester. New courses auto-link.
3. **Department Delete Protection**: Can't delete department with active students/teachers/courses.
4. **Teacher Cross-Department Warning**: Warning shown when assigning teacher to course in different department (allowed but flagged).
5. **Frontend warnings**: Enrollment and course forms show backend warnings via alerts.

### March 6, 2026 (Session 2) - Study Plans & Reports
- Study Plan system with completion tracking
- Lesson completion report with Excel export
- Permission-based report access

### March 6, 2026 (Session 1) - Attendance & Import
- Attendance timing system (configurable per-faculty)
- Teacher import from Excel with auto-activation
- Bulk student actions in selection mode

### Previous Sessions
- Full app, Teacher/Student apps, FCM, Standalone packages

## Key Validations
- Enrollment: blocked if student.department_id != course.department_id
- Department delete: blocked if has students/teachers/courses
- Faculty delete: blocked if has departments
- Course create/update: warning if teacher from different department
- Courses: auto-linked to active semester

## P1 - Next
- [ ] Teacher app: study plan UI + lesson title (SEPARATE PROJECT)
- [ ] User builds APKs
- [ ] Teacher delay report

## P2 - Future
- [ ] Improve reports | Activity logs UI | Backend refactoring

## Test Credentials
- Admin: admin / admin123 | Teacher: teacher180156 / teacher123 | Student: 234 / 123456
