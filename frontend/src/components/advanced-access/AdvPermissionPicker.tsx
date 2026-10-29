import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS, OP_TYPE_LABELS } from './shared';

interface Props {
  selected: string[];
  onChange: (keys: string[]) => void;
}

const QUICK_OPS = ['view_list', 'view_detail', 'add', 'edit', 'delete', 'export', 'approve', 'publish'];

export const AdvPermissionPicker: React.FC<Props> = ({ selected, onChange }) => {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<{ [k: string]: boolean }>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([advancedAccessAPI.getPermissionGroups(), advancedAccessAPI.getPermissions()])
      .then(([g, p]) => { setGroups(g.data); setPermissions(p.data); })
      .finally(() => setLoading(false));
  }, []);

  const selectedSet = new Set(selected);
  const byGroup = useMemo(() => {
    const m: { [k: string]: any[] } = {};
    permissions.forEach(p => {
      if (search && !p.label_ar.includes(search)) return;
      (m[p.group_key] = m[p.group_key] || []).push(p);
    });
    return m;
  }, [permissions, search]);

  const toggleOne = (key: string) => {
    onChange(selectedSet.has(key) ? selected.filter(k => k !== key) : [...selected, key]);
  };

  const toggleGroup = (groupKey: string) => {
    const keys = (byGroup[groupKey] || []).map(p => p.key);
    const allSelected = keys.every(k => selectedSet.has(k));
    onChange(allSelected ? selected.filter(k => !keys.includes(k)) : Array.from(new Set([...selected, ...keys])));
  };

  const selectByOp = (op: string) => {
    const keys = permissions.filter(p => p.operation_type === op).map(p => p.key);
    const allSelected = keys.every(k => selectedSet.has(k));
    onChange(allSelected ? selected.filter(k => !keys.includes(k)) : Array.from(new Set([...selected, ...keys])));
  };

  if (loading) return <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 20 }} />;

  return (
    <View data-testid="adv-permission-picker">
      <Text style={styles.countLabel}>المختار: {selected.length} / {permissions.length}</Text>
      <TextInput style={styles.search} placeholder="بحث سريع عن صلاحية..." value={search} onChangeText={setSearch} textAlign="right" data-testid="adv-picker-search" />
      <View style={styles.quickRow}>
        {QUICK_OPS.map(op => (
          <TouchableOpacity key={op} style={styles.quickChip} onPress={() => selectByOp(op)} data-testid={`adv-picker-quick-${op}`}>
            <Text style={styles.quickChipText}>{OP_TYPE_LABELS[op]} فقط</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView style={{ maxHeight: 420 }} nestedScrollEnabled>
        {groups.map(g => {
          const items = byGroup[g.key] || [];
          if (search && items.length === 0) return null;
          const selCount = items.filter(p => selectedSet.has(p.key)).length;
          const isOpen = !!expanded[g.key];
          return (
            <View key={g.key} style={styles.groupBox}>
              <TouchableOpacity style={styles.groupHeader} onPress={() => setExpanded(e => ({ ...e, [g.key]: !e[g.key] }))} data-testid={`adv-picker-group-toggle-${g.key}`}>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
                <Text style={styles.groupCount}>{selCount}/{items.length}</Text>
                <TouchableOpacity onPress={() => toggleGroup(g.key)} style={styles.groupCheckbox} data-testid={`adv-picker-group-selectall-${g.key}`}>
                  <Ionicons name={selCount === items.length ? 'checkbox' : selCount > 0 ? 'remove-circle' : 'square-outline'} size={20} color={COLORS.primary} />
                </TouchableOpacity>
                <Text style={styles.groupName}>{g.name_ar}</Text>
              </TouchableOpacity>
              {isOpen && items.map(p => (
                <TouchableOpacity key={p.key} style={styles.permRow} onPress={() => toggleOne(p.key)} data-testid={`adv-picker-perm-${p.key}`}>
                  <Ionicons name={selectedSet.has(p.key) ? 'checkbox' : 'square-outline'} size={18} color={COLORS.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.permLabel}>{p.label_ar}</Text>
                    <Text style={styles.permApi}>{p.linked_api}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  countLabel: { fontSize: 13, fontWeight: 'bold', color: COLORS.primary, textAlign: 'right', marginBottom: 8 },
  search: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, padding: 8, marginBottom: 8 },
  quickRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  quickChip: { backgroundColor: COLORS.primaryLight, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4 },
  quickChipText: { fontSize: 11, color: COLORS.primary },
  groupBox: { backgroundColor: '#fff', borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  groupHeader: { flexDirection: 'row-reverse', alignItems: 'center', padding: 10, gap: 8 },
  groupName: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right' },
  groupCount: { fontSize: 11, color: COLORS.textMuted },
  groupCheckbox: { padding: 2 },
  permRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, gap: 8, borderTopWidth: 1, borderTopColor: COLORS.bg },
  permLabel: { fontSize: 12, color: COLORS.text, textAlign: 'right' },
  permApi: { fontSize: 10, color: COLORS.textMuted, textAlign: 'right' },
});
