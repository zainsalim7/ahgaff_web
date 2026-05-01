import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { reportsAPI, departmentsAPI, coursesAPI } from '../src/services/api';
import { exportToPDF, prepareAbsentStudentsData } from '../src/utils/pdfExport';

export default function AbsentStudentsReport() {
  const router = useRouter();
  const [metaLoading, setMetaLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const [students, setStudents] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [minAbsenceRate, setMinAbsenceRate] = useState(25);
  const [summary, setSummary] = useState<any>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [exporting, setExporting] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);

  // جلب بيانات الفلاتر فقط (الأقسام + المقررات) — بدون تنفيذ التقرير تلقائياً
  useEffect(() => {
    (async () => {
      try {
        const [deptsRes, coursesRes] = await Promise.all([
          departmentsAPI.getAll(),
          coursesAPI.getAll(),
        ]);
        setDepartments(deptsRes.data || []);
        setCourses(coursesRes.data || []);
      } catch (e) {
        console.error('Error loading filters:', e);
      } finally {
        setMetaLoading(false);
      }
    })();
  }, []);

  // تنفيذ التقرير (بالضغط على الزر فقط)
  const runReport = useCallback(async () => {
    setExecuting(true);
    try {
      const params: any = { min_absence_rate: minAbsenceRate };
      if (selectedDept) params.department_id = selectedDept;
      if (selectedCourse) params.course_id = selectedCourse;
      const reportRes = await reportsAPI.getAbsentStudents(params);
      setStudents(reportRes.data.students || []);
      setSummary(reportRes.data);
      setExpanded({});
      setHasRun(true);
    } catch (e) {
      console.error('Error running report:', e);
      if (Platform.OS === 'web') window.alert('فشل في تنفيذ التقرير');
      else Alert.alert('خطأ', 'فشل في تنفيذ التقرير');
    } finally {
      setExecuting(false);
    }
  }, [selectedDept, selectedCourse, minAbsenceRate]);

  const handleExportPDF = async () => {
    try {
      setExportingPDF(true);
      const courseName = selectedCourse ? courses.find(c => c.id === selectedCourse)?.name : undefined;
      const reportData = prepareAbsentStudentsData(students, courseName);
      await exportToPDF(reportData);
    } catch (error) {
      console.error('PDF Export error:', error);
    } finally {
      setExportingPDF(false);
    }
  };

  const exportToExcel = async () => {
    try {
      setExporting(true);
      const params: any = { min_absence_rate: minAbsenceRate };
      if (selectedDept) params.department_id = selectedDept;
      if (selectedCourse) params.course_id = selectedCourse;
      const response = await reportsAPI.exportAbsentStudentsExcel(params);
      if (Platform.OS === 'web') {
        const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'absent_students.xlsx';
        a.click();
      } else {
        const filename = `${FileSystem.documentDirectory}absent_students.xlsx`;
        const reader = new FileReader();
        const blob = new Blob([response.data]);
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          await FileSystem.writeAsStringAsync(filename, base64, { encoding: FileSystem.EncodingType.Base64 });
          await Sharing.shareAsync(filename);
        };
        reader.readAsDataURL(blob);
      }
    } catch (error) {
      console.error('Export error:', error);
      if (Platform.OS === 'web') window.alert('فشل في تصدير التقرير');
      else Alert.alert('خطأ', 'فشل في تصدير التقرير');
    } finally {
      setExporting(false);
    }
  };

  const filteredCourses = selectedDept
    ? courses.filter(c => c.department_id === selectedDept)
    : courses;

  if (metaLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f44336" />
        <Text style={styles.loadingText}>جاري تحميل الفلاتر...</Text>
      </View>
    );
  }

  const toggleExpand = (i: number) => setExpanded(prev => ({ ...prev, [i]: !prev[i] }));

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()} accessibilityLabel="رجوع" testID="back-btn">
          <Ionicons name="arrow-forward" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الطلاب المتغيبين</Text>
        <View style={styles.headerButtons}>
          {Platform.OS === 'web' && (
            <TouchableOpacity
              style={styles.exportBtn}
              onPress={handleExportPDF}
              disabled={exportingPDF || students.length === 0}
              accessibilityLabel="تصدير PDF"
              testID="export-pdf-btn"
            >
              {exportingPDF ? <ActivityIndicator size="small" color="#e53935" /> : <Ionicons name="document-text-outline" size={22} color={students.length > 0 ? '#e53935' : '#ccc'} />}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={exportToExcel}
            disabled={exporting || students.length === 0}
            accessibilityLabel="تصدير Excel"
            testID="export-excel-btn"
          >
            {exporting ? <ActivityIndicator size="small" color="#4caf50" /> : <Ionicons name="download-outline" size={24} color={students.length > 0 ? '#4caf50' : '#ccc'} />}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* الفلاتر */}
        <View style={styles.filtersCard}>
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>القسم</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={selectedDept}
                onValueChange={(value) => { setSelectedDept(value); setSelectedCourse(''); }}
                style={styles.picker}
              >
                <Picker.Item label="جميع الأقسام" value="" />
                {departments.map(d => <Picker.Item key={d.id} label={d.name} value={d.id} />)}
              </Picker>
            </View>
          </View>

          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>المقرر</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={selectedCourse}
                onValueChange={setSelectedCourse}
                style={styles.picker}
              >
                <Picker.Item label="جميع المقررات" value="" />
                {filteredCourses.map(c => <Picker.Item key={c.id} label={`${c.name} (${c.code})`} value={c.id} />)}
              </Picker>
            </View>
          </View>

          <View style={styles.thresholdSection}>
            <Text style={styles.filterLabel}>الحد الأدنى لنسبة الغياب</Text>
            <View style={styles.thresholdBtns}>
              {[15, 25, 35, 50].map(rate => (
                <TouchableOpacity
                  key={rate}
                  style={[styles.thresholdBtn, minAbsenceRate === rate && styles.thresholdBtnActive]}
                  onPress={() => setMinAbsenceRate(rate)}
                  testID={`threshold-${rate}`}
                >
                  <Text style={[styles.thresholdBtnText, minAbsenceRate === rate && styles.thresholdBtnTextActive]}>
                    {rate}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* زر التنفيذ */}
          <TouchableOpacity
            style={[styles.runBtn, executing && styles.runBtnDisabled]}
            onPress={runReport}
            disabled={executing}
            testID="run-report-btn"
          >
            {executing ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.runBtnText}>جاري التنفيذ...</Text>
              </>
            ) : (
              <>
                <Ionicons name="play" size={18} color="#fff" />
                <Text style={styles.runBtnText}>{hasRun ? 'إعادة تنفيذ التقرير' : 'تنفيذ التقرير'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* قبل التنفيذ: رسالة إرشادية */}
        {!hasRun && !executing && (
          <View style={styles.introCard}>
            <Ionicons name="information-circle-outline" size={48} color="#90a4ae" />
            <Text style={styles.introTitle}>اختر الفلاتر ثم اضغط "تنفيذ التقرير"</Text>
            <Text style={styles.introSub}>سيعرض التقرير الطلاب الذين تجاوزوا الحد الأدنى لنسبة الغياب</Text>
          </View>
        )}

        {/* ملخص */}
        {hasRun && (
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCardMini, { backgroundColor: '#ffebee' }]}>
              <Text style={[styles.summaryMiniValue, { color: '#f44336' }]}>{summary?.total_count || 0}</Text>
              <Text style={styles.summaryMiniLabel}>إجمالي المتغيبين</Text>
            </View>
            <View style={[styles.summaryCardMini, { backgroundColor: '#fff3e0' }]}>
              <Text style={[styles.summaryMiniValue, { color: '#f57c00' }]}>{minAbsenceRate}%+</Text>
              <Text style={styles.summaryMiniLabel}>حد الغياب</Text>
            </View>
            <View style={[styles.summaryCardMini, { backgroundColor: '#e3f2fd' }]}>
              <Text style={[styles.summaryMiniValue, { color: '#1565c0' }]}>
                {new Set(students.map(s => s.student_id)).size}
              </Text>
              <Text style={styles.summaryMiniLabel}>طلاب فريدون</Text>
            </View>
          </View>
        )}

        {/* قائمة الطلاب */}
        {hasRun && students.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle" size={48} color="#4caf50" />
            <Text style={styles.emptyText}>لا يوجد طلاب متغيبين بهذه النسبة</Text>
          </View>
        ) : (
          hasRun && students.map((student, index) => {
            const isOpen = !!expanded[index];
            return (
              <View key={index} style={styles.studentCard} testID={`student-row-${index}`}>
                <TouchableOpacity onPress={() => toggleExpand(index)} activeOpacity={0.7}>
                  {/* الصف الرئيسي */}
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
                    <View style={[
                      styles.rateBadge,
                      student.absence_rate >= 40 ? styles.rateDanger :
                      student.absence_rate >= 25 ? styles.rateWarning : styles.rateNormal
                    ]}>
                      <Text style={styles.rateText}>{student.absence_rate}%</Text>
                    </View>
                  </View>

                  {/* المقرر */}
                  <View style={styles.courseRow}>
                    <Ionicons name="book-outline" size={14} color="#666" />
                    <Text style={styles.courseName} numberOfLines={1}>{student.course_name}</Text>
                    <Text style={styles.courseCode}>({student.course_code})</Text>
                  </View>

                  {/* الإحصائيات */}
                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, styles.absentValue]}>{student.absent_count}</Text>
                      <Text style={styles.statLabel}>غياب</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, { color: '#f57c00' }]}>{student.late_count ?? 0}</Text>
                      <Text style={styles.statLabel}>تأخير</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, { color: '#2e7d32' }]}>{student.present_count ?? (student.total_lectures - student.absent_count)}</Text>
                      <Text style={styles.statLabel}>حضور</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{student.total_lectures}</Text>
                      <Text style={styles.statLabel}>الإجمالي</Text>
                    </View>
                  </View>

                  {/* شريط التقدم (نسبة الحضور) */}
                  <View style={styles.progressBar}>
                    <View style={[
                      styles.progressFill,
                      { width: `${100 - student.absence_rate}%` },
                      student.absence_rate >= 40 ? styles.progressDanger :
                      student.absence_rate >= 25 ? styles.progressWarning : styles.progressNormal,
                    ]} />
                  </View>

                  <View style={styles.expandHint}>
                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#999" />
                    <Text style={styles.expandHintText}>{isOpen ? 'إخفاء التفاصيل' : 'عرض المزيد من التفاصيل'}</Text>
                  </View>
                </TouchableOpacity>

                {/* تفاصيل إضافية (يتوسّع) */}
                {isOpen && (
                  <View style={styles.detailsBox}>
                    {student.student_phone ? (
                      <View style={styles.detailRow}>
                        <Ionicons name="call-outline" size={14} color="#1565c0" />
                        <Text style={styles.detailLabel}>الهاتف:</Text>
                        <Text style={styles.detailValue}>{student.student_phone}</Text>
                      </View>
                    ) : null}
                    {student.last_absent_date ? (
                      <View style={styles.detailRow}>
                        <Ionicons name="calendar-outline" size={14} color="#e53935" />
                        <Text style={styles.detailLabel}>آخر غياب:</Text>
                        <Text style={styles.detailValue}>{student.last_absent_date}</Text>
                      </View>
                    ) : null}
                    <View style={styles.detailRow}>
                      <Ionicons name="trending-up-outline" size={14} color="#2e7d32" />
                      <Text style={styles.detailLabel}>نسبة الحضور:</Text>
                      <Text style={[styles.detailValue, { color: '#2e7d32', fontWeight: '700' }]}>
                        {student.presence_rate ?? (100 - student.absence_rate)}%
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.viewFullBtn}
                      onPress={() => router.push(`/report-student?id=${student.student_id}`)}
                      testID={`view-full-${index}`}
                    >
                      <Ionicons name="person-circle-outline" size={16} color="#1565c0" />
                      <Text style={styles.viewFullText}>عرض تقرير الطالب الكامل</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#333', flex: 1, textAlign: 'center' },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exportBtn: { padding: 4 },
  scrollView: { flex: 1, padding: 12 },
  filtersCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  filterRow: { marginBottom: 10 },
  filterLabel: { fontSize: 13, color: '#666', marginBottom: 4, textAlign: 'right' },
  pickerWrapper: { backgroundColor: '#f5f5f5', borderRadius: 8, overflow: 'hidden' },
  picker: { height: 45 },
  thresholdSection: { marginTop: 4, marginBottom: 10 },
  thresholdBtns: { flexDirection: 'row', marginTop: 6, gap: 6 },
  thresholdBtn: { flex: 1, paddingVertical: 10, backgroundColor: '#f5f5f5', borderRadius: 8, alignItems: 'center' },
  thresholdBtnActive: { backgroundColor: '#ffebee' },
  thresholdBtnText: { fontSize: 14, color: '#666' },
  thresholdBtnTextActive: { color: '#f44336', fontWeight: '700' },
  runBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1565c0', paddingVertical: 12, borderRadius: 10, marginTop: 4,
  },
  runBtnDisabled: { opacity: 0.7 },
  runBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  introCard: { backgroundColor: '#fff', borderRadius: 12, padding: 32, alignItems: 'center', marginBottom: 12 },
  introTitle: { marginTop: 10, fontSize: 15, fontWeight: '600', color: '#455a64', textAlign: 'center' },
  introSub: { marginTop: 6, fontSize: 12, color: '#90a4ae', textAlign: 'center' },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryCardMini: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  summaryMiniValue: { fontSize: 22, fontWeight: '800' },
  summaryMiniLabel: { fontSize: 11, color: '#555', marginTop: 2, textAlign: 'center' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 40, alignItems: 'center' },
  emptyText: { marginTop: 10, fontSize: 15, color: '#4caf50' },
  studentCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    borderRightWidth: 3, borderRightColor: '#f44336',
  },
  studentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  studentName: { fontSize: 15, fontWeight: '700', color: '#333', textAlign: 'right' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 2 },
  metaItem: { fontSize: 11, color: '#666' },
  metaDot: { fontSize: 11, color: '#ccc', marginHorizontal: 5 },
  rateBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, marginRight: 8 },
  rateDanger: { backgroundColor: '#ffebee' },
  rateWarning: { backgroundColor: '#fff3e0' },
  rateNormal: { backgroundColor: '#f5f5f5' },
  rateText: { fontSize: 14, fontWeight: '800', color: '#f44336' },
  courseRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8,
    backgroundColor: '#f8f9fa', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6,
  },
  courseName: { flex: 1, fontSize: 12, color: '#333', textAlign: 'right' },
  courseCode: { fontSize: 10, color: '#999' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '700', color: '#333' },
  absentValue: { color: '#f44336' },
  statLabel: { fontSize: 10, color: '#666', marginTop: 1 },
  progressBar: { height: 5, backgroundColor: '#eee', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressDanger: { backgroundColor: '#f44336' },
  progressWarning: { backgroundColor: '#ff9800' },
  progressNormal: { backgroundColor: '#ffc107' },
  expandHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 },
  expandHintText: { fontSize: 11, color: '#999' },
  detailsBox: {
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee',
    backgroundColor: '#fafafa', padding: 10, borderRadius: 8,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  detailLabel: { fontSize: 12, color: '#666', fontWeight: '600' },
  detailValue: { fontSize: 12, color: '#333', flex: 1, textAlign: 'right' },
  viewFullBtn: {
    marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, backgroundColor: '#e3f2fd', borderRadius: 8,
  },
  viewFullText: { fontSize: 12, color: '#1565c0', fontWeight: '700' },
});
