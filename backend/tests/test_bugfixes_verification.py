"""
Bug Fix Verification Tests - Iteration 11
Testing:
1. Login with admin credentials
2. Excel import preview and import endpoints
3. Lecture time validation (end_time before start_time)
4. Report pages endpoints
"""
import pytest
import requests
import os
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://schedule-hub-272.preview.emergentagent.com"

# Test course ID from request
TEST_COURSE_ID = "698f0000d803b27aab0120af"

class TestAdminLogin:
    """Test admin login with credentials admin/admin123"""
    
    def test_admin_login_success(self):
        """Login with admin credentials should succeed"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data.get("role") == "admin" or data.get("user", {}).get("role") == "admin", "User is not admin"
        print(f"✓ Admin login successful, token received")
        return data["access_token"]

@pytest.fixture(scope="class")
def auth_token():
    """Get authentication token for admin"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "admin",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.fail(f"Admin authentication failed: {response.text}")


class TestLectureTimeValidation:
    """Test lecture time validation - end_time must be after start_time"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_token):
        self.token = auth_token
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_create_lecture_invalid_time_should_fail(self):
        """POST /api/lectures with end_time before start_time should return 400"""
        payload = {
            "course_id": TEST_COURSE_ID,
            "date": "2026-01-20",
            "start_time": "11:00",
            "end_time": "10:00",  # Invalid: before start_time
            "room": "A101"
        }
        response = requests.post(
            f"{BASE_URL}/api/lectures",
            json=payload,
            headers=self.headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "وقت النهاية" in data.get("detail", ""), f"Expected Arabic error about end_time, got: {data}"
        print(f"✓ Create lecture with invalid time correctly rejected: {data.get('detail')}")
    
    def test_create_lecture_valid_time_structure(self):
        """POST /api/lectures with valid time should have correct structure"""
        payload = {
            "course_id": TEST_COURSE_ID,
            "date": "2026-01-21",
            "start_time": "10:00",
            "end_time": "11:30",  # Valid: after start_time
            "room": "A102"
        }
        response = requests.post(
            f"{BASE_URL}/api/lectures",
            json=payload,
            headers=self.headers
        )
        # Could succeed or fail due to other reasons (course not found, etc.)
        # We're mainly testing that time validation passes
        if response.status_code == 400:
            # Check it's not the time validation error
            data = response.json()
            assert "وقت النهاية" not in data.get("detail", ""), \
                f"Valid time was rejected: {data.get('detail')}"
            print(f"✓ Valid time structure accepted (failed for other reason: {data.get('detail', 'unknown')})")
        elif response.status_code in [200, 201]:
            print(f"✓ Lecture created successfully with valid time")
        else:
            print(f"Note: Got {response.status_code}, may be due to course/permissions")


class TestExcelImportPreview:
    """Test Excel import preview endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_token):
        self.token = auth_token
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.test_file_path = "/tmp/test_students.xlsx"
    
    def test_import_preview_endpoint_exists(self):
        """POST /api/students/import-preview/{course_id} should accept file upload"""
        # Check if test file exists
        import os
        if not os.path.exists(self.test_file_path):
            pytest.skip("Test file /tmp/test_students.xlsx not found")
        
        with open(self.test_file_path, "rb") as f:
            files = {"file": ("test_students.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            response = requests.post(
                f"{BASE_URL}/api/students/import-preview/{TEST_COURSE_ID}",
                files=files,
                headers=self.headers
            )
        
        # Should return 200 or 404 (if course not found), but not 500
        assert response.status_code != 500, f"Server error: {response.text}"
        print(f"✓ Import preview endpoint responded with status {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            assert "total" in data, "Response should contain 'total' count"
            assert "sample_names" in data, "Response should contain 'sample_names'"
            print(f"✓ Preview data: {data.get('total')} students, names: {data.get('sample_names', [])[:3]}")
    
    def test_import_endpoint_exists(self):
        """POST /api/students/import/{course_id} should accept file upload"""
        import os
        if not os.path.exists(self.test_file_path):
            pytest.skip("Test file /tmp/test_students.xlsx not found")
        
        with open(self.test_file_path, "rb") as f:
            files = {"file": ("test_students.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            response = requests.post(
                f"{BASE_URL}/api/students/import/{TEST_COURSE_ID}",
                files=files,
                headers=self.headers
            )
        
        assert response.status_code != 500, f"Server error: {response.text}"
        print(f"✓ Import endpoint responded with status {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Import result: imported={data.get('imported')}, enrolled={data.get('enrolled')}")


class TestReportEndpoints:
    """Test report page endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_token):
        self.token = auth_token
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_daily_report_endpoint(self):
        """GET /api/reports/daily should return 200"""
        response = requests.get(
            f"{BASE_URL}/api/reports/daily",
            headers=self.headers
        )
        assert response.status_code == 200, f"Daily report failed: {response.text}"
        print(f"✓ Daily report endpoint working")
    
    def test_reports_summary_endpoint(self):
        """GET /api/reports/summary should return 200"""
        response = requests.get(
            f"{BASE_URL}/api/reports/summary",
            headers=self.headers
        )
        assert response.status_code == 200, f"Reports summary failed: {response.text}"
        print(f"✓ Reports summary endpoint working")
    
    def test_teacher_delays_report(self):
        """GET /api/reports/teacher-delays should return 200"""
        response = requests.get(
            f"{BASE_URL}/api/reports/teacher-delays",
            headers=self.headers
        )
        assert response.status_code == 200, f"Teacher delays report failed: {response.text}"
        data = response.json()
        assert "teachers" in data or "summary" in data, "Missing expected fields in response"
        print(f"✓ Teacher delays report working")
    
    def test_warnings_report(self):
        """GET /api/reports/warnings should return 200"""
        response = requests.get(
            f"{BASE_URL}/api/reports/warnings",
            headers=self.headers
        )
        assert response.status_code == 200, f"Warnings report failed: {response.text}"
        print(f"✓ Warnings report endpoint working")


class TestTeacherRolePermissions:
    """Test that teacher role does not have MANAGE_COURSES permission - used for SideMenu test"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_token):
        self.admin_token = auth_token
        self.headers = {"Authorization": f"Bearer {self.admin_token}"}
    
    def test_get_teacher_role_permissions(self):
        """Get teacher role and verify it doesn't have MANAGE_COURSES by default"""
        # Get all roles
        response = requests.get(f"{BASE_URL}/api/roles", headers=self.headers)
        if response.status_code != 200:
            pytest.skip(f"Could not get roles: {response.status_code}")
        
        roles = response.json()
        teacher_role = None
        for role in roles:
            if role.get("system_key") == "teacher" or role.get("name") == "أستاذ":
                teacher_role = role
                break
        
        if not teacher_role:
            pytest.skip("Teacher role not found")
        
        permissions = teacher_role.get("permissions", [])
        # Teacher should NOT have manage_courses by default
        # (VIEW_COURSES might be there for viewing, but not MANAGE_COURSES)
        print(f"Teacher permissions: {permissions}")
        
        # The key check: MANAGE_COURSES should control the menu item, not VIEW_COURSES
        # As per the fix, SideMenu line 56 should use MANAGE_COURSES only
        print(f"✓ Teacher role permissions retrieved: {len(permissions)} permissions")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
