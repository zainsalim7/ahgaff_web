import React, { useEffect, useState, useCallback } from 'react';
import { HrSelect, useListTools, ListToolbar, SelBox, SortTh, useSort, toggleSort, Sort, GeoCell } from './HrSelect';
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
  const [sort, setSort] = useState<Sort>(null);
  const SORTERS = React.useMemo(() => ({ name: (i: any) => i.employee_name, unit: (i: any) => i.org_unit_name || '', present: (i: any) => i.counts.present, late: (i: any) => i.counts.late, half_day: (i: any) => i.counts.half_day, mission: (i: any) => i.counts.mission, absent: (i: any) => i.counts.absent, excused: (i: any) => i.counts.excused, leave: (i: any) => i.counts.leave, unmarked: (i: any) => i.counts.unmarked, late_minutes: (i: any) => i.late_minutes || 0, rate: (i: any) => i.rate ?? -1 }), []);
  const sorted = useSort<any>(d?.items || [], sort, SORTERS);
  const fields = useCallback((i: any) => [i.employee_name, i.employee_no, i.org_unit_name], []);
  const lt = useListTools<any>(sorted, (i) => i.employee_id, fields, 25);
  const exportRows = (rows: any[]) => rows.map((i: any) => ({ 'الموظف': i.employee_name, 'الرقم الوظيفي': i.employee_no, 'الوحدة': i.org_unit_name || '', 'حاضر': i.counts.present, 'متأخر': i.counts.late, 'نصف يوم': i.counts.half_day, 'مهمة': i.counts.mission, 'غائب': i.counts.absent, 'بعذر': i.counts.excused, 'إجازة': i.counts.leave, 'لم يُسجَّل': i.counts.unmarked, 'دقائق التأخير': i.late_minutes || 0, 'النسبة %': i.rate ?? '' }));

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
        <HrSelect value={unit} onChange={setUnit} options={units.map((u) => ({ value: u.id, label: u.name }))} placeholder="كل الوحدات" searchable style={{ width: 220 }} testID="att-month-unit" />
        {d && <span style={{ fontSize: 12.5, color: '#475569' }}>أيام العمل حتى الآن: <b>{d.work_days}</b> ({d.from} → {d.to})</span>}
        <span style={{ flex: 1 }} />
        <button onClick={exportXlsx} disabled={busy || !d} style={btn('#1b5e20')} data-testid="att-month-export" title="تقرير الشهر كاملاً من الخادم">{busy ? '...' : '📊 تصدير الشهر كاملاً'}</button>
      </div>
      {d && <div style={{ display: 'flex', gap: 6, marginTop: 10, direction: 'rtl', flexWrap: 'wrap' }}><Badge color={ATT_COLOR.present}>إجمالي حضور: {t.present}</Badge><Badge color={ATT_COLOR.late}>تأخير: {t.late}</Badge><Badge color={ATT_COLOR.absent}>غياب: {t.absent}</Badge><Badge color={ATT_COLOR.leave}>إجازات: {t.leave}</Badge></div>}
      {d && <ListToolbar t={lt} total={d.items.length} testID="att-month" fileName={`التقرير-الشهري-${month}`} exportRows={exportRows} />}
    </View>
    {!d ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text> : d.items.length === 0 ? <ReportEmpty text="لا يوجد موظفون" icon="people-outline" /> : (
      <View style={[reportPage.card, { padding: 0, overflow: 'hidden' }]}>
        <table style={table} data-testid="att-monthly-table">
          <SortTh cols={[{ label: '' }, { label: 'الموظف', key: 'name' }, { label: 'الوحدة', key: 'unit' }, { label: 'حاضر', key: 'present' }, { label: 'متأخر', key: 'late' }, { label: 'نصف يوم', key: 'half_day' }, { label: 'مهمة', key: 'mission' }, { label: 'غائب', key: 'absent' }, { label: 'بعذر', key: 'excused' }, { label: 'إجازة', key: 'leave' }, { label: 'لم يُسجَّل', key: 'unmarked' }, { label: 'دقائق التأخير', key: 'late_minutes' }, { label: 'النسبة', key: 'rate' }]} sort={sort} onSort={(k) => setSort((p) => toggleSort(p, k))} />
          <tbody>
            {lt.pageRows.map((i: any) => { const c = i.counts; return (
              <tr key={i.employee_id} style={{ borderBottom: '1px solid #eef2f7', cursor: 'pointer', backgroundColor: lt.isSel(i) ? '#eef4ff' : undefined }} onClick={() => openDetail(i)} data-testid={`att-month-row-${i.employee_id}`}>
                <td style={td}><SelBox checked={lt.isSel(i)} onChange={() => lt.toggle(i)} testID={`att-month-sel-${i.employee_id}`} /></td>
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
      <Modal title={`سجل ${detail.emp.employee_name} — ${detail.month}`} onClose={() => setDetail(null)} width={900} testID="att-emp-detail">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, direction: 'rtl' }}><button onClick={async () => { try { const res = await hrAPI.attDetailsExport({ date_from: `${detail.month}-01`, date_to: `${detail.month}-31`, employee_ids: detail.emp.employee_id }); const url = URL.createObjectURL(res.data); const a = document.createElement('a'); a.href = url; a.download = `${detail.emp.employee_name}-${detail.month}.xlsx`; a.click(); URL.revokeObjectURL(url); } catch (e) { alertErr(e); } }} style={btn('#e8f5e9', '#2e7d32')} data-testid="att-emp-detail-export">📥 تصدير سجل الموظف (تفصيلي)</button></div>
        {detail.records.length === 0 ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: 16 }}>لا توجد سجلات مسجّلة هذا الشهر</div> : (
          <table style={table}><Th cols={['التاريخ', 'الحالة', 'حضور', 'انصراف', 'تأخير', 'الموقع', 'ملاحظة', 'المصدر']} /><tbody>
            {detail.records.map((r: any) => <tr key={r.id} style={{ borderBottom: '1px solid #eef2f7' }}><td style={{ ...td, direction: 'ltr', textAlign: 'right' }}>{r.date}</td><td style={td}><Badge color={ATT_COLOR[r.status]}>{r.status_label}</Badge></td><td style={td}>{r.check_in || '—'}</td><td style={td}>{r.check_out || '—'}{r.auto_checkout ? <Badge color="#7c3aed"> 🤖 تلقائي</Badge> : null}</td><td style={{ ...td, color: r.late_minutes ? '#f97316' : undefined, fontWeight: 700 }}>{r.late_minutes || '—'}</td><td style={{ ...td, minWidth: 150 }}><GeoCell g={r.check_in_geo} /></td><td style={{ ...td, fontSize: 11.5 }}>{r.note || '—'}</td><td style={{ ...td, fontSize: 11, color: '#94a3b8' }}>{{ self: 'ذاتي', manual: 'يدوي', bulk: 'جماعي' }[r.source as string] || r.source}</td></tr>)}
          </tbody></table>
        )}
      </Modal>
    )}
  </>);
};
