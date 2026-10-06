import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator, Platform, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';

export const ATT_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  present: { label: 'حاضر', color: '#2e7d32', bg: '#e8f5e9' },
  late: { label: 'متأخر', color: '#e65100', bg: '#fff3e0' },
  excused: { label: 'بعذر', color: '#1565c0', bg: '#e3f2fd' },
  absent: { label: 'غائب', color: '#c62828', bg: '#ffebee' },
};
const meta = (s: string) => ATT_STATUS_META[s] || ATT_STATUS_META.absent;
const msg = (t: string, m: string) => (Platform.OS === 'web' ? window.alert(`${t}\n\n${m}`) : Alert.alert(t, m));

type Props = { recordId: string; status: string; editable: boolean; title?: string; onChanged: (newStatus: string) => void; size?: 'sm' | 'md' };

export const StatusEditPill = ({ recordId, status, editable, title, onChanged, size = 'md' }: Props) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const m = meta(status);

  const apply = async (newStatus: string) => {
    if (newStatus === status) { setOpen(false); return; }
    setBusy(newStatus);
    try {
      const r = await api.put(`/attendance/${recordId}/status`, { status: newStatus, reason });
      setOpen(false); setReason('');
      if (r.data?.status === 'pending_approval') msg('بانتظار الاعتماد', r.data.message || 'تم إرسال طلب التعديل لاعتماد العميد');
      else onChanged(newStatus);
    } catch (e: any) { msg('خطأ', e?.response?.data?.detail || 'فشل تعديل الحالة'); }
    finally { setBusy(null); }
  };

  return (
    <>
      <TouchableOpacity
        disabled={!editable}
        onPress={() => setOpen(true)}
        style={[st.pill, { backgroundColor: m.bg }, size === 'sm' && st.pillSm, editable && st.pillEditable]}
        testID={`att-status-pill-${recordId}`}
        accessibilityLabel={editable ? 'تغيير حالة الحضور' : undefined}
      >
        <Text style={[st.pillText, { color: m.color }, size === 'sm' && { fontSize: 11 }]}>{m.label}</Text>
        {editable && <Ionicons name="create-outline" size={size === 'sm' ? 11 : 13} color={m.color} />}
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={st.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={st.sheet} onStartShouldSetResponder={() => true} testID={`att-status-editor-${recordId}`}>
            <Text style={st.sheetTitle}>تغيير حالة الحضور</Text>
            {!!title && <Text style={st.sheetSub}>{title}</Text>}
            <View style={st.options}>
              {Object.entries(ATT_STATUS_META).map(([k, v]) => (
                <TouchableOpacity key={k} onPress={() => apply(k)} disabled={!!busy} style={[st.opt, { borderColor: v.color, backgroundColor: k === status ? v.bg : '#fff' }]} testID={`att-status-opt-${k}`}>
                  {busy === k ? <ActivityIndicator size="small" color={v.color} /> : <Text style={[st.optText, { color: v.color }]}>{v.label}{k === status ? ' ✓' : ''}</Text>}
                </TouchableOpacity>
              ))}
            </View>
            <TextInput value={reason} onChangeText={setReason} placeholder="سبب التعديل (اختياري)" placeholderTextColor="#a8b1c2" style={st.reason} testID="att-status-reason" />
            <TouchableOpacity onPress={() => setOpen(false)} style={st.cancel} testID="att-status-cancel"><Text style={st.cancelText}>إلغاء</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const st = StyleSheet.create({
  pill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillSm: { paddingHorizontal: 8, paddingVertical: 3 },
  pillEditable: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  pillText: { fontSize: 12, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: '#fff', borderRadius: 14, padding: 18, width: '100%', maxWidth: 380 },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: '#0f2440', textAlign: 'right' },
  sheetSub: { fontSize: 12, color: '#5b6678', textAlign: 'right', marginTop: 4 },
  options: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  opt: { flexGrow: 1, minWidth: '45%', borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  optText: { fontSize: 13, fontWeight: '800' },
  reason: { marginTop: 12, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, fontSize: 13, textAlign: 'right', color: '#0f2440' },
  cancel: { marginTop: 10, alignItems: 'center', paddingVertical: 8 },
  cancelText: { color: '#5b6678', fontWeight: '700', fontSize: 13 },
});
