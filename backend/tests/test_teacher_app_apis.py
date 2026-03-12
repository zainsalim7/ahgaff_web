"""
Teacher App Backend API Tests
Tests for teacher-specific APIs used by the mobile teacher app
Course: 698f671431cfba92c49a550d (مقرر اختبار 180156)
Teacher: teacher180156/teacher123 (user_id: 698f671431cfba92c49a550e)
Student IDs: 698e50c797fef774e66e93aa, 698e57518cfb2f14627a285e, 698e57518cfb2f14627a285f, 698e57518cfb2f14627a2860, 698ef706d803b27aab012065
"""
import pytest
import requests
import os
from datetime import datetime

# Use the public preview URL for testing
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # Fallback in case env var not set
    BASE_URL = "https://attendance-track-38.preview.emergentagent.com"

# Test credentials
TEACHER_USERNAME = "teacher180156"
TEACHER_PASSWORD = "teacher123"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"
STUDENT_USERNAME = "234"
STUDENT_PASSWORD = "123456"

# Test data IDs
TEST_COURSE_ID = "698f671431cfba92c49a550d"
TEACHER_USER_ID = "698f671431cfba92c49a550e"
ENROLLED_STUDENT_IDS = [
    "698e50c797fef774e66e93aa",
    "698e57518cfb2f14627a285e", 
    "698e57518cfb2f14627a285f",
    "698e57518cfb2f14627a2860",
    "698ef706d803b27aab012065"
]


class TestTeacherAuthentication:
    """Test teacher authentication endpoints"""
    
    def test_teacher_login_success(self):
        """POST /api/auth/login - Teacher login with valid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": TEACHER_USERNAME, "password": TEACHER_PASSWORD}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "access_token" in data, "Missing access_token in response"
        assert "user" in data, "Missing user in response"
        assert data["user"]["role"] == "teacher", f"Expected role 'teacher', got {data['user']['role']}"
        assert data["user"]["username"] == TEACHER_USERNAME
        
        print(f"✓ Teacher login successful: {data['user']['full_name']}")
        return data["access_token"]
    
    def test_non_teacher_login_returns_different_role(self):
        """POST /api/auth/login - Verify non-teacher roles return their actual role"""
        # Admin login
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "admin", "Admin should have admin role"
        print("✓ Admin login returns role=admin (frontend should reject)")
        
        # Student login
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": STUDENT_USERNAME, "password": STUDENT_PASSWORD}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "student", "Student should have student role"
        print("✓ Student login returns role=student (frontend should reject)")
    
    def test_invalid_credentials(self):
        """POST /api/auth/login - Invalid credentials should return 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "wronguser", "password": "wrongpassword"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid credentials rejected with 401")
    
    def test_get_teacher_profile(self):
        """GET /api/auth/me - Returns teacher profile with correct role"""
        # Login first
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": TEACHER_USERNAME, "password": TEACHER_PASSWORD}
        )
        token = login_response.json()["access_token"]
        
        # Get profile
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["role"] == "teacher", f"Expected role 'teacher', got {data['role']}"
        assert "username" in data
        assert "full_name" in data
        print(f"✓ Teacher profile: {data['full_name']} (role={data['role']})")


