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

## Credentials
- System Admin: admin / admin123

## Completed Features

### Phase 1-4 (March-April 2026)
- Granular RBAC, CRUD, Scheduling, Attendance, Reports, Excel imports
- Security (Rate limiting, ASGI headers, CORS)
- Performance (MongoDB indexes, GZip, Font optimization)

### Phase 5 - UI/UX Improvements (April 6, 2026)
- CSS Hover Tooltips on all action icons (23 files)
  - `accessibilityLabel` → `aria-label` in DOM → CSS `::after` tooltip
- Custom favicon (Ahgaff University logo)
- **Lectures page performance optimization**:
  - Backend: Pagination (50/page) + batch status update (`update_many`)
  - Frontend: "Load More" button + paginated API calls
  - API response: ~100ms (was timing out before)

## Architecture
```
/app/
├── backend/backend/
│   ├── server.py          # Core API (paginated lectures endpoint)
│   ├── models/
│   ├── routes/
│   └── services/
├── frontend/
│   ├── app/_layout.tsx    # Global CSS tooltips + favicon injection
│   ├── app/course-lectures.tsx  # Optimized with pagination
│   └── src/services/api.ts      # Updated getByCourse with pagination params
```

## Key Technical Decisions
- **Tooltip**: `accessibilityLabel` + CSS `[aria-label]::after` (RN Web forwards it)
- **Pagination**: Server-side with `page`/`per_page` params, client-side "Load More"
- **Batch status update**: `update_many` for expired lectures instead of per-lecture updates

## Pending Tasks

### P1 - Refactor server.py
- Split >10,000 line monolithic file into modular routes via FastAPI APIRouter

### P2 - Reports UI Enhancement
- Improve visual aesthetics of reporting dashboards

### Backlog
- Activity logs UI improvements
- Teacher/Student standalone mobile app updates
- Database migration guidance (MongoDB Atlas)
