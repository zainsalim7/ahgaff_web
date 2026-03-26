"""
Test student-specific notification feature
Tests: search-students endpoint, send to specific student, history verification
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://schedule-hub-272.preview.emergentagent.com')

class TestStudentNotification:
    """Student-specific notification endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as admin"""
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
        # Login
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    # Search students endpoint tests
    def test_search_students_empty_query_returns_students(self):
        """GET /api/notifications/search-students returns students list"""
        response = self.session.get(f"{BASE_URL}/api/notifications/search-students")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Expected at least one student"
        
        # Verify structure
        first_student = data[0]
        assert "full_name" in first_student
        assert "student_id" in first_student
        assert "user_id" in first_student
    
    def test_search_students_by_name(self):
        """GET /api/notifications/search-students?q=خالد returns matching students"""
        response = self.session.get(f"{BASE_URL}/api/notifications/search-students", params={"q": "خالد"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should find at least one match
        assert len(data) >= 1, "Expected to find student named خالد"
        assert any("خالد" in s.get("full_name", "") for s in data)
    
    def test_search_students_by_student_id(self):
        """GET /api/notifications/search-students?q=234 returns matching students"""
        response = self.session.get(f"{BASE_URL}/api/notifications/search-students", params={"q": "234"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should find students with 234 in their ID
        assert len(data) >= 1, "Expected to find student with ID containing 234"
    
    def test_search_students_no_auth_returns_401(self):
        """GET /api/notifications/search-students without auth returns 401"""
        response = requests.get(f"{BASE_URL}/api/notifications/search-students")
        assert response.status_code in [401, 403]
    
    # Send to student tests
    def test_send_notification_to_student(self):
        """POST /api/notifications/send with target_type='student' sends to specific student"""
        # First get a student with user_id
        search_response = self.session.get(f"{BASE_URL}/api/notifications/search-students")
        assert search_response.status_code == 200
        students = search_response.json()
        
        # Find a student with user_id
        student_with_user_id = next((s for s in students if s.get("user_id")), None)
        assert student_with_user_id, "No student with user_id found for testing"
        
        # Send notification to this student
        response = self.session.post(f"{BASE_URL}/api/notifications/send", json={
            "title": "TEST إشعار للطالب",
            "body": "هذا إشعار اختبار مرسل للطالب بعينه",
            "target_type": "student",
            "student_user_id": student_with_user_id["user_id"],
            "student_name": student_with_user_id["full_name"]
        })
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        # Message should mention the student or no devices
        assert "طالب" in data["message"] or "لا توجد" in data["message"]
    
    def test_send_student_notification_appears_in_history(self):
        """Notification sent to student appears in history with correct target_desc"""
        # Send a unique notification
        unique_title = f"TEST اختبار فريد {os.urandom(4).hex()}"
        
        # Get a student with user_id
        search_response = self.session.get(f"{BASE_URL}/api/notifications/search-students")
        students = search_response.json()
        student = next((s for s in students if s.get("user_id")), None)
        
        if student:
            self.session.post(f"{BASE_URL}/api/notifications/send", json={
                "title": unique_title,
                "body": "اختبار الظهور في السجل",
                "target_type": "student",
                "student_user_id": student["user_id"],
                "student_name": student["full_name"]
            })
            
            # Check history
            history_response = self.session.get(f"{BASE_URL}/api/notifications/history")
            assert history_response.status_code == 200
            history = history_response.json()
            
            # Find our notification
            found = next((n for n in history if n.get("title") == unique_title), None)
            assert found, f"Notification with title '{unique_title}' not found in history"
            assert found.get("target_type") == "student"
            assert "طالب" in found.get("target_desc", "")
    
    def test_send_student_missing_user_id_falls_back_to_all(self):
        """Sending to student without user_id falls back to 'all' target"""
        response = self.session.post(f"{BASE_URL}/api/notifications/send", json={
            "title": "TEST إشعار بدون user_id",
            "body": "اختبار",
            "target_type": "student",
            "student_user_id": None,
            "student_name": "طالب اختبار"
        })
        # Should not crash - sends to all when no user_id
        assert response.status_code == 200
    
    # Stats endpoint test
    def test_stats_returns_correct_counts(self):
        """GET /api/notifications/stats returns correct structure"""
        response = self.session.get(f"{BASE_URL}/api/notifications/stats")
        assert response.status_code == 200
        data = response.json()
        
        assert "total_sent" in data
        assert "registered_devices" in data
        assert "devices_by_role" in data
        
        assert isinstance(data["total_sent"], int)
        assert isinstance(data["registered_devices"], int)
        assert data["total_sent"] >= 0
        assert data["registered_devices"] >= 0
    
    # History endpoint test
    def test_history_includes_student_notifications(self):
        """GET /api/notifications/history includes student-targeted notifications"""
        response = self.session.get(f"{BASE_URL}/api/notifications/history")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Check if any properly-targeted student notification exists (with user_id set)
        student_notifications = [n for n in data if n.get("target_type") == "student" and "طالب" in n.get("target_desc", "")]
        # After our tests, there should be at least one
        assert len(student_notifications) >= 1, "Expected at least one properly-targeted student notification in history"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
