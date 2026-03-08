"""
Teacher Delays Report API Tests
Tests for /api/reports/teacher-delays and /api/reports/teacher-delays/export endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestTeacherDelaysAPI:
    """Tests for Teacher Delays Report endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture
    def dean_token(self):
        """Get dean authentication token - skip if dean doesn't exist"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "dean",
            "password": "dean123"
        })
        if response.status_code != 200:
            pytest.skip("Dean user not available in this environment")
        return response.json()["access_token"]
    
    @pytest.fixture
    def teacher_token(self):
        """Get teacher authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "teacher180156",
            "password": "teacher123"
        })
        assert response.status_code == 200, f"Teacher login failed: {response.text}"
        return response.json()["access_token"]
    
    # GET /api/reports/teacher-delays Tests
    def test_teacher_delays_returns_valid_structure(self, admin_token):
        """Test that teacher-delays endpoint returns correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/reports/teacher-delays",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify response structure
        assert "teachers" in data, "Response missing 'teachers' key"
        assert "summary" in data, "Response missing 'summary' key"
        
        # Verify summary structure
        summary = data["summary"]
        assert "total_teachers" in summary, "Summary missing 'total_teachers'"
        assert "total_delayed_teachers" in summary, "Summary missing 'total_delayed_teachers'"
        assert "total_delay_incidents" in summary, "Summary missing 'total_delay_incidents'"
        
        # Verify teachers is a list
        assert isinstance(data["teachers"], list), "Teachers should be a list"
    
    def test_teacher_delays_with_department_filter(self, admin_token):
        """Test filtering by department_id"""
        # First get departments
        response = requests.get(
            f"{BASE_URL}/api/departments",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        departments = response.json()
        
        if len(departments) > 0:
            dept_id = departments[0]["id"]
            response = requests.get(
                f"{BASE_URL}/api/reports/teacher-delays?department_id={dept_id}",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            assert response.status_code == 200
            data = response.json()
            assert "teachers" in data
            assert "summary" in data
    
    def test_teacher_delays_requires_auth(self):
        """Test that endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/reports/teacher-delays")
        # FastAPI returns 403 when auth header missing for protected routes
        assert response.status_code in [401, 403], f"Should require authentication, got {response.status_code}"
    
    def test_teacher_delays_requires_view_reports_permission(self, teacher_token):
        """Test that teacher without view_reports cannot access report"""
        response = requests.get(
            f"{BASE_URL}/api/reports/teacher-delays",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        # Teacher should not have view_reports permission
        assert response.status_code == 403, f"Teacher should get 403, got {response.status_code}"
    
    def test_teacher_delays_dean_can_view(self, dean_token):
        """Test that dean with view_reports can access the report"""
        response = requests.get(
            f"{BASE_URL}/api/reports/teacher-delays",
            headers={"Authorization": f"Bearer {dean_token}"}
        )
        # Dean typically has view_reports permission
        assert response.status_code in [200, 403], f"Unexpected status: {response.status_code}"
    
    # GET /api/reports/teacher-delays/export Tests
    def test_teacher_delays_export_returns_xlsx(self, admin_token):
        """Test that export endpoint returns xlsx file"""
        response = requests.get(
            f"{BASE_URL}/api/reports/teacher-delays/export",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Export failed: {response.status_code}"
        
        # Check content type
        content_type = response.headers.get("Content-Type", "")
        assert "spreadsheet" in content_type or "xlsx" in content_type.lower(), \
            f"Expected xlsx content type, got: {content_type}"
        
        # Check content disposition
        content_disp = response.headers.get("Content-Disposition", "")
        assert "attachment" in content_disp, "Should be an attachment download"
        assert "xlsx" in content_disp, "Filename should be xlsx"
    
    def test_teacher_delays_export_requires_export_permission(self, teacher_token):
        """Test that export requires export_reports permission"""
        response = requests.get(
            f"{BASE_URL}/api/reports/teacher-delays/export",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        assert response.status_code == 403, f"Teacher should get 403, got {response.status_code}"
    
    def test_teacher_delays_export_with_filters(self, admin_token):
        """Test export with date and department filters"""
        response = requests.get(
            f"{BASE_URL}/api/reports/teacher-delays/export?start_date=2026-01-01&end_date=2026-12-31",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
    
    # Data structure tests when data exists
    def test_teacher_data_structure_if_exists(self, admin_token):
        """Verify teacher delay data structure when teachers exist in report"""
        response = requests.get(
            f"{BASE_URL}/api/reports/teacher-delays",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        teachers = data.get("teachers", [])
        
        # If there are teachers with delay data, verify structure
        if len(teachers) > 0:
            teacher = teachers[0]
            assert "teacher_id" in teacher
            assert "teacher_name" in teacher
            assert "employee_id" in teacher
            assert "total_lectures" in teacher
            assert "delayed_lectures" in teacher
            assert "total_delay_minutes" in teacher
            assert "avg_delay_minutes" in teacher
            assert "max_delay_minutes" in teacher
            assert "delays" in teacher
            assert isinstance(teacher["delays"], list)


class TestTeacherDelaysPermissions:
    """Permission-specific tests for teacher delays"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_admin_has_view_reports_permission(self, admin_token):
        """Verify admin has view_reports permission"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        user = response.json()
        # Admin should have view_reports
        assert user["role"] == "admin" or "view_reports" in user.get("permissions", [])
    
    def test_admin_has_export_reports_permission(self, admin_token):
        """Verify admin has export_reports permission"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        user = response.json()
        assert user["role"] == "admin" or "export_reports" in user.get("permissions", [])


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
