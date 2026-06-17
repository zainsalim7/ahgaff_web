/**
 * صفحة تفاصيل الكلية - تصميم حديث (متّسق مع /department-details)
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import api from '../src/services/api';
import { LoadingScreen } from '../src/components/LoadingScreen';

interface DepartmentItem {
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
  departments: DepartmentItem[];
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
  const [search, setSearch] = useState('');

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

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredDepts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !data) return data?.departments || [];
    return data.departments.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.code || '').toLowerCase().includes(q),
    );
  }, [data, search]);

  if (loading) return <LoadingScreen />;

  if (error || !data) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.notFoundWrap}>
          <Ionicons name="alert-circle-outline" size={64} color="#cfd6e1" />
          <Text style={styles.notFoundText}>{error || 'الكلية غير موجودة'}</Text>
          <TouchableOpacity
            style={[styles.headerBtn, styles.btnPrimary, { marginTop: 14 }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={16} color="#fff" />
            <Text style={styles.btnPrimaryText}>رجوع</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: data.name, headerBackTitle: 'رجوع' }} />
      <ScrollView
        dataSet={{ responsiveScrollRoot: 'true' }}
        style={{ flex: 1 }}
        contentContainerStyle={styles.pageScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
        showsVerticalScrollIndicator={false}
      >
        {/* رأس الصفحة */}
        <View dataSet={{ responsive: 'page-header' }} style={styles.pageHeader}>
          <View style={styles.pageHeaderRight}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Text dataSet={{ responsive: 'page-title' }} style={styles.pageTitle}>تفاصيل الكلية</Text>
              {!!data.code && (
                <View style={styles.codeBadge}>
                  <Ionicons name="barcode" size={11} color="#1565c0" />
                  <Text style={styles.codeBadgeText}>{data.code}</Text>
                </View>
              )}
            </View>
            <View style={styles.breadcrumb}>
              <TouchableOpacity onPress={() => router.replace('/')}>
                <Text style={styles.breadcrumbLink}>الرئيسية</Text>
              </TouchableOpacity>
              <Ionicons name="chevron-back" size={12} color="#8a95a8" />
              <Text style={styles.breadcrumbCurrent}>{data.name}</Text>
            </View>
          </View>
          <View dataSet={{ responsive: 'page-header-actions' }} style={styles.pageHeaderActions}>
            <TouchableOpacity
              style={[styles.headerBtn, styles.btnGhost]}
              onPress={() => router.back()}
              testID="back-btn"
            >
              <Ionicons name="arrow-forward" size={16} color="#1a2540" />
              <Text style={styles.btnGhostText}>رجوع</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* بطاقة الكلية */}
        <View style={styles.entityCard}>
          <View style={styles.entityAvatar}>
            <Ionicons name="business" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.entityName}>{data.name}</Text>
            <View style={styles.entitySubRow}>
              {data.dean_name ? (
                <View style={styles.metaItem}>
                  <Ionicons name="ribbon-outline" size={13} color="#5b6678" />
                  <Text style={styles.metaText}>العميد: {data.dean_name}</Text>
                </View>
              ) : (
                <Text style={styles.metaText}>لا يوجد عميد محدد</Text>
              )}
            </View>
          </View>
          <View style={styles.entityIconBg}>
            <Ionicons name="business" size={32} color="#1565c0" />
          </View>
        </View>

        {/* شرائح إحصائية */}
        <View style={styles.compactStatsRow}>
          <View style={[styles.compactStatChip, { backgroundColor: '#e3f2fd' }]}>
            <Ionicons name="grid" size={14} color="#1565c0" />
            <Text style={[styles.compactStatValue, { color: '#1565c0' }]}>{data.stats.departments_count}</Text>
            <Text style={[styles.compactStatLabel, { color: '#1565c0' }]}>قسم</Text>
          </View>
          <View style={[styles.compactStatChip, { backgroundColor: '#fff3e0' }]}>
            <Ionicons name="people" size={14} color="#e65100" />
            <Text style={[styles.compactStatValue, { color: '#e65100' }]}>{data.stats.students_count}</Text>
            <Text style={[styles.compactStatLabel, { color: '#e65100' }]}>طالب</Text>
          </View>
          <View style={[styles.compactStatChip, { backgroundColor: '#e8f5e9' }]}>
            <Ionicons name="book" size={14} color="#2e7d32" />
            <Text style={[styles.compactStatValue, { color: '#2e7d32' }]}>{data.stats.courses_count}</Text>
            <Text style={[styles.compactStatLabel, { color: '#2e7d32' }]}>مقرر</Text>
          </View>
        </View>

        {/* قسم الأقسام */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <Text style={styles.sectionCardTitle}>أقسام الكلية</Text>
            <Text style={styles.sectionCardCount}>
              <Text style={styles.countAccent}>{data.departments.length}</Text> قسم
            </Text>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color="#8a95a8" />
            <TextInput
              style={styles.searchInput}
              placeholder="بحث عن قسم..."
              placeholderTextColor="#a8b1c2"
              value={search}
              onChangeText={setSearch}
              testID="search-input"
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color="#8a95a8" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.listWrap}>
            {filteredDepts.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="grid-outline" size={48} color="#cfd6e1" />
                <Text style={styles.emptyText}>
                  {search ? 'لا توجد نتائج للبحث' : 'لا توجد أقسام في هذه الكلية'}
                </Text>
              </View>
            ) : (
              filteredDepts.map(d => (
                <TouchableOpacity
                  key={d.id}
                  style={styles.itemRow}
                  onPress={() => router.push(`/department-details?departmentId=${d.id}` as any)}
                  testID={`dept-row-${d.id}`}
                >
                  <View style={[styles.itemIconBox, { backgroundColor: '#fff3e0' }]}>
                    <Ionicons name="grid" size={20} color="#ef6c00" />
                  </View>
                  <View style={styles.itemInfo}>
                    <View style={styles.itemTitleRow}>
                      <Text style={styles.itemName} numberOfLines={1}>{d.name}</Text>
                      {!!d.code && <Text style={styles.itemCode}>{d.code}</Text>}
                    </View>
                    <View style={styles.metaRow}>
                      <View style={[styles.badge, { backgroundColor: '#fff3e0' }]}>
                        <Ionicons name="people-outline" size={10} color="#e65100" />
                        <Text style={[styles.badgeText, { color: '#e65100' }]}>{d.students_count} طالب</Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: '#e8f5e9' }]}>
                        <Ionicons name="book-outline" size={10} color="#2e7d32" />
                        <Text style={[styles.badgeText, { color: '#2e7d32' }]}>{d.courses_count} مقرر</Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-back" size={18} color="#c0c8d4" />
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6fb' },
  pageScroll: { padding: 16, paddingBottom: 40, maxWidth: 1440, width: '100%', alignSelf: 'center' },

  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 },
  pageHeaderRight: { alignItems: 'flex-end' },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#1a2540', textAlign: 'right', marginBottom: 6 },
  codeBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#e3f2fd', marginBottom: 6 },
  codeBadgeText: { fontSize: 11, color: '#1565c0', fontWeight: '700' },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breadcrumbLink: { fontSize: 13, color: '#2962ff', fontWeight: '500' },
  breadcrumbCurrent: { fontSize: 13, color: '#8a95a8', fontWeight: '500' },
  pageHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  btnPrimary: { backgroundColor: '#2962ff' },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee' },
  btnGhostText: { color: '#1a2540', fontSize: 13, fontWeight: '600' },

  entityCard: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, gap: 12, borderWidth: 1, borderColor: '#eef1f6' },
  entityAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1565c0', alignItems: 'center', justifyContent: 'center' },
  entityIconBg: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#e3f2fd', alignItems: 'center', justifyContent: 'center' },
  entityName: { fontSize: 18, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  entitySubRow: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 5, flexWrap: 'wrap', gap: 6 },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#5b6678' },

  compactStatsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  compactStatChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  compactStatValue: { fontSize: 16, fontWeight: '700' },
  compactStatLabel: { fontSize: 12, fontWeight: '600' },

  sectionCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eef1f6', marginBottom: 18 },
  sectionCardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef1f6' },
  sectionCardTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540' },
  sectionCardCount: { fontSize: 12, color: '#5b6678' },
  countAccent: { color: '#2962ff', fontWeight: '700' },

  searchWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#fafbfd', borderWidth: 1, borderColor: '#e3e7ee', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, margin: 14, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 13, color: '#1a2540', textAlign: 'right', outlineStyle: 'none' as any },

  listWrap: { padding: 14, paddingTop: 6, gap: 10 },
  itemRow: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#fafbfd', borderRadius: 12, padding: 12, gap: 12, borderWidth: 1, borderColor: '#eef1f6' },
  itemIconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, alignItems: 'flex-end', gap: 6 },
  itemName: { fontSize: 14, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  itemCode: { fontSize: 11, color: '#8a95a8', fontWeight: '500' },
  itemTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  metaRow: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 13, color: '#8a95a8' },

  notFoundWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  notFoundText: { fontSize: 16, color: '#5b6678', marginTop: 12, textAlign: 'center' },
});
