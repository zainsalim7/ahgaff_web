from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum
import uuid
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from bson import ObjectId
import json
import pandas as pd
from io import BytesIO

# PDF imports
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
import arabic_reshaper
from bidi.algorithm import get_display

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# JWT Configuration
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer()

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI(title="نظام حضور جامعة الأحقاف")

# ==================== Root Health Check Endpoints ====================
# Health check on root path for Railway
@app.get("/health")
async def root_health_check():
    """Root health check endpoint for Railway deployment"""
    return {"status": "ok"}

@app.get("/")
async def root():
    """Root endpoint"""
    return {"status": "ok", "message": "نظام حضور جامعة الأحقاف"}

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ==================== API Health Check Endpoint ====================
@api_router.get("/health")
async def api_health_check():
    """API health check endpoint"""
    return {"status": "ok", "message": "Server is running"}

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== Models ====================

class UserRole:
    ADMIN = "admin"
    TEACHER = "teacher"
    STUDENT = "student"
    EMPLOYEE = "employee"

# نظام الصلاحيات - كل صلاحية تمثل إجراء معين في النظام
class Permission:
    # ==================== صلاحيات الأقسام (Departments) ====================
    MANAGE_DEPARTMENTS = "manage_departments"       # إدارة كاملة (للتوافق)
    VIEW_DEPARTMENTS = "view_departments"           # عرض الأقسام
    ADD_DEPARTMENT = "add_department"               # إضافة قسم
    EDIT_DEPARTMENT = "edit_department"             # تعديل قسم
    DELETE_DEPARTMENT = "delete_department"         # حذف قسم
    
    # ==================== صلاحيات المقررات (Courses) ====================
    MANAGE_COURSES = "manage_courses"               # إدارة كاملة (للتوافق)
    VIEW_COURSES = "view_courses"                   # عرض المقررات
    ADD_COURSE = "add_course"                       # إضافة مقرر
    EDIT_COURSE = "edit_course"                     # تعديل مقرر
    DELETE_COURSE = "delete_course"                 # حذف مقرر
    
    # ==================== صلاحيات الطلاب (Students) ====================
    MANAGE_STUDENTS = "manage_students"             # إدارة كاملة (للتوافق)
    VIEW_STUDENTS = "view_students"                 # عرض الطلاب
    ADD_STUDENT = "add_student"                     # إضافة طالب
    EDIT_STUDENT = "edit_student"                   # تعديل طالب
    DELETE_STUDENT = "delete_student"               # حذف طالب
    IMPORT_STUDENTS = "import_students"             # استيراد طلاب من Excel
    
    # ==================== صلاحيات المعلمين (Teachers) ====================
    MANAGE_TEACHERS = "manage_teachers"             # إدارة كاملة (للتوافق)
    VIEW_TEACHERS = "view_teachers"                 # عرض المعلمين
    ADD_TEACHER = "add_teacher"                     # إضافة معلم
    EDIT_TEACHER = "edit_teacher"                   # تعديل معلم
    DELETE_TEACHER = "delete_teacher"               # حذف معلم
    
    # ==================== صلاحيات المستخدمين (Users) ====================
    MANAGE_USERS = "manage_users"                   # إدارة كاملة (للتوافق)
    VIEW_USERS = "view_users"                       # عرض المستخدمين
    ADD_USER = "add_user"                           # إضافة مستخدم
    EDIT_USER = "edit_user"                         # تعديل مستخدم
    DELETE_USER = "delete_user"                     # حذف مستخدم
    RESET_PASSWORD = "reset_password"               # إعادة تعيين كلمة المرور
    
    # ==================== صلاحيات الكليات (Faculties) ====================
    MANAGE_FACULTIES = "manage_faculties"           # إدارة كاملة (للتوافق)
    VIEW_FACULTIES = "view_faculties"               # عرض الكليات
    ADD_FACULTY = "add_faculty"                     # إضافة كلية
    EDIT_FACULTY = "edit_faculty"                   # تعديل كلية
    DELETE_FACULTY = "delete_faculty"               # حذف كلية
    
    # ==================== صلاحيات المحاضرات (Lectures) ====================
    MANAGE_LECTURES = "manage_lectures"             # إدارة كاملة (للتوافق)
    VIEW_LECTURES = "view_lectures"                 # عرض المحاضرات
    ADD_LECTURE = "add_lecture"                     # إضافة محاضرة
    EDIT_LECTURE = "edit_lecture"                   # تعديل محاضرة
    DELETE_LECTURE = "delete_lecture"               # حذف محاضرة
    
    # ==================== صلاحيات التسجيل (Enrollments) ====================
    MANAGE_ENROLLMENTS = "manage_enrollments"       # إدارة كاملة (للتوافق)
    VIEW_ENROLLMENTS = "view_enrollments"           # عرض التسجيلات
    ADD_ENROLLMENT = "add_enrollment"               # تسجيل طالب في مقرر
    DELETE_ENROLLMENT = "delete_enrollment"         # إلغاء تسجيل طالب
    
    # ==================== صلاحيات الحضور (Attendance) ====================
    RECORD_ATTENDANCE = "record_attendance"         # تسجيل الحضور
    TAKE_ATTENDANCE = "take_attendance"             # أخذ الحضور
    VIEW_ATTENDANCE = "view_attendance"             # عرض الحضور
    EDIT_ATTENDANCE = "edit_attendance"             # تعديل الحضور
    
    # ==================== صلاحيات الإشعارات (Notifications) ====================
    SEND_NOTIFICATIONS = "send_notifications"       # إرسال إشعارات وإنذارات للطلاب
    
    # ==================== صلاحيات التقارير العامة ====================
    VIEW_REPORTS = "view_reports"                   # عرض جميع التقارير (للتوافق)
    VIEW_STATISTICS = "view_statistics"             # عرض الإحصائيات
    EXPORT_REPORTS = "export_reports"               # تصدير التقارير
    IMPORT_DATA = "import_data"                     # استيراد البيانات
    
    # ==================== صلاحيات التقارير الفردية ====================
    REPORT_ATTENDANCE_OVERVIEW = "report_attendance_overview"  # تقرير الحضور الشامل
    REPORT_ABSENT_STUDENTS = "report_absent_students"          # تقرير الطلاب المتغيبين
    REPORT_WARNINGS = "report_warnings"                        # تقرير الإنذارات والحرمان
    REPORT_DAILY = "report_daily"                              # التقرير اليومي
    REPORT_STUDENT = "report_student"                          # تقرير طالب
    REPORT_COURSE = "report_course"                            # تقرير مقرر
    REPORT_TEACHER_WORKLOAD = "report_teacher_workload"        # تقرير نصاب المدرس
    
    # ==================== صلاحيات الأدوار والإعدادات ====================
    MANAGE_ROLES = "manage_roles"                   # إدارة الأدوار
    MANAGE_SETTINGS = "manage_settings"             # إدارة الإعدادات
    MANAGE_SEMESTERS = "manage_semesters"           # إدارة الفصول الدراسية

# الصلاحيات الافتراضية لكل دور
DEFAULT_PERMISSIONS = {
    UserRole.ADMIN: [
        Permission.MANAGE_USERS,
        Permission.MANAGE_DEPARTMENTS,
        Permission.MANAGE_COURSES,
        Permission.MANAGE_STUDENTS,
        Permission.RECORD_ATTENDANCE,
        Permission.VIEW_ATTENDANCE,
        Permission.EDIT_ATTENDANCE,
        Permission.VIEW_REPORTS,
        Permission.EXPORT_REPORTS,
        Permission.IMPORT_DATA,
        Permission.MANAGE_LECTURES,
        Permission.VIEW_LECTURES,
        # صلاحيات التقارير الفردية
        Permission.REPORT_ATTENDANCE_OVERVIEW,
        Permission.REPORT_ABSENT_STUDENTS,
        Permission.REPORT_WARNINGS,
        Permission.REPORT_DAILY,
        Permission.REPORT_STUDENT,
        Permission.REPORT_COURSE,
        Permission.REPORT_TEACHER_WORKLOAD,
    ],
    UserRole.TEACHER: [
        Permission.RECORD_ATTENDANCE,
        Permission.VIEW_ATTENDANCE,
        Permission.VIEW_REPORTS,
        Permission.EXPORT_REPORTS,
        Permission.MANAGE_LECTURES,
        Permission.VIEW_LECTURES,
        # تقارير محددة للمدرس
        Permission.REPORT_ATTENDANCE_OVERVIEW,
        Permission.REPORT_ABSENT_STUDENTS,
        Permission.REPORT_COURSE,
    ],
    UserRole.EMPLOYEE: [
        Permission.MANAGE_STUDENTS,
        Permission.VIEW_ATTENDANCE,
        Permission.VIEW_REPORTS,
        Permission.EXPORT_REPORTS,
        Permission.IMPORT_DATA,
        Permission.VIEW_LECTURES,
        # تقارير محددة للموظف
        Permission.REPORT_STUDENT,
        Permission.REPORT_ABSENT_STUDENTS,
        Permission.REPORT_WARNINGS,
    ],
    UserRole.STUDENT: [
        Permission.VIEW_ATTENDANCE,
        Permission.VIEW_LECTURES,
        # تقرير الطالب الشخصي فقط
        Permission.REPORT_STUDENT,
    ],
}

# قائمة جميع الصلاحيات المتاحة للعرض في الواجهة
ALL_PERMISSIONS = [
    # ==================== صلاحيات الأقسام ====================
    {"key": Permission.MANAGE_DEPARTMENTS, "label": "إدارة كاملة للأقسام", "category": "الأقسام"},
    {"key": Permission.VIEW_DEPARTMENTS, "label": "عرض الأقسام", "category": "الأقسام"},
    {"key": Permission.ADD_DEPARTMENT, "label": "إضافة قسم", "category": "الأقسام"},
    {"key": Permission.EDIT_DEPARTMENT, "label": "تعديل قسم", "category": "الأقسام"},
    {"key": Permission.DELETE_DEPARTMENT, "label": "حذف قسم", "category": "الأقسام"},
    
    # ==================== صلاحيات المقررات ====================
    {"key": Permission.MANAGE_COURSES, "label": "إدارة كاملة للمقررات", "category": "المقررات"},
    {"key": Permission.VIEW_COURSES, "label": "عرض المقررات", "category": "المقررات"},
    {"key": Permission.ADD_COURSE, "label": "إضافة مقرر", "category": "المقررات"},
    {"key": Permission.EDIT_COURSE, "label": "تعديل مقرر", "category": "المقررات"},
    {"key": Permission.DELETE_COURSE, "label": "حذف مقرر", "category": "المقررات"},
    
    # ==================== صلاحيات الطلاب ====================
    {"key": Permission.MANAGE_STUDENTS, "label": "إدارة كاملة للطلاب", "category": "الطلاب"},
    {"key": Permission.VIEW_STUDENTS, "label": "عرض الطلاب", "category": "الطلاب"},
    {"key": Permission.ADD_STUDENT, "label": "إضافة طالب", "category": "الطلاب"},
    {"key": Permission.EDIT_STUDENT, "label": "تعديل طالب", "category": "الطلاب"},
    {"key": Permission.DELETE_STUDENT, "label": "حذف طالب", "category": "الطلاب"},
    {"key": Permission.IMPORT_STUDENTS, "label": "استيراد طلاب من Excel", "category": "الطلاب"},
    
    # ==================== صلاحيات المعلمين ====================
    {"key": Permission.MANAGE_TEACHERS, "label": "إدارة كاملة للمعلمين", "category": "المعلمين"},
    {"key": Permission.VIEW_TEACHERS, "label": "عرض المعلمين", "category": "المعلمين"},
    {"key": Permission.ADD_TEACHER, "label": "إضافة معلم", "category": "المعلمين"},
    {"key": Permission.EDIT_TEACHER, "label": "تعديل معلم", "category": "المعلمين"},
    {"key": Permission.DELETE_TEACHER, "label": "حذف معلم", "category": "المعلمين"},
    
    # ==================== صلاحيات المستخدمين ====================
    {"key": Permission.MANAGE_USERS, "label": "إدارة كاملة للمستخدمين", "category": "المستخدمين"},
    {"key": Permission.VIEW_USERS, "label": "عرض المستخدمين", "category": "المستخدمين"},
    {"key": Permission.ADD_USER, "label": "إضافة مستخدم", "category": "المستخدمين"},
    {"key": Permission.EDIT_USER, "label": "تعديل مستخدم", "category": "المستخدمين"},
    {"key": Permission.DELETE_USER, "label": "حذف مستخدم", "category": "المستخدمين"},
    {"key": Permission.RESET_PASSWORD, "label": "إعادة تعيين كلمة المرور", "category": "المستخدمين"},
    
    # ==================== صلاحيات الكليات ====================
    {"key": Permission.MANAGE_FACULTIES, "label": "إدارة كاملة للكليات", "category": "الكليات"},
    {"key": Permission.VIEW_FACULTIES, "label": "عرض الكليات", "category": "الكليات"},
    {"key": Permission.ADD_FACULTY, "label": "إضافة كلية", "category": "الكليات"},
    {"key": Permission.EDIT_FACULTY, "label": "تعديل كلية", "category": "الكليات"},
    {"key": Permission.DELETE_FACULTY, "label": "حذف كلية", "category": "الكليات"},
    
    # ==================== صلاحيات المحاضرات ====================
    {"key": Permission.MANAGE_LECTURES, "label": "إدارة كاملة للمحاضرات", "category": "المحاضرات"},
    {"key": Permission.VIEW_LECTURES, "label": "عرض المحاضرات", "category": "المحاضرات"},
    {"key": Permission.ADD_LECTURE, "label": "إضافة محاضرة", "category": "المحاضرات"},
    {"key": Permission.EDIT_LECTURE, "label": "تعديل محاضرة", "category": "المحاضرات"},
    {"key": Permission.DELETE_LECTURE, "label": "حذف محاضرة", "category": "المحاضرات"},
    
    # ==================== صلاحيات التسجيل ====================
    {"key": Permission.MANAGE_ENROLLMENTS, "label": "إدارة كاملة للتسجيل", "category": "التسجيل"},
    {"key": Permission.VIEW_ENROLLMENTS, "label": "عرض التسجيلات", "category": "التسجيل"},
    {"key": Permission.ADD_ENROLLMENT, "label": "تسجيل طالب في مقرر", "category": "التسجيل"},
    {"key": Permission.DELETE_ENROLLMENT, "label": "إلغاء تسجيل طالب", "category": "التسجيل"},
    
    # ==================== صلاحيات الحضور ====================
    {"key": Permission.RECORD_ATTENDANCE, "label": "تسجيل الحضور", "category": "الحضور"},
    {"key": Permission.TAKE_ATTENDANCE, "label": "أخذ الحضور", "category": "الحضور"},
    {"key": Permission.VIEW_ATTENDANCE, "label": "عرض الحضور", "category": "الحضور"},
    {"key": Permission.EDIT_ATTENDANCE, "label": "تعديل الحضور", "category": "الحضور"},
    
    # ==================== صلاحيات الإشعارات ====================
    {"key": Permission.SEND_NOTIFICATIONS, "label": "إرسال إشعارات وإنذارات للطلاب", "category": "الإشعارات"},
    
    # ==================== صلاحيات التقارير العامة ====================
    {"key": Permission.VIEW_REPORTS, "label": "عرض جميع التقارير", "category": "التقارير"},
    {"key": Permission.VIEW_STATISTICS, "label": "عرض الإحصائيات", "category": "التقارير"},
    {"key": Permission.EXPORT_REPORTS, "label": "تصدير التقارير", "category": "التقارير"},
    {"key": Permission.IMPORT_DATA, "label": "استيراد البيانات", "category": "التقارير"},
    
    # ==================== صلاحيات التقارير الفردية ====================
    {"key": Permission.REPORT_ATTENDANCE_OVERVIEW, "label": "تقرير الحضور الشامل", "category": "التقارير الفردية"},
    {"key": Permission.REPORT_ABSENT_STUDENTS, "label": "تقرير الطلاب المتغيبين", "category": "التقارير الفردية"},
    {"key": Permission.REPORT_WARNINGS, "label": "تقرير الإنذارات والحرمان", "category": "التقارير الفردية"},
    {"key": Permission.REPORT_DAILY, "label": "التقرير اليومي", "category": "التقارير الفردية"},
    {"key": Permission.REPORT_STUDENT, "label": "تقرير طالب", "category": "التقارير الفردية"},
    {"key": Permission.REPORT_COURSE, "label": "تقرير مقرر", "category": "التقارير الفردية"},
    {"key": Permission.REPORT_TEACHER_WORKLOAD, "label": "تقرير نصاب المدرس", "category": "التقارير الفردية"},
    
    # ==================== صلاحيات النظام ====================
    {"key": Permission.MANAGE_ROLES, "label": "إدارة الأدوار", "category": "النظام"},
    {"key": Permission.MANAGE_SETTINGS, "label": "إدارة الإعدادات", "category": "النظام"},
    {"key": Permission.MANAGE_SEMESTERS, "label": "إدارة الفصول الدراسية", "category": "النظام"},
]

# ==================== نماذج الأدوار المخصصة ====================

class RoleCreate(BaseModel):
    """نموذج إنشاء دور جديد"""
    name: str  # اسم الدور (مثل: أستاذ، موظف شؤون طلاب)
    description: Optional[str] = ""  # وصف الدور
    permissions: List[str]  # قائمة الصلاحيات المسندة للدور
    is_system: bool = False  # هل هو دور نظامي (لا يمكن حذفه)

class RoleUpdate(BaseModel):
    """نموذج تحديث دور"""
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[str]] = None

class RoleResponse(BaseModel):
    """نموذج استجابة الدور"""
    id: str
    name: str
    description: str
    permissions: List[str]
    is_system: bool
    users_count: int = 0
    created_at: datetime

# ==================== دالة مساعدة للصلاحيات الكاملة ====================

# الصلاحيات الكاملة تشمل الصلاحيات الفرعية
FULL_PERMISSION_MAPPING = {
    Permission.MANAGE_DEPARTMENTS: [
        Permission.VIEW_DEPARTMENTS, Permission.ADD_DEPARTMENT, 
        Permission.EDIT_DEPARTMENT, Permission.DELETE_DEPARTMENT
    ],
    Permission.MANAGE_COURSES: [
        Permission.VIEW_COURSES, Permission.ADD_COURSE, 
        Permission.EDIT_COURSE, Permission.DELETE_COURSE
    ],
    Permission.MANAGE_STUDENTS: [
        Permission.VIEW_STUDENTS, Permission.ADD_STUDENT, 
        Permission.EDIT_STUDENT, Permission.DELETE_STUDENT, Permission.IMPORT_STUDENTS
    ],
    Permission.MANAGE_TEACHERS: [
        Permission.VIEW_TEACHERS, Permission.ADD_TEACHER, 
        Permission.EDIT_TEACHER, Permission.DELETE_TEACHER
    ],
    Permission.MANAGE_USERS: [
        Permission.VIEW_USERS, Permission.ADD_USER, 
        Permission.EDIT_USER, Permission.DELETE_USER, Permission.RESET_PASSWORD
    ],
    Permission.MANAGE_FACULTIES: [
        Permission.VIEW_FACULTIES, Permission.ADD_FACULTY, 
        Permission.EDIT_FACULTY, Permission.DELETE_FACULTY
    ],
    Permission.MANAGE_LECTURES: [
        Permission.VIEW_LECTURES, Permission.ADD_LECTURE, 
        Permission.EDIT_LECTURE, Permission.DELETE_LECTURE
    ],
    Permission.MANAGE_ENROLLMENTS: [
        Permission.VIEW_ENROLLMENTS, Permission.ADD_ENROLLMENT, Permission.DELETE_ENROLLMENT
    ],
}

def user_has_permission(user_permissions: List[str], required_permission: str) -> bool:
    """التحقق من أن المستخدم لديه صلاحية معينة (مع دعم الصلاحيات الكاملة)"""
    
    # إذا كان لديه الصلاحية مباشرة
    if required_permission in user_permissions:
        return True
    
    # التحقق من الصلاحيات الكاملة
    for full_perm, sub_perms in FULL_PERMISSION_MAPPING.items():
        if full_perm in user_permissions and required_permission in sub_perms:
            return True
    
    return False

class ScopeType:
    """نوع نطاق الصلاحية"""
    GLOBAL = "global"           # صلاحية عامة على كل النظام
    DEPARTMENT = "department"   # صلاحية على قسم معين
    COURSE = "course"           # صلاحية على مقرر معين

class UserPermissionScope(BaseModel):
    """نموذج نطاق الصلاحية للمستخدم"""
    scope_type: str  # global, department, course
    scope_id: Optional[str] = None  # معرف القسم أو المقرر (None للصلاحية العامة)
    permissions: List[str]  # قائمة الصلاحيات

class UserPermissionsUpdate(BaseModel):
    """نموذج تحديث صلاحيات المستخدم"""
    scopes: List[UserPermissionScope]

class UserPermissionResponse(BaseModel):
    """نموذج استجابة صلاحيات المستخدم"""
    user_id: str
    scopes: List[dict]

class UserBase(BaseModel):
    username: str
    full_name: str
    role: Optional[str] = None  # الدور القديم - للتوافق
    role_id: Optional[str] = None  # معرف الدور الجديد
    email: Optional[str] = None
    phone: Optional[str] = None
    permissions: Optional[List[str]] = None  # صلاحيات مخصصة للمستخدم
    # حقول النطاق - لربط المستخدم بالجهة التي يديرها
    university_id: Optional[str] = None  # لرئيس الجامعة
    faculty_id: Optional[str] = None  # للعميد ومدير التسجيل
    department_id: Optional[str] = None  # لرئيس القسم والمدرس
    # نطاقات الصلاحيات المتعددة (للمستخدمين الذين لديهم صلاحيات على أكثر من كلية/قسم)
    faculty_ids: Optional[List[str]] = None  # قائمة الكليات المسموح بها
    department_ids: Optional[List[str]] = None  # قائمة الأقسام المسموح بها
    course_ids: Optional[List[str]] = None  # قائمة المقررات المسموح بها
    # مستوى الصلاحية (للتحكم في النطاق)
    permission_level: Optional[str] = None  # university, faculty, department, course

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(UserBase):
    id: str
    created_at: datetime
    is_active: bool = True
    permissions: List[str] = []
    # حقول أسماء الكليات والأقسام للعرض
    faculty_name: Optional[str] = None
    department_name: Optional[str] = None
    department_names: Optional[List[str]] = None

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class DepartmentBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    faculty_id: Optional[str] = None  # معرف الكلية

class DepartmentCreate(DepartmentBase):
    pass

class DepartmentResponse(DepartmentBase):
    id: str
    faculty_name: Optional[str] = None  # اسم الكلية للعرض
    created_at: datetime

# ==================== University & Faculty Models (الهيكل التنظيمي) ====================

class UniversityBase(BaseModel):
    """نموذج الجامعة"""
    name: str
    code: str
    description: Optional[str] = None
    logo_url: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None

class UniversityCreate(UniversityBase):
    pass

class UniversityUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None

class UniversityResponse(UniversityBase):
    id: str
    faculties_count: int = 0
    created_at: datetime

class FacultyBase(BaseModel):
    """نموذج الكلية"""
    name: str
    code: str
    description: Optional[str] = None
    dean_id: Optional[str] = None  # معرف العميد
    # إعدادات خاصة بالكلية
    levels_count: Optional[int] = 5  # عدد المستويات
    sections: Optional[List[str]] = None  # الشعب المتاحة
    attendance_late_minutes: Optional[int] = 15  # دقائق التأخير
    max_absence_percent: Optional[float] = 25  # نسبة الغياب القصوى

class FacultyCreate(FacultyBase):
    pass

class FacultyUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    dean_id: Optional[str] = None
    levels_count: Optional[int] = None
    sections: Optional[List[str]] = None
    attendance_late_minutes: Optional[int] = None
    max_absence_percent: Optional[float] = None

class FacultyResponse(FacultyBase):
    id: str
    dean_name: Optional[str] = None  # اسم العميد للعرض
    departments_count: int = 0
    created_at: datetime

# ==================== Activity Log Models (نظام تسجيل الأنشطة) ====================

class ActivityLogType:
    """أنواع الأنشطة"""
    # أنشطة المصادقة
    LOGIN = "login"
    LOGOUT = "logout"
    PASSWORD_CHANGE = "password_change"
    
    # أنشطة العرض
    VIEW_PAGE = "view_page"
    VIEW_REPORT = "view_report"
    
    # أنشطة الإنشاء
    CREATE_USER = "create_user"
    CREATE_STUDENT = "create_student"
    CREATE_COURSE = "create_course"
    CREATE_DEPARTMENT = "create_department"
    CREATE_FACULTY = "create_faculty"
    CREATE_LECTURE = "create_lecture"
    
    # أنشطة التعديل
    UPDATE_USER = "update_user"
    UPDATE_STUDENT = "update_student"
    UPDATE_COURSE = "update_course"
    UPDATE_DEPARTMENT = "update_department"
    UPDATE_FACULTY = "update_faculty"
    UPDATE_LECTURE = "update_lecture"
    
    # أنشطة الحذف
    DELETE_USER = "delete_user"
    DELETE_STUDENT = "delete_student"
    DELETE_COURSE = "delete_course"
    DELETE_DEPARTMENT = "delete_department"
    DELETE_FACULTY = "delete_faculty"
    DELETE_LECTURE = "delete_lecture"
    
    # أنشطة الحضور
    RECORD_ATTENDANCE = "record_attendance"
    UPDATE_ATTENDANCE = "update_attendance"
    
    # أنشطة التصدير/الاستيراد
    EXPORT_DATA = "export_data"
    IMPORT_DATA = "import_data"

class ActivityLog(BaseModel):
    """نموذج سجل النشاط"""
    user_id: str
    username: str
    user_role: str
    action: str  # نوع النشاط
    action_ar: str  # وصف النشاط بالعربي
    entity_type: Optional[str] = None  # نوع الكيان (user, student, course, etc.)
    entity_id: Optional[str] = None  # معرف الكيان
    entity_name: Optional[str] = None  # اسم الكيان
    details: Optional[dict] = None  # تفاصيل إضافية
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    faculty_id: Optional[str] = None  # معرف الكلية (للفلترة)
    department_id: Optional[str] = None  # معرف القسم (للفلترة)
    timestamp: datetime = None

class ActivityLogResponse(BaseModel):
    id: str
    user_id: str
    username: str
    user_role: str
    action: str
    action_ar: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    details: Optional[dict] = None
    ip_address: Optional[str] = None
    faculty_id: Optional[str] = None
    department_id: Optional[str] = None
    timestamp: datetime

class StudentBase(BaseModel):
    student_id: str  # رقم الطالب
    full_name: str
    department_id: str
    level: int  # المستوى الدراسي (1-4)
    section: str  # الشعبة
    phone: Optional[str] = None
    email: Optional[str] = None

class StudentCreate(StudentBase):
    password: Optional[str] = None

class StudentResponse(StudentBase):
    id: str
    user_id: Optional[str] = None
    qr_code: str
    created_at: datetime
    is_active: bool = True

# ==================== Notification Models (نماذج الإشعارات) ====================

class NotificationType(str, Enum):
    WARNING = "warning"  # إنذار (نسبة غياب عالية)
    DEPRIVATION = "deprivation"  # حرمان
    INFO = "info"  # معلومات عامة
    REMINDER = "reminder"  # تذكير

class NotificationBase(BaseModel):
    title: str
    message: str
    type: NotificationType = NotificationType.INFO
    # بيانات إضافية
    course_id: Optional[str] = None
    course_name: Optional[str] = None
    absence_rate: Optional[float] = None
    remaining_allowed: Optional[int] = None

class NotificationCreate(NotificationBase):
    student_id: str  # معرف الطالب في جدول students
    user_id: Optional[str] = None  # معرف المستخدم (إذا كان لديه حساب)

class NotificationResponse(NotificationBase):
    id: str
    student_id: str
    is_read: bool = False
    created_at: datetime

# ==================== Teacher Models (نماذج المعلمين) ====================

class TeacherBase(BaseModel):
    teacher_id: str  # الرقم الوظيفي
    full_name: str
    department_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None  # التخصص
    academic_title: Optional[str] = None  # الوصف الأكاديمي (أستاذ، أستاذ مشارك، أستاذ مساعد، محاضر، معيد)
    teaching_load: Optional[int] = None  # نصاب التدريس (عدد الساعات)

class TeacherCreate(TeacherBase):
    pass

class TeacherUpdate(BaseModel):
    full_name: Optional[str] = None
    department_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None
    academic_title: Optional[str] = None
    teaching_load: Optional[int] = None

class TeacherResponse(TeacherBase):
    id: str
    user_id: Optional[str] = None  # معرف حساب المستخدم إذا كان مفعلاً
    created_at: datetime
    is_active: bool = True

class CourseBase(BaseModel):
    name: str
    code: str
    department_id: str
    teacher_id: Optional[str] = None  # معرف المعلم من collection المعلمين
    level: int
    section: Optional[str] = ""  # الشعبة - اختيارية
    semester_id: Optional[str] = None  # معرف الفصل الدراسي
    academic_year: Optional[str] = ""

class CourseCreate(CourseBase):
    pass

class CourseResponse(CourseBase):
    id: str
    teacher_name: Optional[str] = None  # اسم المعلم للعرض
    department_name: Optional[str] = None  # اسم القسم للعرض
    semester_name: Optional[str] = None  # اسم الفصل للعرض
    created_at: Optional[datetime] = None
    is_active: bool = True

class AttendanceStatus:
    PRESENT = "present"
    ABSENT = "absent"
    LATE = "late"
    EXCUSED = "excused"

# ==================== Semester Models (نماذج الفصول الدراسية) ====================

class SemesterStatus:
    ACTIVE = "active"      # الفصل الحالي النشط
    UPCOMING = "upcoming"  # فصل قادم
    CLOSED = "closed"      # فصل منتهي (مغلق)
    ARCHIVED = "archived"  # فصل مؤرشف

class SemesterCreate(BaseModel):
    name: str  # اسم الفصل (الفصل الأول، الفصل الثاني، الصيفي)
    academic_year: str  # السنة الدراسية (2024-2025)
    start_date: Optional[str] = None  # تاريخ البداية
    end_date: Optional[str] = None  # تاريخ النهاية
    status: str = SemesterStatus.UPCOMING

class SemesterUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None

class SemesterResponse(BaseModel):
    id: str
    name: str
    academic_year: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str
    courses_count: int = 0
    students_count: int = 0
    attendance_records: int = 0
    created_at: datetime
    closed_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None

# ==================== Settings Models (الإعدادات العامة) ====================

class SemesterDates(BaseModel):
    name: str  # اسم الفصل
    start_date: Optional[str] = None  # تاريخ البداية YYYY-MM-DD
    end_date: Optional[str] = None  # تاريخ النهاية YYYY-MM-DD

class AcademicYearConfig(BaseModel):
    year: str  # مثال: "2024-2025"
    is_current: bool = False
    semesters: List[SemesterDates] = []

