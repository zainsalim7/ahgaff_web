import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { reportsAPI, departmentsAPI, facultiesAPI, teachersAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { ReportHero, ReportKpis, ReportFilters, ReportEmpty, DenseTable, Pill, Bar, tableStyles, rateColor, downloadReport, reportPage } from '../src/components/reports/ReportShell';
import AbsenceReminderButton from '../src/components/AbsenceReminderButton';
import { PERMISSIONS } from '../src/contexts/AuthContext';

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  executed: { label: 'نُفّذت', color: '#2e7d32', bg: '#e8f5e9', icon: 'checkmark-circle' },
  absent: { label: 'غياب', color: '#c62828', bg: '#ffebee', icon: 'close-circle' },
  cancelled: { label: 'ملغاة', color: '#616161', bg: '#eeeeee', icon: 'remove-circle' },
  pending: { label: 'لم يحن وقتها', color: '#ef6c00', bg: '#fff3e0', icon: 'time' },
};

const getStatusMeta = (status: string) => STATUS_META[status] || { label: status || 'غير معروف', color: '#616161', bg: '#eeeeee', icon: 'help-circle' };

export default function TeacherAttendanceReport() {
  const today = new Date().toISOString().split('T')[0];
  const { hasPermission } = useAuth();
  const canSendReminder = hasPermission(PERMISSIONS.SEND_NOTIFICATIONS);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [faculties, setFaculties] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [facultyId, setFacultyId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [teachers, setTeachers] = useState<any[]>([]);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'teacher' | 'lecture'>('teacher');
  const [data, setData] = useState<any>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [fRes, dRes, tRes] = await Promise.all([facultiesAPI.getAll(), departmentsAPI.getAll(), teachersAPI.getAll()]);
        setFaculties(fRes.data || []);
        setDepartments(dRes.data || []);
        setTeachers(tRes.data || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const filteredDepartments = facultyId
    ? departments.filter((d) => d.faculty_id === facultyId)
    : departments;

  const teacherSuggestions = teacherSearch.trim().length >= 1 && !selectedTeacher
    ? teachers.filter((t) => {
        const q = teacherSearch.trim().toLowerCase();
        return (t.full_name || '').toLowerCase().includes(q) || (t.teacher_id || '').toLowerCase().includes(q);
      }).slice(0, 8)
    : [];

  const runReport = useCallback(async () => {
    if (!dateFrom || !dateTo) {
      if (Platform.OS === 'web') window.alert('الرجاء تحديد تاريخ البداية والنهاية');
      else Alert.alert('تنبيه', 'الرجاء تحديد تاريخ البداية والنهاية');
      return;
    }
    let from = dateFrom, to = dateTo;
    if (from > to) { [from, to] = [to, from]; setDateFrom(from); setDateTo(to); }
    setExecuting(true);
    try {
      const params: any = { start_date: from, end_date: to };
      if (departmentId) params.department_id = departmentId;
      if (facultyId) params.faculty_id = facultyId;
      if (selectedTeacher) params.teacher_id = selectedTeacher.id;
      const res = await reportsAPI.getTeacherAttendance(params);
      setData(res.data);
      setHasRun(true);
    } catch (error) {
      console.error('Error:', error);
      if (Platform.OS === 'web') window.alert('فشل في تنفيذ التقرير');
      else Alert.alert('خطأ', 'فشل في تنفيذ التقرير');
    } finally {
      setExecuting(false);
    }
  }, [dateFrom, dateTo, departmentId, facultyId, selectedTeacher]);

  const [exporting, setExporting] = useState<'' | 'pdf' | 'excel'>('');
  const handleExport = async (type: 'excel' | 'pdf') => {
    if (!hasRun) return;
    setExporting(type);
    const params: any = { start_date: dateFrom, end_date: dateTo };
    if (departmentId) params.department_id = departmentId;
    if (facultyId) params.faculty_id = facultyId;
    if (selectedTeacher) params.teacher_id = selectedTeacher.id;
    await downloadReport(type === 'excel' ? '/reports/teacher-attendance/export/excel' : '/reports/teacher-attendance/export/pdf', params, ['تقرير حضور الأساتذة', selectedTeacher?.full_name, `من ${dateFrom} إلى ${dateTo}`], type === 'excel' ? 'xlsx' : 'pdf');
    setExporting('');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2e7d32" />
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </View>
    );
  }

  const summary = data?.summary;

  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero
          title="حضور الأساتذة وتنفيذ المحاضرات"
          subtitle="حالة كل محاضرة في الفترة: نُفّذت / غياب الأستاذ / ملغاة / لم يحن وقتها"
          onBack={() => goBack()}
          canExport={hasRun && hasPermission('export_reports')}
          onPdf={() => handleExport('pdf')}
          onExcel={() => handleExport('excel')}
          exporting={exporting}
          testID="teacher-attendance-hero"
        />
        <ReportFilters onRun={runReport} running={executing} hasRun={hasRun}>
          <View style={{ minWidth: 150 }}>
            <Text style={reportPage.label}>من تاريخ</Text>
            {Platform.OS === 'web' ? (
              // @ts-ignore
              <input type="date" value={dateFrom} data-testid="ta-date-from" onChange={(e: any) => setDateFrom(e.target.value)} style={dateInp as any} />
            ) : <TextInput style={styles.dateBtn} value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" testID="ta-date-from" />}
          </View>
          <View style={{ minWidth: 150 }}>
            <Text style={reportPage.label}>إلى تاريخ</Text>
            {Platform.OS === 'web' ? (
              // @ts-ignore
              <input type="date" value={dateTo} data-testid="ta-date-to" onChange={(e: any) => setDateTo(e.target.value)} style={dateInp as any} />
            ) : <TextInput style={styles.dateBtn} value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" testID="ta-date-to" />}
          </View>
          <TouchableOpacity style={styles.todayChip} onPress={() => { setDateFrom(today); setDateTo(today); }} testID="today-chip">
            <Ionicons name="today" size={13} color="#1565c0" /><Text style={styles.todayChipText}>اليوم</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 170 }}>
            <Text style={reportPage.label}>الكلية</Text>
            <View style={reportPage.pickerBox}>
              <Picker selectedValue={facultyId} onValueChange={(v) => { setFacultyId(v); setDepartmentId(''); }} style={reportPage.picker}>
                <Picker.Item label="جميع الكليات" value="" />
                {faculties.map((f) => <Picker.Item key={f.id} label={f.name} value={f.id} />)}
              </Picker>
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 170 }}>
            <Text style={reportPage.label}>القسم</Text>
            <View style={reportPage.pickerBox}>
              <Picker selectedValue={departmentId} onValueChange={setDepartmentId} style={reportPage.picker}>
                <Picker.Item label="جميع الأقسام" value="" />
                {filteredDepartments.map((d) => <Picker.Item key={d.id} label={d.name} value={d.id} />)}
              </Picker>
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 200, position: 'relative', zIndex: 50 }}>
            <Text style={reportPage.label}>أستاذ محدد (اختياري)</Text>
            {selectedTeacher ? (
              <View style={styles.teacherChip} testID="selected-teacher-chip">
                <Ionicons name="person" size={13} color="#1565c0" />
                <Text style={styles.teacherChipText} numberOfLines={1}>{selectedTeacher.full_name}</Text>
                <TouchableOpacity onPress={() => { setSelectedTeacher(null); setTeacherSearch(''); }} testID="clear-teacher-btn"><Ionicons name="close-circle" size={18} color="#c62828" /></TouchableOpacity>
              </View>
            ) : (
              <View>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={15} color="#999" />
                  <TextInput style={styles.searchInput} value={teacherSearch} onChangeText={setTeacherSearch} placeholder="اسم الأستاذ أو رقمه الوظيفي" placeholderTextColor="#aaa" testID="teacher-search-input" />
                  {teacherSearch.length > 0 && <TouchableOpacity onPress={() => setTeacherSearch('')}><Ionicons name="close" size={16} color="#999" /></TouchableOpacity>}
                </View>
                {teacherSuggestions.length > 0 && (
                  <View style={styles.suggestionsBox}>
                    {teacherSuggestions.map((t) => (
                      <TouchableOpacity key={t.id} style={styles.suggestionRow} onPress={() => { setSelectedTeacher(t); setTeacherSearch(''); }} testID={`teacher-suggestion-${t.id}`}>
                        <View style={{ flex: 1 }}><Text style={styles.suggestionName}>{t.full_name}</Text>{!!t.teacher_id && <Text style={styles.suggestionMeta}>{t.teacher_id}</Text>}</View>
                        <Ionicons name="add-circle-outline" size={18} color="#2e7d32" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {teacherSearch.trim().length >= 1 && teacherSuggestions.length === 0 && <Text style={styles.noResultText}>لا توجد نتائج مطابقة</Text>}
              </View>
            )}
          </View>
        </ReportFilters>

        {!hasRun && !executing && <ReportEmpty text="اختر الفترة والفلاتر ثم اضغط «تنفيذ التقرير»" icon="information-circle-outline" />}

        {summary && (<>
          {!!data?.teacher_filter_name && (
            <View style={styles.filterBanner} testID="teacher-filter-banner">
              <Ionicons name="person-circle" size={18} color="#1565c0" />
              <Text style={styles.filterBannerText}>تقرير خاص بالأستاذ: {data.teacher_filter_name}</Text>
            </View>
          )}
          <ReportKpis items={[
            { label: 'المحاضرات', value: summary.total_lectures, color: '#1565c0', icon: 'calendar' },
            { label: 'نُفّذت', value: summary.executed, color: '#16a34a', icon: 'checkmark-circle' },
            { label: 'غياب الأستاذ', value: summary.absent, color: '#dc2626', icon: 'close-circle' },
            { label: 'ملغاة', value: summary.cancelled, color: '#64748b', icon: 'remove-circle' },
            { label: 'نسبة التنفيذ', value: `${summary.execution_rate}%`, color: summary.execution_rate >= 80 ? '#16a34a' : summary.execution_rate >= 60 ? '#f97316' : '#dc2626', icon: 'speedometer' },
          ]} />
        </>)}

        {/* مبدّل العرض */}
        {hasRun && (
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, viewMode === 'teacher' && styles.tabActive]}
              onPress={() => setViewMode('teacher')}
              testID="tab-by-teacher"
            >
              <Ionicons name="person" size={16} color={viewMode === 'teacher' ? '#fff' : '#555'} />
              <Text style={[styles.tabText, viewMode === 'teacher' && styles.tabTextActive]}>حسب الأستاذ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, viewMode === 'lecture' && styles.tabActive]}
              onPress={() => setViewMode('lecture')}
              testID="tab-by-lecture"
            >
              <Ionicons name="list" size={16} color={viewMode === 'lecture' ? '#fff' : '#555'} />
              <Text style={[styles.tabText, viewMode === 'lecture' && styles.tabTextActive]}>حسب المحاضرات</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* حسب الأستاذ */}
        {hasRun && viewMode === 'teacher' && (
          <DenseTable testID="teacher-att" head={['#', 'الأستاذ', 'الرقم الوظيفي', 'نُفّذت', 'غياب', 'ملغاة', 'نسبة التنفيذ', 'التفاصيل']}
            align={['center', 'right', 'right', 'center', 'center', 'center', 'right', 'center']} emptyText="لا توجد محاضرات في هذه الفترة"
            keys={data.teachers.map((t: any) => t.teacher_id || t.teacher_name)} rowTestID={(i) => `teacher-att-${data.teachers[i].teacher_id || data.teachers[i].teacher_name}`}
            onRowClick={(i) => { const k = data.teachers[i].teacher_id || data.teachers[i].teacher_name; setExpanded(expanded === k ? null : k); }}
            rows={data.teachers.map((t: any, i: number) => [i + 1, <b style={{ color: '#0f2440' }}>{t.teacher_name}</b>, <span style={{ color: '#64748b', direction: 'ltr' }}>{t.employee_id || '—'}</span>,
              <Pill color="#2e7d32">{t.executed}</Pill>, <Pill color="#c62828">{t.absent}</Pill>, t.cancelled > 0 ? <Pill color="#616161">{t.cancelled}</Pill> : <span style={{ color: '#cbd5e1' }}>0</span>,
              <Bar pct={t.execution_rate} color={rateColor(t.execution_rate)} />, <span style={{ color: '#1565c0', fontSize: 11.5 }}>{expanded === (t.teacher_id || t.teacher_name) ? '▲ إخفاء' : `▼ ${t.lectures.length} محاضرة`}</span>])}
            expand={(i) => { const t = data.teachers[i]; if (expanded !== (t.teacher_id || t.teacher_name)) return null; return (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['المقرر', 'التاريخ', 'الوقت', 'الشعبة', 'الحالة', 'تنبيه'].map((h) => <th key={h} style={{ ...tableStyles.th, background: 'transparent', fontSize: 11.5, padding: '4px 8px', textAlign: 'right' }}>{h}</th>)}</tr></thead>
                <tbody>{t.lectures.map((l: any) => { const m = getStatusMeta(l.status); return (
                  <tr key={l.lecture_id}><td style={{ ...tableStyles.td, fontSize: 12 }}>{l.course_name}</td><td style={{ ...tableStyles.td, fontSize: 12 }}>{l.date}</td><td style={{ ...tableStyles.td, fontSize: 12, direction: 'ltr', textAlign: 'right' }}>{l.start_time}-{l.end_time}</td><td style={{ ...tableStyles.td, fontSize: 12 }}>{l.section || '—'}</td><td style={tableStyles.td}><Pill color={m.color}>{m.label}</Pill></td>
                  <td style={tableStyles.td}>{l.status === 'absent' && (
                    <AbsenceReminderButton lectureId={l.lecture_id} canSend={canSendReminder} compact />
                  )}</td></tr>); })}</tbody>
              </table>); }}
            footer={`${data.teachers.length} أستاذ · اضغط على الصف لعرض محاضراته`} />
        )}

        {/* حسب المحاضرات */}
        {hasRun && viewMode === 'lecture' && (
          <DenseTable testID="lecture-att" head={['#', 'المقرر', 'الأستاذ', 'القسم', 'التاريخ', 'الوقت', 'الشعبة', 'الحالة', 'تنبيه']}
            align={['center', 'right', 'right', 'right', 'right', 'center', 'center', 'center', 'center']} emptyText="لا توجد محاضرات في هذه الفترة" keys={data.lectures.map((l: any) => l.lecture_id)}
            rows={data.lectures.map((l: any, i: number) => { const m = getStatusMeta(l.status); return [i + 1, <b style={{ color: '#0f2440' }}>{l.course_name}</b>, l.teacher_name, <span style={{ color: '#64748b' }}>{l.department_name}</span>, l.date,
              <span style={{ direction: 'ltr', display: 'inline-block' }}>{l.start_time}-{l.end_time}</span>, l.section || '—', <Pill color={m.color}>{m.label}</Pill>,
              l.status === 'absent' ? <AbsenceReminderButton lectureId={l.lecture_id} canSend={canSendReminder} compact /> : null]; })}
            footer={`${data.lectures.length} محاضرة`} />
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const dateInp = { padding: '7px 8px', borderRadius: 8, border: '1px solid #dde3ec', fontSize: 12.5, fontFamily: 'inherit', background: '#fff', width: 150, height: 36, boxSizing: 'border-box' };

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  dateRow: { flexDirection: 'row', gap: 10 },
  fieldLabel: { fontSize: 13, color: '#666', marginBottom: 6, marginTop: 12 },
  dateBtn: { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 12 },
  todayChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#e3f2fd', paddingHorizontal: 12, height: 36, borderRadius: 8 },
  todayChipText: { fontSize: 12, color: '#1565c0', fontWeight: '600' },
  pickerWrapper: { backgroundColor: '#f5f5f5', borderRadius: 8, overflow: 'hidden' },
  picker: { height: 45 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 32, alignItems: 'center', marginBottom: 12 },
  emptyText: { marginTop: 10, fontSize: 15, fontWeight: '600', color: '#455a64', textAlign: 'center' },
  tabRow: { flexDirection: 'row-reverse', gap: 6, marginBottom: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#e0e0e0' },
  tabActive: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#555' },
  tabTextActive: { color: '#fff' },
  teacherCard: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
  teacherHeader: { padding: 14 },
  teacherInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#2e7d32', justifyContent: 'center', alignItems: 'center' },
  teacherName: { fontSize: 16, fontWeight: '700', color: '#333' },
  teacherId: { fontSize: 12, color: '#888' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  detailBox: { borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingHorizontal: 14, paddingVertical: 8 },
  lectureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 8 },
  lecCourse: { fontSize: 14, fontWeight: '600', color: '#333' },
  lecMeta: { fontSize: 12, color: '#999', marginTop: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  flatCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dde3ec', borderRadius: 8, paddingHorizontal: 10, height: 36 },
  searchInput: { flex: 1, fontSize: 12.5, color: '#333', textAlign: 'right', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : { paddingVertical: 8 }) },
  suggestionsBox: { position: 'absolute', top: 38, left: 0, right: 0, zIndex: 100, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0', overflow: 'hidden', maxHeight: 240, ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.12)' } as any : {}) },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  suggestionName: { fontSize: 14, fontWeight: '600', color: '#333' },
  suggestionMeta: { fontSize: 11, color: '#999', marginTop: 1 },
  chipAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#2e7d32', justifyContent: 'center', alignItems: 'center' },
  teacherChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#e8f5e9', borderRadius: 8, paddingHorizontal: 10, height: 36, borderWidth: 1, borderColor: '#a5d6a7' },
  teacherChipText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#2e7d32' },
  noResultText: { fontSize: 12, color: '#999', marginTop: 6, textAlign: 'center' },
  filterBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#e3f2fd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 12 },
  filterBannerText: { fontSize: 13, fontWeight: '700', color: '#1565c0' },
});
