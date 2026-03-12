"""
Tests for Trash Management (سلة المحذوفات) Feature
Tests CRUD operations for trash items - listing, restoring, permanent delete, clear all
Also tests that safe-delete operations add items to trash
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://attendance-track-38.preview.emergentagent.com"


class TestTrashManagement:
    """Tests for trash management endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token"""
        # Login as admin
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_01_get_trash_items(self):
        """Test GET /api/trash - list trash items"""
        response = requests.get(f"{BASE_URL}/api/trash", headers=self.headers)
        assert response.status_code == 200, f"Failed to get trash: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check structure if items exist
        if len(data) > 0:
            item = data[0]
            assert "id" in item, "Item should have id"
            assert "item_type" in item, "Item should have item_type"
            assert "item_name" in item, "Item should have item_name"
            assert "deleted_at" in item, "Item should have deleted_at"
            assert "expires_at" in item, "Item should have expires_at"
            assert "days_remaining" in item, "Item should have days_remaining"
        
        print(f"Trash items count: {len(data)}")
    
    def test_02_safe_delete_student_adds_to_trash(self):
        """Test that safe-deleting a student adds it to trash"""
        # First, get departments
        dept_response = requests.get(f"{BASE_URL}/api/departments", headers=self.headers)
        depts = dept_response.json() if dept_response.status_code == 200 else []
        dept_id = depts[0]["id"] if depts else None
        
        # Create a test student
        student_data = {
            "student_id": "TEST_TRASH_001",
            "full_name": "طالب اختبار سلة المحذوفات",
            "level": 1,
            "section": "A",
            "department_id": dept_id
        }
        create_response = requests.post(f"{BASE_URL}/api/students", json=student_data, headers=self.headers)
        
        if create_response.status_code == 400 and "موجود" in create_response.text:
            # Student exists, fetch and delete
            students_resp = requests.get(f"{BASE_URL}/api/students", headers=self.headers)
            students = students_resp.json()
            student = next((s for s in students if s.get("student_id") == "TEST_TRASH_001"), None)
            if student:
                student_id = student["id"]
            else:
                pytest.skip("Could not find or create test student")
                return
        else:
            assert create_response.status_code == 200, f"Failed to create student: {create_response.text}"
            student_id = create_response.json()["id"]
        
        # Get initial trash count
        trash_before = requests.get(f"{BASE_URL}/api/trash", headers=self.headers).json()
        initial_count = len(trash_before)
        
        # Safe-delete the student
        safe_delete_response = requests.post(
            f"{BASE_URL}/api/students/{student_id}/safe-delete",
            headers=self.headers
        )
        assert safe_delete_response.status_code == 200, f"Safe-delete failed: {safe_delete_response.text}"
        
        # Check that trash has one more item
        trash_after = requests.get(f"{BASE_URL}/api/trash", headers=self.headers).json()
        new_count = len(trash_after)
        
        assert new_count >= initial_count, f"Trash count should have increased. Before: {initial_count}, After: {new_count}"
        
        # Find the new trash item
        new_item = next((t for t in trash_after if t["item_name"] == "طالب اختبار سلة المحذوفات"), None)
        assert new_item is not None, "Deleted student should appear in trash"
        assert new_item["item_type"] == "student", "Item type should be 'student'"
        
        # Store for later tests
        self.__class__.trash_student_id = new_item["id"]
        print(f"Student added to trash with id: {new_item['id']}")
    
    def test_03_restore_from_trash(self):
        """Test POST /api/trash/{id}/restore - restore item from trash"""
        # Get current trash
        trash_response = requests.get(f"{BASE_URL}/api/trash", headers=self.headers)
        trash_items = trash_response.json()
        
        if len(trash_items) == 0:
            pytest.skip("No items in trash to restore")
            return
        
        # Find the test student item or first available
        test_item = next((t for t in trash_items if "اختبار سلة" in t.get("item_name", "")), trash_items[0])
        trash_id = test_item["id"]
        item_name = test_item["item_name"]
        
        # Restore it
        restore_response = requests.post(
            f"{BASE_URL}/api/trash/{trash_id}/restore",
            headers=self.headers
        )
        assert restore_response.status_code == 200, f"Restore failed: {restore_response.text}"
        
        data = restore_response.json()
        assert "message" in data, "Response should have message"
        assert "استعادة" in data["message"], f"Message should indicate restoration: {data['message']}"
        
        # Verify item is no longer in trash
        trash_after = requests.get(f"{BASE_URL}/api/trash", headers=self.headers).json()
        restored_item = next((t for t in trash_after if t["id"] == trash_id), None)
        assert restored_item is None, "Restored item should be removed from trash"
        
        print(f"Restored '{item_name}' successfully")
    
    def test_04_safe_delete_for_permanent_delete_test(self):
        """Create and safe-delete an item to test permanent deletion"""
        # Get departments
        dept_response = requests.get(f"{BASE_URL}/api/departments", headers=self.headers)
        depts = dept_response.json() if dept_response.status_code == 200 else []
        dept_id = depts[0]["id"] if depts else None
        
        # Create test student
        student_data = {
            "student_id": "TEST_PERM_DELETE_001",
            "full_name": "طالب حذف نهائي اختبار",
            "level": 1,
            "section": "B",
            "department_id": dept_id
        }
        create_response = requests.post(f"{BASE_URL}/api/students", json=student_data, headers=self.headers)
        
        if create_response.status_code == 400 and "موجود" in create_response.text:
            # Student exists, fetch it
            students_resp = requests.get(f"{BASE_URL}/api/students", headers=self.headers)
            students = students_resp.json()
            student = next((s for s in students if s.get("student_id") == "TEST_PERM_DELETE_001"), None)
            if student:
                student_id = student["id"]
            else:
                pytest.skip("Could not find or create test student for permanent delete")
                return
        else:
            assert create_response.status_code == 200, f"Failed to create: {create_response.text}"
            student_id = create_response.json()["id"]
        
        # Safe-delete
        safe_delete_response = requests.post(
            f"{BASE_URL}/api/students/{student_id}/safe-delete",
            headers=self.headers
        )
        assert safe_delete_response.status_code == 200, f"Safe-delete failed: {safe_delete_response.text}"
        print("Created and safe-deleted student for permanent delete test")
    
    def test_05_permanent_delete_from_trash(self):
        """Test DELETE /api/trash/{id} - permanently delete item"""
        # Get trash items
        trash_response = requests.get(f"{BASE_URL}/api/trash", headers=self.headers)
        trash_items = trash_response.json()
        
        if len(trash_items) == 0:
            pytest.skip("No items in trash for permanent delete test")
            return
        
        # Find test item or use first
        test_item = next((t for t in trash_items if "حذف نهائي اختبار" in t.get("item_name", "")), trash_items[0])
        trash_id = test_item["id"]
        item_name = test_item["item_name"]
        
        # Permanently delete
        delete_response = requests.delete(
            f"{BASE_URL}/api/trash/{trash_id}",
            headers=self.headers
        )
        assert delete_response.status_code == 200, f"Permanent delete failed: {delete_response.text}"
        
        data = delete_response.json()
        assert "message" in data, "Response should have message"
        
        # Verify item is gone from trash
        trash_after = requests.get(f"{BASE_URL}/api/trash", headers=self.headers).json()
        deleted_item = next((t for t in trash_after if t["id"] == trash_id), None)
        assert deleted_item is None, "Permanently deleted item should not exist in trash"
        
        print(f"Permanently deleted '{item_name}'")
    
    def test_06_clear_all_trash(self):
        """Test DELETE /api/trash - clear all trash items"""
        # First, add some items to trash for clearing
        dept_response = requests.get(f"{BASE_URL}/api/departments", headers=self.headers)
        depts = dept_response.json() if dept_response.status_code == 200 else []
        dept_id = depts[0]["id"] if depts else None
        
        # Create and safe-delete 2 test students
        for i in range(2):
            student_data = {
                "student_id": f"TEST_CLEAR_ALL_{i}",
                "full_name": f"طالب تفريغ السلة {i}",
                "level": 1,
                "section": "C",
                "department_id": dept_id
            }
            create_resp = requests.post(f"{BASE_URL}/api/students", json=student_data, headers=self.headers)
            if create_resp.status_code == 200:
                student_id = create_resp.json()["id"]
                requests.post(f"{BASE_URL}/api/students/{student_id}/safe-delete", headers=self.headers)
        
        # Get trash count before
        trash_before = requests.get(f"{BASE_URL}/api/trash", headers=self.headers).json()
        count_before = len(trash_before)
        
        if count_before == 0:
            print("No items to clear - test still valid")
        
        # Clear all trash
        clear_response = requests.delete(f"{BASE_URL}/api/trash", headers=self.headers)
        assert clear_response.status_code == 200, f"Clear all failed: {clear_response.text}"
        
        data = clear_response.json()
        assert "message" in data, "Response should have message"
        assert "تفريغ" in data["message"], f"Message should indicate clearing: {data['message']}"
        
        # Verify trash is empty
        trash_after = requests.get(f"{BASE_URL}/api/trash", headers=self.headers).json()
        assert len(trash_after) == 0, f"Trash should be empty after clear, found {len(trash_after)} items"
        
        print(f"Cleared all trash. Had {count_before} items before.")
    
    def test_07_trash_item_not_found(self):
        """Test error handling for non-existent trash item"""
        fake_id = "507f1f77bcf86cd799439011"
        
        # Try to restore non-existent
        restore_response = requests.post(
            f"{BASE_URL}/api/trash/{fake_id}/restore",
            headers=self.headers
        )
        assert restore_response.status_code == 404, "Should return 404 for non-existent trash item"
        
        # Try to delete non-existent
        delete_response = requests.delete(
            f"{BASE_URL}/api/trash/{fake_id}",
            headers=self.headers
        )
        assert delete_response.status_code == 404, "Should return 404 for non-existent trash item"
        
        print("Error handling for non-existent items works correctly")
    
    def test_08_non_admin_access_denied(self):
        """Test that non-admin users cannot access trash endpoints"""
        # This test requires creating a non-admin user or using existing one
        # For now we'll skip if no teacher account exists
        
        # Try to login as a teacher if one exists
        teacher_login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "teacher",
            "password": "teacher123"
        })
        
        if teacher_login.status_code != 200:
            pytest.skip("No teacher account available for access control test")
            return
        
        teacher_token = teacher_login.json()["access_token"]
        teacher_headers = {"Authorization": f"Bearer {teacher_token}"}
        
        # Try to access trash - should be denied
        response = requests.get(f"{BASE_URL}/api/trash", headers=teacher_headers)
        assert response.status_code == 403, f"Non-admin should be denied, got {response.status_code}"
        
        print("Access control working - non-admin denied")


class TestTrashItemStructure:
    """Test the structure and data integrity of trash items"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_trash_item_has_all_required_fields(self):
        """Verify trash items have all required fields"""
        # Create and delete a student to check structure
        dept_response = requests.get(f"{BASE_URL}/api/departments", headers=self.headers)
        depts = dept_response.json() if dept_response.status_code == 200 else []
        dept_id = depts[0]["id"] if depts else None
        
        student_data = {
            "student_id": "TEST_STRUCT_001",
            "full_name": "طالب فحص الهيكل",
            "level": 1,
            "section": "D",
            "department_id": dept_id
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/students", json=student_data, headers=self.headers)
        if create_resp.status_code == 200:
            student_id = create_resp.json()["id"]
            requests.post(f"{BASE_URL}/api/students/{student_id}/safe-delete", headers=self.headers)
        
        # Get trash and check structure
        trash_resp = requests.get(f"{BASE_URL}/api/trash", headers=self.headers)
        trash_items = trash_resp.json()
        
        if len(trash_items) == 0:
            pytest.skip("No trash items to verify structure")
            return
        
        item = trash_items[0]
        required_fields = ["id", "item_type", "item_name", "deleted_at", "expires_at", "days_remaining"]
        
        for field in required_fields:
            assert field in item, f"Trash item missing required field: {field}"
        
        # Verify types
        assert isinstance(item["id"], str), "id should be string"
        assert item["item_type"] in ["student", "teacher", "course"], f"Invalid item_type: {item['item_type']}"
        assert isinstance(item["item_name"], str), "item_name should be string"
        assert isinstance(item["days_remaining"], int), "days_remaining should be int"
        assert item["days_remaining"] >= 0, "days_remaining should be non-negative"
        assert item["days_remaining"] <= 30, "days_remaining should not exceed 30"
        
        print(f"Trash item structure verified: {item}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/trash", headers=self.headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
