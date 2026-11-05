import { User } from '../types';

// 🆕 لمستخدمي الإنفاذ الفعلي (advanced_access_real_enforcement) المقيَّدين بأقسام/كليات محددة:
// يرجع نطاقهم الفعلي ليُستخدم كفلتر افتراضي بدل "الكل" الذي قد يرجع فارغاً في نقاط تتطلب تحديداً صريحاً.
export function getMyScope(user: User | null | undefined): { restricted: boolean; departmentIds: string[]; facultyIds: string[] } {
  const u: any = user || {};
  const departmentIds: string[] = (u.department_ids || []).filter(Boolean);
  const facultyIds: string[] = (u.faculty_ids || []).filter(Boolean);
  const restricted = !!u.advanced_access_real_enforcement && (departmentIds.length > 0 || facultyIds.length > 0);
  return { restricted, departmentIds, facultyIds };
}
