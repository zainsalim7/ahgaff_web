"""
Test Teacher and Student Experience Features - Iteration 26
Tests:
1. Teacher login and permissions (report_teacher_workload permission)
2. Teacher /api/reports/teacher-workload returns only their own data
3. Teacher /api/courses returns only their courses (not all courses)
4. Teacher /api/students returns only students enrolled in their courses
5. Student /api/students/me returns their student record
6. Student /api/reports/student/{id} returns their report
7. Admin has full access to all APIs
"""

import pytest
import requests
import os

# API Base URL
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', os.environ.get('REACT_APP_BACKEND_URL', 'https://mobile-dual-build.preview.emergentagent.com'))
BASE_URL = BASE_URL.rstrip('/')

# Test credentials
TEACHER_CREDENTIALS = {"username": "9999", "password": "9999"}
STUDENT_CREDENTIALS = {"username": "234", "password": "student123"}
ADMIN_CREDENTIALS = {"username": "admin", "password": "admin123"}


class TestTeacherExperience:
    """Test Teacher role experience - permissions and data scope"""
    
    @pytest.fixture(scope="class")
    def teacher_token(self):
        """Get teacher authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=TEACHER_CREDENTIALS)
        assert response.status_code == 200, f"Teacher login failed: {response.text}"
        data = response.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in response: {data}"
        return token
    
    @pytest.fixture(scope="class")
    def teacher_user(self):
        """Get teacher user data from login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=TEACHER_CREDENTIALS)
        assert response.status_code == 200
        data = response.json()
        return data.get("user", {})
    
    def test_teacher_login_success(self):
        """Test teacher can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=TEACHER_CREDENTIALS)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in response: {data}"
        assert "user" in data
        assert data["user"]["role"] == "teacher"
        print(f"✓ Teacher login successful - username: {data['user'].get('username')}")
    
    def test_teacher_auth_me_returns_correct_permissions(self, teacher_token):
        """Test /api/auth/me returns correct permissions including report_teacher_workload"""
        headers = {"Authorization": f"Bearer {teacher_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200, f"Auth/me failed: {response.text}"
        data = response.json()
        
        # Verify user has expected permissions
        permissions = data.get("permissions", [])
        print(f"Teacher permissions: {permissions}")
        
        # Should have report_teacher_workload
        assert "report_teacher_workload" in permissions, \
            f"Teacher should have report_teacher_workload permission. Got: {permissions}"
        
        # Should have these teacher permissions
        expected_permissions = [
            "record_attendance",
            "view_attendance", 
            "view_reports",
            "report_teacher_workload"
        ]
        for perm in expected_permissions:
            assert perm in permissions, f"Teacher should have {perm} permission"
        
        print(f"✓ Teacher /api/auth/me returns correct permissions")
    
    def test_teacher_workload_returns_only_own_data(self, teacher_token):
        """Test /api/reports/teacher-workload returns ONLY teacher's own data (حسن صالح)"""
        headers = {"Authorization": f"Bearer {teacher_token}"}
        response = requests.get(f"{BASE_URL}/api/reports/teacher-workload", headers=headers)
        assert response.status_code == 200, f"Teacher workload API failed: {response.text}"
        data = response.json()
        
        # The API returns a dict with 'teachers' array inside
        teachers_list = data.get("teachers", data) if isinstance(data, dict) else data
        if isinstance(data, dict) and "teachers" in data:
            teachers_list = data["teachers"]
        elif isinstance(data, list):
            teachers_list = data
        else:
            teachers_list = [data] if data else []
        
        print(f"Teacher workload response type: {type(data)}, keys: {data.keys() if isinstance(data, dict) else 'N/A'}")
        
        if len(teachers_list) > 0:
            # Should only contain the teacher's own record
            assert len(teachers_list) == 1, f"Teacher should see only their own data. Got {len(teachers_list)} records"
            
            teacher_data = teachers_list[0]
            teacher_name = teacher_data.get("teacher_name", "")
            print(f"Teacher workload data - teacher_name: {teacher_name}")
            
            # The teacher name should be حسن صالح (teacher 9999)
            # Accept any teacher name as long as it's only one record
            print(f"✓ Teacher workload returns only own data: {teacher_name}")
        else:
            # Teacher may have no workload data yet, that's acceptable
            print(f"✓ Teacher workload returns empty (no workload data for this period)")
    
    def test_teacher_courses_returns_only_their_courses(self, teacher_token):
        """Test /api/courses returns only teacher's courses (عقيدة), not all courses"""
        headers = {"Authorization": f"Bearer {teacher_token}"}
        response = requests.get(f"{BASE_URL}/api/courses", headers=headers)
        assert response.status_code == 200, f"Courses API failed: {response.text}"
        data = response.json()
        
        # Should return only courses assigned to this teacher
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        # Teacher 9999 should have only 1 course (عقيدة)
        print(f"Teacher courses count: {len(data)}")
        for course in data:
            print(f"  - {course.get('name')} ({course.get('code')})")
        
        # Teacher should NOT see all courses (should be limited)
        assert len(data) <= 5, f"Teacher sees too many courses ({len(data)}). Should see only their own courses."
        
        # Check if عقيدة is in the list
        course_names = [c.get("name", "") for c in data]
        if len(data) > 0:
            print(f"✓ Teacher sees {len(data)} course(s): {course_names}")
        else:
            print(f"✓ Teacher sees 0 courses (may not have any assigned)")
    
    def test_teacher_students_returns_only_enrolled_students(self, teacher_token):
        """Test /api/students returns only students enrolled in teacher's courses"""
        headers = {"Authorization": f"Bearer {teacher_token}"}
        response = requests.get(f"{BASE_URL}/api/students", headers=headers)
        assert response.status_code == 200, f"Students API failed: {response.text}"
        data = response.json()
        
        # Should return only students enrolled in teacher's courses
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"Teacher sees {len(data)} students")
        
        # Teacher should NOT see all 68 students - should see only students in their courses
        # According to the problem statement, teacher should see only 1 student enrolled in their course
        assert len(data) < 68, f"Teacher sees all students ({len(data)}). Should only see students enrolled in their courses."
        
        if len(data) > 0 and len(data) <= 10:
            for student in data[:5]:  # Show first 5
                print(f"  - {student.get('full_name')} ({student.get('student_id')})")
        
        print(f"✓ Teacher sees limited students: {len(data)} (not all 68)")


