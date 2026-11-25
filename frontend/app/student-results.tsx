import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '../src/services/api';
import { useAcademicScope } from '../src/hooks/useAcademicScope';
import { ChipRow, LEVELS, Opt, rs } from '../src/components/results/resultsUi';
import { StudentResultsCard } from '../src/components/results/StudentResultsCard';
import { ResultsUploadWizard } from '../src/components/results/ResultsUploadWizard';

interface SRow { id: string; reg_no: string; full_name: string; department_name: string; level: number; released_count: number }
type Dep = Opt & { faculty_id?: string };

export default function ResultsPage() {
  const { scope, restricted, filterFaculties, filterDepartments } = useAcademicScope();
  const [tab, setTab] = useState<'table' | 'upload'>('table');
  const [faculties, setFaculties] = useState<Opt[]>([]);
  const [departments, setDepartments] = useState<Dep[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [f, setF] = useState({ faculty_id: '', department_id: '', level: '', academic_year: '', q: '' });
  const [data, setData] = useState<{ items: SRow[]; total: number; pages: number }>({ items: [], total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

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

  useEffect(() => { if (tab === 'table') load(1); }, [f.faculty_id, f.department_id, f.level, f.academic_year, tab]);

  const myFacs = filterFaculties(faculties);
  const myDeps = filterDepartments(departments).filter((d) => !f.faculty_id || d.faculty_id === f.faculty_id);
  const fullFacs = restricted ? faculties.filter((x) => (scope?.full_faculty_ids || []).includes(x.id)) : faculties;

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} testID="results-back-btn"><Ionicons name="arrow-forward" size={24} color="#1a2540" /></TouchableOpacity>
        <Text style={st.title}>النتائج</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={st.tabs}>
        {([['table', 'جدول النتائج', 'grid-outline'], ['upload', 'رفع نتائج', 'cloud-upload-outline']] as const).map(([k, l, ic]) => (
          <TouchableOpacity key={k} style={[st.tab, tab === k && st.tabOn]} onPress={() => setTab(k)} testID={`results-tab-${k}`}>
            <Ionicons name={ic} size={16} color={tab === k ? '#fff' : '#1565c0'} />
            <Text style={[st.tabTxt, tab === k && { color: '#fff' }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
        {tab === 'upload' ? (
          years.length ? <ResultsUploadWizard years={years} faculties={fullFacs} departments={filterDepartments(departments)} restrictedFaculty={restricted && !fullFacs.length} onDone={() => {}} />
            : <ActivityIndicator />
        ) : (
          <>
            <View style={rs.card}>
              {myFacs.length > 1 && <ChipRow label="الكلية" options={myFacs} value={f.faculty_id} onChange={(v) => setF({ ...f, faculty_id: v, department_id: '' })} testPrefix="flt-fac" allLabel="الكل" />}
              <ChipRow label="القسم" options={myDeps} value={f.department_id} onChange={(v) => setF({ ...f, department_id: v })} testPrefix="flt-dep" allLabel="الكل" />
              <ChipRow label="المستوى الحالي" options={LEVELS} value={f.level} onChange={(v) => setF({ ...f, level: v })} testPrefix="flt-level" allLabel="الكل" />
              <ChipRow label="السنة الدراسية (لعدّ الفصول الصادرة)" options={years.map((y) => ({ id: y, name: y }))} value={f.academic_year} onChange={(v) => setF({ ...f, academic_year: v })} testPrefix="flt-year" allLabel="كل السنوات" />
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                <TextInput style={[rs.input, { flex: 1 }]} value={f.q} onChangeText={(t) => setF({ ...f, q: t })} onSubmitEditing={() => load(1)} placeholder="بحث بالاسم أو رقم القيد..." testID="flt-search-input" />
                <TouchableOpacity style={[rs.btn, { backgroundColor: '#455a64' }]} onPress={() => load(1)} testID="flt-search-btn"><Ionicons name="search" size={18} color="#fff" /></TouchableOpacity>
              </View>
            </View>
            {err ? <Text style={{ color: '#c62828', textAlign: 'right' }} testID="results-error">{err}</Text> : null}
            {!loading && <Text style={st.count} testID="results-total">عدد الطلاب: {data.total}</Text>}
            {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : data.items.length === 0 ? (
              <Text style={st.empty} testID="results-empty">لا يوجد طلاب بهذه الفلاتر</Text>
            ) : data.items.map((s) => (
              <TouchableOpacity key={s.id} style={[rs.card, st.row]} onPress={() => setOpenId(s.id)} testID={`results-student-${s.id}`}>
                <View style={[st.pill, { backgroundColor: s.released_count ? '#e8f5e9' : '#f1f5f9' }]}>
                  <Text style={{ color: s.released_count ? '#2e7d32' : '#64748b', fontWeight: '800', fontSize: 12 }}>{s.released_count} فصل صادر</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={rs.title}>{s.full_name}</Text>
                  <Text style={{ color: '#64748b', fontSize: 12, textAlign: 'right' }}>{s.reg_no} · {s.department_name} · المستوى {s.level ?? '—'}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {data.pages > 1 && (
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'center', gap: 12, marginTop: 6 }}>
                <TouchableOpacity disabled={page <= 1} onPress={() => load(page - 1)} testID="results-prev-page"><Text style={{ color: page <= 1 ? '#cbd5e1' : '#1565c0' }}>السابق</Text></TouchableOpacity>
                <Text testID="results-page">{page} / {data.pages}</Text>
                <TouchableOpacity disabled={page >= data.pages} onPress={() => load(page + 1)} testID="results-next-page"><Text style={{ color: page >= data.pages ? '#cbd5e1' : '#1565c0' }}>التالي</Text></TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
      {openId && <StudentResultsCard studentId={openId} years={years} onClose={() => { setOpenId(null); load(page); }} />}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  title: { fontSize: 17, fontWeight: '800', color: '#1a2540' },
  tabs: { flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  tab: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: '#1565c0', backgroundColor: '#fff' },
  tabOn: { backgroundColor: '#1565c0' },
  tabTxt: { color: '#1565c0', fontWeight: '700' },
  count: { fontSize: 12, color: '#64748b', textAlign: 'right', marginVertical: 6 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 20 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
});
