import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { coursesAPI, departmentsAPI, settingsAPI, lecturesAPI } from '../src/services/api';
import { useAuthStore } from '../src/store/authStore';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { Course, Department } from '../src/types';
import api from '../src/services/api';

const DAYS = [
  { id: 'saturday', name: 'السبت', short: 'س', num: 6 },
  { id: 'sunday', name: 'الأحد', short: 'ح', num: 0 },
  { id: 'monday', name: 'الإثنين', short: 'ن', num: 1 },
  { id: 'tuesday', name: 'الثلاثاء', short: 'ث', num: 2 },
  { id: 'wednesday', name: 'الأربعاء', short: 'ر', num: 3 },
  { id: 'thursday', name: 'الخميس', short: 'خ', num: 4 },
  { id: 'friday', name: 'الجمعة', short: 'ج', num: 5 },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  scheduled: { label: 'مجدولة', color: '#1565c0', bg: '#e3f2fd', icon: 'time-outline' },
  completed: { label: 'منعقدة', color: '#2e7d32', bg: '#e8f5e9', icon: 'checkmark-circle' },
  absent: { label: 'غائب', color: '#e65100', bg: '#fff3e0', icon: 'alert-circle' },
  cancelled: { label: 'ملغاة', color: '#c62828', bg: '#ffebee', icon: 'close-circle' },
};

const ACCENT_COLORS = ['#1565c0', '#00897b', '#6a1b9a', '#ef6c00', '#c62828', '#2e7d32', '#ad1457'];

