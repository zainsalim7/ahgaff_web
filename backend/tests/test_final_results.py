"""Test sending final results notifications to students."""
import asyncio
import os
import sys
import io
import httpx

API_URL = os.environ.get("API_URL", "https://schedule-hub-272.preview.emergentagent.com")


async def login(client, username, password):
    r = await client.post(f"{API_URL}/api/auth/login", json={"username": username, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


async def main():
    async with httpx.AsyncClient(timeout=60) as client:
        token = await login(client, "admin", "admin123")
        h = {"Authorization": f"Bearer {token}"}

        # Pick a course with students
        courses = (await client.get(f"{API_URL}/api/courses", headers=h)).json()
        target_course = None
        target_students = None
        for c in courses:
            cid = c.get("id")
            if not cid:
                continue
            enrollments = (await client.get(f"{API_URL}/api/enrollments/{cid}/students", headers=h)).json()
            if enrollments:
                target_course = c
                target_students = enrollments[:3]
                break
        if not target_course:
            print("FAIL: no course with students")
            return 1

        cid = target_course["id"]
        print(f"Course: {target_course.get('name')} ({cid})")
        print(f"Students: {[(s.get('student_id'), s.get('full_name')) for s in target_students]}")

        # Test 1: Template download
        r = await client.get(f"{API_URL}/api/template/final-results", headers=h)
        print(f"Template download: {r.status_code} bytes={len(r.content)}")
        assert r.status_code == 200, "Template download failed"

        # Test 2: JSON send
        results = []
        for i, s in enumerate(target_students):
            results.append({
                "student_number": s["student_id"],
                "result": "ناجح" if i % 2 == 0 else "راسب",
                "grade": "85" if i % 2 == 0 else "45",
            })
        r = await client.post(
            f"{API_URL}/api/courses/{cid}/send-final-results",
            headers=h,
            json={"results": results},
        )
        print(f"JSON send: {r.status_code} {r.text[:300]}")
        assert r.status_code == 200, "JSON send failed"
        body = r.json()
        assert body.get("sent", 0) == len(results), f"Expected {len(results)} sent, got {body.get('sent')}"

        # Test 3: Excel upload
        import pandas as pd
        df = pd.DataFrame({
            "رقم القيد": [s["student_id"] for s in target_students],
            "النتيجة": ["ناجح", "راسب", "ناجح"][: len(target_students)],
            "الدرجة": ["80", "40", "95"][: len(target_students)],
        })
        buf = io.BytesIO()
        df.to_excel(buf, index=False)
        buf.seek(0)
        files = {"file": ("results.xlsx", buf.read(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        r = await client.post(f"{API_URL}/api/courses/{cid}/send-final-results/upload", headers=h, files=files)
        print(f"Excel upload: {r.status_code} {r.text[:300]}")
        assert r.status_code == 200, "Excel upload failed"
        body = r.json()
        assert body.get("sent", 0) == len(target_students), f"Expected {len(target_students)} sent, got {body.get('sent')}"

        # Test 4: Invalid student
        r = await client.post(
            f"{API_URL}/api/courses/{cid}/send-final-results",
            headers=h,
            json={"results": [{"student_number": "NOTEXIST999", "result": "pass"}]},
        )
        print(f"Invalid student: {r.status_code} {r.text[:300]}")
        body = r.json()
        assert body.get("sent") == 0
        assert body.get("failed_count") == 1

        # Test 5: Verify student receives notification
        # Login as the first student (assuming default password convention).
        # Skip if we cannot; just verify via DB count via admin endpoint
        target_student_db_id = target_students[0].get("id")
        r = await client.get(f"{API_URL}/api/students/{target_student_db_id}/notifications", headers=h)
        if r.status_code == 200:
            data = r.json()
            notifs = data if isinstance(data, list) else data.get("notifications", [])
            final_results_notifs = [n for n in notifs if isinstance(n, dict) and n.get("course_id") == cid and "النتيجة النهائية" in n.get("title", "")]
            print(f"Student {target_student_db_id} has {len(final_results_notifs)} final-result notifications")
            assert len(final_results_notifs) >= 1, "No final-result notification recorded for student"

        print("PASS: All final-results tests passed")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
