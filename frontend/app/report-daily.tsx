import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { reportsAPI, departmentsAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { formatGregorianDate, WEEKDAYS_AR } from '../src/utils/dateUtils';
import { ReportHero, ReportKpis, ReportFilters, ReportEmpty, downloadReport, reportPage } from '../src/components/reports/ReportShell';

const todayStr = () => new Date().toISOString().split('T')[0];

export default function DailyReport() {
  const { hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lectures, setLectures] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [summary, setSummary] = useState<any>(null);
  const [exporting, setExporting] = useState<'' | 'pdf' | 'excel'>('');

  const deptName = selectedDept ? departments.find(d => d.id === selectedDept)?.name : undefined;

  const handleExport = async (fmt: 'pdf' | 'excel') => {
    setExporting(fmt);
    const params: any = { date: selectedDate };
    if (selectedDept) params.department_id = selectedDept;
    await downloadReport(fmt === 'pdf' ? '/reports/daily/export-pdf' : '/export/report/daily/excel', params, ['التقرير اليومي', deptName, selectedDate], fmt === 'pdf' ? 'pdf' : 'xlsx');
    setExporting('');
  };

  useEffect(() => {
    (async () => {
      try {
        const deptsRes = await departmentsAPI.getAll();
        setDepartments(deptsRes.data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const runReport = useCallback(async () => {
    setExecuting(true);
    try {
      const params: any = { date: selectedDate };
      if (selectedDept) params.department_id = selectedDept;
      const reportRes = await reportsAPI.getDailyReport(params);
      setLectures(reportRes.data.lectures || []);
      setSummary(reportRes.data.summary);
      setHasRun(true);
    } catch (error) {
      console.error('Error running report:', error);
      alert('فشل في تنفيذ التقرير');
    } finally {
      setExecuting(false);
      setRefreshing(false);
    }
  }, [selectedDept, selectedDate]);

  const onRefresh = () => {
    if (!hasRun) return;
    setRefreshing(true);
    runReport();
  };

  const changeDate = (days: number) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const formatDateStr = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${WEEKDAYS_AR[date.getDay()]}، ${formatGregorianDate(date, { includeYear: true })}`;
  };

  const rateColor = (r: number) => (r >= 80 ? '#16a34a' : r >= 60 ? '#f97316' : '#dc2626');

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4caf50" />
        <Text style={styles.loadingText}>جاري تحميل التقرير...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <ReportHero
          title="التقرير اليومي"
          subtitle={hasRun ? formatDateStr(selectedDate) : 'ملخص حضور جميع محاضرات يوم محدد'}
          onBack={() => goBack()}
          canExport={hasRun && lectures.length > 0 && hasPermission('export_reports')}
          onPdf={() => handleExport('pdf')}
          onExcel={() => handleExport('excel')}
          exporting={exporting}
          testID="daily-report-hero"
        />

        <ReportFilters onRun={runReport} running={executing} hasRun={hasRun}>
          <View style={{ flex: 2, minWidth: 300 }}>
            <Text style={reportPage.label}>التاريخ</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateBtn} onPress={() => changeDate(-1)} testID="date-prev-btn"><Ionicons name="chevron-forward" size={20} color="#1565c0" /></TouchableOpacity>
              {Platform.OS === 'web' ? (
                // @ts-ignore
                <input type="date" value={selectedDate} data-testid="daily-date-input" onChange={(e: any) => e.target.value && setSelectedDate(e.target.value)}
                  style={{ flex: 1, padding: 9, borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', textAlign: 'center' }} />
              ) : (
                <TextInput style={styles.dateInput} value={selectedDate} onChangeText={setSelectedDate} placeholder="YYYY-MM-DD" testID="daily-date-input" />
              )}
              <TouchableOpacity style={styles.dateBtn} onPress={() => changeDate(1)} testID="date-next-btn"><Ionicons name="chevron-back" size={20} color="#1565c0" /></TouchableOpacity>
              <TouchableOpacity style={[styles.todayBtn, selectedDate === todayStr() && styles.todayBtnActive]} onPress={() => setSelectedDate(todayStr())} testID="date-today-btn">
                <Ionicons name="today" size={14} color={selectedDate === todayStr() ? '#fff' : '#1565c0'} />
                <Text style={[styles.todayBtnText, selectedDate === todayStr() && { color: '#fff' }]}>اليوم</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.dateHint}>{formatDateStr(selectedDate)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 220 }}>
            <Text style={reportPage.label}>القسم</Text>
            <View style={reportPage.pickerBox}>
              <Picker selectedValue={selectedDept} onValueChange={setSelectedDept} style={reportPage.picker}>
                <Picker.Item label="جميع الأقسام" value="" />
                {departments.map(d => <Picker.Item key={d.id} label={d.name} value={d.id} />)}
              </Picker>
            </View>
          </View>
        </ReportFilters>

        {!hasRun && !executing && <ReportEmpty text="اختر التاريخ والقسم ثم اضغط «تنفيذ التقرير»" icon="information-circle-outline" />}
        {executing && !refreshing && <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 30 }} />}

        {hasRun && !executing && summary && (
          <ReportKpis items={[
            { label: 'المحاضرات', value: summary.total_lectures, color: '#1565c0', icon: 'calendar' },
            { label: 'حاضر', value: summary.total_present, color: '#16a34a', icon: 'checkmark-circle' },
            { label: 'متأخر', value: summary.total_late ?? 0, color: '#f97316', icon: 'time' },
            { label: 'غائب', value: summary.total_absent, color: '#dc2626', icon: 'close-circle' },
            { label: 'نسبة الحضور', value: `${summary.overall_attendance_rate}%`, color: rateColor(summary.overall_attendance_rate), icon: 'stats-chart' },
          ]} />
        )}

        {hasRun && !executing && (
          <Text style={styles.sectionTitle}>المحاضرات ({lectures.length})</Text>
        )}
        {hasRun && !executing && lectures.length === 0 && <ReportEmpty text="لا توجد محاضرات في هذا اليوم" icon="calendar-outline" />}

        {hasRun && !executing && lectures.map((lecture, index) => (
          <View key={index} style={styles.lectureCard} testID={`daily-lecture-${index}`}>
            <View style={[styles.rateStripe, { backgroundColor: rateColor(lecture.attendance_rate) }]} />
            <View style={styles.lectureHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lectureName}>{lecture.course_name}</Text>
                <Text style={styles.lectureCode}>{lecture.course_code}</Text>
              </View>
              <View style={styles.lectureTime}>
                <Ionicons name="time-outline" size={14} color="#666" />
                <Text style={styles.timeText}>{lecture.start_time} - {lecture.end_time}</Text>
              </View>
            </View>
            <View style={styles.lectureStats}>
              <View style={styles.statItem}><View style={[styles.statDot, { backgroundColor: '#4caf50' }]} /><Text style={styles.statText}>{lecture.present} حاضر</Text></View>
              <View style={styles.statItem}><View style={[styles.statDot, { backgroundColor: '#f44336' }]} /><Text style={styles.statText}>{lecture.absent} غائب</Text></View>
              <View style={styles.statItem}><View style={[styles.statDot, { backgroundColor: '#ff9800' }]} /><Text style={styles.statText}>{lecture.late} متأخر</Text></View>
            </View>
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${lecture.attendance_rate}%`, backgroundColor: rateColor(lecture.attendance_rate) }]} />
              </View>
              <Text style={[styles.progressText, { color: rateColor(lecture.attendance_rate) }]}>{lecture.attendance_rate}%</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  dateRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  dateBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#e3f2fd', alignItems: 'center', justifyContent: 'center' },
  dateInput: { flex: 1, height: 38, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, textAlign: 'center', backgroundColor: '#fff' },
  todayBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 38, borderRadius: 10, borderWidth: 1, borderColor: '#1565c0' },
  todayBtnActive: { backgroundColor: '#1565c0' },
  todayBtnText: { fontSize: 12, color: '#1565c0', fontWeight: '700' },
  dateHint: { fontSize: 11, color: '#64748b', textAlign: 'right', marginTop: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#0f2440', textAlign: 'right', marginBottom: 8 },
  lectureCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e6ebf2' },
  rateStripe: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 4 },
  lectureHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  lectureName: { fontSize: 15, fontWeight: '700', color: '#0f2440' },
  lectureCode: { fontSize: 12, color: '#666' },
  lectureTime: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f5f7fa', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  timeText: { fontSize: 12, color: '#666', fontWeight: '600' },
  lectureStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statText: { fontSize: 12, color: '#666' },
  progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBar: { flex: 1, height: 6, backgroundColor: '#eee', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 12, fontWeight: '800', minWidth: 40, textAlign: 'right' },
});