class SystemSettings(BaseModel):
    college_name: str = "كلية الشريعة والقانون"
    college_name_en: Optional[str] = "Faculty of Sharia and Law"
    academic_year: str = "2024-2025"
    current_semester: str = "الفصل الأول"
    current_semester_id: Optional[str] = None  # معرف الفصل الحالي
    semester_start_date: Optional[str] = None  # تاريخ بداية الفصل الحالي
    semester_end_date: Optional[str] = None  # تاريخ نهاية الفصل الحالي
    levels_count: int = 5  # عدد المستويات الدراسية
    sections: List[str] = ["أ", "ب", "ج"]  # الشُعب المتاحة
    attendance_late_minutes: int = 15  # دقائق التأخير المسموحة
    max_absence_percent: float = 25.0  # نسبة الغياب القصوى
    logo_url: Optional[str] = None
    primary_color: str = "#1565c0"
    secondary_color: str = "#ff9800"
    academic_years: List[str] = []  # قائمة السنوات الأكاديمية المتاحة

class SettingsUpdate(BaseModel):
    college_name: Optional[str] = None
    college_name_en: Optional[str] = None
    academic_year: Optional[str] = None
    current_semester: Optional[str] = None
    semester_start_date: Optional[str] = None
    semester_end_date: Optional[str] = None
    levels_count: Optional[int] = None
    sections: Optional[List[str]] = None
    attendance_late_minutes: Optional[int] = None
    max_absence_percent: Optional[float] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    academic_years: Optional[List[str]] = None

# ==================== Lecture Models (المحاضرات/الحصص) ====================

class LectureStatus:
    SCHEDULED = "scheduled"  # مجدولة
    COMPLETED = "completed"  # منعقدة
    CANCELLED = "cancelled"  # ملغاة

# الحالات التي تُحسب في الإحصائيات (المحاضرات الفعّالة فقط)
ACTIVE_LECTURE_STATUSES = [LectureStatus.SCHEDULED, LectureStatus.COMPLETED]

class LectureCreate(BaseModel):
    course_id: str
    date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    room: Optional[str] = ""
    notes: Optional[str] = ""

class LectureUpdate(BaseModel):
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    room: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class LectureResponse(BaseModel):
    id: str
    course_id: str
    date: str
    start_time: str
    end_time: str
    room: str
    status: str
    notes: str
    created_at: datetime

class GenerateLecturesRequest(BaseModel):
    course_id: str
    start_date: str  # تاريخ بداية الفصل
    end_date: str    # تاريخ نهاية الفصل
    day_of_week: int # 0=السبت، 1=الأحد، ...
    start_time: str  # HH:MM
    end_time: str    # HH:MM
    room: Optional[str] = ""

class AttendanceRecord(BaseModel):
    student_id: str
    status: str = AttendanceStatus.PRESENT

# ==================== Student Account Activation (تفعيل حساب الطالب) ====================

class ActivateStudentAccount(BaseModel):
    student_id: str  # معرف الطالب في قاعدة البيانات

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class ForceChangePasswordRequest(BaseModel):
    new_password: str

class AttendanceSessionCreate(BaseModel):
    lecture_id: str  # تغيير من course_id إلى lecture_id
    notes: Optional[str] = None
    records: List[AttendanceRecord]

class AttendanceResponse(BaseModel):
    id: str
    lecture_id: str
    course_id: str
    student_id: str
    status: str
    date: datetime
    recorded_by: str
    method: str  # manual or qr
    notes: Optional[str] = None

class AttendanceStats(BaseModel):
    total_sessions: int
    present_count: int
    absent_count: int
    late_count: int
    excused_count: int
    attendance_rate: float

class SingleAttendanceCreate(BaseModel):
    lecture_id: str  # تغيير من course_id إلى lecture_id
    student_id: str
    status: str = AttendanceStatus.PRESENT
    method: str = "qr"
    notes: Optional[str] = None

class OfflineSyncData(BaseModel):
    attendance_records: List[dict]

# ==================== Enrollment Models ====================

class EnrollmentCreate(BaseModel):
    course_id: str
    student_ids: List[str]  # قائمة أرقام الطلاب للتسجيل

class EnrollmentResponse(BaseModel):
    id: str
    course_id: str
    student_id: str
    enrolled_at: datetime
    enrolled_by: str

# ==================== Helper Functions ====================

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    # Truncate password to 72 bytes for bcrypt compatibility
    password_bytes = password.encode('utf-8')[:72]
    return pwd_context.hash(password_bytes.decode('utf-8'))

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# ==================== Activity Logging Function ====================

# ترجمة أنواع الأنشطة إلى العربية
ACTION_TRANSLATIONS = {
    "login": "تسجيل دخول",
    "logout": "تسجيل خروج",
    "password_change": "تغيير كلمة المرور",
    "view_page": "عرض صفحة",
    "view_report": "عرض تقرير",
    "create_user": "إنشاء مستخدم",
    "create_student": "إنشاء طالب",
    "create_course": "إنشاء مقرر",
    "create_department": "إنشاء قسم",
    "create_faculty": "إنشاء كلية",
    "create_lecture": "إنشاء محاضرة",
    "update_user": "تعديل مستخدم",
    "update_student": "تعديل طالب",
    "update_course": "تعديل مقرر",
    "update_department": "تعديل قسم",
    "update_faculty": "تعديل كلية",
    "update_lecture": "تعديل محاضرة",
    "delete_user": "حذف مستخدم",
    "delete_student": "حذف طالب",
    "delete_course": "حذف مقرر",
    "delete_department": "حذف قسم",
    "delete_faculty": "حذف كلية",
    "delete_lecture": "حذف محاضرة",
    "record_attendance": "تسجيل حضور",
    "update_attendance": "تعديل حضور",
    "export_data": "تصدير بيانات",
    "import_data": "استيراد بيانات",
    "create_role": "إنشاء دور",
    "update_role": "تعديل دور",
    "delete_role": "حذف دور",
    "enroll_students": "تسجيل طلاب في مقرر",
    "unenroll_students": "إلغاء تسجيل طلاب",
}

async def log_activity(
    user: dict,
    action: str,
    entity_type: str = None,
    entity_id: str = None,
    entity_name: str = None,
    details: dict = None,
    ip_address: str = None,
    user_agent: str = None
):
    """تسجيل نشاط المستخدم في قاعدة البيانات"""
    try:
        action_ar = ACTION_TRANSLATIONS.get(action, action)
        
        log_entry = {
            "user_id": str(user.get("_id", user.get("id", ""))),
            "username": user.get("username", "غير معروف"),
            "user_role": user.get("role", "غير محدد"),
            "action": action,
            "action_ar": action_ar,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "entity_name": entity_name,
            "details": details,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "faculty_id": user.get("faculty_id"),
            "department_id": user.get("department_id"),
            "timestamp": datetime.utcnow()
        }
        
        await db.activity_logs.insert_one(log_entry)
        logger.info(f"Activity logged: {action} by {user.get('username')}")
    except Exception as e:
        logger.error(f"Failed to log activity: {e}")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="بيانات الاعتماد غير صالحة",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if user is None:
        raise credentials_exception
    
    # احصل على صلاحيات المستخدم - إما المخصصة أو الافتراضية للدور
    user_permissions = user.get("permissions") or DEFAULT_PERMISSIONS.get(user["role"], [])
    
    return {
        "id": str(user["_id"]),
        "username": user["username"],
        "full_name": user["full_name"],
        "role": user["role"],
        "email": user.get("email"),
        "phone": user.get("phone"),
        "is_active": user.get("is_active", True),
        "permissions": user_permissions
    }

def get_user_permissions(user: dict) -> List[str]:
    """الحصول على صلاحيات المستخدم"""
    return user.get("permissions") or DEFAULT_PERMISSIONS.get(user["role"], [])

def has_permission(user: dict, permission: str) -> bool:
    """التحقق من أن المستخدم لديه صلاحية معينة"""
    if user["role"] == UserRole.ADMIN:
        return True
    permissions = get_user_permissions(user)
    return permission in permissions

def require_permission(permission: str):
    """Dependency للتحقق من الصلاحيات"""
    async def check_permission(current_user: dict = Depends(get_current_user)):
        if not has_permission(current_user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"ليس لديك صلاحية: {permission}"
            )
        return current_user
    return check_permission

def generate_qr_code(student_id: str) -> str:
    """Generate unique QR code for student"""
    return f"SHARIA-{student_id}-{uuid.uuid4().hex[:8].upper()}"

async def get_active_lecture_ids(course_id: str = None) -> set:
    """
    جلب IDs المحاضرات الفعّالة فقط (غير الملغاة)
    المحاضرات المجدولة والمنعقدة تُحسب، الملغاة لا تُحسب
    """
    query = {"status": {"$in": ACTIVE_LECTURE_STATUSES}}
    if course_id:
        query["course_id"] = course_id
    
    lectures = await db.lectures.find(query, {"_id": 1}).to_list(10000)
    return {str(lec["_id"]) for lec in lectures}

async def filter_attendance_by_active_lectures(records: list, course_id: str = None) -> list:
    """
    فلترة سجلات الحضور لتشمل فقط المحاضرات الفعّالة (غير الملغاة)
    المحاضرات التعويضية تُحسب تلقائياً لأنها ليست ملغاة
    """
    active_lecture_ids = await get_active_lecture_ids(course_id)
    return [r for r in records if r.get("lecture_id") in active_lecture_ids]

# ==================== Backend Scoping Helper ====================

async def get_user_scope_filter(current_user: dict, scope_type: str = "students") -> dict:
    """
    إرجاع فلتر Query بناءً على دور المستخدم ونطاقه
    
    الأدوار ونطاقاتها:
    - admin: لا يوجد فلتر (يرى كل شيء)
    - dean: يرى فقط بيانات كليته (faculty_id)
    - department_head: يرى فقط بيانات قسمه (department_id)
    - teacher: يرى فقط بيانات مقرراته
    - registrar/registration_manager: يرى فقط بيانات كليته
    
    scope_type: "students", "courses", "departments", "teachers", "attendance"
    """
    query = {}
    role = current_user.get("role", "")
    user_id = current_user.get("id")
    
    # Admin يرى كل شيء
    if role == UserRole.ADMIN:
        return query
    
    # جلب بيانات المستخدم الكاملة للحصول على faculty_id و department_id
    user_data = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user_data:
        return query
    
    faculty_id = user_data.get("faculty_id")
    department_id = user_data.get("department_id")
    # دعم الأقسام المتعددة
    department_ids = user_data.get("department_ids", [])
    if not department_ids and department_id:
        department_ids = [department_id]
    teacher_record_id = user_data.get("teacher_record_id")
    
    # Dean (عميد) - يرى بيانات كليته
    if role == "dean" and faculty_id:
        if scope_type == "students":
            # جلب أقسام الكلية أولاً
            dept_ids = await get_faculty_department_ids(faculty_id)
            if dept_ids:
                query["department_id"] = {"$in": dept_ids}
        elif scope_type == "courses":
            dept_ids = await get_faculty_department_ids(faculty_id)
            if dept_ids:
                query["department_id"] = {"$in": dept_ids}
        elif scope_type == "departments":
            query["faculty_id"] = faculty_id
        elif scope_type == "teachers":
            dept_ids = await get_faculty_department_ids(faculty_id)
            if dept_ids:
                query["department_id"] = {"$in": dept_ids}
    
    # Department Head (رئيس قسم) - يرى بيانات أقسامه (قسم واحد أو أقسام متعددة)
    elif role == "department_head":
        if department_ids and len(department_ids) > 0:
            if scope_type in ["students", "courses", "teachers"]:
                if len(department_ids) == 1:
                    query["department_id"] = department_ids[0]
                else:
                    query["department_id"] = {"$in": department_ids}
            elif scope_type == "departments":
                if len(department_ids) == 1:
                    query["_id"] = ObjectId(department_ids[0])
                else:
                    query["_id"] = {"$in": [ObjectId(did) for did in department_ids]}
        elif department_id:
            if scope_type in ["students", "courses", "teachers"]:
                query["department_id"] = department_id
            elif scope_type == "departments":
                query["_id"] = ObjectId(department_id)
    
    # Custom role with faculty (no department) - يرى بيانات الكلية كلها
    elif role == "custom" and faculty_id and not department_id:
        if scope_type == "students":
            dept_ids = await get_faculty_department_ids(faculty_id)
            if dept_ids:
                query["department_id"] = {"$in": dept_ids}
        elif scope_type == "courses":
            dept_ids = await get_faculty_department_ids(faculty_id)
            if dept_ids:
                query["department_id"] = {"$in": dept_ids}
        elif scope_type == "departments":
            query["faculty_id"] = faculty_id
        elif scope_type == "teachers":
            dept_ids = await get_faculty_department_ids(faculty_id)
            if dept_ids:
                query["department_id"] = {"$in": dept_ids}
    
    # Custom role with department(s) - يرى بيانات أقسامه (قسم واحد أو أقسام متعددة)
    elif role == "custom" and (department_ids or department_id):
        # استخدام الأقسام المتعددة إن وُجدت
        user_dept_ids = department_ids if department_ids else [department_id]
        if scope_type in ["students", "courses", "teachers"]:
            if len(user_dept_ids) == 1:
                query["department_id"] = user_dept_ids[0]
            else:
                query["department_id"] = {"$in": user_dept_ids}
        elif scope_type == "departments":
            if len(user_dept_ids) == 1:
                query["_id"] = ObjectId(user_dept_ids[0])
            else:
                query["_id"] = {"$in": [ObjectId(did) for did in user_dept_ids]}
    
    # Registration Manager / Registrar - يرى بيانات الكلية
    elif role in ["registration_manager", "registrar"] and faculty_id:
        if scope_type == "students":
            dept_ids = await get_faculty_department_ids(faculty_id)
            if dept_ids:
                query["department_id"] = {"$in": dept_ids}
        elif scope_type == "courses":
            dept_ids = await get_faculty_department_ids(faculty_id)
            if dept_ids:
                query["department_id"] = {"$in": dept_ids}
        elif scope_type == "departments":
            query["faculty_id"] = faculty_id
    
    # Teacher - يرى فقط مقرراته
    elif role == UserRole.TEACHER:
        if scope_type == "courses":
            # استخدام teacher_record_id أو user_id
            if teacher_record_id:
                query["teacher_id"] = teacher_record_id
            else:
                query["teacher_id"] = user_id
        elif scope_type == "students":
            # جلب طلاب مقرراته فقط
            course_ids = await get_teacher_course_ids(user_id, teacher_record_id)
            if course_ids:
                # جلب طلاب هذه المقررات
                enrolled_students = await db.enrollments.find(
                    {"course_id": {"$in": course_ids}}
                ).distinct("student_id")
                if enrolled_students:
                    query["_id"] = {"$in": [ObjectId(sid) for sid in enrolled_students]}
                else:
                    query["_id"] = {"$in": []}  # لا يوجد طلاب
    
    return query

async def get_faculty_department_ids(faculty_id: str) -> list:
    """جلب معرفات الأقسام التابعة لكلية معينة"""
    departments = await db.departments.find(
        {"faculty_id": faculty_id},
        {"_id": 1}
    ).to_list(100)
    return [str(d["_id"]) for d in departments]

async def get_teacher_course_ids(user_id: str, teacher_record_id: str = None) -> list:
    """جلب معرفات المقررات التي يدرسها المعلم"""
    query = {"is_active": True}
    if teacher_record_id:
        query["teacher_id"] = teacher_record_id
    else:
        query["teacher_id"] = user_id
    
    courses = await db.courses.find(query, {"_id": 1}).to_list(100)
    return [str(c["_id"]) for c in courses]

# ==================== Auth Routes ====================

@api_router.post("/auth/login")
async def login(user_data: UserLogin):
    user = await db.users.find_one({"username": user_data.username})
    # التحقق من وجود المستخدم وكلمة المرور (قد تكون في password أو hashed_password)
    password_field = user.get("hashed_password") or user.get("password") if user else None
    
    if not user or not password_field:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="اسم المستخدم أو كلمة المرور غير صحيحة"
        )
    
    try:
        is_valid = verify_password(user_data.password, password_field)
    except Exception:
        is_valid = False
    
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="اسم المستخدم أو كلمة المرور غير صحيحة"
        )
    
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="الحساب غير مفعل"
        )
    
    access_token = create_access_token(data={"sub": str(user["_id"])})
    
    # جلب صلاحيات الدور أولاً (الصلاحيات الديناميكية)
    user_permissions = []
    
    # 1. جلب صلاحيات الدور من role_id إذا كان موجوداً
    if user.get("role_id"):
        try:
            role_doc = await db.roles.find_one({"_id": ObjectId(user["role_id"])})
            if role_doc:
                user_permissions = list(role_doc.get("permissions", []))
        except:
            pass
    
    # 2. إذا لم يكن هناك role_id، جلب من system_key
    if not user_permissions:
        user_role = user.get("role", "employee")
        role_doc = await db.roles.find_one({"system_key": user_role})
        if role_doc:
            user_permissions = list(role_doc.get("permissions", []))
        else:
            # إذا لم يوجد دور في قاعدة البيانات، استخدم الافتراضي
            user_permissions = list(DEFAULT_PERMISSIONS.get(user_role, []))
    
    # 3. دمج أي صلاحيات مخصصة للمستخدم (إضافية)
    custom_permissions = user.get("custom_permissions", [])
    if custom_permissions:
        for perm in custom_permissions:
            if perm not in user_permissions:
                user_permissions.append(perm)
    
    # تسجيل نشاط الدخول
    await log_activity(
        user=user,
        action="login",
        entity_type="user",
        entity_id=str(user["_id"]),
        entity_name=user["username"]
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user["_id"]),
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
            "email": user.get("email"),
            "phone": user.get("phone"),
            "created_at": user["created_at"],
            "is_active": user.get("is_active", True),
            "permissions": user_permissions,
            "must_change_password": user.get("must_change_password", False),
            "student_id": user.get("student_id"),  # إذا كان المستخدم طالب
            "faculty_id": user.get("faculty_id"),  # معرف الكلية
            "department_id": user.get("department_id")  # معرف القسم
        }
    }

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
    
    # جلب صلاحيات الدور ديناميكياً (تتحدث تلقائياً عند تحديث الدور)
    user_permissions = []
    
    # 1. جلب صلاحيات الدور من role_id إذا كان موجوداً
    if user.get("role_id"):
        try:
            role_doc = await db.roles.find_one({"_id": ObjectId(user["role_id"])})
            if role_doc:
                user_permissions = list(role_doc.get("permissions", []))
        except:
            pass
    
    # 2. إذا لم يكن هناك role_id، جلب من system_key
    if not user_permissions:
        user_role = user.get("role", "employee")
        role_doc = await db.roles.find_one({"system_key": user_role})
        if role_doc:
            user_permissions = list(role_doc.get("permissions", []))
        else:
            user_permissions = list(DEFAULT_PERMISSIONS.get(user_role, []))
    
    # 3. دمج أي صلاحيات مخصصة للمستخدم
    custom_permissions = user.get("custom_permissions", [])
    if custom_permissions:
        for perm in custom_permissions:
            if perm not in user_permissions:
                user_permissions.append(perm)
    
    return {
        "id": str(user["_id"]),
        "username": user["username"],
        "full_name": user["full_name"],
        "role": user["role"],
        "email": user.get("email"),
        "phone": user.get("phone"),
        "created_at": user["created_at"],
        "is_active": user.get("is_active", True),
        "permissions": user_permissions
    }

# ==================== User Management Routes ====================

@api_router.post("/users", response_model=UserResponse)
async def create_user(user: UserCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بإنشاء مستخدمين")
    
    existing = await db.users.find_one({"username": user.username})
    if existing:
        raise HTTPException(status_code=400, detail="اسم المستخدم موجود مسبقاً")
    
    user_dict = user.dict()
    user_dict["password"] = get_password_hash(user.password)
    user_dict["created_at"] = datetime.utcnow()
    user_dict["is_active"] = True
    
    # التأكد من أن permissions قائمة وليست None
    if user_dict.get("permissions") is None:
        user_dict["permissions"] = []
    
    # التعامل مع الدور الجديد (role_id)
    if user.role_id:
        role = await db.roles.find_one({"_id": ObjectId(user.role_id)})
        if role:
            user_dict["role_id"] = user.role_id
            user_dict["role"] = role.get("system_key", "custom")
            user_dict["permissions"] = role.get("permissions", [])
    elif not user.role:
        user_dict["role"] = "employee"  # افتراضي
        user_dict["permissions"] = []
    
    # دعم الأقسام المتعددة - ضبط department_id للتوافق
    if user_dict.get("department_ids") and len(user_dict["department_ids"]) > 0:
        user_dict["department_id"] = user_dict["department_ids"][0]
    
    result = await db.users.insert_one(user_dict)
    
    # إرجاع البيانات بالشكل المطلوب
    return {
        "id": str(result.inserted_id),
        "username": user_dict["username"],
        "full_name": user_dict["full_name"],
        "role": user_dict["role"],
        "role_id": user_dict.get("role_id"),
        "email": user_dict.get("email"),
        "phone": user_dict.get("phone"),
        "created_at": user_dict["created_at"],
        "is_active": user_dict.get("is_active", True),
        "permissions": user_dict.get("permissions", []),
        "university_id": user_dict.get("university_id"),
        "faculty_id": user_dict.get("faculty_id"),
        "department_id": user_dict.get("department_id"),
        "department_ids": user_dict.get("department_ids", []),
    }

@api_router.get("/users", response_model=List[UserResponse])
async def get_users(role: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    query = {}
    if role:
        query["role"] = role
    
    users = await db.users.find(query).to_list(1000)
    
    # جلب أسماء الكليات والأقسام للعرض
    result = []
    for u in users:
        user_data = {
            "id": str(u["_id"]),
            "username": u["username"],
            "full_name": u["full_name"],
            "role": u["role"],
            "role_id": u.get("role_id"),
            "email": u.get("email"),
            "phone": u.get("phone"),
            "created_at": u["created_at"],
            "is_active": u.get("is_active", True),
            "permissions": u.get("permissions") or DEFAULT_PERMISSIONS.get(u["role"], []),
            "university_id": u.get("university_id"),
            "faculty_id": u.get("faculty_id"),
            "department_id": u.get("department_id"),
            "department_ids": u.get("department_ids", []),
        }
        
        # جلب اسم الكلية إذا موجود
        if u.get("faculty_id"):
            try:
                faculty = await db.faculties.find_one({"_id": ObjectId(u["faculty_id"])})
                user_data["faculty_name"] = faculty["name"] if faculty else None
            except:
                user_data["faculty_name"] = None
        
        # جلب أسماء الأقسام - دعم الأقسام المتعددة
        dept_ids_to_fetch = u.get("department_ids") or []
        if not dept_ids_to_fetch and u.get("department_id"):
            dept_ids_to_fetch = [u.get("department_id")]
        
        if dept_ids_to_fetch and len(dept_ids_to_fetch) > 0:
            try:
                dept_names = []
                for did in dept_ids_to_fetch:
                    if did:  # التأكد من أن المعرف ليس None أو فارغاً
                        dept = await db.departments.find_one({"_id": ObjectId(did)})
                        if dept:
                            dept_names.append(dept["name"])
                user_data["department_name"] = " | ".join(dept_names) if dept_names else None
                user_data["department_names"] = dept_names
            except Exception as e:
                logger.error(f"Error fetching department names: {e}")
                user_data["department_name"] = None
                user_data["department_names"] = []
        else:
            user_data["department_name"] = None
            user_data["department_names"] = []
        
        result.append(user_data)
    
    return result

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    result = await db.users.delete_one({"_id": ObjectId(user_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    return {"message": "تم حذف المستخدم بنجاح"}

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    role_id: Optional[str] = None  # معرف الدور الجديد
    # حقول النطاق
    university_id: Optional[str] = None
    faculty_id: Optional[str] = None
    department_id: Optional[str] = None  # للتوافق مع القديم
    department_ids: Optional[List[str]] = None  # قائمة الأقسام المتعددة

@api_router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, data: UserUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    # حماية مدير النظام - لا يمكن تغيير دوره أو صلاحياته
    if user.get("role") == UserRole.ADMIN or user.get("username") == "admin":
        # لا يمكن تغيير الدور أو الصلاحيات للمدير
        if data.role_id:
            raise HTTPException(status_code=403, detail="لا يمكن تغيير دور مدير النظام")
    
    update_data = {}
    if data.full_name:
        update_data["full_name"] = data.full_name
    if data.email:
        update_data["email"] = data.email
    if data.phone:
        update_data["phone"] = data.phone
    if data.password:
        update_data["password"] = get_password_hash(data.password)
    
    # تحديث حقول النطاق
    if data.university_id is not None:
        update_data["university_id"] = data.university_id if data.university_id else None
    if data.faculty_id is not None:
        update_data["faculty_id"] = data.faculty_id if data.faculty_id else None
    if data.department_id is not None:
        update_data["department_id"] = data.department_id if data.department_id else None
    
    # دعم الأقسام المتعددة
    if data.department_ids is not None:
        # تخزين قائمة الأقسام
        update_data["department_ids"] = data.department_ids if data.department_ids else []
        # إذا كانت هناك أقسام متعددة، نضع أول قسم كـ department_id للتوافق
        if data.department_ids and len(data.department_ids) > 0:
            update_data["department_id"] = data.department_ids[0]
        else:
            update_data["department_id"] = None
    
    # تحديث الدور إذا تم تحديده (فقط لغير المدير)
    if data.role_id and user.get("role") != UserRole.ADMIN:
        role = await db.roles.find_one({"_id": ObjectId(data.role_id)})
        if role:
            update_data["role_id"] = data.role_id
            update_data["role"] = role.get("system_key", "custom")
            update_data["permissions"] = role.get("permissions", [])
    
    if update_data:
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_data}
        )
    
    updated = await db.users.find_one({"_id": ObjectId(user_id)})
    
    # إرجاع صلاحيات كاملة للمدير
    user_permissions = updated.get("permissions", DEFAULT_PERMISSIONS.get(updated["role"], []))
    if updated["role"] == UserRole.ADMIN:
        user_permissions = list(DEFAULT_PERMISSIONS.get(UserRole.ADMIN, []))
    
    return {
        "id": str(updated["_id"]),
        "username": updated["username"],
        "full_name": updated["full_name"],
        "role": updated["role"],
        "role_id": updated.get("role_id"),
        "email": updated.get("email"),
        "phone": updated.get("phone"),
        "created_at": updated["created_at"],
        "is_active": updated.get("is_active", True),
        "permissions": user_permissions,
        "university_id": updated.get("university_id"),
        "faculty_id": updated.get("faculty_id"),
        "department_id": updated.get("department_id"),
        "department_ids": updated.get("department_ids", [])
    }

# ==================== User Management Actions ====================

@api_router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    new_password: str = Body(..., embed=True),
    current_user: dict = Depends(get_current_user)
):
    """إعادة تعيين كلمة مرور المستخدم"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بإعادة تعيين كلمة المرور")
    
    # التحقق من وجود المستخدم
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    # تشفير كلمة المرور الجديدة
    hashed_password = pwd_context.hash(new_password)
    
    # تحديث كلمة المرور
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"password": hashed_password, "updated_at": datetime.utcnow()}}
    )
    
    # تسجيل النشاط
    await log_activity(
        user=current_user,
        action="reset_password",
        entity_type="user",
        entity_id=user_id,
        entity_name=user.get('username')
    )
    
    return {"message": "تم إعادة تعيين كلمة المرور بنجاح"}

@api_router.post("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """تفعيل/إيقاف المستخدم"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بتعديل حالة المستخدم")
    
    # التحقق من وجود المستخدم
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    # لا يمكن إيقاف حساب المدير الرئيسي
    if user.get("role") == "admin" and user.get("username") == "admin":
        raise HTTPException(status_code=400, detail="لا يمكن إيقاف حساب مدير النظام الرئيسي")
    
    # تبديل الحالة
    new_status = not user.get("is_active", True)
    
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"is_active": new_status, "updated_at": datetime.utcnow()}}
    )
    
    # تسجيل النشاط
    action = "activate_user" if new_status else "deactivate_user"
    await log_activity(
        user=current_user,
        action=action,
        entity_type="user",
        entity_id=user_id,
        entity_name=user.get('username')
    )
    
    return {"message": f"تم {'تفعيل' if new_status else 'إيقاف'} المستخدم بنجاح", "is_active": new_status}

# ==================== Roles Management Routes (إدارة الأدوار) ====================

@api_router.get("/roles")
async def get_all_roles(current_user: dict = Depends(get_current_user)):
    """الحصول على جميع الأدوار"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    roles = await db.roles.find().to_list(100)
    
    result = []
    for role in roles:
        # حساب عدد المستخدمين لكل دور (بواسطة role_id أو role القديم)
        system_key = role.get("system_key", "")
        users_count = await db.users.count_documents({
            "$or": [
                {"role_id": str(role["_id"])},
                {"role": system_key} if system_key else {"_id": None}
            ]
        })
        result.append({
            "id": str(role["_id"]),
            "name": role["name"],
            "description": role.get("description", ""),
            "permissions": role.get("permissions", []),
            "is_system": role.get("is_system", False),
            "system_key": system_key,
            "users_count": users_count,
            "created_at": role.get("created_at", datetime.utcnow())
        })
    
    return result

@api_router.post("/roles")
async def create_role(role_data: RoleCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء دور جديد"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # التحقق من عدم وجود دور بنفس الاسم
    existing = await db.roles.find_one({"name": role_data.name})
    if existing:
        raise HTTPException(status_code=400, detail="يوجد دور بهذا الاسم")
    
    # التحقق من صحة الصلاحيات
    valid_permissions = [p["key"] for p in ALL_PERMISSIONS]
    for perm in role_data.permissions:
        if perm not in valid_permissions:
            raise HTTPException(status_code=400, detail=f"صلاحية غير صالحة: {perm}")
    
    role_doc = {
        "name": role_data.name,
        "description": role_data.description or "",
        "permissions": role_data.permissions,
        "is_system": False,
        "created_at": datetime.utcnow(),
        "created_by": current_user["id"]
    }
    
    result = await db.roles.insert_one(role_doc)
    
    return {
        "id": str(result.inserted_id),
        "message": "تم إنشاء الدور بنجاح"
    }

@api_router.get("/roles/{role_id}")
async def get_role(role_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على تفاصيل دور معين"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    role = await db.roles.find_one({"_id": ObjectId(role_id)})
    if not role:
        raise HTTPException(status_code=404, detail="الدور غير موجود")
    
    users_count = await db.users.count_documents({"role_id": role_id})
    
    return {
        "id": str(role["_id"]),
        "name": role["name"],
        "description": role.get("description", ""),
        "permissions": role.get("permissions", []),
        "is_system": role.get("is_system", False),
        "users_count": users_count,
        "created_at": role.get("created_at", datetime.utcnow())
    }

@api_router.put("/roles/{role_id}")
async def update_role(role_id: str, role_data: RoleUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث دور"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    role = await db.roles.find_one({"_id": ObjectId(role_id)})
    if not role:
        raise HTTPException(status_code=404, detail="الدور غير موجود")
    
    update_data = {}
    
    # للأدوار النظامية: يمكن تعديل الصلاحيات فقط، لا يمكن تغيير الاسم
    if role.get("is_system"):
        if role_data.name and role_data.name != role.get("name"):
            raise HTTPException(status_code=400, detail="لا يمكن تغيير اسم دور نظامي")
        # السماح بتعديل الصلاحيات
        if role_data.permissions is not None:
            valid_permissions = [p["key"] for p in ALL_PERMISSIONS]
            for perm in role_data.permissions:
                if perm not in valid_permissions:
                    raise HTTPException(status_code=400, detail=f"صلاحية غير صالحة: {perm}")
            update_data["permissions"] = role_data.permissions
        if role_data.description is not None:
            update_data["description"] = role_data.description
    else:
        # للأدوار غير النظامية: يمكن تعديل كل شيء
        if role_data.name:
            # التحقق من عدم وجود دور آخر بنفس الاسم
            existing = await db.roles.find_one({"name": role_data.name, "_id": {"$ne": ObjectId(role_id)}})
            if existing:
                raise HTTPException(status_code=400, detail="يوجد دور آخر بهذا الاسم")
            update_data["name"] = role_data.name
        
        if role_data.description is not None:
            update_data["description"] = role_data.description
        
        if role_data.permissions is not None:
            valid_permissions = [p["key"] for p in ALL_PERMISSIONS]
            for perm in role_data.permissions:
                if perm not in valid_permissions:
                    raise HTTPException(status_code=400, detail=f"صلاحية غير صالحة: {perm}")
            update_data["permissions"] = role_data.permissions
    
    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        await db.roles.update_one({"_id": ObjectId(role_id)}, {"$set": update_data})
    
    return {"message": "تم تحديث الدور بنجاح"}

@api_router.delete("/roles/{role_id}")
async def delete_role(role_id: str, current_user: dict = Depends(get_current_user)):
    """حذف دور"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    role = await db.roles.find_one({"_id": ObjectId(role_id)})
    if not role:
        raise HTTPException(status_code=404, detail="الدور غير موجود")
    
    if role.get("is_system"):
        raise HTTPException(status_code=400, detail="لا يمكن حذف دور نظامي")
    
    # التحقق من عدم وجود مستخدمين بهذا الدور
    users_count = await db.users.count_documents({"role_id": role_id})
    if users_count > 0:
        raise HTTPException(status_code=400, detail=f"لا يمكن حذف الدور، يوجد {users_count} مستخدم مرتبط به")
    
    await db.roles.delete_one({"_id": ObjectId(role_id)})
    
    return {"message": "تم حذف الدور بنجاح"}

