"""
Test cases for Notification Management Page - NEW feature testing
Tests endpoints:
- POST /api/notifications/send with target_type='all'
- POST /api/notifications/send with target_type='role' and target_role='teacher'
- GET /api/notifications/history returns sent notifications
- GET /api/notifications/stats returns device counts and total_sent

This tests the NEW notification management feature added to admin dashboard.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://mobile-build-17.preview.emergentagent.com').rstrip('/')


class TestNotificationManagementAPI:
    """Test new notification management endpoints for iteration 15"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        return data["access_token"]
    
    def test_health_check(self):
        """Test API is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print("Health check: PASS - API is accessible")
    
    # ==================== STATS ENDPOINT ====================
    
    def test_stats_endpoint_returns_200(self, admin_token):
        """Test GET /api/notifications/stats returns 200 with correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/notifications/stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Stats endpoint failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "total_sent" in data, f"Missing total_sent in response: {data}"
        assert "registered_devices" in data, f"Missing registered_devices in response: {data}"
        assert "devices_by_role" in data, f"Missing devices_by_role in response: {data}"
        
        # Validate data types
        assert isinstance(data["total_sent"], int), f"total_sent should be int: {type(data['total_sent'])}"
        assert isinstance(data["registered_devices"], int), f"registered_devices should be int"
        assert isinstance(data["devices_by_role"], dict), f"devices_by_role should be dict"
        
        # Validate devices_by_role structure
        devices_by_role = data["devices_by_role"]
        for role in ["admin", "teacher", "student", "employee"]:
            assert role in devices_by_role, f"Missing role '{role}' in devices_by_role"
            assert isinstance(devices_by_role[role], int), f"devices_by_role[{role}] should be int"
        
        print(f"Stats endpoint: PASS")
        print(f"  - Total sent: {data['total_sent']}")
        print(f"  - Registered devices: {data['registered_devices']}")
        print(f"  - Devices by role: {data['devices_by_role']}")
    
    def test_stats_requires_auth(self):
        """Test that stats endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/notifications/stats")
        assert response.status_code in [401, 403], f"Should require auth: {response.status_code}"
        print(f"Stats auth check: PASS - Returns {response.status_code} without auth")
    
    # ==================== SEND NOTIFICATION with target_type='all' ====================
    
    def test_send_notification_target_all(self, admin_token):
        """Test POST /api/notifications/send with target_type='all' returns 200"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/send",
            json={
                "title": "اختبار إشعار للجميع",
                "body": "هذا اختبار لإرسال إشعار لجميع المستخدمين",
                "target_type": "all",
                "target_role": None
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Send notification (all) failed: {response.text}"
        data = response.json()
        
        # Validate response has expected fields
        assert "message" in data, f"Missing message in response: {data}"
        
        # Response should have devices count
        if "devices" in data:
            assert isinstance(data["devices"], int), f"devices should be int"
        
        print(f"Send notification (target_type=all): PASS")
        print(f"  - Message: {data.get('message')}")
        print(f"  - Devices: {data.get('devices', 0)}")
        print(f"  - Success: {data.get('success', 'N/A')}, Failure: {data.get('failure', 'N/A')}")
    
    # ==================== SEND NOTIFICATION with target_type='role' ====================
    
    def test_send_notification_target_role_teacher(self, admin_token):
        """Test POST /api/notifications/send with target_type='role' and target_role='teacher' returns 200"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/send",
            json={
                "title": "اختبار إشعار للمعلمين",
                "body": "هذا اختبار لإرسال إشعار للمعلمين فقط",
                "target_type": "role",
                "target_role": "teacher"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Send notification (teacher) failed: {response.text}"
        data = response.json()
        
        assert "message" in data, f"Missing message in response: {data}"
        print(f"Send notification (target_type=role, role=teacher): PASS")
        print(f"  - Message: {data.get('message')}")
        print(f"  - Devices: {data.get('devices', 0)}")
    
    def test_send_notification_target_role_student(self, admin_token):
        """Test POST /api/notifications/send with target_type='role' and target_role='student' returns 200"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/send",
            json={
                "title": "اختبار إشعار للطلاب",
                "body": "هذا اختبار لإرسال إشعار للطلاب فقط",
                "target_type": "role",
                "target_role": "student"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Send notification (student) failed: {response.text}"
        data = response.json()
        
        assert "message" in data, f"Missing message in response: {data}"
        print(f"Send notification (target_type=role, role=student): PASS")
        print(f"  - Message: {data.get('message')}")
    
    def test_send_notification_target_role_admin(self, admin_token):
        """Test POST /api/notifications/send with target_type='role' and target_role='admin' returns 200"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/send",
            json={
                "title": "اختبار إشعار للمديرين",
                "body": "هذا اختبار لإرسال إشعار للمديرين",
                "target_type": "role",
                "target_role": "admin"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Send notification (admin role) failed: {response.text}"
        data = response.json()
        
        assert "message" in data, f"Missing message in response: {data}"
        print(f"Send notification (target_type=role, role=admin): PASS")
    
    def test_send_notification_target_role_employee(self, admin_token):
        """Test POST /api/notifications/send with target_type='role' and target_role='employee' returns 200"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/send",
            json={
                "title": "اختبار إشعار للموظفين",
                "body": "هذا اختبار لإرسال إشعار للموظفين",
                "target_type": "role",
                "target_role": "employee"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Send notification (employee) failed: {response.text}"
        data = response.json()
        
        assert "message" in data, f"Missing message in response: {data}"
        print(f"Send notification (target_type=role, role=employee): PASS")
    
    # ==================== HISTORY ENDPOINT ====================
    
    def test_history_endpoint_returns_notifications(self, admin_token):
        """Test GET /api/notifications/history returns sent notifications"""
        response = requests.get(
            f"{BASE_URL}/api/notifications/history",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"History endpoint failed: {response.text}"
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
        
        print(f"Notification history: PASS - Got {len(data)} records")
        
        # Verify structure of records if any exist
        if len(data) > 0:
            record = data[0]
            # These fields should be present based on notification_history collection
            assert "title" in record, f"Missing title in record: {record}"
            assert "body" in record, f"Missing body in record: {record}"
            assert "created_at" in record, f"Missing created_at in record: {record}"
            
            # New fields from notification management page
            if "target_type" in record:
                print(f"  - target_type present: {record['target_type']}")
            if "target_desc" in record:
                print(f"  - target_desc present: {record['target_desc']}")
            if "sent_by_name" in record:
                print(f"  - sent_by_name present: {record['sent_by_name']}")
            if "devices_count" in record:
                print(f"  - devices_count present: {record['devices_count']}")
            
            print(f"  Latest: '{record.get('title')}' - {record.get('target_desc', 'N/A')}")
    
    def test_history_requires_auth(self):
        """Test that history endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/notifications/history")
        assert response.status_code in [401, 403], f"Should require auth: {response.status_code}"
        print(f"History auth check: PASS - Returns {response.status_code} without auth")
    
    # ==================== VALIDATION TESTS ====================
    
    def test_send_notification_missing_title(self, admin_token):
        """Test that sending notification without title returns error"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/send",
            json={
                "body": "Test body without title",
                "target_type": "all"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        # Should fail with 422 (validation error) since title is required
        assert response.status_code == 422, f"Expected 422 for missing title, got: {response.status_code}"
        print("Validation (missing title): PASS - Returns 422")
    
    def test_send_notification_missing_body(self, admin_token):
        """Test that sending notification without body returns error"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/send",
            json={
                "title": "Test title without body",
                "target_type": "all"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        # Should fail with 422 (validation error) since body is required
        assert response.status_code == 422, f"Expected 422 for missing body, got: {response.status_code}"
        print("Validation (missing body): PASS - Returns 422")
    
    def test_send_notification_requires_auth(self):
        """Test that send notification requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/send",
            json={
                "title": "Test",
                "body": "Test",
                "target_type": "all"
            }
        )
        assert response.status_code in [401, 403], f"Should require auth: {response.status_code}"
        print(f"Send notification auth check: PASS - Returns {response.status_code} without auth")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
