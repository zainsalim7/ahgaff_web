import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { reportsAPI, departmentsAPI, coursesAPI, facultiesAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { CourseFilter } from '../src/components/CourseFilter';
import { ReportHero, ReportKpis, ReportFilters, ReportEmpty, downloadReport, reportPage } from '../src/components/reports/ReportShell';

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
              onCourseChange={setSelectedCourse}
              required={false}
            />
          </View>
          <View style={{ width: '100%' }}>
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

        {hasRun && !executing && students.map((student, index) => {
          const isOpen = !!expanded[index];
          const color = rateColor(student.absence_rate);
          return (
            <View key={index} style={[styles.studentCard, { borderRightColor: color }]} testID={`student-row-${index}`}>
              <TouchableOpacity onPress={() => toggleExpand(index)} activeOpacity={0.7}>
                <View style={styles.studentHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.studentName}>{student.student_name}</Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaItem}>{student.student_id}</Text>
                      {student.department_name ? <Text style={styles.metaDot}>•</Text> : null}
                      {student.department_name ? <Text style={styles.metaItem}>{student.department_name}</Text> : null}
                      {student.level ? <Text style={styles.metaDot}>•</Text> : null}
                      {student.level ? <Text style={styles.metaItem}>م{student.level}{student.section ? ` (${student.section})` : ''}</Text> : null}
                    </View>
                  </View>
                  <View style={[styles.rateBadge, { backgroundColor: color + '18' }]}>
                    <Text style={[styles.rateText, { color }]}>{student.absence_rate}%</Text>
                  </View>
                </View>

                <View style={styles.courseRow}>
                  <Ionicons name="book-outline" size={14} color="#666" />
                  <Text style={styles.courseName} numberOfLines={1}>{student.course_name}</Text>
                  <Text style={styles.courseCode}>({student.course_code})</Text>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statItem}><Text style={[styles.statValue, { color: '#dc2626' }]}>{student.absent_count}</Text><Text style={styles.statLabel}>غياب</Text></View>
                  <View style={styles.statItem}><Text style={[styles.statValue, { color: '#f57c00' }]}>{student.late_count ?? 0}</Text><Text style={styles.statLabel}>تأخير</Text></View>
                  <View style={styles.statItem}><Text style={[styles.statValue, { color: '#2e7d32' }]}>{student.present_count ?? (student.total_lectures - student.absent_count)}</Text><Text style={styles.statLabel}>حضور</Text></View>
                  <View style={styles.statItem}><Text style={styles.statValue}>{student.total_lectures}</Text><Text style={styles.statLabel}>الإجمالي</Text></View>
                </View>

                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${100 - student.absence_rate}%`, backgroundColor: color }]} />
                </View>

                <View style={styles.expandHint}>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#999" />
                  <Text style={styles.expandHintText}>{isOpen ? 'إخفاء التفاصيل' : 'عرض المزيد من التفاصيل'}</Text>
                </View>
              </TouchableOpacity>

              {isOpen && (
                <View style={styles.detailsBox}>
                  {student.student_phone ? (
                    <View style={styles.detailRow}><Ionicons name="call-outline" size={14} color="#1565c0" /><Text style={styles.detailLabel}>الهاتف:</Text><Text style={styles.detailValue}>{student.student_phone}</Text></View>
                  ) : null}
                  {student.last_absent_date ? (
                    <View style={styles.detailRow}><Ionicons name="calendar-outline" size={14} color="#e53935" /><Text style={styles.detailLabel}>آخر غياب:</Text><Text style={styles.detailValue}>{student.last_absent_date}</Text></View>
                  ) : null}
                  <View style={styles.detailRow}>
                    <Ionicons name="trending-up-outline" size={14} color="#2e7d32" />
                    <Text style={styles.detailLabel}>نسبة الحضور:</Text>
                    <Text style={[styles.detailValue, { color: '#2e7d32', fontWeight: '700' }]}>{student.presence_rate ?? (100 - student.absence_rate)}%</Text>
                  </View>
                  <TouchableOpacity style={styles.viewFullBtn} onPress={() => router.push(`/report-student?id=${student.student_id}`)} testID={`view-full-${index}`}>
                    <Ionicons name="person-circle-outline" size={16} color="#1565c0" />
                    <Text style={styles.viewFullText}>عرض تقرير الطالب الكامل</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  thresholdBtns: { flexDirection: 'row-reverse', gap: 6 },
  thresholdBtn: { flex: 1, paddingVertical: 10, backgroundColor: '#f1f5f9', borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
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
