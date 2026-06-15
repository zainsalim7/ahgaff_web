/**
 * صفحة تفاصيل الكلية - بيانات + عميد + أقسام + إحصائيات
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import api from '../src/services/api';

interface DeptItem {
  id: string;
  name: string;
  code: string;
  students_count: number;
  courses_count: number;
}

interface FacultySummary {
  id: string;
  name: string;
  code: string;
  dean_id?: string;
  dean_name?: string;
  departments: DeptItem[];
  stats: {
    departments_count: number;
    students_count: number;
    courses_count: number;
  };
}

export default function FacultyDetailsScreen() {
  const { facultyId } = useLocalSearchParams<{ facultyId: string }>();
  const router = useRouter();
  const [data, setData] = useState<FacultySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!facultyId) return;
    try {
      const res = await api.get(`/faculties/${facultyId}/summary`);
      setData(res.data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'فشل في تحميل بيانات الكلية');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [facultyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#c62828" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color="#c62828" />
          <Text style={styles.errorText}>{error || 'لا توجد بيانات'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchData}>
            <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'تفاصيل الكلية', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView dataSet={{ responsiveScrollRoot: "true" }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.pageScroll}
          showsVerticalScrollIndicator={false}
        >
          {/* رأس الصفحة */}
          <View dataSet={{ responsive: "page-header" }} style={styles.pageHeader}>
            <View style={styles.pageHeaderRight}>
              <Text dataSet={{ responsive: "page-title" }} style={styles.pageTitle} testID="faculty-name">{data.name}</Text>
              <View style={styles.breadcrumb}>
                <TouchableOpacity onPress={() => router.replace('/')}>
                  <Text style={styles.breadcrumbLink}>الرئيسية</Text>
                </TouchableOpacity>
                <Ionicons name="chevron-back" size={12} color="#8a95a8" />
                <Text style={styles.breadcrumbCurrent}>{data.name}</Text>
              </View>
              {data.code ? (
                <View style={styles.codeBadge}>
                  <Text style={styles.codeBadgeText}>{data.code}</Text>
                </View>
              ) : null}
            </View>
            <View dataSet={{ responsive: "page-header-actions" }} style={styles.pageHeaderActions}>
              <TouchableOpacity style={[styles.headerBtn, styles.btnGhost]} onPress={() => router.back()}>
                <Ionicons name="arrow-forward" size={16} color="#1a2540" />
                <Text style={styles.btnGhostText}>رجوع</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* بطاقات الإحصائيات */}
          <View dataSet={{ responsive: "stats-grid" }} style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={[styles.statIconWrap, { backgroundColor: '#ef6c00' }]}>
                <Ionicons name="grid" size={22} color="#fff" />
              </View>
              <View style={styles.statTextCol}>
                <Text style={styles.statLabel}>الأقسام</Text>
                <Text style={styles.statValue}>{data.stats.departments_count}</Text>
                <Text style={styles.statSubLabel}>قسم</Text>
              </View>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconWrap, { backgroundColor: '#29b6f6' }]}>
                <Ionicons name="people" size={22} color="#fff" />
              </View>
              <View style={styles.statTextCol}>
                <Text style={styles.statLabel}>الطلاب</Text>
                <Text style={styles.statValue}>{(data.stats.students_count || 0).toLocaleString('en-US')}</Text>
                <Text style={styles.statSubLabel}>طالب</Text>
              </View>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconWrap, { backgroundColor: '#4caf50' }]}>
                <Ionicons name="book" size={22} color="#fff" />
              </View>
              <View style={styles.statTextCol}>
                <Text style={styles.statLabel}>المقررات</Text>
                <Text style={styles.statValue}>{(data.stats.courses_count || 0).toLocaleString('en-US')}</Text>
                <Text style={styles.statSubLabel}>مقرر</Text>
              </View>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconWrap, { backgroundColor: '#7c4dff' }]}>
                <Ionicons name="person" size={22} color="#fff" />
              </View>
              <View style={styles.statTextCol}>
                <Text style={styles.statLabel}>العميد</Text>
                <Text style={styles.statValue} numberOfLines={1}>{data.dean_name || '—'}</Text>
                <Text style={styles.statSubLabel}>{data.dean_name ? 'عميد الكلية' : 'غير معيّن'}</Text>
              </View>
            </View>
          </View>

          {/* بطاقة البيانات الأساسية */}
          <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
              <Text style={styles.infoCardTitle}>البيانات الأساسية</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>اسم الكلية</Text>
              <Text style={styles.infoValue}>{data.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>الرمز</Text>
              <Text style={styles.infoValue}>{data.code || '—'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>العميد</Text>
              <Text style={styles.infoValue}>{data.dean_name || '—'}</Text>
            </View>
          </View>

          {/* بطاقة الجدول - الأقسام */}
          <View style={styles.tableCard}>
            <View style={styles.tableCardHeader}>
              <Text style={styles.tableCardTitle}>الأقسام</Text>
              <Text style={styles.tableCardCount}>
                إجمالي <Text style={styles.tableCardCountAccent}>{data.departments.length}</Text> قسم
              </Text>
            </View>

            {data.departments.length === 0 ? (
              <View style={styles.tableEmpty}>
                <Ionicons name="grid-outline" size={48} color="#cfd6e1" />
                <Text style={styles.tableEmptyText}>لا توجد أقسام في هذه الكلية</Text>
              </View>
            ) : (
              <>
                <View dataSet={{ responsive: "table-header-row" }} style={styles.tableHeaderRow}>
                  <View style={[styles.dCol1, styles.cellPad]}><Text style={styles.thText}>القسم</Text></View>
                  <View style={[styles.dCol2, styles.cellPad]}><Text style={styles.thText}>الرمز</Text></View>
                  <View style={[styles.dCol3, styles.cellPad]}><Text style={styles.thText}>الطلاب</Text></View>
                  <View style={[styles.dCol4, styles.cellPad]}><Text style={styles.thText}>المقررات</Text></View>
                  <View style={[styles.dCol5, styles.cellPad]}><Text style={styles.thText}></Text></View>
                </View>
                {data.departments.map((d, idx) => (
                  <TouchableOpacity
                    key={d.id}
                    dataSet={{ responsive: "table-row" }} style={[styles.tRow, idx % 2 === 1 && styles.tRowAlt]}
                    onPress={() => router.push(`/department-details?departmentId=${d.id}` as any)}
                    testID={`dept-${d.id}`}
                  >
                    <View style={[styles.dCol1, styles.cellPad]}>
                      <View style={styles.deptIconNew}>
                        <Ionicons name="grid" size={16} color="#ef6c00" />
                      </View>
                      <Text style={styles.tName} numberOfLines={1}>{d.name}</Text>
                    </View>
                    <View style={[styles.dCol2, styles.cellPad]}>
                      <Text style={styles.tCell}>{d.code || '—'}</Text>
                    </View>
                    <View style={[styles.dCol3, styles.cellPad]}>
                      <View style={[styles.statChip, { backgroundColor: '#e7f0fe' }]}>
                        <Ionicons name="people" size={11} color="#1565c0" />
                        <Text style={[styles.statChipText, { color: '#1565c0' }]}>{d.students_count}</Text>
                      </View>
                    </View>
                    <View style={[styles.dCol4, styles.cellPad]}>
                      <View style={[styles.statChip, { backgroundColor: '#e7f6ee' }]}>
                        <Ionicons name="book" size={11} color="#2e7d32" />
                        <Text style={[styles.statChipText, { color: '#2e7d32' }]}>{d.courses_count}</Text>
                      </View>
                    </View>
                    <View style={[styles.dCol5, styles.cellPad]}>
                      <Ionicons name="chevron-back" size={16} color="#a8b1c2" />
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const StatCard = ({ icon, label, value, color }: any) => (
  <View style={[styles.statCard, { borderColor: color + '30' }]}>
    <Ionicons name={icon} size={22} color={color} />
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const Section = ({ title, icon, children }: any) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={18} color="#c62828" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6fb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 14, color: '#666', marginTop: 12, textAlign: 'center' },
  retryBtn: { marginTop: 16, backgroundColor: '#2962ff', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700' },

  // ====== التصميم الجديد ======
  pageScroll: { padding: 20, paddingBottom: 60, maxWidth: 1440, width: '100%', alignSelf: 'center' },
  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 },
  pageHeaderRight: { alignItems: 'flex-end' },
  pageTitle: { fontSize: 26, fontWeight: '700', color: '#1a2540', textAlign: 'right', marginBottom: 6 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breadcrumbLink: { fontSize: 13, color: '#2962ff', fontWeight: '500' },
  breadcrumbCurrent: { fontSize: 13, color: '#8a95a8', fontWeight: '500' },
  codeBadge: { backgroundColor: '#e7f0fe', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginTop: 6, alignSelf: 'flex-end' },
  codeBadgeText: { fontSize: 11, color: '#2962ff', fontWeight: '700' },
  pageHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8 },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee' },
  btnGhostText: { color: '#1a2540', fontSize: 13, fontWeight: '600' },

  statsGrid: { flexDirection: 'row', gap: 14, marginBottom: 18, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 200, backgroundColor: '#fff', borderRadius: 14, padding: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#eef1f6' },
  statIconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  statTextCol: { flex: 1, alignItems: 'flex-end' },
  statLabel: { fontSize: 13, color: '#8a95a8', fontWeight: '500', marginBottom: 4 },
  statValue: { fontSize: 22, color: '#1a2540', fontWeight: '700', marginBottom: 2 },
  statSubLabel: { fontSize: 11, color: '#a8b1c2' },

  infoCard: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 18, borderWidth: 1, borderColor: '#eef1f6', overflow: 'hidden' },
  infoCardHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef1f6' },
  infoCardTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  infoRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f3f5f9' },
  infoLabel: { fontSize: 13, color: '#8a95a8', fontWeight: '500' },
  infoValue: { fontSize: 14, color: '#1a2540', fontWeight: '600' },

  tableCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eef1f6' },
  tableCardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef1f6' },
  tableCardTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540' },
  tableCardCount: { fontSize: 12, color: '#5b6678' },
  tableCardCountAccent: { color: '#2962ff', fontWeight: '700' },
  tableHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#fafbfd', borderBottomWidth: 1, borderBottomColor: '#eef1f6', minHeight: 44 },
  thText: { fontSize: 12, fontWeight: '600', color: '#5b6678', textAlign: 'right' },
  tRow: { flexDirection: 'row-reverse', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f5f9', minHeight: 60 },
  tRowAlt: { backgroundColor: '#fcfcfd' },
  cellPad: { paddingVertical: 12, paddingHorizontal: 14 },
  dCol1: { flex: 3, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  dCol2: { flex: 1 },
  dCol3: { flex: 1 },
  dCol4: { flex: 1 },
  dCol5: { flex: 0.5, alignItems: 'flex-start' },
  deptIconNew: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#fff3e0', alignItems: 'center', justifyContent: 'center' },
  tName: { fontSize: 13, fontWeight: '600', color: '#1a2540', flex: 1, textAlign: 'right' },
  tCell: { fontSize: 13, color: '#1a2540', textAlign: 'right' },
  statChip: { alignSelf: 'flex-end', flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statChipText: { fontSize: 12, fontWeight: '700' },
  tableEmpty: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  tableEmptyText: { fontSize: 14, color: '#8a95a8' },

  // ====== الستايلات القديمة (مُحتفظ بها للنسخ القديمة إن استخدمت) ======
  header: {
    backgroundColor: '#c62828',
    paddingTop: 24,
    paddingBottom: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  iconBox: {
    width: 70, height: 70, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  headerName: { fontSize: 19, fontWeight: '700', color: '#fff', textAlign: 'center' },
  headerCode: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 8,
    marginTop: -14,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' } as any)
      : { elevation: 1 }),
  },
  statValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  statLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fafafa',
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  sectionBody: { paddingHorizontal: 14, paddingVertical: 6 },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 10,
  },
  infoLabel: { width: 130, fontSize: 13, color: '#888' },
  infoValue: { flex: 1, fontSize: 13, color: '#222', textAlign: 'left', fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#aaa', padding: 18, fontSize: 13 },
  deptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 10,
  },
  deptIcon: {
    width: 38, height: 38, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  deptName: { fontSize: 14, fontWeight: '700', color: '#222' },
  deptMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  deptStatsRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  deptStatBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f7f7f7',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  deptStatText: { fontSize: 11, color: '#555' },
});
