import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS, OP_TYPE_LABELS, SENSITIVITY_LABELS } from './shared';

export const AdvPermissionsBrowser: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [opFilter, setOpFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, p] = await Promise.all([advancedAccessAPI.getPermissionGroups(), advancedAccessAPI.getPermissions()]);
      setGroups(g.data); setPermissions(p.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return permissions.filter(p =>
      (!groupFilter || p.group_key === groupFilter) &&
      (!opFilter || p.operation_type === opFilter) &&
      (!search || p.label_ar.includes(search) || p.linked_api.toLowerCase().includes(search.toLowerCase()))
    );
  }, [permissions, groupFilter, opFilter, search]);

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />;

  return (
    <View data-testid="adv-permissions-browser">
      <Text style={styles.title}>سجل الصلاحيات التفصيلي ({permissions.length})</Text>
      <TextInput style={styles.search} placeholder="ابحث بالاسم أو واجهة API..." value={search} onChangeText={setSearch} textAlign="right" data-testid="adv-perm-search-input" />
      <View style={styles.filterRow}>
        <TouchableOpacity style={[styles.chip, !groupFilter && styles.chipActive]} onPress={() => setGroupFilter('')} data-testid="adv-perm-group-all">
          <Text style={[styles.chipText, !groupFilter && styles.chipTextActive]}>كل المجموعات</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        horizontal showsHorizontalScrollIndicator={false}
        data={groups} keyExtractor={g => g.key} style={{ marginBottom: 10 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.chip, groupFilter === item.key && styles.chipActive]} onPress={() => setGroupFilter(groupFilter === item.key ? '' : item.key)} data-testid={`adv-perm-group-${item.key}`}>
            <Text style={[styles.chipText, groupFilter === item.key && styles.chipTextActive]}>{item.name_ar} ({item.count})</Text>
          </TouchableOpacity>
        )}
      />
      <View style={styles.filterRow}>
        {Object.entries(OP_TYPE_LABELS).slice(0, 10).map(([k, v]) => (
          <TouchableOpacity key={k} style={[styles.chipSm, opFilter === k && styles.chipActive]} onPress={() => setOpFilter(opFilter === k ? '' : k)} data-testid={`adv-perm-op-${k}`}>
            <Text style={[styles.chipTextSm, opFilter === k && styles.chipTextActive]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.resultCount}>النتائج: {filtered.length}</Text>
      {filtered.slice(0, 200).map(p => (
        <View key={p.key} style={styles.permRow} data-testid={`adv-perm-row-${p.key}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.permLabel}>{p.label_ar}</Text>
            <Text style={styles.permApi}>{p.linked_api}</Text>
          </View>
          <View style={[styles.sensBadge, { backgroundColor: (SENSITIVITY_LABELS[p.sensitivity] || {}).color || '#999' }]}>
            <Text style={styles.sensBadgeText}>{(SENSITIVITY_LABELS[p.sensitivity] || {}).label}</Text>
          </View>
        </View>
      ))}
      {filtered.length > 200 && <Text style={styles.moreText}>يُعرض أول 200 نتيجة فقط — ضيّق البحث لعرض المزيد</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, textAlign: 'right', marginBottom: 10 },
  search: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, padding: 10, marginBottom: 10 },
  filterRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 6 },
  chipSm: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4 },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, color: COLORS.text },
  chipTextSm: { fontSize: 11, color: COLORS.text },
  chipTextActive: { color: '#fff' },
  resultCount: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginBottom: 6 },
  permRow: { flexDirection: 'row-reverse', backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 8 },
  permLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right' },
  permApi: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 2 },
  sensBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  sensBadgeText: { color: '#fff', fontSize: 10 },
  moreText: { textAlign: 'center', color: COLORS.textMuted, fontSize: 12, marginTop: 8 },
});
