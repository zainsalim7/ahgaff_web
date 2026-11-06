// 🌉 الجسر العام (Generic Bridge) بين نظام الصلاحيات القديم (PERMISSIONS.X) ومركز الصلاحيات المتقدم
// الهدف: حل مشكلة "كل صلاحية جديدة تحتاج تعديل ملف يدوياً" نهائياً — بدل ربط كل مفتاح متقدم بعينه
// بكل صفحة، نربط كل صلاحية قديمة بمجموعة (group_key) **واحدة تمثّل نفس المجال فعلياً** (تكافؤ دلالي
// حقيقي)، وليس بكل مجموعة ظهرت فيها نفس الكلمة في الكود (co-occurrence) — تلك الطريقة جُرِّبت وأثبت
// اختبار حي (testing_agent) أنها واسعة جداً: مفتاح "students_*" وحده كان يفتح صلاحيات المقررات/المعلمين/
// الحضور/الخريجين لأن كلها تحتوي كلمة "students" في مكان ما من كودها. لذلك كل صلاحية قديمة هنا مربوطة
// فقط بالمجموعة التي تمثّل *مجالها الأساسي* (استناداً لمراجعة يدوية لمعنى كل صلاحية، وليس توليداً آلياً).
//
// ⚠️ هذا الجسر لأغراض عرض الواجهة فقط (إظهار/إخفاء أزرار وصفحات) — لا يمنح أي صلاحية تنفيذ فعلية؛
// التحقق الأمني الحقيقي يبقى دائماً من الخادم (real_enforce_guard / Layer 1 و2).
export const LEGACY_TO_ADV_GROUPS: Record<string, string[]> = {
  manage_users: ['system_users'],
  manage_roles: ['system_users'],
  manage_departments: ['academic_structure'],
  manage_faculties: ['academic_structure'],
  manage_semesters: ['academic_structure'],
  view_departments: ['academic_structure'],
  view_faculties: ['academic_structure'],
  manage_courses: ['courses'],
  view_courses: ['courses'],
  migrate_courses: ['courses'],
  manage_students: ['students'],
  view_students: ['students'],
  import_data: ['students'],
  manage_teachers: ['teachers'],
  view_teachers: ['teachers'],
  cross_university_assignment: ['teachers'],
  manage_enrollments: ['enrollments'],
  add_enrollment: ['enrollments'],
  delete_enrollment: ['enrollments'],
  view_enrollments: ['enrollments'],
  record_attendance: ['attendance'],
  take_attendance: ['attendance'],
  view_attendance: ['attendance'],
  edit_attendance: ['attendance'],
  manage_attendance: ['attendance'],
  approve_attendance_changes: ['attendance'],
  manage_student_excuses: ['attendance'],
  view_reports: ['reports'],
  view_statistics: ['reports'],
  export_reports: ['reports'],
  report_attendance_overview: ['reports'],
  report_absent_students: ['reports'],
  report_warnings: ['reports'],
  report_daily: ['reports'],
  report_student: ['reports'],
  report_course: ['reports'],
  report_teacher_delays: ['reports'],
  report_lesson_completion: ['reports'],
  manage_teaching_load: ['teaching_load'],
  view_teaching_load: ['teaching_load'],
  report_teacher_workload: ['teaching_load'],
  manage_lectures: ['schedule'],
  view_lectures: ['schedule'],
  reschedule_lecture: ['schedule'],
  generate_lectures: ['schedule'],
  override_lecture_status: ['schedule'],
  view_schedule: ['schedule'],
  manage_schedule: ['schedule'],
  shift_day: ['schedule'],
  view_archive: ['archive'],
  search_archive: ['archive'],
  export_archive: ['archive'],
  manage_curriculum: ['curriculum'],
  view_curriculum: ['curriculum'],
  hr_view_employees: ['hr_core'],
  hr_manage_employees: ['hr_core'],
  hr_manage_org: ['hr_core'],
  hr_manage_leaves: ['hr_leaves'],
  hr_manage_leave_settings: ['hr_leaves'],
  hr_manage_attendance: ['hr_attendance'],
  hr_manage_work_settings: ['hr_attendance'],
  hr_manage_correspondence: ['correspondence'],
  hr_manage_tasks: ['hr_tasks'],
  hr_manage_appraisals: ['hr_tasks'],
  issue_letters: ['letters'],
  manage_letter_settings: ['letters'],
  use_assistant: ['assistant'],
  manage_settings: ['system_tools'],
  send_notifications: ['notifications'],
  manage_notifications: ['notifications'],
};

// هل يملك المستخدم مفتاح صلاحية متقدمة واحداً على الأقل من المجموعات المذكورة؟
export function hasGroupAccess(groups: string[], permissionKeys: string[]): boolean {
  if (!groups?.length || !permissionKeys?.length) return false;
  return permissionKeys.some((key) => groups.some((g) => key.startsWith(g + '_')));
}

// هل تُغني الصلاحيات المتقدمة الحالية عن صلاحية قديمة واحدة محددة؟
export function hasAdvancedAccessForLegacy(permission: string, permissionKeys: string[]): boolean {
  const groups = LEGACY_TO_ADV_GROUPS[permission];
  if (!groups) return false;
  return hasGroupAccess(groups, permissionKeys);
}

// هل تُغني الصلاحيات المتقدمة الحالية عن أي صلاحية من قائمة صلاحيات قديمة؟
export function hasAdvancedAccessForAnyLegacy(permissions: string[], permissionKeys: string[]): boolean {
  return permissions.some((p) => hasAdvancedAccessForLegacy(p, permissionKeys));
}
