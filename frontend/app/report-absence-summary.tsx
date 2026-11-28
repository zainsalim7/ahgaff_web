import { goBack } from '../src/utils/navigation';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import api, { departmentsAPI, facultiesAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { facultyMeta, Fac } from '../src/components/results/resultsUi';
import { ReportHero, ReportFilters, ReportEmpty, ReportKpis, downloadReport, reportPage } from '../src/components/reports/ReportShell';
import { AbsenceSummaryTable, SummaryData } from '../src/components/reports/AbsenceSummaryTable';

const Pick = ({ label, value, onChange, items, all, width, enabled = true, testID }: {
  label: string; value: string; onChange: (v: string) => void; items: { id: string; name: string }[]; all: string; width?: number; enabled?: boolean; testID: string;
}) => (
  <View style={width ? { width } : { flex: 1, minWidth: 160 }}>
    <Text style={reportPage.label}>{label}</Text>
    <View style={[reportPage.pickerBox, !enabled && { opacity: 0.6 }]}>
      <Picker selectedValue={value} onValueChange={onChange} style={reportPage.picker} enabled={enabled} testID={testID}>
        <Picker.Item label={all} value="" />
        {items.map((x) => <Picker.Item key={x.id} label={x.name} value={x.id} />)}
      </Picker>
    </View>
  </View>
);

const OUT_AR: Record<string, string> = { first: 'دور أول', takmili: 'تكميلي', repeat: 'إعادة', dismiss: 'فصل' };

export default function AbsenceSummaryReport() {
  const { hasPermission } = useAuth();
  const [faculties, setFaculties] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [f, setF] = useState({ faculty: '', department_id: '', level: '', section: '', semester_id: '' });
  const [data, setData] = useState<SummaryData | null>(null);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState<'' | 'pdf' | 'excel'>('');
  const [err, setErr] = useState('');
  const [outcome, setOutcome] = useState('');

  useEffect(() => {
    departmentsAPI.getAll().then((r) => setDepartments(r.data || [])).catch(() => {});
    facultiesAPI.getAll().then((r) => setFaculties(r.data || [])).catch(() => {});
    api.get('/semesters').then((r) => {
      const list = (r.data?.items || r.data || []) as any[];
      setSemesters(list);
      const act = list.find((s) => s.is_active || s.status === 'active');
      if (act) setF((x) => ({ ...x, semester_id: act.id }));
    }).catch(() => {});
  }, []);

  const meta = facultyMeta(faculties as Fac[], f.faculty || departments.find((d) => d.id === f.department_id)?.faculty_id || '');
  const ready = !!f.department_id && !!f.level;
  const params = () => ({ department_id: f.department_id, level: Number(f.level), ...(f.section ? { section: f.section } : {}), ...(f.semester_id ? { semester_id: f.semester_id } : {}) });
  const run = async () => {
    if (!ready) { setErr('اختر القسم والمستوى'); return; }
    setRunning(true); setErr('');
    try { setData((await api.get('/reports/absence-summary', { params: params() })).data); setOutcome(''); }
    catch (e: any) { setErr(e?.response?.data?.detail || 'فشل تنفيذ التقرير'); }
    finally { setRunning(false); }
  };
  const [briefing, setBriefing] = useState('');
  const exp = async (fmt: 'pdf' | 'excel', view: 'sheet' | 'summary' = 'sheet') => {
    view === 'sheet' ? setExporting(fmt) : setBriefing(fmt);
    await downloadReport('/reports/absence-summary', { ...params(), fmt: fmt === 'pdf' ? 'pdf' : 'xlsx', view, ...(outcome ? { outcome } : {}) },
      [view === 'summary' ? 'ملخص المحصلة' : 'المحصلة النهائية للغياب', `م${f.level}`, f.section, OUT_AR[outcome] || ''], fmt === 'pdf' ? 'pdf' : 'xlsx');
    setExporting(''); setBriefing('');
  };
  const c = data?.counts, cc = data?.cell_counts;
  const shown = !data ? [] : data.rows.filter((r) => !outcome || (outcome === 'first' ? r.all_first : r.outcomes.includes(outcome)));
  const kpi = (key: string, label: string, color: string, icon: any, sub: string) => ({
    label, value: (c as any)?.[key] ?? 0, color, icon, sub, active: outcome === key, testID: `as-kpi-${key}`, onPress: () => setOutcome(outcome === key ? '' : key),
  });
  const canExp = hasPermission('export_reports');

  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero title="المحصلة النهائية للغياب" subtitle="كشف الغياب الرسمي لمستوى وشعبة: دور أول · تكميلي · إعادة · فصل — بحدود إعدادات الكلية"
          onBack={() => goBack()} canExport={!!data?.rows.length && hasPermission('export_reports')} onPdf={() => exp('pdf')} onExcel={() => exp('excel')}
          exporting={exporting} testID="absence-summary-hero" />
        <ReportFilters onRun={run} running={running} hasRun={!!data}>
          <Pick label="الكلية" value={f.faculty} onChange={(v) => setF({ ...f, faculty: v, department_id: '', level: '', section: '' })} items={faculties} all="اختر الكلية" testID="as-faculty" />
          <Pick label="القسم" value={f.department_id} onChange={(v) => setF({ ...f, department_id: v })} enabled={!!f.faculty}
            items={departments.filter((d) => d.faculty_id === f.faculty)} all={f.faculty ? 'اختر القسم' : 'اختر الكلية أولاً'} testID="as-department" />
          <Pick label="المستوى" value={f.level} onChange={(v) => setF({ ...f, level: v })} items={meta.levels} all="اختر" width={120} testID="as-level" />
          <Pick label="الشعبة" value={f.section} onChange={(v) => setF({ ...f, section: v })} items={meta.sections} all={meta.sections.length ? 'الكل' : 'لا توجد شعب'} enabled={meta.sections.length > 0} width={120} testID="as-section" />
          <Pick label="الفصل الدراسي" value={f.semester_id} onChange={(v) => setF({ ...f, semester_id: v })} items={semesters.map((s) => ({ id: s.id, name: `${s.name || ''} ${s.academic_year || ''}`.trim() }))} all="كل الفصول" testID="as-semester" />
        </ReportFilters>
        {!!err && <Text style={{ color: '#c62828', textAlign: 'right', marginBottom: 8 }} testID="as-error">{err}</Text>}
        {data && c && (
          <>
            <ReportKpis testID="as-kpis" items={[
              { label: 'الطلاب', value: data.students, color: '#1a2540', icon: 'people', sub: 'في الكشف', active: !outcome && false, onPress: () => setOutcome(''), testID: 'as-kpi-all' },
              kpi('first', 'دور أول', '#2e7d32', 'checkmark-circle', 'في كل مقرراته'),
              kpi('takmili', 'تكميلي', '#ef6c00', 'alert-circle', `في ${cc?.takmili ?? 0} مقرر`),
              kpi('repeat', 'إعادة', '#c62828', 'refresh-circle', `في ${cc?.repeat ?? 0} مقرر`),
              kpi('dismiss', 'فصل', '#6b0f0f', 'close-circle', `في ${cc?.dismiss ?? 0} مقرر`),
            ]} />
            <Text style={{ fontSize: 11.5, color: '#64748b', textAlign: 'right', marginBottom: 6 }} testID="as-kpi-hint">
              الأرقام = عدد الطلاب: «دور أول» من كانت كل مقرراته دور أول، والبقية من لديه هذه النتيجة في مقرر واحد على الأقل (لذلك قد يُعدّ الطالب في أكثر من مربع). اضغط مربعاً لعرض طلابه فقط وتصديرهم.
            </Text>
            {canExp && (
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }} testID="as-brief-bar">
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#1a2540' }}>ملخص {outcome ? `«${OUT_AR[outcome]}» (${shown.length} طالب)` : `كل الطلاب (${shown.length})`}:</Text>
                {(['pdf', 'excel'] as const).map((fm) => (
                  <TouchableOpacity key={fm} onPress={() => exp(fm, 'summary')} disabled={!!briefing || !shown.length} testID={`as-brief-${fm}`}
                    style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: fm === 'pdf' ? '#b91c1c' : '#15803d', opacity: shown.length ? 1 : 0.5 }}>
                    {briefing === fm ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={fm === 'pdf' ? 'document' : 'grid'} size={13} color="#fff" />}
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>ملخص {fm === 'pdf' ? 'PDF' : 'Excel'}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={{ fontSize: 11.5, color: '#64748b' }}>· أزرار PDF وExcel في الأعلى تصدّر الكشف التفصيلي لنفس الطلاب</Text>
              </View>
            )}
          </>
        )}
        {data && (shown.length ? <AbsenceSummaryTable d={{ ...data, rows: shown }} /> : <ReportEmpty text={outcome ? 'لا يوجد طلاب بهذه النتيجة' : 'لا يوجد طلاب في هذا المستوى/الشعبة'} />)}
      </ScrollView>
    </SafeAreaView>
  );
}
