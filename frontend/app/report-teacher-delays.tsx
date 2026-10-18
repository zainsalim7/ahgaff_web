import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import api, { departmentsAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { ReportHero, ReportEmpty, downloadReport, reportPage } from '../src/components/reports/ReportShell';
import { HrSelect } from '../src/components/hr/HrSelect';
import { btn } from '../src/components/hr/ui';

interface Delay { date: string; course_id?: string; course_name: string; start_time: string; started_at: string; delay_minutes: number; source?: string; source_label?: string; recorded_by_name?: string; exceeds_limit?: boolean }
interface TeacherDelay { teacher_id: string; teacher_name: string; employee_id: string; total_lectures: number; delayed_lectures: number; total_delay_minutes: number; avg_delay_minutes: number; max_delay_minutes: number; delays: Delay[] }

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoDate = (v?: string | null) => {
  if (!v) return '';
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  return m ? `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` : '';
};
const weekRange = (offset: number) => { const t = new Date(); const dow = (t.getDay() + 1) % 7; const sat = new Date(t); sat.setDate(t.getDate() - dow + offset * 7); const thu = new Date(sat); thu.setDate(sat.getDate() + 5); return [iso(sat), iso(thu)]; };
const presets: { key: string; label: string; range: () => string[] }[] = [
  { key: 'week', label: 'هذا الأسبوع', range: () => weekRange(0) },
  { key: 'lastweek', label: 'الأسبوع الماضي', range: () => weekRange(-1) },
  { key: 'month', label: 'هذا الشهر', range: () => { const t = new Date(); return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), iso(t)]; } },
  { key: 'd30', label: 'آخر 30 يوماً', range: () => { const t = new Date(); const s = new Date(t); s.setDate(t.getDate() - 29); return [iso(s), iso(t)]; } },
];
const dateInp: React.CSSProperties = { padding: '7px 8px', borderRadius: 8, border: '1px solid #dde3ec', fontSize: 12.5, fontFamily: 'inherit', background: '#fff', direction: 'ltr', width: 140 };
const delayColor = (m: number) => (m === 0 ? '#16a34a' : m <= 5 ? '#d97706' : m <= 15 ? '#dc2626' : '#7f1d1d');
const th: React.CSSProperties = { padding: '7px 8px', fontSize: 12, fontWeight: 800, color: '#0f2440', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'right', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '6px 8px', fontSize: 12.5, borderBottom: '1px solid #f1f5f9', textAlign: 'right', verticalAlign: 'middle' };
const num: React.CSSProperties = { ...td, textAlign: 'center', fontVariantNumeric: 'tabular-nums' };

