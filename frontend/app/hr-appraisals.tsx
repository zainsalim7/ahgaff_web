import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '../src/utils/navigation';
import { hrAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { ReportHero, ReportKpis, ReportEmpty, reportPage } from '../src/components/reports/ReportShell';
import { Tabs, Badge, Th, td, table, inp, btn, alertErr, fmtDT } from '../src/components/hr/ui';
import { AppraisalModal, APPR_STATUS_COLOR, gradeColor } from '../src/components/hr/AppraisalModal';

const YEAR = new Date().getFullYear();

export default function HrAppraisals() {
  const { hasPermission, user } = useAuth();
  const isHr = user?.role === 'admin' || hasPermission('hr_manage_appraisals') || hasPermission('hr_view_employees');
  const canManage = user?.role === 'admin' || hasPermission('hr_manage_appraisals');
  const [tab, setTab] = useState(isHr ? 'all' : 'team');
  const [year, setYear] = useState(YEAR);
  const [meta, setMeta] = useState<any>(null);
  const [ov, setOv] = useState<any>(null);
  const [mine, setMine] = useState<any>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'my') setMine((await hrAPI.myAppraisals()).data);
      else setOv((await hrAPI.appraisalsOverview({ year, view: tab })).data);
    } catch (e) { alertErr(e); } finally { setLoading(false); }
  }, [tab, year]);
  useEffect(() => { hrAPI.appraisalsMeta().then((r) => setMeta(r.data)).catch(() => {}); if (!isHr) hrAPI.appraisalsOverview({ year, view: 'team' }).then((r) => { if (!(r.data.rows || []).length) setTab('my'); }).catch(() => setTab('my')); }, []);
  useEffect(() => { load(); }, [load]);

  const start = async (r: any) => { try { const res = await hrAPI.createAppraisal(r.employee_id, year); setOpenId(res.data.id); } catch (e) { alertErr(e); } };
  const del = async (r: any) => { if (!window.confirm(`حذف مسودة تقييم ${r.employee_name}؟`)) return; try { await hrAPI.deleteAppraisal(r.appraisal_id); load(); } catch (e) { alertErr(e); } };

  const st = ov?.stats || {};
  const tabs = [...(isHr ? [{ key: 'all', label: 'كل الموظفين' }] : []), { key: 'team', label: 'فريقي' }, { key: 'my', label: 'تقييمي' }];
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="شؤون الموظفين" title="التقييم السنوي" subtitle="6 معايير بمقياس 1–5 مع مؤشرات الحضور والمهام التلقائية — المدير المباشر يقيّم، شؤون الموظفين تعتمد، والموظف يطّلع ويعلّق" onBack={() => goBack()} canExport={false} testID="hr-appraisals-hero" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl', flexWrap: 'wrap', gap: 8 }}>
          <Tabs tabs={tabs} value={tab} onChange={setTab} testID="hr-appr-tabs" />
          {tab !== 'my' && <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...inp, width: 110, marginBottom: 12 }} data-testid="hr-appr-year">{[YEAR + 1, YEAR, YEAR - 1, YEAR - 2].map((y) => <option key={y} value={y}>{y}</option>)}</select>}
        </div>

        {tab !== 'my' && ov && (
          <ReportKpis items={[
            { label: 'الموظفون', value: st.total || 0, color: '#0f2440', icon: 'people' },
            { label: 'لم يبدأ', value: st.not_started || 0, color: '#94a3b8', icon: 'ellipse-outline' },
            { label: 'مسودات', value: st.draft || 0, color: '#0284c7', icon: 'create' },
            { label: 'بانتظار الاعتماد', value: st.submitted || 0, color: '#f97316', icon: 'hourglass' },
            { label: 'معتمد', value: st.approved || 0, color: '#16a34a', icon: 'checkmark-done' },
            { label: 'المتوسط', value: st.avg ?? '—', color: gradeColor(st.avg), icon: 'star' },
          ]} />
        )}

        {loading ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text> : tab === 'my' ? (
          !mine?.profile ? <ReportEmpty text="لا يوجد ملف إداري مرتبط بحسابك" icon="id-card-outline" /> : mine.items.length === 0 ? <ReportEmpty text="لا توجد تقييمات معتمدة لك بعد — ستظهر هنا بعد اعتماد شؤون الموظفين" icon="star-outline" /> : (
            <View style={[reportPage.card, { padding: 0, overflow: 'hidden' }]}>
              <table style={table} data-testid="hr-my-appraisals-table"><Th cols={['السنة', 'النتيجة', 'التقدير', 'المقيّم', 'الحالة', 'صدر في', '']} /><tbody>
                {mine.items.map((a: any) => <tr key={a.id} style={{ borderBottom: '1px solid #eef2f7' }} data-testid={`my-appraisal-${a.id}`}><td style={{ ...td, fontWeight: 800 }}>{a.year}</td><td style={{ ...td, fontWeight: 900, color: gradeColor(a.total_score), fontSize: 15 }}>{a.total_score}</td><td style={td}><Badge color={gradeColor(a.total_score)}>{a.grade}</Badge></td><td style={td}>{a.evaluator_name}</td><td style={td}><Badge color={APPR_STATUS_COLOR[a.status]}>{a.status_label}</Badge></td><td style={{ ...td, fontSize: 11 }}>{fmtDT(a.approved_at)}</td><td style={td}><button onClick={() => setOpenId(a.id)} style={btn('#1565c0', '#fff', { padding: '5px 12px', fontSize: 12 })} data-testid={`my-appraisal-open-${a.id}`}>{a.status === 'approved' ? 'اطّلاع وتعليق' : 'عرض'}</button></td></tr>)}
              </tbody></table>
            </View>
          )
        ) : !ov || ov.rows.length === 0 ? <ReportEmpty text={tab === 'team' ? 'لا يوجد موظفون يتبعونك كمدير مباشر' : 'لا يوجد موظفون'} icon="people-outline" /> : (
          <View style={[reportPage.card, { padding: 0, overflow: 'hidden' }]}>
            <table style={table} data-testid="hr-appraisals-table">
              <Th cols={['الموظف', 'الوحدة', 'المقيّم', 'النتيجة', 'التقدير', 'الحالة', '']} />
              <tbody>
                {ov.rows.map((r: any) => (
                  <tr key={r.employee_id} style={{ borderBottom: '1px solid #eef2f7' }} data-testid={`appr-row-${r.employee_id}`}>
                    <td style={{ ...td, fontWeight: 700, color: '#0f2440' }}>{r.employee_name}<div style={{ fontSize: 10.5, color: '#94a3b8' }}>{r.employee_no}{r.job_title ? ` · ${r.job_title}` : ''}</div></td>
                    <td style={td}>{r.org_unit_name || '—'}</td>
                    <td style={{ ...td, fontSize: 12 }}>{r.evaluator_name || '—'}</td>
                    <td style={{ ...td, fontWeight: 900, color: gradeColor(r.total_score), fontSize: 15 }}>{r.total_score ?? '—'}</td>
                    <td style={td}>{r.grade ? <Badge color={gradeColor(r.total_score)}>{r.grade}</Badge> : '—'}</td>
                    <td style={td}><Badge color={r.status ? APPR_STATUS_COLOR[r.status] : '#cbd5e1'}>{r.status_label}</Badge></td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {r.appraisal_id ? <button onClick={() => setOpenId(r.appraisal_id)} style={btn(r.status === 'submitted' && canManage ? '#16a34a' : '#e3f2fd', r.status === 'submitted' && canManage ? '#fff' : '#1565c0', { padding: '5px 12px', fontSize: 12 })} data-testid={`appr-open-${r.employee_id}`}>{r.status === 'draft' ? 'متابعة التقييم' : r.status === 'submitted' && canManage ? 'مراجعة واعتماد' : 'عرض'}</button>
                        : (tab === 'team' || canManage) && <button onClick={() => start(r)} style={btn('#1565c0', '#fff', { padding: '5px 12px', fontSize: 12 })} data-testid={`appr-start-${r.employee_id}`}>بدء التقييم</button>}
                      {r.status === 'draft' && canManage && <button onClick={() => del(r)} style={btn('transparent', '#c62828', { padding: '5px 8px', fontSize: 12 })} data-testid={`appr-del-${r.employee_id}`}>🗑</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </View>
        )}
      </ScrollView>
      {openId && <AppraisalModal id={openId} meta={meta} onClose={() => setOpenId(null)} onChanged={load} />}
    </SafeAreaView>
  );
}
