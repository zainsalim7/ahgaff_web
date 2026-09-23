import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '../src/utils/navigation';
import { hrAPI } from '../src/services/api';
import { ReportHero, ReportEmpty, reportPage } from '../src/components/reports/ReportShell';
import { Badge, Th, td, table, btn, alertErr, fmtDT, LEAVE_STATUS_COLOR } from '../src/components/hr/ui';
import { LeaveRequestModal, DecisionModal } from '../src/components/hr/LeaveModals';

export default function HrMyLeaves() {
  const [d, setD] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [decision, setDecision] = useState<any>(null);

  const load = useCallback(async () => { try { setD((await hrAPI.myLeaves()).data); } catch { setD(null); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); hrAPI.leavesMeta().then((r) => setMeta(r.data)).catch(() => {}); }, [load]);
  const done = (msg: string) => { window.alert(msg); load(); };
  const cancel = async (l: any) => { if (!window.confirm('إلغاء هذا الطلب؟')) return; try { const r = await hrAPI.cancelLeave(l.id); done(r.data.message); } catch (e) { alertErr(e); } };

  const b = d?.balance;
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="شؤون الموظفين" title="إجازاتي" subtitle="رصيدك السنوي، طلباتك، ومتابعة حالتها — وطلبات فريقك إن كنت مديراً مباشراً" onBack={() => goBack()} canExport={false} testID="hr-my-leaves-hero" />
        {loading ? <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 30 }} /> : (<>
          {d?.team_pending?.length > 0 && (
            <View style={[reportPage.card, { borderRightWidth: 4, borderRightColor: '#f97316' }]} testID="hr-team-pending">
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f2440', textAlign: 'right', marginBottom: 8 }}>طلبات فريقك بانتظار موافقتك ({d.team_pending.length})</Text>
              {d.team_pending.map((l: any) => (
                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12.5 }} data-testid={`team-leave-${l.id}`}>
                  <div><b>{l.employee_name}</b> · {l.type_label} · {l.start_date} → {l.end_date} ({l.days} يوم){l.reason ? <div style={{ color: '#64748b', fontSize: 11.5 }}>{l.reason}</div> : null}</div>
                  <button onClick={() => setDecision(l)} style={btn('#1565c0', '#fff', { padding: '6px 12px', fontSize: 12 })} data-testid={`team-leave-decide-${l.id}`}>قرار</button>
                </div>
              ))}
            </View>
          )}

          {!d?.profile ? <ReportEmpty text="لا يوجد ملف إداري مرتبط بحسابك — سيتاح طلب الإجازات بعد أن تُنشئه شؤون الموظفين" icon="id-card-outline" /> : (<>
            <View style={reportPage.card} testID="hr-my-balance">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>رصيد الإجازة السنوية {b?.year}</div>
                  <div style={{ fontSize: 34, fontWeight: 900, color: b?.remaining > 0 ? '#16a34a' : '#dc2626' }} data-testid="hr-my-remaining">{b?.remaining} <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>يوم متبقٍ</span></div>
                  <div style={{ fontSize: 12, color: '#475569' }}>الاستحقاق {b?.entitlement}{b?.carried_over ? ` + مرحَّل ${b.carried_over}` : ''} · مستخدم {b?.used} · معلّق {b?.pending}</div>
                </div>
                <button onClick={() => setShowNew(true)} style={btn('#1565c0')} data-testid="hr-my-new-leave-btn">+ طلب إجازة</button>
              </div>
              <div style={{ height: 8, backgroundColor: '#eef2f7', borderRadius: 6, marginTop: 12, overflow: 'hidden', direction: 'rtl' }}>
                <div style={{ width: `${Math.min(100, ((b?.used || 0) / Math.max(1, (b?.entitlement || 0) + (b?.carried_over || 0))) * 100)}%`, height: '100%', backgroundColor: '#1565c0' }} />
              </div>
              {!d.profile.has_manager && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 8, textAlign: 'right' }}>لا يوجد مدير مباشر في ملفك — تذهب طلباتك مباشرة إلى شؤون الموظفين.</div>}
            </View>

            {d.requests.length === 0 ? <ReportEmpty text="لم تقدّم أي طلب إجازة بعد" icon="airplane-outline" /> : (
              <View style={[reportPage.card, { padding: 0, overflow: 'hidden' }]}>
                <table style={table} data-testid="hr-my-leaves-table">
                  <Th cols={['النوع', 'من', 'إلى', 'الأيام', 'الحالة', 'قُدّم', '']} />
                  <tbody>
                    {d.requests.map((l: any) => (
                      <tr key={l.id} style={{ borderBottom: '1px solid #eef2f7' }} data-testid={`my-leave-${l.id}`}>
                        <td style={{ ...td, fontWeight: 700 }}>{l.type_label}{l.reason ? <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{l.reason}</div> : null}</td>
                        <td style={{ ...td, direction: 'ltr', textAlign: 'right' }}>{l.start_date}</td>
                        <td style={{ ...td, direction: 'ltr', textAlign: 'right' }}>{l.end_date}</td>
                        <td style={{ ...td, fontWeight: 800 }}>{l.days}</td>
                        <td style={td}><Badge color={LEAVE_STATUS_COLOR[l.status]}>{l.status_label}</Badge>{(l.hr_decision?.note || l.manager_decision?.note) ? <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 3 }}>{l.hr_decision?.note || l.manager_decision?.note}</div> : null}</td>
                        <td style={{ ...td, fontSize: 11, color: '#64748b' }}>{fmtDT(l.created_at)}</td>
                        <td style={td}>{(['pending', 'hr_pending'].includes(l.status) || (l.status === 'approved' && l.start_date > new Date().toISOString().slice(0, 10))) && <button onClick={() => cancel(l)} style={btn('#ffebee', '#c62828', { padding: '5px 10px', fontSize: 11.5 })} data-testid={`my-leave-cancel-${l.id}`}>إلغاء</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </View>
            )}
          </>)}
        </>)}
      </ScrollView>
      {showNew && <LeaveRequestModal meta={meta} onClose={() => setShowNew(false)} onSaved={done} />}
      {decision && <DecisionModal leave={decision} onClose={() => setDecision(null)} onDone={done} />}
    </SafeAreaView>
  );
}
