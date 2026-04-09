"""
نماذج الإعدادات - Settings Models
"""
from pydantic import BaseModel
from typing import List, Optional

class SemesterDates(BaseModel):
    name: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class AcademicYearConfig(BaseModel):
    year: str
    is_current: bool = False
    semesters: List[SemesterDates] = []

class SystemSettings(BaseModel):
    college_name: str = "كلية الشريعة والقانون"
    college_name_en: Optional[str] = "Faculty of Sharia and Law"
    academic_year: str = "2024-2025"
    current_semester: str = "الفصل الأول"
    current_semester_id: Optional[str] = None
    semester_start_date: Optional[str] = None
    semester_end_date: Optional[str] = None
    levels_count: int = 5
    sections: List[str] = ["أ", "ب", "ج"]
    attendance_late_minutes: int = 15
    attendance_edit_minutes: int = 60
    max_absence_percent: float = 25.0
    logo_url: Optional[str] = None
    primary_color: str = "#1565c0"
    secondary_color: str = "#ff9800"
    academic_years: List[str] = []

class SettingsUpdate(BaseModel):
    college_name: Optional[str] = None
    college_name_en: Optional[str] = None
    academic_year: Optional[str] = None
    current_semester: Optional[str] = None
    semester_start_date: Optional[str] = None
    semester_end_date: Optional[str] = None
    levels_count: Optional[int] = None
    sections: Optional[List[str]] = None
    attendance_late_minutes: Optional[int] = None
    attendance_edit_minutes: Optional[int] = None
    max_absence_percent: Optional[float] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    academic_years: Optional[List[str]] = None
