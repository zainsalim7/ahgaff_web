/**
 * صفحة تفاصيل القسم - تصميم حديث (متّسق مع /student-details و /teacher-courses)
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

interface TeacherItem {
  id: string;
  full_name: string;
  teacher_id: string;
  academic_title?: string;
  specialization?: string;
}
interface CourseItem {
  id: string;
  name: string;
  code: string;
  level?: number;
  section?: string;
  credit_hours?: number;
  teacher_name?: string;
}
interface DeptSummary {
  id: string;
  name: string;
  code: string;
  faculty_id?: string;
  faculty_name?: string;
  head_id?: string;
  head_name?: string;
  stats: {
    students_count: number;
    courses_count: number;
    teachers_count: number;
  };
  teachers: TeacherItem[];
  courses: CourseItem[];
}

export default function DepartmentDetailsScreen() {
  const { departmentId } = useLocalSearchParams<{ departmentId: string }>();
  const router = useRouter();
  const [data, setData] = useState<DeptSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'teachers' | 'courses'>('teachers');

  const fetchData = useCallback(async () => {
    if (!departmentId) return;
    try {
      const res = await api.get(`/departments/${departmentId}/summary`);
      setData(res.data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'فشل في تحميل بيانات القسم');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [departmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !data) return data?.teachers || [];
    return data.teachers.filter(t =>
      t.full_name.toLowerCase().includes(q) ||
      (t.teacher_id || '').toLowerCase().includes(q) ||
      (t.specialization || '').toLowerCase().includes(q),
    );
  }, [data, search]);

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !data) return data?.courses || [];
    return data.courses.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.code || '').toLowerCase().includes(q),
    );
  }, [data, search]);

  if (loading) return <LoadingScreen />;

  if (error || !data) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.notFoundWrap}>
          <Ionicons name="alert-circle-outline" size={64} color="#cfd6e1" />
          <Text style={styles.notFoundText}>{error || 'القسم غير موجود'}</Text>
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

  const teachersList = filteredTeachers;
  const coursesList = filteredCourses;

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
              <Text dataSet={{ responsive: 'page-title' }} style={styles.pageTitle}>تفاصيل القسم</Text>
              {!!data.code && (
                <View style={styles.codeBadge}>
                  <Ionicons name="barcode" size={11} color="#ef6c00" />
                  <Text style={styles.codeBadgeText}>{data.code}</Text>
                </View>
              )}
            </View>
            <View style={styles.breadcrumb}>
              <TouchableOpacity onPress={() => router.replace('/')}>
                <Text style={styles.breadcrumbLink}>الرئيسية</Text>
              </TouchableOpacity>
              <Ionicons name="chevron-back" size={12} color="#8a95a8" />
              <TouchableOpacity onPress={() => router.replace('/departments' as any)}>
                <Text style={styles.breadcrumbLink}>الأقسام</Text>
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

        {/* بطاقة القسم */}
        <View style={styles.deptCard}>
          <View style={styles.deptAvatar}>
            <Ionicons name="grid" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.deptName}>{data.name}</Text>
            <View style={styles.deptSubRow}>
              {data.faculty_name ? (
                <TouchableOpacity
                  style={styles.metaItem}
                  onPress={() => data.faculty_id && router.push(`/faculty-details?facultyId=${data.faculty_id}` as any)}
                >
                  <Ionicons name="business-outline" size={13} color="#5b6678" />
                  <Text style={[styles.metaText, { color: '#2962ff', fontWeight: '600' }]}>
                    {data.faculty_name}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {data.head_name ? (
                <>
                  {data.faculty_name ? <View style={styles.dot} /> : null}
                  <View style={styles.metaItem}>
                    <Ionicons name="person-circle-outline" size={13} color="#5b6678" />
                    <Text style={styles.metaText}>رئيس القسم: {data.head_name}</Text>
                  </View>
                </>
              ) : null}
            </View>
          </View>
          <View style={styles.deptIconBg}>
            <Ionicons name="grid" size={32} color="#ef6c00" />
          </View>
        </View>

        {/* بطاقات الإحصائيات المدمجة */}
        <View style={styles.compactStatsRow}>
          <View style={[styles.compactStatChip, { backgroundColor: '#e3f2fd' }]}>
            <Ionicons name="people" size={14} color="#1565c0" />
            <Text style={[styles.compactStatValue, { color: '#1565c0' }]}>{data.stats.students_count}</Text>
            <Text style={[styles.compactStatLabel, { color: '#1565c0' }]}>طالب</Text>
          </View>
          <View style={[styles.compactStatChip, { backgroundColor: '#e8f5e9' }]}>
            <Ionicons name="book" size={14} color="#2e7d32" />
            <Text style={[styles.compactStatValue, { color: '#2e7d32' }]}>{data.stats.courses_count}</Text>
            <Text style={[styles.compactStatLabel, { color: '#2e7d32' }]}>مقرر</Text>
          </View>
          <View style={[styles.compactStatChip, { backgroundColor: '#f3e5f5' }]}>
            <Ionicons name="school" size={14} color="#6a1b9a" />
            <Text style={[styles.compactStatValue, { color: '#6a1b9a' }]}>{data.stats.teachers_count}</Text>
            <Text style={[styles.compactStatLabel, { color: '#6a1b9a' }]}>معلم</Text>
          </View>
        </View>

        {/* تبويبات + بحث */}
        <View style={styles.sectionCard}>
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tab, tab === 'teachers' && styles.tabActive]}
              onPress={() => setTab('teachers')}
              testID="tab-teachers"
            >
              <Ionicons name="school" size={14} color={tab === 'teachers' ? '#fff' : '#5b6678'} />
              <Text style={[styles.tabText, tab === 'teachers' && { color: '#fff' }]}>
                المعلمون ({data.teachers.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'courses' && styles.tabActive]}
              onPress={() => setTab('courses')}
              testID="tab-courses"
            >
              <Ionicons name="book" size={14} color={tab === 'courses' ? '#fff' : '#5b6678'} />
              <Text style={[styles.tabText, tab === 'courses' && { color: '#fff' }]}>
                المقررات ({data.courses.length})
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color="#8a95a8" />
            <TextInput
              style={styles.searchInput}
              placeholder={tab === 'teachers' ? 'بحث عن معلم...' : 'بحث عن مقرر...'}
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

          {/* قائمة المعلمين */}
          {tab === 'teachers' && (
            <View style={styles.listWrap}>
              {teachersList.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="school-outline" size={48} color="#cfd6e1" />
                  <Text style={styles.emptyText}>
                    {search ? 'لا توجد نتائج للبحث' : 'لا يوجد معلمون في هذا القسم'}
                  </Text>
                </View>
              ) : (
                teachersList.map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.itemRow}
                    onPress={() => router.push({
                      pathname: '/teacher-courses',
                      params: { teacherId: t.id, teacherName: t.full_name },
                    } as any)}
                    testID={`teacher-row-${t.id}`}
                  >
                    <View style={[styles.itemIconBox, { backgroundColor: '#f3e5f5' }]}>
                      <Ionicons name="person" size={20} color="#6a1b9a" />
                    </View>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName} numberOfLines={1}>{t.full_name}</Text>
                      <View style={styles.metaRow}>
                        {t.teacher_id ? (
                          <View style={styles.metaItem}>
                            <Ionicons name="id-card-outline" size={12} color="#5b6678" />
                            <Text style={styles.metaText}>{t.teacher_id}</Text>
                          </View>
                        ) : null}
                        {t.academic_title ? (
                          <View style={[styles.badge, { backgroundColor: '#e3f2fd' }]}>
                            <Text style={[styles.badgeText, { color: '#1565c0' }]}>{t.academic_title}</Text>
                          </View>
                        ) : null}
                        {t.specialization ? (
                          <View style={[styles.badge, { backgroundColor: '#fff3e0' }]}>
                            <Text style={[styles.badgeText, { color: '#e65100' }]}>{t.specialization}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Ionicons name="chevron-back" size={18} color="#c0c8d4" />
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* قائمة المقررات */}
          {tab === 'courses' && (
            <View style={styles.listWrap}>
              {coursesList.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="book-outline" size={48} color="#cfd6e1" />
                  <Text style={styles.emptyText}>
                    {search ? 'لا توجد نتائج للبحث' : 'لا توجد مقررات في هذا القسم'}
                  </Text>
                </View>
              ) : (
                coursesList.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.itemRow}
                    onPress={() => router.push({
                      pathname: '/course-lectures',
                      params: { courseId: c.id, courseName: c.name },
                    } as any)}
                    testID={`course-row-${c.id}`}
                  >
                    <View style={[styles.itemIconBox, { backgroundColor: '#e7f0fe' }]}>
                      <Ionicons name="book" size={20} color="#2962ff" />
                    </View>
                    <View style={styles.itemInfo}>
                      <View style={styles.courseTitleRow}>
                        <Text style={styles.itemName} numberOfLines={1}>{c.name}</Text>
                        <Text style={styles.itemCode}>{c.code || '—'}</Text>
                      </View>
                      <View style={styles.metaRow}>
                        {c.teacher_name ? (
                          <View style={styles.metaItem}>
                            <Ionicons name="person-outline" size={12} color="#5b6678" />
                            <Text style={styles.metaText}>{c.teacher_name}</Text>
                          </View>
                        ) : null}
                        {c.level ? (
                          <View style={[styles.badge, { backgroundColor: '#e7f0fe' }]}>
                            <Text style={[styles.badgeText, { color: '#1565c0' }]}>م{c.level}</Text>
                          </View>
                        ) : null}
                        {c.section ? (
                          <View style={[styles.badge, { backgroundColor: '#f3e5f5' }]}>
                            <Text style={[styles.badgeText, { color: '#6a1b9a' }]}>شعبة {c.section}</Text>
                          </View>
                        ) : null}
                        {c.credit_hours ? (
                          <View style={[styles.badge, { backgroundColor: '#fff3e0' }]}>
                            <Ionicons name="time-outline" size={10} color="#e65100" />
                            <Text style={[styles.badgeText, { color: '#e65100' }]}>{c.credit_hours} س</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Ionicons name="chevron-back" size={18} color="#c0c8d4" />
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6fb' },
  pageScroll: { padding: 16, paddingBottom: 40, maxWidth: 1440, width: '100%', alignSelf: 'center' },

  pageHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 14, flexWrap: 'wrap', gap: 12,
  },
  pageHeaderRight: { alignItems: 'flex-end' },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#1a2540', textAlign: 'right', marginBottom: 6 },
  codeBadge: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: '#fff3e0', marginBottom: 6,
  },
  codeBadgeText: { fontSize: 11, color: '#ef6c00', fontWeight: '700' },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breadcrumbLink: { fontSize: 13, color: '#2962ff', fontWeight: '500' },
  breadcrumbCurrent: { fontSize: 13, color: '#8a95a8', fontWeight: '500' },
  pageHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  btnPrimary: { backgroundColor: '#2962ff' },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee' },
  btnGhostText: { color: '#1a2540', fontSize: 13, fontWeight: '600' },

  deptCard: {
    flexDirection: 'row-reverse', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 12, gap: 12, borderWidth: 1, borderColor: '#eef1f6',
  },
  deptAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#ef6c00',
    alignItems: 'center', justifyContent: 'center',
  },
  deptIconBg: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff3e0',
    alignItems: 'center', justifyContent: 'center',
  },
  deptName: { fontSize: 18, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  deptSubRow: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 5, flexWrap: 'wrap', gap: 6 },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#5b6678' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#cfd6e1', marginHorizontal: 4 },

  compactStatsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  compactStatChip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  compactStatValue: { fontSize: 16, fontWeight: '700' },
  compactStatLabel: { fontSize: 12, fontWeight: '600' },

  sectionCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eef1f6', marginBottom: 18 },
  tabsRow: {
    flexDirection: 'row-reverse', padding: 6, gap: 4,
    borderBottomWidth: 1, borderBottomColor: '#eef1f6',
  },
  tab: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  tabActive: { backgroundColor: '#2962ff' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#5b6678' },

  searchWrap: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
    backgroundColor: '#fafbfd', borderWidth: 1, borderColor: '#e3e7ee',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
    margin: 14, marginBottom: 8,
  },
  searchInput: {
    flex: 1, fontSize: 13, color: '#1a2540', textAlign: 'right',
    outlineStyle: 'none' as any,
  },

  listWrap: { padding: 14, paddingTop: 6, gap: 10 },
  itemRow: {
    flexDirection: 'row-reverse', alignItems: 'center',
    backgroundColor: '#fafbfd', borderRadius: 12, padding: 12, gap: 12,
    borderWidth: 1, borderColor: '#eef1f6',
  },
  itemIconBox: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  itemInfo: { flex: 1, alignItems: 'flex-end', gap: 6 },
  itemName: { fontSize: 14, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  itemCode: { fontSize: 11, color: '#8a95a8', fontWeight: '500' },
  courseTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  metaRow: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 13, color: '#8a95a8' },

  notFoundWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  notFoundText: { fontSize: 16, color: '#5b6678', marginTop: 12, textAlign: 'center' },
});
