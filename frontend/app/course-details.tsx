/**
 * صفحة تفاصيل المقرر - بيانات + معلم + طلاب + محاضرات + خطة دراسية
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import api from '../src/services/api';

interface StudentItem {
  id: string;
  student_id?: string;
  full_name?: string;
  attendance_pct: number;
  present_count: number;
  absent_count: number;
}

interface CourseDetails {
  id: string;
  name: string;
  code: string;
  level?: number;
  section?: string;
  credit_hours: number;
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
  lecture_stats: {
    total: number;
    completed: number;
    scheduled: number;
    cancelled: number;
    absent: number;
  };
  study_plan?: {
    total_topics: number;
    confirmed_topics: number;
    completion_pct: number;
  } | null;
}

export default function CourseDetailsScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const router = useRouter();
  const [data, setData] = useState<CourseDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'students' | 'lectures'>('overview');
  const [studentSearch, setStudentSearch] = useState('');

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    if (!studentSearch.trim()) return data.students;
    const q = studentSearch.trim();
    return data.students.filter(
      (s) => (s.full_name || '').includes(q) || (s.student_id || '').includes(q),
    );
  }, [data, studentSearch]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2e7d32" />
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

  const lecPct = data.lecture_stats.total
    ? Math.round((data.lecture_stats.completed / data.lecture_stats.total) * 100)
    : 0;

  return (
    <>
      <Stack.Screen options={{ title: 'تفاصيل المقرر', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 30 }}
        >
          {/* رأس المقرر */}
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Ionicons name="book" size={36} color="#fff" />
            </View>
            <Text style={styles.headerName} testID="course-name">{data.name}</Text>
            <Text style={styles.headerCode}>{data.code}</Text>
            <View style={styles.headerMetaRow}>
              {data.level ? <HeaderChip text={`المستوى ${data.level}`} /> : null}
              {data.section ? <HeaderChip text={`شعبة ${data.section}`} /> : null}
              {data.credit_hours ? <HeaderChip text={`${data.credit_hours} س.م`} /> : null}
              {data.room ? <HeaderChip text={`قاعة ${data.room}`} /> : null}
            </View>
          </View>

          {/* إحصائيات */}
          <View style={styles.statsRow}>
            <StatCard icon="people" label="الطلاب" value={data.students_count} color="#1565c0" />
            <StatCard icon="calendar" label="المحاضرات" value={data.lecture_stats.total} color="#2e7d32" />
            <StatCard
              icon="checkmark-done"
              label="مكتملة"
              value={`${lecPct}%`}
              color={pctColor(lecPct)}
            />
          </View>

          {/* تبويبات */}
          <View style={styles.tabsRow}>
            <TabBtn label="نظرة عامة" icon="grid" active={tab === 'overview'} onPress={() => setTab('overview')} />
            <TabBtn
              label={`الطلاب (${data.students_count})`}
              icon="people"
              active={tab === 'students'}
              onPress={() => setTab('students')}
            />
            <TabBtn
              label="المحاضرات"
              icon="calendar"
              active={tab === 'lectures'}
              onPress={() => setTab('lectures')}
            />
          </View>

          {tab === 'overview' && (
            <>
              <Section title="بيانات المقرر" icon="information-circle">
                <InfoRow
                  label="المعلم"
                  value={data.teacher_name || '-'}
                  onPress={
                    data.teacher_id
                      ? () => router.push(`/teacher-details?teacherId=${data.teacher_id}` as any)
                      : undefined
                  }
                />
                <InfoRow
                  label="القسم"
                  value={data.department_name || '-'}
                  onPress={
                    data.department_id
                      ? () => router.push(`/department-details?departmentId=${data.department_id}` as any)
                      : undefined
                  }
                />
                <InfoRow label="الفصل الدراسي" value={data.semester_name || '-'} />
                <InfoRow label="السنة الأكاديمية" value={data.academic_year || '-'} />
                <InfoRow label="ساعات معتمدة" value={String(data.credit_hours || '-')} />
              </Section>

              {data.study_plan && (
                <Section title="الخطة الدراسية" icon="document-text">
                  <View style={styles.planRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planLabel}>إنجاز الخطة</Text>
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${data.study_plan.completion_pct}%`,
                              backgroundColor: pctColor(data.study_plan.completion_pct),
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.planMeta}>
                        {data.study_plan.confirmed_topics} من {data.study_plan.total_topics} موضوع
                      </Text>
                    </View>
                    <Text style={[styles.planPct, { color: pctColor(data.study_plan.completion_pct) }]}>
                      {data.study_plan.completion_pct}%
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.linkBtn}
                    onPress={() => router.push(`/manage-study-plan?courseId=${data.id}` as any)}
                  >
                    <Text style={styles.linkBtnText}>إدارة الخطة الدراسية</Text>
                    <Ionicons name="arrow-back" size={14} color="#2e7d32" />
                  </TouchableOpacity>
                </Section>
              )}

              <View style={styles.actionsBlock}>
                <ActionLink
                  icon="people-outline"
                  label="إدارة الطلاب"
                  onPress={() => router.push(`/course-students?courseId=${data.id}` as any)}
                />
                <ActionLink
                  icon="calendar-outline"
                  label="إدارة المحاضرات"
                  onPress={() => router.push(`/course-lectures?courseId=${data.id}` as any)}
                />
                <ActionLink
                  icon="stats-chart-outline"
                  label="إحصائيات المقرر"
                  onPress={() => router.push(`/course-stats?courseId=${data.id}` as any)}
                />
              </View>
            </>
          )}

          {tab === 'students' && (
            <View style={styles.section}>
              <View style={[styles.sectionHeader, { paddingVertical: 8 }]}>
                <Ionicons name="search" size={16} color="#888" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="بحث بالاسم أو الرقم..."
                  value={studentSearch}
                  onChangeText={setStudentSearch}
                  testID="student-search-input"
                />
                {studentSearch ? (
                  <TouchableOpacity onPress={() => setStudentSearch('')}>
                    <Ionicons name="close-circle" size={16} color="#999" />
                  </TouchableOpacity>
                ) : null}
              </View>
              {filteredStudents.length === 0 ? (
                <Text style={styles.emptyText}>لا يوجد طلاب مطابقين</Text>
              ) : (
                filteredStudents.map((s) => (
                  <View key={s.id} style={styles.studentRow} testID={`student-${s.id}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.studentName}>{s.full_name}</Text>
                      <Text style={styles.studentMeta}>{s.student_id || '-'}</Text>
                    </View>
                    <View style={styles.studentStats}>
                      <Text style={[styles.attBadge, { color: '#2e7d32' }]}>{s.present_count} ح</Text>
                      <Text style={[styles.attBadge, { color: '#c62828' }]}>{s.absent_count} غ</Text>
                      <View
                        style={[
                          styles.pctBadge,
                          { backgroundColor: pctColor(s.attendance_pct) + '20' },
                        ]}
                      >
                        <Text style={[styles.pctText, { color: pctColor(s.attendance_pct) }]}>
                          {s.attendance_pct}%
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {tab === 'lectures' && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="calendar" size={18} color="#2e7d32" />
                <Text style={styles.sectionTitle}>تفاصيل المحاضرات</Text>
              </View>
              <View style={styles.sectionBody}>
                <LecRow label="إجمالي" count={data.lecture_stats.total} color="#1565c0" />
                <LecRow label="مكتملة" count={data.lecture_stats.completed} color="#2e7d32" />
                <LecRow label="مجدولة" count={data.lecture_stats.scheduled} color="#ef6c00" />
                <LecRow label="ملغاة" count={data.lecture_stats.cancelled} color="#c62828" />
                <LecRow label="غياب معلم" count={data.lecture_stats.absent} color="#999" />
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => router.push(`/course-lectures?courseId=${data.id}` as any)}
                  testID="open-lectures-btn"
                >
                  <Text style={styles.linkBtnText}>فتح صفحة المحاضرات الكاملة</Text>
                  <Ionicons name="arrow-back" size={14} color="#2e7d32" />
                </TouchableOpacity>
              </View>
            </View>
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

const HeaderChip = ({ text }: { text: string }) => (
  <View style={styles.headerChip}>
    <Text style={styles.headerChipText}>{text}</Text>
  </View>
);

const StatCard = ({ icon, label, value, color }: any) => (
  <View style={[styles.statCard, { borderColor: color + '30' }]}>
    <Ionicons name={icon} size={22} color={color} />
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const TabBtn = ({ label, icon, active, onPress }: any) => (
  <TouchableOpacity
    style={[styles.tabBtn, active && styles.tabBtnActive]}
    onPress={onPress}
    testID={`tab-${label}`}
  >
    <Ionicons name={icon} size={15} color={active ? '#fff' : '#555'} />
    <Text style={[styles.tabBtnText, active && { color: '#fff' }]}>{label}</Text>
  </TouchableOpacity>
);

const Section = ({ title, icon, children }: any) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={18} color="#2e7d32" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const InfoRow = ({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) => (
  <TouchableOpacity
    disabled={!onPress}
    onPress={onPress}
    style={styles.infoRow}
    activeOpacity={onPress ? 0.6 : 1}
  >
    <Text style={styles.infoLabel}>{label}</Text>
    <Text
      style={[styles.infoValue, onPress && { color: '#1565c0', textDecorationLine: 'underline' }]}
      numberOfLines={2}
    >
      {value}
    </Text>
    {onPress && <Ionicons name="chevron-back" size={14} color="#999" />}
  </TouchableOpacity>
);

const LecRow = ({ label, count, color }: any) => (
  <View style={styles.lecRow}>
    <View style={[styles.lecDot, { backgroundColor: color }]} />
    <Text style={styles.lecLabel}>{label}</Text>
    <Text style={[styles.lecCount, { color }]}>{count}</Text>
  </View>
);

const ActionLink = ({ icon, label, onPress }: any) => (
  <TouchableOpacity style={styles.actionLink} onPress={onPress} testID={`action-${label}`}>
    <Ionicons name={icon} size={18} color="#2e7d32" />
    <Text style={styles.actionLinkText}>{label}</Text>
    <Ionicons name="chevron-back" size={16} color="#bbb" />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 14, color: '#666', marginTop: 12, textAlign: 'center' },
  retryBtn: {
    marginTop: 16,
    backgroundColor: '#2e7d32',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: { color: '#fff', fontWeight: '700' },
  header: {
    backgroundColor: '#2e7d32',
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
  headerName: { fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center' },
  headerCode: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  headerMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  headerChip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  headerChipText: { color: '#fff', fontSize: 11, fontWeight: '600' },
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
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 6,
    marginBottom: 8,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tabBtnActive: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: '#555' },
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
  sectionBody: { paddingHorizontal: 14, paddingVertical: 8 },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 10,
    alignItems: 'center',
  },
  infoLabel: { width: 130, fontSize: 13, color: '#888' },
  infoValue: { flex: 1, fontSize: 13, color: '#222', textAlign: 'left', fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#aaa', padding: 18, fontSize: 13 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  planLabel: { fontSize: 12, color: '#666', marginBottom: 6 },
  planMeta: { fontSize: 11, color: '#999', marginTop: 4 },
  planPct: { fontSize: 22, fontWeight: '800' },
  progressBar: {
    height: 8,
    backgroundColor: '#eee',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: { height: '100%' },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 10,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
  },
  linkBtnText: { fontSize: 12, fontWeight: '700', color: '#2e7d32' },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 8,
  },
  studentName: { fontSize: 13, fontWeight: '700', color: '#222' },
  studentMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  studentStats: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attBadge: { fontSize: 11, fontWeight: '700' },
  pctBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    minWidth: 50,
    alignItems: 'center',
  },
  pctText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  lecRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 10,
  },
  lecDot: { width: 8, height: 8, borderRadius: 4 },
  lecLabel: { flex: 1, fontSize: 13, color: '#444' },
  lecCount: { fontSize: 15, fontWeight: '800' },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#222',
    paddingVertical: 4,
    textAlign: 'right',
    outlineWidth: 0 as any,
  },
  actionsBlock: { marginHorizontal: 12, marginTop: 10 },
  actionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 6,
    gap: 10,
  },
  actionLinkText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#333' },
});
