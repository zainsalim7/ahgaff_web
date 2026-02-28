"""
Test cases for PDF export functionality
Testing the PDF export feature for lecture attendance reports.
"""
import pytest
import requests
import os

# Get the backend URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data provided
TEST_LECTURE_ID = "699c1adb46e5ce6379f6aaf7"
TEST_COURSE_ID = "698e54c5b17b90bf5c4205fe"
NON_EXISTENT_LECTURE_ID = "000000000000000000000000"
INVALID_LECTURE_ID = "invalid-id-format"


class TestPDFExport:
    """Tests for the PDF export endpoint"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get auth token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.token = token
        else:
            pytest.skip(f"Authentication failed - status: {login_response.status_code}")

    def test_pdf_export_returns_valid_pdf(self):
        """Test that PDF endpoint returns a valid PDF file"""
        response = self.session.get(f"{BASE_URL}/api/lectures/{TEST_LECTURE_ID}/pdf")
        
        # Should return 200 OK
        assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text[:500]}"
        
        # Check Content-Type is application/pdf
        content_type = response.headers.get("Content-Type", "")
        assert "application/pdf" in content_type, f"Expected application/pdf, got {content_type}"
        
        # Check Content-Disposition header for attachment
        content_disposition = response.headers.get("Content-Disposition", "")
        assert "attachment" in content_disposition, f"Expected attachment in Content-Disposition, got {content_disposition}"
        assert ".pdf" in content_disposition, f"Expected .pdf filename in Content-Disposition, got {content_disposition}"
        
        # Verify PDF magic bytes (%PDF-)
        pdf_content = response.content
        assert len(pdf_content) > 0, "PDF content should not be empty"
        assert pdf_content[:5] == b'%PDF-', f"Expected PDF magic bytes, got {pdf_content[:5]}"
        
        print(f"✓ PDF export successful - size: {len(pdf_content)} bytes")

    def test_pdf_export_404_for_nonexistent_lecture(self):
        """Test that PDF endpoint returns 404 for non-existent lecture ID"""
        response = self.session.get(f"{BASE_URL}/api/lectures/{NON_EXISTENT_LECTURE_ID}/pdf")
        
        # Should return 404 Not Found
        assert response.status_code == 404, f"Expected 404, got {response.status_code}. Response: {response.text[:500]}"
        
        # Check error message
        error_data = response.json()
        assert "detail" in error_data, "Expected 'detail' in error response"
        print(f"✓ 404 response for non-existent lecture - detail: {error_data.get('detail')}")

    def test_pdf_export_401_without_authentication(self):
        """Test that PDF endpoint requires authentication"""
        # Create a new session without auth token
        unauthenticated_session = requests.Session()
        
        response = unauthenticated_session.get(f"{BASE_URL}/api/lectures/{TEST_LECTURE_ID}/pdf")
        
        # Should return 401 Unauthorized or 403 Forbidden
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}. Response: {response.text[:500]}"
        print(f"✓ Authentication required - returned {response.status_code}")

    def test_pdf_export_invalid_lecture_id_format(self):
        """Test that PDF endpoint handles invalid lecture ID format"""
        response = self.session.get(f"{BASE_URL}/api/lectures/{INVALID_LECTURE_ID}/pdf")
        
        # Should return 400, 404, or 500 for invalid ObjectId format
        assert response.status_code in [400, 404, 500, 422], f"Expected 400/404/500/422, got {response.status_code}"
        print(f"✓ Invalid ID format handled - returned {response.status_code}")


class TestLectureEndpoints:
    """Additional tests for lecture-related endpoints used by PDF export"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get auth token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip(f"Authentication failed - status: {login_response.status_code}")

    def test_lecture_details_endpoint(self):
        """Test that lecture details endpoint works"""
        response = self.session.get(f"{BASE_URL}/api/lectures/{TEST_LECTURE_ID}/details")
        
        # Should return 200 OK
        assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text[:500]}"
        
        data = response.json()
        assert "lecture" in data, "Expected 'lecture' in response"
        assert "course" in data, "Expected 'course' in response"
        print(f"✓ Lecture details endpoint works - course: {data.get('course', {}).get('name')}")

    def test_course_lectures_endpoint(self):
        """Test that course lectures endpoint works"""
        response = self.session.get(f"{BASE_URL}/api/lectures/{TEST_COURSE_ID}")
        
        # Should return 200 OK
        assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text[:500]}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of lectures"
        print(f"✓ Course lectures endpoint works - count: {len(data)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
