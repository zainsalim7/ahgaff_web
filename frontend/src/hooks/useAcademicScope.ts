import { useEffect, useState } from 'react';
import api from '../services/api';

export type AcademicScope = { restricted: boolean; faculty_ids: string[]; full_faculty_ids?: string[]; department_ids: string[] };

let cached: AcademicScope | null = null;

/** 🔒 نطاق المستخدم الأكاديمي — لتقييد قوائم الكليات/الأقسام (الخادم هو الحارس الفعلي) */
export const useAcademicScope = () => {
  const [scope, setScope] = useState<AcademicScope | null>(cached);
  useEffect(() => {
    api.get('/me/academic-scope').then(r => { cached = r.data; setScope(r.data); }).catch(() => {});
  }, []);
  const restricted = !!scope?.restricted;
  const filterFaculties = <T extends { id: string }>(list: T[]) => (restricted ? list.filter(f => scope!.faculty_ids.includes(f.id)) : list);
  const filterDepartments = <T extends { id: string }>(list: T[]) => (restricted ? list.filter(d => scope!.department_ids.includes(d.id)) : list);
  return { scope, restricted, filterFaculties, filterDepartments };
};
