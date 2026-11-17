import React, { useEffect, useState } from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import api from '../services/api';

let cache: string[] | null = null;

/** 🌍 قائمة منسدلة للجنسية من القائمة المعتمدة — تُبقي القيمة الحالية غير المعتمدة ظاهرة كي لا تُمسح */
export const NationalityPicker = ({ value, onChange, testID, style, emptyLabel = '— اختر الجنسية —' }: {
  value: string; onChange: (v: string) => void; testID?: string; style?: StyleProp<ViewStyle>; emptyLabel?: string;
}) => {
  const [items, setItems] = useState<string[]>(cache || []);
  useEffect(() => {
    api.get('/admin/students/nationalities').then(r => { cache = r.data.items || []; setItems(cache!); }).catch(() => {});
  }, []);
  const v = (value || '').trim();
  const unknown = v && items.length > 0 && !items.includes(v);
  return (
    <View style={[{ borderWidth: 1, borderColor: '#dde3ec', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' }, style]}>
      <Picker selectedValue={v} onValueChange={(x) => onChange(String(x))} testID={testID}>
        <Picker.Item label={emptyLabel} value="" />
        {unknown ? <Picker.Item label={`${v} (غير معتمدة — اختر بديلاً)`} value={v} /> : null}
        {items.map(n => <Picker.Item key={n} label={n} value={n} />)}
      </Picker>
    </View>
  );
};
