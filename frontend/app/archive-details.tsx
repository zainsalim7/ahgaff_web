/**
 * تفاصيل فصل دراسي مؤرشف - عرض شامل مع 4 تبويبات
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import api from '../src/services/api';

type Tab = 'overview' | 'courses' | 'students' | 'teachers';

export default function ArchiveDetailsScreen() {
  const params = useLocalSearchParams<{ semesterId: string; tab?: string }>();
  const semesterId = params.semesterId as string;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((params.tab as Tab) || 'overview');
  const [summary, setSummary] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchAll = useCallback(async () => {
    if (!semesterId) return;
    try {
      const [s, c, st, t] = await Promise.all([
        api.get(`/archives/${semesterId}`),
        api.get(`/archives/${semesterId}/courses`),
        api.get(`/archives/${semesterId}/students`),
        api.get(`/archives/${semesterId}/teachers`),
      ]);
      setSummary(s.data);
      setCourses(c.data.courses || []);
      setStudents(st.data.students || []);
      setTeachers(t.data.teachers || []);
      setError(null);
    } catch (e: any) {
      const msg = e?.response?.status === 403
        ? 'ليست لديك صلاحية الوصول للأرشيف'
        : (e?.response?.data?.detail || 'فشل في تحميل بيانات الأرشيف');
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [semesterId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const onRefresh = () => { setRefreshing(true); fetchAll(); };

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return { courses, students, teachers };
    return {
      courses: courses.filter((c: any) =>
        (c.name || '').includes(q) || (c.code || '').includes(q) ||
        (c.teacher_name || '').includes(q)),
      students: students.filter((s: any) =>
        (s.full_name || '').includes(q) || (s.student_id || '').includes(q)),
      teachers: teachers.filter((t: any) =>
        (t.full_name || '').includes(q) || (t.teacher_id || '').includes(q)),
    };
  }, [search, courses, students, teachers]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color="#6a1b9a" /></View>
      </SafeAreaView>
    );
  }

  if (error || !summary) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color="#c62828" />
          <Text style={styles.errorText}>{error || 'لا توجد بيانات'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchAll}>
            <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const s = summary.summary || {};

  return (
    <>
      <Stack.Screen options={{ title: 'تفاصيل أرشيف فصل', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* بانر تحذير */}
        <View style={styles.warningBanner}>
          <Ionicons name="archive" size={16} color="#6a1b9a" />
          <Text style={styles.warningText}>
            📦 أنت تتصفح فصلاً مؤرشفاً — البيانات للقراءة فقط
          </Text>
        </View>

        {/* رأس */}
        <View style={styles.header}>
          <View style={styles.iconBox}><Ionicons name="archive" size={32} color="#fff" /></View>
          <Text style={styles.headerName} testID="archive-semester-name">{summary.semester_name}</Text>
          <Text style={styles.headerYear}>{summary.academic_year}</Text>
        </View>

        {/* تبويبات */}
        <View style={styles.tabsRow}>
          <TabBtn label="نظرة عامة" icon="stats-chart" active={tab === 'overview'} onPress={() => setTab('overview')} />
          <TabBtn label={`مقررات (${courses.length})`} icon="book" active={tab === 'courses'} onPress={() => setTab('courses')} />
          <TabBtn label={`طلاب (${students.length})`} icon="people" active={tab === 'students'} onPress={() => setTab('students')} />
          <TabBtn label={`معلمون (${teachers.length})`} icon="school" active={tab === 'teachers'} onPress={() => setTab('teachers')} />
        </View>

        {tab !== 'overview' && (
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#888" />
            <TextInput
              style={styles.searchInput}
              placeholder="بحث..."
              value={search}
              onChangeText={setSearch}
              testID="archive-search-input"
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color="#999" />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
        >
          {tab === 'overview' && (
            <>
              <View style={styles.statsGrid}>
                <BigStat icon="book" label="المقررات" value={s.total_courses} color="#2e7d32" />
                <BigStat icon="people" label="الطلاب" value={s.total_students} color="#1565c0" />
                <BigStat icon="school" label="المعلمون" value={s.total_teachers} color="#ef6c00" />
              </View>
              <View style={styles.statsGrid}>
                <BigStat icon="calendar" label="إجمالي المحاضرات" value={s.total_lectures} color="#6a1b9a" />
                <BigStat icon="checkmark-done" label="مكتملة" value={s.completed_lectures} color="#2e7d32" />
                <BigStat icon="bar-chart" label="نسبة الحضور" value={`${s.overall_attendance_rate || 0}%`} color="#c62828" />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📋 معلومات الأرشفة</Text>
                <InfoRow label="تاريخ الأرشفة" value={formatDate(summary.archived_at) || '-'} />
                <InfoRow label="بواسطة" value={summary.archived_by_name || '-'} />
                <InfoRow label="سجلات الحضور" value={String(s.total_attendance_records || 0)} />
                <InfoRow label="بداية الفصل" value={formatDate(summary.semester_start) || '-'} />
                <InfoRow label="نهاية الفصل" value={formatDate(summary.semester_end) || '-'} />
              </View>
            </>
          )}

          {tab === 'courses' && (
            filtered.courses.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد نتائج</Text>
            ) : (
              filtered.courses.map((c: any) => (
                <View key={c.id} style={styles.rowCard} testID={`archive-course-${c.id}`}>
                  <View style={[styles.rowIcon, { backgroundColor: '#2e7d3220' }]}>
                    <Ionicons name="book" size={18} color="#2e7d32" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{c.name}</Text>
                    <Text style={styles.rowMeta}>
                      {c.code} {c.section ? `• ${c.section}` : ''} {c.teacher_name ? `• ${c.teacher_name}` : ''}
                    </Text>
                    <View style={styles.rowStats}>
                      <Text style={styles.rowStat}>👥 {c.students_count}</Text>
                      <Text style={styles.rowStat}>📅 {c.lectures_completed}/{c.lectures_total}</Text>
                      <Text style={[styles.rowStat, { color: pctColor(c.completion_pct) }]}>
                        {c.completion_pct}%
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )
          )}

          {tab === 'students' && (
            filtered.students.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد نتائج</Text>
            ) : (
              filtered.students.map((st: any) => (
                <View key={st.id} style={styles.rowCard} testID={`archive-student-${st.id}`}>
                  <View style={[styles.rowIcon, { backgroundColor: '#1565c020' }]}>
                    <Ionicons name="person" size={18} color="#1565c0" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{st.full_name}</Text>
                    <Text style={styles.rowMeta}>{st.student_id || '-'} • مقررات: {st.courses_count}</Text>
                  </View>
                  <View style={[styles.pctBadge, { backgroundColor: pctColor(st.attendance_pct) + '20' }]}>
                    <Text style={[styles.pctText, { color: pctColor(st.attendance_pct) }]}>
                      {st.attendance_pct}%
                    </Text>
                  </View>
                </View>
              ))
            )
          )}

          {tab === 'teachers' && (
            filtered.teachers.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد نتائج</Text>
            ) : (
              filtered.teachers.map((t: any) => (
                <View key={t.id} style={styles.rowCard} testID={`archive-teacher-${t.id}`}>
                  <View style={[styles.rowIcon, { backgroundColor: '#ef6c0020' }]}>
                    <Ionicons name="school" size={18} color="#ef6c00" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{t.full_name}</Text>
                    <Text style={styles.rowMeta}>
                      {t.teacher_id || '-'} {t.academic_title ? `• ${t.academic_title}` : ''}
                    </Text>
                    <View style={styles.rowStats}>
                      <Text style={styles.rowStat}>📚 {t.courses_count} مقرر</Text>
                      <Text style={styles.rowStat}>👥 {t.students_total} طالب</Text>
                      <Text style={styles.rowStat}>⏱ {t.credit_hours} س.م</Text>
                    </View>
                  </View>
                  <Text style={[styles.pctText, { color: pctColor(t.completion_pct) }]}>
                    {t.completion_pct}%
                  </Text>
                </View>
              ))
            )
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function pctColor(p: number) {
  if (p >= 75) return '#2e7d32';
  if (p >= 50) return '#ef6c00';
  return '#c62828';
}

function formatDate(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ar-EG', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return iso?.slice(0, 10) || ''; }
}

const TabBtn = ({ label, icon, active, onPress }: any) => (
  <TouchableOpacity
    style={[styles.tabBtn, active && styles.tabBtnActive]}
    onPress={onPress}
    testID={`archive-tab-${icon}`}
  >
    <Ionicons name={icon} size={14} color={active ? '#fff' : '#555'} />
    <Text style={[styles.tabBtnText, active && { color: '#fff' }]} numberOfLines={1}>{label}</Text>
  </TouchableOpacity>
);

const BigStat = ({ icon, label, value, color }: any) => (
  <View style={[styles.bigStatBox, { borderColor: color + '40' }]}>
    <Ionicons name={icon} size={22} color={color} />
    <Text style={[styles.bigStatValue, { color }]}>{value}</Text>
    <Text style={styles.bigStatLabel}>{label}</Text>
  </View>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  errorText: { fontSize: 14, color: '#666', marginTop: 12, textAlign: 'center' },
  retryBtn: { marginTop: 16, backgroundColor: '#6a1b9a', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700' },
  warningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f3e5f5', paddingVertical: 8, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: '#e0c3e0',
  },
  warningText: { color: '#6a1b9a', fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' },
  header: {
    backgroundColor: '#6a1b9a', paddingTop: 20, paddingBottom: 22,
    paddingHorizontal: 18, alignItems: 'center',
  },
  iconBox: {
    width: 60, height: 60, borderRadius: 14, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerName: { fontSize: 17, fontWeight: '700', color: '#fff', textAlign: 'center' },
  headerYear: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  tabsRow: {
    flexDirection: 'row', padding: 8, gap: 4,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8,
    backgroundColor: '#f5f5f7',
  },
  tabBtnActive: { backgroundColor: '#6a1b9a' },
  tabBtnText: { fontSize: 11, fontWeight: '700', color: '#555' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff',
    margin: 10, marginBottom: 0, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: '#e8e8e8',
  },
  searchInput: { flex: 1, fontSize: 13, color: '#222', textAlign: 'right', outlineWidth: 0 as any },
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  bigStatBox: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1,
    paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center',
  },
  bigStatValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  bigStatLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  section: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 6, textAlign: 'right' },
  infoRow: {
    flexDirection: 'row', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 10,
  },
  infoLabel: { width: 120, fontSize: 12, color: '#888' },
  infoValue: { flex: 1, fontSize: 13, color: '#222', fontWeight: '600', textAlign: 'left' },
  rowCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    padding: 10, borderRadius: 10, marginBottom: 6, gap: 10,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 13, fontWeight: '700', color: '#222' },
  rowMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  rowStats: { flexDirection: 'row', gap: 12, marginTop: 4 },
  rowStat: { fontSize: 11, color: '#666' },
  emptyText: { textAlign: 'center', color: '#aaa', padding: 30, fontSize: 14 },
  pctBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, minWidth: 50, alignItems: 'center' },
  pctText: { fontSize: 12, fontWeight: '700' },
});
