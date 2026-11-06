// 🌉 الجسر العام (Generic Bridge) بين نظام الصلاحيات القديم (PERMISSIONS.X) ومركز الصلاحيات المتقدم
// الهدف: حل مشكلة "كل صلاحية جديدة تحتاج تعديل ملف يدوياً" نهائياً — بدل ربط كل مفتاح متقدم بعينه
// بكل صفحة، نربط كل صلاحية قديمة بمجموعة/مجموعات الصلاحيات المتقدمة المكافئة لها (group_key).
// أي مستخدم إنفاذ فعلي (advanced_access_real_enforcement=true) يملك صلاحية متقدمة واحدة على الأقل
// من المجموعة المكافئة لصلاحية قديمة معينة ⇒ يُعتبر "لديه" تلك الصلاحية القديمة لأغراض إظهار الواجهة.
//
// ⚠️ هذا الجسر لأغراض عرض الواجهة فقط (إظهار/إخفاء أزرار وصفحات) — لا يمنح أي صلاحية تنفيذ فعلية؛
// التحقق الأمني الحقيقي يبقى دائماً من الخادم (real_enforce_guard / Layer 1 و2).
//
// البيانات وُلِّدت من فحص AST حقيقي لكامل الكود (tools/generated/advanced_permissions.json،
// حقل legacy_permissions_detected) — وليست تخميناً يدوياً لكل مفتاح.
export const LEGACY_TO_ADV_GROUPS: Record<string, string[]> = {
  manage_users: ['notifications', 'system_users'],
  manage_departments: ['academic_structure', 'general_tools'],
  manage_courses: ['academic_structure', 'courses', 'curriculum', 'general_tools', 'schedule', 'students', 'system_tools'],
  manage_students: ['alumni', 'courses', 'general_tools', 'reports', 'students', 'system_tools'],
  manage_faculties: ['academic_structure', 'general_tools'],
  manage_teachers: ['general_tools', 'students', 'system_tools', 'teachers'],
  manage_enrollments: ['courses', 'enrollments', 'general_tools', 'students'],
  add_enrollment: ['courses', 'enrollments'],
  delete_enrollment: ['enrollments'],
  view_enrollments: ['general_tools', 'enrollments'],
  record_attendance: ['attendance'],
  take_attendance: ['attendance'],
  view_attendance: ['reports', 'students', 'attendance'],
  edit_attendance: ['attendance'],
  view_reports: ['general_tools', 'reports', 'system_tools'],
  view_statistics: ['general_tools', 'reports'],
  export_reports: ['reports'],
  import_data: ['enrollments', 'general_tools', 'students'],
  report_attendance_overview: ['reports'],
  report_absent_students: ['reports'],
  report_warnings: ['reports'],
  report_daily: ['reports'],
  report_student: ['reports'],
  report_course: ['reports'],
  report_teacher_workload: ['courses', 'reports', 'teaching_load'],
  report_teacher_delays: ['reports'],
  manage_teaching_load: ['general_tools', 'teaching_load'],
  view_teaching_load: ['general_tools', 'teaching_load'],
  manage_lectures: ['courses', 'general_tools', 'schedule'],
  view_lectures: ['courses', 'general_tools', 'schedule'],
  reschedule_lecture: ['schedule'],
  generate_lectures: ['schedule'],
  view_courses: ['curriculum', 'general_tools'],
  override_lecture_status: ['schedule'],
  view_archive: ['archive'],
  search_archive: ['archive'],
  export_archive: ['archive'],
  manage_curriculum: ['curriculum'],
  migrate_courses: ['courses'],
  view_curriculum: ['curriculum'],
  manage_attendance: ['attendance'],
  approve_attendance_changes: ['attendance'],
  view_schedule: ['schedule'],
  manage_schedule: ['courses', 'schedule'],
  shift_day: ['schedule'],
  hr_view_employees: ['cards', 'general_tools', 'hr_attendance', 'hr_core', 'hr_leaves', 'hr_tasks', 'letters'],
  hr_manage_employees: ['cards', 'general_tools', 'hr_attendance', 'hr_core', 'hr_leaves', 'hr_tasks', 'letters'],
  hr_manage_org: ['hr_core'],
  hr_manage_leaves: ['hr_leaves'],
  hr_manage_attendance: ['hr_attendance'],
  hr_manage_work_settings: ['hr_attendance'],
  hr_manage_leave_settings: ['hr_leaves'],
  hr_manage_correspondence: ['letters', 'correspondence'],
  hr_manage_tasks: ['hr_tasks'],
  hr_manage_appraisals: ['hr_tasks'],
  issue_letters: ['letters'],
  manage_letter_settings: ['letters', 'teaching_load'],
  manage_student_excuses: ['attendance'],
  use_assistant: ['assistant'],
  cross_university_assignment: ['teachers'],
  manage_settings: ['certificates', 'schedule', 'system_tools', 'teaching_load'],
  manage_semesters: ['academic_structure', 'system_tools'],
  manage_roles: ['system_users'],
  send_notifications: ['academic_structure', 'courses', 'general_tools', 'notifications'],
  manage_notifications: ['notifications'],
  report_lesson_completion: ['reports'],
  view_students: ['alumni', 'general_tools', 'students'],
  view_teachers: ['general_tools', 'teachers'],
  view_departments: ['general_tools', 'academic_structure'],
  view_faculties: ['general_tools', 'academic_structure'],
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
