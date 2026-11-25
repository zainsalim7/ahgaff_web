import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, Modal, ScrollView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { rs, val } from './resultsUi';

interface Entry { id: string; level: number; semester: number; academic_year: string | null; status: string | null; gpa: string | null; grade: string | null; updated_by_name?: string }
interface Card { student: { id: string; reg_no: string; full_name: string; level: number; department_name: string }; max_level: number; entries: Entry[] }

const yKey = (y: string | null) => Math.max(0, ...((y || '').match(/\d{4}/g) || []).map(Number));
const confirmBox = async (msg: string) => Platform.OS === 'web' ? window.confirm(msg)
  : new Promise<boolean>((r) => Alert.alert('تأكيد', msg, [{ text: 'إلغاء', onPress: () => r(false) }, { text: 'نعم', onPress: () => r(true) }]));

const EditForm = ({ init, years, onSave, onCancel }: any) => {
  const [f, setF] = useState({ academic_year: init.id ? (init.academic_year || '') : (years[0] || ''), status: init.status || '', gpa: init.gpa || '', grade: init.grade || '' });
  return (
    <View style={{ gap: 6, marginTop: 6 }} testID="result-edit-form">
      {(['academic_year', 'status', 'gpa', 'grade'] as const).map((k) => (
        <TextInput key={k} style={rs.input} value={f[k]} onChangeText={(t) => setF({ ...f, [k]: t })} testID={`result-edit-${k}`}
          placeholder={{ academic_year: 'السنة الدراسية (مثل 2025-2026)', status: 'الحالة', gpa: 'المعدل', grade: 'التقدير' }[k]} />
      ))}
      <View style={{ flexDirection: 'row-reverse', gap: 6 }}>
        <TouchableOpacity style={[rs.btn, { flex: 1, backgroundColor: '#2e7d32' }]} onPress={() => onSave(f)} testID="result-edit-save"><Text style={rs.btnTxt}>حفظ</Text></TouchableOpacity>
        <TouchableOpacity style={[rs.btn, { flex: 1, backgroundColor: '#78909c' }]} onPress={onCancel} testID="result-edit-cancel"><Text style={rs.btnTxt}>إلغاء</Text></TouchableOpacity>
      </View>
    </View>
  );
};

const SemBox = ({ level, sem, list, years, onSave, onDelete }: any) => {
  const [edit, setEdit] = useState(false);
  const sorted = [...list].sort((a: Entry, b: Entry) => yKey(b.academic_year) - yKey(a.academic_year));
  const cur: Entry | undefined = sorted[0];
  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#e2e8f0' }} testID={`card-L${level}-S${sem}`}>
      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontWeight: '700', color: '#475569', fontSize: 12.5 }}>{sem === 1 ? 'الفصل الأول' : 'الفصل الثاني'}</Text>
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          <TouchableOpacity onPress={() => setEdit(!edit)} testID={`card-edit-L${level}-S${sem}`}><Ionicons name="create-outline" size={17} color="#1565c0" /></TouchableOpacity>
          {cur && <TouchableOpacity onPress={() => onDelete(cur)} testID={`card-delete-L${level}-S${sem}`}><Ionicons name="trash-outline" size={17} color="#c62828" /></TouchableOpacity>}
        </View>
      </View>
      {cur ? (
        <Text style={{ color: '#1a2540', fontWeight: '700', textAlign: 'right', marginTop: 4 }} testID={`card-value-L${level}-S${sem}`}>
          {val(cur.status)} · {val(cur.gpa)} · {val(cur.grade)}{cur.academic_year ? `  (${cur.academic_year})` : ''}
        </Text>
      ) : <Text style={{ color: '#94a3b8', textAlign: 'right', marginTop: 4 }}>لم تصدر بعد</Text>}
      {sorted.slice(1).map((o: Entry) => (
        <Text key={o.id} style={{ color: '#94a3b8', fontSize: 11.5, textAlign: 'right' }}>سابقاً ({o.academic_year || 'بلا سنة'}): {val(o.status)} · {val(o.gpa)} · {val(o.grade)}</Text>
      ))}
      {edit && <EditForm init={cur || {}} years={years} onCancel={() => setEdit(false)}
        onSave={async (f: any) => { await onSave(level, sem, f); setEdit(false); }} />}
    </View>
  );
};

export const StudentResultsCard = ({ studentId, years, onClose }: { studentId: string; years: string[]; onClose: () => void }) => {
  const [card, setCard] = useState<Card | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try { setCard((await api.get(`/results/students/${studentId}`)).data); }
    catch (e: any) { setErr(e?.response?.data?.detail || 'تعذر جلب البطاقة'); }
  }, [studentId]);
  useEffect(() => { load(); }, [load]);

  const save = async (level: number, semester: number, f: any) => {
    try { await api.post('/results/entries', { student_id: studentId, level, semester, ...f }); await load(); }
    catch (e: any) { setErr(e?.response?.data?.detail || 'فشل الحفظ'); }
  };
  const del = async (e: Entry) => {
    if (!(await confirmBox(`حذف نتيجة المستوى ${e.level} — ${e.semester === 1 ? 'الفصل الأول' : 'الفصل الثاني'}${e.academic_year ? ` (${e.academic_year})` : ''}؟`))) return;
    try { await api.delete(`/results/entries/${e.id}`); await load(); } catch (x: any) { setErr(x?.response?.data?.detail || 'فشل الحذف'); }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 14, maxHeight: '92%', width: '100%', maxWidth: 760, alignSelf: 'center' }} testID="student-results-card">
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: '#e5e7eb' }}>
            <Text style={rs.title}>{card ? `${card.student.full_name} · ${card.student.reg_no}` : 'بطاقة النتائج'}</Text>
            <TouchableOpacity onPress={onClose} testID="student-card-close"><Ionicons name="close" size={22} color="#334155" /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 12 }}>
            {err ? <Text style={{ color: '#c62828', textAlign: 'right', marginBottom: 8 }} testID="student-card-error">{err}</Text> : null}
            {!card ? <ActivityIndicator /> : (
              <>
                <Text style={{ color: '#64748b', textAlign: 'right', marginBottom: 10 }}>{card.student.department_name} · المستوى الحالي {card.student.level ?? '—'}</Text>
                {Array.from({ length: card.max_level }, (_, i) => i + 1).map((lvl) => (
                  <View key={lvl} style={{ marginBottom: 10 }} testID={`card-level-${lvl}`}>
                    <Text style={[rs.title, { marginBottom: 6 }]}>المستوى {lvl}</Text>
                    <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                      {[1, 2].map((sem) => (
                        <SemBox key={sem} level={lvl} sem={sem} years={years} onSave={save} onDelete={del}
                          list={card.entries.filter((e) => e.level === lvl && e.semester === sem)} />
                      ))}
                    </View>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};
