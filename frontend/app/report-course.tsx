import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { reportsAPI, coursesAPI, departmentsAPI, facultiesAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { formatGregorianDate } from '../src/utils/dateUtils';
import { CourseFilter } from '../src/components/CourseFilter';
import { ReportHero, ReportKpis, ReportFilters, ReportEmpty, DenseTable, Pill, Bar, downloadReport, reportPage } from '../src/components/reports/ReportShell';

export default function CourseDetailedReport() {
  const params = useLocalSearchParams();
  const { hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [faculties, setFaculties] = useState<any[]>([]);
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCourse, setSelectedCourse] = useState((params.courseId || params.id || '') as string);
  const [reportData, setReportData] = useState<any>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'' | 'pdf' | 'excel'>('');
  const [tab, setTab] = useState<'students' | 'lectures'>('students');
  // 🆕 وضع الاحتساب: بالمحاضرات (الافتراضي والسابق كما هو) أو بالساعات الفعلية
  const [mode, setMode] = useState<'lectures' | 'hours'>('lectures');

  const handleExport = async (fmt: 'pdf' | 'excel') => {
    if (!selectedCourse) return;
    setExporting(fmt);
    await downloadReport(fmt === 'pdf' ? `/reports/course/${selectedCourse}/export-pdf` : `/export/report/course/${selectedCourse}/excel`, { mode }, ['تقرير المقرر', reportData?.course?.name, mode === 'hours' ? 'بالساعات' : ''], fmt === 'pdf' ? 'pdf' : 'xlsx');
    setExporting('');
  };

  const fetchCourses = useCallback(async () => {
    try {
      const [cRes, dRes, fRes] = await Promise.all([coursesAPI.getAll(), departmentsAPI.getAll(), facultiesAPI.getAll()]);
      setCourses(cRes.data);
      setDepartments(dRes.data || []);
      setFaculties(fRes.data || []);
      // pre-fill faculty/dept if course came from URL
      if (selectedCourse) {
        const c = cRes.data.find((x: any) => x.id === selectedCourse);
        if (c) {
          const d = (dRes.data || []).find((x: any) => x.id === c.department_id);
          if (d) { setSelectedDept(d.id); setSelectedFaculty(d.faculty_id || ''); }
        }
      }
    } catch (error) { console.error('Error fetching:', error); }
    finally { setLoading(false); }
  }, [selectedCourse]);

  const fetchReport = useCallback(async () => {
    if (!selectedCourse) return;
    setExecuting(true);
    try {
      setReportError(null);
      setReportData(null);
      const res = await reportsAPI.getCourseDetailedReport(selectedCourse);
      setReportData(res.data);
      setHasRun(true);
    } catch (error: any) {
      console.error('Error fetching report:', error);
      setReportError(error?.response?.data?.detail || 'فشل في تحميل التقرير. حاول مرة أخرى');
    } finally {
      setExecuting(false);
      setRefreshing(false);
    }
  }, [selectedCourse]);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  // إذا تم تمرير المقرر عبر URL -> تنفيذ تلقائي
  useEffect(() => {
    if ((params.courseId || params.id) && selectedCourse && !hasRun && !loading) fetchReport();
  }, [params.courseId, params.id, selectedCourse, hasRun, loading, fetchReport]);

  const onRefresh = () => {
    if (!hasRun) return;
    setRefreshing(true);
    fetchReport();
  };

  const rateColor = (r: number, good = 75, mid = 50) => (r >= good ? '#16a34a' : r >= mid ? '#f97316' : '#dc2626');
  const statusHoursColor = (key: string) => (['excellent', 'good'].includes(key) ? '#16a34a' : key === 'warning' ? '#f97316' : '#dc2626'); // danger/candidate/deprived → أحمر
  const c = reportData?.course;
  const s = reportData?.summary;
  const lowStudents = (reportData?.students || []).filter((x: any) => x.attendance_rate < 60).length;
  const lowStudentsHours = (reportData?.students || []).filter((x: any) => x.exceeded_unexcused_hours || x.exceeded_total_hours).length;
  // 🆕 ترتيب نسخة محلية للعرض بوضع الساعات دون التأثير على ترتيب reportData.students الأصلي (وضع المحاضرات)
  const studentsSortedByHours = [...(reportData?.students || [])].sort((a: any, b: any) => (b.attendance_rate_hours ?? 0) - (a.attendance_rate_hours ?? 0));

  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <ReportHero
          title={c ? c.name : 'تقرير المقرر التفصيلي'}
          subtitle={c ? [c.code, c.teacher_name, c.level ? `المستوى ${c.level}` : '', c.section ? `شعبة ${c.section}` : ''].filter(Boolean).join('  ·  ') : 'حضور كل طالب وسجل كل محاضرة في المقرر'}
          onBack={() => goBack()}
          canExport={!!reportData && hasPermission('export_reports')}
          onPdf={() => handleExport('pdf')}
          onExcel={() => handleExport('excel')}
          exporting={exporting}
          testID="course-report-hero"
          extra={!!reportData && (
            <View style={styles.modeToggle} testID="course-report-mode-toggle">
              <TouchableOpacity style={[styles.modeBtn, mode === 'lectures' && styles.modeBtnActive]} onPress={() => setMode('lectures')} testID="course-report-mode-lectures">
                <Text style={[styles.modeBtnText, mode === 'lectures' && styles.modeBtnTextActive]}>بالمحاضرات</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modeBtn, mode === 'hours' && styles.modeBtnActive]} onPress={() => setMode('hours')} testID="course-report-mode-hours">
                <Text style={[styles.modeBtnText, mode === 'hours' && styles.modeBtnTextActive]}>بالساعات</Text>
              </TouchableOpacity>
            </View>
          )}
        />

        {loading ? <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 30 }} /> : (
          <ReportFilters onRun={fetchReport} running={executing} hasRun={hasRun} disabled={!selectedCourse} runLabel={!selectedCourse ? 'اختر المقرر ثم نفّذ' : undefined}>
            <View style={{ flex: 1, minWidth: 560 }}>
              <CourseFilter
                faculties={faculties}
                departments={departments}
                courses={courses}
                facultyId={selectedFaculty}
                departmentId={selectedDept}
                courseId={selectedCourse}
                onFacultyChange={setSelectedFaculty}
                onDepartmentChange={setSelectedDept}
                onCourseChange={(v) => { setSelectedCourse(v); setReportData(null); setHasRun(false); }}
              />
            </View>
          </ReportFilters>
        )}

        {executing && !refreshing && <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 30 }} />}
        {!executing && !loading && (!selectedCourse || !hasRun) && !reportError && (
          <ReportEmpty text={!selectedCourse ? 'اختر مقرراً ثم اضغط «تنفيذ التقرير»' : 'اضغط «تنفيذ التقرير» لعرض البيانات'} icon="information-circle-outline" />
        )}
        {!executing && reportError && (
          <View style={[reportPage.card, { alignItems: 'center', padding: 30 }]}>
            <Ionicons name="alert-circle-outline" size={48} color="#dc2626" />
            <Text style={{ color: '#dc2626', marginTop: 10, fontWeight: '700', textAlign: 'center' }}>{reportError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchReport} testID="retry-report-btn">
              <Text style={{ color: '#fff', fontWeight: '700' }}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        )}

        {!executing && reportData && s && (<>
          <ReportKpis items={mode === 'hours' ? [
            { label: 'الطلاب', value: s.total_students, color: '#1565c0', icon: 'people' },
            { label: 'الساعات المنفَّذة', value: s.total_hours_executed, color: '#0f2440', icon: 'time' },
            { label: 'متوسط الحضور', value: `${s.avg_attendance_rate_hours}%`, color: rateColor(s.avg_attendance_rate_hours), icon: 'stats-chart' },
            { label: 'طلاب متجاوزون للحد', value: s.exceeded_limit_students ?? lowStudentsHours, color: (s.exceeded_limit_students ?? lowStudentsHours) ? '#dc2626' : '#16a34a', icon: 'alert-circle' },
          ] : [
            { label: 'الطلاب', value: s.total_students, color: '#1565c0', icon: 'people' },
            { label: 'المحاضرات المنعقدة', value: s.total_lectures, color: '#0f2440', icon: 'calendar', sub: s.absent_lectures ? `${s.absent_lectures} غياب مدرّس` : undefined },
            { label: 'متوسط الحضور', value: `${s.avg_attendance_rate}%`, color: rateColor(s.avg_attendance_rate), icon: 'stats-chart' },
            { label: 'طلاب دون 60%', value: lowStudents, color: lowStudents ? '#dc2626' : '#16a34a', icon: 'alert-circle' },
          ]} />
          {mode === 'hours' && !!s.absence_rule_text && (
            <Text style={styles.ruleText} testID="course-report-rule-text">{s.absence_rule_text}</Text>
          )}

          <View style={styles.tabsContainer}>
            <TouchableOpacity style={[styles.tab, tab === 'students' && styles.tabActive]} onPress={() => setTab('students')} testID="tab-students">
              <Ionicons name="people" size={16} color={tab === 'students' ? '#fff' : '#555'} />
              <Text style={[styles.tabText, tab === 'students' && styles.tabTextActive]}>الطلاب ({reportData.students?.length || 0})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, tab === 'lectures' && styles.tabActive]} onPress={() => setTab('lectures')} testID="tab-lectures">
              <Ionicons name="list" size={16} color={tab === 'lectures' ? '#fff' : '#555'} />
              <Text style={[styles.tabText, tab === 'lectures' && styles.tabTextActive]}>سجل المحاضرات ({reportData.lectures?.length || 0})</Text>
            </TouchableOpacity>
          </View>

          {tab === 'students' && mode === 'hours' && (
            <DenseTable testID="course-students-hours" head={['#', 'الطالب', 'رقم القيد', 'ساعات حضور', 'غياب بعذر', 'غياب بلا عذر', 'نسبة الحضور', 'الحالة']}
              align={['center', 'right', 'right', 'center', 'center', 'center', 'right', 'center']} rowTestID={(i) => `course-student-hours-${i}`} emptyText="لا يوجد طلاب مسجلون"
              rows={studentsSortedByHours.map((st: any, i: number) => [i + 1, <b style={{ color: '#0f2440' }}>{st.student_name}</b>, <span style={{ color: '#64748b', direction: 'ltr' }}>{st.student_id}</span>,
                st.executed_hours > 0 ? <Pill color="#16a34a">{st.present_hours}</Pill> : <span style={{ color: '#94a3b8' }}>—</span>,
                st.executed_hours > 0 ? <Pill color="#f59e0b">{st.excused_hours}</Pill> : <span style={{ color: '#94a3b8' }}>—</span>,
                st.executed_hours > 0 ? <Pill color="#dc2626">{st.unexcused_hours}</Pill> : <span style={{ color: '#94a3b8' }}>—</span>,
                st.executed_hours > 0 ? <Bar pct={st.attendance_rate_hours} color={rateColor(st.attendance_rate_hours)} /> : <span style={{ color: '#94a3b8' }}>—</span>,
                st.executed_hours > 0 ? <Pill color={statusHoursColor(st.status_key_hours)}>{st.status_ar_hours}</Pill> : <span style={{ fontSize: 11.5, color: '#94a3b8' }}>لا توجد محاضرات منفَّذة منذ التسجيل</span>])}
              footer={`${(reportData.students || []).length} طالب · ${s.absence_rule_text || ''}`} />
          )}
          {tab === 'students' && mode === 'lectures' && (
            <DenseTable testID="course-students" head={['#', 'الطالب', 'رقم القيد', 'حاضر', 'متأخر', 'غائب', 'نسبة الحضور']}
              align={['center', 'right', 'right', 'center', 'center', 'center', 'right']} rowTestID={(i) => `course-student-${i}`} emptyText="لا يوجد طلاب مسجلون"
              rows={(reportData.students || []).map((st: any, i: number) => [i + 1, <b style={{ color: '#0f2440' }}>{st.student_name}</b>, <span style={{ color: '#64748b', direction: 'ltr' }}>{st.student_id}</span>,
                <Pill color="#16a34a">{st.present}</Pill>, <Pill color="#f59e0b">{st.late}</Pill>, <Pill color="#dc2626">{st.absent}</Pill>, <Bar pct={st.attendance_rate} color={rateColor(st.attendance_rate)} />])}
              footer={`${(reportData.students || []).length} طالب`} />
          )}

          {tab === 'lectures' && mode === 'hours' && (
            <DenseTable testID="course-lectures-hours" head={['#', 'التاريخ', 'الوقت', 'المدة (ساعة)', 'الحضور', 'الموقع', 'النسبة']}
              align={['center', 'right', 'center', 'center', 'right', 'right', 'right']} rowTestID={(i) => `course-lecture-hours-${i}`} emptyText="لا توجد محاضرات"
              rows={(reportData.lectures || []).map((l: any, i: number) => [i + 1,
                <b style={{ color: '#1565c0' }}>{l.date ? formatGregorianDate(new Date(l.date), { includeYear: false, includeWeekday: true }) : '—'}</b>,
                <span style={{ direction: 'ltr', display: 'inline-block' }}>{l.start_time}</span>,
                <span>{l.hours}</span>,
                l.status === 'absent' ? <Pill color="#e65100">لم تنعقد (غياب المدرّس)</Pill> : <span>{l.present_count}/{l.total_students} حاضر</span>,
                l.location_flag === 'outside' ? <span style={{ fontSize: 11.5, color: '#b91c1c', fontWeight: 700 }}>📍 خارج النطاق</span>
                  : l.location_flag === 'no_location' ? <span style={{ fontSize: 11.5, color: '#92400e', fontWeight: 700 }}>📍 بدون موقع</span> : <span style={{ color: '#94a3b8' }}>—</span>,
                l.status === 'absent' ? <Pill color="#e65100">غياب</Pill> : <Bar pct={l.attendance_rate} color={rateColor(l.attendance_rate, 80, 60)} />])}
              footer={`${(reportData.lectures || []).length} محاضرة · إجمالي الساعات المنفَّذة: ${s.total_hours_executed}`} />
          )}
          {tab === 'lectures' && mode === 'lectures' && (
            <DenseTable testID="course-lectures" head={['#', 'التاريخ', 'الوقت', 'الحضور', 'الموقع', 'النسبة']}
              align={['center', 'right', 'center', 'right', 'right', 'right']} rowTestID={(i) => `course-lecture-${i}`} emptyText="لا توجد محاضرات"
              rows={(reportData.lectures || []).map((l: any, i: number) => [i + 1,
                <b style={{ color: '#1565c0' }}>{l.date ? formatGregorianDate(new Date(l.date), { includeYear: false, includeWeekday: true }) : '—'}</b>,
                <span style={{ direction: 'ltr', display: 'inline-block' }}>{l.start_time}</span>,
                l.status === 'absent' ? <Pill color="#e65100">لم تنعقد (غياب المدرّس)</Pill> : <span>{l.present_count}/{l.total_students} حاضر</span>,
                l.location_flag === 'outside' ? <span style={{ fontSize: 11.5, color: '#b91c1c', fontWeight: 700 }} data-testid={`course-lecture-${i}-geo`}>📍 خارج النطاق{l.location_distance_m ? ` (${Math.round(l.location_distance_m) >= 1000 ? `${(l.location_distance_m / 1000).toFixed(1)} كم` : `${Math.round(l.location_distance_m)} م`})` : ''}</span>
                  : l.location_flag === 'no_location' ? <span style={{ fontSize: 11.5, color: '#92400e', fontWeight: 700 }} data-testid={`course-lecture-${i}-geo`}>📍 بدون موقع</span> : <span style={{ color: '#94a3b8' }}>—</span>,
                l.status === 'absent' ? <Pill color="#e65100">غياب</Pill> : <Bar pct={l.attendance_rate} color={rateColor(l.attendance_rate, 80, 60)} />])}
              footer={`${(reportData.lectures || []).length} محاضرة`} />
          )}
        </>)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  retryBtn: { marginTop: 16, backgroundColor: '#1565c0', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  modeToggle: { flexDirection: 'row-reverse', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: 3, gap: 2 },
  modeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  modeBtnActive: { backgroundColor: '#fff' },
  modeBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  modeBtnTextActive: { color: '#0f2440' },
  ruleText: { fontSize: 12, color: '#64748b', marginTop: -4, marginBottom: 10, textAlign: 'right', fontWeight: '600' },
  tabsContainer: { flexDirection: 'row-reverse', gap: 6, marginBottom: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  tabActive: { backgroundColor: '#0f2440', borderColor: '#0f2440' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#555' },
  tabTextActive: { color: '#fff' },
  emptyInline: { textAlign: 'center', color: '#94a3b8', padding: 16 },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  studentRank: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 12, fontWeight: '800', color: '#475569' },
  studentName: { fontSize: 14, fontWeight: '700', color: '#0f2440' },
  studentId: { fontSize: 11, color: '#64748b' },
  miniStats: { flexDirection: 'row', gap: 8 },
  miniStat: { fontSize: 12, fontWeight: '700' },
  rateBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, minWidth: 56, alignItems: 'center' },
  rateText: { fontSize: 13, fontWeight: '800' },
  lectureRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', borderRadius: 8 },
  lectureDate: { backgroundColor: '#e3f2fd', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, minWidth: 70, alignItems: 'center' },
  lectureDateText: { fontSize: 12, fontWeight: '700', color: '#1565c0' },
  lectureTime: { fontSize: 13, fontWeight: '700', color: '#0f2440' },
  lectureStats: { fontSize: 11, color: '#64748b', marginTop: 2 },
});
