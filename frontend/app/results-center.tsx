import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ResultsNav, useResultsGo } from '../src/components/results/ResultsNav';
import api from '../src/services/api';
import { useAcademicScope } from '../src/hooks/useAcademicScope';
import { useAuth } from '../src/contexts/AuthContext';
import { PickerField, Opt, Fac, facultyMeta } from '../src/components/results/resultsUi';
import { RcSheet } from '../src/components/rc/RcSheet';
import { RcSettingsModal } from '../src/components/rc/RcSettingsModal';
import { RcPublishModal } from '../src/components/rc/RcPublishModal';
import { RcLevelSheet } from '../src/components/rc/RcLevelSheet';
import { Badge } from '../src/components/rc/rcUi';
import { RcStudentLookup } from '../src/components/rc/RcStudentLookup';

type Dep = Opt & { faculty_id?: string };
type Course = { id: string; name: string; code: string; level: number; section: string; department_id: string; department_name: string; students: number; coursework_entered: number; locked: boolean };
type Sem = { id: string; name: string; term?: number; status?: string };

const CourseCard = ({ c, onOpen }: { c: Course; onOpen: () => void }) => {
  const pct = c.students ? Math.round((c.coursework_entered / c.students) * 100) : 0;
  return (
    <TouchableOpacity style={st.courseCard} onPress={onOpen} testID={`rc-course-${c.id}`}>
      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={st.cName} numberOfLines={2}>{c.name}</Text>
          <Text style={st.cSub}>{c.code} · المستوى {c.level}{c.section ? ` · شعبة ${c.section}` : ''} · {c.department_name}</Text>
        </View>
        <Badge text={c.locked ? 'السعي مقفل' : 'قيد الرصد'} color={c.locked ? '#2e7d32' : '#ef6c00'} testID={`rc-course-state-${c.id}`} />
      </View>
      <View style={st.bar}><View style={[st.barFill, { width: `${pct}%` as any }]} /></View>
      <Text style={st.cSub}>رُصد السعي لـ {c.coursework_entered} من {c.students} طالب</Text>
    </TouchableOpacity>
  );
};

