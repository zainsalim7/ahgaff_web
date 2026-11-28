import api from '../../services/api';
import { downloadBlob } from '../hr/EmployeeDocuments';

export const C_COLOR: Record<string, string> = { draft: '#64748b', issued: '#16a34a', completed: '#2563eb', terminated: '#b91c1c' };
const BASE: Record<string, string> = { requested: '#d97706', confirmed: '#0891b2', rejected: '#b91c1c', cancelled: '#94a3b8', stalled: '#b91c1c' };
const PALETTE = ['#7c3aed', '#9333ea', '#c026d3', '#2563eb', '#0d9488', '#ca8a04', '#db2777', '#4f46e5'];
export type Step = { key: string; name: string; is_filming?: boolean; requires_link?: boolean; link_label?: string; notify?: boolean };
export const stepsOf = (settings: any): Step[] => settings?.pipeline_steps || [];
export const flowOf = (settings: any): [string, string][] => [['requested', 'طلب حجز'], ['confirmed', 'حجز مؤكد'], ...stepsOf(settings).map((x) => [x.key, x.name] as [string, string])];
export const sColor = (settings: any, status: string) => { const st = stepsOf(settings); const i = st.findIndex((x) => x.key === status); return i < 0 ? BASE[status] || '#475569' : i === st.length - 1 ? '#16a34a' : PALETTE[i % PALETTE.length]; };
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
