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
