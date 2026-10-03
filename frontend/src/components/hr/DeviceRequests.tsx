import React, { useEffect, useState, useCallback } from 'react';
import { View } from 'react-native';
import { hrAPI } from '../../services/api';
import { reportPage } from '../reports/ReportShell';
import { Badge, td, table, btn, alertErr, fmtDT } from './ui';

/** 📱 طلبات تغيير جهاز التحضير الواردة من الموظفين — موافقة بنقرة أو رفض بسبب */
export const DeviceRequests: React.FC<{ canManage: boolean; onChanged: () => void }> = ({ canManage, onChanged }) => {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [d, setD] = useState<any>(null);
  const load = useCallback(async () => { try { setD((await hrAPI.deviceRequests(status)).data); } catch (e) { alertErr(e); } }, [status]);
  useEffect(() => { load(); }, [load]);
  const approve = async (r: any) => {
    if (!window.confirm(`الموافقة على تغيير جهاز «${r.employee_name}» إلى ${r.new_device_name || r.new_device_id}؟ سيُفعَّل الجهاز الجديد فوراً.`)) return;
    try { const res = await hrAPI.approveDeviceRequest(r.id); window.alert(res.data.message); load(); onChanged(); } catch (e) { alertErr(e); }
  };
  const reject = async (r: any) => {
    const reason = window.prompt(`سبب رفض طلب «${r.employee_name}» (اختياري):`, '');
    if (reason === null) return;
    try { const res = await hrAPI.rejectDeviceRequest(r.id, reason); window.alert(res.data.message); load(); onChanged(); } catch (e) { alertErr(e); }
  };
  const tabs: [typeof status, string, string][] = [['pending', 'بانتظار الموافقة', '#f97316'], ['approved', 'المقبولة', '#16a34a'], ['rejected', 'المرفوضة', '#dc2626']];
  return (
    <View style={[reportPage.card, { marginBottom: 12 }]} testID="dev-requests">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', direction: 'rtl', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f2440' }}>📱 طلبات تغيير الجهاز</div>
        {d?.pending ? <Badge color="#f97316" testID="dev-req-pending-count">{d.pending} معلّق</Badge> : null}
        <span style={{ flex: 1 }} />
        {tabs.map(([k, l, c]) => <button key={k} onClick={() => setStatus(k)} style={btn(status === k ? c : '#f1f5f9', status === k ? '#fff' : '#475569', { fontSize: 12 })} data-testid={`dev-req-tab-${k}`}>{l}</button>)}
      </div>
      {!d ? <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>جاري التحميل...</div> : d.items.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 12.5, textAlign: 'center', padding: 10 }} data-testid="dev-req-empty">لا توجد طلبات {tabs.find((t) => t[0] === status)?.[1]}</div> : (
        <table style={table} data-testid="dev-req-table">
          <thead><tr style={{ backgroundColor: '#f8fafc' }}>{['الموظف', 'الجهاز الحالي', 'الجهاز الجديد', 'السبب', 'التاريخ', 'الحالة', ''].map((h) => <th key={h} style={{ ...td, fontSize: 11.5, color: '#64748b', fontWeight: 800 }}>{h}</th>)}</tr></thead>
          <tbody>
            {d.items.map((r: any) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #eef2f7' }} data-testid={`dev-req-row-${r.id}`}>
                <td style={{ ...td, fontWeight: 700, color: '#0f2440' }}>{r.employee_name}<div style={{ fontSize: 10.5, color: '#94a3b8' }}>{r.employee_no}</div></td>
                <td style={td}><code style={{ fontSize: 11, direction: 'ltr', display: 'inline-block', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: 6 }}>{r.old_device_id}</code>{r.old_device_name ? <div style={{ fontSize: 10.5, color: '#64748b' }}>{r.old_device_name}</div> : null}</td>
                <td style={td}><code style={{ fontSize: 11, direction: 'ltr', display: 'inline-block', backgroundColor: '#ecfdf5', padding: '2px 6px', borderRadius: 6 }}>{r.new_device_id}</code>{r.new_device_name ? <div style={{ fontSize: 10.5, color: '#64748b' }}>{r.new_device_name}</div> : null}</td>
                <td style={{ ...td, fontSize: 11.5, maxWidth: 220 }}>{r.reason || '—'}{r.reject_reason ? <div style={{ color: '#dc2626' }}>سبب الرفض: {r.reject_reason}</div> : null}</td>
                <td style={{ ...td, fontSize: 11.5 }}>{fmtDT(r.created_at)}{r.reviewed_by_name ? <div style={{ fontSize: 10.5, color: '#94a3b8' }}>بواسطة {r.reviewed_by_name}</div> : null}</td>
                <td style={td}><Badge color={{ pending: '#f97316', approved: '#16a34a', rejected: '#dc2626' }[r.status as string] || '#64748b'}>{r.status_label}</Badge></td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{canManage && r.status === 'pending' && <>
                  <button onClick={() => approve(r)} style={btn('#16a34a', '#fff', { padding: '5px 10px', fontSize: 12, marginLeft: 6 })} data-testid={`dev-req-approve-${r.id}`}>✅ موافقة</button>
                  <button onClick={() => reject(r)} style={btn('#ffebee', '#c62828', { padding: '5px 10px', fontSize: 12 })} data-testid={`dev-req-reject-${r.id}`}>رفض</button>
                </>}</td>
              </tr>))}
          </tbody>
        </table>
      )}
    </View>
  );
};
