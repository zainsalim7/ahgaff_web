import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import api from '../../services/api';
import { ModalShell } from '../results/resultsUi';
import { Btn, Badge } from '../rc/rcUi';
import { FIELD_TYPES, ReqField, ReqType, rqs } from './reqUi';

const EMPTY: Omit<ReqType, 'id'> = { name: '', description: '', fields: [], require_attachment: false, attachment_label: '', faculty_ids: [], is_active: true, order: 0 };

const FieldRow = ({ f, i, set, del }: { f: ReqField; i: number; set: (f: ReqField) => void; del: () => void }) => (
  <View style={[rqs.box, { marginTop: 6 }]} testID={`rt-field-${i}`}>
    <View style={{ flexDirection: 'row-reverse', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <TextInput value={f.label} onChangeText={(v) => set({ ...f, label: v })} placeholder="اسم الحقل" style={[rqs.input, { marginTop: 0, minHeight: 36, flex: 1, minWidth: 160 }]} testID={`rt-field-label-${i}`} />
      <View style={{ width: 140, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
        <Picker selectedValue={f.type} onValueChange={(v) => set({ ...f, type: v })} testID={`rt-field-type-${i}`}>
          {FIELD_TYPES.map((t) => <Picker.Item key={t.id} label={t.name} value={t.id} />)}
        </Picker>
      </View>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>
        <Switch value={f.required} onValueChange={(v) => set({ ...f, required: v })} testID={`rt-field-required-${i}`} /><Text style={rqs.muted}>إلزامي</Text>
      </View>
      <TouchableOpacity onPress={del} testID={`rt-field-del-${i}`}><Ionicons name="trash-outline" size={18} color="#c62828" /></TouchableOpacity>
    </View>
    {f.type === 'select' && <TextInput value={f.options.join('، ')} onChangeText={(v) => set({ ...f, options: v.split(/[،,]/).map((x) => x.trimStart()) })}
      placeholder="الخيارات مفصولة بفاصلة: خيار 1، خيار 2" style={[rqs.input, { minHeight: 36 }]} testID={`rt-field-options-${i}`} />}
  </View>
);

const TypeModal = ({ t, faculties, onClose, onSaved }: { t: ReqType | null; faculties: any[]; onClose: () => void; onSaved: () => void }) => {
  const [f, setF] = useState<Omit<ReqType, 'id'>>(t ? { ...t } : EMPTY);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    const body = { ...f, fields: f.fields.map((x) => ({ ...x, options: x.options.map((o) => o.trim()).filter(Boolean) })) };
    try { t ? await api.put(`/student-requests/types/${t.id}`, body) : await api.post('/student-requests/types', body); onSaved(); }
    catch (e: any) { setErr(e?.response?.data?.detail || 'فشل الحفظ'); }
  };
  const togFac = (id: string) => setF({ ...f, faculty_ids: f.faculty_ids.includes(id) ? f.faculty_ids.filter((x) => x !== id) : [...f.faculty_ids, id] });
  return (
    <ModalShell title={t ? 'تعديل نموذج' : 'نموذج جديد'} icon="create-outline" onClose={onClose} testID="rt-modal">
      <TextInput value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder="اسم النموذج (مثال: إفادة قيد)" style={[rqs.input, { minHeight: 38 }]} testID="rt-name" />
      <TextInput value={f.description} onChangeText={(v) => setF({ ...f, description: v })} placeholder="وصف يظهر للطالب" style={rqs.input} multiline testID="rt-description" />
      <Text style={[rqs.h, { fontSize: 13, marginTop: 10 }]}>الكليات (بلا اختيار = كل الكليات)</Text>
      <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {faculties.map((x) => { const on = f.faculty_ids.includes(x.id); return (
          <TouchableOpacity key={x.id} onPress={() => togFac(x.id)} style={[rqs.chip, on && { backgroundColor: '#1a2540', borderColor: '#1a2540' }]} testID={`rt-fac-${x.id}`}>
            <Text style={{ fontSize: 12, color: on ? '#fff' : '#1a2540' }}>{x.name}</Text>
          </TouchableOpacity>); })}
      </View>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Switch value={f.require_attachment} onValueChange={(v) => setF({ ...f, require_attachment: v })} testID="rt-require-attachment" />
        <Text style={rqs.muted}>المرفق إلزامي</Text>
        {f.require_attachment && <TextInput value={f.attachment_label} onChangeText={(v) => setF({ ...f, attachment_label: v })} placeholder="وصف المرفق (مثال: صورة البطاقة)" style={[rqs.input, { marginTop: 0, minHeight: 34, flex: 1 }]} testID="rt-attachment-label" />}
        <Switch value={f.is_active} onValueChange={(v) => setF({ ...f, is_active: v })} testID="rt-active" /><Text style={rqs.muted}>مفعّل</Text>
      </View>
      <View style={[rqs.row, { marginTop: 12 }]}>
        <Text style={[rqs.h, { fontSize: 13 }]}>حقول النموذج ({f.fields.length})</Text>
        <Btn icon="add" label="إضافة حقل" color="#1565c0" outline onPress={() => setF({ ...f, fields: [...f.fields, { key: '', label: '', type: 'text', required: false, options: [] }] })} testID="rt-add-field" />
      </View>
      {f.fields.map((x, i) => <FieldRow key={i} f={x} i={i} set={(n) => setF({ ...f, fields: f.fields.map((y, j) => (j === i ? n : y)) })} del={() => setF({ ...f, fields: f.fields.filter((_, j) => j !== i) })} />)}
      {!!err && <Text style={{ color: '#c62828', textAlign: 'right', marginTop: 6 }} testID="rt-error">{err}</Text>}
      <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 12 }}>
        <Btn icon="save-outline" label="حفظ" color="#2e7d32" onPress={save} disabled={!f.name.trim()} testID="rt-save" />
        <Btn icon="close" label="إلغاء" color="#64748b" outline onPress={onClose} testID="rt-cancel" />
      </View>
    </ModalShell>
  );
};

export const RequestTypesEditor = ({ faculties }: { faculties: any[] }) => {
  const [items, setItems] = useState<ReqType[]>([]);
  const [edit, setEdit] = useState<ReqType | null | 'new'>(null);
  const load = useCallback(() => api.get('/student-requests/types', { params: { all: true } }).then((r) => setItems(r.data.items || [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const del = async (t: ReqType) => {
    if (typeof window !== 'undefined' && !window.confirm(`حذف النموذج «${t.name}»؟ (إن كان مستخدماً سيُوقف بدل حذفه)`)) return;
    const r = await api.delete(`/student-requests/types/${t.id}`); window.alert?.(r.data.message); load();
  };
  const facName = (ids: string[]) => (ids.length ? ids.map((i) => faculties.find((x) => x.id === i)?.name || '').filter(Boolean).join('، ') : 'كل الكليات');
  return (
    <View style={{ gap: 10 }} testID="rt-editor">
      <View style={rqs.row}>
        <Text style={rqs.muted}>النماذج التي يقدمها الطلاب من التطبيق. «تبرير غياب» نموذج مدمج يظهر للطالب تلقائياً.</Text>
        <Btn icon="add-circle-outline" label="نموذج جديد" color="#1a2540" onPress={() => setEdit('new')} testID="rt-new-btn" />
      </View>
      {items.map((t) => (
        <View key={t.id} style={rqs.card} testID={`rt-card-${t.id}`}>
          <View style={rqs.row}>
            <Text style={rqs.h}>{t.name}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 6, alignItems: 'center' }}>
              <Badge text={t.is_active ? 'مفعّل' : 'موقوف'} color={t.is_active ? '#2e7d32' : '#94a3b8'} />
              <TouchableOpacity onPress={() => setEdit(t)} testID={`rt-edit-${t.id}`}><Ionicons name="create-outline" size={18} color="#1565c0" /></TouchableOpacity>
              <TouchableOpacity onPress={() => del(t)} testID={`rt-delete-${t.id}`}><Ionicons name="trash-outline" size={18} color="#c62828" /></TouchableOpacity>
            </View>
          </View>
          {!!t.description && <Text style={rqs.muted}>{t.description}</Text>}
          <Text style={rqs.muted}>{t.fields.length} حقل · {t.require_attachment ? `مرفق إلزامي${t.attachment_label ? `: ${t.attachment_label}` : ''}` : 'المرفق اختياري'} · {facName(t.faculty_ids)}</Text>
        </View>
      ))}
      {!items.length && <Text style={[rqs.muted, { textAlign: 'center', padding: 20 }]}>لا توجد نماذج بعد — أضف أول نموذج</Text>}
      {edit && <TypeModal t={edit === 'new' ? null : edit} faculties={faculties} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </View>
  );
};
