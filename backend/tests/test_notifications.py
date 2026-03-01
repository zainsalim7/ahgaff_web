"""
Test Notifications API - اختبار واجهة برمجة الإشعارات
Tests for the notification system improvements:
1. POST /api/notifications/send - sends notification to all users
2. DELETE /api/notifications/{notification_id} - deletes a notification
3. GET /api/notifications/my - returns notifications list
4. POST /api/notifications/mark-read/{notification_id} - marks notification as read
5. POST /api/notifications/mark-all-read - marks all notifications as read
6. GET /api/notifications/history - returns notification history for admins
7. GET /api/notifications/stats - returns stats with registered_devices count
"""

import pytest
import requests
import os

# Using localhost since we're testing locally
BASE_URL = "http://localhost:8001"

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"


class TestAuthLogin:
    """Test authentication first - login endpoint"""
    
    def test_admin_login(self):
        """Test admin can login successfully"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        print(f"Login response status: {response.status_code}")
        print(f"Login response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data["access_token"], "access_token is empty"
        
        # Store token for subsequent tests
        TestAuthLogin.admin_token = data["access_token"]
        print(f"Got admin token: {TestAuthLogin.admin_token[:30]}...")


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Admin login failed: {response.text}")


@pytest.fixture
def auth_headers(admin_token):
    """Headers with admin authorization"""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }


class TestNotificationsMyEndpoint:
    """Tests for GET /api/notifications/my"""
    
    def test_get_my_notifications_success(self, auth_headers):
        """Test getting user's notifications"""
        response = requests.get(
            f"{BASE_URL}/api/notifications/my",
            headers=auth_headers
        )
        print(f"GET /notifications/my status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200
        
        data = response.json()
        assert "notifications" in data
        assert "unread_count" in data
        assert isinstance(data["notifications"], list)
    
    def test_get_notifications_without_auth_fails(self):
        """Test that getting notifications without auth fails"""
        response = requests.get(f"{BASE_URL}/api/notifications/my")
        assert response.status_code in [401, 403]


class TestNotificationsSendEndpoint:
    """Tests for POST /api/notifications/send"""
    
    def test_send_notification_to_all_success(self, auth_headers):
        """Test sending notification to all users"""
        payload = {
            "title": "TEST_ إشعار تجريبي",
            "body": "هذا إشعار تجريبي لاختبار النظام",
            "target_type": "all"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/notifications/send",
            headers=auth_headers,
            json=payload
        )
        print(f"POST /notifications/send status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Send failed: {response.text}"
        
        data = response.json()
        # Verify response contains confirmation message
        assert "message" in data, "No message in response"
        # Verify response contains users count
        assert "users" in data, "No users count in response"
        print(f"Notification sent to {data.get('users', 0)} users")
    
    def test_send_notification_without_auth_fails(self):
        """Test that sending notification without auth fails"""
        payload = {
            "title": "Test",
            "body": "Test body",
            "target_type": "all"
        }
        response = requests.post(
            f"{BASE_URL}/api/notifications/send",
            json=payload
        )
        assert response.status_code in [401, 403]
    
    def test_send_notification_to_role(self, auth_headers):
        """Test sending notification to specific role (e.g., students)"""
        payload = {
            "title": "TEST_ إشعار للطلاب",
            "body": "هذا إشعار موجه للطلاب فقط",
            "target_type": "role",
            "target_role": "student"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/notifications/send",
            headers=auth_headers,
            json=payload
        )
        print(f"Send to role status: {response.status_code}")
        
        # Should succeed even if no students exist
        assert response.status_code == 200


class TestNotificationsDeleteEndpoint:
    """Tests for DELETE /api/notifications/{notification_id}"""
    
    def test_delete_notification_success(self, auth_headers):
        """Test deleting a notification"""
        # First, get the user's notifications
        response = requests.get(
            f"{BASE_URL}/api/notifications/my",
            headers=auth_headers
        )
        
        if response.status_code != 200:
            pytest.skip("Could not get notifications")
        
        data = response.json()
        notifications = data.get("notifications", [])
        
        if not notifications:
            # No notifications to delete, send one first
            send_response = requests.post(
                f"{BASE_URL}/api/notifications/send",
                headers=auth_headers,
                json={
                    "title": "TEST_ إشعار للحذف",
                    "body": "سيتم حذف هذا الإشعار",
                    "target_type": "all"
                }
            )
            print(f"Created notification for deletion: {send_response.status_code}")
            
            # Get notifications again
            response = requests.get(
                f"{BASE_URL}/api/notifications/my",
                headers=auth_headers
            )
            data = response.json()
            notifications = data.get("notifications", [])
        
        if not notifications:
            pytest.skip("No notifications available to delete")
        
        # Find a TEST notification to delete
        test_notification = None
        for n in notifications:
            if "TEST_" in n.get("title", ""):
                test_notification = n
                break
        
        if not test_notification:
            test_notification = notifications[0]
        
        notification_id = test_notification["id"]
        print(f"Deleting notification: {notification_id}")
        
        # Delete the notification
        delete_response = requests.delete(
            f"{BASE_URL}/api/notifications/{notification_id}",
            headers=auth_headers
        )
        print(f"DELETE status: {delete_response.status_code}")
        print(f"DELETE response: {delete_response.text}")
        
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        # Verify response contains success message
        delete_data = delete_response.json()
        assert "message" in delete_data
    
    def test_delete_nonexistent_notification(self, auth_headers):
        """Test deleting a non-existent notification returns 404"""
        fake_id = "000000000000000000000000"
        
        response = requests.delete(
            f"{BASE_URL}/api/notifications/{fake_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 404


class TestNotificationsMarkReadEndpoint:
    """Tests for POST /api/notifications/mark-read/{notification_id}"""
    
    def test_mark_notification_as_read(self, auth_headers):
        """Test marking a notification as read"""
        # First, ensure we have a notification
        send_response = requests.post(
            f"{BASE_URL}/api/notifications/send",
            headers=auth_headers,
            json={
                "title": "TEST_ إشعار للقراءة",
                "body": "سيتم تعليم هذا الإشعار كمقروء",
                "target_type": "all"
            }
        )
        
        # Get notifications
        response = requests.get(
            f"{BASE_URL}/api/notifications/my",
            headers=auth_headers
        )
        
        if response.status_code != 200:
            pytest.skip("Could not get notifications")
        
        data = response.json()
        notifications = data.get("notifications", [])
        
        # Find unread notification
        unread = [n for n in notifications if not n.get("is_read")]
        if not unread:
            pytest.skip("No unread notifications")
        
        notification_id = unread[0]["id"]
        
        # Mark as read
        mark_response = requests.post(
            f"{BASE_URL}/api/notifications/mark-read/{notification_id}",
            headers=auth_headers
        )
        print(f"Mark read status: {mark_response.status_code}")
        
        assert mark_response.status_code == 200
    
    def test_mark_all_notifications_as_read(self, auth_headers):
        """Test marking all notifications as read"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/mark-all-read",
            headers=auth_headers
        )
        print(f"Mark all read status: {response.status_code}")
        
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data


class TestNotificationsHistoryEndpoint:
    """Tests for GET /api/notifications/history (admin only)"""
    
    def test_get_notification_history_admin(self, auth_headers):
        """Test admin can get notification history"""
        response = requests.get(
            f"{BASE_URL}/api/notifications/history",
            headers=auth_headers
        )
        print(f"GET /notifications/history status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "History should be a list"
    
    def test_get_notification_history_without_auth_fails(self):
        """Test that getting history without auth fails"""
        response = requests.get(f"{BASE_URL}/api/notifications/history")
        assert response.status_code in [401, 403]


class TestNotificationsStatsEndpoint:
    """Tests for GET /api/notifications/stats"""
    
    def test_get_notification_stats(self, auth_headers):
        """Test getting notification statistics"""
        response = requests.get(
            f"{BASE_URL}/api/notifications/stats",
            headers=auth_headers
        )
        print(f"GET /notifications/stats status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200
        
        data = response.json()
        # Verify response contains registered_devices count
        assert "registered_devices" in data, "No registered_devices in response"
        assert "total_sent" in data, "No total_sent in response"
        print(f"Registered devices: {data.get('registered_devices')}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_notifications(self, auth_headers):
        """Clean up TEST_ prefixed notifications"""
        # Get all notifications
        response = requests.get(
            f"{BASE_URL}/api/notifications/my",
            headers=auth_headers
        )
        
        if response.status_code != 200:
            print("Could not get notifications for cleanup")
            return
        
        data = response.json()
        notifications = data.get("notifications", [])
        
        deleted_count = 0
        for n in notifications:
            if "TEST_" in n.get("title", ""):
                del_response = requests.delete(
                    f"{BASE_URL}/api/notifications/{n['id']}",
                    headers=auth_headers
                )
                if del_response.status_code == 200:
                    deleted_count += 1
        
        print(f"Cleaned up {deleted_count} test notifications")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
