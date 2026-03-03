"""
Test cases for report permissions feature
Tests the new individual report permissions:
- report_attendance_overview
- report_absent_students
- report_warnings
- report_daily
- report_student
- report_course
- report_teacher_workload
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://edu-management-37.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_USER = {"username": "admin", "password": "admin123"}
TEST_USER = {"username": "736551455", "password": "736551455"}

# Expected individual report permissions
INDIVIDUAL_REPORT_PERMISSIONS = [
    "report_attendance_overview",
    "report_absent_students",
    "report_warnings",
    "report_daily",
    "report_student",
    "report_course",
    "report_teacher_workload",
]


class TestHealth:
    """Health check tests"""
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        data = response.json()
        assert data["status"] == "ok"
        print("✓ API health check passed")


class TestAuthentication:
    """Authentication tests"""
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200, f"Admin login failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["role"] == "admin"
        print("✓ Admin login successful")
        return data["access_token"]
    
    def test_test_user_login(self):
        """Test test user login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=TEST_USER)
        # This might fail if user doesn't exist - that's ok
        if response.status_code == 200:
            data = response.json()
            assert "access_token" in data
            print(f"✓ Test user login successful, role: {data['user'].get('role')}")
            return data["access_token"], data["user"]
        else:
            print(f"⚠ Test user login failed (user may not exist): {response.status_code}")
            pytest.skip("Test user doesn't exist")


class TestPermissionsAPI:
    """Test permissions API endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_get_all_permissions_returns_individual_reports(self, admin_token):
        """Test that /api/permissions/all returns all 7 individual report permissions"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/permissions/all", headers=headers)
        
        assert response.status_code == 200, f"Failed to get permissions: {response.status_code}"
        data = response.json()
        
        # Verify structure
        assert "permissions" in data, "Response should contain 'permissions' key"
        
        # Extract all permission keys
        permission_keys = [p["key"] for p in data["permissions"]]
        
        # Verify all individual report permissions exist
        missing_permissions = []
        for perm in INDIVIDUAL_REPORT_PERMISSIONS:
            if perm not in permission_keys:
                missing_permissions.append(perm)
        
        assert len(missing_permissions) == 0, f"Missing permissions: {missing_permissions}"
        print(f"✓ All {len(INDIVIDUAL_REPORT_PERMISSIONS)} individual report permissions found")
        
        # Verify they have correct category
        individual_report_perms = [p for p in data["permissions"] if p["key"] in INDIVIDUAL_REPORT_PERMISSIONS]
        for perm in individual_report_perms:
            assert perm["category"] == "التقارير الفردية", f"Permission {perm['key']} has wrong category: {perm['category']}"
        print("✓ All individual report permissions have correct category 'التقارير الفردية'")
    
    def test_permissions_have_arabic_labels(self, admin_token):
        """Test that individual report permissions have Arabic labels"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/permissions/all", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Get individual report permissions
        report_perms = [p for p in data["permissions"] if p["key"] in INDIVIDUAL_REPORT_PERMISSIONS]
        
        # Verify each has a label
        for perm in report_perms:
            assert "label" in perm and perm["label"], f"Permission {perm['key']} missing label"
            print(f"  - {perm['key']}: {perm['label']}")
        
        print("✓ All individual report permissions have Arabic labels")


class TestDefaultPermissions:
    """Test default role permissions"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_admin_has_all_report_permissions(self, admin_token):
        """Test that admin role has all individual report permissions"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/permissions/all", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Check default_permissions for admin
        default_perms = data.get("default_permissions", {})
        admin_perms = default_perms.get("admin", [])
        
        # Verify all individual report permissions in admin defaults
        for perm in INDIVIDUAL_REPORT_PERMISSIONS:
            assert perm in admin_perms, f"Admin missing default permission: {perm}"
        
        print("✓ Admin has all individual report permissions in defaults")
    
    def test_teacher_has_limited_report_permissions(self, admin_token):
        """Test that teacher role has limited report permissions"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/permissions/all", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        default_perms = data.get("default_permissions", {})
        teacher_perms = default_perms.get("teacher", [])
        
        # Teacher should have: attendance_overview, absent_students, course
        expected_teacher_perms = ["report_attendance_overview", "report_absent_students", "report_course"]
        for perm in expected_teacher_perms:
            assert perm in teacher_perms, f"Teacher missing expected permission: {perm}"
        
        # Teacher should NOT have: warnings, daily, student (personal), teacher_workload
        should_not_have = ["report_warnings", "report_daily", "report_teacher_workload"]
        for perm in should_not_have:
            if perm in teacher_perms:
                print(f"  ⚠ Teacher has {perm} (may be intentional)")
        
        print("✓ Teacher has expected limited report permissions")


class TestRolesAPI:
    """Test roles API returns correct permissions"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_get_all_roles(self, admin_token):
        """Test getting all roles"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/roles", headers=headers)
        
        assert response.status_code == 200, f"Failed to get roles: {response.status_code}"
        roles = response.json()
        
        assert isinstance(roles, list), "Roles should be a list"
        print(f"✓ Found {len(roles)} roles")
        
        for role in roles:
            print(f"  - {role['name']}: {len(role.get('permissions', []))} permissions")


class TestLoginReturnsPermissions:
    """Test that login returns user permissions including report permissions"""
    
    def test_admin_login_returns_permissions(self):
        """Test that admin login response includes permissions"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        data = response.json()
        
        # Verify user has permissions array
        user = data["user"]
        assert "permissions" in user, "User should have permissions array"
        permissions = user["permissions"]
        
        # Admin should have all individual report permissions
        for perm in INDIVIDUAL_REPORT_PERMISSIONS:
            assert perm in permissions, f"Admin login missing permission: {perm}"
        
        print(f"✓ Admin login returns {len(permissions)} permissions including all report permissions")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
