import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hrAPI } from '../../services/api';
import { inp } from './EmployeeFormModal';

export type Opt = { value: string; label: string; sub?: string };

const useOutside = (ref: React.RefObject<HTMLElement | null>, onClose: () => void, extra?: React.RefObject<HTMLElement | null>) => {
  useEffect(() => {
    const h = (e: MouseEvent) => { const t = e.target as Node; if (ref.current && !ref.current.contains(t) && !(extra?.current && extra.current.contains(t))) onClose(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [ref, onClose]);
};

/** 📌 قائمة منبثقة عبر Portal بموضع ثابت — لا تُحجب خلف البطاقات/الجداول أبداً */
const DropMenu: React.FC<{ anchor: React.RefObject<HTMLElement | null>; menuRef: React.RefObject<HTMLDivElement | null>; children: React.ReactNode; testID?: string; maxHeight?: number }> = ({ anchor, menuRef, children, testID, maxHeight = 300 }) => {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.current?.getBoundingClientRect(); if (!r) return;
      const below = window.innerHeight - r.bottom; const openUp = below < 220 && r.top > below;
      setPos({ top: openUp ? Math.max(8, r.top - Math.min(maxHeight, r.top - 8) - 4) : r.bottom + 4, left: r.left, width: r.width });
    };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor, maxHeight]);
  if (!pos) return null;
  return createPortal(
    <div ref={menuRef} data-testid={testID} style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 5000, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', overflow: 'hidden', direction: 'rtl', maxHeight, display: 'flex', flexDirection: 'column' }}>{children}</div>,
    document.body,
  );
};

const norm = (s: string) => (s || '').toString().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
export const matches = (q: string, ...fields: (string | undefined)[]) => { const n = norm(q).trim(); return !n || fields.some((f) => norm(f || '').includes(n)); };

