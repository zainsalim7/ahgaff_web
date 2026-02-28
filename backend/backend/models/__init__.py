"""
نماذج البيانات - Models
ملف التهيئة للوحدة
"""
from models.permissions import (
    UserRole, Permission, DEFAULT_PERMISSIONS, ALL_PERMISSIONS,
    FULL_PERMISSION_MAPPING, ScopeType, user_has_permission
)
from models.users import (
    UserBase, UserCreate, UserLogin, UserResponse, Token,
    UserPermissionScope, UserPermissionsUpdate, UserPermissionResponse
)
from models.roles import RoleCreate, RoleUpdate, RoleResponse
from models.departments import DepartmentBase, DepartmentCreate, DepartmentResponse
from models.university import (
    UniversityBase, UniversityCreate, UniversityUpdate, UniversityResponse,
    FacultyBase, FacultyCreate, FacultyUpdate, FacultyResponse
)
from models.students import StudentBase, StudentCreate, StudentResponse
from models.teachers import TeacherBase, TeacherCreate, TeacherUpdate, TeacherResponse
from models.courses import CourseBase, CourseCreate, CourseResponse, AttendanceStatus
from models.lectures import (
    LectureStatus, ACTIVE_LECTURE_STATUSES,
    LectureCreate, LectureUpdate, LectureResponse, GenerateLecturesRequest
)
from models.attendance import (
    AttendanceRecord, AttendanceSessionCreate, AttendanceResponse,
    AttendanceStats, SingleAttendanceCreate, OfflineSyncData
)
from models.semesters import SemesterStatus, SemesterCreate, SemesterUpdate, SemesterResponse
from models.settings import (
    SemesterDates, AcademicYearConfig, SystemSettings, SettingsUpdate
)
from models.notifications import NotificationType, NotificationBase, NotificationCreate, NotificationResponse
from models.activity_logs import ActivityLogType, ActivityLog, ActivityLogResponse
from models.enrollments import EnrollmentCreate, EnrollmentResponse
from models.auth import (
    ActivateStudentAccount, ChangePasswordRequest, ForceChangePasswordRequest
)
