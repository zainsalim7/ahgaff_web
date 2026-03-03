import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/store/authStore';
import { coursesAPI, attendanceAPI } from '../../src/services/api';
import { LoadingScreen } from '../../src/components/LoadingScreen';

export default function MyCoursesScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCourses = useCallback(async () => {
    try {
      const res = await coursesAPI.getAll();
      const teacherCourses = (res.data || []).filter((c: any) => c.teacher_id === user?.id || c.teacher_name === user?.full_name);
      // Get stats for each course
      const withStats = await Promise.all(teacherCourses.map(async (c: any) => {
        try {
          const stats = await attendanceAPI.getCourseStats(c.id);
          return { ...c, stats: stats.data };
        } catch { return { ...c, stats: null }; }
      }));
      setCourses(withStats);
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useEffect(() => { fetchCourses(); }, []);

  if (loading) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']} data-testid="my-courses">
      <ScrollView style={styles.scrollView} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchCourses(); }} />}>
        {courses.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="book-outline" size={56} color="#ccc" />
            <Text style={styles.emptyText}>لا توجد مقررات مسجلة لك</Text>
          </View>
        ) : courses.map(c => (
          <TouchableOpacity key={c.id} style={styles.courseCard} onPress={() => router.push(`/course-students?courseId=${c.id}&courseName=${c.name}`)}>
            <View style={styles.courseHeader}>
              <View style={styles.courseIcon}><Ionicons name="book" size={24} color="#1b5e20" /></View>
              <View style={styles.courseInfo}>
                <Text style={styles.courseName}>{c.name}</Text>
                {c.code && <Text style={styles.courseCode}>{c.code}</Text>}
                {c.department_name && <Text style={styles.courseDept}>{c.department_name}</Text>}
              </View>
            </View>

            {c.stats && (
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{c.stats.total_lectures || 0}</Text>
                  <Text style={styles.statLabel}>محاضرة</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={[styles.statNum, { color: '#2e7d32' }]}>{Math.round(c.stats.average_attendance_rate || 0)}%</Text>
                  <Text style={styles.statLabel}>نسبة الحضور</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{c.stats.total_students || 0}</Text>
                  <Text style={styles.statLabel}>طالب</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        ))}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollView: { flex: 1, padding: 16 },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 15, color: '#999', marginTop: 12 },
  courseCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
  courseHeader: { flexDirection: 'row', alignItems: 'center' },
  courseIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e8f5e9', justifyContent: 'center', alignItems: 'center', marginLeft: 14 },
  courseInfo: { flex: 1 },
  courseName: { fontSize: 17, fontWeight: '600', color: '#1a1a2e' },
  courseCode: { fontSize: 13, color: '#888', marginTop: 2 },
  courseDept: { fontSize: 12, color: '#1b5e20', marginTop: 2 },
  statsRow: { flexDirection: 'row', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
});