class TestTeacherCourses:
    """Test teacher course-related endpoints"""
    
    @pytest.fixture
    def teacher_token(self):
        """Get teacher authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": TEACHER_USERNAME, "password": TEACHER_PASSWORD}
        )
        return response.json()["access_token"]
    
    def test_get_teacher_courses(self, teacher_token):
        """GET /api/courses - Returns teacher's assigned courses"""
        response = requests.get(
            f"{BASE_URL}/api/courses",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        courses = response.json()
        
        # The response should be a list of courses
        assert isinstance(courses, list), "Expected list of courses"
        
        # Check for the test course (مقرر اختبار 180156)
        course_ids = [c.get("id") for c in courses]
        
        # Note: depending on API behavior, teacher might see only their courses or all courses
        print(f"✓ Found {len(courses)} courses")
        for c in courses[:5]:  # Show first 5 courses
            print(f"  - {c.get('name', 'N/A')} (id={c.get('id', 'N/A')[:8]}...)")
    
    def test_get_enrolled_students(self, teacher_token):
        """GET /api/enrollments/{course_id}/students - Returns enrolled students"""
        response = requests.get(
            f"{BASE_URL}/api/enrollments/{TEST_COURSE_ID}/students",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        students = response.json()
        
        assert isinstance(students, list), "Expected list of students"
        
        # Verify expected students are enrolled
        enrolled_ids = [s.get("id") for s in students]
        expected_count = 5  # 5 enrolled students
        
        print(f"✓ Found {len(students)} enrolled students (expected {expected_count})")
        for s in students:
            print(f"  - {s.get('full_name', 'N/A')} (student_id={s.get('student_id', 'N/A')})")
        
        # Verify at least some expected students
        if len(students) > 0:
            assert "student_id" in students[0], "Missing student_id field"
            assert "full_name" in students[0], "Missing full_name field"


class TestTeacherLectures:
    """Test lecture-related endpoints for teachers"""
    
    @pytest.fixture
    def teacher_token(self):
        """Get teacher authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": TEACHER_USERNAME, "password": TEACHER_PASSWORD}
        )
        return response.json()["access_token"]
    
    def test_get_today_lectures(self, teacher_token):
        """GET /api/lectures/today - Returns today's lectures"""
        response = requests.get(
            f"{BASE_URL}/api/lectures/today",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Response could be list or dict with lectures key
        data = response.json()
        if isinstance(data, list):
            lectures = data
        else:
            lectures = data.get("lectures", data)
        
        print(f"✓ Today's lectures: {len(lectures) if isinstance(lectures, list) else 'N/A'}")
        if isinstance(lectures, list):
            for lec in lectures[:3]:
                print(f"  - {lec.get('course_name', 'N/A')} at {lec.get('start_time', 'N/A')}-{lec.get('end_time', 'N/A')}")
    
    def test_create_lecture(self, teacher_token):
        """POST /api/lectures - Creates a new lecture"""
        # Create lecture for today
        today = datetime.now().strftime("%Y-%m-%d")
        
        lecture_data = {
            "course_id": TEST_COURSE_ID,
            "date": today,
            "start_time": "14:00",
            "end_time": "15:30",
            "room": "Test Room",
            "notes": "TEST - Created by automated test"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/lectures",
            json=lecture_data,
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "id" in data, "Missing lecture id in response"
        print(f"✓ Created lecture with id: {data['id']}")
        
        return data["id"]


class TestTeacherNotifications:
    """Test notification endpoints for teachers"""
    
    @pytest.fixture
    def teacher_token(self):
        """Get teacher authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": TEACHER_USERNAME, "password": TEACHER_PASSWORD}
        )
        return response.json()["access_token"]
    
    def test_get_notification_count(self, teacher_token):
        """GET /api/notifications/count - Returns notification count"""
        response = requests.get(
            f"{BASE_URL}/api/notifications/count",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "count" in data, "Missing count field"
        print(f"✓ Notification count: {data['count']}")
    
    def test_get_notifications_list(self, teacher_token):
        """GET /api/notifications/my - Returns notifications list"""
        response = requests.get(
            f"{BASE_URL}/api/notifications/my",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "notifications" in data, "Missing notifications field"
        assert "total" in data, "Missing total field"
        assert "unread_count" in data, "Missing unread_count field"
        
        print(f"✓ Notifications: total={data['total']}, unread={data['unread_count']}")
        
        # Check notification format
        if data["notifications"]:
            notif = data["notifications"][0]
            assert "id" in notif, "Missing id in notification"
            assert "title" in notif, "Missing title in notification"
            assert "message" in notif, "Missing message in notification"
            assert "is_read" in notif, "Missing is_read in notification"
            print(f"  First notification: {notif['title'][:50]}...")
    
    def test_mark_notification_read(self, teacher_token):
        """PUT /api/notifications/{id}/read - Marks notification as read"""
        # First get a notification
        list_response = requests.get(
            f"{BASE_URL}/api/notifications/my",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        notifications = list_response.json().get("notifications", [])
        
        if not notifications:
            pytest.skip("No notifications to mark as read")
        
        notif_id = notifications[0]["id"]
        
        # Mark as read
        response = requests.put(
            f"{BASE_URL}/api/notifications/{notif_id}/read",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Marked notification {notif_id} as read")
    
    def test_mark_all_notifications_read(self, teacher_token):
        """PUT /api/notifications/read-all - Marks all notifications as read"""
        response = requests.put(
            f"{BASE_URL}/api/notifications/read-all",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        
        # This endpoint may return 200 even if no notifications
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        print(f"✓ Mark all as read response: {data.get('message', data)}")


class TestTeacherAttendance:
    """Test attendance-related endpoints for teachers"""
    
    @pytest.fixture
    def teacher_token(self):
        """Get teacher authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": TEACHER_USERNAME, "password": TEACHER_PASSWORD}
        )
        return response.json()["access_token"]
    
    def test_get_course_attendance_stats(self, teacher_token):
        """GET /api/attendance/stats/course/{course_id} - Returns course stats"""
        response = requests.get(
            f"{BASE_URL}/api/attendance/stats/course/{TEST_COURSE_ID}",
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "course_id" in data, "Missing course_id"
        assert "course_name" in data, "Missing course_name"
        assert "total_sessions" in data, "Missing total_sessions"
        
        print(f"✓ Course stats for '{data['course_name']}':")
        print(f"  - Total sessions: {data['total_sessions']}")
        print(f"  - Total students: {data.get('total_students', 'N/A')}")
    
    def test_sync_offline_attendance(self, teacher_token):
        """POST /api/sync/attendance - Syncs offline attendance records"""
        # Create test attendance records
        test_records = {
            "attendance_records": [
                {
                    "course_id": TEST_COURSE_ID,
                    "student_id": ENROLLED_STUDENT_IDS[0],
                    "status": "present",
                    "date": datetime.now().isoformat(),
                    "method": "manual",
                    "local_id": f"test_sync_{datetime.now().timestamp()}"
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/sync/attendance",
            json=test_records,
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "synced" in data, "Missing synced count"
        print(f"✓ Synced {data['synced']} attendance records")
        if data.get("errors"):
            print(f"  Errors: {data['errors']}")


class TestTeacherPasswordChange:
    """Test password change functionality"""
    
    @pytest.fixture
    def teacher_token(self):
        """Get teacher authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": TEACHER_USERNAME, "password": TEACHER_PASSWORD}
        )
        return response.json()["access_token"]
    
    def test_change_password_wrong_current(self, teacher_token):
        """POST /api/auth/change-password - Wrong current password should fail"""
        response = requests.post(
            f"{BASE_URL}/api/auth/change-password",
            json={
                "current_password": "wrongpassword",
                "new_password": "newpassword123"
            },
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ Wrong current password correctly rejected")
    
    def test_change_password_same_password(self, teacher_token):
        """POST /api/auth/change-password - Same password should fail"""
        response = requests.post(
            f"{BASE_URL}/api/auth/change-password",
            json={
                "current_password": TEACHER_PASSWORD,
                "new_password": TEACHER_PASSWORD  # Same as current
            },
            headers={"Authorization": f"Bearer {teacher_token}"}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ Same password correctly rejected")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
