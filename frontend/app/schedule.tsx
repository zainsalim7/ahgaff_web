import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { settingsAPI, lecturesAPI } from '../src/services/api';
import { useAuthStore } from '../src/store/authStore';
import { LoadingScreen } from '../src/components/LoadingScreen';
import api from '../src/services/api';

const DAYS_AR: Record<number, string> = {
  0: 'الأحد',
  1: 'الإثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  scheduled: { label: 'مجدولة', color: '#1565c0', bg: '#e3f2fd', icon: 'time-outline' },
  completed: { label: 'منعقدة', color: '#2e7d32', bg: '#e8f5e9', icon: 'checkmark-circle' },
  absent: { label: 'غائب', color: '#e65100', bg: '#fff3e0', icon: 'alert-circle' },
  cancelled: { label: 'ملغاة', color: '#c62828', bg: '#ffebee', icon: 'close-circle' },
};

const ACCENT_COLORS = ['#1565c0', '#00897b', '#6a1b9a', '#ef6c00', '#c62828', '#2e7d32', '#ad1457'];

function formatDateArabic(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const dayName = DAYS_AR[d.getDay()] || '';
  const day = d.getDate();
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${dayName}، ${day} ${month} ${year}`;
}

function getToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export default function ScheduleScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [lectures, setLectures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getToday);
  const [semesterSettings, setSemesterSettings] = useState<any>(null);

  const fetchLectures = useCallback(async (date: string) => {
    try {
      setLoading(true);
      const res = await api.get(`/lectures/all-schedule?date=${date}`);
      setLectures(res.data?.lectures || []);
    } catch (error) {
      console.error('Error fetching lectures:', error);
      setLectures([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch semester settings once
  useEffect(() => {
    (async () => {
      try {
        const settingsRes = await settingsAPI.get();
        let semStart = settingsRes.data.semester_start_date;
        let semEnd = settingsRes.data.semester_end_date;
        let semName = settingsRes.data.current_semester;
        if (!semStart || !semEnd) {
          try {
            const currentSemRes = await api.get('/semesters/current');
            if (currentSemRes.data) {
              semStart = semStart || currentSemRes.data.start_date;
              semEnd = semEnd || currentSemRes.data.end_date;
              semName = semName || currentSemRes.data.name;
            }
          } catch {}
        }
        setSemesterSettings({ semester_start_date: semStart, semester_end_date: semEnd, current_semester: semName });
      } catch {}
    })();
  }, []);

  useEffect(() => {
    fetchLectures(selectedDate);
  }, [selectedDate, fetchLectures]);

  const isToday = selectedDate === getToday();

  const handleDeleteLecture = async (lectureId: string) => {
    if (Platform.OS === 'web') {
      if (!window.confirm('هل أنت متأكد من حذف هذه المحاضرة؟')) return;
      try { await lecturesAPI.delete(lectureId); fetchLectures(selectedDate); } catch { alert('فشل في حذف المحاضرة'); }
    } else {
      Alert.alert('حذف المحاضرة', 'هل أنت متأكد؟', [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: async () => {
          try { await lecturesAPI.delete(lectureId); fetchLectures(selectedDate); } catch { Alert.alert('خطأ', 'فشل في الحذف'); }
        }},
      ]);
    }
  };

  const handleCancelLecture = async (lectureId: string) => {
    if (Platform.OS === 'web') {
      if (!window.confirm('هل أنت متأكد من إلغاء هذه المحاضرة؟')) return;
      try { await lecturesAPI.updateStatus(lectureId, 'cancelled'); fetchLectures(selectedDate); } catch { alert('فشل في الإلغاء'); }
    } else {
      Alert.alert('إلغاء المحاضرة', 'هل أنت متأكد؟', [
        { text: 'تراجع', style: 'cancel' },
        { text: 'إلغاء المحاضرة', style: 'destructive', onPress: async () => {
          try { await lecturesAPI.updateStatus(lectureId, 'cancelled'); fetchLectures(selectedDate); } catch { Alert.alert('خطأ', 'فشل'); }
        }},
      ]);
    }
  };

  const getCourseColor = (courseId: string) => {
    let hash = 0;
    for (let i = 0; i < courseId.length; i++) hash = courseId.charCodeAt(i) + ((hash << 5) - hash);
    return ACCENT_COLORS[Math.abs(hash) % ACCENT_COLORS.length];
  };

  const renderLectureCard = ({ item, index }: { item: any; index: number }) => {
    const st = STATUS_CONFIG[item.status] || STATUS_CONFIG.scheduled;
    const courseColor = getCourseColor(item.course_id);
    return (
      <View style={s.lectureRow} data-testid={`lecture-card-${item.id}`}>
        <View style={s.timeline}>
          <View style={[s.timelineDot, { backgroundColor: courseColor }]} />
          {index < lectures.length - 1 && <View style={s.timelineLine} />}
        </View>
        <View style={s.card}>
          <View style={[s.cardBorder, { backgroundColor: courseColor }]} />
          <View style={s.cardContent}>
            <View style={s.cardTopRow}>
              <View style={s.cardTimeBox}>
                <Ionicons name="time-outline" size={14} color={courseColor} />
                <Text style={[s.cardTime, { color: courseColor }]}>
                  {item.start_time} - {item.end_time}
                </Text>
              </View>
              <View style={[s.cardStatusBadge, { backgroundColor: st.bg }]}>
                <Text style={[s.cardStatusText, { color: st.color }]}>{st.label}</Text>
              </View>
            </View>
            <Text style={s.cardTitle}>{item.course_name}{item.section ? ` (${item.section})` : ''}</Text>
            <View style={s.cardDetailsRow}>
              {item.teacher_name ? (
                <View style={s.cardDetail}>
                  <Ionicons name="person-outline" size={13} color="#888" />
                  <Text style={s.cardDetailText}>{item.teacher_name}</Text>
                </View>
              ) : null}
              {item.room ? (
                <View style={s.cardDetail}>
                  <Ionicons name="location-outline" size={13} color="#888" />
                  <Text style={s.cardDetailText}>{item.room}</Text>
                </View>
              ) : null}
              {item.course_code ? (
                <View style={s.cardDetail}>
                  <Ionicons name="code-outline" size={13} color="#888" />
                  <Text style={s.cardDetailText}>{item.course_code}</Text>
                </View>
              ) : null}
            </View>
            {(user?.role === 'admin' || user?.permissions?.includes('manage_lectures') || user?.permissions?.includes('edit_lectures')) && (
              <View style={s.cardActions}>
                <TouchableOpacity
                  style={s.cardActionBtn}
                  onPress={() => router.push({ pathname: '/take-attendance', params: { lectureId: item.id, courseId: item.course_id, courseName: item.course_name } })}
                  data-testid={`view-attendance-${item.id}`}
                >
                  <Ionicons name="eye-outline" size={16} color="#1565c0" />
                  <Text style={[s.cardActionText, { color: '#1565c0' }]}>عرض</Text>
                </TouchableOpacity>
                {item.status !== 'cancelled' && (
                  <TouchableOpacity
                    style={s.cardActionBtn}
                    onPress={() => handleCancelLecture(item.id)}
                    data-testid={`cancel-lecture-${item.id}`}
                  >
                    <Ionicons name="close-circle-outline" size={16} color="#e65100" />
                    <Text style={[s.cardActionText, { color: '#e65100' }]}>إلغاء</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={s.cardActionBtn}
                  onPress={() => handleDeleteLecture(item.id)}
                  data-testid={`delete-lecture-${item.id}`}
                >
                  <Ionicons name="trash-outline" size={16} color="#c62828" />
                  <Text style={[s.cardActionText, { color: '#c62828' }]}>حذف</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  // ===== Teacher View =====
  if (user?.role === 'teacher') {
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>جدول المحاضرات</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Date Navigation */}
        <View style={s.dateNav} data-testid="date-navigation">
          <TouchableOpacity onPress={() => setSelectedDate(shiftDate(selectedDate, 1))} style={s.dateNavArrow} data-testid="next-day-btn">
            <Ionicons name="chevron-forward" size={22} color="#1a237e" />
          </TouchableOpacity>

          <View style={s.dateNavCenter}>
            <Text style={s.dateNavDay}>{DAYS_AR[new Date(selectedDate + 'T00:00:00').getDay()]}</Text>
            <Text style={s.dateNavDate}>{selectedDate}</Text>
            {Platform.OS === 'web' && (
              <input
                type="date"
                value={selectedDate}
                onChange={(e: any) => setSelectedDate(e.target.value)}
                style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                data-testid="date-picker-input"
              />
            )}
          </View>

          <TouchableOpacity onPress={() => setSelectedDate(shiftDate(selectedDate, -1))} style={s.dateNavArrow} data-testid="prev-day-btn">
            <Ionicons name="chevron-back" size={22} color="#1a237e" />
          </TouchableOpacity>
        </View>

        {!isToday && (
          <TouchableOpacity style={s.todayBtn} onPress={() => setSelectedDate(getToday())} data-testid="go-today-btn">
            <Ionicons name="today-outline" size={14} color="#1565c0" />
            <Text style={s.todayBtnText}>العودة لليوم</Text>
          </TouchableOpacity>
        )}

        <View style={s.countBadgeRow}>
          <View style={s.countBadge}>
            <Text style={s.countBadgeNum}>{lectures.length}</Text>
            <Text style={s.countBadgeLabel}>محاضرة</Text>
          </View>
        </View>

        {loading ? (
          <LoadingScreen />
        ) : (
          <FlatList
            data={lectures}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, paddingTop: 0 }}
            renderItem={({ item }) => {
              const st = STATUS_CONFIG[item.status] || STATUS_CONFIG.scheduled;
              return (
                <TouchableOpacity
                  style={s.teacherCard}
                  onPress={() => router.push({ pathname: '/take-attendance', params: { lectureId: item.id, courseId: item.course_id } })}
                  data-testid={`teacher-lecture-${item.id}`}
                >
                  <View style={[s.teacherCardAccent, { backgroundColor: st.color }]} />
                  <View style={s.teacherCardTime}>
                    <Text style={s.teacherCardTimeStart}>{item.start_time}</Text>
                    <Ionicons name="arrow-down" size={14} color="#bbb" />
                    <Text style={s.teacherCardTimeEnd}>{item.end_time}</Text>
                  </View>
                  <View style={s.teacherCardBody}>
                    <Text style={s.teacherCardCourse}>{item.course_name}</Text>
                    {item.room && (
                      <View style={s.teacherCardDetail}>
                        <Ionicons name="location-outline" size={13} color="#888" />
                        <Text style={s.teacherCardDetailText}>{item.room}</Text>
                      </View>
                    )}
                    <View style={[s.teacherCardStatus, { backgroundColor: st.bg }]}>
                      <Ionicons name={st.icon as any} size={12} color={st.color} />
                      <Text style={[s.teacherCardStatusText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                  <View style={s.teacherCardRight}>
                    <Text style={s.teacherCardAttCount}>{item.attendance_count || 0}/{item.total_enrolled || 0}</Text>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={s.emptyState}>
                <Ionicons name="sunny-outline" size={64} color="#ddd" />
                <Text style={s.emptyTitle}>لا توجد محاضرات</Text>
                <Text style={s.emptySubtitle}>لا توجد محاضرات في {formatDateArabic(selectedDate)}</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    );
  }

  // ===== Admin/Manager View =====
  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>الجدول اليومي</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Semester Strip */}
      {semesterSettings?.semester_start_date && semesterSettings?.semester_end_date && (
        <View style={s.semesterStrip}>
          <Ionicons name="school-outline" size={16} color="#1565c0" />
          <Text style={s.semesterStripText}>
            {semesterSettings.current_semester} ({semesterSettings.semester_start_date} - {semesterSettings.semester_end_date})
          </Text>
        </View>
      )}

      {/* Date Navigation */}
      <View style={s.dateNav} data-testid="date-navigation">
        <TouchableOpacity onPress={() => setSelectedDate(shiftDate(selectedDate, 1))} style={s.dateNavArrow} data-testid="next-day-btn">
          <Ionicons name="chevron-forward" size={24} color="#1a237e" />
        </TouchableOpacity>

        <View style={s.dateNavCenter}>
          <Text style={s.dateNavDay}>{DAYS_AR[new Date(selectedDate + 'T00:00:00').getDay()]}</Text>
          <Text style={s.dateNavDate}>{formatDateArabic(selectedDate)}</Text>
          {Platform.OS === 'web' && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e: any) => setSelectedDate(e.target.value)}
              style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
              data-testid="date-picker-input"
            />
          )}
        </View>

        <TouchableOpacity onPress={() => setSelectedDate(shiftDate(selectedDate, -1))} style={s.dateNavArrow} data-testid="prev-day-btn">
          <Ionicons name="chevron-back" size={24} color="#1a237e" />
        </TouchableOpacity>
      </View>

      {/* Today button + summary */}
      <View style={s.summaryRow}>
        {!isToday && (
          <TouchableOpacity style={s.todayBtn} onPress={() => setSelectedDate(getToday())} data-testid="go-today-btn">
            <Ionicons name="today-outline" size={14} color="#1565c0" />
            <Text style={s.todayBtnText}>اليوم</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        <Text style={s.summaryText} data-testid="lecture-count">
          {loading ? '...' : `${lectures.length} محاضرة`}
        </Text>
      </View>

      {/* Lectures List */}
      {loading ? (
        <LoadingScreen />
      ) : (
        <FlatList
          data={lectures}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={renderLectureCard}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Ionicons name="calendar-outline" size={56} color="#ddd" />
              <Text style={s.emptyTitle}>لا توجد محاضرات</Text>
              <Text style={s.emptySubtitle}>
                لا توجد محاضرات مجدولة في {formatDateArabic(selectedDate)}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fb' },
  header: {
    backgroundColor: '#1a237e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  // Semester Strip
  semesterStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8eaf6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  semesterStripText: { fontSize: 12, color: '#1a237e', fontWeight: '500' },

  // Date Navigation
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  dateNavArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e8eaf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateNavCenter: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  dateNavDay: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a237e',
    marginBottom: 2,
  },
  dateNavDate: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },

  // Summary Row
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  todayBtnText: { fontSize: 12, color: '#1565c0', fontWeight: '600' },
  summaryText: { fontSize: 13, color: '#666', fontWeight: '500' },

  // Count Badge (Teacher view)
  countBadgeRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e8eaf6',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  countBadgeNum: { fontSize: 18, fontWeight: '800', color: '#1a237e' },
  countBadgeLabel: { fontSize: 12, color: '#5c6bc0' },

  // Lecture Row (Timeline)
  lectureRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  timeline: {
    width: 28,
    alignItems: 'center',
    paddingTop: 18,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    zIndex: 1,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#e0e0e0',
    marginTop: 4,
  },

  // Card
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 10,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardBorder: { width: 4 },
  cardContent: { flex: 1, padding: 14 },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTimeBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardTime: { fontSize: 13, fontWeight: '700' },
  cardStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  cardStatusText: { fontSize: 11, fontWeight: '600' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#222', marginBottom: 8 },
  cardDetailsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 },
  cardDetail: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardDetailText: { fontSize: 12, color: '#888' },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f8f9fb',
  },
  cardActionText: { fontSize: 12, fontWeight: '600' },

  // Teacher View
  teacherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  teacherCardAccent: { width: 4, alignSelf: 'stretch' },
  teacherCardTime: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 2,
  },
  teacherCardTimeStart: { fontSize: 14, fontWeight: '700', color: '#1a237e' },
  teacherCardTimeEnd: { fontSize: 12, color: '#888' },
  teacherCardBody: { flex: 1, paddingVertical: 12, paddingRight: 8 },
  teacherCardCourse: { fontSize: 15, fontWeight: '700', color: '#222', marginBottom: 4 },
  teacherCardDetail: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 6 },
  teacherCardDetailText: { fontSize: 12, color: '#888' },
  teacherCardStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  teacherCardStatusText: { fontSize: 11, fontWeight: '600' },
  teacherCardRight: { alignItems: 'center', paddingHorizontal: 12, gap: 4 },
  teacherCardAttCount: { fontSize: 13, fontWeight: '600', color: '#1a237e' },

  // Empty State
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#888', marginTop: 16 },
  emptySubtitle: { fontSize: 13, color: '#aaa', marginTop: 6, textAlign: 'center' },
});
