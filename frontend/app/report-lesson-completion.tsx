import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import api, { departmentsAPI } from '../src/services/api';

interface CourseCompletion {
  course_id: string;
  course_name: string;
  course_code: string;
  teacher_name: string;
  planned_topics: number;
  has_plan: boolean;
  total_lectures: number;
  completed_lectures: number;
  lessons_with_title: number;
  lessons_without_title: number;
  completion_percent: number;
}

export default function LessonCompletionReport() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<CourseCompletion[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planData, setPlanData] = useState<any>(null);
  const [planCourseName, setPlanCourseName] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const params: any = {};
      if (selectedDept) params.department_id = selectedDept;
      const res = await api.get('/reports/lesson-completion', { params });
      setData(res.data);
    } catch (error) {
      console.error('Error fetching lesson completion:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDept]);

  const fetchDepartments = async () => {
    try {
      const res = await departmentsAPI.getAll();
      setDepartments(res.data);
    } catch {}
  };

  useEffect(() => { fetchDepartments(); }, []);
  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const viewPlan = async (courseId: string, courseName: string) => {
    try {
      const res = await api.get(`/courses/${courseId}/study-plan`);
      setPlanData(res.data);
      setPlanCourseName(courseName);
      setShowPlanModal(true);
    } catch {
      setPlanData({ weeks: [] });
      setPlanCourseName(courseName);
      setShowPlanModal(true);
    }
  };

  // Stats
  const totalCourses = data.length;
  const withPlan = data.filter(d => d.has_plan).length;
  const withoutPlan = totalCourses - withPlan;
  const avgCompletion = totalCourses > 0
    ? Math.round(data.reduce((sum, d) => sum + d.completion_percent, 0) / totalCourses)
    : 0;

  const getProgressColor = (percent: number) => {
    if (percent >= 70) return '#4caf50';
    if (percent >= 40) return '#ff9800';
    return '#f44336';
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => goBack(router)} style={styles.backBtn}>
            <Ionicons name="arrow-forward" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>تقرير إنجاز الدروس</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#4caf50" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router)} style={styles.backBtn}>
          <Ionicons name="arrow-forward" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تقرير إنجاز الدروس</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16 }}
      >
        {/* فلتر القسم */}
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 6 }}>تصفية حسب القسم</Text>
          <View style={{ backgroundColor: '#f5f5f5', borderRadius: 8, overflow: 'hidden' }}>
            <Picker selectedValue={selectedDept} onValueChange={setSelectedDept} style={{ height: 45 }}>
              <Picker.Item label="جميع الأقسام" value="" />
              {departments.map(d => (
                <Picker.Item key={d.id} label={d.name} value={d.id} />
              ))}
            </Picker>
          </View>
        </View>

        {/* إحصائيات سريعة */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <View style={[styles.statCard, { backgroundColor: '#e3f2fd' }]}>
            <Text style={[styles.statNum, { color: '#1565c0' }]}>{totalCourses}</Text>
            <Text style={styles.statLabel}>مقرر</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#e8f5e9' }]}>
            <Text style={[styles.statNum, { color: '#4caf50' }]}>{withPlan}</Text>
            <Text style={styles.statLabel}>لديه خطة</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#fff3e0' }]}>
            <Text style={[styles.statNum, { color: '#ff9800' }]}>{withoutPlan}</Text>
            <Text style={styles.statLabel}>بدون خطة</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#f3e5f5' }]}>
            <Text style={[styles.statNum, { color: '#9c27b0' }]}>{avgCompletion}%</Text>
            <Text style={styles.statLabel}>متوسط الإنجاز</Text>
          </View>
        </View>

        {/* قائمة المقررات */}
        {data.map((course) => (
          <View key={course.course_id} style={styles.courseCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.courseName}>{course.course_name}</Text>
                <Text style={styles.courseCode}>{course.course_code} - {course.teacher_name}</Text>
              </View>
              {course.has_plan && (
                <TouchableOpacity
                  style={{ backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                  onPress={() => viewPlan(course.course_id, course.course_name)}
                >
                  <Text style={{ color: '#4caf50', fontSize: 12, fontWeight: '600' }}>عرض الخطة</Text>
                </TouchableOpacity>
              )}
            </View>
            
            {/* شريط التقدم */}
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: '#888' }}>نسبة الإنجاز</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: getProgressColor(course.completion_percent) }}>
                  {course.completion_percent}%
                </Text>
              </View>
              <View style={{ height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                <View style={{
                  height: '100%',
                  width: `${Math.min(course.completion_percent, 100)}%`,
                  backgroundColor: getProgressColor(course.completion_percent),
                  borderRadius: 4,
                }} />
              </View>
            </View>

            {/* تفاصيل */}
            <View style={{ flexDirection: 'row', marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
              <View style={styles.detailBadge}>
                <Ionicons name="list" size={14} color="#1565c0" />
                <Text style={styles.detailText}>مخطط: {course.planned_topics}</Text>
              </View>
              <View style={styles.detailBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#4caf50" />
                <Text style={styles.detailText}>منجز: {course.lessons_with_title}</Text>
              </View>
              <View style={styles.detailBadge}>
                <Ionicons name="school" size={14} color="#ff9800" />
                <Text style={styles.detailText}>محاضرات: {course.completed_lectures}/{course.total_lectures}</Text>
              </View>
              {course.lessons_without_title > 0 && (
                <View style={[styles.detailBadge, { backgroundColor: '#ffebee' }]}>
                  <Ionicons name="alert-circle" size={14} color="#f44336" />
                  <Text style={[styles.detailText, { color: '#f44336' }]}>بدون عنوان: {course.lessons_without_title}</Text>
                </View>
              )}
              {!course.has_plan && (
                <View style={[styles.detailBadge, { backgroundColor: '#fff3e0' }]}>
                  <Ionicons name="warning" size={14} color="#ff9800" />
                  <Text style={[styles.detailText, { color: '#ff9800' }]}>لا يوجد خطة</Text>
                </View>
              )}
            </View>
          </View>
        ))}

        {data.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40 }}>
            <Ionicons name="document-text-outline" size={48} color="#ccc" />
            <Text style={{ color: '#999', marginTop: 12, fontSize: 15 }}>لا توجد بيانات</Text>
          </View>
        )}
      </ScrollView>

      {/* نافذة عرض الخطة الدراسية */}
      <Modal visible={showPlanModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '90%', maxWidth: 500, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setShowPlanModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#333' }}>الخطة الدراسية</Text>
              <View style={{ width: 24 }} />
            </View>
            <Text style={{ fontSize: 14, color: '#1565c0', fontWeight: '600', textAlign: 'center', marginBottom: 12 }}>{planCourseName}</Text>
            
            <ScrollView style={{ maxHeight: 400 }}>
              {planData?.weeks?.length > 0 ? (
                planData.weeks.map((week: any, i: number) => (
                  <View key={i} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <View style={{ backgroundColor: '#1565c0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>الأسبوع {week.week_number}</Text>
                      </View>
                    </View>
                    {week.topics?.map((topic: any, j: number) => (
                      <View key={j} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, gap: 8 }}>
                        <Ionicons name="book-outline" size={16} color="#4caf50" />
                        <Text style={{ fontSize: 14, color: '#333', flex: 1 }}>{topic.title}</Text>
                      </View>
                    ))}
                  </View>
                ))
              ) : (
                <Text style={{ textAlign: 'center', color: '#999', padding: 20 }}>لا توجد خطة دراسية لهذا المقرر</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  statCard: {
    flex: 1, padding: 12, borderRadius: 12, alignItems: 'center',
  },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  courseCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10,
  },
  courseName: { fontSize: 15, fontWeight: '700', color: '#333' },
  courseCode: { fontSize: 12, color: '#888', marginTop: 2 },
  detailBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f5f5f5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  detailText: { fontSize: 12, color: '#555' },
});
