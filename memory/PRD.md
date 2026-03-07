# طالب الأحقاف - Student & Teacher Management System PRD

## Hierarchy: University -> Faculties -> Departments -> Courses -> Students

## What's Been Implemented

### March 7, 2026 (Session 5) - Multiple Fixes
**Delete Fixes:**
- Department delete: Modal dialog (web compatible) + clear Arabic error messages
- Department card: separated clickable areas (fix event propagation on web)
- Backend: department DELETE checks ALL records (not just is_active)
- Backend: course DELETE checks enrollments before allowing deletion

**Teacher-Department Link Fix:**
- Backend create/update teacher accepts `department_ids` array from frontend
- Stores first element as `department_id` + auto-resolves `faculty_id`
- Course page uses backend `teacher_name` instead of local-only lookup

**Faculty-Department Display:**
- Department cards now show `faculty_name` (college name) in purple
- General settings "University" tab shows departments list under each faculty
- Settings page now fetches departments to display under faculties

**Attendance API Enhancement:**
- `/api/attendance/student/{id}` now returns `start_time` and `end_time` from lectures table

**Push Notifications:**
- Verified Android enhancements: default_sound, default_vibrate_timings, visibility

### Previous Sessions
- Session 4: faculty_id auto-resolution, migration endpoint
- Session 3: Data integrity fixes (enrollment validation, delete protection)
- Session 2: Study Plans & Reports with Excel export
- Session 1: Attendance timing, Teacher Excel import, Bulk student actions

## Key API Endpoints
- `POST /api/teachers` - Accepts department_ids array
- `PUT /api/teachers/{id}` - Same department_ids support  
- `GET /api/attendance/student/{id}` - Returns start_time, end_time from lectures
- `DELETE /api/departments/{id}` - Protected: checks ALL students/teachers/courses
- `DELETE /api/courses/{id}` - Protected: checks enrollments

## P1 - Next
- [ ] Backend refactoring: Split server.py into APIRouter modules
- [ ] Guide user to deploy and test all new features

## P2 - Future
- [ ] Teacher app update (SEPARATE PROJECT)
- [ ] Teacher delay report
- [ ] Improve reports | Activity logs UI

## Test Credentials
- Admin: admin / admin123 | Teacher: teacher180156 / teacher123 | Student: 234 / 123456
