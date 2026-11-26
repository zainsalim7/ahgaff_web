import React, { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import api from '../../services/api';
import { ModalShell } from '../results/resultsUi';
import { Btn, Msg, rc } from './rcUi';

const NUMS = [
  { k: 'coursework_max', l: 'الدرجة العظمى لأعمال السعي', h: 'والامتحان النهائي = 100 − هذه القيمة' },
  { k: 'coursework_pass_pct', l: 'نسبة النجاح في السعي للتأهل (%)', h: 'من درجة السعي — مثلاً 40% من 40 = 16' },
  { k: 'pass_mark', l: 'درجة النجاح في المقرر (من 100)', h: 'الدور الأول: السعي + الامتحان · الثاني والاستثنائي: درجة الامتحان' },
  { k: 'second_cap', l: 'سقف الدور الثاني', h: 'مهما حصل الطالب فوقه يُسجَّل السقف (إلا بقرار المجلس)، ومن لم يبلغ درجة النجاح يُسجَّل له 0' },
  { k: 'exceptional_cap', l: 'سقف الدور الاستثنائي', h: 'يُطبَّق ما لم يقرر المجلس احتسابها كاملة' },
];

export const RcSettingsModal = ({ facultyId, facultyName, canEdit, onClose, onSaved }: { facultyId: string; facultyName: string; canEdit: boolean; onClose: () => void; onSaved: () => void }) => {
  const [v, setV] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { api.get('/rc/settings', { params: { faculty_id: facultyId } }).then((r) => setV({ ...r.data, grade_scale: r.data.grade_scale.map((g: any) => ({ min: String(g.min), label: g.label })) })).catch((e) => setMsg({ ok: false, text: e?.response?.data?.detail || 'تعذر الجلب' })); }, [facultyId]);
  const save = async () => {
    setMsg(null);
    try { const r = await api.put('/rc/settings', { ...v, faculty_id: facultyId }); setMsg({ ok: true, text: r.data.message }); onSaved(); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشل الحفظ' }); }
  };
  const setScale = (i: number, k: string, x: string) => setV({ ...v, grade_scale: v.grade_scale.map((g: any, j: number) => (j === i ? { ...g, [k]: x } : g)) });
  return (
    <ModalShell title={`إعدادات لائحة الدرجات · ${facultyName}`} icon="settings-outline" onClose={onClose} testID="rc-settings-modal">
      <Msg m={msg} testID="rc-settings-msg" />
      {v && (
        <View>
          {NUMS.map((n) => (
            <View key={n.k} style={[rc.tr, { borderBottomWidth: 1 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[rc.td, { fontWeight: '700' }]}>{n.l}</Text>
                <Text style={{ fontSize: 11.5, color: '#64748b', textAlign: 'right' }}>{n.h}</Text>
              </View>
              <TextInput style={rc.input} value={String(v[n.k])} editable={canEdit} onChangeText={(x) => setV({ ...v, [n.k]: x })} testID={`rc-set-${n.k}`} />
            </View>
          ))}
          <Text style={[rc.td, { marginVertical: 8, color: '#1565c0', fontWeight: '700' }]} testID="rc-set-final-max">الامتحان النهائي: {100 - Number(v.coursework_max || 0)} · المجموع 100</Text>
          <Text style={[rc.th, { marginTop: 8, marginBottom: 4 }]}>سلّم التقديرات (الحد الأدنى من 100)</Text>
          {v.grade_scale.map((g: any, i: number) => (
            <View key={i} style={[rc.tr, { paddingVertical: 4 }]}>
              <TextInput style={[rc.input, { width: 140 }]} value={g.label} editable={canEdit} onChangeText={(x) => setScale(i, 'label', x)} testID={`rc-scale-label-${i}`} />
              <TextInput style={rc.input} value={g.min} editable={canEdit} onChangeText={(x) => setScale(i, 'min', x)} testID={`rc-scale-min-${i}`} />
            </View>
          ))}
          {canEdit && <View style={{ marginTop: 14, flexDirection: 'row-reverse' }}><Btn icon="save-outline" label="حفظ الإعدادات" color="#2962ff" onPress={save} testID="rc-settings-save-btn" /></View>}
        </View>
      )}
    </ModalShell>
  );
};
