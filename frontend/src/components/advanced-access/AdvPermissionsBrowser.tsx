import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS, OP_TYPE_LABELS, SENSITIVITY_LABELS } from './shared';

const OP_ICONS: { [key: string]: any } = {
  view_list: 'list', view_detail: 'eye', add: 'add-circle', edit: 'create', delete: 'trash',
  export: 'download', import: 'cloud-upload', print: 'print', approve: 'checkmark-done',
  publish: 'send', restore: 'refresh', bulk: 'layers', clone: 'copy', reset: 'reload',
  sync: 'sync', verify: 'shield-checkmark', generate: 'flash', other: 'ellipse',
};

export const AdvPermissionsBrowser: React.FC = () => {
  const { width } = useWindowDimensions();
  const isNarrow = width < 860;
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

  const Sidebar = (
    <View style={[styles.sidebar, isNarrow && styles.sidebarNarrow]} testID="adv-perm-sidebar">
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={COLORS.textMuted} style={{ marginLeft: 6 }} />
        <TextInput
          style={styles.searchInput} placeholder="ابحث بالاسم أو واجهة API..."
          value={search} onChangeText={setSearch} textAlign="right" testID="adv-perm-search-input"
        />
      </View>

      <Text style={styles.sideLabel}>نوع العملية</Text>
      <View style={styles.chipsWrap}>
        {Object.entries(OP_TYPE_LABELS).slice(0, 10).map(([k, v]) => (
          <TouchableOpacity
            key={k} style={[styles.chipSm, opFilter === k && styles.chipActive]}
            onPress={() => setOpFilter(opFilter === k ? '' : k)} testID={`adv-perm-op-${k}`}
          >
            <Text style={[styles.chipTextSm, opFilter === k && styles.chipTextActive]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sideLabel}>المجموعات ({groups.length})</Text>
      <TouchableOpacity
        style={[styles.groupRow, !groupFilter && styles.groupRowActive]}
        onPress={() => setGroupFilter('')} testID="adv-perm-group-all"
      >
        <Text style={[styles.groupRowText, !groupFilter && styles.groupRowTextActive]}>كل المجموعات</Text>
        <View style={[styles.countBubble, !groupFilter && styles.countBubbleActive]}>
          <Text style={[styles.countBubbleText, !groupFilter && styles.countBubbleTextActive]}>{permissions.length}</Text>
        </View>
      </TouchableOpacity>
      {groups.map(g => {
        const active = groupFilter === g.key;
        return (
          <TouchableOpacity
            key={g.key} style={[styles.groupRow, active && styles.groupRowActive]}
            onPress={() => setGroupFilter(active ? '' : g.key)} testID={`adv-perm-group-${g.key}`}
          >
            <Text style={[styles.groupRowText, active && styles.groupRowTextActive]} numberOfLines={1}>{g.name_ar}</Text>
            <View style={[styles.countBubble, active && styles.countBubbleActive]}>
              <Text style={[styles.countBubbleText, active && styles.countBubbleTextActive]}>{g.count}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View testID="adv-permissions-browser">
      <View style={styles.headerRow}>
        <Text style={styles.title}>سجل الصلاحيات التفصيلي</Text>
        <View style={styles.totalBadge}>
          <Ionicons name="shield-checkmark" size={14} color={COLORS.primary} />
          <Text style={styles.totalBadgeText}>{permissions.length} صلاحية</Text>
        </View>
      </View>

      <View style={[styles.layout, isNarrow && styles.layoutNarrow]}>
        {Sidebar}

        <View style={styles.mainArea}>
          <Text style={styles.resultCount}>النتائج: {filtered.length}</Text>
          <View style={styles.cardsGrid}>
            {filtered.slice(0, 200).map(p => {
              const sens = SENSITIVITY_LABELS[p.sensitivity] || { label: p.sensitivity, color: COLORS.textMuted };
              return (
                <View key={p.key} style={styles.card} testID={`adv-perm-row-${p.key}`}>
                  <Ionicons
                    name={OP_ICONS[p.operation_type] || 'ellipse'} size={54} color={COLORS.text}
                    style={styles.cardBgIcon}
                  />
                  <View style={styles.cardTopRow}>
                    <Text style={styles.permLabel} numberOfLines={2}>{p.label_ar}</Text>
                    <View style={[styles.sensBadge, { backgroundColor: sens.color + '1a', borderColor: sens.color }]}>
                      <Text style={[styles.sensBadgeText, { color: sens.color }]}>{sens.label}</Text>
                    </View>
                  </View>
                  <View style={styles.apiPathWrap}>
                    <Text style={styles.permApi}>{p.linked_api}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          {filtered.length === 0 && (
            <View style={styles.emptyBox} testID="adv-perm-empty-state">
              <Ionicons name="file-tray-outline" size={28} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>لا توجد نتائج مطابقة لهذا البحث/الفلتر</Text>
            </View>
          )}
          {filtered.length > 200 && <Text style={styles.moreText}>يُعرض أول 200 نتيجة فقط — ضيّق البحث لعرض المزيد</Text>}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  totalBadge: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: COLORS.primaryLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, gap: 5 },
  totalBadgeText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },

  layout: { flexDirection: 'row-reverse', gap: 16, alignItems: 'flex-start' },
  layoutNarrow: { flexDirection: 'column' },

  sidebar: { width: 250, flexShrink: 0, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 4 },
  sidebarNarrow: { width: '100%' },

  searchWrap: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: COLORS.bg, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 },
  searchInput: { flex: 1, fontSize: 13, color: COLORS.text, padding: 0 },

  sideLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 8 },
  chipsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chipSm: { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5 },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipTextSm: { fontSize: 11, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  groupRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, marginBottom: 2 },
  groupRowActive: { backgroundColor: COLORS.primaryLight },
  groupRowText: { fontSize: 13, color: COLORS.text, textAlign: 'right', flex: 1 },
  groupRowTextActive: { color: COLORS.primary, fontWeight: '700' },
  countBubble: { backgroundColor: COLORS.bg, borderRadius: 10, minWidth: 24, alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, marginRight: 8 },
  countBubbleActive: { backgroundColor: COLORS.primary },
  countBubbleText: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted },
  countBubbleTextActive: { color: '#fff' },

  mainArea: { flex: 1, minWidth: 0 },
  resultCount: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginBottom: 10 },
  cardsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  card: {
    flexBasis: '31%', flexGrow: 1, minWidth: 250,
    backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    padding: 14, gap: 10, overflow: 'hidden',
  },
  cardBgIcon: { position: 'absolute', left: -8, bottom: -10, opacity: 0.05 },
  cardTopRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8 },
  permLabel: { flex: 1, fontSize: 13.5, fontWeight: '700', color: COLORS.text, textAlign: 'right', lineHeight: 18 },
  sensBadge: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  sensBadgeText: { fontSize: 10, fontWeight: '700' },
  apiPathWrap: { backgroundColor: COLORS.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, alignSelf: 'stretch' },
  permApi: { fontSize: 11, color: COLORS.textMuted, textAlign: 'left', writingDirection: 'ltr', fontFamily: 'monospace' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, gap: 8 },
  emptyText: { fontSize: 13, color: COLORS.textMuted },
  moreText: { textAlign: 'center', color: COLORS.textMuted, fontSize: 12, marginTop: 14 },
});
