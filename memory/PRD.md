# Ahgaff University - Student & Teacher Management System

## Original Problem Statement
Comprehensive student and teacher management system for Ahgaff University with shared backend, admin web application, and standalone mobile apps. Focus on RBAC, schedule management, attendance tracking, and system administration.

## Core Requirements
- Full-featured admin web application with granular RBAC
- Management of Faculties, Departments, Courses, Teachers, and Students
- Lecture scheduling, rescheduling, and conflict detection
- Bulk actions, data imports (Excel), and maintenance tools
- Modern, clean, and intuitive Arabic UI
- Fast performance with caching, DB indexes, and GZip compression
- File and image storage using Emergent Object Storage

## Tech Stack
- Backend: FastAPI + MongoDB Atlas
- Frontend: React/Expo (Web + Mobile)
- Auth: JWT-based
- Storage: Emergent Object Storage
- Notifications: Firebase Cloud Messaging
- Deployment: Railway

## User Personas
- System Admin: Full access
- Dean: Faculty-scoped access
- Department Head: Department-scoped access
- Teacher: Own courses/lectures access
- Student: Own attendance/courses access

## Credentials
- System Admin: admin / admin123

## Completed Features

### Phase 1 - Core (March 2026)
- Granular RBAC (78 endpoints with has_permission checks)
- Faculty, Department, Course, Teacher, Student CRUD
- Lecture scheduling with conflict detection
- Course section auto-generation (A, B, C...)
- Attendance tracking (QR + Manual)
- Weekly schedule page (modern timeline UI)
- Reschedule/Cancel lectures
- Custom roles with scope filters

### Phase 2 - Data Management (March 2026)
- Excel import for Students, Courses, Lectures
- Bulk actions (delete, status change)
- Smart Copy/Move students between courses
- Safe-delete with trash/restore
- Template downloads for imports

### Phase 3 - Reports (March 2026)
- Daily attendance report
- Course detailed report
- Student attendance report
- Teacher workload report
- Teacher delays report
- Absent students report
- Warnings & deprivations report
- Attendance overview report
- Lesson completion report
- Teacher summary report
- All reports: PDF + Excel export

### Phase 4 - Performance & Security (April 2026)
- Login rate limiting
- ASGI security headers
- Specific CORS configuration
- Font optimization (Cairo + Ionicons)
- MongoDB indexes
- GZip compression

### Phase 5 - UI/UX Improvements (April 2026)
- Role-based courses page with smart filters
- Students/Lectures counts on course cards
- Smart modal search with sections
- Moved imports to add-course page
- **CSS Hover Tooltips on all action icons (April 6, 2026)**
  - Used `accessibilityLabel` prop (renders as `aria-label` in DOM)
  - CSS `::after` pseudo-element with `content: attr(aria-label)` for tooltip display
  - Dark tooltip bubble with arrow, fade-in animation
  - Applied across 23 files covering all action buttons (edit, delete, export, etc.)

## Architecture
```
/app/
├── backend/
│   └── backend/
│       ├── server.py             # Monolithic (>10k lines - NEEDS REFACTORING)
│       ├── models/
│       ├── routes/
│       └── services/
├── frontend/
│   ├── app/
│   │   ├── _layout.tsx           # Global CSS tooltip injection
│   │   ├── (tabs)/              # Tab navigation pages
│   │   ├── report-*.tsx         # Report pages (10 files)
│   │   └── *.tsx                # Feature pages
│   └── src/components/
```

## Key Technical Decisions
- **Tooltip Implementation**: Uses `accessibilityLabel` (→ `aria-label` in DOM) + CSS `::after` pseudo-elements. React Native Web does NOT forward `title` or `data-*` attributes but DOES forward `accessibilityLabel`.
- **Font Stack**: `Cairo` for Arabic text, with `Ionicons` and icon font families preserved.
- **Scope Filtering**: `get_user_scope_filter()` auto-restricts data by faculty/department.
- **Granular RBAC**: Always use `has_permission(user, Permission.XYZ)`, never hardcode role checks.

## Pending Tasks

### P1 - Refactor server.py
- Split >10,000 line monolithic file into modular routes
- Use FastAPI APIRouter pattern
- Move to /app/backend/backend/routes/

### P2 - Reports UI Enhancement
- Improve visual aesthetics of reporting dashboards

### Backlog
- Activity logs UI improvements
- Teacher/Student standalone mobile app updates
- Database migration guidance (MongoDB Atlas - already recommended)
- Production maintenance tasks (Fix Custom Roles button)
