"""
Roles Routes - مسارات إدارة الأدوار
"""
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

from models.permissions import UserRole, DEFAULT_PERMISSIONS, ALL_PERMISSIONS
from .deps import get_db, get_current_user

router = APIRouter(tags=["الأدوار"])


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    permissions: List[str] = []


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[str]] = None


@router.get("/roles")
async def get_all_roles(current_user: dict = Depends(get_current_user)):
    """الحصول على جميع الأدوار"""
    db = get_db()
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    roles = await db.roles.find().to_list(100)
    
    result = []
    for role in roles:
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


@router.post("/roles")
async def create_role(role_data: RoleCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء دور جديد"""
    db = get_db()
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    existing = await db.roles.find_one({"name": role_data.name})
    if existing:
        raise HTTPException(status_code=400, detail="يوجد دور بهذا الاسم")
    
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


@router.get("/roles/{role_id}")
async def get_role(role_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على تفاصيل دور معين"""
    db = get_db()
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


@router.put("/roles/{role_id}")
async def update_role(role_id: str, role_data: RoleUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث دور"""
    db = get_db()
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    role = await db.roles.find_one({"_id": ObjectId(role_id)})
    if not role:
        raise HTTPException(status_code=404, detail="الدور غير موجود")
    
    update_data = {}
    
    if role.get("is_system"):
        if role_data.name and role_data.name != role.get("name"):
            raise HTTPException(status_code=400, detail="لا يمكن تغيير اسم دور نظامي")
        if role_data.permissions is not None:
            valid_permissions = [p["key"] for p in ALL_PERMISSIONS]
            for perm in role_data.permissions:
                if perm not in valid_permissions:
                    raise HTTPException(status_code=400, detail=f"صلاحية غير صالحة: {perm}")
            update_data["permissions"] = role_data.permissions
        if role_data.description is not None:
            update_data["description"] = role_data.description
    else:
        if role_data.name:
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


@router.delete("/roles/{role_id}")
async def delete_role(role_id: str, current_user: dict = Depends(get_current_user)):
    """حذف دور"""
    db = get_db()
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    role = await db.roles.find_one({"_id": ObjectId(role_id)})
    if not role:
        raise HTTPException(status_code=404, detail="الدور غير موجود")
    
    if role.get("is_system"):
        raise HTTPException(status_code=400, detail="لا يمكن حذف دور نظامي")
    
    users_count = await db.users.count_documents({"role_id": role_id})
    if users_count > 0:
        raise HTTPException(status_code=400, detail=f"لا يمكن حذف الدور، يوجد {users_count} مستخدم مرتبط به")
    
    await db.roles.delete_one({"_id": ObjectId(role_id)})
    
    return {"message": "تم حذف الدور بنجاح"}


@router.post("/roles/init")
async def init_default_roles(current_user: dict = Depends(get_current_user)):
    """إنشاء الأدوار الافتراضية"""
    db = get_db()
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


@router.get("/permissions/all")
async def get_all_permissions(current_user: dict = Depends(get_current_user)):
    """الحصول على قائمة جميع الصلاحيات المتاحة"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    return ALL_PERMISSIONS
