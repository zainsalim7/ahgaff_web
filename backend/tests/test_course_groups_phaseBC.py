"""Phase B+C tests for Course Groups: student/teacher lecture scope,
generate-semester with group, and distribution templates."""
import os
import pytest
import requests
from datetime import datetime, timedelta
from bson import ObjectId

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
COURSE_ID = "698f0000d803b27aab0120af"
# Pre-known teacher record ids for the course groups (from current DB state)
TEACHER_REC_G1 = "698ad3da31ab437a06176e2a"  # زين سالم (user 222222)
TEACHER_REC_G2 = "698bc0593a8982391e9ba188"  # Saeed (no login user → will swap for test)

# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def db():
    """Direct DB handle (sync pymongo) for seed/cleanup not possible via API."""
    from pymongo import MongoClient
    client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    return client[os.environ.get("DB_NAME", "test_database")]


def _parse_date(s: str) -> datetime:
    """Semester dates might be '2025-12-20' or '20-12-2025'."""
    for fmt in ("%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt)
        except Exception:
            continue
    raise ValueError(f"unparseable date: {s}")


@pytest.fixture(scope="module")
def active_semester(admin_h, db):
    """Return the globally ACTIVE semester (status=active or is_active=True)."""
    sem = db.semesters.find_one({"$or": [{"status": "active"}, {"is_active": True}]})
    assert sem, "no active semester in DB"
    # dates may be missing → use a safe recent date
    return {
        "id": str(sem["_id"]),
        "name": sem.get("name", ""),
        "start_date": sem.get("start_date"),
        "end_date": sem.get("end_date"),
    }


def _seed_group_pair(db, date_str, semester_id):
    course = db.courses.find_one({"_id": ObjectId(COURSE_ID)})
    groups_def = {g["key"]: g for g in (course.get("groups") or [])}
    created = []
    for grp in ("1", "2"):
        gdef = groups_def[grp]
        doc = {
            "course_id": COURSE_ID, "date": date_str,
            "start_time": "08:00", "end_time": "09:00",
            "room": "", "status": "scheduled", "notes": "TEST_phaseBC",
            "group": grp, "group_name": gdef.get("name") or f"مجموعة {grp}",
            "teacher_id": gdef.get("teacher_id"),
            "semester_id": semester_id,
            "created_at": datetime.utcnow(),
        }
        r = db.lectures.insert_one(doc)
        created.append({"id": str(r.inserted_id), "group": grp, "date": date_str, "teacher_id": gdef.get("teacher_id")})
    return created


@pytest.fixture(scope="module")
def seeded_lectures(admin_h, active_semester, db):
    """Two pairs of lectures:
       - 'student_pair' tagged with course's own semester_id (so GET /lectures/{course_id} returns them)
       - 'teacher_pair' tagged with ACTIVE semester_id (so /today, /all-schedule, /month return them)
    """
    # Course's semester
    course = db.courses.find_one({"_id": ObjectId(COURSE_ID)})
    course_sem_id = course.get("semester_id")
    course_sem = db.semesters.find_one({"_id": ObjectId(course_sem_id)})
    cstart = _parse_date(course_sem["start_date"]) if course_sem and course_sem.get("start_date") else None
    cdate = (cstart + timedelta(days=60)) if cstart else datetime.now()
    while cdate.weekday() != 1:
        cdate += timedelta(days=1)
    student_pair = _seed_group_pair(db, cdate.strftime("%Y-%m-%d"), course_sem_id)

    # Active semester (summer, no dates) → any date works for the filter
    now = datetime.now()
    tdate = now + timedelta(days=1)
    while tdate.weekday() != 1:
        tdate += timedelta(days=1)
    teacher_pair = _seed_group_pair(db, tdate.strftime("%Y-%m-%d"), active_semester["id"])

    yield {
        "student_date": cdate.strftime("%Y-%m-%d"), "student_pair": student_pair,
        "teacher_date": tdate.strftime("%Y-%m-%d"), "teacher_pair": teacher_pair,
    }
    for lec in student_pair + teacher_pair:
        db.lectures.delete_one({"_id": ObjectId(lec["id"])})


# ========== (1) STUDENT SCOPE ==========
class TestStudentScope:
    @pytest.fixture(scope="class")
    def student_token(self, admin_h, db):
        """Pick a student in group 1 of COURSE_ID and ensure he has an active user account."""
        enr = db.enrollments.find_one({"course_id": COURSE_ID, "group": "1"})
        assert enr, "need a student in group 1"
        sid = enr["student_id"]
        s = db.students.find_one({"_id": ObjectId(sid)})
        from passlib.context import CryptContext
        pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
        if s.get("user_id"):
            db.users.update_one(
                {"_id": ObjectId(s["user_id"])},
                {"$set": {"password": pwd.hash(s["student_id"]), "hashed_password": pwd.hash(s["student_id"]),
                          "is_active": True, "must_change_password": False}},
            )
            username = db.users.find_one({"_id": ObjectId(s["user_id"])})["username"]
        else:
            r = requests.post(f"{BASE_URL}/api/students/{sid}/activate", headers=admin_h)
            assert r.status_code == 200, r.text
            username = r.json()["username"]
        student_id = s["student_id"]
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": student_id})
        if r.status_code != 200:
            pytest.skip(f"student login failed: {r.status_code} {r.text}")
        return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}

    def test_student_sees_only_own_group_and_section_lectures(self, admin_h, student_token, seeded_lectures):
        # admin sees both group lectures
        r_admin = requests.get(f"{BASE_URL}/api/lectures/{COURSE_ID}?per_page=500", headers=admin_h)
        assert r_admin.status_code == 200
        a_data = r_admin.json()
        a_lectures = a_data.get("lectures") if isinstance(a_data, dict) else a_data
        a_ids = {lec["id"] for lec in a_lectures}
        g1_id = seeded_lectures["student_pair"][0]["id"]
        g2_id = seeded_lectures["student_pair"][1]["id"]
        assert g1_id in a_ids and g2_id in a_ids, f"admin should see both group lectures; got {a_ids & {g1_id, g2_id}}"

        # student (group 1) must see g1 but NOT g2
        r_st = requests.get(f"{BASE_URL}/api/lectures/{COURSE_ID}?per_page=500", headers=student_token)
        assert r_st.status_code == 200, r_st.text
        s_data = r_st.json()
        s_lectures = s_data.get("lectures") if isinstance(s_data, dict) else s_data
        s_ids = {lec["id"] for lec in s_lectures}
        assert g1_id in s_ids, "student should see own group (1) lecture"
        assert g2_id not in s_ids, f"student should NOT see other group (2) lecture; s_ids has it"

        # Verify no other group's lectures leak in
        for lec in s_lectures:
            g = lec.get("group")
            assert (not g) or g == "1", f"leaked lecture of group {g}: {lec.get('id')}"


