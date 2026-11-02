// عناصر الواجهة المتاحة حاليًا للمستخدمين الجدد ذوي الإنفاذ الفعلي (advanced_access_real_enforcement)
// نفس نطاق النقاط المُفعَّلة فعليًا على الخادم فقط — لا تتوسّع هنا بدون تفعيل خادمي مطابق
export interface RealEnforcedMenuItem {
  permissionKey: string;
  label: string;
  icon: string;
  path: string;
}

export const REAL_ENFORCED_MENU_ITEMS: RealEnforcedMenuItem[] = [
  { permissionKey: 'students_students_get_students', label: 'الطلاب', icon: 'people', path: '/students' },
  { permissionKey: 'teachers_teachers_get_teachers', label: 'المعلمون', icon: 'school', path: '/manage-teachers' },
  { permissionKey: 'academic_structure_departments_get_departments', label: 'الأقسام', icon: 'business', path: '/add-department' },
  { permissionKey: 'schedule_weekly_schedule_get_weekly_schedule', label: 'الجدول الأسبوعي', icon: 'calendar', path: '/weekly-schedule' },
  { permissionKey: 'courses_courses_create_course', label: 'المقررات', icon: 'book', path: '/(tabs)/courses' },
  { permissionKey: 'courses_courses_delete_course', label: 'المقررات', icon: 'book', path: '/(tabs)/courses' },
  { permissionKey: 'curriculum_curriculum_list_curriculum_courses', label: 'الخطة الدراسية', icon: 'library', path: '/curriculum' },
  { permissionKey: 'curriculum_curriculum_get_curriculum_by_department', label: 'الخطة الدراسية', icon: 'library', path: '/curriculum' },
  { permissionKey: 'reports_ser_get_teacher_workload_report', label: 'نصاب التدريس', icon: 'briefcase', path: '/report-teacher-workload' },
];

export function getAccessibleRealEnforcedItems(permissionKeys: string[]): RealEnforcedMenuItem[] {
  const seenPaths = new Set<string>();
  const result: RealEnforcedMenuItem[] = [];
  for (const item of REAL_ENFORCED_MENU_ITEMS) {
    if (permissionKeys.includes(item.permissionKey) && !seenPaths.has(item.path)) {
      seenPaths.add(item.path);
      result.push(item);
    }
  }
  return result;
}