/** 🕒 تقرير تأخر المعلمين — فلاتر كلية/قسم/مقرر/أستاذ + جدول كثيف قابل للتوسيع */
export default function TeacherDelaysReport() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [executing, setExecuting] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [teachers, setTeachers] = useState<TeacherDelay[]>([]);
  const [summary, setSummary] = useState({ total_teachers: 0, total_delayed_teachers: 0, total_delay_incidents: 0 });
  const [faculties, setFaculties] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [allTeachers, setAllTeachers] = useState<any[]>([]);
  const [f, setF] = useState({ faculty_id: '', department_id: '', course_id: '', teacher_id: '', start_date: '', end_date: '' });
  const [semesters, setSemesters] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [ran, setRan] = useState<{ start_date?: string; end_date?: string }>({});
  const [onlyDelayed, setOnlyDelayed] = useState(false);
  const [exportingFmt, setExportingFmt] = useState<'' | 'pdf' | 'excel'>('');

  useEffect(() => {
    (async () => {
      try {
        const [fa, de, co, te, se] = await Promise.all([api.get('/faculties'), departmentsAPI.getAll(), api.get('/courses', { params: { all_semesters: true, fields: 'name,code,department_id,teacher_id,teacher_name' } }), api.get('/teachers'), api.get('/semesters').catch(() => ({ data: [] }))]);
        setFaculties(fa.data || []); setDepartments(de.data || []); setCourses(co.data || []); setAllTeachers(te.data || []); setSemesters((se.data || []).filter((x: any) => isoDate(x.start_date) && isoDate(x.end_date)));
      } catch (e) { console.error(e); }
    })();
  }, []);

  const depts = useMemo(() => departments.filter((d) => !f.faculty_id || d.faculty_id === f.faculty_id), [departments, f.faculty_id]);
  const deptIds = useMemo(() => new Set(depts.map((d) => d.id)), [depts]);
  const courseOpts = useMemo(() => courses.filter((c) => (f.department_id ? c.department_id === f.department_id : !f.faculty_id || deptIds.has(c.department_id)) && (!f.teacher_id || c.teacher_id === f.teacher_id)), [courses, f.department_id, f.faculty_id, f.teacher_id, deptIds]);
  const teacherOpts = useMemo(() => {
    const scoped = courses.filter((c) => (f.department_id ? c.department_id === f.department_id : !f.faculty_id || deptIds.has(c.department_id)));
    const ids = new Set(scoped.map((c) => c.teacher_id).filter(Boolean));
    return allTeachers.filter((t) => (!f.faculty_id && !f.department_id) || ids.has(t.id));
  }, [allTeachers, courses, f.faculty_id, f.department_id, deptIds]);

  const params = useCallback(() => Object.fromEntries(Object.entries(f).filter(([, v]) => v)), [f]);
  const fetchData = useCallback(async () => {
    setExecuting(true);
    try {
      const r = await api.get('/reports/teacher-delays', { params: params() });
      setTeachers(r.data.teachers || []); setSummary(r.data.summary || {}); setHasRun(true); setExpanded(null); setRan({ start_date: f.start_date, end_date: f.end_date });
    } catch (e) { console.error(e); } finally { setExecuting(false); }
  }, [params, f.start_date, f.end_date]);

  const handleExport = async (fmt: 'pdf' | 'excel') => {
    setExportingFmt(fmt);
    const scope = [f.start_date || f.end_date ? `${f.start_date || '…'} → ${f.end_date || '…'}` : undefined, faculties.find((x) => x.id === f.faculty_id)?.name, departments.find((x) => x.id === f.department_id)?.name, courses.find((x) => x.id === f.course_id)?.name, allTeachers.find((x) => x.id === f.teacher_id)?.full_name].filter(Boolean).join(' - ');
    await downloadReport(fmt === 'pdf' ? '/reports/teacher-delays/export-pdf' : '/reports/teacher-delays/export', params(), ['تقرير تأخر المعلمين', scope || undefined], fmt === 'pdf' ? 'pdf' : 'xlsx');
    setExportingFmt('');
  };

  const rows = onlyDelayed ? teachers.filter((t) => t.delayed_lectures > 0) : teachers;
  const totalMinutes = teachers.reduce((a, t) => a + t.total_delay_minutes, 0);
  const kpi = (label: string, value: number | string, color: string, active?: boolean, onClick?: () => void, testID?: string) => (
    <div onClick={onClick} data-testid={testID} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: `1.5px solid ${color}`, background: active ? color : '#fff', color: active ? '#fff' : color, fontSize: 12, fontWeight: 700, cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
      <span style={{ fontWeight: 400, color: active ? '#fff' : '#64748b' }}>{label}</span><span style={{ fontSize: 15, fontWeight: 800 }}>{value}</span>
    </div>
  );

  return (
    <SafeAreaView style={reportPage.container}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero title="تقرير تأخر المعلمين" subtitle="الفرق بين وقت بداية المحاضرة المجدول ووقت بدء تسجيل الحضور" onBack={() => router.back()} canExport={hasPermission('export_reports')} onPdf={() => handleExport('pdf')} onExcel={() => handleExport('excel')} exporting={exportingFmt} testID="teacher-delays-hero" />
        <View style={[reportPage.card, { padding: 10, marginBottom: 10 }]} testID="teacher-delays-filters">
          <div style={{ direction: 'rtl', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <HrSelect value={f.faculty_id} onChange={(v) => setF({ ...f, faculty_id: v, department_id: '', course_id: '', teacher_id: '' })} options={faculties.map((x) => ({ value: x.id, label: x.name }))} placeholder="كل الكليات" style={{ minWidth: 180, flex: 1 }} testID="td-faculty" />
            <HrSelect value={f.department_id} onChange={(v) => setF({ ...f, department_id: v, course_id: '', teacher_id: '' })} options={depts.map((x) => ({ value: x.id, label: x.name }))} placeholder="كل الأقسام" style={{ minWidth: 180, flex: 1 }} testID="td-dept" />
            <HrSelect value={f.teacher_id} onChange={(v) => setF({ ...f, teacher_id: v, course_id: '' })} options={teacherOpts.map((x) => ({ value: x.id, label: x.full_name, sub: x.teacher_id }))} placeholder="كل الأساتذة" searchable style={{ minWidth: 200, flex: 1 }} testID="td-teacher" />
            <HrSelect value={f.course_id} onChange={(v) => setF({ ...f, course_id: v })} options={courseOpts.map((x) => ({ value: x.id, label: x.name, sub: x.teacher_name || x.code }))} placeholder="كل المقررات" searchable style={{ minWidth: 200, flex: 1 }} testID="td-course" />
            <button onClick={fetchData} disabled={executing} style={btn('#1565c0', '#fff', { padding: '8px 18px', whiteSpace: 'nowrap' })} data-testid="run-report-btn">{executing ? 'جاري التنفيذ…' : hasRun ? '▶ إعادة التنفيذ' : '▶ تنفيذ التقرير'}</button>
          </div>
          <div style={{ direction: 'rtl', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8 }} data-testid="td-date-row">
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>📅 الفترة:</span>
            <input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} style={dateInp} data-testid="td-date-from" />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>إلى</span>
            <input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} style={dateInp} data-testid="td-date-to" />
            {presets.map((p) => { const [a, b] = p.range(); const on = f.start_date === a && f.end_date === b; return <button key={p.key} onClick={() => setF({ ...f, start_date: a, end_date: b })} style={btn(on ? '#0f2440' : '#f1f5f9', on ? '#fff' : '#0f2440', { padding: '5px 10px', fontSize: 11.5 })} data-testid={`td-preset-${p.key}`}>{p.label}</button>; })}
            {semesters.map((sm) => { const a = isoDate(sm.start_date), b = isoDate(sm.end_date); const on = f.start_date === a && f.end_date === b; return <button key={sm.id} onClick={() => setF({ ...f, start_date: a, end_date: b })} style={btn(on ? '#6a1b9a' : '#f3e5f5', on ? '#fff' : '#6a1b9a', { padding: '5px 10px', fontSize: 11.5 })} data-testid={`td-preset-sem-${sm.id}`}>🎓 {sm.name} {sm.academic_year}</button>; })}
            {(f.start_date || f.end_date) && <button onClick={() => setF({ ...f, start_date: '', end_date: '' })} style={btn('#fff', '#dc2626', { padding: '5px 10px', fontSize: 11.5, border: '1px solid #fecaca' })} data-testid="td-date-clear">✕ كل الفترات</button>}
          </div>
          {hasRun && (
            <div style={{ direction: 'rtl', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }} data-testid="teacher-delays-kpis">
              {(ran.start_date || ran.end_date) && kpi('الفترة', `${ran.start_date || '…'} → ${ran.end_date || '…'}`, '#475569', false, undefined, 'td-kpi-period')}
              {kpi('المعلمون', summary.total_teachers, '#1565c0', !onlyDelayed, () => setOnlyDelayed(false), 'td-kpi-all')}
              {kpi('معلمون تأخروا', summary.total_delayed_teachers, '#d97706', onlyDelayed, () => setOnlyDelayed(true), 'td-kpi-delayed')}
              {kpi('حالات التأخر', summary.total_delay_incidents, '#dc2626', false, undefined, 'td-kpi-incidents')}
              {kpi('إجمالي دقائق التأخر', totalMinutes, '#6a1b9a', false, undefined, 'td-kpi-minutes')}
              {kpi('نسبة المتأخرين', summary.total_teachers ? `${Math.round((summary.total_delayed_teachers * 100) / summary.total_teachers)}%` : '0%', '#0f2440', false, undefined, 'td-kpi-pct')}
            </div>
          )}
        </View>

        {executing ? <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 30 }} />
          : !hasRun ? <ReportEmpty text="اختر الفلاتر ثم اضغط «تنفيذ التقرير»" icon="information-circle-outline" />
          : rows.length === 0 ? <ReportEmpty text="لا توجد بيانات تأخر ضمن هذه الفلاتر — سيظهر التقرير عندما يبدأ المعلمون بالتحضير" icon="checkmark-circle-outline" />
          : (
            <View style={[reportPage.card, { padding: 0, overflow: 'hidden' }]} testID="teacher-delays-table-card">
              <div style={{ direction: 'rtl', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="teacher-delays-table">
                  <thead><tr>
                    <th style={{ ...th, width: 36 }}>#</th><th style={th}>المعلم</th><th style={th}>الرقم الوظيفي</th>
                    <th style={{ ...th, textAlign: 'center' }}>المحاضرات</th><th style={{ ...th, textAlign: 'center' }}>متأخرة</th><th style={{ ...th, minWidth: 140 }}>نسبة التأخر</th>
                    <th style={{ ...th, textAlign: 'center' }}>إجمالي (د)</th><th style={{ ...th, textAlign: 'center' }}>متوسط (د)</th><th style={{ ...th, textAlign: 'center' }}>أقصى (د)</th><th style={{ ...th, width: 90 }}>التفاصيل</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((t, i) => {
                      const pct = t.total_lectures ? Math.round((t.delayed_lectures * 100) / t.total_lectures) : 0;
                      const open = expanded === t.teacher_id;
                      const c = delayColor(t.avg_delay_minutes);
                      return (
                        <React.Fragment key={t.teacher_id}>
                          <tr style={{ background: open ? '#f8fafc' : undefined, cursor: 'pointer' }} onClick={() => setExpanded(open ? null : t.teacher_id)} data-testid={`teacher-delay-${t.employee_id}`}>
                            <td style={num}>{i + 1}</td>
                            <td style={{ ...td, fontWeight: 700, color: '#0f2440' }}>{t.teacher_name}</td>
                            <td style={{ ...td, color: '#64748b', direction: 'ltr', textAlign: 'right' }}>{t.employee_id}</td>
                            <td style={num}>{t.total_lectures}</td>
                            <td style={{ ...num, fontWeight: 800, color: t.delayed_lectures ? '#dc2626' : '#16a34a' }}>{t.delayed_lectures}</td>
                            <td style={td}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: 6, background: c }} /></div><span style={{ fontSize: 11.5, color: c, fontWeight: 700, minWidth: 32 }}>{pct}%</span></div></td>
                            <td style={{ ...num, fontWeight: 700 }}>{t.total_delay_minutes}</td>
                            <td style={{ ...num, color: c, fontWeight: 700 }}>{t.avg_delay_minutes}</td>
                            <td style={{ ...num, color: delayColor(t.max_delay_minutes), fontWeight: 700 }}>{t.max_delay_minutes}</td>
                            <td style={{ ...td, color: '#1565c0', fontSize: 11.5, whiteSpace: 'nowrap' }}>{t.delays.length ? (open ? '▲ إخفاء' : `▼ ${t.delays.length} تأخر`) : <span style={{ color: '#16a34a' }}>✓ منضبط</span>}</td>
                          </tr>
                          {open && t.delays.length > 0 && (
                            <tr data-testid={`teacher-delay-details-${t.employee_id}`}><td colSpan={10} style={{ padding: '4px 24px 10px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr>{['التاريخ', 'المقرر', 'الموعد', 'بدء التحضير', 'التأخر', 'ملاحظة / المصدر'].map((h) => <th key={h} style={{ ...th, background: 'transparent', fontSize: 11.5, padding: '4px 8px' }}>{h}</th>)}</tr></thead>
                                <tbody>{[...t.delays].sort((a, b) => (a.date < b.date ? 1 : -1)).map((d, j) => (
                                  <tr key={j}><td style={{ ...td, fontSize: 12 }}>{d.date}</td><td style={{ ...td, fontSize: 12 }}>{d.course_name}</td><td style={{ ...td, fontSize: 12, direction: 'ltr' }}>{d.start_time}</td><td style={{ ...td, fontSize: 12, direction: 'ltr' }}>{d.started_at}</td>
                                    <td style={{ ...td, fontSize: 12 }}><span style={{ background: delayColor(d.delay_minutes) + '18', color: delayColor(d.delay_minutes), fontWeight: 800, padding: '2px 8px', borderRadius: 6 }}>{d.delay_minutes} د</span></td>
                                    <td style={{ ...td, fontSize: 11.5, color: d.source === 'offline' ? '#0e7490' : d.source === 'other_user' ? '#6a1b9a' : d.exceeds_limit ? '#b45309' : '#94a3b8' }} data-testid={`delay-source-${t.employee_id}-${j}`}>{d.source_label || (d.recorded_by_name ? `سجّله ${d.recorded_by_name}` : '—')}</td></tr>
                                ))}</tbody>
                              </table>
                            </td></tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Text style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right', padding: 8 }}>{rows.length} معلم · اضغط على الصف لعرض تفاصيل التأخيرات</Text>
            </View>
          )}
      </ScrollView>
    </SafeAreaView>
  );
}