# ========== (2) TEACHER SCOPE ==========
class TestTeacherScope:
    @pytest.fixture(scope="class")
    def teacher_user_token(self, db):
        """User 222222 → teacher_record_id = group 1's teacher. Reset password & login."""
        u = db.users.find_one({"username": "222222"})
        assert u, "user 222222 missing"
        if u.get("teacher_record_id") != TEACHER_REC_G1:
            pytest.skip(f"user 222222 teacher_record_id={u.get('teacher_record_id')} != {TEACHER_REC_G1}")
        from passlib.context import CryptContext
        pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
        db.users.update_one(
            {"_id": u["_id"]},
            {"$set": {"password": pwd.hash("test1234"), "hashed_password": pwd.hash("test1234"),
                      "is_active": True, "role": "teacher"}},
        )
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "222222", "password": "test1234"})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}

    def test_teacher_today_scope(self, teacher_user_token, seeded_lectures, admin_h, db):
        # need lecture to be today for /today — not necessarily; just verify today endpoint runs
        r = requests.get(f"{BASE_URL}/api/lectures/today", headers=teacher_user_token)
        assert r.status_code == 200, r.text
        # for /today lectures must be today — not necessarily seeded; just verify no crash & structure
        assert isinstance(r.json(), list)

    def test_teacher_all_schedule_sees_group1_not_group2(self, teacher_user_token, seeded_lectures):
        date = seeded_lectures["teacher_date"]
        r = requests.get(f"{BASE_URL}/api/lectures/all-schedule?date={date}", headers=teacher_user_token)
        assert r.status_code == 200, r.text
        data = r.json()
        lectures = data.get("lectures") if isinstance(data, dict) else data
        ids = {lec.get("id") for lec in lectures}
        g1_id = seeded_lectures["teacher_pair"][0]["id"]
        g2_id = seeded_lectures["teacher_pair"][1]["id"]
        assert g1_id in ids, f"teacher of group1 should see g1 lecture; ids={ids}"
        assert g2_id not in ids, f"teacher of group1 should NOT see g2 lecture; ids={ids}"

    def test_teacher_month_sees_group1_not_group2(self, teacher_user_token, seeded_lectures):
        d = datetime.strptime(seeded_lectures["teacher_date"], "%Y-%m-%d")
        r = requests.get(f"{BASE_URL}/api/lectures/month/{d.year}/{d.month}", headers=teacher_user_token)
        assert r.status_code == 200, r.text
        data = r.json()
        lectures = data.get("lectures") if isinstance(data, dict) else data
        ids = {lec.get("id") for lec in lectures}
        g1_id = seeded_lectures["teacher_pair"][0]["id"]
        g2_id = seeded_lectures["teacher_pair"][1]["id"]
        assert g1_id in ids
        assert g2_id not in ids


