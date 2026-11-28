import { StyleSheet } from 'react-native';

export type ReqField = { key: string; label: string; type: string; required: boolean; options: string[] };
export type ReqType = { id: string; name: string; description: string; fields: ReqField[]; require_attachment: boolean; attachment_label: string; faculty_ids: string[]; is_active: boolean; order: number };
export type ReqItem = {
  id: string; ref_no: string; type_id: string; type_name: string; fields: ReqField[]; values: Record<string, string>; notes: string;
  status: string; status_ar: string; last_note: string; attachments: { idx: number; name: string; mime: string; size: number }[];
  created_at: string; history: { action: string; by_name: string; at: string; note?: string }[];
  student_name: string; student_no: string; faculty_name: string; department_name: string; level: any; section: string;
};

export const REQ_STATUS_COLOR: Record<string, string> = { pending: '#ef6c00', needs_info: '#b45309', approved: '#2e7d32', completed: '#1565c0', rejected: '#c62828' };
export const REQ_STATUS = [
  { id: 'pending', name: 'قيد المراجعة' }, { id: 'needs_info', name: 'مطلوب استكمال' }, { id: 'approved', name: 'مقبول' },
  { id: 'completed', name: 'منجز' }, { id: 'rejected', name: 'مرفوض' },
];
export const FIELD_TYPES = [
  { id: 'text', name: 'نص قصير' }, { id: 'textarea', name: 'نص طويل' }, { id: 'number', name: 'رقم' }, { id: 'date', name: 'تاريخ' }, { id: 'select', name: 'قائمة خيارات' },
];

export const rqs = StyleSheet.create({
  row: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  h: { fontSize: 15, fontWeight: '800', color: '#1a2540', textAlign: 'right' },
  muted: { fontSize: 12, color: '#64748b', textAlign: 'right', marginTop: 2 },
  box: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, marginTop: 10, gap: 6, backgroundColor: '#f8fafc' },
  kv: { flexDirection: 'row-reverse', gap: 10 },
  k: { fontSize: 12.5, color: '#64748b', width: 140, textAlign: 'right' },
  v: { fontSize: 13, color: '#1a2540', fontWeight: '600', flex: 1, textAlign: 'right' },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#eff6ff' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 8, marginTop: 10, minHeight: 56, textAlign: 'right', fontSize: 13, backgroundColor: '#fff' },
  card: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, backgroundColor: '#fff', gap: 4 },
});
