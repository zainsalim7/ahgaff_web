import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import api from '../../services/api';
import { ModalShell } from '../results/resultsUi';
import { rc } from './rcUi';

const t = (iso: string) => { try { return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };
const v = (x: any) => (x === null || x === undefined ? '—' : x === true ? 'إقفال' : x === false ? 'فتح' : String(x));

export const RcLogModal = ({ courseId, onClose }: { courseId: string; onClose: () => void }) => {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { api.get(`/rc/courses/${courseId}/log`).then((r) => setItems(r.data.items)).catch(() => setItems([])); }, [courseId]);
  return (
    <ModalShell title="سجل تعديلات المقرر" icon="time-outline" onClose={onClose} testID="rc-log-modal">
      {!items ? <ActivityIndicator /> : items.length === 0 ? <Text style={{ textAlign: 'center', color: '#94a3b8' }} testID="rc-log-empty">لا توجد تعديلات بعد</Text> : items.map((x, i) => (
        <View key={i} style={rc.tr} testID={`rc-log-${i}`}>
          <Text style={[rc.td, { flex: 1.1, fontWeight: '700' }]}>{x.field_name}</Text>
          <Text style={[rc.td, { flex: 2 }]} numberOfLines={1}>{x.name || '—'}</Text>
          <Text style={[rc.td, { flex: 1.6 }]}>{x.field === 'decision' || x.field === 'lock' ? v(x.new) : `${v(x.old)} ← ${v(x.new)}`}{x.note ? ` · ${x.note}` : ''}</Text>
          <Text style={[rc.td, { flex: 0.6, color: '#64748b' }]}>{x.via === 'excel' ? 'Excel' : x.via === 'manual' ? 'يدوي' : ''}</Text>
          <Text style={[rc.td, { flex: 1.6, color: '#64748b', fontSize: 12 }]}>{x.by_name} · {t(x.at)}</Text>
        </View>
      ))}
    </ModalShell>
  );
};
