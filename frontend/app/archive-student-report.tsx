/**
 * تقرير طالب في فصل مؤرشف - حضور تفصيلي + إجمالي
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

export default function ArchiveStudentReportScreen() {
  const { semesterId, studentId } = useLocalSearchParams<{ semesterId: string; studentId: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!semesterId || !studentId) return;
    try {
      const res = await api.get(`/archives/${semesterId}/students/${studentId}`);
      setData(res.data);
      setError(null);
    } catch (e: any) {
      const msg = e?.response?.status === 403
        ? 'ليست لديك صلاحية عرض الأرشيف'
        : (e?.response?.data?.detail || 'فشل تحميل التقرير');
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [semesterId, studentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}><ActivityIndicator size="large" color="#6a1b9a" /></View>
    </SafeAreaView>
  );

  if (error || !data) return (
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

  const overall = data.overall || {};

  return (
    <>
      <Stack.Screen options={{ title: 'تقرير حضور طالب', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.warningBanner}>
          <Ionicons name="archive" size={14} color="#6a1b9a" />
          <Text style={styles.warningText}>تقرير من الأرشيف - {data.semester_name}</Text>
        </View>

        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
        >
          {/* رأس الطالب */}
          <View style={styles.header}>
            <View style={styles.avatar}><Ionicons name="person" size={32} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.studentName}>{data.student?.full_name}</Text>
              <Text style={styles.studentMeta}>
                {data.student?.student_id} {data.student?.reference_number ? `• ${data.student.reference_number}` : ''}
              </Text>
              <Text style={styles.studentMeta}>
                {data.student?.level ? `المستوى ${data.student.level}` : ''} {data.student?.section ? `• شعبة ${data.student.section}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.historyBtn}
              onPress={() => router.push(`/archive-student-history?studentId=${studentId}` as any)}
              testID="open-student-history"
            >
              <Ionicons name="time" size={16} color="#1565c0" />
              <Text style={styles.historyBtnText}>السجل الكامل</Text>
            </TouchableOpacity>
          </View>

          {/* بطاقات إحصائيات الحضور */}
          <View style={styles.statsRow}>
            <StatBox icon="checkmark" label="حاضر" value={overall.present} color="#2e7d32" />
            <StatBox icon="close" label="غائب" value={overall.absent} color="#c62828" />
            <StatBox icon="time" label="متأخر" value={overall.late} color="#ef6c00" />
            <StatBox icon="document-text" label="معذور" value={overall.excused} color="#1565c0" />
          </View>

          <View style={styles.overallBox}>
            <Text style={styles.overallLabel}>نسبة الحضور العامة</Text>
            <Text style={[styles.overallValue, { color: pctColor(overall.attendance_pct) }]}>
              {overall.attendance_pct}%
            </Text>
            <Text style={styles.overallMeta}>
              من إجمالي {overall.total} محاضرة في {data.courses_count} مقرر
            </Text>
          </View>

          {/* جدول المقررات */}
          <Text style={styles.sectionTitle}>📚 تفاصيل الحضور لكل مقرر</Text>
          {(data.courses || []).map((c: any) => (
            <View key={c.course_id} style={styles.courseCard} testID={`course-${c.course_id}`}>
              <View style={styles.courseHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.courseName}>{c.course_name}</Text>
                  <Text style={styles.courseMeta}>
                    {c.course_code} {c.section ? `• ${c.section}` : ''} {c.teacher_name ? `• ${c.teacher_name}` : ''}
                  </Text>
                </View>
                <View style={[styles.pctBadge, { backgroundColor: pctColor(c.attendance_pct) + '20' }]}>
                  <Text style={[styles.pctText, { color: pctColor(c.attendance_pct) }]}>
                    {c.attendance_pct}%
                  </Text>
                </View>
              </View>
              <View style={styles.attRow}>
                <AttCell label="حاضر" value={c.present} color="#2e7d32" />
                <AttCell label="غائب" value={c.absent} color="#c62828" />
                <AttCell label="متأخر" value={c.late} color="#ef6c00" />
                <AttCell label="معذور" value={c.excused} color="#1565c0" />
                <AttCell label="إجمالي" value={c.total} color="#666" />
              </View>
            </View>
          ))}
          {(!data.courses || data.courses.length === 0) && (
            <Text style={styles.emptyText}>لم يُسجل الطالب في أي مقرر بهذا الفصل</Text>
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
    <Ionicons name={icon} size={18} color={color} />
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
  retryBtn: { marginTop: 16, backgroundColor: '#6a1b9a', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700' },
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
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#1565c0',
    alignItems: 'center', justifyContent: 'center',
  },
  studentName: { fontSize: 15, fontWeight: '700', color: '#222' },
  studentMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  historyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#e3f2fd', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
  },
  historyBtnText: { fontSize: 11, color: '#1565c0', fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  statBox: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center',
  },
  statValue: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  statLabel: { fontSize: 10, color: '#666', marginTop: 2 },
  overallBox: {
    backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 14,
    alignItems: 'center',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' } as any) : { elevation: 1 }),
  },
  overallLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  overallValue: { fontSize: 36, fontWeight: '800' },
  overallMeta: { fontSize: 11, color: '#888', marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 8, textAlign: 'right' },
  courseCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6,
  },
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
});
