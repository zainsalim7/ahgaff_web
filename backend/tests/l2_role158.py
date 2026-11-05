# Iter158: temporarily grant/restore layer2_test_emp role perms for UI regression: python3 l2_role158.py grant|restore
import os, sys, requests
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
ROLE = "6ae98be3fbf74b036f42a7a7"
ORIG = ["students_ser_create_student", "students_ser_delete_student", "grades_grades_download_grades_template"]
EXTRA = ["teachers_ser_get_teachers", "students_ser_get_students", "courses_ser_get_courses",
         "academic_structure_ser_get_departments", "academic_structure_ser_get_faculties"]
t = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()
h = {"Authorization": f"Bearer {t.get('token') or t.get('access_token')}"}
keys = ORIG + EXTRA if sys.argv[1] == "grant" else ORIG
r = requests.put(f"{API}/advanced-access/roles/{ROLE}", headers=h, json={"permission_keys": keys})
print(r.status_code, sorted(requests.get(f"{API}/advanced-access/roles/{ROLE}", headers=h).json()["permission_keys"]))
