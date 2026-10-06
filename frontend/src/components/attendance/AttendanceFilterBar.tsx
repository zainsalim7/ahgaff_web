import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type AttFilter = { from: string; to: string; absentOnly: boolean };
export const EMPTY_ATT_FILTER: AttFilter = { from: '', to: '', absentOnly: false };

export const applyAttFilter = <T extends { date: string; status: string }>(records: T[], f: AttFilter): T[] =>
  records.filter((r) => {
    const d = (r.date || '').slice(0, 10);
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    if (f.absentOnly && r.status === 'present') return false;
    return true;
  });

export const DateField = ({ value, onChange, label, testID }: { value: string; onChange: (v: string) => void; label: string; testID: string }) => (
  <View style={st.field}>
    <Text style={st.label}>{label}</Text>
    {Platform.OS === 'web' ? (
      <input type="date" value={value} onChange={(e: any) => onChange(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px', fontSize: 12, color: '#0f2440', fontFamily: 'inherit', direction: 'ltr', background: '#fff' }} data-testid={testID} />
    ) : (
      <TextInput value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" placeholderTextColor="#a8b1c2" style={st.input} testID={testID} />
    )}
  </View>
);

export const AttendanceFilterBar = ({ value, onChange, count, testID = 'att-filter' }: { value: AttFilter; onChange: (f: AttFilter) => void; count: number; testID?: string }) => {
  const active = !!(value.from || value.to || value.absentOnly);
  return (
    <View style={st.bar} testID={testID}>
      <DateField label="من" value={value.from} onChange={(from) => onChange({ ...value, from })} testID={`${testID}-from`} />
      <DateField label="إلى" value={value.to} onChange={(to) => onChange({ ...value, to })} testID={`${testID}-to`} />
      <TouchableOpacity onPress={() => onChange({ ...value, absentOnly: !value.absentOnly })} style={[st.toggle, value.absentOnly && st.toggleOn]} testID={`${testID}-absent-only`}>
        <Ionicons name={value.absentOnly ? 'checkbox' : 'square-outline'} size={14} color={value.absentOnly ? '#c62828' : '#5b6678'} />
        <Text style={[st.toggleText, value.absentOnly && { color: '#c62828' }]}>الغيابات فقط</Text>
      </TouchableOpacity>
      <Text style={st.count} testID={`${testID}-count`}>{count} سجل</Text>
      {active && (
        <TouchableOpacity onPress={() => onChange(EMPTY_ATT_FILTER)} style={st.clear} testID={`${testID}-clear`}>
          <Ionicons name="close-circle" size={14} color="#8a95a8" />
          <Text style={st.clearText}>مسح</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const st = StyleSheet.create({
  bar: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 8, backgroundColor: '#f7f9fc', borderRadius: 10, padding: 8, marginBottom: 10 },
  field: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  label: { fontSize: 11.5, color: '#5b6678', fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, minWidth: 100, color: '#0f2440', backgroundColor: '#fff' },
  toggle: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  toggleOn: { borderColor: '#ef9a9a', backgroundColor: '#ffebee' },
  toggleText: { fontSize: 11.5, color: '#5b6678', fontWeight: '700' },
  count: { fontSize: 11.5, color: '#1565c0', fontWeight: '800', marginRight: 'auto' as any },
  clear: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  clearText: { fontSize: 11, color: '#8a95a8' },
});
