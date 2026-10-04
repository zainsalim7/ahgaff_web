import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  Platform, ScrollView, KeyboardAvoidingView, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { settingsAPI, lecturesAPI } from '../src/services/api';
import { useAuthStore } from '../src/store/authStore';
import { LoadingScreen } from '../src/components/LoadingScreen';
import api from '../src/services/api';
import { DayShiftModal } from '../src/components/DayShiftModal';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFaculty, setFilterFaculty] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterTime, setFilterTime] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | 'completed' | 'scheduled' | 'cancelled'>('');
  const [purgeModal, setPurgeModal] = useState(false);
  const [purgeScope, setPurgeScope] = useState<'faculty' | 'department' | 'course'>('department');
  const [purgeFaculty, setPurgeFaculty] = useState('');
  const [purgeDept, setPurgeDept] = useState('');
  const [purgeCourse, setPurgeCourse] = useState('');
  const [purgeFutureOnly, setPurgeFutureOnly] = useState(false);
  const [purgeLists, setPurgeLists] = useState<{ faculties: any[]; departments: any[]; courses: any[] }>({ faculties: [], departments: [], courses: [] });
  const [purgePreview, setPurgePreview] = useState<any>(null);
  const [purging, setPurging] = useState(false);

  const canPurge = user?.role === 'admin' || user?.permissions?.includes('manage_lectures');
  const canShiftDay = user?.role === 'admin' || user?.permissions?.includes('shift_day');
  const [shiftModal, setShiftModal] = useState(false);
  const [dayShifts, setDayShifts] = useState<any[]>([]);
  const [reverting, setReverting] = useState('');

  const fetchDayShifts = useCallback(async (date: string) => {
    try {
      const r = await api.get(`/day-shift?date=${date}`);
      setDayShifts(r.data || []);
    } catch { setDayShifts([]); }
  }, []);

  const revertShift = async (id: string) => {
    if (!window.confirm('التراجع عن الإزاحة وإعادة محاضرات اليوم إلى أوقاتها الأصلية؟\n(المحاضرات التي انعقدت أو بدأ تحضيرها لن تُمس)')) return;
    setReverting(id);
    try {
      const r = await api.post(`/day-shift/${id}/revert`);
      window.alert(`✅ ${r.data.message}`);
      fetchLectures(selectedDate); fetchDayShifts(selectedDate);
    } catch (e: any) {
      window.alert(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'فشل التراجع');
    } finally { setReverting(''); }
  };

  const openPurgeModal = async () => {
    setPurgePreview(null); setPurgeModal(true);
    try {
      const [f, d, c] = await Promise.all([api.get('/faculties'), api.get('/departments'), api.get('/courses')]);
      setPurgeLists({ faculties: f.data || [], departments: d.data || [], courses: c.data || [] });
    } catch { setPurgeLists({ faculties: [], departments: [], courses: [] }); }
  };

  const purgeBody = () => ({
    scope: purgeScope,
    faculty_id: purgeFaculty || null,
    department_id: purgeDept || null,
    course_id: purgeCourse || null,
    future_only: purgeFutureOnly,
  });

  const runPurgePreview = async () => {
    setPurging(true);
    try {
      const res = await api.post('/lectures/purge/preview', purgeBody());
      setPurgePreview(res.data);
    } catch (e: any) {
      window.alert(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'خطأ في المعاينة');
    } finally { setPurging(false); }
  };

  const runPurge = async () => {
    if (!purgePreview) return;
    if (!window.confirm(`⚠️ تأكيد نهائي: ${purgePreview.message}\n\nهذا الإجراء لا يمكن التراجع عنه. المقررات والإسنادات والجدول الأسبوعي لن تُمس. متابعة؟`)) return;
    setPurging(true);
    try {
      const res = await api.post('/lectures/purge', purgeBody());
      window.alert(res.data.message);
      setPurgeModal(false);
      fetchLectures(selectedDate);
    } catch (e: any) {
      window.alert(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'فشل المسح');
    } finally { setPurging(false); }
  };

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
    fetchDayShifts(selectedDate);
  }, [selectedDate, fetchLectures, fetchDayShifts]);

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

  // 📊 الإحصائيات تتبع فلاتر الكلية/القسم/الوقت (لا فلتر الحالة) حتى تعكس ما هو معروض فقط
  const scopedLectures = useMemo(() => lectures.filter((l) =>
    (!filterFaculty || l.faculty_id === filterFaculty) && (!filterDept || l.department_id === filterDept) && (!filterTime || l.start_time === filterTime)
  ), [lectures, filterFaculty, filterDept, filterTime]);

  const statsCounts = useMemo(() => {
    const counts = { total: scopedLectures.length, completed: 0, scheduled: 0, cancelled: 0, absent: 0 };
    scopedLectures.forEach((l) => {
      if (l.status === 'completed') counts.completed++;
      else if (l.status === 'scheduled') counts.scheduled++;
      else if (l.status === 'cancelled') counts.cancelled++;
      else if (l.status === 'absent') counts.absent++;
    });
    return counts;
  }, [scopedLectures]);

  const toggleStatus = (st: 'completed' | 'scheduled' | 'cancelled') => setFilterStatus((cur) => (cur === st ? '' : st));

  // 🎛️ خيارات الفلاتر مستخرجة من محاضرات اليوم نفسها (كلية ← قسم ← وقت)
  const filterOptions = useMemo(() => {
    const fac = new Map<string, string>(); const dep = new Map<string, { name: string; faculty_id: string }>(); const times = new Map<string, { start: string; end: string }>();
    lectures.forEach((l) => {
      if (l.faculty_id) fac.set(l.faculty_id, l.faculty_name || 'بدون اسم');
      if (l.department_id) dep.set(l.department_id, { name: l.department_name || 'بدون اسم', faculty_id: l.faculty_id || '' });
      if (l.start_time) times.set(l.start_time, { start: l.start_time, end: l.end_time || '' });
    });
    const byName = (a: string, b: string) => a.localeCompare(b, 'ar');
    return {
      faculties: [...fac.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => byName(a.name, b.name)),
      departments: [...dep.entries()].map(([id, v]) => ({ id, ...v })).filter((d) => !filterFaculty || d.faculty_id === filterFaculty).sort((a, b) => byName(a.name, b.name)),
      times: [...times.values()].sort((a, b) => a.start.localeCompare(b.start)),
    };
  }, [lectures, filterFaculty]);

  useEffect(() => { setFilterDept(''); }, [filterFaculty]);

  const activeFiltersCount = [filterFaculty, filterDept, filterTime, filterStatus].filter(Boolean).length;
  const clearFilters = () => { setFilterFaculty(''); setFilterDept(''); setFilterTime(''); setFilterStatus(''); };

  const filteredLectures = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedLectures.filter((l) => {
      if (filterStatus === 'cancelled' ? !['cancelled', 'absent'].includes(l.status) : filterStatus && l.status !== filterStatus) return false;
      if (!q) return true;
      return [l.course_name, l.course_code, l.teacher_name, l.faculty_name, l.department_name, l.room]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [scopedLectures, searchQuery, filterStatus]);

  // 🗂️ تجميع المحاضرات حسب الفترة الزمنية (قروبات مرتبة زمنياً)
  const timeGroups = useMemo(() => {
    const map: Record<string, { start: string; end: string; items: any[] }> = {};
    filteredLectures.forEach((l) => {
      const key = `${l.start_time || '؟'}|${l.end_time || '؟'}`;
      if (!map[key]) map[key] = { start: l.start_time || '', end: l.end_time || '', items: [] };
      map[key].items.push(l);
    });
    return Object.values(map).sort((a, b) => (a.start || 'zz').localeCompare(b.start || 'zz'));
  }, [filteredLectures]);

  const [openMenuId, setOpenMenuId] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [weekOffset, setWeekOffset] = useState(0);

  const hijriDate = useMemo(() => {
    try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(selectedDate + 'T00:00:00')); } catch { return ''; }
  }, [selectedDate]);

  // 📅 أيام الأسبوع (السبت → الخميس) حول اليوم المختار
  const weekDays = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    const back = (d.getDay() + 1) % 7; // السبت = 0
    const sat = new Date(d); sat.setDate(d.getDate() - back + weekOffset * 7);
    return Array.from({ length: 6 }, (_, i) => {
      const x = new Date(sat); x.setDate(sat.getDate() + i);
      const iso = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      return { iso, day: DAYS_AR[x.getDay()], label: `${x.getDate()} ${x.toLocaleDateString('ar', { month: 'long' })}` };
    });
  }, [selectedDate, weekOffset]);
  useEffect(() => { setWeekOffset(0); }, [selectedDate]);

  const todayIso = getToday();
  const canManage = user?.role === 'admin' || user?.permissions?.includes('manage_lectures') || user?.permissions?.includes('edit_lectures');
  const COURSE_ICONS: any[] = ['book', 'library', 'school', 'document-text', 'globe', 'flask', 'calculator', 'language'];
  const courseIcon = (id: string) => { let h = 0; for (let i = 0; i < (id || '').length; i++) h = id.charCodeAt(i) + ((h << 5) - h); return COURSE_ICONS[Math.abs(h) % COURSE_ICONS.length]; };

  const renderSmallCard = (item: any) => {
    const st = STATUS_CONFIG[item.status] || STATUS_CONFIG.scheduled;
    const courseColor = getCourseColor(item.course_id);
    const isCancelled = item.status === 'cancelled' || item.status === 'absent';
    const menuOpen = openMenuId === item.id;
    return (
      <View key={item.id} style={[n.card, { borderRightColor: st.color }, isCancelled && { backgroundColor: '#fff5f5' }]} testID={`lecture-card-${item.id}`}>
        <View style={n.cardTop}>
          <View style={[n.statusPill, { backgroundColor: st.color }]}>
            <Text style={n.statusPillText}>{st.label}</Text>
          </View>
          {canManage && (
            <TouchableOpacity onPress={() => setOpenMenuId(menuOpen ? '' : item.id)} style={n.kebab} testID={`lecture-menu-${item.id}`}>
              <Ionicons name="ellipsis-vertical" size={16} color="#5b6678" />
            </TouchableOpacity>
          )}
        </View>
        {menuOpen && (
          <View style={n.menuRow} testID={`lecture-menu-items-${item.id}`}>
            <TouchableOpacity style={[n.menuBtn, { backgroundColor: '#e3f2fd' }]} onPress={() => { setOpenMenuId(''); router.push({ pathname: '/take-attendance', params: { lectureId: item.id, courseId: item.course_id, courseName: item.course_name } }); }} testID={`view-attendance-${item.id}`}>
              <Ionicons name="eye-outline" size={13} color="#1565c0" /><Text style={[n.menuBtnText, { color: '#1565c0' }]}>الحضور</Text>
            </TouchableOpacity>
            {item.status !== 'cancelled' && (
              <TouchableOpacity style={[n.menuBtn, { backgroundColor: '#fff3e0' }]} onPress={() => { setOpenMenuId(''); handleCancelLecture(item.id); }} testID={`cancel-lecture-${item.id}`}>
                <Ionicons name="close-circle-outline" size={13} color="#e65100" /><Text style={[n.menuBtnText, { color: '#e65100' }]}>إلغاء</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[n.menuBtn, { backgroundColor: '#ffebee' }]} onPress={() => { setOpenMenuId(''); handleDeleteLecture(item.id); }} testID={`delete-lecture-${item.id}`}>
              <Ionicons name="trash-outline" size={13} color="#c62828" /><Text style={[n.menuBtnText, { color: '#c62828' }]}>حذف</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={n.cardBody}>
          <View style={[n.courseIcon, { backgroundColor: courseColor + '1a' }]}>
            <Ionicons name={courseIcon(item.course_id)} size={20} color={courseColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={n.courseName} numberOfLines={1}>{item.course_name}</Text>
            <Text style={n.courseSub} numberOfLines={1}>{item.faculty_name || item.department_name || item.course_code || ''}</Text>
          </View>
        </View>
        {(item.teacher_name || item.section || item.room || item.level) ? (
        <View style={n.metaRow}>
          {item.teacher_name ? <View style={n.meta}><Ionicons name="person-outline" size={12} color="#8a95a8" /><Text style={n.metaText} numberOfLines={1}>{item.teacher_name}</Text></View> : null}
          {item.level ? <View style={n.meta} testID={`lecture-level-${item.id}`}><Ionicons name="layers-outline" size={12} color="#8a95a8" /><Text style={n.metaText}>المستوى {item.level}</Text></View> : null}
          {item.section ? <View style={n.meta}><Ionicons name="people-outline" size={12} color="#8a95a8" /><Text style={n.metaText}>شعبة {item.section}</Text></View> : null}
          {item.room ? <View style={n.meta}><Ionicons name="location-outline" size={12} color="#8a95a8" /><Text style={n.metaText}>قاعة {item.room}</Text></View> : null}
        </View>
        ) : null}
        {(item.group || item.day_shift_cancelled || item.day_shifted || typeof item.attendance_count !== 'undefined') && (
          <View style={n.chipRow}>
            {item.group ? <View style={[n.chip, { backgroundColor: '#e0f2f1' }]} testID={`schedule-group-${item.id}`}><Text style={[n.chipText, { color: '#00695c' }]}>👥 {item.group_name || `مجموعة ${item.group}`}</Text></View> : null}
            {item.day_shift_cancelled ? <View style={[n.chip, { backgroundColor: '#fce4ec' }]} testID={`shift-cancelled-badge-${item.id}`}><Text style={[n.chipText, { color: '#ad1457' }]}>ملغاة بالإزاحة</Text></View>
              : item.day_shifted ? <View style={[n.chip, { backgroundColor: '#ede7f6' }]} testID={`shift-badge-${item.id}`}><Text style={[n.chipText, { color: '#5e35b1' }]}>{item.credited_minutes ? `إزاحة (تُحسب ${item.credited_minutes} د)` : 'إزاحة'}</Text></View> : null}
            {typeof item.attendance_count !== 'undefined' && (
              <Text style={n.attText}>{item.status === 'completed' ? `حضور ${item.attendance_count || 0}/${item.total_enrolled || 0}` : `مسجل ${item.total_enrolled || 0}`}</Text>
            )}
          </View>
        )}
        {isTeacher && (
          <TouchableOpacity style={n.takeBtn} onPress={() => router.push({ pathname: '/take-attendance', params: { lectureId: item.id, courseId: item.course_id } })} testID={`teacher-lecture-${item.id}`}>
            <Ionicons name="clipboard-outline" size={13} color="#fff" />
            <Text style={n.takeBtnText}>تسجيل الحضور</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const statCards = [
    { key: '', id: 'total', label: 'إجمالي المحاضرات', value: statsCounts.total, sub: filterFaculty || filterDept || filterTime ? 'ضمن الفلتر الحالي' : `من أصل ${lectures.length} محاضرة`, color: '#1565c0', soft: '#e3f2fd', icon: 'calendar' as const, pct: lectures.length ? Math.round(statsCounts.total * 100 / lectures.length) : 0 },
    { key: 'completed', id: 'completed', label: 'منعقدة', value: statsCounts.completed, sub: 'محاضرة مكتملة', color: '#2e7d32', soft: '#e8f5e9', icon: 'checkmark-done' as const, pct: statsCounts.total ? Math.round(statsCounts.completed * 100 / statsCounts.total) : 0 },
    { key: 'scheduled', id: 'scheduled', label: 'مجدولة', value: statsCounts.scheduled, sub: 'في الانتظار', color: '#1565c0', soft: '#e3f2fd', icon: 'time' as const, pct: statsCounts.total ? Math.round(statsCounts.scheduled * 100 / statsCounts.total) : 0 },
    { key: 'cancelled', id: 'cancelled', label: 'ملغاة / غياب', value: statsCounts.cancelled + statsCounts.absent, sub: `ملغاة ${statsCounts.cancelled} · غياب ${statsCounts.absent}`, color: '#c62828', soft: '#ffebee', icon: 'close' as const, pct: statsCounts.total ? Math.round((statsCounts.cancelled + statsCounts.absent) * 100 / statsCounts.total) : 0 },
  ] as const;

  const dayName = DAYS_AR[new Date(selectedDate + 'T00:00:00').getDay()];
  const dayNum = new Date(selectedDate + 'T00:00:00').getDate();
  const monthYear = new Date(selectedDate + 'T00:00:00').toLocaleDateString('ar', { month: 'long', year: 'numeric' });

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.pageScroll, { flexGrow: 1 }]} showsVerticalScrollIndicator={true}>

          {/* 🏛️ Hero header */}
          <View style={n.hero} testID="schedule-hero">
            <View style={n.heroDeco} />
            <View style={n.heroDeco2} />
            <View style={n.heroDate}>
              <View style={n.heroDateIcon}><Ionicons name="calendar" size={30} color="#1565c0" /></View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={n.heroDay} testID="hero-day">{dayName}</Text>
                <Text style={n.heroGreg}>{dayNum} {monthYear} م</Text>
                {hijriDate ? <Text style={n.heroHijri}>{hijriDate}</Text> : null}
                {Platform.OS === 'web' && (
                  <input type="date" value={selectedDate} onChange={(e: any) => setSelectedDate(e.target.value)} style={{ position: 'absolute', opacity: 0, inset: 0, width: '100%', height: '100%', cursor: 'pointer' }} data-testid="date-picker-input" title="اختر تاريخاً" />
                )}
              </View>
            </View>
            <View style={n.heroTitleWrap}>
              <View style={n.heroTitleRow}>
                <Text style={n.heroTitle}>{isTeacher ? 'جدول المحاضرات' : 'الجدول اليومي'}</Text>
                <Ionicons name="calendar-outline" size={26} color="#1565c0" />
              </View>
              <Text style={n.heroSubtitle}>إدارة ومتابعة محاضرات جميع كليات اليوم الدراسي</Text>
              <View style={s.breadcrumb}>
                <TouchableOpacity onPress={() => router.replace('/')}><Text style={s.breadcrumbLink}>الرئيسية</Text></TouchableOpacity>
                <Ionicons name="chevron-back" size={12} color="#8a95a8" />
                <Text style={s.breadcrumbCurrent}>الجدول</Text>
              </View>
            </View>
            <View style={n.quickBox} testID="quick-actions">
              <View style={n.quickHead}><Ionicons name="flash-outline" size={14} color="#5b6678" /><Text style={n.quickTitle}>إجراءات سريعة</Text></View>
              <View style={n.quickRow}>
                {canPurge && Platform.OS === 'web' && (
                  <TouchableOpacity style={[n.qBtn, { backgroundColor: '#ffebee' }]} onPress={openPurgeModal} data-testid="purge-lectures-btn">
                    <Ionicons name="trash-outline" size={14} color="#c62828" /><Text style={[n.qBtnText, { color: '#c62828' }]}>مسح المحاضرات</Text>
                  </TouchableOpacity>
                )}
                {canShiftDay && Platform.OS === 'web' && (
                  <TouchableOpacity style={[n.qBtn, { backgroundColor: '#1565c0' }]} onPress={() => setShiftModal(true)} testID="day-shift-open-btn">
                    <Ionicons name="time-outline" size={14} color="#fff" /><Text style={[n.qBtnText, { color: '#fff' }]}>إزاحة اليوم الدراسي</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[n.qBtn, { backgroundColor: '#f1f5f9' }]} onPress={() => fetchLectures(selectedDate)} testID="refresh-btn">
                  <Ionicons name="refresh" size={14} color="#1a2540" /><Text style={n.qBtnText}>تحديث</Text>
                </TouchableOpacity>
                {!isToday && (
                  <TouchableOpacity style={[n.qBtn, { backgroundColor: '#e3f2fd' }]} onPress={() => setSelectedDate(getToday())} data-testid="go-today-btn">
                    <Ionicons name="today-outline" size={14} color="#1565c0" /><Text style={[n.qBtnText, { color: '#1565c0' }]}>اليوم</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* 📊 Stats */}
          <View style={n.statsGrid}>
            {statCards.map((c) => {
              const on = c.key ? filterStatus === c.key : !filterStatus;
              return (
                <TouchableOpacity key={c.id} style={[n.stat, on && c.key ? { borderColor: c.color, borderWidth: 2 } : null]} onPress={() => (c.key ? toggleStatus(c.key) : setFilterStatus(''))} activeOpacity={0.85} testID={`stat-card-${c.id}`}>
                  <View style={n.statTop}>
                    <View style={{ alignItems: 'flex-end', flex: 1 }}>
                      <Text style={n.statLabel}>{c.label}</Text>
                      <Text style={[n.statValue, { color: c.color }]} testID={`stat-value-${c.id}`}>{c.value}</Text>
                      <Text style={n.statSub}>{on && c.key ? 'مفلترة — اضغط للإلغاء' : c.sub}</Text>
                    </View>
                    <View style={[n.statIcon, { backgroundColor: c.soft }]}><Ionicons name={c.icon} size={24} color={c.color} /></View>
                  </View>
                  <View style={n.barRow}>
                    <Text style={[n.barPct, { color: c.color }]}>{c.pct}%</Text>
                    <View style={n.barTrack}><View style={[n.barFill, { width: `${c.pct}%`, backgroundColor: c.color }]} /></View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 📅 Week strip */}
          <View style={n.weekRow} data-testid="date-navigation">
            <TouchableOpacity onPress={() => setWeekOffset((w) => w + 1)} style={n.weekArrow} data-testid="next-day-btn"><Ionicons name="chevron-forward" size={20} color="#1a2540" /></TouchableOpacity>
            <View style={n.weekDays}>
              {weekDays.map((d) => {
                const active = d.iso === selectedDate;
                return (
                  <TouchableOpacity key={d.iso} onPress={() => setSelectedDate(d.iso)} style={[n.weekDay, active && n.weekDayOn]} testID={`week-day-${d.iso}`}>
                    <Text style={[n.weekDayName, active && { color: '#fff' }]}>{d.day}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Text style={[n.weekDayDate, active && { color: 'rgba(255,255,255,0.9)' }]}>{d.label}</Text>
                      {d.iso === todayIso && <View style={[n.todayDot, active && { backgroundColor: '#fff' }]} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity onPress={() => setWeekOffset((w) => w - 1)} style={n.weekArrow} data-testid="prev-day-btn"><Ionicons name="chevron-back" size={20} color="#1a2540" /></TouchableOpacity>
          </View>

          {/* ℹ️ Notices */}
          <View style={n.noticeRow}>
            {semesterSettings?.semester_start_date && semesterSettings?.semester_end_date ? (
              <View style={n.semChip}>
                <Ionicons name="calendar-outline" size={14} color="#1565c0" />
                <Text style={n.semChipText}>الفصل النشط: {semesterSettings.semester_start_date} ← {semesterSettings.semester_end_date}{semesterSettings.current_semester ? ` · ${semesterSettings.current_semester}` : ''}</Text>
              </View>
            ) : semesterSettings?.current_semester ? (
              <View style={n.semChip}><Ionicons name="school" size={14} color="#1565c0" /><Text style={n.semChipText}>{semesterSettings.current_semester}</Text></View>
            ) : null}
            {dayShifts.map((sh) => {
              const d = (sh.days || []).find((x: any) => x.date === selectedDate);
              if (!d || !d.lectures) return null;
              return (
                <View key={sh.id} style={n.shiftStrip} testID={`day-shift-badge-${sh.id}`}>
                  <Text style={n.shiftText} numberOfLines={2}>
                    {d.old_first} ← {d.new_first} ({d.offset_minutes > 0 ? '+' : ''}{d.offset_minutes} د · {d.lectures} محاضرة){sh.reason ? ` — ${sh.reason}` : ''}{sh.created_by_name ? ` · ${sh.created_by_name}` : ''}
                  </Text>
                  <TouchableOpacity onPress={() => canShiftDay && revertShift(sh.id)} disabled={!canShiftDay || reverting === sh.id} style={n.shiftBtn} testID={`day-shift-revert-${sh.id}`}>
                    <Ionicons name={canShiftDay ? 'arrow-undo' : 'time'} size={13} color="#fff" />
                    <Text style={n.shiftBtnText}>{reverting === sh.id ? '...' : canShiftDay ? 'بداية مؤخَّرة · تراجع' : 'بداية مؤخَّرة'}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {/* 📚 Lectures */}
          <View style={n.listCard}>
            <View style={n.listHead}>
              <View style={n.listTitleWrap}>
                <View style={n.listTitleIcon}><Ionicons name="book" size={20} color="#1565c0" /></View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={n.listTitle}>محاضرات {dayName}</Text>
                  <Text style={n.listCount} data-testid="lecture-count">
                    {loading ? '...' : <>عرض <Text style={{ color: '#1565c0', fontWeight: '800' }}>{filteredLectures.length}</Text> من {lectures.length} محاضرة</>}
                  </Text>
                </View>
              </View>
              <View style={n.filtersWrap} testID="schedule-filter-bar">
                <View style={n.searchBox}>
                  <TextInput style={n.searchInput} placeholder="ابحث في اسم المقرر أو المدرس أو القاعة..." placeholderTextColor="#a8b1c2" value={searchQuery} onChangeText={setSearchQuery} data-testid="schedule-search-input" />
                  {searchQuery.length > 0 ? (
                    <TouchableOpacity onPress={() => setSearchQuery('')} data-testid="schedule-search-clear"><Ionicons name="close-circle" size={16} color="#8a95a8" /></TouchableOpacity>
                  ) : <Ionicons name="search" size={16} color="#8a95a8" />}
                </View>
                {Platform.OS === 'web' && lectures.length > 0 && (
                  <>
                    <View style={n.filterField}>
                      <Ionicons name="business-outline" size={14} color="#1565c0" />
                      <select value={filterFaculty} onChange={(e: any) => setFilterFaculty(e.target.value)} style={filterSelectStyle} data-testid="filter-faculty-select">
                        <option value="">كل الكليات ({filterOptions.faculties.length})</option>
                        {filterOptions.faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </View>
                    <View style={n.filterField}>
                      <Ionicons name="git-branch-outline" size={14} color="#1565c0" />
                      <select value={filterDept} onChange={(e: any) => setFilterDept(e.target.value)} style={filterSelectStyle} data-testid="filter-department-select">
                        <option value="">كل الأقسام ({filterOptions.departments.length})</option>
                        {filterOptions.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </View>
                    <View style={n.filterField}>
                      <Ionicons name="time-outline" size={14} color="#1565c0" />
                      <select value={filterTime} onChange={(e: any) => setFilterTime(e.target.value)} style={filterSelectStyle} data-testid="filter-time-select">
                        <option value="">كل الفترات ({filterOptions.times.length})</option>
                        {filterOptions.times.map((t) => <option key={t.start} value={t.start}>{t.start}{t.end ? ` – ${t.end}` : ''}</option>)}
                      </select>
                    </View>
                    <View style={n.filterField}>
                      <Ionicons name="funnel-outline" size={14} color="#1565c0" />
                      <select value={filterStatus} onChange={(e: any) => setFilterStatus(e.target.value)} style={filterSelectStyle} data-testid="filter-status-select">
                        <option value="">كل الحالات</option>
                        <option value="completed">منعقدة</option>
                        <option value="scheduled">مجدولة</option>
                        <option value="cancelled">ملغاة / غياب</option>
                      </select>
                    </View>
                    {activeFiltersCount > 0 && (
                      <TouchableOpacity onPress={clearFilters} style={n.clearBtn} testID="filter-clear-btn">
                        <Ionicons name="close-circle" size={14} color="#c62828" /><Text style={n.clearBtnText}>مسح الفلاتر ({activeFiltersCount})</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            </View>

            {loading ? (
              <View style={s.center}><LoadingScreen /></View>
            ) : filteredLectures.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="calendar-outline" size={56} color="#cfd6e1" />
                <Text style={s.emptyTitle}>{searchQuery || activeFiltersCount ? 'لا توجد نتائج مطابقة' : 'لا توجد محاضرات'}</Text>
                <Text style={s.emptySubtitle}>
                  {searchQuery ? `لا توجد محاضرات تطابق «${searchQuery}»` : activeFiltersCount ? 'لا توجد محاضرات تطابق الفلاتر المحددة' : `لا توجد محاضرات مجدولة في ${formatDateArabic(selectedDate)}`}
                </Text>
              </View>
            ) : (
              <View style={{ padding: 14, paddingTop: 4 }} testID="time-groups-container">
                {timeGroups.map((g, gi) => {
                  const key = `${g.start}-${g.end}`;
                  const isCollapsed = !!collapsed[key];
                  return (
                    <View key={`${key}-${gi}`} style={{ marginBottom: 14 }} testID={`time-group-${g.start || 'na'}`}>
                      <TouchableOpacity style={n.groupHead} onPress={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))} activeOpacity={0.8} testID={`time-group-toggle-${g.start || 'na'}`}>
                        <Ionicons name={isCollapsed ? 'chevron-down' : 'chevron-up'} size={18} color="#1565c0" />
                        <View style={{ flex: 1 }} />
                        <View style={n.countPill}><Text style={n.countPillText}>{g.items.length} {g.items.length === 1 ? 'محاضرة' : 'محاضرات'}</Text></View>
                        <Text style={n.groupTime}>{g.start && g.end ? `${g.start} – ${g.end}` : 'بدون وقت محدد'}</Text>
                        <Ionicons name="time-outline" size={16} color="#1565c0" />
                      </TouchableOpacity>
                      {!isCollapsed && <View style={n.grid}>{g.items.map(renderSmallCard)}</View>}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
      {Platform.OS === 'web' && (
        <DayShiftModal open={shiftModal} onClose={() => setShiftModal(false)} initialDate={selectedDate} onApplied={() => { fetchLectures(selectedDate); fetchDayShifts(selectedDate); }} />
      )}
      {purgeModal && Platform.OS === 'web' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
          backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl',
        }} onClick={() => !purging && setPurgeModal(false)}>
          <div onClick={(ev: any) => ev.stopPropagation()} style={{
            backgroundColor: '#fff', borderRadius: 12, padding: 20, width: 520, maxWidth: '94%', maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          }} data-testid="purge-modal">
            <div style={{ fontSize: 15, fontWeight: 800, color: '#c62828', marginBottom: 4, textAlign: 'right' }}>🗑️ مسح المحاضرات المولدة</div>
            <div style={{ fontSize: 11.5, color: '#5b6678', marginBottom: 12, textAlign: 'right', lineHeight: 1.7 }}>
              يحذف <b>المحاضرات وسجلات حضورها فقط</b> — لا يمس المقررات ولا الإسنادات ولا الجدول الأسبوعي.
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 6, textAlign: 'right' }}>النطاق:</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[['faculty', 'كلية كاملة'], ['department', 'قسم'], ['course', 'مقرر واحد']].map(([v, l]) => (
                <button key={v} onClick={() => { setPurgeScope(v as any); setPurgePreview(null); }} style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                  border: purgeScope === v ? '2px solid #c62828' : '1px solid #ddd',
                  backgroundColor: purgeScope === v ? '#ffebee' : '#fff', color: purgeScope === v ? '#c62828' : '#555',
                }} data-testid={`purge-scope-${v}`}>{l}</button>
              ))}
            </div>

            <select value={purgeFaculty} onChange={(ev: any) => { setPurgeFaculty(ev.target.value); setPurgeDept(''); setPurgeCourse(''); setPurgePreview(null); }} style={{
              width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, direction: 'rtl', backgroundColor: '#f7f9fc', marginBottom: 8,
            }} data-testid="purge-faculty-select">
              <option value="">-- اختر الكلية --</option>
              {purgeLists.faculties.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {purgeScope !== 'faculty' && (
              <select value={purgeDept} onChange={(ev: any) => { setPurgeDept(ev.target.value); setPurgeCourse(''); setPurgePreview(null); }} style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, direction: 'rtl', backgroundColor: '#f7f9fc', marginBottom: 8,
              }} data-testid="purge-dept-select">
                <option value="">-- اختر القسم --</option>
                {purgeLists.departments.filter((d: any) => !purgeFaculty || d.faculty_id === purgeFaculty).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            {purgeScope === 'course' && (
              <select value={purgeCourse} onChange={(ev: any) => { setPurgeCourse(ev.target.value); setPurgePreview(null); }} style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, direction: 'rtl', backgroundColor: '#f7f9fc', marginBottom: 8,
              }} data-testid="purge-course-select">
                <option value="">-- اختر المقرر --</option>
                {purgeLists.courses.filter((c: any) => !purgeDept || c.department_id === purgeDept).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}{c.level ? ` (م${c.level}${c.section ? '/' + c.section : ''})` : ''}</option>
                ))}
              </select>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, marginTop: 4 }}>
              {[[false, 'كل المحاضرات'], [true, 'المستقبلية فقط']].map(([v, l]: any) => (
                <button key={String(v)} onClick={() => { setPurgeFutureOnly(v); setPurgePreview(null); }} style={{
                  flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  border: purgeFutureOnly === v ? '2px solid #e65100' : '1px solid #ddd',
                  backgroundColor: purgeFutureOnly === v ? '#fff3e0' : '#fff', color: purgeFutureOnly === v ? '#e65100' : '#555',
                }} data-testid={`purge-time-${v ? 'future' : 'all'}`}>{l}</button>
              ))}
            </div>

            <button onClick={runPurgePreview} disabled={purging || (purgeScope === 'faculty' ? !purgeFaculty : purgeScope === 'department' ? !purgeDept : !purgeCourse)} style={{
              width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer', marginBottom: 8,
              backgroundColor: '#e65100', color: '#fff', fontSize: 13, fontWeight: 700, opacity: purging ? 0.6 : 1,
            }} data-testid="purge-preview-btn">{purging ? 'جاري الفحص...' : '🔍 معاينة ما سيُحذف'}</button>

            {purgePreview && (
              <div data-testid="purge-preview-report">
                <div style={{
                  padding: '10px 12px', borderRadius: 8, marginBottom: 8, fontSize: 12.5, fontWeight: 700, textAlign: 'right', lineHeight: 1.8,
                  backgroundColor: purgePreview.total > 0 ? '#ffebee' : '#f5f5f5', color: purgePreview.total > 0 ? '#b71c1c' : '#666',
                }}>{purgePreview.message}</div>
                {purgePreview.total > 0 && (
                  <button onClick={runPurge} disabled={purging} style={{
                    width: '100%', padding: '11px 0', borderRadius: 8, border: 'none', cursor: 'pointer', marginBottom: 8,
                    backgroundColor: '#c62828', color: '#fff', fontSize: 13.5, fontWeight: 800,
                  }} data-testid="purge-confirm-btn">{purging ? 'جاري المسح...' : `🗑️ تأكيد مسح ${purgePreview.total} محاضرة نهائياً`}</button>
                )}
              </div>
            )}

            <button onClick={() => setPurgeModal(false)} disabled={purging} style={{
              width: '100%', padding: '9px 0', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer',
              backgroundColor: '#fff', color: '#555', fontSize: 13, fontWeight: 600,
            }} data-testid="purge-close-btn">إغلاق</button>
          </div>
        </div>
      )}
    </SafeAreaView>
  );
}

const filterSelectStyle: any = { flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: '#1a2540', padding: '9px 0', fontFamily: 'inherit', direction: 'rtl', outline: 'none', cursor: 'pointer', minWidth: 0 };

const n = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#eef3fb', borderRadius: 18, padding: 18, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#dde6f3' },
  heroDeco: { position: 'absolute', left: -40, top: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: '#dbe7f7' },
  heroDeco2: { position: 'absolute', left: 90, bottom: -90, width: 180, height: 180, borderRadius: 90, backgroundColor: '#e4edf9' },
  heroDate: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#e3e9f2', minWidth: 230 },
  heroDateIcon: { width: 54, height: 54, borderRadius: 12, backgroundColor: '#e3f2fd', alignItems: 'center', justifyContent: 'center' },
  heroDay: { fontSize: 22, fontWeight: '900', color: '#1a2540' },
  heroGreg: { fontSize: 14, fontWeight: '700', color: '#334155', marginTop: 2 },
  heroHijri: { fontSize: 12, color: '#8a95a8', marginTop: 2 },
  heroTitleWrap: { flex: 1, alignItems: 'flex-end' },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroTitle: { fontSize: 26, fontWeight: '900', color: '#1a2540' },
  heroSubtitle: { fontSize: 13, color: '#5b6678', marginTop: 4, marginBottom: 6 },
  quickBox: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e3e9f2', minWidth: 260 },
  quickHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 8 },
  quickTitle: { fontSize: 12, fontWeight: '800', color: '#5b6678' },
  quickRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  qBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  qBtnText: { fontSize: 12.5, fontWeight: '800', color: '#1a2540' },
  statsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14, marginBottom: 16 },
  stat: { flex: 1, minWidth: 220, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e8edf5' },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statIcon: { width: 54, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 13, color: '#5b6678', fontWeight: '600' },
  statValue: { fontSize: 30, fontWeight: '900', marginTop: 2, lineHeight: 36 },
  statSub: { fontSize: 11, color: '#8a95a8', marginTop: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#eef1f6', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  barPct: { fontSize: 11, fontWeight: '800', minWidth: 32 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  weekArrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e3e9f2' },
  weekDays: { flex: 1, flexDirection: 'row-reverse', gap: 10 },
  weekDay: { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#e3e9f2' },
  weekDayOn: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  weekDayName: { fontSize: 15, fontWeight: '800', color: '#1a2540' },
  weekDayDate: { fontSize: 12, color: '#5b6678', marginTop: 2 },
  todayDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#1565c0' },
  noticeRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' },
  semChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#e3f2fd', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#bbdefb' },
  semChipText: { fontSize: 12.5, color: '#0d47a1', fontWeight: '700' },
  shiftStrip: { flex: 1, minWidth: 300, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#fff3e0', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: '#ffe0b2' },
  shiftText: { flex: 1, fontSize: 12.5, color: '#7a4a00', fontWeight: '700', textAlign: 'right' },
  shiftBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#e65100', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  shiftBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  listCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e8edf5', overflow: 'hidden' },
  listHead: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef1f6' },
  listTitleWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  listTitleIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#e3f2fd', alignItems: 'center', justifyContent: 'center' },
  listTitle: { fontSize: 20, fontWeight: '900', color: '#1a2540' },
  listCount: { fontSize: 12, color: '#5b6678', marginTop: 2 },
  filtersWrap: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e3e9f2', paddingHorizontal: 12, minWidth: 240, flex: 1, height: 42 },
  searchInput: { flex: 1, fontSize: 13, color: '#1a2540', textAlign: 'right' },
  filterField: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e3e9f2', paddingHorizontal: 10, minWidth: 150, height: 42 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ffebee', borderRadius: 10, paddingHorizontal: 10, height: 42 },
  clearBtnText: { fontSize: 12, fontWeight: '800', color: '#c62828' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#eef4fb', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12 },
  groupTime: { fontSize: 15, fontWeight: '900', color: '#1a2540' },
  countPill: { backgroundColor: '#dbe7f7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  countPillText: { fontSize: 12, fontWeight: '700', color: '#1565c0' },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  card: { width: 212, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e8edf5', borderRightWidth: 4, padding: 10, gap: 7 },
  cardTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3 },
  statusPillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  kebab: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  menuRow: { flexDirection: 'row-reverse', gap: 6, flexWrap: 'wrap' },
  menuBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8 },
  menuBtnText: { fontSize: 11.5, fontWeight: '800' },
  cardBody: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  courseIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  courseName: { fontSize: 14, fontWeight: '800', color: '#1a2540', textAlign: 'right' },
  courseSub: { fontSize: 11.5, color: '#8a95a8', textAlign: 'right', marginTop: 2 },
  metaRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, borderTopWidth: 1, borderTopColor: '#f1f4f8', paddingTop: 8 },
  meta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, maxWidth: '100%' },
  metaText: { fontSize: 11, color: '#5b6678', fontWeight: '600' },
  chipRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '700' },
  attText: { fontSize: 11, color: '#5b6678', fontWeight: '700' },
  takeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1565c0', borderRadius: 10, paddingVertical: 9 },
  takeBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
});

const s = StyleSheet.create({
  gGroupHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10 },
  gTimePill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: '#1565c0', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 14 },
  gTimePillText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  gCountPill: { backgroundColor: '#e3f2fd', borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10 },
  gCountPillText: { color: '#1565c0', fontSize: 11, fontWeight: '700' },
  gGroupLine: { flex: 1, height: 1, backgroundColor: '#dde4ee' },
  gGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  gCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderTopWidth: 3,
    padding: 10,
    minWidth: 225,
    maxWidth: 320,
    flexGrow: 1,
    flexBasis: 225,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  gCardHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  gCardName: { flex: 1, fontSize: 13.5, fontWeight: '800', color: '#222b3d', textAlign: 'right' },
  gCardIcons: { flexDirection: 'row-reverse', gap: 4 },
  gIconBtn: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  gCardCode: { fontSize: 10.5, color: '#9aa4b5', textAlign: 'right', marginTop: 1 },
  gCardRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 5 },
  gCardRowText: { fontSize: 11.5, color: '#5b6678', flex: 1, textAlign: 'right' },
  gChips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  gChip: { borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8, maxWidth: '100%' },
  gChipText: { fontSize: 10, fontWeight: '700' },
  gCardFoot: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: '#edf0f5',
    borderStyle: 'dashed',
  },
  gAttText: { fontSize: 10.5, color: '#8a95a8', fontWeight: '700' },
  gTakeBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1565c0',
    borderRadius: 8,
    paddingVertical: 7,
    marginTop: 8,
  },
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
  shiftStrip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#fff3e0', borderWidth: 1, borderColor: '#ffcc80', padding: 8, borderRadius: 8, marginTop: 10 },
  shiftStripText: { flex: 1, fontSize: 11.5, color: '#e65100', fontWeight: '700', textAlign: 'right' },
  shiftRevertBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: '#e65100', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  shiftRevertText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  // List card
  listCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eef1f6' },
  listCardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef1f6' },
  listCardTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540' },
  listCardCount: { fontSize: 12, color: '#5b6678' },
  listCardCountAccent: { color: '#1565c0', fontWeight: '700' },

  // Search bar
  searchWrap: { paddingHorizontal: 14, paddingTop: 12 },
  filterBar: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingTop: 10, alignItems: 'center' },
  filterField: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#f7f9fc', borderWidth: 1, borderColor: '#e3e7ee', borderRadius: 10, paddingHorizontal: 10, minWidth: 180, flexGrow: 1, flexBasis: 180 },
  filterClearBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: '#ffebee', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  filterClearText: { fontSize: 12, color: '#c62828', fontWeight: '700' },
  searchBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#f7f9fc', borderWidth: 1, borderColor: '#e3e7ee', borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'web' ? 10 : 6 },
  searchInput: { flex: 1, fontSize: 13, color: '#1a2540', textAlign: 'right', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) },

  // Faculty/Department row
  facultyRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginBottom: 8, backgroundColor: '#f3e5f5', alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  facultyRowText: { fontSize: 11, color: '#6a1b9a', fontWeight: '600' },

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
