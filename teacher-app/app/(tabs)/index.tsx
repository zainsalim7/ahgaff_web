import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/store/authStore';
import { useOfflineSyncStore } from '../../src/store/offlineSyncStore';
import { coursesAPI, lecturesAPI, attendanceAPI } from '../../src/services/api';
import api from '../../src/services/api';
import { LoadingScreen } from '../../src/components/LoadingScreen';

export default function TeacherHome() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { pendingRecords, loadPending, isSyncing, setIsSyncing, markSynced, removeSynced, setLastSyncTime, lastSyncTime } = useOfflineSyncStore();

  const [courses, setCourses] = useState<any[]>([]);
  const [todayLectures, setTodayLectures] = useState<any[]>([]);
  const [notifCount, setNotifCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const pendingCount = pendingRecords.filter(r => !r.synced).length;

  const fetchData = useCallback(async () => {
    try {
      try { const n = await api.get('/notifications/count'); setNotifCount(n.data?.count || 0); } catch {}
      const coursesRes = await coursesAPI.getAll();
      setCourses(coursesRes.data || []);
      try { const lectRes = await lecturesAPI.getToday(); setTodayLectures(lectRes.data || []); } catch {}
      setIsOnline(true);
    } catch (error) {
      setIsOnline(false);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadPending(); fetchData(); }, []);

  const syncOfflineRecords = async () => {
    const pending = pendingRecords.filter(r => !r.synced);
    if (pending.length === 0) return;
    setIsSyncing(true);
    try {
      for (const record of pending) {
        try {
          await attendanceAPI.recordSession({
            course_id: record.course_id,
            lecture_date: record.lecture_date,
            lecture_time: record.lecture_time,
            records: record.students.map(s => ({ student_id: s.student_id, status: s.status })),
          });
          await markSynced(record.id);
        } catch (e) { console.error('Sync failed for record:', record.id, e); }
      }
      await removeSynced();
      setLastSyncTime(new Date().toISOString());
    } finally { setIsSyncing(false); }
  };

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']} data-testid="teacher-home">
      <ScrollView style={styles.scrollView} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Welcome */}
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeRow}>
            <View style={styles.avatar}><Ionicons name="person" size={28} color="#fff" /></View>
            <View style={styles.welcomeInfo}>
              <Text style={styles.greeting}>مرحباً أستاذ</Text>
              <Text style={styles.userName}>{user?.full_name}</Text>
            </View>
            <TouchableOpacity style={styles.notifBtn} onPress={() => router.push('/notifications')} data-testid="notifications-btn">
              <Ionicons name="notifications" size={24} color="#fff" />
              {notifCount > 0 && <View style={styles.notifBadge}><Text style={styles.notifBadgeText}>{notifCount > 9 ? '9+' : notifCount}</Text></View>}
            </TouchableOpacity>
          </View>

          {!isOnline && (
            <View style={styles.offlineBanner}>
              <Ionicons name="cloud-offline" size={16} color="#fff" />
              <Text style={styles.offlineText}>وضع بدون إنترنت - البيانات محفوظة محلياً</Text>
            </View>
          )}
        </View>

        {/* Offline Sync */}
        {pendingCount > 0 && (
          <TouchableOpacity style={styles.syncCard} onPress={syncOfflineRecords} disabled={isSyncing || !isOnline} data-testid="sync-btn">
            <View style={styles.syncRow}>
              <View style={styles.syncIcon}><Ionicons name={isSyncing ? 'sync' : 'cloud-upload'} size={24} color="#fff" /></View>
              <View style={styles.syncInfo}>
                <Text style={styles.syncTitle}>{isSyncing ? 'جارٍ المزامنة...' : `${pendingCount} سجل حضور بانتظار المزامنة`}</Text>
                {!isOnline && <Text style={styles.syncHint}>سيتم المزامنة عند عودة الاتصال</Text>}
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="book" size={24} color="#1b5e20" />
            <Text style={styles.statNum}>{courses.length}</Text>
            <Text style={styles.statLabel}>مقرر</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="today" size={24} color="#ef6c00" />
            <Text style={styles.statNum}>{todayLectures.length}</Text>
            <Text style={styles.statLabel}>محاضرة اليوم</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="time" size={24} color="#c62828" />
            <Text style={styles.statNum}>{pendingCount}</Text>
            <Text style={styles.statLabel}>بانتظار المزامنة</Text>
          </View>
        </View>

        {/* Today's Lectures */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="today" size={20} color="#1b5e20" />
            <Text style={styles.sectionTitle}>محاضرات اليوم</Text>
          </View>
          {todayLectures.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={40} color="#ccc" />
              <Text style={styles.emptyText}>لا توجد محاضرات اليوم</Text>
            </View>
          ) : todayLectures.map((lec: any, i: number) => (
            <View key={i} style={styles.lectureCard}>
              <View style={styles.lectureTime}>
                <Text style={styles.lectureTimeText}>{lec.start_time || '---'}</Text>
                <Text style={styles.lectureTimeSep}>-</Text>
                <Text style={styles.lectureTimeText}>{lec.end_time || '---'}</Text>
              </View>
              <View style={styles.lectureInfo}>
                <Text style={styles.lectureName}>{lec.course_name || 'مقرر'}</Text>
                <Text style={styles.lectureStatus}>{lec.status === 'completed' ? 'مكتمل' : lec.status === 'cancelled' ? 'ملغى' : 'قادم'}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* My Courses */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="book" size={20} color="#1b5e20" />
            <Text style={styles.sectionTitle}>مقرراتي</Text>
          </View>
          {courses.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="book-outline" size={40} color="#ccc" />
              <Text style={styles.emptyText}>لا توجد مقررات مسجلة</Text>
            </View>
          ) : courses.map((c: any) => (
            <TouchableOpacity key={c.id} style={styles.courseCard} onPress={() => router.push(`/course-students?courseId=${c.id}&courseName=${c.name}`)}>
              <View style={styles.courseInfo}>
                <Text style={styles.courseName}>{c.name}</Text>
                {c.code && <Text style={styles.courseCode}>{c.code}</Text>}
              </View>
              <Ionicons name="chevron-back" size={20} color="#ccc" />
            </TouchableOpacity>
          ))}
        </View>

        {lastSyncTime && (
          <Text style={styles.lastSync}>آخر مزامنة: {new Date(lastSyncTime).toLocaleString('ar-SA')}</Text>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollView: { flex: 1 },
  welcomeCard: { backgroundColor: '#1b5e20', margin: 16, borderRadius: 20, padding: 20, elevation: 4 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginLeft: 14 },
  welcomeInfo: { flex: 1 },
  greeting: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  userName: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginTop: 2 },
  notifBtn: { padding: 8, position: 'relative' },
  notifBadge: { position: 'absolute', top: 2, right: 2, backgroundColor: '#f44336', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  notifBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 14, padding: 8, borderRadius: 10, gap: 8 },
  offlineText: { color: '#fff', fontSize: 12 },

  syncCard: { backgroundColor: '#ef6c00', marginHorizontal: 16, marginBottom: 16, borderRadius: 14, padding: 16, elevation: 3 },
  syncRow: { flexDirection: 'row', alignItems: 'center' },
  syncIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginLeft: 14 },
  syncInfo: { flex: 1 },
  syncTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  syncHint: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },

  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, gap: 10 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, alignItems: 'center', elevation: 2 },
  statNum: { fontSize: 24, fontWeight: 'bold', color: '#1a1a2e', marginTop: 4 },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },

  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a2e' },

  emptyState: { alignItems: 'center', padding: 30, backgroundColor: '#fff', borderRadius: 14 },
  emptyText: { fontSize: 14, color: '#999', marginTop: 8 },

  lectureCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, elevation: 1 },
  lectureTime: { alignItems: 'center', marginLeft: 14, backgroundColor: '#e8f5e9', padding: 8, borderRadius: 10 },
  lectureTimeText: { fontSize: 13, fontWeight: '600', color: '#1b5e20' },
  lectureTimeSep: { fontSize: 10, color: '#999' },
  lectureInfo: { flex: 1, justifyContent: 'center' },
  lectureName: { fontSize: 15, fontWeight: '600', color: '#1a1a2e' },
  lectureStatus: { fontSize: 12, color: '#888', marginTop: 2 },

  courseCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, elevation: 1 },
  courseInfo: { flex: 1 },
  courseName: { fontSize: 15, fontWeight: '600', color: '#1a1a2e' },
  courseCode: { fontSize: 12, color: '#888', marginTop: 2 },

  lastSync: { textAlign: 'center', fontSize: 11, color: '#999', marginTop: 8 },
});