@api_router.post("/roles/init")
async def init_default_roles(current_user: dict = Depends(get_current_user)):
    """إنشاء الأدوار الافتراضية"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    default_roles = [
        {
            "name": "مدير النظام",
            "description": "صلاحيات كاملة على النظام",
            "permissions": list(DEFAULT_PERMISSIONS.get(UserRole.ADMIN, [])),
            "is_system": True,
            "system_key": "admin"
        },
        {
            "name": "أستاذ",
            "description": "صلاحيات الأستاذ الافتراضية",
            "permissions": list(DEFAULT_PERMISSIONS.get(UserRole.TEACHER, [])),
            "is_system": True,
            "system_key": "teacher"
        },
        {
            "name": "موظف",
            "description": "صلاحيات الموظف الافتراضية",
            "permissions": list(DEFAULT_PERMISSIONS.get(UserRole.EMPLOYEE, [])),
            "is_system": True,
            "system_key": "employee"
        },
        {
            "name": "طالب",
            "description": "صلاحيات الطالب الافتراضية",
            "permissions": list(DEFAULT_PERMISSIONS.get(UserRole.STUDENT, [])),
            "is_system": True,
            "system_key": "student"
        },
    ]
    
    created = 0
    for role in default_roles:
        existing = await db.roles.find_one({"system_key": role["system_key"]})
        if not existing:
            role["created_at"] = datetime.utcnow()
            await db.roles.insert_one(role)
            created += 1
    
    return {"message": f"تم إنشاء {created} دور افتراضي"}

# ==================== Permissions Management Routes ====================

class PermissionUpdate(BaseModel):
    permissions: List[str]

class UserRoleUpdate(BaseModel):
    role_id: str  # معرف الدور المخصص

@api_router.get("/permissions/all")
async def get_all_permissions(current_user: dict = Depends(get_current_user)):
    """الحصول على قائمة جميع الصلاحيات المتاحة"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # جلب الأدوار المخصصة
    roles = await db.roles.find().to_list(100)
    roles_list = []
    for r in roles:
        roles_list.append({
            "id": str(r["_id"]),
            "name": r["name"],
            "permissions": r.get("permissions", []),
            "is_system": r.get("is_system", False)
        })
    
    return {
        "permissions": ALL_PERMISSIONS,
        "roles": roles_list,
        "default_permissions": DEFAULT_PERMISSIONS
    }

@api_router.get("/users/{user_id}/permissions")
async def get_user_permissions_endpoint(user_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على صلاحيات مستخدم معين"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    # جلب صلاحيات المستخدم من الدور المسند له
    user_permissions = []
    role_name = ""
    role_id = user.get("role_id")
    
    if role_id:
        role = await db.roles.find_one({"_id": ObjectId(role_id)})
        if role:
            user_permissions = role.get("permissions", [])
            role_name = role.get("name", "")
    else:
        # استخدام الصلاحيات الافتراضية للدور القديم
        user_permissions = DEFAULT_PERMISSIONS.get(user.get("role", ""), [])
        role_name = user.get("role", "")
    
    return {
        "user_id": user_id,
        "role_id": role_id,
        "role_name": role_name,
        "permissions": user_permissions
    }

@api_router.put("/users/{user_id}/role")
async def assign_role_to_user(user_id: str, data: UserRoleUpdate, current_user: dict = Depends(get_current_user)):
    """إسناد دور لمستخدم"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    # التحقق من وجود الدور
    role = await db.roles.find_one({"_id": ObjectId(data.role_id)})
    if not role:
        raise HTTPException(status_code=404, detail="الدور غير موجود")
    
    # تحديث دور المستخدم
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"role_id": data.role_id, "role": role.get("system_key", "custom")}}
    )
    
    return {
        "message": "تم إسناد الدور بنجاح",
        "role_id": data.role_id,
        "role_name": role["name"],
        "permissions": role.get("permissions", [])
    }

@api_router.delete("/users/{user_id}/permissions/reset")
async def reset_user_permissions(user_id: str, current_user: dict = Depends(get_current_user)):
    """إعادة تعيين صلاحيات المستخدم إلى الافتراضية حسب دوره"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$unset": {"permissions": 1}}
    )
    
    default_perms = DEFAULT_PERMISSIONS.get(user["role"], [])
    return {
        "message": "تم إعادة تعيين الصلاحيات إلى الافتراضية",
        "permissions": default_perms
    }

# ==================== Department Routes ====================

