import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

export interface Opt { id: string; name: string }

export const ChipRow = ({ label, options, value, onChange, testPrefix, allLabel }: {
  label: string; options: Opt[]; value: string; onChange: (v: string) => void; testPrefix: string; allLabel?: string;
}) => (
  <View style={rs.block}>
    <Text style={rs.label}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rs.row}>
      {allLabel !== undefined && (
        <TouchableOpacity style={[rs.chip, !value && rs.chipOn]} onPress={() => onChange('')} testID={`${testPrefix}-all`}>
          <Text style={[rs.chipTxt, !value && rs.chipTxtOn]}>{allLabel}</Text>
        </TouchableOpacity>
      )}
      {options.map((o) => (
        <TouchableOpacity key={o.id} style={[rs.chip, value === o.id && rs.chipOn]} onPress={() => onChange(o.id)} testID={`${testPrefix}-${o.id}`}>
          <Text style={[rs.chipTxt, value === o.id && rs.chipTxtOn]}>{o.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  </View>
);

export const LEVELS: Opt[] = [1, 2, 3, 4, 5, 6].map((n) => ({ id: String(n), name: `المستوى ${n}` }));
export const SEMS: Opt[] = [{ id: '1', name: 'الفصل الأول' }, { id: '2', name: 'الفصل الثاني' }];
export const val = (x: string | null | undefined) => x ?? 'لم تصدر بعد';

export const rs = StyleSheet.create({
  block: { marginBottom: 8 },
  label: { fontSize: 12, color: '#64748b', textAlign: 'right', marginBottom: 4 },
  row: { flexDirection: 'row-reverse', gap: 6, paddingBottom: 2 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  chipTxt: { color: '#334155', fontSize: 12.5, fontWeight: '600' },
  chipTxtOn: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  btn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: '#fff', fontWeight: '700' },
  title: { fontWeight: '800', color: '#1a2540', textAlign: 'right' },
  hint: { fontSize: 12.5, color: '#1e3a5f', textAlign: 'right', lineHeight: 20 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, textAlign: 'right' },
});
