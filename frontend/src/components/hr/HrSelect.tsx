import React, { useEffect, useMemo, useRef, useState } from 'react';
import { hrAPI } from '../../services/api';
import { inp } from './EmployeeFormModal';

export type Opt = { value: string; label: string; sub?: string };

const useOutside = (ref: React.RefObject<HTMLElement | null>, onClose: () => void) => {
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [ref, onClose]);
};

const norm = (s: string) => (s || '').toString().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
export const matches = (q: string, ...fields: (string | undefined)[]) => { const n = norm(q).trim(); return !n || fields.some((f) => norm(f || '').includes(n)); };

/** 🔽 قائمة منسدلة موحّدة (فردية) — تفتح بالنقر، بحث داخلي عند طول القائمة، إغلاق بالنقر خارجها/Esc */
export const HrSelect: React.FC<{ value: string; onChange: (v: string) => void; options: Opt[]; placeholder?: string; searchable?: boolean; disabled?: boolean; testID?: string; style?: React.CSSProperties; allowClear?: boolean }> =
  ({ value, onChange, options, placeholder = '— اختر —', searchable, disabled, testID, style, allowClear = true }) => {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    useOutside(ref, () => setOpen(false));
    const canSearch = searchable ?? options.length > 8;
    const list = useMemo(() => options.filter((o) => matches(q, o.label, o.sub, o.value)), [options, q]);
    const cur = options.find((o) => o.value === value);
    return (
      <div ref={ref} style={{ position: 'relative', direction: 'rtl', ...style }} data-testid={testID}>
        <button type="button" disabled={disabled} onClick={() => { setOpen((o) => !o); setQ(''); }} data-testid={testID ? `${testID}-btn` : undefined}
          style={{ ...inp, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'right', opacity: disabled ? 0.6 : 1, border: open ? '1px solid #1565c0' : (inp.border as string) }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: cur ? '#0f172a' : '#94a3b8' }}>{cur ? cur.label : placeholder}</span>
          <span style={{ color: '#64748b', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, marginTop: 4, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, zIndex: 1200, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', overflow: 'hidden' }} data-testid={testID ? `${testID}-menu` : undefined}>
            {canSearch && <div style={{ padding: 6, borderBottom: '1px solid #f1f5f9' }}><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث…" style={{ ...inp, padding: '6px 8px' }} data-testid={testID ? `${testID}-search` : undefined} /></div>}
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {allowClear && <div onClick={() => { onChange(''); setOpen(false); }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12.5, color: '#64748b', borderBottom: '1px solid #f8fafc' }} data-testid={testID ? `${testID}-opt-` : undefined}>{placeholder}</div>}
              {list.map((o) => (
                <div key={o.value} onClick={() => { onChange(o.value); setOpen(false); }} data-testid={testID ? `${testID}-opt-${o.value}` : undefined}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, backgroundColor: o.value === value ? '#eef4ff' : '#fff', color: o.value === value ? '#1565c0' : '#0f172a', fontWeight: o.value === value ? 800 : 500, borderBottom: '1px solid #f8fafc' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f7f9fc')} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = o.value === value ? '#eef4ff' : '#fff')}>
                  {o.label}{o.sub ? <span style={{ color: '#94a3b8', fontSize: 11, marginRight: 6 }}>{o.sub}</span> : null}
                </div>
              ))}
              {list.length === 0 && <div style={{ padding: 12, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>لا نتائج</div>}
            </div>
          </div>
        )}
      </div>
    );
  };

export const optsFromMap = (m?: Record<string, string>): Opt[] => Object.entries(m || {}).map(([value, label]) => ({ value, label }));
export const empOpts = (emps: any[]): Opt[] => (emps || []).map((e) => ({ value: e.id, label: e.full_name, sub: [e.employee_no, e.job_title].filter(Boolean).join(' · ') }));

/** 👤 اختيار موظف واحد مع بحث بالاسم/الرقم — من قائمة مُمرَّرة أو بالبحث في الخادم */
export const EmployeeSelect: React.FC<{ value: string; onChange: (v: string) => void; emps?: any[]; placeholder?: string; testID?: string; disabled?: boolean; exclude?: string[] }> = ({ value, onChange, emps, placeholder = '— اختر الموظف —', testID, disabled, exclude = [] }) => {
  const [remote, setRemote] = useState<any[]>([]);
  useEffect(() => { if (emps) return; hrAPI.employees({ per_page: 500 }).then((r) => setRemote(r.data.employees || [])).catch(() => setRemote([])); }, [emps]);
  const options = useMemo(() => empOpts((emps || remote).filter((e) => !exclude.includes(e.id))), [emps, remote, exclude]);
  return <HrSelect value={value} onChange={onChange} options={options} placeholder={placeholder} searchable testID={testID} disabled={disabled} />;
};

/** 👥 اختيار عدة موظفين: قائمة منسدلة ببحث + شرائح قابلة للإزالة */
export const EmployeeMultiSelect: React.FC<{ value: string[]; onChange: (v: string[]) => void; emps: any[]; testID?: string; placeholder?: string }> = ({ value, onChange, emps, testID, placeholder = 'ابحث بالاسم أو الرقم لإضافة موظف…' }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const byId = useMemo(() => Object.fromEntries((emps || []).map((e) => [e.id, e])), [emps]);
  const list = useMemo(() => (emps || []).filter((e) => !value.includes(e.id) && matches(q, e.full_name, e.employee_no, e.job_title)).slice(0, 60), [emps, q, value]);
  return (
    <div ref={ref} style={{ direction: 'rtl', position: 'relative' }} data-testid={testID}>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={placeholder} style={inp} data-testid={testID ? `${testID}-search` : undefined} />
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, marginTop: 4, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, zIndex: 1200, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 240, overflowY: 'auto' }} data-testid={testID ? `${testID}-menu` : undefined}>
          {list.map((e) => <div key={e.id} onClick={() => { onChange([...value, e.id]); setQ(''); setOpen(false); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', fontSize: 13 }} data-testid={testID ? `${testID}-opt-${e.id}` : undefined}><b>{e.full_name}</b> <span style={{ color: '#94a3b8', fontSize: 11 }}>{e.employee_no}{e.job_title ? ` · ${e.job_title}` : ''}</span></div>)}
          {list.length === 0 && <div style={{ padding: 12, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>لا نتائج</div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }} data-testid={testID ? `${testID}-chips` : undefined}>
        {value.map((id) => <span key={id} style={{ backgroundColor: '#eef4ff', color: '#1565c0', borderRadius: 14, padding: '3px 10px', fontSize: 12, fontWeight: 700 }} data-testid={testID ? `${testID}-chip-${id}` : undefined}>{byId[id]?.full_name || id} <button type="button" onClick={() => onChange(value.filter((x) => x !== id))} style={{ border: 'none', background: 'transparent', color: '#c62828', cursor: 'pointer', fontWeight: 800 }}>✕</button></span>)}
        {value.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>لم يُحدَّد أحد</span>}
      </div>
    </div>
  );
};

/** ↕️ رؤوس أعمدة قابلة للفرز */
export type Sort = { key: string; dir: 'asc' | 'desc' } | null;
export const useSort = <T,>(rows: T[], sort: Sort, getters: Record<string, (r: T) => any>) => useMemo(() => {
  if (!sort || !getters[sort.key]) return rows;
  const g = getters[sort.key];
  return [...rows].sort((a, b) => { const x = g(a), y = g(b); const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'ar'); return sort.dir === 'asc' ? c : -c; });
}, [rows, sort, getters]);
export const toggleSort = (s: Sort, key: string): Sort => (!s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null);
export const SortTh: React.FC<{ cols: { label: string; key?: string }[]; sort: Sort; onSort: (k: string) => void }> = ({ cols, sort, onSort }) => (
  <thead><tr style={{ backgroundColor: '#0f2440', color: '#fff' }}>{cols.map((c, i) => (
    <th key={i} onClick={() => c.key && onSort(c.key)} data-testid={c.key ? `sort-${c.key}` : undefined} style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, cursor: c.key ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {c.label}{c.key ? <span style={{ marginRight: 4, fontSize: 10, opacity: sort?.key === c.key ? 1 : 0.35 }}>{sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}</span> : null}
    </th>))}</tr></thead>
);
