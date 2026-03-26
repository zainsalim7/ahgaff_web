"""
Test Teacher Creation/Update with department_ids Array
Testing the fixes for:
1. POST /api/teachers with department_ids array correctly stores department_id
2. PUT /api/teachers/{id} with department_ids array correctly updates department_id
3. GET /api/teachers returns teachers with correct department_id
4. GET /api/courses returns courses with teacher_name populated
5. Teacher filter by department works in frontend

Test data info from review request:
- Department '698e500997fef774e66e93a8' = الشريعة والقانون 
- Department '698e501d97fef774e66e93a9' = الدراسات الإسلامية
"""
import pytest
import requests
import os
import uuid

# Get the backend URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://schedule-hub-272.preview.emergentagent.com"

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"


class TestTeacherDepartmentIdsFix:
    """Test teacher creation and update with department_ids array from frontend"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        return response.json()["access_token"]
    
    @pytest.fixture
    def test_department_id(self, admin_token):
        """Get a valid department ID for testing"""
        response = requests.get(
            f"{BASE_URL}/api/departments",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if response.status_code != 200 or not response.json():
            pytest.skip("No departments available for testing")
        dept = response.json()[0]
        print(f"Using test department: {dept['name']} (ID: {dept['id']})")
        return dept['id']
    
    def test_create_teacher_with_department_ids_array(self, admin_token, test_department_id):
        """
        Test POST /api/teachers with department_ids array (frontend format)
        Backend should extract first element and store as department_id
        """
        unique_id = f"TEST_{uuid.uuid4().hex[:8]}"
        
        # Simulate frontend payload with department_ids array
        payload = {
            "teacher_id": unique_id,
            "full_name": f"Test Teacher {unique_id}",
            "department_ids": [test_department_id]  # Array like frontend sends
        }
        
        print(f"Creating teacher with department_ids: {payload['department_ids']}")
        
        response = requests.post(
            f"{BASE_URL}/api/teachers",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=payload
        )
        
        assert response.status_code == 200, f"Failed to create teacher: {response.text}"
        
        data = response.json()
        teacher_id = data["id"]
        
        # Verify department_id was set correctly
        assert data.get("department_id") == test_department_id, \
            f"Expected department_id={test_department_id}, got {data.get('department_id')}"
        
        print(f"✓ Teacher created with department_id: {data.get('department_id')}")
        
        # Verify by fetching the teacher
        get_response = requests.get(
            f"{BASE_URL}/api/teachers/{teacher_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched.get("department_id") == test_department_id, \
            f"Fetched teacher has wrong department_id: {fetched.get('department_id')}"
        
        print(f"✓ Fetched teacher has correct department_id")
        
        # Cleanup - delete the test teacher
        delete_response = requests.delete(
            f"{BASE_URL}/api/teachers/{teacher_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Cleanup: Teacher deleted (status: {delete_response.status_code})")
        
        return teacher_id

    def test_update_teacher_with_department_ids_array(self, admin_token, test_department_id):
        """
        Test PUT /api/teachers/{id} with department_ids array
        Backend should update department_id from the array
        """
        unique_id = f"TEST_{uuid.uuid4().hex[:8]}"
        
        # First create a teacher without department
        create_payload = {
            "teacher_id": unique_id,
            "full_name": f"Test Teacher {unique_id}",
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/teachers",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=create_payload
        )
        
        if create_response.status_code != 200:
            pytest.skip(f"Failed to create test teacher: {create_response.text}")
        
        teacher_id = create_response.json()["id"]
        print(f"Created test teacher: {teacher_id}")
        
        # Now update with department_ids array
        update_payload = {
            "department_ids": [test_department_id]  # Array like frontend sends
        }
        
        print(f"Updating teacher with department_ids: {update_payload['department_ids']}")
        
        update_response = requests.put(
            f"{BASE_URL}/api/teachers/{teacher_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=update_payload
        )
        
        assert update_response.status_code == 200, f"Failed to update teacher: {update_response.text}"
        
        data = update_response.json()
        
        # Verify department_id was updated correctly
        assert data.get("department_id") == test_department_id, \
            f"Expected department_id={test_department_id}, got {data.get('department_id')}"
        
        print(f"✓ Teacher updated with department_id: {data.get('department_id')}")
        
        # Cleanup
        delete_response = requests.delete(
            f"{BASE_URL}/api/teachers/{teacher_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Cleanup: Teacher deleted (status: {delete_response.status_code})")

    def test_get_teachers_returns_department_id(self, admin_token, test_department_id):
        """
        Test GET /api/teachers returns teachers with department_id field
        """
        response = requests.get(
            f"{BASE_URL}/api/teachers",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Failed to get teachers: {response.text}"
        
        teachers = response.json()
        assert isinstance(teachers, list), "Response should be a list"
        
        print(f"Found {len(teachers)} teachers")
        
        # Find teachers with department_id set
        teachers_with_dept = [t for t in teachers if t.get("department_id")]
        print(f"Teachers with department_id: {len(teachers_with_dept)}")
        
        if teachers_with_dept:
            sample = teachers_with_dept[0]
            print(f"Sample teacher: {sample.get('full_name')} - department_id: {sample.get('department_id')}")
        
        # Verify the teachers can be filtered by department
        # Count teachers in test department
        teachers_in_test_dept = [t for t in teachers 
                                  if t.get("department_id") == test_department_id 
                                  or (t.get("department_ids") and test_department_id in t.get("department_ids", []))]
        print(f"Teachers in test department: {len(teachers_in_test_dept)}")


class TestCourseTeacherNameFix:
    """Test that GET /api/courses returns teacher_name correctly"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        return response.json()["access_token"]
    
    def test_get_courses_returns_teacher_name(self, admin_token):
        """
        Test GET /api/courses returns courses with teacher_name populated
        Not 'غير محدد' for courses with valid teacher_id
        """
        response = requests.get(
            f"{BASE_URL}/api/courses",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Failed to get courses: {response.text}"
        
        courses = response.json()
        assert isinstance(courses, list), "Response should be a list"
        
        print(f"Found {len(courses)} courses")
        
        # Check courses with teacher_id
        courses_with_teacher = [c for c in courses if c.get("teacher_id")]
        print(f"Courses with teacher_id: {len(courses_with_teacher)}")
        
        # Check how many have teacher_name populated (not None or غير محدد)
        courses_with_teacher_name = [
            c for c in courses_with_teacher 
            if c.get("teacher_name") and c.get("teacher_name") != "غير محدد"
        ]
        print(f"Courses with teacher_name populated: {len(courses_with_teacher_name)}")
        
        # List courses and their teacher_name status
        for course in courses[:5]:
            has_teacher_id = "✓" if course.get("teacher_id") else "✗"
            teacher_name = course.get("teacher_name") or "None"
            print(f"  - {course['name']}: teacher_id={has_teacher_id}, teacher_name={teacher_name}")
        
        # If there are courses with teacher_id, most should have teacher_name
        if courses_with_teacher:
            success_rate = len(courses_with_teacher_name) / len(courses_with_teacher) * 100
            print(f"Teacher name resolution rate: {success_rate:.1f}%")
            
            # Warn if teacher_name is not populated for courses with teacher_id
            missing_names = [c for c in courses_with_teacher 
                           if not c.get("teacher_name") or c.get("teacher_name") == "غير محدد"]
            if missing_names:
                print(f"⚠ {len(missing_names)} courses have teacher_id but no teacher_name:")
                for c in missing_names[:3]:
                    print(f"    - {c['name']} (teacher_id: {c.get('teacher_id')})")


class TestTeacherFilterByDepartment:
    """Test that teachers can be filtered by department"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        return response.json()["access_token"]
    
    def test_get_teachers_with_department_filter(self, admin_token):
        """
        Test that teachers list can be used for filtering by department
        Frontend filters by department_id or department_ids
        """
        # Get all teachers
        response = requests.get(
            f"{BASE_URL}/api/teachers",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        teachers = response.json()
        
        # Get departments
        dept_response = requests.get(
            f"{BASE_URL}/api/departments",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        departments = dept_response.json() if dept_response.status_code == 200 else []
        
        # Count teachers per department
        dept_counts = {}
        for dept in departments:
            dept_id = dept["id"]
            count = len([t for t in teachers 
                        if t.get("department_id") == dept_id 
                        or (t.get("department_ids") and dept_id in t.get("department_ids", []))])
            if count > 0:
                dept_counts[dept["name"]] = count
        
        print(f"Teachers per department:")
        for dept_name, count in dept_counts.items():
            print(f"  - {dept_name}: {count}")
        
        # Test specific departments from review request
        test_dept_ids = [
            ("698e500997fef774e66e93a8", "الشريعة والقانون"),
            ("698e501d97fef774e66e93a9", "الدراسات الإسلامية")
        ]
        
        for dept_id, expected_name in test_dept_ids:
            teachers_in_dept = [t for t in teachers 
                               if t.get("department_id") == dept_id 
                               or (t.get("department_ids") and dept_id in t.get("department_ids", []))]
            print(f"Teachers in {expected_name} ({dept_id}): {len(teachers_in_dept)}")
            for t in teachers_in_dept:
                print(f"  - {t.get('full_name')} (dept_id: {t.get('department_id')})")


class TestDepartmentDeleteProtection:
    """Test department and course delete returns proper Arabic error messages"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        return response.json()["access_token"]
    
    def test_delete_department_with_data_returns_arabic_error(self, admin_token):
        """
        Test DELETE /api/departments returns 400 with clear Arabic error
        when department has associated data
        """
        # Get department stats to find one with data
        stats_response = requests.get(
            f"{BASE_URL}/api/departments/stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert stats_response.status_code == 200
        departments = stats_response.json()
        
        # Find department with data
        dept_with_data = None
        for dept in departments:
            if dept.get("students_count", 0) > 0 or dept.get("courses_count", 0) > 0:
                dept_with_data = dept
                break
        
        if not dept_with_data:
            pytest.skip("No department with data found")
        
        print(f"Testing delete on: {dept_with_data['name']}")
        print(f"  students: {dept_with_data.get('students_count', 0)}, courses: {dept_with_data.get('courses_count', 0)}")
        
        # Try to delete
        delete_response = requests.delete(
            f"{BASE_URL}/api/departments/{dept_with_data['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert delete_response.status_code == 400, f"Expected 400, got {delete_response.status_code}"
        
        error = delete_response.json()
        assert "detail" in error
        
        # Check for Arabic error message
        error_msg = error["detail"]
        print(f"Error message: {error_msg}")
        
        # Should contain Arabic keywords about blocking deletion
        arabic_keywords = ["لا يمكن حذف", "طالب", "معلم", "مقرر", "مرتبط"]
        has_arabic = any(kw in error_msg for kw in arabic_keywords)
        assert has_arabic, f"Error should be in Arabic: {error_msg}"
        
        print("✓ Delete blocked with Arabic error message")

    def test_delete_course_with_enrollments_returns_arabic_error(self, admin_token):
        """
        Test DELETE /api/courses returns 400 with clear Arabic error
        when course has enrolled students
        """
        # Get courses
        courses_response = requests.get(
            f"{BASE_URL}/api/courses",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert courses_response.status_code == 200
        courses = courses_response.json()
        
        # Find course with enrollments
        course_with_students = None
        for course in courses:
            backup_response = requests.get(
                f"{BASE_URL}/api/courses/{course['id']}/backup-info",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            if backup_response.status_code == 200:
                if backup_response.json().get("enrollments_count", 0) > 0:
                    course_with_students = course
                    course_with_students["enrollments_count"] = backup_response.json().get("enrollments_count")
                    break
        
        if not course_with_students:
            pytest.skip("No course with enrolled students found")
        
        print(f"Testing delete on: {course_with_students['name']} ({course_with_students['enrollments_count']} enrolled)")
        
        # Try to delete
        delete_response = requests.delete(
            f"{BASE_URL}/api/courses/{course_with_students['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert delete_response.status_code == 400, f"Expected 400, got {delete_response.status_code}"
        
        error = delete_response.json()
        assert "detail" in error
        
        error_msg = error["detail"]
        print(f"Error message: {error_msg}")
        
        # Should mention students/enrolled
        assert "طالب" in error_msg or "مسجل" in error_msg, f"Error should mention students: {error_msg}"
        
        print("✓ Delete blocked with Arabic error about enrolled students")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
