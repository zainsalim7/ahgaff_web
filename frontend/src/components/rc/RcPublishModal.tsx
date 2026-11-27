import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { ModalShell, PickerField, SEMS } from '../results/resultsUi';
import { Btn, Msg, Badge, confirmBox, rc } from './rcUi';

export const RcPublishModal = ({ departmentId, departmentName, level, semesterId, defaultTerm, years, preselect, onClose }: {
  departmentId: string; departmentName: string; level: string; semesterId: string; defaultTerm: string; years: string[]; preselect?: string; onClose: () => void;
}) => {
  const [courses, setCourses] = useState<any[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [p, setP] = useState({ semester_no: ['1', '2'].includes(defaultTerm) ? defaultTerm : '', academic_year: years[0] || '', notify: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    api.get('/rc/publish/preview', { params: { department_id: departmentId, level, semester_id: semesterId } })
      .then((r) => {
        const cs = r.data.courses as any[];
        setCourses(cs);
        setSel(new Set(cs.filter((c) => c.locked && (!preselect || c.id === preselect || c.approved)).map((c) => c.id)));
      }).catch((e) => setMsg({ ok: false, text: e?.response?.data?.detail || 'تعذر الجلب' }));
  }, [departmentId, level, semesterId]);
  const picked = (courses || []).filter((c) => sel.has(c.id));
  const unlocked = (courses || []).filter((c) => !c.locked).length;
  const pending = picked.reduce((a, c) => a + (c.pending || 0), 0);
  const partial = !!courses && picked.length < courses.length;
  const toggle = (c: any) => {
    if (!c.locked || c.approved) return;
    const n = new Set(sel); n.has(c.id) ? n.delete(c.id) : n.add(c.id); setSel(n);
  };

  const go = async () => {
    if (!(await confirmBox(`اعتماد ${picked.length} من ${courses?.length} مقرر لـ ${departmentName} · المستوى ${level} ونقلها إلى «النتائج» كمسودة مخفية؟${partial ? '\nبقية المقررات تظهر للطالب «لم تصدر بعد» ولا يُحسب المعدل حتى تكتمل.' : ''}`))) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.post('/rc/publish', { department_id: departmentId, level: Number(level), semester_id: semesterId, ...p, semester_no: Number(p.semester_no), course_ids: [...sel] });
      setMsg({ ok: true, text: r.data.message });
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشل الاعتماد' }); } finally { setBusy(false); }
  };
  return (
    <ModalShell title={`اعتماد ونقل إلى النتائج · ${departmentName} · المستوى ${level}`} icon="checkmark-done-outline" onClose={onClose} testID="rc-publish-modal">
      <Text style={[rc.td, { color: '#475569', marginBottom: 10 }]}>يُبنى لكل طالب بيان درجات الفصل (الدرجة النهائية والتقدير وشارة الدور لكل مقرر) ونتيجة الفصل، ويُحفظ في صفحة «النتائج» كمسودة مخفية. لا يراه الطلاب حتى تضغط «نشر للطلاب» من «سجل العمليات».</Text>
      <Msg m={msg} testID="rc-publish-msg" />
      <Text style={[rc.td, { color: '#1565c0', fontWeight: '700', marginBottom: 6 }]}>اختر المقررات الجاهزة للاعتماد (اعتماد جزئي مسموح):</Text>
      {courses && courses.map((c) => {
        const on = sel.has(c.id);
        return (
          <TouchableOpacity key={c.id} style={[rc.tr, { opacity: c.locked ? 1 : 0.6 }]} onPress={() => toggle(c)} disabled={!c.locked || c.approved} testID={`rc-pub-course-${c.id}`}>
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={c.locked ? '#2e7d32' : '#94a3b8'} />
            <Text style={[rc.td, { flex: 2, fontWeight: '700' }]}>{c.name}</Text>
            <Text style={[rc.td, { flex: 0.7 }]}>{c.credits || '—'} س</Text>
            <Text style={[rc.td, { flex: 2, fontSize: 12 }]}>ناجح {c.passed} · راسب {c.failed} · معلّق {c.pending}</Text>
            <View style={{ flex: 1.2 }}><Badge text={c.approved ? 'معتمد سابقاً' : c.locked ? 'السعي مقفل' : 'السعي غير مقفل'} color={c.approved ? '#1565c0' : c.locked ? '#2e7d32' : '#c62828'} /></View>
          </TouchableOpacity>
        );
      })}
      {!!unlocked && <Text style={{ color: '#64748b', textAlign: 'right', marginTop: 8, fontSize: 12 }} testID="rc-pub-unlocked-warn">{unlocked} مقرر لم يُقفل سعيه — لا يمكن اختياره حتى يُقفل، ويظهر للطالب «لم تصدر بعد»</Text>}
      {partial && !!picked.length && <Text style={{ color: '#ef6c00', textAlign: 'right', marginTop: 6, fontSize: 12.5 }} testID="rc-pub-partial-warn">اعتماد جزئي: {picked.length} من {courses?.length} مقرر — لا يُحسب المعدل الفصلي حتى تُعتمد كل المقررات. المقررات المعتمدة سابقاً تبقى في البيان تلقائياً.</Text>}
      {!!pending && <Text style={{ color: '#ef6c00', textAlign: 'right', marginTop: 6 }} testID="rc-pub-pending-warn">تنبيه: {pending} نتيجة معلّقة (بانتظار دور) ستظهر للطالب «بانتظار…» حتى تعيد الاعتماد بعد رصدها</Text>}
      <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <PickerField label="الفصل" options={SEMS} value={p.semester_no} onChange={(semester_no) => setP({ ...p, semester_no })} testID="rc-pub-sem" maxWidth={180} />
        <PickerField label="السنة الدراسية" options={years.map((y) => ({ id: y, name: y }))} value={p.academic_year} onChange={(academic_year) => setP({ ...p, academic_year })} testID="rc-pub-year" maxWidth={200} />
      </View>
      {!['1', '2'].includes(defaultTerm) && <Text style={{ color: '#64748b', fontSize: 12, textAlign: 'right', marginTop: 4 }} testID="rc-pub-term-hint">الفصل المختار ليس أولاً أو ثانياً (مثل الصيفي) — حدّد في أي فصل تُسجَّل النتيجة في صفحة النتائج</Text>}
      <TouchableOpacity style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginVertical: 10 }} onPress={() => setP({ ...p, notify: !p.notify })} testID="rc-pub-notify-toggle">
        <Ionicons name={p.notify ? 'checkbox' : 'square-outline'} size={20} color="#1565c0" />
        <Text style={rc.td}>عند النشر: إشعار الطلاب الذين أُضيفت أو تغيّرت نتيجتهم</Text>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row-reverse' }}>
        <Btn icon="checkmark-done" label={partial ? `اعتماد ${picked.length} مقرر كمسودة` : 'اعتماد كمسودة'} color="#2e7d32" onPress={go} disabled={busy || !picked.length || !p.semester_no || !p.academic_year} testID="rc-publish-btn" />
      </View>
    </ModalShell>
  );
};
