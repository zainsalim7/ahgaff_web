import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { DASH, NUM_FONT } from './dashTheme';

const CAT_COLORS: Record<string, string> = { academic: DASH.blue, administrative: DASH.teal, technical: DASH.orange, service: DASH.purple };

export const DashHRHeadcount = ({ hc }: { hc: any }) => {
  const router = useRouter();
  return (
    <View style={styles.wrap} testID="dash-hr-headcount">
      <Text style={styles.blockTitle}>{hc.total_active} موظف على رأس العمل{hc.total_all > hc.total_active ? ` (من ${hc.total_all} في السجل)` : ''}</Text>
      <View style={styles.tiles}>
        <TouchableOpacity style={[styles.tile, { borderColor: DASH.navy }]} onPress={() => router.push('/hr-employees' as any)} testID="dash-hr-hc-total">
          <Text style={styles.tileLabel}>إجمالي الموظفين</Text>
          <Text style={[styles.tileVal, NUM_FONT, { color: DASH.navy }]}>{hc.total_active}</Text>
          <Text style={styles.tileSub}>{hc.units_with_staff} وحدة بها موظفون من {hc.units_count}</Text>
        </TouchableOpacity>
        {hc.by_category.map((c: any) => (
          <TouchableOpacity key={c.key} style={[styles.tile, { borderColor: CAT_COLORS[c.key] || DASH.muted }]} onPress={() => router.push(`/hr-employees?category=${c.key}` as any)} testID={`dash-hr-hc-${c.key}`}>
            <Text style={styles.tileLabel}>{c.label}</Text>
            <Text style={[styles.tileVal, NUM_FONT, { color: CAT_COLORS[c.key] || DASH.muted }]}>{c.count}</Text>
            <Text style={styles.tileSub}>{hc.total_active ? `${Math.round((c.count / hc.total_active) * 100)}%` : '—'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.chips}>
        {hc.by_contract.map((c: any) => <View key={c.key} style={styles.chip} testID={`dash-hr-hc-contract-${c.key}`}><Text style={styles.chipText}>{c.label}: <Text style={NUM_FONT}>{c.count}</Text></Text></View>)}
        {hc.by_status.filter((s: any) => s.key !== 'active').map((s: any) => <View key={s.key} style={[styles.chip, { backgroundColor: '#fff7ed' }]} testID={`dash-hr-hc-status-${s.key}`}><Text style={styles.chipText}>{s.label}: <Text style={NUM_FONT}>{s.count}</Text></Text></View>)}
      </View>
      <View style={styles.table} testID="dash-hr-hc-units">
        <View style={[styles.row, styles.head]}>
          <Text style={[styles.cell, styles.cellName, styles.headText]}>الوحدة التنظيمية</Text>
          <Text style={[styles.cell, styles.headText]}>الإجمالي</Text>
          <Text style={[styles.cell, styles.headText]}>أكاديمي</Text>
          <Text style={[styles.cell, styles.headText]}>إداري</Text>
          <Text style={[styles.cell, styles.headText]}>غيرهم</Text>
        </View>
        {hc.by_unit.length === 0 && <Text style={styles.empty}>لا توجد وحدات بها موظفون</Text>}
        {hc.by_unit.map((u: any, i: number) => (
          <TouchableOpacity key={u.id || 'none'} style={[styles.row, i % 2 ? styles.alt : null]} onPress={() => router.push((u.id ? `/hr-employees?org_unit_id=${u.id}` : '/hr-employees') as any)} testID={`dash-hr-hc-unit-${u.id || 'none'}`}>
            <View style={[styles.cell, styles.cellName]}>
              <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
              {!!u.type_label && <Text style={styles.sub}>{u.type_label}{u.sub_units ? ` · ${u.sub_units} وحدة فرعية` : ''}</Text>}
            </View>
            <Text style={[styles.cell, styles.num, NUM_FONT, { fontWeight: '800', color: DASH.navy }]}>{u.total}</Text>
            <Text style={[styles.cell, styles.num, NUM_FONT, { color: DASH.blue }]}>{u.academic}</Text>
            <Text style={[styles.cell, styles.num, NUM_FONT, { color: DASH.teal }]}>{u.administrative}</Text>
            <Text style={[styles.cell, styles.num, NUM_FONT, { color: DASH.orange }]}>{u.other}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  blockTitle: { fontSize: 12.5, fontWeight: '800', color: DASH.ink, textAlign: 'right', marginBottom: 8 },
  tiles: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  tile: { flexGrow: 1, flexBasis: 130, backgroundColor: '#fff', borderRadius: 12, padding: 10, borderRightWidth: 3, borderWidth: 1, borderColor: DASH.line },
  tileLabel: { fontSize: 11, color: DASH.muted, textAlign: 'right', fontWeight: '700' },
  tileVal: { fontSize: 22, fontWeight: '800', textAlign: 'right', marginTop: 2 },
  tileSub: { fontSize: 10.5, color: '#94a3b8', textAlign: 'right' },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { backgroundColor: '#f1f5f9', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 11, color: '#334155', fontWeight: '600' },
  table: { borderWidth: 1, borderColor: DASH.line, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 10 },
  head: { backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: DASH.line },
  headText: { fontSize: 10.5, fontWeight: '800', color: DASH.muted, textAlign: 'center' },
  alt: { backgroundColor: '#fcfcfd' },
  cell: { width: 56, textAlign: 'center' },
  cellName: { flex: 1, width: undefined, textAlign: 'right', alignItems: 'flex-end' },
  name: { fontSize: 12, fontWeight: '700', color: DASH.ink, textAlign: 'right' },
  sub: { fontSize: 10, color: '#94a3b8', textAlign: 'right' },
  num: { fontSize: 13, fontWeight: '700' },
  empty: { fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: 12 },
});
