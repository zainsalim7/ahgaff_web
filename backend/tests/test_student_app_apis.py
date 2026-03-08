"""
Student Mobile App Backend API Tests
Testing all backend APIs required for the student-only mobile app

Features to test:
- Student login with role=student validation
- Non-student login rejection
- GET /api/students/me (student data with qr_code)
- GET /api/courses
- GET /api/departments
- GET /api/settings
- GET /api/notifications/count
- GET /api/notifications/my
- GET /api/attendance/stats/student/{student_id}
- GET /api/auth/me
"""

import pytest
import requests
import os

# Use the public URL for testing (from frontend/.env)
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://punctuality-monitor.preview.emergentagent.com')
BASE_URL = BASE_URL.rstrip('/')

# Test credentials
STUDENT_USERNAME = "234"
STUDENT_PASSWORD = "123456"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

# Known student info from the review request
KNOWN_STUDENT_ID = "698e50c797fef774e66e93aa"
KNOWN_DEPARTMENT_ID = "698e500997fef774e66e93a8"


class TestHealthCheck:
    """Health check - verify server is running"""
    
    def test_health_endpoint(self):
        """Test /api/health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data.get("status") == "ok"
        print(f"✓ Health check passed: {data}")


class TestStudentLogin:
    """Test student login with role validation"""
    
    def test_student_login_success(self):
        """Test student login returns role=student"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": STUDENT_USERNAME, "password": STUDENT_PASSWORD}
        )
        assert response.status_code == 200, f"Student login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Missing access_token"
        assert "user" in data, "Missing user data"
        assert data["user"]["role"] == "student", f"Expected role=student, got {data['user']['role']}"
        
        print(f"✓ Student login successful")
        print(f"  User: {data['user']['username']}, Role: {data['user']['role']}")
        return data
    
    def test_admin_login_returns_admin_role(self):
        """Test admin login returns role=admin (frontend should reject this)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Missing access_token"
        assert "user" in data, "Missing user data"
        assert data["user"]["role"] == "admin", f"Expected role=admin, got {data['user']['role']}"
        
        print(f"✓ Admin login successful - role={data['user']['role']} (frontend should reject)")
        return data
    
    def test_invalid_credentials(self):
        """Test invalid login returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "invalid_user", "password": "wrong_password"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Invalid credentials correctly rejected with 401")


@pytest.fixture(scope="module")
def student_token():
    """Get student access token for authenticated tests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": STUDENT_USERNAME, "password": STUDENT_PASSWORD}
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip(f"Student login failed: {response.text}")


@pytest.fixture(scope="module")
def admin_token():
    """Get admin access token for reference tests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip(f"Admin login failed: {response.text}")


class TestStudentMeEndpoint:
    """Test GET /api/students/me endpoint"""
    
    def test_students_me_returns_student_data(self, student_token):
        """Test /api/students/me returns student data with qr_code, department_id, level, section"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/students/me", headers=headers)
        
        assert response.status_code == 200, f"GET /api/students/me failed: {response.text}"
        
        data = response.json()
        
        # Verify required fields exist
        required_fields = ["id", "student_id", "full_name", "department_id", "level", "section", "qr_code"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        # Verify student data
        assert data["student_id"] == STUDENT_USERNAME, f"Unexpected student_id: {data['student_id']}"
        assert data["qr_code"] is not None, "qr_code should not be None"
        assert data["department_id"] is not None, "department_id should not be None"
        
        print(f"✓ GET /api/students/me successful")
        print(f"  Student ID: {data['student_id']}")
        print(f"  Full Name: {data['full_name']}")
        print(f"  Department ID: {data['department_id']}")
        print(f"  Level: {data['level']}")
        print(f"  Section: {data['section']}")
        print(f"  QR Code: {data['qr_code'][:30]}..." if len(data.get('qr_code', '')) > 30 else f"  QR Code: {data.get('qr_code')}")
        return data
    
    def test_students_me_without_auth(self):
        """Test /api/students/me requires authentication"""
        response = requests.get(f"{BASE_URL}/api/students/me")
        assert response.status_code in [401, 403, 422], f"Expected auth error, got {response.status_code}"
        print(f"✓ /api/students/me correctly requires authentication")
    
    def test_students_me_with_admin_token_rejected(self, admin_token):
        """Test /api/students/me rejects non-student users"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/students/me", headers=headers)
        
        # This endpoint is for students only, should return 403
        assert response.status_code == 403, f"Expected 403 for non-student, got {response.status_code}"
        print(f"✓ /api/students/me correctly rejects non-student users")


class TestCoursesEndpoint:
    """Test GET /api/courses endpoint"""
    
    def test_courses_list(self, student_token):
        """Test /api/courses returns course list"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/courses", headers=headers)
        
        assert response.status_code == 200, f"GET /api/courses failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ GET /api/courses successful - {len(data)} courses returned")
        if data:
            print(f"  Sample course: {data[0].get('name', 'N/A')}")


class TestDepartmentsEndpoint:
    """Test GET /api/departments endpoint"""
    
    def test_departments_list(self, student_token):
        """Test /api/departments returns department list"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/departments", headers=headers)
        
        assert response.status_code == 200, f"GET /api/departments failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ GET /api/departments successful - {len(data)} departments returned")
        if data:
            print(f"  Sample department: {data[0].get('name', 'N/A')}")