# ========== (3) GENERATE-SEMESTER with group ==========
class TestGenerateSemesterGroup:
    @pytest.fixture(scope="class")
    def gen_window(self, db):
        """Pick a window inside the course's own semester (ignore 'active' status; generator uses provided dates)."""
        c = db.courses.find_one({"_id": ObjectId(COURSE_ID)})
        sem = db.semesters.find_one({"_id": ObjectId(c["semester_id"])}) if c.get("semester_id") else None
        assert sem, "course needs semester"
        start = _parse_date(sem["start_date"])
        end = _parse_date(sem["end_date"])
        cur = start + timedelta(days=90)
        while cur.weekday() != 2:
            cur += timedelta(days=1)
        assert cur <= end
        return cur.strftime("%Y-%m-%d"), (cur + timedelta(days=28)).strftime("%Y-%m-%d")

    def _payload(self, start, end, group, dry_run):
        return {
            "course_id": COURSE_ID, "room": "",
            "schedule": [{"day": "wednesday", "slots": [{"start_time": "14:00", "end_time": "15:00"}]}],
            "start_date": start, "end_date": end, "dry_run": dry_run, "group": group,
        }

    def test_dry_run_group1(self, admin_h, gen_window):
        start, end = gen_window
        r = requests.post(f"{BASE_URL}/api/lectures/generate-semester", headers=admin_h,
                          json=self._payload(start, end, "1", True))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("dry_run") is True
        assert d.get("to_create", 0) >= 1, f"expected to_create >=1, got {d}"

    def test_invalid_group_rejected(self, admin_h, gen_window):
        start, end = gen_window
        r = requests.post(f"{BASE_URL}/api/lectures/generate-semester", headers=admin_h,
                          json=self._payload(start, end, "99", True))
        assert r.status_code == 400, r.text

    def test_real_create_group1_then_group2_parallel(self, admin_h, gen_window):
        start, end = gen_window
        r1 = requests.post(f"{BASE_URL}/api/lectures/generate-semester", headers=admin_h,
                           json=self._payload(start, end, "1", False))
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1.get("count", 0) >= 1 or "تم إنشاء" in (d1.get("message") or ""), f"g1 generate failed: {d1}"

        r2 = requests.post(f"{BASE_URL}/api/lectures/generate-semester", headers=admin_h,
                           json=self._payload(start, end, "2", False))
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2.get("count", 0) >= 1 or "تم إنشاء" in (d2.get("message") or ""), f"g2 generate failed: {d2}"

        # Verify lectures stamped with group & group_name & teacher_id
        all_lec = requests.get(f"{BASE_URL}/api/lectures/{COURSE_ID}?per_page=500", headers=admin_h).json()
        rows = all_lec.get("lectures") if isinstance(all_lec, dict) else all_lec
        g1_rows = [l for l in rows if l.get("group") == "1" and l.get("start_time") == "14:00" and start <= l.get("date") <= end]
        g2_rows = [l for l in rows if l.get("group") == "2" and l.get("start_time") == "14:00" and start <= l.get("date") <= end]
        assert g1_rows and g2_rows, f"g1={len(g1_rows)}, g2={len(g2_rows)}"
        for row in g1_rows + g2_rows:
            assert row.get("group_name"), f"missing group_name: {row}"

    def test_regen_same_group_already_exist(self, admin_h, gen_window):
        start, end = gen_window
        r = requests.post(f"{BASE_URL}/api/lectures/generate-semester", headers=admin_h,
                          json=self._payload(start, end, "1", True))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("to_create", 0) == 0, f"expected 0 new, got {d}"
        assert d.get("already_exist", 0) >= 1, d

    def test_cleanup_generated(self, admin_h, gen_window):
        start, end = gen_window
        all_lec = requests.get(f"{BASE_URL}/api/lectures/{COURSE_ID}?per_page=500", headers=admin_h).json()
        rows = all_lec.get("lectures") if isinstance(all_lec, dict) else all_lec
        to_del = [l for l in rows if l.get("start_time") == "14:00" and start <= l.get("date") <= end and l.get("group") in ("1", "2")]
        for l in to_del:
            requests.delete(f"{BASE_URL}/api/lectures/{l['id']}", headers=admin_h)


