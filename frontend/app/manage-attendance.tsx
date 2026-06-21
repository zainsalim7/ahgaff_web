import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../src/services/api';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { useAuth, PERMISSIONS } from '../src/contexts/AuthContext';

/**
 * 📋 صفحة إدارة الحضور المستقلة
 *
 * تظهر لمن لديه صلاحية:
 *   - record_attendance / take_attendance / manage_attendance / edit_attendance
 *
 * تعرض المحاضرات (اليوم/الأمس/مخصص) وتسمح بفتح صفحة تسجيل الحضور لأي محاضرة.
 * هذه صفحة لـ "الموظف الإداري" — منفصلة عن "محاضراتي" التي تخص المعلم.
 */

interface Lecture {
  id: string;
  course_id: string;
  course_name?: string;
  course_code?: string;
  teacher_name?: string;
  lecture_date: string;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
  status?: string;
  attendance_taken?: boolean;
  day_name_ar?: string;
}

const showMessage = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function ManageAttendanceScreen() {
  const router = useRouter();
  const { hasAnyPermission } = useAuth();

  const canView = hasAnyPermission([
    PERMISSIONS.MANAGE_ATTENDANCE || 'manage_attendance',
    'record_attendance',
    'take_attendance',
    'edit_attendance',
    'view_attendance',
  ]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [filter, setFilter] = useState<'today' | 'all'>('today');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 🔒 حماية الوصول
  useEffect(() => {
    if (!canView) {
      showMessage('غير مصرح', 'ليس لديك صلاحية لإدارة الحضور');
      router.replace('/' as any);
    }
  }, [canView, router]);

  const fetchLectures = useCallback(async () => {
    setError(null);
    try {
      const endpoint = filter === 'today' ? '/lectures/today' : '/lectures/all-schedule';
      const res = await api.get(endpoint);
      const data = Array.isArray(res.data) ? res.data : res.data?.lectures || [];
      setLectures(data);
    } catch (err: any) {
      console.error('Error fetching lectures:', err);
      setError(err?.response?.data?.detail || 'فشل تحميل المحاضرات');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchLectures();
  }, [fetchLectures]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLectures();
  };

  const filteredLectures = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lectures;
    return lectures.filter(
      (l) =>
        l.course_name?.toLowerCase().includes(q) ||
        l.course_code?.toLowerCase().includes(q) ||
        l.teacher_name?.toLowerCase().includes(q)
    );
  }, [lectures, search]);

  const openAttendance = (lecture: Lecture) => {
    router.push({
      pathname: '/take-attendance',
      params: {
        lectureId: lecture.id,
        courseId: lecture.course_id,
        courseName: lecture.course_name || '',
      },
    } as any);
  };

  if (loading) return <LoadingScreen />;
  if (!canView) return null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'إدارة الحضور', headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-forward" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>إدارة الحضور</Text>
          <Text style={styles.headerSubtitle}>تسجيل وتعديل حضور الطلاب في المحاضرات</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="checkbox" size={22} color="#fff" />
        </View>
      </View>

      {/* Filter & Search */}
      <View style={styles.controls}>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterBtn, filter === 'today' && styles.filterBtnActive]}
            onPress={() => setFilter('today')}
            data-testid="filter-today"
          >
            <Ionicons name="today" size={14} color={filter === 'today' ? '#fff' : '#5b6678'} />
            <Text style={[styles.filterBtnText, filter === 'today' && { color: '#fff' }]}>اليوم</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, filter === 'all' && styles.filterBtnActive]}
            onPress={() => setFilter('all')}
            data-testid="filter-all"
          >
            <Ionicons name="calendar" size={14} color={filter === 'all' ? '#fff' : '#5b6678'} />
            <Text style={[styles.filterBtnText, filter === 'all' && { color: '#fff' }]}>الكل</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color="#8a95a8" />
          <TextInput
            style={styles.searchInput}
            placeholder="بحث بالمقرر أو المعلم..."
            placeholderTextColor="#a8b1c2"
            value={search}
            onChangeText={setSearch}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#8a95a8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="warning" size={16} color="#f44336" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {filteredLectures.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={56} color="#cfd6e1" />
            <Text style={styles.emptyTitle}>
              {filter === 'today' ? 'لا توجد محاضرات اليوم' : 'لا توجد محاضرات'}
            </Text>
            <Text style={styles.emptyText}>
              {filter === 'today'
                ? 'لا توجد محاضرات مجدولة لليوم. جرّب فلتر "الكل" لعرض جميع المحاضرات.'
                : 'لا توجد محاضرات مسجلة في النظام.'}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredLectures.map((l) => (
              <TouchableOpacity
                key={l.id}
                style={styles.lectureCard}
                onPress={() => openAttendance(l)}
                activeOpacity={0.7}
                data-testid={`lecture-${l.id}`}
              >
                <View style={[
                  styles.lectureIcon,
                  l.attendance_taken && { backgroundColor: '#e8f5e9' },
                ]}>
                  <Ionicons
                    name={l.attendance_taken ? 'checkmark-circle' : 'time'}
                    size={22}
                    color={l.attendance_taken ? '#2e7d32' : '#1565c0'}
                  />
                </View>
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <Text style={styles.lectureCourse}>{l.course_name || l.course_code}</Text>
                  <View style={styles.lectureMeta}>
                    {l.teacher_name && (
                      <View style={styles.metaItem}>
                        <Ionicons name="person" size={11} color="#5b6678" />
                        <Text style={styles.metaText}>{l.teacher_name}</Text>
                      </View>
                    )}
                    {l.scheduled_start_time && (
                      <View style={styles.metaItem}>
                        <Ionicons name="time-outline" size={11} color="#5b6678" />
                        <Text style={styles.metaText}>
                          {l.scheduled_start_time}
                          {l.scheduled_end_time ? ` - ${l.scheduled_end_time}` : ''}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.lectureDate}>
                    {l.day_name_ar ? `${l.day_name_ar} • ` : ''}
                    {l.lecture_date}
                  </Text>
                </View>
                <View style={styles.actionArea}>
                  <Text style={[
                    styles.statusBadge,
                    l.attendance_taken
                      ? { color: '#2e7d32', backgroundColor: '#e8f5e9' }
                      : { color: '#1565c0', backgroundColor: '#e3f2fd' }
                  ]}>
                    {l.attendance_taken ? '✓ مُسجَّل' : 'تسجيل'}
                  </Text>
                  <Ionicons name="chevron-back" size={18} color="#a8b1c2" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  scroll: { flex: 1 },
  scrollContent: { padding: 14 },

  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#1565c0',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 18,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'right' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2, textAlign: 'right' },

  controls: {
    backgroundColor: '#fff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f5',
  },
  filterRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 10 },
  filterBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f6f8',
  },
  filterBtnActive: { backgroundColor: '#1565c0' },
  filterBtnText: { fontSize: 13, color: '#5b6678', fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#f5f6f8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1a1a2e', textAlign: 'right' },

  list: { gap: 10 },
  lectureCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  lectureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lectureCourse: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'right',
  },
  lectureMeta: {
    flexDirection: 'row-reverse',
    gap: 12,
    marginTop: 3,
    flexWrap: 'wrap',
  },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: '#5b6678' },
  lectureDate: { fontSize: 11, color: '#8a95a8', marginTop: 3, textAlign: 'right' },
  actionArea: { alignItems: 'center', gap: 4 },
  statusBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },

  empty: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a2e', marginTop: 12 },
  emptyText: { fontSize: 12, color: '#8a95a8', marginTop: 6, textAlign: 'center', lineHeight: 18 },

  errorBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorText: { color: '#c62828', fontSize: 13, flex: 1, textAlign: 'right' },
});
