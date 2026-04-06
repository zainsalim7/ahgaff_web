"""
Test Enrollment Permission Separation - RBAC Audit
Tests that enrollment permissions are properly separated from manage_courses permissions.
The fix ensures that removing manage_enrollments from a role blocks enrollment operations
even if the role still has manage_courses permission.
"""
import pytest
import requests
import os
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDS = {"username": "admin", "password": "admin123"}
DEPT_HEAD_CREDS = {"username": "Saeed", "password": "test123"}

# MongoDB connection for permission manipulation
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')


class TestEnrollmentPermissionSeparation:
    """Test that enrollment permissions are properly separated from course permissions"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def dept_head_token_with_enrollment(self):
        """Get department head token WITH manage_enrollments permission"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=DEPT_HEAD_CREDS)
        assert response.status_code == 200, f"Dept head login failed: {response.text}"
        data = response.json()
        # Verify manage_enrollments or add_enrollment is in permissions
        permissions = data["user"]["permissions"]
        has_enrollment_perm = any(p in permissions for p in ["manage_enrollments", "add_enrollment", "delete_enrollment"])
        print(f"Dept head permissions include enrollment: {has_enrollment_perm}")
        print(f"Dept head permissions: {permissions}")
        return data["access_token"], permissions
    
    # ==================== ADMIN TESTS ====================
    
    def test_01_admin_login_success(self):
        """Test admin can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful, role: {data['user']['role']}")
    
    def test_02_admin_can_access_courses(self, admin_token):
        """Test admin can access courses endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/courses", headers=headers)
        assert response.status_code == 200
        print(f"✓ Admin can access courses: {len(response.json())} courses found")
    
    def test_03_admin_can_access_enrollments(self, admin_token):
        """Test admin can access enrollments endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        # First get a course
        courses_response = requests.get(f"{BASE_URL}/api/courses", headers=headers)
        courses = courses_response.json()
        if courses:
            course_id = courses[0]["id"]
            response = requests.get(f"{BASE_URL}/api/enrollments/{course_id}", headers=headers)
            assert response.status_code == 200
            print(f"✓ Admin can access enrollments for course {course_id}")
        else:
            pytest.skip("No courses available for testing")
    
    # ==================== DEPT HEAD WITH ENROLLMENT PERMS ====================
    
    def test_04_dept_head_login_with_enrollment_perms(self, dept_head_token_with_enrollment):
        """Test department head login returns enrollment permissions"""
        token, permissions = dept_head_token_with_enrollment
        # Check that enrollment permissions are present (from FULL_PERMISSION_MAPPING expansion)
        has_enrollment = any(p in permissions for p in ["manage_enrollments", "add_enrollment", "delete_enrollment", "view_enrollments"])
        assert has_enrollment, f"Dept head should have enrollment permissions. Got: {permissions}"
        print(f"✓ Dept head has enrollment permissions: {[p for p in permissions if 'enroll' in p.lower()]}")
    
    def test_05_dept_head_can_access_courses(self, dept_head_token_with_enrollment):
        """Test department head can access courses"""
        token, _ = dept_head_token_with_enrollment
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/courses", headers=headers)
        assert response.status_code == 200
        print(f"✓ Dept head can access courses: {len(response.json())} courses found")
    
    def test_06_dept_head_can_access_departments(self, dept_head_token_with_enrollment):
        """Test department head can access departments"""
        token, _ = dept_head_token_with_enrollment
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/departments", headers=headers)
        assert response.status_code == 200
        print(f"✓ Dept head can access departments: {len(response.json())} departments found")
    
    def test_07_dept_head_can_access_students(self, dept_head_token_with_enrollment):
        """Test department head can access students"""
        token, _ = dept_head_token_with_enrollment
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/students", headers=headers)
        assert response.status_code == 200
        print(f"✓ Dept head can access students: {len(response.json())} students found")
    
    def test_08_dept_head_can_access_lectures(self, dept_head_token_with_enrollment):
        """Test department head can access lectures for a course"""
        token, _ = dept_head_token_with_enrollment
        headers = {"Authorization": f"Bearer {token}"}
        # First get a course
        courses_response = requests.get(f"{BASE_URL}/api/courses", headers=headers)
        courses = courses_response.json()
        if courses:
            course_id = courses[0]["id"]
            response = requests.get(f"{BASE_URL}/api/lectures/{course_id}", headers=headers)
            assert response.status_code == 200
            data = response.json()
            lecture_count = len(data.get("lectures", data)) if isinstance(data, dict) else len(data)
            print(f"✓ Dept head can access lectures for course {course_id}: {lecture_count} lectures found")
        else:
            pytest.skip("No courses available for testing")
    
    def test_09_dept_head_can_view_enrollments(self, dept_head_token_with_enrollment):
        """Test department head can view enrollments"""
        token, _ = dept_head_token_with_enrollment
        headers = {"Authorization": f"Bearer {token}"}
        # Get a course first
        courses_response = requests.get(f"{BASE_URL}/api/courses", headers=headers)
        courses = courses_response.json()
        if courses:
            course_id = courses[0]["id"]
            response = requests.get(f"{BASE_URL}/api/enrollments/{course_id}", headers=headers)
            assert response.status_code == 200
            print(f"✓ Dept head can view enrollments for course {course_id}")
        else:
            pytest.skip("No courses available for testing")


class TestEnrollmentPermissionRemoval:
    """
    Test that removing manage_enrollments from department_head role 
    properly blocks enrollment operations.
    
    This is the critical test for the RBAC fix.
    """
    
    @pytest.fixture(scope="class")
    def mongo_client(self):
        """Get MongoDB client"""
        client = AsyncIOMotorClient(MONGO_URL)
        yield client
        client.close()
    
    @pytest.fixture(scope="class")
    def event_loop(self):
        """Create event loop for async tests"""
        loop = asyncio.new_event_loop()
        yield loop
        loop.close()
    
    def test_10_remove_enrollment_permission_and_verify_block(self):
        """
        CRITICAL TEST: Remove manage_enrollments from dept_head role,
        login again, and verify enrollment is BLOCKED (403)
        """
        # Step 1: Get current role permissions
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        
        async def run_test():
            # Find department_head role
            role = await db.roles.find_one({"system_key": "department_head"})
            if not role:
                pytest.skip("department_head role not found in database")
            
            original_permissions = list(role.get("permissions", []))
            print(f"Original dept_head permissions: {original_permissions}")
            
            # Step 2: Remove enrollment permissions
            enrollment_perms = ["manage_enrollments", "add_enrollment", "delete_enrollment", "view_enrollments"]
            new_permissions = [p for p in original_permissions if p not in enrollment_perms]
            
            await db.roles.update_one(
                {"system_key": "department_head"},
                {"$set": {"permissions": new_permissions}}
            )
            print(f"Removed enrollment permissions. New permissions: {new_permissions}")
            
            try:
                # Step 3: Login as dept head again
                response = requests.post(f"{BASE_URL}/api/auth/login", json=DEPT_HEAD_CREDS)
                assert response.status_code == 200, f"Login failed: {response.text}"
                token = response.json()["access_token"]
                user_perms = response.json()["user"]["permissions"]
                
                # Verify enrollment permissions are NOT in the response
                has_enrollment = any(p in user_perms for p in enrollment_perms)
                print(f"After removal - has enrollment perms: {has_enrollment}")
                print(f"User permissions after removal: {user_perms}")
                
                # Step 4: Try to enroll a student - should get 403
                headers = {"Authorization": f"Bearer {token}"}
                
                # Get a course and student for testing
                courses_response = requests.get(f"{BASE_URL}/api/courses", headers=headers)
                courses = courses_response.json()
                
                students_response = requests.get(f"{BASE_URL}/api/students", headers=headers)
                students = students_response.json()
                
                if courses and students:
                    course_id = courses[0]["id"]
                    student_id = students[0]["id"]
                    
                    # Try to enroll - should be BLOCKED
                    # Note: EnrollmentCreate model requires course_id in body as well
                    enroll_response = requests.post(
                        f"{BASE_URL}/api/enrollments/{course_id}",
                        headers=headers,
                        json={"course_id": course_id, "student_ids": [student_id]}
                    )
                    
                    print(f"Enrollment attempt status: {enroll_response.status_code}")
                    print(f"Enrollment attempt response: {enroll_response.text}")
                    
                    # THIS IS THE KEY ASSERTION - should be 403 Forbidden
                    assert enroll_response.status_code == 403, \
                        f"Expected 403 Forbidden but got {enroll_response.status_code}. " \
                        f"Enrollment should be BLOCKED without manage_enrollments permission!"
                    
                    print("✓ CRITICAL TEST PASSED: Enrollment correctly blocked (403) without manage_enrollments permission")
                    
                    # Step 5: Verify other endpoints still work
                    # Courses should still be accessible
                    courses_check = requests.get(f"{BASE_URL}/api/courses", headers=headers)
                    assert courses_check.status_code == 200, "Courses should still be accessible"
                    print("✓ Courses still accessible without enrollment perms")
                    
                    # Departments should still be accessible
                    depts_check = requests.get(f"{BASE_URL}/api/departments", headers=headers)
                    assert depts_check.status_code == 200, "Departments should still be accessible"
                    print("✓ Departments still accessible without enrollment perms")
                    
                    # Students should still be accessible
                    students_check = requests.get(f"{BASE_URL}/api/students", headers=headers)
                    assert students_check.status_code == 200, "Students should still be accessible"
                    print("✓ Students still accessible without enrollment perms")
                    
                else:
                    pytest.skip("No courses or students available for testing")
                    
            finally:
                # Step 6: RESTORE original permissions
                await db.roles.update_one(
                    {"system_key": "department_head"},
                    {"$set": {"permissions": original_permissions}}
                )
                print(f"Restored original permissions: {original_permissions}")
        
        # Run the async test
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(run_test())
        finally:
            loop.close()
            client.close()
    
    def test_11_verify_unenroll_blocked_without_permission(self):
        """
        Test that unenroll (DELETE) is also blocked without delete_enrollment permission
        """
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        
        async def run_test():
            # Find department_head role
            role = await db.roles.find_one({"system_key": "department_head"})
            if not role:
                pytest.skip("department_head role not found in database")
            
            original_permissions = list(role.get("permissions", []))
            
            # Remove enrollment permissions
            enrollment_perms = ["manage_enrollments", "add_enrollment", "delete_enrollment", "view_enrollments"]
            new_permissions = [p for p in original_permissions if p not in enrollment_perms]
            
            await db.roles.update_one(
                {"system_key": "department_head"},
                {"$set": {"permissions": new_permissions}}
            )
            
            try:
                # Login as dept head
                response = requests.post(f"{BASE_URL}/api/auth/login", json=DEPT_HEAD_CREDS)
                token = response.json()["access_token"]
                headers = {"Authorization": f"Bearer {token}"}
                
                # Get a course with enrollments
                courses_response = requests.get(f"{BASE_URL}/api/courses", headers=headers)
                courses = courses_response.json()
                
                if courses:
                    course_id = courses[0]["id"]
                    
                    # Get enrollments for this course
                    enrollments_response = requests.get(f"{BASE_URL}/api/enrollments/{course_id}", headers=headers)
                    enrollments = enrollments_response.json()
                    
                    if enrollments:
                        student_id = enrollments[0]["student_id"]
                        
                        # Try to unenroll - should be BLOCKED
                        unenroll_response = requests.delete(
                            f"{BASE_URL}/api/enrollments/{course_id}/{student_id}",
                            headers=headers
                        )
                        
                        print(f"Unenroll attempt status: {unenroll_response.status_code}")
                        
                        # Should be 403 Forbidden
                        assert unenroll_response.status_code == 403, \
                            f"Expected 403 Forbidden but got {unenroll_response.status_code}. " \
                            f"Unenroll should be BLOCKED without delete_enrollment permission!"
                        
                        print("✓ Unenroll correctly blocked (403) without delete_enrollment permission")
                    else:
                        print("No enrollments found to test unenroll")
                else:
                    pytest.skip("No courses available for testing")
                    
            finally:
                # Restore original permissions
                await db.roles.update_one(
                    {"system_key": "department_head"},
                    {"$set": {"permissions": original_permissions}}
                )
        
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(run_test())
        finally:
            loop.close()
            client.close()
    
    def test_12_verify_bulk_copy_blocked_without_permission(self):
        """
        Test that bulk-copy endpoint is blocked without enrollment permission
        """
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        
        async def run_test():
            role = await db.roles.find_one({"system_key": "department_head"})
            if not role:
                pytest.skip("department_head role not found in database")
            
            original_permissions = list(role.get("permissions", []))
            
            # Remove enrollment permissions
            enrollment_perms = ["manage_enrollments", "add_enrollment", "delete_enrollment", "view_enrollments"]
            new_permissions = [p for p in original_permissions if p not in enrollment_perms]
            
            await db.roles.update_one(
                {"system_key": "department_head"},
                {"$set": {"permissions": new_permissions}}
            )
            
            try:
                response = requests.post(f"{BASE_URL}/api/auth/login", json=DEPT_HEAD_CREDS)
                token = response.json()["access_token"]
                headers = {"Authorization": f"Bearer {token}"}
                
                # Try bulk-copy - should be BLOCKED
                bulk_copy_response = requests.post(
                    f"{BASE_URL}/api/enrollments/bulk-copy",
                    headers=headers,
                    json={"student_ids": ["test"], "target_course_ids": ["test"]}
                )
                
                print(f"Bulk-copy attempt status: {bulk_copy_response.status_code}")
                
                assert bulk_copy_response.status_code == 403, \
                    f"Expected 403 but got {bulk_copy_response.status_code}"
                
                print("✓ Bulk-copy correctly blocked (403) without enrollment permission")
                    
            finally:
                await db.roles.update_one(
                    {"system_key": "department_head"},
                    {"$set": {"permissions": original_permissions}}
                )
        
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(run_test())
        finally:
            loop.close()
            client.close()
    
    def test_13_verify_bulk_move_blocked_without_permission(self):
        """
        Test that bulk-move endpoint is blocked without enrollment permission
        """
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        
        async def run_test():
            role = await db.roles.find_one({"system_key": "department_head"})
            if not role:
                pytest.skip("department_head role not found in database")
            
            original_permissions = list(role.get("permissions", []))
            
            # Remove enrollment permissions
            enrollment_perms = ["manage_enrollments", "add_enrollment", "delete_enrollment", "view_enrollments"]
            new_permissions = [p for p in original_permissions if p not in enrollment_perms]
            
            await db.roles.update_one(
                {"system_key": "department_head"},
                {"$set": {"permissions": new_permissions}}
            )
            
            try:
                response = requests.post(f"{BASE_URL}/api/auth/login", json=DEPT_HEAD_CREDS)
                token = response.json()["access_token"]
                headers = {"Authorization": f"Bearer {token}"}
                
                # Try bulk-move - should be BLOCKED
                bulk_move_response = requests.post(
                    f"{BASE_URL}/api/enrollments/bulk-move",
                    headers=headers,
                    json={"student_ids": ["test"], "source_course_id": "test", "target_course_id": "test"}
                )
                
                print(f"Bulk-move attempt status: {bulk_move_response.status_code}")
                
                assert bulk_move_response.status_code == 403, \
                    f"Expected 403 but got {bulk_move_response.status_code}"
                
                print("✓ Bulk-move correctly blocked (403) without enrollment permission")
                    
            finally:
                await db.roles.update_one(
                    {"system_key": "department_head"},
                    {"$set": {"permissions": original_permissions}}
                )
        
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(run_test())
        finally:
            loop.close()
            client.close()


class TestAttendancePermissionRegression:
    """Regression test for attendance permissions (from previous fix)"""
    
    def test_14_dept_head_can_edit_attendance(self):
        """Verify department head can still edit attendance (previous fix)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=DEPT_HEAD_CREDS)
        assert response.status_code == 200
        
        permissions = response.json()["user"]["permissions"]
        
        # Check for attendance permissions
        has_edit_attendance = "edit_attendance" in permissions
        has_manage_attendance = "manage_attendance" in permissions
        
        print(f"Has edit_attendance: {has_edit_attendance}")
        print(f"Has manage_attendance: {has_manage_attendance}")
        
        # Should have either edit_attendance directly or manage_attendance (which expands to edit_attendance)
        assert has_edit_attendance or has_manage_attendance, \
            f"Dept head should have attendance edit permissions. Got: {permissions}"
        
        print("✓ Dept head has attendance edit permissions (regression test passed)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
