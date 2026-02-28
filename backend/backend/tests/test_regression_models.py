"""
Regression Tests - After Models Restructuring
تحقق من أن جميع APIs تعمل بعد إعادة هيكلة النماذج
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://attendance-debug-1.preview.emergentagent.com')

class TestLogin:
    """Login API tests"""
    
    def test_login_admin_success(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful: {data['user']['username']}")
        return data["access_token"]
    
    def test_login_invalid_credentials(self):
        """Test invalid login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "wrong",
            "password": "wrong"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected")

@pytest.fixture(scope="module")
def admin_token():
    """Get admin token for authenticated requests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "admin",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.fail("Failed to get admin token")

@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Get headers with admin token"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestDepartments:
    """Departments API tests"""
    
    def test_get_departments(self, admin_headers):
        """Test get departments list"""
        response = requests.get(f"{BASE_URL}/api/departments", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Departments list: {len(data)} departments found")
        return data


class TestCourses:
    """Courses API tests"""
    
    def test_get_courses(self, admin_headers):
        """Test get courses list"""
        response = requests.get(f"{BASE_URL}/api/courses", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Courses list: {len(data)} courses found")
        return data


class TestStudents:
    """Students API tests"""
    
    def test_get_students(self, admin_headers):
        """Test get students list"""
        response = requests.get(f"{BASE_URL}/api/students", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Students list: {len(data)} students found")
        return data


class TestTeachers:
    """Teachers API tests"""
    
    def test_get_teachers(self, admin_headers):
        """Test get teachers list"""
        response = requests.get(f"{BASE_URL}/api/teachers", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Teachers list: {len(data)} teachers found")
        return data


class TestReports:
    """Reports API tests"""
    
    def test_get_reports_summary(self, admin_headers):
        """Test get reports summary"""
        response = requests.get(f"{BASE_URL}/api/reports/summary", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        # Validate data structure
        print(f"✓ Reports summary retrieved")
        return data


class TestSettings:
    """Settings API tests"""
    
    def test_get_settings(self, admin_headers):
        """Test get settings"""
        response = requests.get(f"{BASE_URL}/api/settings", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        print(f"✓ Settings retrieved")
        return data


class TestMySchedule:
    """My Schedule / Lectures API tests"""
    
    def test_get_today_lectures(self, admin_headers):
        """Test get today lectures"""
        response = requests.get(f"{BASE_URL}/api/lectures/today", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Today lectures: {len(data)} lectures found")
        return data


class TestAuthMe:
    """Auth Me API tests"""
    
    def test_get_auth_me(self, admin_headers):
        """Test get current user info"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "username" in data
        assert data["role"] == "admin"
        print(f"✓ Auth me: {data['username']} ({data['role']})")
        return data


class TestFaculties:
    """Faculties API tests"""
    
    def test_get_faculties(self, admin_headers):
        """Test get faculties list"""
        response = requests.get(f"{BASE_URL}/api/faculties", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Faculties list: {len(data)} faculties found")
        return data


class TestUsers:
    """Users API tests"""
    
    def test_get_users(self, admin_headers):
        """Test get users list (admin only)"""
        response = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Users list: {len(data)} users found")
        return data


class TestRoles:
    """Roles API tests"""
    
    def test_get_roles(self, admin_headers):
        """Test get roles list"""
        response = requests.get(f"{BASE_URL}/api/roles", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Roles list: {len(data)} roles found")
        return data


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
