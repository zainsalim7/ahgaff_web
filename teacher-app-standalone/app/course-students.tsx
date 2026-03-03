import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { enrollmentsAPI, attendanceAPI } from '../src/services/api';

export default function CourseStudentsScreen() {
  const { courseId, courseName } = useLocalSearchParams<{ courseId: string; courseName: string }>();
  const router = useRouter();
  const [students, setStudents] = useState<any[]>([]);
  const [courseStats, setCourseStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [courseId]);

  const fetchData = async () => {
    try {
      const [studentsRes, statsRes] = await Promise.all([
        enrollmentsAPI.getStudents(courseId!),
        attendanceAPI.getCourseStats(courseId!).catch(() => ({ data: null })),
      ]);
      setStudents(studentsRes.data || []);
      setCourseStats(statsRes.data);
    } catch (error) {
      console.error('Error:', error);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']} data-testid="course-students">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-forward" size={24} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{courseName}</Text>
          <Text style={styles.headerSub}>{students.length} طالب</Text>
        </View>
      </View>

      {courseStats && (
        <View style={styles.statsRow}>
          <View style={styles.stat}><Text style={styles.statNum}>{courseStats.total_lectures || 0}</Text><Text style={styles.statLabel}>محاضرة</Text></View>
          <View style={styles.stat}><Text style={[styles.statNum, { color: '#2e7d32' }]}>{Math.round(courseStats.average_attendance_rate || 0)}%</Text><Text style={styles.statLabel}>حضور</Text></View>
          <View style={styles.stat}><Text style={styles.statNum}>{students.length}</Text><Text style={styles.statLabel}>طالب</Text></View>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingCenter}><ActivityIndicator size="large" color="#1b5e20" /></View>
      ) : students.length === 0 ? (
        <View style={styles.emptyState}><Ionicons name="people-outline" size={48} color="#ccc" /><Text style={styles.emptyText}>لا يوجد طلاب مسجلين</Text></View>
      ) : (
        <ScrollView style={styles.list}>
          {students.map((s: any, i: number) => (
            <View key={s.id} style={styles.studentRow}>
              <View style={styles.indexCircle}><Text style={styles.indexText}>{i + 1}</Text></View>
              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>{s.full_name}</Text>
                <Text style={styles.studentId}>#{s.student_id}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1b5e20', padding: 16, paddingTop: 20 },
  backBtn: { padding: 8, marginLeft: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  statsRow: { flexDirection: 'row', backgroundColor: '#fff', padding: 14, borderBottomWidth: 1, borderBottomColor: '#e8e8e8' },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: '#999', marginTop: 12 },
  list: { flex: 1, padding: 12 },
  studentRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, marginBottom: 6, borderRadius: 12, elevation: 1 },
  indexCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e8f5e9', justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  indexText: { fontSize: 13, fontWeight: '600', color: '#1b5e20' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 15, fontWeight: '600', color: '#1a1a2e' },
  studentId: { fontSize: 12, color: '#888', marginTop: 2 },
});
