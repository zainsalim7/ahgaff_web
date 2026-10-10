import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, TextInput, Switch, ActivityIndicator, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { DASH } from '../dashboard/dashTheme';

const notify = (m: string) => (Platform.OS === 'web' ? window.alert(m) : Alert.alert('', m));

/** ⚙️ سياسة الساعات الإضافية لكل كلية: تفعيل الإضافة، المُقسِّم، سعر الساعة حسب الرتبة */
export const OvertimePolicyModal: React.FC<{ visible: boolean; onClose: () => void; onSaved?: () => void }> = ({ visible, onClose, onSaved }) => {
  const [items, setItems] = useState<any[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [sel, setSel] = useState('');
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/reports/teacher-workload/policies');
      setItems(r.data.items || []); setTitles(r.data.titles || []);
      const cur = (r.data.items || []).find((x: any) => x.faculty_id === sel) || r.data.items?.[0];
      if (cur) { setSel(cur.faculty_id); setForm({ ...cur, rates: { ...(cur.rates || {}) } }); }
    } catch (e: any) { notify(e?.response?.data?.detail || 'فشل تحميل السياسات'); } finally { setLoading(false); }
  };
  useEffect(() => { if (visible) load(); }, [visible]);

  const pick = (fid: string) => { const it = items.find((x) => x.faculty_id === fid); setSel(fid); if (it) setForm({ ...it, rates: { ...(it.rates || {}) } }); };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const rates: Record<string, number> = {};
      Object.entries(form.rates || {}).forEach(([k, v]) => { const n = parseFloat(String(v)); if (n > 0) rates[k] = n; });
      await api.put('/reports/teacher-workload/policy', { faculty_id: form.faculty_id, bonus_enabled: !!form.bonus_enabled, bonus_divisor: parseFloat(String(form.bonus_divisor)) || 6, rates, currency: form.currency || 'ر.ي' });
      notify('تم حفظ السياسة'); await load(); onSaved?.();
    } catch (e: any) { notify(e?.response?.data?.detail || 'فشل الحفظ'); } finally { setBusy(false); }
  };
  const reset = async () => {
    if (!form?.faculty_id) return;
    setBusy(true);
    try { await api.delete(`/reports/teacher-workload/policy/${form.faculty_id}`); notify('أُعيدت الكلية إلى الافتراضي'); await load(); onSaved?.(); } catch (e: any) { notify(e?.response?.data?.detail || 'فشل'); } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.backdrop}>
        <View style={st.card} testID="overtime-policy-modal">
          <View style={st.head}>
            <Text style={st.title}>⚙️ سياسة الساعات الإضافية</Text>
            <TouchableOpacity onPress={onClose} testID="policy-close-btn"><Ionicons name="close" size={20} color={DASH.muted} /></TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator color={DASH.navy} style={{ margin: 30 }} /> : (
            <ScrollView style={{ maxHeight: 520 }}>
              <Text style={st.lbl}>الكلية</Text>
              <View style={st.chips}>
                {items.map((it) => (
                  <TouchableOpacity key={it.faculty_id || 'default'} style={[st.chip, sel === it.faculty_id && st.chipOn]} onPress={() => pick(it.faculty_id)} testID={`policy-fac-${it.faculty_id || 'default'}`}>
                    <Text style={[st.chipText, sel === it.faculty_id && { color: '#fff' }]}>{it.faculty_name}{it.inherits_default ? ' (افتراضي)' : ''}{it.bonus_enabled ? ' ✓' : ''}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {form && (
                <>
                  <View style={st.row}>
                    <Text style={st.lbl}>تفعيل إضافة ساعة لكل N ساعات</Text>
                    <Switch value={!!form.bonus_enabled} onValueChange={(v) => setForm({ ...form, bonus_enabled: v })} testID="policy-bonus-switch" />
                  </View>
                  <View style={st.row}>
                    <Text style={st.lbl}>المُقسِّم (N)</Text>
                    <TextInput value={String(form.bonus_divisor ?? 6)} onChangeText={(v) => setForm({ ...form, bonus_divisor: v.replace(/[^0-9.]/g, '') })} style={st.inp} keyboardType="decimal-pad" testID="policy-divisor-input" />
                  </View>
                  <Text style={st.hint}>الإضافة تُحسب كسرياً: المنجز ÷ N (مثال: 68.5 ÷ 6 = 11.4)</Text>
                  <View style={st.row}>
                    <Text style={st.lbl}>العملة</Text>
                    <TextInput value={form.currency || ''} onChangeText={(v) => setForm({ ...form, currency: v })} style={st.inp} testID="policy-currency-input" />
                  </View>
                  <Text style={[st.lbl, { marginTop: 10 }]}>سعر الساعة الإضافية حسب الرتبة الأكاديمية (اختياري — اتركه فارغاً لعدم احتساب المستحق)</Text>
                  {titles.map((t) => (
                    <View key={t} style={st.row}>
                      <Text style={st.rateLbl}>{t}</Text>
                      <TextInput value={form.rates?.[t] != null ? String(form.rates[t]) : ''} onChangeText={(v) => setForm({ ...form, rates: { ...form.rates, [t]: v.replace(/[^0-9.]/g, '') } })} placeholder="—" style={st.inp} keyboardType="decimal-pad" testID={`policy-rate-${t}`} />
                    </View>
                  ))}
                  <View style={st.actions}>
                    <TouchableOpacity style={[st.btn, { backgroundColor: DASH.blue }]} onPress={save} disabled={busy} testID="policy-save-btn"><Text style={st.btnText}>{busy ? '...' : '💾 حفظ'}</Text></TouchableOpacity>
                    {!!form.faculty_id && !form.inherits_default && <TouchableOpacity style={[st.btn, { backgroundColor: '#64748b' }]} onPress={reset} disabled={busy} testID="policy-reset-btn"><Text style={st.btnText}>↩️ إعادة للافتراضي</Text></TouchableOpacity>}
                  </View>
                </>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '100%', maxWidth: 560 },
  head: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '800', color: DASH.ink },
  lbl: { fontSize: 12.5, fontWeight: '700', color: DASH.ink, textAlign: 'right' },
  hint: { fontSize: 11, color: DASH.muted, textAlign: 'right', marginBottom: 6 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginVertical: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: DASH.line },
  chipOn: { backgroundColor: DASH.navy, borderColor: DASH.navy },
  chipText: { fontSize: 11.5, fontWeight: '700', color: '#334155' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, gap: 10 },
  rateLbl: { fontSize: 12.5, color: '#334155', textAlign: 'right' },
  inp: { borderWidth: 1, borderColor: DASH.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 120, textAlign: 'center', fontSize: 13 },
  actions: { flexDirection: 'row-reverse', gap: 8, marginTop: 14 },
  btn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
});
