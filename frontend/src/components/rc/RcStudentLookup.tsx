import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';

type Match = { id: string; name: string; reg_no: string; level: number; section: string; department_name: string; status: string };
const v = (x: any) => (x === null || x === undefined || x === '' ? '—' : String(x));
const RES_C: Record<string, string> = { 'ناجح': '#2e7d32', 'راسب': '#c62828' };

export const RcStudentLookup = ({ semesterId, onOpenCourse, onClose }: { semesterId: string; onOpenCourse: (cid: string) => void; onClose: () => void }) => {
  const [q, setQ] = useState(''); const [matches, setMatches] = useState<Match[]>([]); const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => {
    if (data || q.trim().length < 2) { setMatches([]); return; }
    const t = setTimeout(() => api.get('/rc/student-lookup', { params: { q } }).then((r) => setMatches(r.data.matches || [])).catch(() => setMatches([])), 300);
    return () => clearTimeout(t);
  }, [q, data]);
  const pick = async (m: Match) => {
    setBusy(true); setErr('');
    try { setData((await api.get('/rc/student-lookup', { params: { student_db_id: m.id, semester_id: semesterId } })).data); } catch (e: any) { setErr(e?.response?.data?.detail || 'تعذر جلب بيانات الطالب'); } finally { setBusy(false); }
  };
  const cols = ['المقرر', 'السعي', 'الدور الأول', 'الدور الثاني', 'الاستثنائي', 'الغياب', 'الأهلية', 'الدرجة', 'النتيجة'];
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.box} testID="rc-lookup-modal">
          <View style={s.head}>
            <Text style={s.title}>🔎 الاستعلام عن طالب</Text>
            <TouchableOpacity onPress={onClose} testID="rc-lookup-close"><Ionicons name="close" size={22} color="#475569" /></TouchableOpacity>
          </View>
          {!data ? (
            <>
              <View style={s.search}>
                <Ionicons name="search" size={16} color="#8a95a8" />
                <TextInput autoFocus style={s.input} value={q} onChangeText={setQ} placeholder="اكتب اسم الطالب أو رقم قيده" placeholderTextColor="#94a3b8" testID="rc-lookup-input" />
              </View>
              {q.trim().length >= 2 && matches.length === 0 && <Text style={s.muted} testID="rc-lookup-empty">لا يوجد طالب مطابق ضمن نطاقك</Text>}
              <ScrollView style={{ maxHeight: 380 }}>
                {matches.map((m) => (
                  <TouchableOpacity key={m.id} style={s.match} onPress={() => pick(m)} testID={`rc-lookup-match-${m.id}`}>
                    <Text style={s.mName}>{m.name}</Text>
                    <Text style={s.muted}>{m.reg_no} · المستوى {v(m.level)}{m.section ? ` · ${m.section}` : ''} · {m.department_name}{m.status === 'repeat' ? ' · إعادة' : ''}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {busy && <ActivityIndicator style={{ marginTop: 10 }} />}
            </>
          ) : (
            <>
              <View style={s.stuHead} testID="rc-lookup-student">
                <TouchableOpacity onPress={() => setData(null)} style={s.back} testID="rc-lookup-back"><Ionicons name="arrow-forward" size={16} color="#1a2540" /><Text style={{ fontWeight: '700' }}>طالب آخر</Text></TouchableOpacity>
                <Text style={s.mName}>{data.student.name}</Text>
                <Text style={s.muted}>رقم القيد {data.student.reg_no} · المستوى {v(data.student.level)}{data.student.section ? ` · ${data.student.section}` : ''}</Text>
              </View>
              {!!data.note && <Text style={[s.muted, { color: '#c62828', fontWeight: '700' }]}>{data.note}</Text>}
              {data.rows.length === 0 ? <Text style={s.muted} testID="rc-lookup-no-courses">لا توجد مقررات للطالب في هذا الفصل ضمن نطاقك</Text> : (
                <ScrollView horizontal style={{ maxHeight: 420 }}>
                  <View>
                    <View style={[s.row, { backgroundColor: '#f1f5f9' }]}>{cols.map((c, i) => <Text key={c} style={[s.cell, i === 0 && s.first, { fontWeight: '800' }]}>{c}</Text>)}</View>
                    <ScrollView style={{ maxHeight: 380 }}>
                      {data.rows.map((r: any) => (
                        <TouchableOpacity key={r.course_id} style={s.row} onPress={() => onOpenCourse(r.course_id)} testID={`rc-lookup-row-${r.course_id}`}>
                          <Text style={[s.cell, s.first]} numberOfLines={2}>{r.name}{r.section ? ` (${r.section})` : ''}</Text>
                          <Text style={s.cell}>{v(r.coursework)}</Text><Text style={s.cell}>{v(r.first_exam)}</Text><Text style={s.cell}>{v(r.second_exam)}</Text><Text style={s.cell}>{v(r.exceptional_exam)}</Text>
                          <Text style={s.cell}>{r.att_pct != null ? `${r.att_pct}% · ${r.att_outcome_ar || ''}` : '—'}</Text>
                          <Text style={s.cell}>{v(r.eligibility)}</Text>
                          <Text style={[s.cell, { fontWeight: '800' }]}>{v(r.final)}{r.letter ? ` (${r.letter})` : ''}</Text>
                          <Text style={[s.cell, { fontWeight: '800', color: RES_C[r.result] || '#ef6c00' }]}>{v(r.result)}{r.stage_label && r.result === 'ناجح' ? ` · ${r.stage_label}` : ''}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </ScrollView>
              )}
              <Text style={[s.muted, { marginTop: 6 }]}>اضغط على أي مقرر لفتح كشفه.</Text>
            </>
          )}
          {!!err && <Text style={{ color: '#c62828', marginTop: 6 }} testID="rc-lookup-error">{err}</Text>}
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  box: { backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '100%', maxWidth: 1100, maxHeight: '90%' as any },
  head: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '800', color: '#1a2540' },
  search: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, marginBottom: 8 },
  input: { flex: 1, paddingVertical: 9, textAlign: 'right', fontSize: 14, outlineStyle: 'none' as any },
  match: { paddingVertical: 9, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: '#eef0f3' },
  mName: { fontWeight: '800', color: '#1a2540', textAlign: 'right', fontSize: 14 },
  muted: { color: '#64748b', fontSize: 12, textAlign: 'right', marginTop: 2 },
  stuHead: { borderBottomWidth: 1, borderColor: '#eef0f3', paddingBottom: 8, marginBottom: 8 },
  back: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginBottom: 4 },
  row: { flexDirection: 'row-reverse', borderBottomWidth: 1, borderColor: '#eef0f3' },
  cell: { width: 100, paddingVertical: 8, paddingHorizontal: 4, fontSize: 12.5, textAlign: 'center', color: '#1a2540' },
  first: { width: 220, textAlign: 'right' },
});
