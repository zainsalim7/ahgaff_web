export interface ChangeRequest {
  id: string;
  lecture_id: string;
  course_id: string;
  course_name: string;
  course_code: string;
  lecture_date: string;
  lecture_start_time: string;
  student_id: string;
  student_name: string;
  student_number?: string;
  faculty_id?: string | null;
  faculty_name?: string;
  department_id?: string | null;
  department_name?: string;
  level?: number | null;
  section?: string;
  old_status: string | null;
  new_status: string;
  reason: string | null;
  requested_by: string;
  requested_by_name: string;
  requested_by_role: string;
  requested_at: string;
  status: string;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
}

export interface FilterOptions {
  faculties: { id: string; name: string }[];
  departments: { id: string; name: string; faculty_id?: string | null }[];
  courses: { id: string; name: string; code: string; faculty_id?: string | null; department_id?: string | null; level?: number | null; section?: string; semester_id?: string | null; count: number }[];
  semesters: { id: string; name: string; is_active: boolean }[];
  requesters: { id: string; name: string; role: string; count: number }[];
}

export interface Filters {
  status: string;
  faculty_id: string;
  department_id: string;
  level: string;
  section: string;
  course_id: string;
  semester_id: string;
  requested_by: string;
  new_status: string;
  q: string;
  lecture_from: string;
  lecture_to: string;
  requested_from: string;
  requested_to: string;
  sort: string;
  page: number;
  view: 'list' | 'grouped';
}

export const EMPTY_FILTERS: Filters = {
  status: 'pending', faculty_id: '', department_id: '', level: '', section: '', course_id: '', semester_id: '',
  requested_by: '', new_status: '', q: '', lecture_from: '', lecture_to: '', requested_from: '', requested_to: '',
  sort: 'newest', page: 1, view: 'list',
};

export const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  present: { label: 'حاضر', color: '#0d5a2c', bg: '#e8f5ee' },
  absent: { label: 'غائب', color: '#b71c1c', bg: '#ffe0e0' },
  late: { label: 'متأخر', color: '#c67c00', bg: '#fff3d6' },
  excused: { label: 'مأذون', color: '#4a148c', bg: '#f0e6ff' },
};

export const REQ_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'قيد الانتظار', color: '#8a6d3b', bg: '#fff3cd' },
  approved: { label: 'معتمد', color: '#0d5a2c', bg: '#e8f5ee' },
  rejected: { label: 'مرفوض', color: '#b71c1c', bg: '#ffe0e0' },
  cancelled: { label: 'ملغي', color: '#5b6678', bg: '#eef1f6' },
  all: { label: 'الكل', color: '#1a2540', bg: '#f0f2f5' },
};

export const ROLE_LABELS: Record<string, string> = {
  teacher: 'مدرّس', admin: 'مدير', dean: 'عميد', department_head: 'رئيس قسم', staff: 'موظف', student: 'طالب',
};

export const SORT_LABELS: Record<string, string> = {
  newest: 'الأحدث', oldest: 'الأقدم', lecture_date: 'تاريخ المحاضرة', student_name: 'اسم الطالب',
};

export const PAGE_SIZE = 50;

export const filtersToQuery = (f: Filters, withPage = true): string => {
  const p = new URLSearchParams();
  (Object.keys(f) as (keyof Filters)[]).forEach(k => {
    if (k === 'view') return;
    if (k === 'page') { if (withPage) p.set('page', String(f.page)); return; }
    const v = f[k];
    if (v !== '' && v !== undefined && v !== null) p.set(k, String(v));
  });
  if (withPage) p.set('page_size', String(PAGE_SIZE));
  return p.toString();
};

export const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
