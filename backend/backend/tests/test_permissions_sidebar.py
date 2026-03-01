"""
Test Permission & Sidebar Functionality
Tests that:
1. Login as student (234/student123) - verify correct permissions returned
2. Login as teacher (9999/9999) - verify correct permissions returned  
3. Login as admin (admin/admin123) - verify admin can access all
4. GET /api/auth/me returns correct permissions for each role
5. GET /api/reports/student/{student_id} works for teacher role
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://auth-stable-1.preview.emergentagent.com')

# Test credentials
STUDENT_CREDS = {"username": "234", "password": "student123"}
TEACHER_CREDS = {"username": "9999", "password": "9999"}
ADMIN_CREDS = {"username": "admin", "password": "admin123"}
TEST_STUDENT_ID = "69996b9971e8c36b973c5d88"

# Expected permissions for student role
STUDENT_EXPECTED_PERMS = ["view_attendance", "view_lectures", "report_student"]

# Expected permissions for teacher role
TEACHER_EXPECTED_PERMS = [
    "record_attendance", "view_attendance", "view_reports", "export_reports",
    "manage_lectures", "view_lectures", "report_attendance_overview",
    "report_absent_students", "report_course"
]


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestStudentLogin:
    """Test student login and permissions"""
    
    def test_student_login_success(self, api_client):
        """Student (234/student123) should login successfully"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json=STUDENT_CREDS
        )
        print(f"Student login response status: {response.status_code}")
        print(f"Student login response: {response.json()}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "access_token" in data, "No access_token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["role"] == "student", f"Expected student role, got {data['user']['role']}"
    
    def test_student_permissions_from_login(self, api_client):
        """Student should have correct permissions from login endpoint"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json=STUDENT_CREDS
        )
        assert response.status_code == 200
        
        data = response.json()
        user_perms = data["user"].get("permissions", [])
        print(f"Student permissions from login: {user_perms}")
        
        # Student should have these specific permissions
        for perm in STUDENT_EXPECTED_PERMS:
            assert perm in user_perms, f"Missing expected permission: {perm}"
        
        # Student should NOT have these permissions
        assert "manage_users" not in user_perms, "Student shouldn't have manage_users"
        assert "manage_departments" not in user_perms, "Student shouldn't have manage_departments"
        assert "manage_lectures" not in user_perms, "Student shouldn't have manage_lectures"
        assert "record_attendance" not in user_perms, "Student shouldn't have record_attendance"
    
    def test_student_auth_me_permissions(self, api_client):
        """GET /api/auth/me should return correct permissions for student"""
        # Login first
        login_response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json=STUDENT_CREDS
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Get /api/auth/me
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        me_response = api_client.get(f"{BASE_URL}/api/auth/me")
        
        print(f"Student /api/auth/me status: {me_response.status_code}")
        print(f"Student /api/auth/me response: {me_response.json()}")
        
        assert me_response.status_code == 200, f"Expected 200, got {me_response.status_code}"
        
        data = me_response.json()
        user_perms = data.get("permissions", [])
        
        # Verify student has required permissions
        for perm in STUDENT_EXPECTED_PERMS:
            assert perm in user_perms, f"Missing expected permission from /me: {perm}"
        
        # Verify student doesn't have admin permissions
        assert "manage_users" not in user_perms, "Student shouldn't have manage_users"
        assert "manage_departments" not in user_perms, "Student shouldn't have manage_departments"
    
    def test_student_report_api_access(self, api_client):
        """Student should be able to access their own student report API"""
        # Login first
        login_response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json=STUDENT_CREDS
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        student_id = login_response.json()["user"].get("student_id")
        
        # Try to access student report
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        
        # Use student_id if available, otherwise test_student_id
        target_student = student_id if student_id else TEST_STUDENT_ID
        report_response = api_client.get(f"{BASE_URL}/api/reports/student/{target_student}")
        
        print(f"Student report API status: {report_response.status_code}")
        
        # Student should be able to access student report (has report_student permission)
        assert report_response.status_code == 200, f"Expected 200, got {report_response.status_code}"


class TestTeacherLogin:
    """Test teacher login and permissions"""
    
    def test_teacher_login_success(self, api_client):
        """Teacher (9999/9999) should login successfully"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json=TEACHER_CREDS
        )
        print(f"Teacher login response status: {response.status_code}")
        print(f"Teacher login response: {response.json()}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "access_token" in data, "No access_token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["role"] == "teacher", f"Expected teacher role, got {data['user']['role']}"
    
    def test_teacher_permissions_from_login(self, api_client):
        """Teacher should have correct permissions from login endpoint"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json=TEACHER_CREDS
        )
        assert response.status_code == 200
        
        data = response.json()
        user_perms = data["user"].get("permissions", [])
        print(f"Teacher permissions from login: {user_perms}")
        
        # Teacher should have these specific permissions
        for perm in TEACHER_EXPECTED_PERMS:
            assert perm in user_perms, f"Missing expected permission: {perm}"
        
        # Teacher should NOT have these admin permissions
        assert "manage_users" not in user_perms, "Teacher shouldn't have manage_users"
        assert "manage_departments" not in user_perms, "Teacher shouldn't have manage_departments"
    
    def test_teacher_auth_me_permissions(self, api_client):
        """GET /api/auth/me should return correct permissions for teacher"""
        # Login first
        login_response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json=TEACHER_CREDS
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Get /api/auth/me
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        me_response = api_client.get(f"{BASE_URL}/api/auth/me")
        
        print(f"Teacher /api/auth/me status: {me_response.status_code}")
        print(f"Teacher /api/auth/me response: {me_response.json()}")
        
        assert me_response.status_code == 200, f"Expected 200, got {me_response.status_code}"
        
        data = me_response.json()
        user_perms = data.get("permissions", [])
        
        # Verify teacher has required permissions
        for perm in TEACHER_EXPECTED_PERMS:
            assert perm in user_perms, f"Missing expected permission from /me: {perm}"
        
        # Verify teacher doesn't have admin permissions
        assert "manage_users" not in user_perms, "Teacher shouldn't have manage_users"
        assert "manage_departments" not in user_perms, "Teacher shouldn't have manage_departments"
    
    def test_teacher_report_apis_access(self, api_client):
        """Teacher should be able to access all report APIs"""
        # Login first
        login_response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json=TEACHER_CREDS
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        
        # Test student report API
        student_report = api_client.get(f"{BASE_URL}/api/reports/student/{TEST_STUDENT_ID}")
        print(f"Teacher - Student report API status: {student_report.status_code}")
        assert student_report.status_code == 200, f"Expected 200 for student report, got {student_report.status_code}"
        
        # Test attendance overview API
        attendance_overview = api_client.get(f"{BASE_URL}/api/reports/attendance-overview")
        print(f"Teacher - Attendance overview API status: {attendance_overview.status_code}")
        assert attendance_overview.status_code == 200, f"Expected 200 for attendance overview, got {attendance_overview.status_code}"
        
        # Test daily report API
        daily_report = api_client.get(f"{BASE_URL}/api/reports/daily")
        print(f"Teacher - Daily report API status: {daily_report.status_code}")
        assert daily_report.status_code == 200, f"Expected 200 for daily report, got {daily_report.status_code}"
        
        # Test absent students API
        absent_students = api_client.get(f"{BASE_URL}/api/reports/absent-students")
        print(f"Teacher - Absent students API status: {absent_students.status_code}")
        assert absent_students.status_code == 200, f"Expected 200 for absent students, got {absent_students.status_code}"


class TestAdminLogin:
    """Test admin login and permissions"""
    
    def test_admin_login_success(self, api_client):
        """Admin (admin/admin123) should login successfully"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json=ADMIN_CREDS
        )
        print(f"Admin login response status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "access_token" in data, "No access_token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["role"] == "admin", f"Expected admin role, got {data['user']['role']}"
    
    def test_admin_all_apis_access(self, api_client):
        """Admin should be able to access all APIs"""
        # Login first
        login_response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json=ADMIN_CREDS
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        
        # Test student report API
        student_report = api_client.get(f"{BASE_URL}/api/reports/student/{TEST_STUDENT_ID}")
        print(f"Admin - Student report API status: {student_report.status_code}")
        assert student_report.status_code == 200, f"Expected 200 for student report, got {student_report.status_code}"
        
        # Test attendance overview API
        attendance_overview = api_client.get(f"{BASE_URL}/api/reports/attendance-overview")
        print(f"Admin - Attendance overview API status: {attendance_overview.status_code}")
        assert attendance_overview.status_code == 200, f"Expected 200 for attendance overview, got {attendance_overview.status_code}"
        
        # Test users API (admin only)
        users_response = api_client.get(f"{BASE_URL}/api/users")
        print(f"Admin - Users API status: {users_response.status_code}")
        assert users_response.status_code == 200, f"Expected 200 for users, got {users_response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
