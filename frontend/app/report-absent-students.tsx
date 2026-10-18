import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { reportsAPI, departmentsAPI, coursesAPI, facultiesAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { CourseFilter } from '../src/components/CourseFilter';
import { ReportHero, ReportKpis, ReportFilters, ReportEmpty, DenseTable, Pill, Bar, downloadReport, reportPage } from '../src/components/reports/ReportShell';

export default function AbsentStudentsReport() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [metaLoading, setMetaLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const [students, setStudents] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [faculties, setFaculties] = useState<any[]>([]);
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [minAbsenceRate, setMinAbsenceRate] = useState(25);
  const [summary, setSummary] = useState<any>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [exporting, setExporting] = useState<'' | 'pdf' | 'excel'>('');

  // جلب بيانات الفلاتر فقط — بدون تنفيذ التقرير تلقائياً
  useEffect(() => {
    (async () => {
      try {
        const [deptsRes, coursesRes, facsRes] = await Promise.all([departmentsAPI.getAll(), coursesAPI.getAll(), facultiesAPI.getAll()]);
        setDepartments(deptsRes.data || []);
        setCourses(coursesRes.data || []);
        setFaculties(facsRes.data || []);
      } catch (e) { console.error('Error loading filters:', e); }
      finally { setMetaLoading(false); }
    })();
  }, []);

  const buildParams = () => {
    const params: any = { min_absence_rate: minAbsenceRate };
    if (selectedDept) params.department_id = selectedDept;
    if (selectedCourse) params.course_id = selectedCourse;
    return params;
  };

  const runReport = useCallback(async () => {
    setExecuting(true);
    try {
      const reportRes = await reportsAPI.getAbsentStudents(buildParams());
      setStudents(reportRes.data.students || []);
      setSummary(reportRes.data);
      setExpanded({});
      setHasRun(true);
    } catch (e) {
      console.error('Error running report:', e);
      alert('فشل في تنفيذ التقرير');
    } finally {
      setExecuting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDept, selectedCourse, minAbsenceRate]);

  const handleExport = async (fmt: 'pdf' | 'excel') => {
    setExporting(fmt);
    const deptName = departments.find(d => d.id === selectedDept)?.name;
    const courseName = courses.find(c => c.id === selectedCourse)?.name;
    await downloadReport(fmt === 'pdf' ? '/reports/absent-students/export-pdf' : '/export/report/absent-students/excel', buildParams(), ['تقرير الطلاب المتغيبين', deptName, courseName], fmt === 'pdf' ? 'pdf' : 'xlsx');
    setExporting('');
  };

  const toggleExpand = (i: number) => setExpanded(prev => ({ ...prev, [i]: !prev[i] }));
  const rateColor = (r: number) => (r >= 40 ? '#dc2626' : r >= 25 ? '#f97316' : '#eab308');

  if (metaLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f44336" />
        <Text style={styles.loadingText}>جاري تحميل الفلاتر...</Text>
      </View>
    );
  }

  const uniqueStudents = new Set(students.map(s => s.student_id)).size;

  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero
          title="الطلاب المتغيبون"
          subtitle="الطلاب الذين تجاوزت نسبة غيابهم الحد الأدنى المحدد — مرتبون تنازلياً حسب نسبة الغياب"
          onBack={() => goBack()}
          canExport={hasRun && students.length > 0 && hasPermission('export_reports')}
          onPdf={() => handleExport('pdf')}
          onExcel={() => handleExport('excel')}
          exporting={exporting}
          testID="absent-students-hero"
        />

        <ReportFilters onRun={runReport} running={executing} hasRun={hasRun}>
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
              onCourseChange={setSelectedCourse}
              required={false}
            />
          </View>
          <View>
            <Text style={reportPage.label}>الحد الأدنى لنسبة الغياب</Text>
            <View style={styles.thresholdBtns}>
              {[15, 25, 35, 50].map(rate => (
                <TouchableOpacity key={rate} style={[styles.thresholdBtn, minAbsenceRate === rate && styles.thresholdBtnActive]} onPress={() => setMinAbsenceRate(rate)} testID={`threshold-${rate}`}>
                  <Text style={[styles.thresholdBtnText, minAbsenceRate === rate && styles.thresholdBtnTextActive]}>{rate}%</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ReportFilters>

        {!hasRun && !executing && <ReportEmpty text="اختر الفلاتر ثم اضغط «تنفيذ التقرير» — سيعرض الطلاب الذين تجاوزوا الحد الأدنى لنسبة الغياب" icon="information-circle-outline" />}
        {executing && <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 30 }} />}

        {hasRun && !executing && (
          <ReportKpis items={[
            { label: 'حالات الغياب', value: summary?.total_count || 0, color: '#dc2626', icon: 'alert-circle', sub: 'طالب × مقرر' },
            { label: 'طلاب فريدون', value: uniqueStudents, color: '#1565c0', icon: 'people' },
            { label: 'حد الغياب', value: `${minAbsenceRate}%+`, color: '#f97316', icon: 'options' },
          ]} />
        )}

        {hasRun && !executing && students.length === 0 && <ReportEmpty text="لا يوجد طلاب متغيبون بهذه النسبة" icon="checkmark-circle-outline" />}

        {hasRun && !executing && students.length > 0 && (
          <DenseTable testID="absent-students" head={['#', 'الطالب', 'رقم القيد', 'القسم / المستوى', 'المقرر', 'غياب', 'تأخير', 'حضور', 'الإجمالي', 'نسبة الغياب', '']}
            align={['center', 'right', 'right', 'right', 'right', 'center', 'center', 'center', 'center', 'right', 'center']}
            rowTestID={(i) => `student-row-${i}`} onRowClick={(i) => toggleExpand(i)}
            rows={students.map((st, i) => [i + 1, <b style={{ color: '#0f2440' }}>{st.student_name}</b>, <span style={{ color: '#64748b', direction: 'ltr' }}>{st.student_id}</span>,
              <span style={{ color: '#475569', fontSize: 12 }}>{st.department_name || '—'}{st.level ? ` · م${st.level}${st.section ? ` (${st.section})` : ''}` : ''}</span>,
              <span>{st.course_name} <span style={{ color: '#94a3b8', fontSize: 11 }}>({st.course_code})</span></span>,
              <Pill color="#dc2626">{st.absent_count}</Pill>, <Pill color="#f59e0b">{st.late_count ?? 0}</Pill>, <Pill color="#16a34a">{st.present_count ?? (st.total_lectures - st.absent_count)}</Pill>, st.total_lectures,
              <Bar pct={st.absence_rate} color={rateColor(st.absence_rate)} />,
              <span style={{ color: '#1565c0', fontSize: 11.5 }}>{expanded[i] ? '▲' : '▼'}</span>])}
            expand={(i) => expanded[i] ? (
              <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: '#475569', padding: '4px 0' }}>
                {students[i].student_phone ? <span>📞 الهاتف: <b style={{ direction: 'ltr', display: 'inline-block' }}>{students[i].student_phone}</b></span> : null}
                {students[i].last_absent_date ? <span>📅 آخر غياب: <b>{students[i].last_absent_date}</b></span> : null}
                <span>📈 نسبة الحضور: <b style={{ color: '#2e7d32' }}>{students[i].presence_rate ?? (100 - students[i].absence_rate)}%</b></span>
                <button onClick={(e) => { e.stopPropagation(); router.push(`/report-student?id=${students[i].student_id}`); }} data-testid={`view-full-${i}`} style={{ marginRight: 'auto', background: '#e3f2fd', color: '#1565c0', border: 'none', borderRadius: 6, padding: '4px 10px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>عرض تقرير الطالب الكامل ‹</button>
              </div>
            ) : null}
            footer={`${students.length} حالة · اضغط على الصف لعرض التفاصيل`} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  thresholdBtns: { flexDirection: 'row-reverse', gap: 6 },
  thresholdBtn: { height: 36, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: '#f1f5f9', borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  thresholdBtnActive: { backgroundColor: '#ffebee', borderColor: '#dc2626' },
  thresholdBtnText: { fontSize: 13, color: '#666', fontWeight: '600' },
  thresholdBtnTextActive: { color: '#dc2626', fontWeight: '800' },
  studentCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, borderRightWidth: 4, borderWidth: 1, borderColor: '#e6ebf2' },
  studentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  studentName: { fontSize: 15, fontWeight: '700', color: '#0f2440', textAlign: 'right' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 2 },
  metaItem: { fontSize: 11, color: '#666' },
  metaDot: { fontSize: 11, color: '#ccc', marginHorizontal: 5 },
  rateBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, marginRight: 8 },
  rateText: { fontSize: 14, fontWeight: '800' },
  courseRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8, backgroundColor: '#f5f7fa', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  courseName: { flex: 1, fontSize: 12, color: '#333', textAlign: 'right' },
  courseCode: { fontSize: 10, color: '#999' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '700', color: '#333' },
  statLabel: { fontSize: 10, color: '#666', marginTop: 1 },
  progressBar: { height: 5, backgroundColor: '#eee', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  expandHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 },
  expandHintText: { fontSize: 11, color: '#999' },
  detailsBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fafafa', padding: 10, borderRadius: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  detailLabel: { fontSize: 12, color: '#666', fontWeight: '600' },
  detailValue: { fontSize: 12, color: '#333', flex: 1, textAlign: 'right' },
  viewFullBtn: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, backgroundColor: '#e3f2fd', borderRadius: 8 },
  viewFullText: { fontSize: 12, color: '#1565c0', fontWeight: '700' },
});
