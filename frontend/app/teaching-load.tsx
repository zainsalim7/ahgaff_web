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
import { Picker } from '@react-native-picker/picker';
import { teachingLoadAPI, teachersAPI, departmentsAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { API_URL } from '../src/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CourseLoad {
  course_id: string;
  course_name: string;
  course_code: string;
  section: string;
  credit_hours: number;
  existing_load_id: string | null;
  existing_weekly_hours: number | null;
  existing_notes: string;
}

interface LoadItem {
  id: string;
  teacher_id: string;
  teacher_name: string;
  teacher_employee_id: string;
  department_id: string;
  course_id: string;
  course_name: string;
  course_code: string;
  course_section: string;
  weekly_hours: number;
  notes: string;
}

export default function TeachingLoadPage() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [courses, setCourses] = useState<CourseLoad[]>([]);
  const [hoursMap, setHoursMap] = useState<Record<string, string>>({});
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingLoads, setExistingLoads] = useState<LoadItem[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [viewMode, setViewMode] = useState<'assign' | 'summary'>('assign');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);

  // Load departments on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await departmentsAPI.getAll();
        setDepartments(res.data);
      } catch (e) {
        console.error('Error loading departments:', e);
      } finally {
        setLoadingDepts(false);
      }
    })();
  }, []);

  // Load teachers when department changes
  useEffect(() => {
    if (!selectedDept) {
      setTeachers([]);
      setSelectedTeacher('');
      return;
    }
    (async () => {
      setLoadingTeachers(true);
      try {
        const res = await teachersAPI.getAll({ department_id: selectedDept });
        setTeachers(res.data);
      } catch (e) {
        console.error('Error loading teachers:', e);
      } finally {
        setLoadingTeachers(false);
      }
    })();
  }, [selectedDept]);

  // Load teacher courses when teacher changes
  useEffect(() => {
    if (!selectedTeacher) {
      setCourses([]);
      setHoursMap({});
      return;
    }
    (async () => {
      setLoadingCourses(true);
      try {
        const res = await teachingLoadAPI.getTeacherCourses(selectedTeacher);
        const data: CourseLoad[] = res.data;
        setCourses(data);
        const map: Record<string, string> = {};
        for (const c of data) {
          map[c.course_id] = c.existing_weekly_hours != null ? String(c.existing_weekly_hours) : '';
        }
        setHoursMap(map);
      } catch (e) {
        console.error('Error loading courses:', e);
      } finally {
        setLoadingCourses(false);
      }
    })();
  }, [selectedTeacher]);

  // Load summary view data
  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const params: any = {};
      if (selectedDept) params.department_id = selectedDept;
      const res = await teachingLoadAPI.getAll(params);
      setExistingLoads(res.data.items || []);
    } catch (e) {
      console.error('Error loading summary:', e);
    } finally {
      setLoadingSummary(false);
    }
  }, [selectedDept]);

  useEffect(() => {
    if (viewMode === 'summary') loadSummary();
  }, [viewMode, selectedDept, loadSummary]);

  const handleSave = async () => {
    if (!selectedTeacher) return;
    const items = courses
      .filter(c => hoursMap[c.course_id] && parseFloat(hoursMap[c.course_id]) > 0)
      .map(c => ({
        teacher_id: selectedTeacher,
        course_id: c.course_id,
        weekly_hours: parseFloat(hoursMap[c.course_id]),
      }));

    if (items.length === 0) {
      Alert.alert('تنبيه', 'لم يتم إدخال أي ساعات');
      return;
    }

    setSaving(true);
    try {
      const res = await teachingLoadAPI.bulkSave(items);
      Alert.alert('نجاح', res.data.message);
      // Reload courses to refresh existing_load_id
      const refreshRes = await teachingLoadAPI.getTeacherCourses(selectedTeacher);
      setCourses(refreshRes.data);
    } catch (e: any) {
      Alert.alert('خطأ', e?.response?.data?.detail || 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (loadId: string, courseName: string) => {
    if (Platform.OS === 'web') {
      if (!window.confirm(`حذف العبء التدريسي لمقرر "${courseName}"؟`)) return;
    }
    try {
      await teachingLoadAPI.delete(loadId);
      Alert.alert('نجاح', 'تم الحذف');
      if (viewMode === 'summary') loadSummary();
      else if (selectedTeacher) {
        const res = await teachingLoadAPI.getTeacherCourses(selectedTeacher);
        setCourses(res.data);
        const map: Record<string, string> = {};
        for (const c of res.data) {
          map[c.course_id] = c.existing_weekly_hours != null ? String(c.existing_weekly_hours) : '';
        }
        setHoursMap(map);
      }
    } catch (e: any) {
      Alert.alert('خطأ', e?.response?.data?.detail || 'حدث خطأ');
    }
  };

  const handleExport = async (format: 'excel' | 'pdf') => {
    if (format === 'excel') setExportingExcel(true);
    else setExportingPDF(true);
    try {
      const token = await AsyncStorage.getItem('token');
      let url = `${API_URL}/api/export/teaching-load/${format}?`;
      if (selectedDept) url += `department_id=${selectedDept}&`;
      if (startDate) url += `start_date=${startDate}&`;
      if (endDate) url += `end_date=${endDate}&`;

      if (Platform.OS === 'web') {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('فشل التصدير');
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = format === 'excel' ? 'teaching_load.xlsx' : 'teaching_load.pdf';
        a.click();
        window.URL.revokeObjectURL(blobUrl);
      }
      Alert.alert('نجاح', 'تم تصدير الملف بنجاح');
    } catch (e: any) {
      console.error('Export error:', e);
      Alert.alert('خطأ', 'فشل التصدير');
    } finally {
      setExportingExcel(false);
      setExportingPDF(false);
    }
  };

  // Group summary by teacher
  const groupedByTeacher = existingLoads.reduce((acc: Record<string, { name: string; empId: string; items: LoadItem[]; totalHours: number }>, item) => {
    if (!acc[item.teacher_id]) {
      acc[item.teacher_id] = { name: item.teacher_name, empId: item.teacher_employee_id, items: [], totalHours: 0 };
    }
    acc[item.teacher_id].items.push(item);
    acc[item.teacher_id].totalHours += item.weekly_hours;
    return acc;
  }, {});

  if (loadingDepts) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565c0" />
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()} data-testid="teaching-load-back-btn">
          <Ionicons name="arrow-forward" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>جدول العبء التدريسي</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* View Mode Toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'assign' && styles.toggleBtnActive]}
          onPress={() => setViewMode('assign')}
          data-testid="teaching-load-assign-tab"
        >
          <Ionicons name="create-outline" size={18} color={viewMode === 'assign' ? '#fff' : '#1565c0'} />
          <Text style={[styles.toggleText, viewMode === 'assign' && styles.toggleTextActive]}>تعيين الساعات</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'summary' && styles.toggleBtnActive]}
          onPress={() => setViewMode('summary')}
          data-testid="teaching-load-summary-tab"
        >
          <Ionicons name="list-outline" size={18} color={viewMode === 'summary' ? '#fff' : '#1565c0'} />
          <Text style={[styles.toggleText, viewMode === 'summary' && styles.toggleTextActive]}>عرض الجدول</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Department Filter - shared */}
        <View style={styles.filterCard}>
          <Text style={styles.filterLabel}>القسم</Text>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={selectedDept}
              onValueChange={(v) => { setSelectedDept(v); setSelectedTeacher(''); }}
              style={styles.picker}
              data-testid="teaching-load-dept-picker"
            >
              <Picker.Item label="-- اختر القسم --" value="" />
              {departments.map(d => (
                <Picker.Item key={d.id} label={d.name} value={d.id} />
              ))}
            </Picker>
          </View>
        </View>

        {viewMode === 'assign' && (
          <>
            {/* Teacher Picker */}
            {selectedDept && (
              <View style={styles.filterCard}>
                <Text style={styles.filterLabel}>المعلم</Text>
                {loadingTeachers ? (
                  <ActivityIndicator size="small" color="#1565c0" />
                ) : (
                  <View style={styles.pickerWrapper}>
                    <Picker
                      selectedValue={selectedTeacher}
                      onValueChange={(v) => setSelectedTeacher(v)}
                      style={styles.picker}
                      data-testid="teaching-load-teacher-picker"
                    >
                      <Picker.Item label="-- اختر المعلم --" value="" />
                      {teachers.map(t => (
                        <Picker.Item key={t.id} label={t.full_name} value={t.id} />
                      ))}
                    </Picker>
                  </View>
                )}
              </View>
            )}

            {/* Courses Table */}
            {selectedTeacher && (
              loadingCourses ? (
                <View style={styles.emptyCard}>
                  <ActivityIndicator size="large" color="#1565c0" />
                  <Text style={styles.emptyText}>جاري تحميل المقررات...</Text>
                </View>
              ) : courses.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="book-outline" size={48} color="#ccc" />
                  <Text style={styles.emptyText}>لا توجد مقررات مسندة لهذا المعلم</Text>
                </View>
              ) : (
                <View style={styles.tableCard}>
                  <Text style={styles.tableTitle}>
                    مقررات المعلم ({courses.length})
                  </Text>
                  {/* Table Header */}
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHeaderCell, { flex: 2 }]}>المقرر</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 1 }]}>الرمز</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 1 }]}>الشعبة</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 1 }]}>الساعات المعتمدة</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>ساعات أسبوعية</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 0.5 }]}></Text>
                  </View>
                  {/* Table Body */}
                  {courses.map((c) => (
                    <View key={c.course_id} style={styles.tableRow}>
                      <Text style={[styles.tableCell, { flex: 2 }]}>{c.course_name}</Text>
                      <Text style={[styles.tableCell, { flex: 1, color: '#666' }]}>{c.course_code}</Text>
                      <Text style={[styles.tableCell, { flex: 1, color: '#888' }]}>{c.section || '-'}</Text>
                      <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{c.credit_hours}</Text>
                      <View style={[{ flex: 1.2, paddingHorizontal: 4 }]}>
                        {Platform.OS === 'web' ? (
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={hoursMap[c.course_id] || ''}
                            onChange={(e: any) => setHoursMap(prev => ({ ...prev, [c.course_id]: e.target.value }))}
                            placeholder="0"
                            style={{
                              width: '100%',
                              padding: 8,
                              borderRadius: 8,
                              border: '1px solid #ddd',
                              fontSize: 14,
                              textAlign: 'center',
                              backgroundColor: c.existing_load_id ? '#e8f5e9' : '#fff',
                            }}
                            data-testid={`teaching-load-hours-${c.course_id}`}
                          />
                        ) : (
                          <Text style={[styles.tableCell, { textAlign: 'center' }]}>{hoursMap[c.course_id] || '0'}</Text>
                        )}
                      </View>
                      <View style={[{ flex: 0.5, alignItems: 'center', justifyContent: 'center' }]}>
                        {c.existing_load_id && (
                          <TouchableOpacity
                            onPress={() => handleDelete(c.existing_load_id!, c.course_name)}
                            data-testid={`teaching-load-delete-${c.course_id}`}
                          >
                            <Ionicons name="trash-outline" size={18} color="#e53935" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}

                  {/* Total */}
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>المجموع الأسبوعي</Text>
                    <Text style={styles.totalValue}>
                      {Object.values(hoursMap).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)} ساعة
                    </Text>
                  </View>

                  {/* Save Button */}
                  <TouchableOpacity
                    style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                    onPress={handleSave}
                    disabled={saving}
                    data-testid="teaching-load-save-btn"
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="save-outline" size={20} color="#fff" />
                        <Text style={styles.saveBtnText}>حفظ العبء التدريسي</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )
            )}

            {/* Empty state */}
            {!selectedDept && (
              <View style={styles.emptyCard}>
                <Ionicons name="grid-outline" size={56} color="#bbb" />
                <Text style={styles.emptyText}>اختر القسم ثم المعلم لتعيين العبء التدريسي</Text>
              </View>
            )}
          </>
        )}

        {viewMode === 'summary' && (
          <>
            {/* Date Range + Export Buttons */}
            {Platform.OS === 'web' && (
              <View style={styles.filterCard}>
                <Text style={styles.filterLabel}>فترة حساب إجمالي الساعات</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>من تاريخ</Text>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e: any) => setStartDate(e.target.value)}
                      style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
                      data-testid="export-start-date"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>إلى تاريخ</Text>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e: any) => setEndDate(e.target.value)}
                      style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
                      data-testid="export-end-date"
                    />
                  </View>
                </View>
                {(startDate && endDate) && (
                  <View style={{ backgroundColor: '#fff3e0', padding: 8, borderRadius: 8, marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: '#e65100', textAlign: 'center' }}>
                      الفترة: {startDate} إلى {endDate} ({Math.max(1, Math.ceil(((new Date(endDate)).getTime() - (new Date(startDate)).getTime()) / (7 * 24 * 60 * 60 * 1000) + 1/7))} أسبوع تقريباً)
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.exportBtn, { backgroundColor: '#4caf50' }]}
                    onPress={() => handleExport('excel')}
                    disabled={exportingExcel}
                    data-testid="export-excel-btn"
                  >
                    {exportingExcel ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={18} color="#fff" />
                        <Text style={styles.exportBtnText}>تصدير Excel</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.exportBtn, { backgroundColor: '#e53935' }]}
                    onPress={() => handleExport('pdf')}
                    disabled={exportingPDF}
                    data-testid="export-pdf-btn"
                  >
                    {exportingPDF ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="document-text-outline" size={18} color="#fff" />
                        <Text style={styles.exportBtnText}>تصدير PDF</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                {!startDate && !endDate && (
                  <Text style={{ fontSize: 11, color: '#999', marginTop: 8, textAlign: 'center' }}>
                    بدون تحديد تاريخ: سيتم حساب الإجمالي على أساس فصل دراسي (16 أسبوع)
                  </Text>
                )}
              </View>
            )}

            {loadingSummary ? (
            <View style={styles.emptyCard}>
              <ActivityIndicator size="large" color="#1565c0" />
              <Text style={styles.emptyText}>جاري تحميل الجدول...</Text>
            </View>
          ) : Object.keys(groupedByTeacher).length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>
                {selectedDept ? 'لا توجد بيانات عبء تدريسي لهذا القسم' : 'اختر القسم لعرض جدول العبء التدريسي'}
              </Text>
            </View>
          ) : (
            Object.entries(groupedByTeacher).map(([tId, group]) => (
              <View key={tId} style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <View>
                    <Text style={styles.summaryTeacherName}>{group.name}</Text>
                    {group.empId ? <Text style={styles.summaryEmpId}>الرقم الوظيفي: {group.empId}</Text> : null}
                  </View>
                  <View style={styles.summaryBadge}>
                    <Text style={styles.summaryBadgeText}>{group.totalHours} ساعة/أسبوع</Text>
                  </View>
                </View>
                {/* Courses table */}
                <View style={styles.summaryTableHeader}>
                  <Text style={[styles.summaryTableHeaderCell, { flex: 2 }]}>المقرر</Text>
                  <Text style={[styles.summaryTableHeaderCell, { flex: 1 }]}>الرمز</Text>
                  <Text style={[styles.summaryTableHeaderCell, { flex: 1 }]}>الشعبة</Text>
                  <Text style={[styles.summaryTableHeaderCell, { flex: 1 }]}>الساعات</Text>
                  <Text style={[styles.summaryTableHeaderCell, { flex: 0.5 }]}></Text>
                </View>
                {group.items.map((item) => (
                  <View key={item.id} style={styles.summaryTableRow}>
                    <Text style={[styles.summaryTableCell, { flex: 2 }]}>{item.course_name}</Text>
                    <Text style={[styles.summaryTableCell, { flex: 1, color: '#666' }]}>{item.course_code}</Text>
                    <Text style={[styles.summaryTableCell, { flex: 1, color: '#888' }]}>{item.course_section || '-'}</Text>
                    <Text style={[styles.summaryTableCell, { flex: 1, textAlign: 'center', fontWeight: '600' }]}>{item.weekly_hours}</Text>
                    <View style={[{ flex: 0.5, alignItems: 'center', justifyContent: 'center' }]}>
                      <TouchableOpacity
                        onPress={() => handleDelete(item.id, item.course_name)}
                        data-testid={`summary-delete-${item.id}`}
                      >
                        <Ionicons name="trash-outline" size={16} color="#e53935" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )
          </>
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
  toggleRow: {
    flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: '#e3f2fd',
  },
  toggleBtnActive: { backgroundColor: '#1565c0' },
  toggleText: { fontSize: 14, color: '#1565c0', fontWeight: '500' },
  toggleTextActive: { color: '#fff' },
  scrollView: { flex: 1, padding: 16 },
  filterCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2,
  },
  filterLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  pickerWrapper: {
    backgroundColor: '#f5f5f5', borderRadius: 8, borderWidth: 1, borderColor: '#ddd', overflow: 'hidden',
  },
  picker: { height: 45 },
  emptyCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 40, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2,
  },
  emptyText: { marginTop: 10, fontSize: 16, color: '#999', textAlign: 'center' },
  tableCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2,
  },
  tableTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 },
  tableHeaderRow: {
    flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 4,
    backgroundColor: '#1565c0', borderRadius: 8, marginBottom: 4,
  },
  tableHeaderCell: { fontSize: 12, fontWeight: '700', color: '#fff', textAlign: 'center' },
  tableRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  tableCell: { fontSize: 13, color: '#333' },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 8, marginTop: 8,
    backgroundColor: '#e3f2fd', borderRadius: 8,
  },
  totalLabel: { fontSize: 14, fontWeight: '600', color: '#1565c0' },
  totalValue: { fontSize: 18, fontWeight: '700', color: '#1565c0' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 16, backgroundColor: '#1565c0', paddingVertical: 14, borderRadius: 10,
  },
  saveBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  // Summary styles
  summaryCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2,
  },
  summaryHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  summaryTeacherName: { fontSize: 16, fontWeight: '600', color: '#333' },
  summaryEmpId: { fontSize: 12, color: '#888', marginTop: 2 },
  summaryBadge: { backgroundColor: '#e3f2fd', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  summaryBadgeText: { fontSize: 14, fontWeight: '600', color: '#1565c0' },
  summaryTableHeader: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4,
    backgroundColor: '#f5f5f5', borderRadius: 6, marginBottom: 4,
  },
  summaryTableHeaderCell: { fontSize: 11, fontWeight: '700', color: '#666', textAlign: 'center' },
  summaryTableRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  summaryTableCell: { fontSize: 13, color: '#333' },
  exportBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 8,
  },
  exportBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
