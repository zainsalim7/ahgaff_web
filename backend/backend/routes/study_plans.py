"""
Study Plan Routes - مسارات إدارة الخطط الدراسية
- جلب/تحديث الخطة
- استيراد من Excel
- نسخ من مقرر آخر
- اعتماد/إلغاء اعتماد/رفض pending
- تأكيد المواضيع المُدرَّسة
"""
import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Optional

import pandas as pd
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from .deps import get_current_user, get_db, has_permission
from models.permissions import UserRole
from models.lectures import LectureStatus

router = APIRouter(tags=["الخطة الدراسية"])

# 📥 أسماء الأعمدة المقبولة في ملف الاستيراد (المقارنة بعد trim وبدون حساسية لحالة الأحرف اللاتينية)
WEEK_COL_NAMES = ["رقم الأسبوع", "الأسبوع", "الاسبوع", "اسبوع", "أسبوع", "week", "week_number"]
TOPIC_COL_NAMES = ["عنوان الموضوع", "عنوان الدرس", "الموضوع", "الدرس", "موضوع", "درس", "topic", "lesson", "title"]
NOTES_COL_NAMES = ["ملاحظات", "ملاحظة", "notes"]
_EASTERN_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


def normalize_digits(v) -> str:
    """تحويل الأرقام الهندية/الفارسية إلى غربية: ١٢٣ → 123"""
    return str(v).translate(_EASTERN_DIGITS)


def parse_week_number(v) -> Optional[int]:
    """رقم الأسبوع من الخلية؛ None إن كانت فارغة أو غير رقمية"""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    txt = normalize_digits(v).strip()
    if not txt or txt.lower() == "nan":
        return None
    try:
        return int(float(txt))
    except Exception:
        return None


def _match_col(df_columns, names: list) -> Optional[str]:
    wanted = {n.strip().lower() for n in names}
    for c in df_columns:
        if str(c).strip().lower() in wanted:
            return c
    return None


def parse_study_plan_rows(df) -> dict:
    """قواعد الصفوف: أسبوع+موضوع → يُضاف؛ أسبوع بلا موضوع → أسبوع فارغ؛ موضوع بلا أسبوع → يُلحق بالأسبوع السابق؛
    صف فارغ أو أسبوع غير رقمي → يُتجاهل. يرجع {week_number: [topics]} (قد تكون القائمة فارغة)"""
    week_col = _match_col(df.columns, WEEK_COL_NAMES)
    title_col = _match_col(df.columns, TOPIC_COL_NAMES)
    notes_col = _match_col(df.columns, NOTES_COL_NAMES)
    if week_col is None or title_col is None:
        raise HTTPException(status_code=400, detail=(
            "لم يُعثر على الأعمدة المطلوبة. عمود الأسبوع (أحد): " + " | ".join(WEEK_COL_NAMES)
            + " — عمود الموضوع (أحد): " + " | ".join(TOPIC_COL_NAMES)))
    weeks_data: dict = {}
    last_week: Optional[int] = None
    for _, row in df.iterrows():
        raw_wk = row.get(week_col)
        wk_empty = raw_wk is None or pd.isna(raw_wk) or not normalize_digits(raw_wk).strip()
        wk_num = None if wk_empty else parse_week_number(raw_wk)
        raw_title = row.get(title_col)
        title_str = "" if raw_title is None or pd.isna(raw_title) else str(raw_title).strip()
        if not wk_empty and wk_num is None:
            continue  # نص غير رقمي في عمود الأسبوع (مثل صف التعليمات) → يُتجاهل
        if wk_empty and not title_str:
            continue
        notes = ""
        if notes_col is not None and not pd.isna(row.get(notes_col)):
            notes = str(row.get(notes_col)).strip()
        if wk_num is not None:
            weeks_data.setdefault(wk_num, [])
            last_week = wk_num
            if title_str:
                weeks_data[wk_num].append({"title": title_str, "notes": notes})
        elif last_week is not None:
            weeks_data[last_week].append({"title": title_str, "notes": notes})
    return weeks_data

