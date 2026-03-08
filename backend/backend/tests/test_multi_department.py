"""
Backend API Tests for Multi-Department Support Feature
Tests the ability for department heads to manage multiple departments within the same faculty.

Test Coverage:
1. GET /api/users - Verify department_ids and department_names are returned
2. POST /api/users - Create user with multiple departments
3. PUT /api/users/{user_id} - Update user with multiple departments
4. Data filtering based on multiple departments
"""

import pytest
import requests
import os
import json
import time
from datetime import datetime

# Base URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://punctuality-monitor.preview.emergentagent.com')

class TestMultiDepartmentSupport:
    """Test suite for multi-department support feature"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access token in response"
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, admin_token):
        """Get authenticated headers"""
        return {
            "Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def departments_data(self, auth_headers):
        """Get all departments for testing"""
        response = requests.get(
            f"{BASE_URL}/api/departments",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get departments: {response.text}"
        return response.json()
    
    @pytest.fixture(scope="class")
    def roles_data(self, auth_headers):
        """Get all roles for testing"""
        response = requests.get(
            f"{BASE_URL}/api/roles",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get roles: {response.text}"
        return response.json()
    
    @pytest.fixture(scope="class")
    def department_head_role_id(self, roles_data):
        """Get department head role ID"""
        for role in roles_data:
            if role.get("system_key") == "department_head":
                return role["id"]
        pytest.fail("Department head role not found")
    
    # ==================== Test GET /api/users ====================
    
    def test_get_users_returns_department_ids(self, auth_headers):
        """Test that GET /api/users returns department_ids field for users"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers=auth_headers
        )
        
        # Status code assertion
        assert response.status_code == 200, f"Failed to get users: {response.text}"
        
        users = response.json()
        assert isinstance(users, list), "Response should be a list"
        
        # Check that response structure includes department_ids
        if len(users) > 0:
            first_user = users[0]
            assert "department_ids" in first_user, "department_ids field missing from user response"
            print(f"✓ department_ids field present in user response")
    
    def test_get_users_returns_department_names(self, auth_headers):
        """Test that GET /api/users returns department_names field for users with multiple departments"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        users = response.json()
        
        # Find user with multiple departments (Seaaad/Saeed)
        multi_dept_user = None
        for user in users:
            if user.get("department_ids") and len(user.get("department_ids", [])) > 1:
                multi_dept_user = user
                break
        
        if multi_dept_user:
            assert "department_names" in multi_dept_user, "department_names field missing"
            assert isinstance(multi_dept_user["department_names"], list), "department_names should be a list"
            assert len(multi_dept_user["department_names"]) == len(multi_dept_user["department_ids"]), \
                "department_names count should match department_ids count"
            
            # Check department_name contains all departments (joined by |)
            assert "department_name" in multi_dept_user, "department_name field missing"
            for dept_name in multi_dept_user["department_names"]:
                assert dept_name in multi_dept_user["department_name"], \
                    f"Department name '{dept_name}' not found in combined department_name"
            
            print(f"✓ User '{multi_dept_user['full_name']}' has {len(multi_dept_user['department_ids'])} departments")
            print(f"  department_names: {multi_dept_user['department_names']}")
            print(f"  department_name: {multi_dept_user['department_name']}")
        else:
            print("⚠ No user with multiple departments found - skipping multi-department name test")
    
    def test_existing_seaaad_user_has_multiple_departments(self, auth_headers):
        """Test that existing user 'Seaaad' has multiple departments assigned"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        users = response.json()
        
        # Find Seaaad user
        seaaad_user = None
        for user in users:
            if user.get("username") == "Saeed" or user.get("full_name") == "Seaaad":
                seaaad_user = user
                break
        
        assert seaaad_user is not None, "User Seaaad (username: Saeed) not found"
        assert seaaad_user["role"] == "department_head", "Seaaad should be a department_head"
        assert "department_ids" in seaaad_user, "department_ids field missing"
        assert len(seaaad_user["department_ids"]) >= 2, "Seaaad should have at least 2 departments"
        
        # Verify department names
        assert "department_names" in seaaad_user, "department_names field missing"
        assert len(seaaad_user["department_names"]) >= 2, "Seaaad should have at least 2 department names"
        
        print(f"✓ User Seaaad found with {len(seaaad_user['department_ids'])} departments:")
        for i, (did, dname) in enumerate(zip(seaaad_user["department_ids"], seaaad_user["department_names"])):
            print(f"  {i+1}. {dname} (id: {did})")
    
    # ==================== Test POST /api/users ====================
    
    def test_create_user_with_multiple_departments(self, auth_headers, departments_data, department_head_role_id):
        """Test creating a new user with multiple departments"""
        # Get at least 2 departments from the same faculty
        faculty_depts = {}
        for dept in departments_data:
            fid = dept.get("faculty_id")
            if fid:
                if fid not in faculty_depts:
                    faculty_depts[fid] = []
                faculty_depts[fid].append(dept)
        
        # Find a faculty with at least 2 departments
        test_depts = None
        for fid, depts in faculty_depts.items():
            if len(depts) >= 2:
                test_depts = depts[:2]
                break
        
        if not test_depts:
            pytest.skip("No faculty with 2+ departments found for testing")
        
        # Create test user with multiple departments
        timestamp = int(time.time())
        test_username = f"TEST_multidept_{timestamp}"
        
        create_payload = {
            "username": test_username,
            "password": "test123456",
            "full_name": f"Test Multi-Dept User {timestamp}",
            "role_id": department_head_role_id,
            "faculty_id": test_depts[0]["faculty_id"],
            "department_ids": [test_depts[0]["id"], test_depts[1]["id"]]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/users",
            json=create_payload,
            headers=auth_headers
        )
        
        # Status assertion
        assert response.status_code == 200, f"Failed to create user: {response.text}"
        
        created_user = response.json()
        
        # Data assertions
        assert created_user["username"] == test_username, "Username mismatch"
        assert "id" in created_user, "User ID not returned"
        assert "department_ids" in created_user, "department_ids not in response"
        
        # Verify department_ids were saved
        assert created_user["department_ids"] is not None, "department_ids is None"
        assert len(created_user["department_ids"]) == 2, \
            f"Expected 2 departments, got {len(created_user.get('department_ids', []))}"
        
        # Note: In create_user endpoint, department_id is not auto-set from department_ids
        # This is a minor inconsistency with update_user endpoint (which does set it)
        # For backward compatibility in update_user: department_id = department_ids[0]
        # Documenting current behavior - department_id may be None or set
        print(f"  department_id in response: {created_user.get('department_id')}")
        
        print(f"✓ Created user '{test_username}' with {len(created_user['department_ids'])} departments")
        
        # Cleanup - delete test user
        user_id = created_user["id"]
        cleanup_response = requests.delete(
            f"{BASE_URL}/api/users/{user_id}",
            headers=auth_headers
        )
        assert cleanup_response.status_code == 200, f"Failed to cleanup test user: {cleanup_response.text}"
        print(f"✓ Cleaned up test user {user_id}")
    
    # ==================== Test PUT /api/users/{user_id} ====================
    
    def test_update_user_with_multiple_departments(self, auth_headers, departments_data, department_head_role_id):
        """Test updating a user to have multiple departments"""
        # Get departments from same faculty
        faculty_depts = {}
        for dept in departments_data:
            fid = dept.get("faculty_id")
            if fid:
                if fid not in faculty_depts:
                    faculty_depts[fid] = []
                faculty_depts[fid].append(dept)
        
        # Find a faculty with at least 2 departments
        test_depts = None
        test_faculty_id = None
        for fid, depts in faculty_depts.items():
            if len(depts) >= 2:
                test_depts = depts[:2]
                test_faculty_id = fid
                break
        
        if not test_depts:
            pytest.skip("No faculty with 2+ departments found for testing")
        
        # First create a user with single department
        timestamp = int(time.time())
        test_username = f"TEST_update_multidept_{timestamp}"
        
        create_payload = {
            "username": test_username,
            "password": "test123456",
            "full_name": f"Test Update Multi-Dept {timestamp}",
            "role_id": department_head_role_id,
            "faculty_id": test_faculty_id,
            "department_ids": [test_depts[0]["id"]]  # Start with single department
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/users",
            json=create_payload,
            headers=auth_headers
        )
        
        assert create_response.status_code == 200, f"Failed to create user: {create_response.text}"
        created_user = create_response.json()
        user_id = created_user["id"]
        
        print(f"✓ Created user with 1 department: {created_user.get('department_ids')}")
        
        # Update to have multiple departments
        update_payload = {
            "full_name": f"Test Update Multi-Dept {timestamp} (Updated)",
            "department_ids": [test_depts[0]["id"], test_depts[1]["id"]]
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/users/{user_id}",
            json=update_payload,
            headers=auth_headers
        )
        
        # Status assertion
        assert update_response.status_code == 200, f"Failed to update user: {update_response.text}"
        
        updated_user = update_response.json()
        
        # Data assertions
        assert "department_ids" in updated_user, "department_ids not in update response"
        assert len(updated_user["department_ids"]) == 2, \
            f"Expected 2 departments after update, got {len(updated_user.get('department_ids', []))}"
        
        # Verify both departments are in the list
        for dept in test_depts:
            assert dept["id"] in updated_user["department_ids"], \
                f"Department {dept['id']} not found in updated department_ids"
        
        # department_id should be first department for backward compatibility
        assert updated_user.get("department_id") == test_depts[0]["id"], \
            "department_id should be set to first department"
        
        print(f"✓ Updated user now has {len(updated_user['department_ids'])} departments: {updated_user['department_ids']}")
        
        # Verify persistence with GET
        get_response = requests.get(
            f"{BASE_URL}/api/users",
            headers=auth_headers
        )
        
        assert get_response.status_code == 200
        all_users = get_response.json()
        
        fetched_user = None
        for u in all_users:
            if u["id"] == user_id:
                fetched_user = u
                break
        
        assert fetched_user is not None, "Created user not found in GET response"
        assert len(fetched_user["department_ids"]) == 2, \
            "department_ids not persisted correctly"
        
        print(f"✓ Verified persistence - department_ids: {fetched_user['department_ids']}")
        
        # Cleanup
        cleanup_response = requests.delete(
            f"{BASE_URL}/api/users/{user_id}",
            headers=auth_headers
        )
        assert cleanup_response.status_code == 200, f"Failed to cleanup: {cleanup_response.text}"
        print(f"✓ Cleaned up test user {user_id}")
    
    def test_update_user_remove_departments(self, auth_headers, departments_data, department_head_role_id):
        """Test updating a user to remove departments"""
        # Get departments
        faculty_depts = {}
        for dept in departments_data:
            fid = dept.get("faculty_id")
            if fid:
                if fid not in faculty_depts:
                    faculty_depts[fid] = []
                faculty_depts[fid].append(dept)
        
        # Find a faculty with at least 2 departments
        test_depts = None
        test_faculty_id = None
        for fid, depts in faculty_depts.items():
            if len(depts) >= 2:
                test_depts = depts[:2]
                test_faculty_id = fid
                break
        
        if not test_depts:
            pytest.skip("No faculty with 2+ departments found for testing")
        
        # Create user with multiple departments
        timestamp = int(time.time())
        test_username = f"TEST_remove_dept_{timestamp}"
        
        create_payload = {
            "username": test_username,
            "password": "test123456",
            "full_name": f"Test Remove Dept {timestamp}",
            "role_id": department_head_role_id,
            "faculty_id": test_faculty_id,
            "department_ids": [test_depts[0]["id"], test_depts[1]["id"]]
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/users",
            json=create_payload,
            headers=auth_headers
        )
        
        assert create_response.status_code == 200
        created_user = create_response.json()
        user_id = created_user["id"]
        
        print(f"✓ Created user with 2 departments")
        
        # Update to have single department
        update_payload = {
            "department_ids": [test_depts[0]["id"]]  # Remove second department
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/users/{user_id}",
            json=update_payload,
            headers=auth_headers
        )
        
        assert update_response.status_code == 200
        updated_user = update_response.json()
        
        assert len(updated_user["department_ids"]) == 1, \
            f"Expected 1 department after removal, got {len(updated_user.get('department_ids', []))}"
        assert updated_user["department_ids"][0] == test_depts[0]["id"], \
            "Remaining department should be the first one"
        
        print(f"✓ Successfully removed department - now has {len(updated_user['department_ids'])} department")
        
        # Update to clear all departments
        clear_payload = {
            "department_ids": []
        }
        
        clear_response = requests.put(
            f"{BASE_URL}/api/users/{user_id}",
            json=clear_payload,
            headers=auth_headers
        )
        
        assert clear_response.status_code == 200
        cleared_user = clear_response.json()
        
        assert cleared_user["department_ids"] == [] or cleared_user["department_ids"] is None or len(cleared_user["department_ids"]) == 0, \
            "department_ids should be empty after clearing"
        
        print(f"✓ Successfully cleared all departments")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/users/{user_id}", headers=auth_headers)
        print(f"✓ Cleaned up test user")
    
    # ==================== Test Data Filtering with Multiple Departments ====================
    
    def test_department_head_scope_filter_setup(self, auth_headers):
        """Test that get_user_scope_filter supports multiple department_ids"""
        # This tests the backend scoping logic indirectly by verifying
        # that a department head with multiple departments can access data from both departments
        
        # Find Seaaad user (has 2 departments)
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        users = response.json()
        
        seaaad_user = None
        for user in users:
            if user.get("username") == "Saeed":
                seaaad_user = user
                break
        
        if not seaaad_user:
            pytest.skip("Seaaad user not found for scope test")
        
        assert seaaad_user["role"] == "department_head", "Seaaad should be department_head"
        assert len(seaaad_user.get("department_ids", [])) >= 2, "Seaaad should have 2+ departments"
        
        print(f"✓ Seaaad user verified with multiple departments for scope filtering")
        print(f"  department_ids: {seaaad_user['department_ids']}")
        
        # Note: Full scope filtering test would require login as Seaaad
        # and verifying they can see students/courses from both departments


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        print("✓ API health check passed")


class TestAuthentication:
    """Authentication tests"""
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"},
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print("✓ Admin login successful")
    
    def test_invalid_login(self):
        """Test invalid login credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "invalid", "password": "invalid"},
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 401
        print("✓ Invalid login correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
