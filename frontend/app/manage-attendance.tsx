import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ScrollView, Platform, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../src/services/api';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { useAuth, PERMISSIONS } from '../src/contexts/AuthContext';
import { ReportHero, ReportKpis, reportPage } from '../src/components/reports/ReportShell';
import { HrSelect } from '../src/components/hr/HrSelect';
import { StudentAttendanceSearch } from '../src/components/attendance/StudentAttendanceSearch';
import { LectureTable, Lecture } from '../src/components/attendance/LectureTable';
import { C, card, fieldLbl, textInp, Seg, Chip, DateNav, ymd, dayNameAr } from '../src/components/attendance/attUi';

const showMessage = (title: string, message: string) => (Platform.OS === 'web' ? window.alert(`${title}\n\n${message}`) : Alert.alert(title, message));

export default function ManageAttendanceScreen() {
  const router = useRouter();
  const { hasAnyPermission, hasPermission, user } = useAuth();
  const canView = hasAnyPermission([PERMISSIONS.MANAGE_ATTENDANCE || 'manage_attendance', 'record_attendance', 'take_attendance', 'edit_attendance', 'view_attendance']);
  const canEditAttendance = user?.role === 'admin' || user?.role === 'dean' || hasPermission(PERMISSIONS.EDIT_ATTENDANCE);

  const [mode, setMode] = useState('lecture');
  const [loading, setLoading] = useState(true);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [date, setDate] = useState(ymd(new Date()));
  const [search, setSearch] = useState('');
  const [deptF, setDeptF] = useState('');
  const [facF, setFacF] = useState('');
  const [takenF, setTakenF] = useState<'' | 'taken' | 'pending'>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!canView) { showMessage('غير مصرح', 'ليس لديك صلاحية لإدارة الحضور'); router.replace('/' as any); } }, [canView, router]);

  const fetchLectures = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const res = await api.get('/lectures/all-schedule', { params: { date } });
      setLectures((res.data?.lectures || []).map((l: any) => ({ ...l, attendance_taken: l.attendance_taken ?? l.status === 'completed' })));
    } catch (err: any) { setError(err?.response?.data?.detail || 'فشل تحميل المحاضرات'); }
    finally { setLoading(false); }
  }, [date]);
  useEffect(() => { fetchLectures(); }, [fetchLectures]);

  const faculties = useMemo(() => Array.from(new Set(lectures.map((l) => l.faculty_name).filter(Boolean))).sort().map((f) => ({ value: f as string, label: f as string })), [lectures]);
  const departments = useMemo(() => {
    const m: Record<string, { label: string; sub: string; n: number }> = {};
    lectures.filter((l) => !facF || l.faculty_name === facF).forEach((l: any) => { const id = l.department_id || '-'; (m[id] ||= { label: l.department_name || 'بدون قسم', sub: l.faculty_name || '', n: 0 }).n++; });
    return Object.entries(m).map(([value, d]) => ({ value, label: `${d.label} (${d.n})`, sub: d.sub })).sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  }, [lectures, facF]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lectures.filter((l: any) =>
      (!facF || l.faculty_name === facF) && (!deptF || (l.department_id || '-') === deptF) &&
      (!takenF || (takenF === 'taken') === !!l.attendance_taken) &&
      (!q || [l.course_name, l.course_code, l.teacher_name, l.room].some((v) => (v || '').toLowerCase().includes(q))));
  }, [lectures, search, deptF, facF, takenF]);
  const taken = lectures.filter((l) => l.attendance_taken).length;
  const kpi = (k: '' | 'taken' | 'pending') => ({ active: takenF === k && !!k, onPress: () => setTakenF(takenF === k ? '' : k) });

  const openAttendance = (l: Lecture) => router.push({ pathname: '/take-attendance', params: { lectureId: l.id, courseId: l.course_id, courseName: l.course_name || '' } } as any);

  if (!canView) return null;
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'إدارة الحضور', headerShown: false }} />
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="الحضور والغياب" title="إدارة الحضور" subtitle="تسجيل وتعديل حضور الطلاب — حسب المحاضرة والتاريخ والقسم، أو حسب الطالب مع فلترة الغياب والفترة" onBack={() => router.back()} canExport={false} testID="manage-att-hero" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12, direction: 'rtl' }}>
          <Seg value={mode} onChange={setMode} testID="mode" items={[{ k: 'lecture', l: 'حسب المحاضرة', icon: 'calendar' }, { k: 'student', l: 'حسب الطالب', icon: 'person-circle' }]} />
          {mode === 'lecture' && <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 700 }} data-testid="date-caption">{dayNameAr(date)} • {date} • {filtered.length} من {lectures.length} محاضرة</span>}
        </div>

        {mode === 'student' ? <StudentAttendanceSearch canEdit={canEditAttendance} /> : (
          <>
            <div style={card} data-testid="lecture-filters">
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(170px, 0.8fr) minmax(200px, 1fr) minmax(220px, 1fr)', gap: 14, alignItems: 'end' }}>
                <div><label style={fieldLbl}>التاريخ</label><DateNav date={date} onChange={(d) => { setDate(d); setDeptF(''); }} /></div>
                <div><label style={fieldLbl}>الكلية</label><HrSelect value={facF} onChange={(v) => { setFacF(v); setDeptF(''); }} options={faculties} placeholder="كل الكليات" testID="fac-filter" /></div>
                <div><label style={fieldLbl}>القسم</label><HrSelect value={deptF} onChange={setDeptF} options={departments} placeholder="كل الأقسام" searchable testID="dept-filter" /></div>
                <div><label style={fieldLbl}>بحث</label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="المقرر / المدرّس / القاعة…" style={textInp} data-testid="lecture-search" /></div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ ...fieldLbl, marginBottom: 0 }}>حالة التحضير:</span>
                <Chip on={!takenF} color={C.navy} onClick={() => setTakenF('')} testID="taken-all">الكل</Chip>
                <Chip on={takenF === 'pending'} color={C.orange} onClick={() => setTakenF('pending')} testID="taken-pending">لم تُحضَّر</Chip>
                <Chip on={takenF === 'taken'} color={C.green} onClick={() => setTakenF('taken')} testID="taken-done">تم التحضير</Chip>
                {(deptF || facF || takenF || search) && <button type="button" onClick={() => { setDeptF(''); setFacF(''); setTakenF(''); setSearch(''); }} data-testid="filters-clear" style={{ marginRight: 'auto', border: 'none', background: 'transparent', color: C.muted, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>✕ مسح الفلاتر</button>}
              </div>
            </div>

            <ReportKpis testID="lecture-kpis" items={[
              { label: 'محاضرات اليوم', value: lectures.length, color: C.navy, icon: 'calendar', ...kpi(''), testID: 'kpi-total' },
              { label: 'تم التحضير', value: taken, color: C.green, icon: 'checkmark-done', ...kpi('taken'), testID: 'kpi-taken' },
              { label: 'لم تُحضَّر', value: lectures.length - taken, color: C.orange, icon: 'alert-circle', ...kpi('pending'), testID: 'kpi-pending' },
              { label: 'أقسام', value: new Set(lectures.map((l: any) => l.department_id || '-')).size, color: C.purple, icon: 'git-branch', testID: 'kpi-depts' },
            ]} />

            <div style={card}>
              {error && <div style={{ backgroundColor: '#ffebee', color: C.red, padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 10 }}>{error}</div>}
              {loading ? <LoadingScreen /> : <LectureTable lectures={filtered} onOpen={openAttendance} />}
            </div>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
