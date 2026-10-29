import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { advancedAccessAPI } from '../../services/api';
import { COLORS, SCOPE_TYPE_LABELS } from './shared';

const BROWSABLE = ['faculty', 'department', 'unit', 'course'];

export const AdvScopesBrowser: React.FC = () => {
  const [type, setType] = useState('faculty');
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    advancedAccessAPI.getScopeOptions(type).then(res => setOptions(res.data)).finally(() => setLoading(false));
  }, [type]);

  return (
    <View testID="adv-scopes-browser">
      <Text style={styles.title}>النطاقات الإدارية والأكاديمية المتاحة</Text>
      <Text style={styles.desc}>تُقرأ مباشرة من قاعدة البيانات — أي وحدة جديدة تُضاف بالنظام الحالي تظهر هنا تلقائيًا دون أي تعديل كود</Text>
      <View style={styles.tabRow}>
        {BROWSABLE.map(t => (
          <TouchableOpacity key={t} style={[styles.chip, type === t && styles.chipActive]} onPress={() => setType(t)} testID={`adv-scope-type-${t}`}>
            <Text style={[styles.chipText, type === t && styles.chipTextActive]}>{SCOPE_TYPE_LABELS[t]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} /> : (
        <>
          <Text style={styles.count}>العدد الحالي: {options.length}</Text>
          {options.map(o => (
            <View key={o.id} style={styles.row} testID={`adv-scope-option-${o.id}`}>
              <Text style={styles.rowText}>{o.name}</Text>
            </View>
          ))}
          {options.length === 0 && <Text style={styles.empty}>لا توجد عناصر حاليًا</Text>}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  desc: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginTop: 4, marginBottom: 12 },
  tabRow: { flexDirection: 'row-reverse', gap: 6, marginBottom: 10 },
  chip: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, color: COLORS.text },
  chipTextActive: { color: '#fff' },
  count: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginBottom: 8 },
  row: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  rowText: { fontSize: 13, color: COLORS.text, textAlign: 'right' },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 20 },
});
