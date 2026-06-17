import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, FlatList,
  Platform, ScrollView, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { settingsAPI, lecturesAPI } from '../src/services/api';
import { useAuthStore } from '../src/store/authStore';
import { LoadingScreen } from '../src/components/LoadingScreen';
import api from '../src/services/api';

const DAYS_AR: Record<number, string> = {
  0: 'الأحد', 1: 'الإثنين', 2: 'الثلاثاء', 3: 'الأربعاء',
  4: 'الخميس', 5: 'الجمعة', 6: 'السبت',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
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
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const isTeacher = user?.role === 'teacher';

  const handleDeleteLecture = async (lectureId: string) => {
    if (Platform.OS === 'web') {
      if (!window.confirm('هل أنت متأكد من حذف هذه المحاضرة؟')) return;
      try { await lecturesAPI.delete(lectureId); fetchLectures(selectedDate); } catch { window.alert('فشل في حذف المحاضرة'); }
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
      try { await lecturesAPI.updateStatus(lectureId, 'cancelled'); fetchLectures(selectedDate); } catch { window.alert('فشل في الإلغاء'); }
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

  const statsCounts = useMemo(() => {
    const counts = { total: lectures.length, completed: 0, scheduled: 0, cancelled: 0, absent: 0 };
    lectures.forEach((l) => {
      if (l.status === 'completed') counts.completed++;
      else if (l.status === 'scheduled') counts.scheduled++;
      else if (l.status === 'cancelled') counts.cancelled++;
      else if (l.status === 'absent') counts.absent++;
    });
    return counts;
  }, [lectures]);

  const renderLectureCard = ({ item, index }: { item: any; index: number }) => {
    const st = STATUS_CONFIG[item.status] || STATUS_CONFIG.scheduled;
    const courseColor = getCourseColor(item.course_id);
    const canManage = user?.role === 'admin' || user?.permissions?.includes('manage_lectures') || user?.permissions?.includes('edit_lectures');
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
                <Ionicons name={st.icon} size={11} color={st.color} />
                <Text style={[s.cardStatusText, { color: st.color }]}>{st.label}</Text>
              </View>
            </View>
            <Text style={s.cardTitle}>{item.course_name}{item.section ? ` (${item.section})` : ''}</Text>
            <View style={s.cardDetailsRow}>
              {item.teacher_name ? (
                <View style={s.cardDetail}>
                  <Ionicons name="person-outline" size={13} color="#5b6678" />
                  <Text style={s.cardDetailText}>{item.teacher_name}</Text>
                </View>
              ) : null}
              {item.room ? (
                <View style={s.cardDetail}>
                  <Ionicons name="location-outline" size={13} color="#5b6678" />
                  <Text style={s.cardDetailText}>{item.room}</Text>
                </View>
              ) : null}
              {item.course_code ? (
                <View style={s.cardDetail}>
                  <Ionicons name="code-outline" size={13} color="#5b6678" />
                  <Text style={s.cardDetailText}>{item.course_code}</Text>
                </View>
              ) : null}
              {typeof item.attendance_count !== 'undefined' && (
                <View style={s.cardDetail}>
                  <Ionicons name="people-outline" size={13} color="#5b6678" />
                  <Text style={s.cardDetailText}>{item.attendance_count || 0}/{item.total_enrolled || 0}</Text>
                </View>
              )}
            </View>
            {canManage && (
              <View style={s.cardActions}>
                <TouchableOpacity
                  style={[s.cardActionBtn, { backgroundColor: '#e3f2fd' }]}
                  onPress={() => router.push({ pathname: '/take-attendance', params: { lectureId: item.id, courseId: item.course_id, courseName: item.course_name } })}
                  data-testid={`view-attendance-${item.id}`}
                >
                  <Ionicons name="eye-outline" size={14} color="#1565c0" />
                  <Text style={[s.cardActionText, { color: '#1565c0' }]}>عرض الحضور</Text>
                </TouchableOpacity>
                {item.status !== 'cancelled' && (
                  <TouchableOpacity
                    style={[s.cardActionBtn, { backgroundColor: '#fff3e0' }]}
                    onPress={() => handleCancelLecture(item.id)}
                    data-testid={`cancel-lecture-${item.id}`}
                  >
                    <Ionicons name="close-circle-outline" size={14} color="#e65100" />
                    <Text style={[s.cardActionText, { color: '#e65100' }]}>إلغاء</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[s.cardActionBtn, { backgroundColor: '#ffebee' }]}
                  onPress={() => handleDeleteLecture(item.id)}
                  data-testid={`delete-lecture-${item.id}`}
                >
                  <Ionicons name="trash-outline" size={14} color="#c62828" />
                  <Text style={[s.cardActionText, { color: '#c62828' }]}>حذف</Text>
                </TouchableOpacity>
              </View>
            )}
            {isTeacher && (
              <TouchableOpacity
                style={[s.cardActions, s.takeAttendanceBtn]}
                onPress={() => router.push({ pathname: '/take-attendance', params: { lectureId: item.id, courseId: item.course_id } })}
                data-testid={`teacher-lecture-${item.id}`}
              >
                <Ionicons name="clipboard-outline" size={15} color="#fff" />
                <Text style={s.takeAttendanceBtnText}>تسجيل الحضور</Text>
                <Ionicons name="chevron-back" size={15} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.pageScroll, { flexGrow: 1 }]} showsVerticalScrollIndicator={true}>

          {/* Page header */}
          <View style={s.pageHeader}>
            <View style={s.pageHeaderRight}>
              <Text style={s.pageTitle}>{isTeacher ? 'جدول المحاضرات' : 'الجدول اليومي'}</Text>
              <View style={s.breadcrumb}>
                <TouchableOpacity onPress={() => router.replace('/')}>
                  <Text style={s.breadcrumbLink}>الرئيسية</Text>
                </TouchableOpacity>
                <Ionicons name="chevron-back" size={12} color="#8a95a8" />
                <Text style={s.breadcrumbCurrent}>الجدول</Text>
              </View>
            </View>
            <View style={s.pageHeaderActions}>
              {!isToday && (
                <TouchableOpacity style={[s.headerBtn, s.btnGhost]} onPress={() => setSelectedDate(getToday())} data-testid="go-today-btn">
                  <Ionicons name="today-outline" size={15} color="#1565c0" />
                  <Text style={s.btnGhostText}>اليوم</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.headerBtn, s.btnGhost]} onPress={() => fetchLectures(selectedDate)}>
                <Ionicons name="refresh" size={15} color="#1a2540" />
                <Text style={s.btnGhostText}>تحديث</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Stats grid */}
          <View style={s.statsGrid}>
            <View style={s.statCard}>
              <View style={[s.statIconWrap, { backgroundColor: '#1a237e' }]}><Ionicons name="calendar" size={22} color="#fff" /></View>
              <View style={s.statTextCol}>
                <Text style={s.statLabel}>إجمالي المحاضرات</Text>
                <Text style={s.statValue}>{statsCounts.total}</Text>
                <Text style={s.statSubLabel}>محاضرة</Text>
              </View>
            </View>
            <View style={s.statCard}>
              <View style={[s.statIconWrap, { backgroundColor: '#2e7d32' }]}><Ionicons name="checkmark-circle" size={22} color="#fff" /></View>
              <View style={s.statTextCol}>
                <Text style={s.statLabel}>منعقدة</Text>
                <Text style={s.statValue}>{statsCounts.completed}</Text>
                <Text style={s.statSubLabel}>محاضرة مكتملة</Text>
              </View>
            </View>
            <View style={s.statCard}>
              <View style={[s.statIconWrap, { backgroundColor: '#1565c0' }]}><Ionicons name="time" size={22} color="#fff" /></View>
              <View style={s.statTextCol}>
                <Text style={s.statLabel}>مجدولة</Text>
                <Text style={s.statValue}>{statsCounts.scheduled}</Text>
                <Text style={s.statSubLabel}>قيد الانتظار</Text>
              </View>
            </View>
            <View style={s.statCard}>
              <View style={[s.statIconWrap, { backgroundColor: '#c62828' }]}><Ionicons name="close-circle" size={22} color="#fff" /></View>
              <View style={s.statTextCol}>
                <Text style={s.statLabel}>ملغاة/غياب</Text>
                <Text style={s.statValue}>{statsCounts.cancelled + statsCounts.absent}</Text>
                <Text style={s.statSubLabel}>محاضرة</Text>
              </View>
            </View>
          </View>

          {/* Date picker card */}
          <View style={s.dateCard}>
            <View style={s.dateCardHeader}>
              <Text style={s.dateCardTitle}>اختر اليوم</Text>
              {semesterSettings?.current_semester && (
                <View style={s.semesterChip}>
                  <Ionicons name="school" size={12} color="#1565c0" />
                  <Text style={s.semesterChipText}>{semesterSettings.current_semester}</Text>
                </View>
              )}
            </View>
            <View style={s.dateNav} data-testid="date-navigation">
              <TouchableOpacity onPress={() => setSelectedDate(shiftDate(selectedDate, 1))} style={s.dateNavArrow} data-testid="next-day-btn">
                <Ionicons name="chevron-forward" size={20} color="#1a237e" />
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
                <Ionicons name="chevron-back" size={20} color="#1a237e" />
              </TouchableOpacity>
            </View>
            {semesterSettings?.semester_start_date && semesterSettings?.semester_end_date && (
              <View style={s.semesterStrip}>
                <Ionicons name="information-circle" size={13} color="#1565c0" />
                <Text style={s.semesterStripText}>
                  الفصل النشط: {semesterSettings.semester_start_date} ← {semesterSettings.semester_end_date}
                </Text>
              </View>
            )}
          </View>

          {/* Lectures list */}
          <View style={s.listCard}>
            <View style={s.listCardHeader}>
              <Text style={s.listCardTitle}>محاضرات {DAYS_AR[new Date(selectedDate + 'T00:00:00').getDay()]}</Text>
              <Text style={s.listCardCount} data-testid="lecture-count">
                {loading ? '...' : <>عرض <Text style={s.listCardCountAccent}>{lectures.length}</Text> محاضرة</>}
              </Text>
            </View>

            {loading ? (
              <View style={s.center}><LoadingScreen /></View>
            ) : lectures.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="calendar-outline" size={56} color="#cfd6e1" />
                <Text style={s.emptyTitle}>لا توجد محاضرات</Text>
                <Text style={s.emptySubtitle}>لا توجد محاضرات مجدولة في {formatDateArabic(selectedDate)}</Text>
              </View>
            ) : (
              <FlatList
                data={lectures}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: 14 }}
                renderItem={renderLectureCard}
                scrollEnabled={false}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6fb' },
  pageScroll: { padding: 20, paddingBottom: 60, maxWidth: 1440, width: '100%', alignSelf: 'center' },
  center: { padding: 40, alignItems: 'center' },

  // page header
  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 },
  pageHeaderRight: { alignItems: 'flex-end' },
  pageTitle: { fontSize: 26, fontWeight: '700', color: '#1a2540', textAlign: 'right', marginBottom: 6 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breadcrumbLink: { fontSize: 13, color: '#2962ff', fontWeight: '500' },
  breadcrumbCurrent: { fontSize: 13, color: '#8a95a8', fontWeight: '500' },
  pageHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8 },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee' },
  btnGhostText: { color: '#1a2540', fontSize: 13, fontWeight: '600' },

  // Stats grid
  statsGrid: { flexDirection: 'row', gap: 14, marginBottom: 18, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 200, backgroundColor: '#fff', borderRadius: 14, padding: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#eef1f6' },
  statIconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  statTextCol: { flex: 1, alignItems: 'flex-end' },
  statLabel: { fontSize: 13, color: '#8a95a8', fontWeight: '500', marginBottom: 4 },
  statValue: { fontSize: 22, color: '#1a2540', fontWeight: '700', marginBottom: 2 },
  statSubLabel: { fontSize: 11, color: '#a8b1c2' },

  // Date card
  dateCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: '#eef1f6' },
  dateCardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  dateCardTitle: { fontSize: 14, fontWeight: '700', color: '#1a2540' },
  semesterChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: '#e3f2fd' },
  semesterChipText: { fontSize: 11, color: '#1565c0', fontWeight: '700' },
  dateNav: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#f7f9fc', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#eef1f6' },
  dateNavArrow: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e3e7ee' },
  dateNavCenter: { flex: 1, alignItems: 'center', position: 'relative' },
  dateNavDay: { fontSize: 17, fontWeight: '800', color: '#1a237e', marginBottom: 2 },
  dateNavDate: { fontSize: 12, color: '#5b6678', fontWeight: '500' },
  semesterStrip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#e3f2fd', padding: 8, borderRadius: 8, marginTop: 10 },
  semesterStripText: { fontSize: 11, color: '#1565c0', fontWeight: '600' },

  // List card
  listCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eef1f6' },
  listCardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef1f6' },
  listCardTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540' },
  listCardCount: { fontSize: 12, color: '#5b6678' },
  listCardCountAccent: { color: '#1565c0', fontWeight: '700' },

  // Lecture row (timeline)
  lectureRow: { flexDirection: 'row-reverse', marginBottom: 8 },
  timeline: { width: 28, alignItems: 'center', paddingTop: 18 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, zIndex: 1, borderWidth: 2, borderColor: '#fff' },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#eef1f6', marginTop: 4 },

  card: { flex: 1, backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row-reverse', overflow: 'hidden', borderWidth: 1, borderColor: '#eef1f6' },
  cardBorder: { width: 4 },
  cardContent: { flex: 1, padding: 14 },
  cardTopRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTimeBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  cardTime: { fontSize: 13, fontWeight: '700' },
  cardStatusBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  cardStatusText: { fontSize: 11, fontWeight: '700' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540', marginBottom: 8, textAlign: 'right' },
  cardDetailsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14, marginBottom: 4 },
  cardDetail: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  cardDetailText: { fontSize: 12, color: '#5b6678' },
  cardActions: { flexDirection: 'row-reverse', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f5f9', flexWrap: 'wrap' },
  cardActionBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  cardActionText: { fontSize: 12, fontWeight: '700' },
  takeAttendanceBtn: { backgroundColor: '#1a237e', padding: 10, borderRadius: 8, justifyContent: 'center', borderTopWidth: 0, marginTop: 10 },
  takeAttendanceBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', flex: 1, textAlign: 'center' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 50, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#5b6678', marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: '#8a95a8', marginTop: 4, textAlign: 'center' },
});
