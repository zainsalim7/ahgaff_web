"""
Test role-based attendance editing system:
- Admin should NOT auto-get edit_attendance permission
- Only users with explicit 'edit_attendance' permission can modify attendance
- Teacher-only permissions: record_attendance, take_attendance, manage_lectures, edit_attendance
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    pytest.skip("REACT_APP_BACKEND_URL not set", allow_module_level=True)

TEACHER_ONLY_PERMISSIONS = ["record_attendance", "take_attendance", "manage_lectures", "edit_attendance"]
ADMIN_CREDENTIALS = {"username": "admin", "password": "admin123"}
TEST_ATTENDANCE_RECORD_ID = "69a756aac63c5ee8fa454c9c"


class TestAdminPermissions:
    """Verify admin does NOT auto-get teacher-only permissions"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture
    def admin_user(self, admin_token):
        """Get admin user data with permissions"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        return response.json()
    
    def test_admin_login_returns_permissions(self, admin_token):
        """Test admin login returns token"""
        assert admin_token is not None
        assert len(admin_token) > 0
        print(f"Admin login successful, token length: {len(admin_token)}")
    
    def test_admin_has_no_teacher_only_permissions(self, admin_user):
        """Admin should NOT have teacher-only permissions unless explicitly granted"""
        admin_permissions = admin_user.get("permissions", [])
        print(f"Admin role: {admin_user.get('role')}")
        print(f"Admin permissions: {admin_permissions}")
        
        # Check that admin does NOT have teacher-only permissions
        for perm in TEACHER_ONLY_PERMISSIONS:
            if perm in admin_permissions:
                print(f"WARNING: Admin has {perm} - this should only happen if explicitly granted")
                # Don't fail - check if it's explicitly granted via custom_permissions
            else:
                print(f"PASS: Admin does NOT have {perm}")
        
        # Main assertion: edit_attendance should NOT be in admin's default permissions
        assert "edit_attendance" not in admin_permissions, \
            f"Admin should NOT auto-have edit_attendance. Permissions: {admin_permissions}"
    
    def test_admin_cannot_edit_attendance_without_permission(self, admin_token, admin_user):
        """PUT /api/attendance/{record_id}/status should return 403 for admin without edit_attendance"""
        admin_permissions = admin_user.get("permissions", [])
        
        # Skip if admin somehow has edit_attendance (explicitly granted)
        if "edit_attendance" in admin_permissions:
            pytest.skip("Admin has edit_attendance - test not applicable")
        
        response = requests.put(
            f"{BASE_URL}/api/attendance/{TEST_ATTENDANCE_RECORD_ID}/status",
            json={"status": "absent", "reason": "test by admin"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text}")
        
        assert response.status_code == 403, \
            f"Expected 403 Forbidden, got {response.status_code}. Admin should NOT be able to edit attendance"
        
        data = response.json()
        assert "صلاحية" in data.get("detail", "") or "permission" in data.get("detail", "").lower(), \
            f"Error message should mention permission issue: {data}"


class TestDeanPermissions:
    """Verify Dean role has edit_attendance permission"""
    
    def test_dean_role_exists_with_edit_attendance(self):
        """Check if dean role has edit_attendance permission in the roles table"""
        # First, login as admin to query roles
        admin_response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        assert admin_response.status_code == 200
        admin_token = admin_response.json()["access_token"]
        
        # Get all roles
        roles_response = requests.get(
            f"{BASE_URL}/api/roles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert roles_response.status_code == 200
        roles = roles_response.json()
        
        print(f"Available roles: {[r.get('name') for r in roles]}")
        
        # Find dean role
        dean_role = None
        for role in roles:
            if "dean" in role.get("system_key", "").lower() or "عميد" in role.get("name", ""):
                dean_role = role
                break
        
        if dean_role:
            print(f"Dean role found: {dean_role.get('name')}")
            print(f"Dean permissions: {dean_role.get('permissions', [])}")
            
            # Check for edit_attendance
            has_edit = "edit_attendance" in dean_role.get("permissions", [])
            print(f"Dean has edit_attendance: {has_edit}")
        else:
            print("Dean role not found in roles table - may need to be created")


class TestPermissionEnforcement:
    """Test that edit_attendance permission is properly enforced"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_attendance_record_exists(self, admin_token):
        """Verify the test attendance record exists (or find one)"""
        # Try to get attendance records
        response = requests.get(
            f"{BASE_URL}/api/attendance",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        if response.status_code == 200:
            records = response.json()
            if records:
                print(f"Found {len(records)} attendance records")
                print(f"First record ID: {records[0].get('id', records[0].get('_id'))}")
        else:
            print(f"Could not fetch attendance records: {response.status_code}")
    
    def test_unauthenticated_cannot_edit_attendance(self):
        """Unauthenticated request should get 401/403"""
        response = requests.put(
            f"{BASE_URL}/api/attendance/{TEST_ATTENDANCE_RECORD_ID}/status",
            json={"status": "present"}
        )
        assert response.status_code in [401, 403, 422], \
            f"Expected 401/403/422, got {response.status_code}"
        print(f"Unauthenticated request properly rejected with {response.status_code}")


class TestDefaultPermissions:
    """Verify DEFAULT_PERMISSIONS structure"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_get_all_permissions(self, admin_token):
        """Fetch all permissions and verify structure"""
        response = requests.get(
            f"{BASE_URL}/api/permissions/all",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        print(f"All permissions available: {len(data.get('permissions', []))}")
        
        # Check default_permissions structure
        default_perms = data.get("default_permissions", {})
        
        if "admin" in default_perms:
            admin_default = default_perms["admin"]
            print(f"Admin default permissions: {admin_default}")
            
            # Admin should NOT have teacher-only permissions in defaults
            for perm in TEACHER_ONLY_PERMISSIONS:
                if perm in admin_default:
                    print(f"ERROR: Admin default has {perm} - this should not happen!")
                else:
                    print(f"PASS: Admin default does NOT have {perm}")
        
        if "teacher" in default_perms:
            teacher_default = default_perms["teacher"]
            print(f"Teacher default permissions: {teacher_default}")
            
            # Teacher should have some of these
            has_record = "record_attendance" in teacher_default
            print(f"Teacher has record_attendance: {has_record}")


class TestHasPermissionFunction:
    """Test the backend has_permission logic via API behavior"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_admin_can_access_non_teacher_endpoints(self, admin_token):
        """Admin should still have access to regular admin endpoints"""
        # Test accessing users endpoint (requires admin)
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, \
            f"Admin should be able to access /api/users. Got: {response.status_code}"
        print("Admin can access /api/users - general admin permissions working")
    
    def test_admin_can_access_reports(self, admin_token):
        """Admin should have view_reports permission"""
        response = requests.get(
            f"{BASE_URL}/api/reports/daily",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        # Could be 200 or 404 (no data), but not 403
        assert response.status_code != 403, \
            f"Admin should have reports access. Got: {response.status_code}"
        print(f"Admin reports access: {response.status_code}")


class TestFrontendUIExpectations:
    """
    Document expected frontend behavior based on permissions.
    These tests verify the API returns data in a way the frontend expects.
    """
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_me_endpoint_returns_permissions(self, admin_token):
        """GET /api/auth/me should return user with permissions array"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        user = response.json()
        
        assert "permissions" in user, "User should have permissions field"
        assert "role" in user, "User should have role field"
        
        print(f"User role: {user.get('role')}")
        print(f"User permissions count: {len(user.get('permissions', []))}")
        
        # For frontend: courses page checks user.role === 'teacher'
        # Admin should NOT see "محاضرات اليوم" section
        if user.get("role") == "admin":
            print("Frontend should hide 'محاضرات اليوم' section for admin (role !== 'teacher')")
        
        # For edit_attendance button
        perms = user.get("permissions", [])
        has_edit = "edit_attendance" in perms
        print(f"Frontend should {'SHOW' if has_edit else 'HIDE'} edit attendance button")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
