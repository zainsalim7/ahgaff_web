import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '../src/utils/navigation';
import { hrAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { ReportHero, ReportKpis, ReportEmpty, reportPage } from '../src/components/reports/ReportShell';
import { Tabs, Badge, Th, td, table, inp, btn, opt, alertErr, fmtDT, Modal, Field, LEAVE_STATUS_COLOR } from '../src/components/hr/ui';
import { LeaveRequestModal, DecisionModal } from '../src/components/hr/LeaveModals';

const YEAR = new Date().getFullYear();

export default function HrLeaves() {
  const { hasPermission, user } = useAuth();
  const canManage = user?.role === 'admin' || hasPermission('hr_manage_leaves');
  const [tab, setTab] = useState('requests');
  const [meta, setMeta] = useState<any>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [q, setQ] = useState({ status: 'pending,hr_pending', type: '', org_unit_id: '', year: String(YEAR), page: 1 });
  const [data, setData] = useState<any>({ items: [], total: 0, stats: {} });
  const [balances, setBalances] = useState<any>({ items: [], year: YEAR });
  const [balYear, setBalYear] = useState(YEAR);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [decision, setDecision] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [editBal, setEditBal] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await hrAPI.leaves({ ...Object.fromEntries(Object.entries(q).filter(([, v]) => v)), per_page: 40 })).data); } catch { setData({ items: [], total: 0, stats: {} }); }
    finally { setLoading(false); }
  }, [q]);
  const loadBal = useCallback(async () => { try { setBalances((await hrAPI.leaveBalances({ year: balYear })).data); } catch { } }, [balYear]);

  useEffect(() => { hrAPI.leavesMeta().then((r) => setMeta(r.data)).catch(() => {}); hrAPI.orgUnits().then((r) => setUnits(r.data.units || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'balances') loadBal(); }, [tab, loadBal]);

  const setQ1 = (k: string) => (e: any) => setQ((p) => ({ ...p, [k]: e.target.value, page: 1 }));
  const done = (msg: string) => { window.alert(msg); load(); if (detail) openDetail(detail.id); };
  const openDetail = async (id: string) => { try { setDetail((await hrAPI.leave(id)).data); } catch (e) { alertErr(e); } };
  const cancel = async (l: any) => { if (!window.confirm(`إلغاء طلب إجازة ${l.employee_name}؟`)) return; try { const r = await hrAPI.cancelLeave(l.id); done(r.data.message); setDetail(null); } catch (e) { alertErr(e); } };
  const saveBal = async () => { try { const r = await hrAPI.setLeaveBalance(editBal.employee_id, { year: balYear, entitlement: Number(editBal.entitlement), carried_over: Number(editBal.carried_over), note: editBal.note }); window.alert(r.data.message); setEditBal(null); loadBal(); } catch (e) { alertErr(e); } };

  const st = data.stats || {};
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="شؤون الموظفين" title="إدارة الإجازات" subtitle="طلبات الإجازات ودورة الاعتماد (المدير المباشر ← شؤون الموظفين) والأرصدة السنوية" onBack={() => goBack()} canExport={false} testID="hr-leaves-hero" />

        <ReportKpis items={[
          { label: 'طلبات معلّقة', value: st.pending || 0, color: '#f97316', icon: 'hourglass' },
          { label: 'في إجازة اليوم', value: st.on_leave_today || 0, color: '#0284c7', icon: 'airplane' },
          { label: `معتمدة ${YEAR}`, value: st.approved_year || 0, color: '#16a34a', icon: 'checkmark-done' },
          { label: `مرفوضة ${YEAR}`, value: st.rejected_year || 0, color: '#dc2626', icon: 'close-circle' },
        ]} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl', flexWrap: 'wrap', gap: 8 }}>
          <Tabs tabs={[{ key: 'requests', label: 'الطلبات', count: data.total }, { key: 'balances', label: 'الأرصدة السنوية' }]} value={tab} onChange={setTab} testID="hr-leaves-tabs" />
          {canManage && <button onClick={() => setShowNew(true)} style={btn('#1565c0', '#fff', { marginBottom: 12 })} data-testid="hr-leaves-register-btn">+ تسجيل إجازة لموظف</button>}
        </div>

        {tab === 'requests' && (<>
          <View style={reportPage.card}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.2fr 0.8fr', gap: 8, direction: 'rtl' }}>
              <select value={q.status} onChange={setQ1('status')} style={inp} data-testid="hr-leaves-filter-status">
                <option value="pending,hr_pending">المعلّقة (كل المراحل)</option>
                <option value="">كل الحالات</option>
                {opt(meta?.statuses)}
              </select>
              <select value={q.type} onChange={setQ1('type')} style={inp} data-testid="hr-leaves-filter-type"><option value="">كل الأنواع</option>{opt(meta?.types)}</select>
              <select value={q.org_unit_id} onChange={setQ1('org_unit_id')} style={inp} data-testid="hr-leaves-filter-unit"><option value="">كل الوحدات</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              <select value={q.year} onChange={setQ1('year')} style={inp} data-testid="hr-leaves-filter-year"><option value="">كل السنوات</option>{[YEAR + 1, YEAR, YEAR - 1, YEAR - 2].map((y) => <option key={y} value={y}>{y}</option>)}</select>
            </div>
          </View>
          {loading ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text>
            : data.items.length === 0 ? <ReportEmpty text="لا توجد طلبات مطابقة" icon="airplane-outline" />
            : (
              <View style={[reportPage.card, { padding: 0, overflow: 'hidden' }]}>
                <table style={table} data-testid="hr-leaves-table">
                  <Th cols={['الموظف', 'الوحدة', 'النوع', 'من', 'إلى', 'الأيام', 'الحالة', 'قُدّم', '']} />
                  <tbody>
                    {data.items.map((l: any) => (
                      <tr key={l.id} style={{ borderBottom: '1px solid #eef2f7', cursor: 'pointer' }} onClick={() => openDetail(l.id)} data-testid={`hr-leave-row-${l.id}`}>
                        <td style={{ ...td, fontWeight: 700, color: '#0f2440' }}>{l.employee_name}<div style={{ fontSize: 10.5, color: '#94a3b8' }}>{l.employee_no}</div></td>
                        <td style={td}>{l.org_unit_name || '—'}</td>
                        <td style={td}>{l.type_label}</td>
                        <td style={{ ...td, direction: 'ltr', textAlign: 'right' }}>{l.start_date}</td>
                        <td style={{ ...td, direction: 'ltr', textAlign: 'right' }}>{l.end_date}</td>
                        <td style={{ ...td, fontWeight: 800 }}>{l.days}</td>
                        <td style={td}><Badge color={LEAVE_STATUS_COLOR[l.status] || '#64748b'}>{l.status_label}</Badge></td>
                        <td style={{ ...td, fontSize: 11, color: '#64748b' }}>{fmtDT(l.created_at)}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }} onClick={(ev) => ev.stopPropagation()}>
                          {canManage && ['pending', 'hr_pending'].includes(l.status) && <button onClick={() => setDecision(l)} style={btn('#e3f2fd', '#1565c0', { padding: '5px 10px', fontSize: 11.5 })} data-testid={`hr-leave-decide-${l.id}`}>قرار</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, direction: 'rtl', fontSize: 12, color: '#64748b' }}>
                  <span data-testid="hr-leaves-total">الإجمالي: {data.total}</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button disabled={q.page <= 1} onClick={() => setQ((p) => ({ ...p, page: p.page - 1 }))} style={btn('#f1f5f9', '#0f2440', { padding: '5px 12px', fontSize: 12 })}>السابق</button>
                    <span style={{ padding: '5px 8px' }}>صفحة {q.page} من {Math.max(1, Math.ceil(data.total / 40))}</span>
                    <button disabled={q.page >= Math.ceil(data.total / 40)} onClick={() => setQ((p) => ({ ...p, page: p.page + 1 }))} style={btn('#f1f5f9', '#0f2440', { padding: '5px 12px', fontSize: 12 })}>التالي</button>
                  </span>
                </div>
              </View>
            )}
        </>)}

        {tab === 'balances' && (
          <View style={[reportPage.card, { padding: 0, overflow: 'hidden' }]}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, direction: 'rtl' }}>
              <div style={{ fontSize: 12.5, color: '#475569' }}>الاستحقاق الافتراضي: <b>{balances.default_entitlement}</b> يوماً (يُعدَّل من إعدادات الدوام) — الرصيد = الاستحقاق + المرحَّل − المستخدم</div>
              <select value={balYear} onChange={(e) => setBalYear(Number(e.target.value))} style={{ ...inp, width: 110 }} data-testid="hr-balances-year">{[YEAR + 1, YEAR, YEAR - 1].map((y) => <option key={y} value={y}>{y}</option>)}</select>
            </div>
            <table style={table} data-testid="hr-balances-table">
              <Th cols={['الموظف', 'الوحدة', 'الاستحقاق', 'مرحَّل', 'مستخدم', 'معلّق', 'المتبقي', '']} />
              <tbody>
                {balances.items.map((b: any) => (
                  <tr key={b.employee_id} style={{ borderBottom: '1px solid #eef2f7' }} data-testid={`hr-balance-row-${b.employee_id}`}>
                    <td style={{ ...td, fontWeight: 700, color: '#0f2440' }}>{b.employee_name}<div style={{ fontSize: 10.5, color: '#94a3b8' }}>{b.employee_no}{b.overridden ? ' · مخصّص' : ''}</div></td>
                    <td style={td}>{b.org_unit_name || '—'}</td>
                    <td style={td}>{b.entitlement}</td><td style={td}>{b.carried_over}</td><td style={td}>{b.used}</td><td style={{ ...td, color: '#f97316' }}>{b.pending}</td>
                    <td style={{ ...td, fontWeight: 800, color: b.remaining <= 0 ? '#dc2626' : '#16a34a' }}>{b.remaining}</td>
                    <td style={td}>{canManage && <button onClick={() => setEditBal({ ...b })} style={btn('#e3f2fd', '#1565c0', { padding: '5px 10px', fontSize: 11.5 })} data-testid={`hr-balance-edit-${b.employee_id}`}>تعديل</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </View>
        )}
      </ScrollView>

      {showNew && <LeaveRequestModal forEmployee meta={meta} onClose={() => setShowNew(false)} onSaved={done} />}
      {decision && <DecisionModal leave={decision} onClose={() => setDecision(null)} onDone={done} />}
      {editBal && (
        <Modal title={`رصيد ${balYear}: ${editBal.employee_name}`} onClose={() => setEditBal(null)} width={440} testID="hr-balance-modal">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="الاستحقاق السنوي (يوم)"><input type="number" value={editBal.entitlement} onChange={(e) => setEditBal({ ...editBal, entitlement: e.target.value })} style={inp} data-testid="hr-balance-entitlement" /></Field>
            <Field label="مرحَّل من سنة سابقة"><input type="number" value={editBal.carried_over} onChange={(e) => setEditBal({ ...editBal, carried_over: e.target.value })} style={inp} data-testid="hr-balance-carried" /></Field>
            <Field label="ملاحظة" span={2}><input value={editBal.note || ''} onChange={(e) => setEditBal({ ...editBal, note: e.target.value })} style={inp} /></Field>
          </div>
          <button onClick={saveBal} style={btn('#1565c0', '#fff', { marginTop: 12 })} data-testid="hr-balance-save">حفظ</button>
        </Modal>
      )}
      {detail && (
        <Modal title={`طلب إجازة — ${detail.employee_name}`} onClose={() => setDetail(null)} width={560} testID="hr-leave-detail">
          <Badge color={LEAVE_STATUS_COLOR[detail.status]}>{detail.status_label}</Badge>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12, fontSize: 12.5 }}>
            {[['النوع', detail.type_label], ['أيام العمل', detail.days], ['من', detail.start_date], ['إلى', detail.end_date], ['الوحدة', detail.org_unit_name], ['المسمى', detail.job_title], ['السبب', detail.reason], ['التواصل', detail.contact_during_leave], ['قُدّم بواسطة', detail.created_by_name], ['وقت التقديم', fmtDT(detail.created_at)]].map(([l, v]) => (
              <div key={l as string} style={{ backgroundColor: '#f7f9fc', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 10.5, color: '#94a3b8' }}>{l}</div><div style={{ fontWeight: 700, color: '#0f2440' }}>{v || '—'}</div></div>
            ))}
          </div>
          {detail.balance && detail.deducts_balance && <div style={{ marginTop: 10, fontSize: 12, backgroundColor: '#e3f2fd', color: '#1565c0', padding: '8px 10px', borderRadius: 8 }}>رصيد {detail.balance.year}: المتبقي <b>{detail.balance.remaining}</b> من {detail.balance.entitlement + detail.balance.carried_over} (معلّق {detail.balance.pending})</div>}
          {detail.history?.length > 0 && <div style={{ marginTop: 14 }}><div style={{ fontSize: 12, fontWeight: 800, color: '#5b6678', marginBottom: 4 }}>مسار الطلب</div>{detail.history.map((h: any, i: number) => <div key={i} style={{ fontSize: 11.5, color: '#475569', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}><b>{({ submitted: 'تقديم', registered: 'تسجيل مباشر', manager_approve: 'موافقة المدير المباشر', manager_reject: 'رفض المدير المباشر', hr_approve: 'اعتماد شؤون الموظفين', hr_reject: 'رفض شؤون الموظفين', cancelled: 'إلغاء' } as any)[h.action] || h.action}</b> · {h.by_name} · {fmtDT(h.at)}{h.note ? <div style={{ color: '#94a3b8' }}>{h.note}</div> : null}</div>)}</div>}
          {canManage && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {['pending', 'hr_pending'].includes(detail.status) && <button onClick={() => { setDecision(detail); }} style={btn('#1565c0')} data-testid="hr-leave-detail-decide">اتخاذ قرار</button>}
              {['pending', 'hr_pending', 'approved'].includes(detail.status) && <button onClick={() => cancel(detail)} style={btn('#ffebee', '#c62828')} data-testid="hr-leave-detail-cancel">إلغاء الطلب</button>}
            </div>
          )}
        </Modal>
      )}
    </SafeAreaView>
  );
}
