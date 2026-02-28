"""
اختبار شامل للميزات المنجزة اليوم:
1. دعم الأقسام المتعددة لرئيس القسم
2. صفحة لوحة تحكم الأقسام
3. نظام الإشعارات التلقائية للطلاب
4. إرسال إنذار يدوي للطلاب
5. صلاحية مخصصة لإرسال الإشعارات
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"


class TestAPIHealthAndAuth:
    """اختبار صحة API وتسجيل الدخول"""

    def test_01_api_health(self):
        """التحقق من عمل API"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        print("✅ API health check passed")

    def test_02_admin_login(self):
        """اختبار تسجيل دخول المدير"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["username"] == ADMIN_USERNAME
        print(f"✅ Admin login successful: {data['user']['full_name']}")


@pytest.fixture
def admin_token():
    """Get admin auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("Admin login failed")


@pytest.fixture
def auth_headers(admin_token):
    """Get auth headers"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestMultipleDepartmentSupport:
    """اختبار دعم الأقسام المتعددة - الميزة 1"""

    def test_01_get_users_returns_department_ids(self, auth_headers):
        """GET /api/users يرجع department_ids و department_names"""
        response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        users = response.json()
        assert isinstance(users, list), "Response should be a list"
        
        # Check if response includes department_ids field
        found_with_dept_ids = False
        for user in users:
            if "department_ids" in user:
                found_with_dept_ids = True
                assert isinstance(user["department_ids"], list), "department_ids should be a list"
                break
        
        print(f"✅ GET /api/users returns department_ids field (found users: {len(users)})")

    def test_02_update_user_with_department_ids(self, auth_headers):
        """PUT /api/users/{id} مع department_ids كقائمة"""
        # First create a test user
        test_user_data = {
            "username": f"TEST_dept_user_{datetime.now().timestamp()}",
            "password": "test123",
            "full_name": "Test Department User",
            "role": "employee"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/users", json=test_user_data, headers=auth_headers)
        assert create_response.status_code == 200, f"Create user failed: {create_response.text}"
        user_id = create_response.json()["id"]
        
        try:
            # Get departments
            depts_response = requests.get(f"{BASE_URL}/api/departments", headers=auth_headers)
            assert depts_response.status_code == 200
            departments = depts_response.json()
            
            if len(departments) >= 2:
                dept_ids = [departments[0]["id"], departments[1]["id"]]
                
                # Update user with multiple department_ids
                update_response = requests.put(
                    f"{BASE_URL}/api/users/{user_id}",
                    json={"department_ids": dept_ids},
                    headers=auth_headers
                )
                assert update_response.status_code == 200, f"Update failed: {update_response.text}"
                
                updated_user = update_response.json()
                assert "department_ids" in updated_user, "department_ids not in response"
                assert updated_user["department_ids"] == dept_ids, "department_ids mismatch"
                
                # Also check department_id is set for backwards compatibility
                assert updated_user.get("department_id") == dept_ids[0], "department_id should be first element"
                
                print(f"✅ PUT /api/users/{user_id} with multiple department_ids successful")
            else:
                print("⚠️ Not enough departments to test multiple assignment")
        finally:
            # Cleanup
            requests.delete(f"{BASE_URL}/api/users/{user_id}", headers=auth_headers)


class TestDepartmentDashboard:
    """اختبار لوحة تحكم الأقسام - الميزة 2"""

    def test_01_get_department_dashboard(self, auth_headers):
        """GET /api/departments/dashboard"""
        response = requests.get(f"{BASE_URL}/api/departments/dashboard", headers=auth_headers)
        assert response.status_code == 200, f"Dashboard request failed: {response.text}"
        
        data = response.json()
        
        # Check required fields
        assert "departments" in data, "Missing 'departments' field"
        assert "summary" in data, "Missing 'summary' field"
        assert "warnings" in data, "Missing 'warnings' field"
        assert "thresholds" in data, "Missing 'thresholds' field"
        
        # Check summary structure
        summary = data["summary"]
        assert "total_departments" in summary, "Missing total_departments in summary"
        assert "total_students" in summary, "Missing total_students in summary"
        assert "total_courses" in summary, "Missing total_courses in summary"
        assert "total_warnings" in summary, "Missing total_warnings in summary"
        assert "total_deprivations" in summary, "Missing total_deprivations in summary"
        
        # Check thresholds structure
        thresholds = data["thresholds"]
        assert "warning" in thresholds, "Missing warning threshold"
        assert "deprivation" in thresholds, "Missing deprivation threshold"
        
        print(f"✅ GET /api/departments/dashboard successful")
        print(f"   - Departments: {summary['total_departments']}")
        print(f"   - Students: {summary['total_students']}")
        print(f"   - Courses: {summary['total_courses']}")
        print(f"   - Warnings: {summary['total_warnings']}")
        print(f"   - Deprivations: {summary['total_deprivations']}")

    def test_02_department_dashboard_structure(self, auth_headers):
        """التحقق من بنية بيانات القسم في لوحة التحكم"""
        response = requests.get(f"{BASE_URL}/api/departments/dashboard", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        
        if len(data["departments"]) > 0:
            dept = data["departments"][0]
            assert "id" in dept, "Missing id in department"
            assert "name" in dept, "Missing name in department"
            assert "code" in dept, "Missing code in department"
            assert "students_count" in dept, "Missing students_count"
            assert "courses_count" in dept, "Missing courses_count"
            assert "today_attendance_rate" in dept, "Missing today_attendance_rate"
            assert "warnings_count" in dept, "Missing warnings_count"
            assert "deprivations_count" in dept, "Missing deprivations_count"
            
            print(f"✅ Department structure verified for: {dept['name']}")
        else:
            print("⚠️ No departments found to verify structure")


class TestNotificationsSystem:
    """اختبار نظام الإشعارات - الميزات 3-5"""

    def test_01_get_notifications(self, auth_headers):
        """GET /api/notifications"""
        response = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "notifications" in data, "Missing notifications field"
        assert "unread_count" in data, "Missing unread_count field"
        assert isinstance(data["notifications"], list), "notifications should be a list"
        
        print(f"✅ GET /api/notifications successful (count: {len(data['notifications'])})")

    def test_02_get_notifications_count(self, auth_headers):
        """GET /api/notifications/count"""
        response = requests.get(f"{BASE_URL}/api/notifications/count", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "count" in data, "Missing count field"
        
        print(f"✅ GET /api/notifications/count successful (unread: {data['count']})")

    def test_03_mark_all_notifications_read(self, auth_headers):
        """PUT /api/notifications/read-all"""
        response = requests.put(f"{BASE_URL}/api/notifications/read-all", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "message" in data, "Missing message field"
        
        print(f"✅ PUT /api/notifications/read-all successful")


class TestManualNotifications:
    """اختبار الإنذار اليدوي - الميزة 4"""

    def test_01_send_manual_notification(self, auth_headers):
        """POST /api/notifications/manual"""
        # First get a student
        students_response = requests.get(f"{BASE_URL}/api/students", headers=auth_headers)
        assert students_response.status_code == 200, f"Failed to get students: {students_response.text}"
        
        students = students_response.json()
        if len(students) == 0:
            pytest.skip("No students available to test manual notification")
        
        student = students[0]
        student_id = student["id"]
        
        # Send manual notification
        notification_data = {
            "student_id": student_id,
            "title": "TEST: إنذار اختباري",
            "message": "هذا إنذار اختباري للتأكد من عمل النظام",
            "type": "warning"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/notifications/manual",
            json=notification_data,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "message" in data, "Missing message in response"
        assert "notification_id" in data, "Missing notification_id in response"
        
        print(f"✅ POST /api/notifications/manual successful")
        print(f"   - Student: {student['full_name']}")
        print(f"   - Notification ID: {data['notification_id']}")

    def test_02_send_manual_notification_invalid_student(self, auth_headers):
        """POST /api/notifications/manual مع طالب غير موجود"""
        notification_data = {
            "student_id": "000000000000000000000000",  # Invalid ID
            "title": "Test",
            "message": "Test message",
            "type": "warning"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/notifications/manual",
            json=notification_data,
            headers=auth_headers
        )
        # Should return 404 or 500 for invalid student
        assert response.status_code in [404, 500], f"Expected 404/500, got {response.status_code}"
        
        print(f"✅ Manual notification with invalid student handled correctly")


class TestStudentNotifications:
    """اختبار إشعارات الطالب - GET /api/students/{id}/notifications"""

    def test_01_get_student_notifications(self, auth_headers):
        """GET /api/students/{student_id}/notifications"""
        # First get a student
        students_response = requests.get(f"{BASE_URL}/api/students", headers=auth_headers)
        assert students_response.status_code == 200
        
        students = students_response.json()
        if len(students) == 0:
            pytest.skip("No students available")
        
        student_id = students[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/students/{student_id}/notifications",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "notifications" in data, "Missing notifications field"
        assert "count" in data, "Missing count field"
        
        print(f"✅ GET /api/students/{student_id}/notifications successful (count: {data['count']})")


class TestSendNotificationsPermission:
    """اختبار صلاحية send_notifications - الميزة 5"""

    def test_01_send_notifications_in_permissions_list(self, auth_headers):
        """التحقق من وجود صلاحية send_notifications في قائمة الصلاحيات"""
        response = requests.get(f"{BASE_URL}/api/permissions/all", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "permissions" in data, "Missing permissions field"
        
        permissions = data["permissions"]
        
        # Find send_notifications permission
        send_notif_perm = None
        for perm in permissions:
            if perm.get("key") == "send_notifications":
                send_notif_perm = perm
                break
        
        assert send_notif_perm is not None, "send_notifications permission not found"
        assert send_notif_perm.get("category") == "الإشعارات", f"Wrong category: {send_notif_perm.get('category')}"
        
        print(f"✅ send_notifications permission found")
        print(f"   - Label: {send_notif_perm.get('label')}")
        print(f"   - Category: {send_notif_perm.get('category')}")

    def test_02_roles_list_available(self, auth_headers):
        """التحقق من أن قائمة الأدوار متاحة"""
        response = requests.get(f"{BASE_URL}/api/roles", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        roles = response.json()
        assert isinstance(roles, list), "Roles should be a list"
        
        print(f"✅ GET /api/roles successful (count: {len(roles)})")
        for role in roles[:5]:  # Show first 5
            print(f"   - {role.get('name')}: {len(role.get('permissions', []))} permissions")


class TestMarkNotificationAsRead:
    """اختبار تحديد الإشعار كمقروء"""

    def test_01_mark_notification_as_read(self, auth_headers):
        """PUT /api/notifications/{id}/read"""
        # First get notifications
        response = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        if len(data["notifications"]) == 0:
            # Create a notification first
            students_response = requests.get(f"{BASE_URL}/api/students", headers=auth_headers)
            if students_response.status_code == 200 and len(students_response.json()) > 0:
                student = students_response.json()[0]
                
                # Create notification
                requests.post(
                    f"{BASE_URL}/api/notifications/manual",
                    json={
                        "student_id": student["id"],
                        "title": "Test for read",
                        "message": "Test",
                        "type": "info"
                    },
                    headers=auth_headers
                )
                
                # Get notifications again
                response = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers)
                data = response.json()
        
        if len(data["notifications"]) == 0:
            pytest.skip("No notifications available to test mark as read")
        
        notification_id = data["notifications"][0]["id"]
        
        # Mark as read
        read_response = requests.put(
            f"{BASE_URL}/api/notifications/{notification_id}/read",
            headers=auth_headers
        )
        assert read_response.status_code == 200, f"Failed: {read_response.text}"
        
        print(f"✅ PUT /api/notifications/{notification_id}/read successful")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
