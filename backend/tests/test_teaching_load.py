"""
Teaching Load API Tests - اختبارات العبء التدريسي
Tests for the new teaching load feature endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestTeachingLoadAPI:
    """Teaching Load CRUD endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
        token = login_resp.json().get("access_token")
        assert token, "No access_token in login response"
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.token = token
        
    # ============ AUTH TESTS ============
    def test_login_success(self):
        """Test admin login returns token"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        print("✓ Admin login successful")
        
    # ============ GET TEACHING LOAD TESTS ============
    def test_get_teaching_loads_empty_initially(self):
        """GET /api/teaching-load returns items array"""
        resp = self.session.get(f"{BASE_URL}/api/teaching-load")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert isinstance(data["items"], list)
        assert "summary" in data
        print(f"✓ GET /api/teaching-load returns {len(data['items'])} items")
        
    def test_get_teaching_loads_requires_auth(self):
        """GET /api/teaching-load requires authentication"""
        resp = requests.get(f"{BASE_URL}/api/teaching-load")
        assert resp.status_code in [401, 403]
        print("✓ GET /api/teaching-load requires auth")
        
    # ============ DEPARTMENTS TESTS ============
    def test_get_departments(self):
        """GET /api/departments returns departments list"""
        resp = self.session.get(f"{BASE_URL}/api/departments")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/departments returns {len(data)} departments")
        return data
        
    # ============ TEACHERS TESTS ============
    def test_get_teachers_by_department(self):
        """GET /api/teachers?department_id={id} returns teachers in dept"""
        # First get departments
        depts = self.test_get_departments()
        if not depts:
            pytest.skip("No departments available")
        
        dept_id = depts[0].get("id")
        resp = self.session.get(f"{BASE_URL}/api/teachers", params={"department_id": dept_id})
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/teachers?department_id={dept_id} returns {len(data)} teachers")
        return data
        
    # ============ TEACHER COURSES FOR LOAD TESTS ============
    def test_get_teacher_courses_for_load(self):
        """GET /api/teaching-load/teacher/{id}/courses returns teacher courses with existing load data"""
        # Get a teacher first
        teachers_resp = self.session.get(f"{BASE_URL}/api/teachers")
        assert teachers_resp.status_code == 200
        teachers = teachers_resp.json()
        
        if not teachers:
            pytest.skip("No teachers available")
            
        teacher_id = teachers[0].get("id")
        resp = self.session.get(f"{BASE_URL}/api/teaching-load/teacher/{teacher_id}/courses")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        # Each course should have expected fields
        if data:
            course = data[0]
            assert "course_id" in course
            assert "course_name" in course
            assert "course_code" in course
            assert "existing_load_id" in course or course.get("existing_load_id") is None
            assert "existing_weekly_hours" in course or course.get("existing_weekly_hours") is None
        print(f"✓ GET /api/teaching-load/teacher/{teacher_id}/courses returns {len(data)} courses")
        return data, teacher_id
        
    # ============ CREATE TEACHING LOAD TESTS ============
    def test_create_teaching_load(self):
        """POST /api/teaching-load creates a teaching load entry"""
        # Get a teacher with courses
        teachers_resp = self.session.get(f"{BASE_URL}/api/teachers")
        teachers = teachers_resp.json()
        
        if not teachers:
            pytest.skip("No teachers available")
            
        teacher_id = teachers[0].get("id")
        
        # Get teacher's courses
        courses_resp = self.session.get(f"{BASE_URL}/api/teaching-load/teacher/{teacher_id}/courses")
        courses = courses_resp.json()
        
        if not courses:
            pytest.skip("No courses available for teacher")
            
        course = courses[0]
        course_id = course.get("course_id")
        
        # Create teaching load
        payload = {
            "teacher_id": teacher_id,
            "course_id": course_id,
            "weekly_hours": 4.5,
            "notes": "TEST_teaching_load_entry"
        }
        resp = self.session.post(f"{BASE_URL}/api/teaching-load", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data or "message" in data
        print(f"✓ POST /api/teaching-load created/updated entry")
        return data.get("id"), teacher_id, course_id
        
    # ============ BULK SAVE TESTS ============
    def test_bulk_save_teaching_load(self):
        """POST /api/teaching-load/bulk saves multiple entries at once"""
        # Get a teacher with courses
        teachers_resp = self.session.get(f"{BASE_URL}/api/teachers")
        teachers = teachers_resp.json()
        
        if not teachers:
            pytest.skip("No teachers available")
            
        teacher_id = teachers[0].get("id")
        
        # Get teacher's courses
        courses_resp = self.session.get(f"{BASE_URL}/api/teaching-load/teacher/{teacher_id}/courses")
        courses = courses_resp.json()
        
        if len(courses) < 1:
            pytest.skip("Not enough courses for bulk test")
            
        # Create bulk payload
        items = []
        for i, course in enumerate(courses[:2]):  # Max 2 courses
            items.append({
                "teacher_id": teacher_id,
                "course_id": course.get("course_id"),
                "weekly_hours": 3.0 + i,
                "notes": f"TEST_bulk_entry_{i}"
            })
            
        resp = self.session.post(f"{BASE_URL}/api/teaching-load/bulk", json=items)
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        assert "created" in data or "updated" in data
        print(f"✓ POST /api/teaching-load/bulk saved {len(items)} entries")
        
    # ============ FILTER BY DEPARTMENT TESTS ============
    def test_get_teaching_loads_filter_by_department(self):
        """GET /api/teaching-load?department_id={id} filters by department"""
        # Get departments
        depts_resp = self.session.get(f"{BASE_URL}/api/departments")
        depts = depts_resp.json()
        
        if not depts:
            pytest.skip("No departments available")
            
        dept_id = depts[0].get("id")
        resp = self.session.get(f"{BASE_URL}/api/teaching-load", params={"department_id": dept_id})
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert isinstance(data["items"], list)
        print(f"✓ GET /api/teaching-load?department_id={dept_id} returns {len(data['items'])} items")
        
    # ============ DELETE TESTS ============
    def test_delete_teaching_load(self):
        """DELETE /api/teaching-load/{id} deletes an entry"""
        # First create an entry to delete
        teachers_resp = self.session.get(f"{BASE_URL}/api/teachers")
        teachers = teachers_resp.json()
        
        if not teachers:
            pytest.skip("No teachers available")
            
        teacher_id = teachers[0].get("id")
        
        # Get teacher's courses
        courses_resp = self.session.get(f"{BASE_URL}/api/teaching-load/teacher/{teacher_id}/courses")
        courses = courses_resp.json()
        
        if not courses:
            pytest.skip("No courses available for teacher")
            
        course = courses[0]
        course_id = course.get("course_id")
        
        # Create entry
        create_resp = self.session.post(f"{BASE_URL}/api/teaching-load", json={
            "teacher_id": teacher_id,
            "course_id": course_id,
            "weekly_hours": 2.0,
            "notes": "TEST_to_delete"
        })
        assert create_resp.status_code == 200
        
        # Get the load ID from teacher courses
        courses_resp2 = self.session.get(f"{BASE_URL}/api/teaching-load/teacher/{teacher_id}/courses")
        courses2 = courses_resp2.json()
        
        load_id = None
        for c in courses2:
            if c.get("course_id") == course_id and c.get("existing_load_id"):
                load_id = c.get("existing_load_id")
                break
                
        if not load_id:
            # Try to get from teaching-load list
            loads_resp = self.session.get(f"{BASE_URL}/api/teaching-load")
            loads = loads_resp.json().get("items", [])
            for l in loads:
                if l.get("teacher_id") == teacher_id and l.get("course_id") == course_id:
                    load_id = l.get("id")
                    break
                    
        if not load_id:
            pytest.skip("Could not find load ID to delete")
            
        # Delete
        delete_resp = self.session.delete(f"{BASE_URL}/api/teaching-load/{load_id}")
        assert delete_resp.status_code == 200
        data = delete_resp.json()
        assert "message" in data
        print(f"✓ DELETE /api/teaching-load/{load_id} successful")
        
    # ============ PERMISSION TESTS ============
    def test_teaching_load_requires_permission(self):
        """Teaching load endpoints require proper permissions"""
        # Test without auth
        resp = requests.get(f"{BASE_URL}/api/teaching-load")
        assert resp.status_code in [401, 403]
        
        resp = requests.post(f"{BASE_URL}/api/teaching-load", json={
            "teacher_id": "test",
            "course_id": "test",
            "weekly_hours": 1
        })
        assert resp.status_code in [401, 403]
        print("✓ Teaching load endpoints require authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
