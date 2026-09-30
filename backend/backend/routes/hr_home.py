"""🏠 لوحة الموظف — ملخّص موحّد للرئيسة (دوامي، إجازاتي، مهامي، التعاميم، مراسلاتي)"""
from datetime import datetime

from fastapi import APIRouter, Depends
from bson import ObjectId

from .deps import get_db, get_current_user
from .hr_common import YEMEN_TZ, find_my_employee
from .hr_attendance import my_attendance
from .hr_correspondence import my_correspondence
from .hr_leaves import _balance
from .hr_tasks import OPEN

router = APIRouter(prefix="/hr/home", tags=["شؤون الموظفين - لوحة الموظف"])


@router.get("/summary")
async def home_summary(current_user: dict = Depends(get_current_user)):
    db = get_db()
    emp = await find_my_employee(db, current_user)
    if not emp:
        return {"has_profile": False}
    eid = str(emp["_id"])
    unit = await db.org_units.find_one({"_id": ObjectId(emp["org_unit_id"])}, {"name": 1}) if emp.get("org_unit_id") and ObjectId.is_valid(emp["org_unit_id"]) else None
    att = await my_attendance(None, current_user)
    corr = await my_correspondence(current_user)
    circulars = corr.get("items", [])
    year = datetime.now(YEMEN_TZ).year
    bal = await _balance(db, eid, year)
    sent = await db.hr_correspondence.find({"direction": "employee", "sender_employee_id": eid}, {"status": 1, "replies": 1, "seen_reply_at": 1}).to_list(500)
    return {
        "has_profile": True,
        "profile": {"id": eid, "full_name": emp.get("full_name", ""), "job_title": emp.get("job_title", ""), "employee_no": emp.get("employee_no", ""),
                    "org_unit_name": (unit or {}).get("name", ""), "photo_url": emp.get("photo_url", "")},
        "attendance": {"today": att.get("today"), "can_check_in": att.get("can_check_in"), "can_check_out": att.get("can_check_out"), "is_work_day": att.get("is_work_day"),
                       "holiday": att.get("holiday"), "on_leave": att.get("on_leave"), "counts": att.get("counts", {}), "late_minutes": att.get("late_minutes", 0),
                       "next_shift": att.get("next_shift"), "multi_shift": att.get("multi_shift"), "day_name": att.get("day_name"), "date": att.get("date")},
        "leaves": {"remaining": bal["remaining"], "entitlement": bal["entitlement"], "used": bal["used"],
                   "pending": await db.leave_requests.count_documents({"employee_id": eid, "status": {"$in": ["pending", "hr_pending"]}})},
        "tasks": {"open": await db.hr_tasks.count_documents({"assignee_employee_id": eid, "status": {"$in": list(OPEN)}}),
                  "overdue": await db.hr_tasks.count_documents({"assignee_employee_id": eid, "status": {"$in": list(OPEN)}, "due_date": {"$lt": att.get("date"), "$ne": None}})},
        "circulars": {"total": len(circulars), "unacknowledged": sum(1 for c in circulars if not c.get("acknowledged")), "urgent": sum(1 for c in circulars if c.get("priority") == "urgent")},
        "messages": {"total": len(sent), "open": sum(1 for c in sent if c.get("status") in ("registered", "in_progress")), "replied": sum(1 for c in sent if c.get("status") == "replied")},
    }
