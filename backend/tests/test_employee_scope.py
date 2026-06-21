"""Regression: employee role MUST be scoped to their department/faculty."""
import asyncio, os, sys
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

sys.path.insert(0, '/app/backend/backend')
load_dotenv('/app/backend/.env')

async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    from server import get_user_scope_filter

    fake_dept = "507f1f77bcf86cd799439011"
    fake_fac = "507f1f77bcf86cd799439099"

    # 1) Employee مع قسم → يجب يفلتر بـ department_id
    u1 = await db.users.insert_one({
        "username": "_emp_test1", "role": "employee",
        "department_id": fake_dept, "department_ids": [fake_dept],
        "full_name": "T", "password": "x", "is_active": True,
    })
    u1_doc = {"id": str(u1.inserted_id), "username": "_emp_test1", "role": "employee"}
    for scope in ["students", "courses", "teachers"]:
        f = await get_user_scope_filter(u1_doc, scope)
        assert f.get("department_id") == fake_dept, f"FAIL scope={scope}: {f}"
    print("PASS: موظف مع قسم → يفلتر بقسمه ✓")

    # 2) Employee بلا أي نطاق → يُحجَب
    u2 = await db.users.insert_one({
        "username": "_emp_test2", "role": "employee",
        "full_name": "T2", "password": "x", "is_active": True,
    })
    u2_doc = {"id": str(u2.inserted_id), "username": "_emp_test2", "role": "employee"}
    for scope in ["students", "courses", "teachers"]:
        f = await get_user_scope_filter(u2_doc, scope)
        assert "_id" in f and str(f["_id"]) == "000000000000000000000000", \
            f"FAIL-OPEN scope={scope}: {f}"
    print("PASS: موظف بلا نطاق محجوب تماماً ✓")

    # 3) Employee مع كلية فقط → يرى أقسام الكلية
    await db.departments.delete_one({"_id": ObjectId(fake_dept)})
    await db.departments.insert_one({"_id": ObjectId(fake_dept), "name": "T", "faculty_id": fake_fac})
    u3 = await db.users.insert_one({
        "username": "_emp_test3", "role": "employee", "faculty_id": fake_fac,
        "full_name": "T3", "password": "x", "is_active": True,
    })
    u3_doc = {"id": str(u3.inserted_id), "username": "_emp_test3", "role": "employee"}
    f = await get_user_scope_filter(u3_doc, "students")
    assert "department_id" in f and "$in" in f["department_id"] and fake_dept in f["department_id"]["$in"], \
        f"FAIL: employee faculty-only: {f}"
    print("PASS: موظف مع كلية فقط يرى أقسامها ✓")

    # Cleanup
    await db.users.delete_many({"username": {"$regex": "^_emp_test"}})
    await db.departments.delete_one({"_id": ObjectId(fake_dept)})
    print("\n✅ كل اختبارات employee scope نجحت")

asyncio.run(main())
