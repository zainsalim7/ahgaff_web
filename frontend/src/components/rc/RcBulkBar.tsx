import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Field, FIELD_AR, Btn, rc } from './rcUi';

export const RcBulkBar = ({ count, fields, onApply, onClear }: { count: number; fields: Field[]; onApply: (f: Field, v: string) => void; onClear: () => void }) => {
  const [f, setF] = useState<Field>(fields[0]);
  const [v, setV] = useState('');
  const field = fields.includes(f) ? f : fields[0];
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap', backgroundColor: '#eef4ff', borderRadius: 10, padding: 10, marginBottom: 10 }} testID="rc-bulk-bar">
      <Text style={{ fontWeight: '800', color: '#1a2540' }} testID="rc-bulk-count">محدد {count} طالب</Text>
      {fields.length > 1 && fields.map((x) => (
        <TouchableOpacity key={x} onPress={() => setF(x)} testID={`rc-bulk-field-${x}`}
          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: field === x ? '#2962ff' : '#cbd5e1', backgroundColor: field === x ? '#2962ff' : '#fff' }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: field === x ? '#fff' : '#1a2540' }}>{FIELD_AR[x]}</Text>
        </TouchableOpacity>
      ))}
      <TextInput style={rc.input} value={v} onChangeText={setV} placeholder="الدرجة" testID="rc-bulk-value" />
      <Btn icon="checkmark" label="تعبئة المحدد" color="#2962ff" onPress={() => onApply(field, v)} disabled={!v.trim()} testID="rc-bulk-apply-btn" />
      <Btn icon="remove-circle-outline" label="إلغاء الرصد (-)" color="#c62828" outline onPress={() => onApply(field, '-')} testID="rc-bulk-unset-btn" />
      <Btn icon="close" label="إلغاء التحديد" color="#64748b" outline onPress={onClear} testID="rc-bulk-clear-btn" />
      <Text style={{ fontSize: 11.5, color: '#475569' }}>تُعبَّأ الخانات المسموحة فقط، ثم اضغط «حفظ التعديلات»</Text>
    </View>
  );
};
