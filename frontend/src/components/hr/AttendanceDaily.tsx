import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text } from 'react-native';
import { hrAPI } from '../../services/api';
import { reportPage, ReportEmpty } from '../reports/ReportShell';
import { Badge, Th, td, table, inp, btn, alertErr, ATT_COLOR } from './ui';
import { HrSelect, useListTools, ListToolbar, SelBox, GeoCell, geoText, WarnBadges } from './HrSelect';

const today = () => new Date().toISOString().slice(0, 10);

export const AttendanceDaily: React.FC<{ canManage: boolean; units: any[]; meta: any }> = ({ canManage, units, meta }) => {
  const [date, setDate] = useState(today());
  const [unit, setUnit] = useState('');
  const [d, setD] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [statusF, setStatusF] = useState('');

  const load = useCallback(async () => { try { setD((await hrAPI.attDaily({ date, org_unit_id: unit || undefined })).data); setEdits({}); } catch (e) { alertErr(e); } }, [date, unit]);
  useEffect(() => { load(); }, [load]);

  const edit = (id: string, k: string, v: any) => setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));
  const rk = (r: any) => r.row_key || r.employee_id;
  const rowVal = (r: any, k: string) => edits[rk(r)]?.[k] ?? r[k] ?? '';
  const save = async () => {
    const entries = Object.entries(edits).map(([key, e]) => { const base = d.rows.find((r: any) => rk(r) === key) || {}; return { employee_id: base.employee_id, shift_id: base.shift_id, status: e.status ?? base.status, check_in: e.check_in ?? base.check_in ?? null, check_out: e.check_out ?? base.check_out ?? null, note: e.note ?? base.note ?? '' }; }).filter((e) => e.employee_id && e.status && meta?.manual?.includes(e.status));
    if (!entries.length) { window.alert('لا توجد تعديلات'); return; }
    setBusy(true);
    try { const r = await hrAPI.attMark(date, entries); window.alert(r.data.message); load(); } catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  const markAll = async () => { if (!window.confirm('تحديد كل من لم يُسجَّل حاضراً في وقت الدوام الرسمي؟')) return; setBusy(true); try { const r = await hrAPI.attMarkAll(date, unit || undefined); window.alert(r.data.message); load(); } catch (e) { alertErr(e); } finally { setBusy(false); } };
  const del = async (r: any) => { if (!window.confirm(`حذف سجل ${r.employee_name}${r.shift_name ? ` (${r.shift_name})` : ''} لهذا اليوم؟`)) return; try { await hrAPI.attDelete(r.employee_id, date, r.shift_id); load(); } catch (e) { alertErr(e); } };
  const multi = (d?.settings?.shifts?.length || 0) > 1;

  const s = d?.summary || {};
  const dirty = Object.keys(edits).length;
  const SRC: Record<string, string> = { self: 'ذاتي', manual: 'يدوي', bulk: 'جماعي' };
  const statusRows = useMemo(() => (d?.rows || []).filter((r: any) => !statusF || (statusF === 'unmarked' ? !rowVal(r, 'status') : rowVal(r, 'status') === statusF)), [d, statusF, edits]);
  const fields = useCallback((r: any) => [r.employee_name, r.employee_no, r.job_title, r.org_unit_name], []);
  const lt = useListTools<any>(statusRows, rk, fields, 25);
  const exportRows = (rows: any[]) => rows.map((r: any) => ({ 'الموظف': r.employee_name, 'الرقم الوظيفي': r.employee_no, 'المسمى': r.job_title || '', 'الوحدة': r.org_unit_name || '', 'التاريخ': date, 'الفترة': r.shift_name || '', 'الحالة': rowVal(r, 'status') ? (meta?.statuses?.[rowVal(r, 'status')] || r.status_label) : 'لم يُسجَّل', 'حضور': rowVal(r, 'check_in') || '', 'انصراف': rowVal(r, 'check_out') || '', 'دقائق التأخير': r.late_minutes || 0, 'انصراف تلقائي': r.auto_checkout ? 'نعم' : '', 'تحذيرات': (r.warnings || []).join(' | '), 'موقع الحضور': geoText(r.check_in_geo), 'إحداثيات الحضور': r.check_in_geo?.latitude != null ? `${r.check_in_geo.latitude}, ${r.check_in_geo.longitude}` : '', 'موقع الانصراف': geoText(r.check_out_geo), 'المصدر': SRC[r.source] || '', 'ملاحظة': rowVal(r, 'note') || '' }));
  return (<>
    <View style={reportPage.card}>
      <div style={{ display: 'flex', gap: 8, direction: 'rtl', alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} style={{ ...inp, width: 160, direction: 'ltr' }} data-testid="att-daily-date" />
        <HrSelect value={unit} onChange={setUnit} options={units.map((u) => ({ value: u.id, label: u.name }))} placeholder="كل الوحدات" searchable style={{ width: 220 }} testID="att-daily-unit" />
        {d && <span style={{ fontSize: 12.5, color: '#475569' }}>{d.day_name}{!d.is_work_day ? ` · ${d.holiday || 'عطلة أسبوعية'}` : multi ? ` · ${d.settings.shifts.length} فترات دوام` : ` · الدوام ${d.settings.work_start}–${d.settings.work_end}`}</span>}
        <span style={{ flex: 1 }} />
        {canManage && d?.is_work_day && <button onClick={markAll} disabled={busy} style={btn('#e8f5e9', '#2e7d32')} data-testid="att-mark-all-btn">✅ تحديد الكل حاضر</button>}
        {canManage && <button onClick={save} disabled={busy || !dirty} style={btn(dirty ? '#1565c0' : '#cbd5e1')} data-testid="att-save-btn">{busy ? '...' : `حفظ التعديلات${dirty ? ` (${dirty})` : ''}`}</button>}
      </div>
      {d && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, direction: 'rtl', flexWrap: 'wrap' }} data-testid="att-daily-summary">
          {[...Object.entries(meta?.statuses || {}), ['unmarked', 'لم يُسجَّل']].map(([k, v]: any) => (
            <button key={k} type="button" onClick={() => setStatusF((p) => (p === k ? '' : k))} data-testid={`att-sum-${k}`}
              style={{ border: statusF === k ? `2px solid ${ATT_COLOR[k] || '#64748b'}` : '2px solid transparent', borderRadius: 14, padding: 0, background: 'transparent', cursor: 'pointer', opacity: statusF && statusF !== k ? 0.5 : 1 }}>
              <Badge color={ATT_COLOR[k] || '#64748b'}>{statusF === k ? '🔽 ' : ''}{v}: {s[k] || 0}</Badge>
            </button>))}
          {statusF && <span style={{ fontSize: 11.5, color: '#64748b', alignSelf: 'center' }}>يُعرض: {statusF === 'unmarked' ? 'لم يُسجَّل' : meta?.statuses?.[statusF]} — اضغط الشارة مجدداً للإلغاء</span>}
        </div>
      )}
      {d && <ListToolbar t={lt} total={d.rows.length} testID="att-daily" fileName={`الكشف-اليومي-${date}`} exportRows={exportRows} />}
    </View>
    {!d ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text> : d.rows.length === 0 ? <ReportEmpty text="لا يوجد موظفون" icon="people-outline" /> : (
      <View style={[reportPage.card, { padding: 0, overflow: 'hidden' }]}>
        <table style={table} data-testid="att-daily-table">
          <thead><tr style={{ backgroundColor: '#0f2440', color: '#fff' }}><th style={{ padding: '10px 8px' }}><SelBox checked={lt.allPage} onChange={lt.togglePage} testID="att-daily-sel-all" /></th>{['الموظف', 'الوحدة', ...(multi ? ['الفترة'] : []), 'الحالة', 'حضور', 'انصراف', 'تأخير', 'الموقع', 'ملاحظة', ''].map((c, i) => <th key={i} style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{c}</th>)}</tr></thead>
          <tbody>
            {lt.pageRows.map((r: any) => {
              const locked = !canManage;
              const st = rowVal(r, 'status');
              const id = rk(r);
              return (
                <tr key={id} style={{ borderBottom: '1px solid #eef2f7', backgroundColor: edits[id] ? '#fffbeb' : lt.isSel(r) ? '#eef4ff' : undefined }} data-testid={`att-row-${id}`}>
                  <td style={td}><SelBox checked={lt.isSel(r)} onChange={() => lt.toggle(r)} testID={`att-sel-${id}`} /></td>
                  <td style={{ ...td, fontWeight: 700, color: '#0f2440' }}>{r.employee_name}<div style={{ fontSize: 10.5, color: '#94a3b8' }}>{r.employee_no}{r.job_title ? ` · ${r.job_title}` : ''}</div></td>
                  <td style={td}>{r.org_unit_name || '—'}</td>
                  {multi && <td style={td}><Badge color="#0f2440" testID={`att-shift-${id}`}>{r.shift_name || '—'}</Badge><div style={{ fontSize: 10, color: '#94a3b8', direction: 'ltr', textAlign: 'right' }}>{r.shift_start}–{r.shift_end}</div></td>}
                  <td style={td}>
                    {r.status === 'leave' && !r.recorded ? <Badge color={ATT_COLOR.leave}>إجازة{r.note ? ` (${r.note})` : ''}</Badge>
                      : locked ? <Badge color={ATT_COLOR[st] || '#64748b'}>{r.status_label}</Badge>
                      : <select value={st || ''} onChange={(e) => edit(id, 'status', e.target.value)} style={{ ...inp, padding: '5px 8px', color: ATT_COLOR[st] || '#0f2440', fontWeight: 700 }} data-testid={`att-status-${id}`}>
                          <option value="">— لم يُسجَّل —</option>
                          {(meta?.manual || []).map((k: string) => <option key={k} value={k}>{meta.statuses[k]}</option>)}
                        </select>}
                  </td>
                  <td style={td}>{canManage && st && ['present', 'late', 'half_day', 'mission'].includes(st) ? <input type="time" value={rowVal(r, 'check_in')} onChange={(e) => edit(id, 'check_in', e.target.value)} style={{ ...inp, width: 105, padding: '5px 6px', direction: 'ltr' }} data-testid={`att-in-${id}`} /> : (r.check_in || '—')}</td>
                  <td style={td}>{canManage && st && ['present', 'late', 'half_day', 'mission'].includes(st) ? <input type="time" value={rowVal(r, 'check_out')} onChange={(e) => edit(id, 'check_out', e.target.value)} style={{ ...inp, width: 105, padding: '5px 6px', direction: 'ltr' }} data-testid={`att-out-${id}`} /> : (r.check_out || '—')}{r.auto_checkout ? <div><Badge color="#7c3aed" testID={`att-auto-out-${id}`}>🤖 تلقائي</Badge></div> : null}<WarnBadges warnings={r.warnings} testID={`att-warn-${id}`} /></td>
                  <td style={{ ...td, color: r.late_minutes ? '#f97316' : '#94a3b8', fontWeight: 700 }}>{r.late_minutes ? `${r.late_minutes} د` : '—'}</td>
                  <td style={{ ...td, minWidth: 150 }}><GeoCell g={r.check_in_geo} testID={`att-geo-${id}`} />{r.check_out_geo && r.check_out_geo.status && r.check_out_geo.status !== 'auto' ? <div style={{ marginTop: 4, borderTop: '1px dashed #e2e8f0', paddingTop: 3 }}><span style={{ fontSize: 10, color: '#94a3b8' }}>انصراف: </span><GeoCell g={r.check_out_geo} /></div> : null}</td>
                  <td style={td}>{canManage && r.status !== 'holiday' ? <input value={rowVal(r, 'note')} onChange={(e) => edit(id, 'note', e.target.value)} placeholder="…" style={{ ...inp, padding: '5px 8px', minWidth: 120 }} /> : (r.note || '—')}</td>
                  <td style={td}>{r.recorded && <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{{ self: 'ذاتي', manual: 'يدوي', bulk: 'جماعي' }[r.source as string] || ''}</span>}{canManage && r.recorded && <button onClick={() => del(r)} title="حذف السجل" style={btn('transparent', '#c62828', { padding: '2px 6px' })} data-testid={`att-del-${id}`}>🗑</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </View>
    )}
  </>);
};
