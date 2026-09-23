import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '../src/utils/navigation';
import { hrAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { ReportHero, ReportKpis, ReportEmpty, reportPage } from '../src/components/reports/ReportShell';
import { Tabs, Badge, Th, td, table, inp, btn, opt } from '../src/components/hr/ui';
import { TaskFormModal, TaskDetailModal, TASK_STATUS_COLOR, TASK_PRIORITY_COLOR } from '../src/components/hr/TaskModals';

export default function HrTasks() {
  const { hasPermission, user } = useAuth();
  const isHr = user?.role === 'admin' || hasPermission('hr_manage_tasks') || hasPermission('hr_view_employees');
  const [view, setView] = useState(isHr ? 'all' : 'mine');
  const [meta, setMeta] = useState<any>(null);
  const [q, setQ] = useState({ status: 'open,in_progress', priority: '', search: '' });
  const [data, setData] = useState<any>({ items: [], total: 0, stats: {}, team_size: 0 });
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ open: boolean; task: any | null }>({ open: false, task: null });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [canAssign, setCanAssign] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await hrAPI.tasks({ view, ...Object.fromEntries(Object.entries(q).filter(([, v]) => v)), per_page: 60 })).data); } catch { setData({ items: [], total: 0, stats: {} }); }
    finally { setLoading(false); }
  }, [view, q]);
  useEffect(() => { hrAPI.tasksMeta().then((r) => setMeta(r.data)).catch(() => {}); hrAPI.tasksAssignable().then((r) => setCanAssign((r.data.employees || []).length > 0)).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const done = (msg: string) => { window.alert(msg); load(); };
  const st = data.stats || {};
  const tabs = [{ key: 'mine', label: 'مهامي' }, ...(data.team_size > 0 ? [{ key: 'team', label: `مهام فريقي (${data.team_size})` }] : []), { key: 'assigned', label: 'التي أسندتُها' }, ...(isHr ? [{ key: 'all', label: 'كل المهام' }] : [])];

  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="شؤون الموظفين" title="المهام" subtitle="إسناد المهام للموظفين بمواعيد استحقاق ومتابعة التقدم — المدير المباشر لفريقه وشؤون الموظفين للجميع" onBack={() => goBack()} canExport={false} testID="hr-tasks-hero" />
        <ReportKpis items={[
          { label: 'مفتوحة', value: st.open || 0, color: '#0284c7', icon: 'list' },
          { label: 'تستحق خلال أسبوع', value: st.due_week || 0, color: '#f97316', icon: 'time' },
          { label: 'متأخرة', value: st.overdue || 0, color: '#dc2626', icon: 'alert-circle' },
          { label: 'مُنجزة', value: st.done || 0, color: '#16a34a', icon: 'checkmark-done' },
        ]} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl', flexWrap: 'wrap', gap: 8 }}>
          <Tabs tabs={tabs} value={view} onChange={setView} testID="hr-tasks-tabs" />
          {canAssign && <button onClick={() => setForm({ open: true, task: null })} style={btn('#1565c0', '#fff', { marginBottom: 12 })} data-testid="task-new-btn">+ إسناد مهمة</button>}
        </div>
        <View style={reportPage.card}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, direction: 'rtl' }}>
            <input placeholder="بحث بالعنوان" value={q.search} onChange={(e) => setQ((p) => ({ ...p, search: e.target.value }))} style={inp} data-testid="task-search" />
            <select value={q.status} onChange={(e) => setQ((p) => ({ ...p, status: e.target.value }))} style={inp} data-testid="task-filter-status"><option value="open,in_progress">المفتوحة</option><option value="">كل الحالات</option>{opt(meta?.statuses)}</select>
            <select value={q.priority} onChange={(e) => setQ((p) => ({ ...p, priority: e.target.value }))} style={inp} data-testid="task-filter-priority"><option value="">كل الأولويات</option>{opt(meta?.priorities)}</select>
          </div>
        </View>
        {loading ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text>
          : data.items.length === 0 ? <ReportEmpty text={view === 'mine' && !data.has_profile ? 'لا يوجد ملف إداري مرتبط بحسابك' : 'لا توجد مهام مطابقة'} icon="checkbox-outline" />
          : (
            <View style={[reportPage.card, { padding: 0, overflow: 'hidden' }]}>
              <table style={table} data-testid="hr-tasks-table">
                <Th cols={['المهمة', 'المكلَّف', 'أسندها', 'الأولوية', 'الاستحقاق', 'التقدم', 'الحالة']} />
                <tbody>
                  {data.items.map((t: any) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #eef2f7', cursor: 'pointer', backgroundColor: t.overdue ? '#fff5f5' : undefined }} onClick={() => setDetailId(t.id)} data-testid={`task-row-${t.id}`}>
                      <td style={{ ...td, fontWeight: 700, color: '#0f2440', maxWidth: 320 }}>{t.title}</td>
                      <td style={td}>{t.employee_name}<div style={{ fontSize: 10.5, color: '#94a3b8' }}>{t.org_unit_name}</div></td>
                      <td style={{ ...td, fontSize: 12 }}>{t.assigner_name}</td>
                      <td style={td}><Badge color={TASK_PRIORITY_COLOR[t.priority]}>{t.priority_label}</Badge></td>
                      <td style={{ ...td, direction: 'ltr', textAlign: 'right', color: t.overdue ? '#dc2626' : undefined, fontWeight: t.overdue ? 800 : 400 }}>{t.due_date || '—'}</td>
                      <td style={{ ...td, minWidth: 110 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ flex: 1, height: 6, backgroundColor: '#eef2f7', borderRadius: 4, overflow: 'hidden', direction: 'rtl' }}><div style={{ width: `${t.progress}%`, height: '100%', backgroundColor: TASK_STATUS_COLOR[t.status] }} /></div><span style={{ fontSize: 11, fontWeight: 700 }}>{t.progress}%</span></div></td>
                      <td style={td}><Badge color={TASK_STATUS_COLOR[t.status]}>{t.status_label}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: 10, direction: 'rtl', fontSize: 12, color: '#64748b' }} data-testid="hr-tasks-total">الإجمالي: {data.total}</div>
            </View>
          )}
      </ScrollView>
      {form.open && <TaskFormModal meta={meta} task={form.task} onClose={() => setForm({ open: false, task: null })} onSaved={done} />}
      {detailId && <TaskDetailModal taskId={detailId} meta={meta} onClose={() => setDetailId(null)} onChanged={(m) => { load(); }} onEdit={(t) => { setDetailId(null); setForm({ open: true, task: t }); }} />}
    </SafeAreaView>
  );
}
