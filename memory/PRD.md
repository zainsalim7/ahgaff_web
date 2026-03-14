# طالب الأحقاف - Student & Teacher Management System PRD

## Hierarchy: University -> Faculties -> Departments -> Courses -> Students

## Role-Based Access Control (RBAC)

### Permissions now properly checked (not just admin role):
| Endpoint | Permissions |
|----------|------------|
| `POST /api/courses` | admin OR manage_courses OR add_course |
| `PUT /api/courses/{id}` | admin OR manage_courses OR edit_course |
| `DELETE /api/courses/{id}` | admin OR manage_courses OR delete_course |

### Multi-Section Course Creation
- When creating a course, user can optionally specify "عدد الشعب" (1-10)
- System creates multiple courses with sections أ, ب, ج, د, ه, و, ز, ح, ط, ي
- If left empty, creates a single course without section label

## What's Been Implemented

### March 14, 2026 (Session 8)
- **Permission fix**: Course create/edit/delete now check actual permissions, not just admin role
- **Multi-section creation**: Added section count field to AddCourseModal for creating multiple sections at once
- **Day buttons removed**: AddLectureModal uses date picker only (no day-selection buttons)
- **Friday added**: schedule.tsx DAYS array now includes Friday
- **Reschedule improvements**: Future dates only + manual time input + day name display
- **Teacher conflict detection**: Prevents overlapping lectures for same teacher across all courses
- **Status change removed**: Removed "change status" button, keeping only reschedule + cancel + delete

### March 12-13, 2026 (Session 7)
- Reschedule Lecture Feature complete, Date/Day mismatch fixes

### March 8, 2026 (Session 6)
- Teacher Delays Report, Bug fixes, Calendar update, Reschedule Backend

### Previous Sessions (1-5)
- Attendance, Excel import, Study Plans, Reports, Role separation, Data integrity

## P0 - Next
- [x] Complete Reschedule Lecture feature (DONE)
- [x] Fix permissions for course management (DONE)
- [x] Multi-section course creation (DONE)
- [ ] Deploy and test all features on production
- [ ] Run faculty_id data migration from admin panel

## P1 - Future
- [ ] Backend refactoring: Split server.py into APIRouter modules
- [ ] Improve Reports UI/UX

## P2 - Backlog
- [ ] Teacher app update (SEPARATE PROJECT)
- [ ] Activity logs UI improvements

## Test Credentials
- Admin: admin / admin123 | Dean (Salim): Salim / 123456 | Teacher: teacher180156 / teacher123 | Student: 234 / 123456
