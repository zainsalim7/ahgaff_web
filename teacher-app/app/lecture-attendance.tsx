import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { attendanceAPI, enrollmentsAPI } from '../src/services/api';

export default function LectureAttendanceScreen() {
  const { lectureId, courseId, courseName, date } = useLocalSearchParams<{ lectureId: string; courseId: string; courseName: string; date: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<any[]>([]);

  useEffect(() => {
    fetchAttendance();
  }, []);

  const fetchAttendance = async () => {
    try {
      const res = await attendanceAPI.getCourseAttendance(courseId!);
      setAttendance(res.data || []);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']} data-testid="lecture-attendance">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-forward" size={24} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>سجل الحضور</Text>
          <Text style={styles.headerSub}>{courseName} - {date}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingCenter}><ActivityIndicator size="large" color="#1b5e20" /></View>
      ) : attendance.length === 0 ? (
        <View style={styles.emptyState}><Ionicons name="clipboard-outline" size={48} color="#ccc" /><Text style={styles.emptyText}>لا توجد سجلات حضور</Text></View>
      ) : (
        <ScrollView style={styles.list}>
          {attendance.map((record: any, i: number) => (
            <View key={i} style={styles.recordRow}>
              <Text style={styles.recordDate}>{record.date}</Text>
              <Text style={styles.recordInfo}>حاضر: {record.present_count} | غائب: {record.absent_count}</Text>
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
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: '#999', marginTop: 12 },
  list: { flex: 1, padding: 12 },
  recordRow: { backgroundColor: '#fff', padding: 14, marginBottom: 6, borderRadius: 12, elevation: 1 },
  recordDate: { fontSize: 15, fontWeight: '600', color: '#1a1a2e' },
  recordInfo: { fontSize: 13, color: '#888', marginTop: 4 },
});
