"""
Test: Verify deleted lectures don't leave orphaned attendance records that mark students as absent.

Flow:
1. Login as admin
2. Pick a course (or create one)
3. Create a lecture
4. Mark a student absent
5. Verify attendance shows
6. Delete the lecture
7. Verify the attendance record is gone for that course
8. Verify student attendance report no longer counts the absence
"""
import asyncio
import os
import sys
import httpx
from datetime import datetime, timedelta

API_URL = os.environ.get("API_URL", "https://schedule-hub-272.preview.emergentagent.com")


async def login(client, username, password):
    r = await client.post(f"{API_URL}/api/auth/login", json={"username": username, "password": password})
    r.raise_for_status()
    data = r.json()
    return data["access_token"], data["user"]


async def main():
    async with httpx.AsyncClient(timeout=60) as client:
        token, user = await login(client, "admin", "admin123")
        h = {"Authorization": f"Bearer {token}"}

        # Get an existing course with at least one student enrolled
        courses = (await client.get(f"{API_URL}/api/courses", headers=h)).json()
        print(f"Found {len(courses)} courses")
        if not courses:
            print("FAIL: no courses to test with")
            return 1

        target_course = None
        target_student = None
        for c in courses:
            cid = c.get("id")
            if not cid:
                continue
            enrollments = (await client.get(f"{API_URL}/api/enrollments/{cid}/students", headers=h)).json()
            if enrollments:
                target_course = c
                target_student = enrollments[0]
                break

        if not target_course:
            print("FAIL: no course with students")
            return 1

        cid = target_course["id"]
        sid = target_student.get("student_id") or target_student.get("id")
        # student_id field might be the doc id or the student's number; need the doc id
        # Try both
        print(f"Course: {target_course.get('name')} ({cid})")
        print(f"Student: {target_student}")

        # Create a lecture for tomorrow
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        lec_payload = {
            "course_id": cid,
            "date": tomorrow,
            "start_time": "08:00",
            "end_time": "09:30",
            "force": True,
        }
        r = await client.post(f"{API_URL}/api/lectures", headers=h, json=lec_payload)
        if r.status_code >= 400:
            print(f"Create lecture failed: {r.status_code} {r.text[:300]}")
            return 1
        lecture_id = r.json()["id"]
        print(f"Created lecture: {lecture_id}")

        # Mark the student absent for this lecture
        # Need to find correct attendance API. Try /api/attendance/manual
        att_payload = {
            "course_id": cid,
            "student_id": str(target_student.get("id") or target_student.get("_id") or sid),
            "lecture_id": lecture_id,
            "status": "absent",
            "method": "manual",
        }
        r = await client.post(f"{API_URL}/api/attendance/single", headers=h, json=att_payload)
        print(f"Mark absent: {r.status_code} {r.text[:200]}")

        # Verify attendance shows
        att_before = (await client.get(f"{API_URL}/api/attendance/course/{cid}", headers=h)).json()
        before_count = sum(1 for a in att_before if a.get("student_id") == att_payload["student_id"])
        print(f"Attendance records for student before deletion: {before_count}")

        # Delete the lecture
        r = await client.delete(f"{API_URL}/api/lectures/{lecture_id}", headers=h)
        print(f"Delete lecture: {r.status_code} {r.text[:200]}")

        # Verify attendance is cleaned
        att_after = (await client.get(f"{API_URL}/api/attendance/course/{cid}", headers=h)).json()
        after_count = sum(1 for a in att_after if a.get("student_id") == att_payload["student_id"])
        print(f"Attendance records for student after deletion: {after_count}")

        # Verify the specific lecture's attendance is gone
        gone = all(a.get("lecture_id") != lecture_id for a in att_after)
        print(f"All attendance for deleted lecture gone: {gone}")

        if before_count > after_count and gone:
            print("PASS: deleted lecture's attendance was cleaned up")
            return 0
        print("FAIL: orphaned attendance remains")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
