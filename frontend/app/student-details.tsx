import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import {
  studentsAPI,
  departmentsAPI,
  attendanceAPI,
  exportAPI,
} from '../src/services/api';
import api from '../src/services/api';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { useAuth, PERMISSIONS } from '../src/contexts/AuthContext';
import { formatGregorianDate } from '../src/utils/dateUtils';

// ============== الأنواع ==============
interface StudentCourse {
  id: string;
  name: string;
  code: string;
  level: number;
  section: string;
  credit_hours: number;
  teacher_id?: string;
  teacher_name?: string;
  semester_id?: string;
  semester_name?: string;
}

interface CoursesResponse {
  student_id: string;
  total_courses: number;
  is_inferred: boolean;
  courses: StudentCourse[];
}

interface AttendanceStats {
  total_sessions: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  excused_count: number;
  attendance_rate: number;
}

interface AttendanceRecord {
  id: string;
  course_id: string;
  course_name: string;
  status: string;
  date: string;
  start_time?: string;
  end_time?: string;
  method: string;
}

// حالات الطالب
const STATUS_OPTIONS = [
  { value: 'active', label: 'مستمر', color: '#2e7d32', bg: '#e8f5e9', icon: 'checkmark-circle' as const },
  { value: 'repeat', label: 'إعادة', color: '#ef6c00', bg: '#fff3e0', icon: 'refresh-circle' as const },
  { value: 'graduated', label: 'متخرج', color: '#1565c0', bg: '#e3f2fd', icon: 'school' as const },
  { value: 'expelled', label: 'مفصول', color: '#c62828', bg: '#ffebee', icon: 'close-circle' as const },
  { value: 'frozen', label: 'مجمَّد', color: '#5e35b1', bg: '#ede7f6', icon: 'snow' as const },
];
const getStatusInfo = (s: string) =>
  STATUS_OPTIONS.find(o => o.value === s) || STATUS_OPTIONS[0];

const LEVELS = ['1', '2', '3', '4', '5'];

const showMessage = (title: string, message: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};
const showConfirm = (title: string, message: string, onYes: () => void) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onYes();
  } else {
    Alert.alert(title, message, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: onYes },
    ]);
  }
};