export default function ResultsCenterPage() {
  const { hasPermission } = useAuth();
  const perms = { cw: hasPermission('rc_enter_coursework'), unlock: hasPermission('rc_unlock_coursework'), exams: hasPermission('rc_enter_exams'), decide: hasPermission('rc_board_decisions') };
  const canSettings = hasPermission('rc_manage_settings');
  const canApprove = hasPermission('rc_approve') && hasPermission('manage_results');
  const { filterFaculties, filterDepartments } = useAcademicScope();
  const [faculties, setFaculties] = useState<Fac[]>([]);
  const [departments, setDepartments] = useState<Dep[]>([]);
  const [sems, setSems] = useState<Sem[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const qp = useLocalSearchParams<{ faculty_id?: string; department_id?: string; level?: string; semester_id?: string; view?: string; course?: string }>();
  const go = useResultsGo();
  const [f, setFState] = useState({ faculty_id: qp.faculty_id || '', department_id: qp.department_id || '', level: qp.level || '', semester_id: qp.semester_id || '' });
  const setF = (v: typeof f) => { setFState(v); router.setParams(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x || undefined])) as any); };
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const open = qp.view === 'course' && qp.course ? String(qp.course) : null;
  const levelView = qp.view === 'level';
  const [openFac, setOpenFac] = useState('');
  const [lookup, setLookup] = useState(false);
  const [pubCtx, setPubCtx] = useState<{ department_id: string; level: string; semester_id: string; preselect?: string } | null>(null);
  const toList = () => go({ pathname: '/results-center', params: f }, { back: true });
  const openView = (p: Record<string, string>) => router.push({ pathname: '/results-center', params: Object.fromEntries(Object.entries({ ...f, ...p }).filter(([, x]) => x)) } as any);
  const [q, setQ] = useState('');
  const [size, setSize] = useState(12);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<'' | 'settings' | 'publish'>('');

  useEffect(() => {
    api.get('/faculties').then((r) => setFaculties((r.data || []).map((x: any) => ({ id: x.id, name: x.name, levels_count: x.levels_count, sections: x.sections })))).catch(() => {});
    api.get('/departments').then((r) => setDepartments((r.data || []).map((x: any) => ({ id: x.id, name: x.name, faculty_id: x.faculty_id })))).catch(() => {});
    api.get('/settings/academic-years').then((r) => setYears(r.data?.years || [])).catch(() => {});
    api.get('/semesters').then((r) => {
      const list: Sem[] = (r.data || []).map((s: any) => ({ id: s.id, name: `${s.name}${s.status === 'active' ? ' (الحالي)' : ''}`, term: s.term, status: s.status }));
      setSems(list);
      const act = list.find((s) => s.status === 'active');
      if (act && !qp.semester_id) setFState((x) => ({ ...x, semester_id: act.id }));
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const params: any = {}; Object.entries(f).forEach(([k, v]) => { if (v) params[k] = v; });
      setCourses((await api.get('/rc/courses', { params })).data.items);
    } catch (e: any) { setErr(e?.response?.data?.detail || 'تعذر جلب المقررات'); } finally { setLoading(false); }
  }, [f]);
  useEffect(() => { if (!open) load(); }, [f, open]);

  const myFacs = filterFaculties(faculties) as Fac[];
  const myDeps = filterDepartments(departments).filter((d) => !f.faculty_id || d.faculty_id === f.faculty_id);
  const facId = (open && openFac) || f.faculty_id || departments.find((d) => d.id === f.department_id)?.faculty_id || (myFacs.length === 1 ? myFacs[0].id : '');
  const meta = facultyMeta(myFacs, facId);
  const sem = sems.find((s) => s.id === f.semester_id);
  const term = q.trim().toLowerCase();
  const shown = term ? courses.filter((c) => c.name.toLowerCase().includes(term) || (c.code || '').toLowerCase().includes(term)) : courses;
  const pages = size ? Math.max(1, Math.ceil(shown.length / size)) : 1;
  const cur = Math.min(page, pages);
  const visible = size ? shown.slice((cur - 1) * size, cur * size) : shown;
  useEffect(() => { setPage(1); }, [q, size, f]);

  return (
    <SafeAreaView style={st.container} edges={['bottom']}>
      <ScrollView dataSet={{ responsiveScrollRoot: 'true' }} style={{ flex: 1 }} contentContainerStyle={st.pageScroll}>
        <View dataSet={{ responsive: 'page-header' }} style={st.pageHeader}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text dataSet={{ responsive: 'page-title' }} style={st.pageTitle}>مركز النتائج</Text>
            <ResultsNav current="/results-center" crumbs={open || levelView ? [{ label: 'مركز النتائج', onPress: toList }, { label: levelView ? 'كشف الدور الأول للمستوى' : 'كشف المقرر' }] : [{ label: 'مركز النتائج' }]} />
          </View>
          <View dataSet={{ responsive: 'page-header-actions' }} style={st.actions}>
            {!!facId && (
              <TouchableOpacity style={[st.hBtn, st.ghost]} onPress={() => setModal('settings')} testID="rc-settings-open-btn">
                <Ionicons name="settings-outline" size={16} color="#1a2540" /><Text style={[st.hBtnTxt, { color: '#1a2540' }]}>إعدادات اللائحة</Text>
              </TouchableOpacity>
            )}
            {!open && !levelView && (
              <TouchableOpacity style={[st.hBtn, { backgroundColor: f.department_id && f.level && f.semester_id ? '#1565c0' : '#94a3b8' }]} testID="rc-level-open-btn"
                onPress={() => (f.department_id && f.level && f.semester_id ? openView({ view: 'level' }) : setErr('اختر القسم والمستوى والفصل أولاً لعرض كشف الدور الأول'))}>
                <Ionicons name="grid-outline" size={16} color="#fff" /><Text style={st.hBtnTxt}>كشف الدور الأول للمستوى</Text>
              </TouchableOpacity>
            )}
            {canApprove && !open && !levelView && (
              <TouchableOpacity style={[st.hBtn, { backgroundColor: f.department_id && f.level && f.semester_id ? '#2e7d32' : '#94a3b8' }]} testID="rc-publish-open-btn"
                onPress={() => (f.department_id && f.level && f.semester_id ? setPubCtx({ department_id: f.department_id, level: f.level, semester_id: f.semester_id }) : setErr('اختر القسم والمستوى والفصل أولاً لاعتماد نتائجهم'))}>
                <Ionicons name="checkmark-done-outline" size={16} color="#fff" /><Text style={st.hBtnTxt}>اعتماد ونقل إلى النتائج</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {levelView ? <RcLevelSheet departmentId={f.department_id} departmentName={departments.find((d) => d.id === f.department_id)?.name || ''} level={f.level}
          semesterId={f.semester_id} canImport={hasPermission('rc_approve')} onBack={toList} />
        : open ? <RcSheet courseId={open} perms={perms} onPublish={canApprove ? (c) => setPubCtx({ department_id: c.department_id, level: String(c.level ?? ''), semester_id: c.semester_id, preselect: c.id }) : undefined} onBack={() => { setOpenFac(''); toList(); }} onFaculty={setOpenFac} /> : (
          <>
            <View style={st.flow} testID="rc-flow">
              {['كشف الأهلية (الحضور)', 'أعمال السعي', 'الدور الأول', 'الدور الثاني', 'الاستثنائي', 'الاعتماد ← النتائج'].map((x, i, a) => (
                <View key={x} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                  <View style={st.flowDot}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{i + 1}</Text></View>
                  <Text style={{ color: '#1a2540', fontWeight: '700', fontSize: 12.5 }}>{x}</Text>
                  {i < a.length - 1 && <Ionicons name="chevron-back" size={14} color="#94a3b8" />}
                </View>
              ))}
            </View>
            <View style={st.filterCard}>
              <View dataSet={{ responsive: 'filter-row' }} style={st.filterRow}>
                {myFacs.length > 1 && <PickerField label="الكلية" options={myFacs} value={f.faculty_id} onChange={(v) => setF({ ...f, faculty_id: v, department_id: '', level: '' })} testID="rc-flt-faculty" allLabel="الكل" />}
                <PickerField label="القسم" options={myDeps} value={f.department_id} onChange={(v) => setF({ ...f, department_id: v, level: '' })} testID="rc-flt-department" allLabel="الكل" />
                <PickerField label="المستوى" options={meta.levels} value={f.level} onChange={(v) => setF({ ...f, level: v })} testID="rc-flt-level" allLabel="الكل" maxWidth={160} />
                <PickerField label="الفصل الدراسي" options={sems} value={f.semester_id} onChange={(v) => setF({ ...f, semester_id: v })} testID="rc-flt-semester" noPlaceholder={sems.length > 0} maxWidth={240} />
              </View>
            </View>
            <View style={st.toolRow}>
              <View style={st.search}>
                <Ionicons name="search" size={16} color="#8a95a8" />
                <TextInput style={st.searchInput} value={q} onChangeText={setQ} placeholder="ابحث باسم المقرر أو رقمه" placeholderTextColor="#94a3b8" testID="rc-course-search" />
                {!!q && <TouchableOpacity onPress={() => setQ('')} testID="rc-course-search-clear"><Ionicons name="close-circle" size={16} color="#94a3b8" /></TouchableOpacity>}
              </View>
              <TouchableOpacity onPress={() => setLookup(true)} style={[st.chip, { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#1565c0', borderColor: '#1565c0' }]} testID="rc-student-lookup-btn">
                <Ionicons name="person-circle-outline" size={16} color="#fff" /><Text style={[st.chipTxt, { color: '#fff' }]}>استعلام عن طالب</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                <Text style={st.cSub}>عدد العرض:</Text>
                {[12, 24, 48, 0].map((n) => (
                  <TouchableOpacity key={n} onPress={() => setSize(n)} style={[st.chip, size === n && st.chipOn]} testID={`rc-page-size-${n || 'all'}`}>
                    <Text style={[st.chipTxt, size === n && { color: '#fff' }]}>{n || 'الكل'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={st.cSub} testID="rc-courses-count">{shown.length} مقرر{term ? ` (من ${courses.length})` : ''}</Text>
            </View>
            {!!err && <Text style={st.err} testID="rc-error">{err}</Text>}
            {lookup && <RcStudentLookup semesterId={f.semester_id} onClose={() => setLookup(false)} onOpenCourse={(cid) => { setLookup(false); openView({ view: 'course', course: cid }); }} />}
            {loading ? <ActivityIndicator style={{ marginTop: 30 }} /> : courses.length === 0
              ? <Text style={{ textAlign: 'center', color: '#94a3b8', marginTop: 30 }} testID="rc-courses-empty">لا توجد مقررات ضمن نطاقك لهذه الفلاتر</Text>
              : shown.length === 0 ? <Text style={{ textAlign: 'center', color: '#94a3b8', marginTop: 30 }} testID="rc-search-empty">لا توجد مقررات تطابق «{q}»</Text>
              : <View style={st.grid} testID="rc-courses-grid">{visible.map((c) => <CourseCard key={c.id} c={c} onOpen={() => openView({ view: 'course', course: c.id })} />)}</View>}
            {!loading && pages > 1 && (
              <View style={st.pager} testID="rc-pager">
                <TouchableOpacity disabled={cur <= 1} onPress={() => setPage(cur - 1)} style={[st.chip, cur <= 1 && { opacity: 0.4 }]} testID="rc-page-prev"><Ionicons name="chevron-forward" size={16} color="#1a2540" /></TouchableOpacity>
                <Text style={st.chipTxt} testID="rc-page-info">صفحة {cur} من {pages}</Text>
                <TouchableOpacity disabled={cur >= pages} onPress={() => setPage(cur + 1)} style={[st.chip, cur >= pages && { opacity: 0.4 }]} testID="rc-page-next"><Ionicons name="chevron-back" size={16} color="#1a2540" /></TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
      {modal === 'settings' && !!facId && <RcSettingsModal facultyId={facId} facultyName={faculties.find((x) => x.id === facId)?.name || ''} canEdit={canSettings} onClose={() => setModal('')} onSaved={() => {}} />}
      {!!pubCtx && <RcPublishModal departmentId={pubCtx.department_id} departmentName={departments.find((d) => d.id === pubCtx.department_id)?.name || ''} level={pubCtx.level}
        semesterId={pubCtx.semester_id} preselect={pubCtx.preselect} defaultTerm={String(sems.find((x) => x.id === pubCtx.semester_id)?.term || sem?.term || '')} years={years} onClose={() => setPubCtx(null)} />}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6fb' },
  pageScroll: { padding: 20, paddingBottom: 60, maxWidth: 1440, width: '100%', alignSelf: 'center' },
  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 },
  pageTitle: { fontSize: 26, fontWeight: '700', color: '#1a2540', textAlign: 'right', marginBottom: 6 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bcLink: { fontSize: 13, color: '#2962ff', fontWeight: '500' },
  bcCur: { fontSize: 13, color: '#8a95a8', fontWeight: '500' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  hBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8 },
  hBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  ghost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee' },
  flow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#eef1f6' },
  flowDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#2962ff', alignItems: 'center', justifyContent: 'center' },
  filterCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 18, borderWidth: 1, borderColor: '#eef1f6' },
  filterRow: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  courseCard: { flexBasis: 320, flexGrow: 1, maxWidth: 460, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#eef1f6', gap: 8 },
  cName: { fontSize: 15, fontWeight: '800', color: '#1a2540', textAlign: 'right' },
  cSub: { fontSize: 12, color: '#64748b', textAlign: 'right' },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#eef1f6', overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: '#2962ff', alignSelf: 'flex-end' },
  err: { color: '#c62828', textAlign: 'right', marginBottom: 10 },
  toolRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 },
  search: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee', borderRadius: 10, paddingHorizontal: 12, height: 40, flexGrow: 1, maxWidth: 420 },
  searchInput: { flex: 1, textAlign: 'right', fontSize: 14, color: '#1a2540', outlineStyle: 'none' as any },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee' },
  chipOn: { backgroundColor: '#1a2540', borderColor: '#1a2540' },
  chipTxt: { fontSize: 12.5, fontWeight: '700', color: '#1a2540' },
  pager: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 },
});