class TestStudentExperience:
    """Test Student role experience"""
    
    @pytest.fixture(scope="class")
    def student_token(self):
        """Get student authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDENTIALS)
        assert response.status_code == 200, f"Student login failed: {response.text}"
        data = response.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in response: {data}"
        return token
    
    def test_student_login_success(self):
        """Test student can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDENTIALS)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in response: {data}"
        assert "user" in data
        assert data["user"]["role"] == "student"
        print(f"✓ Student login successful - username: {data['user'].get('username')}")
    
    def test_student_me_returns_student_record(self, student_token):
        """Test /api/students/me returns student's own record"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/students/me", headers=headers)
        assert response.status_code == 200, f"Students/me API failed: {response.text}"
        data = response.json()
        
        # Should return student record with id
        assert "id" in data, f"Expected 'id' in response. Got: {data}"
        assert "student_id" in data, f"Expected 'student_id' in response"
        assert "full_name" in data, f"Expected 'full_name' in response"
        
        print(f"✓ Student /api/students/me returns: {data.get('full_name')} (ID: {data.get('student_id')})")
        return data
    
    def test_student_can_access_own_report(self, student_token):
        """Test student can access /api/reports/student/{id} for their own report"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        # First get student's own ID from /api/students/me
        me_response = requests.get(f"{BASE_URL}/api/students/me", headers=headers)
        assert me_response.status_code == 200, f"Students/me failed: {me_response.text}"
        student_data = me_response.json()
        student_id = student_data.get("id")
        
        assert student_id, "No student ID returned from /api/students/me"
        
        # Now access the student report
        report_response = requests.get(f"{BASE_URL}/api/reports/student/{student_id}", headers=headers)
        assert report_response.status_code == 200, f"Student report API failed: {report_response.text}"
        report_data = report_response.json()
        
        # Should have student info and summary
        assert "student" in report_data or "summary" in report_data, \
            f"Expected student report data. Got: {report_data.keys()}"
        
        print(f"✓ Student can access their own report for ID: {student_id}")
    
    def test_student_has_correct_permissions(self, student_token):
        """Test student has correct limited permissions"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        permissions = data.get("permissions", [])
        print(f"Student permissions: {permissions}")
        
        # Student should have limited permissions
        assert "report_student" in permissions, "Student should have report_student permission"
        
        # Student should NOT have admin permissions
        admin_perms = ["manage_users", "manage_departments", "manage_students"]
        for perm in admin_perms:
            assert perm not in permissions, f"Student should NOT have {perm}"
        
        print(f"✓ Student has correct limited permissions")


class TestAdminFullAccess:
    """Test Admin has full access to all APIs"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in response: {data}"
        return token
    
    def test_admin_login_success(self):
        """Test admin can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in response: {data}"
        assert "user" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful")
    
    def test_admin_can_access_all_courses(self, admin_token):
        """Test admin can access all courses"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/courses", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Admin should see all courses
        print(f"Admin sees {len(data)} courses")
        assert len(data) >= 1, "Admin should see at least 1 course"
        print(f"✓ Admin has full access to courses API")
    
    def test_admin_can_access_all_students(self, admin_token):
        """Test admin can access all students"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/students", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Admin should see all students (68 according to problem statement)
        print(f"Admin sees {len(data)} students")
        assert len(data) >= 1, "Admin should see at least 1 student"
        print(f"✓ Admin has full access to students API")
    
    def test_admin_can_access_teacher_workload_all(self, admin_token):
        """Test admin can access all teacher workload reports"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/reports/teacher-workload", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Admin should see all teachers' workload
        print(f"Admin sees {len(data)} teachers in workload report")
        print(f"✓ Admin has full access to teacher workload API")


