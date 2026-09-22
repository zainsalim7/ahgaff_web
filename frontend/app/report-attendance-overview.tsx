import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { reportsAPI, departmentsAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { ReportHero, ReportKpis, ReportFilters, ReportEmpty, downloadReport, reportPage } from '../src/components/reports/ReportShell';

export default function AttendanceOverviewReport() {
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [sortBy, setSortBy] = useState<'name' | 'rate'>('rate');
  const [exporting, setExporting] = useState<'' | 'pdf' | 'excel'>('');

  const isTeacher = user?.role === 'teacher';
  const deptName = selectedDept ? departments.find(d => d.id === selectedDept)?.name : undefined;

  const handleExport = async (fmt: 'pdf' | 'excel') => {
    setExporting(fmt);
    const params: any = {};
    if (selectedDept) params.department_id = selectedDept;
    await downloadReport(fmt === 'pdf' ? '/reports/attendance-overview/export-pdf' : '/export/report/attendance-overview/excel', params, ['تقرير الحضور الشامل', deptName], fmt === 'pdf' ? 'pdf' : 'xlsx');
    setExporting('');
  };

  useEffect(() => {
    (async () => {
      try {
        if (!isTeacher) {
          const deptsRes = await departmentsAPI.getAll();
          setDepartments(deptsRes.data);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [isTeacher]);

  const runReport = useCallback(async () => {
    setExecuting(true);
    try {
      const params: any = {};
      if (selectedDept) params.department_id = selectedDept;
      const reportRes = await reportsAPI.getAttendanceOverview(params);
      setCourses(reportRes.data.courses || []);
      setSummary(reportRes.data.summary);
      setHasRun(true);
    } catch (error) {
      console.error('Error running report:', error);
      alert('فشل في تنفيذ التقرير');
    } finally {
      setExecuting(false);
      setRefreshing(false);
    }
  }, [selectedDept]);

  // للمعلم: تحميل تلقائي (ليس له فلاتر)
  useEffect(() => {
    if (isTeacher && !hasRun && !loading) runReport();
  }, [isTeacher, hasRun, loading, runReport]);

  const onRefresh = () => {
    if (!hasRun) return;
    setRefreshing(true);
    runReport();
  };

  const sortedCourses = [...courses].sort((a, b) => sortBy === 'rate' ? b.attendance_rate - a.attendance_rate : a.course_name.localeCompare(b.course_name, 'ar'));
  const lowCount = courses.filter(c => c.attendance_rate < 60).length;
  const rateColor = (r: number) => (r >= 80 ? '#16a34a' : r >= 60 ? '#f97316' : '#dc2626');

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565c0" />
        <Text style={styles.loadingText}>جاري تحميل التقرير...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <ReportHero
          title={isTeacher ? 'تقرير حضور مقرراتي' : 'تقرير الحضور الشامل'}
          subtitle="نسب الحضور لجميع المقررات النشطة — اضغط على أي مقرر لعرض تقريره المفصّل"
          onBack={() => goBack()}
          canExport={hasRun && courses.length > 0 && (isTeacher || hasPermission('export_reports'))}
          onPdf={() => handleExport('pdf')}
          onExcel={() => handleExport('excel')}
          exporting={exporting}
          testID="attendance-overview-hero"
        />

        {!isTeacher && (
          <ReportFilters onRun={runReport} running={executing} hasRun={hasRun}>
            <View style={{ flex: 1, minWidth: 220 }}>
              <Text style={reportPage.label}>القسم</Text>
              <View style={reportPage.pickerBox}>
                <Picker selectedValue={selectedDept} onValueChange={setSelectedDept} style={reportPage.picker}>
                  <Picker.Item label="جميع الأقسام" value="" />
                  {departments.map(d => <Picker.Item key={d.id} label={d.name} value={d.id} />)}
                </Picker>
              </View>
            </View>
            <View>
              <Text style={reportPage.label}>ترتيب حسب</Text>
              <View style={styles.sortRow}>
                {([['rate', 'نسبة الحضور'], ['name', 'الاسم']] as const).map(([k, l]) => (
                  <TouchableOpacity key={k} style={[styles.sortBtn, sortBy === k && styles.sortBtnActive]} onPress={() => setSortBy(k)} testID={`sort-${k}`}>
                    <Text style={[styles.sortBtnText, sortBy === k && styles.sortBtnTextActive]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ReportFilters>
        )}

        {hasRun && summary && (
          <ReportKpis items={[
            { label: 'المقررات', value: summary.total_courses, color: '#1565c0', icon: 'book' },
            { label: 'متوسط الحضور', value: `${summary.avg_attendance_rate}%`, color: rateColor(summary.avg_attendance_rate), icon: 'stats-chart' },
            { label: 'مقررات دون 60%', value: lowCount, color: lowCount ? '#dc2626' : '#16a34a', icon: 'alert-circle' },
          ]} />
        )}

        {!isTeacher && !hasRun && !executing && <ReportEmpty text="اختر الفلاتر ثم اضغط «تنفيذ التقرير» — سيعرض نظرة شاملة على حضور جميع المقررات" icon="information-circle-outline" />}
        {executing && !refreshing && <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 30 }} />}
        {hasRun && !executing && sortedCourses.length === 0 && <ReportEmpty text="لا توجد بيانات" />}

        {hasRun && !executing && sortedCourses.map((course, index) => (
          <TouchableOpacity key={index} style={styles.courseCard} onPress={() => router.push(`/report-course?id=${course.course_id}`)} testID={`overview-course-${course.course_id}`}>
            <View style={[styles.rateStripe, { backgroundColor: rateColor(course.attendance_rate) }]} />
            <View style={styles.courseHeader}>
              <View style={styles.courseInfo}>
                <Text style={styles.courseName}>{course.course_name}</Text>
                <Text style={styles.courseCode}>{course.course_code}</Text>
                {!!course.teacher_name && (
                  <Text style={styles.teacherName}><Ionicons name="person-outline" size={12} color="#666" /> {course.teacher_name}</Text>
                )}
              </View>
              <View style={[styles.rateBadge, { backgroundColor: rateColor(course.attendance_rate) + '18' }]}>
                <Text style={[styles.rateText, { color: rateColor(course.attendance_rate) }]}>{course.attendance_rate}%</Text>
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statItem}><View style={[styles.statDot, { backgroundColor: '#4caf50' }]} /><Text style={styles.statText}>{course.present_count} حاضر</Text></View>
              <View style={styles.statItem}><View style={[styles.statDot, { backgroundColor: '#f44336' }]} /><Text style={styles.statText}>{course.absent_count} غائب</Text></View>
              <View style={styles.statItem}><View style={[styles.statDot, { backgroundColor: '#ff9800' }]} /><Text style={styles.statText}>{course.late_count} متأخر</Text></View>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${course.attendance_rate}%`, backgroundColor: rateColor(course.attendance_rate) }]} />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  sortRow: { flexDirection: 'row-reverse', gap: 6 },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  sortBtnActive: { backgroundColor: '#e3f2fd', borderColor: '#1565c0' },
  sortBtnText: { fontSize: 12, color: '#666', fontWeight: '600' },
  sortBtnTextActive: { color: '#1565c0', fontWeight: '800' },
  courseCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e6ebf2' },
  rateStripe: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 4 },
  courseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  courseInfo: { flex: 1 },
  courseName: { fontSize: 15, fontWeight: '700', color: '#0f2440' },
  courseCode: { fontSize: 12, color: '#666' },
  teacherName: { fontSize: 11, color: '#999', marginTop: 4 },
  rateBadge: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  rateText: { fontSize: 16, fontWeight: '800' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statText: { fontSize: 12, color: '#666' },
  progressBar: { height: 6, backgroundColor: '#eee', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
});
