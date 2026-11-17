import React from 'react';
import { View, Text, TextInput, Platform, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';

export interface StudentIdentityValues {
  full_name_en: string;
  birth_date: string;
  birth_place: string;
  id_type: string;
  id_number: string;
  id_expiry_date: string;
  marital_status: string;
}

export const IDENTITY_KEYS: (keyof StudentIdentityValues)[] = ['full_name_en', 'birth_date', 'birth_place', 'id_type', 'id_number', 'id_expiry_date', 'marital_status'];
export const emptyIdentity: StudentIdentityValues = { full_name_en: '', birth_date: '', birth_place: '', id_type: '', id_number: '', id_expiry_date: '', marital_status: '' };
export const identityFrom = (s: any): StudentIdentityValues =>
  Object.fromEntries(IDENTITY_KEYS.map(k => [k, s?.[k] ? String(s[k]) : ''])) as any;
/** الحقول غير الفارغة فقط — للإضافة */
export const identityBody = (v: any) =>
  Object.fromEntries(IDENTITY_KEYS.filter(k => (v?.[k] || '').trim()).map(k => [k, v[k].trim()]));

export const ID_TYPES: [string, string][] = [['national_id', 'بطاقة شخصية'], ['passport', 'جواز سفر'], ['residence', 'إقامة'], ['other', 'أخرى']];
export const MARITAL: [string, string][] = [['single', 'أعزب / عزباء'], ['married', 'متزوج / متزوجة'], ['divorced', 'مطلق / مطلقة'], ['widowed', 'أرمل / أرملة']];

const DateField = ({ value, onChange, testID }: { value: string; onChange: (v: string) => void; testID: string }) =>
  Platform.OS === 'web' ? (
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testID}
      style={{ border: '1px solid #dde3ec', borderRadius: 8, padding: 9, fontSize: 13, direction: 'ltr', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }} />
  ) : (
    <TextInput style={s.input} value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" testID={testID} />
  );

const Select = ({ value, onChange, options, testID }: { value: string; onChange: (v: string) => void; options: [string, string][]; testID: string }) => (
  <View style={s.pick}>
    <Picker selectedValue={value} onValueChange={(v) => onChange(String(v))} testID={testID}>
      <Picker.Item label="— غير محدد —" value="" />
      {options.map(([v, l]) => <Picker.Item key={v} label={l} value={v} />)}
    </Picker>
  </View>
);

/** 🪪 الهوية الشخصية — حقول موحّدة لكل نماذج الإضافة والتعديل (كلها اختيارية) */
export const StudentIdentityFields = ({ values, set, testPrefix }: { values: StudentIdentityValues; set: (p: Partial<StudentIdentityValues>) => void; testPrefix: string }) => (
  <View style={s.box} testID={`${testPrefix}-identity-section`}>
    <Text style={s.title}>الهوية الشخصية (اختياري)</Text>
    <Text style={s.label}>الاسم بالإنجليزية</Text>
    <TextInput style={[s.input, { textAlign: 'left' }]} value={values.full_name_en} onChangeText={(t) => set({ full_name_en: t })}
      placeholder="Full name in English" autoCapitalize="words" testID={`${testPrefix}-name-en-input`} />
    <View style={s.row}>
      <View style={s.col}><Text style={s.label}>تاريخ الميلاد</Text>
        <DateField value={values.birth_date} onChange={(v) => set({ birth_date: v })} testID={`${testPrefix}-birth-date-input`} /></View>
      <View style={s.col}><Text style={s.label}>مكان الميلاد</Text>
        <TextInput style={s.input} value={values.birth_place} onChangeText={(t) => set({ birth_place: t })} placeholder="مثل: حضرموت - المكلا" testID={`${testPrefix}-birth-place-input`} /></View>
    </View>
    <View style={s.row}>
      <View style={s.col}><Text style={s.label}>نوع الوثيقة</Text>
        <Select value={values.id_type} onChange={(v) => set({ id_type: v })} options={ID_TYPES} testID={`${testPrefix}-id-type-picker`} /></View>
      <View style={s.col}><Text style={s.label}>رقم الوثيقة</Text>
        <TextInput style={s.input} value={values.id_number} onChangeText={(t) => set({ id_number: t })} placeholder="رقم الهوية / الجواز" testID={`${testPrefix}-id-number-input`} /></View>
    </View>
    <View style={s.row}>
      <View style={s.col}><Text style={s.label}>تاريخ انتهاء الجواز / الإقامة</Text>
        <DateField value={values.id_expiry_date} onChange={(v) => set({ id_expiry_date: v })} testID={`${testPrefix}-id-expiry-input`} /></View>
      <View style={s.col}><Text style={s.label}>الحالة الاجتماعية</Text>
        <Select value={values.marital_status} onChange={(v) => set({ marital_status: v })} options={MARITAL} testID={`${testPrefix}-marital-picker`} /></View>
    </View>
  </View>
);

const label = (opts: [string, string][], v: string) => opts.find(o => o[0] === v)?.[1] || v;

/** عرض مختصر لبيانات الهوية في صفحة الطالب — مع تنبيه انتهاء الوثيقة */
export const StudentIdentitySummary = ({ st }: { st: any }) => {
  const rows: [string, string][] = [
    ['الاسم بالإنجليزية', st?.full_name_en], ['تاريخ الميلاد', st?.birth_date && `\u2066${st.birth_date}\u2069`], ['مكان الميلاد', st?.birth_place],
    [label(ID_TYPES, st?.id_type) || 'رقم الوثيقة', st?.id_number], ['انتهاء الوثيقة', st?.id_expiry_date && `\u2066${st.id_expiry_date}\u2069`],
    ['الحالة الاجتماعية', st?.marital_status ? label(MARITAL, st.marital_status) : ''],
  ].filter(r => r[1]) as any;
  if (!rows.length) return null;
  const days = st?.id_expiry_date ? Math.floor((new Date(st.id_expiry_date).getTime() - Date.now()) / 86400000) : null;
  return (
    <View style={s.sum} testID="student-identity-summary">
      {rows.map(([k, v]) => <Text key={k} style={s.sumTx}><Text style={{ fontWeight: '700' }}>{k}: </Text>{v}</Text>)}
      {days !== null && days < 90 ? (
        <Text style={[s.sumTx, { color: days < 0 ? '#c62828' : '#e65100', fontWeight: '700' }]} testID="student-id-expiry-warning">
          {days < 0 ? `⚠ الوثيقة منتهية منذ ${-days} يوم` : `⚠ الوثيقة تنتهي خلال ${days} يوم`}
        </Text>
      ) : null}
    </View>
  );
};

const s = StyleSheet.create({
  sum: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  sumTx: { fontSize: 12, color: '#5b6678', textAlign: 'right' },
  box: { borderWidth: 1, borderColor: '#e3e8f0', borderRadius: 10, padding: 10, marginTop: 10, marginBottom: 6, backgroundColor: '#fafbfd' },
  title: { fontSize: 13, fontWeight: '800', color: '#1a2540', textAlign: 'right', marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '600', color: '#37474f', marginBottom: 4, marginTop: 6, textAlign: 'right' },
  input: { borderWidth: 1, borderColor: '#dde3ec', borderRadius: 8, padding: 9, fontSize: 13, textAlign: 'right', backgroundColor: '#fff' },
  pick: { borderWidth: 1, borderColor: '#dde3ec', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  row: { flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap' },
  col: { flex: 1, minWidth: 150 },
});
