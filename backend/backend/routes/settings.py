"""
Settings Routes - مسارات الإعدادات
"""
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import List

from models.settings import SystemSettings, SettingsUpdate
from .deps import security

router = APIRouter(tags=["الإعدادات"])
db = None
def set_db(database):
    global db
    db = database

# ==================== Settings Routes (الإعدادات العامة) ====================

@router.get("/settings")
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

@router.put("/settings")
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

@router.post("/settings/academic-years")
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

@router.delete("/settings/academic-years/{year}")
async def delete_academic_year(year: str, current_user: dict = Depends(get_current_user)):
    """حذف سنة أكاديمية"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    await db.settings.update_one(
        {"_id": "system_settings"},
        {"$pull": {"academic_years": year}}
    )
    
    return {"message": f"تم حذف السنة الأكاديمية {year}"}

@router.get("/settings/academic-years")
async def get_academic_years():
    """الحصول على قائمة السنوات الأكاديمية المتاحة"""
    settings = await db.settings.find_one({"_id": "system_settings"})
    if settings and settings.get("academic_years"):
        return {"years": sorted(settings["academic_years"], reverse=True)}
    
    # إرجاع سنوات افتراضية
    current_year = datetime.now().year
    years = [f"{current_year-1}-{current_year}", f"{current_year}-{current_year+1}"]
    return {"years": years}

@router.get("/settings/semesters")
async def get_semesters():
    """الحصول على قائمة الفصول الدراسية"""
    return {"semesters": ["الفصل الأول", "الفصل الثاني", "الفصل الصيفي"]}

@router.get("/my-scope")
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

@router.get("/my-institution")
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

@router.put("/my-institution")
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

@router.get("/")
async def root():
    return {"message": "نظام حضور كلية الشريعة والقانون", "version": "1.0"}

# ==================== APIs إدارة الصلاحيات المتقدمة ====================

@router.get("/permissions/available")
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

@router.get("/users/{user_id}/permissions")
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

@router.post("/users/{user_id}/permissions")
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

@router.delete("/users/{user_id}/permissions/{permission_id}")
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

@router.put("/users/{user_id}/permissions")
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

@router.get("/university")
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

@router.post("/university")
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

@router.get("/faculties")
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

@router.get("/faculties/{faculty_id}")
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

@router.put("/faculties/{faculty_id}/settings")
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

@router.post("/faculties")
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

@router.put("/faculties/{faculty_id}")
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

@router.delete("/faculties/{faculty_id}")
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

@router.get("/activity-logs")
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

@router.get("/activity-logs/stats")
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

@router.post("/activity-logs/record-view")
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
