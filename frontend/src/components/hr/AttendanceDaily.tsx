import React, { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { hrAPI } from '../../services/api';
import { reportPage, ReportEmpty } from '../reports/ReportShell';
import { Badge, Th, td, table, inp, btn, alertErr, ATT_COLOR } from './ui';

const today = () => new Date().toISOString().slice(0, 10);

export const AttendanceDaily: React.FC<{ canManage: boolean; units: any[]; meta: any }> = ({ canManage, units, meta }) => {
  const [date, setDate] = useState(today());
  const [unit, setUnit] = useState('');
  const [d, setD] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { try { setD((await hrAPI.attDaily({ date, org_unit_id: unit || undefined })).data); setEdits({}); } catch (e) { alertErr(e); } }, [date, unit]);
  useEffect(() => { load(); }, [load]);

  const edit = (id: string, k: string, v: any) => setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));
  const rowVal = (r: any, k: string) => edits[r.employee_id]?.[k] ?? r[k] ?? '';
  const save = async () => {
    const entries = Object.entries(edits).map(([employee_id, e]) => { const base = d.rows.find((r: any) => r.employee_id === employee_id) || {}; return { employee_id, status: e.status ?? base.status, check_in: e.check_in ?? base.check_in ?? null, check_out: e.check_out ?? base.check_out ?? null, note: e.note ?? base.note ?? '' }; }).filter((e) => e.status && meta?.manual?.includes(e.status));
    if (!entries.length) { window.alert('لا توجد تعديلات'); return; }
    setBusy(true);
    try { const r = await hrAPI.attMark(date, entries); window.alert(r.data.message); load(); } catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  const markAll = async () => { if (!window.confirm('تحديد كل من لم يُسجَّل حاضراً في وقت الدوام الرسمي؟')) return; setBusy(true); try { const r = await hrAPI.attMarkAll(date, unit || undefined); window.alert(r.data.message); load(); } catch (e) { alertErr(e); } finally { setBusy(false); } };
  const del = async (r: any) => { if (!window.confirm(`حذف سجل ${r.employee_name} لهذا اليوم؟`)) return; try { await hrAPI.attDelete(r.employee_id, date); load(); } catch (e) { alertErr(e); } };

  const s = d?.summary || {};
  const dirty = Object.keys(edits).length;
  return (<>
    <View style={reportPage.card}>
      <div style={{ display: 'flex', gap: 8, direction: 'rtl', alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} style={{ ...inp, width: 160, direction: 'ltr' }} data-testid="att-daily-date" />
        <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ ...inp, width: 220 }} data-testid="att-daily-unit"><option value="">كل الوحدات</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        {d && <span style={{ fontSize: 12.5, color: '#475569' }}>{d.day_name}{!d.is_work_day ? ` · ${d.holiday || 'عطلة أسبوعية'}` : ` · الدوام ${d.settings.work_start}–${d.settings.work_end}`}</span>}
        <span style={{ flex: 1 }} />
        {canManage && d?.is_work_day && <button onClick={markAll} disabled={busy} style={btn('#e8f5e9', '#2e7d32')} data-testid="att-mark-all-btn">✅ تحديد الكل حاضر</button>}
        {canManage && <button onClick={save} disabled={busy || !dirty} style={btn(dirty ? '#1565c0' : '#cbd5e1')} data-testid="att-save-btn">{busy ? '...' : `حفظ التعديلات${dirty ? ` (${dirty})` : ''}`}</button>}
      </div>
      {d && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, direction: 'rtl', flexWrap: 'wrap' }} data-testid="att-daily-summary">
          {Object.entries(meta?.statuses || {}).map(([k, v]: any) => <Badge key={k} color={ATT_COLOR[k]}>{v}: {s[k] || 0}</Badge>)}
          <Badge color="#64748b">لم يُسجَّل: {s.unmarked || 0}</Badge>
        </div>
      )}
    </View>
    {!d ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text> : d.rows.length === 0 ? <ReportEmpty text="لا يوجد موظفون" icon="people-outline" /> : (
      <View style={[reportPage.card, { padding: 0, overflow: 'hidden' }]}>
        <table style={table} data-testid="att-daily-table">
          <Th cols={['الموظف', 'الوحدة', 'الحالة', 'حضور', 'انصراف', 'تأخير', 'ملاحظة', '']} />
          <tbody>
            {d.rows.map((r: any) => {
              const locked = !canManage;
              const st = rowVal(r, 'status');
              return (
                <tr key={r.employee_id} style={{ borderBottom: '1px solid #eef2f7', backgroundColor: edits[r.employee_id] ? '#fffbeb' : undefined }} data-testid={`att-row-${r.employee_id}`}>
                  <td style={{ ...td, fontWeight: 700, color: '#0f2440' }}>{r.employee_name}<div style={{ fontSize: 10.5, color: '#94a3b8' }}>{r.employee_no}{r.job_title ? ` · ${r.job_title}` : ''}</div></td>
                  <td style={td}>{r.org_unit_name || '—'}</td>
                  <td style={td}>
                    {r.status === 'leave' && !r.recorded ? <Badge color={ATT_COLOR.leave}>إجازة{r.note ? ` (${r.note})` : ''}</Badge>
                      : locked ? <Badge color={ATT_COLOR[st] || '#64748b'}>{r.status_label}</Badge>
                      : <select value={st || ''} onChange={(e) => edit(r.employee_id, 'status', e.target.value)} style={{ ...inp, padding: '5px 8px', color: ATT_COLOR[st] || '#0f2440', fontWeight: 700 }} data-testid={`att-status-${r.employee_id}`}>
                          <option value="">— لم يُسجَّل —</option>
                          {(meta?.manual || []).map((k: string) => <option key={k} value={k}>{meta.statuses[k]}</option>)}
                        </select>}
                  </td>
                  <td style={td}>{canManage && st && ['present', 'late', 'half_day', 'mission'].includes(st) ? <input type="time" value={rowVal(r, 'check_in')} onChange={(e) => edit(r.employee_id, 'check_in', e.target.value)} style={{ ...inp, width: 105, padding: '5px 6px', direction: 'ltr' }} data-testid={`att-in-${r.employee_id}`} /> : (r.check_in || '—')}</td>
                  <td style={td}>{canManage && st && ['present', 'late', 'half_day', 'mission'].includes(st) ? <input type="time" value={rowVal(r, 'check_out')} onChange={(e) => edit(r.employee_id, 'check_out', e.target.value)} style={{ ...inp, width: 105, padding: '5px 6px', direction: 'ltr' }} data-testid={`att-out-${r.employee_id}`} /> : (r.check_out || '—')}</td>
                  <td style={{ ...td, color: r.late_minutes ? '#f97316' : '#94a3b8', fontWeight: 700 }}>{r.late_minutes ? `${r.late_minutes} د` : '—'}</td>
                  <td style={td}>{canManage && r.status !== 'holiday' ? <input value={rowVal(r, 'note')} onChange={(e) => edit(r.employee_id, 'note', e.target.value)} placeholder="…" style={{ ...inp, padding: '5px 8px', minWidth: 120 }} /> : (r.note || '—')}</td>
                  <td style={td}>{r.recorded && <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{{ self: 'ذاتي', manual: 'يدوي', bulk: 'جماعي' }[r.source as string] || ''}</span>}{canManage && r.recorded && <button onClick={() => del(r)} title="حذف السجل" style={btn('transparent', '#c62828', { padding: '2px 6px' })} data-testid={`att-del-${r.employee_id}`}>🗑</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </View>
    )}
  </>);
};
