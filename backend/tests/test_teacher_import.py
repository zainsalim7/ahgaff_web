"""
Tests for Teacher Import from Excel Feature
- GET /api/template/teachers - downloads Excel template 
- POST /api/import/teachers?department_id=X - imports teachers from Excel
- Tests: duplicate rejection, department_id requirement, column validation
"""

import pytest
import requests
import os
import io

# Use public API URL
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://study-plan-system.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_CREDS = {"username": "admin", "password": "admin123"}


class TestTeacherImportFeature:
    """Test Teacher Excel Import Feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Get a department ID for testing
        dept_response = requests.get(f"{BASE_URL}/api/departments", headers=self.headers)
        if dept_response.status_code == 200 and dept_response.json():
            self.department_id = dept_response.json()[0]["id"]
        else:
            self.department_id = None
    
    # ===================
    # Template Download Tests
    # ===================
    
    def test_get_teachers_template_success(self):
        """GET /api/template/teachers - should return Excel file with correct columns"""
        response = requests.get(f"{BASE_URL}/api/template/teachers", headers=self.headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Check content type is Excel
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "excel" in content_type or "octet-stream" in content_type, \
            f"Expected Excel content type, got: {content_type}"
        
        # Check Content-Disposition header for filename
        content_disposition = response.headers.get("content-disposition", "")
        assert "teachers_template.xlsx" in content_disposition, \
            f"Expected filename teachers_template.xlsx, got: {content_disposition}"
        
        # Verify we got some binary data
        assert len(response.content) > 100, "Excel file seems too small"
        
        print(f"Template downloaded successfully, size: {len(response.content)} bytes")
    
    def test_get_teachers_template_unauthorized(self):
        """GET /api/template/teachers - should require authentication"""
        response = requests.get(f"{BASE_URL}/api/template/teachers")
        
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], \
            f"Expected 401/403 for unauthorized, got {response.status_code}"
    
    def test_get_teachers_template_non_admin_forbidden(self):
        """GET /api/template/teachers - should reject non-admin users"""
        # Login as teacher
        teacher_response = requests.post(f"{BASE_URL}/api/auth/login", 
                                         json={"username": "teacher180156", "password": "teacher123"})
        
        if teacher_response.status_code != 200:
            pytest.skip("Teacher login failed - may not exist")
        
        teacher_token = teacher_response.json().get("access_token")
        teacher_headers = {"Authorization": f"Bearer {teacher_token}"}
        
        response = requests.get(f"{BASE_URL}/api/template/teachers", headers=teacher_headers)
        
        assert response.status_code == 403, \
            f"Expected 403 for non-admin, got {response.status_code}"
    
    # ===================
    # Import Tests
    # ===================
    
    def test_import_teachers_requires_department_id(self):
        """POST /api/import/teachers - should require department_id parameter"""
        # Create a valid Excel file in memory
        import pandas as pd
        from io import BytesIO
        
        data = {
            "الرقم الوظيفي": ["TEST001"],
            "اسم المعلم": ["معلم اختبار"],
            "النصاب الأسبوعي": [12],
        }
        df = pd.DataFrame(data)
        output = BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        
        # Upload without department_id
        files = {"file": ("teachers.xlsx", output, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        response = requests.post(f"{BASE_URL}/api/import/teachers", 
                                headers=self.headers, files=files)
        
        assert response.status_code == 400, \
            f"Expected 400 when department_id missing, got {response.status_code}: {response.text}"
        
        # Check error message
        error_detail = response.json().get("detail", "")
        assert "القسم" in error_detail or "department" in error_detail.lower(), \
            f"Expected department-related error, got: {error_detail}"
        
        print(f"Correctly rejected import without department_id: {error_detail}")
    
    def test_import_teachers_requires_all_columns(self):
        """POST /api/import/teachers - should require الرقم الوظيفي, اسم المعلم, النصاب الأسبوعي"""
        if not self.department_id:
            pytest.skip("No department available for testing")
        
        import pandas as pd
        from io import BytesIO
        
        # Test missing الرقم الوظيفي
        data_missing_id = {
            "اسم المعلم": ["معلم اختبار"],
            "النصاب الأسبوعي": [12],
        }
        df = pd.DataFrame(data_missing_id)
        output = BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        
        files = {"file": ("teachers.xlsx", output, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        response = requests.post(f"{BASE_URL}/api/import/teachers?department_id={self.department_id}", 
                                headers=self.headers, files=files)
        
        assert response.status_code == 400, \
            f"Expected 400 when الرقم الوظيفي missing, got {response.status_code}"
        assert "الرقم الوظيفي" in response.json().get("detail", ""), \
            f"Expected error about الرقم الوظيفي, got: {response.json()}"
        
        print("Correctly rejected file missing الرقم الوظيفي")
        
        # Test missing اسم المعلم
        data_missing_name = {
            "الرقم الوظيفي": ["TEST001"],
            "النصاب الأسبوعي": [12],
        }
        df = pd.DataFrame(data_missing_name)
        output = BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        
        files = {"file": ("teachers.xlsx", output, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        response = requests.post(f"{BASE_URL}/api/import/teachers?department_id={self.department_id}", 
                                headers=self.headers, files=files)
        
        assert response.status_code == 400, \
            f"Expected 400 when اسم المعلم missing, got {response.status_code}"
        assert "اسم المعلم" in response.json().get("detail", ""), \
            f"Expected error about اسم المعلم, got: {response.json()}"
        
        print("Correctly rejected file missing اسم المعلم")
        
        # Test missing النصاب الأسبوعي
        data_missing_hours = {
            "الرقم الوظيفي": ["TEST001"],
            "اسم المعلم": ["معلم اختبار"],
        }
        df = pd.DataFrame(data_missing_hours)
        output = BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        
        files = {"file": ("teachers.xlsx", output, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        response = requests.post(f"{BASE_URL}/api/import/teachers?department_id={self.department_id}", 
                                headers=self.headers, files=files)
        
        assert response.status_code == 400, \
            f"Expected 400 when النصاب الأسبوعي missing, got {response.status_code}"
        assert "النصاب الأسبوعي" in response.json().get("detail", ""), \
            f"Expected error about النصاب الأسبوعي, got: {response.json()}"
        
        print("Correctly rejected file missing النصاب الأسبوعي")
    
    def test_import_teachers_success(self):
        """POST /api/import/teachers - should successfully import teachers with auto-activation"""
        if not self.department_id:
            pytest.skip("No department available for testing")
        
        import pandas as pd
        from io import BytesIO
        import time
        
        # Create unique teacher IDs using timestamp to avoid collisions
        timestamp = int(time.time())
        teacher1_id = f"TESTIMPORT{timestamp}A"
        teacher2_id = f"TESTIMPORT{timestamp}B"
        
        data = {
            "الرقم الوظيفي": [teacher1_id, teacher2_id],
            "اسم المعلم": ["معلم استيراد اختبار 1", "معلم استيراد اختبار 2"],
            "النصاب الأسبوعي": [12, 14],
        }
        df = pd.DataFrame(data)
        output = BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        
        files = {"file": ("teachers.xlsx", output, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        response = requests.post(f"{BASE_URL}/api/import/teachers?department_id={self.department_id}", 
                                headers=self.headers, files=files)
        
        assert response.status_code == 200, \
            f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        
        # Verify response structure
        assert "imported" in result, "Response should contain 'imported' count"
        assert "activated" in result, "Response should contain 'activated' count"
        assert "message" in result, "Response should contain 'message'"
        
        # Verify counts
        assert result["imported"] == 2, f"Expected 2 imported, got {result['imported']}"
        assert result["activated"] == 2, f"Expected 2 activated, got {result['activated']}"
        
        print(f"Successfully imported: {result}")
        
        # Verify teachers were created by fetching them
        teachers_response = requests.get(f"{BASE_URL}/api/teachers", headers=self.headers)
        assert teachers_response.status_code == 200
        
        teachers = teachers_response.json()
        imported_teacher_ids = [t.get("teacher_id") or t.get("username") for t in teachers]
        
        assert teacher1_id in imported_teacher_ids, f"Teacher {teacher1_id} not found in teachers list"
        assert teacher2_id in imported_teacher_ids, f"Teacher {teacher2_id} not found in teachers list"
        
        print(f"Verified both teachers exist in database")
        
        # Verify teachers can login (accounts were auto-activated)
        login_response = requests.post(f"{BASE_URL}/api/auth/login", 
                                      json={"username": teacher1_id, "password": teacher1_id})
        assert login_response.status_code == 200, \
            f"Expected auto-activated teacher to be able to login, got {login_response.status_code}"
        
        login_data = login_response.json()
        assert login_data.get("role") == "teacher" or "teacher" in str(login_data), \
            f"Expected teacher role in login response: {login_data}"
        
        print(f"Verified teacher {teacher1_id} can login with auto-activated account")
        
        # Store for cleanup
        self._test_teachers = [teacher1_id, teacher2_id]
    
    def test_import_teachers_rejects_duplicates(self):
        """POST /api/import/teachers - should reject duplicate teacher_id entries"""
        if not self.department_id:
            pytest.skip("No department available for testing")
        
        import pandas as pd
        from io import BytesIO
        import time
        
        # First import a teacher
        timestamp = int(time.time())
        teacher_id = f"TESTDUP{timestamp}"
        
        data = {
            "الرقم الوظيفي": [teacher_id],
            "اسم المعلم": ["معلم اختبار تكرار"],
            "النصاب الأسبوعي": [12],
        }
        df = pd.DataFrame(data)
        output = BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        
        files = {"file": ("teachers.xlsx", output, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        first_response = requests.post(f"{BASE_URL}/api/import/teachers?department_id={self.department_id}", 
                                       headers=self.headers, files=files)
        
        assert first_response.status_code == 200, f"First import failed: {first_response.text}"
        first_result = first_response.json()
        assert first_result["imported"] == 1, "First import should succeed"
        
        print(f"First import succeeded: {first_result}")
        
        # Try to import the same teacher again
        output.seek(0)
        files = {"file": ("teachers.xlsx", output, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        second_response = requests.post(f"{BASE_URL}/api/import/teachers?department_id={self.department_id}", 
                                        headers=self.headers, files=files)
        
        assert second_response.status_code == 200, f"Second import should return 200 with errors, got {second_response.status_code}"
        second_result = second_response.json()
        
        # The import should report 0 new imports and have errors
        assert second_result["imported"] == 0, f"Expected 0 imported on duplicate, got {second_result['imported']}"
        assert len(second_result.get("errors", [])) > 0, "Expected error about duplicate teacher"
        
        # Check error message mentions the duplicate
        errors = second_result.get("errors", [])
        duplicate_error_found = any("موجود" in str(e) or teacher_id in str(e) for e in errors)
        assert duplicate_error_found, f"Expected duplicate error, got: {errors}"
        
        print(f"Correctly rejected duplicate: {second_result}")
    
    def test_import_teachers_unauthorized(self):
        """POST /api/import/teachers - should require authentication"""
        import pandas as pd
        from io import BytesIO
        
        data = {
            "الرقم الوظيفي": ["TEST001"],
            "اسم المعلم": ["معلم اختبار"],
            "النصاب الأسبوعي": [12],
        }
        df = pd.DataFrame(data)
        output = BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        
        files = {"file": ("teachers.xlsx", output, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        response = requests.post(f"{BASE_URL}/api/import/teachers?department_id=test123", files=files)
        
        assert response.status_code in [401, 403], \
            f"Expected 401/403 for unauthorized, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
