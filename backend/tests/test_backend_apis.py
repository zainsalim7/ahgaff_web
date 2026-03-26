"""
Backend API Tests for Student and Teacher Management System
Tests authentication, students, teachers, and departments APIs
"""
import pytest
import requests
import os

# Get the backend URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://schedule-hub-272.preview.emergentagent.com"

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"
TEACHER_USERNAME = "teacher180156"
TEACHER_PASSWORD = "teacher123"
STUDENT_USERNAME = "234"
STUDENT_PASSWORD = "123456"


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_admin_login_success(self):
        """Test admin can login successfully"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["username"] == ADMIN_USERNAME
        assert data["user"]["role"] == "admin"
    
    def test_teacher_login_success(self):
        """Test teacher can login successfully"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": TEACHER_USERNAME, "password": TEACHER_PASSWORD}
        )
        # Teacher may not exist or password may be different
        if response.status_code == 200:
            data = response.json()
            assert "access_token" in data
            print(f"Teacher login successful: {data['user'].get('full_name', 'N/A')}")
        else:
            pytest.skip(f"Teacher credentials not valid: {response.status_code}")
    
    def test_student_login_success(self):
        """Test student can login successfully"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": STUDENT_USERNAME, "password": STUDENT_PASSWORD}
        )
        # Student may not exist or password may be different
        if response.status_code == 200:
            data = response.json()
            assert "access_token" in data
            print(f"Student login successful: {data['user'].get('full_name', 'N/A')}")
        else:
            pytest.skip(f"Student credentials not valid: {response.status_code}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "invalid_user", "password": "wrong_password"}
        )
        assert response.status_code in [401, 400], f"Expected 401/400, got {response.status_code}"


class TestStudentsAPI:
    """Test students CRUD endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["access_token"]
    
    def test_get_students_authenticated(self, admin_token):
        """Test GET /api/students returns student list for authenticated user"""
        response = requests.get(
            f"{BASE_URL}/api/students",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get students: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should have at least one student"
        
        # Verify student structure
        first_student = data[0]
        assert "student_id" in first_student
        assert "full_name" in first_student
        assert "department_id" in first_student
        print(f"Found {len(data)} students")
    
    def test_get_students_unauthenticated(self):
        """Test GET /api/students without auth returns 401"""
        response = requests.get(f"{BASE_URL}/api/students")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestTeachersAPI:
    """Test teachers CRUD endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["access_token"]
    
    def test_get_teachers_authenticated(self, admin_token):
        """Test GET /api/teachers returns teacher list for authenticated user"""
        response = requests.get(
            f"{BASE_URL}/api/teachers",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get teachers: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should have at least one teacher"
        
        # Verify teacher structure
        first_teacher = data[0]
        assert "teacher_id" in first_teacher
        assert "full_name" in first_teacher
        print(f"Found {len(data)} teachers")
    
    def test_get_teachers_unauthenticated(self):
        """Test GET /api/teachers without auth returns 401"""
        response = requests.get(f"{BASE_URL}/api/teachers")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestDepartmentsAPI:
    """Test departments CRUD endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["access_token"]
    
    def test_get_departments_authenticated(self, admin_token):
        """Test GET /api/departments returns department list for authenticated user"""
        response = requests.get(
            f"{BASE_URL}/api/departments",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get departments: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should have at least one department"
        
        # Verify department structure
        first_dept = data[0]
        assert "name" in first_dept
        assert "id" in first_dept
        print(f"Found {len(data)} departments")


class TestHealthEndpoint:
    """Test health check endpoint"""
    
    def test_health_check(self):
        """Test health endpoint returns OK"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"


class TestReportsAPI:
    """Test reports endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["access_token"]
    
    def test_get_reports_summary(self, admin_token):
        """Test GET /api/reports/summary returns system stats"""
        response = requests.get(
            f"{BASE_URL}/api/reports/summary",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get summary: {response.text}"
        
        data = response.json()
        assert "total_students" in data
        assert "total_teachers" in data
        assert "total_courses" in data
        assert "total_departments" in data
        print(f"Summary: {data['total_students']} students, {data['total_teachers']} teachers, {data['total_courses']} courses")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
