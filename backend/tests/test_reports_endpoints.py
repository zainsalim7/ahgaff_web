"""
Test cases for all Report Endpoints
Testing the hardened backend endpoints after bug fix for course report 500 errors
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://attendance-track-38.preview.emergentagent.com"


class TestReportEndpoints:
    """Test all report endpoints return HTTP 200"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        # Login as admin
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        data = login_response.json()
        self.token = data.get("access_token")
        assert self.token, "No access token returned"
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
    def test_reports_summary(self):
        """GET /api/reports/summary should return HTTP 200"""
        response = requests.get(f"{BASE_URL}/api/reports/summary", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        # Validate response structure
        assert "total_students" in data or "total_courses" in data or "total_teachers" in data, \
            f"Invalid summary structure: {data}"
        print(f"✓ GET /api/reports/summary - 200 OK - Summary data: {list(data.keys())}")

    def test_reports_attendance_overview(self):
        """GET /api/reports/attendance-overview should return HTTP 200"""
        response = requests.get(f"{BASE_URL}/api/reports/attendance-overview", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        # It might return courses array or empty structure
        assert isinstance(data, (dict, list)), f"Expected dict or list, got {type(data)}"
        print(f"✓ GET /api/reports/attendance-overview - 200 OK")
        
    def test_reports_absent_students(self):
        """GET /api/reports/absent-students should return HTTP 200"""
        response = requests.get(f"{BASE_URL}/api/reports/absent-students", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, (dict, list)), f"Expected dict or list, got {type(data)}"
        print(f"✓ GET /api/reports/absent-students - 200 OK")

    def test_reports_daily(self):
        """GET /api/reports/daily should return HTTP 200"""
        response = requests.get(f"{BASE_URL}/api/reports/daily", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, (dict, list)), f"Expected dict or list, got {type(data)}"
        print(f"✓ GET /api/reports/daily - 200 OK")

    def test_reports_warnings(self):
        """GET /api/reports/warnings should return HTTP 200"""
        response = requests.get(f"{BASE_URL}/api/reports/warnings", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, (dict, list)), f"Expected dict or list, got {type(data)}"
        print(f"✓ GET /api/reports/warnings - 200 OK")

    def test_reports_teacher_delays(self):
        """GET /api/reports/teacher-delays should return HTTP 200"""
        response = requests.get(f"{BASE_URL}/api/reports/teacher-delays", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, dict), f"Expected dict, got {type(data)}"
        assert "teachers" in data or "summary" in data, f"Invalid response: {list(data.keys())}"
        print(f"✓ GET /api/reports/teacher-delays - 200 OK")


class TestCourseDetailedReport:
    """Test course detailed report for all courses - main bug fix validation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        data = login_response.json()
        self.token = data.get("access_token")
        assert self.token, "No access token returned"
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
    def test_get_all_courses(self):
        """Get all courses for testing"""
        response = requests.get(f"{BASE_URL}/api/courses", headers=self.headers)
        assert response.status_code == 200, f"Failed to get courses: {response.text}"
        self.courses = response.json()
        print(f"Found {len(self.courses)} courses")
        return self.courses
    
    def test_course_detailed_report_all_courses(self):
        """GET /api/reports/course/{courseId}/detailed should return HTTP 200 for ALL courses"""
        # First get all courses
        courses_response = requests.get(f"{BASE_URL}/api/courses", headers=self.headers)
        assert courses_response.status_code == 200, f"Failed to get courses: {courses_response.text}"
        courses = courses_response.json()
        
        if not courses:
            pytest.skip("No courses found in database")
        
        # Test each course
        failed_courses = []
        successful_courses = []
        
        for course in courses:
            course_id = course.get("id")
            course_name = course.get("name", "Unknown")
            course_code = course.get("code", "")
            
            response = requests.get(
                f"{BASE_URL}/api/reports/course/{course_id}/detailed",
                headers=self.headers
            )
            
            if response.status_code == 200:
                data = response.json()
                # Validate response structure
                assert "course" in data, f"Missing 'course' in response for {course_name}"
                assert "students" in data, f"Missing 'students' in response for {course_name}"
                assert "summary" in data, f"Missing 'summary' in response for {course_name}"
                successful_courses.append({
                    "id": course_id,
                    "name": course_name,
                    "code": course_code,
                    "students_count": data.get("summary", {}).get("total_students", 0),
                    "lectures_count": data.get("summary", {}).get("total_lectures", 0)
                })
                print(f"  ✓ Course '{course_name}' ({course_code}) - 200 OK")
            else:
                failed_courses.append({
                    "id": course_id,
                    "name": course_name,
                    "code": course_code,
                    "status_code": response.status_code,
                    "error": response.text[:200]
                })
                print(f"  ✗ Course '{course_name}' ({course_code}) - {response.status_code} ERROR")
        
        # Print summary
        print(f"\n=== Course Report Test Summary ===")
        print(f"Total courses: {len(courses)}")
        print(f"Successful: {len(successful_courses)}")
        print(f"Failed: {len(failed_courses)}")
        
        if failed_courses:
            print("\nFailed courses details:")
            for fc in failed_courses:
                print(f"  - {fc['name']} ({fc['code']}): HTTP {fc['status_code']}")
                print(f"    Error: {fc['error'][:100]}...")
        
        # Assert no failures
        assert len(failed_courses) == 0, f"Course reports failed for {len(failed_courses)} courses: {[c['name'] for c in failed_courses]}"


class TestStudentReport:
    """Test student report endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        data = login_response.json()
        self.token = data.get("access_token")
        assert self.token, "No access token returned"
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
    def test_student_report_with_sample(self):
        """GET /api/reports/student/{studentId} should return HTTP 200"""
        # First get a sample student
        students_response = requests.get(f"{BASE_URL}/api/students", headers=self.headers)
        assert students_response.status_code == 200, f"Failed to get students: {students_response.text}"
        students = students_response.json()
        
        if not students:
            pytest.skip("No students found in database")
        
        # Test with first student
        student_id = students[0].get("id")
        student_name = students[0].get("full_name", "Unknown")
        
        response = requests.get(
            f"{BASE_URL}/api/reports/student/{student_id}",
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Student report failed for {student_name}: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "student" in data or "courses" in data, f"Invalid student report structure: {list(data.keys())}"
        print(f"✓ GET /api/reports/student/{student_id} - 200 OK - Student: {student_name}")


class TestLoginFlow:
    """Test login with admin credentials"""
    
    def test_admin_login(self):
        """Login with admin/admin123 should work"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, f"No access_token in response: {data}"
        assert "user" in data, f"No user in response: {data}"
        assert data["user"].get("role") == "admin", f"Not admin role: {data['user'].get('role')}"
        print(f"✓ Admin login successful - User: {data['user'].get('username')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