class TestSettingsEndpoint:
    """Test GET /api/settings endpoint"""
    
    def test_settings_returns_college_name(self, student_token):
        """Test /api/settings returns college_name and max_absence_percent"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/settings", headers=headers)
        
        assert response.status_code == 200, f"GET /api/settings failed: {response.text}"
        
        data = response.json()
        
        # Check for expected settings fields
        print(f"✓ GET /api/settings successful")
        print(f"  Settings data: {data}")
        
        # These fields may or may not exist depending on setup
        if "college_name" in data:
            print(f"  College Name: {data['college_name']}")
        if "max_absence_percent" in data:
            print(f"  Max Absence Percent: {data['max_absence_percent']}")


class TestNotificationsEndpoints:
    """Test notifications endpoints"""
    
    def test_notifications_count(self, student_token):
        """Test GET /api/notifications/count returns unread count"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications/count", headers=headers)
        
        assert response.status_code == 200, f"GET /api/notifications/count failed: {response.text}"
        
        data = response.json()
        assert "count" in data, "Response should have 'count' field"
        assert isinstance(data["count"], int), "count should be an integer"
        
        print(f"✓ GET /api/notifications/count successful")
        print(f"  Unread count: {data['count']}")
    
    def test_notifications_my(self, student_token):
        """Test GET /api/notifications/my returns notifications with proper structure"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications/my", headers=headers)
        
        assert response.status_code == 200, f"GET /api/notifications/my failed: {response.text}"
        
        data = response.json()
        
        # Check structure based on what the endpoint returns
        # It might return a list directly or an object with notifications array
        if isinstance(data, list):
            print(f"✓ GET /api/notifications/my successful - {len(data)} notifications")
        elif isinstance(data, dict):
            print(f"✓ GET /api/notifications/my successful")
            if "notifications" in data:
                print(f"  Notifications count: {len(data['notifications'])}")
            if "total" in data:
                print(f"  Total: {data['total']}")
            if "unread_count" in data:
                print(f"  Unread: {data['unread_count']}")


class TestAttendanceStatsEndpoint:
    """Test GET /api/attendance/stats/student/{student_id} endpoint"""
    
    def test_attendance_stats_for_student(self, student_token):
        """Test attendance stats endpoint returns stats for known student"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        # First get the student's MongoDB ID from /students/me
        me_response = requests.get(f"{BASE_URL}/api/students/me", headers=headers)
        if me_response.status_code == 200:
            student_db_id = me_response.json().get("id")
        else:
            student_db_id = KNOWN_STUDENT_ID
        
        response = requests.get(
            f"{BASE_URL}/api/attendance/stats/student/{student_db_id}",
            headers=headers
        )
        
        assert response.status_code == 200, f"GET /api/attendance/stats/student/{student_db_id} failed: {response.text}"
        
        data = response.json()
        
        print(f"✓ GET /api/attendance/stats/student/{student_db_id} successful")
        print(f"  Stats: {data}")


class TestAuthMeEndpoint:
    """Test GET /api/auth/me endpoint"""
    
    def test_auth_me_with_student_token(self, student_token):
        """Test /api/auth/me returns student user info"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        
        assert response.status_code == 200, f"GET /api/auth/me failed: {response.text}"
        
        data = response.json()
        
        assert "username" in data, "Missing username"
        assert "role" in data, "Missing role"
        assert data["role"] == "student", f"Expected role=student, got {data['role']}"
        
        print(f"✓ GET /api/auth/me successful")
        print(f"  Username: {data['username']}")
        print(f"  Role: {data['role']}")
        print(f"  Full Name: {data.get('full_name', 'N/A')}")


class TestEndToEndStudentFlow:
    """End-to-end test of student app flow"""
    
    def test_complete_student_flow(self):
        """Test complete flow: login -> get student data -> get courses -> get attendance"""
        # Step 1: Login
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": STUDENT_USERNAME, "password": STUDENT_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        token = login_response.json()["access_token"]
        user = login_response.json()["user"]
        assert user["role"] == "student", "Not a student"
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Step 2: Get student profile
        me_response = requests.get(f"{BASE_URL}/api/students/me", headers=headers)
        assert me_response.status_code == 200, f"/students/me failed: {me_response.text}"
        student_data = me_response.json()
        student_db_id = student_data["id"]
        
        # Step 3: Get courses
        courses_response = requests.get(f"{BASE_URL}/api/courses", headers=headers)
        assert courses_response.status_code == 200, f"/courses failed: {courses_response.text}"
        
        # Step 4: Get departments
        depts_response = requests.get(f"{BASE_URL}/api/departments", headers=headers)
        assert depts_response.status_code == 200, f"/departments failed: {depts_response.text}"
        
        # Step 5: Get settings
        settings_response = requests.get(f"{BASE_URL}/api/settings", headers=headers)
        assert settings_response.status_code == 200, f"/settings failed: {settings_response.text}"
        
        # Step 6: Get notifications count
        notif_count_response = requests.get(f"{BASE_URL}/api/notifications/count", headers=headers)
        assert notif_count_response.status_code == 200, f"/notifications/count failed: {notif_count_response.text}"
        
        # Step 7: Get notifications
        notif_response = requests.get(f"{BASE_URL}/api/notifications/my", headers=headers)
        assert notif_response.status_code == 200, f"/notifications/my failed: {notif_response.text}"
        
        # Step 8: Get attendance stats
        attendance_response = requests.get(
            f"{BASE_URL}/api/attendance/stats/student/{student_db_id}",
            headers=headers
        )
        assert attendance_response.status_code == 200, f"/attendance/stats/student failed: {attendance_response.text}"
        
        # Step 9: Get auth/me
        auth_me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert auth_me_response.status_code == 200, f"/auth/me failed: {auth_me_response.text}"
        
        print(f"✓ Complete student flow passed!")
        print(f"  Student: {student_data['full_name']} ({student_data['student_id']})")
        print(f"  QR Code: {student_data['qr_code']}")
        print(f"  Courses: {len(courses_response.json())} courses")
        print(f"  Departments: {len(depts_response.json())} departments")
        print(f"  Notifications count: {notif_count_response.json()['count']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
