"""
Test cases for verifying the teacher role report access fix.
The bug was: TypeError: argument of type 'coroutine' is not iterable
Root cause: Function name collision where async endpoint 'get_user_permissions' at line 7690 
was shadowing the sync helper function 'get_user_permissions' at line 385.
Fix: Renamed async endpoint to 'get_user_permissions_endpoint_v2'.
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://student-teacher-mgmt.preview.emergentagent.com').rstrip('/')

# Test credentials
TEACHER_CREDENTIALS = {"username": "9999", "password": "9999"}
ADMIN_CREDENTIALS = {"username": "admin", "password": "admin123"}
TEST_STUDENT_ID = "69996b9971e8c36b973c5d88"
TEST_COURSE_ID = "698f82b0539792f8917b7bd8"


class TestTeacherAuth:
    """Test teacher authentication works"""
    
    def test_teacher_login_success(self):
        """Teacher should be able to login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=TEACHER_CREDENTIALS,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "teacher"
        assert data["user"]["username"] == "9999"
        print(f"✓ Teacher login successful: {data['user']['full_name']}")


class TestTeacherReportAccess:
    """Test teacher role can access report APIs - this was the bug that was fixed"""
    
    @pytest.fixture(scope="class")
    def teacher_token(self):
        """Get teacher auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=TEACHER_CREDENTIALS,
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Teacher login failed")
    
    def test_student_report_for_teacher(self, teacher_token):
        """GET /api/reports/student/{student_id} should work for teacher"""
        response = requests.get(
            f"{BASE_URL}/api/reports/student/{TEST_STUDENT_ID}",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "student" in data
        assert "courses" in data
        assert "summary" in data
        print(f"✓ Student report accessible for teacher: {data['student']['full_name']}")
    
    def test_attendance_overview_for_teacher(self, teacher_token):
        """GET /api/reports/attendance-overview should work for teacher"""
        response = requests.get(
            f"{BASE_URL}/api/reports/attendance-overview",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "courses" in data
        assert "summary" in data
        print(f"✓ Attendance overview accessible for teacher: {len(data['courses'])} courses")
    
    def test_daily_report_for_teacher(self, teacher_token):
        """GET /api/reports/daily should work for teacher"""
        response = requests.get(
            f"{BASE_URL}/api/reports/daily",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "date" in data
        assert "lectures" in data
        assert "summary" in data
        print(f"✓ Daily report accessible for teacher")
    
    def test_absent_students_for_teacher(self, teacher_token):
        """GET /api/reports/absent-students should work for teacher"""
        response = requests.get(
            f"{BASE_URL}/api/reports/absent-students",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "students" in data
        assert "total_count" in data
        print(f"✓ Absent students report accessible for teacher: {data['total_count']} students")


class TestAdminReportAccess:
    """Verify admin can still access all reports after the fix"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=ADMIN_CREDENTIALS,
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin login failed")
    
    def test_student_report_for_admin(self, admin_token):
        """GET /api/reports/student/{student_id} should work for admin"""
        response = requests.get(
            f"{BASE_URL}/api/reports/student/{TEST_STUDENT_ID}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "student" in data
        assert data["student"]["id"] == TEST_STUDENT_ID
        print(f"✓ Admin can access student report")
    
    def test_attendance_overview_for_admin(self, admin_token):
        """GET /api/reports/attendance-overview should work for admin"""
        response = requests.get(
            f"{BASE_URL}/api/reports/attendance-overview",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "courses" in data
        print(f"✓ Admin can access attendance overview")
    
    def test_daily_report_for_admin(self, admin_token):
        """GET /api/reports/daily should work for admin"""
        response = requests.get(
            f"{BASE_URL}/api/reports/daily",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        print(f"✓ Admin can access daily report")
    
    def test_absent_students_for_admin(self, admin_token):
        """GET /api/reports/absent-students should work for admin"""
        response = requests.get(
            f"{BASE_URL}/api/reports/absent-students",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        print(f"✓ Admin can access absent students report")


class TestPermissionHelperFunction:
    """Verify that the helper function still works correctly after the rename"""
    
    @pytest.fixture(scope="class")
    def teacher_token(self):
        """Get teacher auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=TEACHER_CREDENTIALS,
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Teacher login failed")
    
    def test_teacher_permissions_returned_correctly(self, teacher_token):
        """Teacher should have correct permissions in their user object"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "permissions" in data
        assert isinstance(data["permissions"], list)
        # Teacher should have view_reports permission
        assert "view_reports" in data["permissions"]
        print(f"✓ Teacher has correct permissions: {len(data['permissions'])} permissions")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
