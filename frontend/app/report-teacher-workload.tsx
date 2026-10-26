import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Platform, Alert, useWindowDimensions, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { goBack } from '../src/utils/navigation';
import api, { teachersAPI, departmentsAPI, facultiesAPI } from '../src/services/api';
import { OvertimeSheet, lvl } from '../src/components/reports/OvertimeSheet';
import { OvertimePolicyModal } from '../src/components/reports/OvertimePolicyModal';
import { RaiseLetterBar } from '../src/components/reports/RaiseLetterBar';
import { useAuth } from '../src/contexts/AuthContext';
import { exportName, filenameFromResponse } from '../src/utils/exportName';
import { DASH, NUM_FONT, dashStyles } from '../src/components/dashboard/dashTheme';
import { ReportKpis } from '../src/components/reports/ReportShell';

interface Course { course_name: string; course_code: string; level?: number; section?: string; weekly_hours?: number; expected_hours?: number; shortfall_hours?: number; completion_rate?: number; is_low?: boolean; note?: string; scheduled_lectures: number; executed_lectures: number; scheduled_hours: number; actual_hours: number; excluded_from_load?: boolean }
interface TeacherWL { teacher_id: string; teacher_db_id?: string; teacher_name: string; academic_title?: string; department_id: string; department_name?: string; faculty_id?: string; weekly_hours: number; courses: Course[];
  summary: { total_courses: number; weekly_hours: number; total_weeks: number; required_hours: number; total_scheduled_hours: number; total_actual_hours: number; difference_hours: number; completion_rate: number; expected_hours?: number; shortfall_hours?: number; extra_only_hours?: number; bonus_enabled?: boolean; bonus_hours?: number; hours_after_bonus?: number; overtime_hours?: number; hourly_rate?: number | null; overtime_amount?: number | null; currency?: string; late_start?: boolean; effective_weeks?: number; start_week?: number; first_lecture_date?: string | null; holiday_hours?: number; note?: string; course_filter?: boolean } }

const iso = (d: Date) => d.toISOString().split('T')[0];
const QUICK = [
  { key: 'week', label: 'هذا الأسبوع', range: () => { const n = new Date(); const s = new Date(n); s.setDate(n.getDate() - ((n.getDay() + 1) % 7)); return [iso(s), iso(n)]; } },
  { key: 'month', label: 'هذا الشهر', range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)]; } },
  { key: 'prev', label: 'الشهر السابق', range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), iso(new Date(n.getFullYear(), n.getMonth(), 0))]; } },
  { key: 'sem', label: 'آخر 4 أشهر', range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 4, n.getDate())), iso(n)]; } },
];
const rateColor = (r: number) => (r >= 90 ? DASH.green : r >= 75 ? DASH.orange : DASH.red);

