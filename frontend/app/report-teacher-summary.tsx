import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { reportsAPI, teachersAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { ReportHero, ReportKpis, ReportFilters, ReportEmpty, downloadReport, reportPage } from '../src/components/reports/ReportShell';

interface CourseSummary {
  course_id: string; course_name: string; course_code: string; department_name: string; level: string; section: string;
  students_count: number; total_lectures: number; held_lectures: number; present_count: number; absent_count: number; late_count: number; attendance_rate: number;
}

interface TeacherSummaryReport {
  teacher: { id: string; full_name: string; teacher_id: string; phone: string; email: string };
  courses: CourseSummary[];
  summary: { total_courses: number; total_students: number; total_lectures: number; total_present: number; total_absent: number; total_late: number; overall_attendance_rate: number };
}

export default function ReportTeacherSummary() {
  const { user, hasPermission } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<TeacherSummaryReport | null>(null);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<string>('');
  const [teacherQuery, setTeacherQuery] = useState('');
  const [showTeacherList, setShowTeacherList] = useState(false);
  const [exporting, setExporting] = useState<'' | 'pdf' | 'excel'>('');

  const isAdmin = user?.role === 'admin' || user?.permissions?.includes('view_reports');
  const isTeacher = user?.role === 'teacher';

  const fetchTeachers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await teachersAPI.getAll();
      setTeachers(res.data || []);
    } catch (error) { console.error('Error fetching teachers:', error); }
  }, [isAdmin]);

  const fetchReport = useCallback(async (teacherId?: string) => {
    try {
      setExecuting(true);
      const params: any = {};
      if (teacherId) params.teacher_id = teacherId;
      const res = await reportsAPI.getTeacherSummary(params);
      setReport(res.data);
      setHasRun(true);
    } catch (error: any) {
      console.error('Error fetching report:', error);
      if (error?.response?.status === 400 && isAdmin && !selectedTeacher) setReport(null);
      else alert(error?.response?.data?.detail || 'حدث خطأ في تحميل التقرير');
    } finally {
      setExecuting(false);
      setRefreshing(false);
    }
  }, [isAdmin, selectedTeacher]);

  // التحميل الأولي: للمعلم تنفيذ تلقائي، للمدير فقط جلب قائمة المعلمين
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    if (!user || booted) return;
    setBooted(true);
    (async () => {
      if (isAdmin) await fetchTeachers();
      else await fetchReport();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const runReport = () => {
    if (isAdmin) {
      if (!selectedTeacher) { alert('اختر المعلم أولاً'); return; }
      fetchReport(selectedTeacher);
    } else fetchReport();
  };

  const onRefresh = useCallback(() => {
    if (!hasRun) return;
    setRefreshing(true);
    if (isAdmin && selectedTeacher) fetchReport(selectedTeacher);
    else if (!isAdmin) fetchReport();
    else setRefreshing(false);
  }, [isAdmin, selectedTeacher, hasRun, fetchReport]);

  const filteredTeachers = teacherQuery.trim()
    ? teachers.filter((t: any) => {
        const q = teacherQuery.trim().toLowerCase();
        return (t.full_name || '').toLowerCase().includes(q) || (t.username || '').toLowerCase().includes(q) || (t.teacher_id || '').toLowerCase().includes(q);
      })
    : teachers;
  const selectedTeacherObj = teachers.find((t: any) => t.id === selectedTeacher);

  const handleExport = async (fmt: 'pdf' | 'excel') => {
    setExporting(fmt);
    const params: any = {};
    if (selectedTeacher) params.teacher_id = selectedTeacher;
    await downloadReport(fmt === 'pdf' ? '/reports/teacher-summary/export-pdf' : '/export/report/teacher-summary/excel', params, ['ملخص المعلم', report?.teacher?.full_name], fmt === 'pdf' ? 'pdf' : 'xlsx');
    setExporting('');
  };

  const rateColor = (rate: number) => (rate >= 80 ? '#16a34a' : rate >= 60 ? '#f97316' : '#dc2626');

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565c0" />
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']} testID="teacher-summary-page">
      <ScrollView contentContainerStyle={reportPage.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <ReportHero
          title={report ? `ملخص المعلم: ${report.teacher.full_name}` : 'ملخص المعلم'}
          subtitle={report ? [report.teacher.teacher_id ? `الرقم الوظيفي: ${report.teacher.teacher_id}` : '', report.teacher.phone].filter(Boolean).join('  ·  ') || 'جميع مقررات المعلم مع نسب الحضور' : 'جميع مقررات المعلم مع نسب الحضور'}
          onBack={() => goBack()}
          canExport={!!report && (isTeacher || hasPermission('export_reports'))}
          onPdf={() => handleExport('pdf')}
          onExcel={() => handleExport('excel')}
          exporting={exporting}
          testID="teacher-summary-hero"
        />

        {isAdmin && (
          <ReportFilters onRun={runReport} running={executing} hasRun={hasRun} disabled={!selectedTeacher} runLabel={!selectedTeacher ? 'اختر المعلم ثم نفّذ' : undefined} testID="teacher-selector">
            <View style={{ width: '100%' }}>
              <Text style={reportPage.label}>المعلم</Text>
              <TouchableOpacity onPress={() => setShowTeacherList(!showTeacherList)} style={styles.teacherInput} testID="teacher-input">
                <Ionicons name="person-outline" size={16} color="#666" />
                <Text style={{ flex: 1, fontSize: 13, color: selectedTeacherObj ? '#0f2440' : '#999', textAlign: 'right', fontWeight: selectedTeacherObj ? '700' : '400' }}>
                  {selectedTeacherObj ? `${selectedTeacherObj.full_name}${selectedTeacherObj.teacher_id ? ` (${selectedTeacherObj.teacher_id})` : ''}` : 'ابحث عن معلم...'}
                </Text>
                <Ionicons name={showTeacherList ? 'chevron-up' : 'chevron-down'} size={16} color="#666" />
              </TouchableOpacity>
              {showTeacherList && (
                <View style={styles.teacherList}>
                  <View style={styles.searchRow}>
                    <Ionicons name="search" size={14} color="#999" />
                    <TextInput value={teacherQuery} onChangeText={setTeacherQuery} placeholder="ابحث بالاسم أو الرقم..." placeholderTextColor="#aaa" style={{ flex: 1, fontSize: 13, textAlign: 'right', padding: 4 }} autoFocus testID="teacher-search-input" />
                  </View>
                  <ScrollView style={{ maxHeight: 220 }}>
                    {filteredTeachers.length === 0 ? (
                      <Text style={{ padding: 16, textAlign: 'center', color: '#999', fontSize: 12 }}>لا توجد نتائج</Text>
                    ) : filteredTeachers.slice(0, 50).map((t: any) => (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => { setSelectedTeacher(t.id); setShowTeacherList(false); setTeacherQuery(''); setReport(null); setHasRun(false); }}
                        style={[styles.teacherOption, selectedTeacher === t.id && { backgroundColor: '#e3f2fd' }]}
                        testID={`teacher-option-${t.id}`}
                      >
                        <Text style={{ fontSize: 13, color: '#333', textAlign: 'right', fontWeight: selectedTeacher === t.id ? '700' : '400' }}>{t.full_name}</Text>
                        {t.teacher_id ? <Text style={{ fontSize: 10, color: '#888', textAlign: 'right' }}>{t.teacher_id}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </ReportFilters>
        )}

        {executing && !refreshing && <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 30 }} />}
        {!executing && !report && (
          <ReportEmpty text={isAdmin ? (selectedTeacher ? 'اضغط «تنفيذ التقرير» لعرض البيانات' : 'اختر المعلم أولاً') : 'لا توجد بيانات'} icon="clipboard-outline" />
        )}

        {!executing && report && (<>
          <ReportKpis testID="summary-stats" items={[
            { label: 'المقررات', value: report.summary.total_courses, color: '#1565c0', icon: 'book' },
            { label: 'الطلاب', value: report.summary.total_students, color: '#0f2440', icon: 'people' },
            { label: 'المحاضرات', value: report.summary.total_lectures, color: '#7c3aed', icon: 'calendar' },
            { label: 'نسبة الحضور', value: `${report.summary.overall_attendance_rate}%`, color: rateColor(report.summary.overall_attendance_rate), icon: 'stats-chart', sub: `${report.summary.total_present} حاضر · ${report.summary.total_late} متأخر · ${report.summary.total_absent} غائب` },
          ]} />

          <View style={styles.breakdownCard} testID="attendance-breakdown">
            <Text style={styles.sectionTitle}>توزيع الحضور الإجمالي</Text>
            <View style={styles.breakdownRow}>
              {([['حاضر', report.summary.total_present, '#16a34a'], ['غائب', report.summary.total_absent, '#dc2626'], ['متأخر', report.summary.total_late, '#f97316']] as const).map(([l, v, c]) => (
                <View key={l} style={styles.breakdownItem}>
                  <View style={[styles.breakdownDot, { backgroundColor: c }]} />
                  <Text style={styles.breakdownLabel}>{l}</Text>
                  <Text style={[styles.breakdownValue, { color: c }]}>{v}</Text>
                </View>
              ))}
            </View>
            {(() => { const tot = report.summary.total_present + report.summary.total_absent + report.summary.total_late; return tot > 0 ? (
              <View style={styles.stackBar}>
                <View style={{ flex: report.summary.total_present, backgroundColor: '#16a34a' }} />
                <View style={{ flex: report.summary.total_late, backgroundColor: '#f97316' }} />
                <View style={{ flex: report.summary.total_absent, backgroundColor: '#dc2626' }} />
              </View>
            ) : null; })()}
          </View>

          <Text style={styles.sectionTitle}>المقررات ({report.courses.length})</Text>
          {report.courses.map((course, idx) => (
            <TouchableOpacity key={course.course_id} style={styles.courseCard} onPress={() => router.push(`/report-course?courseId=${course.course_id}`)} testID={`course-card-${idx}`}>
              <View style={[styles.rateStripe, { backgroundColor: rateColor(course.attendance_rate) }]} />
              <View style={styles.courseHeader}>
                <View style={styles.courseNameRow}>
                  <Text style={styles.courseIndex}>{idx + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.courseName}>{course.course_name}</Text>
                    <Text style={styles.courseCode}>{course.course_code}{course.department_name ? `  ·  ${course.department_name}` : ''}{course.level ? ` - م${course.level}` : ''}{course.section ? ` (${course.section})` : ''}</Text>
                  </View>
                </View>
                <View style={[styles.rateBadge, { backgroundColor: rateColor(course.attendance_rate) + '18' }]}>
                  <Text style={[styles.rateText, { color: rateColor(course.attendance_rate) }]}>{course.attendance_rate}%</Text>
                </View>
              </View>
              <View style={styles.courseStats}>
                <View style={styles.courseStat}><Ionicons name="people-outline" size={14} color="#666" /><Text style={styles.courseStatText}>{course.students_count} طالب</Text></View>
                <View style={styles.courseStat}><Ionicons name="calendar-outline" size={14} color="#666" /><Text style={styles.courseStatText}>{course.held_lectures}/{course.total_lectures} محاضرة</Text></View>
                <View style={styles.courseStat}><Ionicons name="checkmark-circle-outline" size={14} color="#16a34a" /><Text style={styles.courseStatText}>{course.present_count}</Text></View>
                <View style={styles.courseStat}><Ionicons name="time-outline" size={14} color="#f97316" /><Text style={styles.courseStatText}>{course.late_count}</Text></View>
                <View style={styles.courseStat}><Ionicons name="close-circle-outline" size={14} color="#dc2626" /><Text style={styles.courseStatText}>{course.absent_count}</Text></View>
              </View>
            </TouchableOpacity>
          ))}
        </>)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  teacherInput: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, height: 40 },
  teacherList: { marginTop: 8, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', maxHeight: 280 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fafafa' },
  teacherOption: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#0f2440', textAlign: 'right', marginBottom: 8 },
  breakdownCard: { ...reportPage.card },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  breakdownItem: { alignItems: 'center', gap: 4 },
  breakdownDot: { width: 10, height: 10, borderRadius: 5 },
  breakdownLabel: { fontSize: 12, color: '#64748b' },
  breakdownValue: { fontSize: 18, fontWeight: '800' },
  stackBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#eee' },
  courseCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e6ebf2' },
  rateStripe: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 4 },
  courseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  courseNameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  courseIndex: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#f1f5f9', textAlign: 'center', lineHeight: 26, fontSize: 12, fontWeight: '800', color: '#475569' },
  courseName: { fontSize: 15, fontWeight: '700', color: '#0f2440' },
  courseCode: { fontSize: 11, color: '#64748b', marginTop: 2 },
  rateBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  rateText: { fontSize: 14, fontWeight: '800' },
  courseStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  courseStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  courseStatText: { fontSize: 12, color: '#555' },
});
