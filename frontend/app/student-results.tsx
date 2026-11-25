import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '../src/services/api';
import { useAcademicScope } from '../src/hooks/useAcademicScope';
import { useAuth } from '../src/contexts/AuthContext';
import { PickerField, ModalShell, LEVELS, Opt, downloadBlob } from '../src/components/results/resultsUi';
import { StudentResultsCard } from '../src/components/results/StudentResultsCard';
import { ResultsUploadWizard } from '../src/components/results/ResultsUploadWizard';
import { ResultsHistory } from '../src/components/results/ResultsHistory';
import { ResultsTable, SRow } from '../src/components/results/ResultsTable';

type Dep = Opt & { faculty_id?: string };
const EMPTY = { faculty_id: '', department_id: '', level: '', academic_year: '', q: '' };

const Stat = ({ icon, color, label, value, sub }: { icon: any; color: string; label: string; value: string | number; sub: string }) => (
  <View style={st.statCard}>
    <View style={[st.statIcon, { backgroundColor: color }]}><Ionicons name={icon} size={22} color="#fff" /></View>
    <View style={{ flex: 1, alignItems: 'flex-end' }}>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={st.statValue} numberOfLines={1}>{value}</Text>
      <Text style={st.statSub}>{sub}</Text>
    </View>
  </View>
);

