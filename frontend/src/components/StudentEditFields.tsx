import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';

export interface StudentEditValues {
  student_id: string;
  full_name: string;
  phone: string;
  email: string;
  nationality: string;
  gender: string;
  level: string;
  section: string;
  program_code: string;
  enrollment_year: string;
}

export const emptyStudentEdit: StudentEditValues = {
  student_id: '', full_name: '', phone: '', email: '', nationality: '', gender: '',
  level: '1', section: '', program_code: '', enrollment_year: '',
};

export const studentToEditValues = (s: any): StudentEditValues => ({
  student_id: s?.student_id || '',
  full_name: s?.full_name || '',
  phone: s?.phone || '',
  email: s?.email || '',
  nationality: s?.nationality || '',
  gender: s?.gender || '',
  level: String(s?.level || '1'),
  section: s?.section || '',
  program_code: s?.program_code || '',
  enrollment_year: s?.enrollment_year ? String(s.enrollment_year) : '',
});

export const PROGRAM_OPTIONS: Array<[string, string]> = [
  ['', '(غير محدد)'], ['B', 'بكالوريوس (B)'], ['M', 'ماجستير (M)'], ['D', 'دكتوراه (D)'], ['P', 'دبلوم (P)'], ['E', 'عن بُعد (E)'],
];

export const GENDER_OPTIONS: Array<[string, string]> = [['', 'حسب الكلية'], ['male', 'ذكر'], ['female', 'أنثى']];
const LEVELS = ['1', '2', '3', '4', '5'];