export default function StudentDetailsScreen() {
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  const router = useRouter();
  const { hasPermission, user } = useAuth();

  const canManage =
    user?.role === 'admin' || (user && hasPermission(PERMISSIONS.MANAGE_STUDENTS));

  // ============== State ==============
  const [student, setStudent] = useState<any>(null);
  const [departmentName, setDepartmentName] = useState<string>('');
  const [courses, setCourses] = useState<StudentCourse[]>([]);
  const [coursesInferred, setCoursesInferred] = useState(false);
  const [loading, setLoading] = useState(true);

  // Attendance (manual fetch only)
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [showRecords, setShowRecords] = useState(false);

  // Edit Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    level: '1',
    section: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Status Modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('active');
  const [statusReason, setStatusReason] = useState('');
  const [statusNewLevel, setStatusNewLevel] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  // Export Excel
  const [exportingExcel, setExportingExcel] = useState(false);

  // ============== Fetch ==============
  const fetchStudent = useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      return;
    }
    try {
      const [studentRes, coursesRes, deptsRes] = await Promise.all([
        studentsAPI.getById(String(studentId)),
        studentsAPI.getCourses(String(studentId)).catch(() => ({
          data: { courses: [], total_courses: 0, is_inferred: false },
        })),
        departmentsAPI.getAll().catch(() => ({ data: [] })),
      ]);
      const sData = studentRes.data;
      setStudent(sData);
      const cData = coursesRes.data as CoursesResponse;
      setCourses(cData.courses || []);
      setCoursesInferred(!!cData.is_inferred);

      const dept = (deptsRes.data || []).find(
        (d: any) => d.id === sData.department_id,
      );
      setDepartmentName(dept?.name || 'غير محدد');
    } catch (e: any) {
      console.error('Error loading student:', e);
      showMessage('خطأ', e?.response?.data?.detail || 'فشل تحميل بيانات الطالب');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchStudent();
  }, [fetchStudent]);

  // ============== Actions ==============
  const handleLoadAttendanceStats = async () => {
    if (!student) return;
    setStatsLoading(true);
    try {
      const res = await attendanceAPI.getStudentStats(student.id);
      setAttendanceStats(res.data);
    } catch (e: any) {
      showMessage('خطأ', e?.response?.data?.detail || 'فشل تحميل ملخص الحضور');
    } finally {
      setStatsLoading(false);
    }
  };

  const handleLoadAttendanceRecords = async () => {
    if (!student) return;
    setRecordsLoading(true);
    try {
      const res = await attendanceAPI.getStudentAttendance(student.id);
      setAttendanceRecords(res.data || []);
      setShowRecords(true);
    } catch (e: any) {
      showMessage('خطأ', e?.response?.data?.detail || 'فشل تحميل سجل الحضور');
    } finally {
      setRecordsLoading(false);
    }
  };

  const openEditModal = () => {
    if (!student) return;
    setEditForm({
      full_name: student.full_name || '',
      phone: student.phone || '',
      email: student.email || '',
      level: String(student.level || '1'),
      section: student.section || '',
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!student) return;
    if (!editForm.full_name.trim()) {
      showMessage('خطأ', 'يرجى إدخال اسم الطالب');
      return;
    }
    setSavingEdit(true);
    try {
      await studentsAPI.update(student.id, {
        full_name: editForm.full_name.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim(),
        level: parseInt(editForm.level) || 1,
        section: editForm.section.trim(),
      } as any);
      showMessage('تم', 'تم تحديث بيانات الطالب');
      setShowEditModal(false);
      fetchStudent();
    } catch (e: any) {
      showMessage('خطأ', e?.response?.data?.detail || 'فشل التحديث');
    } finally {
      setSavingEdit(false);
    }
  };

  const openStatusModal = () => {
    if (!student) return;
    setNewStatus(student.status || 'active');
    setStatusReason('');
    setStatusNewLevel('');
    setShowStatusModal(true);
  };

  const handleChangeStatus = async () => {
    if (!student) return;
    setSavingStatus(true);
    try {
      const body: any = {
        new_status: newStatus,
        reason: statusReason || '',
      };
      if (statusNewLevel) body.new_level = parseInt(statusNewLevel);
      await api.post(`/student-status/${student.id}/change`, body);
      showMessage('تم', `تم تغيير الحالة إلى "${getStatusInfo(newStatus).label}"`);
      setShowStatusModal(false);
      fetchStudent();
    } catch (e: any) {
      showMessage('خطأ', e?.response?.data?.detail || 'فشل تغيير الحالة');
    } finally {
      setSavingStatus(false);
    }
  };

  const handleActivateAccount = () => {
    if (!student) return;
    showConfirm('تفعيل حساب الطالب', `هل تريد تفعيل حساب ${student.full_name}؟`, async () => {
      try {
        const res = await studentsAPI.activateAccount(student.id);
        showMessage(
          'تم التفعيل ✅',
          `اسم المستخدم: ${res.data.username}\nكلمة المرور: ${student.student_id}`,
        );
        fetchStudent();
      } catch (e: any) {
        showMessage('خطأ', e?.response?.data?.detail || 'فشل التفعيل');
      }
    });
  };

  const handleDeactivateAccount = () => {
    if (!student) return;
    showConfirm(
      'إلغاء تفعيل الحساب',
      `هل تريد إلغاء تفعيل حساب ${student.full_name}؟`,
      async () => {
        try {
          await studentsAPI.deactivateAccount(student.id);
          showMessage('تم', 'تم إلغاء تفعيل الحساب');
          fetchStudent();
        } catch (e: any) {
          showMessage('خطأ', e?.response?.data?.detail || 'فشل العملية');
        }
      },
    );
  };

  const handleResetPassword = () => {
    if (!student) return;
    showConfirm(
      'إعادة تعيين كلمة المرور',
      `سيتم إعادة تعيين كلمة المرور لـ ${student.full_name} إلى رقم القيد.`,
      async () => {
        try {
          await studentsAPI.resetPassword(student.id);
          showMessage('تم', `كلمة المرور الجديدة: ${student.student_id}`);
        } catch (e: any) {
          showMessage('خطأ', e?.response?.data?.detail || 'فشل إعادة التعيين');
        }
      },
    );
  };

  const handleExportExcel = async () => {
    if (!student) return;
    setExportingExcel(true);
    try {
      const res = await exportAPI.exportStudentReportExcel(student.id);
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `student_report_${student.student_id}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      showMessage('خطأ', 'فشل تصدير التقرير');
    } finally {
      setExportingExcel(false);
    }
  };

  // ============== Computed ==============
  const totalCreditHours = useMemo(
    () => courses.reduce((sum, c) => sum + (c.credit_hours || 0), 0),
    [courses],
  );

  const statusInfo = getStatusInfo(student?.status || (student?.is_active === false ? 'frozen' : 'active'));
  const isAccountActive = !!student?.user_id;

  // ============== Render ==============
  if (loading) return <LoadingScreen />;

  if (!student) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.notFoundWrap}>
          <Ionicons name="alert-circle-outline" size={64} color="#cfd6e1" />
          <Text style={styles.notFoundText}>الطالب غير موجود أو تم حذفه</Text>
          <TouchableOpacity
            style={[styles.headerBtn, styles.btnPrimary, { marginTop: 14 }]}
            onPress={() => router.replace('/students')}
          >
            <Ionicons name="arrow-back" size={16} color="#fff" />
            <Text style={styles.btnPrimaryText}>العودة للطلاب</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: student.full_name,
          headerBackTitle: 'رجوع',
        }}
      />
      <ScrollView
        dataSet={{ responsiveScrollRoot: 'true' }}
        style={{ flex: 1 }}
        contentContainerStyle={styles.pageScroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ============ رأس الصفحة ============ */}
        <View dataSet={{ responsive: 'page-header' }} style={styles.pageHeader}>
          <View style={styles.pageHeaderRight}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Text dataSet={{ responsive: 'page-title' }} style={styles.pageTitle}>
                تفاصيل الطالب
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                <Ionicons name={statusInfo.icon} size={12} color={statusInfo.color} />
                <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
                  {statusInfo.label}
                </Text>
              </View>
            </View>
            <View style={styles.breadcrumb}>
              <TouchableOpacity onPress={() => router.replace('/')}>
                <Text style={styles.breadcrumbLink}>الرئيسية</Text>
              </TouchableOpacity>
              <Ionicons name="chevron-back" size={12} color="#8a95a8" />
              <TouchableOpacity onPress={() => router.replace('/students')}>
                <Text style={styles.breadcrumbLink}>الطلاب</Text>
              </TouchableOpacity>
              <Ionicons name="chevron-back" size={12} color="#8a95a8" />
              <Text style={styles.breadcrumbCurrent}>التفاصيل</Text>
            </View>
          </View>
          <View dataSet={{ responsive: 'page-header-actions' }} style={styles.pageHeaderActions}>
            <TouchableOpacity
              style={[styles.headerBtn, styles.btnGhost]}
              onPress={() => router.back()}
              testID="back-btn"
            >
              <Ionicons name="arrow-forward" size={16} color="#1a2540" />
              <Text style={styles.btnGhostText}>رجوع</Text>
            </TouchableOpacity>
            {canManage && (
              <TouchableOpacity
                style={[styles.headerBtn, styles.btnExportExcel, exportingExcel && { opacity: 0.5 }]}
                onPress={handleExportExcel}
                disabled={exportingExcel}
                testID="export-excel-btn"
              >
                {exportingExcel ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="grid" size={16} color="#fff" />
                )}
                <Text style={styles.btnPrimaryText}>
                  {exportingExcel ? 'جاري التصدير...' : 'تصدير Excel'}
                </Text>
              </TouchableOpacity>
            )}
            {canManage && (
              <TouchableOpacity
                style={[styles.headerBtn, styles.btnPrimary]}
                onPress={openEditModal}
                testID="edit-student-btn"
              >
                <Ionicons name="create" size={16} color="#fff" />
                <Text style={styles.btnPrimaryText}>تعديل</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ============ بطاقة الطالب ============ */}
        <View style={styles.studentCard}>
          <View style={styles.studentAvatar}>
            <Text style={styles.studentAvatarText}>
              {student.full_name?.charAt(0) || '?'}
            </Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.studentName}>{student.full_name}</Text>
            <View style={styles.studentSubRow}>
              <Text style={styles.studentSub}>رقم القيد:</Text>
              <Text style={styles.studentSubBold}>{student.student_id}</Text>
              {student.reference_number ? (
                <>
                  <View style={styles.dot} />
                  <Text style={styles.studentSub}>الرقم المرجعي:</Text>
                  <Text style={[styles.studentSubBold, { color: '#2e7d32' }]}>
                    {student.reference_number}
                  </Text>
                </>
              ) : null}
            </View>
            <View style={styles.studentSubRow}>
              <View style={styles.metaItem}>
                <Ionicons name="business-outline" size={13} color="#5b6678" />
                <Text style={styles.metaText}>{departmentName}</Text>
              </View>
              <View style={styles.dot} />
              <View style={styles.metaItem}>
                <Ionicons name="layers-outline" size={13} color="#5b6678" />
                <Text style={styles.metaText}>المستوى {student.level}</Text>
              </View>
              {student.section ? (
                <>
                  <View style={styles.dot} />
                  <View style={styles.metaItem}>
                    <Ionicons name="albums-outline" size={13} color="#5b6678" />
                    <Text style={styles.metaText}>شعبة {student.section}</Text>
                  </View>
                </>
              ) : null}
            </View>
            {(student.phone || student.email) && (
              <View style={styles.studentSubRow}>
                {student.phone ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="call-outline" size={13} color="#5b6678" />
                    <Text style={styles.metaText}>{student.phone}</Text>
                  </View>
                ) : null}
                {student.email ? (
                  <>
                    {student.phone ? <View style={styles.dot} /> : null}
                    <View style={styles.metaItem}>
                      <Ionicons name="mail-outline" size={13} color="#5b6678" />
                      <Text style={styles.metaText}>{student.email}</Text>
                    </View>
                  </>
                ) : null}
              </View>
            )}
          </View>
          <View style={styles.studentIconBg}>
            <Ionicons name="school" size={32} color="#2962ff" />
          </View>
        </View>

        {/* ============ بطاقات الإحصائيات ============ */}
        <View dataSet={{ responsive: 'stats-grid' }} style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: '#4caf50' }]}>
              <Ionicons name="book" size={22} color="#fff" />
            </View>
            <View style={styles.statTextCol}>
              <Text style={styles.statLabel}>المقررات المسجلة</Text>
              <Text style={styles.statValue} testID="total-courses-value">
                {courses.length}
              </Text>
              <Text style={styles.statSubLabel}>
                {coursesInferred ? 'مستنتجة من القسم/المستوى' : 'تسجيلات صريحة'}
              </Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: '#ff9800' }]}>
              <Ionicons name="time" size={22} color="#fff" />
            </View>
            <View style={styles.statTextCol}>
              <Text style={styles.statLabel}>الساعات المعتمدة</Text>
              <Text style={styles.statValue}>{totalCreditHours}</Text>
              <Text style={styles.statSubLabel}>ساعة دراسية</Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: isAccountActive ? '#29b6f6' : '#9e9e9e' }]}>
              <Ionicons name={isAccountActive ? 'checkmark-circle' : 'close-circle'} size={22} color="#fff" />
            </View>
            <View style={styles.statTextCol}>
              <Text style={styles.statLabel}>حالة الحساب</Text>
              <Text style={styles.statValue}>
                {isAccountActive ? 'مفعّل' : 'غير مفعّل'}
              </Text>
              <Text style={styles.statSubLabel}>
                {isAccountActive ? 'يمكنه تسجيل الدخول' : 'لا يمكنه تسجيل الدخول'}
              </Text>
            </View>
          </View>
        </View>

        {/* ============ الإجراءات السريعة ============ */}
        {canManage && (
          <View style={styles.actionsCard}>
            <Text style={styles.sectionTitle}>الإجراءات السريعة</Text>
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#fff3e0' }]}
                onPress={openStatusModal}
                testID="change-status-btn"
              >
                <Ionicons name="swap-horizontal" size={18} color="#e65100" />
                <Text style={[styles.actionBtnText, { color: '#e65100' }]}>تغيير الحالة</Text>
              </TouchableOpacity>
              {isAccountActive ? (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#ffebee' }]}
                  onPress={handleDeactivateAccount}
                  testID="deactivate-account-btn"
                >
                  <Ionicons name="person-remove" size={18} color="#c62828" />
                  <Text style={[styles.actionBtnText, { color: '#c62828' }]}>
                    إلغاء تفعيل الحساب
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#e8f5e9' }]}
                  onPress={handleActivateAccount}
                  testID="activate-account-btn"
                >
                  <Ionicons name="person-add" size={18} color="#2e7d32" />
                  <Text style={[styles.actionBtnText, { color: '#2e7d32' }]}>
                    تفعيل الحساب
                  </Text>
                </TouchableOpacity>
              )}
              {isAccountActive && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#e3f2fd' }]}
                  onPress={handleResetPassword}
                  testID="reset-password-btn"
                >
                  <Ionicons name="key" size={18} color="#1565c0" />
                  <Text style={[styles.actionBtnText, { color: '#1565c0' }]}>
                    إعادة تعيين كلمة المرور
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#ede7f6' }]}
                onPress={() =>
                  router.push({
                    pathname: '/report-student',
                    params: { studentId: student.id },
                  })
                }
                testID="open-report-btn"
              >
                <Ionicons name="document-text" size={18} color="#5e35b1" />
                <Text style={[styles.actionBtnText, { color: '#5e35b1' }]}>التقرير المفصّل</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ============ المقررات ============ */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <Text style={styles.sectionCardTitle}>المقررات المسجَّلة</Text>
            <Text style={styles.sectionCardCount}>
              <Text style={styles.countAccent}>{courses.length}</Text> مقرر
            </Text>
          </View>

          {courses.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="book-outline" size={56} color="#cfd6e1" />
              <Text style={styles.emptyText}>لا توجد مقررات مسجلة</Text>
            </View>
          ) : (
            <View style={styles.coursesList}>
              {coursesInferred && (
                <View style={styles.inferredBanner}>
                  <Ionicons name="information-circle" size={16} color="#ef6c00" />
                  <Text style={styles.inferredBannerText}>
                    لا توجد تسجيلات صريحة. عُرضت المقررات المطابقة لقسم ومستوى الطالب.
                  </Text>
                </View>
              )}
              {courses.map(course => (
                <TouchableOpacity
                  key={course.id}
                  style={styles.courseRow}
                  onPress={() =>
                    router.push({
                      pathname: '/course-details',
                      params: { courseId: course.id },
                    })
                  }
                  testID={`course-row-${course.id}`}
                >
                  <View style={styles.courseIconBox}>
                    <Ionicons name="book" size={22} color="#2962ff" />
                  </View>
                  <View style={styles.courseInfo}>
                    <View style={styles.courseTitleRow}>
                      <Text style={styles.courseName} numberOfLines={1}>
                        {course.name}
                      </Text>
                      <Text style={styles.courseCode}>{course.code || '—'}</Text>
                    </View>
                    <View style={styles.metaRow}>
                      {course.teacher_name ? (
                        <View style={styles.metaItem}>
                          <Ionicons name="person-outline" size={13} color="#5b6678" />
                          <Text style={styles.metaText}>{course.teacher_name}</Text>
                        </View>
                      ) : null}
                      {course.semester_name ? (
                        <View style={styles.metaItem}>
                          <Ionicons name="calendar-outline" size={13} color="#5b6678" />
                          <Text style={styles.metaText}>{course.semester_name}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.metaRow}>
                      <View style={[styles.badge, styles.badgeLevel]}>
                        <Text style={styles.badgeText}>المستوى {course.level}</Text>
                      </View>
                      {!!course.section && (
                        <View style={[styles.badge, styles.badgeSection]}>
                          <Text style={styles.badgeText}>شعبة {course.section}</Text>
                        </View>
                      )}
                      <View style={[styles.badge, styles.badgeHours]}>
                        <Ionicons name="time-outline" size={11} color="#e65100" />
                        <Text style={[styles.badgeText, { color: '#e65100' }]}>
                          {course.credit_hours} س
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-back" size={20} color="#c0c8d4" />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ============ سجل الحضور (يدوي) ============ */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <Text style={styles.sectionCardTitle}>سجل الحضور</Text>
            {attendanceStats && (
              <View style={styles.ratePill}>
                <Text style={styles.rateText}>
                  معدل الحضور: {attendanceStats.attendance_rate}%
                </Text>
              </View>
            )}
          </View>

          {!attendanceStats ? (
            <View style={styles.attendanceCta}>
              <Ionicons name="calendar-outline" size={48} color="#cfd6e1" />
              <Text style={styles.ctaTitle}>سجل الحضور لا يُحمَّل تلقائياً</Text>
              <Text style={styles.ctaSubtitle}>
                لتسريع تحميل الصفحة، اضغط الزر لجلب ملخص الحضور
              </Text>
              <TouchableOpacity
                style={[styles.headerBtn, styles.btnPrimary, { marginTop: 14 }]}
                onPress={handleLoadAttendanceStats}
                disabled={statsLoading}
                testID="load-attendance-summary-btn"
              >
                {statsLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="cloud-download" size={16} color="#fff" />
                )}
                <Text style={styles.btnPrimaryText}>
                  {statsLoading ? 'جاري التحميل...' : 'عرض ملخص الحضور'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ padding: 14 }}>
              {/* ملخص الحضور */}
              <View dataSet={{ responsive: 'stats-grid' }} style={styles.attendanceStatsGrid}>
                <View style={[styles.attStatCard, { backgroundColor: '#e8f5e9' }]}>
                  <Text style={[styles.attStatValue, { color: '#2e7d32' }]}>
                    {attendanceStats.present_count}
                  </Text>
                  <Text style={[styles.attStatLabel, { color: '#2e7d32' }]}>حاضر</Text>
                </View>
                <View style={[styles.attStatCard, { backgroundColor: '#ffebee' }]}>
                  <Text style={[styles.attStatValue, { color: '#c62828' }]}>
                    {attendanceStats.absent_count}
                  </Text>
                  <Text style={[styles.attStatLabel, { color: '#c62828' }]}>غائب</Text>
                </View>
                <View style={[styles.attStatCard, { backgroundColor: '#fff3e0' }]}>
                  <Text style={[styles.attStatValue, { color: '#e65100' }]}>
                    {attendanceStats.late_count}
                  </Text>
                  <Text style={[styles.attStatLabel, { color: '#e65100' }]}>متأخر</Text>
                </View>
                <View style={[styles.attStatCard, { backgroundColor: '#e3f2fd' }]}>
                  <Text style={[styles.attStatValue, { color: '#1565c0' }]}>
                    {attendanceStats.excused_count}
                  </Text>
                  <Text style={[styles.attStatLabel, { color: '#1565c0' }]}>بعذر</Text>
                </View>
                <View style={[styles.attStatCard, { backgroundColor: '#f3e5f5' }]}>
                  <Text style={[styles.attStatValue, { color: '#5e35b1' }]}>
                    {attendanceStats.total_sessions}
                  </Text>
                  <Text style={[styles.attStatLabel, { color: '#5e35b1' }]}>إجمالي</Text>
                </View>
              </View>

              {/* زر عرض التفاصيل */}
              {!showRecords ? (
                <TouchableOpacity
                  style={[styles.headerBtn, styles.btnGhost, { alignSelf: 'center', marginTop: 14 }]}
                  onPress={handleLoadAttendanceRecords}
                  disabled={recordsLoading}
                  testID="load-attendance-records-btn"
                >
                  {recordsLoading ? (
                    <ActivityIndicator size="small" color="#1a2540" />
                  ) : (
                    <Ionicons name="list" size={16} color="#1a2540" />
                  )}
                  <Text style={styles.btnGhostText}>
                    {recordsLoading ? 'جاري التحميل...' : 'عرض التفاصيل'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ marginTop: 14 }}>
                  <Text style={styles.recordsTitle}>
                    تفاصيل سجل الحضور ({attendanceRecords.length})
                  </Text>
                  {attendanceRecords.length === 0 ? (
                    <Text style={styles.noAttendance}>لا توجد سجلات حضور</Text>
                  ) : (
                    attendanceRecords.slice(0, 100).map(record => {
                      const isPresent = record.status === 'present';
                      const isLate = record.status === 'late';
                      const statusColor = isPresent
                        ? '#2e7d32'
                        : isLate
                        ? '#e65100'
                        : record.status === 'excused'
                        ? '#1565c0'
                        : '#c62828';
                      const statusBg = isPresent
                        ? '#e8f5e9'
                        : isLate
                        ? '#fff3e0'
                        : record.status === 'excused'
                        ? '#e3f2fd'
                        : '#ffebee';
                      const statusLabel = isPresent
                        ? 'حاضر'
                        : isLate
                        ? 'متأخر'
                        : record.status === 'excused'
                        ? 'بعذر'
                        : 'غائب';
                      return (
                        <View key={record.id} style={styles.attendanceRow}>
                          <View style={[styles.attStatusPill, { backgroundColor: statusBg }]}>
                            <Text style={[styles.attStatusText, { color: statusColor }]}>
                              {statusLabel}
                            </Text>
                          </View>
                          <View style={{ flex: 1, alignItems: 'flex-end' }}>
                            <Text style={styles.attCourseName}>{record.course_name}</Text>
                            <View style={styles.metaRow}>
                              <Text style={styles.attDate}>
                                {formatGregorianDate(new Date(record.date))}
                              </Text>
                              {record.start_time ? (
                                <>
                                  <View style={styles.dot} />
                                  <Text style={styles.attDate}>
                                    {record.start_time} - {record.end_time}
                                  </Text>
                                </>
                              ) : null}
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}
                  {attendanceRecords.length > 100 && (
                    <Text style={styles.morePill}>
                      عُرضت أول 100 سجل من إجمالي {attendanceRecords.length}
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ============ مودال التعديل ============ */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowEditModal(false)}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>تعديل بيانات الطالب</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)} testID="close-edit-modal">
                <Ionicons name="close" size={22} color="#5b6678" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }}>
              <Text style={styles.inputLabel}>الاسم الكامل *</Text>
              <TextInput
                style={styles.input}
                value={editForm.full_name}
                onChangeText={(t) => setEditForm(p => ({ ...p, full_name: t }))}
                placeholder="الاسم الكامل"
                placeholderTextColor="#a8b1c2"
                testID="edit-name-input"
              />
              <Text style={styles.inputLabel}>الهاتف</Text>
              <TextInput
                style={styles.input}
                value={editForm.phone}
                onChangeText={(t) => setEditForm(p => ({ ...p, phone: t }))}
                placeholder="رقم الهاتف"
                placeholderTextColor="#a8b1c2"
                keyboardType="phone-pad"
                testID="edit-phone-input"
              />
              <Text style={styles.inputLabel}>البريد الإلكتروني</Text>
              <TextInput
                style={styles.input}
                value={editForm.email}
                onChangeText={(t) => setEditForm(p => ({ ...p, email: t }))}
                placeholder="البريد الإلكتروني"
                placeholderTextColor="#a8b1c2"
                keyboardType="email-address"
                testID="edit-email-input"
              />
              <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>المستوى</Text>
                  <View style={styles.levelPickerRow}>
                    {LEVELS.map(lvl => (
                      <TouchableOpacity
                        key={lvl}
                        style={[
                          styles.levelPickerBtn,
                          editForm.level === lvl && styles.levelPickerBtnActive,
                        ]}
                        onPress={() => setEditForm(p => ({ ...p, level: lvl }))}
                      >
                        <Text
                          style={[
                            styles.levelPickerText,
                            editForm.level === lvl && { color: '#fff' },
                          ]}
                        >
                          م{lvl}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>الشعبة</Text>
                  <TextInput
                    style={styles.input}
                    value={editForm.section}
                    onChangeText={(t) => setEditForm(p => ({ ...p, section: t }))}
                    placeholder="الشعبة"
                    placeholderTextColor="#a8b1c2"
                    testID="edit-section-input"
                  />
                </View>
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.headerBtn, styles.btnGhost]}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={styles.btnGhostText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerBtn, styles.btnPrimary, savingEdit && { opacity: 0.5 }]}
                onPress={handleSaveEdit}
                disabled={savingEdit}
                testID="save-edit-btn"
              >
                {savingEdit ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                )}
                <Text style={styles.btnPrimaryText}>
                  {savingEdit ? 'جاري الحفظ...' : 'حفظ'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============ مودال تغيير الحالة ============ */}
      <Modal
        visible={showStatusModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowStatusModal(false)}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>تغيير حالة الطالب</Text>
              <TouchableOpacity onPress={() => setShowStatusModal(false)} testID="close-status-modal">
                <Ionicons name="close" size={22} color="#5b6678" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }}>
              <Text style={styles.inputLabel}>الحالة الجديدة</Text>
              <View style={styles.statusGrid}>
                {STATUS_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.statusOptionBtn,
                      { backgroundColor: opt.bg },
                      newStatus === opt.value && {
                        borderColor: opt.color,
                        borderWidth: 2,
                      },
                    ]}
                    onPress={() => setNewStatus(opt.value)}
                    testID={`status-option-${opt.value}`}
                  >
                    <Ionicons name={opt.icon} size={18} color={opt.color} />
                    <Text style={[styles.statusOptionText, { color: opt.color }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>المستوى الجديد (اختياري)</Text>
              <View style={styles.levelPickerRow}>
                {['', ...LEVELS].map(lvl => (
                  <TouchableOpacity
                    key={lvl || 'none'}
                    style={[
                      styles.levelPickerBtn,
                      statusNewLevel === lvl && styles.levelPickerBtnActive,
                    ]}
                    onPress={() => setStatusNewLevel(lvl)}
                  >
                    <Text
                      style={[
                        styles.levelPickerText,
                        statusNewLevel === lvl && { color: '#fff' },
                      ]}
                    >
                      {lvl ? `م${lvl}` : 'بدون'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>السبب (اختياري)</Text>
              <TextInput
                style={[styles.input, { height: 80 }]}
                value={statusReason}
                onChangeText={setStatusReason}
                placeholder="سبب تغيير الحالة..."
                placeholderTextColor="#a8b1c2"
                multiline
                testID="status-reason-input"
              />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.headerBtn, styles.btnGhost]}
                onPress={() => setShowStatusModal(false)}
              >
                <Text style={styles.btnGhostText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerBtn, styles.btnPrimary, savingStatus && { opacity: 0.5 }]}
                onPress={handleChangeStatus}
                disabled={savingStatus}
                testID="save-status-btn"
              >
                {savingStatus ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                )}
                <Text style={styles.btnPrimaryText}>
                  {savingStatus ? 'جاري الحفظ...' : 'تطبيق'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6fb' },

  pageScroll: { padding: 20, paddingBottom: 60, maxWidth: 1440, width: '100%', alignSelf: 'center' },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
    flexWrap: 'wrap',
    gap: 12,
  },
  pageHeaderRight: { alignItems: 'flex-end' },
  pageTitle: { fontSize: 24, fontWeight: '700', color: '#1a2540', textAlign: 'right', marginBottom: 6 },
  statusBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 6,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breadcrumbLink: { fontSize: 13, color: '#2962ff', fontWeight: '500' },
  breadcrumbCurrent: { fontSize: 13, color: '#8a95a8', fontWeight: '500' },
  pageHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8 },
  btnPrimary: { backgroundColor: '#2962ff' },
  btnExport: { backgroundColor: '#e53935' },
  btnExportExcel: { backgroundColor: '#1b7d3f' },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee' },
  btnGhostText: { color: '#1a2540', fontSize: 13, fontWeight: '600' },

  // بطاقة الطالب
  studentCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: '#eef1f6',
  },
  studentIconBg: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#e7f0fe',
    alignItems: 'center', justifyContent: 'center',
  },
  studentAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#2962ff',
    alignItems: 'center', justifyContent: 'center',
  },
  studentAvatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  studentName: { fontSize: 20, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  studentSubRow: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 5, flexWrap: 'wrap', gap: 6 },
  studentSub: { fontSize: 13, color: '#8a95a8' },
  studentSubBold: { fontSize: 13, color: '#1a2540', fontWeight: '700' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#cfd6e1', marginHorizontal: 4 },

  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#5b6678' },

  // إحصائيات
  statsGrid: { flexDirection: 'row', gap: 14, marginBottom: 18, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 200, backgroundColor: '#fff', borderRadius: 14, padding: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#eef1f6' },
  statIconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  statTextCol: { flex: 1, alignItems: 'flex-end' },
  statLabel: { fontSize: 13, color: '#8a95a8', fontWeight: '500', marginBottom: 4 },
  statValue: { fontSize: 22, color: '#1a2540', fontWeight: '700', marginBottom: 2 },
  statSubLabel: { fontSize: 11, color: '#a8b1c2' },

  // الإجراءات
  actionsCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#eef1f6',
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540', marginBottom: 12, textAlign: 'right' },
  actionsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  actionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  actionBtnText: { fontSize: 13, fontWeight: '600' },

  // أقسام البطاقات
  sectionCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eef1f6', marginBottom: 18 },
  sectionCardHeader: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef1f6',
  },
  sectionCardTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540' },
  sectionCardCount: { fontSize: 12, color: '#5b6678' },
  countAccent: { color: '#2962ff', fontWeight: '700' },

  // المقررات
  coursesList: { padding: 14, gap: 10 },
  inferredBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff3e0',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  inferredBannerText: { flex: 1, fontSize: 12, color: '#e65100', textAlign: 'right' },
  courseRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#fafbfd',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#eef1f6',
  },
  courseIconBox: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: '#e7f0fe',
    alignItems: 'center', justifyContent: 'center',
  },
  courseInfo: { flex: 1, alignItems: 'flex-end', gap: 6 },
  courseTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  courseName: { fontSize: 15, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  courseCode: { fontSize: 12, color: '#8a95a8', fontWeight: '500' },
  metaRow: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#1565c0' },
  badgeLevel: { backgroundColor: '#e7f0fe' },
  badgeSection: { backgroundColor: '#f3e5f5' },
  badgeHours: { backgroundColor: '#fff3e0' },

  emptyState: { alignItems: 'center', paddingVertical: 50, gap: 12 },
  emptyText: { fontSize: 14, color: '#8a95a8' },

  // الحضور
  attendanceCta: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 18, gap: 8 },
  ctaTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540', textAlign: 'center' },
  ctaSubtitle: { fontSize: 12, color: '#8a95a8', textAlign: 'center' },
  ratePill: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12,
    backgroundColor: '#e7f0fe', borderWidth: 1, borderColor: '#bdd4fd',
  },
  rateText: { fontSize: 12, color: '#1565c0', fontWeight: '700' },
  attendanceStatsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  attStatCard: {
    flex: 1,
    minWidth: 120,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  attStatValue: { fontSize: 22, fontWeight: '700' },
  attStatLabel: { fontSize: 12, fontWeight: '600' },

  recordsTitle: { fontSize: 14, fontWeight: '700', color: '#1a2540', textAlign: 'right', marginBottom: 10 },
  noAttendance: { fontSize: 13, color: '#8a95a8', textAlign: 'center', padding: 20 },
  attendanceRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: '#fafbfd',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eef1f6',
    marginBottom: 8,
  },
  attStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    minWidth: 56,
    alignItems: 'center',
  },
  attStatusText: { fontSize: 12, fontWeight: '700' },
  attCourseName: { fontSize: 13, fontWeight: '700', color: '#1a2540' },
  attDate: { fontSize: 11, color: '#5b6678' },
  morePill: { fontSize: 12, color: '#8a95a8', textAlign: 'center', marginTop: 8 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(20,30,55,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eef1f6',
  },
  modalHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f6',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a2540' },
  modalFooter: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eef1f6',
    backgroundColor: '#fafbfd',
  },
  inputLabel: { fontSize: 13, color: '#5b6678', textAlign: 'right', marginBottom: 6, marginTop: 10, fontWeight: '600' },
  input: {
    backgroundColor: '#fafbfd',
    borderWidth: 1,
    borderColor: '#e3e7ee',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#1a2540',
    textAlign: 'right',
    outlineStyle: 'none' as any,
  },

  // Status grid
  statusGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  statusOptionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statusOptionText: { fontSize: 13, fontWeight: '700' },

  // Level picker
  levelPickerRow: { flexDirection: 'row-reverse', gap: 6, flexWrap: 'wrap' },
  levelPickerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#fafbfd',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e3e7ee',
  },
  levelPickerBtnActive: { backgroundColor: '#2962ff', borderColor: '#2962ff' },
  levelPickerText: { fontSize: 13, color: '#1a2540', fontWeight: '600' },

  notFoundWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  notFoundText: { fontSize: 16, color: '#5b6678', marginTop: 12, textAlign: 'center' },
});
