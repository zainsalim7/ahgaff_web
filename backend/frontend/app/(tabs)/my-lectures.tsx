import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import api from '../../src/services/api';

interface Lecture {
  id: string;
  course_name: string;
  course_code: string;
  course_id: string;
  day: string;
  date: string;
  start_time: string;
  end_time: string;
  room: string;
  status: string;
  attendance_count?: number;
  total_students?: number;
}

const DAY_NAMES: Record<string, string> = {
  saturday: 'السبت', sunday: 'الأحد', monday: 'الإثنين',
  tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس', friday: 'الجمعة',
};

const STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
  completed: { label: 'مكتملة', color: '#4caf50', icon: 'checkmark-circle' },
  scheduled: { label: 'مجدولة', color: '#2196f3', icon: 'time' },
  absent: { label: 'غائب', color: '#f44336', icon: 'close-circle' },
  cancelled: { label: 'ملغية', color: '#9e9e9e', icon: 'ban' },
};

export default function MyLecturesTab() {
  const router = useRouter();
  const { token } = useAuth();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLectures = useCallback(async () => {
    try {
      const res = await api.get('/lectures/today');
      setLectures(res.data?.lectures || res.data || []);
    } catch (error) {
      console.error('Error fetching lectures:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchLectures(); }, [fetchLectures]);

  const onRefresh = () => { setRefreshing(true); fetchLectures(); };

  const getStatusInfo = (status: string) => STATUS_MAP[status] || STATUS_MAP.scheduled;

  const renderLecture = ({ item }: { item: Lecture }) => {
    const statusInfo = getStatusInfo(item.status);
    return (
      <TouchableOpacity
        style={styles.lectureCard}
        onPress={() => router.push({ pathname: '/course-lectures', params: { courseId: item.course_id } })}
        data-testid={`lecture-card-${item.id}`}
      >
        <View style={styles.timeColumn}>
          <Text style={styles.timeText}>{item.start_time}</Text>
          <View style={styles.timeLine} />
          <Text style={styles.timeText}>{item.end_time}</Text>
        </View>
        <View style={styles.lectureInfo}>
          <Text style={styles.courseName}>{item.course_name}</Text>
          <Text style={styles.courseCode}>{item.course_code}</Text>
          {item.room ? <Text style={styles.room}><Ionicons name="location" size={12} color="#666" /> {item.room}</Text> : null}
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '20' }]}>
            <Ionicons name={statusInfo.icon as any} size={14} color={statusInfo.color} />
            <Text style={[styles.statusText, { color: statusInfo.color }]}> {statusInfo.label}</Text>
          </View>
        </View>
        <View style={styles.actionColumn}>
          {item.status === 'scheduled' && (
            <TouchableOpacity
              style={styles.attendanceBtn}
              onPress={() => router.push({ pathname: '/take-attendance', params: { lectureId: item.id } })}
              data-testid={`take-attendance-${item.id}`}
            >
              <Ionicons name="hand-left" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={lectures}
        renderItem={renderLecture}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>لا توجد محاضرات اليوم</Text>
            <Text style={styles.emptyHint}>سيتم عرض محاضراتك المجدولة لليوم هنا</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  list: { padding: 16 },
  lectureCard: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12,
    padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  timeColumn: { alignItems: 'center', marginRight: 16, width: 50 },
  timeText: { fontSize: 13, fontWeight: '700', color: '#1565c0' },
  timeLine: { flex: 1, width: 2, backgroundColor: '#e0e0e0', marginVertical: 4 },
  lectureInfo: { flex: 1 },
  courseName: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 2 },
  courseCode: { fontSize: 13, color: '#888', marginBottom: 4 },
  room: { fontSize: 13, color: '#666', marginBottom: 6 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '600' },
  actionColumn: { justifyContent: 'center', alignItems: 'center' },
  attendanceBtn: {
    backgroundColor: '#1565c0', borderRadius: 20,
    width: 40, height: 40, justifyContent: 'center', alignItems: 'center',
  },
  emptyState: { alignItems: 'center', marginTop: 80, padding: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#666', marginTop: 16 },
  emptyHint: { fontSize: 14, color: '#999', marginTop: 8, textAlign: 'center' },
});
