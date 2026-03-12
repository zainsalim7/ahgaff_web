import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
  Modal,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import api, { coursesAPI, lecturesAPI, settingsAPI } from '../src/services/api';
import { LoadingScreen } from '../src/components/LoadingScreen';
import AddLectureModal, { LectureFormData } from '../src/components/AddLectureModal';
import { useAuthStore } from '../src/store/authStore';
import { PERMISSIONS } from '../src/contexts/AuthContext';
import { formatGregorianDate, formatHijriDate, parseDate, WEEKDAYS_AR } from '../src/utils/dateUtils';
import { goBack, goHome } from '../src/utils/navigation';

interface Lecture {
  id: string;
  course_id: string;
  date: string;
  start_time: string;
  end_time: string;
  room: string;
  status: string;
  notes: string;
}

const DAYS = [
  { id: 'saturday', name: 'السبت', num: 6 },
  { id: 'sunday', name: 'الأحد', num: 0 },
  { id: 'monday', name: 'الإثنين', num: 1 },
  { id: 'tuesday', name: 'الثلاثاء', num: 2 },
  { id: 'wednesday', name: 'الأربعاء', num: 3 },
  { id: 'thursday', name: 'الخميس', num: 4 },
  { id: 'friday', name: 'الجمعة', num: 5 },
];

// أوقات المحاضرات: من 01:00 إلى 00:00 بفواصل ربع ساعة
const TIME_SLOTS: string[] = [];
for (let h = 1; h <= 23; h++) {
  const hh = h.toString().padStart(2, '0');
  TIME_SLOTS.push(`${hh}:00`, `${hh}:15`, `${hh}:30`, `${hh}:45`);
}
TIME_SLOTS.push('00:00');

const STATUS_LABELS: { [key: string]: { label: string; color: string } } = {
  scheduled: { label: 'مجدولة', color: '#2196f3' },
  completed: { label: 'منعقدة', color: '#4caf50' },
  cancelled: { label: 'ملغاة', color: '#f44336' },
  absent: { label: 'غائب', color: '#ff9800' },
};

interface DayScheduleConfig {
  day: string;
  enabled: boolean;
  slots: { start_time: string; end_time: string }[];
}

