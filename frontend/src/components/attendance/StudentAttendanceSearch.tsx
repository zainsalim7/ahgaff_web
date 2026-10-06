import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import api, { attendanceAPI } from '../../services/api';
import { formatGregorianDate } from '../../utils/dateUtils';
import { StatusEditPill, ATT_STATUS_META } from './StatusEditPill';
import { DateField } from './AttendanceFilterBar';

type Rec = { id: string; course_id: string; lecture_id?: string | null; course_name: string; status: string; date: string; start_time?: string; end_time?: string };
type Hit = { id: string; title: string; subtitle: string };
const STATUS_CHIPS = [{ k: '', l: 'الكل' }, { k: 'absent', l: 'غائب' }, { k: 'present', l: 'حاضر' }, { k: 'late', l: 'متأخر' }, { k: 'excused', l: 'بعذر' }];

export const StudentAttendanceSearch = ({ canEdit, initialDate }: { canEdit: boolean; initialDate?: string }) => {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [student, setStudent] = useState<Hit | null>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('absent');
  const [from, setFrom] = useState(initialDate || '');
  const [to, setTo] = useState(initialDate || '');

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2 || student) { setHits([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try { const r = await api.get('/search', { params: { q: s, types: 'students', limit_per_type: 10 } }); setHits(r.data?.results?.students || r.data?.students || []); }
      catch { setHits([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, student]);

  const pick = async (h: Hit) => {
    setStudent(h); setQ(h.title); setHits([]); setLoading(true);
    try { const r = await attendanceAPI.getStudentAttendance(h.id); setRecs(r.data || []); } catch { setRecs([]); } finally { setLoading(false); }
  };
  const reset = () => { setStudent(null); setQ(''); setRecs([]); };

  const filtered = useMemo(() => recs.filter((r) => {
    const d = (r.date || '').slice(0, 10);
    return (!status || r.status === status) && (!from || d >= from) && (!to || d <= to);
  }), [recs, status, from, to]);
  const byCourse = useMemo(() => {
    const m: Record<string, { name: string; items: Rec[] }> = {};
    filtered.forEach((r) => { (m[r.course_id] ||= { name: r.course_name, items: [] }).items.push(r); });
    return Object.entries(m);
  }, [filtered]);
  const onChanged = (id: string, s: string) => setRecs((p) => p.map((r) => (r.id === id ? { ...r, status: s } : r)));

  return (
    <View style={st.wrap} testID="student-att-search">
      <View style={st.searchRow}>
        <Ionicons name="person-circle-outline" size={18} color="#8a95a8" />
        <TextInput value={q} onChangeText={(v) => { setQ(v); if (student) setStudent(null); }} placeholder="ابحث عن طالب بالاسم أو رقم القيد..." placeholderTextColor="#a8b1c2" style={st.input} testID="student-att-search-input" />
        {searching ? <ActivityIndicator size="small" color="#1565c0" /> : !!q && <TouchableOpacity onPress={reset} testID="student-att-search-clear"><Ionicons name="close-circle" size={16} color="#8a95a8" /></TouchableOpacity>}
      </View>
      {hits.length > 0 && (
        <View style={st.hits} testID="student-att-hits">
          {hits.map((h) => (
            <TouchableOpacity key={h.id} onPress={() => pick(h)} style={st.hit} testID={`student-att-hit-${h.id}`}>
              <Text style={st.hitTitle}>{h.title}</Text>
              <Text style={st.hitSub}>{h.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {student && (
        <>
          <View style={st.filters}>
            <View style={st.chips}>
              {STATUS_CHIPS.map((c) => {
                const on = status === c.k; const col = c.k ? ATT_STATUS_META[c.k].color : '#0f2440';
                return (
                  <TouchableOpacity key={c.k} onPress={() => setStatus(c.k)} style={[st.chip, on && { backgroundColor: col, borderColor: col }]} testID={`student-att-status-${c.k || 'all'}`}>
                    <Text style={[st.chipText, { color: on ? '#fff' : col }]}>{c.l}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={st.dates}>
              <DateField label="من" value={from} onChange={setFrom} testID="student-att-from" />
              <DateField label="إلى" value={to} onChange={setTo} testID="student-att-to" />
              {(from || to) && <TouchableOpacity onPress={() => { setFrom(''); setTo(''); }} testID="student-att-dates-clear"><Text style={st.clear}>كل التواريخ</Text></TouchableOpacity>}
            </View>
          </View>
          <Text style={st.summary} testID="student-att-summary">{student.title} — {filtered.length} سجل في {byCourse.length} مقرر{canEdit ? ' · اضغط الحالة لتعديلها' : ''}</Text>
          {loading ? <ActivityIndicator color="#1565c0" style={{ marginTop: 16 }} /> : byCourse.length === 0 ? (
            <Text style={st.empty}>لا توجد سجلات مطابقة — جرّب تغيير الحالة أو التاريخ</Text>
          ) : byCourse.map(([cid, g]) => (
            <View key={cid} style={st.course} testID={`student-att-course-${cid}`}>
              <View style={st.courseHead}>
                <Ionicons name="book" size={14} color="#1565c0" />
                <Text style={st.courseName}>{g.name}</Text>
                <Text style={st.courseCount}>{g.items.length}</Text>
              </View>
              {g.items.map((r) => (
                <View key={r.id} style={st.row}>
                  <StatusEditPill recordId={r.id} status={r.status} editable={canEdit} size="sm" title={`${r.course_name} · ${formatGregorianDate(new Date(r.date))}`} onChanged={(s) => onChanged(r.id, s)} />
                  <Text style={st.rowDate}>{formatGregorianDate(new Date(r.date))}{r.start_time ? ` · ${r.start_time}-${r.end_time}` : ''}</Text>
                  {!!r.lecture_id && (
                    <TouchableOpacity onPress={() => router.push({ pathname: '/take-attendance', params: { lectureId: r.lecture_id, courseId: r.course_id, courseName: r.course_name } } as any)} style={st.openBtn} testID={`student-att-open-${r.id}`}>
                      <Ionicons name="open-outline" size={12} color="#1565c0" />
                      <Text style={st.openText}>المحاضرة</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          ))}
        </>
      )}
      {!student && hits.length === 0 && <Text style={st.hint}>اكتب اسم الطالب أو رقم قيده، ثم فلتر بالحالة والتاريخ لعرض مقرراته التي سُجّل فيها حضور أو غياب</Text>}
    </View>
  );
};

const st = StyleSheet.create({
  wrap: { gap: 10 },
  searchRow: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 10, height: 42, gap: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  input: { flex: 1, fontSize: 14, color: '#0f2440', textAlign: 'right' },
  hits: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  hit: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  hitTitle: { fontSize: 13.5, fontWeight: '700', color: '#0f2440', textAlign: 'right' },
  hitSub: { fontSize: 11, color: '#5b6678', textAlign: 'right', marginTop: 2 },
  filters: { backgroundColor: '#fff', borderRadius: 10, padding: 10, gap: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: '#cfd6e1', backgroundColor: '#fff' },
  chipText: { fontSize: 12, fontWeight: '800' },
  dates: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  clear: { fontSize: 11.5, color: '#1565c0', fontWeight: '700' },
  summary: { fontSize: 12, color: '#5b6678', textAlign: 'right' },
  empty: { fontSize: 13, color: '#8a95a8', textAlign: 'center', padding: 24 },
  hint: { fontSize: 12.5, color: '#8a95a8', textAlign: 'center', padding: 24, lineHeight: 20 },
  course: { backgroundColor: '#fff', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#e2e8f0', gap: 6 },
  courseHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 4 },
  courseName: { flex: 1, fontSize: 14, fontWeight: '800', color: '#0f2440', textAlign: 'right' },
  courseCount: { fontSize: 11.5, fontWeight: '800', color: '#1565c0', backgroundColor: '#e3f2fd', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#f7f9fc', borderRadius: 8, padding: 8 },
  rowDate: { flex: 1, fontSize: 12, color: '#5b6678', textAlign: 'right' },
  openBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#e3f2fd' },
  openText: { fontSize: 11, fontWeight: '700', color: '#1565c0' },
});
