import api from '../../services/api';
import { downloadBlob } from '../hr/EmployeeDocuments';

export const C_COLOR: Record<string, string> = { draft: '#64748b', issued: '#16a34a', completed: '#2563eb', terminated: '#b91c1c' };
export const S_COLOR: Record<string, string> = { requested: '#d97706', confirmed: '#0891b2', filmed: '#7c3aed', editing: '#9333ea', cloud: '#2563eb', published: '#16a34a', rejected: '#b91c1c', cancelled: '#94a3b8' };
export const PIPE = [['requested', 'طلب حجز'], ['confirmed', 'حجز مؤكد'], ['filmed', 'تم التصوير'], ['editing', 'قيد المونتاج'], ['cloud', 'مرفوع للسحابة'], ['published', 'منشور على المنصة']] as const;
export const ITEM_COLOR: Record<string, string> = { pending: '#94a3b8', delivered: '#d97706', accepted: '#16a34a' };
export const money = (v: number) => (v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
export const errOf = (e: any, d = 'تعذر تنفيذ العملية') => e?.response?.data?.detail || d;
export const vp = (p: string) => `/video-production${p}`;
export const pdf = async (path: string, name: string) => { const r = await api.get(vp(path), { responseType: 'blob' }); downloadBlob(r.data, name); };
export const today = () => new Date().toISOString().slice(0, 10);

export const Bar = ({ pct, color = '#16a34a', testID }: { pct: number; color?: string; testID?: string }) => (
  <div style={{ background: '#e2e8f0', borderRadius: 99, height: 8, minWidth: 90, overflow: 'hidden' }} data-testid={testID}>
    <div style={{ width: `${Math.min(100, pct)}%`, background: color, height: '100%', borderRadius: 99, transition: 'width .4s' }} />
  </div>
);
