"""
Test Schedule API - /api/lectures/all-schedule endpoint
Tests the refactored schedule page that loads lectures by date
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://schedule-hub-272.preview.emergentagent.com').rstrip('/')


class TestScheduleAPI:
    """Tests for the /api/lectures/all-schedule endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_01_schedule_no_date_defaults_to_today(self):
        """GET /api/lectures/all-schedule without date param defaults to today"""
        response = requests.get(
            f"{BASE_URL}/api/lectures/all-schedule",
            headers=self.headers
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        assert "lectures" in data, "Response missing 'lectures' field"
        assert "date" in data, "Response missing 'date' field"
        assert "total" in data, "Response missing 'total' field"
        
        # Verify date is today (Yemen timezone UTC+3)
        today = datetime.utcnow() + timedelta(hours=3)
        expected_date = today.strftime("%Y-%m-%d")
        assert data["date"] == expected_date, f"Expected date {expected_date}, got {data['date']}"
        
        # Verify total matches lectures count
        assert data["total"] == len(data["lectures"]), "Total doesn't match lectures count"
        print(f"✓ Today's date: {data['date']}, Lectures: {data['total']}")
    
    def test_02_schedule_with_specific_date(self):
        """GET /api/lectures/all-schedule?date=2026-04-06 returns lectures for that date"""
        response = requests.get(
            f"{BASE_URL}/api/lectures/all-schedule?date=2026-04-06",
            headers=self.headers
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        assert data["date"] == "2026-04-06", f"Expected date 2026-04-06, got {data['date']}"
        assert data["total"] == 1, f"Expected 1 lecture, got {data['total']}"
        
        # Verify lecture details
        lecture = data["lectures"][0]
        assert lecture["course_name"] == "دراسات حضرموت ", f"Wrong course name: {lecture['course_name']}"
        assert lecture["start_time"] == "10:00", f"Wrong start time: {lecture['start_time']}"
        assert lecture["end_time"] == "11:30", f"Wrong end time: {lecture['end_time']}"
        assert lecture["room"] == "قاعة 203", f"Wrong room: {lecture['room']}"
        assert lecture["teacher_name"] == "Saeed", f"Wrong teacher: {lecture['teacher_name']}"
        print(f"✓ Date 2026-04-06: Found lecture '{lecture['course_name']}' at {lecture['start_time']}")
    
    def test_03_schedule_empty_date(self):
        """GET /api/lectures/all-schedule?date=2026-04-07 returns empty for date with no lectures"""
        response = requests.get(
            f"{BASE_URL}/api/lectures/all-schedule?date=2026-04-07",
            headers=self.headers
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        assert data["date"] == "2026-04-07", f"Expected date 2026-04-07, got {data['date']}"
        assert data["total"] == 0, f"Expected 0 lectures, got {data['total']}"
        assert len(data["lectures"]) == 0, "Expected empty lectures array"
        print(f"✓ Date 2026-04-07: No lectures (correct)")
    
    def test_04_lecture_response_structure(self):
        """Verify lecture response contains all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/lectures/all-schedule?date=2026-04-06",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["lectures"]) > 0, "No lectures to test structure"
        
        lecture = data["lectures"][0]
        required_fields = [
            "id", "course_id", "course_name", "course_code", "section",
            "date", "day", "start_time", "end_time", "room", "status",
            "teacher_name", "created_at"
        ]
        
        for field in required_fields:
            assert field in lecture, f"Missing required field: {field}"
        
        print(f"✓ Lecture has all required fields: {list(lecture.keys())}")
    
    def test_05_schedule_requires_auth(self):
        """GET /api/lectures/all-schedule without auth returns 403"""
        response = requests.get(f"{BASE_URL}/api/lectures/all-schedule")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Endpoint requires authentication (403 without token)")
    
    def test_06_schedule_invalid_date_format(self):
        """GET /api/lectures/all-schedule with invalid date format"""
        # The API should handle invalid dates gracefully
        response = requests.get(
            f"{BASE_URL}/api/lectures/all-schedule?date=invalid-date",
            headers=self.headers
        )
        # API may return 200 with empty results or 400/422 for invalid date
        # Either is acceptable behavior
        assert response.status_code in [200, 400, 422], f"Unexpected status: {response.status_code}"
        print(f"✓ Invalid date handled with status {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
