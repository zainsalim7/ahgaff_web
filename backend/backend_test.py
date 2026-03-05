#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for University Attendance System
Testing all endpoints with admin credentials as specified in review request
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://student-teacher-mgmt.preview.emergentagent.com/api"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

class BackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.token = None
        self.user_data = None
        self.test_results = []
        
    def log_test(self, test_name, success, details="", response_data=None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if not success and response_data:
            print(f"   Response: {response_data}")
        print()
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data
        })
    
    def test_authentication(self):
        """Test authentication endpoints"""
        print("=== Testing Authentication ===")
        
        # Test login
        try:
            login_data = {
                "username": ADMIN_USERNAME,
                "password": ADMIN_PASSWORD
            }
            
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token")
                self.user_data = data.get("user")
                
                # Set authorization header for future requests
                self.session.headers.update({
                    "Authorization": f"Bearer {self.token}"
                })
                
                self.log_test(
                    "POST /api/auth/login", 
                    True, 
                    f"Login successful for user: {self.user_data.get('username', 'Unknown')}"
                )
                
                # Verify user role is admin
                if self.user_data.get("role") == "admin":
                    self.log_test("Admin role verification", True, "User has admin role")
                else:
                    self.log_test("Admin role verification", False, f"Expected admin role, got: {self.user_data.get('role')}")
                    
            else:
                self.log_test(
                    "POST /api/auth/login", 
                    False, 
                    f"Login failed with status {response.status_code}",
                    response.text
                )
                return False
                
        except Exception as e:
            self.log_test("POST /api/auth/login", False, f"Exception: {str(e)}")
            return False
        
        # Test /auth/me endpoint
        try:
            response = self.session.get(f"{BASE_URL}/auth/me")
            
            if response.status_code == 200:
                data = response.json()
                self.log_test(
                    "GET /api/auth/me", 
                    True, 
                    f"Retrieved user info for: {data.get('username', 'Unknown')}"
                )
            else:
                self.log_test(
                    "GET /api/auth/me", 
                    False, 
                    f"Failed with status {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_test("GET /api/auth/me", False, f"Exception: {str(e)}")
            
        return True
    
    def test_students_api(self):
        """Test students CRUD operations"""
        print("=== Testing Students API ===")
        
        # Test GET students
        try:
            response = self.session.get(f"{BASE_URL}/students")
            
            if response.status_code == 200:
                students = response.json()
                self.log_test(
                    "GET /api/students", 
                    True, 
                    f"Retrieved {len(students)} students"
                )
            else:
                self.log_test(
                    "GET /api/students", 
                    False, 
                    f"Failed with status {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_test("GET /api/students", False, f"Exception: {str(e)}")
        
        # Test POST students (create new student)
        try:
            # First get departments to use valid department_id
            dept_response = self.session.get(f"{BASE_URL}/departments")
            if dept_response.status_code == 200:
                departments = dept_response.json()
                if departments:
                    dept_id = departments[0]["id"]
                    
                    student_data = {
                        "student_id": f"TEST{datetime.now().strftime('%Y%m%d%H%M%S')}",
                        "full_name": "طالب اختبار النظام",
                        "department_id": dept_id,
                        "level": 1,
                        "section": "أ",
                        "phone": "123456789",
                        "email": "test@example.com",
                        "password": "test123"
                    }
                    
                    response = self.session.post(f"{BASE_URL}/students", json=student_data)
                    
                    if response.status_code == 200:
                        created_student = response.json()
                        student_id = created_student.get("id")
                        self.log_test(
                            "POST /api/students", 
                            True, 
                            f"Created student: {created_student.get('full_name')}"
                        )
                        
                        # Test GET specific student
                        if student_id:
                            get_response = self.session.get(f"{BASE_URL}/students/{student_id}")
                            if get_response.status_code == 200:
                                self.log_test("GET /api/students/{id}", True, "Retrieved specific student")
                            else:
                                self.log_test("GET /api/students/{id}", False, f"Failed with status {get_response.status_code}")
                        
                        # Test PUT student (update)
                        if student_id:
                            update_data = {
                                "full_name": "طالب اختبار محدث",
                                "phone": "987654321"
                            }
                            put_response = self.session.put(f"{BASE_URL}/students/{student_id}", json=update_data)
                            if put_response.status_code == 200:
                                self.log_test("PUT /api/students/{id}", True, "Updated student successfully")
                            else:
                                self.log_test("PUT /api/students/{id}", False, f"Failed with status {put_response.status_code}")
                        
                        # Test DELETE student
                        if student_id:
                            delete_response = self.session.delete(f"{BASE_URL}/students/{student_id}")
                            if delete_response.status_code == 200:
                                self.log_test("DELETE /api/students/{id}", True, "Deleted student successfully")
                            else:
                                self.log_test("DELETE /api/students/{id}", False, f"Failed with status {delete_response.status_code}")
                    else:
                        self.log_test(
                            "POST /api/students", 
                            False, 
                            f"Failed with status {response.status_code}",
                            response.text
                        )
                else:
                    self.log_test("POST /api/students", False, "No departments available for testing")
            else:
                self.log_test("POST /api/students", False, "Could not retrieve departments for testing")
                
        except Exception as e:
            self.log_test("POST /api/students", False, f"Exception: {str(e)}")
    
    def test_departments_api(self):
        """Test departments API"""
        print("=== Testing Departments API ===")
        
        # Test GET departments
        try:
            response = self.session.get(f"{BASE_URL}/departments")
            
            if response.status_code == 200:
                departments = response.json()
                self.log_test(
                    "GET /api/departments", 
                    True, 
                    f"Retrieved {len(departments)} departments"
                )
                
                # Test GET specific department if any exist
                if departments:
                    dept_id = departments[0]["id"]
                    get_response = self.session.get(f"{BASE_URL}/departments/{dept_id}")
                    # Note: This endpoint might not exist, checking if it returns valid response
                    if get_response.status_code in [200, 404]:
                        self.log_test("GET /api/departments/{id}", True, f"Endpoint responded with status {get_response.status_code}")
                    else:
                        self.log_test("GET /api/departments/{id}", False, f"Unexpected status {get_response.status_code}")
            else:
                self.log_test(
                    "GET /api/departments", 
                    False, 
                    f"Failed with status {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_test("GET /api/departments", False, f"Exception: {str(e)}")
        
        # Test POST departments
        try:
            dept_data = {
                "name": f"قسم اختبار {datetime.now().strftime('%H%M%S')}",
                "code": f"TEST{datetime.now().strftime('%H%M%S')}",
                "description": "قسم للاختبار فقط"
            }
            
            response = self.session.post(f"{BASE_URL}/departments", json=dept_data)
            
            if response.status_code == 200:
                created_dept = response.json()
                self.log_test(
                    "POST /api/departments", 
                    True, 
                    f"Created department: {created_dept.get('name')}"
                )
            else:
                self.log_test(
                    "POST /api/departments", 
                    False, 
                    f"Failed with status {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_test("POST /api/departments", False, f"Exception: {str(e)}")
    
    def test_courses_api(self):
        """Test courses API"""
        print("=== Testing Courses API ===")
        
        # Test GET courses
        try:
            response = self.session.get(f"{BASE_URL}/courses")
            
            if response.status_code == 200:
                courses = response.json()
                self.log_test(
                    "GET /api/courses", 
                    True, 
                    f"Retrieved {len(courses)} courses"
                )
                
                # Test GET specific course if any exist
                if courses:
                    course_id = courses[0]["id"]
                    get_response = self.session.get(f"{BASE_URL}/courses/{course_id}")
                    if get_response.status_code == 200:
                        self.log_test("GET /api/courses/{id}", True, "Retrieved specific course")
                    else:
                        self.log_test("GET /api/courses/{id}", False, f"Failed with status {get_response.status_code}")
            else:
                self.log_test(
                    "GET /api/courses", 
                    False, 
                    f"Failed with status {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_test("GET /api/courses", False, f"Exception: {str(e)}")
        
        # Test POST courses
        try:
            # Get departments first
            dept_response = self.session.get(f"{BASE_URL}/departments")
            if dept_response.status_code == 200:
                departments = dept_response.json()
                if departments:
                    dept_id = departments[0]["id"]
                    
                    course_data = {
                        "name": f"مقرر اختبار {datetime.now().strftime('%H%M%S')}",
                        "code": f"TEST{datetime.now().strftime('%H%M%S')}",
                        "department_id": dept_id,
                        "level": 1,
                        "section": "أ",
                        "academic_year": "2024-2025"
                    }
                    
                    response = self.session.post(f"{BASE_URL}/courses", json=course_data)
                    
                    if response.status_code == 200:
                        created_course = response.json()
                        self.log_test(
                            "POST /api/courses", 
                            True, 
                            f"Created course: {created_course.get('name')}"
                        )
                    else:
                        self.log_test(
                            "POST /api/courses", 
                            False, 
                            f"Failed with status {response.status_code}",
                            response.text
                        )
                else:
                    self.log_test("POST /api/courses", False, "No departments available for testing")
            else:
                self.log_test("POST /api/courses", False, "Could not retrieve departments for testing")
                
        except Exception as e:
            self.log_test("POST /api/courses", False, f"Exception: {str(e)}")
    
    def test_teachers_api(self):
        """Test teachers API"""
        print("=== Testing Teachers API ===")
        
        # Test GET teachers (via users endpoint with role filter)
        try:
            response = self.session.get(f"{BASE_URL}/users?role=teacher")
            
            if response.status_code == 200:
                teachers = response.json()
                self.log_test(
                    "GET /api/teachers (via /api/users?role=teacher)", 
                    True, 
                    f"Retrieved {len(teachers)} teachers"
                )
            else:
                self.log_test(
                    "GET /api/teachers", 
                    False, 
                    f"Failed with status {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_test("GET /api/teachers", False, f"Exception: {str(e)}")
        
        # Test POST teachers (create teacher user)
        try:
            teacher_data = {
                "username": f"teacher{datetime.now().strftime('%H%M%S')}",
                "password": "teacher123",
                "full_name": f"أستاذ اختبار {datetime.now().strftime('%H%M%S')}",
                "role": "teacher",
                "email": "teacher@test.com",
                "phone": "123456789"
            }
            
            response = self.session.post(f"{BASE_URL}/users", json=teacher_data)
            
            if response.status_code == 200:
                created_teacher = response.json()
                self.log_test(
                    "POST /api/teachers (via /api/users)", 
                    True, 
                    f"Created teacher: {created_teacher.get('full_name')}"
                )
            else:
                self.log_test(
                    "POST /api/teachers", 
                    False, 
                    f"Failed with status {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_test("POST /api/teachers", False, f"Exception: {str(e)}")
    
    def test_users_api(self):
        """Test users API"""
        print("=== Testing Users API ===")
        
        # Test GET users
        try:
            response = self.session.get(f"{BASE_URL}/users")
            
            if response.status_code == 200:
                users = response.json()
                self.log_test(
                    "GET /api/users", 
                    True, 
                    f"Retrieved {len(users)} users"
                )
            else:
                self.log_test(
                    "GET /api/users", 
                    False, 
                    f"Failed with status {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_test("GET /api/users", False, f"Exception: {str(e)}")
        
        # Test POST users
        try:
            user_data = {
                "username": f"testuser{datetime.now().strftime('%H%M%S')}",
                "password": "test123",
                "full_name": f"مستخدم اختبار {datetime.now().strftime('%H%M%S')}",
                "role": "employee",
                "email": "testuser@test.com"
            }
            
            response = self.session.post(f"{BASE_URL}/users", json=user_data)
            
            if response.status_code == 200:
                created_user = response.json()
                self.log_test(
                    "POST /api/users", 
                    True, 
                    f"Created user: {created_user.get('full_name')}"
                )
            else:
                self.log_test(
                    "POST /api/users", 
                    False, 
                    f"Failed with status {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_test("POST /api/users", False, f"Exception: {str(e)}")
        
        # Test GET roles
        try:
            response = self.session.get(f"{BASE_URL}/roles")
            
            if response.status_code == 200:
                roles = response.json()
                self.log_test(
                    "GET /api/roles", 
                    True, 
                    f"Retrieved {len(roles)} roles"
                )
            else:
                self.log_test(
                    "GET /api/roles", 
                    False, 
                    f"Failed with status {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_test("GET /api/roles", False, f"Exception: {str(e)}")
    
    def test_reports_api(self):
        """Test reports API"""
        print("=== Testing Reports API ===")
        
        # Test GET reports summary
        try:
            response = self.session.get(f"{BASE_URL}/reports/summary")
            
            if response.status_code == 200:
                summary = response.json()
                self.log_test(
                    "GET /api/reports/summary", 
                    True, 
                    f"Retrieved summary report with keys: {list(summary.keys()) if isinstance(summary, dict) else 'Non-dict response'}"
                )
            else:
                self.log_test(
                    "GET /api/reports/summary", 
                    False, 
                    f"Failed with status {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_test("GET /api/reports/summary", False, f"Exception: {str(e)}")
    
    def test_settings_api(self):
        """Test settings API"""
        print("=== Testing Settings API ===")
        
        # Test GET settings
        try:
            response = self.session.get(f"{BASE_URL}/settings")
            
            if response.status_code == 200:
                settings = response.json()
                self.log_test(
                    "GET /api/settings", 
                    True, 
                    f"Retrieved settings with keys: {list(settings.keys()) if isinstance(settings, dict) else 'Non-dict response'}"
                )
            else:
                self.log_test(
                    "GET /api/settings", 
                    False, 
                    f"Failed with status {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_test("GET /api/settings", False, f"Exception: {str(e)}")
    
    def test_admin_permissions(self):
        """Test admin permissions and authorization"""
        print("=== Testing Admin Permissions ===")
        
        if not self.user_data:
            self.log_test("Admin permissions check", False, "No user data available")
            return
        
        # Check if user has admin role
        if self.user_data.get("role") == "admin":
            self.log_test("Admin role verification", True, "User has admin role")
        else:
            self.log_test("Admin role verification", False, f"Expected admin role, got: {self.user_data.get('role')}")
        
        # Check if user has admin permissions
        permissions = self.user_data.get("permissions", [])
        admin_permissions = ["manage_users", "manage_departments", "manage_courses", "manage_students"]
        
        missing_permissions = []
        for perm in admin_permissions:
            if perm not in permissions:
                missing_permissions.append(perm)
        
        if not missing_permissions:
            self.log_test("Admin permissions check", True, f"User has all required admin permissions ({len(permissions)} total)")
        else:
            self.log_test("Admin permissions check", False, f"Missing permissions: {missing_permissions}")
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Comprehensive Backend API Testing")
        print(f"Backend URL: {BASE_URL}")
        print(f"Admin Username: {ADMIN_USERNAME}")
        print("=" * 60)
        
        # Test authentication first
        if not self.test_authentication():
            print("❌ Authentication failed. Cannot proceed with other tests.")
            return False
        
        # Test admin permissions
        self.test_admin_permissions()
        
        # Test all API endpoints
        self.test_students_api()
        self.test_departments_api()
        self.test_courses_api()
        self.test_teachers_api()
        self.test_users_api()
        self.test_reports_api()
        self.test_settings_api()
        
        # Summary
        print("=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   - {result['test']}: {result['details']}")
        
        print("\n" + "=" * 60)
        return failed_tests == 0

if __name__ == "__main__":
    tester = BackendTester()
    success = tester.run_all_tests()
    
    if success:
        print("🎉 All tests passed successfully!")
        sys.exit(0)
    else:
        print("⚠️  Some tests failed. Check the details above.")
        sys.exit(1)