export default function ResultsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manage_results');
  const { scope, restricted, filterFaculties, filterDepartments } = useAcademicScope();
  const [faculties, setFaculties] = useState<Opt[]>([]);
  const [departments, setDepartments] = useState<Dep[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [f, setF] = useState(EMPTY);
  const [data, setData] = useState<{ items: SRow[]; total: number; pages: number }>({ items: [], total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [modal, setModal] = useState<'' | 'upload' | 'history'>('');

  useEffect(() => {
    api.get('/faculties').then((r) => setFaculties((r.data || []).map((x: any) => ({ id: x.id, name: x.name })))).catch(() => {});
    api.get('/departments').then((r) => setDepartments((r.data || []).map((x: any) => ({ id: x.id, name: x.name, faculty_id: x.faculty_id })))).catch(() => {});
    api.get('/settings/academic-years').then((r) => setYears(r.data?.years || [])).catch(() => {});
  }, []);

  const load = useCallback(async (pg = 1) => {
    setLoading(true); setErr('');
    try {
      const params: any = { page: pg };
      Object.entries(f).forEach(([k, v]) => { if (v) params[k] = v; });
      setData((await api.get('/results/students', { params })).data); setPage(pg);
    } catch (e: any) { setErr(e?.response?.data?.detail || 'تعذر جلب الطلاب'); } finally { setLoading(false); }
  }, [f]);

  useEffect(() => { load(1); }, [f.faculty_id, f.department_id, f.level, f.academic_year]);

  const blank = async () => {
    try { downloadBlob((await api.get('/results/template/blank', { responseType: 'blob' })).data, 'نموذج نتائج فارغ.xlsx'); }
    catch { setErr('فشل تنزيل النموذج'); }
  };

  const myFacs = filterFaculties(faculties);
  const myDeps = filterDepartments(departments).filter((d) => !f.faculty_id || d.faculty_id === f.faculty_id);
  const fullFacs = restricted ? faculties.filter((x) => (scope?.full_faculty_ids || []).includes(x.id)) : faculties;
  const hasFilter = Object.values(f).some(Boolean);
  const depName = departments.find((d) => d.id === f.department_id)?.name;
  const facName = faculties.find((x) => x.id === f.faculty_id)?.name;

  return (
    <SafeAreaView style={st.container} edges={['bottom']}>
      <ScrollView dataSet={{ responsiveScrollRoot: 'true' }} style={{ flex: 1 }} contentContainerStyle={st.pageScroll}>
        <View dataSet={{ responsive: 'page-header' }} style={st.pageHeader}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text dataSet={{ responsive: 'page-title' }} style={st.pageTitle}>النتائج</Text>
            <View style={st.breadcrumb}>
              <TouchableOpacity onPress={() => router.replace('/')}><Text style={st.bcLink}>الرئيسية</Text></TouchableOpacity>
              <Ionicons name="chevron-back" size={12} color="#8a95a8" />
              <Text style={st.bcCur}>النتائج</Text>
            </View>
          </View>
          <View dataSet={{ responsive: 'page-header-actions' }} style={st.actions}>
            {canManage && (
              <TouchableOpacity style={[st.hBtn, { backgroundColor: '#2962ff' }]} onPress={() => setModal('upload')} testID="results-upload-open-btn">
                <Ionicons name="cloud-upload-outline" size={16} color="#fff" /><Text style={st.hBtnTxt}>رفع نتائج</Text>
              </TouchableOpacity>
            )}
            {canManage && (
              <TouchableOpacity style={[st.hBtn, { backgroundColor: '#22c55e' }]} onPress={blank} testID="results-blank-template-btn">
                <Ionicons name="document-outline" size={16} color="#fff" /><Text style={st.hBtnTxt}>نموذج Excel فارغ</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[st.hBtn, st.ghost]} onPress={() => setModal('history')} testID="results-history-open-btn">
              <Ionicons name="time-outline" size={16} color="#1a2540" /><Text style={[st.hBtnTxt, { color: '#1a2540' }]}>سجل العمليات</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={st.statsGrid}>
          <Stat icon="people" color="#2962ff" label="عدد الطلاب" value={data.total} sub="حسب الفلاتر الحالية" />
          <Stat icon="business" color="#22c55e" label="النطاق" value={depName || facName || 'الكل'} sub={depName ? 'قسم' : facName ? 'كلية' : 'كل نطاقك'} />
          <Stat icon="school" color="#7c4dff" label="المستوى" value={f.level || 'الكل'} sub="المستوى الحالي" />
          <Stat icon="calendar" color="#f59e0b" label="السنة الدراسية" value={f.academic_year || 'كل السنوات'} sub="لعدّ الفصول الصادرة" />
        </View>

        <View style={st.filterCard}>
          <View dataSet={{ responsive: 'filter-row' }} style={st.filterRow}>
            <View style={{ flex: 1.6, minWidth: 220 }}>
              <Text style={st.fLbl}>بحث</Text>
              <View style={st.searchBox}>
                <Ionicons name="search" size={16} color="#8a95a8" />
                <TextInput style={st.searchInput} placeholder="الاسم أو رقم القيد..." placeholderTextColor="#a8b1c2" value={f.q}
                  onChangeText={(q) => setF({ ...f, q })} onSubmitEditing={() => load(1)} testID="flt-search-input" />
              </View>
            </View>
            {myFacs.length > 1 && <PickerField label="الكلية" options={myFacs} value={f.faculty_id} onChange={(v) => setF({ ...f, faculty_id: v, department_id: '' })} testID="flt-faculty" allLabel="الكل" />}
            <PickerField label="القسم" options={myDeps} value={f.department_id} onChange={(v) => setF({ ...f, department_id: v })} testID="flt-department" allLabel="الكل" />
            <PickerField label="المستوى" options={LEVELS} value={f.level} onChange={(v) => setF({ ...f, level: v })} testID="flt-level" allLabel="الكل" maxWidth={150} />
            <PickerField label="السنة الدراسية" options={years.map((y) => ({ id: y, name: y }))} value={f.academic_year} onChange={(v) => setF({ ...f, academic_year: v })} testID="flt-year" allLabel="كل السنوات" maxWidth={170} />
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity style={st.reset} disabled={!hasFilter} onPress={() => setF(EMPTY)} testID="flt-reset-btn">
                <Ionicons name="refresh" size={13} color={hasFilter ? '#2962ff' : '#a8b1c2'} />
                <Text style={[st.resetTxt, !hasFilter && { color: '#a8b1c2' }]}>إعادة تعيين</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.hBtn, { backgroundColor: '#2962ff', paddingHorizontal: 18 }]} onPress={() => load(1)} testID="flt-search-btn">
                <Text style={st.hBtnTxt}>بحث</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {err ? <Text style={st.err} testID="results-error">{err}</Text> : null}
        <ResultsTable items={data.items} total={data.total} page={page} pages={data.pages} loading={loading} offset={(page - 1) * 100}
          onOpen={setOpenId} onPage={(p) => load(p)} />
      </ScrollView>

      {modal === 'upload' && canManage && (
        <ModalShell title="رفع نتائج من Excel" icon="cloud-upload-outline" onClose={() => { setModal(''); load(page); }} testID="results-upload-modal">
          <ResultsUploadWizard years={years} faculties={fullFacs} departments={filterDepartments(departments)} restrictedFaculty={restricted && !fullFacs.length} onDone={() => load(page)} />
        </ModalShell>
      )}
      {modal === 'history' && (
        <ModalShell title="سجل العمليات" icon="time-outline" onClose={() => { setModal(''); load(page); }} testID="results-history-modal">
          <ResultsHistory canManage={canManage} />
        </ModalShell>
      )}
      {openId && <StudentResultsCard studentId={openId} years={years} canManage={canManage} onClose={() => { setOpenId(null); load(page); }} />}
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
  statsGrid: { flexDirection: 'row', gap: 14, marginBottom: 18, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 200, backgroundColor: '#fff', borderRadius: 14, padding: 16, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#eef1f6' },
  statIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 13, color: '#8a95a8', fontWeight: '500', marginBottom: 4 },
  statValue: { fontSize: 20, color: '#1a2540', fontWeight: '700', marginBottom: 2 },
  statSub: { fontSize: 11, color: '#a8b1c2' },
  filterCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 18, borderWidth: 1, borderColor: '#eef1f6' },
  filterRow: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' },
  fLbl: { fontSize: 12, color: '#5b6678', fontWeight: '500', marginBottom: 5, textAlign: 'right' },
  searchBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e3e7ee', height: 40 },
  searchInput: { flex: 1, fontSize: 13, color: '#1a2540', textAlign: 'right', outlineStyle: 'none' as any },
  reset: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingVertical: 9 },
  resetTxt: { fontSize: 13, color: '#2962ff', fontWeight: '600' },
  err: { color: '#c62828', textAlign: 'right', marginBottom: 10 },
});
