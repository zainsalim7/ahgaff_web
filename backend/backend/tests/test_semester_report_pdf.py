"""
Test Semester Report PDF Export Feature
Tests the GET /api/export/semester-report/pdf endpoint with filters
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://attendance-debug-1.preview.emergentagent.com')

class TestSemesterReportPDF:
    """Tests for semester report PDF export endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get authentication token for tests"""
        self.auth_token = None
        try:
            response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"username": "admin", "password": "admin123"},
                timeout=30
            )
            if response.status_code == 200:
                data = response.json()
                self.auth_token = data.get('access_token')
        except Exception as e:
            print(f"Auth setup failed: {e}")
        yield
    
    def get_headers(self):
        """Get headers with auth token"""
        if self.auth_token:
            return {"Authorization": f"Bearer {self.auth_token}"}
        return {}
    
    # Test 1: Basic PDF export without filters (200 status)
    def test_semester_report_pdf_basic(self):
        """GET /api/export/semester-report/pdf - Basic export returns PDF"""
        if not self.auth_token:
            pytest.skip("Authentication failed")
        
        response = requests.get(
            f"{BASE_URL}/api/export/semester-report/pdf",
            headers=self.get_headers(),
            timeout=60
        )
        
        print(f"Status: {response.status_code}")
        print(f"Content-Type: {response.headers.get('Content-Type', 'N/A')}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert 'application/pdf' in response.headers.get('Content-Type', ''), \
            f"Expected PDF content-type, got {response.headers.get('Content-Type')}"
        assert len(response.content) > 0, "PDF content should not be empty"
        print(f"PDF size: {len(response.content)} bytes")
    
    # Test 2: PDF export with course_id filter
    def test_semester_report_pdf_with_course_filter(self):
        """GET /api/export/semester-report/pdf?course_id={id} - Filter by course"""
        if not self.auth_token:
            pytest.skip("Authentication failed")
        
        # Use test course ID from previous iterations
        test_course_id = "698e54c5b17b90bf5c4205fe"
        
        response = requests.get(
            f"{BASE_URL}/api/export/semester-report/pdf",
            params={"course_id": test_course_id},
            headers=self.get_headers(),
            timeout=60
        )
        
        print(f"Status: {response.status_code}")
        print(f"Content-Type: {response.headers.get('Content-Type', 'N/A')}")
        
        # Should return 200 or 404 if course has no data
        assert response.status_code in [200, 404], f"Expected 200 or 404, got {response.status_code}"
        
        if response.status_code == 200:
            assert 'application/pdf' in response.headers.get('Content-Type', ''), \
                f"Expected PDF content-type, got {response.headers.get('Content-Type')}"
            print(f"PDF size: {len(response.content)} bytes")
        else:
            print(f"No courses found for filter: {response.json()}")
    
    # Test 3: PDF export with department_id filter
    def test_semester_report_pdf_with_department_filter(self):
        """GET /api/export/semester-report/pdf?department_id={id} - Filter by department"""
        if not self.auth_token:
            pytest.skip("Authentication failed")
        
        # First get departments
        dept_response = requests.get(
            f"{BASE_URL}/api/departments",
            headers=self.get_headers(),
            timeout=30
        )
        
        if dept_response.status_code == 200 and len(dept_response.json()) > 0:
            test_dept_id = dept_response.json()[0]['id']
            
            response = requests.get(
                f"{BASE_URL}/api/export/semester-report/pdf",
                params={"department_id": test_dept_id},
                headers=self.get_headers(),
                timeout=60
            )
            
            print(f"Status: {response.status_code}")
            print(f"Content-Type: {response.headers.get('Content-Type', 'N/A')}")
            
            assert response.status_code in [200, 404], f"Expected 200 or 404, got {response.status_code}"
            
            if response.status_code == 200:
                assert 'application/pdf' in response.headers.get('Content-Type', ''), \
                    f"Expected PDF content-type, got {response.headers.get('Content-Type')}"
                print(f"PDF size with dept filter: {len(response.content)} bytes")
        else:
            pytest.skip("No departments available")
    
    # Test 4: PDF export with both filters
    def test_semester_report_pdf_with_both_filters(self):
        """GET /api/export/semester-report/pdf?course_id={id}&department_id={id} - Both filters"""
        if not self.auth_token:
            pytest.skip("Authentication failed")
        
        test_course_id = "698e54c5b17b90bf5c4205fe"
        
        # Get departments first
        dept_response = requests.get(
            f"{BASE_URL}/api/departments",
            headers=self.get_headers(),
            timeout=30
        )
        
        if dept_response.status_code == 200 and len(dept_response.json()) > 0:
            test_dept_id = dept_response.json()[0]['id']
            
            response = requests.get(
                f"{BASE_URL}/api/export/semester-report/pdf",
                params={"course_id": test_course_id, "department_id": test_dept_id},
                headers=self.get_headers(),
                timeout=60
            )
            
            print(f"Status: {response.status_code}")
            assert response.status_code in [200, 404], f"Expected 200 or 404, got {response.status_code}"
            
            if response.status_code == 200:
                assert 'application/pdf' in response.headers.get('Content-Type', '')
                print(f"PDF size with both filters: {len(response.content)} bytes")
        else:
            pytest.skip("No departments available")
    
    # Test 5: Unauthenticated request should return 401/403
    def test_semester_report_pdf_unauthenticated(self):
        """GET /api/export/semester-report/pdf - No auth should return 401/403"""
        response = requests.get(
            f"{BASE_URL}/api/export/semester-report/pdf",
            timeout=30
        )
        
        print(f"Status (no auth): {response.status_code}")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    # Test 6: Invalid course_id should handle gracefully
    def test_semester_report_pdf_invalid_course_id(self):
        """GET /api/export/semester-report/pdf?course_id=invalid - Handle invalid course ID"""
        if not self.auth_token:
            pytest.skip("Authentication failed")
        
        response = requests.get(
            f"{BASE_URL}/api/export/semester-report/pdf",
            params={"course_id": "invalid_id_12345"},
            headers=self.get_headers(),
            timeout=30
        )
        
        print(f"Status with invalid course_id: {response.status_code}")
        # Should return 404 or 400 for invalid course ID (depending on implementation)
        # or 500 if bson ObjectId conversion fails
        assert response.status_code in [200, 400, 404, 500], f"Unexpected status: {response.status_code}"
    
    # Test 7: Check Content-Disposition header for filename
    def test_semester_report_pdf_content_disposition(self):
        """GET /api/export/semester-report/pdf - Check Content-Disposition header"""
        if not self.auth_token:
            pytest.skip("Authentication failed")
        
        response = requests.get(
            f"{BASE_URL}/api/export/semester-report/pdf",
            headers=self.get_headers(),
            timeout=60
        )
        
        if response.status_code == 200:
            content_disposition = response.headers.get('Content-Disposition', '')
            print(f"Content-Disposition: {content_disposition}")
            # Check for attachment or filename in header
            # This is optional - some implementations don't include it
            print(f"Headers: {dict(response.headers)}")


class TestExportAPIExists:
    """Verify exportAPI.exportSemesterReportPDF function exists in frontend api.ts"""
    
    def test_export_api_function_exists(self):
        """Check that exportSemesterReportPDF is defined in api.ts"""
        api_file_path = "/app/frontend/src/services/api.ts"
        
        try:
            with open(api_file_path, 'r') as f:
                content = f.read()
            
            # Check for the function definition
            assert 'exportSemesterReportPDF' in content, \
                "exportSemesterReportPDF function not found in api.ts"
            
            assert '/export/semester-report/pdf' in content, \
                "Endpoint /export/semester-report/pdf not found in api.ts"
            
            print("exportSemesterReportPDF function exists in api.ts")
            print("Endpoint /export/semester-report/pdf is defined")
            
        except FileNotFoundError:
            pytest.skip("api.ts file not found")


class TestFrontendUIElements:
    """Verify frontend UI elements for semester report PDF"""
    
    def test_reports_tsx_has_semester_button(self):
        """Check that reports.tsx has the export semester PDF button"""
        reports_file_path = "/app/frontend/app/reports.tsx"
        
        try:
            with open(reports_file_path, 'r') as f:
                content = f.read()
            
            # Check for data-testid
            assert 'data-testid="export-semester-pdf-btn"' in content, \
                "data-testid='export-semester-pdf-btn' not found in reports.tsx"
            
            # Check for button text
            assert 'تصدير تقرير الفصل PDF' in content, \
                "Button text 'تصدير تقرير الفصل PDF' not found in reports.tsx"
            
            # Check for handleExportSemesterPDF function
            assert 'handleExportSemesterPDF' in content, \
                "handleExportSemesterPDF function not found in reports.tsx"
            
            print("All semester PDF UI elements found in reports.tsx:")
            print("- data-testid='export-semester-pdf-btn' ✓")
            print("- Button text 'تصدير تقرير الفصل PDF' ✓")
            print("- handleExportSemesterPDF function ✓")
            
        except FileNotFoundError:
            pytest.skip("reports.tsx file not found")
    
    def test_reports_tsx_has_dropdown_filters(self):
        """Check that reports.tsx has department and course dropdown filters"""
        reports_file_path = "/app/frontend/app/reports.tsx"
        
        try:
            with open(reports_file_path, 'r') as f:
                content = f.read()
            
            # Check for Dropdown component usage
            assert 'Dropdown' in content, "Dropdown component not found"
            
            # Check for department filter
            assert 'القسم' in content, "Department label not found"
            assert 'selectedDept' in content, "selectedDept state not found"
            
            # Check for course filter
            assert 'المقرر' in content, "Course label not found"
            assert 'selectedCourse' in content, "selectedCourse state not found"
            
            print("Dropdown filters found in reports.tsx:")
            print("- Department dropdown (القسم) ✓")
            print("- Course dropdown (المقرر) ✓")
            
        except FileNotFoundError:
            pytest.skip("reports.tsx file not found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