export default function TeacherWorkloadReport() {
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher';
  const canPolicy = user?.role === 'admin' || (user?.permissions || []).includes('manage_settings') || (!!(user as any)?.faculty_id && (user?.permissions || []).includes('report_teacher_workload'));
  const { width } = useWindowDimensions();
  const compact = width < 900;

  const [teachers, setTeachers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [faculties, setFaculties] = useState<any[]>([]);
  const [fac, setFac] = useState('');
  const [dept, setDept] = useState('');
  const [deptMode, setDeptMode] = useState<'org' | 'teach'>('org');
  const [revealDeptNumbers, setRevealDeptNumbers] = useState(false);
  const [view, setView] = useState<'summary' | 'sheet'>('summary');
  const [hideEmpty, setHideEmpty] = useState(true);
  const [onlyOvertime, setOnlyOvertime] = useState(false);
  const [raised, setRaised] = useState<any[]>([]);
  const raisedMap = useMemo(() => Object.fromEntries(raised.map((r) => [r.teacher_id, r.letters])), [raised]);
  const loadRaised = async (p: any) => {
    try { const r = await api.get('/reports/teacher-workload/raised', { params: { start_date: p.start_date, end_date: p.end_date, faculty_id: p.faculty_id, department_id: p.department_id, teach_department_id: p.teach_department_id, teacher_id: p.teacher_id } }); setRaised(r.data.items || []); }
    catch { setRaised([]); }
  };
  const [policyOpen, setPolicyOpen] = useState(false);
  const [teacherId, setTeacherId] = useState('');
  const [teacherCourses, setTeacherCourses] = useState<any[]>([]);
  const [courseIds, setCourseIds] = useState<string[]>([]);
  useEffect(() => {
    setCourseIds([]);
    if (!teacherId) { setTeacherCourses([]); return; }
    api.get('/courses', { params: { teacher_id: teacherId, all_semesters: true, fields: 'name,code,level,section,semester_name' } }).then((r) => setTeacherCourses(r.data || [])).catch(() => setTeacherCourses([]));
  }, [teacherId]);
  const [teacherQ, setTeacherQ] = useState('');
  const [showList, setShowList] = useState(false);
  const [quick, setQuick] = useState('month');
  const [from, setFrom] = useState(QUICK[1].range()[0]);
  const [to, setTo] = useState(QUICK[1].range()[1]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const [data, setData] = useState<TeacherWL[]>([]);
  const [period, setPeriod] = useState<any>(null);
  const [ran, setRan] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<'rate' | 'name' | 'hours'>('rate');
  const [search, setSearch] = useState('');
  const [excOpen, setExcOpen] = useState(false);
  const [excIds, setExcIds] = useState<string[]>([]);
  const [excSearch, setExcSearch] = useState('');
  const [savingExc, setSavingExc] = useState(false);
  const [mode, setMode] = useState<'standard' | 'custom'>('standard');
  const [customEntries, setCustomEntries] = useState<{ key: string; teacherId: string; teacherName: string; departmentName?: string; courses: any[]; includedIds: string[]; excludedIds: string[] }[]>([]);
  const [customTeacherQ, setCustomTeacherQ] = useState('');
  const [customShowList, setCustomShowList] = useState(false);
  const [customData, setCustomData] = useState<TeacherWL[]>([]);
  const [customPeriod, setCustomPeriod] = useState<any>(null);
  const [customRan, setCustomRan] = useState(false);
  const [customLoading, setCustomLoading] = useState(false);
  const [customExporting, setCustomExporting] = useState('');

  useEffect(() => {
    if (isTeacher) return;
    Promise.all([teachersAPI.getAll(), departmentsAPI.getAll(), facultiesAPI.getAll()]).then(([t, d, f]) => {
      setTeachers(t.data || []); setDepartments(d.data || []); setFaculties(f.data || []);
    }).catch(() => {});
  }, [isTeacher]);

  const deptScoped = !isTeacher && deptMode === 'teach' && !!dept;
  const showFull = !deptScoped || revealDeptNumbers;

  const params = useMemo(() => {
    const p: any = { start_date: from, end_date: to };
    if (teacherId) p.teacher_id = teacherId;
    if (teacherId && courseIds.length) p.course_ids = courseIds.join(',');
    if (dept && !isTeacher) { if (deptMode === 'teach') p.teach_department_id = dept; else p.department_id = dept; }
    if (fac && !isTeacher && deptMode !== 'teach') p.faculty_id = fac;
    if (hideEmpty && !isTeacher) p.hide_empty = true;
    if (onlyOvertime && !isTeacher) p.only_overtime = true;
    return p;
  }, [from, to, teacherId, courseIds, dept, deptMode, fac, hideEmpty, onlyOvertime, isTeacher]);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/reports/teacher-workload', { params });
      setData(r.data.teachers || []); setPeriod(r.data.period); setRan(true);
      if (!isTeacher) { loadRaised(params); api.get('/reports/teacher-workload/exceptions', { params: { start_date: from, end_date: to } }).then((r2) => setExcIds(r2.data.course_ids || [])).catch(() => {}); }
    } catch (e: any) { Alert.alert('خطأ', e?.response?.data?.detail || 'فشل تنفيذ التقرير'); }
    finally { setLoading(false); }
  }, [params, isTeacher, from, to]);

  useEffect(() => { if (isTeacher) run(); }, [isTeacher, run]);

  // 🆕 فتح التقرير مباشرة من صفحة المدرس مع تعبئة اسمه وتشغيله تلقائياً
  const navParams = useLocalSearchParams<{ teacherId?: string; teacherName?: string; autorun?: string }>();
  useEffect(() => {
    if (!isTeacher && navParams.teacherId) {
      setTeacherId(String(navParams.teacherId));
      setTeacherQ(String(navParams.teacherName || ''));
      setHideEmpty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!isTeacher && navParams.autorun === '1' && teacherId && !ran) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

  const download = async (fmt: 'pdf' | 'excel') => {
    setExporting(fmt);
    try {
      const path = view === 'sheet' ? (fmt === 'pdf' ? 'sheet-pdf' : 'sheet-excel') : fmt;
      const res = await api.get(`/export/report/teacher-workload/${path}`, { params, responseType: 'blob' });
      const name = filenameFromResponse(res, exportName([view === 'sheet' ? 'كشف الساعات الإضافية' : 'تقرير نصاب المدرسين', from, to], fmt === 'pdf' ? 'pdf' : 'xlsx'));
      if (Platform.OS === 'web') {
        const url = window.URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); window.URL.revokeObjectURL(url);
      } else {
        const path = `${FileSystem.documentDirectory}${name}`; const reader = new FileReader();
        reader.onloadend = async () => { await FileSystem.writeAsStringAsync(path, (reader.result as string).split(',')[1], { encoding: FileSystem.EncodingType.Base64 }); await Sharing.shareAsync(path); };
        reader.readAsDataURL(new Blob([res.data]));
      }
    } catch { Alert.alert('خطأ', 'تعذر التصدير'); } finally { setExporting(''); }
  };

  const addCustomTeacher = async (t: any) => {
    setCustomTeacherQ(''); setCustomShowList(false);
    try {
      const r = await api.get('/reports/teacher-workload/teacher-courses', { params: { teacher_id: t.id, start_date: from, end_date: to } });
      const courses = r.data || [];
      setCustomEntries((prev) => [...prev, { key: `${t.id}_${Date.now()}`, teacherId: t.id, teacherName: t.full_name, departmentName: deptName(t.department_id), courses, includedIds: courses.map((c: any) => c.id), excludedIds: [] }]);
    } catch { Alert.alert('خطأ', 'تعذر جلب مقررات الأستاذ'); }
  };

  const toggleCustomInclude = (key: string, courseId: string) => {
    setCustomEntries((prev) => prev.map((e) => {
      if (e.key !== key) return e;
      const included = e.includedIds.includes(courseId);
      return { ...e, includedIds: included ? e.includedIds.filter((x) => x !== courseId) : [...e.includedIds, courseId], excludedIds: included ? e.excludedIds.filter((x) => x !== courseId) : e.excludedIds };
    }));
  };

  const toggleCustomLoadExclude = (key: string, courseId: string) => {
    setCustomEntries((prev) => prev.map((e) => e.key === key ? { ...e, excludedIds: e.excludedIds.includes(courseId) ? e.excludedIds.filter((x) => x !== courseId) : [...e.excludedIds, courseId] } : e));
  };

  const runCustom = async () => {
    if (!customEntries.length) return;
    setCustomLoading(true);
    try {
      const entries = customEntries.map((e) => ({ teacher_id: e.teacherId, course_ids: e.includedIds.length ? e.includedIds : ['__none__'], excluded_course_ids: e.excludedIds.filter((x) => e.includedIds.includes(x)) }));
      const r = await api.post('/reports/teacher-workload/custom', { start_date: from, end_date: to, entries });
      setCustomData(r.data.teachers || []); setCustomPeriod(r.data.period); setCustomRan(true);
    } catch (e: any) { Alert.alert('خطأ', e?.response?.data?.detail || 'فشل تنفيذ التقرير المخصص'); }
    finally { setCustomLoading(false); }
  };

  const downloadCustom = async (fmt: 'pdf' | 'excel') => {
    setCustomExporting(fmt);
    try {
      const entries = customEntries.map((e) => ({ teacher_id: e.teacherId, course_ids: e.includedIds.length ? e.includedIds : ['__none__'], excluded_course_ids: e.excludedIds.filter((x) => e.includedIds.includes(x)) }));
      const path = fmt === 'pdf' ? 'custom-sheet-pdf' : 'custom-sheet-excel';
      const res = await api.post(`/export/report/teacher-workload/${path}`, { start_date: from, end_date: to, entries }, { responseType: 'blob' });
      const name = filenameFromResponse(res, exportName(['كشف الساعات الإضافية (تقرير مخصص)', from, to], fmt === 'pdf' ? 'pdf' : 'xlsx'));
      if (Platform.OS === 'web') {
        const url = window.URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); window.URL.revokeObjectURL(url);
      } else {
        const p = `${FileSystem.documentDirectory}${name}`; const reader = new FileReader();
        reader.onloadend = async () => { await FileSystem.writeAsStringAsync(p, (reader.result as string).split(',')[1], { encoding: FileSystem.EncodingType.Base64 }); await Sharing.shareAsync(p); };
        reader.readAsDataURL(new Blob([res.data]));
      }
    } catch { Alert.alert('خطأ', 'تعذر التصدير'); } finally { setCustomExporting(''); }
  };

  useEffect(() => { setCustomRan(false); setCustomData([]); }, [customEntries, from, to]);

  const totals = useMemo(() => {
    const req = data.reduce((s, t) => s + t.summary.required_hours, 0);
    const act = data.reduce((s, t) => s + t.summary.total_actual_hours, 0);
    const sch = data.reduce((s, t) => s + t.summary.total_scheduled_hours, 0);
    const lec = data.reduce((s, t) => s + t.courses.reduce((a, c) => a + c.scheduled_lectures, 0), 0);
    const exe = data.reduce((s, t) => s + t.courses.reduce((a, c) => a + c.executed_lectures, 0), 0);
    const ot = data.reduce((s, t) => s + Math.max(0, t.summary.overtime_hours || 0), 0);
    const sf = data.reduce((s, t) => s + (t.summary.shortfall_hours || 0), 0);
    const amt = data.reduce((s, t) => s + (t.summary.overtime_amount || 0), 0);
    const cur = data.find((t) => t.summary.overtime_amount)?.summary.currency || '';
    const lowCourses = data.reduce((s, t) => s + t.courses.filter((c) => c.is_low).length, 0);
    return { req, act, sch, lec, exe, ot, sf, amt, cur, lowCourses, rate: req ? Math.round((act * 1000) / req) / 10 : 0, below: data.filter((t) => t.summary.completion_rate < 75).length };
  }, [data]);

  const rows = useMemo(() => {
    const q = search.trim();
    const list = q ? data.filter((t) => matchAr(t.teacher_name, q)) : [...data];
    list.sort((a, b) => sort === 'name' ? a.teacher_name.localeCompare(b.teacher_name, 'ar') : sort === 'hours' ? b.summary.total_actual_hours - a.summary.total_actual_hours : b.summary.completion_rate - a.summary.completion_rate);
    return list;
  }, [data, search, sort]);

  const deptName = (id: string) => departments.find((d) => d.id === id)?.name || '';
  const facDepts = departments.filter((d) => !fac || d.faculty_id === fac);
  const filteredTeachers = teachers.filter((t) => (!dept || deptMode === 'teach' || t.department_id === dept) && (!fac || t.faculty_id === fac || facDepts.some((d) => d.id === t.department_id)) && (!teacherQ || matchAr(t.full_name, teacherQ))).slice(0, 8);
  const customFilteredTeachers = teachers.filter((t) => !customTeacherQ || matchAr(t.full_name, customTeacherQ)).slice(0, 8);
  const lateTeachers = data.filter((t) => t.summary.late_start);

  const allCourses = useMemo(() => {
    const map = new Map<string, { course_id: string; course_name: string; course_code: string; teacher_name: string; excluded_from_load?: boolean }>();
    data.forEach((t) => t.courses.forEach((c: any) => { if (!map.has(c.course_id)) map.set(c.course_id, { course_id: c.course_id, course_name: c.course_name, course_code: c.course_code, teacher_name: t.teacher_name, excluded_from_load: c.excluded_from_load && !c.temp_excluded }); }));
    const list = Array.from(map.values());
    const q = excSearch.trim();
    return q ? list.filter((c) => matchAr(c.course_name, q) || matchAr(c.teacher_name, q)) : list;
  }, [data, excSearch]);

  const saveExceptions = async () => {
    setSavingExc(true);
    try {
      await api.put('/reports/teacher-workload/exceptions', { start_date: from, end_date: to, course_ids: excIds });
      setExcOpen(false);
      if (ran) run();
    } catch { Alert.alert('خطأ', 'تعذر حفظ الاستثناءات'); }
    finally { setSavingExc(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} testID="teacher-workload-screen">
        <View style={styles.hero}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>التقارير</Text>
            <Text style={styles.title}>تقرير نصاب المدرسين</Text>
            <Text style={styles.subtitle}>المطلوب مقابل المنفَّذ فعلياً (المحاضرة تُعد منفَّذة عند تسجيل الحضور) · كشف الساعات الإضافية</Text>
          </View>
          <View style={styles.heroActions}>
            {!isTeacher && (
              <View style={styles.viewToggle} testID="tw-mode-toggle">
                {([['standard', 'قياسي'], ['custom', 'مخصص']] as const).map(([k, l]) => (
                  <TouchableOpacity key={k} style={[styles.viewBtn, mode === k && styles.viewBtnOn]} onPress={() => setMode(k)} testID={`tw-mode-${k}`}><Text style={[styles.viewText, mode === k && { color: DASH.navy }]}>{l}</Text></TouchableOpacity>
                ))}
              </View>
            )}
            {!isTeacher && mode === 'standard' && (
              <View style={styles.viewToggle} testID="tw-view-toggle">
                {([['summary', 'ملخص'], ['sheet', 'كشف الساعات الإضافية']] as const).map(([k, l]) => (
                  <TouchableOpacity key={k} style={[styles.viewBtn, view === k && styles.viewBtnOn]} onPress={() => setView(k)} testID={`tw-view-${k}`}><Text style={[styles.viewText, view === k && { color: DASH.navy }]}>{l}</Text></TouchableOpacity>
                ))}
              </View>
            )}
            {canPolicy && <TouchableOpacity style={styles.iconBtn} onPress={() => setPolicyOpen(true)} testID="tw-policy-btn"><Ionicons name="settings-outline" size={18} color="#fff" /></TouchableOpacity>}
            <TouchableOpacity style={styles.iconBtn} onPress={() => goBack()} testID="tw-back-btn"><Ionicons name="arrow-forward" size={18} color="#fff" /></TouchableOpacity>
            {mode === 'standard' && ran && data.length > 0 && (
              <>
                <TouchableOpacity style={[styles.actBtn, { backgroundColor: '#b91c1c' }]} onPress={() => download('pdf')} disabled={!!exporting} testID="tw-export-pdf-btn">
                  {exporting === 'pdf' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="document-text" size={15} color="#fff" />}<Text style={styles.actText}>PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actBtn, { backgroundColor: '#15803d' }]} onPress={() => download('excel')} disabled={!!exporting} testID="tw-export-excel-btn">
                  {exporting === 'excel' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="grid" size={15} color="#fff" />}<Text style={styles.actText}>Excel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {!isTeacher && mode === 'standard' && (
          <View style={[dashStyles.card, { marginBottom: 14, zIndex: 20, overflow: 'visible' }]} testID="tw-filters">
            <View style={[styles.filterRow, { zIndex: 30 }, compact && { flexDirection: 'column' }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>الكلية</Text>
                <View style={styles.pickerBox}>
                  <Picker selectedValue={fac} onValueChange={(v) => { setFac(String(v)); setDept(''); setTeacherId(''); setTeacherQ(''); }} style={styles.picker} testID="tw-faculty-picker">
                    <Picker.Item label="جميع الكليات" value="" />
                    {faculties.map((f) => <Picker.Item key={f.id} label={f.name} value={f.id} />)}
                  </Picker>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>القسم</Text>
                <View style={styles.pickerBox}>
                  <Picker selectedValue={dept} onValueChange={(v) => { setDept(String(v)); setTeacherId(''); setTeacherQ(''); }} style={styles.picker} testID="tw-dept-picker">
                    <Picker.Item label="جميع الأقسام" value="" />
                    {facDepts.map((d) => <Picker.Item key={d.id} label={d.name} value={d.id} />)}
                  </Picker>
                </View>
                {!!dept && (
                  <View style={[styles.deptModeToggle, { marginTop: 6, alignSelf: 'flex-start' }]} testID="tw-dept-mode-toggle">
                    {([['org', 'ينتمي إليه'], ['teach', 'يُدرّس فيه']] as const).map(([k, l]) => (
                      <TouchableOpacity key={k} style={[styles.deptModeBtn, deptMode === k && styles.deptModeBtnOn]} onPress={() => setDeptMode(k)} testID={`tw-dept-mode-${k}`}>
                        <Text style={[styles.deptModeText, deptMode === k && styles.deptModeTextOn]}>{l}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <View style={{ flex: 1, position: 'relative', zIndex: 50 }}>
                <Text style={styles.label}>المدرس</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="person-outline" size={16} color="#94a3b8" />
                  <TextInput value={teacherQ} onChangeText={(v) => { setTeacherQ(v); setShowList(true); if (!v) setTeacherId(''); }} onFocus={() => setShowList(true)} onBlur={() => setTimeout(() => setShowList(false), 180)}
                    placeholder="كل المدرسين — اكتب للبحث" placeholderTextColor="#94a3b8" style={styles.input} testID="tw-teacher-input" />
                  {!!teacherId && <TouchableOpacity onPress={() => { setTeacherId(''); setTeacherQ(''); }} testID="tw-teacher-clear"><Ionicons name="close-circle" size={16} color={DASH.red} /></TouchableOpacity>}
                </View>
                {showList && teacherQ && !teacherId && (
                  <View style={styles.dropdown} testID="tw-teacher-dropdown">
                    {filteredTeachers.map((t) => (
                      <TouchableOpacity key={t.id} style={styles.ddItem} onPressIn={() => { setTeacherId(t.id); setTeacherQ(t.full_name); setShowList(false); }} testID={`tw-teacher-opt-${t.id}`}>
                        <Text style={styles.ddText}>{t.full_name}</Text><Text style={styles.ddSub}>{deptName(t.department_id)}</Text>
                      </TouchableOpacity>
                    ))}
                    {filteredTeachers.length === 0 && <Text style={[styles.ddSub, { padding: 10, textAlign: 'center' }]}>لا نتائج</Text>}
                  </View>
                )}
              </View>
            </View>
            {!!teacherId && teacherCourses.length > 0 && (
              <View style={styles.courseBox} testID="tw-course-filter">
                <Text style={styles.courseLbl}>📚 نصاب على مقررات محددة {courseIds.length ? `(${courseIds.length} من ${teacherCourses.length})` : '— كل مقررات المدرس'}</Text>
                <View style={styles.chips}>
                  <TouchableOpacity style={[styles.chip, !courseIds.length && styles.chipOn]} onPress={() => setCourseIds([])} testID="tw-course-all"><Text style={[styles.chipText, !courseIds.length && styles.chipTextOn]}>كل المقررات</Text></TouchableOpacity>
                  {teacherCourses.map((c) => { const on = courseIds.includes(c.id); return (
                    <TouchableOpacity key={c.id} style={[styles.chip, on && styles.chipCourseOn]} onPress={() => setCourseIds(on ? courseIds.filter((x) => x !== c.id) : [...courseIds, c.id])} testID={`tw-course-${c.id}`}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{on ? '✓ ' : ''}{c.name}{c.level ? ` · م${c.level}` : ''}{c.section ? `/${c.section}` : ''}{c.semester_name ? ` · ${c.semester_name}` : ''}</Text>
                    </TouchableOpacity>); })}
                </View>
                {courseIds.length > 0 && <Text style={styles.courseHint}>النصاب المطلوب سيُحسب من الساعات الافتراضية للمقررات المختارة فقط (أسبوعي المقرر × أسابيعه)</Text>}
              </View>
            )}
            <View style={[styles.chips, { zIndex: 1 }]}>
              {QUICK.map((q) => (
                <TouchableOpacity key={q.key} style={[styles.chip, quick === q.key && styles.chipOn]} onPress={() => { const [a, b] = q.range(); setFrom(a); setTo(b); setQuick(q.key); }} testID={`tw-quick-${q.key}`}>
                  <Text style={[styles.chipText, quick === q.key && styles.chipTextOn]}>{q.label}</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.dates}>
                <Text style={styles.dateLbl}>من</Text>
                {Platform.OS === 'web' ? <input type="date" value={from} onChange={(e: any) => { setFrom(e.target.value); setQuick(''); }} style={dateInput as any} data-testid="tw-date-from" /> : <TextInput value={from} onChangeText={setFrom} style={styles.dateNative} />}
                <Text style={styles.dateLbl}>إلى</Text>
                {Platform.OS === 'web' ? <input type="date" value={to} onChange={(e: any) => { setTo(e.target.value); setQuick(''); }} style={dateInput as any} data-testid="tw-date-to" /> : <TextInput value={to} onChangeText={setTo} style={styles.dateNative} />}
              </View>
              <TouchableOpacity style={[styles.chip, hideEmpty && styles.chipOn]} onPress={() => setHideEmpty(!hideEmpty)} testID="tw-hide-empty"><Text style={[styles.chipText, hideEmpty && styles.chipTextOn]}>{hideEmpty ? '✓ ' : ''}إخفاء من لا محاضرات لهم</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.chip, onlyOvertime && styles.chipOn]} onPress={() => setOnlyOvertime(!onlyOvertime)} testID="tw-only-overtime"><Text style={[styles.chipText, onlyOvertime && styles.chipTextOn]}>{onlyOvertime ? '✓ ' : ''}إخفاء من لا إضافي لهم</Text></TouchableOpacity>
              {ran && (
                <TouchableOpacity style={[styles.chip, excIds.length > 0 && styles.chipCourseOn]} onPress={() => setExcOpen(true)} testID="tw-exceptions-btn">
                  <Text style={[styles.chipText, excIds.length > 0 && styles.chipTextOn]}>⏱ استثناء من النصاب لهذه الفترة{excIds.length ? ` (${excIds.length})` : ''}</Text>
                </TouchableOpacity>
              )}
              {ran && deptScoped && (
                <TouchableOpacity style={[styles.chip, revealDeptNumbers && styles.chipCourseOn]} onPress={() => setRevealDeptNumbers(!revealDeptNumbers)} testID="tw-reveal-dept-numbers">
                  <Text style={[styles.chipText, revealDeptNumbers && styles.chipTextOn]}>{revealDeptNumbers ? '⚠ إظهار الإضافي/النسبة رغم عدم الدقة' : '🙈 إخفاء الإضافي/النسبة (غير دقيقين لهذا القسم)'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.runBtn} onPress={run} disabled={loading} testID="tw-run-btn">
                {loading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="play" size={14} color="#fff" />}<Text style={styles.runText}>تنفيذ التقرير</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {mode === 'standard' && loading && !ran && <ActivityIndicator color={DASH.navy} style={{ marginTop: 30 }} />}
        {mode === 'standard' && ran && (
          <>
            <View testID="tw-summary">
              <ReportKpis items={([
                ['المدرسون', data.length, DASH.blue, `${period ? period.total_weeks : ''} أسبوع`],
                ['النصاب المطلوب', `${Math.round(totals.req * 10) / 10} س`, DASH.navy2, data.some((t) => t.summary.course_filter) ? `نصاب ${data[0]?.courses.length || 0} مقرر مختار — الافتراضية للمقررات المختارة` : lateTeachers.length ? (data.length === 1 ? `من بداية المحاضرات · ${lateTeachers[0].summary.effective_weeks} أسابيع بدل ${period?.total_weeks}` : `${lateTeachers.length} مدرس بدأت محاضراته بعد بداية الفترة`) : 'أسبوعي × الأسابيع الكاملة (حد قاطع)'],
                ['الساعات المنفَّذة', `${Math.round(totals.act * 10) / 10} س`, DASH.teal, `من ${Math.round(totals.sch * 10) / 10} س مجدولة`],
                ['المحاضرات المنفَّذة', `${totals.exe}/${totals.lec}`, DASH.purple, 'منفَّذة / مجدولة'],
                ['نسبة الإنجاز', showFull ? `${totals.rate}%` : '—', showFull ? rateColor(totals.rate) : DASH.muted, showFull ? (totals.below ? `${totals.below} مدرس تحت 75%` : 'الجميع ≥ 75%') : '⚠ غير دقيق — يقارن مقررات هذا القسم فقط بالنصاب الكامل'],
                ['الساعات الإضافية', showFull ? `${Math.round(totals.ot * 10) / 10} س` : '—', showFull ? DASH.green : DASH.muted, showFull ? (totals.sf ? `نقص ${Math.round(totals.sf * 10) / 10} س · ${totals.lowCourses} مقرر تحت 75%` : (data.some((t) => t.summary.bonus_enabled) ? 'بعد الإضافة − النصاب' : 'المنجز − النصاب')) : '⚠ غير دقيق — يقارن مقررات هذا القسم فقط بالنصاب الكامل'],
                ...(totals.amt ? [['المستحق المالي', `${totals.amt.toLocaleString('en')} ${totals.cur}`, DASH.gold, 'الساعات الإضافية × سعر الساعة']] : []),
              ] as [string, string | number, string, string | undefined][]).map(([l, v, c, sub]) => ({ label: String(l), value: v as any, color: String(c), sub }))} />
            </View>
            {lateTeachers.length > 0 && (
              <View style={styles.lateBox} testID="tw-late-start-note">
                <Ionicons name="time-outline" size={16} color="#b45309" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.lateTitle}>محاضرات بدأت بعد بداية الفترة — النصاب محسوب من تاريخ بداية توليد المحاضرات</Text>
                  {lateTeachers.slice(0, 6).map((t) => <Text key={t.teacher_db_id || t.teacher_id} style={styles.lateLine}>• {t.academic_title ? `${t.academic_title} ` : ''}{t.teacher_name}: {t.summary.note}</Text>)}
                  {lateTeachers.length > 6 && <Text style={styles.lateLine}>… و{lateTeachers.length - 6} آخرون (التفاصيل في صف كل مدرس)</Text>}
                </View>
              </View>
            )}

            {view === 'sheet' ? (
              <View style={dashStyles.card} testID="tw-sheet-card">{!isTeacher && <RaiseLetterBar params={params} disabled={rows.length === 0} raised={raised} onDone={() => loadRaised(params)} />}<OvertimeSheet teachers={rows} period={period} threshold={75} raisedMap={raisedMap} muteOvertime={!showFull} /></View>
            ) : (
            <View style={dashStyles.card} testID="tw-table">
              <View style={styles.tableHead}>
                <View style={styles.sortRow}>
                  {([['rate', 'الإنجاز'], ['hours', 'الساعات'], ['name', 'الاسم']] as const).map(([k, l]) => (
                    <TouchableOpacity key={k} style={[styles.sortChip, sort === k && styles.sortOn]} onPress={() => setSort(k)} testID={`tw-sort-${k}`}><Text style={[styles.sortText, sort === k && { color: '#fff' }]}>{l}</Text></TouchableOpacity>
                  ))}
                </View>
                <View style={[styles.inputBox, { flex: 1, maxWidth: 320 }]}>
                  <Ionicons name="search" size={15} color="#94a3b8" /><TextInput value={search} onChangeText={setSearch} placeholder="بحث باسم المدرس" placeholderTextColor="#94a3b8" style={styles.input} testID="tw-search" />
                </View>
                <Text style={styles.count}>{rows.length} مدرس</Text>
              </View>
              {rows.length === 0 && <View style={dashStyles.empty}><Ionicons name="people-outline" size={36} color="#cbd5e1" /><Text style={dashStyles.emptyText}>لا توجد بيانات للفترة/الفلاتر المحددة</Text></View>}
              {rows.map((t, i) => {
                const s = t.summary; const isOpen = !!open[t.teacher_id + i]; const lec = t.courses.reduce((a, c) => a + c.scheduled_lectures, 0); const exe = t.courses.reduce((a, c) => a + c.executed_lectures, 0);
                return (
                  <View key={t.teacher_id + i} style={styles.tRow} testID={`tw-row-${t.teacher_id}`}>
                    <TouchableOpacity style={[styles.tMain, compact && { flexWrap: 'wrap' }]} onPress={() => setOpen({ ...open, [t.teacher_id + i]: !isOpen })} testID={`tw-row-toggle-${t.teacher_id}`}>
                      <View style={[styles.rank, { backgroundColor: (showFull ? rateColor(s.completion_rate) : DASH.muted) + '1a' }]}><Text style={[styles.rankText, NUM_FONT, { color: showFull ? rateColor(s.completion_rate) : DASH.muted }]}>{i + 1}</Text></View>
                      <View style={{ flex: 2, minWidth: 180 }}>
                        <Text style={styles.tName}>{t.academic_title ? `${t.academic_title} ` : ''}{t.teacher_name}</Text>
                        <Text style={styles.tSub}>{t.department_name || deptName(t.department_id) || '—'} · {s.total_courses} مقرر · نصاب {s.weekly_hours} س/أسبوع{s.bonus_enabled ? ` · إضافة ${s.bonus_hours} س` : ''}{s.extra_only_hours ? ` · +${s.extra_only_hours} س مقرر إضافي بالكامل` : ''}</Text>
                        {!!s.note && <Text style={styles.tNote} testID={`tw-row-note-${t.teacher_id}`}>⏱ {s.note}</Text>}
                        {!!raisedMap[t.teacher_db_id || ''] && <Text style={styles.tRaised} testID={`tw-row-raised-${t.teacher_id}`}>✉ سبق رفعه بالخطاب {raisedMap[t.teacher_db_id || ''].map((l: any) => `${l.number} (${l.start_date} → ${l.end_date})`).join('، ')}</Text>}
                      </View>
                      <View style={{ flex: 2, minWidth: 160 }}>
                        <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, showFull ? s.completion_rate : 0)}%`, backgroundColor: showFull ? rateColor(s.completion_rate) : DASH.muted }]} /></View>
                        <Text style={[styles.tSub, NUM_FONT]}>{s.total_actual_hours} من {s.required_hours} ساعة مطلوبة · محاضرات {exe}/{lec}</Text>
                      </View>
                      <View style={styles.cell} testID={`tw-overtime-cell-${t.teacher_id}`}>{showFull ? <><Text style={[styles.cellVal, NUM_FONT, { color: (s.overtime_hours ?? s.difference_hours) < 0 ? DASH.red : DASH.green }]}>{(s.overtime_hours ?? s.difference_hours) > 0 ? '+' : ''}{s.overtime_hours ?? s.difference_hours}</Text><Text style={styles.cellLbl}>{s.bonus_enabled ? 'إضافية (س)' : 'الفرق (س)'}</Text></> : <><Text style={[styles.cellVal, NUM_FONT, { color: DASH.muted }]}>—</Text><Text style={styles.cellLbl}>غير دقيق</Text></>}</View>
                      {s.overtime_amount != null && <View style={styles.cell}><Text style={[styles.cellVal, NUM_FONT, { color: DASH.gold, fontSize: 13 }]}>{Number(s.overtime_amount).toLocaleString('en')}</Text><Text style={styles.cellLbl}>المستحق {s.currency}</Text></View>}
                      <View style={styles.cell}>{showFull ? <><Text style={[styles.cellVal, NUM_FONT, { color: rateColor(s.completion_rate) }]}>{s.completion_rate}%</Text><Text style={styles.cellLbl}>الإنجاز</Text></> : <><Text style={[styles.cellVal, NUM_FONT, { color: DASH.muted }]}>—</Text><Text style={styles.cellLbl}>غير دقيق</Text></>}</View>
                      <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={DASH.muted} />
                    </TouchableOpacity>
                    {isOpen && (
                      <View style={styles.courses} testID={`tw-courses-${t.teacher_id}`}>
                        <View style={[styles.cRow, styles.cHead]}>
                          {['المقرر', 'المستوى', 'س/أسبوع', 'محاضرات', 'الافتراضية', 'المنجزة', 'النقص', 'الإنجاز', 'ملاحظات'].map((h, k) => <Text key={h} style={[styles.cTd, (k === 0 || k === 8) && styles.cName, styles.cTh]}>{h}</Text>)}
                        </View>
                        {t.courses.length === 0 && <Text style={[styles.tSub, { padding: 8 }]}>لا مقررات مسندة في هذه الفترة</Text>}
                        {t.courses.map((c, k) => {
                          const r = c.completion_rate ?? (c.scheduled_lectures ? Math.round((c.executed_lectures * 1000) / c.scheduled_lectures) / 10 : 0);
                          return (
                            <View key={k} style={[styles.cRow, c.is_low && { backgroundColor: '#fdf2f8' }, c.excluded_from_load && { backgroundColor: '#fff8e1' }]} testID={`tw-course-row-${t.teacher_db_id || t.teacher_id}-${k}`}>
                              <Text style={[styles.cTd, styles.cName]} numberOfLines={1}>{c.course_name} <Text style={styles.tSub}>{c.course_code}{(c as any).department_name ? ` · ${(c as any).department_name}` : ''}</Text></Text>
                              <Text style={styles.cTd}>{lvl(c)}</Text>
                              {[c.weekly_hours, `${c.executed_lectures}/${c.scheduled_lectures}`, c.expected_hours, c.actual_hours].map((v, j) => <Text key={j} style={[styles.cTd, NUM_FONT]}>{v as any}</Text>)}
                              <Text style={[styles.cTd, NUM_FONT, { color: (c.shortfall_hours || 0) > 0 ? DASH.red : '#334155' }]}>{c.shortfall_hours ?? ''}</Text>
                              <Text style={[styles.cTd, NUM_FONT, { color: rateColor(r), fontWeight: '800' }]}>{r}%</Text>
                              <Text style={[styles.cTd, styles.cName, { fontWeight: '500', fontSize: 11, color: DASH.muted }]} numberOfLines={2}>{c.note || ''}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            )}
          </>
        )}

        {mode === 'custom' && !isTeacher && (
          <View style={[dashStyles.card, { marginBottom: 14, zIndex: 20, overflow: 'visible' }]} testID="tw-custom-builder">
            <Text style={styles.courseLbl}>➕ إضافة أستاذ إلى التقرير المخصص</Text>
            <View style={{ position: 'relative', zIndex: 50, marginBottom: 12, maxWidth: 360 }}>
              <View style={styles.inputBox}>
                <Ionicons name="person-outline" size={16} color="#94a3b8" />
                <TextInput value={customTeacherQ} onChangeText={(v) => { setCustomTeacherQ(v); setCustomShowList(true); }} onFocus={() => setCustomShowList(true)} onBlur={() => setTimeout(() => setCustomShowList(false), 180)}
                  placeholder="اكتب اسم الأستاذ لإضافته" placeholderTextColor="#94a3b8" style={styles.input} testID="tw-custom-teacher-input" />
              </View>
              {customShowList && customTeacherQ && (
                <View style={styles.dropdown} testID="tw-custom-teacher-dropdown">
                  {customFilteredTeachers.map((t) => (
                    <TouchableOpacity key={t.id} style={styles.ddItem} onPressIn={() => addCustomTeacher(t)} testID={`tw-custom-teacher-opt-${t.id}`}>
                      <Text style={styles.ddText}>{t.full_name}</Text><Text style={styles.ddSub}>{deptName(t.department_id)}</Text>
                    </TouchableOpacity>
                  ))}
                  {customFilteredTeachers.length === 0 && <Text style={[styles.ddSub, { padding: 10, textAlign: 'center' }]}>لا نتائج</Text>}
                </View>
              )}
            </View>

            <View style={[styles.chips, { marginBottom: 14, zIndex: 1 }]}>
              {QUICK.map((q) => (
                <TouchableOpacity key={q.key} style={[styles.chip, quick === q.key && styles.chipOn]} onPress={() => { const [a, b] = q.range(); setFrom(a); setTo(b); setQuick(q.key); }} testID={`tw-custom-quick-${q.key}`}>
                  <Text style={[styles.chipText, quick === q.key && styles.chipTextOn]}>{q.label}</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.dates}>
                <Text style={styles.dateLbl}>من</Text>
                {Platform.OS === 'web' ? <input type="date" value={from} onChange={(e: any) => { setFrom(e.target.value); setQuick(''); }} style={dateInput as any} data-testid="tw-custom-date-from" /> : <TextInput value={from} onChangeText={setFrom} style={styles.dateNative} />}
                <Text style={styles.dateLbl}>إلى</Text>
                {Platform.OS === 'web' ? <input type="date" value={to} onChange={(e: any) => { setTo(e.target.value); setQuick(''); }} style={dateInput as any} data-testid="tw-custom-date-to" /> : <TextInput value={to} onChangeText={setTo} style={styles.dateNative} />}
              </View>
            </View>

            {customEntries.length === 0 && (
              <View style={dashStyles.empty} testID="tw-custom-empty">
                <Ionicons name="people-outline" size={36} color="#cbd5e1" />
                <Text style={dashStyles.emptyText}>أضف أساتذة لبناء التقرير المخصص — يمكن إضافة نفس الأستاذ أكثر من مرة بمقررات مختلفة</Text>
              </View>
            )}

            {customEntries.map((e, idx) => (
              <View key={e.key} style={styles.customEntryCard} testID={`tw-custom-entry-${e.key}`}>
                <View style={styles.customEntryHead}>
                  <TouchableOpacity onPress={() => setCustomEntries((prev) => prev.filter((x) => x.key !== e.key))} testID={`tw-custom-entry-remove-${e.key}`}>
                    <Ionicons name="trash-outline" size={17} color={DASH.red} />
                  </TouchableOpacity>
                  <Text style={styles.customEntryName}>{idx + 1}. {e.teacherName} <Text style={styles.tSub}>{e.departmentName}</Text></Text>
                </View>
                {e.courses.length === 0 ? (
                  <Text style={[styles.tSub, { padding: 8 }]}>لا مقررات لهذا الأستاذ</Text>
                ) : (
                  <View>
                    {e.courses.map((c: any) => {
                      const included = e.includedIds.includes(c.id);
                      const excludedFromLoad = e.excludedIds.includes(c.id);
                      return (
                        <View key={c.id} style={styles.customCourseRow} testID={`tw-custom-course-${e.key}-${c.id}`}>
                          <TouchableOpacity style={styles.customCourseCheck} onPress={() => toggleCustomInclude(e.key, c.id)} testID={`tw-custom-course-include-${e.key}-${c.id}`}>
                            <Ionicons name={included ? 'checkbox' : 'square-outline'} size={19} color={included ? DASH.navy : '#94a3b8'} />
                          </TouchableOpacity>
                          <Text style={[styles.customCourseName, !included && styles.customCourseNameOff]} numberOfLines={1}>
                            {c.name}{c.level ? ` · م${c.level}` : ''}{c.section ? `/${c.section}` : ''}
                          </Text>
                          {included && (
                            <TouchableOpacity style={[styles.loadPill, excludedFromLoad && styles.loadPillOff]} onPress={() => toggleCustomLoadExclude(e.key, c.id)} testID={`tw-custom-course-load-${e.key}-${c.id}`}>
                              <Text style={styles.loadPillText}>{excludedFromLoad ? '⏱ إضافي بالكامل' : '✓ ضمن النصاب'}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
                <Text style={styles.courseHint}>
                  {`${e.includedIds.length} من ${e.courses.length} مقرر مُدرج في هذا التقرير`}
                  {e.excludedIds.length ? ` · ${e.excludedIds.length} منها "إضافي بالكامل" (مستثنى من النصاب، يُحتسب كاملاً إضافياً)` : ''}
                  {e.courses.length - e.includedIds.length ? ` · ${e.courses.length - e.includedIds.length} مقرر غير مُحدَّد سيختفي تماماً من هذا التقرير` : ''}
                </Text>
              </View>
            ))}

            {customEntries.length > 0 && (
              <View style={[styles.chips, { marginTop: 6 }]}>
                <TouchableOpacity style={styles.runBtn} onPress={runCustom} disabled={customLoading} testID="tw-custom-run-btn">
                  {customLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="play" size={14} color="#fff" />}<Text style={styles.runText}>تنفيذ التقرير المخصص</Text>
                </TouchableOpacity>
                {customRan && customData.length > 0 && (
                  <>
                    <TouchableOpacity style={[styles.actBtn, { backgroundColor: '#b91c1c' }]} onPress={() => downloadCustom('pdf')} disabled={!!customExporting} testID="tw-custom-export-pdf-btn">
                      {customExporting === 'pdf' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="document-text" size={15} color="#fff" />}<Text style={styles.actText}>PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actBtn, { backgroundColor: '#15803d' }]} onPress={() => downloadCustom('excel')} disabled={!!customExporting} testID="tw-custom-export-excel-btn">
                      {customExporting === 'excel' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="grid" size={15} color="#fff" />}<Text style={styles.actText}>Excel</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </View>
        )}

        {mode === 'custom' && customRan && (
          <View style={dashStyles.card} testID="tw-custom-sheet-card">
            {customData.length === 0 ? (
              <View style={dashStyles.empty}><Ionicons name="document-text-outline" size={36} color="#cbd5e1" /><Text style={dashStyles.emptyText}>لا بيانات للمدخلات المحددة</Text></View>
            ) : (
              <OvertimeSheet teachers={customData} period={customPeriod} threshold={75} />
            )}
          </View>
        )}
      </ScrollView>
      <OvertimePolicyModal visible={policyOpen} onClose={() => setPolicyOpen(false)} onSaved={() => { if (ran) run(); }} />
      <Modal visible={excOpen} transparent animationType="fade" onRequestClose={() => setExcOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.excModal} testID="tw-exceptions-modal">
            <View style={styles.excHeader}>
              <Text style={styles.excTitle}>استثناء مقررات من النصاب لهذه الفترة فقط</Text>
              <TouchableOpacity onPress={() => setExcOpen(false)} testID="tw-exceptions-close"><Ionicons name="close" size={20} color={DASH.muted} /></TouchableOpacity>
            </View>
            <Text style={styles.excHint}>من {from} إلى {to} — المقررات المختارة تُحتسب كاملة ساعاتها إضافياً في هذه الفترة فقط، وتعود للاحتساب الطبيعي في فترات أخرى.</Text>
            <View style={[styles.inputBox, { marginBottom: 10 }]}>
              <Ionicons name="search" size={15} color="#94a3b8" /><TextInput value={excSearch} onChangeText={setExcSearch} placeholder="بحث باسم المقرر أو المدرس" placeholderTextColor="#94a3b8" style={styles.input} testID="tw-exceptions-search" />
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {allCourses.length === 0 && <Text style={[styles.tSub, { padding: 12, textAlign: 'center' }]}>نفّذ التقرير أولاً لعرض مقرراته</Text>}
              {allCourses.map((c) => {
                const on = excIds.includes(c.course_id);
                return (
                  <TouchableOpacity key={c.course_id} style={styles.excRow} onPress={() => setExcIds(on ? excIds.filter((x) => x !== c.course_id) : [...excIds, c.course_id])} testID={`tw-exceptions-course-${c.course_id}`} disabled={c.excluded_from_load}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={c.excluded_from_load ? '#cbd5e1' : (on ? DASH.navy : '#94a3b8')} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.excRowName}>{c.course_name} <Text style={styles.tSub}>{c.course_code}</Text></Text>
                      <Text style={styles.tSub}>{c.teacher_name}{c.excluded_from_load ? ' · مستثنى دائماً من إعدادات المقرر' : ''}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.excSaveBtn} onPress={saveExceptions} disabled={savingExc} testID="tw-exceptions-save">
              {savingExc ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={16} color="#fff" />}<Text style={styles.runText}>حفظ الاستثناءات لهذه الفترة</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const normAr = (s: any) => String(s || '').toLowerCase().replace(/[\u064B-\u0652]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '').replace(/^(د|أ|ا|أ\.د|ا\.د|أ\.م|ا\.م)\.\s*/g, '').replace(/\s+/g, ' ').trim();
const matchAr = (name: any, q: string) => { const n = normAr(name); return normAr(q).split(' ').filter(Boolean).every((w) => n.includes(w)); };

const dateInput = { border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', color: '#0f172a', background: '#fff' };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DASH.bg },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  excModal: { backgroundColor: '#fff', borderRadius: 16, padding: 18, width: '100%', maxWidth: 560 },
  excHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  excTitle: { fontSize: 15, fontWeight: '800', color: DASH.navy, textAlign: 'right' },
  excHint: { fontSize: 11.5, color: DASH.muted, textAlign: 'right', marginBottom: 12, lineHeight: 17 },
  excRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  excRowName: { fontSize: 12.5, fontWeight: '700', color: '#1e293b', textAlign: 'right' },
  excSaveBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: DASH.navy, borderRadius: 10, paddingVertical: 12, marginTop: 14 },
  content: { padding: 16, paddingBottom: 40, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  hero: { backgroundColor: DASH.navy, borderRadius: 18, padding: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  kicker: { color: DASH.gold, fontSize: 11, fontWeight: '800', textAlign: 'right', letterSpacing: 1 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'right', marginTop: 2 },
  subtitle: { color: '#cbd5e1', fontSize: 11.5, textAlign: 'right', marginTop: 4 },
  heroActions: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center' },
  iconBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  actBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  viewToggle: { flexDirection: 'row-reverse', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: 3, gap: 2 },
  viewBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  viewBtnOn: { backgroundColor: '#fff' },
  viewText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  deptModeToggle: { flexDirection: 'row-reverse', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 3, gap: 2 },
  deptModeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  deptModeBtnOn: { backgroundColor: DASH.navy },
  deptModeText: { fontSize: 12, fontWeight: '800', color: DASH.muted },
  deptModeTextOn: { color: '#fff' },
  actText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  filterRow: { flexDirection: 'row-reverse', gap: 12 },
  courseBox: { backgroundColor: '#f5f3ff', borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 10, padding: 10, marginTop: 10 },
  courseLbl: { fontSize: 12.5, fontWeight: '800', color: '#4c1d95', textAlign: 'right', marginBottom: 6 },
  courseHint: { fontSize: 11, color: '#6d28d9', textAlign: 'right', marginTop: 6 },
  chipCourseOn: { backgroundColor: '#6d28d9', borderColor: '#6d28d9' },
  chipExcluded: { backgroundColor: '#b45309', borderColor: '#b45309' },
  customEntryCard: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, marginBottom: 10 },
  customEntryHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 8 },
  customEntryName: { fontSize: 13.5, fontWeight: '800', color: DASH.ink, textAlign: 'right' },
  customCourseRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  customCourseCheck: { padding: 2 },
  customCourseName: { flex: 1, fontSize: 12.5, fontWeight: '700', color: DASH.ink, textAlign: 'right' },
  customCourseNameOff: { color: '#94a3b8', textDecorationLine: 'line-through' },
  loadPill: { backgroundColor: '#6d28d9', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  loadPillOff: { backgroundColor: '#b45309' },
  loadPillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', color: DASH.muted, textAlign: 'right', marginBottom: 4 },
  pickerBox: { borderWidth: 1, borderColor: DASH.line, borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden' },
  picker: { height: 40, textAlign: 'right' as any, borderWidth: 0, backgroundColor: 'transparent', fontSize: 13 } as any,
  inputBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: DASH.line, borderRadius: 10, paddingHorizontal: 10, height: 40, backgroundColor: '#fff' },
  input: { flex: 1, fontSize: 13, textAlign: 'right', color: DASH.ink, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) },
  dropdown: { position: 'absolute', top: 66, left: 0, right: 0, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: DASH.line, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, elevation: 8, zIndex: 100, maxHeight: 320, overflow: 'hidden' },
  ddItem: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) },
  ddText: { fontSize: 13, color: DASH.ink, fontWeight: '600' },
  ddSub: { fontSize: 11, color: DASH.muted },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: DASH.line },
  chipOn: { backgroundColor: DASH.navy, borderColor: DASH.navy },
  chipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  chipTextOn: { color: '#fff' },
  dates: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginHorizontal: 6 },
  dateLbl: { fontSize: 11.5, color: DASH.muted, fontWeight: '700' },
  dateNative: { borderWidth: 1, borderColor: DASH.line, borderRadius: 8, padding: 6, fontSize: 12, minWidth: 110, textAlign: 'center' },
  runBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: DASH.blue, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, marginRight: 'auto' as any },
  runText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  kpis: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  kpi: { flexGrow: 1, flexBasis: 170, overflow: 'hidden', paddingTop: 14 },
  kpiBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  kpiLbl: { fontSize: 12, color: DASH.muted, fontWeight: '700', textAlign: 'right' },
  kpiVal: { fontSize: 24, fontWeight: '800', textAlign: 'right', marginTop: 4 },
  kpiSub: { fontSize: 11, color: '#94a3b8', textAlign: 'right', marginTop: 2 },
  tableHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 },
  sortRow: { flexDirection: 'row-reverse', gap: 6 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1f5f9' },
  sortOn: { backgroundColor: DASH.navy },
  sortText: { fontSize: 11.5, fontWeight: '700', color: '#334155' },
  count: { fontSize: 12, color: DASH.muted, fontWeight: '700', marginRight: 'auto' as any },
  tRow: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  tMain: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rank: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontWeight: '800', fontSize: 13 },
  tName: { fontSize: 14, fontWeight: '800', color: DASH.ink, textAlign: 'right' },
  tSub: { fontSize: 11, color: DASH.muted, textAlign: 'right', marginTop: 2 },
  tNote: { fontSize: 11, color: '#b45309', textAlign: 'right', marginTop: 3, fontWeight: '700' },
  tRaised: { fontSize: 11, color: '#7c3aed', textAlign: 'right', marginTop: 3, fontWeight: '700' },
  lateBox: { flexDirection: 'row-reverse', gap: 10, alignItems: 'flex-start', backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fcd34d', borderRadius: 12, padding: 12, marginBottom: 14 },
  lateTitle: { fontSize: 12.5, fontWeight: '800', color: '#92400e', textAlign: 'right' },
  lateLine: { fontSize: 11.5, color: '#78350f', textAlign: 'right', marginTop: 3, lineHeight: 18 },
  track: { height: 8, borderRadius: 4, backgroundColor: '#eef2f7', overflow: 'hidden', flexDirection: 'row-reverse' },
  fill: { height: '100%', borderRadius: 4 },
  cell: { minWidth: 72, alignItems: 'center' },
  cellVal: { fontSize: 15, fontWeight: '800' },
  cellLbl: { fontSize: 10, color: DASH.muted },
  courses: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 8, marginBottom: 10 },
  cRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  cHead: { borderBottomWidth: 0 },
  cTd: { flex: 1, fontSize: 12, color: '#334155', textAlign: 'center' },
  cTh: { fontSize: 11, fontWeight: '800', color: DASH.muted },
  cName: { flex: 2.5, textAlign: 'right', fontWeight: '700', color: DASH.ink },
});
