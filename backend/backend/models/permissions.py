"""
نماذج الصلاحيات - Permissions Models
"""
from typing import List

class UserRole:
    ADMIN = "admin"
    TEACHER = "teacher"
    STUDENT = "student"
    EMPLOYEE = "employee"

class Permission:
    # صلاحيات الأقسام
    MANAGE_DEPARTMENTS = "manage_departments"
    VIEW_DEPARTMENTS = "view_departments"
    ADD_DEPARTMENT = "add_department"
    EDIT_DEPARTMENT = "edit_department"
    DELETE_DEPARTMENT = "delete_department"
    
    # صلاحيات المقررات
    MANAGE_COURSES = "manage_courses"
    VIEW_COURSES = "view_courses"
    ADD_COURSE = "add_course"
    EDIT_COURSE = "edit_course"
    DELETE_COURSE = "delete_course"
    
    # صلاحيات الطلاب
    MANAGE_STUDENTS = "manage_students"
    VIEW_STUDENTS = "view_students"
    ADD_STUDENT = "add_student"
    EDIT_STUDENT = "edit_student"
    DELETE_STUDENT = "delete_student"
    IMPORT_STUDENTS = "import_students"
    
    # صلاحيات المعلمين
    MANAGE_TEACHERS = "manage_teachers"
    VIEW_TEACHERS = "view_teachers"
    ADD_TEACHER = "add_teacher"
    EDIT_TEACHER = "edit_teacher"
    DELETE_TEACHER = "delete_teacher"
    
    # صلاحيات المستخدمين
    MANAGE_USERS = "manage_users"
    VIEW_USERS = "view_users"
    ADD_USER = "add_user"
    EDIT_USER = "edit_user"
    DELETE_USER = "delete_user"
    RESET_PASSWORD = "reset_password"
    
    # صلاحيات الكليات
    MANAGE_FACULTIES = "manage_faculties"
    VIEW_FACULTIES = "view_faculties"
    ADD_FACULTY = "add_faculty"
    EDIT_FACULTY = "edit_faculty"
    DELETE_FACULTY = "delete_faculty"
    
    # صلاحيات المحاضرات
    MANAGE_LECTURES = "manage_lectures"
    VIEW_LECTURES = "view_lectures"
    ADD_LECTURE = "add_lecture"
    EDIT_LECTURE = "edit_lecture"
    DELETE_LECTURE = "delete_lecture"
    OVERRIDE_LECTURE_STATUS = "override_lecture_status"
    
    # صلاحيات التسجيل
    MANAGE_ENROLLMENTS = "manage_enrollments"
    VIEW_ENROLLMENTS = "view_enrollments"
    ADD_ENROLLMENT = "add_enrollment"
    DELETE_ENROLLMENT = "delete_enrollment"
    
    # صلاحيات الحضور
    RECORD_ATTENDANCE = "record_attendance"
    TAKE_ATTENDANCE = "take_attendance"
    VIEW_ATTENDANCE = "view_attendance"
    EDIT_ATTENDANCE = "edit_attendance"
    
    # صلاحيات الإشعارات
    SEND_NOTIFICATIONS = "send_notifications"
    MANAGE_NOTIFICATIONS = "manage_notifications"
    
    # صلاحيات التقارير العامة
    VIEW_REPORTS = "view_reports"
    VIEW_STATISTICS = "view_statistics"
    EXPORT_REPORTS = "export_reports"
    IMPORT_DATA = "import_data"
    
    # صلاحيات التقارير الفردية
    REPORT_ATTENDANCE_OVERVIEW = "report_attendance_overview"
    REPORT_ABSENT_STUDENTS = "report_absent_students"
    REPORT_WARNINGS = "report_warnings"
    REPORT_DAILY = "report_daily"
    REPORT_STUDENT = "report_student"
    REPORT_COURSE = "report_course"
    REPORT_TEACHER_WORKLOAD = "report_teacher_workload"
    REPORT_LESSON_COMPLETION = "report_lesson_completion"
    
    # صلاحيات الأدوار والإعدادات
    MANAGE_ROLES = "manage_roles"
    MANAGE_SETTINGS = "manage_settings"
    MANAGE_SEMESTERS = "manage_semesters"

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
        Permission.REPORT_ATTENDANCE_OVERVIEW,
        Permission.REPORT_ABSENT_STUDENTS,
        Permission.REPORT_WARNINGS,
        Permission.REPORT_DAILY,
        Permission.REPORT_STUDENT,
        Permission.REPORT_COURSE,
        Permission.REPORT_TEACHER_WORKLOAD,
        Permission.REPORT_LESSON_COMPLETION,
        Permission.SEND_NOTIFICATIONS,
        Permission.MANAGE_NOTIFICATIONS,
    ],
    UserRole.TEACHER: [
        Permission.RECORD_ATTENDANCE,
        Permission.VIEW_ATTENDANCE,
        Permission.EXPORT_REPORTS,
        Permission.MANAGE_LECTURES,
        Permission.VIEW_LECTURES,
        Permission.REPORT_ABSENT_STUDENTS,
        Permission.REPORT_COURSE,
        Permission.REPORT_TEACHER_WORKLOAD,
    ],
    UserRole.EMPLOYEE: [
        Permission.MANAGE_STUDENTS,
        Permission.VIEW_ATTENDANCE,
        Permission.VIEW_REPORTS,
        Permission.EXPORT_REPORTS,
        Permission.IMPORT_DATA,
        Permission.VIEW_LECTURES,
        Permission.REPORT_STUDENT,
        Permission.REPORT_ABSENT_STUDENTS,
        Permission.REPORT_WARNINGS,
    ],
    UserRole.STUDENT: [
        Permission.VIEW_ATTENDANCE,
        Permission.VIEW_LECTURES,
        Permission.REPORT_STUDENT,
    ],
}

