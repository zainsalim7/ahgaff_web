import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { ModalShell } from '../results/resultsUi';
import { Field, FIELD_AR, Btn, Msg, confirmBox, rc } from './rcUi';

export const RcResetModal = ({ courseId, courseName, allowed, locked, onClose, onDone }: { courseId: string; courseName: string; allowed: Field[]; locked: boolean; onClose: () => void; onDone: () => void }) => {
  const [sel, setSel] = useState<Field[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const toggle = (f: Field) => setSel(sel.includes(f) ? sel.filter((x) => x !== f) : [...sel, f]);
  const go = async () => {
    if (!(await confirmBox(`تفريغ درجات (${sel.map((f) => FIELD_AR[f]).join('، ')}) لكل طلاب «${courseName}» وإعادتها بلا إدخال؟ يمكنك التراجع عنها لاحقاً من سجل التعديلات.`))) return;
    try { const r = await api.post(`/rc/courses/${courseId}/reset`, { fields: sel }); setMsg({ ok: !(r.data.errors || []).length, text: r.data.message }); onDone(); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشل التفريغ' }); }
  };
  return (
    <ModalShell title={`تفريغ الدرجات · ${courseName}`} icon="trash-outline" onClose={onClose} testID="rc-reset-modal">
      <Text style={[rc.td, { color: '#475569', marginBottom: 10 }]}>تعود الدرجات المختارة فارغة لكل طلاب المقرر. العملية مسجّلة، ويمكن التراجع عنها كاملة من «سجل التعديلات». يُفرَّغ الدور الثاني والأول قبل السعي تلقائياً.</Text>
      <Msg m={msg} testID="rc-reset-msg" />
      {allowed.map((f) => (
        <TouchableOpacity key={f} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 8 }} onPress={() => toggle(f)} testID={`rc-reset-${f}`}
          disabled={f === 'coursework' && locked}>
          <Ionicons name={sel.includes(f) ? 'checkbox' : 'square-outline'} size={20} color={f === 'coursework' && locked ? '#cbd5e1' : '#c62828'} />
          <Text style={[rc.td, f === 'coursework' && locked && { color: '#94a3b8' }]}>{FIELD_AR[f]}{f === 'coursework' && locked ? ' (مقفل — افتحه أولاً)' : ''}</Text>
        </TouchableOpacity>
      ))}
      <View style={{ flexDirection: 'row-reverse', marginTop: 12 }}>
        <Btn icon="trash-outline" label="تفريغ المحدد" color="#c62828" onPress={go} disabled={!sel.length} testID="rc-reset-btn" />
      </View>
    </ModalShell>
  );
};
