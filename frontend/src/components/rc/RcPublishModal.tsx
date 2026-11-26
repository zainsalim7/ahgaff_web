import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { ModalShell, PickerField, SEMS } from '../results/resultsUi';
import { Btn, Msg, Badge, confirmBox, rc } from './rcUi';

export const RcPublishModal = ({ departmentId, departmentName, level, semesterId, defaultTerm, years, onClose }: {
  departmentId: string; departmentName: string; level: string; semesterId: string; defaultTerm: string; years: string[]; onClose: () => void;
}) => {
  const [courses, setCourses] = useState<any[] | null>(null);
  const [p, setP] = useState({ semester_no: ['1', '2'].includes(defaultTerm) ? defaultTerm : '', academic_year: years[0] || '', notify: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    api.get('/rc/publish/preview', { params: { department_id: departmentId, level, semester_id: semesterId } })
      .then((r) => setCourses(r.data.courses)).catch((e) => setMsg({ ok: false, text: e?.response?.data?.detail || 'تعذر الجلب' }));
  }, [departmentId, level, semesterId]);
  const unlocked = (courses || []).filter((c) => !c.locked).length;
  const pending = (courses || []).reduce((a, c) => a + (c.pending || 0), 0);

  const go = async () => {
    if (!(await confirmBox(`اعتماد نتائج ${departmentName} · المستوى ${level} ونقلها إلى «النتائج» كمسودة مخفية؟`))) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.post('/rc/publish', { department_id: departmentId, level: Number(level), semester_id: semesterId, ...p, semester_no: Number(p.semester_no) });
      setMsg({ ok: true, text: r.data.message });
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشل الاعتماد' }); } finally { setBusy(false); }
  };
  return (
    <ModalShell title={`اعتماد ونقل إلى النتائج · ${departmentName} · المستوى ${level}`} icon="checkmark-done-outline" onClose={onClose} testID="rc-publish-modal">
      <Text style={[rc.td, { color: '#475569', marginBottom: 10 }]}>يُبنى لكل طالب بيان درجات الفصل (الدرجة النهائية والتقدير وشارة الدور لكل مقرر) ونتيجة الفصل، ويُحفظ في صفحة «النتائج» كمسودة مخفية. لا يراه الطلاب حتى تضغط «نشر للطلاب» من «سجل العمليات».</Text>
      <Msg m={msg} testID="rc-publish-msg" />
      {courses && courses.map((c) => (
        <View key={c.id} style={rc.tr} testID={`rc-pub-course-${c.id}`}>
          <Text style={[rc.td, { flex: 2, fontWeight: '700' }]}>{c.name}</Text>
          <Text style={[rc.td, { flex: 0.7 }]}>{c.credits || '—'} س</Text>
          <Text style={[rc.td, { flex: 2, fontSize: 12 }]}>ناجح {c.passed} · راسب {c.failed} · معلّق {c.pending}</Text>
          <View style={{ flex: 1 }}><Badge text={c.locked ? 'السعي مقفل' : 'السعي غير مقفل'} color={c.locked ? '#2e7d32' : '#c62828'} /></View>
        </View>
      ))}
      {!!unlocked && <Text style={{ color: '#c62828', textAlign: 'right', marginTop: 8 }} testID="rc-pub-unlocked-warn">يجب إقفال السعي في كل المقررات أولاً ({unlocked} غير مقفل)</Text>}
      {!!pending && !unlocked && <Text style={{ color: '#ef6c00', textAlign: 'right', marginTop: 8 }} testID="rc-pub-pending-warn">تنبيه: {pending} نتيجة معلّقة (بانتظار دور) ستظهر للطالب «بانتظار…» حتى تعيد الاعتماد بعد رصدها</Text>}
      <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <PickerField label="الفصل" options={SEMS} value={p.semester_no} onChange={(semester_no) => setP({ ...p, semester_no })} testID="rc-pub-sem" maxWidth={180} />
        <PickerField label="السنة الدراسية" options={years.map((y) => ({ id: y, name: y }))} value={p.academic_year} onChange={(academic_year) => setP({ ...p, academic_year })} testID="rc-pub-year" maxWidth={200} />
      </View>
      <TouchableOpacity style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginVertical: 10 }} onPress={() => setP({ ...p, notify: !p.notify })} testID="rc-pub-notify-toggle">
        <Ionicons name={p.notify ? 'checkbox' : 'square-outline'} size={20} color="#1565c0" />
        <Text style={rc.td}>عند النشر: إشعار الطلاب الذين أُضيفت أو تغيّرت نتيجتهم</Text>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row-reverse' }}>
        <Btn icon="checkmark-done" label="اعتماد كمسودة" color="#2e7d32" onPress={go} disabled={busy || !courses || !!unlocked || !p.semester_no || !p.academic_year} testID="rc-publish-btn" />
      </View>
    </ModalShell>
  );
};
