/**
 * صفحة تفاصيل المعلم - ملف كامل مع المقررات والإحصائيات
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

interface Course {
  id: string;
  name: string;
  code: string;
  level?: number;
  section?: string;
  credit_hours: number;
  room?: string;
  students_count: number;
  lectures_total: number;
  lectures_completed: number;
  completion_pct: number;
}

interface TeacherProfile {
  id: string;
  teacher_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  specialization?: string;
  academic_title?: string;
  weekly_hours: number;
  departments: { id: string; name: string }[];
  courses: Course[];
  stats: {
    courses_count: number;
    total_students: number;
    total_credit_hours: number;
  };
}

export default function TeacherDetailsScreen() {
  const { teacherId } = useLocalSearchParams<{ teacherId: string }>();
  const router = useRouter();
  const [data, setData] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!teacherId) return;
    try {
      const res = await api.get(`/teachers/${teacherId}/full-profile`);
      setData(res.data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'فشل في تحميل بيانات المعلم');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teacherId]);

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
          <ActivityIndicator size="large" color="#6a1b9a" />
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
      <Stack.Screen options={{ title: 'تفاصيل المعلم', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 30 }}
        >
          {/* رأس الملف */}
          <View style={styles.header}>
            <View style={styles.avatarBox}>
              <Ionicons name="school" size={42} color="#fff" />
            </View>
            <Text style={styles.headerName} testID="teacher-name">{data.full_name}</Text>
            {data.academic_title && (
              <Text style={styles.headerTitle}>{data.academic_title}</Text>
            )}
            <Text style={styles.headerId}>رقم المعلم: {data.teacher_id || '-'}</Text>
          </View>

          {/* إحصائيات سريعة */}
          <View style={styles.statsRow}>
            <StatCard icon="book" label="المقررات" value={data.stats.courses_count} color="#2e7d32" />
            <StatCard icon="people" label="الطلاب" value={data.stats.total_students} color="#1565c0" />
            <StatCard icon="time" label="الساعات" value={data.stats.total_credit_hours} color="#ef6c00" />
          </View>

          {/* البيانات الشخصية */}
          <Section title="البيانات الأساسية" icon="information-circle">
            <InfoRow label="التخصص" value={data.specialization || '-'} />
            <InfoRow label="الساعات الأسبوعية" value={String(data.weekly_hours || '-')} />
            <InfoRow label="البريد الإلكتروني" value={data.email || '-'} />
            <InfoRow label="رقم الهاتف" value={data.phone || '-'} />
            <InfoRow
              label="الأقسام"
              value={
                data.departments.length > 0
                  ? data.departments.map((d) => d.name).join('، ')
                  : '-'
              }
            />
          </Section>

          {/* المقررات */}
          <Section title={`المقررات (${data.courses.length})`} icon="book">
            {data.courses.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد مقررات مسجلة</Text>
            ) : (
              data.courses.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.courseCard}
                  onPress={() =>
                    router.push(`/course-details?courseId=${c.id}` as any)
                  }
                  testID={`course-${c.id}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.courseName}>{c.name}</Text>
                    <Text style={styles.courseMeta}>
                      {c.code}
                      {c.level ? ` • م${c.level}` : ''}
                      {c.section ? ` • شعبة ${c.section}` : ''}
                      {c.room ? ` • قاعة ${c.room}` : ''}
                    </Text>
                    <View style={styles.courseStatsRow}>
                      <MiniStat label="طلاب" value={c.students_count} color="#1565c0" />
                      <MiniStat
                        label="محاضرات"
                        value={`${c.lectures_completed}/${c.lectures_total}`}
                        color="#2e7d32"
                      />
                      <View
                        style={[
                          styles.pctBadge,
                          { backgroundColor: pctColor(c.completion_pct) + '20' },
                        ]}
                      >
                        <Text style={[styles.pctText, { color: pctColor(c.completion_pct) }]}>
                          {c.completion_pct}%
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-back" size={18} color="#bbb" />
                </TouchableOpacity>
              ))
            )}
          </Section>
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
      <Ionicons name={icon} size={18} color="#6a1b9a" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
  </View>
);

const MiniStat = ({ label, value, color }: any) => (
  <View style={styles.miniStat}>
    <Text style={[styles.miniStatValue, { color }]}>{value}</Text>
    <Text style={styles.miniStatLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 14, color: '#666', marginTop: 12, textAlign: 'center' },
  retryBtn: {
    marginTop: 16,
    backgroundColor: '#6a1b9a',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: { color: '#fff', fontWeight: '700' },
  header: {
    backgroundColor: '#6a1b9a',
    paddingTop: 24,
    paddingBottom: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  avatarBox: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  headerName: { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center' },
  headerTitle: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  headerId: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 6 },
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
  sectionBody: { paddingHorizontal: 14, paddingVertical: 8 },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 10,
  },
  infoLabel: { width: 130, fontSize: 13, color: '#888' },
  infoValue: { flex: 1, fontSize: 13, color: '#222', textAlign: 'left', fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#aaa', padding: 18, fontSize: 13 },
  courseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 8,
  },
  courseName: { fontSize: 14, fontWeight: '700', color: '#222' },
  courseMeta: { fontSize: 11, color: '#888', marginTop: 3 },
  courseStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  miniStat: { alignItems: 'center' },
  miniStatValue: { fontSize: 13, fontWeight: '700' },
  miniStatLabel: { fontSize: 10, color: '#999', marginTop: 1 },
  pctBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: 'auto',
  },
  pctText: { fontSize: 12, fontWeight: '700' },
});
