import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { PickerField, Opt, rs } from './resultsUi';

interface Pause { id: string; scope: string; scope_id: string | null; scope_name: string; paused_by_name: string; paused_at: string; can_resume: boolean }

const confirmBox = async (msg: string) => Platform.OS === 'web' ? window.confirm(msg)
  : new Promise<boolean>((r) => Alert.alert('تأكيد', msg, [{ text: 'إلغاء', onPress: () => r(false) }, { text: 'نعم', onPress: () => r(true) }]));

export const usePauses = () => {
  const [items, setItems] = useState<Pause[]>([]);
  const [canAll, setCanAll] = useState(false);
  const load = useCallback(async () => {
    try { const r = await api.get('/results/pauses'); setItems(r.data.items || []); setCanAll(!!r.data.can_pause_all); } catch { /* view-only or none */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { items, canAll, load };
};

export const ResultsPausePanel = ({ pauses, canAll, faculties, departments, onChanged }: {
  pauses: Pause[]; canAll: boolean; faculties: Opt[]; departments: Opt[]; onChanged: () => void;
}) => {
  const [scope, setScope] = useState(canAll ? 'all' : faculties.length ? 'faculty' : 'department');
  const [scopeId, setScopeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const scopes = [...(canAll ? [{ id: 'all', name: 'الجامعة بالكامل' }] : []), ...(faculties.length ? [{ id: 'faculty', name: 'كلية' }] : []), { id: 'department', name: 'قسم' }];

  const send = async (body: any, q: string) => {
    if (!(await confirmBox(q))) return;
    setBusy(true); setMsg(null);
    try { const r = await api.post('/results/pauses', body); setMsg({ ok: true, text: r.data?.message || 'تم' }); onChanged(); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشلت العملية' }); } finally { setBusy(false); }
  };

  return (
    <View testID="results-pause-panel">
      <View style={[rs.card, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}>
        <Text style={rs.hint}>إيقاف العرض يُخفي شاشة النتائج وبيان الدرجات عن طلاب النطاق المختار في التطبيق، ويظهر لهم «النتائج غير متاحة حالياً». لا يُحذف ولا يتغيّر أي شيء، ويمكنك الاستمرار في الرفع والتعديل ثم الاستئناف متى شئت.</Text>
      </View>
      <View style={rs.card}>
        <Text style={[rs.title, { marginBottom: 10 }]}>إيقاف العرض لنطاق</Text>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <PickerField label="النطاق" options={scopes} value={scope} onChange={(v) => { setScope(v || 'department'); setScopeId(''); }} testID="pause-scope" noPlaceholder />
          {scope !== 'all' && <PickerField label={scope === 'faculty' ? 'الكلية' : 'القسم'} options={scope === 'faculty' ? faculties : departments} value={scopeId} onChange={setScopeId} testID="pause-target" />}
          <TouchableOpacity style={[rs.btn, { backgroundColor: '#ea580c', flexDirection: 'row-reverse', gap: 6, opacity: busy || (scope !== 'all' && !scopeId) ? 0.5 : 1 }]}
            disabled={busy || (scope !== 'all' && !scopeId)} testID="pause-submit-btn"
            onPress={() => send({ scope, scope_id: scope === 'all' ? null : scopeId, paused: true }, 'إيقاف عرض النتائج في التطبيق لهذا النطاق؟')}>
            {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="pause" size={16} color="#fff" /><Text style={rs.btnTxt}>إيقاف العرض</Text></>}
          </TouchableOpacity>
        </View>
      </View>
      {msg && <View style={[rs.card, { backgroundColor: msg.ok ? '#e8f5e9' : '#ffebee' }]} testID="pause-msg"><Text style={{ color: msg.ok ? '#2e7d32' : '#c62828', textAlign: 'right' }}>{msg.text}</Text></View>}
      <Text style={[rs.title, { marginVertical: 8 }]}>النطاقات الموقوفة حالياً</Text>
      {pauses.length === 0 ? <Text style={{ color: '#94a3b8', textAlign: 'right' }} testID="pause-none">لا يوجد — النتائج معروضة للطلاب</Text> : pauses.map((p) => (
        <View key={p.id} style={[rs.card, { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }]} testID={`pause-item-${p.id}`}>
          <View style={{ flex: 1 }}>
            <Text style={rs.title}>⏸ {p.scope_name}</Text>
            <Text style={{ color: '#94a3b8', fontSize: 11.5, textAlign: 'right' }}>{p.paused_by_name} · {new Date(p.paused_at).toLocaleString('ar-EG')}</Text>
          </View>
          {p.can_resume && (
            <TouchableOpacity style={[rs.btn, { backgroundColor: '#16a34a', flexDirection: 'row-reverse', gap: 6 }]} testID={`pause-resume-${p.id}`}
              onPress={() => send({ scope: p.scope, scope_id: p.scope_id, paused: false }, `استئناف عرض النتائج: ${p.scope_name}؟`)}>
              <Ionicons name="play" size={16} color="#fff" /><Text style={rs.btnTxt}>استئناف العرض</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
};
