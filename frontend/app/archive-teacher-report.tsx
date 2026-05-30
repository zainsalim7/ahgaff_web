/**
 * تقرير نصاب معلم في فصل مؤرشف
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import api from '../src/services/api';
import { ReportActionsBar } from '../src/components/ReportActionsBar';

export default function ArchiveTeacherReportScreen() {
  const { semesterId, teacherId } = useLocalSearchParams<{ semesterId: string; teacherId: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!semesterId || !teacherId) return;
    try {
      const res = await api.get(`/archives/${semesterId}/teachers/${teacherId}`);
      setData(res.data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'فشل تحميل التقرير');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [semesterId, teacherId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <>
      <Stack.Screen options={{ title: 'نصاب معلم', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color="#6a1b9a" /></View>
      </SafeAreaView>
    </>
  );

  if (error || !data) return (
    <>
      <Stack.Screen options={{ title: 'نصاب معلم', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color="#c62828" />
          <Text style={styles.errorText}>{error || 'لا توجد بيانات'}</Text>
        </View>
      </SafeAreaView>
    </>
  );

  const s = data.summary || {};

  return (
    <>
      <Stack.Screen options={{ title: 'نصاب معلم', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.warningBanner}>
          <Ionicons name="archive" size={14} color="#6a1b9a" />
          <Text style={styles.warningText}>نصاب من الأرشيف - {data.semester_name}</Text>
        </View>

        <ReportActionsBar
          pdfPath={`/archives/${semesterId}/teachers/${teacherId}/pdf`}
          pdfFileName={`teacher-report-${data.teacher?.teacher_id || teacherId}.pdf`}
        />

        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
        >
          <View style={styles.header}>
            <View style={styles.avatar}><Ionicons name="school" size={32} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.teacherName}>{data.teacher?.full_name}</Text>
              <Text style={styles.teacherMeta}>
                {data.teacher?.teacher_id} {data.teacher?.academic_title ? `• ${data.teacher.academic_title}` : ''}
              </Text>
              {data.teacher?.specialization ? (
                <Text style={styles.teacherMeta}>{data.teacher.specialization}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.historyBtn}
              onPress={() => router.push(`/archive-teacher-history?teacherId=${teacherId}` as any)}
              testID="open-teacher-history"
            >
              <Ionicons name="time" size={16} color="#ef6c00" />
              <Text style={styles.historyBtnText}>السجل الكامل</Text>
            </TouchableOpacity>
          </View>

          {/* بطاقات الإحصائيات الكبرى */}
          <View style={styles.statsRow}>
            <StatBox icon="book" label="مقررات" value={s.courses_count} color="#2e7d32" />
            <StatBox icon="people" label="طلاب" value={s.total_students} color="#1565c0" />
            <StatBox icon="time" label="ساعات معتمدة" value={s.total_credit_hours} color="#ef6c00" />
          </View>
          <View style={styles.statsRow}>
            <StatBox icon="calendar" label="إجمالي محاضرات" value={s.total_lectures} color="#6a1b9a" />
            <StatBox icon="checkmark-done" label="مكتملة" value={s.completed_lectures} color="#2e7d32" />
            <StatBox
              icon="bar-chart"
              label="نسبة الإنجاز"
              value={`${s.completion_pct || 0}%`}
              color={pctColor(s.completion_pct || 0)}
            />
          </View>

          {/* قائمة المقررات */}
          <Text style={styles.sectionTitle}>📚 المقررات المُدرَّسة</Text>
          {(data.courses || []).map((c: any) => (
            <View key={c.id} style={styles.courseCard} testID={`course-${c.id}`}>
              <View style={styles.courseHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.courseName}>{c.name}</Text>
                  <Text style={styles.courseMeta}>
                    {c.code} {c.section ? `• شعبة ${c.section}` : ''} {c.level ? `• م${c.level}` : ''} {c.room ? `• قاعة ${c.room}` : ''}
                  </Text>
                </View>
                <View style={[styles.pctBadge, { backgroundColor: pctColor(c.completion_pct) + '20' }]}>
                  <Text style={[styles.pctText, { color: pctColor(c.completion_pct) }]}>
                    {c.completion_pct}%
                  </Text>
                </View>
              </View>
              <View style={styles.attRow}>
                <AttCell label="طلاب" value={c.students_count} color="#1565c0" />
                <AttCell label="ساعات" value={c.credit_hours} color="#ef6c00" />
                <AttCell label="محاضرات" value={c.lectures_total} color="#6a1b9a" />
                <AttCell label="مكتملة" value={c.lectures_completed} color="#2e7d32" />
              </View>
            </View>
          ))}
          {(!data.courses || data.courses.length === 0) && (
            <Text style={styles.emptyText}>لم يُدرّس المعلم أي مقرر في هذا الفصل</Text>
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

const StatBox = ({ icon, label, value, color }: any) => (
  <View style={[styles.statBox, { borderColor: color + '30' }]}>
    <Ionicons name={icon} size={20} color={color} />
    <Text style={[styles.statValue, { color }]}>{value || 0}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const AttCell = ({ label, value, color }: any) => (
  <View style={styles.attCell}>
    <Text style={[styles.attValue, { color }]}>{value || 0}</Text>
    <Text style={styles.attLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  errorText: { fontSize: 14, color: '#666', marginTop: 12, textAlign: 'center' },
  warningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f3e5f5', paddingVertical: 6, paddingHorizontal: 12,
  },
  warningText: { color: '#6a1b9a', fontSize: 11, fontWeight: '600' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 10,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#ef6c00',
    alignItems: 'center', justifyContent: 'center',
  },
  teacherName: { fontSize: 15, fontWeight: '700', color: '#222' },
  teacherMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  historyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fff3e0', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
  },
  historyBtnText: { fontSize: 11, color: '#ef6c00', fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  statBox: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1,
    paddingVertical: 14, paddingHorizontal: 4, alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  statLabel: { fontSize: 10, color: '#666', marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#333', marginTop: 8, marginBottom: 8, textAlign: 'right' },
  courseCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6 },
  courseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  courseName: { fontSize: 13, fontWeight: '700', color: '#222' },
  courseMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  pctBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, minWidth: 50, alignItems: 'center' },
  pctText: { fontSize: 12, fontWeight: '800' },
  attRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 8, gap: 4 },
  attCell: { flex: 1, alignItems: 'center' },
  attValue: { fontSize: 14, fontWeight: '800' },
  attLabel: { fontSize: 10, color: '#888', marginTop: 1 },
  emptyText: { textAlign: 'center', color: '#aaa', padding: 30, fontSize: 13 },
  ...({} as any),
  // (placeholder no-op so we don't lose props)
});
