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
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 30 }}
        >
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Ionicons name="business" size={36} color="#fff" />
            </View>
            <Text style={styles.headerName} testID="faculty-name">{data.name}</Text>
            {data.code ? <Text style={styles.headerCode}>{data.code}</Text> : null}
          </View>

          <View style={styles.statsRow}>
            <StatCard icon="grid" label="الأقسام" value={data.stats.departments_count} color="#ef6c00" />
            <StatCard icon="people" label="الطلاب" value={data.stats.students_count} color="#1565c0" />
            <StatCard icon="book" label="المقررات" value={data.stats.courses_count} color="#2e7d32" />
          </View>

          <Section title="البيانات الأساسية" icon="information-circle">
            <InfoRow label="العميد" value={data.dean_name || '-'} />
            <InfoRow label="رمز الكلية" value={data.code || '-'} />
          </Section>

          <Section title={`الأقسام (${data.departments.length})`} icon="grid">
            {data.departments.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد أقسام</Text>
            ) : (
              data.departments.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={styles.deptCard}
                  onPress={() => router.push(`/department-details?departmentId=${d.id}` as any)}
                  testID={`dept-${d.id}`}
                >
                  <View style={[styles.deptIcon, { backgroundColor: '#ef6c0020' }]}>
                    <Ionicons name="grid" size={18} color="#ef6c00" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deptName}>{d.name}</Text>
                    <Text style={styles.deptMeta}>{d.code || '-'}</Text>
                    <View style={styles.deptStatsRow}>
                      <View style={styles.deptStatBox}>
                        <Ionicons name="people" size={12} color="#1565c0" />
                        <Text style={styles.deptStatText}>{d.students_count} طالب</Text>
                      </View>
                      <View style={styles.deptStatBox}>
                        <Ionicons name="book" size={12} color="#2e7d32" />
                        <Text style={styles.deptStatText}>{d.courses_count} مقرر</Text>
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
  container: { flex: 1, backgroundColor: '#f5f5f7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 14, color: '#666', marginTop: 12, textAlign: 'center' },
  retryBtn: {
    marginTop: 16,
    backgroundColor: '#c62828',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: { color: '#fff', fontWeight: '700' },
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
