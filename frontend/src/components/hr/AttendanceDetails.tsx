import React, { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { hrAPI } from '../../services/api';
import { reportPage, ReportEmpty } from '../reports/ReportShell';
import { Badge, td, table, inp, btn, alertErr, ATT_COLOR } from './ui';
import { HrSelect, EmployeeMultiSelect, Pager, SelBox, GeoCell, geoText, exportRowsXlsx, SortTh, useSort, toggleSort, Sort } from './HrSelect';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + '01';
const SRC: Record<string, string> = { self: 'ذاتي', manual: 'يدوي', bulk: 'جماعي' };
const toRow = (r: any) => ({ 'التاريخ': r.date, 'الموظف': r.employee_name, 'الرقم الوظيفي': r.employee_no, 'الوحدة': r.org_unit_name || '', 'الفترة': r.shift_name || '', 'الحالة': r.status_label, 'حضور': r.check_in || '', 'انصراف': r.check_out || '', 'دقائق التأخير': r.late_minutes || 0, 'انصراف تلقائي': r.auto_checkout ? 'نعم' : '', 'موقع الحضور': geoText(r.check_in_geo), 'داخل النطاق': r.check_in_geo?.in_range == null ? '' : r.check_in_geo.in_range ? 'نعم' : 'لا', 'إحداثيات الحضور': r.check_in_geo?.latitude != null ? `${r.check_in_geo.latitude}, ${r.check_in_geo.longitude}` : '', 'موقع الانصراف': geoText(r.check_out_geo), 'المصدر': SRC[r.source] || '', 'ملاحظة': r.note || '' });
const SORTERS: Record<string, (r: any) => any> = { date: (r) => `${r.date} ${r.check_in || ''}`, name: (r) => r.employee_name, unit: (r) => r.org_unit_name || '', status: (r) => r.status_label, check_in: (r) => r.check_in || '', check_out: (r) => r.check_out || '', late: (r) => r.late_minutes || 0, geo: (r) => r.check_in_geo?.distance_m ?? -1 };

/** 📋 التقرير التفصيلي: سجلات فردية/مشتركة لفترة مع التأخير والانصراف التلقائي والموقع — بحث، ترقيم، تحديد، تصدير */
export const AttendanceDetails: React.FC<{ units: any[]; meta: any }> = ({ units, meta }) => {
  const [f, setF] = useState<any>({ date_from: monthStart(), date_to: today(), org_unit_id: '', status: '', employee_ids: [] as string[], late_only: false, auto_only: false, out_of_range_only: false, search: '' });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [d, setD] = useState<any>(null);
  const [emps, setEmps] = useState<any[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<Sort>(null);
  const set = (k: string, v: any) => { setF((p: any) => ({ ...p, [k]: v })); setPage(1); };
  const params = () => ({ date_from: f.date_from, date_to: f.date_to, org_unit_id: f.org_unit_id || undefined, status: f.status || undefined, employee_ids: f.employee_ids.length ? f.employee_ids.join(',') : undefined, late_only: f.late_only || undefined, auto_only: f.auto_only || undefined, out_of_range_only: f.out_of_range_only || undefined, search: f.search || undefined });

  useEffect(() => { hrAPI.employees({ per_page: 500 }).then((r) => setEmps(r.data.employees || [])).catch(() => {}); }, []);
  const load = useCallback(async () => { try { setD((await hrAPI.attDetails({ ...params(), page, per_page: perPage })).data); } catch (e) { alertErr(e); } }, [f, page, perPage]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const rows = useSort<any>(d?.items || [], sort, SORTERS);
  const selected = rows.filter((r) => sel[r.id]);
  const allPage = rows.length > 0 && rows.every((r) => sel[r.id]);
  const togglePage = () => setSel((p) => { const n = { ...p }; rows.forEach((r) => { if (allPage) delete n[r.id]; else n[r.id] = true; }); return n; });
  const dl = async (p: any, name: string) => { setBusy(true); try { const res = await hrAPI.attDetailsExport(p); const url = URL.createObjectURL(res.data); const a = document.createElement('a'); a.href = url; a.download = `${name}.xlsx`; a.click(); URL.revokeObjectURL(url); } catch (e) { alertErr(e); } finally { setBusy(false); } };
  const pages = d ? Math.max(1, Math.ceil(d.total / perPage)) : 1;
  const sm = d?.summary || {};
  const Toggle = ({ k, label, color }: { k: string; label: string; color: string }) => (
    <button type="button" onClick={() => set(k, !f[k])} data-testid={`att-det-${k}`} style={btn(f[k] ? color : '#f1f5f9', f[k] ? '#fff' : '#475569', { fontSize: 12 })}>{f[k] ? '✓ ' : ''}{label}</button>
  );

  return (<>
    <View style={reportPage.card}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, direction: 'rtl' }}>
        <div><div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 3 }}>من</div><input type="date" value={f.date_from} max={f.date_to} onChange={(e) => set('date_from', e.target.value)} style={{ ...inp, direction: 'ltr' }} data-testid="att-det-from" /></div>
        <div><div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 3 }}>إلى</div><input type="date" value={f.date_to} min={f.date_from} max={today()} onChange={(e) => set('date_to', e.target.value)} style={{ ...inp, direction: 'ltr' }} data-testid="att-det-to" /></div>
        <div><div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 3 }}>الوحدة</div><HrSelect value={f.org_unit_id} onChange={(v) => set('org_unit_id', v)} options={units.map((u) => ({ value: u.id, label: u.name }))} placeholder="كل الوحدات" searchable testID="att-det-unit" /></div>
        <div><div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 3 }}>الحالة</div><HrSelect value={f.status} onChange={(v) => set('status', v)} options={Object.entries(meta?.statuses || {}).map(([value, label]: any) => ({ value, label }))} placeholder="كل الحالات" testID="att-det-status" /></div>
        <div style={{ gridColumn: 'span 2' }}><div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 3 }}>موظفون محددون (فردي أو مشترك)</div><EmployeeMultiSelect value={f.employee_ids} onChange={(v) => set('employee_ids', v)} emps={emps} testID="att-det-emp" /></div>
        <div style={{ gridColumn: 'span 2' }}><div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 3 }}>بحث بالاسم أو الرقم</div><input value={f.search} onChange={(e) => set('search', e.target.value)} placeholder="اسم الموظف أو رقمه الوظيفي…" style={inp} data-testid="att-det-search" /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, direction: 'rtl', flexWrap: 'wrap', alignItems: 'center' }}>
        <Toggle k="late_only" label="⏰ المتأخرون فقط" color="#f97316" /><Toggle k="auto_only" label="🤖 الانصراف التلقائي فقط" color="#7c3aed" /><Toggle k="out_of_range_only" label="📍 خارج النطاق فقط" color="#dc2626" />
        <span style={{ flex: 1 }} />
        <button onClick={() => dl({ ...params() }, `الحضور-التفصيلي-${f.date_from}_${f.date_to}`)} disabled={busy || !d?.total} style={btn('#1b5e20')} data-testid="att-det-export-all">📥 تصدير كل النتائج ({d?.total || 0})</button>
        {selected.length > 0 && <button onClick={() => dl({ record_ids: selected.map((r) => r.id).join(','), date_from: f.date_from, date_to: f.date_to }, `الحضور-المحدد-${today()}`)} disabled={busy} style={btn('#fff3e0', '#e65100')} data-testid="att-det-export-selected">📥 تصدير المحدد ({selected.length})</button>}
        <button onClick={() => { if (!rows.length) return; exportRowsXlsx(rows.map(toRow), `الحضور-الصفحة-${page}`); }} disabled={!rows.length} style={btn('#e8f5e9', '#2e7d32')} data-testid="att-det-export-page">📥 تصدير المعروض</button>
      </div>
      {d && <div style={{ display: 'flex', gap: 6, marginTop: 10, direction: 'rtl', flexWrap: 'wrap' }} data-testid="att-det-summary">
        <Badge color="#0f2440">السجلات: {sm.records || 0}</Badge><Badge color="#1565c0">الموظفون: {sm.employees || 0}</Badge><Badge color={ATT_COLOR.late}>تأخير: {sm.late || 0} ({sm.late_minutes || 0} د)</Badge><Badge color="#7c3aed">انصراف تلقائي: {sm.auto || 0}</Badge><Badge color="#dc2626">خارج النطاق: {sm.out_of_range || 0}</Badge>
      </div>}
      {d && <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, direction: 'rtl', flexWrap: 'wrap' }}>
        <HrSelect value={String(perPage)} onChange={(v) => { setPerPage(Number(v) || 50); setPage(1); }} options={[25, 50, 100, 200, 500].map((n) => ({ value: String(n), label: `${n} / صفحة` }))} allowClear={false} style={{ width: 120 }} testID="att-det-perpage" />
        <Pager page={page} pages={pages} onChange={setPage} testID="att-det" />
        <span style={{ fontSize: 12, color: '#64748b' }}>الإجمالي {d.total}{selected.length ? ` · المحدد ${selected.length}` : ''}</span>
        {Object.keys(sel).length > 0 && <button type="button" onClick={() => setSel({})} style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 12 }}>إلغاء التحديد</button>}
      </div>}
    </View>
    {!d ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text> : rows.length === 0 ? <ReportEmpty text="لا توجد سجلات مطابقة" icon="document-text-outline" /> : (
      <View style={[reportPage.card, { padding: 0, overflow: 'hidden' }]}>
        <table style={table} data-testid="att-det-table">
          <thead><tr style={{ backgroundColor: '#0f2440', color: '#fff' }}><th style={{ padding: '10px 8px' }}><SelBox checked={allPage} onChange={togglePage} testID="att-det-sel-all" /></th>
            {[{ label: 'التاريخ', key: 'date' }, { label: 'الموظف', key: 'name' }, { label: 'الوحدة', key: 'unit' }, { label: 'الحالة', key: 'status' }, { label: 'حضور', key: 'check_in' }, { label: 'انصراف', key: 'check_out' }, { label: 'تأخير', key: 'late' }, { label: 'الموقع / المسافة', key: 'geo' }, { label: 'ملاحظة' }].map((c, i) => (
              <th key={i} onClick={() => c.key && setSort((p) => toggleSort(p, c.key!))} data-testid={c.key ? `att-det-sort-${c.key}` : undefined} style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', cursor: c.key ? 'pointer' : 'default' }}>{c.label}{c.key ? <span style={{ marginRight: 4, fontSize: 10, opacity: sort?.key === c.key ? 1 : 0.35 }}>{sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}</span> : null}</th>))}
          </tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #eef2f7', backgroundColor: sel[r.id] ? '#eef4ff' : undefined }} data-testid={`att-det-row-${r.id}`}>
                <td style={td}><SelBox checked={!!sel[r.id]} onChange={() => setSel((p) => ({ ...p, [r.id]: !p[r.id] }))} testID={`att-det-sel-${r.id}`} /></td>
                <td style={{ ...td, direction: 'ltr', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.date}{r.shift_name ? <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.shift_name}</div> : null}</td>
                <td style={{ ...td, fontWeight: 700, color: '#0f2440' }}>{r.employee_name}<div style={{ fontSize: 10.5, color: '#94a3b8' }}>{r.employee_no}{r.job_title ? ` · ${r.job_title}` : ''}</div></td>
                <td style={td}>{r.org_unit_name || '—'}</td>
                <td style={td}><Badge color={ATT_COLOR[r.status] || '#64748b'}>{r.status_label}</Badge></td>
                <td style={td}>{r.check_in || '—'}</td>
                <td style={td}>{r.check_out || '—'}{r.auto_checkout ? <div><Badge color="#7c3aed">🤖 تلقائي{r.auto_checkout_at ? ` ${r.auto_checkout_at.slice(11)}` : ''}</Badge></div> : null}</td>
                <td style={{ ...td, color: r.late_minutes ? '#f97316' : '#94a3b8', fontWeight: 800 }}>{r.late_minutes ? `${r.late_minutes} د` : '—'}</td>
                <td style={{ ...td, minWidth: 170 }}><GeoCell g={r.check_in_geo} />{r.check_out_geo?.status && r.check_out_geo.status !== 'auto' ? <div style={{ marginTop: 4, borderTop: '1px dashed #e2e8f0', paddingTop: 3 }}><span style={{ fontSize: 10, color: '#94a3b8' }}>انصراف: </span><GeoCell g={r.check_out_geo} /></div> : null}</td>
                <td style={{ ...td, fontSize: 11.5, maxWidth: 260 }}>{r.note || '—'}<div style={{ fontSize: 10, color: '#94a3b8' }}>{SRC[r.source] || ''}{r.by_name ? ` · ${r.by_name}` : ''}</div></td>
              </tr>))}
          </tbody>
        </table>
      </View>
    )}
  </>);
};