YEMEN_TIMEZONE = timezone(timedelta(hours=3))


def _get_yemen_time() -> datetime:
    """الوقت الحالي بتوقيت اليمن (UTC+3)"""
    return datetime.now(YEMEN_TIMEZONE)


async def _ensure_teacher_owns_course(course_id: str, current_user: dict, db) -> dict:
    """تتحقق من أن المعلم يملك المقرر، وإلا 403. تُرجع وثيقة المقرر."""
    try:
        ObjectId(course_id)
    except Exception:
        raise HTTPException(status_code=400, detail="معرف المقرر غير صالح")
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")
    if current_user["role"] == UserRole.TEACHER:
        teacher_user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
        teacher_record_id = (
            teacher_user.get("teacher_record_id", current_user["id"]) if teacher_user else current_user["id"]
        )
        if course.get("teacher_id") != teacher_record_id:
            raise HTTPException(status_code=403, detail="غير مصرح لك بهذا المقرر")
    return course


# ==================== GET ====================
@router.get("/courses/{course_id}/study-plan")
async def get_study_plan(course_id: str, current_user: dict = Depends(get_current_user)):
    """جلب الخطة الدراسية لمقرر مع حالة إكمال المواضيع"""
    db = get_db()
    plan = await db.study_plans.find_one({"course_id": course_id}, {"_id": 0})
    if not plan:
        return {
            "course_id": course_id,
            "weeks": [],
            "total_topics": 0,
            "completed_topics": 0,
            "completion_percent": 0,
            "approved": False,
            "has_pending": False,
        }

    completed_lectures = await db.lectures.find(
        {
            "course_id": course_id,
            "status": LectureStatus.COMPLETED,
            "plan_topic_id": {"$exists": True, "$nin": ["", None]},
        },
        {"plan_topic_id": 1, "lesson_title": 1, "date": 1},
    ).to_list(500)

    completed_topic_ids = {}
    for lec in completed_lectures:
        tid = lec.get("plan_topic_id")
        if tid:
            completed_topic_ids[tid] = {
                "date": lec.get("date", ""),
                "lesson_title": lec.get("lesson_title", ""),
                "source": "lecture",
            }

    total_topics = 0
    completed_count = 0

    for week in plan.get("weeks", []):
        week_total = 0
        week_completed = 0
        for topic in week.get("topics", []):
            total_topics += 1
            week_total += 1
            topic_id = topic.get("id", "")
            # 1) محاضرة مرتبطة بالموضوع
            if topic_id in completed_topic_ids:
                topic["completed"] = True
                topic["completed_date"] = completed_topic_ids[topic_id].get("date", "")
                topic["completed_source"] = "lecture"
                completed_count += 1
                week_completed += 1
            # 2) المعلم أكّد الموضوع يدوياً (بدون محاضرة) عبر /confirm-topics
            elif topic.get("confirmed") and topic.get("was_taught", True):
                topic["completed"] = True
                topic["completed_date"] = topic.get("confirmed_date", "")
                topic["completed_source"] = "manual_confirm"
                completed_count += 1
                week_completed += 1
            else:
                topic["completed"] = False
                topic["completed_date"] = ""
                topic["completed_source"] = ""
        week["total_topics"] = week_total
        week["completed_topics"] = week_completed
        week["completion_percent"] = (
            round((week_completed / week_total) * 100) if week_total > 0 else 0
        )

    plan["total_topics"] = total_topics
    plan["completed_topics"] = completed_count
    plan["completion_percent"] = (
        round((completed_count / total_topics) * 100) if total_topics > 0 else 0
    )
    plan["approved"] = bool(plan.get("approved", False))
    plan["has_pending"] = bool(plan.get("pending_weeks"))

    return plan


