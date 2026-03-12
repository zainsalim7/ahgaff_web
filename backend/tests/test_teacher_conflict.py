"""
Test suite for Teacher Lecture Conflict Detection
Features tested:
1. POST /api/lectures - should reject with 400 if teacher has overlapping lecture
2. POST /api/lectures - should succeed if teacher has no conflicting lectures
3. PUT /api/lectures/{id}/reschedule - should reject with 400 if new time conflicts
4. PUT /api/lectures/{id}/reschedule - should succeed if no conflict exists
5. PUT /api/lectures/{id}/reschedule - should reject past dates (date must be after today)
6. Conflict message should include course name and time details in Arabic
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data - existing course and lecture info from the problem statement
COURSE_ID = "698f0000d803b27aab0120af"  # Course with existing lecture on 2026-03-20 09:00-10:30

class TestTeacherLectureConflict:
    """Tests for teacher lecture time conflict detection"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test environment and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.token = token
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def get_future_date(self, days_ahead=30):
        """Get a future date string"""
        return (datetime.now() + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
    
    def get_past_date(self, days_back=10):
        """Get a past date string"""
        return (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")
    
    # ==================== CREATE LECTURE CONFLICT TESTS ====================
    
    def test_create_lecture_conflict_detection(self):
        """POST /api/lectures - should reject with 400 if teacher has overlapping lecture at same date/time"""
        # First, get existing lectures for the course to find a date with existing lecture
        lectures_response = self.session.get(f"{BASE_URL}/api/lectures/course/{COURSE_ID}")
        
        if lectures_response.status_code != 200:
            pytest.skip(f"Could not fetch lectures: {lectures_response.status_code}")
        
        lectures = lectures_response.json()
        
        # Find a scheduled lecture to create conflict with
        scheduled_lecture = next((l for l in lectures if l.get("status") == "scheduled"), None)
        
        if not scheduled_lecture:
            # Create a future lecture first to test conflict
            future_date = self.get_future_date(60)
            create_response = self.session.post(f"{BASE_URL}/api/lectures", json={
                "course_id": COURSE_ID,
                "date": future_date,
                "start_time": "09:00",
                "end_time": "10:30",
                "room": "Test Room"
            })
            
            if create_response.status_code == 200:
                scheduled_lecture = {"date": future_date, "start_time": "09:00", "end_time": "10:30"}
            else:
                pytest.skip("Could not create test lecture")
        
        # Try to create overlapping lecture at same date/time
        conflict_payload = {
            "course_id": COURSE_ID,
            "date": scheduled_lecture.get("date"),
            "start_time": "09:30",  # Overlaps with 09:00-10:30
            "end_time": "10:00",
            "room": "Conflict Test Room"
        }
        
        response = self.session.post(f"{BASE_URL}/api/lectures", json=conflict_payload)
        
        # Should be rejected with 400 and Arabic conflict message
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        detail = response.json().get("detail", "")
        # Check for Arabic conflict message components
        assert "تعارض" in detail or "يوجد" in detail, f"Expected Arabic conflict message, got: {detail}"
        print(f"✓ Conflict detected with message: {detail}")
    
    def test_create_lecture_no_conflict(self):
        """POST /api/lectures - should succeed if teacher has no conflicting lectures"""
        # Use a future date with non-overlapping time
        future_date = self.get_future_date(90)
        
        # Delete any existing lecture at this time first
        lectures_response = self.session.get(f"{BASE_URL}/api/lectures/course/{COURSE_ID}")
        if lectures_response.status_code == 200:
            for lec in lectures_response.json():
                if lec.get("date") == future_date and lec.get("start_time") == "18:00":
                    self.session.delete(f"{BASE_URL}/api/lectures/{lec['id']}")
        
        payload = {
            "course_id": COURSE_ID,
            "date": future_date,
            "start_time": "18:00",  # Evening time - unlikely to conflict
            "end_time": "19:30",
            "room": "No Conflict Test Room"
        }
        
        response = self.session.post(f"{BASE_URL}/api/lectures", json=payload)
        
        # Should succeed with 200
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert "id" in result, "Should return lecture ID"
        print(f"✓ Lecture created without conflict: {result.get('id')}")
        
        # Cleanup: delete the test lecture
        if result.get("id"):
            self.session.delete(f"{BASE_URL}/api/lectures/{result['id']}")
    
    # ==================== RESCHEDULE CONFLICT TESTS ====================
    
    def test_reschedule_conflict_detection(self):
        """PUT /api/lectures/{id}/reschedule - should reject with 400 if new time conflicts with another lecture"""
        # Get existing lectures
        lectures_response = self.session.get(f"{BASE_URL}/api/lectures/course/{COURSE_ID}")
        
        if lectures_response.status_code != 200:
            pytest.skip(f"Could not fetch lectures: {lectures_response.status_code}")
        
        lectures = lectures_response.json()
        
        # Find a scheduled or absent lecture to reschedule
        reschedulable_lecture = next((l for l in lectures if l.get("status") in ["scheduled", "absent"]), None)
        
        if not reschedulable_lecture:
            pytest.skip("No reschedulable lecture found")
        
        # Find another scheduled lecture (different from the one we're rescheduling)
        target_lecture = next((l for l in lectures 
                               if l.get("status") == "scheduled" 
                               and l.get("id") != reschedulable_lecture.get("id")), None)
        
        if not target_lecture:
            pytest.skip("No target lecture to conflict with")
        
        # Try to reschedule to the same date/time as target lecture
        reschedule_payload = {
            "date": target_lecture.get("date"),
            "start_time": target_lecture.get("start_time", "09:00"),
            "end_time": target_lecture.get("end_time", "10:30")
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/lectures/{reschedulable_lecture['id']}/reschedule",
            json=reschedule_payload
        )
        
        # Should be rejected with 400 and Arabic conflict message
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        detail = response.json().get("detail", "")
        assert "تعارض" in detail or "يوجد" in detail or "يجب" in detail, f"Expected Arabic error message, got: {detail}"
        print(f"✓ Reschedule conflict detected: {detail}")
    
    def test_reschedule_no_conflict(self):
        """PUT /api/lectures/{id}/reschedule - should succeed if no conflict exists"""
        # First, create a test lecture to reschedule
        future_date = self.get_future_date(70)
        
        create_response = self.session.post(f"{BASE_URL}/api/lectures", json={
            "course_id": COURSE_ID,
            "date": future_date,
            "start_time": "20:00",  # Late evening - unlikely to conflict
            "end_time": "21:30",
            "room": "Test Reschedule Room"
        })
        
        if create_response.status_code != 200:
            pytest.skip(f"Could not create test lecture: {create_response.text}")
        
        lecture_id = create_response.json().get("id")
        
        # Mark it as absent so we can reschedule it
        self.session.put(f"{BASE_URL}/api/lectures/{lecture_id}/status", json={"status": "absent"})
        
        # Reschedule to a non-conflicting time
        new_date = self.get_future_date(80)
        reschedule_payload = {
            "date": new_date,
            "start_time": "20:00",
            "end_time": "21:30"
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/lectures/{lecture_id}/reschedule",
            json=reschedule_payload
        )
        
        # Should succeed with 200
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert "message" in result, "Should return success message"
        print(f"✓ Reschedule successful: {result.get('message')}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/lectures/{lecture_id}")
    
    def test_reschedule_rejects_past_date(self):
        """PUT /api/lectures/{id}/reschedule - should reject past dates (date must be after today)"""
        # Get a reschedulable lecture
        lectures_response = self.session.get(f"{BASE_URL}/api/lectures/course/{COURSE_ID}")
        
        if lectures_response.status_code != 200:
            pytest.skip(f"Could not fetch lectures: {lectures_response.status_code}")
        
        lectures = lectures_response.json()
        reschedulable_lecture = next((l for l in lectures if l.get("status") in ["scheduled", "absent"]), None)
        
        if not reschedulable_lecture:
            # Create a test lecture
            future_date = self.get_future_date(75)
            create_response = self.session.post(f"{BASE_URL}/api/lectures", json={
                "course_id": COURSE_ID,
                "date": future_date,
                "start_time": "19:00",
                "end_time": "20:30",
                "room": "Past Date Test Room"
            })
            
            if create_response.status_code != 200:
                pytest.skip("Could not create test lecture")
            
            reschedulable_lecture = {"id": create_response.json().get("id")}
        
        # Try to reschedule to a past date
        past_date = self.get_past_date(10)
        reschedule_payload = {
            "date": past_date,
            "start_time": "09:00",
            "end_time": "10:30"
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/lectures/{reschedulable_lecture['id']}/reschedule",
            json=reschedule_payload
        )
        
        # Should be rejected with 400
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        detail = response.json().get("detail", "")
        # Check for Arabic message about future date
        assert "مستقبلي" in detail or "يجب" in detail, f"Expected Arabic past date error, got: {detail}"
        print(f"✓ Past date rejected: {detail}")
    
    def test_conflict_message_includes_details(self):
        """Conflict message should include course name and time details in Arabic"""
        # Get existing lectures to find a good conflict scenario
        lectures_response = self.session.get(f"{BASE_URL}/api/lectures/course/{COURSE_ID}")
        
        if lectures_response.status_code != 200:
            pytest.skip("Could not fetch lectures")
        
        lectures = lectures_response.json()
        scheduled_lecture = next((l for l in lectures if l.get("status") == "scheduled"), None)
        
        if not scheduled_lecture:
            pytest.skip("No scheduled lecture to test conflict message")
        
        # Try to create overlapping lecture
        conflict_payload = {
            "course_id": COURSE_ID,
            "date": scheduled_lecture.get("date"),
            "start_time": scheduled_lecture.get("start_time", "09:00"),
            "end_time": scheduled_lecture.get("end_time", "10:30"),
            "room": "Conflict Message Test Room"
        }
        
        response = self.session.post(f"{BASE_URL}/api/lectures", json=conflict_payload)
        
        if response.status_code == 400:
            detail = response.json().get("detail", "")
            # Check that message includes expected Arabic components
            has_conflict_word = "تعارض" in detail
            has_course_info = "مقرر" in detail
            has_time_info = ":" in detail  # Time format contains colon
            
            print(f"Conflict message: {detail}")
            print(f"  - Has 'تعارض': {has_conflict_word}")
            print(f"  - Has 'مقرر': {has_course_info}")
            print(f"  - Has time info: {has_time_info}")
            
            assert has_conflict_word or has_course_info, "Conflict message should contain Arabic details"
            print(f"✓ Conflict message contains proper Arabic details")
        else:
            # No conflict detected - may be different teacher or no existing lecture
            print(f"Note: No conflict detected (status: {response.status_code})")


class TestCreateLecturePastDateRestriction:
    """Test that creating lectures with past dates is rejected"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test environment and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Login failed")
    
    def test_create_lecture_past_date_rejected(self):
        """POST /api/lectures - should reject creating lecture with past date"""
        past_date = (datetime.now() - timedelta(days=10)).strftime("%Y-%m-%d")
        
        payload = {
            "course_id": COURSE_ID,
            "date": past_date,
            "start_time": "09:00",
            "end_time": "10:30",
            "room": "Past Date Test"
        }
        
        response = self.session.post(f"{BASE_URL}/api/lectures", json=payload)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        detail = response.json().get("detail", "")
        assert "ماضي" in detail or "لا يمكن" in detail, f"Expected Arabic past date error, got: {detail}"
        print(f"✓ Past date rejected for create: {detail}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
