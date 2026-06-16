/**
 * تاريخ مقرر عبر الفصول المؤرشفة بناءً على كود المقرر
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

export default function ArchiveCourseHistoryScreen() {
  const { courseCode } = useLocalSearchParams<{ courseCode: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!courseCode) return;
    try {
      const res = await api.get(`/archives/courses/${encodeURIComponent(courseCode)}/history`);
      setData(res.data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'فشل تحميل التاريخ');
    } finally {
      setLoading(false);
    }
  }, [courseCode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <>
      <Stack.Screen options={{ title: 'تاريخ المقرر', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>
      </SafeAreaView>
    </>
  );

  if (error) return (
    <>
      <Stack.Screen options={{ title: 'تاريخ المقرر', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color="#c62828" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    </>
  );

  const instances = data?.instances || [];
  const firstName = instances[0]?.course_name || courseCode;

  return (
    <>
      <Stack.Screen options={{ title: 'تاريخ المقرر', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ReportActionsBar
          pdfPath={`/archives/courses/${encodeURIComponent(courseCode || '')}/history/pdf`}
          pdfFileName={`course-history-${courseCode}.pdf`}
        />
        <ScrollView dataSet={{ responsiveScrollRoot: "true" }} contentContainerStyle={{ padding: 12, paddingBottom: 30 }}>
          <View style={styles.header}>
            <View style={styles.iconBox}><Ionicons name="book" size={32} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{firstName}</Text>
              <Text style={styles.meta}>كود المقرر: {courseCode}</Text>
            </View>
            <View style={styles.semBadge}>
              <Text style={styles.semBadgeText}>{data?.total_instances || 0}</Text>
              <Text style={styles.semBadgeLabel}>مرة</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>📜 مرات تدريس المقرر</Text>

          {instances.length === 0 ? (
            <View style={styles.placeholder}>
              <Ionicons name="book-outline" size={56} color="#ddd" />
              <Text style={styles.emptyText}>لم يُدرَّس هذا المقرر في أي فصل مؤرشف</Text>
            </View>
          ) : (
            instances.map((it: any, idx: number) => (
              <TouchableOpacity
                key={`${it.semester_id}-${idx}`}
                style={styles.card}
                onPress={() => router.push(`/archive-details?semesterId=${it.semester_id}` as any)}
                testID={`instance-${idx}`}
              >
                <View style={styles.cardHeader}>
                  <Ionicons name="archive" size={18} color="#6a1b9a" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.semName}>{it.semester_name}</Text>
                    <Text style={styles.semYear}>{it.academic_year}</Text>
                  </View>
                  <View style={[styles.pctBadge, { backgroundColor: pctColor(it.completion_pct) + '20' }]}>
                    <Text style={[styles.pctText, { color: pctColor(it.completion_pct) }]}>
                      {it.completion_pct || 0}%
                    </Text>
                  </View>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="school" size={13} color="#ef6c00" />
                  <Text style={styles.infoText}>{it.teacher_name || '-'}</Text>
                  {it.section ? <Text style={styles.infoText}>• شعبة {it.section}</Text> : null}
                </View>
                {it.department_name ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="grid" size={13} color="#666" />
                    <Text style={styles.infoText}>{it.department_name}</Text>
                  </View>
                ) : null}
                <View style={styles.stats}>
                  <Stat label="طلاب" value={it.students_count} color="#1565c0" />
                  <Stat label="محاضرات" value={it.lectures_total} color="#6a1b9a" />
                  <Stat label="مكتملة" value={it.lectures_completed} color="#2e7d32" />
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
  iconBox: {
    width: 56, height: 56, borderRadius: 14, backgroundColor: '#2e7d32',
    alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: 15, fontWeight: '700', color: '#222' },
  meta: { fontSize: 11, color: '#888', marginTop: 2 },
  semBadge: {
    backgroundColor: '#e8f5e9', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center',
  },
  semBadgeText: { fontSize: 20, fontWeight: '800', color: '#2e7d32' },
  semBadgeLabel: { fontSize: 10, color: '#2e7d32' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 8, textAlign: 'right' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  semName: { fontSize: 14, fontWeight: '700', color: '#222' },
  semYear: { fontSize: 11, color: '#888', marginTop: 2 },
  pctBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, minWidth: 50, alignItems: 'center' },
  pctText: { fontSize: 12, fontWeight: '800' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  infoText: { fontSize: 12, color: '#444' },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 8, gap: 4, marginTop: 6 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 14, fontWeight: '800' },
  statLabel: { fontSize: 10, color: '#888', marginTop: 1 },
  placeholder: { alignItems: 'center', paddingTop: 50 },
  emptyText: { color: '#aaa', marginTop: 14, fontSize: 14 },
});
