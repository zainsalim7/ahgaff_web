import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Platform,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { coursesAPI, departmentsAPI, lecturesAPI, facultiesAPI } from '../../src/services/api';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { Course, Department } from '../../src/types';
import { useAuth, PERMISSIONS } from '../../src/contexts/AuthContext';

interface Faculty {
  id: string;
  name: string;
}

interface TodayLecture {
  id: string;
  course_id: string;
  course_name: string;
  course_code: string;
  date: string;
  start_time: string;
  end_time: string;
  room: string;
  status: string;
  attendance_count: number;
  total_enrolled: number;
}

export default function CoursesScreen() {
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [todayLectures, setTodayLectures] = useState<TodayLecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // الفلاتر
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // تهيئة الفلاتر حسب صلاحيات المستخدم
  useEffect(() => {
    if (user) {
      if (user.faculty_id) setSelectedFacultyId(user.faculty_id);
      if (user.department_id) setSelectedDepartmentId(user.department_id);
    }
  }, [user]);

  const fetchData = useCallback(async () => {
    try {
      try {
        const todayRes = await lecturesAPI.getToday();
        setTodayLectures(todayRes.data || []);
      } catch (e) {}

      const [coursesRes, deptsRes, facRes] = await Promise.all([
        coursesAPI.getAll(),
        departmentsAPI.getAll(),
        facultiesAPI.getAll(),
      ]);
      setCourses(coursesRes.data);
      setDepartments(deptsRes.data);
      setFaculties(facRes.data || []);
    } catch (error) {
      console.error('Error fetching courses:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // الأقسام المفلترة حسب الكلية المختارة
  const filteredDepartments = useMemo(() => {
    if (!selectedFacultyId) return departments;
    return departments.filter(d => (d as any).faculty_id === selectedFacultyId);
  }, [departments, selectedFacultyId]);

  // المقررات المفلترة
  const filteredCourses = useMemo(() => {
    let result = courses;
    if (selectedDepartmentId) {
      result = result.filter(c => c.department_id === selectedDepartmentId);
    } else if (selectedFacultyId) {
      const deptIds = filteredDepartments.map(d => d.id);
      result = result.filter(c => deptIds.includes(c.department_id));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.code || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [courses, selectedFacultyId, selectedDepartmentId, searchQuery, filteredDepartments]);

  const getDepartmentName = (deptId: string) => {
    const dept = departments.find(d => d.id === deptId);
    return dept?.name || '';
  };

  const formatTime = (time: string) => time || '';

  const getLectureStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#4caf50';
      case 'cancelled': return '#f44336';
      default: return '#ff9800';
    }
  };

  const getLectureStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'منعقدة';
      case 'cancelled': return 'ملغاة';
      default: return 'مجدولة';
    }
  };

  // هل المستخدم مقيّد بكلية/قسم
  const isUserLocked = user?.faculty_id || user?.department_id;

  const renderTodayLecture = ({ item }: { item: TodayLecture }) => (
    <TouchableOpacity
      style={styles.todayLectureCard}
      onPress={() => router.push({
        pathname: '/take-attendance',
        params: { lectureId: item.id, courseId: item.course_id }
      })}
      data-testid={`today-lecture-${item.id}`}
    >
      <View style={styles.lectureTimeBox}>
        <Text style={styles.lectureTime}>{formatTime(item.start_time)}</Text>
        <Text style={styles.lectureTimeSeparator}>-</Text>
        <Text style={styles.lectureTime}>{formatTime(item.end_time)}</Text>
      </View>
      <View style={styles.lectureDetails}>
        <Text style={styles.lectureCourseName} numberOfLines={1}>{item.course_name}</Text>
        <Text style={styles.lectureCourseCode}>{item.course_code}</Text>
        {item.room ? (
          <View style={styles.lectureRoom}>
            <Ionicons name="location-outline" size={12} color="#666" />
            <Text style={styles.lectureRoomText}>{item.room}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.lectureStatus}>
        <View style={[styles.statusBadge, { backgroundColor: getLectureStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getLectureStatusColor(item.status) }]}>
            {getLectureStatusText(item.status)}
          </Text>
        </View>
        <View style={styles.attendanceInfo}>
          <Ionicons name="people" size={14} color="#666" />
          <Text style={styles.attendanceText}>{item.attendance_count}/{item.total_enrolled}</Text>
        </View>
      </View>
      <Ionicons name="chevron-back" size={20} color="#ccc" />
    </TouchableOpacity>
  );

  const renderCourse = ({ item }: { item: Course }) => {
    const canRecordAttendance = hasPermission(PERMISSIONS.RECORD_ATTENDANCE) || hasPermission(PERMISSIONS.TAKE_ATTENDANCE);
    const canViewReports = hasPermission(PERMISSIONS.VIEW_REPORTS) || hasPermission(PERMISSIONS.VIEW_STATISTICS);
    const canViewAttendance = hasPermission(PERMISSIONS.VIEW_ATTENDANCE);

    return (
      <TouchableOpacity
        style={styles.courseCard}
        onPress={() => router.push({
          pathname: '/course-lectures',
          params: { courseId: item.id, courseName: item.name }
        })}
        data-testid={`course-card-${item.id}`}
      >
        <View style={styles.courseIcon}>
          <Ionicons name="book" size={24} color="#1565c0" />
        </View>
        <View style={styles.courseInfo}>
          <Text style={styles.courseName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.courseCode}>{item.code}{item.section ? ` | ${item.section}` : ''}</Text>
          <Text style={styles.metaText} numberOfLines={1}>
            {getDepartmentName(item.department_id)} | م{item.level}
          </Text>
          <View style={styles.countsRow}>
            <Ionicons name="people" size={13} color="#1565c0" />
            <Text style={[styles.countText, { color: '#1565c0' }]}>{(item as any).students_count ?? 0}</Text>
            <Text style={styles.countSeparator}>|</Text>
            <Ionicons name="calendar" size={13} color="#e65100" />
            <Text style={[styles.countText, { color: '#e65100' }]}>{(item as any).lectures_count ?? 0}</Text>
          </View>
        </View>
        <View style={styles.actionButtons}>
          {canViewAttendance && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#fff3e0' }]}
              onPress={(e) => { e.stopPropagation(); router.push({ pathname: '/course-students', params: { courseId: item.id } }); }}
              data-testid={`students-btn-${item.id}`}
            >
              <Ionicons name="people" size={18} color="#ff9800" />
              <Text style={styles.actionLabel}>الطلاب</Text>
            </TouchableOpacity>
          )}
          {canViewReports && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#e8f5e9' }]}
              onPress={(e) => { e.stopPropagation(); router.push({ pathname: '/course-stats', params: { courseId: item.id, courseName: item.name } }); }}
              data-testid={`stats-btn-${item.id}`}
            >
              <Ionicons name="stats-chart" size={18} color="#4caf50" />
              <Text style={styles.actionLabel}>تقارير</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* محاضرات اليوم - للمعلمين فقط */}
        {user?.role === 'teacher' && (
          <View style={styles.todaySection}>
            <View style={styles.todaySectionHeader}>
              <View style={styles.todayIconContainer}>
                <Ionicons name="today" size={24} color="#fff" />
              </View>
              <View>
                <Text style={styles.todaySectionTitle}>محاضرات اليوم</Text>
              </View>
            </View>
            {todayLectures.length === 0 ? (
              <View style={styles.noLecturesToday}>
                <Ionicons name="calendar-outline" size={40} color="#ccc" />
                <Text style={styles.noLecturesText}>لا توجد محاضرات مجدولة لليوم</Text>
              </View>
            ) : (
              <FlatList data={todayLectures} renderItem={renderTodayLecture} keyExtractor={item => item.id} scrollEnabled={false} ItemSeparatorComponent={() => <View style={{ height: 8 }} />} />
            )}
          </View>
        )}

        {/* الفلاتر */}
        <View style={styles.filtersContainer}>
          {/* شريط البحث */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="بحث بالاسم أو الرمز..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              data-testid="courses-search-input"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#999" />
              </TouchableOpacity>
            )}
          </View>

          {/* فلتر الكلية - فقط إذا المستخدم غير مقيّد بكلية */}
          {Platform.OS === 'web' && faculties.length > 0 && (
            <View style={styles.filterRow}>
              <View style={styles.filterItem}>
                <Text style={styles.filterLabel}>الكلية</Text>
                <select
                  value={selectedFacultyId}
                  onChange={(e: any) => {
                    setSelectedFacultyId(e.target.value);
                    setSelectedDepartmentId('');
                  }}
                  disabled={!!user?.faculty_id}
                  data-testid="faculty-filter"
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid #e0e0e0', fontSize: 13, backgroundColor: user?.faculty_id ? '#f0f0f0' : '#fff',
                  }}
                >
                  <option value="">كل الكليات</option>
                  {faculties.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </View>

              <View style={styles.filterItem}>
                <Text style={styles.filterLabel}>القسم</Text>
                <select
                  value={selectedDepartmentId}
                  onChange={(e: any) => setSelectedDepartmentId(e.target.value)}
                  disabled={!!user?.department_id}
                  data-testid="department-filter"
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid #e0e0e0', fontSize: 13, backgroundColor: user?.department_id ? '#f0f0f0' : '#fff',
                  }}
                >
                  <option value="">كل الأقسام</option>
                  {filteredDepartments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </View>
            </View>
          )}

          {/* عدد النتائج */}
          <View style={styles.resultsInfo}>
            <Text style={styles.resultsText}>{filteredCourses.length} مقرر</Text>
            {(selectedFacultyId || selectedDepartmentId || searchQuery) && (
              <TouchableOpacity
                onPress={() => {
                  if (!user?.faculty_id) setSelectedFacultyId('');
                  if (!user?.department_id) setSelectedDepartmentId('');
                  setSearchQuery('');
                }}
                style={styles.clearBtn}
                data-testid="clear-filters-btn"
              >
                <Ionicons name="close-circle" size={14} color="#e65100" />
                <Text style={styles.clearText}>مسح الفلاتر</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* قائمة المقررات */}
        <View style={styles.listContainer}>
          {filteredCourses.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="book-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>لا توجد مقررات</Text>
            </View>
          ) : (
            <FlatList
              data={filteredCourses}
              renderItem={renderCourse}
              keyExtractor={item => item.id}
              scrollEnabled={false}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },

  // الفلاتر
  filtersContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    padding: 10,
    fontSize: 14,
    textAlign: 'right',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  filterItem: {
    flex: 1,
  },
  filterLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontWeight: '600',
  },
  resultsInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  resultsText: {
    fontSize: 13,
    color: '#999',
    fontWeight: '600',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearText: {
    fontSize: 12,
    color: '#e65100',
    fontWeight: '600',
  },

  // القائمة
  listContainer: {
    padding: 12,
    paddingTop: 8,
  },

  // محاضرات اليوم
  todaySection: {
    backgroundColor: '#fff',
    margin: 12,
    marginBottom: 0,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  todaySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  todayIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#1565c0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  todaySectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  noLecturesToday: {
    alignItems: 'center',
    padding: 20,
  },
  noLecturesText: {
    fontSize: 13,
    color: '#999',
    marginTop: 8,
  },
  todayLectureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    gap: 10,
  },
  lectureTimeBox: {
    backgroundColor: '#1565c0',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 60,
  },
  lectureTime: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  lectureTimeSeparator: { color: '#fff', fontSize: 9, opacity: 0.7 },
  lectureDetails: { flex: 1 },
  lectureCourseName: { fontSize: 14, fontWeight: '600', color: '#333' },
  lectureCourseCode: { fontSize: 11, color: '#666', marginTop: 1 },
  lectureRoom: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  lectureRoomText: { fontSize: 11, color: '#666' },
  lectureStatus: { alignItems: 'flex-end', gap: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '600' },
  attendanceInfo: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  attendanceText: { fontSize: 11, color: '#666' },

  // بطاقة المقرر
  courseCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  courseIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  courseInfo: {
    flex: 1,
    marginHorizontal: 10,
  },
  courseName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  courseCode: {
    fontSize: 13,
    color: '#1565c0',
    marginTop: 1,
  },
  metaText: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  countsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
  },
  countSeparator: {
    color: '#ddd',
    fontSize: 12,
    marginHorizontal: 2,
  },
  actionButtons: {
    gap: 6,
  },
  actionBtn: {
    width: 46,
    height: 46,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: 9,
    color: '#666',
    marginTop: 2,
    fontWeight: '600',
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
});