@api_router.post("/departments", response_model=DepartmentResponse)
async def create_department(dept: DepartmentCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    dept_dict = dept.dict()
    dept_dict["created_at"] = datetime.utcnow()
    
    result = await db.departments.insert_one(dept_dict)
    dept_dict["id"] = str(result.inserted_id)
    
    return dept_dict

@api_router.get("/departments", response_model=List[DepartmentResponse])
async def get_departments(current_user: dict = Depends(get_current_user)):
    # تطبيق فلتر النطاق بناءً على دور المستخدم
    scope_filter = await get_user_scope_filter(current_user, "departments")
    
    depts = await db.departments.find(scope_filter).to_list(100)
    result = []
    for d in depts:
        dept_data = {
            "id": str(d["_id"]),
            "name": d["name"],
            "code": d["code"],
            "description": d.get("description"),
            "faculty_id": d.get("faculty_id"),
            "created_at": d["created_at"]
        }
        # جلب اسم الكلية إذا موجود
        if d.get("faculty_id"):
            try:
                faculty = await db.faculties.find_one({"_id": ObjectId(d["faculty_id"])})
                dept_data["faculty_name"] = faculty["name"] if faculty else None
            except:
                dept_data["faculty_name"] = None
        result.append(dept_data)
    return result

@api_router.delete("/departments/{dept_id}")
async def delete_department(dept_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    result = await db.departments.delete_one({"_id": ObjectId(dept_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="القسم غير موجود")
    
    return {"message": "تم حذف القسم بنجاح"}

@api_router.put("/departments/{dept_id}", response_model=DepartmentResponse)
async def update_department(dept_id: str, dept: DepartmentCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    existing = await db.departments.find_one({"_id": ObjectId(dept_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="القسم غير موجود")
    
    await db.departments.update_one(
        {"_id": ObjectId(dept_id)},
        {"$set": dept.dict()}
    )
    
    return {
        "id": dept_id,
        **dept.dict(),
        "created_at": existing["created_at"]
    }

@api_router.get("/departments/{dept_id}/details")
async def get_department_details(dept_id: str, current_user: dict = Depends(get_current_user)):
    """Get department details with students, courses, and teachers"""
    dept = await db.departments.find_one({"_id": ObjectId(dept_id)})
    if not dept:
        raise HTTPException(status_code=404, detail="القسم غير موجود")
    
    # Get courses in this department
    courses = await db.courses.find({"department_id": dept_id}).to_list(100)
    course_ids = [str(c["_id"]) for c in courses]
    
    # Get unique teacher IDs from courses
    teacher_ids = list(set([c.get("teacher_id") for c in courses if c.get("teacher_id")]))
    
    # Get teachers
    teachers = []
    for tid in teacher_ids:
        try:
            teacher = await db.users.find_one({"_id": ObjectId(tid), "role": "teacher"})
            if teacher:
                teachers.append({
                    "id": str(teacher["_id"]),
                    "full_name": teacher["full_name"],
                    "username": teacher["username"]
                })
        except:
            pass
    
    # Get students enrolled in courses of this department
    student_ids = set()
    for course_id in course_ids:
        enrollments = await db.enrollments.find({"course_id": course_id}).to_list(1000)
        for e in enrollments:
            student_ids.add(e["student_id"])
    
    # Get student details
    students = []
    for sid in student_ids:
        try:
            student = await db.students.find_one({"_id": ObjectId(sid)})
            if student:
                students.append({
                    "id": str(student["_id"]),
                    "student_id": student["student_id"],
                    "full_name": student["full_name"],
                    "level": student.get("level", 1),
                    "section": student.get("section", "")
                })
        except:
            pass
    
    # Format courses
    courses_data = []
    for c in courses:
        teacher_name = ""
        if c.get("teacher_id"):
            teacher = await db.users.find_one({"_id": ObjectId(c["teacher_id"])})
            if teacher:
                teacher_name = teacher["full_name"]
        
        # Count enrolled students
        enrolled_count = await db.enrollments.count_documents({"course_id": str(c["_id"])})
        
        courses_data.append({
            "id": str(c["_id"]),
            "name": c["name"],
            "code": c.get("code", ""),
            "level": c.get("level", 1),
            "section": c.get("section", ""),
            "teacher_name": teacher_name,
            "students_count": enrolled_count
        })
    
    return {
        "id": str(dept["_id"]),
        "name": dept["name"],
        "code": dept.get("code", ""),
        "description": dept.get("description", ""),
        "students_count": len(students),
        "courses_count": len(courses),
        "teachers_count": len(teachers),
        "students": students,
        "courses": courses_data,
        "teachers": teachers
    }

@api_router.get("/departments/stats")
async def get_departments_stats(current_user: dict = Depends(get_current_user)):
    """Get all departments with student counts"""
    # تطبيق فلتر النطاق بناءً على دور المستخدم
    scope_filter = await get_user_scope_filter(current_user, "departments")
    
    depts = await db.departments.find(scope_filter).to_list(100)
    
    result = []
    for dept in depts:
        dept_id = str(dept["_id"])
        
        # Get courses in this department
        courses = await db.courses.find({"department_id": dept_id}).to_list(100)
        course_ids = [str(c["_id"]) for c in courses]
        
        # Get unique students from enrollments
        student_ids = set()
        for course_id in course_ids:
            enrollments = await db.enrollments.find({"course_id": course_id}).to_list(1000)
            for e in enrollments:
                student_ids.add(e["student_id"])
        
        # جلب اسم الكلية
        faculty_name = None
        if dept.get("faculty_id"):
            try:
                faculty = await db.faculties.find_one({"_id": ObjectId(dept["faculty_id"])})
                faculty_name = faculty["name"] if faculty else None
            except:
                pass
        
        result.append({
            "id": dept_id,
            "name": dept["name"],
            "code": dept.get("code", ""),
            "description": dept.get("description", ""),
            "faculty_id": dept.get("faculty_id"),
            "faculty_name": faculty_name,
            "students_count": len(student_ids),
            "courses_count": len(courses)
        })
    
    return result

@api_router.get("/departments/dashboard")
async def get_department_head_dashboard(current_user: dict = Depends(get_current_user)):
    """لوحة تحكم رئيس القسم - إحصائيات الأقسام + التنبيهات"""
    
    # جلب الأقسام التي يديرها المستخدم
    user_data = await db.users.find_one({"_id": ObjectId(current_user["id"])})
    if not user_data:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    # جلب قائمة الأقسام
    department_ids = user_data.get("department_ids") or []
    if not department_ids and user_data.get("department_id"):
        department_ids = [user_data.get("department_id")]
    
    # إذا كان المستخدم admin أو لديه faculty_id، جلب كل الأقسام
    if current_user["role"] == UserRole.ADMIN:
        depts = await db.departments.find({}).to_list(100)
    elif user_data.get("faculty_id") and not department_ids:
        depts = await db.departments.find({"faculty_id": user_data["faculty_id"]}).to_list(100)
    elif department_ids:
        depts = await db.departments.find({"_id": {"$in": [ObjectId(did) for did in department_ids]}}).to_list(100)
    else:
        depts = []
    
    # جلب إعدادات النظام
    settings = await db.settings.find_one({"type": "general"})
    warning_threshold = settings.get("warning_threshold", 15) if settings else 15
    deprivation_threshold = settings.get("deprivation_threshold", 25) if settings else 25
    
    departments_data = []
    total_students = 0
    total_courses = 0
    all_warnings = []
    
    for dept in depts:
        dept_id = str(dept["_id"])
        
        # جلب المقررات في هذا القسم
        courses = await db.courses.find({"department_id": dept_id, "is_active": True}).to_list(100)
        course_ids = [str(c["_id"]) for c in courses]
        
        # جلب الطلاب المسجلين
        student_ids = set()
        for course_id in course_ids:
            enrollments = await db.enrollments.find({"course_id": course_id}).to_list(1000)
            for e in enrollments:
                student_ids.add(e["student_id"])
        
        dept_students_count = len(student_ids)
        dept_courses_count = len(courses)
        total_students += dept_students_count
        total_courses += dept_courses_count
        
        # حساب نسبة الحضور اليومي
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_attendance = 0
        today_total = 0
        
        for course_id in course_ids:
            # جلب محاضرات اليوم
            today_lectures = await db.lectures.find({
                "course_id": course_id,
                "date": {"$gte": today}
            }).to_list(100)
            
            for lecture in today_lectures:
                lecture_id = str(lecture["_id"])
                records = await db.attendance.find({
                    "lecture_id": lecture_id,
                    "course_id": course_id
                }).to_list(1000)
                
                today_total += len(records)
                today_attendance += sum(1 for r in records if r["status"] == AttendanceStatus.PRESENT)
        
        attendance_rate = round((today_attendance / today_total * 100), 1) if today_total > 0 else 0
        
        # جلب التنبيهات (طلاب قريبون من الحرمان)
        dept_warnings = []
        for course in courses:
            cid = str(course["_id"])
            active_lecture_ids = await get_active_lecture_ids(cid)
            total_lectures = len(active_lecture_ids)
            
            if total_lectures == 0:
                continue
            
            enrollments = await db.enrollments.find({"course_id": cid}).to_list(1000)
            
            for enrollment in enrollments:
                student_id = enrollment["student_id"]
                
                records = await db.attendance.find({
                    "student_id": student_id,
                    "course_id": cid,
                    "lecture_id": {"$in": list(active_lecture_ids)}
                }).to_list(1000)
                
                absent_count = sum(1 for r in records if r["status"] == AttendanceStatus.ABSENT)
                absence_rate = (absent_count / total_lectures) * 100
                
                if absence_rate >= warning_threshold:
                    student = await db.students.find_one({"_id": ObjectId(student_id)})
                    if student:
                        warning_data = {
                            "student_id": student.get("student_id"),
                            "student_name": student.get("full_name"),
                            "course_name": course["name"],
                            "course_code": course.get("code", ""),
                            "department_id": dept_id,
                            "department_name": dept["name"],
                            "total_lectures": total_lectures,
                            "absent_count": absent_count,
                            "absence_rate": round(absence_rate, 2),
                            "remaining_allowed": max(0, int((deprivation_threshold / 100) * total_lectures) - absent_count),
                            "status": "محروم" if absence_rate >= deprivation_threshold else "إنذار"
                        }
                        dept_warnings.append(warning_data)
                        all_warnings.append(warning_data)
        
        # جلب اسم الكلية
        faculty_name = None
        if dept.get("faculty_id"):
            try:
                faculty = await db.faculties.find_one({"_id": ObjectId(dept["faculty_id"])})
                faculty_name = faculty["name"] if faculty else None
            except:
                pass
        
        departments_data.append({
            "id": dept_id,
            "name": dept["name"],
            "code": dept.get("code", ""),
            "faculty_name": faculty_name,
            "students_count": dept_students_count,
            "courses_count": dept_courses_count,
            "today_attendance_rate": attendance_rate,
            "warnings_count": len([w for w in dept_warnings if w["status"] == "إنذار"]),
            "deprivations_count": len([w for w in dept_warnings if w["status"] == "محروم"])
        })
    
    return {
        "departments": departments_data,
        "summary": {
            "total_departments": len(departments_data),
            "total_students": total_students,
            "total_courses": total_courses,
            "total_warnings": len([w for w in all_warnings if w["status"] == "إنذار"]),
            "total_deprivations": len([w for w in all_warnings if w["status"] == "محروم"])
        },
        "warnings": sorted(all_warnings, key=lambda x: x["absence_rate"], reverse=True)[:20],  # أعلى 20 تنبيه
        "thresholds": {
            "warning": warning_threshold,
            "deprivation": deprivation_threshold
        }
    }

# ==================== Notification Routes (مسارات الإشعارات) ====================

async def create_student_notification(
    student_id: str,
    student_db_id: str,
    notification_type: NotificationType,
    course_name: str,
    course_id: str,
    absence_rate: float,
    remaining_allowed: int
):
    """إنشاء إشعار للطالب"""
    
    # جلب بيانات الطالب
    student = await db.students.find_one({"_id": ObjectId(student_db_id)})
    if not student:
        return None
    
    # تحديد العنوان والرسالة حسب النوع
    if notification_type == NotificationType.WARNING:
        title = f"⚠️ إنذار غياب - {course_name}"
        message = f"نسبة غيابك في مقرر {course_name} وصلت إلى {absence_rate:.1f}%. يتبقى لك {remaining_allowed} غياب مسموح قبل الحرمان."
    elif notification_type == NotificationType.DEPRIVATION:
        title = f"🚫 تنبيه حرمان - {course_name}"
        message = f"تجاوزت نسبة الغياب المسموحة في مقرر {course_name}. نسبة غيابك الحالية: {absence_rate:.1f}%."
    else:
        title = f"📢 إشعار - {course_name}"
        message = f"إشعار متعلق بمقرر {course_name}"
    
    # التحقق من عدم وجود إشعار مشابه خلال آخر 24 ساعة
    yesterday = datetime.utcnow() - timedelta(days=1)
    existing_notification = await db.notifications.find_one({
        "student_id": student_db_id,
        "course_id": course_id,
        "type": notification_type.value,
        "created_at": {"$gte": yesterday}
    })
    
    if existing_notification:
        # تحديث الإشعار الموجود إذا تغيرت النسبة
        if existing_notification.get("absence_rate") != absence_rate:
            await db.notifications.update_one(
                {"_id": existing_notification["_id"]},
                {"$set": {
                    "message": message,
                    "absence_rate": absence_rate,
                    "remaining_allowed": remaining_allowed,
                    "is_read": False,
                    "updated_at": datetime.utcnow()
                }}
            )
        return None
    
    # إنشاء إشعار جديد
    notification = {
        "student_id": student_db_id,
        "user_id": student.get("user_id"),
        "title": title,
        "message": message,
        "type": notification_type.value,
        "course_id": course_id,
        "course_name": course_name,
        "absence_rate": absence_rate,
        "remaining_allowed": remaining_allowed,
        "is_read": False,
        "created_at": datetime.utcnow()
    }
    
    result = await db.notifications.insert_one(notification)
    return str(result.inserted_id)

async def check_and_create_absence_notifications(student_id: str, course_id: str):
    """التحقق من نسبة الغياب وإنشاء إشعارات إذا لزم الأمر"""
    
    # جلب الطالب
    student = await db.students.find_one({"student_id": student_id})
    if not student:
        return
    
    student_db_id = str(student["_id"])
    
    # جلب المقرر
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        return
    
    # جلب الإعدادات
    settings = await db.settings.find_one({"type": "general"})
    warning_threshold = settings.get("warning_threshold", 15) if settings else 15
    deprivation_threshold = settings.get("deprivation_threshold", 25) if settings else 25
    
    # حساب نسبة الغياب
    active_lecture_ids = await get_active_lecture_ids(course_id)
    total_lectures = len(active_lecture_ids)
    
    if total_lectures == 0:
        return
    
    records = await db.attendance.find({
        "student_id": student_id,
        "course_id": course_id,
        "lecture_id": {"$in": list(active_lecture_ids)}
    }).to_list(1000)
    
    absent_count = sum(1 for r in records if r["status"] == AttendanceStatus.ABSENT)
    absence_rate = (absent_count / total_lectures) * 100
    
    # حساب الغيابات المتبقية
    max_allowed = int((deprivation_threshold / 100) * total_lectures)
    remaining_allowed = max(0, max_allowed - absent_count)
    
    # إنشاء إشعار حسب النسبة
    if absence_rate >= deprivation_threshold:
        await create_student_notification(
            student_id=student_id,
            student_db_id=student_db_id,
            notification_type=NotificationType.DEPRIVATION,
            course_name=course["name"],
            course_id=course_id,
            absence_rate=absence_rate,
            remaining_allowed=0
        )
    elif absence_rate >= warning_threshold:
        await create_student_notification(
            student_id=student_id,
            student_db_id=student_db_id,
            notification_type=NotificationType.WARNING,
            course_name=course["name"],
            course_id=course_id,
            absence_rate=absence_rate,
            remaining_allowed=remaining_allowed
        )

@api_router.get("/notifications")
async def get_notifications(
    limit: int = 50,
    unread_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """جلب إشعارات المستخدم الحالي"""
    
    # البحث عن الطالب المرتبط بهذا المستخدم
    user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    # البحث عن الطالب
    student = await db.students.find_one({"user_id": str(user["_id"])})
    
    if not student:
        # إذا لم يكن طالباً، ربما يكون admin أو معلم - إرجاع قائمة فارغة
        return {"notifications": [], "unread_count": 0}
    
    student_db_id = str(student["_id"])
    
    # جلب الإشعارات
    query = {"student_id": student_db_id}
    if unread_only:
        query["is_read"] = False
    
    notifications = await db.notifications.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    
    # حساب عدد الإشعارات غير المقروءة
    unread_count = await db.notifications.count_documents({"student_id": student_db_id, "is_read": False})
    
    result = []
    for n in notifications:
        result.append({
            "id": str(n["_id"]),
            "title": n["title"],
            "message": n["message"],
            "type": n["type"],
            "course_id": n.get("course_id"),
            "course_name": n.get("course_name"),
            "absence_rate": n.get("absence_rate"),
            "remaining_allowed": n.get("remaining_allowed"),
            "is_read": n.get("is_read", False),
            "created_at": n["created_at"]
        })
    
    return {"notifications": result, "unread_count": unread_count}

@api_router.get("/notifications/count")
async def get_unread_notifications_count(current_user: dict = Depends(get_current_user)):
    """جلب عدد الإشعارات غير المقروءة"""
    
    user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
    if not user:
        return {"count": 0}
    
    student = await db.students.find_one({"user_id": str(user["_id"])})
    if not student:
        return {"count": 0}
    
    count = await db.notifications.count_documents({
        "student_id": str(student["_id"]),
        "is_read": False
    })
    
    return {"count": count}

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """تحديد إشعار كمقروء"""
    
    notification = await db.notifications.find_one({"_id": ObjectId(notification_id)})
    if not notification:
        raise HTTPException(status_code=404, detail="الإشعار غير موجود")
    
    await db.notifications.update_one(
        {"_id": ObjectId(notification_id)},
        {"$set": {"is_read": True}}
    )
    
    return {"message": "تم تحديد الإشعار كمقروء"}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_as_read(current_user: dict = Depends(get_current_user)):
    """تحديد جميع الإشعارات كمقروءة"""
    
    user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
    if not user:
        return {"message": "لا توجد إشعارات"}
    
    student = await db.students.find_one({"user_id": str(user["_id"])})
    if not student:
        return {"message": "لا توجد إشعارات"}
    
    result = await db.notifications.update_many(
        {"student_id": str(student["_id"]), "is_read": False},
        {"$set": {"is_read": True}}
    )
    
    return {"message": f"تم تحديد {result.modified_count} إشعار كمقروء"}

class ManualNotificationCreate(BaseModel):
    student_id: str  # معرف الطالب (من جدول students)
    title: str
    message: str
    type: str = "warning"  # warning, deprivation, info, reminder
    course_id: Optional[str] = None

@api_router.post("/notifications/manual")
async def create_manual_notification(
    data: ManualNotificationCreate,
    current_user: dict = Depends(get_current_user)
):
    """إنشاء إنذار/إشعار يدوي لطالب معين"""
    
    # التحقق من الصلاحيات - يجب أن يكون admin أو لديه صلاحية send_notifications
    if current_user["role"] != UserRole.ADMIN:
        user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
        user_permissions = user.get("permissions", []) if user else []
        
        if Permission.SEND_NOTIFICATIONS not in user_permissions:
            raise HTTPException(status_code=403, detail="غير مصرح لك بإرسال إنذارات. تحتاج صلاحية 'إرسال إشعارات وإنذارات للطلاب'")
    
    # جلب بيانات الطالب
    student = await db.students.find_one({"_id": ObjectId(data.student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # جلب اسم المقرر إذا تم تحديده
    course_name = None
    if data.course_id:
        course = await db.courses.find_one({"_id": ObjectId(data.course_id)})
        if course:
            course_name = course["name"]
    
    # إنشاء الإشعار
    notification = {
        "student_id": data.student_id,
        "user_id": student.get("user_id"),
        "title": data.title,
        "message": data.message,
        "type": data.type,
        "course_id": data.course_id,
        "course_name": course_name,
        "is_read": False,
        "is_manual": True,  # تمييز الإنذار اليدوي
        "sent_by": current_user["id"],
        "sent_by_name": current_user.get("full_name", ""),
        "created_at": datetime.utcnow()
    }
    
    result = await db.notifications.insert_one(notification)
    
    # تسجيل النشاط
    await log_activity(
        user=current_user,
        action="send_manual_notification",
        entity_type="notification",
        entity_id=str(result.inserted_id),
        entity_name=student.get('full_name', student.get('student_id'))
    )
    
    return {
        "message": f"تم إرسال الإنذار للطالب {student.get('full_name')} بنجاح",
        "notification_id": str(result.inserted_id)
    }

@api_router.get("/students/{student_id}/notifications")
async def get_student_notifications(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    """جلب إشعارات طالب معين (للمدير أو من لديه صلاحية)"""
    
    # التحقق من الصلاحيات
    if current_user["role"] != UserRole.ADMIN:
        user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
        user_permissions = user.get("permissions", []) if user else []
        
        if Permission.SEND_NOTIFICATIONS not in user_permissions:
            raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # جلب الإشعارات
    notifications = await db.notifications.find(
        {"student_id": student_id}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    result = []
    for n in notifications:
        result.append({
            "id": str(n["_id"]),
            "title": n["title"],
            "message": n["message"],
            "type": n["type"],
            "course_id": n.get("course_id"),
            "course_name": n.get("course_name"),
            "is_read": n.get("is_read", False),
            "is_manual": n.get("is_manual", False),
            "sent_by_name": n.get("sent_by_name"),
            "created_at": n["created_at"]
        })
    
    return {"notifications": result, "count": len(result)}

# ==================== Student Routes ====================

@api_router.post("/students", response_model=StudentResponse)
async def create_student(student: StudentCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    existing = await db.students.find_one({"student_id": student.student_id})
    if existing:
        raise HTTPException(status_code=400, detail="رقم الطالب موجود مسبقاً")
    
    student_dict = student.dict()
    student_dict["qr_code"] = generate_qr_code(student.student_id)
    student_dict["created_at"] = datetime.utcnow()
    student_dict["is_active"] = True
    
    # Create user account for student if password provided
    user_id = None
    if student.password:
        user_data = {
            "username": student.student_id,
            "password": get_password_hash(student.password),
            "full_name": student.full_name,
            "role": UserRole.STUDENT,
            "email": student.email,
            "phone": student.phone,
            "created_at": datetime.utcnow(),
            "is_active": True
        }
        user_result = await db.users.insert_one(user_data)
        user_id = str(user_result.inserted_id)
    
    student_dict["user_id"] = user_id
    del student_dict["password"]
    
    result = await db.students.insert_one(student_dict)
    student_dict["id"] = str(result.inserted_id)
    
    return student_dict

@api_router.get("/students", response_model=List[StudentResponse])
async def get_students(
    department_id: Optional[str] = None,
    level: Optional[int] = None,
    section: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    # بناء فلتر الاستعلام الأساسي
    query = {"is_active": True}
    
    # تطبيق فلتر النطاق بناءً على دور المستخدم
    scope_filter = await get_user_scope_filter(current_user, "students")
    query.update(scope_filter)
    
    # تطبيق الفلاتر الإضافية من المستخدم
    if department_id:
        # التحقق من أن المستخدم له حق الوصول لهذا القسم
        if "$in" in query.get("department_id", {}):
            # إذا كان هناك فلتر نطاق على الأقسام، تأكد من أن القسم المطلوب ضمنه
            if department_id in query["department_id"]["$in"]:
                query["department_id"] = department_id
            # وإلا نترك فلتر النطاق كما هو (لن يُرجع شيء من هذا القسم)
        elif not query.get("department_id"):
            query["department_id"] = department_id
    if level:
        query["level"] = level
    if section:
        query["section"] = section
    
    students = await db.students.find(query).to_list(1000)
    return [{
        "id": str(s["_id"]),
        "student_id": s["student_id"],
        "full_name": s["full_name"],
        "department_id": s["department_id"],
        "level": s["level"],
        "section": s["section"],
        "phone": s.get("phone"),
        "email": s.get("email"),
        "user_id": s.get("user_id"),
        "qr_code": s["qr_code"],
        "created_at": s["created_at"],
        "is_active": s.get("is_active", True)
    } for s in students]

@api_router.get("/students/me", response_model=StudentResponse)
async def get_my_student_record(current_user: dict = Depends(get_current_user)):
    """الحصول على بيانات الطالب الحالي - للطلاب فقط"""
    if current_user["role"] != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="هذا الـ endpoint للطلاب فقط")
    
    # البحث عن سجل الطالب المرتبط بهذا المستخدم
    student = await db.students.find_one({"user_id": current_user["id"]})
    if not student:
        raise HTTPException(status_code=404, detail="لم يتم العثور على سجل الطالب")
    
    return {
        "id": str(student["_id"]),
        "student_id": student["student_id"],
        "full_name": student["full_name"],
        "department_id": student["department_id"],
        "level": student["level"],
        "section": student["section"],
        "phone": student.get("phone"),
        "email": student.get("email"),
        "user_id": student.get("user_id"),
        "qr_code": student["qr_code"],
        "created_at": student["created_at"],
        "is_active": student.get("is_active", True)
    }

@api_router.get("/students/{student_id}", response_model=StudentResponse)
async def get_student(student_id: str, current_user: dict = Depends(get_current_user)):
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    return {
        "id": str(student["_id"]),
        "student_id": student["student_id"],
        "full_name": student["full_name"],
        "department_id": student["department_id"],
        "level": student["level"],
        "section": student["section"],
        "phone": student.get("phone"),
        "email": student.get("email"),
        "user_id": student.get("user_id"),
        "qr_code": student["qr_code"],
        "created_at": student["created_at"],
        "is_active": student.get("is_active", True)
    }

@api_router.get("/students/qr/{qr_code}", response_model=StudentResponse)
async def get_student_by_qr(qr_code: str, current_user: dict = Depends(get_current_user)):
    student = await db.students.find_one({"qr_code": qr_code})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    return {
        "id": str(student["_id"]),
        "student_id": student["student_id"],
        "full_name": student["full_name"],
        "department_id": student["department_id"],
        "level": student["level"],
        "section": student["section"],
        "phone": student.get("phone"),
        "email": student.get("email"),
        "user_id": student.get("user_id"),
        "qr_code": student["qr_code"],
        "created_at": student["created_at"],
        "is_active": student.get("is_active", True)
    }

@api_router.delete("/students/{student_id}")
async def delete_student(student_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Delete associated user account if exists
    if student.get("user_id"):
        await db.users.delete_one({"_id": ObjectId(student["user_id"])})
    
    await db.students.delete_one({"_id": ObjectId(student_id)})
    
    return {"message": "تم حذف الطالب بنجاح"}

class StudentUpdate(BaseModel):
    full_name: Optional[str] = None
    department_id: Optional[str] = None
    level: Optional[int] = None
    section: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

@api_router.put("/students/{student_id}", response_model=StudentResponse)
async def update_student(student_id: str, data: StudentUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    
    if update_data:
        await db.students.update_one(
            {"_id": ObjectId(student_id)},
            {"$set": update_data}
        )
    
    updated = await db.students.find_one({"_id": ObjectId(student_id)})
    return {
        "id": str(updated["_id"]),
        "student_id": updated["student_id"],
        "full_name": updated["full_name"],
        "department_id": updated["department_id"],
        "level": updated["level"],
        "section": updated["section"],
        "phone": updated.get("phone"),
        "email": updated.get("email"),
        "user_id": updated.get("user_id"),
        "qr_code": updated["qr_code"],
        "created_at": updated["created_at"],
        "is_active": updated.get("is_active", True)
    }

# ==================== Student Account Activation (تفعيل حساب الطالب) ====================

@api_router.post("/students/{student_id}/activate")
async def activate_student_account(student_id: str, current_user: dict = Depends(get_current_user)):
    """تفعيل حساب للطالب - الرقم الجامعي يكون اسم المستخدم وكلمة المرور الافتراضية"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بتفعيل حسابات الطلاب")
    
    # البحث عن الطالب
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # التحقق من عدم وجود حساب مسبق
    if student.get("user_id"):
        raise HTTPException(status_code=400, detail="الطالب لديه حساب مفعل مسبقاً")
    
    # التحقق من عدم وجود مستخدم بنفس الرقم الجامعي
    existing_user = await db.users.find_one({"username": student["student_id"]})
    if existing_user:
        raise HTTPException(status_code=400, detail="يوجد مستخدم بهذا الرقم الجامعي")
    
    # إنشاء حساب للطالب
    user_dict = {
        "username": student["student_id"],  # الرقم الجامعي كاسم مستخدم
        "password": get_password_hash(student["student_id"]),  # الرقم الجامعي ككلمة مرور افتراضية
        "full_name": student["full_name"],
        "role": UserRole.STUDENT,
        "email": student.get("email"),
        "phone": student.get("phone"),
        "student_record_id": str(student["_id"]),  # ربط بسجل الطالب
        "must_change_password": True,  # إجبار على تغيير كلمة المرور
        "is_active": True,
        "created_at": datetime.utcnow()
    }
    
    result = await db.users.insert_one(user_dict)
    user_id = str(result.inserted_id)
    
    # ربط الحساب بسجل الطالب
    await db.students.update_one(
        {"_id": ObjectId(student_id)},
        {"$set": {"user_id": user_id}}
    )
    
    return {
        "message": "تم تفعيل حساب الطالب بنجاح",
        "username": student["student_id"],
        "user_id": user_id,
        "must_change_password": True
    }

@api_router.post("/students/{student_id}/deactivate")
async def deactivate_student_account(student_id: str, current_user: dict = Depends(get_current_user)):
    """إلغاء تفعيل حساب الطالب"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    if not student.get("user_id"):
        raise HTTPException(status_code=400, detail="الطالب ليس لديه حساب مفعل")
    
    # حذف حساب المستخدم
    await db.users.delete_one({"_id": ObjectId(student["user_id"])})
    
    # إزالة ربط الحساب من سجل الطالب
    await db.students.update_one(
        {"_id": ObjectId(student_id)},
        {"$unset": {"user_id": ""}}
    )
    
    return {"message": "تم إلغاء تفعيل حساب الطالب"}

@api_router.post("/students/{student_id}/reset-password")
async def reset_student_password(student_id: str, current_user: dict = Depends(get_current_user)):
    """إعادة تعيين كلمة مرور الطالب"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    if not student.get("user_id"):
        raise HTTPException(status_code=400, detail="الطالب ليس لديه حساب مفعل")
    
    # إعادة كلمة المرور للرقم الجامعي
    await db.users.update_one(
        {"_id": ObjectId(student["user_id"])},
        {"$set": {
            "password": get_password_hash(student["student_id"]),
            "must_change_password": True
        }}
    )
    
    return {
        "message": "تم إعادة تعيين كلمة المرور بنجاح",
        "new_password": student["student_id"]
    }

# ==================== Teacher Routes (إدارة المعلمين) ====================

@api_router.get("/teachers")
async def get_teachers(
    department_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """الحصول على جميع المعلمين"""
    # تطبيق فلتر النطاق بناءً على دور المستخدم
    scope_filter = await get_user_scope_filter(current_user, "teachers")
    query = {**scope_filter}
    
    # تطبيق فلتر القسم الإضافي
    if department_id:
        if "$in" in query.get("department_id", {}):
            if department_id in query["department_id"]["$in"]:
                query["department_id"] = department_id
        elif not query.get("department_id"):
            query["department_id"] = department_id
    
    teachers = await db.teachers.find(query).to_list(1000)
    result = []
    for teacher in teachers:
        teacher_dict = {
            "id": str(teacher["_id"]),
            "teacher_id": teacher.get("teacher_id", ""),
            "full_name": teacher.get("full_name", ""),
            "department_id": teacher.get("department_id"),
            "email": teacher.get("email"),
            "phone": teacher.get("phone"),
            "specialization": teacher.get("specialization"),
            "user_id": teacher.get("user_id"),
            "created_at": teacher.get("created_at", datetime.utcnow()),
            "is_active": teacher.get("is_active", True)
        }
        result.append(teacher_dict)
    return result

@api_router.post("/teachers", response_model=TeacherResponse)
async def create_teacher(teacher: TeacherCreate, current_user: dict = Depends(get_current_user)):
    """إضافة معلم جديد"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # التحقق من عدم تكرار الرقم الوظيفي
    existing = await db.teachers.find_one({"teacher_id": teacher.teacher_id})
    if existing:
        raise HTTPException(status_code=400, detail="الرقم الوظيفي مستخدم مسبقاً")
    
    teacher_dict = teacher.dict()
    teacher_dict["created_at"] = datetime.utcnow()
    teacher_dict["is_active"] = True
    
    result = await db.teachers.insert_one(teacher_dict)
    teacher_dict["id"] = str(result.inserted_id)
    
    return teacher_dict

@api_router.get("/teachers/{teacher_id}")
async def get_teacher(teacher_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على معلم محدد"""
    teacher = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
    if not teacher:
        raise HTTPException(status_code=404, detail="المعلم غير موجود")
    
    return {
        "id": str(teacher["_id"]),
        "teacher_id": teacher.get("teacher_id", ""),
        "full_name": teacher.get("full_name", ""),
        "department_id": teacher.get("department_id"),
        "email": teacher.get("email"),
        "phone": teacher.get("phone"),
        "specialization": teacher.get("specialization"),
        "user_id": teacher.get("user_id"),
        "created_at": teacher.get("created_at", datetime.utcnow()),
        "is_active": teacher.get("is_active", True)
    }

@api_router.get("/teachers/{teacher_id}/courses")
async def get_teacher_courses(teacher_id: str, current_user: dict = Depends(get_current_user)):
    """جلب جميع مقررات المعلم في جميع الأقسام"""
    # التحقق من وجود المعلم
    teacher = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
    if not teacher:
        raise HTTPException(status_code=404, detail="المعلم غير موجود")
    
    # جلب المقررات التي يدرسها المعلم
    courses = await db.courses.find({"teacher_id": teacher_id}).to_list(100)
    
    result = []
    for course in courses:
        # جلب معلومات القسم
        dept_name = ""
        faculty_name = ""
        if course.get("department_id"):
            dept = await db.departments.find_one({"_id": ObjectId(course["department_id"])})
            if dept:
                dept_name = dept.get("name", "")
                if dept.get("faculty_id"):
                    faculty = await db.faculties.find_one({"_id": ObjectId(dept["faculty_id"])})
                    faculty_name = faculty.get("name", "") if faculty else ""
        
        # حساب عدد الطلاب المسجلين
        students_count = await db.enrollments.count_documents({"course_id": str(course["_id"])})
        
        # حساب عدد المحاضرات
        lectures_count = await db.lectures.count_documents({"course_id": str(course["_id"])})
        
        result.append({
            "id": str(course["_id"]),
            "name": course["name"],
            "code": course.get("code", ""),
            "level": course.get("level", 1),
            "section": course.get("section", ""),
            "department_id": course.get("department_id"),
            "department_name": dept_name,
            "faculty_name": faculty_name,
            "students_count": students_count,
            "lectures_count": lectures_count,
            "is_active": course.get("is_active", True)
        })
    
    return {
        "teacher_id": teacher_id,
        "teacher_name": teacher.get("full_name", ""),
        "department_name": "",  # القسم الإداري
        "total_courses": len(result),
        "courses": result
    }

@api_router.put("/teachers/{teacher_id}")
async def update_teacher(teacher_id: str, data: TeacherUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث بيانات معلم"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    teacher = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
    if not teacher:
        raise HTTPException(status_code=404, detail="المعلم غير موجود")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if update_data:
        await db.teachers.update_one({"_id": ObjectId(teacher_id)}, {"$set": update_data})
    
    updated = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
    return {
        "id": str(updated["_id"]),
        "teacher_id": updated.get("teacher_id", ""),
        "full_name": updated.get("full_name", ""),
        "department_id": updated.get("department_id"),
        "email": updated.get("email"),
        "phone": updated.get("phone"),
        "specialization": updated.get("specialization"),
        "user_id": updated.get("user_id"),
        "is_active": updated.get("is_active", True)
    }

@api_router.delete("/teachers/{teacher_id}")
async def delete_teacher(teacher_id: str, current_user: dict = Depends(get_current_user)):
    """حذف معلم"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    teacher = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
    if not teacher:
        raise HTTPException(status_code=404, detail="المعلم غير موجود")
    
    # حذف حساب المستخدم المرتبط إن وجد
    if teacher.get("user_id"):
        await db.users.delete_one({"_id": ObjectId(teacher["user_id"])})
    
    await db.teachers.delete_one({"_id": ObjectId(teacher_id)})
    return {"message": "تم حذف المعلم بنجاح"}

# ==================== Teacher Account Activation (تفعيل حساب المعلم) ====================

@api_router.post("/teachers/{teacher_id}/activate")
async def activate_teacher_account(teacher_id: str, current_user: dict = Depends(get_current_user)):
    """تفعيل حساب للمعلم - الرقم الوظيفي يكون اسم المستخدم وكلمة المرور الافتراضية"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بتفعيل حسابات المعلمين")
    
    teacher = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
    if not teacher:
        raise HTTPException(status_code=404, detail="المعلم غير موجود")
    
    if teacher.get("user_id"):
        raise HTTPException(status_code=400, detail="المعلم لديه حساب مفعل مسبقاً")
    
    existing_user = await db.users.find_one({"username": teacher["teacher_id"]})
    if existing_user:
        raise HTTPException(status_code=400, detail="يوجد مستخدم بهذا الرقم الوظيفي")
    
    user_dict = {
        "username": teacher["teacher_id"],
        "password": get_password_hash(teacher["teacher_id"]),
        "full_name": teacher["full_name"],
        "role": UserRole.TEACHER,
        "email": teacher.get("email"),
        "phone": teacher.get("phone"),
        "teacher_record_id": str(teacher["_id"]),
        "must_change_password": True,
        "is_active": True,
        "created_at": datetime.utcnow()
    }
    
    result = await db.users.insert_one(user_dict)
    user_id = str(result.inserted_id)
    
    await db.teachers.update_one(
        {"_id": ObjectId(teacher_id)},
        {"$set": {"user_id": user_id}}
    )
    
    return {
        "message": "تم تفعيل حساب المعلم بنجاح",
        "username": teacher["teacher_id"],
        "user_id": user_id,
        "must_change_password": True
    }

@api_router.post("/teachers/{teacher_id}/deactivate")
async def deactivate_teacher_account(teacher_id: str, current_user: dict = Depends(get_current_user)):
    """إلغاء تفعيل حساب المعلم"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    teacher = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
    if not teacher:
        raise HTTPException(status_code=404, detail="المعلم غير موجود")
    
    if not teacher.get("user_id"):
        raise HTTPException(status_code=400, detail="المعلم ليس لديه حساب مفعل")
    
    await db.users.delete_one({"_id": ObjectId(teacher["user_id"])})
    await db.teachers.update_one(
        {"_id": ObjectId(teacher_id)},
        {"$unset": {"user_id": ""}}
    )
    
    return {"message": "تم إلغاء تفعيل حساب المعلم"}

@api_router.post("/teachers/{teacher_id}/reset-password")
async def reset_teacher_password(teacher_id: str, current_user: dict = Depends(get_current_user)):
    """إعادة تعيين كلمة مرور المعلم"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    teacher = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
    if not teacher:
        raise HTTPException(status_code=404, detail="المعلم غير موجود")
    
    if not teacher.get("user_id"):
        raise HTTPException(status_code=400, detail="المعلم ليس لديه حساب مفعل")
    
    # إعادة كلمة المرور للرقم الوظيفي
    await db.users.update_one(
        {"_id": ObjectId(teacher["user_id"])},
        {"$set": {
            "password": get_password_hash(teacher["teacher_id"]),
            "must_change_password": True
        }}
    )
    
    return {
        "message": "تم إعادة تعيين كلمة المرور بنجاح",
        "new_password": teacher["teacher_id"]
    }

@api_router.post("/auth/change-password")
async def change_password(data: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    """تغيير كلمة المرور"""
    user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    # التحقق من كلمة المرور الحالية
    if not verify_password(data.current_password, user["password"]):
        raise HTTPException(status_code=400, detail="كلمة المرور الحالية غير صحيحة")
    
    # التحقق من أن كلمة المرور الجديدة مختلفة
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="كلمة المرور الجديدة يجب أن تكون مختلفة")
    
    # التحقق من طول كلمة المرور
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 6 أحرف على الأقل")
    
    # تحديث كلمة المرور وإلغاء علامة تغيير كلمة المرور الإجباري
    await db.users.update_one(
        {"_id": ObjectId(current_user["id"])},
        {
            "$set": {
                "password": get_password_hash(data.new_password),
                "must_change_password": False,
                "password_changed_at": datetime.utcnow()
            }
        }
    )
    
    return {"message": "تم تغيير كلمة المرور بنجاح"}

@api_router.post("/auth/force-change-password")
async def force_change_password(data: ForceChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    """تغيير كلمة المرور الإجباري (عند أول دخول)"""
    user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    # التحقق من أن المستخدم مطلوب منه تغيير كلمة المرور
    if not user.get("must_change_password", False):
        raise HTTPException(status_code=400, detail="ليس مطلوباً منك تغيير كلمة المرور")
    
    # التحقق من طول كلمة المرور
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 6 أحرف على الأقل")
    
    # التحقق من أن كلمة المرور الجديدة مختلفة عن الرقم الجامعي
    if data.new_password == user.get("username"):
        raise HTTPException(status_code=400, detail="كلمة المرور لا يمكن أن تكون نفس الرقم الجامعي")
    
    # تحديث كلمة المرور
    await db.users.update_one(
        {"_id": ObjectId(current_user["id"])},
        {
            "$set": {
                "password": get_password_hash(data.new_password),
                "must_change_password": False,
                "password_changed_at": datetime.utcnow()
            }
        }
    )
    
    return {"message": "تم تغيير كلمة المرور بنجاح", "must_change_password": False}

# ==================== Course Routes ====================

@api_router.post("/courses", response_model=CourseResponse)
async def create_course(course: CourseCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    course_dict = course.dict()
    course_dict["created_at"] = datetime.utcnow()
    course_dict["is_active"] = True
    
    result = await db.courses.insert_one(course_dict)
    course_dict["id"] = str(result.inserted_id)
    
    return course_dict

@api_router.get("/courses", response_model=List[CourseResponse])
async def get_courses(
    teacher_id: Optional[str] = None,
    department_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"is_active": True}
    
    # تطبيق فلتر النطاق بناءً على دور المستخدم
    scope_filter = await get_user_scope_filter(current_user, "courses")
    query.update(scope_filter)
    
    # Teachers can only see their own courses (تم تطبيقه تلقائياً في scope_filter)
    # لكن إذا جاء teacher_id من الـ query وكان المستخدم له حق الوصول:
    if current_user["role"] != UserRole.TEACHER and teacher_id:
        query["teacher_id"] = teacher_id
    
    # تطبيق فلتر القسم الإضافي
    if department_id:
        if "$in" in query.get("department_id", {}):
            if department_id in query["department_id"]["$in"]:
                query["department_id"] = department_id
        elif not query.get("department_id"):
            query["department_id"] = department_id
    
    courses = await db.courses.find(query).to_list(100)
    
    # جلب أسماء المعلمين من collection المعلمين أو المستخدمين
    result = []
    for c in courses:
        teacher_name = None
        if c.get("teacher_id"):
            try:
                # أولاً: البحث في collection المعلمين (الجديد)
                teacher = await db.teachers.find_one({"_id": ObjectId(c["teacher_id"])})
                if teacher:
                    teacher_name = teacher.get("full_name")
                else:
                    # ثانياً: البحث في المستخدمين (القديم)
                    teacher = await db.users.find_one({"_id": ObjectId(c["teacher_id"])})
                    if teacher:
                        teacher_name = teacher.get("full_name")
            except:
                pass
        
        result.append({
            "id": str(c["_id"]),
            "name": c["name"],
            "code": c["code"],
            "department_id": c["department_id"],
            "teacher_id": c.get("teacher_id"),
            "teacher_name": teacher_name,
            "level": c["level"],
            "section": c.get("section"),
            "semester": c.get("semester"),
            "semester_id": c.get("semester_id"),
            "academic_year": c.get("academic_year"),
            "created_at": c.get("created_at"),
            "is_active": c.get("is_active", True)
        })
    
    return result

@api_router.get("/courses/{course_id}", response_model=CourseResponse)
async def get_course(course_id: str, current_user: dict = Depends(get_current_user)):
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    return {
        "id": str(course["_id"]),
        "name": course["name"],
        "code": course["code"],
        "department_id": course["department_id"],
        "teacher_id": course["teacher_id"],
        "level": course["level"],
        "section": course.get("section", ""),
        "semester": course.get("semester", "الفصل الأول"),
        "academic_year": course.get("academic_year", "2024-2025"),
        "created_at": course["created_at"],
        "is_active": course.get("is_active", True)
    }

@api_router.delete("/courses/{course_id}")
async def delete_course(course_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    result = await db.courses.delete_one({"_id": ObjectId(course_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    return {"message": "تم حذف المقرر بنجاح"}

# ==================== Enrollment Routes (تسجيل الطلاب في المقررات) ====================

@api_router.get("/enrollments/{course_id}")
async def get_course_enrollments(course_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على قائمة الطلاب المسجلين في مقرر"""
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    enrollments = await db.enrollments.find({"course_id": course_id}).to_list(10000)
    
    # Get student details
    student_ids = [ObjectId(e["student_id"]) for e in enrollments]
    students = await db.students.find({"_id": {"$in": student_ids}}).to_list(10000)
    students_map = {str(s["_id"]): s for s in students}
    
    result = []
    for enrollment in enrollments:
        student = students_map.get(enrollment["student_id"])
        if student:
            result.append({
                "enrollment_id": str(enrollment["_id"]),
                "student_id": str(student["_id"]),
                "student_number": student["student_id"],
                "full_name": student["full_name"],
                "level": student["level"],
                "section": student["section"],
                "enrolled_at": enrollment["enrolled_at"]
            })
    
    return result

@api_router.post("/enrollments/{course_id}")
async def enroll_students(
    course_id: str, 
    data: EnrollmentCreate, 
    current_user: dict = Depends(get_current_user)
):
    """تسجيل طلاب في مقرر"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    enrolled_count = 0
    already_enrolled = 0
    not_found = 0
    
    for student_id in data.student_ids:
        # Find student by ObjectId or student_id number
        student = None
        try:
            student = await db.students.find_one({"_id": ObjectId(student_id)})
        except:
            student = await db.students.find_one({"student_id": student_id})
        
        if not student:
            not_found += 1
            continue
        
        # Check if already enrolled
        existing = await db.enrollments.find_one({
            "course_id": course_id,
            "student_id": str(student["_id"])
        })
        
        if existing:
            already_enrolled += 1
            continue
        
        # Create enrollment
        enrollment = {
            "course_id": course_id,
            "student_id": str(student["_id"]),
            "enrolled_at": datetime.utcnow(),
            "enrolled_by": current_user["id"]
        }
        await db.enrollments.insert_one(enrollment)
        enrolled_count += 1
    
    return {
        "message": f"تم تسجيل {enrolled_count} طالب",
        "enrolled": enrolled_count,
        "already_enrolled": already_enrolled,
        "not_found": not_found
    }

@api_router.delete("/enrollments/{course_id}/{student_id}")
async def unenroll_student(
    course_id: str, 
    student_id: str, 
    current_user: dict = Depends(get_current_user)
):
    """إلغاء تسجيل طالب من مقرر"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    result = await db.enrollments.delete_one({
        "course_id": course_id,
        "student_id": student_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="التسجيل غير موجود")
    
    return {"message": "تم إلغاء التسجيل بنجاح"}

@api_router.post("/enrollments/{course_id}/import")
async def import_enrollments_excel(
    course_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """استيراد طلاب إلى مقرر من ملف Excel"""
    logger.info(f"Import enrollments called: course_id={course_id}, filename={file.filename}, content_type={file.content_type}")
    
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    try:
        contents = await file.read()
        logger.info(f"File read successfully, size: {len(contents)} bytes")
        
        df = pd.read_excel(BytesIO(contents))
        logger.info(f"Excel parsed, columns: {list(df.columns)}, rows: {len(df)}")
        
        # Try to find student_id column
        student_id_col = None
        possible_names = ['student_id', 'رقم_الطالب', 'رقم الطالب', 'الرقم', 'id', 'ID']
        for col in df.columns:
            if col in possible_names or 'رقم' in str(col) or 'طالب' in str(col):
                student_id_col = col
                break
        
        if student_id_col is None:
            student_id_col = df.columns[0]  # Use first column
        
        enrolled_count = 0
        already_enrolled = 0
        not_found = 0
        errors = []
        
        for idx, row in df.iterrows():
            student_id_value = str(row[student_id_col]).strip()
            
            if not student_id_value or student_id_value == 'nan':
                continue
            
            # Find student
            student = await db.students.find_one({"student_id": student_id_value})
            
            if not student:
                not_found += 1
                errors.append(f"الطالب رقم {student_id_value} غير موجود")
                continue
            
            # Check if already enrolled
            existing = await db.enrollments.find_one({
                "course_id": course_id,
                "student_id": str(student["_id"])
            })
            
            if existing:
                already_enrolled += 1
                continue
            
            # Create enrollment
            enrollment = {
                "course_id": course_id,
                "student_id": str(student["_id"]),
                "enrolled_at": datetime.utcnow(),
                "enrolled_by": current_user["id"]
            }
            await db.enrollments.insert_one(enrollment)
            enrolled_count += 1
        
        return {
            "message": f"تم تسجيل {enrolled_count} طالب في المقرر",
            "enrolled": enrolled_count,
            "already_enrolled": already_enrolled,
            "not_found": not_found,
            "errors": errors[:10]  # Return first 10 errors
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"خطأ في قراءة الملف: {str(e)}")

@api_router.get("/enrollments/{course_id}/students")
async def get_enrolled_students_for_attendance(course_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على الطلاب المسجلين للحضور"""
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    # Get enrollments
    enrollments = await db.enrollments.find({"course_id": course_id}).to_list(10000)
    
    if not enrollments:
        # If no enrollments, return empty (or could fall back to old behavior)
        return []
    
    # Get student details
    student_ids = [ObjectId(e["student_id"]) for e in enrollments]
    students = await db.students.find({
        "_id": {"$in": student_ids},
        "is_active": True
    }).to_list(10000)
    
    result = []
    for student in students:
        result.append({
            "id": str(student["_id"]),
            "student_id": student["student_id"],
            "full_name": student["full_name"],
            "department_id": student["department_id"],
            "level": student["level"],
            "section": student["section"],
            "qr_code": student.get("qr_code", "")
        })
    
    return result

class CourseUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    department_id: Optional[str] = None
    teacher_id: Optional[str] = None
    level: Optional[int] = None
    section: Optional[str] = None
    semester: Optional[str] = None
    academic_year: Optional[str] = None

@api_router.put("/courses/{course_id}", response_model=CourseResponse)
async def update_course(course_id: str, data: CourseUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    
    if update_data:
        await db.courses.update_one(
            {"_id": ObjectId(course_id)},
            {"$set": update_data}
        )
    
    updated = await db.courses.find_one({"_id": ObjectId(course_id)})
    return {
        "id": str(updated["_id"]),
        "name": updated["name"],
        "code": updated["code"],
        "department_id": updated["department_id"],
        "teacher_id": updated["teacher_id"],
        "level": updated["level"],
        "section": updated["section"],
        "semester": updated["semester"],
        "academic_year": updated["academic_year"],
        "created_at": updated["created_at"],
        "is_active": updated.get("is_active", True)
    }

# ==================== Lecture Routes (المحاضرات/الحصص) ====================

@api_router.get("/lectures/today")
async def get_today_lectures(current_user: dict = Depends(get_current_user)):
    """الحصول على محاضرات اليوم للمعلم"""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    
    # جلب مقررات المعلم
    course_query = {"is_active": True}
    
    if current_user["role"] == UserRole.TEACHER:
        # البحث عن teacher_record_id في حساب المستخدم
        user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
        if user and user.get("teacher_record_id"):
            course_query["teacher_id"] = user["teacher_record_id"]
        else:
            course_query["teacher_id"] = current_user["id"]
    elif current_user["role"] != UserRole.ADMIN:
        # للمستخدمين غير المعلمين والمدير
        return []
    
    courses = await db.courses.find(course_query).to_list(100)
    course_ids = [str(c["_id"]) for c in courses]
    course_map = {str(c["_id"]): c for c in courses}
    
    if not course_ids:
        return []
    
    # جلب محاضرات اليوم لهذه المقررات
    lectures = await db.lectures.find({
        "course_id": {"$in": course_ids},
        "date": today
    }).sort("start_time", 1).to_list(100)
    
    result = []
    for lecture in lectures:
        course = course_map.get(lecture["course_id"], {})
        # حساب عدد الطلاب الحاضرين
        attendance_count = await db.attendance.count_documents({
            "lecture_id": str(lecture["_id"]),
            "status": "present"
        })
        total_enrolled = await db.enrollments.count_documents({"course_id": lecture["course_id"]})
        
        result.append({
            "id": str(lecture["_id"]),
            "course_id": lecture["course_id"],
            "course_name": course.get("name", ""),
            "course_code": course.get("code", ""),
            "date": lecture["date"],
            "start_time": lecture["start_time"],
            "end_time": lecture["end_time"],
            "room": lecture.get("room", ""),
            "status": lecture.get("status", LectureStatus.SCHEDULED),
            "notes": lecture.get("notes", ""),
            "attendance_count": attendance_count,
            "total_enrolled": total_enrolled,
            "created_at": lecture["created_at"]
        })
    
    return result

@api_router.get("/lectures/month/{year}/{month}")
async def get_month_lectures(year: int, month: int, current_user: dict = Depends(get_current_user)):
    """الحصول على محاضرات شهر معين للمعلم - يرجع التواريخ التي فيها محاضرات"""
    
    # جلب مقررات المعلم
    course_query = {"is_active": True}
    
    if current_user["role"] == UserRole.TEACHER:
        user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
        if user and user.get("teacher_record_id"):
            course_query["teacher_id"] = user["teacher_record_id"]
        else:
            course_query["teacher_id"] = current_user["id"]
    elif current_user["role"] != UserRole.ADMIN:
        return {"dates": [], "lectures": []}
    
    courses = await db.courses.find(course_query).to_list(100)
    course_ids = [str(c["_id"]) for c in courses]
    course_map = {str(c["_id"]): c for c in courses}
    
    if not course_ids:
        return {"dates": [], "lectures": []}
    
    # حساب بداية ونهاية الشهر
    start_date = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end_date = f"{year+1:04d}-01-01"
    else:
        end_date = f"{year:04d}-{month+1:02d}-01"
    
    # جلب محاضرات الشهر
    lectures = await db.lectures.find({
        "course_id": {"$in": course_ids},
        "date": {"$gte": start_date, "$lt": end_date}
    }).sort("date", 1).to_list(500)
    
    # تجميع التواريخ والمحاضرات
    dates_with_lectures = {}
    lectures_list = []
    
    for lecture in lectures:
        date = lecture["date"]
        course = course_map.get(lecture["course_id"], {})
        
        if date not in dates_with_lectures:
            dates_with_lectures[date] = []
        
        lecture_info = {
            "id": str(lecture["_id"]),
            "course_id": lecture["course_id"],
            "course_name": course.get("name", ""),
            "course_code": course.get("code", ""),
            "date": date,
            "start_time": lecture["start_time"],
            "end_time": lecture["end_time"],
            "room": lecture.get("room", ""),
            "status": lecture.get("status", LectureStatus.SCHEDULED),
        }
        
        dates_with_lectures[date].append(lecture_info)
        lectures_list.append(lecture_info)
    
    return {
        "dates": list(dates_with_lectures.keys()),
        "lectures_by_date": dates_with_lectures,
        "lectures": lectures_list,
        "total_lectures": len(lectures_list)
    }

@api_router.get("/lectures/{course_id}")
async def get_course_lectures(
    course_id: str,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """الحصول على محاضرات مقرر"""
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    query = {"course_id": course_id}
    if status:
        query["status"] = status
    
    lectures = await db.lectures.find(query).sort("date", 1).to_list(1000)
    
    result = []
    for lecture in lectures:
        result.append({
            "id": str(lecture["_id"]),
            "course_id": lecture["course_id"],
            "date": lecture["date"],
            "start_time": lecture["start_time"],
            "end_time": lecture["end_time"],
            "room": lecture.get("room", ""),
            "status": lecture.get("status", LectureStatus.SCHEDULED),
            "notes": lecture.get("notes", ""),
            "created_at": lecture["created_at"]
        })
    
    return result

@api_router.post("/lectures")
async def create_lecture(
    data: LectureCreate,
    current_user: dict = Depends(get_current_user)
):
    """إنشاء محاضرة جديدة"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.TEACHER]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    course = await db.courses.find_one({"_id": ObjectId(data.course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    lecture = {
        "course_id": data.course_id,
        "date": data.date,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "room": data.room or "",
        "status": LectureStatus.SCHEDULED,
        "notes": data.notes or "",
        "created_at": datetime.utcnow(),
        "created_by": current_user["id"]
    }
    
    result = await db.lectures.insert_one(lecture)
    
    return {
        "id": str(result.inserted_id),
        "message": "تم إنشاء المحاضرة بنجاح"
    }

@api_router.post("/lectures/generate")
async def generate_semester_lectures(
    data: GenerateLecturesRequest,
    current_user: dict = Depends(get_current_user)
):
    """توليد محاضرات الفصل الدراسي تلقائياً"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    course = await db.courses.find_one({"_id": ObjectId(data.course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    from datetime import timedelta
    
    start = datetime.strptime(data.start_date, "%Y-%m-%d")
    end = datetime.strptime(data.end_date, "%Y-%m-%d")
    
    # أيام الأسبوع: 0=السبت، 1=الأحد، 2=الاثنين، ...
    day_map = {0: 5, 1: 6, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4}  # تحويل من نظامنا إلى Python weekday
    target_weekday = day_map.get(data.day_of_week, data.day_of_week)
    
    # البحث عن أول يوم مطابق
    current = start
    while current.weekday() != target_weekday:
        current += timedelta(days=1)
    
    lectures_created = 0
    
    while current <= end:
        lecture = {
            "course_id": data.course_id,
            "date": current.strftime("%Y-%m-%d"),
            "start_time": data.start_time,
            "end_time": data.end_time,
            "room": data.room or "",
            "status": LectureStatus.SCHEDULED,
            "notes": "",
            "created_at": datetime.utcnow(),
            "created_by": current_user["id"]
        }
        await db.lectures.insert_one(lecture)
        lectures_created += 1
        current += timedelta(days=7)
    
    return {
        "message": f"تم إنشاء {lectures_created} محاضرة للفصل الدراسي",
        "count": lectures_created
    }

class DaySlot(BaseModel):
    start_time: str
    end_time: str

class DayScheduleConfig(BaseModel):
    day: str
    slots: List[DaySlot]

class GenerateSemesterRequest(BaseModel):
    course_id: str
    room: str
    schedule: List[DayScheduleConfig]
    start_date: str
    end_date: str

@api_router.post("/lectures/generate-semester")
async def generate_semester_lectures_advanced(
    data: GenerateSemesterRequest,
    current_user: dict = Depends(get_current_user)
):
    """توليد محاضرات الفصل الدراسي المتقدم - دعم أيام متعددة وأوقات متعددة"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    course = await db.courses.find_one({"_id": ObjectId(data.course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    from datetime import timedelta
    
    try:
        start = datetime.strptime(data.start_date, "%Y-%m-%d")
        end = datetime.strptime(data.end_date, "%Y-%m-%d")
    except:
        raise HTTPException(status_code=400, detail="صيغة التاريخ غير صحيحة")
    
    # تحويل أسماء الأيام إلى أرقام Python weekday
    day_name_to_weekday = {
        'saturday': 5,
        'sunday': 6,
        'monday': 0,
        'tuesday': 1,
        'wednesday': 2,
        'thursday': 3,
        'friday': 4,
    }
    
    lectures_created = 0
    
    for day_config in data.schedule:
        target_weekday = day_name_to_weekday.get(day_config.day.lower())
        if target_weekday is None:
            continue
        
        # البحث عن أول يوم مطابق
        current = start
        while current.weekday() != target_weekday:
            current += timedelta(days=1)
        
        # توليد المحاضرات لكل أسبوع
        while current <= end:
            # إضافة محاضرة لكل فترة زمنية في هذا اليوم
            for slot in day_config.slots:
                lecture = {
                    "course_id": data.course_id,
                    "date": current.strftime("%Y-%m-%d"),
                    "start_time": slot.start_time,
                    "end_time": slot.end_time,
                    "room": data.room,
                    "status": LectureStatus.SCHEDULED,
                    "notes": "",
                    "created_at": datetime.utcnow(),
                    "created_by": current_user["id"]
                }
                await db.lectures.insert_one(lecture)
                lectures_created += 1
            
            current += timedelta(days=7)
    
    return {
        "message": f"تم إنشاء {lectures_created} محاضرة للفصل الدراسي",
        "lectures_created": lectures_created
    }

@api_router.put("/lectures/{lecture_id}")
async def update_lecture(
    lecture_id: str,
    data: LectureUpdate,
    current_user: dict = Depends(get_current_user)
):
    """تعديل محاضرة"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.TEACHER]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    lecture = await db.lectures.find_one({"_id": ObjectId(lecture_id)})
    if not lecture:
        raise HTTPException(status_code=404, detail="المحاضرة غير موجودة")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    
    if update_data:
        await db.lectures.update_one(
            {"_id": ObjectId(lecture_id)},
            {"$set": update_data}
        )
    
    return {"message": "تم تحديث المحاضرة بنجاح"}

@api_router.delete("/lectures/{lecture_id}")
async def delete_lecture(
    lecture_id: str,
    current_user: dict = Depends(get_current_user)
):
    """حذف محاضرة"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    result = await db.lectures.delete_one({"_id": ObjectId(lecture_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="المحاضرة غير موجودة")
    
    # حذف سجلات الحضور المرتبطة
    await db.attendance.delete_many({"lecture_id": lecture_id})
    
    return {"message": "تم حذف المحاضرة بنجاح"}

@api_router.get("/lectures/{lecture_id}/details")
async def get_lecture_details(
    lecture_id: str,
    current_user: dict = Depends(get_current_user)
):
    """الحصول على تفاصيل محاضرة مع الطلاب المسجلين"""
    lecture = await db.lectures.find_one({"_id": ObjectId(lecture_id)})
    if not lecture:
        raise HTTPException(status_code=404, detail="المحاضرة غير موجودة")
    
    course = await db.courses.find_one({"_id": ObjectId(lecture["course_id"])})
    
    # الطلاب المسجلين في المقرر
    enrollments = await db.enrollments.find({"course_id": lecture["course_id"]}).to_list(10000)
    student_ids = [ObjectId(e["student_id"]) for e in enrollments]
    students = await db.students.find({"_id": {"$in": student_ids}}).to_list(10000)
    
    # سجلات الحضور لهذه المحاضرة
    attendance_records = await db.attendance.find({"lecture_id": lecture_id}).to_list(10000)
    attendance_map = {r["student_id"]: r["status"] for r in attendance_records}
    
    students_with_attendance = []
    for student in students:
        students_with_attendance.append({
            "id": str(student["_id"]),
            "student_id": student["student_id"],
            "full_name": student["full_name"],
            "attendance_status": attendance_map.get(str(student["_id"]), None)
        })
    
    return {
        "lecture": {
            "id": str(lecture["_id"]),
            "date": lecture["date"],
            "start_time": lecture["start_time"],
            "end_time": lecture["end_time"],
            "room": lecture.get("room", ""),
            "status": lecture.get("status", LectureStatus.SCHEDULED),
            "notes": lecture.get("notes", "")
        },
        "course": {
            "id": str(course["_id"]),
            "name": course["name"],
            "code": course["code"]
        },
        "students": students_with_attendance,
        "attendance_recorded": len(attendance_records) > 0,
        "attendance_status": get_lecture_attendance_status(lecture)
    }

def get_lecture_attendance_status(lecture: dict) -> dict:
    """حساب حالة التحضير للمحاضرة"""
    now = datetime.utcnow()
    
    try:
        lecture_start = datetime.strptime(f"{lecture['date']} {lecture['start_time']}", "%Y-%m-%d %H:%M")
        lecture_end = datetime.strptime(f"{lecture['date']} {lecture['end_time']}", "%Y-%m-%d %H:%M")
    except:
        return {
            "can_take_attendance": False,
            "reason": "خطأ في تنسيق التاريخ أو الوقت",
            "status": "error"
        }
    
    # حساب مدة المحاضرة بالدقائق
    lecture_duration = (lecture_end - lecture_start).total_seconds() / 60
    
    # الوقت المسموح به للتحضير = وقت نهاية المحاضرة + مدة المحاضرة
    allowed_end_time = lecture_end + timedelta(minutes=lecture_duration)
    
    # إذا تم التحضير مسبقاً (المحاضرة مكتملة)
    if lecture.get("status") == LectureStatus.COMPLETED:
        return {
            "can_take_attendance": False,
            "reason": "تم التحضير مسبقاً ولا يمكن التعديل",
            "status": "completed"
        }
    
    # إذا لم يحن وقت المحاضرة بعد
    if now < lecture_start:
        time_until_start = int((lecture_start - now).total_seconds() / 60)
        return {
            "can_take_attendance": False,
            "reason": f"لم يحن وقت المحاضرة بعد. تبدأ الساعة {lecture['start_time']}",
            "status": "not_started",
            "minutes_until_start": time_until_start
        }
    
    # إذا انتهى الوقت المسموح
    if now > allowed_end_time:
        return {
            "can_take_attendance": False,
            "reason": f"انتهى وقت التحضير المسموح. كان يمكن التحضير حتى {allowed_end_time.strftime('%H:%M')}",
            "status": "expired"
        }
    
    # يمكن التحضير
    time_remaining = int((allowed_end_time - now).total_seconds() / 60)
    return {
        "can_take_attendance": True,
        "reason": "يمكن التحضير الآن",
        "status": "available",
        "minutes_remaining": time_remaining,
        "deadline": allowed_end_time.strftime("%H:%M")
    }

@api_router.get("/lectures/{lecture_id}/attendance-status")
async def get_lecture_attendance_status_api(
    lecture_id: str,
    current_user: dict = Depends(get_current_user)
):
    """التحقق من حالة التحضير للمحاضرة"""
    lecture = await db.lectures.find_one({"_id": ObjectId(lecture_id)})
    if not lecture:
        raise HTTPException(status_code=404, detail="المحاضرة غير موجودة")
    
    return get_lecture_attendance_status(lecture)


@api_router.get("/attendance/lecture/{lecture_id}")
async def get_lecture_attendance(
    lecture_id: str,
    current_user: dict = Depends(get_current_user)
):
    """جلب سجلات الحضور لمحاضرة معينة"""
    lecture = await db.lectures.find_one({"_id": ObjectId(lecture_id)})
    if not lecture:
        raise HTTPException(status_code=404, detail="المحاضرة غير موجودة")
    
    records = await db.attendance.find({"lecture_id": lecture_id}).to_list(1000)
    
    result = []
    for r in records:
        student = await db.students.find_one({"_id": ObjectId(r["student_id"])})
        result.append({
            "id": str(r["_id"]),
            "lecture_id": r["lecture_id"],
            "student_id": r["student_id"],
            "student_name": student["full_name"] if student else "غير معروف",
            "student_number": student.get("student_id", "") if student else "",
            "status": r["status"],
            "date": r["date"].isoformat() if isinstance(r["date"], datetime) else r["date"],
            "method": r["method"],
            "notes": r.get("notes")
        })
    
    return result


# ==================== Attendance Routes ====================

@api_router.post("/attendance/session")
async def record_attendance_session(
    session: AttendanceSessionCreate,
    current_user: dict = Depends(get_current_user)
):
    """تسجيل حضور جماعي لمحاضرة"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.TEACHER]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Verify lecture exists
    lecture = await db.lectures.find_one({"_id": ObjectId(session.lecture_id)})
    if not lecture:
        raise HTTPException(status_code=404, detail="المحاضرة غير موجودة")
    
    course = await db.courses.find_one({"_id": ObjectId(lecture["course_id"])})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    # Check if teacher owns this course
    if current_user["role"] == UserRole.TEACHER and course["teacher_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك بتسجيل حضور هذا المقرر")
    
    # === التحقق من قواعد التحضير ===
    now = datetime.utcnow()
    lecture_date = datetime.strptime(lecture["date"], "%Y-%m-%d")
    lecture_start = datetime.strptime(f"{lecture['date']} {lecture['start_time']}", "%Y-%m-%d %H:%M")
    lecture_end = datetime.strptime(f"{lecture['date']} {lecture['end_time']}", "%Y-%m-%d %H:%M")
    
    # حساب مدة المحاضرة
    lecture_duration = (lecture_end - lecture_start).total_seconds() / 60  # بالدقائق
    
    # الوقت المسموح به للتحضير = وقت نهاية المحاضرة + مدة المحاضرة
    allowed_end_time = lecture_end + timedelta(minutes=lecture_duration)
    
    # التحقق: لا يُسمح بالتحضير قبل وقت بداية المحاضرة
    if now < lecture_start:
        raise HTTPException(
            status_code=400, 
            detail=f"لا يمكن التحضير قبل وقت بداية المحاضرة ({lecture['start_time']})"
        )
    
    # التحقق: لا يُسمح بالتحضير بعد انتهاء الوقت المسموح
    if now > allowed_end_time:
        raise HTTPException(
            status_code=400, 
            detail=f"انتهى وقت التحضير المسموح به. كان يمكن التحضير حتى {allowed_end_time.strftime('%H:%M')}"
        )
    
    # التحقق: إذا تم التحضير مسبقاً (المحاضرة مكتملة)، لا يُسمح بالتعديل
    existing_attendance = await db.attendance.count_documents({"lecture_id": session.lecture_id})
    if existing_attendance > 0 and lecture.get("status") == LectureStatus.COMPLETED:
        raise HTTPException(
            status_code=400, 
            detail="تم تسجيل الحضور لهذه المحاضرة مسبقاً ولا يمكن التعديل عليه"
        )
    # === نهاية التحقق من القواعد ===
    
    # Delete existing attendance for this lecture (فقط إذا لم تكن مكتملة)
    await db.attendance.delete_many({"lecture_id": session.lecture_id})
    
    attendance_records = []
    for record in session.records:
        att_record = {
            "lecture_id": session.lecture_id,
            "course_id": lecture["course_id"],
            "student_id": record.student_id,
            "status": record.status,
            "date": datetime.utcnow(),
            "recorded_by": current_user["id"],
            "method": "manual",
            "notes": session.notes,
            "created_at": datetime.utcnow()
        }
        attendance_records.append(att_record)
    
    if attendance_records:
        await db.attendance.insert_many(attendance_records)
        
        # التحقق من نسب الغياب وإنشاء إشعارات للطلاب الغائبين
        for record in session.records:
            if record.status == AttendanceStatus.ABSENT:
                await check_and_create_absence_notifications(record.student_id, lecture["course_id"])
    
    # Update lecture status to completed
    await db.lectures.update_one(
        {"_id": ObjectId(session.lecture_id)},
        {"$set": {"status": LectureStatus.COMPLETED}}
    )
    
    return {"message": f"تم تسجيل حضور {len(attendance_records)} طالب بنجاح"}

@api_router.post("/attendance/single")
async def record_single_attendance(
    data: SingleAttendanceCreate,
    current_user: dict = Depends(get_current_user)
):
    """تسجيل حضور طالب واحد (QR)"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.TEACHER]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Verify lecture exists
    lecture = await db.lectures.find_one({"_id": ObjectId(data.lecture_id)})
    if not lecture:
        raise HTTPException(status_code=404, detail="المحاضرة غير موجودة")
    
    # Verify student exists
    student = await db.students.find_one({"_id": ObjectId(data.student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Check if already recorded for this lecture
    existing = await db.attendance.find_one({
        "lecture_id": data.lecture_id,
        "student_id": data.student_id
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="تم تسجيل حضور هذا الطالب مسبقاً")
    
    att_record = {
        "lecture_id": data.lecture_id,
        "course_id": lecture["course_id"],
        "student_id": data.student_id,
        "status": data.status,
        "date": datetime.utcnow(),
        "recorded_by": current_user["id"],
        "method": data.method,
        "notes": data.notes,
        "created_at": datetime.utcnow()
    }
    
    await db.attendance.insert_one(att_record)
    
    return {"message": "تم تسجيل الحضور بنجاح", "student_name": student["full_name"]}

@api_router.get("/attendance/course/{course_id}")
async def get_course_attendance(
    course_id: str,
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"course_id": course_id}
    
    if date:
        date_obj = datetime.fromisoformat(date)
        query["date"] = {
            "$gte": date_obj.replace(hour=0, minute=0, second=0),
            "$lt": date_obj.replace(hour=23, minute=59, second=59)
        }
    
    records = await db.attendance.find(query).sort("date", -1).to_list(1000)
    
    # Get student details
    result = []
    for r in records:
        student = await db.students.find_one({"_id": ObjectId(r["student_id"])})
        result.append({
            "id": str(r["_id"]),
            "course_id": r["course_id"],
            "student_id": r["student_id"],
            "student_name": student["full_name"] if student else "غير معروف",
            "student_number": student["student_id"] if student else "",
            "status": r["status"],
            "date": r["date"].isoformat(),
            "method": r["method"],
            "notes": r.get("notes")
        })
    
    return result

@api_router.get("/attendance/student/{student_id}")
async def get_student_attendance(
    student_id: str,
    course_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"student_id": student_id}
    if course_id:
        query["course_id"] = course_id
    
    records = await db.attendance.find(query).sort("date", -1).to_list(1000)
    
    result = []
    for r in records:
        course = await db.courses.find_one({"_id": ObjectId(r["course_id"])})
        result.append({
            "id": str(r["_id"]),
            "course_id": r["course_id"],
            "course_name": course["name"] if course else "غير معروف",
            "status": r["status"],
            "date": r["date"].isoformat(),
            "method": r["method"]
        })
    
    return result

@api_router.get("/attendance/stats/student/{student_id}", response_model=AttendanceStats)
async def get_student_stats(
    student_id: str,
    course_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"student_id": student_id}
    if course_id:
        query["course_id"] = course_id
    
    records = await db.attendance.find(query).to_list(1000)
    
    # فلترة السجلات لاستبعاد المحاضرات الملغاة
    records = await filter_attendance_by_active_lectures(records, course_id)
    
    total = len(records)
    present = sum(1 for r in records if r["status"] == AttendanceStatus.PRESENT)
    absent = sum(1 for r in records if r["status"] == AttendanceStatus.ABSENT)
    late = sum(1 for r in records if r["status"] == AttendanceStatus.LATE)
    excused = sum(1 for r in records if r["status"] == AttendanceStatus.EXCUSED)
    
    rate = (present + late * 0.5) / total * 100 if total > 0 else 0
    
    return {
        "total_sessions": total,
        "present_count": present,
        "absent_count": absent,
        "late_count": late,
        "excused_count": excused,
        "attendance_rate": round(rate, 2)
    }

@api_router.get("/attendance/stats/course/{course_id}")
async def get_course_stats(course_id: str, current_user: dict = Depends(get_current_user)):
    # Get all attendance records for this course
    records = await db.attendance.find({"course_id": course_id}).to_list(10000)
    
    # فلترة السجلات لاستبعاد المحاضرات الملغاة
    records = await filter_attendance_by_active_lectures(records, course_id)
    
    # Group by date to get unique sessions (only from active lectures)
    sessions = set()
    for r in records:
        sessions.add(r["date"].strftime("%Y-%m-%d"))
    
    # Get course details
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    # Get students in this course's level and section
    students = await db.students.find({
        "department_id": course["department_id"],
        "level": course["level"],
        "section": course["section"]
    }).to_list(500)
    
    # Calculate stats per student (only from active lectures)
    student_stats = []
    for student in students:
        student_records = [r for r in records if r["student_id"] == str(student["_id"])]
        total = len(student_records)
        present = sum(1 for r in student_records if r["status"] == AttendanceStatus.PRESENT)
        absent = sum(1 for r in student_records if r["status"] == AttendanceStatus.ABSENT)
        late = sum(1 for r in student_records if r["status"] == AttendanceStatus.LATE)
        
        rate = (present + late * 0.5) / total * 100 if total > 0 else 0
        
        student_stats.append({
            "student_id": str(student["_id"]),
            "student_number": student["student_id"],
            "student_name": student["full_name"],
            "total_sessions": total,
            "present_count": present,
            "absent_count": absent,
            "late_count": late,
            "attendance_rate": round(rate, 2)
        })
    
    return {
        "course_id": course_id,
        "course_name": course["name"],
        "total_sessions": len(sessions),
        "total_students": len(students),
        "student_stats": student_stats
    }

# ==================== Offline Sync Routes ====================

@api_router.post("/sync/attendance")
async def sync_offline_attendance(
    data: OfflineSyncData,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.TEACHER]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    synced = 0
    errors = []
    
    for record in data.attendance_records:
        try:
            # Check if already synced (using local_id if provided)
            if record.get("local_id"):
                existing = await db.attendance.find_one({"local_id": record["local_id"]})
                if existing:
                    continue
            
            att_record = {
                "course_id": record["course_id"],
                "student_id": record["student_id"],
                "status": record.get("status", AttendanceStatus.PRESENT),
                "date": datetime.fromisoformat(record["date"]) if record.get("date") else datetime.utcnow(),
                "recorded_by": current_user["id"],
                "method": record.get("method", "manual"),
                "notes": record.get("notes"),
                "local_id": record.get("local_id"),
                "created_at": datetime.utcnow(),
                "synced_at": datetime.utcnow()
            }
            
            await db.attendance.insert_one(att_record)
            synced += 1
        except Exception as e:
            errors.append(str(e))
    
    return {
        "synced": synced,
        "errors": errors,
        "message": f"تمت مزامنة {synced} سجل بنجاح"
    }

# ==================== Reports Routes ====================

@api_router.get("/reports/department/{dept_id}")
async def get_department_report(
    dept_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Get department
    dept = await db.departments.find_one({"_id": ObjectId(dept_id)})
    if not dept:
        raise HTTPException(status_code=404, detail="القسم غير موجود")
    
    # Get all courses in department
    courses = await db.courses.find({"department_id": dept_id}).to_list(100)
    course_ids = [str(c["_id"]) for c in courses]
    
    # جلب IDs المحاضرات الفعّالة فقط لجميع المقررات
    all_active_lecture_ids = set()
    for cid in course_ids:
        active_ids = await get_active_lecture_ids(cid)
        all_active_lecture_ids.update(active_ids)
    
    # Build query
    query = {"course_id": {"$in": course_ids}}
    if start_date:
        query["date"] = {"$gte": datetime.fromisoformat(start_date)}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = datetime.fromisoformat(end_date)
        else:
            query["date"] = {"$lte": datetime.fromisoformat(end_date)}
    
    records = await db.attendance.find(query).to_list(10000)
    
    # فلترة السجلات لاستبعاد المحاضرات الملغاة
    records = [r for r in records if r.get("lecture_id") in all_active_lecture_ids]
    
    total = len(records)
    present = sum(1 for r in records if r["status"] == AttendanceStatus.PRESENT)
    absent = sum(1 for r in records if r["status"] == AttendanceStatus.ABSENT)
    late = sum(1 for r in records if r["status"] == AttendanceStatus.LATE)
    
    return {
        "department": dept["name"],
        "total_courses": len(courses),
        "total_records": total,
        "present_count": present,
        "absent_count": absent,
        "late_count": late,
        "attendance_rate": round((present + late * 0.5) / total * 100, 2) if total > 0 else 0
    }

@api_router.get("/reports/summary")
async def get_summary_report(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Get counts
    total_students = await db.students.count_documents({"is_active": True})
    total_teachers = await db.users.count_documents({"role": UserRole.TEACHER, "is_active": True})
    total_courses = await db.courses.count_documents({"is_active": True})
    total_departments = await db.departments.count_documents({})
    
    # Get today's attendance (only from active lectures)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_records = await db.attendance.find({"date": {"$gte": today_start}}).to_list(10000)
    
    # جلب جميع المحاضرات الفعّالة
    all_active_lecture_ids = await get_active_lecture_ids()
    
    # فلترة سجلات اليوم لاستبعاد المحاضرات الملغاة
    today_records = [r for r in today_records if r.get("lecture_id") in all_active_lecture_ids]
    
    today_present = sum(1 for r in today_records if r["status"] == AttendanceStatus.PRESENT)
    today_absent = sum(1 for r in today_records if r["status"] == AttendanceStatus.ABSENT)
    
    return {
        "total_students": total_students,
        "total_teachers": total_teachers,
        "total_courses": total_courses,
        "total_departments": total_departments,
        "today_attendance": {
            "total": len(today_records),
            "present": today_present,
            "absent": today_absent,
            "rate": round(today_present / len(today_records) * 100, 2) if today_records else 0
        }
    }

# ==================== Advanced Reports ====================

@api_router.get("/reports/attendance-overview")
async def get_attendance_overview_report(
    department_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تقرير الحضور الشامل - نسب الحضور لجميع المقررات"""
    if not has_permission(current_user, Permission.VIEW_REPORTS):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # بناء query للمقررات
    course_query = {"is_active": True}
    if department_id:
        course_query["department_id"] = department_id
    
    courses = await db.courses.find(course_query).to_list(100)
    
    result = []
    for course in courses:
        course_id = str(course["_id"])
        
        # جلب المحاضرات الفعالة
        active_lecture_ids = await get_active_lecture_ids(course_id)
        
        # بناء query للحضور
        attendance_query = {"course_id": course_id, "lecture_id": {"$in": list(active_lecture_ids)}}
        if start_date:
            attendance_query["date"] = {"$gte": datetime.fromisoformat(start_date)}
        if end_date:
            if "date" in attendance_query:
                attendance_query["date"]["$lte"] = datetime.fromisoformat(end_date)
            else:
                attendance_query["date"] = {"$lte": datetime.fromisoformat(end_date)}
        
        records = await db.attendance.find(attendance_query).to_list(10000)
        
        total = len(records)
        present = sum(1 for r in records if r["status"] == AttendanceStatus.PRESENT)
        absent = sum(1 for r in records if r["status"] == AttendanceStatus.ABSENT)
        late = sum(1 for r in records if r["status"] == AttendanceStatus.LATE)
        
        # جلب اسم المعلم
        teacher_name = None
        if course.get("teacher_id"):
            teacher = await db.teachers.find_one({"_id": ObjectId(course["teacher_id"])})
            if teacher:
                teacher_name = teacher.get("full_name")
        
        result.append({
            "course_id": course_id,
            "course_name": course["name"],
            "course_code": course.get("code", ""),
            "teacher_name": teacher_name,
            "total_records": total,
            "present_count": present,
            "absent_count": absent,
            "late_count": late,
            "attendance_rate": round((present + late * 0.5) / total * 100, 2) if total > 0 else 0
        })
    
    return {
        "courses": result,
        "summary": {
            "total_courses": len(result),
            "avg_attendance_rate": round(sum(c["attendance_rate"] for c in result) / len(result), 2) if result else 0
        }
    }

@api_router.get("/reports/absent-students")
async def get_absent_students_report(
    department_id: Optional[str] = None,
    course_id: Optional[str] = None,
    min_absence_rate: float = 25.0,
    current_user: dict = Depends(get_current_user)
):
    """تقرير الطلاب المتغيبين - الذين تجاوزوا نسبة غياب معينة"""
    if not has_permission(current_user, Permission.VIEW_REPORTS):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # جلب المقررات
    course_query = {"is_active": True}
    if department_id:
        course_query["department_id"] = department_id
    if course_id:
        course_query["_id"] = ObjectId(course_id)
    
    courses = await db.courses.find(course_query).to_list(100)
    
    result = []
    for course in courses:
        cid = str(course["_id"])
        active_lecture_ids = await get_active_lecture_ids(cid)
        total_lectures = len(active_lecture_ids)
        
        if total_lectures == 0:
            continue
        
        # جلب الطلاب المسجلين
        enrollments = await db.enrollments.find({"course_id": cid}).to_list(1000)
        
        for enrollment in enrollments:
            student_id = enrollment["student_id"]
            
            # حساب الغياب
            attendance_records = await db.attendance.find({
                "student_id": student_id,
                "course_id": cid,
                "lecture_id": {"$in": list(active_lecture_ids)}
            }).to_list(1000)
            
            absent_count = sum(1 for r in attendance_records if r["status"] == AttendanceStatus.ABSENT)
            absence_rate = (absent_count / total_lectures) * 100
            
            if absence_rate >= min_absence_rate:
                student = await db.students.find_one({"_id": ObjectId(student_id)})
                if student:
                    result.append({
                        "student_id": student.get("student_id"),
                        "student_name": student.get("full_name"),
                        "course_name": course["name"],
                        "course_code": course.get("code", ""),
                        "total_lectures": total_lectures,
                        "absent_count": absent_count,
                        "absence_rate": round(absence_rate, 2)
                    })
    
    # ترتيب حسب نسبة الغياب (الأعلى أولاً)
    result.sort(key=lambda x: x["absence_rate"], reverse=True)
    
    return {
        "students": result,
        "total_count": len(result),
        "min_absence_rate_filter": min_absence_rate
    }

@api_router.get("/reports/student/{student_id}")
async def get_student_attendance_report(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    """تقرير حضور طالب واحد في جميع مقرراته"""
    if not has_permission(current_user, Permission.VIEW_REPORTS) and not has_permission(current_user, Permission.VIEW_ATTENDANCE):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # جلب الطالب
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        # محاولة البحث برقم القيد
        student = await db.students.find_one({"student_id": student_id})
    
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # جلب المقررات المسجل فيها
    enrollments = await db.enrollments.find({"student_id": str(student["_id"])}).to_list(100)
    
    courses_data = []
    total_present = 0
    total_absent = 0
    total_late = 0
    total_lectures = 0
    
    for enrollment in enrollments:
        course = await db.courses.find_one({"_id": ObjectId(enrollment["course_id"])})
        if not course:
            continue
        
        course_id = str(course["_id"])
        active_lecture_ids = await get_active_lecture_ids(course_id)
        
        # جلب سجلات الحضور
        records = await db.attendance.find({
            "student_id": str(student["_id"]),
            "course_id": course_id,
            "lecture_id": {"$in": list(active_lecture_ids)}
        }).to_list(1000)
        
        present = sum(1 for r in records if r["status"] == AttendanceStatus.PRESENT)
        absent = sum(1 for r in records if r["status"] == AttendanceStatus.ABSENT)
        late = sum(1 for r in records if r["status"] == AttendanceStatus.LATE)
        
        total_present += present
        total_absent += absent
        total_late += late
        total_lectures += len(active_lecture_ids)
        
        courses_data.append({
            "course_name": course["name"],
            "course_code": course.get("code", ""),
            "total_lectures": len(active_lecture_ids),
            "present": present,
            "absent": absent,
            "late": late,
            "attendance_rate": round((present + late * 0.5) / len(active_lecture_ids) * 100, 2) if active_lecture_ids else 0
        })
    
    return {
        "student": {
            "id": str(student["_id"]),
            "student_id": student.get("student_id"),
            "full_name": student.get("full_name"),
            "department_id": student.get("department_id"),
            "level": student.get("level"),
            "section": student.get("section")
        },
        "courses": courses_data,
        "summary": {
            "total_courses": len(courses_data),
            "total_lectures": total_lectures,
            "total_present": total_present,
            "total_absent": total_absent,
            "total_late": total_late,
            "overall_attendance_rate": round((total_present + total_late * 0.5) / total_lectures * 100, 2) if total_lectures > 0 else 0
        }
    }

@api_router.get("/reports/daily")
async def get_daily_report(
    date: Optional[str] = None,
    department_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تقرير يومي - ملخص الحضور ليوم محدد"""
    if not has_permission(current_user, Permission.VIEW_REPORTS):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # تحديد التاريخ
    if date:
        report_date = datetime.fromisoformat(date)
    else:
        report_date = datetime.utcnow()
    
    day_start = report_date.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    
    # جلب المقررات
    course_query = {"is_active": True}
    if department_id:
        course_query["department_id"] = department_id
    courses = await db.courses.find(course_query).to_list(100)
    course_ids = [str(c["_id"]) for c in courses]
    
    # جلب المحاضرات في هذا اليوم
    lectures = await db.lectures.find({
        "course_id": {"$in": course_ids},
        "date": {"$gte": day_start, "$lt": day_end},
        "is_cancelled": {"$ne": True}
    }).to_list(100)
    
    lectures_data = []
    total_present = 0
    total_absent = 0
    total_late = 0
    
    for lecture in lectures:
        course = next((c for c in courses if str(c["_id"]) == lecture["course_id"]), None)
        if not course:
            continue
        
        # جلب سجلات الحضور
        records = await db.attendance.find({
            "lecture_id": str(lecture["_id"])
        }).to_list(1000)
        
        present = sum(1 for r in records if r["status"] == AttendanceStatus.PRESENT)
        absent = sum(1 for r in records if r["status"] == AttendanceStatus.ABSENT)
        late = sum(1 for r in records if r["status"] == AttendanceStatus.LATE)
        
        total_present += present
        total_absent += absent
        total_late += late
        
        lectures_data.append({
            "lecture_id": str(lecture["_id"]),
            "course_name": course["name"],
            "course_code": course.get("code", ""),
            "start_time": lecture.get("start_time", ""),
            "end_time": lecture.get("end_time", ""),
            "present": present,
            "absent": absent,
            "late": late,
            "total_students": len(records),
            "attendance_rate": round((present + late * 0.5) / len(records) * 100, 2) if records else 0
        })
    
    total_records = total_present + total_absent + total_late
    
    return {
        "date": day_start.isoformat(),
        "lectures": lectures_data,
        "summary": {
            "total_lectures": len(lectures_data),
            "total_students_recorded": total_records,
            "total_present": total_present,
            "total_absent": total_absent,
            "total_late": total_late,
            "overall_attendance_rate": round((total_present + total_late * 0.5) / total_records * 100, 2) if total_records > 0 else 0
        }
    }

@api_router.get("/reports/warnings")
async def get_warnings_report(
    department_id: Optional[str] = None,
    warning_threshold: float = 25.0,
    deprivation_threshold: float = 40.0,
    current_user: dict = Depends(get_current_user)
):
    """تقرير الإنذارات - الطلاب المعرضين للحرمان"""
    if not has_permission(current_user, Permission.VIEW_REPORTS):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # جلب المقررات
    course_query = {"is_active": True}
    if department_id:
        course_query["department_id"] = department_id
    courses = await db.courses.find(course_query).to_list(100)
    
    warnings = []
    deprivations = []
    
    for course in courses:
        cid = str(course["_id"])
        active_lecture_ids = await get_active_lecture_ids(cid)
        total_lectures = len(active_lecture_ids)
        
        if total_lectures == 0:
            continue
        
        # جلب التسجيلات
        enrollments = await db.enrollments.find({"course_id": cid}).to_list(1000)
        
        for enrollment in enrollments:
            student_id = enrollment["student_id"]
            
            # حساب الغياب
            records = await db.attendance.find({
                "student_id": student_id,
                "course_id": cid,
                "lecture_id": {"$in": list(active_lecture_ids)}
            }).to_list(1000)
            
            absent_count = sum(1 for r in records if r["status"] == AttendanceStatus.ABSENT)
            absence_rate = (absent_count / total_lectures) * 100
            
            if absence_rate >= warning_threshold:
                student = await db.students.find_one({"_id": ObjectId(student_id)})
                if student:
                    student_data = {
                        "student_id": student.get("student_id"),
                        "student_name": student.get("full_name"),
                        "course_name": course["name"],
                        "course_code": course.get("code", ""),
                        "total_lectures": total_lectures,
                        "absent_count": absent_count,
                        "absence_rate": round(absence_rate, 2),
                        "remaining_allowed": max(0, int((deprivation_threshold / 100) * total_lectures) - absent_count)
                    }
                    
                    if absence_rate >= deprivation_threshold:
                        student_data["status"] = "محروم"
                        deprivations.append(student_data)
                    else:
                        student_data["status"] = "إنذار"
                        warnings.append(student_data)
    
    return {
        "warnings": warnings,
        "deprivations": deprivations,
        "summary": {
            "total_warnings": len(warnings),
            "total_deprivations": len(deprivations),
            "warning_threshold": warning_threshold,
            "deprivation_threshold": deprivation_threshold
        }
    }

@api_router.get("/reports/course/{course_id}/detailed")
async def get_course_detailed_report(
    course_id: str,
    current_user: dict = Depends(get_current_user)
):
    """تقرير المقرر التفصيلي - تحليل كامل لمقرر معين"""
    if not has_permission(current_user, Permission.VIEW_REPORTS):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    # جلب المعلم
    teacher_name = None
    if course.get("teacher_id"):
        teacher = await db.teachers.find_one({"_id": ObjectId(course["teacher_id"])})
        if teacher:
            teacher_name = teacher.get("full_name")
    
    # جلب المحاضرات
    active_lecture_ids = await get_active_lecture_ids(course_id)
    lectures = await db.lectures.find({
        "_id": {"$in": [ObjectId(lid) for lid in active_lecture_ids]}
    }).sort("date", 1).to_list(100)
    
    # جلب التسجيلات
    enrollments = await db.enrollments.find({"course_id": course_id}).to_list(1000)
    
    # بيانات الطلاب
    students_data = []
    for enrollment in enrollments:
        student = await db.students.find_one({"_id": ObjectId(enrollment["student_id"])})
        if not student:
            continue
        
        records = await db.attendance.find({
            "student_id": str(student["_id"]),
            "course_id": course_id,
            "lecture_id": {"$in": list(active_lecture_ids)}
        }).to_list(1000)
        
        present = sum(1 for r in records if r["status"] == AttendanceStatus.PRESENT)
        absent = sum(1 for r in records if r["status"] == AttendanceStatus.ABSENT)
        late = sum(1 for r in records if r["status"] == AttendanceStatus.LATE)
        
        students_data.append({
            "student_id": student.get("student_id"),
            "student_name": student.get("full_name"),
            "present": present,
            "absent": absent,
            "late": late,
            "attendance_rate": round((present + late * 0.5) / len(active_lecture_ids) * 100, 2) if active_lecture_ids else 0
        })
    
    # ترتيب حسب نسبة الحضور
    students_data.sort(key=lambda x: x["attendance_rate"], reverse=True)
    
    # بيانات المحاضرات
    lectures_data = []
    for lecture in lectures:
        records = await db.attendance.find({"lecture_id": str(lecture["_id"])}).to_list(1000)
        present = sum(1 for r in records if r["status"] == AttendanceStatus.PRESENT)
        
        lectures_data.append({
            "date": lecture.get("date").isoformat() if lecture.get("date") else "",
            "start_time": lecture.get("start_time", ""),
            "present_count": present,
            "total_students": len(records),
            "attendance_rate": round(present / len(records) * 100, 2) if records else 0
        })
    
    return {
        "course": {
            "id": course_id,
            "name": course["name"],
            "code": course.get("code", ""),
            "teacher_name": teacher_name,
            "level": course.get("level"),
            "section": course.get("section")
        },
        "students": students_data,
        "lectures": lectures_data,
        "summary": {
            "total_students": len(students_data),
            "total_lectures": len(lectures_data),
            "avg_attendance_rate": round(sum(s["attendance_rate"] for s in students_data) / len(students_data), 2) if students_data else 0
        }
    }

@api_router.get("/reports/teacher-workload")
async def get_teacher_workload_report(
    teacher_id: Optional[str] = None,
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """تقرير نصاب المدرس - كم نصابه، كم درسها فعلياً، كم ساعات زائدة"""
    if not has_permission(current_user, Permission.VIEW_REPORTS):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # تحديد الفترة
    if not start_date or not end_date:
        # افتراضي: الشهر الحالي
        today = datetime.utcnow()
        start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = (start + timedelta(days=32)).replace(day=1) - timedelta(seconds=1)
    else:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    
    # جلب المعلمين
    teacher_query = {"is_active": {"$ne": False}}
    if teacher_id:
        teacher_query["_id"] = ObjectId(teacher_id)
    
    teachers = await db.teachers.find(teacher_query).to_list(100)
    
    result = []
    for teacher in teachers:
        tid = str(teacher["_id"])
        
        # جلب المقررات
        courses = await db.courses.find({"teacher_id": tid, "is_active": True}).to_list(50)
        
        total_scheduled_hours = 0
        total_actual_hours = 0
        courses_data = []
        
        for course in courses:
            cid = str(course["_id"])
            
            # المحاضرات المجدولة في الفترة
            scheduled_lectures = await db.lectures.find({
                "course_id": cid,
                "date": {"$gte": start, "$lte": end},
                "is_cancelled": {"$ne": True}
            }).to_list(500)
            
            # المحاضرات التي تم تسجيل حضور فيها (المنفذة فعلياً)
            executed_lectures = []
            for lecture in scheduled_lectures:
                attendance_count = await db.attendance.count_documents({"lecture_id": str(lecture["_id"])})
                if attendance_count > 0:
                    executed_lectures.append(lecture)
            
            # حساب الساعات
            scheduled_hours = 0
            actual_hours = 0
            
            for lecture in scheduled_lectures:
                try:
                    start_time = datetime.strptime(lecture.get("start_time", "00:00"), "%H:%M")
                    end_time = datetime.strptime(lecture.get("end_time", "00:00"), "%H:%M")
                    duration = (end_time - start_time).seconds / 3600
                    scheduled_hours += duration
                except:
                    scheduled_hours += 1  # افتراضي ساعة واحدة
            
            for lecture in executed_lectures:
                try:
                    start_time = datetime.strptime(lecture.get("start_time", "00:00"), "%H:%M")
                    end_time = datetime.strptime(lecture.get("end_time", "00:00"), "%H:%M")
                    duration = (end_time - start_time).seconds / 3600
                    actual_hours += duration
                except:
                    actual_hours += 1
            
            total_scheduled_hours += scheduled_hours
            total_actual_hours += actual_hours
            
            courses_data.append({
                "course_name": course["name"],
                "course_code": course.get("code", ""),
                "scheduled_lectures": len(scheduled_lectures),
                "executed_lectures": len(executed_lectures),
                "scheduled_hours": round(scheduled_hours, 2),
                "actual_hours": round(actual_hours, 2)
            })
        
        extra_hours = total_actual_hours - total_scheduled_hours
        
        result.append({
            "teacher_id": teacher.get("teacher_id", ""),
            "teacher_name": teacher.get("full_name", ""),
            "department_id": teacher.get("department_id"),
            "courses": courses_data,
            "summary": {
                "total_courses": len(courses_data),
                "total_scheduled_hours": round(total_scheduled_hours, 2),
                "total_actual_hours": round(total_actual_hours, 2),
                "extra_hours": round(extra_hours, 2),
                "completion_rate": round((total_actual_hours / total_scheduled_hours) * 100, 2) if total_scheduled_hours > 0 else 0
            }
        })
    
    return {
        "period": {
            "start_date": start.isoformat(),
            "end_date": end.isoformat()
        },
        "teachers": result,
        "summary": {
            "total_teachers": len(result),
            "total_scheduled_hours": round(sum(t["summary"]["total_scheduled_hours"] for t in result), 2),
            "total_actual_hours": round(sum(t["summary"]["total_actual_hours"] for t in result), 2),
            "total_extra_hours": round(sum(t["summary"]["extra_hours"] for t in result), 2)
        }
    }

# ==================== Reports Export (PDF & Excel) ====================

@api_router.get("/export/report/warnings/excel")
async def export_warnings_excel(
    department_id: Optional[str] = None,
    warning_threshold: float = 25.0,
    deprivation_threshold: float = 40.0,
    current_user: dict = Depends(get_current_user)
):
    """تصدير تقرير الإنذارات إلى Excel"""
    if not has_permission(current_user, Permission.EXPORT_REPORTS):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # جلب البيانات
    report = await get_warnings_report(department_id, warning_threshold, deprivation_threshold, current_user)
    
    # إعداد البيانات
    all_data = []
    for item in report["warnings"]:
        item["الحالة"] = "إنذار"
        all_data.append(item)
    for item in report["deprivations"]:
        item["الحالة"] = "محروم"
        all_data.append(item)
    
    if not all_data:
        all_data = [{"ملاحظة": "لا توجد بيانات"}]
    
    # تحويل للـ DataFrame
    df = pd.DataFrame(all_data)
    df = df.rename(columns={
        "student_id": "رقم القيد",
        "student_name": "اسم الطالب",
        "course_name": "المقرر",
        "course_code": "رمز المقرر",
        "total_lectures": "المحاضرات",
        "absent_count": "الغياب",
        "absence_rate": "نسبة الغياب %",
        "remaining_allowed": "المتبقي المسموح",
        "status": "الحالة"
    })
    
    output = BytesIO()
    df.to_excel(output, index=False, engine='openpyxl')
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=warnings_report.xlsx"}
    )

@api_router.get("/export/report/absent-students/excel")
async def export_absent_students_excel(
    department_id: Optional[str] = None,
    course_id: Optional[str] = None,
    min_absence_rate: float = 25.0,
    current_user: dict = Depends(get_current_user)
):
    """تصدير تقرير الطلاب المتغيبين إلى Excel"""
    if not has_permission(current_user, Permission.EXPORT_REPORTS):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    report = await get_absent_students_report(department_id, course_id, min_absence_rate, current_user)
    
    if not report["students"]:
        data = [{"ملاحظة": "لا توجد بيانات"}]
    else:
        data = report["students"]
    
    df = pd.DataFrame(data)
    df = df.rename(columns={
        "student_id": "رقم القيد",
        "student_name": "اسم الطالب",
        "course_name": "المقرر",
        "course_code": "رمز المقرر",
        "total_lectures": "المحاضرات",
        "absent_count": "الغياب",
        "absence_rate": "نسبة الغياب %"
    })
    
    output = BytesIO()
    df.to_excel(output, index=False, engine='openpyxl')
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=absent_students.xlsx"}
    )

@api_router.get("/export/report/teacher-workload/excel")
async def export_teacher_workload_excel(
    teacher_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تصدير تقرير نصاب المدرسين إلى Excel"""
    if not has_permission(current_user, Permission.EXPORT_REPORTS):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    report = await get_teacher_workload_report(teacher_id, start_date, end_date, current_user)
    
    # تحويل البيانات
    data = []
    for teacher in report["teachers"]:
        for course in teacher["courses"]:
            data.append({
                "الرقم الوظيفي": teacher["teacher_id"],
                "اسم المدرس": teacher["teacher_name"],
                "المقرر": course["course_name"],
                "رمز المقرر": course["course_code"],
                "المحاضرات المجدولة": course["scheduled_lectures"],
                "المحاضرات المنفذة": course["executed_lectures"],
                "الساعات المجدولة": course["scheduled_hours"],
                "الساعات المنفذة": course["actual_hours"]
            })
        # صف ملخص للمدرس
        data.append({
            "الرقم الوظيفي": teacher["teacher_id"],
            "اسم المدرس": teacher["teacher_name"],
            "المقرر": "*** الإجمالي ***",
            "رمز المقرر": "",
            "المحاضرات المجدولة": "",
            "المحاضرات المنفذة": "",
            "الساعات المجدولة": teacher["summary"]["total_scheduled_hours"],
            "الساعات المنفذة": teacher["summary"]["total_actual_hours"],
            "الساعات الزائدة": teacher["summary"]["extra_hours"],
            "نسبة الإنجاز %": teacher["summary"]["completion_rate"]
        })
    
    if not data:
        data = [{"ملاحظة": "لا توجد بيانات"}]
    
    df = pd.DataFrame(data)
    output = BytesIO()
    df.to_excel(output, index=False, engine='openpyxl')
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=teacher_workload.xlsx"}
    )

@api_router.get("/export/report/daily/excel")
async def export_daily_excel(
    date: Optional[str] = None,
    department_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تصدير التقرير اليومي إلى Excel"""
    if not has_permission(current_user, Permission.EXPORT_REPORTS):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    report = await get_daily_report(date, department_id, current_user)
    
    data = []
    for lecture in report["lectures"]:
        data.append({
            "المقرر": lecture["course_name"],
            "رمز المقرر": lecture["course_code"],
            "وقت البداية": lecture["start_time"],
            "وقت النهاية": lecture["end_time"],
            "حاضر": lecture["present"],
            "غائب": lecture["absent"],
            "متأخر": lecture["late"],
            "الإجمالي": lecture["total_students"],
            "نسبة الحضور %": lecture["attendance_rate"]
        })
    
    if not data:
        data = [{"ملاحظة": "لا توجد محاضرات في هذا اليوم"}]
    
    df = pd.DataFrame(data)
    output = BytesIO()
    df.to_excel(output, index=False, engine='openpyxl')
    output.seek(0)
    
    report_date = date or datetime.utcnow().strftime("%Y-%m-%d")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=daily_report_{report_date}.xlsx"}
    )

@api_router.get("/export/report/student/{student_id}/excel")
async def export_student_report_excel(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    """تصدير تقرير طالب إلى Excel"""
    if not has_permission(current_user, Permission.EXPORT_REPORTS):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    report = await get_student_attendance_report(student_id, current_user)
    
    # بيانات الطالب
    student_info = report["student"]
    
    data = []
    for course in report["courses"]:
        data.append({
            "المقرر": course["course_name"],
            "رمز المقرر": course["course_code"],
            "المحاضرات": course["total_lectures"],
            "حاضر": course["present"],
            "غائب": course["absent"],
            "متأخر": course["late"],
            "نسبة الحضور %": course["attendance_rate"]
        })
    
    # إضافة صف الملخص
    data.append({
        "المقرر": "*** الإجمالي ***",
        "رمز المقرر": "",
        "المحاضرات": report["summary"]["total_lectures"],
        "حاضر": report["summary"]["total_present"],
        "غائب": report["summary"]["total_absent"],
        "متأخر": report["summary"]["total_late"],
        "نسبة الحضور %": report["summary"]["overall_attendance_rate"]
    })
    
    df = pd.DataFrame(data)
    output = BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # ورقة معلومات الطالب
        info_df = pd.DataFrame([{
            "رقم القيد": student_info["student_id"],
            "الاسم": student_info["full_name"],
            "المستوى": student_info["level"],
            "الشعبة": student_info.get("section", "")
        }])
        info_df.to_excel(writer, sheet_name="معلومات الطالب", index=False)
        # ورقة التقرير
        df.to_excel(writer, sheet_name="تفاصيل الحضور", index=False)
    
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=student_{student_info['student_id']}_report.xlsx"}
    )

@api_router.get("/export/report/course/{course_id}/excel")
async def export_course_report_excel(
    course_id: str,
    current_user: dict = Depends(get_current_user)
):
    """تصدير تقرير مقرر إلى Excel"""
    if not has_permission(current_user, Permission.EXPORT_REPORTS):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    report = await get_course_detailed_report(course_id, current_user)
    
    output = BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # ورقة الطلاب
        students_data = []
        for idx, student in enumerate(report["students"], 1):
            students_data.append({
                "الترتيب": idx,
                "رقم القيد": student["student_id"],
                "اسم الطالب": student["student_name"],
                "حاضر": student["present"],
                "غائب": student["absent"],
                "متأخر": student["late"],
                "نسبة الحضور %": student["attendance_rate"]
            })
        
        if students_data:
            pd.DataFrame(students_data).to_excel(writer, sheet_name="الطلاب", index=False)
        
        # ورقة المحاضرات
        lectures_data = []
        for lecture in report["lectures"]:
            lectures_data.append({
                "التاريخ": lecture["date"],
                "الوقت": lecture["start_time"],
                "عدد الحاضرين": lecture["present_count"],
                "الإجمالي": lecture["total_students"],
                "نسبة الحضور %": lecture["attendance_rate"]
            })
        
        if lectures_data:
            pd.DataFrame(lectures_data).to_excel(writer, sheet_name="المحاضرات", index=False)
    
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=course_{report['course']['code']}_report.xlsx"}
    )

@api_router.get("/export/report/attendance-overview/excel")
async def export_attendance_overview_excel(
    department_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تصدير تقرير الحضور الشامل إلى Excel"""
    if not has_permission(current_user, Permission.EXPORT_REPORTS):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    report = await get_attendance_overview_report(department_id, None, None, current_user)
    
    data = []
    for course in report["courses"]:
        data.append({
            "المقرر": course["course_name"],
            "رمز المقرر": course["course_code"],
            "المدرس": course.get("teacher_name", ""),
            "إجمالي السجلات": course["total_records"],
            "حاضر": course["present_count"],
            "غائب": course["absent_count"],
            "متأخر": course["late_count"],
            "نسبة الحضور %": course["attendance_rate"]
        })
    
    if not data:
        data = [{"ملاحظة": "لا توجد بيانات"}]
    
    df = pd.DataFrame(data)
    output = BytesIO()
    df.to_excel(output, index=False, engine='openpyxl')
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=attendance_overview.xlsx"}
    )

# ==================== Initialize Admin ====================

@api_router.post("/init-admin")
async def init_admin():
    """Create initial admin user if not exists"""
    existing = await db.users.find_one({"role": UserRole.ADMIN})
    if existing:
        return {"message": "المشرف موجود مسبقاً"}
    
    admin_data = {
        "username": "admin",
        "password": get_password_hash("admin123"),
        "full_name": "مدير النظام",
        "role": UserRole.ADMIN,
        "email": "admin@sharia.edu",
        "created_at": datetime.utcnow(),
        "is_active": True
    }
    
    await db.users.insert_one(admin_data)
    return {"message": "تم إنشاء حساب المشرف بنجاح", "username": "admin", "password": "admin123"}

@api_router.post("/reset-admin")
async def reset_admin():
    """Reset admin user - creates new or updates existing"""
    try:
        # Delete existing admin
        await db.users.delete_many({"username": "admin"})
        
        # Create fresh admin - use dynamic hash
        admin_password = "admin123"
        hashed = get_password_hash(admin_password)
        
        admin_data = {
            "username": "admin",
            "password": hashed,
            "full_name": "مدير النظام",
            "role": "admin",
            "email": "admin@sharia.edu",
            "created_at": datetime.utcnow(),
            "is_active": True,
            "permissions": [
                "manage_users", "manage_departments", "manage_courses",
                "manage_students", "record_attendance", "view_attendance",
                "edit_attendance", "view_reports", "export_reports",
                "import_data", "manage_lectures", "view_lectures"
            ]
        }
        
        await db.users.insert_one(admin_data)
        return {"message": "تم إعادة إنشاء حساب المشرف بنجاح", "username": "admin", "password": "admin123"}
    except Exception as e:
        logger.error(f"Error resetting admin: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== Schedule Routes ====================

class ScheduleBase(BaseModel):
    course_id: str
    day: str  # sunday, monday, tuesday, wednesday, thursday
    start_time: str  # HH:MM
    end_time: str
    room: str

class ScheduleCreate(ScheduleBase):
    pass

class ScheduleResponse(ScheduleBase):
    id: str
    created_at: datetime

@api_router.post("/schedule", response_model=ScheduleResponse)
async def create_schedule(schedule: ScheduleCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    schedule_dict = schedule.dict()
    schedule_dict["created_at"] = datetime.utcnow()
    
    result = await db.schedule.insert_one(schedule_dict)
    schedule_dict["id"] = str(result.inserted_id)
    
    return schedule_dict

@api_router.get("/schedule", response_model=List[ScheduleResponse])
async def get_schedule(
    day: Optional[str] = None,
    teacher_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    
    if day:
        query["day"] = day
    
    # Filter by teacher's courses if teacher
    if current_user["role"] == UserRole.TEACHER:
        # Get teacher's courses
        courses = await db.courses.find({"teacher_id": current_user["id"]}).to_list(100)
        course_ids = [str(c["_id"]) for c in courses]
        query["course_id"] = {"$in": course_ids}
    elif teacher_id:
        courses = await db.courses.find({"teacher_id": teacher_id}).to_list(100)
        course_ids = [str(c["_id"]) for c in courses]
        query["course_id"] = {"$in": course_ids}
    
    schedules = await db.schedule.find(query).to_list(500)
    return [{
        "id": str(s["_id"]),
        "course_id": s["course_id"],
        "day": s["day"],
        "start_time": s["start_time"],
        "end_time": s["end_time"],
        "room": s["room"],
        "created_at": s["created_at"]
    } for s in schedules]

@api_router.put("/schedule/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: str,
    schedule: ScheduleCreate,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    existing = await db.schedule.find_one({"_id": ObjectId(schedule_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="الموعد غير موجود")
    
    schedule_dict = schedule.dict()
    await db.schedule.update_one(
        {"_id": ObjectId(schedule_id)},
        {"$set": schedule_dict}
    )
    
    return {
        "id": schedule_id,
        **schedule_dict,
        "created_at": existing["created_at"]
    }

@api_router.delete("/schedule/{schedule_id}")
async def delete_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    result = await db.schedule.delete_one({"_id": ObjectId(schedule_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الموعد غير موجود")
    
    return {"message": "تم حذف الموعد بنجاح"}

@api_router.get("/schedule/today")
async def get_today_schedule(current_user: dict = Depends(get_current_user)):
    """Get today's schedule based on current day"""
    days_map = {
        0: 'monday', 1: 'tuesday', 2: 'wednesday', 
        3: 'thursday', 4: 'friday', 5: 'saturday', 6: 'sunday'
    }
    today = days_map[datetime.utcnow().weekday()]
    
    query = {"day": today}
    
    if current_user["role"] == UserRole.TEACHER:
        courses = await db.courses.find({"teacher_id": current_user["id"]}).to_list(100)
        course_ids = [str(c["_id"]) for c in courses]
        query["course_id"] = {"$in": course_ids}
    
    schedules = await db.schedule.find(query).sort("start_time", 1).to_list(100)
    
    result = []
    for s in schedules:
        course = await db.courses.find_one({"_id": ObjectId(s["course_id"])})
        result.append({
            "id": str(s["_id"]),
            "course_id": s["course_id"],
            "course_name": course["name"] if course else "غير معروف",
            "course_code": course["code"] if course else "",
            "day": s["day"],
            "start_time": s["start_time"],
            "end_time": s["end_time"],
            "room": s["room"],
            "level": course["level"] if course else 0,
            "section": course["section"] if course else ""
        })
    
    return result

# ==================== Import/Export Routes ====================

@api_router.post("/students/import/{course_id}")
async def import_students_to_course(
    course_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Import students from Excel file and enroll them in a course"""
    if not has_permission(current_user, Permission.MANAGE_STUDENTS) and not has_permission(current_user, Permission.IMPORT_DATA):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Get course info
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    try:
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents))
        logger.info(f"Import to course: columns={list(df.columns)}, rows={len(df)}")
        
        # دعم أسماء الأعمدة بالعربي والإنجليزي
        column_mapping = {
            'رقم القيد': 'student_id',
            'الرقم الجامعي': 'student_id',
            'رقم الطالب': 'student_id',
            'اسم الطالب': 'full_name',
            'الاسم': 'full_name',
            'الاسم الكامل': 'full_name',
            'الهاتف': 'phone',
            'رقم الهاتف': 'phone',
            'الجوال': 'phone',
            'البريد': 'email',
            'البريد الإلكتروني': 'email',
        }
        
        # إعادة تسمية الأعمدة
        df = df.rename(columns=column_mapping)
        logger.info(f"Columns after mapping: {list(df.columns)}")
        
        if 'student_id' not in df.columns:
            raise HTTPException(status_code=400, detail="العمود المطلوب غير موجود: رقم الطالب (student_id)")
        if 'full_name' not in df.columns:
            raise HTTPException(status_code=400, detail="العمود المطلوب غير موجود: اسم الطالب (full_name)")
        
        imported = 0
        enrolled = 0
        errors = []
        
        for index, row in df.iterrows():
            try:
                student_id_str = str(row['student_id'])
                
                # Check if student exists
                existing = await db.students.find_one({"student_id": student_id_str})
                
                if not existing:
                    # Create new student
                    student_data = {
                        "student_id": student_id_str,
                        "full_name": str(row['full_name']),
                        "department_id": course["department_id"],
                        "level": course["level"],
                        "section": course["section"],
                        "phone": str(row.get('phone', '')) if pd.notna(row.get('phone')) else None,
                        "email": str(row.get('email', '')) if pd.notna(row.get('email')) else None,
                        "qr_code": generate_qr_code(student_id_str),
                        "created_at": datetime.utcnow(),
                        "is_active": True,
                        "user_id": None
                    }
                    result = await db.students.insert_one(student_data)
                    student_db_id = str(result.inserted_id)
                    imported += 1
                else:
                    student_db_id = str(existing["_id"])
                
                # Check if already enrolled
                existing_enrollment = await db.enrollments.find_one({
                    "student_id": student_db_id,
                    "course_id": course_id
                })
                
                if not existing_enrollment:
                    # Enroll student in course
                    await db.enrollments.insert_one({
                        "student_id": student_db_id,
                        "course_id": course_id,
                        "enrolled_at": datetime.utcnow(),
                        "is_active": True
                    })
                    enrolled += 1
                    
            except Exception as e:
                errors.append(f"خطأ في الصف {index + 2}: {str(e)}")
        
        return {
            "message": f"تم استيراد {imported} طالب جديد وتسجيل {enrolled} طالب في المقرر",
            "imported": imported,
            "enrolled": enrolled,
            "errors": errors[:10]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"فشل في قراءة الملف: {str(e)}")

@api_router.post("/import/students")
async def import_students_from_excel(
    file: UploadFile = File(...),
    department_id: Optional[str] = None,
    level: Optional[int] = None,
    section: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Import students from Excel file"""
    logger.info(f"Import students called: department_id={department_id}, level={level}, section={section}, file={file.filename}")
    
    # التحقق من الصلاحيات
    if not has_permission(current_user, Permission.MANAGE_STUDENTS) and not has_permission(current_user, Permission.IMPORT_DATA):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    if not department_id:
        raise HTTPException(status_code=400, detail="يجب تحديد القسم")
    
    try:
        contents = await file.read()
        logger.info(f"File read successfully, size: {len(contents)} bytes")
        
        df = pd.read_excel(BytesIO(contents))
        logger.info(f"Excel parsed, columns: {list(df.columns)}, rows: {len(df)}")
        
        # دعم أسماء الأعمدة بالعربي والإنجليزي
        # تحويل أسماء الأعمدة العربية للإنجليزية
        column_mapping = {
            'رقم القيد': 'student_id',
            'الرقم الجامعي': 'student_id',
            'رقم الطالب': 'student_id',
            'اسم الطالب': 'full_name',
            'الاسم': 'full_name',
            'الاسم الكامل': 'full_name',
            'المستوى': 'level',
            'الشعبة': 'section',
            'القسم': 'section',
            'الهاتف': 'phone',
            'رقم الهاتف': 'phone',
            'الجوال': 'phone',
            'البريد': 'email',
            'البريد الإلكتروني': 'email',
            'الإيميل': 'email',
            # إضافة "رقم الطالب" كبديل لـ "رقم القيد"
            'رقم الطالب': 'student_id',
        }
        
        # إعادة تسمية الأعمدة
        df = df.rename(columns=column_mapping)
        logger.info(f"Columns after mapping: {list(df.columns)}")
        
        # student_id and full_name are required, level can come from parameter
        if 'student_id' not in df.columns:
            raise HTTPException(status_code=400, detail="العمود المطلوب غير موجود: رقم القيد (student_id)")
        if 'full_name' not in df.columns:
            raise HTTPException(status_code=400, detail="العمود المطلوب غير موجود: اسم الطالب (full_name)")
        
        # If level not in Excel and not provided as parameter, error
        if 'level' not in df.columns and not level:
            raise HTTPException(status_code=400, detail="يجب تحديد المستوى أو تضمينه في ملف Excel")
        
        imported = 0
        imported_ids = []
        errors = []
        
        for index, row in df.iterrows():
            try:
                # Check if student already exists
                existing = await db.students.find_one({"student_id": str(row['student_id'])})
                if existing:
                    errors.append(f"الطالب {row['student_id']} موجود مسبقاً")
                    continue
                
                # Use level from parameter first, then from Excel
                student_level = level if level else int(row.get('level', 1))
                
                # Use section from parameter first, then from Excel, or empty (section is optional)
                student_section = ""
                if section:
                    student_section = section
                elif 'section' in df.columns and pd.notna(row.get('section')):
                    student_section = str(row.get('section', ''))
                
                student_data = {
                    "student_id": str(row['student_id']),
                    "full_name": str(row['full_name']),
                    "department_id": department_id,
                    "level": student_level,
                    "section": student_section,
                    "phone": str(row.get('phone', '')) if pd.notna(row.get('phone')) else None,
                    "email": str(row.get('email', '')) if pd.notna(row.get('email')) else None,
                    "qr_code": generate_qr_code(str(row['student_id'])),
                    "created_at": datetime.utcnow(),
                    "is_active": True,
                    "user_id": None
                }
                
                result = await db.students.insert_one(student_data)
                imported_ids.append(str(result.inserted_id))
                imported += 1
            except Exception as e:
                errors.append(f"خطأ في الصف {index + 2}: {str(e)}")
        
        return {
            "message": f"تم استيراد {imported} طالب بنجاح",
            "imported": imported,
            "imported_ids": imported_ids,
            "errors": errors[:10]  # Return first 10 errors only
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Import error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"خطأ في قراءة الملف: {str(e)}")

@api_router.get("/export/students")
async def export_students_to_excel(
    department_id: Optional[str] = None,
    level: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Export students to Excel file"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    query = {"is_active": True}
    if department_id:
        query["department_id"] = department_id
    if level:
        query["level"] = level
    
    students = await db.students.find(query).to_list(10000)
    departments = await db.departments.find().to_list(100)
    dept_map = {str(d["_id"]): d["name"] for d in departments}
    
    data = []
    for s in students:
        data.append({
            "رقم الطالب": s["student_id"],
            "الاسم الكامل": s["full_name"],
            "القسم": dept_map.get(s["department_id"], "غير محدد"),
            "المستوى": s["level"],
            "الشعبة": s["section"],
            "الهاتف": s.get("phone", ""),
            "البريد": s.get("email", ""),
            "رمز QR": s["qr_code"]
        })
    
    df = pd.DataFrame(data)
    output = BytesIO()
    df.to_excel(output, index=False, engine='openpyxl')
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=students.xlsx"}
    )

@api_router.get("/export/attendance/{course_id}")
async def export_course_attendance(
    course_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Export course attendance to Excel"""
    # Get course details
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    # Get attendance records
    query = {"course_id": course_id}
    if start_date:
        query["date"] = {"$gte": datetime.fromisoformat(start_date)}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = datetime.fromisoformat(end_date)
        else:
            query["date"] = {"$lte": datetime.fromisoformat(end_date)}
    
    records = await db.attendance.find(query).sort("date", 1).to_list(50000)
    
    # Get students
    students = await db.students.find({
        "department_id": course["department_id"],
        "level": course["level"],
        "section": course["section"]
    }).to_list(500)
    student_map = {str(s["_id"]): s for s in students}
    
    # Group by date
    dates = sorted(set(r["date"].strftime("%Y-%m-%d") for r in records))
    
    data = []
    for student in students:
        row = {
            "رقم الطالب": student["student_id"],
            "اسم الطالب": student["full_name"]
        }
        
        student_records = [r for r in records if r["student_id"] == str(student["_id"])]
        
        total_present = 0
        total_absent = 0
        total_late = 0
        
        for date in dates:
            record = next((r for r in student_records if r["date"].strftime("%Y-%m-%d") == date), None)
            if record:
                status = record["status"]
                if status == "present":
                    row[date] = "حاضر"
                    total_present += 1
                elif status == "absent":
                    row[date] = "غائب"
                    total_absent += 1
                elif status == "late":
                    row[date] = "متأخر"
                    total_late += 1
                elif status == "excused":
                    row[date] = "معذور"
            else:
                row[date] = "-"
        
        total = total_present + total_absent + total_late
        rate = (total_present + total_late * 0.5) / total * 100 if total > 0 else 0
        
        row["إجمالي الحضور"] = total_present
        row["إجمالي الغياب"] = total_absent
        row["إجمالي التأخير"] = total_late
        row["نسبة الحضور %"] = round(rate, 2)
        
        data.append(row)
    
    df = pd.DataFrame(data)
    output = BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='سجل الحضور', index=False)
        
        # Add summary sheet
        summary_data = {
            "المقرر": [course["name"]],
            "الرمز": [course["code"]],
            "المستوى": [course["level"]],
            "الشعبة": [course["section"]],
            "إجمالي الطلاب": [len(students)],
            "عدد المحاضرات": [len(dates)]
        }
        summary_df = pd.DataFrame(summary_data)
        summary_df.to_excel(writer, sheet_name='ملخص', index=False)
    
    output.seek(0)
    
    filename = f"attendance_{course['code']}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/export/report/{dept_id}")
async def export_department_report(
    dept_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Export comprehensive department report"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    dept = await db.departments.find_one({"_id": ObjectId(dept_id)})
    if not dept:
        raise HTTPException(status_code=404, detail="القسم غير موجود")
    
    # Get all courses in department
    courses = await db.courses.find({"department_id": dept_id}).to_list(100)
    
    # Get all students in department
    students = await db.students.find({"department_id": dept_id}).to_list(10000)
    
    output = BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # Students sheet
        students_data = []
        for s in students:
            # Get attendance stats
            records = await db.attendance.find({"student_id": str(s["_id"])}).to_list(10000)
            total = len(records)
            present = sum(1 for r in records if r["status"] == "present")
            absent = sum(1 for r in records if r["status"] == "absent")
            rate = (present / total * 100) if total > 0 else 0
            
            students_data.append({
                "رقم الطالب": s["student_id"],
                "الاسم": s["full_name"],
                "المستوى": s["level"],
                "الشعبة": s["section"],
                "إجمالي المحاضرات": total,
                "الحضور": present,
                "الغياب": absent,
                "نسبة الحضور %": round(rate, 2)
            })
        
        if students_data:
            pd.DataFrame(students_data).to_excel(writer, sheet_name='الطلاب', index=False)
        
        # Courses sheet
        courses_data = []
        for c in courses:
            records = await db.attendance.find({"course_id": str(c["_id"])}).to_list(10000)
            sessions = len(set(r["date"].strftime("%Y-%m-%d") for r in records))
            
            courses_data.append({
                "رمز المقرر": c["code"],
                "اسم المقرر": c["name"],
                "المستوى": c["level"],
                "الشعبة": c["section"],
                "عدد المحاضرات": sessions
            })
        
        if courses_data:
            pd.DataFrame(courses_data).to_excel(writer, sheet_name='المقررات', index=False)
        
        # Summary sheet
        summary = {
            "القسم": [dept["name"]],
            "إجمالي الطلاب": [len(students)],
            "إجمالي المقررات": [len(courses)],
            "تاريخ التقرير": [datetime.now().strftime("%Y-%m-%d %H:%M")]
        }
        pd.DataFrame(summary).to_excel(writer, sheet_name='ملخص', index=False)
    
    output.seek(0)
    
    filename = f"report_{dept['code']}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/template/students")
async def get_students_template(current_user: dict = Depends(get_current_user)):
    """Download students import template - يحتوي فقط على الحقول المطلوبة"""
    if current_user["role"] != UserRole.ADMIN and not has_permission(current_user, Permission.IMPORT_DATA):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # الحقول المطلوبة فقط: رقم القيد واسم الطالب
    data = {
        "رقم القيد": ["12345", "12346", "12347"],
        "اسم الطالب": ["محمد أحمد علي", "أحمد محمد سعيد", "خالد سالم"],
    }
    
    df = pd.DataFrame(data)
    output = BytesIO()
    df.to_excel(output, index=False, engine='openpyxl')
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=students_template.xlsx"}
    )

# ==================== PDF Export Routes ====================

# Register Arabic font
import os
FONT_PATH = '/app/backend/fonts/Amiri-Regular.ttf'
if os.path.exists(FONT_PATH):
    try:
        pdfmetrics.registerFont(TTFont('Arabic', FONT_PATH))
        ARABIC_FONT = 'Arabic'
    except:
        ARABIC_FONT = 'Helvetica'
else:
    try:
        pdfmetrics.registerFont(TTFont('Arabic', '/usr/share/fonts/truetype/freefont/FreeSans.ttf'))
        ARABIC_FONT = 'Arabic'
    except:
        ARABIC_FONT = 'Helvetica'

def arabic_text(text):
    """Reshape Arabic text for PDF display"""
    if not text:
        return ""
    try:
        reshaped = arabic_reshaper.reshape(str(text))
        return get_display(reshaped)
    except:
        return str(text)

@api_router.get("/export/students/pdf")
async def export_students_pdf(
    department_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Export students list to PDF"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    query = {"is_active": True}
    if department_id:
        query["department_id"] = department_id
    
    students = await db.students.find(query).to_list(10000)
    departments = await db.departments.find().to_list(100)
    dept_map = {str(d["_id"]): d["name"] for d in departments}
    
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
    
    elements = []
    
    # Title
    title_style = ParagraphStyle(
        'Title',
        fontName=ARABIC_FONT,
        fontSize=18,
        alignment=TA_CENTER,
        spaceAfter=20,
    )
    elements.append(Paragraph(arabic_text("كشف الطلاب"), title_style))
    elements.append(Paragraph(arabic_text(f"التاريخ: {datetime.now().strftime('%Y-%m-%d')}"), 
                             ParagraphStyle('Date', fontName=ARABIC_FONT, fontSize=10, alignment=TA_CENTER)))
    elements.append(Spacer(1, 20))
    
    # Table header (RTL - from right to left)
    headers = [
        arabic_text("الشعبة"),
        arabic_text("المستوى"),
        arabic_text("القسم"),
        arabic_text("الاسم"),
        arabic_text("رقم الطالب"),
        arabic_text("م"),
    ]
    
    # Table data
    data = [headers]
    for i, s in enumerate(students, 1):
        row = [
            str(i),
            s["student_id"],
            arabic_text(s["full_name"]),
            arabic_text(dept_map.get(s["department_id"], "غير محدد")),
            str(s["level"]),
            s.get("section", "") or "",
        ]
        data.append(row)
    
    # Create table
    table = Table(data, colWidths=[30, 70, 120, 100, 50, 50])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1565c0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, -1), ARABIC_FONT),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    
    elements.append(table)
    
    # Summary
    elements.append(Spacer(1, 20))
    elements.append(Paragraph(arabic_text(f"إجمالي الطلاب: {len(students)}"), 
                             ParagraphStyle('Summary', fontName=ARABIC_FONT, fontSize=12, alignment=TA_RIGHT)))
    
    doc.build(elements)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=students_{datetime.now().strftime('%Y%m%d')}.pdf"}
    )

@api_router.get("/export/attendance/{course_id}/pdf")
async def export_attendance_pdf(
    course_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Export course attendance to PDF"""
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    
    # Get attendance records
    records = await db.attendance.find({"course_id": course_id}).sort("date", 1).to_list(50000)
    
    # Get enrolled students
    enrollments = await db.enrollments.find({"course_id": course_id}).to_list(10000)
    student_ids = [ObjectId(e["student_id"]) for e in enrollments]
    students = await db.students.find({"_id": {"$in": student_ids}}).to_list(500)
    
    # Group by date
    dates = sorted(set(r["date"].strftime("%Y-%m-%d") for r in records)) if records else []
    
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=20, leftMargin=20, topMargin=30, bottomMargin=30)
    
    elements = []
    
    # Title
    title_style = ParagraphStyle('Title', fontName=ARABIC_FONT, fontSize=16, alignment=TA_CENTER, spaceAfter=10)
    elements.append(Paragraph(arabic_text("سجل الحضور"), title_style))
    elements.append(Paragraph(arabic_text(f"المقرر: {course['name']} ({course['code']})"), 
                             ParagraphStyle('Subtitle', fontName=ARABIC_FONT, fontSize=12, alignment=TA_CENTER)))
    section_text = course.get('section', '') or ''
    elements.append(Paragraph(arabic_text(f"المستوى {course['level']} - الشعبة {section_text}"), 
                             ParagraphStyle('Info', fontName=ARABIC_FONT, fontSize=10, alignment=TA_CENTER)))
    elements.append(Spacer(1, 15))
    
    # Table header (RTL - from right to left)
    # Add date columns (show last 10 dates max for readability)
    display_dates = dates[-10:] if len(dates) > 10 else dates
    
    # Build headers RTL
    headers = [arabic_text("%"), arabic_text("غياب"), arabic_text("حضور")]
    for d in reversed(display_dates):
        headers.append(d[5:])  # Show MM-DD only
    headers.extend([arabic_text("الاسم"), arabic_text("رقم الطالب"), arabic_text("م")])
    
    data = [headers]
    
    for i, student in enumerate(students, 1):
        student_records = [r for r in records if r["student_id"] == str(student["_id"])]
        
        total_present = 0
        total_absent = 0
        
        # Build date columns in reverse order for RTL
        date_cols = []
        for date in reversed(display_dates):
            record = next((r for r in student_records if r["date"].strftime("%Y-%m-%d") == date), None)
            if record:
                if record["status"] == "present":
                    date_cols.append("✓")
                    total_present += 1
                elif record["status"] == "absent":
                    date_cols.append("✗")
                    total_absent += 1
                elif record["status"] == "excused":
                    date_cols.append("E")
                    total_present += 0.5  # Count excused as half present
                else:
                    date_cols.append("-")
            else:
                date_cols.append("-")
        
        total = total_present + total_absent
        rate = (total_present / total * 100) if total > 0 else 0
        
        # Build row RTL: % | absent | present | dates... | name | student_id | #
        row = [f"{rate:.0f}", str(int(total_absent)), str(int(total_present))]
        row.extend(date_cols)
        row.extend([arabic_text(student["full_name"]), student["student_id"], str(i)])
        data.append(row)
    
    # Calculate column widths (RTL)
    col_widths = [30, 35, 35] + [28] * len(display_dates) + [90, 55, 25]
    
    table = Table(data, colWidths=col_widths)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1565c0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, -1), ARABIC_FONT),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    
    elements.append(table)
    
    # Summary
    elements.append(Spacer(1, 15))
    elements.append(Paragraph(arabic_text(f"إجمالي الطلاب: {len(students)} | عدد المحاضرات: {len(dates)}"), 
                             ParagraphStyle('Summary', fontName=ARABIC_FONT, fontSize=10, alignment=TA_RIGHT)))
    elements.append(Paragraph(arabic_text(f"تاريخ التقرير: {datetime.now().strftime('%Y-%m-%d %H:%M')}"), 
                             ParagraphStyle('Date', fontName=ARABIC_FONT, fontSize=9, alignment=TA_RIGHT)))
    
    doc.build(elements)
    output.seek(0)
    
    filename = f"attendance_{course['code']}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/export/report/{dept_id}/pdf")
async def export_department_report_pdf(
    dept_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Export department report to PDF"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    dept = await db.departments.find_one({"_id": ObjectId(dept_id)})
    if not dept:
        raise HTTPException(status_code=404, detail="القسم غير موجود")
    
    students = await db.students.find({"department_id": dept_id}).to_list(10000)
    courses = await db.courses.find({"department_id": dept_id}).to_list(100)
    
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
    
    elements = []
    
    # Title
    title_style = ParagraphStyle('Title', fontName=ARABIC_FONT, fontSize=18, alignment=TA_CENTER, spaceAfter=10)
    elements.append(Paragraph(arabic_text("تقرير القسم"), title_style))
    elements.append(Paragraph(arabic_text(dept["name"]), 
                             ParagraphStyle('DeptName', fontName=ARABIC_FONT, fontSize=14, alignment=TA_CENTER, spaceAfter=20)))
    
    # Summary stats
    elements.append(Paragraph(arabic_text(f"إجمالي الطلاب: {len(students)}"), 
                             ParagraphStyle('Stat', fontName=ARABIC_FONT, fontSize=12, alignment=TA_RIGHT)))
    elements.append(Paragraph(arabic_text(f"إجمالي المقررات: {len(courses)}"), 
                             ParagraphStyle('Stat', fontName=ARABIC_FONT, fontSize=12, alignment=TA_RIGHT)))
    elements.append(Spacer(1, 20))
    
    # Students table
    elements.append(Paragraph(arabic_text("قائمة الطلاب"), 
                             ParagraphStyle('SectionTitle', fontName=ARABIC_FONT, fontSize=14, alignment=TA_CENTER, spaceAfter=10)))
    
    # RTL headers - from right to left
    headers = [arabic_text("نسبة الحضور"), arabic_text("الشعبة"), arabic_text("المستوى"),
               arabic_text("الاسم"), arabic_text("رقم الطالب"), arabic_text("م")]
    
    data = [headers]
    for i, s in enumerate(students[:50], 1):  # Limit to 50 for PDF
        # Calculate attendance rate
        records = await db.attendance.find({"student_id": str(s["_id"])}).to_list(10000)
        total = len(records)
        present = sum(1 for r in records if r["status"] == "present")
        rate = (present / total * 100) if total > 0 else 0
        
        # RTL row - from right to left
        row = [
            f"{rate:.1f}%",
            s.get("section", "") or "",
            str(s["level"]),
            arabic_text(s["full_name"]),
            s["student_id"],
            str(i),
        ]
        data.append(row)
    
    table = Table(data, colWidths=[80, 50, 50, 130, 70, 30])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1565c0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, -1), ARABIC_FONT),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    
    elements.append(table)
    
    # Footer
    elements.append(Spacer(1, 30))
    elements.append(Paragraph(arabic_text(f"تاريخ التقرير: {datetime.now().strftime('%Y-%m-%d %H:%M')}"), 
                             ParagraphStyle('Footer', fontName=ARABIC_FONT, fontSize=9, alignment=TA_CENTER)))
    
    doc.build(elements)
    output.seek(0)
    
    filename = f"report_{dept['code']}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ==================== Semesters Routes (إدارة الفصول الدراسية) ====================

@api_router.get("/semesters")
async def get_all_semesters(
    academic_year: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """الحصول على جميع الفصول الدراسية"""
    query = {}
    if academic_year:
        query["academic_year"] = academic_year
    if status:
        query["status"] = status
    
    semesters = await db.semesters.find(query).sort("created_at", -1).to_list(100)
    
    result = []
    for sem in semesters:
        # حساب الإحصائيات
        courses_count = await db.courses.count_documents({"semester_id": str(sem["_id"])})
        
        result.append({
            "id": str(sem["_id"]),
            "name": sem["name"],
            "academic_year": sem["academic_year"],
            "start_date": sem.get("start_date"),
            "end_date": sem.get("end_date"),
            "status": sem.get("status", SemesterStatus.UPCOMING),
            "courses_count": courses_count,
            "created_at": sem.get("created_at", datetime.utcnow()),
            "closed_at": sem.get("closed_at"),
            "archived_at": sem.get("archived_at"),
        })
    
    return result

@api_router.post("/semesters")
async def create_semester(data: SemesterCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء فصل دراسي جديد"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # التحقق من عدم وجود فصل بنفس الاسم في نفس السنة
    existing = await db.semesters.find_one({
        "name": data.name,
        "academic_year": data.academic_year
    })
    if existing:
        raise HTTPException(status_code=400, detail="يوجد فصل بهذا الاسم في هذه السنة")
    
    semester_dict = data.dict()
    semester_dict["created_at"] = datetime.utcnow()
    semester_dict["created_by"] = current_user["id"]
    
    result = await db.semesters.insert_one(semester_dict)
    
    return {
        "id": str(result.inserted_id),
        "message": "تم إنشاء الفصل الدراسي بنجاح"
    }

@api_router.get("/semesters/current")
async def get_current_semester(current_user: dict = Depends(get_current_user)):
    """الحصول على الفصل الدراسي الحالي (النشط)"""
    semester = await db.semesters.find_one({"status": SemesterStatus.ACTIVE})
    
    if not semester:
        # إذا لم يوجد فصل نشط، نحاول الحصول عليه من الإعدادات
        settings = await db.settings.find_one({"_id": "system_settings"})
        if settings and settings.get("current_semester_id"):
            semester = await db.semesters.find_one({"_id": ObjectId(settings["current_semester_id"])})
    
    if not semester:
        return None
    
    return {
        "id": str(semester["_id"]),
        "name": semester["name"],
        "academic_year": semester["academic_year"],
        "start_date": semester.get("start_date"),
        "end_date": semester.get("end_date"),
        "status": semester.get("status"),
    }

@api_router.put("/semesters/{semester_id}")
async def update_semester(semester_id: str, data: SemesterUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث فصل دراسي"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    semester = await db.semesters.find_one({"_id": ObjectId(semester_id)})
    if not semester:
        raise HTTPException(status_code=404, detail="الفصل غير موجود")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        await db.semesters.update_one({"_id": ObjectId(semester_id)}, {"$set": update_data})
        
        # إذا كان الفصل نشطاً، قم بتحديث الإعدادات أيضاً
        if semester.get("status") == SemesterStatus.ACTIVE:
            settings_update = {"updated_at": datetime.utcnow()}
            
            if data.name:
                settings_update["current_semester"] = data.name
            if data.academic_year:
                settings_update["academic_year"] = data.academic_year
            if data.start_date:
                settings_update["semester_start_date"] = data.start_date
            if data.end_date:
                settings_update["semester_end_date"] = data.end_date
            
            if len(settings_update) > 1:  # أكثر من updated_at فقط
                await db.settings.update_one(
                    {"_id": "system_settings"},
                    {"$set": settings_update}
                )
    
    return {"message": "تم تحديث الفصل الدراسي بنجاح"}

@api_router.post("/semesters/{semester_id}/activate")
async def activate_semester(semester_id: str, current_user: dict = Depends(get_current_user)):
    """تفعيل فصل دراسي (جعله الفصل الحالي)"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    semester = await db.semesters.find_one({"_id": ObjectId(semester_id)})
    if not semester:
        raise HTTPException(status_code=404, detail="الفصل غير موجود")
    
    if semester.get("status") == SemesterStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="لا يمكن تفعيل فصل مؤرشف")
    
    # إلغاء تفعيل الفصل الحالي
    await db.semesters.update_many(
        {"status": SemesterStatus.ACTIVE},
        {"$set": {"status": SemesterStatus.CLOSED, "closed_at": datetime.utcnow()}}
    )
    
    # تفعيل الفصل الجديد
    await db.semesters.update_one(
        {"_id": ObjectId(semester_id)},
        {"$set": {"status": SemesterStatus.ACTIVE}}
    )
    
    # تحديث الإعدادات - تضمين تواريخ الفصل الدراسي
    settings_update = {
        "current_semester_id": semester_id,
        "current_semester": semester["name"],
        "academic_year": semester["academic_year"],
        "updated_at": datetime.utcnow()
    }
    
    # إضافة تواريخ الفصل إذا كانت موجودة
    if semester.get("start_date"):
        settings_update["semester_start_date"] = semester["start_date"]
    if semester.get("end_date"):
        settings_update["semester_end_date"] = semester["end_date"]
    
    await db.settings.update_one(
        {"_id": "system_settings"},
        {"$set": settings_update},
        upsert=True
    )
    
    return {"message": f"تم تفعيل الفصل '{semester['name']}' بنجاح"}

@api_router.post("/semesters/{semester_id}/close")
async def close_semester(semester_id: str, current_user: dict = Depends(get_current_user)):
    """إغلاق فصل دراسي"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    semester = await db.semesters.find_one({"_id": ObjectId(semester_id)})
    if not semester:
        raise HTTPException(status_code=404, detail="الفصل غير موجود")
    
    if semester.get("status") == SemesterStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="الفصل مؤرشف مسبقاً")
    
    await db.semesters.update_one(
        {"_id": ObjectId(semester_id)},
        {"$set": {"status": SemesterStatus.CLOSED, "closed_at": datetime.utcnow()}}
    )
    
    return {"message": "تم إغلاق الفصل الدراسي بنجاح"}

@api_router.post("/semesters/{semester_id}/archive")
async def archive_semester(semester_id: str, current_user: dict = Depends(get_current_user)):
    """أرشفة فصل دراسي (نسخ جميع البيانات للأرشيف)"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    semester = await db.semesters.find_one({"_id": ObjectId(semester_id)})
    if not semester:
        raise HTTPException(status_code=404, detail="الفصل غير موجود")
    
    if semester.get("status") == SemesterStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="لا يمكن أرشفة فصل نشط. يرجى إغلاقه أولاً")
    
    if semester.get("status") == SemesterStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="الفصل مؤرشف مسبقاً")
    
    # جمع إحصائيات الفصل قبل الأرشفة
    courses = await db.courses.find({"semester_id": semester_id}).to_list(1000)
    course_ids = [str(c["_id"]) for c in courses]
    
    # جمع سجلات الحضور للمقررات
    attendance_records = await db.attendance.find({"course_id": {"$in": course_ids}}).to_list(100000)
    
    # إنشاء سجل الأرشيف
    archive_record = {
        "semester_id": semester_id,
        "semester_name": semester["name"],
        "academic_year": semester["academic_year"],
        "courses": courses,
        "attendance_records": attendance_records,
        "courses_count": len(courses),
        "attendance_count": len(attendance_records),
        "archived_at": datetime.utcnow(),
        "archived_by": current_user["id"]
    }
    
    await db.semester_archives.insert_one(archive_record)
    
    # تحديث حالة الفصل
    await db.semesters.update_one(
        {"_id": ObjectId(semester_id)},
        {"$set": {
            "status": SemesterStatus.ARCHIVED,
            "archived_at": datetime.utcnow(),
            "archive_stats": {
                "courses_count": len(courses),
                "attendance_count": len(attendance_records)
            }
        }}
    )
    
    return {
        "message": "تم أرشفة الفصل الدراسي بنجاح",
        "archived_courses": len(courses),
        "archived_attendance": len(attendance_records)
    }

@api_router.get("/semesters/{semester_id}/stats")
async def get_semester_stats(semester_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على إحصائيات فصل دراسي"""
    semester = await db.semesters.find_one({"_id": ObjectId(semester_id)})
    if not semester:
        raise HTTPException(status_code=404, detail="الفصل غير موجود")
    
    # جمع الإحصائيات
    courses = await db.courses.find({"semester_id": semester_id}).to_list(1000)
    course_ids = [str(c["_id"]) for c in courses]
    
    attendance_count = await db.attendance.count_documents({"course_id": {"$in": course_ids}})
    lectures_count = await db.lectures.count_documents({"course_id": {"$in": course_ids}})
    
    # جمع الطلاب المسجلين
    enrollments = await db.enrollments.find({"course_id": {"$in": course_ids}}).to_list(10000)
    unique_students = set([e["student_id"] for e in enrollments])
    
    return {
        "semester_id": semester_id,
        "semester_name": semester["name"],
        "academic_year": semester["academic_year"],
        "status": semester.get("status"),
        "courses_count": len(courses),
        "students_count": len(unique_students),
        "lectures_count": lectures_count,
        "attendance_records": attendance_count,
    }

@api_router.delete("/semesters/{semester_id}")
async def delete_semester(semester_id: str, current_user: dict = Depends(get_current_user)):
    """حذف فصل دراسي (فقط إذا لم يكن له مقررات)"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    semester = await db.semesters.find_one({"_id": ObjectId(semester_id)})
    if not semester:
        raise HTTPException(status_code=404, detail="الفصل غير موجود")
    
    # التحقق من عدم وجود مقررات مرتبطة
    courses_count = await db.courses.count_documents({"semester_id": semester_id})
    if courses_count > 0:
        raise HTTPException(status_code=400, detail=f"لا يمكن حذف الفصل، يوجد {courses_count} مقرر مرتبط به")
    
    await db.semesters.delete_one({"_id": ObjectId(semester_id)})
    
    return {"message": "تم حذف الفصل الدراسي بنجاح"}

# ==================== Settings Routes (الإعدادات العامة) ====================

@api_router.get("/settings")
async def get_settings(current_user: dict = Depends(get_current_user)):
    """الحصول على إعدادات النظام"""
    settings = await db.settings.find_one({"_id": "system_settings"})
    if not settings:
        # إنشاء إعدادات افتراضية
        default_settings = SystemSettings().dict()
        default_settings["_id"] = "system_settings"
        default_settings["created_at"] = datetime.utcnow()
        default_settings["updated_at"] = datetime.utcnow()
        # إضافة سنوات افتراضية
        current_year = datetime.now().year
        default_settings["academic_years"] = [f"{current_year-1}-{current_year}", f"{current_year}-{current_year+1}"]
        await db.settings.insert_one(default_settings)
        settings = default_settings
    
    # جلب تواريخ الفصل من الفصل النشط إذا لم تكن في الإعدادات
    semester_start = settings.get("semester_start_date")
    semester_end = settings.get("semester_end_date")
    
    if not semester_start or not semester_end:
        # محاولة جلب التواريخ من الفصل النشط
        active_semester = await db.semesters.find_one({"status": SemesterStatus.ACTIVE})
        if active_semester:
            semester_start = semester_start or active_semester.get("start_date")
            semester_end = semester_end or active_semester.get("end_date")
            
            # تحديث الإعدادات للمرة القادمة
            if active_semester.get("start_date") or active_semester.get("end_date"):
                update_fields = {}
                if active_semester.get("start_date") and not settings.get("semester_start_date"):
                    update_fields["semester_start_date"] = active_semester["start_date"]
                if active_semester.get("end_date") and not settings.get("semester_end_date"):
                    update_fields["semester_end_date"] = active_semester["end_date"]
                if update_fields:
                    await db.settings.update_one(
                        {"_id": "system_settings"},
                        {"$set": update_fields}
                    )
    
    return {
        "college_name": settings.get("college_name", "كلية الشريعة والقانون"),
        "college_name_en": settings.get("college_name_en", "Faculty of Sharia and Law"),
        "academic_year": settings.get("academic_year", "2024-2025"),
        "current_semester": settings.get("current_semester", "الفصل الأول"),
        "semester_start_date": semester_start,
        "semester_end_date": semester_end,
        "levels_count": settings.get("levels_count", 5),
        "sections": settings.get("sections", ["أ", "ب", "ج"]),
        "attendance_late_minutes": settings.get("attendance_late_minutes", 15),
        "max_absence_percent": settings.get("max_absence_percent", 25.0),
        "logo_url": settings.get("logo_url"),
        "primary_color": settings.get("primary_color", "#1565c0"),
        "secondary_color": settings.get("secondary_color", "#ff9800"),
        "academic_years": settings.get("academic_years", []),
        "updated_at": settings.get("updated_at"),
    }

@api_router.put("/settings")
async def update_settings(data: SettingsUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث إعدادات النظام - للمدير فقط"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بتعديل الإعدادات")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    await db.settings.update_one(
        {"_id": "system_settings"},
        {"$set": update_data},
        upsert=True
    )
    
    return {"message": "تم تحديث الإعدادات بنجاح"}

@api_router.post("/settings/academic-years")
async def add_academic_year(year: str = Body(..., embed=True), current_user: dict = Depends(get_current_user)):
    """إضافة سنة أكاديمية جديدة"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # التحقق من صيغة السنة
    import re
    if not re.match(r'^\d{4}-\d{4}$', year):
        raise HTTPException(status_code=400, detail="صيغة السنة غير صحيحة. استخدم الصيغة: YYYY-YYYY")
    
    await db.settings.update_one(
        {"_id": "system_settings"},
        {"$addToSet": {"academic_years": year}},
        upsert=True
    )
    
    return {"message": f"تم إضافة السنة الأكاديمية {year} بنجاح"}

@api_router.delete("/settings/academic-years/{year}")
async def delete_academic_year(year: str, current_user: dict = Depends(get_current_user)):
    """حذف سنة أكاديمية"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    await db.settings.update_one(
        {"_id": "system_settings"},
        {"$pull": {"academic_years": year}}
    )
    
    return {"message": f"تم حذف السنة الأكاديمية {year}"}

@api_router.get("/settings/academic-years")
async def get_academic_years():
    """الحصول على قائمة السنوات الأكاديمية المتاحة"""
    settings = await db.settings.find_one({"_id": "system_settings"})
    if settings and settings.get("academic_years"):
        return {"years": sorted(settings["academic_years"], reverse=True)}
    
    # إرجاع سنوات افتراضية
    current_year = datetime.now().year
    years = [f"{current_year-1}-{current_year}", f"{current_year}-{current_year+1}"]
    return {"years": years}

@api_router.get("/settings/semesters")
async def get_semesters():
    """الحصول على قائمة الفصول الدراسية"""
    return {"semesters": ["الفصل الأول", "الفصل الثاني", "الفصل الصيفي"]}

@api_router.get("/my-scope")
async def get_my_scope(current_user: dict = Depends(get_current_user)):
    """
    الحصول على نطاق صلاحيات المستخدم الحالي
    يحدد ما يمكنه الوصول إليه (جامعة، كليات، أقسام، مقررات)
    """
    user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    scope = {
        "level": "none",  # university, faculty, department, course, none
        "university_access": False,
        "faculties": [],  # قائمة الكليات المسموح بها
        "departments": [],  # قائمة الأقسام المسموح بها
        "courses": [],  # قائمة المقررات المسموح بها
        "can_manage_settings": False,  # هل يمكنه إدارة الإعدادات العامة
    }
    
    # المدير له صلاحية كاملة
    if current_user["role"] == UserRole.ADMIN:
        scope["level"] = "university"
        scope["university_access"] = True
        scope["can_manage_settings"] = True
        # جلب كل الكليات
        faculties = await db.faculties.find({}).to_list(None)
        scope["faculties"] = [{"id": str(f["_id"]), "name": f["name"]} for f in faculties]
        return scope
    
    # التحقق من مستوى الصلاحية المحدد للمستخدم
    permission_level = user.get("permission_level", "")
    
    # التحقق من الكليات المخصصة
    faculty_ids = user.get("faculty_ids", [])
    if not faculty_ids and user.get("faculty_id"):
        faculty_ids = [user.get("faculty_id")]
    
    # التحقق من الأقسام المخصصة
    department_ids = user.get("department_ids", [])
    if not department_ids and user.get("department_id"):
        department_ids = [user.get("department_id")]
    
    # التحقق من المقررات المخصصة
    course_ids = user.get("course_ids", [])
    
    # استنتاج مستوى الصلاحية إذا لم يكن محدداً
    # الأولوية للأكثر تحديداً (قسم > كلية > جامعة)
    if not permission_level:
        if department_ids:
            permission_level = "department"
        elif faculty_ids:
            permission_level = "faculty"
    
    # تحديد مستوى الصلاحية بناءً على البيانات
    if permission_level == "university" or (user.get("permissions") and "manage_university" in user.get("permissions", [])):
        scope["level"] = "university"
        scope["university_access"] = True
        scope["can_manage_settings"] = True
        faculties = await db.faculties.find({}).to_list(None)
        scope["faculties"] = [{"id": str(f["_id"]), "name": f["name"]} for f in faculties]
    elif permission_level == "department" or (department_ids and not (permission_level == "faculty")):
        # مستوى القسم - الأكثر تحديداً
        scope["level"] = "department"
        # جلب الأقسام المحددة فقط
        for did in department_ids:
            try:
                dept = await db.departments.find_one({"_id": ObjectId(did)})
                if dept:
                    scope["departments"].append({
                        "id": str(dept["_id"]), 
                        "name": dept["name"],
                        "faculty_id": dept.get("faculty_id")
                    })
                    # إضافة الكلية التابع لها القسم (للعرض فقط، ليس للصلاحية الكاملة)
                    if dept.get("faculty_id"):
                        faculty = await db.faculties.find_one({"_id": ObjectId(dept["faculty_id"])})
                        if faculty and not any(f["id"] == str(faculty["_id"]) for f in scope["faculties"]):
                            scope["faculties"].append({"id": str(faculty["_id"]), "name": faculty["name"]})
            except:
                pass
    elif permission_level == "faculty" or faculty_ids:
        # مستوى الكلية
        scope["level"] = "faculty"
        # جلب الكليات المحددة فقط
        for fid in faculty_ids:
            try:
                faculty = await db.faculties.find_one({"_id": ObjectId(fid)})
                if faculty:
                    scope["faculties"].append({"id": str(faculty["_id"]), "name": faculty["name"]})
            except:
                pass
        # جلب الأقسام التابعة للكليات المحددة
        if scope["faculties"]:
            departments = await db.departments.find({"faculty_id": {"$in": faculty_ids}}).to_list(None)
            scope["departments"] = [{"id": str(d["_id"]), "name": d["name"], "faculty_id": d.get("faculty_id")} for d in departments]
    elif course_ids:
        scope["level"] = "course"
        # جلب المقررات المحددة فقط
        for cid in course_ids:
            try:
                course = await db.courses.find_one({"_id": ObjectId(cid)})
                if course:
                    scope["courses"].append({"id": str(course["_id"]), "name": course["name"]})
            except:
                pass
    
    return scope

@api_router.get("/my-institution")
async def get_my_institution(current_user: dict = Depends(get_current_user)):
    """
    الحصول على بيانات المؤسسة الخاصة بالمستخدم الحالي
    - المدير: يحصل على بيانات الجامعة
    - المستخدمين الآخرين: يحصلون على بيانات كليتهم
    """
    user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
    
    if current_user["role"] == UserRole.ADMIN:
        # المدير يرى بيانات الجامعة
        university = await db.university.find_one({})
        if university:
            return {
                "type": "university",
                "id": str(university["_id"]),
                "name": university.get("name", "جامعة الأحقاف"),
                "name_en": university.get("name_en", "Al-Ahgaff University"),
                "code": university.get("code", "AHGAFF"),
                "description": university.get("description"),
                "logo_url": university.get("logo_url"),
                "address": university.get("address"),
                "phone": university.get("phone"),
                "email": university.get("email"),
                "website": university.get("website"),
            }
        else:
            # إذا لم توجد جامعة، ارجع الإعدادات العامة
            settings = await db.settings.find_one({"_id": "system_settings"})
            return {
                "type": "settings",
                "name": settings.get("college_name", "جامعة الأحقاف") if settings else "جامعة الأحقاف",
                "name_en": settings.get("college_name_en", "Al-Ahgaff University") if settings else "Al-Ahgaff University",
            }
    else:
        # المستخدمون الآخرون يرون بيانات كليتهم
        faculty_id = user.get("faculty_id") if user else None
        
        if faculty_id:
            faculty = await db.faculties.find_one({"_id": ObjectId(faculty_id)})
            if faculty:
                return {
                    "type": "faculty",
                    "id": str(faculty["_id"]),
                    "name": faculty.get("name"),
                    "name_en": faculty.get("name_en"),
                    "code": faculty.get("code"),
                    "description": faculty.get("description"),
                    "levels_count": faculty.get("levels_count", 5),
                    "sections": faculty.get("sections", ["أ", "ب", "ج"]),
                    "attendance_late_minutes": faculty.get("attendance_late_minutes", 15),
                    "max_absence_percent": faculty.get("max_absence_percent", 25),
                }
        
        # إذا لم يكن مرتبطاً بكلية، ارجع الإعدادات العامة
        settings = await db.settings.find_one({"_id": "system_settings"})
        return {
            "type": "settings",
            "name": settings.get("college_name", "النظام") if settings else "النظام",
            "name_en": settings.get("college_name_en") if settings else None,
            "levels_count": settings.get("levels_count", 5) if settings else 5,
            "sections": settings.get("sections", ["أ", "ب", "ج"]) if settings else ["أ", "ب", "ج"],
            "attendance_late_minutes": settings.get("attendance_late_minutes", 15) if settings else 15,
            "max_absence_percent": settings.get("max_absence_percent", 25) if settings else 25,
        }

@api_router.put("/my-institution")
async def update_my_institution(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """
    تحديث بيانات المؤسسة الخاصة بالمستخدم
    - المدير: يمكنه تحديث بيانات الجامعة
    - مستخدم لديه صلاحية: يمكنه تحديث بيانات كليته
    """
    user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
    
    if current_user["role"] == UserRole.ADMIN:
        # المدير يحدث بيانات الجامعة
        update_data = {k: v for k, v in data.items() if v is not None and k != "type"}
        update_data["updated_at"] = datetime.utcnow()
        
        await db.university.update_one(
            {},
            {"$set": update_data},
            upsert=True
        )
        return {"message": "تم تحديث بيانات الجامعة بنجاح"}
    else:
        # التحقق من صلاحية التحديث
        faculty_id = user.get("faculty_id") if user else None
        if not faculty_id:
            raise HTTPException(status_code=403, detail="أنت غير مرتبط بكلية")
        
        # تحديث بيانات الكلية (الإعدادات الخاصة فقط)
        allowed_fields = ["levels_count", "sections", "attendance_late_minutes", "max_absence_percent", "description"]
        update_data = {k: v for k, v in data.items() if k in allowed_fields and v is not None}
        
        if update_data:
            update_data["updated_at"] = datetime.utcnow()
            await db.faculties.update_one(
                {"_id": ObjectId(faculty_id)},
                {"$set": update_data}
            )
        
        return {"message": "تم تحديث إعدادات الكلية بنجاح"}

@api_router.get("/")
async def root():
    return {"message": "نظام حضور كلية الشريعة والقانون", "version": "1.0"}

# ==================== APIs إدارة الصلاحيات المتقدمة ====================

@api_router.get("/permissions/available")
async def get_available_permissions(current_user: dict = Depends(get_current_user)):
    """الحصول على قائمة الصلاحيات المتاحة"""
    return {
        "permissions": ALL_PERMISSIONS,
        "scope_types": [
            {"key": "global", "label": "عامة (كل النظام)"},
            {"key": "department", "label": "قسم معين"},
            {"key": "course", "label": "مقرر معين"},
        ],
        "roles": [
            {"key": UserRole.ADMIN, "label": "مدير النظام"},
            {"key": UserRole.TEACHER, "label": "معلم"},
            {"key": UserRole.EMPLOYEE, "label": "موظف"},
            {"key": UserRole.STUDENT, "label": "طالب"},
        ]
    }

@api_router.get("/users/{user_id}/permissions")
async def get_user_permissions(user_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على صلاحيات مستخدم معين"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بعرض صلاحيات المستخدمين")
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    # جلب الصلاحيات المخصصة من جدول user_permissions
    user_perms = await db.user_permissions.find({"user_id": user_id}).to_list(100)
    
    scopes = []
    for perm in user_perms:
        scopes.append({
            "id": str(perm["_id"]),
            "scope_type": perm["scope_type"],
            "scope_id": perm.get("scope_id"),
            "scope_name": perm.get("scope_name", ""),
            "permissions": perm["permissions"]
        })
    
    # إذا لم توجد صلاحيات مخصصة، نرجع الصلاحيات الافتراضية للدور
    if not scopes:
        default_perms = DEFAULT_PERMISSIONS.get(user["role"], [])
        scopes.append({
            "id": None,
            "scope_type": "global",
            "scope_id": None,
            "scope_name": "افتراضي (حسب الدور)",
            "permissions": default_perms
        })
    
    return {
        "user_id": user_id,
        "user_name": user["full_name"],
        "role": user["role"],
        "scopes": scopes
    }

@api_router.post("/users/{user_id}/permissions")
async def add_user_permission(
    user_id: str, 
    permission_data: UserPermissionScope,
    current_user: dict = Depends(get_current_user)
):
    """إضافة صلاحية لمستخدم"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بتعديل الصلاحيات")
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    # الحصول على اسم النطاق
    scope_name = ""
    if permission_data.scope_type == "department" and permission_data.scope_id:
        dept = await db.departments.find_one({"_id": ObjectId(permission_data.scope_id)})
        scope_name = dept["name"] if dept else ""
    elif permission_data.scope_type == "course" and permission_data.scope_id:
        course = await db.courses.find_one({"_id": ObjectId(permission_data.scope_id)})
        scope_name = course["name"] if course else ""
    
    # إنشاء سجل الصلاحية
    perm_doc = {
        "user_id": user_id,
        "scope_type": permission_data.scope_type,
        "scope_id": permission_data.scope_id,
        "scope_name": scope_name,
        "permissions": permission_data.permissions,
        "created_at": datetime.utcnow(),
        "created_by": current_user["id"]
    }
    
    # التحقق من عدم وجود تكرار
    existing = await db.user_permissions.find_one({
        "user_id": user_id,
        "scope_type": permission_data.scope_type,
        "scope_id": permission_data.scope_id
    })
    
    if existing:
        # تحديث الصلاحيات الموجودة
        await db.user_permissions.update_one(
            {"_id": existing["_id"]},
            {"$set": {"permissions": permission_data.permissions, "updated_at": datetime.utcnow()}}
        )
        return {"message": "تم تحديث الصلاحيات بنجاح", "id": str(existing["_id"])}
    else:
        result = await db.user_permissions.insert_one(perm_doc)
        return {"message": "تمت إضافة الصلاحية بنجاح", "id": str(result.inserted_id)}

@api_router.delete("/users/{user_id}/permissions/{permission_id}")
async def delete_user_permission(
    user_id: str, 
    permission_id: str,
    current_user: dict = Depends(get_current_user)
):
    """حذف صلاحية من مستخدم"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بحذف الصلاحيات")
    
    result = await db.user_permissions.delete_one({
        "_id": ObjectId(permission_id),
        "user_id": user_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الصلاحية غير موجودة")
    
    return {"message": "تم حذف الصلاحية بنجاح"}

@api_router.put("/users/{user_id}/permissions")
async def update_all_user_permissions(
    user_id: str,
    permissions_data: UserPermissionsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """تحديث جميع صلاحيات المستخدم"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بتعديل الصلاحيات")
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    # حذف الصلاحيات القديمة
    await db.user_permissions.delete_many({"user_id": user_id})
    
    # إضافة الصلاحيات الجديدة
    for scope in permissions_data.scopes:
        scope_name = ""
        if scope.scope_type == "department" and scope.scope_id:
            dept = await db.departments.find_one({"_id": ObjectId(scope.scope_id)})
            scope_name = dept["name"] if dept else ""
        elif scope.scope_type == "course" and scope.scope_id:
            course = await db.courses.find_one({"_id": ObjectId(scope.scope_id)})
            scope_name = course["name"] if course else ""
        
        perm_doc = {
            "user_id": user_id,
            "scope_type": scope.scope_type,
            "scope_id": scope.scope_id,
            "scope_name": scope_name,
            "permissions": scope.permissions,
            "created_at": datetime.utcnow(),
            "created_by": current_user["id"]
        }
        await db.user_permissions.insert_one(perm_doc)
    
    return {"message": "تم تحديث الصلاحيات بنجاح"}

# دالة مساعدة للتحقق من صلاحية المستخدم على نطاق معين
async def check_user_permission(user_id: str, permission: str, scope_type: str = None, scope_id: str = None) -> bool:
    """التحقق من صلاحية المستخدم"""
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        return False
    
    # المدير لديه كل الصلاحيات
    if user["role"] == UserRole.ADMIN:
        return True
    
    # البحث عن صلاحيات مخصصة
    query = {"user_id": user_id}
    user_perms = await db.user_permissions.find(query).to_list(100)
    
    if user_perms:
        for perm in user_perms:
            # صلاحية عامة
            if perm["scope_type"] == "global" and permission in perm["permissions"]:
                return True
            # صلاحية على نطاق معين
            if scope_type and scope_id:
                if perm["scope_type"] == scope_type and perm.get("scope_id") == scope_id:
                    if permission in perm["permissions"]:
                        return True
    else:
        # استخدام الصلاحيات الافتراضية للدور
        default_perms = DEFAULT_PERMISSIONS.get(user["role"], [])
        return permission in default_perms
    
    return False

# ==================== University APIs (واجهات الجامعة) ====================

@api_router.get("/university")
async def get_university(current_user: dict = Depends(get_current_user)):
    """جلب بيانات الجامعة"""
    university = await db.university.find_one()
    if not university:
        return None
    
    faculties_count = await db.faculties.count_documents({})
    
    return {
        "id": str(university["_id"]),
        "name": university.get("name", ""),
        "code": university.get("code", ""),
        "description": university.get("description", ""),
        "logo_url": university.get("logo_url"),
        "address": university.get("address"),
        "phone": university.get("phone"),
        "email": university.get("email"),
        "website": university.get("website"),
        "faculties_count": faculties_count,
        "created_at": university.get("created_at", datetime.utcnow())
    }

@api_router.post("/university")
async def create_or_update_university(
    university_data: UniversityCreate,
    current_user: dict = Depends(get_current_user)
):
    """إنشاء أو تحديث بيانات الجامعة"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بتعديل بيانات الجامعة")
    
    existing = await db.university.find_one()
    
    university_doc = {
        "name": university_data.name,
        "code": university_data.code,
        "description": university_data.description,
        "logo_url": university_data.logo_url,
        "address": university_data.address,
        "phone": university_data.phone,
        "email": university_data.email,
        "website": university_data.website,
        "updated_at": datetime.utcnow()
    }
    
    if existing:
        await db.university.update_one(
            {"_id": existing["_id"]},
            {"$set": university_doc}
        )
        university_id = str(existing["_id"])
        action = "update_university"
    else:
        university_doc["created_at"] = datetime.utcnow()
        result = await db.university.insert_one(university_doc)
        university_id = str(result.inserted_id)
        action = "create_university"
    
    # تسجيل النشاط
    await log_activity(
        user=current_user,
        action=action,
        entity_type="university",
        entity_id=university_id,
        entity_name=university_data.name
    )
    
    return {"message": "تم حفظ بيانات الجامعة بنجاح", "id": university_id}

# ==================== Faculty APIs (واجهات الكليات) ====================

@api_router.get("/faculties")
async def get_faculties(current_user: dict = Depends(get_current_user)):
    """جلب قائمة الكليات"""
    query = {}
    
    # تطبيق scoping للعميد - يرى فقط كليته
    if current_user.get("role") == "dean":
        user_data = await db.users.find_one({"_id": ObjectId(current_user["id"])})
        if user_data and user_data.get("faculty_id"):
            query["_id"] = ObjectId(user_data["faculty_id"])
    # تطبيق scoping لمدير التسجيل/موظف التسجيل
    elif current_user.get("role") in ["registration_manager", "registrar"]:
        user_data = await db.users.find_one({"_id": ObjectId(current_user["id"])})
        if user_data and user_data.get("faculty_id"):
            query["_id"] = ObjectId(user_data["faculty_id"])
    
    faculties = await db.faculties.find(query).to_list(100)
    result = []
    
    for faculty in faculties:
        departments_count = await db.departments.count_documents({"faculty_id": str(faculty["_id"])})
        dean_name = None
        if faculty.get("dean_id"):
            dean = await db.users.find_one({"_id": ObjectId(faculty["dean_id"])})
            dean_name = dean.get("full_name") if dean else None
        
        result.append({
            "id": str(faculty["_id"]),
            "name": faculty["name"],
            "code": faculty["code"],
            "description": faculty.get("description", ""),
            "dean_id": faculty.get("dean_id"),
            "dean_name": dean_name,
            "departments_count": departments_count,
            "created_at": faculty.get("created_at", datetime.utcnow())
        })
    
    return result

@api_router.get("/faculties/{faculty_id}")
async def get_faculty(faculty_id: str, current_user: dict = Depends(get_current_user)):
    """جلب بيانات كلية محددة مع إعداداتها"""
    faculty = await db.faculties.find_one({"_id": ObjectId(faculty_id)})
    if not faculty:
        raise HTTPException(status_code=404, detail="الكلية غير موجودة")
    
    departments_count = await db.departments.count_documents({"faculty_id": faculty_id})
    dean_name = None
    if faculty.get("dean_id"):
        dean = await db.users.find_one({"_id": ObjectId(faculty["dean_id"])})
        dean_name = dean.get("full_name") if dean else None
    
    return {
        "id": str(faculty["_id"]),
        "name": faculty["name"],
        "code": faculty["code"],
        "description": faculty.get("description", ""),
        "dean_id": faculty.get("dean_id"),
        "dean_name": dean_name,
        "departments_count": departments_count,
        "created_at": faculty.get("created_at", datetime.utcnow()),
        # إعدادات الكلية
        "levels_count": faculty.get("levels_count", 5),
        "sections": faculty.get("sections", ["أ", "ب", "ج"]),
        "attendance_late_minutes": faculty.get("attendance_late_minutes", 15),
        "max_absence_percent": faculty.get("max_absence_percent", 25),
        "primary_color": faculty.get("primary_color", "#1565c0"),
        "secondary_color": faculty.get("secondary_color", "#ff9800"),
        # معلومات التواصل
        "phone": faculty.get("phone", ""),
        "whatsapp": faculty.get("whatsapp", ""),
        "email": faculty.get("email", ""),
    }

@api_router.put("/faculties/{faculty_id}/settings")
async def update_faculty_settings(
    faculty_id: str,
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user)
):
    """تحديث إعدادات كلية"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بتعديل إعدادات الكليات")
    
    faculty = await db.faculties.find_one({"_id": ObjectId(faculty_id)})
    if not faculty:
        raise HTTPException(status_code=404, detail="الكلية غير موجودة")
    
    # الحقول المسموح تحديثها
    allowed_fields = [
        "levels_count", "sections", "attendance_late_minutes", "max_absence_percent",
        "primary_color", "secondary_color", "phone", "whatsapp", "email"
    ]
    
    update_data = {k: v for k, v in data.items() if k in allowed_fields and v is not None}
    
    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        await db.faculties.update_one(
            {"_id": ObjectId(faculty_id)},
            {"$set": update_data}
        )
    
    # تسجيل النشاط
    await log_activity(
        user=current_user,
        action="update_faculty_settings",
        entity_type="faculty",
        entity_id=faculty_id,
        entity_name=faculty["name"]
    )
    
    return {"message": "تم تحديث إعدادات الكلية بنجاح"}

@api_router.post("/faculties")
async def create_faculty(
    faculty_data: FacultyCreate,
    current_user: dict = Depends(get_current_user)
):
    """إنشاء كلية جديدة"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بإنشاء كليات")
    
    # التحقق من عدم وجود كلية بنفس الكود
    existing = await db.faculties.find_one({"code": faculty_data.code})
    if existing:
        raise HTTPException(status_code=400, detail="يوجد كلية بنفس الكود")
    
    faculty_doc = {
        "name": faculty_data.name,
        "code": faculty_data.code,
        "description": faculty_data.description,
        "dean_id": faculty_data.dean_id,
        "created_at": datetime.utcnow()
    }
    
    result = await db.faculties.insert_one(faculty_doc)
    faculty_id = str(result.inserted_id)
    
    # تسجيل النشاط
    await log_activity(
        user=current_user,
        action="create_faculty",
        entity_type="faculty",
        entity_id=faculty_id,
        entity_name=faculty_data.name
    )
    
    return {"message": "تم إنشاء الكلية بنجاح", "id": faculty_id}

@api_router.put("/faculties/{faculty_id}")
async def update_faculty(
    faculty_id: str,
    faculty_data: FacultyUpdate,
    current_user: dict = Depends(get_current_user)
):
    """تحديث بيانات كلية"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بتعديل الكليات")
    
    faculty = await db.faculties.find_one({"_id": ObjectId(faculty_id)})
    if not faculty:
        raise HTTPException(status_code=404, detail="الكلية غير موجودة")
    
    update_data = {k: v for k, v in faculty_data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    await db.faculties.update_one(
        {"_id": ObjectId(faculty_id)},
        {"$set": update_data}
    )
    
    # تسجيل النشاط
    await log_activity(
        user=current_user,
        action="update_faculty",
        entity_type="faculty",
        entity_id=faculty_id,
        entity_name=faculty.get("name")
    )
    
    return {"message": "تم تحديث الكلية بنجاح"}

@api_router.delete("/faculties/{faculty_id}")
async def delete_faculty(
    faculty_id: str,
    current_user: dict = Depends(get_current_user)
):
    """حذف كلية"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بحذف الكليات")
    
    faculty = await db.faculties.find_one({"_id": ObjectId(faculty_id)})
    if not faculty:
        raise HTTPException(status_code=404, detail="الكلية غير موجودة")
    
    # التحقق من عدم وجود أقسام مرتبطة
    departments_count = await db.departments.count_documents({"faculty_id": faculty_id})
    if departments_count > 0:
        raise HTTPException(status_code=400, detail=f"لا يمكن حذف الكلية - يوجد {departments_count} قسم مرتبط بها")
    
    await db.faculties.delete_one({"_id": ObjectId(faculty_id)})
    
    # تسجيل النشاط
    await log_activity(
        user=current_user,
        action="delete_faculty",
        entity_type="faculty",
        entity_id=faculty_id,
        entity_name=faculty.get("name")
    )
    
    return {"message": "تم حذف الكلية بنجاح"}

# ==================== Activity Logs APIs (واجهات سجل الأنشطة) ====================

@api_router.get("/activity-logs")
async def get_activity_logs(
    page: int = 1,
    limit: int = 50,
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    faculty_id: Optional[str] = None,
    department_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب سجلات الأنشطة"""
    # التحقق من الصلاحية
    if current_user["role"] not in [UserRole.ADMIN, "dean", "department_head"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك بعرض سجلات الأنشطة")
    
    query = {}
    
    # فلترة حسب الصلاحيات
    if current_user["role"] == "dean" and current_user.get("faculty_id"):
        query["faculty_id"] = current_user["faculty_id"]
    elif current_user["role"] == "department_head" and current_user.get("department_id"):
        query["department_id"] = current_user["department_id"]
    
    # فلترة إضافية
    if user_id:
        query["user_id"] = user_id
    if action:
        query["action"] = action
    if entity_type:
        query["entity_type"] = entity_type
    if faculty_id and current_user["role"] == UserRole.ADMIN:
        query["faculty_id"] = faculty_id
    if department_id:
        query["department_id"] = department_id
    
    # فلترة بالتاريخ
    if from_date or to_date:
        query["timestamp"] = {}
        if from_date:
            query["timestamp"]["$gte"] = datetime.fromisoformat(from_date)
        if to_date:
            query["timestamp"]["$lte"] = datetime.fromisoformat(to_date)
    
    # حساب العدد الكلي
    total = await db.activity_logs.count_documents(query)
    
    # جلب السجلات
    skip = (page - 1) * limit
    logs = await db.activity_logs.find(query).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    
    result = []
    for log in logs:
        result.append({
            "id": str(log["_id"]),
            "user_id": log.get("user_id"),
            "username": log.get("username"),
            "user_role": log.get("user_role"),
            "action": log.get("action"),
            "action_ar": log.get("action_ar"),
            "entity_type": log.get("entity_type"),
            "entity_id": log.get("entity_id"),
            "entity_name": log.get("entity_name"),
            "details": log.get("details"),
            "ip_address": log.get("ip_address"),
            "faculty_id": log.get("faculty_id"),
            "department_id": log.get("department_id"),
            "timestamp": log.get("timestamp")
        })
    
    return {
        "logs": result,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }

@api_router.get("/activity-logs/stats")
async def get_activity_logs_stats(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """إحصائيات سجلات الأنشطة"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك بعرض الإحصائيات")
    
    query = {}
    if from_date or to_date:
        query["timestamp"] = {}
        if from_date:
            query["timestamp"]["$gte"] = datetime.fromisoformat(from_date)
        if to_date:
            query["timestamp"]["$lte"] = datetime.fromisoformat(to_date)
    
    # إحصائيات حسب نوع النشاط
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$action", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    
    by_action = await db.activity_logs.aggregate(pipeline).to_list(100)
    
    # إحصائيات حسب المستخدم
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$username", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    
    by_user = await db.activity_logs.aggregate(pipeline).to_list(10)
    
    # إحصائيات حسب اليوم
    pipeline = [
        {"$match": query},
        {
            "$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"_id": -1}},
        {"$limit": 30}
    ]
    
    by_day = await db.activity_logs.aggregate(pipeline).to_list(30)
    
    total = await db.activity_logs.count_documents(query)
    
    return {
        "total": total,
        "by_action": [{"action": a["_id"], "action_ar": ACTION_TRANSLATIONS.get(a["_id"], a["_id"]), "count": a["count"]} for a in by_action],
        "by_user": [{"username": u["_id"], "count": u["count"]} for u in by_user],
        "by_day": [{"date": d["_id"], "count": d["count"]} for d in by_day]
    }

@api_router.post("/activity-logs/record-view")
async def record_page_view(
    page_name: str = Body(...),
    page_path: str = Body(...),
    current_user: dict = Depends(get_current_user)
):
    """تسجيل مشاهدة صفحة"""
    await log_activity(
        user=current_user,
        action="view_page",
        entity_type="page",
        entity_name=page_name,
        details={"path": page_path}
    )
    return {"message": "تم التسجيل"}

# Include the router in the main app
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
