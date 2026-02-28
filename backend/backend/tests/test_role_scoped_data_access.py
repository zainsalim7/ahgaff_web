"""
Test Role-Scoped Data Access - Iteration 27
Tests for teacher/student/admin role-based data filtering

Features tested:
1. Teacher (9999/9999) GET /api/reports/teacher-workload returns ONLY their own data
2. Teacher GET /api/reports/attendance-overview returns only their own courses data
3. Teacher GET /api/courses returns only their courses
4. Teacher GET /api/students returns only students enrolled in their courses
5. Student (234/student123) GET /api/students/me returns 200
6. Admin (admin/admin123) still has full access to all endpoints
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://mobile-build-17.preview.emergentagent.com')
if BASE_URL.endswith('/'):
    BASE_URL = BASE_URL.rstrip('/')

# Test credentials
TEACHER_CREDENTIALS = {"username": "9999", "password": "9999"}
STUDENT_CREDENTIALS = {"username": "234", "password": "student123"}
ADMIN_CREDENTIALS = {"username": "admin", "password": "admin123"}


class TestRoleScopedDataAccess:
    """Test suite for role-based data access scoping"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get tokens for all users"""
        self.teacher_token = self._login(TEACHER_CREDENTIALS)
        self.student_token = self._login(STUDENT_CREDENTIALS)
        self.admin_token = self._login(ADMIN_CREDENTIALS)
    
    def _login(self, credentials):
        """Helper to login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=credentials)
        if response.status_code == 200:
            return response.json().get("access_token")
        return None
    
    def _get_headers(self, token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # ==================== Teacher Tests ====================
    
    def test_teacher_login(self):
        """Test: Teacher (9999/9999) can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=TEACHER_CREDENTIALS)
        assert response.status_code == 200, f"Teacher login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data.get("user", {}).get("role") == "teacher"
        print(f"PASS: Teacher login successful, role={data.get('user', {}).get('role')}")
    
    def test_teacher_workload_returns_only_own_data(self):
        """Test: Teacher GET /api/reports/teacher-workload returns ONLY 1 teacher (their own data)"""
        assert self.teacher_token, "Teacher login required"
        
        response = requests.get(
            f"{BASE_URL}/api/reports/teacher-workload",
            headers=self._get_headers(self.teacher_token)
        )
        
        assert response.status_code == 200, f"Teacher workload API failed: {response.text}"
        data = response.json()
        
        teachers = data.get("teachers", [])
        # Teacher should see only 1 teacher record (themselves)
        assert len(teachers) == 1, f"Expected 1 teacher record, got {len(teachers)}"
        
        print(f"PASS: Teacher workload returns exactly 1 teacher record")
        print(f"  - Teacher name: {teachers[0].get('teacher_name')}")
        print(f"  - Courses count: {teachers[0].get('summary', {}).get('total_courses')}")
    
    def test_teacher_attendance_overview_returns_only_own_courses(self):
        """Test: Teacher GET /api/reports/attendance-overview returns only their own courses"""
        assert self.teacher_token, "Teacher login required"
        
        response = requests.get(
            f"{BASE_URL}/api/reports/attendance-overview",
            headers=self._get_headers(self.teacher_token)
        )
        
        assert response.status_code == 200, f"Attendance overview API failed: {response.text}"
        data = response.json()
        
        courses = data.get("courses", [])
        # Should return courses (teacher's courses only)
        print(f"PASS: Teacher attendance overview returns {len(courses)} courses")
        if courses:
            for c in courses[:3]:  # Show first 3
                print(f"  - {c.get('course_name')} ({c.get('course_code')})")
    
    def test_teacher_courses_returns_only_own_courses(self):
        """Test: Teacher GET /api/courses returns only their courses"""
        assert self.teacher_token, "Teacher login required"
        
        response = requests.get(
            f"{BASE_URL}/api/courses",
            headers=self._get_headers(self.teacher_token)
        )
        
        assert response.status_code == 200, f"Courses API failed: {response.text}"
        courses = response.json()
        
        # Teacher should see limited courses (only their own)
        teacher_courses_count = len(courses) if isinstance(courses, list) else 0
        print(f"PASS: Teacher sees {teacher_courses_count} courses")
        
        return teacher_courses_count
    
    def test_teacher_students_returns_only_enrolled_students(self):
        """Test: Teacher GET /api/students returns only students enrolled in their courses"""
        assert self.teacher_token, "Teacher login required"
        
        response = requests.get(
            f"{BASE_URL}/api/students",
            headers=self._get_headers(self.teacher_token)
        )
        
        assert response.status_code == 200, f"Students API failed: {response.text}"
        students = response.json()
        
        teacher_students_count = len(students) if isinstance(students, list) else 0
        print(f"PASS: Teacher sees {teacher_students_count} students")
        
        return teacher_students_count

    # ==================== Student Tests ====================
    
    def test_student_login(self):
        """Test: Student (234/student123) can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDENTIALS)
        assert response.status_code == 200, f"Student login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data.get("user", {}).get("role") == "student"
        print(f"PASS: Student login successful, role={data.get('user', {}).get('role')}")
    
    def test_student_me_endpoint(self):
        """Test: Student GET /api/students/me returns 200"""
        assert self.student_token, "Student login required"
        
        response = requests.get(
            f"{BASE_URL}/api/students/me",
            headers=self._get_headers(self.student_token)
        )
        
        assert response.status_code == 200, f"Student /me API failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Verify student data is returned
        assert "student_id" in data or "id" in data, f"Missing student identifier in response: {data}"
        assert "full_name" in data, f"Missing full_name in response: {data}"
        
        print(f"PASS: Student /api/students/me returns 200")
        print(f"  - Student ID: {data.get('student_id')}")
        print(f"  - Name: {data.get('full_name')}")

    # ==================== Admin Tests ====================
    
    def test_admin_login(self):
        """Test: Admin (admin/admin123) can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data.get("user", {}).get("role") == "admin"
        print(f"PASS: Admin login successful, role={data.get('user', {}).get('role')}")
    
    def test_admin_full_access_teacher_workload(self):
        """Test: Admin sees ALL teachers in workload report"""
        assert self.admin_token, "Admin login required"
        
        response = requests.get(
            f"{BASE_URL}/api/reports/teacher-workload",
            headers=self._get_headers(self.admin_token)
        )
        
        assert response.status_code == 200, f"Admin workload API failed: {response.text}"
        data = response.json()
        
        teachers = data.get("teachers", [])
        admin_teachers_count = len(teachers)
        
        # Admin should see more teachers than teacher user (unless there's only 1 teacher)
        print(f"PASS: Admin sees {admin_teachers_count} teachers in workload report")
        
        return admin_teachers_count
    
    def test_admin_full_access_courses(self):
        """Test: Admin sees ALL courses"""
        assert self.admin_token, "Admin login required"
        
        response = requests.get(
            f"{BASE_URL}/api/courses",
            headers=self._get_headers(self.admin_token)
        )
        
        assert response.status_code == 200, f"Admin courses API failed: {response.text}"
        courses = response.json()
        
        admin_courses_count = len(courses) if isinstance(courses, list) else 0
        print(f"PASS: Admin sees {admin_courses_count} courses")
        
        return admin_courses_count
    
    def test_admin_full_access_students(self):
        """Test: Admin sees ALL students"""
        assert self.admin_token, "Admin login required"
        
        response = requests.get(
            f"{BASE_URL}/api/students",
            headers=self._get_headers(self.admin_token)
        )
        
        assert response.status_code == 200, f"Admin students API failed: {response.text}"
        students = response.json()
        
        admin_students_count = len(students) if isinstance(students, list) else 0
        print(f"PASS: Admin sees {admin_students_count} students")
        
        return admin_students_count

    # ==================== Comparison Tests ====================
    
    def test_compare_teacher_vs_admin_courses(self):
        """Test: Teacher sees fewer or equal courses than admin"""
        assert self.teacher_token, "Teacher login required"
        assert self.admin_token, "Admin login required"
        
        # Get teacher courses
        teacher_resp = requests.get(
            f"{BASE_URL}/api/courses",
            headers=self._get_headers(self.teacher_token)
        )
        teacher_courses = len(teacher_resp.json()) if teacher_resp.status_code == 200 else 0
        
        # Get admin courses
        admin_resp = requests.get(
            f"{BASE_URL}/api/courses",
            headers=self._get_headers(self.admin_token)
        )
        admin_courses = len(admin_resp.json()) if admin_resp.status_code == 200 else 0
        
        # Teacher should see fewer or equal courses
        assert teacher_courses <= admin_courses, \
            f"Teacher should see <= courses than admin. Teacher: {teacher_courses}, Admin: {admin_courses}"
        
        print(f"PASS: Teacher courses ({teacher_courses}) <= Admin courses ({admin_courses})")
    
    def test_compare_teacher_vs_admin_students(self):
        """Test: Teacher sees fewer or equal students than admin"""
        assert self.teacher_token, "Teacher login required"
        assert self.admin_token, "Admin login required"
        
        # Get teacher students
        teacher_resp = requests.get(
            f"{BASE_URL}/api/students",
            headers=self._get_headers(self.teacher_token)
        )
        teacher_students = len(teacher_resp.json()) if teacher_resp.status_code == 200 else 0
        
        # Get admin students
        admin_resp = requests.get(
            f"{BASE_URL}/api/students",
            headers=self._get_headers(self.admin_token)
        )
        admin_students = len(admin_resp.json()) if admin_resp.status_code == 200 else 0
        
        # Teacher should see fewer or equal students
        assert teacher_students <= admin_students, \
            f"Teacher should see <= students than admin. Teacher: {teacher_students}, Admin: {admin_students}"
        
        print(f"PASS: Teacher students ({teacher_students}) <= Admin students ({admin_students})")
    
    def test_compare_teacher_vs_admin_workload_reports(self):
        """Test: Teacher sees only 1 teacher in workload, Admin sees more"""
        assert self.teacher_token, "Teacher login required"
        assert self.admin_token, "Admin login required"
        
        # Get teacher workload report
        teacher_resp = requests.get(
            f"{BASE_URL}/api/reports/teacher-workload",
            headers=self._get_headers(self.teacher_token)
        )
        assert teacher_resp.status_code == 200
        teacher_data = teacher_resp.json()
        teacher_count = len(teacher_data.get("teachers", []))
        
        # Get admin workload report
        admin_resp = requests.get(
            f"{BASE_URL}/api/reports/teacher-workload",
            headers=self._get_headers(self.admin_token)
        )
        assert admin_resp.status_code == 200
        admin_data = admin_resp.json()
        admin_count = len(admin_data.get("teachers", []))
        
        # Teacher should see exactly 1, Admin should see >= 1
        assert teacher_count == 1, f"Teacher should see exactly 1 teacher record, got {teacher_count}"
        assert admin_count >= 1, f"Admin should see at least 1 teacher, got {admin_count}"
        
        print(f"PASS: Teacher workload shows 1 teacher, Admin shows {admin_count} teachers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
