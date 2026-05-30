/**
 * صفحة الأرشيف الدراسي - قائمة الفصول المؤرشفة
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import api from '../src/services/api';

interface ArchiveSummary {
  total_courses: number;
  total_students: number;
  total_teachers: number;
  total_lectures: number;
  completed_lectures: number;
  total_attendance_records: number;
  overall_attendance_rate: number;
}

interface ArchiveItem {
  archive_id: string;
  semester_id: string;
  semester_name: string;
  academic_year: string;
  semester_start?: string;
  semester_end?: string;
  archived_at?: string;
  archived_by_name?: string;
  summary: ArchiveSummary;
}

export default function ArchivesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/archives');
      setItems(res.data.items || []);
      setError(null);
    } catch (e: any) {
      const msg = e?.response?.status === 403
        ? 'ليست لديك صلاحية الوصول للأرشيف'
        : (e?.response?.data?.detail || 'فشل في تحميل الأرشيف');
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  return (
    <>
      <Stack.Screen options={{ title: 'الأرشيف الدراسي', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>📦 الأرشيف الدراسي</Text>
          <Text style={styles.headerSubtitle}>الفصول الدراسية المؤرشفة (للقراءة فقط)</Text>
        </View>

        <View style={styles.actionsBar}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/archive-search' as any)}
            testID="open-archive-search"
          >
            <Ionicons name="search" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>البحث في الأرشيف</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#6a1b9a" /></View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="lock-closed" size={48} color="#999" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchData}>
              <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="archive-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>لا توجد فصول مؤرشفة بعد</Text>
            <Text style={styles.emptySubtext}>
              عند أرشفة فصل دراسي، سيظهر هنا مع كل بياناته للرجوع إليها لاحقاً.
            </Text>
          </View>
        ) : (
          <ScrollView
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
          >
            {items.map((it) => (
              <TouchableOpacity
                key={it.archive_id}
                style={styles.card}
                onPress={() =>
                  router.push(`/archive-details?semesterId=${it.semester_id}` as any)
                }
                testID={`archive-${it.semester_id}`}
              >
                <View style={styles.cardHeader}>
                  <Ionicons name="archive" size={20} color="#6a1b9a" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{it.semester_name}</Text>
                    <Text style={styles.cardYear}>{it.academic_year}</Text>
                  </View>
                  <View style={styles.archivedBadge}>
                    <Text style={styles.archivedBadgeText}>مؤرشف</Text>
                  </View>
                </View>

                <View style={styles.statsGrid}>
                  <MiniStat icon="book" label="مقررات" value={it.summary.total_courses} color="#2e7d32" />
                  <MiniStat icon="people" label="طلاب" value={it.summary.total_students} color="#1565c0" />
                  <MiniStat icon="school" label="معلمون" value={it.summary.total_teachers} color="#ef6c00" />
                  <MiniStat
                    icon="checkmark-done"
                    label="حضور"
                    value={`${it.summary.overall_attendance_rate}%`}
                    color="#6a1b9a"
                  />
                </View>

                {it.archived_at ? (
                  <Text style={styles.cardFooter}>
                    أُرشف بواسطة: {it.archived_by_name || '-'} • {formatDate(it.archived_at)}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ar-EG', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return iso?.slice(0, 10) || '';
  }
}

const MiniStat = ({ icon, label, value, color }: any) => (
  <View style={[styles.miniStatBox, { borderColor: color + '30' }]}>
    <Ionicons name={icon} size={16} color={color} />
    <Text style={[styles.miniStatValue, { color }]}>{value}</Text>
    <Text style={styles.miniStatLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  errorText: { fontSize: 14, color: '#666', marginTop: 12, textAlign: 'center' },
  retryBtn: { marginTop: 16, backgroundColor: '#6a1b9a', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700' },
  emptyText: { fontSize: 16, color: '#666', marginTop: 12, fontWeight: '700' },
  emptySubtext: { fontSize: 13, color: '#999', marginTop: 6, textAlign: 'center', maxWidth: 300 },
  headerBar: { backgroundColor: '#6a1b9a', paddingTop: 18, paddingBottom: 18, paddingHorizontal: 18 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'right' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4, textAlign: 'right' },
  actionsBar: { padding: 12, paddingBottom: 0 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#1565c0', paddingVertical: 11, borderRadius: 10,
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' } as any) : { elevation: 1 }),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#222' },
  cardYear: { fontSize: 12, color: '#888', marginTop: 2 },
  archivedBadge: { backgroundColor: '#6a1b9a20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  archivedBadgeText: { color: '#6a1b9a', fontSize: 11, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', gap: 6, marginVertical: 6 },
  miniStatBox: {
    flex: 1, backgroundColor: '#fafafa', borderWidth: 1, borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center', gap: 2,
  },
  miniStatValue: { fontSize: 14, fontWeight: '800' },
  miniStatLabel: { fontSize: 10, color: '#666' },
  cardFooter: { fontSize: 11, color: '#999', marginTop: 8, textAlign: 'right' },
});
