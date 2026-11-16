import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { exportName, filenameFromResponse } from '../src/utils/exportName';
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
import api, { teachersAPI, teachingLoadAPI, coursesAPI, departmentsAPI, reportsAPI, scheduleAPI } from '../src/services/api';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { useAuth, PERMISSIONS } from '../src/contexts/AuthContext';

const DAYS_ORDER = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

interface Course {
  id: string;
  name: string;
  code: string;
  level: number;
  section: string;
  department_id: string;
  department_name: string;
  faculty_name: string;
  students_count: number;
  lectures_count: number;
  weekly_hours?: number;
  teaching_load_id?: string;
  is_active: boolean;
}

interface TeacherCoursesData {
  teacher_id: string;
  teacher_name: string;
  total_courses: number;
  total_weekly_hours: number;
  semester_id?: string;
  semester_name?: string;
  courses: Course[];
}

interface AvailableCourse {
  course_id: string;
  course_name: string;
  course_code: string;
  section: string;
  level: number;
  credit_hours: number;
  weekly_hours?: number | null;
  department_id?: string;
  department_name?: string;
  faculty_id?: string;
  faculty_name?: string;
  semester_id?: string;
  current_teacher_name?: string;
}

export default function TeacherCoursesScreen() {
  const { teacherId, teacherName } = useLocalSearchParams<{ teacherId: string; teacherName?: string }>();
  const router = useRouter();

  // 🔒 صلاحيات إسناد المقررات للمعلمين
  const { hasPermission, user } = useAuth();
  const canAssign = hasPermission(PERMISSIONS.MANAGE_TEACHING_LOAD);
  const userRole = (user as any)?.role;
  const isAdmin = userRole === 'admin' || userRole === 'university_president';
  // 🔒 ملكية القسم/الكلية: ندعم multi-department (department_ids) و multi-faculty (faculty_ids)
  const userDeptIds: string[] = Array.isArray((user as any)?.department_ids) && (user as any).department_ids.length > 0
    ? (user as any).department_ids.map((d: any) => String(d))
    : ((user as any)?.department_id ? [String((user as any).department_id)] : []);
  const userFacultyIds: string[] = Array.isArray((user as any)?.faculty_ids) && (user as any).faculty_ids.length > 0
    ? (user as any).faculty_ids.map((f: any) => String(f))
    : ((user as any)?.faculty_id ? [String((user as any).faculty_id)] : []);
  const canManageCourse = (course: any): boolean => {
    if (isAdmin) return true;
    if (!canAssign) return false;
    // إن لم يكن للمستخدم نطاق (لا قسم ولا كلية) فهو global
    if (userDeptIds.length === 0 && userFacultyIds.length === 0) return true;
    const courseDeptId = course?.department_id ? String(course.department_id) : '';
    const courseFacultyId = course?.faculty_id ? String(course.faculty_id) : '';
    // إذا كان لدى المستخدم أقسام: يكفي أن يكون المقرر تابعاً لأحد أقسامه
    if (userDeptIds.length > 0 && courseDeptId && userDeptIds.includes(courseDeptId)) return true;
    // وإذا كان لدى المستخدم كليات: يكفي أن يكون المقرر تابعاً لأحد كلياته
    if (userFacultyIds.length > 0 && courseFacultyId && userFacultyIds.includes(courseFacultyId)) return true;
    return false;
  };

  const [data, setData] = useState<TeacherCoursesData | null>(null);
  const [teacherPhone, setTeacherPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [teacherDept, setTeacherDept] = useState<string>('');

  // 👤 إجراءات الأستاذ: تعديل / تفعيل / إعادة تعيين كلمة المرور / حذف
  const canManageTeacher = isAdmin || hasPermission(PERMISSIONS.MANAGE_TEACHERS);
  const [teacherFull, setTeacherFull] = useState<any>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [actingOnTeacher, setActingOnTeacher] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteBackupInfo, setDeleteBackupInfo] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  // 📊 عرض وتصدير إضافي: العبء التدريسي / تقرير الساعات / الجدول الأسبوعي
  const [showReportsMenu, setShowReportsMenu] = useState(false);
  const [activeReportModal, setActiveReportModal] = useState<'load' | 'hours' | 'weekly' | null>(null);
  const [hoursData, setHoursData] = useState<any>(null);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportExporting, setReportExporting] = useState(false);

  // 🔲 عرض المقررات: شبكي أو قائمة طويلة
  const [coursesView, setCoursesView] = useState<'list' | 'grid'>('list');

  // Assign Modal State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AvailableCourse[]>([]);
  const [pickedCourses, setPickedCourses] = useState<Record<string, { course: AvailableCourse; hours: string }>>({});
  const [saving, setSaving] = useState(false);
  const [hideAssignedToOthers, setHideAssignedToOthers] = useState(true);

  // Unassign confirmation
  const [unassignTarget, setUnassignTarget] = useState<Course | null>(null);
  const [unassigning, setUnassigning] = useState(false);

  // Exporting PDF
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  // 🔧 عرض كل الفصول (للأرشيف) — افتراضياً يعرض الفصل النشط فقط
  const [showAllSemesters, setShowAllSemesters] = useState(false);

  const showMessage = (title: string, message: string) => {
    if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
  };

  const fetchCourses = useCallback(async () => {
    if (!teacherId) return;
    try {
      // 🛡️ Promise.allSettled: لو فشل أي API (مثلاً 403/404)، الصفحة لا تنهار
      const [coursesRes, teacherRes] = await Promise.allSettled([
        teachersAPI.getCourses(teacherId, showAllSemesters ? { include_all: true } : undefined),
        teachersAPI.getById(teacherId),
      ]);
      if (coursesRes.status === 'fulfilled') {
        setData(coursesRes.value.data);
      } else {
        console.warn('Failed to fetch teacher courses:', coursesRes.reason);
        setData(null);
      }
      if (teacherRes.status === 'fulfilled') {
        setTeacherPhone(teacherRes.value.data?.phone || '');
        setTeacherFull(teacherRes.value.data || null);
      }
      if (teacherRes.status === 'rejected') {
        console.warn('Failed to fetch teacher details:', teacherRes.reason);
      }
    } catch (error) {
      console.error('Error fetching teacher courses:', error);
    } finally {
      setLoading(false);
    }
  }, [teacherId, showAllSemesters]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // 🏢 تحميل الأقسام مرة واحدة لاستخدامها في نموذج تعديل بيانات المعلم
  useEffect(() => {
    departmentsAPI.getAll().then((res: any) => setDepartments(res.data || [])).catch(() => {});
  }, []);

  // Debounced search
  useEffect(() => {
    if (!showAssignModal) return;
    const handle = setTimeout(async () => {
      if (!searchQuery && !showAssignModal) return;
      setSearching(true);
      try {
        const res = await teachingLoadAPI.searchCourses(searchQuery || '');
        const currentTeacherName = data?.teacher_name || '';
        const currentCourseIds = new Set((data?.courses || []).map(c => c.id));
        const filtered: AvailableCourse[] = (res.data || []).filter((c: AvailableCourse) => {
          if (currentCourseIds.has(c.course_id)) return false;
          if (hideAssignedToOthers && c.current_teacher_name && c.current_teacher_name !== currentTeacherName) return false;
          return true;
        });
        setSearchResults(filtered);
      } catch (e) {
        console.error('Search error:', e);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery, showAssignModal, data, hideAssignedToOthers]);

  const openAssignModal = () => {
    setSearchQuery('');
    setPickedCourses({});
    setSearchResults([]);
    setShowAssignModal(true);
  };

  const togglePick = (course: AvailableCourse) => {
    setPickedCourses(prev => {
      const copy = { ...prev };
      if (copy[course.course_id]) {
        delete copy[course.course_id];
      } else {
        const defaultHours = course.weekly_hours ?? course.credit_hours ?? 3;
        copy[course.course_id] = { course, hours: String(defaultHours) };
      }
      return copy;
    });
  };

  const updateHours = (courseId: string, val: string) => {
    setPickedCourses(prev => {
      if (!prev[courseId]) return prev;
      return { ...prev, [courseId]: { ...prev[courseId], hours: val.replace(/[^0-9.]/g, '') } };
    });
  };

  const handleSaveAssignments = async () => {
    const items = Object.values(pickedCourses).map(p => ({
      teacher_id: teacherId!,
      course_id: p.course.course_id,
      weekly_hours: parseFloat(p.hours) || (p.course.credit_hours || 3),
      semester_id: data?.semester_id || p.course.semester_id,
    }));
    if (items.length === 0) {
      showMessage('تنبيه', 'الرجاء اختيار مقرر واحد على الأقل');
      return;
    }
    setSaving(true);
    try {
      const res = await teachingLoadAPI.bulkSave(items);
      showMessage('نجاح', res.data?.message || `تم إسناد ${items.length} مقرر بنجاح`);
      setShowAssignModal(false);
      await fetchCourses();
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'فشل في إسناد المقررات';
      showMessage('خطأ', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = async () => {
    if (!teacherId) return;
    if ((data?.courses?.length || 0) === 0) {
      showMessage('تنبيه', 'لا توجد مقررات مسندة لتصديرها');
      return;
    }
    setExportingPdf(true);
    try {
      const params: any = { teacher_id: teacherId };
      if (data?.semester_id) params.semester_id = data.semester_id;
      const res = await teachingLoadAPI.exportPDF(params);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = url;
        a.download = filenameFromResponse(res, exportName(['العبء التدريسي', data?.teacher_name || teacherDisplay], 'pdf'));
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'فشل تصدير PDF';
      showMessage('خطأ', msg);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    if (!teacherId) return;
    if ((data?.courses?.length || 0) === 0) {
      showMessage('تنبيه', 'لا توجد مقررات مسندة لتصديرها');
      return;
    }
    setExportingExcel(true);
    try {
      const params: any = { teacher_id: teacherId };
      if (data?.semester_id) params.semester_id = data.semester_id;
      const res = await teachingLoadAPI.exportExcel(params);
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = url;
        a.download = filenameFromResponse(res, exportName(['العبء التدريسي', data?.teacher_name || teacherDisplay], 'xlsx'));
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'فشل تصدير Excel';
      showMessage('خطأ', msg);
    } finally {
      setExportingExcel(false);
    }
  };


  const handleUnassign = async () => {
    if (!unassignTarget) return;
    setUnassigning(true);
    try {
      if (unassignTarget.teaching_load_id) {
        // إلغاء الإسناد في الفصل الحالي فقط (لا يؤثر على الفصول السابقة)
        await teachingLoadAPI.delete(unassignTarget.teaching_load_id);
      } else {
        // fallback: إزالة المعلم من المقرر (سلوك قديم)
        await coursesAPI.update(unassignTarget.id, { teacher_id: null });
      }
      showMessage('نجاح', `تم إلغاء إسناد المقرر "${unassignTarget.name}"`);
      setUnassignTarget(null);
      await fetchCourses();
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'فشل في إلغاء الإسناد';
      showMessage('خطأ', msg);
    } finally {
      setUnassigning(false);
    }
  };

  const totalStudents = useMemo(
    () => (data?.courses || []).reduce((sum, c) => sum + (c.students_count || 0), 0),
    [data]
  );
  const totalLectures = useMemo(
    () => (data?.courses || []).reduce((sum, c) => sum + (c.lectures_count || 0), 0),
    [data]
  );
  const totalHours = data?.total_weekly_hours || 0;

  // 👤 إجراءات الأستاذ: تعديل بيانات المعلم
  const openEditModal = () => {
    if (!teacherFull) { showMessage('تنبيه', 'جارٍ تحميل بيانات المعلم، أعد المحاولة بعد لحظات'); return; }
    setEditForm({
      full_name: teacherFull.full_name || teacherFull.name || '',
      department_ids: Array.isArray(teacherFull.department_ids) ? teacherFull.department_ids : (teacherFull.department_id ? [teacherFull.department_id] : []),
      specialization: teacherFull.specialization || '',
      academic_title: teacherFull.academic_title || '',
      weekly_hours: teacherFull.weekly_hours != null ? String(teacherFull.weekly_hours) : '',
      phone: teacherFull.phone || '',
      email: teacherFull.email || '',
    });
    setShowActionsMenu(false);
    setShowEditModal(true);
  };

  const toggleEditDept = (deptId: string) => {
    setEditForm((f: any) => {
      const ids: string[] = f.department_ids || [];
      return { ...f, department_ids: ids.includes(deptId) ? ids.filter((d: string) => d !== deptId) : [...ids, deptId] };
    });
  };

  const handleSaveEdit = async () => {
    if (!teacherId) return;
    if (!editForm.full_name?.trim()) { showMessage('خطأ', 'الاسم الكامل مطلوب'); return; }
    setSavingEdit(true);
    try {
      await teachersAPI.update(teacherId, {
        full_name: editForm.full_name,
        department_ids: editForm.department_ids,
        specialization: editForm.specialization,
        academic_title: editForm.academic_title,
        weekly_hours: editForm.weekly_hours ? Number(editForm.weekly_hours) : undefined,
        phone: editForm.phone,
        email: editForm.email,
      });
      setShowEditModal(false);
      showMessage('تم', 'تم تحديث بيانات المعلم بنجاح');
      fetchCourses();
    } catch (error: any) {
      showMessage('خطأ', error?.response?.data?.detail || 'تعذر تحديث بيانات المعلم');
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmAction = (message: string): Promise<boolean> => {
    if (Platform.OS === 'web') return Promise.resolve(window.confirm(message));
    return new Promise((resolve) => {
      Alert.alert('تأكيد', message, [
        { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
        { text: 'تأكيد', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  };

  const handleToggleActive = async () => {
    if (!teacherId || !teacherFull) return;
    const activating = teacherFull.is_active === false;
    const ok = await confirmAction(activating ? 'هل تريد تفعيل حساب هذا المعلم؟' : 'هل تريد إلغاء تفعيل حساب هذا المعلم؟ لن يتمكن من تسجيل الدخول بعد ذلك.');
    if (!ok) return;
    setShowActionsMenu(false);
    setActingOnTeacher(true);
    try {
      if (activating) await teachersAPI.activateAccount(teacherId);
      else await teachersAPI.deactivateAccount(teacherId);
      showMessage('تم', activating ? 'تم تفعيل حساب المعلم بنجاح' : 'تم إلغاء تفعيل حساب المعلم بنجاح');
      fetchCourses();
    } catch (error: any) {
      showMessage('خطأ', error?.response?.data?.detail || 'تعذر تنفيذ العملية');
    } finally {
      setActingOnTeacher(false);
    }
  };

  const handleResetPassword = async () => {
    if (!teacherId || !teacherFull) return;
    const ok = await confirmAction('هل تريد إعادة تعيين كلمة مرور هذا المعلم؟');
    if (!ok) return;
    setShowActionsMenu(false);
    setActingOnTeacher(true);
    try {
      await teachersAPI.resetPassword(teacherId);
      showMessage('تم', `تمت إعادة تعيين كلمة المرور بنجاح.\nكلمة المرور الجديدة: ${teacherFull.teacher_id || teacherId}`);
    } catch (error: any) {
      showMessage('خطأ', error?.response?.data?.detail || 'تعذر إعادة تعيين كلمة المرور');
    } finally {
      setActingOnTeacher(false);
    }
  };

  const openDeleteModal = async () => {
    if (!teacherId) return;
    setShowActionsMenu(false);
    setShowDeleteModal(true);
    setDeleteBackupInfo(null);
    setDeleting(true);
    try {
      const res = await api.get(`/teachers/${teacherId}/backup-info`);
      setDeleteBackupInfo(res.data);
    } catch (error) {
      setDeleteBackupInfo({});
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!teacherId) return;
    setDeleting(true);
    try {
      const res = await api.post(`/teachers/${teacherId}/safe-delete`);
      if (Platform.OS === 'web' && res?.data?.backup) {
        const blob = new Blob([JSON.stringify(res.data.backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `نسخة_احتياطية_${teacherDisplay}.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      showMessage('تم الحذف', 'تم حذف المعلم بنجاح، وتم تنزيل نسخة احتياطية من بياناته');
      setShowDeleteModal(false);
      router.replace('/manage-teachers');
    } catch (error: any) {
      showMessage('خطأ', error?.response?.data?.detail || 'تعذر حذف المعلم');
    } finally {
      setDeleting(false);
    }
  };

  // 📊 عرض وتصدير إضافي: العبء التدريسي / تقرير الساعات / الجدول الأسبوعي — بدون مغادرة الصفحة
  const openReportModal = async (type: 'load' | 'hours' | 'weekly') => {
    setShowReportsMenu(false);
    setActiveReportModal(type);
    if (type === 'load') return; // العبء التدريسي مُفصَّل أصلاً في هذه الصفحة
    setLoadingReport(true);
    try {
      if (type === 'hours') {
        const res = await reportsAPI.getTeacherWorkload({ teacher_id: teacherId! });
        const list = res.data?.teachers || res.data || [];
        setHoursData(Array.isArray(list) ? (list[0] || null) : list);
      } else {
        const res = await scheduleAPI.getSchedule({ teacher_id: teacherId! });
        setWeeklyData(res.data || []);
      }
    } catch (error: any) {
      showMessage('خطأ', error?.response?.data?.detail || 'تعذر تحميل التقرير');
    } finally {
      setLoadingReport(false);
    }
  };

  const downloadBlob = (blobData: any, filename: string) => {
    const url = URL.createObjectURL(blobData);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleReportExport = async (type: 'load' | 'hours' | 'weekly', fmt: 'excel' | 'pdf') => {
    if (type === 'load') {
      if (fmt === 'excel') handleExportExcel(); else handleExportPdf();
      return;
    }
    setReportExporting(true);
    try {
      if (type === 'hours') {
        const res = fmt === 'excel'
          ? await reportsAPI.exportTeacherWorkloadExcel({ teacher_id: teacherId! })
          : await reportsAPI.exportTeacherWorkloadPdf({ teacher_id: teacherId! });
        if (Platform.OS === 'web') downloadBlob(new Blob([res.data]), `تقرير_الساعات_${teacherDisplay}.${fmt === 'excel' ? 'xlsx' : 'pdf'}`);
      } else {
        const res = await api.get(`/weekly-schedule/export-visual/${fmt}`, { params: { teacher_id: teacherId }, responseType: 'blob' });
        if (Platform.OS === 'web') downloadBlob(new Blob([res.data]), `الجدول_الأسبوعي_${teacherDisplay}.${fmt === 'excel' ? 'xlsx' : 'pdf'}`);
      }
    } catch (error: any) {
      showMessage('خطأ', error?.response?.data?.detail || 'تعذر التصدير');
    } finally {
      setReportExporting(false);
    }
  };

  if (loading) return <LoadingScreen />;


  const teacherDisplay = teacherName || data?.teacher_name || 'المعلم';
  const pickedCount = Object.keys(pickedCourses).length;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: `مقررات ${teacherDisplay}`,
          headerBackTitle: 'رجوع',
        }}
      />
      <ScrollView
        dataSet={{ responsiveScrollRoot: 'true' }}
        style={{ flex: 1 }}
        contentContainerStyle={styles.pageScroll}
        showsVerticalScrollIndicator={false}
      >
        {/* رأس الصفحة */}
        <View dataSet={{ responsive: 'page-header' }} style={styles.pageHeader}>
          <View style={styles.pageHeaderRight}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
              <Text dataSet={{ responsive: 'page-title' }} style={styles.pageTitle}>مقررات {teacherDisplay}</Text>
              {!!data?.semester_name && (
                <View style={styles.semesterBadge}>
                  <Ionicons name="calendar" size={11} color="#2962ff" />
                  <Text style={styles.semesterBadgeText}>{data.semester_name}</Text>
                </View>
              )}
              {/* 🔧 زر تبديل عرض كل الفصول */}
              <TouchableOpacity
                onPress={() => setShowAllSemesters(v => !v)}
                style={[styles.semesterBadge, showAllSemesters && { backgroundColor: '#fef3c7', borderColor: '#f59e0b' }]}
                testID="toggle-all-semesters-btn"
              >
                <Ionicons name={showAllSemesters ? 'archive' : 'archive-outline'} size={11} color={showAllSemesters ? '#92400e' : '#1565c0'} />
                <Text style={[styles.semesterBadgeText, showAllSemesters && { color: '#92400e' }]}>
                  {showAllSemesters ? 'كل الفصول (أرشيف)' : 'الفصل النشط فقط'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.breadcrumb}>
              <TouchableOpacity onPress={() => router.replace('/')}>
                <Text style={styles.breadcrumbLink}>الرئيسية</Text>
              </TouchableOpacity>
              <Ionicons name="chevron-back" size={12} color="#8a95a8" />
              <TouchableOpacity onPress={() => router.replace('/manage-teachers')}>
                <Text style={styles.breadcrumbLink}>المعلمون</Text>
              </TouchableOpacity>
              <Ionicons name="chevron-back" size={12} color="#8a95a8" />
              <Text style={styles.breadcrumbCurrent}>المقررات</Text>
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
            {canManageTeacher && (
              <TouchableOpacity
                style={[styles.headerBtn, styles.btnGhost]}
                onPress={() => setShowActionsMenu(true)}
                testID="teacher-actions-menu-btn"
              >
                <Ionicons name="ellipsis-vertical" size={16} color="#1a2540" />
                <Text style={styles.btnGhostText}>إجراءات الأستاذ</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.headerBtn, styles.btnGhost]}
              onPress={() => router.push({ pathname: '/report-teacher-workload', params: { teacherId: teacherId!, teacherName: teacherDisplay, autorun: '1' } })}
              testID="teacher-overtime-report-btn"
            >
              <Ionicons name="stats-chart" size={16} color="#1a2540" />
              <Text style={styles.btnGhostText}>تقرير الساعات الإضافية</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerBtn, styles.btnExportExcel, ((data?.courses?.length || 0) === 0 || exportingExcel) && { opacity: 0.5 }]}
              onPress={handleExportExcel}
              disabled={(data?.courses?.length || 0) === 0 || exportingExcel}
              testID="export-excel-btn"
            >
              {exportingExcel ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="grid" size={16} color="#fff" />
              )}
              <Text style={styles.btnPrimaryText}>{exportingExcel ? 'جاري التصدير...' : 'تصدير Excel'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerBtn, styles.btnExport, ((data?.courses?.length || 0) === 0 || exportingPdf) && { opacity: 0.5 }]}
              onPress={handleExportPdf}
              disabled={(data?.courses?.length || 0) === 0 || exportingPdf}
              testID="export-pdf-btn"
            >
              {exportingPdf ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="document-text" size={16} color="#fff" />
              )}
              <Text style={styles.btnPrimaryText}>{exportingPdf ? 'جاري التصدير...' : 'تصدير PDF'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerBtn, styles.btnGhost]}
              onPress={() => setShowReportsMenu(true)}
              testID="teacher-reports-menu-btn"
            >
              <Ionicons name="list" size={16} color="#1a2540" />
              <Text style={styles.btnGhostText}>عرض وتصدير آخر</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerBtn, styles.btnPrimary, !canAssign && { opacity: 0.4 }]}
              onPress={() => { if (!canAssign) { showMessage('غير مصرح', 'ليس لديك صلاحية إسناد المقررات'); return; } openAssignModal(); }}
              disabled={!canAssign}
              testID="assign-course-btn"
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.btnPrimaryText}>إسناد مقرر</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* بطاقة المعلم */}
        <View style={styles.teacherCard}>
          <View style={styles.teacherAvatar}>
            <Text style={styles.teacherAvatarText}>{(data?.teacher_name || teacherDisplay).charAt(0)}</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={styles.teacherCardName}>{data?.teacher_name || teacherDisplay}</Text>
              {!!teacherPhone && (
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#e8f5e9', borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10 }} testID="teacher-phone-badge">
                  <Text style={{ fontSize: 12, color: '#2e7d32', fontWeight: '800' }}>📞 {teacherPhone}</Text>
                </View>
              )}
            </View>
            <View style={styles.teacherCardSubRow}>
              <Text style={styles.teacherCardSub}>يدرّس {data?.total_courses || 0} مقرر</Text>
              <View style={styles.teacherCardDot} />
              <Text style={styles.teacherCardSub}>إجمالي الساعات: </Text>
              <Text style={styles.teacherHoursValue} testID="total-weekly-hours">{data?.total_weekly_hours || 0}</Text>
              <Text style={styles.teacherCardSub}> س/أسبوع</Text>
            </View>
          </View>
          <View style={styles.teacherIconBg}>
            <Ionicons name="person" size={32} color="#2962ff" />
          </View>
        </View>

        {/* بطاقات الإحصائيات */}
        <View dataSet={{ responsive: 'stats-grid' }} style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: '#4caf50' }]}>
              <Ionicons name="book" size={22} color="#fff" />
            </View>
            <View style={styles.statTextCol}>
              <Text style={styles.statLabel}>إجمالي المقررات</Text>
              <Text style={styles.statValue}>{data?.total_courses || 0}</Text>
              <Text style={styles.statSubLabel}>مقرر مسند</Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: '#29b6f6' }]}>
              <Ionicons name="people" size={22} color="#fff" />
            </View>
            <View style={styles.statTextCol}>
              <Text style={styles.statLabel}>إجمالي الطلاب</Text>
              <Text style={styles.statValue}>{totalStudents}</Text>
              <Text style={styles.statSubLabel}>طالب مسجل</Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: '#ff9800' }]}>
              <Ionicons name="calendar" size={22} color="#fff" />
            </View>
            <View style={styles.statTextCol}>
              <Text style={styles.statLabel}>إجمالي المحاضرات</Text>
              <Text style={styles.statValue}>{totalLectures}</Text>
              <Text style={styles.statSubLabel}>محاضرة</Text>
            </View>
          </View>
        </View>

        {/* قائمة المقررات */}
        <View style={styles.coursesCard}>
          <View style={styles.coursesCardHeader}>
            <Text style={styles.coursesCardTitle}>المقررات المُسندة</Text>
            <View style={styles.coursesHeaderRight}>
              <View style={styles.viewToggle} testID="courses-view-toggle">
                <TouchableOpacity
                  style={[styles.viewToggleBtn, coursesView === 'list' && styles.viewToggleBtnActive]}
                  onPress={() => setCoursesView('list')}
                  testID="courses-view-list-btn"
                >
                  <Ionicons name="reorder-three" size={16} color={coursesView === 'list' ? '#fff' : '#64748b'} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.viewToggleBtn, coursesView === 'grid' && styles.viewToggleBtnActive]}
                  onPress={() => setCoursesView('grid')}
                  testID="courses-view-grid-btn"
                >
                  <Ionicons name="grid" size={16} color={coursesView === 'grid' ? '#fff' : '#64748b'} />
                </TouchableOpacity>
              </View>
              <Text style={styles.coursesCardCount}>
                <Text style={styles.coursesCountAccent}>{data?.courses?.length || 0}</Text> مقرر
              </Text>
            </View>
          </View>

          {!data?.courses || data.courses.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="book-outline" size={56} color="#cfd6e1" />
              <Text style={styles.emptyText}>لا توجد مقررات مسندة لهذا المعلم</Text>
              <TouchableOpacity style={[styles.headerBtn, styles.btnPrimary, { marginTop: 14 }, !canAssign && { opacity: 0.4 }]} onPress={() => { if (!canAssign) { showMessage('غير مصرح', 'ليس لديك صلاحية إسناد المقررات'); return; } openAssignModal(); }} disabled={!canAssign}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.btnPrimaryText}>إسناد أول مقرر</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.coursesList, coursesView === 'grid' && styles.coursesListGrid]}>
              {data.courses.map((course) => {
                const isOwned = canManageCourse(course);
                return (
                <View key={course.id} style={[styles.courseRow, coursesView === 'grid' && styles.courseRowGrid]}>
                  <TouchableOpacity
                    style={styles.courseMain}
                    onPress={() => {
                      // 🔒 منع فتح مقرر من قسم آخر للتحكم به (تحرير/حذف/توليد محاضرات)
                      if (!isOwned && !isAdmin) {
                        showMessage('للعرض فقط', 'هذا المقرر تابع لقسم آخر. لا يمكنك التحكم فيه (تحرير/حذف/توليد محاضرات).');
                        return;
                      }
                      router.push({
                        pathname: '/course-lectures',
                        params: { courseId: course.id, courseName: course.name },
                      });
                    }}
                    testID={`course-card-${course.id}`}
                  >
                    <View style={styles.courseIconBox}>
                      <Ionicons name="book" size={22} color="#2962ff" />
                    </View>
                    <View style={styles.courseInfo}>
                      <View style={styles.courseTitleRow}>
                        <Text style={styles.courseName} numberOfLines={1}>{course.name}</Text>
                        <Text style={styles.courseCode}>{course.code || '—'}</Text>
                      </View>

                      <View style={styles.metaRow}>
                        {!!course.faculty_name && (
                          <View style={styles.metaItem}>
                            <Ionicons name="business-outline" size={13} color="#5b6678" />
                            <Text style={styles.metaText}>{course.faculty_name}</Text>
                          </View>
                        )}
                        {!!course.department_name && (
                          <View style={styles.metaItem}>
                            <Ionicons name="library-outline" size={13} color="#5b6678" />
                            <Text style={styles.metaText}>{course.department_name}</Text>
                          </View>
                        )}
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
                        <View style={[styles.badge, styles.badgeLectures]}>
                          <Ionicons name="calendar-outline" size={11} color="#e65100" />
                          <Text style={[styles.badgeText, { color: '#e65100' }]}>{course.lectures_count} محاضرة</Text>
                        </View>
                        <View style={[styles.badge, styles.badgeStudents]}>
                          <Ionicons name="people-outline" size={11} color="#2e7d32" />
                          <Text style={[styles.badgeText, { color: '#2e7d32' }]}>{course.students_count} طالب</Text>
                        </View>
                      </View>
                    </View>
                    <Ionicons name="chevron-back" size={20} color="#c0c8d4" />
                  </TouchableOpacity>

                  {canAssign && canManageCourse(course) ? (
                    <View style={styles.courseActions}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionUnassign]}
                        onPress={() => setUnassignTarget(course)}
                        testID={`unassign-btn-${course.id}`}
                      >
                        <Ionicons name="close-circle-outline" size={14} color="#f44336" />
                        <Text style={styles.actionUnassignText}>إلغاء الإسناد</Text>
                      </TouchableOpacity>
                    </View>
                  ) : canAssign && !canManageCourse(course) ? (
                    <View style={styles.courseActions}>
                      <View style={[styles.actionBtn, { backgroundColor: '#fff8e1', borderColor: '#ffe082' }]}>
                        <Ionicons name="lock-closed" size={12} color="#ff8f00" />
                        <Text style={{ fontSize: 11, color: '#e65100', fontWeight: '700', marginRight: 4 }}>
                          من قسم آخر
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* مودال إسناد مقرر */}
      <Modal visible={showAssignModal} transparent animationType="fade" onRequestClose={() => setShowAssignModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowAssignModal(false)} />
          <View style={styles.assignModalCard}>
            <View style={styles.assignModalHeader}>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.assignModalTitle}>إسناد مقررات للمعلم</Text>
                <Text style={styles.assignModalSubtitle}>{data?.teacher_name || teacherDisplay}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAssignModal(false)} testID="close-assign-modal">
                <Ionicons name="close" size={22} color="#5b6678" />
              </TouchableOpacity>
            </View>

            {/* البحث */}
            <View style={styles.modalSearchBox}>
              <Ionicons name="search" size={16} color="#8a95a8" />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="ابحث عن مقرر بالاسم أو الكود..."
                placeholderTextColor="#a8b1c2"
                value={searchQuery}
                onChangeText={setSearchQuery}
                testID="course-search-input"
              />
              {searching && <ActivityIndicator size="small" color="#2962ff" />}
            </View>

            {/* فلتر */}
            <TouchableOpacity
              style={styles.filterToggle}
              onPress={() => setHideAssignedToOthers(v => !v)}
            >
              <Ionicons
                name={hideAssignedToOthers ? 'checkbox' : 'square-outline'}
                size={16}
                color={hideAssignedToOthers ? '#2962ff' : '#8a95a8'}
              />
              <Text style={styles.filterToggleText}>إخفاء المقررات المسندة لمعلمين آخرين</Text>
            </TouchableOpacity>

            {/* القائمة */}
            <ScrollView style={styles.modalListContainer} contentContainerStyle={{ paddingBottom: 8 }}>
              {searchResults.length === 0 ? (
                <View style={styles.modalEmpty}>
                  <Ionicons name="search-outline" size={36} color="#cfd6e1" />
                  <Text style={styles.modalEmptyText}>
                    {searching ? 'جاري البحث...' : 'ابدأ بكتابة اسم المقرر للبحث'}
                  </Text>
                </View>
              ) : (
                searchResults.map((course) => {
                  const isPicked = !!pickedCourses[course.course_id];
                  const isAssignedToOther = course.current_teacher_name && course.current_teacher_name !== (data?.teacher_name || teacherDisplay);
                  return (
                    <View key={course.course_id} style={[styles.searchResultRow, isPicked && styles.searchResultRowActive]}>
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}
                        onPress={() => togglePick(course)}
                        testID={`pick-course-${course.course_id}`}
                      >
                        <Ionicons
                          name={isPicked ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={isPicked ? '#2962ff' : '#a8b1c2'}
                        />
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                            <Text style={styles.resultName} numberOfLines={1}>{course.course_name}</Text>
                            <Text style={styles.resultCode}>{course.course_code}</Text>
                          </View>
                          <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                            <Text style={styles.resultMeta}>المستوى {course.level}</Text>
                            {!!course.section && <Text style={styles.resultMeta}>شعبة {course.section}</Text>}
                            {!!course.faculty_name && (
                              <View style={styles.deptBadge} data-testid={`course-faculty-${course.course_id}`}>
                                <Ionicons name="business" size={10} color="#1565c0" />
                                <Text style={styles.deptBadgeText}>{course.faculty_name}</Text>
                              </View>
                            )}
                            {!!course.department_name && (
                              <View style={[styles.deptBadge, { backgroundColor: '#f3e8ff', borderColor: '#c084fc' }]} data-testid={`course-dept-${course.course_id}`}>
                                <Ionicons name="school" size={10} color="#7c3aed" />
                                <Text style={[styles.deptBadgeText, { color: '#7c3aed' }]}>{course.department_name}</Text>
                              </View>
                            )}
                            {isAssignedToOther && (
                              <Text style={[styles.resultMeta, { color: '#f44336' }]}>
                                مسند حالياً لـ {course.current_teacher_name}
                              </Text>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                      {isPicked && (
                        <View style={styles.hoursWrap}>
                          <TextInput
                            style={styles.hoursInput}
                            value={pickedCourses[course.course_id].hours}
                            onChangeText={(v) => updateHours(course.course_id, v)}
                            keyboardType="numeric"
                            placeholder="ساعات"
                          />
                          <Text style={styles.hoursLabel}>س/أسبوع</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>

            {/* footer */}
            <View style={styles.assignFooter}>
              <Text style={styles.pickedCountText}>
                المختار: <Text style={styles.pickedCountAccent}>{pickedCount}</Text> مقرر
              </Text>
              <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.headerBtn, styles.btnGhost]}
                  onPress={() => setShowAssignModal(false)}
                  disabled={saving}
                >
                  <Text style={styles.btnGhostText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.headerBtn, styles.btnPrimary, (saving || pickedCount === 0) && { opacity: 0.6 }]}
                  onPress={handleSaveAssignments}
                  disabled={saving || pickedCount === 0}
                  testID="save-assignments-btn"
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={styles.btnPrimaryText}>حفظ الإسناد</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* مودال تأكيد إلغاء الإسناد */}
      <Modal visible={!!unassignTarget} transparent animationType="fade" onRequestClose={() => setUnassignTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <Ionicons name="warning" size={36} color="#f44336" style={{ alignSelf: 'center', marginBottom: 10 }} />
            <Text style={styles.confirmTitle}>إلغاء إسناد المقرر</Text>
            <Text style={styles.confirmText}>
              {`هل أنت متأكد من إلغاء إسناد المقرر "${unassignTarget?.name || ''}" من المعلم؟`}
            </Text>
            <Text style={styles.confirmNote}>
              لن يتم حذف المقرر، لكنه سيصبح بدون معلم مسند.
            </Text>
            <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.headerBtn, styles.btnGhost, { flex: 1, justifyContent: 'center' }]}
                onPress={() => setUnassignTarget(null)}
                disabled={unassigning}
              >
                <Text style={styles.btnGhostText}>تراجع</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerBtn, { backgroundColor: '#f44336', flex: 1, justifyContent: 'center' }, unassigning && { opacity: 0.6 }]}
                onPress={handleUnassign}
                disabled={unassigning}
                testID="confirm-unassign-btn"
              >
                {unassigning ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnPrimaryText}>تأكيد الإلغاء</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ⋮ مودال إجراءات الأستاذ */}
      <Modal visible={showActionsMenu} transparent animationType="fade" onRequestClose={() => setShowActionsMenu(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowActionsMenu(false)}>
          <View style={styles.menuCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.menuCardTitle}>إجراءات الأستاذ</Text>
            <TouchableOpacity style={styles.menuRow} onPress={openEditModal} testID="teacher-action-edit">
              <Ionicons name="create-outline" size={18} color="#1565c0" />
              <Text style={styles.menuRowText}>تعديل البيانات</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuRow} onPress={handleToggleActive} disabled={actingOnTeacher} testID="teacher-action-toggle-active">
              <Ionicons name={teacherFull?.is_active === false ? 'checkmark-circle-outline' : 'close-circle-outline'} size={18} color={teacherFull?.is_active === false ? '#2e7d32' : '#e65100'} />
              <Text style={styles.menuRowText}>{teacherFull?.is_active === false ? 'تفعيل الحساب' : 'إلغاء تفعيل الحساب'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuRow} onPress={handleResetPassword} disabled={actingOnTeacher} testID="teacher-action-reset-password">
              <Ionicons name="key-outline" size={18} color="#8e24aa" />
              <Text style={styles.menuRowText}>إعادة تعيين كلمة المرور</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuRow, styles.menuRowDanger]} onPress={openDeleteModal} testID="teacher-action-delete">
              <Ionicons name="trash-outline" size={18} color="#c62828" />
              <Text style={[styles.menuRowText, { color: '#c62828' }]}>حذف المعلم</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuCancelBtn} onPress={() => setShowActionsMenu(false)}>
              <Text style={styles.menuCancelText}>إغلاق</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ✏️ مودال تعديل بيانات المعلم */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.assignModalCard, { maxHeight: '85%' }]}>
            <View style={styles.assignModalHeader}>
              <Text style={styles.assignModalTitle}>تعديل بيانات المعلم</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}><Ionicons name="close" size={22} color="#64748b" /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={styles.fieldLabel}>الاسم الكامل</Text>
              <TextInput style={styles.modalSearchInput} value={editForm.full_name} onChangeText={(t) => setEditForm((f: any) => ({ ...f, full_name: t }))} testID="edit-teacher-fullname-input" />
              <Text style={styles.fieldLabel}>البريد الإلكتروني</Text>
              <TextInput style={styles.modalSearchInput} value={editForm.email} onChangeText={(t) => setEditForm((f: any) => ({ ...f, email: t }))} keyboardType="email-address" testID="edit-teacher-email-input" />
              <Text style={styles.fieldLabel}>رقم الهاتف</Text>
              <TextInput style={styles.modalSearchInput} value={editForm.phone} onChangeText={(t) => setEditForm((f: any) => ({ ...f, phone: t }))} keyboardType="phone-pad" testID="edit-teacher-phone-input" />
              <Text style={styles.fieldLabel}>التخصص</Text>
              <TextInput style={styles.modalSearchInput} value={editForm.specialization} onChangeText={(t) => setEditForm((f: any) => ({ ...f, specialization: t }))} testID="edit-teacher-specialization-input" />
              <Text style={styles.fieldLabel}>الدرجة العلمية</Text>
              <TextInput style={styles.modalSearchInput} value={editForm.academic_title} onChangeText={(t) => setEditForm((f: any) => ({ ...f, academic_title: t }))} testID="edit-teacher-title-input" />
              <Text style={styles.fieldLabel}>النصاب الأسبوعي (ساعة)</Text>
              <TextInput style={styles.modalSearchInput} value={editForm.weekly_hours} onChangeText={(t) => setEditForm((f: any) => ({ ...f, weekly_hours: t }))} keyboardType="numeric" testID="edit-teacher-hours-input" />
              <Text style={styles.fieldLabel}>الأقسام</Text>
              <View style={styles.deptChipsWrap}>
                {departments.map((d: any) => {
                  const selected = (editForm.department_ids || []).includes(d.id);
                  return (
                    <TouchableOpacity key={d.id} style={[styles.deptChip, selected && styles.deptChipSelected]} onPress={() => toggleEditDept(d.id)} testID={`edit-teacher-dept-${d.id}`}>
                      <Text style={[styles.deptChipText, selected && styles.deptChipTextSelected]}>{d.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <TouchableOpacity style={[styles.headerBtn, styles.btnPrimary, { justifyContent: 'center', marginTop: 14 }, savingEdit && { opacity: 0.6 }]} onPress={handleSaveEdit} disabled={savingEdit} testID="save-teacher-edit-btn">
              {savingEdit ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>حفظ التعديلات</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 🗑️ مودال حذف المعلم */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <Ionicons name="warning" size={36} color="#c62828" style={{ alignSelf: 'center', marginBottom: 10 }} />
            <Text style={styles.confirmTitle}>حذف المعلم نهائياً</Text>
            {deleting && !deleteBackupInfo ? (
              <ActivityIndicator color="#c62828" style={{ marginVertical: 10 }} />
            ) : (
              <>
                <Text style={styles.confirmText}>
                  {`هل أنت متأكد من حذف المعلم "${data?.teacher_name || teacherDisplay}" نهائياً؟`}
                </Text>
                {deleteBackupInfo && (deleteBackupInfo.courses_count || deleteBackupInfo.lectures_count) ? (
                  <Text style={styles.confirmNote}>
                    {`سيتأثر: ${deleteBackupInfo.courses_count || 0} مقرر، ${deleteBackupInfo.lectures_count || 0} محاضرة. سيُنزَّل ملف نسخة احتياطية تلقائياً قبل الحذف.`}
                  </Text>
                ) : (
                  <Text style={styles.confirmNote}>سيُنزَّل ملف نسخة احتياطية تلقائياً قبل الحذف.</Text>
                )}
              </>
            )}
            <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.headerBtn, styles.btnGhost, { flex: 1, justifyContent: 'center' }]} onPress={() => setShowDeleteModal(false)} disabled={deleting}>
                <Text style={styles.btnGhostText}>تراجع</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerBtn, { backgroundColor: '#c62828', flex: 1, justifyContent: 'center' }, deleting && { opacity: 0.6 }]}
                onPress={handleConfirmDelete}
                disabled={deleting}
                testID="confirm-delete-teacher-btn"
              >
                {deleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>تأكيد الحذف</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 📊 مودال قائمة عرض/تصدير إضافي */}
      <Modal visible={showReportsMenu} transparent animationType="fade" onRequestClose={() => setShowReportsMenu(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowReportsMenu(false)}>
          <View style={styles.menuCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.menuCardTitle}>عرض وتصدير</Text>
            <TouchableOpacity style={styles.menuRow} onPress={() => openReportModal('load')} testID="report-menu-load">
              <Ionicons name="bar-chart-outline" size={18} color="#1565c0" />
              <Text style={styles.menuRowText}>العبء التدريسي</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuRow} onPress={() => openReportModal('hours')} testID="report-menu-hours">
              <Ionicons name="time-outline" size={18} color="#e65100" />
              <Text style={styles.menuRowText}>تقرير الساعات</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuRow} onPress={() => openReportModal('weekly')} testID="report-menu-weekly">
              <Ionicons name="calendar-outline" size={18} color="#2e7d32" />
              <Text style={styles.menuRowText}>الجدول الأسبوعي</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuCancelBtn} onPress={() => setShowReportsMenu(false)}>
              <Text style={styles.menuCancelText}>إغلاق</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 👁️ مودال معاينة التقرير المختار مع زري التصدير */}
      <Modal visible={!!activeReportModal} transparent animationType="slide" onRequestClose={() => setActiveReportModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.assignModalCard, { maxHeight: '85%' }]}>
            <View style={styles.assignModalHeader}>
              <Text style={styles.assignModalTitle}>
                {activeReportModal === 'load' ? 'العبء التدريسي' : activeReportModal === 'hours' ? 'تقرير الساعات' : 'الجدول الأسبوعي'}
              </Text>
              <TouchableOpacity onPress={() => setActiveReportModal(null)}><Ionicons name="close" size={22} color="#64748b" /></TouchableOpacity>
            </View>

            {loadingReport ? (
              <ActivityIndicator color={styles.btnPrimary.backgroundColor as any} style={{ marginVertical: 30 }} />
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                {activeReportModal === 'load' && (
                  <View>
                    <View style={styles.reportStatRow}><Text style={styles.reportStatLabel}>عدد المقررات</Text><Text style={styles.reportStatValue}>{data?.courses?.length || 0}</Text></View>
                    <View style={styles.reportStatRow}><Text style={styles.reportStatLabel}>إجمالي الساعات</Text><Text style={styles.reportStatValue}>{totalHours}</Text></View>
                    <View style={styles.reportStatRow}><Text style={styles.reportStatLabel}>إجمالي المحاضرات</Text><Text style={styles.reportStatValue}>{totalLectures}</Text></View>
                    {(data?.courses || []).map((c) => (
                      <View key={c.id} style={styles.reportCourseRow}>
                        <Text style={styles.reportCourseName} numberOfLines={1}>{c.name}</Text>
                        <Text style={styles.reportCourseHours}>{c.weekly_hours || c.credit_hours || 0} س</Text>
                      </View>
                    ))}
                  </View>
                )}

                {activeReportModal === 'hours' && (
                  hoursData ? (
                    <View>
                      <View style={styles.reportStatRow}><Text style={styles.reportStatLabel}>الساعات المطلوبة</Text><Text style={styles.reportStatValue}>{hoursData.summary?.required_hours ?? '—'}</Text></View>
                      <View style={styles.reportStatRow}><Text style={styles.reportStatLabel}>الساعات المنفذة فعلياً</Text><Text style={styles.reportStatValue}>{hoursData.summary?.total_actual_hours ?? '—'}</Text></View>
                      <View style={styles.reportStatRow}><Text style={styles.reportStatLabel}>نسبة الإنجاز</Text><Text style={styles.reportStatValue}>{hoursData.summary?.completion_rate != null ? `${hoursData.summary.completion_rate}%` : '—'}</Text></View>
                      <View style={styles.reportStatRow}><Text style={styles.reportStatLabel}>ساعات إضافية</Text><Text style={styles.reportStatValue}>{hoursData.summary?.overtime_hours ?? 0}</Text></View>
                      {(hoursData.courses || []).map((c: any, idx: number) => (
                        <View key={idx} style={styles.reportCourseRow}>
                          <Text style={styles.reportCourseName} numberOfLines={1}>{c.course_name || c.name}</Text>
                          <Text style={styles.reportCourseHours}>{c.actual_hours ?? c.scheduled_hours ?? 0} س</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.emptyText}>لا توجد بيانات لتقرير الساعات في الفترة الحالية</Text>
                  )
                )}

                {activeReportModal === 'weekly' && (
                  weeklyData.length === 0 ? (
                    <Text style={styles.emptyText}>لا يوجد جدول أسبوعي مُسجَّل لهذا المعلم</Text>
                  ) : (
                    DAYS_ORDER.filter((d) => weeklyData.some((s) => s.day === d)).map((day) => (
                      <View key={day}>
                        <Text style={styles.reportDayTitle}>{day}</Text>
                        {weeklyData.filter((s) => s.day === day).sort((a, b) => (a.slot_number || 0) - (b.slot_number || 0)).map((s, idx) => (
                          <View key={idx} style={styles.reportCourseRow}>
                            <Text style={styles.reportCourseName} numberOfLines={1}>{s.course_name} {s.section ? `(${s.section})` : ''}</Text>
                            <Text style={styles.reportCourseHours}>{s.actual_start_time || ''}{s.room_name ? ` · ${s.room_name}` : ''}</Text>
                          </View>
                        ))}
                      </View>
                    ))
                  )
                )}
              </ScrollView>
            )}

            <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.headerBtn, styles.btnGhost, { flex: 1, justifyContent: 'center' }, reportExporting && { opacity: 0.6 }]}
                onPress={() => handleReportExport(activeReportModal as any, 'excel')}
                disabled={reportExporting}
                testID="report-export-excel-btn"
              >
                <Text style={styles.btnGhostText}>تصدير Excel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerBtn, styles.btnPrimary, { flex: 1, justifyContent: 'center' }, reportExporting && { opacity: 0.6 }]}
                onPress={() => handleReportExport(activeReportModal as any, 'pdf')}
                disabled={reportExporting}
                testID="report-export-pdf-btn"
              >
                {reportExporting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>تصدير PDF</Text>}
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
  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 },
  pageHeaderRight: { alignItems: 'flex-end' },
  pageTitle: { fontSize: 24, fontWeight: '700', color: '#1a2540', textAlign: 'right', marginBottom: 6 },
  semesterBadge: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: '#e7f0fe', borderWidth: 1, borderColor: '#bdd4fd',
    marginBottom: 6,
  },
  semesterBadgeText: { fontSize: 11, color: '#1565c0', fontWeight: '700' },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breadcrumbLink: { fontSize: 13, color: '#2962ff', fontWeight: '500' },
  breadcrumbCurrent: { fontSize: 13, color: '#8a95a8', fontWeight: '500' },
  pageHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8 },
  btnPrimary: { backgroundColor: '#2962ff' },
  btnExport: { backgroundColor: '#e53935' },
  btnExportExcel: { backgroundColor: '#1b7d3f' },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee' },
  btnGhostText: { color: '#1a2540', fontSize: 13, fontWeight: '600' },

  // بطاقة المعلم
  teacherCard: {
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
  teacherIconBg: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#e7f0fe',
    alignItems: 'center', justifyContent: 'center',
  },
  teacherAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#2962ff',
    alignItems: 'center', justifyContent: 'center',
  },
  teacherAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  teacherCardName: { fontSize: 18, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  teacherCardSub: { fontSize: 13, color: '#8a95a8', marginTop: 4, textAlign: 'right' },
  teacherCardSubRow: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
  teacherCardDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#cfd6e1', marginHorizontal: 8 },
  teacherHoursValue: { fontSize: 14, fontWeight: '700', color: '#2962ff' },

  // إحصائيات
  statsGrid: { flexDirection: 'row', gap: 14, marginBottom: 18, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 200, backgroundColor: '#fff', borderRadius: 14, padding: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#eef1f6' },
  statIconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  statTextCol: { flex: 1, alignItems: 'flex-end' },
  statLabel: { fontSize: 13, color: '#8a95a8', fontWeight: '500', marginBottom: 4 },
  statValue: { fontSize: 22, color: '#1a2540', fontWeight: '700', marginBottom: 2 },
  statSubLabel: { fontSize: 11, color: '#a8b1c2' },

  // بطاقة المقررات
  coursesCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eef1f6' },
  coursesCardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef1f6' },
  coursesCardTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540' },
  coursesHeaderRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  coursesCardCount: { fontSize: 12, color: '#5b6678' },
  coursesCountAccent: { color: '#2962ff', fontWeight: '700' },

  viewToggle: { flexDirection: 'row-reverse', backgroundColor: '#f1f4f9', borderRadius: 8, padding: 3, gap: 2 },
  viewToggleBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
  viewToggleBtnActive: { backgroundColor: '#2962ff' },

  coursesList: { padding: 14, gap: 10 },
  coursesListGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  courseRow: {
    backgroundColor: '#fafbfd',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eef1f6',
  },
  courseRowGrid: { width: '32%', minWidth: 280, marginLeft: '1.33%' },
  courseMain: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
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
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#5b6678' },

  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#1565c0' },
  badgeLevel: { backgroundColor: '#e7f0fe' },
  badgeSection: { backgroundColor: '#f3e5f5' },
  badgeLectures: { backgroundColor: '#fff3e0' },
  badgeStudents: { backgroundColor: '#e8f5e9' },

  courseActions: { flexDirection: 'row-reverse', justifyContent: 'flex-end', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eef1f6' },
  actionBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  actionUnassign: { backgroundColor: '#ffebee' },
  actionUnassignText: { fontSize: 12, color: '#f44336', fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingVertical: 50, gap: 12 },
  emptyText: { fontSize: 14, color: '#8a95a8' },

  // مودال الإسناد
  modalOverlay: { flex: 1, backgroundColor: 'rgba(20,30,55,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  assignModalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 640,
    maxHeight: '85%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eef1f6',
  },
  assignModalHeader: { flexDirection: 'row-reverse', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef1f6' },
  assignModalTitle: { fontSize: 16, fontWeight: '700', color: '#1a2540' },
  assignModalSubtitle: { fontSize: 12, color: '#8a95a8', marginTop: 3 },

  modalSearchBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#fafbfd', borderRadius: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e3e7ee', height: 42, marginHorizontal: 16, marginTop: 12 },
  modalSearchInput: { flex: 1, fontSize: 13, color: '#1a2540', textAlign: 'right', outlineStyle: 'none' as any },

  filterToggle: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  filterToggleText: { fontSize: 12, color: '#5b6678' },

  modalListContainer: { maxHeight: 360, paddingHorizontal: 16 },
  modalEmpty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  modalEmptyText: { fontSize: 13, color: '#8a95a8' },

  searchResultRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fafbfd',
    borderWidth: 1,
    borderColor: '#eef1f6',
    marginBottom: 8,
  },
  searchResultRowActive: { backgroundColor: '#e7f0fe', borderColor: '#2962ff' },
  resultName: { fontSize: 13, fontWeight: '700', color: '#1a2540' },
  resultCode: { fontSize: 11, color: '#8a95a8' },
  resultMeta: { fontSize: 11, color: '#5b6678' },
  deptBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: '#e3f2fd', borderWidth: 1, borderColor: '#90caf9' },
  deptBadgeText: { fontSize: 10, color: '#1565c0', fontWeight: '700' },

  hoursWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  hoursInput: {
    width: 56, height: 32, borderRadius: 6, borderWidth: 1, borderColor: '#2962ff',
    backgroundColor: '#fff', textAlign: 'center', fontSize: 13, color: '#1a2540',
    outlineStyle: 'none' as any,
  },
  hoursLabel: { fontSize: 10, color: '#8a95a8' },

  assignFooter: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderTopWidth: 1, borderTopColor: '#eef1f6', backgroundColor: '#fafbfd',
    flexWrap: 'wrap', gap: 10,
  },
  pickedCountText: { fontSize: 13, color: '#5b6678' },
  pickedCountAccent: { color: '#2962ff', fontWeight: '700' },

  // مودال التأكيد
  confirmCard: { backgroundColor: '#fff', borderRadius: 14, padding: 22, width: '100%', maxWidth: 420 },
  confirmTitle: { fontSize: 17, fontWeight: '700', color: '#1a2540', textAlign: 'center', marginBottom: 10 },
  confirmText: { fontSize: 13, color: '#5b6678', textAlign: 'center', lineHeight: 22 },
  confirmNote: { fontSize: 12, color: '#8a95a8', textAlign: 'center', marginTop: 8, fontStyle: 'italic' },

  // مودال قوائم الإجراءات/التقارير
  menuCard: { backgroundColor: '#fff', borderRadius: 14, padding: 10, width: '100%', maxWidth: 320 },
  menuCardTitle: { fontSize: 14, fontWeight: '700', color: '#1a2540', textAlign: 'right', padding: 10 },
  menuRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  menuRowText: { fontSize: 14, color: '#1a2540', fontWeight: '600' },
  menuRowDanger: { borderTopWidth: 1, borderTopColor: '#eef1f6', marginTop: 4 },
  menuCancelBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 6, borderTopWidth: 1, borderTopColor: '#eef1f6' },
  menuCancelText: { fontSize: 13, color: '#8a95a8', fontWeight: '600' },

  // نموذج تعديل بيانات المعلم
  fieldLabel: { fontSize: 12, color: '#5b6678', fontWeight: '600', textAlign: 'right', marginTop: 12, marginBottom: 6 },
  deptChipsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  deptChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#f1f4f9', borderWidth: 1, borderColor: '#e3e7ee' },
  deptChipSelected: { backgroundColor: '#e7f0fe', borderColor: '#2962ff' },
  deptChipText: { fontSize: 12, color: '#5b6678', fontWeight: '600' },
  deptChipTextSelected: { color: '#2962ff' },

  // تقارير المعاينة
  reportStatRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eef1f6' },
  reportStatLabel: { fontSize: 13, color: '#5b6678', fontWeight: '600' },
  reportStatValue: { fontSize: 14, color: '#1a2540', fontWeight: '700' },
  reportCourseRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f4f6fb' },
  reportCourseName: { fontSize: 12, color: '#1a2540', fontWeight: '600', flex: 1, textAlign: 'right' },
  reportCourseHours: { fontSize: 12, color: '#2962ff', fontWeight: '700', marginRight: 8 },
  reportDayTitle: { fontSize: 13, fontWeight: '700', color: '#1a2540', textAlign: 'right', marginTop: 12, marginBottom: 4, backgroundColor: '#f4f6fb', padding: 6, borderRadius: 6 },
});
