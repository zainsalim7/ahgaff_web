import { goBack } from '../src/utils/navigation';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { enrollmentAPI, attendanceAPI, lecturesAPI } from '../src/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOfflineSyncStore } from '../src/store/offlineSyncStore';
import { useAuthStore } from '../src/store/authStore';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { useAuth, PERMISSIONS, PermissionGate } from '../src/contexts/AuthContext';
import OfflineIndicator from '../src/components/OfflineIndicator';
import { formatGregorianDate, formatHijriDate, parseDate, WEEKDAYS_AR } from '../src/utils/dateUtils';

interface EnrolledStudent {
  id: string;
  student_id: string;
  full_name: string;
  attendance_status: string | null;
}

interface LectureDetails {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  room: string;
  status: string;
}

interface CourseDetails {
  id: string;
  name: string;
  code: string;
}

export default function TakeAttendanceScreen() {
  const router = useRouter();
  const { lectureId, courseId, courseName } = useLocalSearchParams();
  
  // استخدام store الأوفلاين الجديد
  const { 
    isOnline, 
    addAttendanceRecord, 
    getPendingRecordsCount,
    cacheLecture,
    cacheStudents,
    getCachedLecture,
    getCachedStudents,
    startNetworkMonitoring,
    loadFromStorage,
  } = useOfflineSyncStore();
  
  const { hasPermission, user: authUser, isLoading: authLoading } = useAuth();
  const user = useAuthStore((state) => state.user);
  
  // الطالب لا يمكنه الوصول لهذه الصفحة
  const isStudent = user?.role === 'student' || authUser?.role === 'student';
  
  // المدير والمعلم يمكنهم تسجيل الحضور بشكل افتراضي
  // ندعم كلا الصلاحيتين للتوافق مع الأدوار المختلفة
  const canRecordAttendance = !isStudent && (hasPermission(PERMISSIONS.RECORD_ATTENDANCE) || 
                              hasPermission(PERMISSIONS.TAKE_ATTENDANCE) || 
                              user?.role === 'admin' || 
                              user?.role === 'teacher');
  const canEditAttendance = hasPermission(PERMISSIONS.EDIT_ATTENDANCE) || user?.role === 'admin';
  
  // إعادة توجيه الطالب
  useEffect(() => {
    if (!authLoading && isStudent) {
      router.replace('/');
    }
  }, [isStudent, authLoading]);
  
  const [lecture, setLecture] = useState<LectureDetails | null>(null);
  const [course, setCourse] = useState<CourseDetails | null>(null);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [attendance, setAttendance] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attendanceRecorded, setAttendanceRecorded] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  
  // بدء مراقبة الاتصال عند تحميل الصفحة
  useEffect(() => {
    loadFromStorage();
    const unsubscribe = startNetworkMonitoring();
    return () => unsubscribe();
  }, []);
  
  // حالة التحضير
  const [attendanceStatus, setAttendanceStatus] = useState<{
    can_take_attendance: boolean;
    reason: string;
    status: string;
    minutes_remaining?: number;
    deadline?: string;
  } | null>(null);

  // State لرسالة الخطأ
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  // تصدير PDF
  const handleExportPdf = async () => {
    if (!lectureId) return;
    setExportingPdf(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const url = `${backendUrl}/api/lectures/${lectureId}/pdf`;
      
      if (Platform.OS === 'web') {
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('فشل تحميل التقرير');
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${course?.name || courseName || 'attendance'}_${lecture?.date || 'report'}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      } else {
        Alert.alert('تنبيه', 'تصدير PDF متاح فقط على الويب حالياً');
      }
    } catch (error) {
      console.error('PDF export error:', error);
      if (Platform.OS === 'web') {
        window.alert('فشل في تصدير التقرير');
      } else {
        Alert.alert('خطأ', 'فشل في تصدير التقرير');
      }
    } finally {
      setExportingPdf(false);
    }
  };

  const fetchData = useCallback(async () => {
    setErrorMessage(null);
    try {
      if (lectureId) {
        // محاولة جلب البيانات من الخادم أولاً
        try {
          const response = await lecturesAPI.getDetails(lectureId as string);
          const data = response.data;
          
          setLecture(data.lecture);
          setCourse(data.course);
          setStudents(data.students);
          setAttendanceRecorded(data.attendance_recorded);
          setOfflineMode(false);
          
          // تخزين البيانات محلياً للاستخدام أوفلاين
          await cacheLecture({
            id: data.lecture.id,
            course_id: data.course.id,
            course_name: data.course.name,
            date: data.lecture.date,
            start_time: data.lecture.start_time,
            end_time: data.lecture.end_time,
            room: data.lecture.room,
            students: data.students.map((s: EnrolledStudent) => ({
              id: s.id,
              student_id: s.student_id,
              full_name: s.full_name,
            })),
            cached_at: new Date().toISOString(),
          });
          
          // جلب حالة التحضير
          if (data.attendance_status) {
            setAttendanceStatus(data.attendance_status);
          } else {
            try {
              const statusRes = await lecturesAPI.getAttendanceStatus(lectureId as string);
              setAttendanceStatus(statusRes.data);
            } catch (e) {
              console.log('Error fetching attendance status:', e);
            }
          }
            
            // Initialize attendance
            const initialAttendance: { [key: string]: string } = {};
            data.students.forEach((s: EnrolledStudent) => {
              initialAttendance[s.id] = s.attendance_status || 'present';
            });
            setAttendance(initialAttendance);
          } catch (error: any) {
            // فشل الاتصال - عرض رسالة خطأ واضحة مع إمكانية إعادة المحاولة
            console.log('فشل الاتصال:', error?.response?.status, error?.message);
            loadCachedData(error);
          }
      } else if (courseId) {
        // Old way: fetch enrolled students for a course (fallback)
        const enrolledRes = await enrollmentAPI.getEnrolledStudents(courseId as string);
        setStudents(enrolledRes.data.map((s: any) => ({
          id: s.id,
          student_id: s.student_id,
          full_name: s.full_name,
          attendance_status: null
        })));
        
        // Initialize all as present
        const initialAttendance: { [key: string]: string } = {};
        enrolledRes.data.forEach((s: any) => {
          initialAttendance[s.id] = 'present';
        });
        setAttendance(initialAttendance);
      }
    } catch (error: any) {
      console.error('Error fetching data:', error);
      // محاولة استخدام البيانات المخزنة مع تمرير الخطأ
      loadCachedData(error);
    } finally {
      setLoading(false);
    }
  }, [lectureId, courseId]);

  // دالة تحميل البيانات المخزنة
  const loadCachedData = (apiError?: any) => {
    const cachedLecture = getCachedLecture(lectureId as string);
    if (cachedLecture) {
      setLecture({
        id: cachedLecture.id,
        date: cachedLecture.date,
        start_time: cachedLecture.start_time,
        end_time: cachedLecture.end_time,
        room: cachedLecture.room || '',
        status: 'cached',
      });
      setCourse({
        id: cachedLecture.course_id,
        name: cachedLecture.course_name,
        code: '',
      });
      setStudents(cachedLecture.students.map(s => ({
        ...s,
        attendance_status: null,
      })));
      setOfflineMode(true);
      
      // السماح بالتحضير أوفلاين
      setAttendanceStatus({
        can_take_attendance: true,
        reason: 'وضع أوفلاين - سيتم المزامنة عند عودة الاتصال',
        status: 'offline',
      });
      
      // Initialize all as present
      const initialAttendance: { [key: string]: string } = {};
      cachedLecture.students.forEach((s) => {
        initialAttendance[s.id] = 'present';
      });
      setAttendance(initialAttendance);
    } else {
      // عرض رسالة خطأ واضحة مع إمكانية إعادة المحاولة
      const status = apiError?.response?.status;
      const errorMsg = status === 404
        ? 'المحاضرة غير موجودة أو تم حذفها'
        : status === 401 || status === 403
        ? 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى'
        : status >= 500
        ? 'خطأ في الخادم. يرجى المحاولة لاحقاً'
        : 'فشل في تحميل بيانات المحاضرة. تأكد من اتصالك بالإنترنت وأعد المحاولة';
      setErrorMessage(errorMsg);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleStatus = (studentId: string) => {
    // التحقق من الصلاحية
    if (!canRecordAttendance && !canEditAttendance) {
      Alert.alert('تنبيه', 'ليس لديك صلاحية لتعديل الحضور');
      return;
    }
    
    const statuses = ['present', 'absent', 'excused'];
    const currentIndex = statuses.indexOf(attendance[studentId]);
    const nextIndex = (currentIndex + 1) % statuses.length;
    setAttendance({ ...attendance, [studentId]: statuses[nextIndex] });
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'present':
        return { bg: '#e8f5e9', color: '#4caf50', label: 'حاضر' };
      case 'absent':
        return { bg: '#ffebee', color: '#f44336', label: 'غائب' };
      case 'excused':
        return { bg: '#fff3e0', color: '#ff9800', label: 'معذور' };
      default:
        return { bg: '#f5f5f5', color: '#999', label: 'غير محدد' };
    }
  };

  const saveAttendance = async () => {
    setSaving(true);
    try {
      const records = Object.entries(attendance).map(([studentId, status]) => ({
        student_id: studentId,
        status,
      }));

      if (isOnline && !offlineMode) {
        // أونلاين - حفظ مباشر على الخادم
        if (lectureId) {
          await attendanceAPI.recordSession({
            lecture_id: lectureId as string,
            records,
          });
        }
        
        const successMsg = 'تم حفظ الحضور بنجاح';
        if (Platform.OS === 'web') {
          window.alert(successMsg);
          goBack();
        } else {
          Alert.alert('نجاح', successMsg, [
            { text: 'حسناً', onPress: () => goBack() }
          ]);
        }
      } else {
        // أوفلاين - حفظ محلي مع المزامنة لاحقاً
        const student_names: Record<string, string> = {};
        students.forEach(s => { student_names[s.id] = s.full_name; });
        
        for (const [studentId, status] of Object.entries(attendance)) {
          await addAttendanceRecord({
            lecture_id: lectureId as string,
            course_id: course?.id || courseId as string,
            student_id: studentId,
            student_name: student_names[studentId],
            status: status as 'present' | 'absent' | 'late' | 'excused',
            method: 'manual_offline',
          });
        }
        
        const pendingCount = getPendingRecordsCount();
        const offlineMsg = `تم حفظ الحضور محلياً (${pendingCount} سجل معلق)\nسيتم المزامنة تلقائياً عند عودة الاتصال`;
        
        if (Platform.OS === 'web') {
          window.alert(offlineMsg);
          goBack();
        } else {
          Alert.alert('تم الحفظ أوفلاين', offlineMsg, [
            { text: 'حسناً', onPress: () => goBack() }
          ]);
        }
      }
    } catch (error: any) {
      console.error('Error saving attendance:', error);
      
      // التحقق: هل الخطأ من الخادم (مثل "لم يحن وقت المحاضرة") أم فشل اتصال حقيقي
      const serverError = error?.response?.data?.detail;
      const statusCode = error?.response?.status;
      
      if (serverError && (statusCode === 400 || statusCode === 403)) {
        // خطأ من الخادم - عرض الرسالة الفعلية (مثل: لم يحن وقت المحاضرة)
        if (Platform.OS === 'web') {
          window.alert(serverError);
        } else {
          Alert.alert('غير مسموح', serverError);
        }
      } else {
        // فشل اتصال حقيقي - حفظ أوفلاين
        try {
          const student_names: Record<string, string> = {};
          students.forEach(s => { student_names[s.id] = s.full_name; });
          
          for (const [studentId, status] of Object.entries(attendance)) {
            await addAttendanceRecord({
              lecture_id: lectureId as string,
              course_id: course?.id || courseId as string,
              student_id: studentId,
              student_name: student_names[studentId],
              status: status as 'present' | 'absent' | 'late' | 'excused',
              method: 'manual_offline',
            });
          }
          
          const fallbackMsg = 'تم حفظ الحضور محلياً (فشل الاتصال بالخادم)';
          if (Platform.OS === 'web') {
            window.alert(fallbackMsg);
            goBack();
          } else {
            Alert.alert('تم الحفظ', fallbackMsg, [
              { text: 'حسناً', onPress: () => goBack() }
            ]);
          }
        } catch (offlineError) {
          const errorMsg = 'فشل في حفظ الحضور';
          if (Platform.OS === 'web') {
            window.alert(errorMsg);
          } else {
            Alert.alert('خطأ', errorMsg);
          }
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const renderStudent = ({ item, index }: { item: EnrolledStudent; index: number }) => {
    const status = attendance[item.id] || 'present';
    const statusStyle = getStatusStyle(status);

    return (
      <TouchableOpacity
        style={styles.studentCard}
        onPress={() => toggleStatus(item.id)}
      >
        <Text style={styles.studentIndex}>{index + 1}</Text>
        <View style={styles.studentInfo}>
          <Text style={styles.studentName}>{item.full_name}</Text>
          <Text style={styles.studentId}>{item.student_id}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.color }]}>
            {statusStyle.label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return <LoadingScreen />;
  }

  const presentCount = Object.values(attendance).filter(s => s === 'present').length;
  const absentCount = Object.values(attendance).filter(s => s === 'absent').length;
  const excusedCount = Object.values(attendance).filter(s => s === 'excused').length;

  const displayName = course?.name || courseName || 'المقرر';
  const displayDate = lecture?.date ? formatGregorianDate(parseDate(lecture.date), { includeWeekday: true }) : formatGregorianDate(new Date(), { includeWeekday: true });
  
  // التحقق من إمكانية التحضير
  const canTakeAttendanceNow = attendanceStatus?.can_take_attendance !== false;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'تسجيل الحضور',
          headerBackTitle: 'رجوع',
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* عرض رسالة الخطأ */}
        {errorMessage && (
          <View style={styles.errorContainer} data-testid="attendance-error-container">
            <Ionicons name="alert-circle" size={48} color="#f44336" />
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>تعذر تحميل البيانات</Text>
              <Text style={styles.errorText} data-testid="attendance-error-message">{errorMessage}</Text>
            </View>
            <TouchableOpacity 
              style={styles.retryButton}
              data-testid="attendance-retry-btn"
              onPress={() => {
                setErrorMessage(null);
                setLoading(true);
                fetchData();
              }}
            >
              <Ionicons name="refresh" size={20} color="#fff" />
              <Text style={styles.retryText}>إعادة المحاولة</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.backButtonError}
              data-testid="attendance-back-btn"
              onPress={() => goBack()}
            >
              <Ionicons name="arrow-back" size={18} color="#1565c0" />
              <Text style={styles.backButtonText}>العودة للمحاضرات</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Header */}
        {!errorMessage && (
        <View style={styles.courseHeader}>
          <Text style={styles.courseTitle}>{displayName}</Text>
          {lecture && (
            <View style={styles.lectureInfo}>
              <Text style={styles.dateText}>📅 {WEEKDAYS_AR[parseDate(lecture.date).getDay()]}، {formatGregorianDate(parseDate(lecture.date), { includeYear: false })}</Text>
              <Text style={styles.hijriText}>{formatHijriDate(parseDate(lecture.date))}</Text>
              <Text style={styles.timeText}>🕐 {lecture.start_time} - {lecture.end_time}</Text>
              {lecture.room && <Text style={styles.roomText}>📍 {lecture.room}</Text>}
            </View>
          )}
          
          {/* حالة التحضير */}
          {attendanceStatus && (
            <View style={[
              styles.attendanceStatusBar,
              { backgroundColor: attendanceStatus.can_take_attendance ? '#e8f5e9' : 
                attendanceStatus.status === 'completed' ? '#e3f2fd' : '#ffebee' }
            ]}>
              <Ionicons 
                name={attendanceStatus.can_take_attendance ? 'checkmark-circle' : 
                      attendanceStatus.status === 'completed' ? 'lock-closed' : 'time-outline'} 
                size={18} 
                color={attendanceStatus.can_take_attendance ? '#4caf50' : 
                       attendanceStatus.status === 'completed' ? '#1565c0' : '#f44336'} 
              />
              <Text style={[
                styles.attendanceStatusText,
                { color: attendanceStatus.can_take_attendance ? '#4caf50' : 
                         attendanceStatus.status === 'completed' ? '#1565c0' : '#f44336' }
              ]}>
                {attendanceStatus.reason}
              </Text>
              {attendanceStatus.minutes_remaining && (
                <Text style={styles.attendanceDeadline}>
                  (متبقي {attendanceStatus.minutes_remaining} دقيقة)
                </Text>
              )}
            </View>
          )}
          
          {attendanceRecorded && !attendanceStatus && (
            <View style={styles.recordedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={styles.recordedText}>تم تسجيل الحضور مسبقاً</Text>
            </View>
          )}
        </View>
        )}

        {/* Stats Bar */}
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{students.length}</Text>
            <Text style={styles.statLabel}>إجمالي</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#4caf50' }]}>{presentCount}</Text>
            <Text style={styles.statLabel}>حاضر</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#f44336' }]}>{absentCount}</Text>
            <Text style={styles.statLabel}>غائب</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#ff9800' }]}>{excusedCount}</Text>
            <Text style={styles.statLabel}>معذور</Text>
          </View>
        </View>

        {/* QR Button */}
        {lectureId && (
          <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 8, gap: 10 }}>
            <TouchableOpacity
              style={styles.qrButton}
              onPress={() => router.push({
                pathname: '/qr-scanner',
                params: { lectureId }
              })}
            >
              <Ionicons name="qr-code" size={20} color="#fff" />
              <Text style={styles.qrButtonText}>مسح QR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.qrButton, { backgroundColor: '#1565c0' }]}
              onPress={handleExportPdf}
              disabled={exportingPdf}
              data-testid="export-pdf-btn"
            >
              {exportingPdf ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="document-text" size={20} color="#fff" />
              )}
              <Text style={styles.qrButtonText}>تصدير PDF</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Student List */}
        {students.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>لا يوجد طلاب مسجلين في هذا المقرر</Text>
            <Text style={styles.emptySubtext}>
              قم بإضافة طلاب من صفحة "طلاب المقرر"
            </Text>
          </View>
        ) : (
          <FlatList
            data={students}
            renderItem={renderStudent}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
          />
        )}

        {/* Save Button - Only visible if user has permission AND attendance is allowed */}
        {students.length > 0 && (canRecordAttendance || canEditAttendance) && canTakeAttendanceNow && (
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={saveAttendance}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.saveButtonText}>
                  {attendanceRecorded ? 'تحديث الحضور' : 'حفظ الحضور'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
        
        {/* Message if attendance is not allowed */}
        {students.length > 0 && !canTakeAttendanceNow && attendanceStatus && (
          <View style={[styles.noPermissionBanner, { backgroundColor: 
            attendanceStatus.status === 'completed' ? '#e3f2fd' : 
            attendanceStatus.status === 'not_started' ? '#fff3e0' : '#ffebee' 
          }]}>
            <Ionicons 
              name={attendanceStatus.status === 'completed' ? 'lock-closed' : 
                    attendanceStatus.status === 'not_started' ? 'time-outline' : 'close-circle'} 
              size={20} 
              color={attendanceStatus.status === 'completed' ? '#1565c0' : 
                     attendanceStatus.status === 'not_started' ? '#ff9800' : '#f44336'} 
            />
            <Text style={[styles.noPermissionText, { 
              color: attendanceStatus.status === 'completed' ? '#1565c0' : 
                     attendanceStatus.status === 'not_started' ? '#ff9800' : '#f44336' 
            }]}>
              {attendanceStatus.reason}
            </Text>
          </View>
        )}
        
        {/* Message if user doesn't have permission */}
        {students.length > 0 && !canRecordAttendance && !canEditAttendance && canTakeAttendanceNow && (
          <View style={styles.noPermissionBanner}>
            <Ionicons name="lock-closed" size={20} color="#ff9800" />
            <Text style={styles.noPermissionText}>عرض فقط - ليس لديك صلاحية تسجيل الحضور</Text>
          </View>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  courseHeader: {
    backgroundColor: '#1565c0',
    padding: 16,
  },
  courseTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  lectureInfo: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  dateText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  hijriText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  timeText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  roomText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  recordedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 10,
    gap: 6,
  },
  recordedText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  attendanceStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
    gap: 8,
  },
  attendanceStatusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  attendanceDeadline: {
    fontSize: 11,
    color: '#666',
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  qrButton: {
    flexDirection: 'row',
    backgroundColor: '#7b1fa2',
    margin: 16,
    padding: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  studentCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  studentIndex: {
    width: 30,
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    textAlign: 'center',
  },
  studentInfo: {
    flex: 1,
    marginHorizontal: 12,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  studentId: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 70,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 8,
    textAlign: 'center',
  },
  saveButton: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#4caf50',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  noPermissionBanner: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#fff3e0',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#ffcc80',
  },
  noPermissionText: {
    color: '#e65100',
    fontSize: 14,
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  errorContent: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f44336',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    backgroundColor: '#1565c0',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButtonError: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 6,
  },
  backButtonText: {
    color: '#1565c0',
    fontSize: 16,
  },
});
