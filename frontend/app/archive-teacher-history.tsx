/**
 * السجل التدريسي الكامل للمعلم عبر كل الفصول المؤرشفة
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import api from '../src/services/api';
import { ReportActionsBar } from '../src/components/ReportActionsBar';

export default function ArchiveTeacherHistoryScreen() {
  const { teacherId } = useLocalSearchParams<{ teacherId: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!teacherId) return;
    try {
      const res = await api.get(`/archives/teachers/${teacherId}/history`);
      setData(res.data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'فشل تحميل السجل');
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <>
      <Stack.Screen options={{ title: 'السجل التدريسي', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color="#ef6c00" /></View>
      </SafeAreaView>
    </>
  );

  if (error) return (
    <>
      <Stack.Screen options={{ title: 'السجل التدريسي', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color="#c62828" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    </>
  );

  const history = data?.history || [];
  const firstSnapshot = history[0]?.teacher_snapshot;
  const gt = data?.grand_total || {};

  return (
    <>
      <Stack.Screen options={{ title: 'السجل التدريسي', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ReportActionsBar
          pdfPath={`/archives/teachers/${teacherId}/history/pdf`}
          pdfFileName={`teacher-history-${teacherId}.pdf`}
        />
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 30 }}>
          <View style={styles.header}>
            <View style={styles.avatar}><Ionicons name="school" size={32} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{firstSnapshot?.full_name || '-'}</Text>
              <Text style={styles.meta}>
                {firstSnapshot?.teacher_id || '-'} {firstSnapshot?.academic_title ? `• ${firstSnapshot.academic_title}` : ''}
              </Text>
            </View>
            <View style={styles.semBadge}>
              <Text style={styles.semBadgeText}>{data?.total_semesters || 0}</Text>
              <Text style={styles.semBadgeLabel}>فصل</Text>
            </View>
          </View>

          {/* الإجمالي العام */}
          {history.length > 0 && (
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>📊 الإجمالي عبر كل الفصول</Text>
              <View style={styles.totalRow}>
                <Stat label="مقررات" value={gt.courses} color="#2e7d32" />
                <Stat label="طلاب" value={gt.students} color="#1565c0" />
                <Stat label="ساعات" value={gt.credit_hours} color="#ef6c00" />
                <Stat label="محاضرات" value={gt.lectures} color="#6a1b9a" />
                <Stat label="مكتملة" value={gt.completed} color="#2e7d32" />
                <Stat
                  label="إنجاز"
                  value={`${gt.completion_pct || 0}%`}
                  color={pctColor(gt.completion_pct)}
                />
              </View>
            </View>
          )}

          <Text style={styles.sectionTitle}>📜 الفصول الدراسية المؤرشفة</Text>

          {history.length === 0 ? (
            <View style={styles.placeholder}>
              <Ionicons name="archive-outline" size={56} color="#ddd" />
              <Text style={styles.emptyText}>لا توجد فصول مؤرشفة لهذا المعلم</Text>
            </View>
          ) : (
            history.map((h: any) => (
              <TouchableOpacity
                key={h.semester_id}
                style={styles.semCard}
                onPress={() => router.push(`/archive-teacher-report?semesterId=${h.semester_id}&teacherId=${teacherId}` as any)}
                testID={`sem-${h.semester_id}`}
              >
                <View style={styles.semHeader}>
                  <Ionicons name="archive" size={18} color="#6a1b9a" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.semName}>{h.semester_name}</Text>
                    <Text style={styles.semYear}>{h.academic_year}</Text>
                  </View>
                  <View style={[styles.pctBadge, { backgroundColor: pctColor(h.completion_pct) + '20' }]}>
                    <Text style={[styles.pctText, { color: pctColor(h.completion_pct) }]}>
                      {h.completion_pct || 0}%
                    </Text>
                  </View>
                </View>
                <View style={styles.semStats}>
                  <Stat label="مقررات" value={h.courses_count} color="#2e7d32" />
                  <Stat label="طلاب" value={h.total_students} color="#1565c0" />
                  <Stat label="ساعات" value={h.total_credit_hours} color="#ef6c00" />
                  <Stat label="محاضرات" value={h.total_lectures} color="#6a1b9a" />
                  <Stat label="مكتملة" value={h.completed_lectures} color="#2e7d32" />
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function pctColor(p?: number) {
  const v = p || 0;
  if (v >= 75) return '#2e7d32';
  if (v >= 50) return '#ef6c00';
  return '#c62828';
}

const Stat = ({ label, value, color }: any) => (
  <View style={styles.stat}>
    <Text style={[styles.statValue, { color }]}>{value || 0}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  errorText: { fontSize: 14, color: '#666', marginTop: 12, textAlign: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 10,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#ef6c00',
    alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: 15, fontWeight: '700', color: '#222' },
  meta: { fontSize: 11, color: '#888', marginTop: 2 },
  semBadge: {
    backgroundColor: '#fff3e0', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center',
  },
  semBadgeText: { fontSize: 20, fontWeight: '800', color: '#ef6c00' },
  semBadgeLabel: { fontSize: 10, color: '#ef6c00' },
  totalCard: {
    backgroundColor: '#fff8e1', borderRadius: 10, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#ffe0b2',
  },
  totalLabel: { fontSize: 12, color: '#ef6c00', fontWeight: '700', marginBottom: 10, textAlign: 'right' },
  totalRow: { flexDirection: 'row', gap: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 8, textAlign: 'right' },
  semCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  semHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  semName: { fontSize: 14, fontWeight: '700', color: '#222' },
  semYear: { fontSize: 11, color: '#888', marginTop: 2 },
  pctBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, minWidth: 50, alignItems: 'center' },
  pctText: { fontSize: 12, fontWeight: '800' },
  semStats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 8, gap: 4 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 14, fontWeight: '800' },
  statLabel: { fontSize: 10, color: '#888', marginTop: 1 },
  placeholder: { alignItems: 'center', paddingTop: 50 },
  emptyText: { color: '#aaa', marginTop: 14, fontSize: 14 },
});
