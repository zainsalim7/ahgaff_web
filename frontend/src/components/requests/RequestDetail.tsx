import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { ModalShell, downloadBlob } from '../results/resultsUi';
import { Btn, Badge } from '../rc/rcUi';
import { REQ_STATUS_COLOR, ReqItem, rqs } from './reqUi';

const ACTS = [
  { a: 'approve', label: 'قبول', icon: 'checkmark-circle-outline', color: '#2e7d32' },
  { a: 'complete', label: 'منجز / جاهز للاستلام', icon: 'ribbon-outline', color: '#1565c0' },
  { a: 'needs_info', label: 'طلب استكمال', icon: 'help-circle-outline', color: '#ef6c00' },
  { a: 'reject', label: 'رفض', icon: 'close-circle-outline', color: '#c62828' },
] as const;
const HIST: Record<string, string> = { submit: 'تقديم الطلب', reply: 'استكمال من الطالب', approve: 'قبول', reject: 'رفض', needs_info: 'طلب استكمال', complete: 'إنجاز', cancel: 'إلغاء' };

export const RequestDetail = ({ item, onClose, onDone }: { item: ReqItem; onClose: () => void; onDone: () => void }) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const closed = ['rejected', 'completed', 'cancelled'].includes(item.status);
  const act = async (a: string) => {
    setBusy(a); setErr('');
    try { await api.post(`/student-requests/${item.id}/decide`, { action: a, note }); onDone(); }
    catch (e: any) { setErr(e?.response?.data?.detail || 'فشل الحفظ'); }
    finally { setBusy(''); }
  };
  const file = async (idx: number, name: string) => {
    try { downloadBlob((await api.get(`/student-requests/${item.id}/attachments/${idx}`, { responseType: 'blob' })).data, name); }
    catch { setErr('تعذر تنزيل المرفق'); }
  };
  return (
    <ModalShell title={`${item.type_name} · ${item.ref_no}`} icon="document-text-outline" onClose={onClose} testID="req-detail">
      <ScrollView style={{ maxHeight: 520 }}>
        <View style={rqs.row}><Badge text={item.status_ar} color={REQ_STATUS_COLOR[item.status] || '#475569'} testID="req-detail-status" />
          <Text style={rqs.muted}>{new Date(item.created_at).toLocaleString('ar')}</Text></View>
        <Text style={rqs.h}>{item.student_name} · {item.student_no}</Text>
        <Text style={rqs.muted}>{[item.faculty_name, item.department_name, item.level ? `المستوى ${item.level}` : '', item.section ? `شعبة ${item.section}` : ''].filter(Boolean).join(' · ')}</Text>
        <View style={rqs.box}>
          {item.fields.map((f) => (
            <View key={f.key} style={rqs.kv}><Text style={rqs.k}>{f.label}</Text><Text style={rqs.v} testID={`req-val-${f.key}`}>{item.values[f.key] || '—'}</Text></View>
          ))}
          {!!item.notes && <View style={rqs.kv}><Text style={rqs.k}>ملاحظات الطالب</Text><Text style={rqs.v}>{item.notes}</Text></View>}
        </View>
        {!!item.attachments.length && <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {item.attachments.map((a) => (
            <TouchableOpacity key={a.idx} style={rqs.chip} onPress={() => file(a.idx, a.name)} testID={`req-att-${a.idx}`}>
              <Ionicons name={a.mime === 'application/pdf' ? 'document' : 'image'} size={13} color="#1565c0" /><Text style={{ color: '#1565c0', fontSize: 12 }}>{a.name}</Text>
            </TouchableOpacity>
          ))}
        </View>}
        <Text style={[rqs.h, { fontSize: 13, marginTop: 12 }]}>سجل الطلب</Text>
        {item.history.map((h, i) => (
          <Text key={i} style={rqs.muted}>• {HIST[h.action] || h.action} — {h.by_name} · {new Date(h.at).toLocaleString('ar')}{h.note ? ` · ${h.note}` : ''}</Text>
        ))}
        {!closed && <>
          <TextInput value={note} onChangeText={setNote} placeholder="ملاحظة للطالب (إلزامية عند الرفض أو طلب الاستكمال)" multiline style={rqs.input} testID="req-note-input" />
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {ACTS.filter((x) => !(x.a === 'approve' && item.status === 'approved')).map((x) => (
              <Btn key={x.a} icon={x.icon} label={busy === x.a ? '...' : x.label} color={x.color} onPress={() => act(x.a)} disabled={!!busy} testID={`req-act-${x.a}`} />
            ))}
          </View>
        </>}
        {!!err && <Text style={{ color: '#c62828', textAlign: 'right', marginTop: 6 }} testID="req-detail-error">{err}</Text>}
      </ScrollView>
    </ModalShell>
  );
};
