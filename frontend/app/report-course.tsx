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
import { ReportHero, ReportKpis, ReportFilters, ReportEmpty, downloadReport, reportPage } from '../src/components/reports/ReportShell';

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

  const handleExport = async (fmt: 'pdf' | 'excel') => {
    if (!selectedCourse) return;
    setExporting(fmt);
    await downloadReport(fmt === 'pdf' ? `/reports/course/${selectedCourse}/export-pdf` : `/export/report/course/${selectedCourse}/excel`, {}, ['تقرير المقرر', reportData?.course?.name], fmt === 'pdf' ? 'pdf' : 'xlsx');
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
  const c = reportData?.course;
  const s = reportData?.summary;
  const lowStudents = (reportData?.students || []).filter((x: any) => x.attendance_rate < 60).length;

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
        />

        {loading ? <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 30 }} /> : (
          <ReportFilters onRun={fetchReport} running={executing} hasRun={hasRun} disabled={!selectedCourse} runLabel={!selectedCourse ? 'اختر المقرر ثم نفّذ' : undefined}>
            <View style={{ width: '100%' }}>
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
          <ReportKpis items={[
            { label: 'الطلاب', value: s.total_students, color: '#1565c0', icon: 'people' },
            { label: 'المحاضرات المنعقدة', value: s.total_lectures, color: '#0f2440', icon: 'calendar', sub: s.absent_lectures ? `${s.absent_lectures} غياب مدرّس` : undefined },
            { label: 'متوسط الحضور', value: `${s.avg_attendance_rate}%`, color: rateColor(s.avg_attendance_rate), icon: 'stats-chart' },
            { label: 'طلاب دون 60%', value: lowStudents, color: lowStudents ? '#dc2626' : '#16a34a', icon: 'alert-circle' },
          ]} />

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

          {tab === 'students' && (
            <View style={reportPage.card}>
              {(reportData.students || []).length === 0 && <Text style={styles.emptyInline}>لا يوجد طلاب مسجلون</Text>}
              {(reportData.students || []).map((student: any, index: number) => (
                <View key={index} style={styles.studentRow} testID={`course-student-${index}`}>
                  <View style={styles.studentRank}><Text style={styles.rankText}>{index + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.studentName}>{student.student_name}</Text>
                    <Text style={styles.studentId}>{student.student_id}</Text>
                  </View>
                  <View style={styles.miniStats}>
                    <Text style={[styles.miniStat, { color: '#16a34a' }]}>{student.present} ح</Text>
                    <Text style={[styles.miniStat, { color: '#f97316' }]}>{student.late} م</Text>
                    <Text style={[styles.miniStat, { color: '#dc2626' }]}>{student.absent} غ</Text>
                  </View>
                  <View style={[styles.rateBadge, { backgroundColor: rateColor(student.attendance_rate) + '18' }]}>
                    <Text style={[styles.rateText, { color: rateColor(student.attendance_rate) }]}>{student.attendance_rate}%</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {tab === 'lectures' && (
            <View style={reportPage.card}>
              {(reportData.lectures || []).length === 0 && <Text style={styles.emptyInline}>لا توجد محاضرات</Text>}
              {(reportData.lectures || []).map((lecture: any, index: number) => (
                <View key={index} style={[styles.lectureRow, lecture.status === 'absent' && { backgroundColor: '#fff8f0' }]} testID={`course-lecture-${index}`}>
                  <View style={styles.lectureDate}>
                    <Text style={styles.lectureDateText}>{lecture.date ? formatGregorianDate(new Date(lecture.date), { includeYear: false, includeWeekday: false }) : '—'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lectureTime}>{lecture.start_time}</Text>
                    <Text style={styles.lectureStats}>{lecture.status === 'absent' ? 'لم تنعقد (غياب المدرّس)' : `${lecture.present_count}/${lecture.total_students} حاضر`}</Text>
                  </View>
                  {lecture.status === 'absent' ? (
                    <View style={[styles.rateBadge, { backgroundColor: '#fff3e0' }]}><Text style={[styles.rateText, { color: '#e65100' }]}>غياب</Text></View>
                  ) : (
                    <View style={[styles.rateBadge, { backgroundColor: rateColor(lecture.attendance_rate, 80, 60) + '18' }]}>
                      <Text style={[styles.rateText, { color: rateColor(lecture.attendance_rate, 80, 60) }]}>{lecture.attendance_rate}%</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </>)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  retryBtn: { marginTop: 16, backgroundColor: '#1565c0', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  tabsContainer: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
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