export default function ScheduleScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [lectures, setLectures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(() => {
    const todayNum = new Date().getDay();
    const todayDay = DAYS.find(d => d.num === todayNum);
    return todayDay?.id || 'saturday';
  });
  const [semesterSettings, setSemesterSettings] = useState<any>(null);
  const [todayLectures, setTodayLectures] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [coursesRes, deptsRes, settingsRes] = await Promise.all([
        coursesAPI.getAll(),
        departmentsAPI.getAll(),
        settingsAPI.get(),
      ]);
      setCourses(coursesRes.data);
      setDepartments(deptsRes.data);
      
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
        } catch (e) {}
      }
      
      setSemesterSettings({ semester_start_date: semStart, semester_end_date: semEnd, current_semester: semName });
      
      try {
        const todayRes = await lecturesAPI.getToday();
        setTodayLectures(todayRes.data || []);
      } catch (e) {}
      
      const allLectures: any[] = [];
      for (const course of coursesRes.data) {
        try {
          const lectRes = await lecturesAPI.getByCourse(course.id);
          allLectures.push(...lectRes.data.map((l: any) => ({ ...l, course })));
        } catch (e) {}
      }
      setLectures(allLectures);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getCourseName = (courseId: string) => courses.find(c => c.id === courseId)?.name || 'غير محدد';
  const getCourseColor = (courseId: string) => {
    const idx = courses.findIndex(c => c.id === courseId);
    return ACCENT_COLORS[idx % ACCENT_COLORS.length];
  };

  const getDayLectures = () => {
    const day = DAYS.find(d => d.id === selectedDay);
    if (!day) return [];
    return lectures
      .filter(l => { const d = new Date(l.date); return d.getDay() === day.num; })
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  };

  const getDayLectureCount = (dayId: string) => {
    const day = DAYS.find(d => d.id === dayId);
    if (!day) return 0;
    return lectures.filter(l => new Date(l.date).getDay() === day.num).length;
  };

  const handleDeleteLecture = async (lectureId: string) => {
    if (Platform.OS === 'web') {
      if (!window.confirm('هل أنت متأكد من حذف هذه المحاضرة؟')) return;
      try { await lecturesAPI.delete(lectureId); fetchData(); } catch { alert('فشل في حذف المحاضرة'); }
    } else {
      Alert.alert('حذف المحاضرة', 'هل أنت متأكد؟', [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: async () => {
          try { await lecturesAPI.delete(lectureId); fetchData(); } catch { Alert.alert('خطأ', 'فشل في الحذف'); }
        }},
      ]);
    }
  };

  const handleCancelLecture = async (lectureId: string) => {
    if (Platform.OS === 'web') {
      if (!window.confirm('هل أنت متأكد من إلغاء هذه المحاضرة؟')) return;
      try { await lecturesAPI.updateStatus(lectureId, 'cancelled'); fetchData(); } catch { alert('فشل في الإلغاء'); }
    } else {
      Alert.alert('إلغاء المحاضرة', 'هل أنت متأكد؟', [
        { text: 'تراجع', style: 'cancel' },
        { text: 'إلغاء المحاضرة', style: 'destructive', onPress: async () => {
          try { await lecturesAPI.updateStatus(lectureId, 'cancelled'); fetchData(); } catch { Alert.alert('خطأ', 'فشل'); }
        }},
      ]);
    }
  };

  if (loading) return <LoadingScreen />;

  const dayLectures = getDayLectures();
  const todayNum = new Date().getDay();

  // ===== واجهة المعلم: محاضرات اليوم =====
  if (user?.role === 'teacher') {
    const todayDate = new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>محاضرات اليوم</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.teacherDateCard}>
          <View style={s.teacherDateIcon}><Ionicons name="today" size={22} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.teacherDateLabel}>اليوم</Text>
            <Text style={s.teacherDateValue}>{todayDate}</Text>
          </View>
          <View style={s.teacherCountBadge}>
            <Text style={s.teacherCountText}>{todayLectures.length}</Text>
            <Text style={s.teacherCountLabel}>محاضرة</Text>
          </View>
        </View>
        <FlatList
          data={todayLectures}
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
                  <Text style={s.teacherCardAttCount}>{item.attendance_count}/{item.total_enrolled}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Ionicons name="sunny-outline" size={64} color="#ddd" />
              <Text style={s.emptyTitle}>لا توجد محاضرات اليوم</Text>
              <Text style={s.emptySubtitle}>استمتع بيومك!</Text>
            </View>
          }
        />
      </SafeAreaView>
    );
  }

  // ===== واجهة المدير: الجدول الأسبوعي =====
  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>الجدول الأسبوعي</Text>
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

      {/* Week Day Selector */}
      <View style={s.weekStrip}>
        {DAYS.map(day => {
          const count = getDayLectureCount(day.id);
          const isSelected = selectedDay === day.id;
          const isToday = day.num === todayNum;
          return (
            <TouchableOpacity
              key={day.id}
              style={[
                s.weekDay,
                isSelected && s.weekDaySelected,
                isToday && !isSelected && s.weekDayToday,
              ]}
              onPress={() => setSelectedDay(day.id)}
              data-testid={`day-tab-${day.id}`}
            >
              <Text style={[s.weekDayShort, isSelected && s.weekDayShortSelected]}>
                {day.short}
              </Text>
              <Text style={[s.weekDayName, isSelected && s.weekDayNameSelected]}>
                {day.name}
              </Text>
              {count > 0 && (
                <View style={[s.weekDayBadge, isSelected && s.weekDayBadgeSelected]}>
                  <Text style={[s.weekDayBadgeText, isSelected && s.weekDayBadgeTextSelected]}>
                    {count}
                  </Text>
                </View>
              )}
              {isToday && <View style={[s.todayDot, isSelected && s.todayDotSelected]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Summary Bar */}
      <View style={s.summaryBar}>
        <Text style={s.summaryText}>
          {DAYS.find(d => d.id === selectedDay)?.name} - {dayLectures.length} محاضرة
        </Text>
      </View>

      {/* Lectures List */}
      <FlatList
        data={dayLectures}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        renderItem={({ item, index }) => {
          const st = STATUS_CONFIG[item.status] || STATUS_CONFIG.scheduled;
          const courseColor = getCourseColor(item.course_id);
          const course = item.course;
          return (
            <View style={s.lectureRow} data-testid={`lecture-card-${item.id}`}>
              {/* Timeline */}
              <View style={s.timeline}>
                <View style={[s.timelineDot, { backgroundColor: courseColor }]} />
                {index < dayLectures.length - 1 && <View style={s.timelineLine} />}
              </View>

              {/* Card */}
              <View style={s.card}>
                <View style={[s.cardBorder, { backgroundColor: courseColor }]} />
                <View style={s.cardContent}>
                  {/* Time + Status Row */}
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

                  {/* Course Name */}
                  <Text style={s.cardTitle}>{course?.name || getCourseName(item.course_id)}</Text>

                  {/* Details Row */}
                  <View style={s.cardDetailsRow}>
                    {item.room ? (
                      <View style={s.cardDetail}>
                        <Ionicons name="location-outline" size={13} color="#888" />
                        <Text style={s.cardDetailText}>{item.room}</Text>
                      </View>
                    ) : null}
                    {course?.level ? (
                      <View style={s.cardDetail}>
                        <Ionicons name="school-outline" size={13} color="#888" />
                        <Text style={s.cardDetailText}>م{course.level}</Text>
                      </View>
                    ) : null}
                    <View style={s.cardDetail}>
                      <Ionicons name="calendar-outline" size={13} color="#888" />
                      <Text style={s.cardDetailText}>{item.date}</Text>
                    </View>
                  </View>

                  {/* Action Buttons */}
                  {user?.role === 'admin' && (
                    <View style={s.cardActions}>
                      <TouchableOpacity
                        style={s.cardActionBtn}
                        onPress={() => router.push({ pathname: '/take-attendance', params: { lectureId: item.id, courseId: item.course_id, courseName: course?.name } })}
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
        }}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Ionicons name="calendar-outline" size={56} color="#ddd" />
            <Text style={s.emptyTitle}>لا توجد محاضرات</Text>
            <Text style={s.emptySubtitle}>
              لا توجد محاضرات مجدولة ليوم {DAYS.find(d => d.id === selectedDay)?.name}
            </Text>
          </View>
        }
      />
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

  // Week Strip
  weekStrip: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  weekDay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    marginHorizontal: 2,
    position: 'relative',
  },
  weekDaySelected: {
    backgroundColor: '#1a237e',
  },
  weekDayToday: {
    backgroundColor: '#e8eaf6',
  },
  weekDayShort: { fontSize: 11, color: '#999', fontWeight: '600', marginBottom: 2 },
  weekDayShortSelected: { color: 'rgba(255,255,255,0.7)' },
  weekDayName: { fontSize: 11, color: '#555', fontWeight: '500' },
  weekDayNameSelected: { color: '#fff', fontWeight: '700' },
  weekDayBadge: {
    backgroundColor: '#e8eaf6',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginTop: 4,
    minWidth: 18,
    alignItems: 'center',
  },
  weekDayBadgeSelected: { backgroundColor: 'rgba(255,255,255,0.25)' },
  weekDayBadgeText: { fontSize: 10, color: '#1a237e', fontWeight: '700' },
  weekDayBadgeTextSelected: { color: '#fff' },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#1a237e',
    position: 'absolute',
    bottom: 4,
  },
  todayDotSelected: { backgroundColor: '#fff' },

  // Summary Bar
  summaryBar: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#f8f9fb',
  },
  summaryText: { fontSize: 13, color: '#666', fontWeight: '500' },

  // Lecture Row (Timeline style)
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
  teacherDateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  teacherDateIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1a237e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  teacherDateLabel: { fontSize: 12, color: '#888' },
  teacherDateValue: { fontSize: 15, fontWeight: '600', color: '#222', marginTop: 2 },
  teacherCountBadge: { alignItems: 'center', backgroundColor: '#e8eaf6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  teacherCountText: { fontSize: 20, fontWeight: '800', color: '#1a237e' },
  teacherCountLabel: { fontSize: 10, color: '#5c6bc0' },

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
