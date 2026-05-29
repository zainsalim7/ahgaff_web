/**
 * صفحة تفاصيل القسم - بيانات + كلية + معلمين + مقررات + إحصائيات
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

interface TeacherItem {
  id: string;
  full_name: string;
  teacher_id: string;
  academic_title?: string;
}

interface CourseItem {
  id: string;
  name: string;
  code: string;
  level?: number;
  section?: string;
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

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#ef6c00" />
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
      <Stack.Screen options={{ title: 'تفاصيل القسم', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 30 }}
        >
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Ionicons name="grid" size={36} color="#fff" />
            </View>
            <Text style={styles.headerName} testID="department-name">{data.name}</Text>
            {data.code ? <Text style={styles.headerCode}>{data.code}</Text> : null}
          </View>

          <View style={styles.statsRow}>
            <StatCard icon="people" label="الطلاب" value={data.stats.students_count} color="#1565c0" />
            <StatCard icon="book" label="المقررات" value={data.stats.courses_count} color="#2e7d32" />
            <StatCard icon="school" label="المعلمون" value={data.stats.teachers_count} color="#6a1b9a" />
          </View>

          <Section title="البيانات الأساسية" icon="information-circle">
            <InfoRow
              label="الكلية"
              value={data.faculty_name || '-'}
              onPress={
                data.faculty_id
                  ? () => router.push(`/faculty-details?facultyId=${data.faculty_id}` as any)
                  : undefined
              }
            />
            <InfoRow label="رئيس القسم" value={data.head_name || '-'} />
          </Section>

          <Section title={`المعلمون (${data.teachers.length})`} icon="school">
            {data.teachers.length === 0 ? (
              <Text style={styles.emptyText}>لا يوجد معلمون</Text>
            ) : (
              data.teachers.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.row}
                  onPress={() => router.push(`/teacher-details?teacherId=${t.id}` as any)}
                  testID={`teacher-${t.id}`}
                >
                  <View style={[styles.avatar, { backgroundColor: '#6a1b9a20' }]}>
                    <Ionicons name="person" size={16} color="#6a1b9a" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{t.full_name}</Text>
                    <Text style={styles.rowMeta}>
                      {t.teacher_id || '-'}
                      {t.academic_title ? ` • ${t.academic_title}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-back" size={16} color="#bbb" />
                </TouchableOpacity>
              ))
            )}
          </Section>

          <Section title={`المقررات (${data.courses.length})`} icon="book">
            {data.courses.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد مقررات</Text>
            ) : (
              data.courses.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.row}
                  onPress={() => router.push(`/course-details?courseId=${c.id}` as any)}
                  testID={`course-${c.id}`}
                >
                  <View style={[styles.avatar, { backgroundColor: '#2e7d3220' }]}>
                    <Ionicons name="book" size={16} color="#2e7d32" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{c.name}</Text>
                    <Text style={styles.rowMeta}>
                      {c.code}
                      {c.level ? ` • م${c.level}` : ''}
                      {c.section ? ` • ${c.section}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-back" size={16} color="#bbb" />
                </TouchableOpacity>
              ))
            )}
          </Section>
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
      <Ionicons name={icon} size={18} color="#ef6c00" />
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
    >
      {value}
    </Text>
    {onPress && <Ionicons name="chevron-back" size={14} color="#999" />}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 14, color: '#666', marginTop: 12, textAlign: 'center' },
  retryBtn: {
    marginTop: 16,
    backgroundColor: '#ef6c00',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: { color: '#fff', fontWeight: '700' },
  header: {
    backgroundColor: '#ef6c00',
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
  sectionBody: { paddingHorizontal: 14, paddingVertical: 4 },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 10,
  },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 13, fontWeight: '700', color: '#222' },
  rowMeta: { fontSize: 11, color: '#888', marginTop: 2 },
});