# ==================== PUT (manual edit) ====================
@router.put("/courses/{course_id}/study-plan")
async def update_study_plan(
    course_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """إنشاء أو تحديث الخطة الدراسية لمقرر"""
    db = get_db()
    if (
        current_user["role"] != UserRole.ADMIN
        and current_user["role"] != UserRole.TEACHER
        and not has_permission(current_user, "manage_courses")
        and not has_permission(current_user, "edit_course")
    ):
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")

    if current_user["role"] == UserRole.TEACHER:
        user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
        teacher_record_id = (
            user.get("teacher_record_id", current_user["id"]) if user else current_user["id"]
        )
        if course.get("teacher_id") != teacher_record_id:
            raise HTTPException(status_code=403, detail="غير مصرح لك بتعديل خطة هذا المقرر")

    weeks = data.get("weeks", [])
    for week in weeks:
        for topic in week.get("topics", []):
            if not topic.get("id"):
                topic["id"] = str(uuid.uuid4())[:8]

    existing_plan = await db.study_plans.find_one({"course_id": course_id}) or {}
    is_approved = bool(existing_plan.get("approved", False))
    is_teacher = current_user["role"] == UserRole.TEACHER
    now_iso = _get_yemen_time().isoformat()

    if is_approved and is_teacher:
        await db.study_plans.update_one(
            {"course_id": course_id},
            {"$set": {
                "pending_weeks": weeks,
                "pending_submitted_by": current_user["id"],
                "pending_submitted_at": now_iso,
                "pending_mode": "edit",
            }},
            upsert=True,
        )
        return {
            "message": "تم حفظ تعديلاتك بانتظار اعتماد الأدمن",
            "weeks": weeks,
            "pending": True,
        }

    plan_data = {
        "course_id": course_id,
        "weeks": weeks,
        "updated_at": now_iso,
        "updated_by": current_user["id"],
    }
    update_doc = {
        "$set": plan_data,
        "$unset": {
            "pending_weeks": "",
            "pending_submitted_by": "",
            "pending_submitted_at": "",
            "pending_mode": "",
        },
    }
    await db.study_plans.update_one({"course_id": course_id}, update_doc, upsert=True)
    return {"message": "تم حفظ الخطة الدراسية", "weeks": weeks}


# ==================== Excel Template ====================
@router.get("/template/study-plan")
async def get_study_plan_template(current_user: dict = Depends(get_current_user)):
    """تحميل نموذج Excel للخطة الدراسية"""
    if (
        current_user["role"] != UserRole.ADMIN
        and current_user["role"] != UserRole.TEACHER
        and not has_permission(current_user, "manage_courses")
    ):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    wb = Workbook()
    ws = wb.active
    ws.title = "الخطة الدراسية"
    ws.sheet_view.rightToLeft = True
    ws.append(["رقم الأسبوع", "عنوان الموضوع", "ملاحظات"])
    for c in ws[1]:
        c.font = Font(bold=True); c.fill = PatternFill("solid", fgColor="DDEBF7"); c.alignment = Alignment(horizontal="center")
    ws.append(["يمكنك استخدام: عنوان الدرس، الموضوع، الدرس — اترك الموضوع فارغاً لأسبوع بدون درس — الأرقام العربية والهندية مقبولة", "", ""])
    ws.merge_cells("A2:C2")
    ws["A2"].font = Font(italic=True, color="666666"); ws["A2"].fill = PatternFill("solid", fgColor="F2F2F2")
    ws["A2"].alignment = Alignment(horizontal="right", wrap_text=True); ws.row_dimensions[2].height = 32
    for r in [[1, "مقدمة في المقرر", ""], ["", "المفاهيم الأساسية", "موضوع إضافي لنفس الأسبوع"], ["٢", "الوحدة الأولى - الجزء 1", "رقم هندي مقبول"],
              [3, "", "أسبوع بدون درس (يُملأ لاحقاً)"], [4, "الوحدة الثانية - مقدمة", ""]]:
        ws.append(r)
    ws.column_dimensions["A"].width = 14; ws.column_dimensions["B"].width = 48; ws.column_dimensions["C"].width = 32
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{__import__('urllib.parse', fromlist=['quote']).quote('قالب الخطة الدراسية.xlsx')}", "X-Filename": __import__('urllib.parse', fromlist=['quote']).quote('قالب الخطة الدراسية.xlsx')},
    )