/** 🔽 قائمة منسدلة موحّدة (فردية) — تفتح بالنقر، بحث داخلي عند طول القائمة، إغلاق بالنقر خارجها/Esc */
export const HrSelect: React.FC<{ value: string; onChange: (v: string) => void; options: Opt[]; placeholder?: string; searchable?: boolean; disabled?: boolean; testID?: string; style?: React.CSSProperties; allowClear?: boolean }> =
  ({ value, onChange, options, placeholder = '— اختر —', searchable, disabled, testID, style, allowClear = true }) => {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    useOutside(ref, () => setOpen(false), menuRef);
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
          <DropMenu anchor={ref} menuRef={menuRef} testID={testID ? `${testID}-menu` : undefined}>
            {canSearch && <div style={{ padding: 6, borderBottom: '1px solid #f1f5f9' }}><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث…" style={{ ...inp, padding: '6px 8px' }} data-testid={testID ? `${testID}-search` : undefined} /></div>}
            <div style={{ overflowY: 'auto', flex: 1 }}>
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
          </DropMenu>
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
  const menuRef = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false), menuRef);
  const byId = useMemo(() => Object.fromEntries((emps || []).map((e) => [e.id, e])), [emps]);
  const list = useMemo(() => (emps || []).filter((e) => !value.includes(e.id) && matches(q, e.full_name, e.employee_no, e.job_title)).slice(0, 60), [emps, q, value]);
  return (
    <div ref={ref} style={{ direction: 'rtl', position: 'relative' }} data-testid={testID}>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={placeholder} style={inp} data-testid={testID ? `${testID}-search` : undefined} />
      {open && (
        <DropMenu anchor={ref} menuRef={menuRef} testID={testID ? `${testID}-menu` : undefined} maxHeight={240}><div style={{ overflowY: 'auto' }}>
          {list.map((e) => <div key={e.id} onClick={() => { onChange([...value, e.id]); setQ(''); setOpen(false); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', fontSize: 13 }} data-testid={testID ? `${testID}-opt-${e.id}` : undefined}><b>{e.full_name}</b> <span style={{ color: '#94a3b8', fontSize: 11 }}>{e.employee_no}{e.job_title ? ` · ${e.job_title}` : ''}</span></div>)}
          {list.length === 0 && <div style={{ padding: 12, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>لا نتائج</div>}
        </div></DropMenu>
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

/** 📥 تصدير الصفوف المعروضة (بعد التصفية والفرز) إلى Excel */
export const exportRowsXlsx = async (rows: Record<string, any>[], fileName: string, sheet = 'البيانات') => {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  if (!ws['!views']) ws['!views'] = [{ rightToLeft: true } as any];
  const keys = rows.length ? Object.keys(rows[0]) : [];
  ws['!cols'] = keys.map((k) => ({ wch: Math.min(40, Math.max(k.length + 2, ...rows.map((r) => String(r[k] ?? '').length + 2))) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};
export const ExportXlsxBtn: React.FC<{ rows: () => Record<string, any>[]; fileName: string; testID?: string; disabled?: boolean }> = ({ rows, fileName, testID, disabled }) => (
  <button type="button" disabled={disabled} onClick={() => { const r = rows(); if (!r.length) { window.alert('لا توجد صفوف للتصدير'); return; } exportRowsXlsx(r, `${fileName}-${new Date().toISOString().slice(0, 10)}`); }}
    style={{ border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12.5, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer', backgroundColor: '#e8f5e9', color: '#2e7d32', opacity: disabled ? 0.6 : 1 }} data-testid={testID || 'export-xlsx-btn'} title="تصدير الصفوف المعروضة كما هي (بعد التصفية والفرز)">📥 تصدير المعروض Excel</button>
);

/** 🧰 أدوات القوائم: بحث + ترقيم صفحات + تحديد صفوف — تعمل على الصفوف المعروضة في العميل */
export const useListTools = <T,>(rows: T[], keyOf: (r: T) => string, fields: (r: T) => (string | undefined | null)[], defaultPerPage = 25) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(defaultPerPage);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const filtered = useMemo(() => rows.filter((r) => matches(search, ...(fields(r).map((f) => f ?? '')))), [rows, search, fields]);
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const pageRows = useMemo(() => filtered.slice((safePage - 1) * perPage, safePage * perPage), [filtered, safePage, perPage]);
  useEffect(() => { setPage(1); }, [search, perPage, rows]);
  const selected = filtered.filter((r) => sel[keyOf(r)]);
  const toggle = (r: T) => setSel((p) => ({ ...p, [keyOf(r)]: !p[keyOf(r)] }));
  const allPage = pageRows.length > 0 && pageRows.every((r) => sel[keyOf(r)]);
  const togglePage = () => setSel((p) => { const n = { ...p }; pageRows.forEach((r) => { if (allPage) delete n[keyOf(r)]; else n[keyOf(r)] = true; }); return n; });
  const clearSel = () => setSel({});
  return { search, setSearch, page: safePage, setPage, perPage, setPerPage, pages, filtered, pageRows, sel, selected, toggle, allPage, togglePage, clearSel, isSel: (r: T) => !!sel[keyOf(r)] };
};

export const ListToolbar: React.FC<{ t: ReturnType<typeof useListTools<any>>; total: number; placeholder?: string; testID: string; exportRows?: (rows: any[]) => Record<string, any>[]; fileName?: string; extra?: React.ReactNode }> = ({ t, total, placeholder = 'بحث بالاسم أو الرقم…', testID, exportRows, fileName = 'تقرير', extra }) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', direction: 'rtl', marginTop: 10 }} data-testid={`${testID}-toolbar`}>
    <input value={t.search} onChange={(e) => t.setSearch(e.target.value)} placeholder={placeholder} style={{ ...inp, width: 260 }} data-testid={`${testID}-search`} />
    <HrSelect value={String(t.perPage)} onChange={(v) => t.setPerPage(Number(v) || 25)} options={[10, 25, 50, 100, 200].map((n) => ({ value: String(n), label: `${n} / صفحة` }))} allowClear={false} style={{ width: 120 }} testID={`${testID}-perpage`} />
    <Pager page={t.page} pages={t.pages} onChange={t.setPage} testID={testID} />
    <span style={{ fontSize: 12, color: '#64748b' }} data-testid={`${testID}-count`}>المعروض {t.filtered.length} من {total}{t.selected.length ? ` · المحدد ${t.selected.length}` : ''}</span>
    <span style={{ flex: 1 }} />
    {extra}
    {exportRows && <ExportXlsxBtn fileName={fileName} testID={`${testID}-export-shown`} rows={() => exportRows(t.filtered)} />}
    {exportRows && t.selected.length > 0 && <button type="button" onClick={() => exportRowsXlsx(exportRows(t.selected), `${fileName}-المحدد-${new Date().toISOString().slice(0, 10)}`)} style={{ border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', backgroundColor: '#fff3e0', color: '#e65100' }} data-testid={`${testID}-export-selected`}>📥 تصدير المحدد ({t.selected.length})</button>}
    {t.selected.length > 0 && <button type="button" onClick={t.clearSel} style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 12 }} data-testid={`${testID}-clear-sel`}>إلغاء التحديد</button>}
  </div>
);

export const Pager: React.FC<{ page: number; pages: number; onChange: (p: number) => void; testID: string }> = ({ page, pages, onChange, testID }) => {
  const [jump, setJump] = useState('');
  const b = (label: string, p: number, dis: boolean, id: string) => <button type="button" disabled={dis} onClick={() => onChange(p)} style={{ border: '1px solid #e2e8f0', background: dis ? '#f8fafc' : '#fff', borderRadius: 8, padding: '5px 9px', cursor: dis ? 'default' : 'pointer', fontSize: 12, color: dis ? '#cbd5e1' : '#0f2440' }} data-testid={`${testID}-${id}`}>{label}</button>;
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', direction: 'rtl' }} data-testid={`${testID}-pager`}>
      {b('⏮', 1, page <= 1, 'first')}{b('السابق', page - 1, page <= 1, 'prev')}
      <span style={{ fontSize: 12, color: '#475569', padding: '0 6px' }}>صفحة <b data-testid={`${testID}-page`}>{page}</b> من {pages}</span>
      {b('التالي', page + 1, page >= pages, 'next')}{b('⏭', pages, page >= pages, 'last')}
      <input value={jump} onChange={(e) => setJump(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter' && jump) { onChange(Math.min(pages, Math.max(1, Number(jump)))); setJump(''); } }} placeholder="رقم" style={{ ...inp, width: 60, padding: '5px 6px', textAlign: 'center' }} data-testid={`${testID}-jump`} title="اكتب رقم الصفحة واضغط Enter" />
    </div>
  );
};

export const SelBox: React.FC<{ checked: boolean; onChange: () => void; testID?: string }> = ({ checked, onChange, testID }) => <input type="checkbox" checked={checked} onChange={onChange} onClick={(e) => e.stopPropagation()} style={{ width: 16, height: 16, cursor: 'pointer' }} data-testid={testID} />;

export const GEO_STATUS_COLOR: Record<string, string> = { in_range: '#16a34a', out_of_range: '#dc2626', no_location: '#f97316', exempt: '#7c3aed', not_required: '#94a3b8', auto: '#7c3aed' };
export const geoText = (g: any) => !g || (!g.status && !g.location_name) ? '' : `${g.location_name || g.status_label || ''}${g.distance_m != null ? ` · ${g.distance_m} م` : ''}`;
export const GeoCell: React.FC<{ g: any; testID?: string }> = ({ g, testID }) => {
  if (!g || (!g.status && !g.location_name)) return <span style={{ color: '#cbd5e1' }}>—</span>;
  const coords = g.latitude != null && g.longitude != null ? `${Number(g.latitude).toFixed(5)}, ${Number(g.longitude).toFixed(5)}` : '';
  return (
    <div style={{ fontSize: 11.5, lineHeight: 1.5 }} data-testid={testID}>
      <div style={{ fontWeight: 800, color: GEO_STATUS_COLOR[g.status] || '#64748b' }}>📍 {g.status_label || g.location_name}</div>
      {g.location_name && g.status !== 'auto' ? <div style={{ color: '#0f172a' }}>{g.location_name}{g.distance_m != null ? <span style={{ color: g.in_range === false ? '#dc2626' : '#16a34a', fontWeight: 700 }}> · يبعد {g.distance_m} م</span> : null}</div> : null}
      {coords ? <a href={`https://www.google.com/maps?q=${g.latitude},${g.longitude}`} target="_blank" rel="noreferrer" style={{ color: '#1565c0', direction: 'ltr', display: 'inline-block', fontSize: 10.5 }}>{coords} ↗</a> : null}
    </div>
  );
};