# قائمة جميع الصلاحيات المتاحة للعرض في الواجهة
ALL_PERMISSIONS = [
    {"key": Permission.MANAGE_DEPARTMENTS, "label": "إدارة كاملة للأقسام", "category": "الأقسام"},
    {"key": Permission.VIEW_DEPARTMENTS, "label": "عرض الأقسام", "category": "الأقسام"},
    {"key": Permission.ADD_DEPARTMENT, "label": "إضافة قسم", "category": "الأقسام"},
    {"key": Permission.EDIT_DEPARTMENT, "label": "تعديل قسم", "category": "الأقسام"},
    {"key": Permission.DELETE_DEPARTMENT, "label": "حذف قسم", "category": "الأقسام"},
    {"key": Permission.MANAGE_COURSES, "label": "إدارة كاملة للمقررات", "category": "المقررات"},
    {"key": Permission.VIEW_COURSES, "label": "عرض المقررات", "category": "المقررات"},
    {"key": Permission.ADD_COURSE, "label": "إضافة مقرر", "category": "المقررات"},
    {"key": Permission.EDIT_COURSE, "label": "تعديل مقرر", "category": "المقررات"},
    {"key": Permission.DELETE_COURSE, "label": "حذف مقرر", "category": "المقررات"},
    {"key": Permission.MANAGE_STUDENTS, "label": "إدارة كاملة للطلاب", "category": "الطلاب"},
    {"key": Permission.VIEW_STUDENTS, "label": "عرض الطلاب", "category": "الطلاب"},
    {"key": Permission.ADD_STUDENT, "label": "إضافة طالب", "category": "الطلاب"},
    {"key": Permission.EDIT_STUDENT, "label": "تعديل طالب", "category": "الطلاب"},
    {"key": Permission.DELETE_STUDENT, "label": "حذف طالب", "category": "الطلاب"},
    {"key": Permission.IMPORT_STUDENTS, "label": "استيراد طلاب من Excel", "category": "الطلاب"},
    {"key": Permission.MANAGE_TEACHERS, "label": "إدارة كاملة للمعلمين", "category": "المعلمين"},
    {"key": Permission.VIEW_TEACHERS, "label": "عرض المعلمين", "category": "المعلمين"},
    {"key": Permission.ADD_TEACHER, "label": "إضافة معلم", "category": "المعلمين"},
    {"key": Permission.EDIT_TEACHER, "label": "تعديل معلم", "category": "المعلمين"},
    {"key": Permission.DELETE_TEACHER, "label": "حذف معلم", "category": "المعلمين"},
    {"key": Permission.MANAGE_USERS, "label": "إدارة كاملة للمستخدمين", "category": "المستخدمين"},
    {"key": Permission.VIEW_USERS, "label": "عرض المستخدمين", "category": "المستخدمين"},
    {"key": Permission.ADD_USER, "label": "إضافة مستخدم", "category": "المستخدمين"},
    {"key": Permission.EDIT_USER, "label": "تعديل مستخدم", "category": "المستخدمين"},
    {"key": Permission.DELETE_USER, "label": "حذف مستخدم", "category": "المستخدمين"},
    {"key": Permission.RESET_PASSWORD, "label": "إعادة تعيين كلمة المرور", "category": "المستخدمين"},
    {"key": Permission.MANAGE_FACULTIES, "label": "إدارة كاملة للكليات", "category": "الكليات"},
    {"key": Permission.VIEW_FACULTIES, "label": "عرض الكليات", "category": "الكليات"},
    {"key": Permission.ADD_FACULTY, "label": "إضافة كلية", "category": "الكليات"},
    {"key": Permission.EDIT_FACULTY, "label": "تعديل كلية", "category": "الكليات"},
    {"key": Permission.DELETE_FACULTY, "label": "حذف كلية", "category": "الكليات"},
    {"key": Permission.MANAGE_LECTURES, "label": "إدارة كاملة للمحاضرات", "category": "المحاضرات"},
    {"key": Permission.VIEW_LECTURES, "label": "عرض المحاضرات", "category": "المحاضرات"},
    {"key": Permission.ADD_LECTURE, "label": "إضافة محاضرة", "category": "المحاضرات"},
    {"key": Permission.EDIT_LECTURE, "label": "تعديل محاضرة", "category": "المحاضرات"},
    {"key": Permission.DELETE_LECTURE, "label": "حذف محاضرة", "category": "المحاضرات"},
    {"key": Permission.OVERRIDE_LECTURE_STATUS, "label": "تغيير حالة المحاضرة (غائب/مجدولة/منعقدة)", "category": "المحاضرات"},
    {"key": Permission.MANAGE_ENROLLMENTS, "label": "إدارة كاملة للتسجيل", "category": "التسجيل"},
    {"key": Permission.VIEW_ENROLLMENTS, "label": "عرض التسجيلات", "category": "التسجيل"},
    {"key": Permission.ADD_ENROLLMENT, "label": "تسجيل طالب في مقرر", "category": "التسجيل"},
    {"key": Permission.DELETE_ENROLLMENT, "label": "إلغاء تسجيل طالب", "category": "التسجيل"},
    {"key": Permission.RECORD_ATTENDANCE, "label": "تسجيل الحضور", "category": "الحضور"},
    {"key": Permission.TAKE_ATTENDANCE, "label": "أخذ الحضور", "category": "الحضور"},
    {"key": Permission.VIEW_ATTENDANCE, "label": "عرض الحضور", "category": "الحضور"},
    {"key": Permission.EDIT_ATTENDANCE, "label": "تعديل الحضور", "category": "الحضور"},
    {"key": Permission.SEND_NOTIFICATIONS, "label": "إرسال إشعارات وإنذارات للطلاب", "category": "الإشعارات"},
    {"key": Permission.VIEW_REPORTS, "label": "عرض جميع التقارير", "category": "التقارير"},
    {"key": Permission.VIEW_STATISTICS, "label": "عرض الإحصائيات", "category": "التقارير"},
    {"key": Permission.EXPORT_REPORTS, "label": "تصدير التقارير", "category": "التقارير"},
    {"key": Permission.IMPORT_DATA, "label": "استيراد البيانات", "category": "التقارير"},
    {"key": Permission.REPORT_ATTENDANCE_OVERVIEW, "label": "تقرير الحضور الشامل", "category": "التقارير الفردية"},
    {"key": Permission.REPORT_ABSENT_STUDENTS, "label": "تقرير الطلاب المتغيبين", "category": "التقارير الفردية"},
    {"key": Permission.REPORT_WARNINGS, "label": "تقرير الإنذارات والحرمان", "category": "التقارير الفردية"},
    {"key": Permission.REPORT_DAILY, "label": "التقرير اليومي", "category": "التقارير الفردية"},
    {"key": Permission.REPORT_STUDENT, "label": "تقرير طالب", "category": "التقارير الفردية"},
    {"key": Permission.REPORT_COURSE, "label": "تقرير مقرر", "category": "التقارير الفردية"},
    {"key": Permission.REPORT_TEACHER_WORKLOAD, "label": "تقرير نصاب المدرس", "category": "التقارير الفردية"},
    {"key": Permission.REPORT_LESSON_COMPLETION, "label": "تقرير إنجاز الدروس", "category": "التقارير الفردية"},
    {"key": Permission.MANAGE_ROLES, "label": "إدارة الأدوار", "category": "النظام"},
    {"key": Permission.MANAGE_SETTINGS, "label": "إدارة الإعدادات", "category": "النظام"},
    {"key": Permission.MANAGE_SEMESTERS, "label": "إدارة الفصول الدراسية", "category": "النظام"},
]

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
        Permission.EDIT_LECTURE, Permission.DELETE_LECTURE,
        Permission.OVERRIDE_LECTURE_STATUS
    ],
    Permission.MANAGE_ENROLLMENTS: [
        Permission.VIEW_ENROLLMENTS, Permission.ADD_ENROLLMENT, Permission.DELETE_ENROLLMENT
    ],
}

class ScopeType:
    """نوع نطاق الصلاحية"""
    GLOBAL = "global"
    DEPARTMENT = "department"
    COURSE = "course"

def user_has_permission(user_permissions: List[str], required_permission: str) -> bool:
    """التحقق من أن المستخدم لديه صلاحية معينة (مع دعم الصلاحيات الكاملة)"""
    if required_permission in user_permissions:
        return True
    
    for full_perm, sub_perms in FULL_PERMISSION_MAPPING.items():
        if full_perm in user_permissions and required_permission in sub_perms:
            return True
    
    return False
