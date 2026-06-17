/**
 * صفحة تفاصيل المقرر - تصميم حديث (متّسق مع /department-details و /student-details)
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import api from '../src/services/api';
import { LoadingScreen } from '../src/components/LoadingScreen';

interface StudentItem {
  id: string;
  student_id: string;
  full_name: string;
  attendance_pct: number;
  present_count: number;
  absent_count: number;
}
interface CourseFullDetails {
  id: string;
  name: string;
  code: string;
  level?: number;
  section?: string;
  credit_hours?: number;
  room?: string;
  teacher_id?: string;
  teacher_name?: string;
  department_id?: string;
  department_name?: string;
  semester_id?: string;
  semester_name?: string;
  academic_year?: string;
  students: StudentItem[];
  students_count: number;
  lecture_stats: { total: number; completed: number; scheduled: number; cancelled: number; absent: number };
  study_plan?: { total_topics: number; confirmed_topics: number; completion_pct: number } | null;
}

export default function CourseDetailsScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const router = useRouter();
  const [data, setData] = useState<CourseFullDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    if (!courseId) return;
    try {
      const res = await api.get(`/courses/${courseId}/full-details`);
      setData(res.data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'فشل في تحميل بيانات المقرر');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [courseId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !data) return data?.students || [];
    return data.students.filter(s =>
      s.full_name.toLowerCase().includes(q) ||
      (s.student_id || '').toLowerCase().includes(q),
    );
  }, [data, search]);

  if (loading) return <LoadingScreen />;

  if (error || !data) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.notFoundWrap}>
          <Ionicons name="alert-circle-outline" size={64} color="#cfd6e1" />
          <Text style={styles.notFoundText}>{error || 'المقرر غير موجود'}</Text>
          <TouchableOpacity style={[styles.headerBtn, styles.btnPrimary, { marginTop: 14 }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={16} color="#fff" />
            <Text style={styles.btnPrimaryText}>رجوع</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const ls = data.lecture_stats;

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
              <Text dataSet={{ responsive: 'page-title' }} style={styles.pageTitle}>تفاصيل المقرر</Text>
              {!!data.code && (
                <View style={styles.codeBadge}>
                  <Ionicons name="barcode" size={11} color="#2e7d32" />
                  <Text style={styles.codeBadgeText}>{data.code}</Text>
                </View>
              )}
              {!!data.semester_name && (
                <View style={styles.semBadge}>
                  <Ionicons name="calendar" size={11} color="#1565c0" />
                  <Text style={styles.semBadgeText}>{data.semester_name}</Text>
                </View>
              )}
            </View>
            <View style={styles.breadcrumb}>
              <TouchableOpacity onPress={() => router.replace('/')}>
                <Text style={styles.breadcrumbLink}>الرئيسية</Text>
              </TouchableOpacity>
              <Ionicons name="chevron-back" size={12} color="#8a95a8" />
              <TouchableOpacity onPress={() => router.replace('/(tabs)/courses' as any)}>
                <Text style={styles.breadcrumbLink}>المقررات</Text>
              </TouchableOpacity>
              <Ionicons name="chevron-back" size={12} color="#8a95a8" />
              <Text style={styles.breadcrumbCurrent}>{data.name}</Text>
            </View>
          </View>
          <View dataSet={{ responsive: 'page-header-actions' }} style={styles.pageHeaderActions}>
            <TouchableOpacity style={[styles.headerBtn, styles.btnGhost]} onPress={() => router.back()} testID="back-btn">
              <Ionicons name="arrow-forward" size={16} color="#1a2540" />
              <Text style={styles.btnGhostText}>رجوع</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerBtn, styles.btnPrimary]}
              onPress={() => router.push({ pathname: '/course-lectures', params: { courseId: data.id, courseName: data.name } } as any)}
              testID="open-lectures-btn"
            >
              <Ionicons name="list" size={16} color="#fff" />
              <Text style={styles.btnPrimaryText}>محاضرات المقرر</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* بطاقة المقرر */}
        <View style={styles.entityCard}>
          <View style={styles.entityAvatar}>
            <Ionicons name="book" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.entityName}>{data.name}</Text>
            <View style={styles.entitySubRow}>
              {data.teacher_name ? (
                <TouchableOpacity
                  style={styles.metaItem}
                  onPress={() => data.teacher_id && router.push(`/teacher-courses?teacherId=${data.teacher_id}` as any)}
                >
                  <Ionicons name="person-outline" size={13} color="#5b6678" />
                  <Text style={[styles.metaText, { color: '#2962ff', fontWeight: '600' }]}>{data.teacher_name}</Text>
                </TouchableOpacity>
              ) : null}
              {data.department_name ? (
                <>
                  {data.teacher_name ? <View style={styles.dot} /> : null}
                  <TouchableOpacity
                    style={styles.metaItem}
                    onPress={() => data.department_id && router.push(`/department-details?departmentId=${data.department_id}` as any)}
                  >
                    <Ionicons name="grid-outline" size={13} color="#5b6678" />
                    <Text style={[styles.metaText, { color: '#2962ff', fontWeight: '600' }]}>{data.department_name}</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
            <View style={styles.entitySubRow}>
              {data.level ? (
                <View style={[styles.badge, { backgroundColor: '#e7f0fe' }]}>
                  <Text style={[styles.badgeText, { color: '#1565c0' }]}>المستوى {data.level}</Text>
                </View>
              ) : null}
              {!!data.section && (
                <View style={[styles.badge, { backgroundColor: '#f3e5f5' }]}>
                  <Text style={[styles.badgeText, { color: '#6a1b9a' }]}>شعبة {data.section}</Text>
                </View>
              )}
              {data.credit_hours ? (
                <View style={[styles.badge, { backgroundColor: '#fff3e0' }]}>
                  <Ionicons name="time-outline" size={10} color="#e65100" />
                  <Text style={[styles.badgeText, { color: '#e65100' }]}>{data.credit_hours} س معتمدة</Text>
                </View>
              ) : null}
              {!!data.room && (
                <View style={[styles.badge, { backgroundColor: '#e8f5e9' }]}>
                  <Ionicons name="location-outline" size={10} color="#2e7d32" />
                  <Text style={[styles.badgeText, { color: '#2e7d32' }]}>{data.room}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.entityIconBg}>
            <Ionicons name="book" size={32} color="#2e7d32" />
          </View>
        </View>

        {/* شرائح إحصائية */}
        <View style={styles.compactStatsRow}>
          <View style={[styles.compactStatChip, { backgroundColor: '#e3f2fd' }]}>
            <Ionicons name="people" size={14} color="#1565c0" />
            <Text style={[styles.compactStatValue, { color: '#1565c0' }]}>{data.students_count}</Text>
            <Text style={[styles.compactStatLabel, { color: '#1565c0' }]}>طالب</Text>
          </View>
          <View style={[styles.compactStatChip, { backgroundColor: '#e8f5e9' }]}>
            <Ionicons name="checkmark-circle" size={14} color="#2e7d32" />
            <Text style={[styles.compactStatValue, { color: '#2e7d32' }]}>{ls.completed}</Text>
            <Text style={[styles.compactStatLabel, { color: '#2e7d32' }]}>محاضرات مكتملة</Text>
          </View>
          <View style={[styles.compactStatChip, { backgroundColor: '#e7f0fe' }]}>
            <Ionicons name="time" size={14} color="#1565c0" />
            <Text style={[styles.compactStatValue, { color: '#1565c0' }]}>{ls.scheduled}</Text>
            <Text style={[styles.compactStatLabel, { color: '#1565c0' }]}>مجدولة</Text>
          </View>
          {ls.cancelled > 0 && (
            <View style={[styles.compactStatChip, { backgroundColor: '#ffebee' }]}>
              <Ionicons name="close-circle" size={14} color="#c62828" />
              <Text style={[styles.compactStatValue, { color: '#c62828' }]}>{ls.cancelled}</Text>
              <Text style={[styles.compactStatLabel, { color: '#c62828' }]}>ملغاة</Text>
            </View>
          )}
          {data.study_plan && (
            <View style={[styles.compactStatChip, { backgroundColor: '#f3e5f5' }]}>
              <Ionicons name="document-text" size={14} color="#6a1b9a" />
              <Text style={[styles.compactStatValue, { color: '#6a1b9a' }]}>{data.study_plan.completion_pct}%</Text>
              <Text style={[styles.compactStatLabel, { color: '#6a1b9a' }]}>الخطة الدراسية</Text>
            </View>
          )}
        </View>

        {/* قسم الطلاب */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <Text style={styles.sectionCardTitle}>طلاب المقرر</Text>
            <Text style={styles.sectionCardCount}>
              <Text style={styles.countAccent}>{data.students.length}</Text> طالب
            </Text>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color="#8a95a8" />
            <TextInput
              style={styles.searchInput}
              placeholder="بحث عن طالب بالاسم أو الرقم..."
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
            {filteredStudents.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#cfd6e1" />
                <Text style={styles.emptyText}>
                  {search ? 'لا توجد نتائج للبحث' : 'لا يوجد طلاب مسجلون في هذا المقرر'}
                </Text>
              </View>
            ) : (
              filteredStudents.map(s => {
                const r = s.attendance_pct;
                const c = r >= 75 ? '#2e7d32' : r >= 50 ? '#e65100' : '#c62828';
                const bg = r >= 75 ? '#e8f5e9' : r >= 50 ? '#fff3e0' : '#ffebee';
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.itemRow}
                    onPress={() => router.push(`/student-details?studentId=${s.id}` as any)}
                    testID={`student-row-${s.id}`}
                  >
                    <View style={[styles.itemIconBox, { backgroundColor: '#e7f0fe' }]}>
                      <Ionicons name="person" size={20} color="#2962ff" />
                    </View>
                    <View style={styles.itemInfo}>
                      <View style={styles.itemTitleRow}>
                        <Text style={styles.itemName} numberOfLines={1}>{s.full_name}</Text>
                        <Text style={styles.itemCode}>{s.student_id}</Text>
                      </View>
                      <View style={styles.metaRow}>
                        <View style={[styles.badge, { backgroundColor: '#e8f5e9' }]}>
                          <Text style={[styles.badgeText, { color: '#2e7d32' }]}>حاضر {s.present_count}</Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: '#ffebee' }]}>
                          <Text style={[styles.badgeText, { color: '#c62828' }]}>غائب {s.absent_count}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={[styles.ratePill, { backgroundColor: bg }]}>
                      <Text style={[styles.rateValue, { color: c }]}>{r}%</Text>
                      <Text style={[styles.rateLabel, { color: c }]}>حضور</Text>
                    </View>
                    <Ionicons name="chevron-back" size={18} color="#c0c8d4" />
                  </TouchableOpacity>
                );
              })
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
  codeBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#e8f5e9', marginBottom: 6 },
  codeBadgeText: { fontSize: 11, color: '#2e7d32', fontWeight: '700' },
  semBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#e7f0fe', borderWidth: 1, borderColor: '#bdd4fd', marginBottom: 6 },
  semBadgeText: { fontSize: 11, color: '#1565c0', fontWeight: '700' },
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
  entityAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2e7d32', alignItems: 'center', justifyContent: 'center' },
  entityIconBg: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#e8f5e9', alignItems: 'center', justifyContent: 'center' },
  entityName: { fontSize: 18, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  entitySubRow: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 5, flexWrap: 'wrap', gap: 6 },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#5b6678' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#cfd6e1', marginHorizontal: 4 },

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

  ratePill: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, minWidth: 60 },
  rateValue: { fontSize: 14, fontWeight: '800' },
  rateLabel: { fontSize: 9, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 13, color: '#8a95a8' },

  notFoundWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  notFoundText: { fontSize: 16, color: '#5b6678', marginTop: 12, textAlign: 'center' },
});