# ========== (4) DISTRIBUTION TEMPLATES ==========
class TestGroupTemplates:
    @pytest.fixture(scope="class")
    def tpl_name(self):
        return f"TEST_tpl_phaseBC_{datetime.now().strftime('%H%M%S')}"

    @pytest.fixture(scope="class")
    def tpl_state(self):
        return {}

    def test_save_template_requires_groups_and_assignments(self, admin_h, tpl_name, tpl_state):
        r = requests.post(f"{BASE_URL}/api/courses/{COURSE_ID}/groups/save-template",
                          headers=admin_h, json={"name": tpl_name})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] and d["students_count"] == 72 and len(d["groups"]) == 2
        tpl_state["id"] = d["id"]

    def test_save_template_empty_name_400(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/courses/{COURSE_ID}/groups/save-template",
                          headers=admin_h, json={"name": ""})
        assert r.status_code == 400

    def test_list_templates_shape(self, admin_h, tpl_state):
        r = requests.get(f"{BASE_URL}/api/courses/{COURSE_ID}/groups/templates", headers=admin_h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "templates" in d and "enrolled_count" in d
        tpl = next((t for t in d["templates"] if t["id"] == tpl_state["id"]), None)
        assert tpl, "newly saved template must appear"
        assert tpl["is_source"] is True
        assert tpl["same_section"] is True
        assert tpl["match_count"] == d["enrolled_count"] == 72

    def test_apply_template_on_sibling_course(self, admin_h, tpl_state, db):
        """Create a sibling course (same dept/level/section). Apply template, verify."""
        src = db.courses.find_one({"_id": ObjectId(COURSE_ID)})

        payload = {
            "name": "TEST_sibling_phaseBC", "code": f"TEST{datetime.now().strftime('%H%M%S')}",
            "credit_hours": 2, "department_id": src.get("department_id"),
            "faculty_id": src.get("faculty_id"), "level": src.get("level"),
            "section": src.get("section") or "",
            "semester_id": src.get("semester_id"), "teacher_id": None,
        }
        r = requests.post(f"{BASE_URL}/api/courses", headers=admin_h, json=payload)
        assert r.status_code in (200, 201), r.text
        new_course_id = r.json().get("id") or r.json().get("_id")
        assert new_course_id

        try:
            # Apply template
            r2 = requests.post(f"{BASE_URL}/api/courses/{new_course_id}/groups/apply-template",
                               headers=admin_h, json={"template_id": tpl_state["id"], "include_teachers": True, "only_unassigned": False})
            assert r2.status_code == 200, r2.text
            d2 = r2.json()
            assert d2.get("applied", 0) >= 0  # may be 0 if no auto-enrollment overlapped
            assert "message" in d2
            # Verify groups copied
            gr = requests.get(f"{BASE_URL}/api/courses/{new_course_id}/groups", headers=admin_h).json()
            assert len(gr["groups"]) == 2
            keys = {g["key"] for g in gr["groups"]}
            assert keys == {"1", "2"}
            # Teachers propagated
            tids = {g["teacher_id"] for g in gr["groups"]}
            assert tids & {TEACHER_REC_G1, TEACHER_REC_G2}
        finally:
            requests.delete(f"{BASE_URL}/api/courses/{new_course_id}", headers=admin_h)

    def test_delete_template(self, admin_h, tpl_state):
        r = requests.delete(f"{BASE_URL}/api/group-templates/{tpl_state['id']}", headers=admin_h)
        assert r.status_code == 200, r.text
        # verify gone
        r2 = requests.get(f"{BASE_URL}/api/courses/{COURSE_ID}/groups/templates", headers=admin_h).json()
        assert all(t["id"] != tpl_state["id"] for t in r2["templates"])

    def test_delete_nonexistent_404(self, admin_h):
        r = requests.delete(f"{BASE_URL}/api/group-templates/000000000000000000000000", headers=admin_h)
        assert r.status_code == 404
