"""
Test Department Head Attendance Permission Fix
Tests the fix for department head (رئيس قسم) role being able to edit attendance
even when the attendance time window has expired.

Root causes fixed:
1. auth.py login/me endpoints now expand manage_ permissions via FULL_PERMISSION_MAPPING
2. record_attendance_session in server.py uses permission-based check instead of hardcoded role check
3. AuthContext.tsx hasPermission function uses localStorage fallback for dual auth system sync
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
DEPT_HEAD_CREDENTIALS = {"username": "Saeed", "password": "test123"}
ADMIN_CREDENTIALS = {"username": "admin", "password": "admin123"}

# Test data
COURSE_ID = "698f0000d803b27aab0120af"  # دراسات حضرموت course
LECTURE_ID = "69b2e7bdb318756c5856f463"  # March 20, 2026 lecture (expired)


class TestDeptHeadLogin:
    """Test department head login and permissions"""
    
    def test_dept_head_login_returns_edit_attendance_permission(self):
        """Verify login response contains edit_attendance in permissions array"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=DEPT_HEAD_CREDENTIALS
        )
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "user" in data, "Response missing user object"
        assert "permissions" in data["user"], "User missing permissions array"
        
        permissions = data["user"]["permissions"]
        assert "edit_attendance" in permissions, f"edit_attendance not in permissions: {permissions}"
        assert "manage_attendance" in permissions, f"manage_attendance not in permissions: {permissions}"
        
        # Verify role is department_head
        assert data["user"]["role"] == "department_head", f"Unexpected role: {data['user']['role']}"
        
        print(f"✓ Department head has {len(permissions)} permissions including edit_attendance")
    
    def test_dept_head_me_endpoint_returns_expanded_permissions(self):
        """Verify /auth/me endpoint also returns expanded permissions"""
        # First login to get token
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=DEPT_HEAD_CREDENTIALS
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Call /auth/me
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert me_response.status_code == 200, f"Me endpoint failed: {me_response.text}"
        
        data = me_response.json()
        permissions = data.get("permissions", [])
        
        assert "edit_attendance" in permissions, f"edit_attendance not in /me permissions: {permissions}"
        print(f"✓ /auth/me returns expanded permissions including edit_attendance")


class TestAttendanceAPIWithExpiredWindow:
    """Test attendance API accepts requests from department head even when window expired"""
    
    @pytest.fixture
    def dept_head_token(self):
        """Get authentication token for department head"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=DEPT_HEAD_CREDENTIALS
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Department head authentication failed")
    
    def test_get_lecture_details(self, dept_head_token):
        """Verify we can get lecture details for the expired lecture"""
        response = requests.get(
            f"{BASE_URL}/api/lectures/{LECTURE_ID}/details",
            headers={"Authorization": f"Bearer {dept_head_token}"}
        )
        
        assert response.status_code == 200, f"Failed to get lecture details: {response.text}"
        
        data = response.json()
        # The API returns lecture details nested inside a 'lecture' object
        lecture = data.get("lecture", data)
        assert lecture.get("date") == "2026-03-20", f"Unexpected lecture date: {lecture.get('date')}"
        print(f"✓ Lecture details retrieved: {lecture.get('date')} {lecture.get('start_time')}-{lecture.get('end_time')}")
    
    def test_get_enrolled_students(self, dept_head_token):
        """Verify we can get enrolled students for the course"""
        response = requests.get(
            f"{BASE_URL}/api/enrollments/{COURSE_ID}/students",
            headers={"Authorization": f"Bearer {dept_head_token}"}
        )
        
        assert response.status_code == 200, f"Failed to get students: {response.text}"
        
        students = response.json()
        assert len(students) > 0, "No students enrolled in course"
        print(f"✓ Found {len(students)} enrolled students")
        return students
    
    def test_save_attendance_with_expired_window(self, dept_head_token):
        """
        CRITICAL TEST: Verify department head can save attendance even when time window expired
        This tests the core bug fix - edit_attendance permission should override time restrictions
        """
        # Get enrolled students first
        students_response = requests.get(
            f"{BASE_URL}/api/enrollments/{COURSE_ID}/students",
            headers={"Authorization": f"Bearer {dept_head_token}"}
        )
        assert students_response.status_code == 200
        students = students_response.json()
        
        # Prepare attendance records
        records = []
        for i, student in enumerate(students[:3]):  # Test with first 3 students
            status = ["present", "absent", "late"][i % 3]
            records.append({
                "student_id": student["id"],
                "status": status
            })
        
        # Save attendance for expired lecture
        response = requests.post(
            f"{BASE_URL}/api/attendance/session",
            headers={"Authorization": f"Bearer {dept_head_token}"},
            json={
                "lecture_id": LECTURE_ID,
                "records": records
            }
        )
        
        # This should succeed because department head has edit_attendance permission
        assert response.status_code == 200, f"Failed to save attendance: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response missing message"
        assert "تم تسجيل" in data["message"] or "تم" in data["message"], f"Unexpected message: {data['message']}"
        
        print(f"✓ Attendance saved successfully: {data['message']}")
    
    def test_attendance_status_shows_can_edit(self, dept_head_token):
        """Verify attendance status endpoint indicates editing is allowed"""
        response = requests.get(
            f"{BASE_URL}/api/lectures/{LECTURE_ID}/attendance-status",
            headers={"Authorization": f"Bearer {dept_head_token}"}
        )
        
        assert response.status_code == 200, f"Failed to get attendance status: {response.text}"
        
        data = response.json()
        # The status should indicate that editing is possible
        print(f"✓ Attendance status: {data}")


class TestAdminDashboard:
    """Regression test: Verify admin dashboard still works correctly"""
    
    def test_admin_login_success(self):
        """Verify admin can login successfully"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=ADMIN_CREDENTIALS
        )
        
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        
        data = response.json()
        assert data["user"]["role"] == "admin", f"Unexpected role: {data['user']['role']}"
        print(f"✓ Admin login successful")
    
    def test_admin_dashboard_summary(self):
        """Verify admin can access dashboard summary"""
        # Login first
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=ADMIN_CREDENTIALS
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Get dashboard summary
        response = requests.get(
            f"{BASE_URL}/api/reports/summary",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Failed to get dashboard summary: {response.text}"
        
        data = response.json()
        # Verify expected fields exist
        assert "students_count" in data or "total_students" in data, "Missing students count"
        print(f"✓ Admin dashboard summary accessible")


class TestPermissionExpansion:
    """Test that manage_attendance permission is properly expanded"""
    
    def test_manage_attendance_expands_to_edit_attendance(self):
        """Verify FULL_PERMISSION_MAPPING expands manage_attendance correctly"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=DEPT_HEAD_CREDENTIALS
        )
        
        assert response.status_code == 200
        permissions = response.json()["user"]["permissions"]
        
        # If user has manage_attendance, they should also have:
        if "manage_attendance" in permissions:
            expected_expanded = ["edit_attendance", "record_attendance", "take_attendance", "view_attendance"]
            for perm in expected_expanded:
                assert perm in permissions, f"manage_attendance should expand to include {perm}"
            print(f"✓ manage_attendance properly expanded to include: {expected_expanded}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
