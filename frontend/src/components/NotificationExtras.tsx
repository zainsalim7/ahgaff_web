import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const notify = (m: string) => (Platform.OS === 'web' ? window.alert(m) : Alert.alert('', m));
const ask = (m: string) => (Platform.OS === 'web' ? Promise.resolve(window.confirm(m)) : new Promise<boolean>(r =>
  Alert.alert('تأكيد', m, [{ text: 'إلغاء', onPress: () => r(false) }, { text: 'نعم', onPress: () => r(true) }])));

type Tpl = { id: string; name: string; title: string; body: string };

/** 📋 قوالب الإشعارات — اختيار قالب يملأ العنوان والنص، وحفظ الحالي كقالب */
export const TemplatesBar = ({ title, body, onApply }: { title: string; body: string; onApply: (t: string, b: string) => void }) => {
  const [items, setItems] = useState<Tpl[]>([]);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const load = useCallback(() => { api.get('/notifications/templates').then(r => setItems(r.data || [])).catch(() => {}); }, []);
  useEffect(load, [load]);

  const save = async () => {
    if (!title.trim() || !body.trim()) return notify('اكتب العنوان والنص أولاً');
    if (!name.trim()) return notify('اكتب اسماً للقالب');
    try { const r = await api.post('/notifications/templates', { name, title, body }); notify(r.data.message); setName(''); setSaving(false); load(); }
    catch (e: any) { notify(e?.response?.data?.detail || 'فشل الحفظ'); }
  };
  const remove = async (t: Tpl) => {
    if (!(await ask(`حذف القالب «${t.name}»؟`))) return;
    await api.delete(`/notifications/templates/${t.id}`).catch((e: any) => notify(e?.response?.data?.detail || 'فشل حذف القالب')); load();
  };

  return (
    <View style={s.card} testID="templates-bar">
      <View style={s.row}>
        <Ionicons name="albums-outline" size={16} color="#1565c0" />
        <Text style={s.h}>القوالب</Text>
        <TouchableOpacity style={s.link} onPress={() => setSaving(v => !v)} testID="save-template-toggle">
          <Ionicons name="bookmark-outline" size={14} color="#1565c0" />
          <Text style={s.linkTx}>حفظ الرسالة الحالية كقالب</Text>
        </TouchableOpacity>
      </View>
      {saving && (
        <View style={[s.row, { marginTop: 8 }]}>
          <TextInput value={name} onChangeText={setName} placeholder="اسم القالب (مثل: تذكير اختبار)" style={s.input} testID="template-name-input" />
          <TouchableOpacity style={s.btn} onPress={save} testID="template-save-btn"><Text style={s.btnTx}>حفظ</Text></TouchableOpacity>
        </View>
      )}
      <View style={s.chips}>
        {items.length === 0 && <Text style={s.muted}>لا توجد قوالب محفوظة بعد</Text>}
        {items.map(t => (
          <View key={t.id} style={s.chip}>
            <TouchableOpacity onPress={() => onApply(t.title, t.body)} testID={`template-apply-${t.id}`}>
              <Text style={s.chipTx}>{t.name}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => remove(t)} testID={`template-delete-${t.id}`}>
              <Ionicons name="close-circle" size={15} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
};

/** ⏰ اختيار وقت الإرسال: الآن أو في وقت محدد (توقيت اليمن) */
export const SchedulePicker = ({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) => (
  <View style={s.card} testID="schedule-picker">
    <View style={s.row}>
      <Ionicons name="time-outline" size={16} color="#1565c0" />
      <Text style={s.h}>وقت الإرسال</Text>
      {([['now', 'الآن'], ['later', 'جدولة']] as const).map(([k, l]) => {
        const on = k === 'now' ? value === null : value !== null;
        return (
          <TouchableOpacity key={k} style={[s.pill, on && s.pillOn]} testID={`schedule-${k}`}
            onPress={() => onChange(k === 'now' ? null : (value || ''))}>
            <Text style={[s.pillTx, on && { color: '#fff' }]}>{l}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
    {value !== null && (
      <View style={{ marginTop: 8 }}>
        {Platform.OS === 'web' ? (
          <input type="datetime-local" value={value} min={new Date(Date.now() + 3 * 3600e3 + 120e3).toISOString().slice(0, 16)} onChange={(e) => onChange(e.target.value)} data-testid="schedule-datetime-input"
            style={{ border: '1px solid #dde3ec', borderRadius: 8, padding: 9, fontSize: 14, direction: 'ltr', fontFamily: 'inherit' }} />
        ) : (
          <TextInput value={value} onChangeText={onChange} placeholder="2026-12-01T08:30" style={s.input} testID="schedule-datetime-input" />
        )}
        <Text style={s.muted}>بتوقيت اليمن — يُرسل خلال 15 دقيقة من الوقت المحدد</Text>
      </View>
    )}
  </View>
);

type Sch = { id: string; title: string; scheduled_at: string; status: string; target_desc: string; users_estimate?: number; users_sent?: number; created_by_name?: string };
const STATUS: Record<string, [string, string]> = {
  pending: ['بانتظار الإرسال', '#e65100'], processing: ['جارٍ الإرسال', '#1565c0'], sent: ['أُرسل', '#2e7d32'],
  cancelled: ['أُلغي', '#64748b'], failed: ['فشل', '#c62828'],
};
const fmt = (iso: string) => new Date(iso).toLocaleString('ar-EG', { timeZone: 'Asia/Aden', dateStyle: 'medium', timeStyle: 'short' });

/** 🗓️ قائمة الإشعارات المجدولة مع الإلغاء */
export const ScheduledList = ({ refreshKey }: { refreshKey: number }) => {
  const [items, setItems] = useState<Sch[]>([]);
  const load = useCallback(() => { api.get('/notifications/scheduled').then(r => setItems(r.data || [])).catch(() => {}); }, []);
  useEffect(load, [load, refreshKey]);
  if (!items.length) return null;
  const cancel = async (x: Sch) => {
    if (!(await ask(`إلغاء الإشعار المجدول «${x.title}»؟`))) return;
    try { await api.delete(`/notifications/scheduled/${x.id}`); load(); } catch (e: any) { notify(e?.response?.data?.detail || 'فشل الإلغاء'); }
  };
  return (
    <View style={[s.card, { marginTop: 16 }]} testID="scheduled-list">
      <View style={s.row}><Ionicons name="calendar-outline" size={16} color="#1565c0" /><Text style={s.h}>الإشعارات المجدولة</Text></View>
      {items.slice(0, 20).map(x => {
        const [lbl, col] = STATUS[x.status] || [x.status, '#64748b'];
        return (
          <View key={x.id} style={s.item} testID={`scheduled-item-${x.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={s.itemT} numberOfLines={1}>{x.title}</Text>
              <Text style={s.muted}>{fmt(x.scheduled_at)} · {x.target_desc}{x.status === 'sent' ? ` · وصل إلى ${x.users_sent}` : ''}</Text>
            </View>
            <Text style={[s.badge, { color: col, borderColor: col }]}>{lbl}</Text>
            {x.status === 'pending' && (
              <TouchableOpacity onPress={() => cancel(x)} testID={`scheduled-cancel-${x.id}`}>
                <Ionicons name="close-circle-outline" size={20} color="#c62828" />
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
};

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 10 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  h: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  link: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginRight: 'auto' as any },
  linkTx: { fontSize: 12, color: '#1565c0', fontWeight: '700' },
  input: { flex: 1, borderWidth: 1, borderColor: '#dde3ec', borderRadius: 8, padding: 9, fontSize: 13, textAlign: 'right' },
  btn: { backgroundColor: '#1565c0', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9 },
  btnTx: { color: '#fff', fontWeight: '800', fontSize: 13 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  chipTx: { fontSize: 12.5, color: '#1e40af', fontWeight: '700' },
  muted: { fontSize: 11.5, color: '#64748b', textAlign: 'right', marginTop: 3 },
  pill: { borderWidth: 1, borderColor: '#1565c0', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 5 },
  pillOn: { backgroundColor: '#1565c0' },
  pillTx: { fontSize: 12.5, color: '#1565c0', fontWeight: '700' },
  item: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  itemT: { fontSize: 13, fontWeight: '700', color: '#0f172a', textAlign: 'right' },
  badge: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
});