# ==================== Excel Upload ====================
@router.post("/courses/{course_id}/study-plan/upload")
async def upload_study_plan_excel(
    course_id: str,
    file: UploadFile = File(...),
    replace: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """رفع الخطة الدراسية من ملف Excel/CSV.
    - replace=true: استبدال الخطة الكاملة
    - replace=false: دمج (إضافة المواضيع للأسابيع الموجودة)
    أعمدة مطلوبة: عمود الأسبوع (رقم الأسبوع | الأسبوع | week ...) وعمود الموضوع (عنوان الموضوع | عنوان الدرس | الموضوع | topic ...)
    """
    if (
        current_user["role"] != UserRole.ADMIN
        and current_user["role"] != UserRole.TEACHER
        and not has_permission(current_user, "manage_courses")
    ):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    try:
        ObjectId(course_id)
    except Exception:
        raise HTTPException(status_code=400, detail="معرف المقرر غير صالح")
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="المقرر غير موجود")

    if current_user["role"] == UserRole.TEACHER:
        teacher_user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
        teacher_record_id = (
            teacher_user.get("teacher_record_id", current_user["id"]) if teacher_user else current_user["id"]
        )
        if course.get("teacher_id") != teacher_record_id:
            raise HTTPException(status_code=403, detail="غير مصرح لك برفع خطة هذا المقرر")

    contents = await file.read()
    fname = (file.filename or "").lower()
    try:
        if fname.endswith(".csv"):
            df = pd.read_csv(BytesIO(contents))
        else:
            df = pd.read_excel(BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"تعذر قراءة الملف: {e}")

    weeks_data = parse_study_plan_rows(df)

    if not weeks_data:
        raise HTTPException(status_code=400, detail="الملف لا يحتوي على بيانات صالحة")

    new_weeks = []
    if replace:
        for wk_num in sorted(weeks_data.keys()):
            new_weeks.append({
                "week_number": wk_num,
                "topics": [
                    {"id": str(uuid.uuid4())[:8], "title": t["title"], "notes": t["notes"]}
                    for t in weeks_data[wk_num]
                ],
            })
    else:
        existing = await db.study_plans.find_one({"course_id": course_id})
        existing_weeks = (existing or {}).get("weeks", [])
        weeks_map = {w["week_number"]: w for w in existing_weeks}
        for wk_num, topics in weeks_data.items():
            if wk_num not in weeks_map:
                weeks_map[wk_num] = {"week_number": wk_num, "topics": []}
            for t in topics:
                weeks_map[wk_num]["topics"].append({
                    "id": str(uuid.uuid4())[:8],
                    "title": t["title"],
                    "notes": t["notes"],
                })
        new_weeks = sorted(weeks_map.values(), key=lambda x: x["week_number"])

    plan_data = {
        "course_id": course_id,
        "weeks": new_weeks,
        "updated_at": _get_yemen_time().isoformat(),
        "updated_by": current_user["id"],
    }

    existing_plan_doc = await db.study_plans.find_one({"course_id": course_id}) or {}
    is_approved = bool(existing_plan_doc.get("approved", False))
    is_teacher = current_user["role"] == UserRole.TEACHER

    if is_approved and is_teacher:
        await db.study_plans.update_one(
            {"course_id": course_id},
            {"$set": {
                "pending_weeks": new_weeks,
                "pending_submitted_by": current_user["id"],
                "pending_submitted_at": _get_yemen_time().isoformat(),
                "pending_mode": "replace" if replace else "merge",
            }},
            upsert=True,
        )
        total_topics = sum(len(w["topics"]) for w in new_weeks)
        return {
            "message": f"تم رفع الخطة بانتظار اعتماد الأدمن: {len(new_weeks)} أسبوع و {total_topics} موضوع",
            "weeks_count": len(new_weeks),
            "total_topics": total_topics,
            "mode": "replace" if replace else "merge",
            "pending": True,
        }

    await db.study_plans.update_one(
        {"course_id": course_id},
        {"$set": plan_data, "$unset": {
            "pending_weeks": "",
            "pending_submitted_by": "",
            "pending_submitted_at": "",
            "pending_mode": "",
        }},
        upsert=True,
    )

    total_topics = sum(len(w["topics"]) for w in new_weeks)
    return {
        "message": f"تم رفع الخطة بنجاح: {len(new_weeks)} أسبوع و {total_topics} موضوع",
        "weeks_count": len(new_weeks),
        "total_topics": total_topics,
        "mode": "replace" if replace else "merge",
    }