export default function CourseLecturesScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const router = useRouter();
  
  // استخدام Zustand store للمصادقة
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);
  
  // فحص الصلاحيات
  const hasPermission = (permission: string) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.permissions?.includes(permission) || false;
  };
  
  // الطالب لا يمكنه الوصول لهذه الصفحة
  const isStudent = user?.role === 'student';
  
  // فقط المدير ومن لديه صلاحية manage_lectures يمكنهم إدارة المحاضرات
  const isTeacher = user?.role === 'teacher';
  const canManageLectures = !isTeacher && !isStudent && (hasPermission(PERMISSIONS.MANAGE_LECTURES) || user?.role === 'admin');
  const canOverrideStatus = hasPermission(PERMISSIONS.OVERRIDE_LECTURE_STATUS);
  const canReschedule = hasPermission(PERMISSIONS.RESCHEDULE_LECTURE) || user?.role === 'admin';
  
  // إعادة توجيه الطالب
  useEffect(() => {
    if (!authLoading && isStudent) {
      router.replace('/');
    }
  }, [isStudent, authLoading]);
  
  const [course, setCourse] = useState<any>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  
  // إشعارات مرئية
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };
  
  // تحديد المحاضرات للحذف
  const [selectedLectures, setSelectedLectures] = useState<Set<string>>(new Set());
  
  // إعادة جدولة
  const [rescheduleModal, setRescheduleModal] = useState<{lectureId: string; courseName: string; oldDate: string} | null>(null);
  const [rescheduleData, setRescheduleData] = useState({ date: '', start_time: '08:00', end_time: '09:00' });
  const [rescheduling, setRescheduling] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // === فلترة وتنظيم المحاضرات ===
  const [viewMode, setViewMode] = useState<'month' | 'list' | 'week'>('month');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  
  // أسماء الأشهر بالعربية
  const MONTHS_AR = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  
  // تجميع المحاضرات حسب الشهر
  const groupLecturesByMonth = useCallback(() => {
    const groups: { [key: string]: Lecture[] } = {};
    
    lectures.forEach(lecture => {
      const date = parseDate(lecture.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = `${MONTHS_AR[date.getMonth()]} ${date.getFullYear()}`;
      
      if (!groups[monthKey]) {
        groups[monthKey] = [];
      }
      groups[monthKey].push(lecture);
    });
    
    // ترتيب حسب التاريخ داخل كل شهر
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });
    
    return groups;
  }, [lectures]);
  
  // الحصول على قائمة الأشهر المتاحة
  const getAvailableMonths = useCallback(() => {
    const months = new Set<string>();
    lectures.forEach(lecture => {
      const date = parseDate(lecture.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.add(monthKey);
    });
    return Array.from(months).sort();
  }, [lectures]);
  
  // فلترة المحاضرات
  const getFilteredLectures = useCallback(() => {
    let filtered = [...lectures];
    
    // فلترة حسب الحالة
    if (selectedStatus) {
      filtered = filtered.filter(l => l.status === selectedStatus);
    }
    
    // فلترة حسب الشهر
    if (selectedMonth) {
      filtered = filtered.filter(l => {
        const date = parseDate(l.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return monthKey === selectedMonth;
      });
    }
    
    return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [lectures, selectedStatus, selectedMonth]);
  
  // إحصائيات سريعة
  const getStats = useCallback(() => {
    const total = lectures.length;
    const scheduled = lectures.filter(l => l.status === 'scheduled').length;
    const completed = lectures.filter(l => l.status === 'completed').length;
    const cancelled = lectures.filter(l => l.status === 'cancelled').length;
    const absent = lectures.filter(l => l.status === 'absent').length;
    return { total, scheduled, completed, cancelled, absent };
  }, [lectures]);
  
  // تبديل توسيع/طي الشهر
  const toggleMonth = (monthKey: string) => {
    const newExpanded = new Set(expandedMonths);
    if (newExpanded.has(monthKey)) {
      newExpanded.delete(monthKey);
    } else {
      newExpanded.add(monthKey);
    }
    setExpandedMonths(newExpanded);
  };
  
  // إعدادات الفصل
  const [semesterSettings, setSemesterSettings] = useState<{
    start: string | null;
    end: string | null;
    current: string;
  } | null>(null);
  
  // نموذج إدخال التواريخ
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');
  const [savingDates, setSavingDates] = useState(false);
  
  // توليد المحاضرات
  const [generateRoom, setGenerateRoom] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [dayConfigs, setDayConfigs] = useState<DayScheduleConfig[]>(
    DAYS.map(d => ({
      day: d.id,
      enabled: false,
      slots: [{ start_time: '08:00', end_time: '09:30' }],
    }))
  );

  const fetchData = useCallback(async () => {
    if (!courseId) return;
    
    try {
      const [courseRes, lecturesRes, settingsRes] = await Promise.all([
        coursesAPI.getById(courseId),
        lecturesAPI.getByCourse(courseId),
        settingsAPI.get(),
      ]);
      
      setCourse(courseRes.data);
      setLectures(lecturesRes.data);
      
      // محاولة جلب تواريخ الفصل من الإعدادات
      let semStart = settingsRes.data.semester_start_date;
      let semEnd = settingsRes.data.semester_end_date;
      let semName = settingsRes.data.current_semester || 'الفصل الحالي';
      
      // إذا لم تكن التواريخ متوفرة، جلب من الفصل النشط مباشرة
      if (!semStart || !semEnd) {
        try {
          const currentSemRes = await api.get('/semesters/current');
          if (currentSemRes.data) {
            semStart = semStart || currentSemRes.data.start_date;
            semEnd = semEnd || currentSemRes.data.end_date;
            semName = semName || currentSemRes.data.name;
          }
        } catch (e) {
          console.log('Error fetching current semester:', e);
        }
      }
      
      setSemesterSettings({
        start: semStart,
        end: semEnd,
        current: semName,
      });
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('خطأ', 'فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // حفظ محاضرة جديدة باستخدام المكون الموحد
  const handleSaveLecture = async (data: LectureFormData) => {
    try {
      await lecturesAPI.create(courseId!, {
        date: data.date,
        start_time: data.start_time,
        end_time: data.end_time,
        room: data.room,
        notes: data.notes || '',
      });
      Alert.alert('نجاح', 'تم إضافة المحاضرة');
      showNotification('success', 'تم إضافة المحاضرة بنجاح');
      fetchData();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'حدث خطأ';
      showNotification('error', message);
      throw error;
    }
  };

  // فتح نموذج التوليد مباشرة بدون أي شروط
  const openGenerateModal = () => {
    // التواريخ فارغة - المستخدم يحدد بنفسه
    setTempStartDate('');
    setTempEndDate('');
    
    setGenerateRoom('');
    setGenerateError('');
    setDayConfigs(DAYS.map(d => ({
      day: d.id,
      enabled: false,
      slots: [{ start_time: '08:00', end_time: '09:30' }],
    })));
    setShowGenerateModal(true);
  };

  // ====== دوال تحديد وحذف المحاضرات ======
  
  // تفعيل/إلغاء وضع التحديد
  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedLectures(new Set());
  };

  // تحديد/إلغاء تحديد محاضرة واحدة
  const toggleLectureSelection = (lectureId: string) => {
    const newSelected = new Set(selectedLectures);
    if (newSelected.has(lectureId)) {
      newSelected.delete(lectureId);
    } else {
      newSelected.add(lectureId);
    }
    setSelectedLectures(newSelected);
  };

  // تحديد الكل / إلغاء تحديد الكل
  const toggleSelectAll = () => {
    if (selectedLectures.size === lectures.length) {
      setSelectedLectures(new Set());
    } else {
      setSelectedLectures(new Set(lectures.map(l => l.id)));
    }
  };

  // حذف المحاضرات المحددة
  const deleteSelectedLectures = async () => {
    if (selectedLectures.size === 0) {
      Alert.alert('تنبيه', 'الرجاء تحديد محاضرات للحذف');
      return;
    }

    const confirmMessage = selectedLectures.size === lectures.length 
      ? `هل أنت متأكد من حذف جميع المحاضرات (${lectures.length} محاضرة)؟`
      : `هل أنت متأكد من حذف ${selectedLectures.size} محاضرة؟`;

    Alert.alert(
      'تأكيد الحذف',
      confirmMessage,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const deletePromises = Array.from(selectedLectures).map(id => 
                lecturesAPI.delete(id)
              );
              await Promise.all(deletePromises);
              Alert.alert('نجاح', `تم حذف ${selectedLectures.size} محاضرة`);
              setSelectedLectures(new Set());
              setSelectionMode(false);
              fetchData();
            } catch (error) {
              console.error('Error deleting lectures:', error);
              Alert.alert('خطأ', 'حدث خطأ أثناء حذف المحاضرات');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  // حذف جميع المحاضرات
  const deleteAllLectures = () => {
    if (lectures.length === 0) {
      Alert.alert('تنبيه', 'لا توجد محاضرات للحذف');
      return;
    }

    Alert.alert(
      'حذف جميع المحاضرات',
      `هل أنت متأكد من حذف جميع المحاضرات (${lectures.length} محاضرة)؟\n\nهذا الإجراء لا يمكن التراجع عنه!`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف الكل',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const deletePromises = lectures.map(l => lecturesAPI.delete(l.id));
              await Promise.all(deletePromises);
              Alert.alert('نجاح', `تم حذف جميع المحاضرات (${lectures.length})`);
              setSelectionMode(false);
              fetchData();
            } catch (error) {
              console.error('Error deleting all lectures:', error);
              Alert.alert('خطأ', 'حدث خطأ أثناء حذف المحاضرات');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  // تفعيل/تعطيل يوم
  const toggleDay = (dayId: string) => {
    setDayConfigs(prev => prev.map(config =>
      config.day === dayId ? { ...config, enabled: !config.enabled } : config
    ));
  };

  // تحديث وقت محاضرة
  const updateSlotTime = (dayId: string, slotIndex: number, field: 'start_time' | 'end_time', value: string) => {
    setDayConfigs(prev => prev.map(config => {
      if (config.day === dayId) {
        const newSlots = [...config.slots];
        newSlots[slotIndex] = { ...newSlots[slotIndex], [field]: value };
        return { ...config, slots: newSlots };
      }
      return config;
    }));
  };

  // إضافة محاضرة لليوم
  const addSlotToDay = (dayId: string) => {
    setDayConfigs(prev => prev.map(config => {
      if (config.day === dayId) {
        const lastSlot = config.slots[config.slots.length - 1];
        const lastEnd = lastSlot.end_time;
        const [hours, mins] = lastEnd.split(':').map(Number);
        const newStart = `${String(Math.min(hours + 1, 20)).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
        const newEnd = `${String(Math.min(hours + 2, 21)).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
        return {
          ...config,
          slots: [...config.slots, { start_time: newStart, end_time: newEnd }],
        };
      }
      return config;
    }));
  };

  // حذف محاضرة من اليوم
  const removeSlotFromDay = (dayId: string, slotIndex: number) => {
    setDayConfigs(prev => prev.map(config => {
      if (config.day === dayId && config.slots.length > 1) {
        return {
          ...config,
          slots: config.slots.filter((_, i) => i !== slotIndex),
        };
      }
      return config;
    }));
  };

  // توليد المحاضرات
  const handleGenerateLectures = async () => {
    setGenerateError('');
    
    if (!tempStartDate || !tempEndDate) {
      setGenerateError('الرجاء اختيار تاريخ البداية والنهاية');
      return;
    }
    if (tempStartDate >= tempEndDate) {
      setGenerateError('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
      return;
    }
    if (!generateRoom.trim()) {
      setGenerateError('الرجاء إدخال رقم القاعة');
      return;
    }

    const enabledDays = dayConfigs.filter(d => d.enabled);
    if (enabledDays.length === 0) {
      setGenerateError('الرجاء اختيار يوم واحد على الأقل');
      return;
    }

    if (!confirm(`هل أنت متأكد من توليد المحاضرات من ${tempStartDate} إلى ${tempEndDate}؟`)) return;

    const scheduleConfig = enabledDays.map(d => ({
      day: d.day,
      slots: d.slots,
    }));

    setGenerating(true);
    try {
      const response = await lecturesAPI.generateBulk({
        course_id: courseId!,
        room: generateRoom.trim(),
        schedule: scheduleConfig,
        start_date: tempStartDate,
        end_date: tempEndDate,
      });

      const count = response.data.lectures_created || 0;
      showNotification('success', `تم توليد ${count} محاضرة بنجاح`);
      setShowGenerateModal(false);
      fetchData();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'فشل في توليد المحاضرات';
      showNotification('error', message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteLecture = async (lectureId: string) => {
    if (!confirm('هل تريد حذف هذه المحاضرة؟')) return;
    try {
      await lecturesAPI.delete(lectureId);
      showNotification('success', 'تم حذف المحاضرة');
      fetchData();
    } catch (error: any) {
      showNotification('error', 'فشل في حذف المحاضرة');
    }
  };

  const handleCancelLecture = async (lectureId: string) => {
    if (!confirm('هل أنت متأكد من إلغاء هذه المحاضرة؟')) return;
    try {
      await lecturesAPI.update(lectureId, { status: 'cancelled' });
      showNotification('success', 'تم إلغاء المحاضرة');
      fetchData();
    } catch (error: any) {
      showNotification('error', 'فشل في إلغاء المحاضرة');
    }
  };

  const handleChangeStatus = async (lectureId: string, newStatus: string) => {
    const statusNames: { [key: string]: string } = {
      scheduled: 'مجدولة',
      completed: 'منعقدة',
      cancelled: 'ملغاة',
      absent: 'غائب',
    };
    if (!confirm(`هل تريد تغيير حالة المحاضرة إلى "${statusNames[newStatus]}"؟`)) return;
    try {
      await lecturesAPI.updateStatus(lectureId, newStatus);
      showNotification('success', `تم تغيير الحالة إلى: ${statusNames[newStatus]}`);
      fetchData();
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'فشل في تغيير حالة المحاضرة';
      showNotification('error', msg);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleModal) return;
    if (!rescheduleData.date) {
      if (Platform.OS === 'web') window.alert('يرجى اختيار التاريخ الجديد');
      return;
    }
    if (rescheduleData.start_time && rescheduleData.end_time && rescheduleData.end_time <= rescheduleData.start_time) {
      if (Platform.OS === 'web') window.alert('وقت النهاية يجب أن يكون بعد وقت البداية');
      return;
    }
    setRescheduling(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${API_URL}/api/lectures/${rescheduleModal.lectureId}/reschedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(rescheduleData),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('success', data.message || 'تم إعادة الجدولة بنجاح');
        setRescheduleModal(null);
        fetchData();
      } else {
        showNotification('error', data.detail || 'فشل في إعادة الجدولة');
      }
    } catch (error: any) {
      showNotification('error', error.message || 'فشل في إعادة الجدولة');
    } finally {
      setRescheduling(false);
    }
  };


  const renderLecture = ({ item }: { item: Lecture }) => {
    const statusInfo = STATUS_LABELS[item.status] || STATUS_LABELS.scheduled;
    const isSelected = selectedLectures.has(item.id);
    
    return (
      <TouchableOpacity
        style={[styles.lectureCard, isSelected && styles.lectureCardSelected]}
        onPress={() => {
          if (selectionMode) {
            toggleLectureSelection(item.id);
          } else {
            router.push({ pathname: '/take-attendance', params: { lectureId: item.id } });
          }
        }}
        onLongPress={() => {
          if (!selectionMode && canManageLectures) {
            setSelectionMode(true);
            toggleLectureSelection(item.id);
          }
        }}
      >
        {/* Checkbox للتحديد */}
        {selectionMode && (
          <TouchableOpacity 
            style={styles.checkbox}
            onPress={() => toggleLectureSelection(item.id)}
          >
            <Ionicons 
              name={isSelected ? "checkbox" : "square-outline"} 
              size={24} 
              color={isSelected ? "#1565c0" : "#666"} 
            />
          </TouchableOpacity>
        )}
        
        <View style={selectionMode ? styles.lectureContentWithCheckbox : styles.lectureContentFull}>
          <View style={styles.lectureHeader}>
            <View>
              <Text style={styles.lectureDay}>{WEEKDAYS_AR[parseDate(item.date).getDay()]}</Text>
              <Text style={styles.lectureDate}>{formatGregorianDate(parseDate(item.date), { includeYear: false })}</Text>
              <Text style={styles.lectureHijri}>{formatHijriDate(parseDate(item.date), { includeYear: false })}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
              <Text style={styles.statusText}>{statusInfo.label}</Text>
            </View>
          </View>
          
          <View style={styles.lectureDetails}>
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={16} color="#666" />
              <Text style={styles.detailText}>{item.start_time} - {item.end_time}</Text>
            </View>
            {item.room && (
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={16} color="#666" />
                <Text style={styles.detailText}>{item.room}</Text>
              </View>
            )}
          </View>
          
          {!selectionMode && (
            <View style={styles.lectureActions}>
              {item.status === 'scheduled' && (
                <>
                  <TouchableOpacity
                    style={styles.attendanceBtn}
                    onPress={() => router.push({ pathname: '/take-attendance', params: { lectureId: item.id } })}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.attendanceBtnText}>تسجيل الحضور</Text>
                  </TouchableOpacity>
                  {canManageLectures && (
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => handleCancelLecture(item.id)}
                    >
                      <Ionicons name="close-circle" size={20} color="#f44336" />
                    </TouchableOpacity>
                  )}
                </>
              )}
              {item.status === 'completed' && (
                <TouchableOpacity
                  style={[styles.attendanceBtn, { backgroundColor: '#4caf50' }]}
                  onPress={() => router.push({ pathname: '/take-attendance', params: { lectureId: item.id } })}
                >
                  <Ionicons name="eye" size={20} color="#fff" />
                  <Text style={styles.attendanceBtnText}>عرض الحضور</Text>
                </TouchableOpacity>
              )}
              {item.status === 'absent' && (
                <>
                  {canReschedule && (
                    <TouchableOpacity
                      style={[styles.attendanceBtn, { backgroundColor: '#ff9800' }]}
                      onPress={() => {
                        setRescheduleData({ date: '', start_time: item.start_time || '08:00', end_time: item.end_time || '09:00' });
                        setRescheduleModal({ lectureId: item.id, courseName: course?.name || '', oldDate: item.date });
                      }}
                      data-testid={`reschedule-${item.id}`}
                    >
                      <Ionicons name="calendar" size={20} color="#fff" />
                      <Text style={styles.attendanceBtnText}>إعادة جدولة</Text>
                    </TouchableOpacity>
                  )}
                  {canOverrideStatus && (
                    <TouchableOpacity
                      style={[styles.attendanceBtn, { backgroundColor: '#607d8b' }]}
                      onPress={() => handleChangeStatus(item.id, 'scheduled')}
                      data-testid={`override-absent-${item.id}`}
                    >
                      <Ionicons name="refresh" size={20} color="#fff" />
                      <Text style={styles.attendanceBtnText}>تغيير الحالة</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              {item.status === 'scheduled' && canReschedule && (
                <TouchableOpacity
                  style={[styles.cancelBtn, { backgroundColor: '#ff980020', borderColor: '#ff9800' }]}
                  onPress={() => {
                    setRescheduleData({ date: '', start_time: item.start_time || '08:00', end_time: item.end_time || '09:00' });
                    setRescheduleModal({ lectureId: item.id, courseName: course?.name || '', oldDate: item.date });
                  }}
                  data-testid={`reschedule-scheduled-${item.id}`}
                >
                  <Ionicons name="calendar" size={20} color="#ff9800" />
                </TouchableOpacity>
              )}
              {canManageLectures && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteLecture(item.id)}
                >
                  <Ionicons name="trash" size={20} color="#f44336" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'محاضرات المقرر',
          headerBackTitle: 'رجوع',
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* شريط الإشعارات */}
        {notification && (
          <TouchableOpacity
            onPress={() => setNotification(null)}
            style={{
              backgroundColor: notification.type === 'success' ? '#4caf50' : '#f44336',
              padding: 14,
              marginHorizontal: 16,
              marginTop: 8,
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            data-testid="notification-banner"
          >
            <Ionicons name={notification.type === 'success' ? 'checkmark-circle' : 'alert-circle'} size={20} color="#fff" />
            <Text style={{ color: '#fff', marginLeft: 8, fontWeight: '600', fontSize: 15 }}>{notification.message}</Text>
          </TouchableOpacity>
        )}
        {/* Course Info */}
        <View style={styles.courseInfo}>
          <Text style={styles.courseName}>{course?.name}</Text>
          <Text style={styles.courseCode}>{course?.code}</Text>
        </View>

        {/* إحصائيات سريعة */}
        <View style={{ flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12, borderRadius: 12, overflow: 'hidden' }} data-testid="lectures-stats-bar">
          {[
            { key: null, label: 'الكل', count: getStats().total, color: '#333', bgActive: '#e3f2fd' },
            { key: 'scheduled', label: 'مجدولة', count: getStats().scheduled, color: '#2196f3', bgActive: '#e3f2fd' },
            { key: 'completed', label: 'منعقدة', count: getStats().completed, color: '#4caf50', bgActive: '#e8f5e9' },
            { key: 'cancelled', label: 'ملغاة', count: getStats().cancelled, color: '#f44336', bgActive: '#ffebee' },
            { key: 'absent', label: 'غائب', count: getStats().absent, color: '#ff9800', bgActive: '#fff3e0' },
          ].map((stat) => (
            <TouchableOpacity
              key={stat.key || 'all'}
              onPress={() => setSelectedStatus(stat.key === selectedStatus ? null : stat.key)}
              data-testid={`stat-${stat.key || 'all'}`}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 12,
                borderRightWidth: 1,
                borderRightColor: '#f0f0f0',
                backgroundColor: selectedStatus === stat.key || (!selectedStatus && stat.key === null) ? stat.bgActive : 'transparent',
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: stat.color }}>{stat.count}</Text>
              <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{stat.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* فلترة حسب الشهر */}
        {getAvailableMonths().length > 0 && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.monthsFilter}
            contentContainerStyle={styles.monthsFilterContent}
          >
            <TouchableOpacity
              style={[styles.monthChip, !selectedMonth && styles.monthChipActive]}
              onPress={() => setSelectedMonth(null)}
            >
              <Text style={[styles.monthChipText, !selectedMonth && styles.monthChipTextActive]}>
                كل الأشهر
              </Text>
            </TouchableOpacity>
            {getAvailableMonths().map(monthKey => {
              const [year, month] = monthKey.split('-');
              const monthName = MONTHS_AR[parseInt(month) - 1];
              const count = groupLecturesByMonth()[monthKey]?.length || 0;
              return (
                <TouchableOpacity
                  key={monthKey}
                  style={[styles.monthChip, selectedMonth === monthKey && styles.monthChipActive]}
                  onPress={() => setSelectedMonth(selectedMonth === monthKey ? null : monthKey)}
                >
                  <Text style={[styles.monthChipText, selectedMonth === monthKey && styles.monthChipTextActive]}>
                    {monthName} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Action Buttons - Only for authorized users */}
        {canManageLectures && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.actionBtnText}>إضافة</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionBtn, styles.generateBtnStyle]}
              onPress={openGenerateModal}
            >
              <Ionicons name="flash" size={20} color="#fff" />
              <Text style={styles.actionBtnText}>توليد</Text>
            </TouchableOpacity>

            {lectures.length > 0 && (
              <TouchableOpacity
                style={[styles.actionBtn, selectionMode ? styles.selectionActiveBtn : styles.selectionBtn]}
                onPress={toggleSelectionMode}
              >
                <Ionicons name={selectionMode ? "close" : "checkbox-outline"} size={20} color="#fff" />
                <Text style={styles.actionBtnText}>{selectionMode ? "إلغاء" : "تحديد"}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Selection Bar - يظهر عند تفعيل وضع التحديد */}
        {selectionMode && canManageLectures && (
          <View style={styles.selectionBar}>
            <View style={styles.selectionInfo}>
              <TouchableOpacity style={styles.selectAllBtn} onPress={toggleSelectAll}>
                <Ionicons 
                  name={selectedLectures.size === getFilteredLectures().length ? "checkbox" : "square-outline"} 
                  size={24} 
                  color="#1565c0" 
                />
                <Text style={styles.selectAllText}>
                  {selectedLectures.size === getFilteredLectures().length ? "إلغاء الكل" : "تحديد الكل"}
                </Text>
              </TouchableOpacity>
              <Text style={styles.selectedCount}>
                {selectedLectures.size} / {getFilteredLectures().length}
              </Text>
            </View>
            
            <View style={styles.selectionActions}>
              <TouchableOpacity 
                style={[styles.deleteSelectedBtn, selectedLectures.size === 0 && styles.disabledBtn]}
                onPress={deleteSelectedLectures}
                disabled={selectedLectures.size === 0 || deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="trash" size={18} color="#fff" />
                    <Text style={styles.deleteSelectedText}>حذف</Text>
                  </>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.deleteAllBtn}
                onPress={deleteAllLectures}
                disabled={deleting}
              >
                <Ionicons name="trash-bin" size={18} color="#fff" />
                <Text style={styles.deleteAllText}>حذف الكل</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Lectures List */}
        {getFilteredLectures().length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>
              {lectures.length === 0 ? 'لا توجد محاضرات' : 'لا توجد محاضرات تطابق الفلتر'}
            </Text>
            <Text style={styles.emptySubtext}>
              {lectures.length === 0 
                ? 'اضغط على "توليد" لإنشاء محاضرات الفصل الدراسي'
                : 'جرب تغيير الفلتر أو الشهر المحدد'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={getFilteredLectures()}
            keyExtractor={(item) => item.id}
            renderItem={renderLecture}
            contentContainerStyle={styles.listContent}
          />
        )}

        {/* Add Lecture Modal - Using the new unified component */}
        <AddLectureModal
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSave={handleSaveLecture}
          selectedCourseId={courseId}
          showCourseSelector={false}
          title="إضافة محاضرة"
        />

        {/* Generate Semester Lectures Modal */}
        <Modal
          visible={showGenerateModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowGenerateModal(false)}
        >
          <SafeAreaView style={styles.generateModalContainer}>
            <View style={styles.generateModalHeader}>
              <TouchableOpacity onPress={() => setShowGenerateModal(false)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
              <Text style={styles.generateModalTitle}>توليد محاضرات الفصل</Text>
              <View style={{ width: 28 }} />
            </View>

            <ScrollView style={styles.generateModalContent}>
              {/* فترة توليد المحاضرات - Date Pickers */}
              <View style={styles.generateSection}>
                <View style={styles.generateSectionHeader}>
                  <Ionicons name="calendar" size={20} color="#4caf50" />
                  <Text style={styles.generateSectionTitle}>فترة توليد المحاضرات</Text>
                </View>
                <View style={styles.semesterDatesBox}>
                  <View style={[styles.semesterDateItem, { flex: 1 }]}>
                    <Text style={styles.semesterDateLabel}>من تاريخ</Text>
                    {Platform.OS === 'web' ? (
                      <input
                        type="date"
                        value={tempStartDate}
                        onChange={(e: any) => setTempStartDate(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '8px',
                          border: '1px solid #e0e0e0',
                          fontSize: '14px',
                          backgroundColor: '#f9f9f9',
                          color: '#333',
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      <TextInput
                        style={styles.dateModalInput}
                        value={tempStartDate}
                        onChangeText={setTempStartDate}
                        placeholder="YYYY-MM-DD"
                      />
                    )}
                  </View>
                  <Ionicons name="arrow-forward" size={20} color="#999" style={{ marginHorizontal: 8, marginTop: 24 }} />
                  <View style={[styles.semesterDateItem, { flex: 1 }]}>
                    <Text style={styles.semesterDateLabel}>إلى تاريخ</Text>
                    {Platform.OS === 'web' ? (
                      <input
                        type="date"
                        value={tempEndDate}
                        onChange={(e: any) => setTempEndDate(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '8px',
                          border: '1px solid #e0e0e0',
                          fontSize: '14px',
                          backgroundColor: '#f9f9f9',
                          color: '#333',
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      <TextInput
                        style={styles.dateModalInput}
                        value={tempEndDate}
                        onChangeText={setTempEndDate}
                        placeholder="YYYY-MM-DD"
                      />
                    )}
                  </View>
                </View>
              </View>

              {/* Course Info */}
              <View style={styles.generateSection}>
                <View style={styles.generateSectionHeader}>
                  <Ionicons name="book" size={20} color="#ff9800" />
                  <Text style={styles.generateSectionTitle}>المقرر</Text>
                </View>
                <View style={styles.courseInfoBox}>
                  <Text style={styles.courseInfoName}>{course?.name}</Text>
                  <Text style={styles.courseInfoCode}>{course?.code}</Text>
                </View>
              </View>

              {/* Room */}
              <View style={styles.generateSection}>
                <View style={styles.generateSectionHeader}>
                  <Ionicons name="location" size={20} color="#9c27b0" />
                  <Text style={styles.generateSectionTitle}>القاعة</Text>
                </View>
                <TextInput
                  style={styles.roomInput}
                  value={generateRoom}
                  onChangeText={setGenerateRoom}
                  placeholder="أدخل رقم القاعة"
                  placeholderTextColor="#999"
                />
              </View>

              {/* Select Days */}
              <View style={styles.generateSection}>
                <View style={styles.generateSectionHeader}>
                  <Ionicons name="today" size={20} color="#1565c0" />
                  <Text style={styles.generateSectionTitle}>أيام المحاضرات وأوقاتها</Text>
                </View>
                <Text style={styles.generateHint}>
                  اختر الأيام وحدد أوقات المحاضرات لكل يوم
                </Text>

                {DAYS.map(day => {
                  const config = dayConfigs.find(d => d.day === day.id)!;
                  return (
                    <View key={day.id} style={styles.dayConfigCard}>
                      <View style={styles.dayConfigHeader}>
                        <View style={styles.dayConfigLeft}>
                          <Switch
                            value={config.enabled}
                            onValueChange={() => toggleDay(day.id)}
                            trackColor={{ false: '#e0e0e0', true: '#bbdefb' }}
                            thumbColor={config.enabled ? '#1565c0' : '#f4f3f4'}
                          />
                          <Text style={[
                            styles.dayConfigName,
                            config.enabled && styles.dayConfigNameActive
                          ]}>{day.name}</Text>
                        </View>
                        {config.enabled && (
                          <TouchableOpacity
                            style={styles.addSlotBtn}
                            onPress={() => addSlotToDay(day.id)}
                          >
                            <Ionicons name="add-circle" size={24} color="#4caf50" />
                          </TouchableOpacity>
                        )}
                      </View>

                      {config.enabled && (
                        <View style={styles.slotsContainer}>
                          {config.slots.map((slot, index) => (
                            <View key={index} style={styles.slotRow}>
                              <Text style={styles.slotLabel}>محاضرة {index + 1}</Text>
                              <View style={styles.slotTimes}>
                                <View style={styles.slotTimeBox}>
                                  <Text style={styles.slotTimeLabel}>من</Text>
                                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    {TIME_SLOTS.slice(0, 20).map(time => (
                                      <TouchableOpacity
                                        key={time}
                                        style={[
                                          styles.slotTimeBtn,
                                          slot.start_time === time && styles.slotTimeBtnActive
                                        ]}
                                        onPress={() => updateSlotTime(day.id, index, 'start_time', time)}
                                      >
                                        <Text style={[
                                          styles.slotTimeBtnText,
                                          slot.start_time === time && styles.slotTimeBtnTextActive
                                        ]}>{time}</Text>
                                      </TouchableOpacity>
                                    ))}
                                  </ScrollView>
                                </View>
                                <View style={styles.slotTimeBox}>
                                  <Text style={styles.slotTimeLabel}>إلى</Text>
                                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    {TIME_SLOTS.slice(0, 20).map(time => (
                                      <TouchableOpacity
                                        key={time}
                                        style={[
                                          styles.slotTimeBtn,
                                          slot.end_time === time && styles.slotTimeBtnActive
                                        ]}
                                        onPress={() => updateSlotTime(day.id, index, 'end_time', time)}
                                      >
                                        <Text style={[
                                          styles.slotTimeBtnText,
                                          slot.end_time === time && styles.slotTimeBtnTextActive
                                        ]}>{time}</Text>
                                      </TouchableOpacity>
                                    ))}
                                  </ScrollView>
                                </View>
                              </View>
                              {config.slots.length > 1 && (
                                <TouchableOpacity
                                  style={styles.removeSlotBtn}
                                  onPress={() => removeSlotFromDay(day.id, index)}
                                >
                                  <Ionicons name="trash" size={18} color="#f44336" />
                                </TouchableOpacity>
                              )}
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            {/* Generate Button */}
            <View style={styles.generateModalFooter}>
              {generateError ? (
                <View style={{ backgroundColor: '#ffebee', padding: 12, borderRadius: 8, marginBottom: 10, width: '100%' }}>
                  <Text style={{ color: '#c62828', textAlign: 'center', fontSize: 14, fontWeight: '600' }}>{generateError}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={[styles.generateButton, generating && styles.generateButtonDisabled]}
                onPress={handleGenerateLectures}
                disabled={generating}
              >
                {generating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="flash" size={22} color="#fff" />
                    <Text style={styles.generateButtonText}>توليد المحاضرات</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
      
      {/* Modal إعادة الجدولة */}
      {rescheduleModal && (
        <Modal visible={true} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 400 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 16, color: '#1a237e' }}>
                إعادة جدولة محاضرة
              </Text>
              <Text style={{ textAlign: 'center', color: '#666', marginBottom: 16 }}>
                {rescheduleModal.courseName} - {rescheduleModal.oldDate}
              </Text>
              
              {/* التاريخ الجديد */}
              <Text style={{ fontWeight: '600', marginBottom: 8, color: '#333' }}>التاريخ الجديد:</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 16, textAlign: 'center', fontSize: 16 }}
                placeholder="YYYY-MM-DD"
                value={rescheduleData.date}
                onChangeText={(text) => setRescheduleData(prev => ({ ...prev, date: text }))}
                data-testid="reschedule-date-input"
              />
              
              {/* وقت البداية */}
              <Text style={{ fontWeight: '600', marginBottom: 8, color: '#333' }}>وقت البداية:</Text>
              <View style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 16 }}>
                <select
                  value={rescheduleData.start_time}
                  onChange={(e: any) => setRescheduleData(prev => ({ ...prev, start_time: e.target.value }))}
                  style={{ padding: 12, fontSize: 16, border: 'none', borderRadius: 8, width: '100%', textAlign: 'center' }}
                  data-testid="reschedule-start-time"
                >
                  {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </View>
              
              {/* وقت النهاية */}
              <Text style={{ fontWeight: '600', marginBottom: 8, color: '#333' }}>وقت النهاية:</Text>
              <View style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 24 }}>
                <select
                  value={rescheduleData.end_time}
                  onChange={(e: any) => setRescheduleData(prev => ({ ...prev, end_time: e.target.value }))}
                  style={{ padding: 12, fontSize: 16, border: 'none', borderRadius: 8, width: '100%', textAlign: 'center' }}
                  data-testid="reschedule-end-time"
                >
                  {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </View>
              
              {/* الأزرار */}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#e0e0e0', padding: 14, borderRadius: 10, alignItems: 'center' }}
                  onPress={() => setRescheduleModal(null)}
                >
                  <Text style={{ fontWeight: '600', color: '#333' }}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#ff9800', padding: 14, borderRadius: 10, alignItems: 'center', opacity: rescheduling ? 0.6 : 1 }}
                  onPress={handleReschedule}
                  disabled={rescheduling}
                  data-testid="confirm-reschedule-btn"
                >
                  <Text style={{ fontWeight: '600', color: '#fff' }}>
                    {rescheduling ? 'جاري...' : 'إعادة الجدولة'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  courseInfo: {
    backgroundColor: '#1565c0',
    padding: 20,
    alignItems: 'center',
  },
  courseName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  courseCode: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  lectureCount: {
    fontSize: 16,
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  semesterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    margin: 16,
    marginBottom: 0,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  semesterInfoText: {
    fontSize: 13,
    color: '#2e7d32',
    flex: 1,
  },
  semesterWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    margin: 16,
    marginBottom: 0,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  semesterWarningText: {
    fontSize: 13,
    color: '#e65100',
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4caf50',
    padding: 14,
    borderRadius: 10,
    gap: 8,
  },
  generateBtnStyle: {
    backgroundColor: '#9c27b0',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  lectureCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  lectureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  lectureDay: {
    fontSize: 13,
    color: '#1565c0',
    fontWeight: '600',
  },
  lectureDate: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  lectureHijri: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  lectureDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
  },
  lectureActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  attendanceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1565c0',
    padding: 10,
    borderRadius: 8,
    gap: 6,
  },
  attendanceBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelBtn: {
    padding: 8,
  },
  deleteBtn: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 8,
    textAlign: 'center',
  },
  // Generate Modal Styles
  generateModalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  generateModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  generateModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  generateModalContent: {
    flex: 1,
  },
  generateSection: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 12,
  },
  generateSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  generateSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  generateHint: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  semesterDatesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  semesterDateItem: {
    alignItems: 'center',
  },
  semesterDateLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  semesterDateValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  courseInfoBox: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  courseInfoName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  courseInfoCode: {
    fontSize: 14,
    color: '#666',
  },
  roomInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    textAlign: 'right',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dayConfigCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  dayConfigHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#fff',
  },
  dayConfigLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dayConfigName: {
    fontSize: 15,
    color: '#666',
  },
  dayConfigNameActive: {
    color: '#1565c0',
    fontWeight: '600',
  },
  addSlotBtn: {
    padding: 4,
  },
  slotsContainer: {
    padding: 12,
    paddingTop: 0,
  },
  slotRow: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  slotLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1565c0',
    marginBottom: 8,
  },
  slotTimes: {
    gap: 8,
  },
  slotTimeBox: {
    marginBottom: 8,
  },
  slotTimeLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  slotTimeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    marginRight: 6,
  },
  slotTimeBtnActive: {
    backgroundColor: '#1565c0',
  },
  slotTimeBtnText: {
    fontSize: 13,
    color: '#666',
  },
  slotTimeBtnTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  removeSlotBtn: {
    alignSelf: 'flex-end',
    padding: 8,
    backgroundColor: '#ffebee',
    borderRadius: 8,
    marginTop: 8,
  },
  generateModalFooter: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  generateButton: {
    flexDirection: 'row',
    backgroundColor: '#4caf50',
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  generateButtonDisabled: {
    backgroundColor: '#bdbdbd',
  },
  generateButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  // Styles for selection mode
  selectionBtn: {
    backgroundColor: '#607d8b',
  },
  selectionActiveBtn: {
    backgroundColor: '#f44336',
  },
  selectionBar: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  selectionInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectAllText: {
    fontSize: 14,
    color: '#1565c0',
    fontWeight: '600',
  },
  selectedCount: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 10,
  },
  deleteSelectedBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#f44336',
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  deleteSelectedText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  deleteAllBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#d32f2f',
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  deleteAllText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  disabledBtn: {
    backgroundColor: '#bdbdbd',
  },
  // === Stats Bar ===
  statsBar: {
    flexDirection: 'row' as const,
    display: 'flex' as any,
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  statItem: {
    width: '25%' as any,
    alignItems: 'center' as const,
    paddingVertical: 12,
    borderRightWidth: 1,
    borderRightColor: '#f0f0f0',
  },
  statItemActive: {
    backgroundColor: '#e3f2fd',
  },
  statItemScheduled: {
    backgroundColor: '#e3f2fd',
  },
  statItemCompleted: {
    backgroundColor: '#e8f5e9',
  },
  statItemCancelled: {
    backgroundColor: '#ffebee',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  // === Month Filter ===
  monthsFilter: {
    marginTop: 12,
    minHeight: 44,
    maxHeight: 44,
    zIndex: 5,
    marginBottom: 4,
  },
  monthsFilterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  monthChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  monthChipActive: {
    backgroundColor: '#1565c0',
    borderColor: '#1565c0',
  },
  monthChipText: {
    fontSize: 13,
    color: '#666',
  },
  monthChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  lectureCardSelected: {
    backgroundColor: '#e3f2fd',
    borderColor: '#1565c0',
    borderWidth: 2,
  },
  checkbox: {
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lectureContentWithCheckbox: {
    flex: 1,
    marginRight: 8,
  },
  lectureContentFull: {
    flex: 1,
  },
  dateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  dateModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  dateModalSubtitle: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  dateModalLabel: {
    fontSize: 13,
    color: '#555',
    marginBottom: 4,
  },
  dateModalInput: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#333',
    textAlign: 'left',
  },
  dateModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 12,
  },
  dateModalCancelBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  dateModalCancelText: {
    color: '#666',
    fontWeight: '600',
  },
  dateModalSaveBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#1565c0',
    alignItems: 'center',
  },
  dateModalSaveText: {
    color: '#fff',
    fontWeight: '600',
  },
});
