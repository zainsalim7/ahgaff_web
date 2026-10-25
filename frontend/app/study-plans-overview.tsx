/**
 * متابعة الخطط الدراسية (الأسبوعية) لكل المقررات — مجمّعة بالكلية ثم القسم
 * يفتح كل مقرر صفحة إدارة خطته (manage-study-plan)
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { facultiesAPI, departmentsAPI, studyPlansAPI } from '../src/services/api';

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  approved: { label: 'معتمدة', color: '#2e7d32', bg: '#e8f5e9', icon: 'checkmark-circle' },
  pending: { label: 'بانتظار الاعتماد', color: '#ef6c00', bg: '#fff3e0', icon: 'time' },
  none: { label: 'لا توجد خطة', color: '#8a95a8', bg: '#f4f6fb', icon: 'document-outline' },
};

export default function StudyPlansOverviewScreen() {
  const router = useRouter();
  const [faculties, setFaculties] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedFaculty, setSelectedFaculty] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [data, setData] = useState<{ faculties: any[]; totals: any } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [f, d] = await Promise.all([facultiesAPI.getAll(), departmentsAPI.getAll()]);
        setFaculties(f.data?.items || f.data || []);
        setDepartments(d.data?.items || d.data || []);
      } catch {
        // ignore
      }
    })();
  }, []);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await studyPlansAPI.getOverview({
        faculty_id: selectedFaculty || undefined,
        department_id: selectedDept || undefined,
        status: selectedStatus || undefined,
      });
      setData(res.data);
    } catch {
      setData({ faculties: [], totals: { total: 0, approved: 0, pending: 0, none: 0 } });
    } finally {
      setLoading(false);
    }
  }, [selectedFaculty, selectedDept, selectedStatus]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  const deptOptions = selectedFaculty
    ? departments.filter((d: any) => (d.faculty_id || '') === selectedFaculty)
    : departments;

  const totals = data?.totals || { total: 0, approved: 0, pending: 0, none: 0 };

  return (
    <>
      <Stack.Screen options={{ title: 'متابعة الخطط الدراسية', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.pageScroll} testID="study-plans-overview-page">
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>متابعة الخطط الدراسية</Text>
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchOverview} testID="refresh-overview-btn">
              <Ionicons name="refresh" size={16} color="#1a2540" />
              <Text style={styles.refreshBtnText}>تحديث</Text>
            </TouchableOpacity>
          </View>

          {/* البطاقات الإحصائية */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard} testID="stat-total">
              <View style={[styles.statIconWrap, { backgroundColor: '#1565c0' }]}><Ionicons name="book" size={20} color="#fff" /></View>
              <View style={styles.statTextCol}>
                <Text style={styles.statLabel}>إجمالي المقررات</Text>
                <Text style={styles.statValue}>{totals.total}</Text>
              </View>
            </View>
            <View style={styles.statCard} testID="stat-approved">
              <View style={[styles.statIconWrap, { backgroundColor: '#2e7d32' }]}><Ionicons name="checkmark-circle" size={20} color="#fff" /></View>
              <View style={styles.statTextCol}>
                <Text style={styles.statLabel}>معتمدة</Text>
                <Text style={styles.statValue}>{totals.approved}</Text>
              </View>
            </View>
            <View style={styles.statCard} testID="stat-pending">
              <View style={[styles.statIconWrap, { backgroundColor: '#ef6c00' }]}><Ionicons name="time" size={20} color="#fff" /></View>
              <View style={styles.statTextCol}>
                <Text style={styles.statLabel}>بانتظار الاعتماد</Text>
                <Text style={styles.statValue}>{totals.pending}</Text>
              </View>
            </View>
            <View style={styles.statCard} testID="stat-none">
              <View style={[styles.statIconWrap, { backgroundColor: '#8a95a8' }]}><Ionicons name="document-outline" size={20} color="#fff" /></View>
              <View style={styles.statTextCol}>
                <Text style={styles.statLabel}>بلا خطة</Text>
                <Text style={styles.statValue}>{totals.none}</Text>
              </View>
            </View>
          </View>

          {/* الفلاتر */}
          <View style={styles.filtersCard}>
            <Text style={styles.filtersTitle}>الفلاتر</Text>
            <View style={styles.filtersRow}>
              <View style={styles.filterCol}>
                <Text style={styles.filterLabel}>الكلية</Text>
                <View style={styles.dropdown}>
                  <Picker
                    selectedValue={selectedFaculty}
                    onValueChange={(v) => { setSelectedFaculty(v); setSelectedDept(''); }}
                    style={styles.dropdownPicker}
                    testID="filter-faculty-picker"
                  >
                    <Picker.Item label="كل الكليات" value="" />
                    {faculties.map((f: any) => {
                      const fid = f.id || f._id;
                      return <Picker.Item key={fid} label={f.name} value={fid} />;
                    })}
                  </Picker>
                </View>
              </View>
              <View style={styles.filterCol}>
                <Text style={styles.filterLabel}>القسم</Text>
                <View style={styles.dropdown}>
                  <Picker
                    selectedValue={selectedDept}
                    onValueChange={(v) => setSelectedDept(v)}
                    style={styles.dropdownPicker}
                    testID="filter-department-picker"
                  >
                    <Picker.Item label="كل الأقسام" value="" />
                    {deptOptions.map((d: any) => {
                      const did = d.id || d._id;
                      return <Picker.Item key={did} label={d.name} value={did} />;
                    })}
                  </Picker>
                </View>
              </View>
              <View style={styles.filterCol}>
                <Text style={styles.filterLabel}>الحالة</Text>
                <View style={styles.dropdown}>
                  <Picker
                    selectedValue={selectedStatus}
                    onValueChange={(v) => setSelectedStatus(v)}
                    style={styles.dropdownPicker}
                    testID="filter-status-picker"
                  >
                    <Picker.Item label="كل الحالات" value="" />
                    <Picker.Item label="معتمدة" value="approved" />
                    <Picker.Item label="بانتظار الاعتماد" value="pending" />
                    <Picker.Item label="بلا خطة" value="none" />
                  </Picker>
                </View>
              </View>
            </View>
          </View>

          {/* النتائج */}
          {loading ? (
            <View style={styles.center}><ActivityIndicator size="large" color="#1565c0" /></View>
          ) : !data || data.faculties.length === 0 ? (
            <View style={styles.center} testID="overview-empty-state">
              <Ionicons name="file-tray-outline" size={36} color="#c3cad9" />
              <Text style={styles.emptyText}>لا توجد مقررات مطابقة للفلاتر الحالية</Text>
            </View>
          ) : (
            data.faculties.map((fac: any, fi: number) => (
              <View key={fi} style={styles.facultyBlock} testID={`faculty-block-${fi}`}>
                <View style={styles.facultyHeader}>
                  <Ionicons name="school" size={16} color="#6a1b9a" />
                  <Text style={styles.facultyTitle}>{fac.faculty_name}</Text>
                </View>
                {fac.departments.map((dep: any, di: number) => (
                  <View key={di} style={styles.deptBlock} testID={`dept-block-${fi}-${di}`}>
                    <View style={styles.deptHeader}>
                      <Ionicons name="business-outline" size={13} color="#1565c0" />
                      <Text style={styles.deptTitle}>{dep.department_name}</Text>
                      <Text style={styles.deptCount}>({dep.courses.length} مقرر)</Text>
                    </View>
                    {dep.courses.map((c: any) => {
                      const meta = STATUS_META[c.status] || STATUS_META.none;
                      return (
                        <TouchableOpacity
                          key={c.course_id}
                          style={styles.courseRow}
                          onPress={() => router.push({ pathname: '/manage-study-plan', params: { courseId: c.course_id, courseName: c.course_name } })}
                          testID={`course-row-${c.course_id}`}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.courseName} numberOfLines={1}>{c.course_name}</Text>
                            <View style={styles.courseMetaRow}>
                              {!!c.course_code && (
                                <View style={styles.codeChip}><Text style={styles.codeChipText}>{c.course_code}</Text></View>
                              )}
                              <Text style={styles.teacherText} numberOfLines={1}>{c.teacher_name}</Text>
                              {c.weeks_count > 0 && (
                                <Text style={styles.weeksText}>{c.weeks_count} أسبوع · {c.topics_count} موضوع</Text>
                              )}
                            </View>
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                            <Ionicons name={meta.icon} size={12} color={meta.color} />
                            <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
                          </View>
                          <Ionicons name="chevron-back" size={16} color="#c3cad9" />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6fb' },
  pageScroll: { padding: 20, paddingBottom: 60, maxWidth: 1440, width: '100%', alignSelf: 'center' },
  center: { padding: 40, alignItems: 'center', gap: 10 },
  emptyText: { color: '#8a95a8', fontSize: 13 },

  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  pageTitle: { fontSize: 24, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  refreshBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 14 },
  refreshBtnText: { color: '#1a2540', fontSize: 13, fontWeight: '600' },

  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 18, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 160, backgroundColor: '#fff', borderRadius: 14, padding: 16, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#eef1f6' },
  statIconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  statTextCol: { flex: 1, alignItems: 'flex-end' },
  statLabel: { fontSize: 12, color: '#8a95a8', fontWeight: '500', marginBottom: 3 },
  statValue: { fontSize: 20, color: '#1a2540', fontWeight: '700' },

  filtersCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: '#eef1f6' },
  filtersTitle: { fontSize: 14, fontWeight: '700', color: '#1a2540', marginBottom: 12, textAlign: 'right' },
  filtersRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  filterCol: { flex: 1, minWidth: 180, gap: 6 },
  filterLabel: { fontSize: 12, fontWeight: '600', color: '#5b6678', textAlign: 'right' },
  dropdown: { backgroundColor: '#f7f9fc', borderRadius: 10, borderWidth: 1, borderColor: '#e3e7ee', height: 44, justifyContent: 'center' },
  dropdownPicker: { flex: 1, height: 44, fontSize: 13, color: '#1a2540', textAlign: 'right', backgroundColor: 'transparent', borderWidth: 0, outlineStyle: 'none' as any },

  facultyBlock: { marginBottom: 20 },
  facultyHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: '#f3e5f5' },
  facultyTitle: { fontSize: 16, fontWeight: '800', color: '#1a2540' },

  deptBlock: { marginBottom: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#eef1f6', overflow: 'hidden' },
  deptHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, padding: 12, backgroundColor: '#fafbfd', borderBottomWidth: 1, borderBottomColor: '#eef1f6' },
  deptTitle: { fontSize: 13, fontWeight: '700', color: '#1a2540', flex: 1, textAlign: 'right' },
  deptCount: { fontSize: 11, color: '#8a95a8' },

  courseRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f5f9' },
  courseName: { fontSize: 13, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  courseMetaRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  codeChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#e3f2fd' },
  codeChipText: { fontSize: 10, fontWeight: '700', color: '#1565c0' },
  teacherText: { fontSize: 11, color: '#5b6678' },
  weeksText: { fontSize: 11, color: '#2e7d32', fontWeight: '600' },
  statusBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
});
