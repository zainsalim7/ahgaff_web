import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';

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

export const PickerField = ({ label, options, value, onChange, testID, allLabel, placeholder, maxWidth, enabled = true }: {
  label: string; options: Opt[]; value: string; onChange: (v: string) => void; testID: string; allLabel?: string; placeholder?: string; maxWidth?: number; enabled?: boolean;
}) => (
  <View style={[rs.field, maxWidth ? { maxWidth } : null]}>
    <Text style={rs.fieldLbl}>{label}</Text>
    <View style={[rs.dropdown, !enabled && { backgroundColor: '#f4f6fb' }]}>
      <Picker selectedValue={value} onValueChange={(v) => onChange(String(v))} style={rs.dropdownInner} enabled={enabled} testID={testID}>
        {allLabel !== undefined ? <Picker.Item label={allLabel} value="" /> : <Picker.Item label={placeholder || 'اختر...'} value="" />}
        {options.map((o) => <Picker.Item key={o.id} label={o.name} value={o.id} />)}
      </Picker>
    </View>
  </View>
);

export const ModalShell = ({ title, icon, onClose, children, testID }: { title: string; icon: any; onClose: () => void; children: React.ReactNode; testID: string }) => (
  <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={rs.overlay}>
      <View style={rs.sheet} testID={testID}>
        <View style={rs.sheetHead}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
            <View style={rs.sheetIcon}><Ionicons name={icon} size={18} color="#2962ff" /></View>
            <Text style={rs.sheetTitle}>{title}</Text>
          </View>
          <TouchableOpacity onPress={onClose} testID={`${testID}-close`}><Ionicons name="close" size={22} color="#5b6678" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 18 }}>{children}</ScrollView>
      </View>
    </View>
  </Modal>
);

export const downloadBlob = (data: any, name: string) => {
  const url = window.URL.createObjectURL(new Blob([data]));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  window.URL.revokeObjectURL(url);
};

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
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#eef1f6' },
  btn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: '#fff', fontWeight: '700' },
  title: { fontWeight: '800', color: '#1a2540', textAlign: 'right' },
  hint: { fontSize: 12.5, color: '#1e3a5f', textAlign: 'right', lineHeight: 20 },
  field: { flex: 1, minWidth: 150 },
  fieldLbl: { fontSize: 12, color: '#5b6678', fontWeight: '500', marginBottom: 5, textAlign: 'right' },
  dropdown: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e3e7ee', height: 40, overflow: 'hidden', justifyContent: 'center' },
  dropdownInner: { height: 40, fontSize: 13, color: '#1a2540', textAlign: 'right', backgroundColor: 'transparent', borderWidth: 0 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 16 },
  sheet: { backgroundColor: '#f4f6fb', borderRadius: 14, maxHeight: '94%', width: '100%', maxWidth: 980, alignSelf: 'center', overflow: 'hidden' },
  sheetHead: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eef1f6' },
  sheetIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#eef4ff', alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#1a2540' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, textAlign: 'right' },
});
