"""
Backend API tests for Courses and Teacher Workload Report features
Tests: Courses API, Departments API, Teacher Workload Report API
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://schedule-hub-272.preview.emergentagent.com')


class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        return data["access_token"]
    
    def test_login_success(self):
        """Test admin login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"


class TestCoursesAPI:
    """Courses API tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json()["access_token"]
    
    def test_get_all_courses(self, auth_token):
        """Test GET /api/courses returns all courses"""
        response = requests.get(
            f"{BASE_URL}/api/courses",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1, "Should have at least 1 course"
        
        # Verify course structure
        course = data[0]
        assert "id" in course
        assert "name" in course
        assert "code" in course
        assert "department_id" in course
        assert "teacher_id" in course
        assert "level" in course
        assert "students_count" in course
        assert "lectures_count" in course
    
    def test_courses_require_auth(self):
        """Test courses endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/courses")
        assert response.status_code in [401, 403]


class TestDepartmentsAPI:
    """Departments API tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json()["access_token"]
    
    def test_get_all_departments(self, auth_token):
        """Test GET /api/departments returns all departments"""
        response = requests.get(
            f"{BASE_URL}/api/departments",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1, "Should have at least 1 department"
        
        # Verify department structure
        dept = data[0]
        assert "id" in dept
        assert "name" in dept
        assert "code" in dept


class TestTeacherWorkloadAPI:
    """Teacher Workload Report API tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json()["access_token"]
    
    def test_workload_report_no_params(self, auth_token):
        """Test GET /api/reports/teacher-workload without params defaults to current month"""
        response = requests.get(
            f"{BASE_URL}/api/reports/teacher-workload",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "period" in data
        assert "teachers" in data
        assert "summary" in data
        
        # Verify period structure
        assert "start_date" in data["period"]
        assert "end_date" in data["period"]
        assert "total_weeks" in data["period"]
        
        # Verify summary structure
        assert "total_teachers" in data["summary"]
        assert "total_required_hours" in data["summary"]
        assert "total_actual_hours" in data["summary"]
    
    def test_workload_report_with_date_params(self, auth_token):
        """Test GET /api/reports/teacher-workload with date parameters"""
        response = requests.get(
            f"{BASE_URL}/api/reports/teacher-workload",
            params={"start_date": "2026-01-01", "end_date": "2026-01-31"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify date range is applied
        assert "2026-01-01" in data["period"]["start_date"]
        assert "2026-01-31" in data["period"]["end_date"]
    
    def test_workload_report_teacher_structure(self, auth_token):
        """Test teacher data structure in workload report"""
        response = requests.get(
            f"{BASE_URL}/api/reports/teacher-workload",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if len(data["teachers"]) > 0:
            teacher = data["teachers"][0]
            assert "teacher_id" in teacher
            assert "teacher_name" in teacher
            assert "department_id" in teacher
            assert "courses" in teacher
            assert "summary" in teacher
            
            # Verify teacher summary structure
            summary = teacher["summary"]
            assert "total_courses" in summary
            assert "weekly_hours" in summary
            assert "required_hours" in summary
            assert "total_actual_hours" in summary
            assert "difference_hours" in summary
            assert "completion_rate" in summary
    
    def test_workload_report_requires_auth(self):
        """Test workload report requires authentication"""
        response = requests.get(f"{BASE_URL}/api/reports/teacher-workload")
        assert response.status_code in [401, 403]


class TestTeachersAPI:
    """Teachers API tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json()["access_token"]
    
    def test_get_all_teachers(self, auth_token):
        """Test GET /api/teachers returns all teachers"""
        response = requests.get(
            f"{BASE_URL}/api/teachers",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1, "Should have at least 1 teacher"
        
        # Verify teacher structure
        teacher = data[0]
        assert "id" in teacher
        assert "full_name" in teacher


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
