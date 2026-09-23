import React from 'react';
import { Portal, btn } from './EmployeeFormModal';

export { Portal, inp, lbl, btn } from './EmployeeFormModal';

export const errMsg = (e: any, fallback = 'حدث خطأ') => (typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : fallback);
export const alertErr = (e: any) => window.alert(errMsg(e));
export const fmtDT = (s?: string) => (s ? String(s).slice(0, 16).replace('T', ' ') : '—');

export const Modal: React.FC<{ title: string; onClose: () => void; width?: number; children: React.ReactNode; testID?: string; busy?: boolean }> = ({ title, onClose, width = 620, children, testID, busy }) => (
  <Portal>
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }} onClick={() => !busy && onClose()}>
      <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 22, width, maxWidth: '96%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }} data-testid={testID}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f2440' }}>{title}</div>
          <button onClick={onClose} style={btn('#f1f5f9', '#0f2440', { padding: '4px 10px' })} data-testid={testID ? `${testID}-close` : undefined}>✕</button>
        </div>
        {children}
      </div>
    </div>
  </Portal>
);

export const Drawer: React.FC<{ onClose: () => void; children: React.ReactNode; testID?: string; width?: number }> = ({ onClose, children, testID, width = 480 }) => (
  <Portal>
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-start', direction: 'rtl' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width, maxWidth: '95%', height: '100%', backgroundColor: '#fff', overflowY: 'auto', padding: 20, boxShadow: '-4px 0 24px rgba(0,0,0,0.2)' }} data-testid={testID}>
        {children}
      </div>
    </div>
  </Portal>
);

export const Tabs: React.FC<{ tabs: { key: string; label: string; count?: number }[]; value: string; onChange: (k: string) => void; testID?: string }> = ({ tabs, value, onChange, testID }) => (
  <div style={{ display: 'flex', gap: 6, direction: 'rtl', marginBottom: 12, flexWrap: 'wrap' }} data-testid={testID}>
    {tabs.map((t) => (
      <button key={t.key} onClick={() => onChange(t.key)} data-testid={`${testID || 'tab'}-${t.key}`}
        style={btn(value === t.key ? '#0f2440' : '#f1f5f9', value === t.key ? '#fff' : '#0f2440', { padding: '8px 16px', borderRadius: 20 })}>
        {t.label}{t.count !== undefined ? <span style={{ marginRight: 6, backgroundColor: value === t.key ? '#fff' : '#0f2440', color: value === t.key ? '#0f2440' : '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{t.count}</span> : null}
      </button>
    ))}
  </div>
);

export const Badge: React.FC<{ color: string; children: React.ReactNode; testID?: string }> = ({ color, children, testID }) => (
  <span data-testid={testID} style={{ backgroundColor: color + '18', color, padding: '3px 9px', borderRadius: 10, fontWeight: 700, fontSize: 11.5, whiteSpace: 'nowrap' }}>{children}</span>
);

export const Th: React.FC<{ cols: string[] }> = ({ cols }) => (
  <thead><tr style={{ backgroundColor: '#0f2440', color: '#fff' }}>{cols.map((h, i) => <th key={i} style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>{h}</th>)}</tr></thead>
);

export const td: React.CSSProperties = { padding: '9px 8px', color: '#334155' };
export const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, direction: 'rtl' };

export const Field: React.FC<{ label: string; span?: number; children: React.ReactNode }> = ({ label, span = 1, children }) => (
  <div style={{ gridColumn: `span ${span}` }}>
    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#333', marginBottom: 4, textAlign: 'right' }}>{label}</div>
    {children}
  </div>
);

export const opt = (m: Record<string, string>) => Object.entries(m || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>);

export const LEAVE_STATUS_COLOR: Record<string, string> = { pending: '#f97316', hr_pending: '#0284c7', approved: '#16a34a', rejected: '#dc2626', cancelled: '#64748b' };
export const ATT_COLOR: Record<string, string> = { present: '#16a34a', late: '#f97316', half_day: '#eab308', absent: '#dc2626', excused: '#7c3aed', leave: '#0284c7', mission: '#0f766e', holiday: '#94a3b8' };
export const CORR_COLOR: Record<string, string> = { incoming: '#0284c7', outgoing: '#7c3aed', internal: '#0f766e', circular: '#f97316' };
export const CORR_STATUS_COLOR: Record<string, string> = { draft: '#94a3b8', registered: '#0284c7', in_progress: '#f97316', closed: '#16a34a', archived: '#64748b' };
