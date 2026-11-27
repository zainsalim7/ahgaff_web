import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import api from '../../services/api';
import { ModalShell } from '../results/resultsUi';
import { rc, confirmBox, Msg } from './rcUi';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const t = (iso: string) => { try { return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };
const v = (x: any) => (x === null || x === undefined ? '—' : x === true ? 'إقفال' : x === false ? 'فتح' : String(x));

const MARKS = ['coursework', 'first_exam', 'second_exam', 'exceptional_exam'];

export const RcLogModal = ({ courseId, onClose, onChanged, canUndo }: { courseId: string; onClose: () => void; onChanged: () => void; canUndo: boolean }) => {
  const [items, setItems] = useState<any[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => api.get(`/rc/courses/${courseId}/log`).then((r) => setItems(r.data.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, [courseId]);
  const undo = async (x: any) => {
    if (!(await confirmBox(`التراجع عن رصد ${x.field_name} لـ ${x.name} وإعادتها إلى «${v(x.old)}»؟`))) return;
    try { const r = await api.post(`/rc/courses/${courseId}/log/${x.id}/undo`); setMsg({ ok: true, text: r.data.message }); load(); onChanged(); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشل التراجع' }); }
  };
  return (
    <ModalShell title="سجل تعديلات المقرر" icon="time-outline" onClose={onClose} testID="rc-log-modal">
      <Msg m={msg} testID="rc-log-msg" />
      {!items ? <ActivityIndicator /> : items.length === 0 ? <Text style={{ textAlign: 'center', color: '#94a3b8' }} testID="rc-log-empty">لا توجد تعديلات بعد</Text> : items.map((x, i) => (
        <View key={i} style={rc.tr} testID={`rc-log-${i}`}>
          <Text style={[rc.td, { flex: 1.1, fontWeight: '700' }]}>{x.field_name}</Text>
          <Text style={[rc.td, { flex: 2 }]} numberOfLines={1}>{x.name || '—'}</Text>
          <Text style={[rc.td, { flex: 1.6 }]}>{x.field === 'decision' || x.field === 'lock' ? v(x.new) : `${v(x.old)} ← ${v(x.new)}`}{x.note ? ` · ${x.note}` : ''}</Text>
          <Text style={[rc.td, { flex: 0.6, color: '#64748b' }]}>{x.via === 'excel' ? 'Excel' : x.via === 'manual' ? 'يدوي' : x.via === 'undo' ? 'تراجع' : ''}</Text>
          <Text style={[rc.td, { flex: 1.6, color: '#64748b', fontSize: 12 }]}>{x.by_name} · {t(x.at)}</Text>
          <View style={{ width: 80 }}>
            {x.undone ? <Text style={{ color: '#94a3b8', fontSize: 12, textAlign: 'right' }}>تم التراجع</Text>
              : canUndo && MARKS.includes(x.field) && x.via !== 'undo' ? (
                <TouchableOpacity style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }} onPress={() => undo(x)} testID={`rc-log-undo-${i}`}>
                  <Ionicons name="arrow-undo-outline" size={14} color="#c62828" /><Text style={{ color: '#c62828', fontSize: 12, fontWeight: '700' }}>تراجع</Text>
                </TouchableOpacity>) : null}
          </View>
        </View>
      ))}
    </ModalShell>
  );
};