# ==================== Clone ====================
@router.post("/courses/{course_id}/study-plan/clone-from")
async def clone_study_plan(
    course_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    """نسخ الخطة الدراسية من مقرر مصدر إلى مقرر هدف.
    Body: {source_course_id: str, replace: bool}
    """
    if current_user["role"] != UserRole.ADMIN and not has_permission(current_user, "manage_courses"):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    source_id = payload.get("source_course_id")
    replace = bool(payload.get("replace", False))
    if not source_id:
        raise HTTPException(status_code=400, detail="مطلوب source_course_id")
    if source_id == course_id:
        raise HTTPException(status_code=400, detail="المقرر المصدر والهدف متطابقان")

    source = await db.study_plans.find_one({"course_id": source_id}, {"_id": 0})
    if not source or not source.get("weeks"):
        raise HTTPException(status_code=404, detail="المقرر المصدر لا يحتوي خطة دراسية")

    new_weeks = []
    for w in source.get("weeks", []):
        new_weeks.append({
            "week_number": w.get("week_number"),
            "topics": [
                {
                    "id": str(uuid.uuid4())[:8],
                    "title": t.get("title", ""),
                    "notes": t.get("notes", ""),
                }
                for t in w.get("topics", [])
            ],
        })

    if not replace:
        existing = await db.study_plans.find_one({"course_id": course_id})
        if existing and existing.get("weeks"):
            weeks_map = {w["week_number"]: w for w in existing["weeks"]}
            for w in new_weeks:
                if w["week_number"] not in weeks_map:
                    weeks_map[w["week_number"]] = w
                else:
                    weeks_map[w["week_number"]]["topics"].extend(w["topics"])
            new_weeks = sorted(weeks_map.values(), key=lambda x: x["week_number"])

    plan_data = {
        "course_id": course_id,
        "weeks": new_weeks,
        "updated_at": _get_yemen_time().isoformat(),
        "updated_by": current_user["id"],
        "cloned_from": source_id,
    }
    await db.study_plans.update_one(
        {"course_id": course_id}, {"$set": plan_data}, upsert=True
    )
    total_topics = sum(len(w["topics"]) for w in new_weeks)
    return {
        "message": f"تم النسخ: {len(new_weeks)} أسبوع و {total_topics} موضوع",
        "weeks_count": len(new_weeks),
        "total_topics": total_topics,
    }


# ==================== Approve / Unapprove / Reject pending ====================
@router.post("/courses/{course_id}/study-plan/approve")
async def approve_study_plan(course_id: str, current_user: dict = Depends(get_current_user)):
    """اعتماد الخطة (أدمن فقط). إذا كان فيه pending يستبدل به الأصل."""
    if current_user["role"] != UserRole.ADMIN and not has_permission(current_user, "manage_courses"):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    try:
        ObjectId(course_id)
    except Exception:
        raise HTTPException(status_code=400, detail="معرف المقرر غير صالح")
    db = get_db()
    plan = await db.study_plans.find_one({"course_id": course_id})
    if not plan:
        raise HTTPException(status_code=404, detail="لا توجد خطة دراسية لهذا المقرر")

    now_iso = _get_yemen_time().isoformat()
    update_set = {
        "approved": True,
        "approved_by": current_user["id"],
        "approved_date": now_iso,
    }
    update_unset = {}
    pending = plan.get("pending_weeks")
    if pending:
        update_set["weeks"] = pending
        update_set["updated_at"] = now_iso
        update_set["updated_by"] = current_user["id"]
        update_unset = {
            "pending_weeks": "",
            "pending_submitted_by": "",
            "pending_submitted_at": "",
            "pending_mode": "",
        }

    update_doc = {"$set": update_set}
    if update_unset:
        update_doc["$unset"] = update_unset

    await db.study_plans.update_one({"course_id": course_id}, update_doc)
    return {
        "message": "تم اعتماد الخطة الدراسية" + (" واستبدالها بالنسخة الجديدة" if pending else ""),
        "approved": True,
        "applied_pending": bool(pending),
    }


@router.post("/courses/{course_id}/study-plan/unapprove")
async def unapprove_study_plan(course_id: str, current_user: dict = Depends(get_current_user)):
    """إلغاء اعتماد الخطة (أدمن فقط)"""
    if current_user["role"] != UserRole.ADMIN and not has_permission(current_user, "manage_courses"):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    plan = await db.study_plans.find_one({"course_id": course_id})
    if not plan:
        raise HTTPException(status_code=404, detail="لا توجد خطة دراسية لهذا المقرر")
    await db.study_plans.update_one(
        {"course_id": course_id},
        {"$set": {"approved": False}, "$unset": {"approved_by": "", "approved_date": ""}},
    )
    return {"message": "تم إلغاء اعتماد الخطة", "approved": False}


@router.post("/courses/{course_id}/study-plan/reject-pending")
async def reject_pending_study_plan(course_id: str, current_user: dict = Depends(get_current_user)):
    """رفض الخطة المعلّقة (pending) من المعلم (أدمن فقط)"""
    if current_user["role"] != UserRole.ADMIN and not has_permission(current_user, "manage_courses"):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    plan = await db.study_plans.find_one({"course_id": course_id})
    if not plan or not plan.get("pending_weeks"):
        raise HTTPException(status_code=404, detail="لا توجد خطة معلّقة")
    await db.study_plans.update_one(
        {"course_id": course_id},
        {"$unset": {
            "pending_weeks": "",
            "pending_submitted_by": "",
            "pending_submitted_at": "",
            "pending_mode": "",
        }},
    )
    return {"message": "تم رفض الخطة المعلّقة"}


# ==================== Confirm Topics ====================
@router.post("/courses/{course_id}/study-plan/confirm-topics")
async def confirm_study_plan_topics(
    course_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    """تأكيد مواضيع ماضية يدوياً من قبل المعلم.
    Body: { confirmations: [ { topic_id: str, was_taught: bool } ] }
    """
    if (
        current_user["role"] != UserRole.ADMIN
        and current_user["role"] != UserRole.TEACHER
        and not has_permission(current_user, "manage_courses")
    ):
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    db = get_db()
    course = await _ensure_teacher_owns_course(course_id, current_user, db)
    _ = course  # noqa: F841

    confirmations = payload.get("confirmations") or []
    if not isinstance(confirmations, list) or not confirmations:
        raise HTTPException(status_code=400, detail="يجب إرسال قائمة confirmations غير فارغة")

    plan = await db.study_plans.find_one({"course_id": course_id})
    if not plan:
        raise HTTPException(status_code=404, detail="لا توجد خطة دراسية لهذا المقرر")

    today_iso = _get_yemen_time().isoformat()
    confirmations_map = {
        c.get("topic_id"): bool(c.get("was_taught", True))
        for c in confirmations
        if c.get("topic_id")
    }

    weeks = plan.get("weeks", [])
    confirmed_count = 0
    for week in weeks:
        for topic in week.get("topics", []):
            tid = topic.get("id")
            if tid and tid in confirmations_map:
                topic["confirmed"] = True
                topic["confirmed_date"] = today_iso
                topic["was_taught"] = confirmations_map[tid]
                topic["confirmed_by"] = current_user["id"]
                confirmed_count += 1

    await db.study_plans.update_one(
        {"course_id": course_id},
        {"$set": {"weeks": weeks, "updated_at": today_iso}},
    )

    return {
        "message": f"تم تأكيد {confirmed_count} موضوع",
        "confirmed_count": confirmed_count,
        "submitted_count": len(confirmations_map),
    }
