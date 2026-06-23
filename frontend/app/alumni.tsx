/**
 * صفحة الخريجين - عرض وإدارة الخريجين
 * - فلاتر بالسنة + الكلية + بحث بالاسم
 * - إحصاءات مختصرة (إجمالي + تفصيل بالسنة)
 * - استرجاع نادر (لخطأ في التخرج)
 */
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import { alumniAPI, facultiesAPI } from '../src/services/api';
import { useAuth, PERMISSIONS } from '../src/contexts/AuthContext';

interface AlumniRow {
  id: string;
  student_id: string;
  reference_number?: string;
  full_name: string;
  phone?: string;
  email?: string;
  department_name?: string;
  faculty_name?: string;
  faculty_id?: string;
  level_graduated?: number;
  graduation_year?: number;
  graduation_date?: string;
  graduation_semester?: string;
  final_gpa?: number;
  total_credit_hours?: number;
  certificate_number?: string;
  honors?: string;
  notes?: string;
}

export default function AlumniScreen() {
  const router = useRouter();
  const { hasAnyPermission, isLoading: authLoading, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AlumniRow[]>([]);
  const [byYear, setByYear] = useState<Record<string, number>>({});
  const [faculties, setFaculties] = useState<any[]>([]);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [facultyFilter, setFacultyFilter] = useState<string>('');
  const [searchQ, setSearchQ] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const canView = isAdmin || hasAnyPermission([PERMISSIONS.VIEW_STUDENTS, PERMISSIONS.MANAGE_STUDENTS]);
  const canRestore = isAdmin || hasAnyPermission([PERMISSIONS.MANAGE_STUDENTS]);

  useEffect(() => {
    if (!authLoading && !canView) {
      router.replace('/no-permission?from=/alumni' as any);
    }
  }, [authLoading, canView]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (yearFilter) params.year = yearFilter;
      if (facultyFilter) params.faculty_id = facultyFilter;
      if (searchQ.trim()) params.q = searchQ.trim();
      const r = await alumniAPI.getAll(params);
      setItems(r.data.items || []);
      setByYear(r.data.by_year || {});
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل تحميل قائمة الخريجين';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('خطأ', msg);
    } finally {
      setLoading(false);
    }
  };

  const loadFaculties = async () => {
    try {
      const r = await facultiesAPI.getAll();
      setFaculties(r.data || []);
    } catch {
      setFaculties([]);
    }
  };

  useEffect(() => {
    if (canView) {
      loadFaculties();
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  // فلترة عند تغيّر الفلاتر
  useEffect(() => {
    if (!canView) return;
    const t = setTimeout(fetchData, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearFilter, facultyFilter, searchQ]);

  const availableYears = useMemo(() => {
    return Object.keys(byYear).map(Number).sort((a, b) => b - a);
  }, [byYear]);

  const handleRestore = async (a: AlumniRow) => {
    const ok = Platform.OS === 'web'
      ? window.confirm(`استرجاع "${a.full_name}" إلى قائمة الطلاب؟\n(ستُحذف بيانات التخرج وحالته ستعود إلى نشط)`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert('استرجاع خريج', `استرجاع ${a.full_name}؟`, [
            { text: 'إلغاء', onPress: () => resolve(false) },
            { text: 'استرجاع', onPress: () => resolve(true), style: 'destructive' },
          ]);
        });
    if (!ok) return;
    setRestoringId(a.id);
    try {
      const r = await alumniAPI.restore(a.id);
      if (Platform.OS === 'web') window.alert(r.data.message);
      else Alert.alert('تم', r.data.message);
      fetchData();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل الاسترجاع';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('خطأ', msg);
    } finally {
      setRestoringId(null);
    }
  };

  if (authLoading || !canView) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'الخريجون', headerShown: false }} />

      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} data-testid="alumni-back-btn">
          <Ionicons name="arrow-forward" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>الخريجون</Text>
          <Text style={styles.headerSubtitle}>قائمة الطلاب المتخرجين مرتّبة بسنة التخرج</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="school" size={24} color="#fff" />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* رأس الصفحة */}
        <View style={styles.heroCard}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
            <Ionicons name="school" size={28} color="#0d47a1" />
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>الخريجون</Text>
              <Text style={styles.heroSub}>إجمالي: {items.length} خريج · {availableYears.length} سنة تخرج</Text>
            </View>
          </View>
        </View>

        {/* إحصاءات سريعة بالسنة */}
        {availableYears.length > 0 && (
          <View style={styles.statsRow}>
            {availableYears.map(y => (
              <TouchableOpacity
                key={y}
                onPress={() => setYearFilter(yearFilter === y ? null : y)}
                style={[styles.yearChip, yearFilter === y && styles.yearChipActive]}
                data-testid={`year-chip-${y}`}
              >
                <Text style={[styles.yearChipText, yearFilter === y && styles.yearChipTextActive]}>{y}</Text>
                <Text style={[styles.yearChipCount, yearFilter === y && styles.yearChipCountActive]}>{byYear[String(y)]}</Text>
              </TouchableOpacity>
            ))}
            {yearFilter !== null && (
              <TouchableOpacity onPress={() => setYearFilter(null)} style={styles.clearChip} data-testid="clear-year-filter">
                <Ionicons name="close" size={14} color="#c62828" />
                <Text style={{ fontSize: 11, color: '#c62828', fontWeight: '700' }}>إزالة فلتر السنة</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* الفلاتر */}
        <View style={styles.filterCard}>
          <View style={styles.filterRow}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <Text style={styles.filterLabel}>بحث</Text>
              <TextInput
                style={styles.input}
                placeholder="اسم أو رقم القيد"
                value={searchQ}
                onChangeText={setSearchQ}
                data-testid="alumni-search-input"
              />
            </View>
            {faculties.length > 0 && (
              <View style={{ flex: 1, minWidth: 200 }}>
                <Text style={styles.filterLabel}>الكلية</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => setFacultyFilter('')}
                    style={[styles.facBtn, !facultyFilter && styles.facBtnActive]}
                  >
                    <Text style={[styles.facBtnText, !facultyFilter && styles.facBtnTextActive]}>الكل</Text>
                  </TouchableOpacity>
                  {faculties.map((f: any) => (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => setFacultyFilter(f.id)}
                      style={[styles.facBtn, facultyFilter === f.id && styles.facBtnActive]}
                    >
                      <Text style={[styles.facBtnText, facultyFilter === f.id && styles.facBtnTextActive]} numberOfLines={1}>{f.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>

        {/* الجدول */}
        {loading ? (
          <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="school-outline" size={42} color="#cfd6e1" />
            <Text style={styles.emptyText}>لا يوجد خريجون مطابقون</Text>
            <Text style={styles.emptyHint}>يمكنك تخريج طالب من صفحة تفاصيله</Text>
          </View>
        ) : (
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.thIdx]}>#</Text>
              <Text style={[styles.thName, { flex: 2 }]}>الاسم</Text>
              <Text style={styles.th}>رقم القيد</Text>
              <Text style={styles.th}>القسم</Text>
              <Text style={styles.th}>الكلية</Text>
              <Text style={styles.th}>سنة التخرج</Text>
              <Text style={styles.th}>المعدل</Text>
              <Text style={styles.th}>التقدير</Text>
              {canRestore && <Text style={[styles.th, { width: 70 }]}>إجراء</Text>}
            </View>
            {items.map((a, idx) => (
              <View key={a.id} style={[styles.tableRow, idx % 2 === 0 && { backgroundColor: '#fafbfc' }]}>
                <Text style={styles.tdIdx}>{idx + 1}</Text>
                <Text style={[styles.tdName, { flex: 2 }]} numberOfLines={1}>{a.full_name}</Text>
                <Text style={styles.td}>{a.student_id}</Text>
                <Text style={styles.td} numberOfLines={1}>{a.department_name || '-'}</Text>
                <Text style={styles.td} numberOfLines={1}>{a.faculty_name || '-'}</Text>
                <View style={[styles.td, styles.yearBadgeCell]}>
                  <View style={styles.yearBadge}>
                    <Text style={styles.yearBadgeText}>{a.graduation_year || '-'}</Text>
                  </View>
                </View>
                <Text style={[styles.td, { fontWeight: '700', color: '#1565c0' }]}>{a.final_gpa != null ? a.final_gpa.toFixed(2) : '-'}</Text>
                <Text style={styles.td} numberOfLines={1}>{a.honors || '-'}</Text>
                {canRestore && (
                  <TouchableOpacity
                    onPress={() => handleRestore(a)}
                    disabled={restoringId === a.id}
                    style={styles.restoreBtn}
                    data-testid={`restore-${a.id}`}
                  >
                    {restoringId === a.id ? (
                      <ActivityIndicator size="small" color="#ef6c00" />
                    ) : (
                      <Ionicons name="arrow-undo" size={15} color="#ef6c00" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  headerBar: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#0d47a1', paddingHorizontal: 14, paddingVertical: 12 },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff', textAlign: 'right' },
  headerSubtitle: { fontSize: 11, color: '#cfd8dc', textAlign: 'right', marginTop: 2 },
  headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  heroCard: { backgroundColor: '#fff', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#e0e7ee', marginBottom: 12 },
  heroTitle: { fontSize: 18, fontWeight: '700', color: '#0d47a1', textAlign: 'right' },
  heroSub: { fontSize: 12, color: '#5a6c7d', textAlign: 'right', marginTop: 2 },
  statsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  yearChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e0e7ee' },
  yearChipActive: { backgroundColor: '#0d47a1', borderColor: '#0d47a1' },
  yearChipText: { fontSize: 13, fontWeight: '700', color: '#0d47a1' },
  yearChipTextActive: { color: '#fff' },
  yearChipCount: { fontSize: 11, color: '#5a6c7d', backgroundColor: '#f0f3f7', paddingHorizontal: 6, borderRadius: 8 },
  yearChipCountActive: { color: '#0d47a1', backgroundColor: '#fff' },
  clearChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 16, backgroundColor: '#ffebee', borderWidth: 1, borderColor: '#c62828' },
  filterCard: { backgroundColor: '#fff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e0e7ee', marginBottom: 12 },
  filterRow: { flexDirection: 'row-reverse', gap: 12, flexWrap: 'wrap' },
  filterLabel: { fontSize: 12, color: '#5a6c7d', fontWeight: '600', textAlign: 'right', marginBottom: 4 },
  input: { backgroundColor: '#f5f7fa', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#333', textAlign: 'right', borderWidth: 1, borderColor: '#e0e7ee' },
  facBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, backgroundColor: '#f5f7fa', borderWidth: 1, borderColor: '#e0e7ee' },
  facBtnActive: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  facBtnText: { fontSize: 12, color: '#333', fontWeight: '600' },
  facBtnTextActive: { color: '#fff' },
  emptyBox: { backgroundColor: '#fff', padding: 40, borderRadius: 10, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e0e7ee' },
  emptyText: { fontSize: 14, color: '#5a6c7d', fontWeight: '600' },
  emptyHint: { fontSize: 11, color: '#90a4ae' },
  tableCard: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e0e7ee', overflow: 'hidden' },
  tableHeader: { flexDirection: 'row-reverse', backgroundColor: '#e3f2fd', padding: 10, gap: 6 },
  th: { flex: 1, fontSize: 11, fontWeight: '700', color: '#0d47a1', textAlign: 'right' },
  thIdx: { width: 32, fontSize: 11, fontWeight: '700', color: '#0d47a1', textAlign: 'right' },
  thName: { fontSize: 11, fontWeight: '700', color: '#0d47a1', textAlign: 'right' },
  tableRow: { flexDirection: 'row-reverse', padding: 10, gap: 6, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f0f3f7' },
  td: { flex: 1, fontSize: 12, color: '#333', textAlign: 'right' },
  tdIdx: { width: 32, fontSize: 11, color: '#90a4ae', fontWeight: '700', textAlign: 'right' },
  tdName: { fontSize: 13, fontWeight: '600', color: '#0d47a1', textAlign: 'right' },
  yearBadgeCell: { flex: 1, alignItems: 'flex-end' },
  yearBadge: { backgroundColor: '#fff3e0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: '#ef6c00' },
  yearBadgeText: { fontSize: 11, fontWeight: '700', color: '#ef6c00' },
  restoreBtn: { width: 70, alignItems: 'center', padding: 6 },
});