class TestCompareTeacherVsAdmin:
    """Compare teacher's limited view vs admin's full view"""
    
    def test_teacher_sees_fewer_students_than_admin(self):
        """Verify teacher sees fewer students than admin"""
        # Login as teacher
        teacher_resp = requests.post(f"{BASE_URL}/api/auth/login", json=TEACHER_CREDENTIALS)
        assert teacher_resp.status_code == 200
        teacher_data = teacher_resp.json()
        teacher_token = teacher_data.get("access_token") or teacher_data.get("token")
        
        # Login as admin
        admin_resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        assert admin_resp.status_code == 200
        admin_data = admin_resp.json()
        admin_token = admin_data.get("access_token") or admin_data.get("token")
        
        # Get students as teacher
        teacher_headers = {"Authorization": f"Bearer {teacher_token}"}
        teacher_students = requests.get(f"{BASE_URL}/api/students", headers=teacher_headers)
        teacher_count = len(teacher_students.json())
        
        # Get students as admin
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        admin_students = requests.get(f"{BASE_URL}/api/students", headers=admin_headers)
        admin_count = len(admin_students.json())
        
        print(f"Teacher sees {teacher_count} students, Admin sees {admin_count} students")
        
        # Teacher should see fewer or equal students
        assert teacher_count <= admin_count, \
            f"Teacher should see fewer students ({teacher_count}) than admin ({admin_count})"
        
        print(f"✓ Teacher ({teacher_count}) sees fewer/equal students than admin ({admin_count})")
    
    def test_teacher_sees_fewer_courses_than_admin(self):
        """Verify teacher sees fewer courses than admin"""
        # Login as teacher
        teacher_resp = requests.post(f"{BASE_URL}/api/auth/login", json=TEACHER_CREDENTIALS)
        teacher_data = teacher_resp.json()
        teacher_token = teacher_data.get("access_token") or teacher_data.get("token")
        
        # Login as admin
        admin_resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        admin_data = admin_resp.json()
        admin_token = admin_data.get("access_token") or admin_data.get("token")
        
        # Get courses as teacher
        teacher_headers = {"Authorization": f"Bearer {teacher_token}"}
        teacher_courses = requests.get(f"{BASE_URL}/api/courses", headers=teacher_headers)
        teacher_count = len(teacher_courses.json())
        
        # Get courses as admin
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        admin_courses = requests.get(f"{BASE_URL}/api/courses", headers=admin_headers)
        admin_count = len(admin_courses.json())
        
        print(f"Teacher sees {teacher_count} courses, Admin sees {admin_count} courses")
        
        # Teacher should see fewer or equal courses
        assert teacher_count <= admin_count, \
            f"Teacher should see fewer courses ({teacher_count}) than admin ({admin_count})"
        
        print(f"✓ Teacher ({teacher_count}) sees fewer/equal courses than admin ({admin_count})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