export const GenderPicker: React.FC<{ value: string; onChange: (v: string) => void; testPrefix: string }> = ({ value, onChange, testPrefix }) => (
  <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
    {GENDER_OPTIONS.map(([v, l]) => (
      <TouchableOpacity
        key={v}
        onPress={() => onChange(v)}
        style={[st.chip, value === v && { backgroundColor: v === 'female' ? '#ad1457' : v === 'male' ? '#1565c0' : '#455a64' }]}
        testID={`${testPrefix}-gender-${v || 'auto'}`}
      >
        <Text style={[st.chipText, value === v && { color: '#fff' }]}>{l}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

interface Props {
  values: StudentEditValues;
  onChange: (next: StudentEditValues) => void;
  isAdmin: boolean;
  originalLevel: string;
  originalSection: string;
  /** الشعب الموجودة في مستوى معيّن داخل القسم */
  sectionsAtLevel: (level: string) => string[];
}

export const StudentEditFields: React.FC<Props> = ({ values, onChange, isAdmin, originalLevel, originalSection, sectionsAtLevel }) => {
  const set = (patch: Partial<StudentEditValues>) => onChange({ ...values, ...patch });
  const suggestions = sectionsAtLevel(values.level);

  return (
    <View testID="student-edit-fields">
      {isAdmin && (
        <>
          <Text style={st.label}>رقم القيد *</Text>
          <TextInput
            style={[st.input, { fontFamily: 'monospace', fontSize: 15, backgroundColor: '#fff9c4' }]}
            value={values.student_id}
            onChangeText={(t) => set({ student_id: t.trim() })}
            placeholder="رقم القيد (مثال: 1025037)"
            placeholderTextColor="#a8b1c2"
            autoCapitalize="none"
            testID="edit-student-id-input"
          />
          <Text style={st.warn}>⚠️ تغيير رقم القيد سيؤثر على تسجيل الدخول (اسم المستخدم سيتحدّث تلقائياً) - متاح للمدير العام فقط</Text>
        </>
      )}

      <Text style={st.label}>الاسم الكامل *</Text>
      <TextInput style={st.input} value={values.full_name} onChangeText={(t) => set({ full_name: t })}
        placeholder="الاسم الكامل" placeholderTextColor="#a8b1c2" testID="edit-name-input" />

      <Text style={st.label}>المستوى</Text>
      <View style={{ flexDirection: 'row-reverse', gap: 6, flexWrap: 'wrap' }}>
        {LEVELS.map(lvl => (
          <TouchableOpacity key={lvl} style={[st.chip, values.level === lvl && { backgroundColor: '#1565c0' }]}
            onPress={() => set({ level: lvl })} testID={`edit-level-${lvl}`}>
            <Text style={[st.chipText, values.level === lvl && { color: '#fff' }]}>م{lvl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={st.label}>الشعبة</Text>
      {values.level !== originalLevel && originalSection ? (
        <View testID="section-reassign-notice" style={st.notice}>
          <Text style={st.noticeText}>
            ⚠️ تم تغيير المستوى من م{originalLevel} إلى م{values.level}.{'\n'}
            الشعبة الحالية: <Text style={{ fontWeight: '800' }}>{originalSection}</Text>
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <TouchableOpacity testID="section-keep-btn"
              style={[st.noticeBtn, { backgroundColor: values.section === originalSection ? '#2e7d32' : '#e8f5e9' }]}
              onPress={() => set({ section: originalSection })}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: values.section === originalSection ? '#fff' : '#2e7d32' }}>احتفظ بـ {originalSection}</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="section-clear-btn"
              style={[st.noticeBtn, { backgroundColor: values.section === '' ? '#c62828' : '#ffebee' }]}
              onPress={() => set({ section: '' })}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: values.section === '' ? '#fff' : '#c62828' }}>بلا شعبة</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      {suggestions.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          <Text style={{ fontSize: 11, color: '#666', width: '100%', textAlign: 'right' }}>الشعب الموجودة في م{values.level}:</Text>
          {suggestions.map(sec => (
            <TouchableOpacity key={sec} testID={`section-suggest-${sec}`} onPress={() => set({ section: sec })}
              style={[st.secChip, values.section === sec && { backgroundColor: '#1976d2', borderColor: '#1976d2' }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: values.section === sec ? '#fff' : '#1976d2' }}>{sec}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TextInput style={st.input} value={values.section} onChangeText={(t) => set({ section: t })}
        placeholder="الشعبة (اختياري) - أو إدخال يدوي" placeholderTextColor="#a8b1c2" testID="edit-section-input" />

      <View style={st.row}>
        <View style={{ flex: 1 }}>
          <Text style={st.label}>البرنامج</Text>
          <View style={st.pickerWrap}>
            <Picker selectedValue={values.program_code} onValueChange={(v) => set({ program_code: String(v) })} style={st.picker} testID="edit-program-picker">
              {PROGRAM_OPTIONS.map(([v, l]) => <Picker.Item key={v} label={l} value={v} />)}
            </Picker>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.label}>سنة الالتحاق (مثال: 25)</Text>
          <TextInput style={st.input} value={values.enrollment_year}
            onChangeText={(t) => set({ enrollment_year: t.replace(/[^0-9]/g, '').slice(0, 2) })}
            placeholder="25 / 26 / 27" placeholderTextColor="#a8b1c2" keyboardType="number-pad" maxLength={2} testID="edit-enrollment-year-input" />
        </View>
      </View>

      <Text style={st.label}>الجنسية</Text>
      <TextInput style={st.input} value={values.nationality} onChangeText={(t) => set({ nationality: t })}
        placeholder="يمني (اختياري)" placeholderTextColor="#a8b1c2" testID="edit-nationality-input" />

      <Text style={st.label}>الجنس (لصيغة الإفادات: الطالب/الطالبة)</Text>
      <GenderPicker value={values.gender} onChange={(v) => set({ gender: v })} testPrefix="edit-student" />

      <Text style={st.label}>الهاتف</Text>
      <TextInput style={st.input} value={values.phone} onChangeText={(t) => set({ phone: t })}
        placeholder="رقم الهاتف (اختياري)" placeholderTextColor="#a8b1c2" keyboardType="phone-pad" testID="edit-phone-input" />

      <Text style={st.label}>البريد الإلكتروني</Text>
      <TextInput style={st.input} value={values.email} onChangeText={(t) => set({ email: t })}
        placeholder="البريد الإلكتروني (اختياري)" placeholderTextColor="#a8b1c2" keyboardType="email-address" autoCapitalize="none" testID="edit-email-input" />
    </View>
  );
};

const st = StyleSheet.create({
  label: { fontSize: 13, color: '#5b6678', textAlign: 'right', marginBottom: 6, marginTop: 10, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#dfe5ee', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, color: '#1a2540', backgroundColor: '#fafbfd', textAlign: 'right' },
  warn: { fontSize: 11, color: '#f57f17', marginTop: 4, textAlign: 'right' },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#f1f5f9' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  secChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#bbdefb', backgroundColor: '#e3f2fd' },
  notice: { backgroundColor: '#fff8e1', borderWidth: 1, borderColor: '#ffe082', borderRadius: 8, padding: 10, marginBottom: 8 },
  noticeText: { fontSize: 12, color: '#795548', textAlign: 'right', marginBottom: 6, fontWeight: '600' },
  noticeBtn: { flex: 1, padding: 8, borderRadius: 6, alignItems: 'center', minWidth: 90 },
  row: { flexDirection: 'row', gap: 10 },
  pickerWrap: { borderWidth: 1, borderColor: '#dfe5ee', borderRadius: 10, backgroundColor: '#fafbfd', overflow: 'hidden' },
  picker: { height: 44, color: '#1a2540' },
});
