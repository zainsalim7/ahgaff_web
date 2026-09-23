import React, { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { hrAPI } from '../../services/api';
import { reportPage, ReportEmpty } from '../reports/ReportShell';
import { Th, td, table, inp, btn, alertErr, Modal, Badge, ATT_COLOR } from './ui';

const thisMonth = () => new Date().toISOString().slice(0, 7);

export const AttendanceMonthly: React.FC<{ units: any[]; meta: any }> = ({ units, meta }) => {
  const [month, setMonth] = useState(thisMonth());
  const [unit, setUnit] = useState('');
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async () => { setD(null); try { setD((await hrAPI.attMonthly({ month, org_unit_id: unit || undefined })).data); } catch (e) { alertErr(e); } }, [month, unit]);
  useEffect(() => { load(); }, [load]);

  const exportXlsx = async () => {
    setBusy(true);
    try { const res = await hrAPI.attMonthlyExport({ month, org_unit_id: unit || undefined }); const url = URL.createObjectURL(res.data); const a = document.createElement('a'); a.href = url; a.download = `الحضور الإداري ${month}.xlsx`; a.click(); URL.revokeObjectURL(url); }
    catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  const openDetail = async (i: any) => { try { setDetail({ emp: i, ...(await hrAPI.attEmployee(i.employee_id, month)).data }); } catch (e) { alertErr(e); } };

  const t = d?.totals || {};
  return (<>
    <View style={reportPage.card}>
      <div style={{ display: 'flex', gap: 8, direction: 'rtl', alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value)} style={{ ...inp, width: 160, direction: 'ltr' }} data-testid="att-month-input" />
        <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ ...inp, width: 220 }} data-testid="att-month-unit"><option value="">كل الوحدات</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        {d && <span style={{ fontSize: 12.5, color: '#475569' }}>أيام العمل حتى الآن: <b>{d.work_days}</b> ({d.from} → {d.to})</span>}
        <span style={{ flex: 1 }} />
        <button onClick={exportXlsx} disabled={busy || !d} style={btn('#1b5e20')} data-testid="att-month-export">{busy ? '...' : '📊 تصدير Excel'}</button>
      </div>
      {d && <div style={{ display: 'flex', gap: 6, marginTop: 10, direction: 'rtl', flexWrap: 'wrap' }}><Badge color={ATT_COLOR.present}>إجمالي حضور: {t.present}</Badge><Badge color={ATT_COLOR.late}>تأخير: {t.late}</Badge><Badge color={ATT_COLOR.absent}>غياب: {t.absent}</Badge><Badge color={ATT_COLOR.leave}>إجازات: {t.leave}</Badge></div>}
    </View>
    {!d ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text> : d.items.length === 0 ? <ReportEmpty text="لا يوجد موظفون" icon="people-outline" /> : (
      <View style={[reportPage.card, { padding: 0, overflow: 'hidden' }]}>
        <table style={table} data-testid="att-monthly-table">
          <Th cols={['الموظف', 'الوحدة', 'حاضر', 'متأخر', 'نصف يوم', 'مهمة', 'غائب', 'بعذر', 'إجازة', 'لم يُسجَّل', 'دقائق التأخير', 'النسبة']} />
          <tbody>
            {d.items.map((i: any) => { const c = i.counts; return (
              <tr key={i.employee_id} style={{ borderBottom: '1px solid #eef2f7', cursor: 'pointer' }} onClick={() => openDetail(i)} data-testid={`att-month-row-${i.employee_id}`}>
                <td style={{ ...td, fontWeight: 700, color: '#0f2440' }}>{i.employee_name}<div style={{ fontSize: 10.5, color: '#94a3b8' }}>{i.employee_no}</div></td>
                <td style={td}>{i.org_unit_name || '—'}</td>
                <td style={{ ...td, color: ATT_COLOR.present, fontWeight: 700 }}>{c.present}</td><td style={{ ...td, color: ATT_COLOR.late }}>{c.late}</td><td style={td}>{c.half_day}</td><td style={td}>{c.mission}</td>
                <td style={{ ...td, color: c.absent ? ATT_COLOR.absent : undefined, fontWeight: c.absent ? 800 : 400 }}>{c.absent}</td><td style={td}>{c.excused}</td><td style={{ ...td, color: ATT_COLOR.leave }}>{c.leave}</td><td style={{ ...td, color: '#94a3b8' }}>{c.unmarked}</td>
                <td style={td}>{i.late_minutes || '—'}</td>
                <td style={{ ...td, fontWeight: 800, color: i.rate === null ? '#94a3b8' : i.rate >= 90 ? '#16a34a' : i.rate >= 75 ? '#f97316' : '#dc2626' }}>{i.rate === null ? '—' : `${i.rate}%`}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </View>
    )}
    {detail && (
      <Modal title={`سجل ${detail.emp.employee_name} — ${detail.month}`} onClose={() => setDetail(null)} width={560} testID="att-emp-detail">
        {detail.records.length === 0 ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: 16 }}>لا توجد سجلات مسجّلة هذا الشهر</div> : (
          <table style={table}><Th cols={['التاريخ', 'الحالة', 'حضور', 'انصراف', 'تأخير', 'ملاحظة', 'المصدر']} /><tbody>
            {detail.records.map((r: any) => <tr key={r.id} style={{ borderBottom: '1px solid #eef2f7' }}><td style={{ ...td, direction: 'ltr', textAlign: 'right' }}>{r.date}</td><td style={td}><Badge color={ATT_COLOR[r.status]}>{r.status_label}</Badge></td><td style={td}>{r.check_in || '—'}</td><td style={td}>{r.check_out || '—'}</td><td style={td}>{r.late_minutes || '—'}</td><td style={td}>{r.note || '—'}</td><td style={{ ...td, fontSize: 11, color: '#94a3b8' }}>{{ self: 'ذاتي', manual: 'يدوي', bulk: 'جماعي' }[r.source as string] || r.source}</td></tr>)}
          </tbody></table>
        )}
      </Modal>
    )}
  </>);
};

export const AttendanceSettings: React.FC<{ meta: any; onSaved: () => void }> = ({ meta, onSaved }) => {
  const [s, setS] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { hrAPI.attSettings().then((r) => setS(r.data)).catch(alertErr); }, []);
  if (!s) return <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text>;
  const set = (k: string, v: any) => setS((p: any) => ({ ...p, [k]: v }));
  const toggleDay = (d: string) => set('work_days', s.work_days.includes(d) ? s.work_days.filter((x: string) => x !== d) : [...s.work_days, d]);
  const save = async () => { setBusy(true); try { const r = await hrAPI.saveAttSettings({ ...s, late_grace_minutes: Number(s.late_grace_minutes), early_leave_grace_minutes: Number(s.early_leave_grace_minutes || 0), annual_leave_days: Number(s.annual_leave_days) }); window.alert(r.data.message); setS(r.data.settings); onSaved(); } catch (e) { alertErr(e); } finally { setBusy(false); } };
  const lbl: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#333', marginBottom: 4, textAlign: 'right' };
  return (
    <View style={reportPage.card} testID="att-settings">
      <div style={{ direction: 'rtl' }}>
        <div style={lbl}>أيام العمل</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {(meta?.days || []).map((d: string) => <button key={d} onClick={() => toggleDay(d)} style={btn(s.work_days.includes(d) ? '#0f2440' : '#f1f5f9', s.work_days.includes(d) ? '#fff' : '#0f2440', { padding: '6px 12px', borderRadius: 16, fontSize: 12 })} data-testid={`att-day-${d}`}>{d}</button>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <div><div style={lbl}>بداية الدوام</div><input type="time" value={s.work_start} onChange={(e) => set('work_start', e.target.value)} style={{ ...inp, direction: 'ltr' }} data-testid="att-set-start" /></div>
          <div><div style={lbl}>نهاية الدوام</div><input type="time" value={s.work_end} onChange={(e) => set('work_end', e.target.value)} style={{ ...inp, direction: 'ltr' }} data-testid="att-set-end" /></div>
          <div><div style={lbl}>سماحية التأخير (دقيقة)</div><input type="number" value={s.late_grace_minutes} onChange={(e) => set('late_grace_minutes', e.target.value)} style={inp} data-testid="att-set-grace" /></div>
          <div><div style={lbl}>الإجازة السنوية الافتراضية (يوم)</div><input type="number" value={s.annual_leave_days} onChange={(e) => set('annual_leave_days', e.target.value)} style={inp} data-testid="att-set-annual" /></div>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={!!s.allow_self_checkin} onChange={(e) => set('allow_self_checkin', e.target.checked)} data-testid="att-set-self" /> السماح للموظفين بتسجيل الحضور/الانصراف ذاتياً من «ملفي الإداري»</label>
        <div style={{ ...lbl, marginTop: 16 }}>العطل الرسمية</div>
        {(s.holidays || []).map((h: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input type="date" value={h.date} onChange={(e) => set('holidays', s.holidays.map((x: any, j: number) => j === i ? { ...x, date: e.target.value } : x))} style={{ ...inp, width: 160, direction: 'ltr' }} data-testid={`att-holiday-date-${i}`} />
            <input value={h.name} placeholder="اسم العطلة" onChange={(e) => set('holidays', s.holidays.map((x: any, j: number) => j === i ? { ...x, name: e.target.value } : x))} style={{ ...inp, flex: 1 }} data-testid={`att-holiday-name-${i}`} />
            <button onClick={() => set('holidays', s.holidays.filter((_: any, j: number) => j !== i))} style={btn('#ffebee', '#c62828', { padding: '6px 10px' })}>✕</button>
          </div>
        ))}
        <button onClick={() => set('holidays', [...(s.holidays || []), { date: '', name: '' }])} style={btn('#f1f5f9', '#0f2440', { fontSize: 12 })} data-testid="att-add-holiday">+ إضافة عطلة</button>
        <div style={{ marginTop: 16 }}><button onClick={save} disabled={busy} style={btn('#1565c0')} data-testid="att-settings-save">{busy ? 'جاري الحفظ...' : 'حفظ الإعدادات'}</button></div>
      </div>
    </View>
  );
};
