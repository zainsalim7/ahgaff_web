"""
Tests for Department and Course Delete Endpoints
Testing the fixes for:
1. DELETE /api/departments/{dept_id} - returns 400 when has associated data
2. DELETE /api/departments/{dept_id} - succeeds when empty
3. DELETE /api/courses/{course_id} - returns 400 when has enrolled students
4. DELETE /api/courses/{course_id} - succeeds when no enrolled students
"""
import pytest
import requests
import os

# Get the backend URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://schedule-hub-272.preview.emergentagent.com"

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"


class TestDepartmentDelete:
    """Test department delete endpoint protection"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["access_token"]
    
    def test_get_department_stats(self, admin_token):
        """Get department stats to identify test departments"""
        response = requests.get(
            f"{BASE_URL}/api/departments/stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get stats: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Find departments for testing
        empty_dept = None
        dept_with_data = None
        
        for dept in data:
            students_count = dept.get("students_count", 0)
            courses_count = dept.get("courses_count", 0)
            
            print(f"Department: {dept['name']} - students: {students_count}, courses: {courses_count}")
            
            # Look for empty department (for successful delete test)
            if students_count == 0 and courses_count == 0:
                empty_dept = dept
            
            # Look for department with data (for blocked delete test)
            if students_count > 0 or courses_count > 0:
                dept_with_data = dept
        
        return {"empty": empty_dept, "with_data": dept_with_data, "all": data}
    
    def test_delete_department_with_students_fails(self, admin_token):
        """Test DELETE /api/departments returns 400 when department has associated students"""
        # First, get department stats
        stats_response = requests.get(
            f"{BASE_URL}/api/departments/stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert stats_response.status_code == 200
        
        departments = stats_response.json()
        
        # Find a department with students or courses
        dept_with_data = None
        for dept in departments:
            # Check both students and courses count
            if dept.get("students_count", 0) > 0:
                dept_with_data = dept
                break
        
        if not dept_with_data:
            pytest.skip("No department with students found for testing")
        
        print(f"Testing delete on department '{dept_with_data['name']}' with {dept_with_data['students_count']} students")
        
        # Try to delete - should fail with 400
        delete_response = requests.delete(
            f"{BASE_URL}/api/departments/{dept_with_data['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert delete_response.status_code == 400, f"Expected 400, got {delete_response.status_code}: {delete_response.text}"
        
        # Verify error message mentions the reason
        error_data = delete_response.json()
        assert "detail" in error_data
        assert "طالب" in error_data["detail"] or "students" in error_data["detail"].lower(), \
            f"Error should mention students: {error_data['detail']}"
        print(f"DELETE blocked correctly: {error_data['detail']}")
    
    def test_delete_department_with_courses_fails(self, admin_token):
        """Test DELETE /api/departments returns 400 when department has courses"""
        stats_response = requests.get(
            f"{BASE_URL}/api/departments/stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert stats_response.status_code == 200
        
        departments = stats_response.json()
        
        # Find a department with courses (even if no students)
        dept_with_courses = None
        for dept in departments:
            if dept.get("courses_count", 0) > 0:
                dept_with_courses = dept
                break
        
        if not dept_with_courses:
            pytest.skip("No department with courses found for testing")
        
        print(f"Testing delete on department '{dept_with_courses['name']}' with {dept_with_courses['courses_count']} courses")
        
        # Try to delete - should fail with 400
        delete_response = requests.delete(
            f"{BASE_URL}/api/departments/{dept_with_courses['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert delete_response.status_code == 400, f"Expected 400, got {delete_response.status_code}: {delete_response.text}"
        
        error_data = delete_response.json()
        print(f"DELETE blocked correctly: {error_data.get('detail', 'No detail')}")
    
    def test_create_and_delete_empty_department(self, admin_token):
        """Test that an empty department can be deleted successfully"""
        # Create a test department
        test_dept_data = {
            "name": "قسم اختبار للحذف",
            "code": "TEST_DEL_DEPT",
            "description": "Department for delete testing"
        }
        
        # Get faculties first for faculty_id
        faculties_response = requests.get(
            f"{BASE_URL}/api/faculties",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if faculties_response.status_code == 200 and faculties_response.json():
            test_dept_data["faculty_id"] = faculties_response.json()[0]["id"]
        
        create_response = requests.post(
            f"{BASE_URL}/api/departments",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=test_dept_data
        )
        
        if create_response.status_code != 200:
            # If creation fails (e.g., already exists), try to find existing test dept
            stats_response = requests.get(
                f"{BASE_URL}/api/departments/stats",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            departments = stats_response.json()
            test_dept = None
            for dept in departments:
                if dept.get("code") == "TEST_DEL_DEPT" or "اختبار للحذف" in dept.get("name", ""):
                    if dept.get("students_count", 0) == 0 and dept.get("courses_count", 0) == 0:
                        test_dept = dept
                        break
            
            if not test_dept:
                pytest.skip(f"Could not create test department: {create_response.text}")
            
            dept_id = test_dept["id"]
            print(f"Using existing empty test department: {test_dept['name']}")
        else:
            created_dept = create_response.json()
            dept_id = created_dept["id"]
            print(f"Created test department: {created_dept['name']}")
        
        # Now delete it - should succeed
        delete_response = requests.delete(
            f"{BASE_URL}/api/departments/{dept_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        data = delete_response.json()
        assert "message" in data
        print(f"Empty department deleted successfully: {data['message']}")
        
        # Verify it's actually deleted
        get_response = requests.get(
            f"{BASE_URL}/api/departments",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        departments = get_response.json()
        deleted_exists = any(d.get("id") == dept_id for d in departments)
        assert not deleted_exists, "Department still exists after delete"


class TestCourseDelete:
    """Test course delete endpoint protection"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["access_token"]
    
    def test_get_courses_with_enrollment_status(self, admin_token):
        """Get courses and check enrollment counts"""
        response = requests.get(
            f"{BASE_URL}/api/courses",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get courses: {response.text}"
        
        courses = response.json()
        assert isinstance(courses, list), "Response should be a list"
        
        print(f"Found {len(courses)} courses")
        for course in courses[:5]:  # Print first 5
            print(f"  - {course['name']} ({course.get('code', 'N/A')})")
        
        return courses
    
    def test_delete_course_with_enrollments_fails(self, admin_token):
        """Test DELETE /api/courses returns 400 when course has enrolled students"""
        # Get courses
        courses_response = requests.get(
            f"{BASE_URL}/api/courses",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert courses_response.status_code == 200
        
        courses = courses_response.json()
        
        # We need to find a course with enrollments
        # Check each course for enrollments
        course_with_students = None
        
        for course in courses:
            # Try to get course details including students_count
            # Or try to delete and see if it fails
            course_id = course["id"]
            
            # Check enrollments for this course via backup-info endpoint
            backup_response = requests.get(
                f"{BASE_URL}/api/courses/{course_id}/backup-info",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            if backup_response.status_code == 200:
                backup_data = backup_response.json()
                enrollments_count = backup_data.get("enrollments_count", 0)
                if enrollments_count > 0:
                    course_with_students = course
                    course_with_students["enrollments_count"] = enrollments_count
                    break
        
        if not course_with_students:
            pytest.skip("No course with enrolled students found for testing")
        
        print(f"Testing delete on course '{course_with_students['name']}' with {course_with_students['enrollments_count']} enrolled students")
        
        # Try to delete - should fail with 400
        delete_response = requests.delete(
            f"{BASE_URL}/api/courses/{course_with_students['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert delete_response.status_code == 400, f"Expected 400, got {delete_response.status_code}: {delete_response.text}"
        
        # Verify error message mentions students/enrollments
        error_data = delete_response.json()
        assert "detail" in error_data
        print(f"DELETE blocked correctly: {error_data['detail']}")
        
        # Check that error message contains number of students
        assert "طالب" in error_data["detail"] or "مسجل" in error_data["detail"], \
            f"Error should mention enrolled students: {error_data['detail']}"
    
    def test_create_and_delete_empty_course(self, admin_token):
        """Test that a course with no enrollments can be deleted successfully"""
        # Get departments for course creation
        depts_response = requests.get(
            f"{BASE_URL}/api/departments",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if depts_response.status_code != 200 or not depts_response.json():
            pytest.skip("No departments available for test")
        
        dept_id = depts_response.json()[0]["id"]
        
        # Get teachers for course creation
        teachers_response = requests.get(
            f"{BASE_URL}/api/teachers",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        teacher_id = None
        if teachers_response.status_code == 200 and teachers_response.json():
            teacher_id = teachers_response.json()[0]["id"]
        
        # Create a test course
        test_course_data = {
            "name": "مقرر اختبار للحذف",
            "code": "TEST_DEL_COURSE",
            "department_id": dept_id,
            "teacher_id": teacher_id,
            "level": 1,
            "section": ""
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/courses",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=test_course_data
        )
        
        if create_response.status_code != 200:
            # Try to find existing test course
            courses_response = requests.get(
                f"{BASE_URL}/api/courses",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            courses = courses_response.json()
            test_course = None
            for course in courses:
                if course.get("code") == "TEST_DEL_COURSE" or "اختبار للحذف" in course.get("name", ""):
                    # Check if it has no enrollments
                    backup_response = requests.get(
                        f"{BASE_URL}/api/courses/{course['id']}/backup-info",
                        headers={"Authorization": f"Bearer {admin_token}"}
                    )
                    if backup_response.status_code == 200:
                        if backup_response.json().get("enrollments_count", 0) == 0:
                            test_course = course
                            break
            
            if not test_course:
                pytest.skip(f"Could not create test course: {create_response.text}")
            
            course_id = test_course["id"]
            print(f"Using existing test course: {test_course['name']}")
        else:
            created_course = create_response.json()
            course_id = created_course["id"]
            print(f"Created test course: {created_course['name']}")
        
        # Delete it - should succeed since no enrollments
        delete_response = requests.delete(
            f"{BASE_URL}/api/courses/{course_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        data = delete_response.json()
        assert "message" in data
        print(f"Empty course deleted successfully: {data['message']}")


class TestDepartmentDetails:
    """Test department details endpoint to verify teacher counts"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["access_token"]
    
    def test_get_department_details(self, admin_token):
        """Test GET /api/departments/{id}/details returns correct data"""
        # Get departments first
        depts_response = requests.get(
            f"{BASE_URL}/api/departments",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert depts_response.status_code == 200
        
        departments = depts_response.json()
        if not departments:
            pytest.skip("No departments available")
        
        dept_id = departments[0]["id"]
        
        # Get details
        details_response = requests.get(
            f"{BASE_URL}/api/departments/{dept_id}/details",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert details_response.status_code == 200, f"Failed: {details_response.text}"
        
        data = details_response.json()
        assert "students_count" in data
        assert "courses_count" in data
        assert "teachers_count" in data
        assert "students" in data
        assert "courses" in data
        assert "teachers" in data
        
        print(f"Department '{data['name']}': {data['students_count']} students, {data['courses_count']} courses, {data['teachers_count']} teachers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
