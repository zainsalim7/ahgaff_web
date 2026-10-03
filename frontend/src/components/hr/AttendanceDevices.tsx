import React, { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { hrAPI } from '../../services/api';
import { reportPage, ReportEmpty } from '../reports/ReportShell';
import { Badge, td, table, btn, alertErr, fmtDT } from './ui';
import { useListTools, ListToolbar, SortTh, useSort, toggleSort, Sort } from './HrSelect';

const SORTERS: Record<string, (i: any) => any> = { name: (i) => i.full_name, unit: (i) => i.org_unit_name || '', device: (i) => i.device_id || '', registered: (i) => i.device_registered_at || '', seen: (i) => i.device_last_seen_at || '', rej: (i) => i.device_rejections || 0 };

/** 📱 إدارة أجهزة التحضير: الجهاز المسجّل لكل موظف، المحاولات المرفوضة، إعادة التعيين */
export const AttendanceDevices: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const [d, setD] = useState<any>(null);
  const [onlyReg, setOnlyReg] = useState(false);
  const [sort, setSort] = useState<Sort>(null);
  const load = useCallback(async () => { try { setD((await hrAPI.attDevices({ only_registered: onlyReg || undefined })).data); } catch (e) { alertErr(e); } }, [onlyReg]);
  useEffect(() => { load(); }, [load]);
  const sorted = useSort<any>(d?.items || [], sort, SORTERS);
  const fields = useCallback((i: any) => [i.full_name, i.employee_no, i.device_id, i.device_name, i.org_unit_name], []);
  const lt = useListTools<any>(sorted, (i) => i.id, fields, 25);
  const reset = async (i: any) => {
    if (!window.confirm(`إعادة تعيين جهاز «${i.full_name}»؟ سيُحذف الجهاز الحالي ويُسجَّل الجهاز الجديد تلقائياً عند أول تحضير.`)) return;
    try { const r = await hrAPI.resetDevice(i.id); window.alert(r.data.message); load(); } catch (e) { alertErr(e); }
  };
  const exportRows = (rows: any[]) => rows.map((i: any) => ({ 'الموظف': i.full_name, 'الرقم الوظيفي': i.employee_no, 'الوحدة': i.org_unit_name || '', 'معرّف الجهاز': i.device_id || '', 'اسم الجهاز': i.device_name || '', 'تاريخ التسجيل': i.device_registered_at ? fmtDT(i.device_registered_at) : '', 'آخر استخدام': i.device_last_seen_at ? fmtDT(i.device_last_seen_at) : '', 'محاولات مرفوضة': i.device_rejections || 0, 'آخر محاولة مرفوضة': i.device_last_rejection ? `${i.device_last_rejection.device_id} — ${fmtDT(i.device_last_rejection.at)}` : '' }));
  const st = d?.stats || {};
  return (<>
    <View style={reportPage.card}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', direction: 'rtl' }}>
        {d && !d.device_binding_enabled && <Badge color="#dc2626">⚠️ ربط الأجهزة معطّل حالياً من إعدادات الدوام — يُقبل التحضير من أي جهاز</Badge>}
        <Badge color="#0f2440">الموظفون: {st.total || 0}</Badge><Badge color="#16a34a">مسجَّل لهم جهاز: {st.registered || 0}</Badge><Badge color="#dc2626">لديهم محاولات مرفوضة: {st.with_rejections || 0}</Badge>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}><input type="checkbox" checked={onlyReg} onChange={(e) => setOnlyReg(e.target.checked)} data-testid="dev-only-registered" /> المسجَّل لهم جهاز فقط</label>
      </div>
      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 8, direction: 'rtl' }}>الهدف: منع الموظف من إرسال بياناته لشخص آخر ليحضّر بدلاً عنه — أول تحضير يسجّل الجهاز تلقائياً، وبعده يُرفض أي جهاز مختلف برسالة «هذا الجهاز غير مسجّل لحسابك». عند تغيير الموظف هاتفه اضغط «إعادة تعيين الجهاز».</div>
      {d && <ListToolbar t={lt} total={d.items.length} testID="att-dev" fileName="أجهزة-التحضير" exportRows={exportRows} placeholder="بحث بالاسم / الرقم / معرّف الجهاز…" />}
    </View>
    {!d ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text> : lt.pageRows.length === 0 ? <ReportEmpty text="لا توجد نتائج" icon="phone-portrait-outline" /> : (
      <View style={[reportPage.card, { padding: 0, overflow: 'hidden' }]}>
        <table style={table} data-testid="att-dev-table">
          <SortTh cols={[{ label: 'الموظف', key: 'name' }, { label: 'الوحدة', key: 'unit' }, { label: 'الجهاز المسجّل', key: 'device' }, { label: 'تاريخ التسجيل', key: 'registered' }, { label: 'آخر استخدام', key: 'seen' }, { label: 'محاولات مرفوضة', key: 'rej' }, { label: '' }]} sort={sort} onSort={(k) => setSort((p) => toggleSort(p, k))} />
          <tbody>
            {lt.pageRows.map((i: any) => (
              <tr key={i.id} style={{ borderBottom: '1px solid #eef2f7', backgroundColor: i.device_rejections ? '#fff7ed' : undefined }} data-testid={`dev-row-${i.id}`}>
                <td style={{ ...td, fontWeight: 700, color: '#0f2440' }}>{i.full_name}<div style={{ fontSize: 10.5, color: '#94a3b8' }}>{i.employee_no}{i.job_title ? ` · ${i.job_title}` : ''}</div></td>
                <td style={td}>{i.org_unit_name || '—'}</td>
                <td style={td}>{i.device_id ? <div><code style={{ fontSize: 11, direction: 'ltr', display: 'inline-block', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: 6 }} data-testid={`dev-id-${i.id}`}>{i.device_id}</code>{i.device_name ? <div style={{ fontSize: 10.5, color: '#64748b' }}>{i.device_name}</div> : null}</div> : <Badge color="#94a3b8">لم يُسجَّل بعد</Badge>}</td>
                <td style={{ ...td, fontSize: 11.5 }}>{i.device_registered_at ? fmtDT(i.device_registered_at) : '—'}</td>
                <td style={{ ...td, fontSize: 11.5 }}>{i.device_last_seen_at ? fmtDT(i.device_last_seen_at) : '—'}</td>
                <td style={td}>{i.device_rejections ? <div><Badge color="#dc2626">{i.device_rejections} محاولة</Badge>{i.device_last_rejection ? <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 3 }}>آخرها: <code style={{ direction: 'ltr', display: 'inline-block' }}>{i.device_last_rejection.device_id}</code> · {fmtDT(i.device_last_rejection.at)}</div> : null}</div> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{canManage && i.device_id && <button onClick={() => reset(i)} style={btn('#ffebee', '#c62828', { padding: '5px 10px', fontSize: 12 })} data-testid={`dev-reset-${i.id}`}>🔄 إعادة تعيين الجهاز</button>}</td>
              </tr>))}
          </tbody>
        </table>
      </View>
    )}
  </>);
};
