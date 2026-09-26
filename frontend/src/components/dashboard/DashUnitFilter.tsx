import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DASH } from './dashTheme';

export interface OrgUnit { id: string; name: string; type: string; type_label: string; parent_id?: string | null }
interface Props { units: OrgUnit[]; value: string; onChange: (id: string) => void }

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = { presidency: 'ribbon', faculty: 'business', department: 'git-branch-outline', administration: 'briefcase', office: 'folder-open' };

/** 🔽 قائمة منسدلة للهيكل التنظيمي: الوحدات الرئيسية وتحت كل واحدة فروعها (بكل المستويات) */
export const DashUnitFilter = ({ units, value, onChange }: Props) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const byId = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units]);

  const groups = useMemo(() => {
    const roots = units.filter((u) => !u.parent_id || !byId[u.parent_id]);
    const rootIds = new Set(roots.map((r) => r.id));
    const heads = [...roots, ...units.filter((u) => u.parent_id && rootIds.has(u.parent_id))];
    const descendants = (id: string, depth = 1): (OrgUnit & { depth: number })[] =>
      units.filter((u) => u.parent_id === id).flatMap((u) => [{ ...u, depth }, ...descendants(u.id, depth + 1)]);
    const list = heads.map((h) => ({ ...h, subs: rootIds.has(h.id) ? [] : descendants(h.id) }));
    const n = q.trim();
    if (!n) return list;
    return list.map((g) => ({ ...g, subs: g.subs.filter((s) => s.name.includes(n)) })).filter((g) => g.name.includes(n) || g.subs.length);
  }, [units, byId, q]);

  const sel = value ? byId[value] : null;
  const label = sel ? sel.name : 'كل الوحدات التنظيمية';
  const pick = (id: string) => { onChange(id); setOpen(false); setQ(''); };
  const ancestorOf = (id: string) => { let p = byId[id]?.parent_id; const s = new Set<string>(); while (p && byId[p]) { s.add(p); p = byId[p].parent_id || undefined; } return s; };
  const selAnc = useMemo(() => (value ? ancestorOf(value) : new Set<string>()), [value, byId]);
  const isExpanded = (id: string) => expanded[id] ?? (!!q || selAnc.has(id) || id === value);

  return (
    <View style={styles.wrap} testID="dash-unit-filter">
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} activeOpacity={0.8} testID="dash-unit-dropdown">
        <Ionicons name="chevron-down" size={16} color={DASH.navy} />
        <Text style={styles.triggerText} numberOfLines={1} testID="dash-unit-dropdown-label">{label}</Text>
        {!!sel && <Text style={styles.typeTag}>{sel.type_label}</Text>}
        <View style={styles.triggerIcon}><Ionicons name={sel ? TYPE_ICON[sel.type] || 'business' : 'people-circle'} size={15} color={DASH.gold} /></View>
      </TouchableOpacity>
      {!!value && (
        <TouchableOpacity style={styles.clear} onPress={() => pick('')} testID="dash-unit-clear">
          <Ionicons name="close" size={13} color={DASH.red} />
          <Text style={styles.clearText}>إزالة الفلتر</Text>
        </TouchableOpacity>
      )}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)} testID="dash-unit-overlay">
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHead}>
              <TouchableOpacity onPress={() => setOpen(false)} testID="dash-unit-close"><Ionicons name="close" size={20} color={DASH.muted} /></TouchableOpacity>
              <Text style={styles.sheetTitle}>اختر الوحدة التنظيمية</Text>
            </View>
            <View style={styles.search}>
              <Ionicons name="search" size={15} color="#94a3b8" />
              <TextInput value={q} onChangeText={setQ} placeholder="ابحث عن كلية أو إدارة أو قسم…" placeholderTextColor="#94a3b8" style={styles.searchInput} testID="dash-unit-search" />
            </View>
            <ScrollView style={{ maxHeight: 440 }}>
              <TouchableOpacity style={[styles.row, !value && styles.rowOn]} onPress={() => pick('')} testID="dash-unit-all">
                <Ionicons name="globe-outline" size={16} color={!value ? '#fff' : DASH.navy} />
                <Text style={[styles.rowText, !value && styles.rowTextOn]}>كل الوحدات التنظيمية</Text>
              </TouchableOpacity>
              {groups.map((g) => {
                const on = value === g.id;
                const exp = isExpanded(g.id);
                return (
                  <View key={g.id} style={styles.group}>
                    <View style={styles.groupHead}>
                      {g.subs.length > 0 ? (
                        <TouchableOpacity style={styles.expandBtn} onPress={() => setExpanded((e) => ({ ...e, [g.id]: !exp }))} testID={`dash-unit-expand-${g.id}`}>
                          <Ionicons name={exp ? 'chevron-up' : 'chevron-down'} size={16} color={DASH.muted} />
                          <Text style={styles.count}>{g.subs.length}</Text>
                        </TouchableOpacity>
                      ) : <View style={styles.expandBtn} />}
                      <TouchableOpacity style={[styles.headRow, on && styles.rowOn]} onPress={() => pick(g.id)} testID={`dash-unit-${g.id}`}>
                        <Ionicons name={TYPE_ICON[g.type] || 'business'} size={15} color={on ? '#fff' : DASH.gold} />
                        <Text style={[styles.headText, on && styles.rowTextOn]} numberOfLines={1}>{g.name}</Text>
                        <Text style={[styles.hint, on && { color: '#cbd5e1' }]}>{g.type_label}{g.subs.length ? ' كاملة' : ''}</Text>
                      </TouchableOpacity>
                    </View>
                    {exp && g.subs.map((s) => {
                      const sOn = value === s.id;
                      return (
                        <TouchableOpacity key={s.id} style={[styles.subRow, { paddingRight: 22 + s.depth * 14 }, sOn && styles.subOn]} onPress={() => pick(s.id)} testID={`dash-unit-${s.id}`}>
                          <Ionicons name={sOn ? 'radio-button-on' : 'radio-button-off'} size={15} color={sOn ? DASH.blue : '#cbd5e1'} />
                          <Text style={[styles.subText, sOn && { color: DASH.blue, fontWeight: '800' }]} numberOfLines={1}>{s.name}</Text>
                          <Text style={styles.hint}>{s.type_label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
              {groups.length === 0 && <Text style={styles.noRes}>لا نتائج</Text>}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  trigger: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: DASH.line, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, minWidth: 260, maxWidth: 420 },
  triggerIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#4c1d95', alignItems: 'center', justifyContent: 'center' },
  triggerText: { flex: 1, fontSize: 13, fontWeight: '800', color: DASH.ink, textAlign: 'right' },
  typeTag: { fontSize: 10, color: '#6d28d9', backgroundColor: '#ede9fe', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, fontWeight: '700' },
  clear: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  clearText: { fontSize: 11, color: DASH.red, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,36,64,0.45)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 520, backgroundColor: '#fff', borderRadius: 18, padding: 14, maxHeight: '90%' },
  sheetHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: DASH.ink },
  search: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 10, marginBottom: 10 },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 13, textAlign: 'right', color: DASH.ink },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, marginBottom: 6 },
  rowOn: { backgroundColor: DASH.navy },
  rowText: { fontSize: 13, fontWeight: '800', color: DASH.ink },
  rowTextOn: { color: '#fff' },
  group: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 6, marginBottom: 4 },
  groupHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  headRow: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 9, borderRadius: 10 },
  headText: { flex: 1, fontSize: 13, fontWeight: '800', color: DASH.ink, textAlign: 'right' },
  hint: { fontSize: 10, color: DASH.muted },
  expandBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 8, minWidth: 44 },
  count: { fontSize: 11, color: DASH.muted, fontWeight: '700' },
  subRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 8, paddingLeft: 10, borderRadius: 8 },
  subOn: { backgroundColor: '#eff6ff' },
  subText: { flex: 1, fontSize: 12.5, color: '#334155', textAlign: 'right' },
  noRes: { textAlign: 'center', color: '#94a3b8', padding: 16 },
});
