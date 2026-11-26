import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { ModalShell, PickerField } from '../results/resultsUi';
import { RcRow, Btn, Msg, confirmBox, rc } from './rcUi';
import { DecKind } from './RcMarksTable';

export const RcDecisionModal = ({ courseId, row, kind, cap, onClose, onDone }: { courseId: string; row: RcRow; kind: DecKind; cap: number; onClose: () => void; onDone: () => void }) => {
  const existing = row.decisions[kind];
  const [sessions, setSessions] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState({ reason: '', session_id: '', capped: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { api.get('/rc/board-sessions').then((r) => setSessions(r.data.items.map((s: any) => ({ id: s.id, name: s.label })))).catch(() => {}); }, []);
  const title = kind === 'exceptional' ? 'قرار مجلس الكلية: دخول الدور الاستثنائي (التصفية)' : 'قرار مجلس الكلية: احتساب درجة الدور الثاني كاملة';

  const save = async () => {
    setBusy(true); setMsg(null);
    try { await api.post(`/rc/courses/${courseId}/decisions`, { student_db_id: row.student_db_id, kind, ...f }); onDone(); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشل الحفظ' }); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await confirmBox('إلغاء هذا القرار؟'))) return;
    try { await api.delete(`/rc/courses/${courseId}/decisions/${row.student_db_id}/${kind}`); onDone(); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشل الإلغاء' }); }
  };
  return (
    <ModalShell title={title} icon="business-outline" onClose={onClose} testID="rc-decision-modal">
      <Text style={[rc.td, { fontWeight: '800', marginBottom: 10 }]}>{row.name} · {row.reg_no}</Text>
      <Msg m={msg} testID="rc-decision-msg" />
      {existing ? (
        <View testID="rc-decision-existing">
          <Text style={rc.td}>القرار: {kind === 'exceptional' ? (existing.capped ? `دخول التصفية بسقف ${cap}` : 'دخول التصفية بلا سقف') : 'تُحتسب درجة الدور الثاني كاملة'}</Text>
          <Text style={rc.td}>السبب: {existing.reason}</Text>
          {!!existing.session_label && <Text style={rc.td}>{existing.session_label}</Text>}
          <Text style={[rc.td, { color: '#94a3b8', fontSize: 12, marginBottom: 12 }]}>بواسطة {existing.decided_by_name}</Text>
          <Btn icon="trash-outline" label="إلغاء القرار" color="#c62828" onPress={remove} testID="rc-decision-delete-btn" />
        </View>
      ) : (
        <View>
          <Text style={[rc.th, { marginBottom: 4 }]}>سبب القرار (إلزامي)</Text>
          <TextInput style={[rc.input, { width: '100%', height: 70, textAlign: 'right', padding: 8 }]} multiline value={f.reason} onChangeText={(reason) => setF({ ...f, reason })}
            placeholder="مثال: ظرف صحي موثّق" testID="rc-decision-reason" />
          {sessions.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <PickerField label="جلسة المجلس (اختياري)" options={sessions} value={f.session_id} onChange={(session_id) => setF({ ...f, session_id })} testID="rc-decision-session" placeholder="بدون" />
            </View>
          )}
          {kind === 'exceptional' && (
            <TouchableOpacity style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 12 }} onPress={() => setF({ ...f, capped: !f.capped })} testID="rc-decision-capped-toggle">
              <Ionicons name={f.capped ? 'checkbox' : 'square-outline'} size={20} color="#6d28d9" />
              <Text style={rc.td}>تطبيق سقف {cap} على درجته (أزل العلامة لاحتسابها كاملة)</Text>
            </TouchableOpacity>
          )}
          <View style={{ marginTop: 14, flexDirection: 'row-reverse' }}>
            <Btn icon="checkmark" label="تسجيل القرار" color="#6d28d9" onPress={save} disabled={busy || !f.reason.trim()} testID="rc-decision-save-btn" />
          </View>
        </View>
      )}
    </ModalShell>
  );
};
