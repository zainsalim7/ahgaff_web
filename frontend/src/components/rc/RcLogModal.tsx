import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { ModalShell } from '../results/resultsUi';
import { rc, confirmBox, Msg, Btn } from './rcUi';

const t = (iso: string) => { try { return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };
const v = (x: any) => (x === null || x === undefined ? 'فارغ' : x === true ? 'إقفال' : x === false ? 'فتح' : String(x));
const MARKS = ['coursework', 'first_exam', 'second_exam', 'exceptional_exam'];
const VIA: Record<string, string> = { excel: 'استيراد Excel', manual: 'رصد يدوي', undo: 'تراجع', reset: 'تفريغ' };

type Item = { id: string; op_id: string; undone: boolean; field: string; field_name: string; name: string; old: any; new: any; via: string; note: string; by_name: string; at: string };

const Row = ({ x, sel, onSel, canUndo, onUndo, i }: { x: Item; sel: boolean; onSel: () => void; canUndo: boolean; onUndo: () => void; i: number }) => {
  const mark = MARKS.includes(x.field) && x.via !== 'undo';
  return (
    <View style={[rc.tr, x.undone && { opacity: 0.5 }]} testID={`rc-log-${i}`}>
      <View style={{ width: 24 }}>
        {canUndo && mark && !x.undone && (
          <TouchableOpacity onPress={onSel} testID={`rc-log-sel-${i}`}><Ionicons name={sel ? 'checkbox' : 'square-outline'} size={18} color="#c62828" /></TouchableOpacity>
        )}
      </View>
      <Text style={[rc.td, { flex: 1, fontWeight: '700' }]}>{x.field_name}</Text>
      <Text style={[rc.td, { flex: 2 }]} numberOfLines={1}>{x.name || '—'}</Text>
      <Text style={[rc.td, { flex: 1.6 }]}>{x.field === 'decision' || x.field === 'lock' ? v(x.new) : `${v(x.old)} ← ${v(x.new)}`}{x.note ? ` · ${x.note}` : ''}</Text>
      <View style={{ width: 80 }}>
        {x.undone ? <Text style={{ color: '#94a3b8', fontSize: 12, textAlign: 'right' }}>تم التراجع</Text>
          : canUndo && mark ? (
            <TouchableOpacity style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }} onPress={onUndo} testID={`rc-log-undo-${i}`}>
              <Ionicons name="arrow-undo-outline" size={14} color="#c62828" /><Text style={{ color: '#c62828', fontSize: 12, fontWeight: '700' }}>تراجع</Text>
            </TouchableOpacity>) : null}
      </View>
    </View>
  );
};

export const RcLogModal = ({ courseId, onClose, onChanged, canUndo }: { courseId: string; onClose: () => void; onChanged: () => void; canUndo: boolean }) => {
  const [items, setItems] = useState<Item[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => api.get(`/rc/courses/${courseId}/log`).then((r) => { setItems(r.data.items); setSel(new Set()); }).catch(() => setItems([]));
  useEffect(() => { load(); }, [courseId]);

  const run = async (q: string, call: () => Promise<any>) => {
    if (!(await confirmBox(q))) return;
    try { const r = await call(); setMsg({ ok: !(r.data.skipped || []).length, text: r.data.message }); load(); onChanged(); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشل التراجع' }); }
  };
  const one = (x: Item) => run(`التراجع عن رصد ${x.field_name} لـ ${x.name} وإعادتها إلى «${v(x.old)}»؟`, () => api.post(`/rc/courses/${courseId}/log/${x.id}/undo`));
  const op = (id: string, n: number) => run(`التراجع عن العملية كاملة (${n} درجة) وإعادة الدرجات إلى ما كانت عليه قبلها؟`, () => api.post(`/rc/courses/${courseId}/undo-bulk`, { op_id: id }));
  const selected = () => run(`التراجع عن ${sel.size} رصد محدد؟`, () => api.post(`/rc/courses/${courseId}/undo-bulk`, { log_ids: Array.from(sel) }));
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };

  const groups: { op: string; list: Item[] }[] = [];
  (items || []).forEach((x) => { const g = groups.find((y) => y.op === x.op_id); g ? g.list.push(x) : groups.push({ op: x.op_id, list: [x] }); });
  let idx = 0;
  return (
    <ModalShell title="سجل تعديلات المقرر" icon="time-outline" onClose={onClose} testID="rc-log-modal">
      <Msg m={msg} testID="rc-log-msg" />
      {canUndo && sel.size > 0 && (
        <View style={{ flexDirection: 'row-reverse', marginBottom: 10 }}>
          <Btn icon="arrow-undo" label={`تراجع عن المحدد (${sel.size})`} color="#c62828" onPress={selected} testID="rc-log-undo-selected-btn" />
        </View>
      )}
      {!items ? <ActivityIndicator /> : items.length === 0 ? <Text style={{ textAlign: 'center', color: '#94a3b8' }} testID="rc-log-empty">لا توجد تعديلات بعد</Text> : groups.map((g, gi) => {
        const h = g.list[0];
        const open = g.list.filter((x) => MARKS.includes(x.field) && !x.undone && x.via !== 'undo');
        const allSel = open.length > 0 && open.every((x) => sel.has(x.id));
        return (
          <View key={g.op} style={[rc.card, { marginBottom: 10, overflow: 'hidden' }]} testID={`rc-op-${gi}`}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 10, backgroundColor: '#f8fafc', flexWrap: 'wrap' }}>
              {canUndo && open.length > 0 && (
                <TouchableOpacity onPress={() => { const n = new Set(sel); open.forEach((x) => (allSel ? n.delete(x.id) : n.add(x.id))); setSel(n); }} testID={`rc-op-sel-${gi}`}>
                  <Ionicons name={allSel ? 'checkbox' : 'square-outline'} size={18} color="#c62828" />
                </TouchableOpacity>
              )}
              <Text style={{ fontWeight: '800', color: '#1a2540' }}>{VIA[h.via] || h.field_name}</Text>
              <Text style={{ color: '#64748b', fontSize: 12 }}>{g.list.length} سجل · {h.by_name} · {t(h.at)}</Text>
              <View style={{ flex: 1 }} />
              {canUndo && open.length > 1 && <Btn icon="arrow-undo-outline" label={`تراجع عن العملية كلها (${open.length})`} color="#c62828" outline onPress={() => op(g.op, open.length)} testID={`rc-op-undo-${gi}`} />}
            </View>
            {g.list.map((x) => { const i = idx++; return <Row key={x.id} x={x} i={i} sel={sel.has(x.id)} onSel={() => toggle(x.id)} canUndo={canUndo} onUndo={() => one(x)} />; })}
          </View>
        );
      })}
    </ModalShell>
  );
};
